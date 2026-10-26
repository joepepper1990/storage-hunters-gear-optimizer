import type { AlgorithmSettings, CombinationResult, GearItem, ItemAnalysis, Slot } from '../types';
import { arrowEffective, combineStats } from './scoring';
import { analyseGearRetention, mainCombination } from './gearLoadouts';

export function evaluateCombination(head: GearItem, back: GearItem, wrist: GearItem, settings: AlgorithmSettings): CombinationResult {
  return mainCombination(head, back, wrist, settings, 'Neutral', 'low');
}

export function optimise(gear: GearItem[], settings: AlgorithmSettings, limit = 100): CombinationResult[] {
  const heads = gear.filter(i => i.slot === 'Head');
  const backs = gear.filter(i => i.slot === 'Back');
  const wrists = gear.filter(i => i.slot === 'Wrist');
  if (!heads.length || !backs.length || !wrists.length) return [];
  const best: CombinationResult[] = [];
  for (const head of heads) for (const back of backs) for (const wrist of wrists) {
    insertRanked(best, evaluateCombination(head, back, wrist, settings), limit);
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

/** Compatibility helper for diagnostics. User-facing specialist loadouts are now defined in gearLoadouts.ts. */
export function specialistLoadout(gear: GearItem[], key: keyof CombinationResult['stats'], settings: AlgorithmSettings): CombinationResult | undefined {
  const heads = gear.filter(i => i.slot === 'Head');
  const backs = gear.filter(i => i.slot === 'Back');
  const wrists = gear.filter(i => i.slot === 'Wrist');
  let best: CombinationResult | undefined;
  for (const h of heads) for (const b of backs) for (const w of wrists) {
    const c = evaluateCombination(h, b, w, settings);
    const metric = key === 'arrowReduction' ? arrowEffective(c.stats.arrowReduction, settings) : c.stats[key];
    const bestMetric = best ? (key === 'arrowReduction' ? arrowEffective(best.stats.arrowReduction, settings) : best.stats[key]) : -Infinity;
    if (!best || metric > bestMetric || (metric === bestMetric && c.score.total > best.score.total)) best = c;
  }
  return best;
}

/** Retention is now derived from the union of Main, contextual and specialist loadouts. */
export function analyseItems(gear: GearItem[], _best: CombinationResult | undefined, settings: AlgorithmSettings): ItemAnalysis[] {
  return analyseGearRetention(gear, settings);
}

export function slotItems(gear: GearItem[], slot: Slot) { return gear.filter(g => g.slot === slot); }
