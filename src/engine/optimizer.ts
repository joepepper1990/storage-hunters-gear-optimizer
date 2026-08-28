import type { AlgorithmSettings, CombinationResult, GearItem, ItemAnalysis, Slot } from '../types';
import { combineStats, scoreItemOrCombination, scoreStandalone } from './scoring';
import { findDominator } from './dominance';

export function evaluateCombination(head: GearItem, back: GearItem, wrist: GearItem, settings: AlgorithmSettings): CombinationResult {
  const items = [head, back, wrist];
  const stats = combineStats(items);
  const score = scoreItemOrCombination(stats, items, settings);
  return {
    head, back, wrist, stats, score,
    wastedArrow: Math.max(0, Math.min(stats.arrowReduction, settings.arrowPenaltyThreshold) - settings.arrowCeiling),
    penalisedArrow: Math.max(0, stats.arrowReduction - settings.arrowPenaltyThreshold),
    wastedEnergy: Math.max(0, stats.energy - settings.energyCeiling)
  };
}

export function optimise(gear: GearItem[], settings: AlgorithmSettings, limit = 100): CombinationResult[] {
  const heads = gear.filter(i => i.slot === 'Head');
  const backs = gear.filter(i => i.slot === 'Back');
  const wrists = gear.filter(i => i.slot === 'Wrist');
  if (!heads.length || !backs.length || !wrists.length) return [];
  const best: CombinationResult[] = [];
  for (const head of heads) for (const back of backs) for (const wrist of wrists) {
    const result = evaluateCombination(head, back, wrist, settings);
    insertRanked(best, result, limit);
  }
  return best;
}

function insertRanked(list: CombinationResult[], value: CombinationResult, limit: number) {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid].score.total >= value.score.total) lo = mid + 1; else hi = mid;
  }
  list.splice(lo, 0, value);
  if (list.length > limit) list.pop();
}

export function specialistLoadout(gear: GearItem[], key: keyof CombinationResult['stats'], settings: AlgorithmSettings): CombinationResult | undefined {
  const heads = gear.filter(i => i.slot === 'Head');
  const backs = gear.filter(i => i.slot === 'Back');
  const wrists = gear.filter(i => i.slot === 'Wrist');
  let best: CombinationResult | undefined;
  for (const h of heads) for (const b of backs) for (const w of wrists) {
    const c = evaluateCombination(h, b, w, settings);
    const metric = key === 'arrowReduction' ? Math.min(c.stats.arrowReduction, settings.arrowCeiling) : c.stats[key];
    const bestMetric = best ? (key === 'arrowReduction' ? Math.min(best.stats.arrowReduction, settings.arrowCeiling) : best.stats[key]) : -Infinity;
    if (!best || metric > bestMetric || (metric === bestMetric && c.score.total > best.score.total)) best = c;
  }
  return best;
}

export function analyseItems(gear: GearItem[], best: CombinationResult | undefined, settings: AlgorithmSettings): ItemAnalysis[] {
  const equippedIds = new Set(best ? [best.head.id, best.back.id, best.wrist.id] : []);
  return gear.map(item => {
    const standalone = scoreStandalone(item, settings);
    if (equippedIds.has(item.id)) return { item, verdict: 'EQUIP', reason: 'Part of the current highest-scoring loadout.', standalone, currentlyEquipped: true };
    const sameSlot = gear.filter(x => x.slot === item.slot && x.id !== item.id);
    const protection = protectionReason(item, settings);
    if (protection) return { item, verdict: 'PROTECTED / UNKNOWN', reason: protection, standalone, currentlyEquipped: false };
    const dominance = findDominator(item, sameSlot, settings);
    if (dominance.dominated) return {
      item, verdict: 'SAFE TO DISCARD', standalone, currentlyEquipped: false, dominance,
      reason: dominance.reason
    };
    return {
      item, verdict: 'KEEP', standalone, currentlyEquipped: false, dominance,
      reason: dominance.reason || 'Not globally dominated; a complementary future state can preserve or create value.'
    };
  });
}

function protectionReason(item: GearItem, settings: AlgorithmSettings): string | undefined {
  const effect = item.authentication.effect.trim();
  if (!item.authenticated || !effect) return undefined;
  if (['Haggler', 'Anti-Gravity Field', 'Safecracker', 'Exhibitor'].includes(effect)) return `${effect} has unknown mechanics/value, so this item is protected from irreversible discard classification.`;
  if (effect === 'Time Keeper') return 'Time Keeper has a provisional coefficient and is protected from SAFE TO DISCARD.';
  if (effect === 'Grade Re-Roll') return 'Grade Re-Roll has a provisional coefficient and is protected from SAFE TO DISCARD.';
  if (!knownOrIgnored(effect)) return `${effect} is not yet modelled and is therefore protected.`;
  return undefined;
}

function knownOrIgnored(effect: string): boolean {
  return ['Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Tip Chance','NPC Offers Bonus','Walkspeed','Sunny','Nocturnal','Overcharged','Raindrop','Focused','Time Keeper','Connected','Grade Re-Roll','Rush','Fossil Finder','Luck Frenzy','Auto X-Ray','Featherweight','Second Chance','Steady Hand'].includes(effect);
}

export function slotItems(gear: GearItem[], slot: Slot) { return gear.filter(g => g.slot === slot); }
