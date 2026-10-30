import type { AlgorithmSettings, GearItem, Slot } from '../types';
import { buildGearLoadouts, type DynamicScenario, type GearLoadoutCollection } from './gearLoadouts';
import { hasUnknownEffect } from './effects';

/**
 * Future-proof retention along the Luck/Arrow frontier.
 *
 * The question for each item is: if one new piece arrived in another slot, with any Bid
 * Arrow from 0 to 90%, could this item become part of the best set? For every slot and every
 * such Arrow value, a hypothetical piece is placed alone in that slot and the other two slots
 * are re-solved with the normal band-first ranking. Because only the hypothetical piece's
 * Arrow matters to which companions it needs, its other stats are left at zero.
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
