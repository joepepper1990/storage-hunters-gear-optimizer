import type { AlgorithmSettings, GearItem, GearStats, Slot } from '../types';
import { buildGearLoadouts, mutationLuckForItem, type DynamicScenario, type GearLoadoutCollection } from './gearLoadouts';
import { effectKnowledge, hasUnknownEffect } from './effects';
import { effectiveItemStats, isNumericAuth } from './scoring';
import { canonicalEffect } from '../authentication';

/**
 * Heuristic retention reasons along the Luck/Arrow frontier.
 * Winning a sample can protect an item; missing every sample never proves disposal.
 *
 * The question for each item is: if one new piece arrived in another slot, with any Bid
 * Arrow from 0 to 90%, could this item become part of the best set? For every slot and every
 * such Arrow value, a hypothetical piece is placed alone in that slot and the other two slots
 * are re-solved with the normal band-first ranking. Other stats are left at zero for
 * these illustrative samples; Energy/Zone saturation can change the companions needed.
 * hasSafeReplacement, rather than this sweep, supplies the disposal proof.
 *
 * This is band-aware by construction: an item with less Arrow and more Luck is kept when some
 * future companion makes it the in-band choice, and so is the opposite profile. Nothing is
 * assumed to be better for having more Arrow.
 *
 * A second pass adds Premium Mutated Luck, which a Premium certificate always rolls on a Head:
 * on the hypothetical Head when the future piece is a Head, and on the owned Heads otherwise.
 * An item whose mutation would add Luck through it can then be kept for its mutation.
 */
export const SWEEP_ARROW_STEP = 2;
export const SWEEP_ARROW_MAX = 90;
/** An item must win over at least this many neighbouring future Arrow values, so a
 * knife-edge win at one exact value (a 3-point Arrow difference at the band edge) does
 * not count as a realistic future role. 3 steps of 2 = a window of at least 4 Arrow points. */
export const SWEEP_MIN_RUN = 3;

const CONTEXTUAL = new Set(['Sunny', 'Nocturnal', 'Raindrop']);
const STATEFUL = new Set(['Mutated Luck', 'Drought Breaker', 'Golden Hour', 'Luck Frenzy', 'Overcharged']);

export interface SweepResult {
  /** Items that are optimal (or tied) in some sweep without the Mutated Luck variant. */
  plain: Set<string>;
  /** Items that are optimal only in the Mutated Luck variant. */
  mutation: Set<string>;
}

function hypothetical(slot: Slot, arrow: number, mutatedLuck: boolean): GearItem {
  return {
    id: `__future-${slot}-${arrow}-${mutatedLuck ? 'ml' : 'plain'}`, baseName: 'Future piece', name: 'Future piece', slot,
    stats: { luck: 0, energy: 0, tip: 0, walk: 0, vehicle: 0, recovery: 0, zone: 0, arrowReduction: arrow, npc: 0 },
    authenticated: mutatedLuck,
    authentication: mutatedLuck ? { kind: 'Premium', effect: 'Mutated Luck', value: 0 } : { kind: 'None', effect: '', value: 0 },
    favourite: false, createdAt: '', updatedAt: ''
  };
}

function withMutatedLuck(item: GearItem): GearItem {
  return item.slot === 'Head' ? { ...item, authenticated: true, authentication: { kind: 'Premium', effect: 'Mutated Luck', value: 0 } } : item;
}

/** Only sets inside the Arrow band count: being a little nearer the band in a set that
 * misses it anyway is not a realistic future role. */
function members(loadouts: GearLoadoutCollection, contextual: boolean): string[] {
  const sets = contextual ? [loadouts.main, loadouts.day, loadouts.night, loadouts.rain] : [loadouts.main];
  return sets.flatMap(set => set && set.arrowDistance <= 1e-9 ? [...set.tiedItemIds] : []);
}

