import type { GearLoadoutCollection, GearLoadoutResult } from './gearLoadouts';
import { activeSpecialists } from './gearLoadouts';
import type { AlgorithmSettings, GearItem, GradeObservation } from '../types';

/**
 * Grading. A regrade drink removes an item's grade and grading gives 1, 2 or 3 stars at
 * random (the owner's Remove Replica purchase rules out failures). Each star raises the
 * item's base stats by an amount the game does not publish, so the app learns it from
 * regrades the owner records. Star odds are taken as equal, which is also unpublished.
 */
const OUTCOMES = [1, 2, 3];

/** What one star adds, as a fraction of base stats, from recorded regrades (median). */
export function estimateStarValue(observations: GradeObservation[]): { perStar: number; count: number } | undefined {
  // displayed = base × (1 + k × stars), so new/old = (1 + k·to) / (1 + k·from).
  const values = observations
    .filter(o => o.toStars !== o.fromStars)
    .map(o => (o.ratio - 1) / (o.toStars - o.ratio * o.fromStars))
    .filter(k => Number.isFinite(k) && k > 0 && k < 1)
    .sort((a, b) => a - b);
  if (!values.length) return undefined;
  const mid = values.length >> 1;
  return { perStar: values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2, count: values.length };
}

/** Average change in an item's stats from grading it at `stars` now, if a star is worth `perStar`. */
export function expectedRegradeChange(stars: number, perStar: number): number {
  return OUTCOMES.reduce((sum, t) => sum + (1 + perStar * t) / (1 + perStar * stars), 0) / OUTCOMES.length - 1;
}

export type RegradeAdvice = 'grade' | 'regrade' | 'gamble';
export interface RegradeSuggestion {
  item: GearItem;
  stars: number;
  advice: RegradeAdvice;
  /** Best sets the item is in, most important first. */
  sets: string[];
  /** Average stat change, once a star's value has been learned. */
  expectedChange?: number;
}

const ADVICE: Record<number, RegradeAdvice> = { 0: 'grade', 1: 'regrade', 2: 'gamble' };

/**
 * Items worth grading, from the sets they are in now. Ungraded items first (grading can only
 * help), then 1★ (a regrade can only keep or raise it), then 2★ (equal chance of 1★ or 3★).
 * Within each, Main Auction pieces come before specialist ones, in the user's priority order.
 */
export function regradeSuggestions(loadouts: GearLoadoutCollection, settings: AlgorithmSettings, observations: GradeObservation[]): {
  suggestions: RegradeSuggestion[]; unrecorded: GearItem[]; starValue?: { perStar: number; count: number };
} {
  const specialistKey = { 'Drink Prep': 'drink', Grading: 'grading', 'Shop / Idle': 'shop' } as const;
  const ordered: Array<[string, GearLoadoutResult | undefined]> = [
    ['Auction', loadouts.main], ['Day', loadouts.day], ['Night', loadouts.night], ['Rain', loadouts.rain],
    ...activeSpecialists(settings).map(name => [name, loadouts[specialistKey[name]]] as [string, GearLoadoutResult | undefined])
  ];
  const sets = new Map<string, { item: GearItem; sets: string[]; rank: number }>();
  ordered.forEach(([label, loadout], rank) => {
    for (const item of loadout ? [loadout.head, loadout.back, loadout.wrist] : []) {
      const entry = sets.get(item.id) ?? { item, sets: [], rank };
      if (!entry.sets.includes(label)) entry.sets.push(label);
      sets.set(item.id, entry);
    }
  });
  const starValue = estimateStarValue(observations);
  const entries = [...sets.values()];
  const suggestions = entries
    .filter(e => e.item.gradeStars !== undefined && e.item.gradeStars < 3)
    .map(e => ({ item: e.item, stars: e.item.gradeStars!, advice: ADVICE[e.item.gradeStars!], sets: e.sets, rank: e.rank,
      ...(starValue ? { expectedChange: expectedRegradeChange(e.item.gradeStars!, starValue.perStar) } : {}) }))
    .sort((a, b) => a.stars - b.stars || a.rank - b.rank)
    .map(({ rank: _rank, ...s }) => s);
  return { suggestions, unrecorded: entries.filter(e => e.item.gradeStars === undefined).map(e => e.item), starValue };
}
