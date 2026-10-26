import type { AlgorithmSettings, GearItem, Slot } from '../types';
import { PREMIUM_AUTH_EFFECTS } from '../authentication';
import { evaluateCombination } from './optimizer';
import { passiveScore } from './scoring';

export type PremiumAdviceVerdict =
  | 'CONSIDER PREMIUM'
  | 'REVIEW REPLACEMENT'
  | 'PROTECT ENCHANTMENT'
  | 'HOLD FOR NOW'
  | 'ALREADY PREMIUM'
  | 'LOCKED'
  | 'COMPLETE LOADOUT FIRST';

export interface PremiumGearAdvice {
  item: GearItem;
  verdict: PremiumAdviceVerdict;
  inCompetitiveSet: boolean;
  /** Score gap versus the best full three-slot loadout, excluding any unmodelled effects. */
  gapToBest: number | undefined;
  premiumOutcomes: string[];
  reasons: string[];
}

/** Per-item *decision support*, not an estimated Premium success rate.
 * The current game has no independently verified Premium outcome probabilities,
 * and multiple Premium effects are context-dependent and unquantifiable.
 */
export function assessPremiumUpgrades(gear: GearItem[], settings: AlgorithmSettings): PremiumGearAdvice[] {
  const heads = gear.filter(item => item.slot === 'Head');
  const backs = gear.filter(item => item.slot === 'Back');
  const wrists = gear.filter(item => item.slot === 'Wrist');
  const bestContaining = new Map<string, number>();
  let bestScore = -Infinity;

  // Exhaustively score all legal Head + Back + Wrist loadouts once. This also
  // recognises equally strong alternative items, not just one arbitrary winning trio.
  for (const head of heads) for (const back of backs) for (const wrist of wrists) {
    const score = evaluateCombination(head, back, wrist, settings).score.total;
    if (score > bestScore) bestScore = score;
    for (const item of [head, back, wrist]) {
      if (score > (bestContaining.get(item.id) ?? -Infinity)) bestContaining.set(item.id, score);
    }
  }

  const allSlotsPresent = Number.isFinite(bestScore);
  const result = gear.map(item => {
    const gapValue = allSlotsPresent ? Math.max(0, bestScore - (bestContaining.get(item.id) ?? -Infinity)) : undefined;
    const gapToBest = gapValue !== undefined && Number.isFinite(gapValue) ? gapValue : undefined;
    const inCompetitiveSet = gapToBest !== undefined && gapToBest <= 0.000001;
    const premiumOutcomes = PREMIUM_AUTH_EFFECTS[item.slot].filter(effect => effect !== 'Club Packed');
    const effect = item.authenticated ? item.authentication.effect.trim() : '';
    const reasons: string[] = [];
    let verdict: PremiumAdviceVerdict;

    if (item.authentication.kind === 'Premium' && item.authenticated) {
      verdict = 'ALREADY PREMIUM';
      reasons.push(`Already has a Premium effect: ${effect || 'unspecified'}; do not spend a Wooden Certificate to upgrade this item again.`);
    } else if (item.authentication.kind === 'Limited' && item.authenticated) {
      verdict = 'PROTECT ENCHANTMENT';
      reasons.push(`Already has a Limited passive: ${effect || 'unspecified'}; do not overwrite it with Premium unless that trade is deliberate.`);
    } else if (item.favourite) {
      verdict = 'LOCKED';
      reasons.push('Manually locked/favourited: do not replace an enchantment without explicitly reviewing this item first.');
    } else if (item.authenticated && (effect === 'Focused' || effect === 'Grade Re-Roll' ||
      ['Sunny', 'Nocturnal', 'Raindrop', 'Overcharged'].includes(effect) ||
      passiveScore(item, settings).unknown || passiveScore(item, settings).provisional)) {
      verdict = 'PROTECT ENCHANTMENT';
      reasons.push(`${effect || 'Current enchantment'} has an unquantified, conditional, or potentially valuable effect. Replacing it may lose a benefit the normal score cannot represent reliably.`);
    } else if (!allSlotsPresent) {
      verdict = 'COMPLETE LOADOUT FIRST';
      reasons.push('Enter at least one Head, Back and Wrist accessory before comparing upgrade targets.');
    } else if (!inCompetitiveSet) {
      verdict = 'HOLD FOR NOW';
      reasons.push(`This item is ${gapToBest?.toFixed(2) ?? 'an unknown number of'} heuristic score points behind the best full loadout when forced into its slot; upgrading a currently competitive item is the more defensible first option.`);
    } else if (item.authenticated) {
      verdict = 'REVIEW REPLACEMENT';
      reasons.push(`Competitive in your current best-loadout model, but Premium authentication would replace ${effect || 'its current Normal enchantment'}${item.authentication.value ? ` (${item.authentication.value}%)` : ''}. No Premium improvement probability is known.`);
    } else {
      verdict = 'CONSIDER PREMIUM';
      reasons.push('Currently competitive in an optimal three-slot loadout and has no enchantment to lose. Reasonable Premium candidate if you value its slot-exclusive effects.');
    }

    if (gapToBest !== undefined && inCompetitiveSet) {
      reasons.push('Part of at least one maximum-scoring current Head + Back + Wrist combination.');
    }
    reasons.push(`Possible Premium ${item.slot} outcome${premiumOutcomes.length === 1 ? '' : 's'}: ${premiumOutcomes.join(' / ')}.`);
    return { item, verdict, inCompetitiveSet, gapToBest, premiumOutcomes, reasons };
  });

  const priority: Record<PremiumAdviceVerdict, number> = {
    'CONSIDER PREMIUM': 0,
    'REVIEW REPLACEMENT': 1,
    'PROTECT ENCHANTMENT': 2,
    'HOLD FOR NOW': 3,
    'LOCKED': 4,
    'ALREADY PREMIUM': 5,
    'COMPLETE LOADOUT FIRST': 6
  };
  return result.sort((a,b) => priority[a.verdict]-priority[b.verdict] ||
    (a.gapToBest ?? Infinity)-(b.gapToBest ?? Infinity) ||
    a.item.slot.localeCompare(b.item.slot) ||
    a.item.baseName.localeCompare(b.item.baseName) ||
    a.item.id.localeCompare(b.item.id));
}