export function futureSweep(all: GearItem[], settings: AlgorithmSettings): SweepResult {
  // An item whose effect has no known value is kept anyway, and it must never be the reason
  // another item looks unnecessary, so it takes no part in the sweep.
  const gear = all.filter(g => !hasUnknownEffect(g));
  const effects = new Set(gear.filter(g => g.authenticated).map(g => g.authentication.effect.trim()));
  const contextual = [...effects].some(e => CONTEXTUAL.has(e));
  const stateful = [...effects].some(e => STATEFUL.has(e));
  const states: DynamicScenario[] = stateful ? ['low', 'central', 'high'] : ['low'];
  // Only the two other slots are solved, so specialist sets are never needed here.
  const auctionOnly = { ...settings, drinkPriority: 0, gradingPriority: 0, shopPriority: 0 };
  const plain = new Set<string>(), withMutation = new Set<string>();
  for (const slot of ['Head', 'Back', 'Wrist'] as Slot[]) {
    for (const mutatedLuck of [false, true]) {
      const owned = gear.filter(g => g.slot !== slot);
      const others = mutatedLuck && slot !== 'Head' ? owned.map(withMutatedLuck) : owned;
      const target = mutatedLuck ? withMutation : plain;
      // With Mutated Luck the result depends on mutations, not on dynamic states.
      for (const state of mutatedLuck ? ['low' as const] : states) {
        const run = new Map<string, number>();
        for (let arrow = 0; arrow <= SWEEP_ARROW_MAX; arrow += SWEEP_ARROW_STEP) {
          const future = hypothetical(slot, arrow, mutatedLuck && slot === 'Head');
          const now = new Set(members(buildGearLoadouts([...others, future], auctionOnly, state), contextual));
          for (const id of [...run.keys()]) if (!now.has(id)) run.delete(id);
          for (const id of now) {
            const length = (run.get(id) ?? 0) + 1;
            run.set(id, length);
            if (length >= SWEEP_MIN_RUN) target.add(id);
          }
        }
      }
    }
  }
  return { plain, mutation: new Set([...withMutation].filter(id => !plain.has(id))) };
}

/** A disposal proof must hold with arbitrary companions, not just sampled loadouts.
 * Equal Arrow preserves band distance, while componentwise improvements survive the
 * monotone Energy/Zone saturation curves. Strict improvement prevents duplicate cycles.
 * Proofs form an acyclic partial order, so deleting several dominated items together
 * still leaves a maximal replacement in each same-slot chain.
 */
export function hasSafeReplacement(target: GearItem, all: GearItem[], settings: AlgorithmSettings): boolean {
  if (hasUnknownEffect(target)) return false;
  const keys: Array<keyof GearStats> = ['luck','zone','energy','recovery'];
  if (settings.shopPriority > 0) {
    if (settings.shopTipWeight > 0) keys.push('tip');
    if (settings.shopNpcWeight > 0) keys.push('npc');
  }
  const effect = (item: GearItem) => {
    const name = item.authenticated ? canonicalEffect(item.authentication.effect) : '';
    return isNumericAuth(name) || effectKnowledge(name) === 'zero' || (name === 'Grade Re-Roll' && settings.gradingPriority <= 0) ? '' : name;
  };
  const targetStats = effectiveItemStats(target), targetEffect = effect(target);
  return all.some(candidate => {
    if (candidate.id === target.id || candidate.slot !== target.slot || hasUnknownEffect(candidate)) return false;
    const candidateStats = effectiveItemStats(candidate);
    // Different nonnumeric effects cannot replace each other across every state/context.
    if (effect(candidate) !== targetEffect) return false;
    const values: Array<[number,number]> = keys.map(key => [candidateStats[key],targetStats[key]]);
    const arrows: Array<[number,number]> = [[candidateStats.arrowReduction,targetStats.arrowReduction]];
    // Future certificates replace numeric authentication on every slot. A currently
    // boosted replacement must also be no worse on native stats and native Arrow.
    for (const key of keys) values.push([candidate.stats[key],target.stats[key]]);
    arrows.push([candidate.stats.arrowReduction,target.stats.arrowReduction]);
    values.push([mutationLuckForItem(candidate),mutationLuckForItem(target)]);
    if (targetEffect && targetEffect !== 'Golden Hour' && targetEffect !== 'Mutated Luck') {
      values.push([candidate.authentication.value,target.authentication.value]);
    }
    if (arrows.some(([a,b]) => !Number.isFinite(a) || !Number.isFinite(b) || a !== b)) return false;
    if (values.some(([a,b]) => !Number.isFinite(a) || !Number.isFinite(b) || a < b)) return false;
    return values.some(([a,b]) => a > b);
  });
}
