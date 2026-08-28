import type { GavelTrophy, TrophyAnalysis, TrophyCombinationResult, TrophyOptimiserSettings } from '../types';

function weightMap(settings: TrophyOptimiserSettings): Map<string, number> {
  return new Map(settings.mutationWeights.filter(w => w.enabled).map(w => [w.mutation, w.multiplier]));
}

export function trophyScore(trophy: GavelTrophy, settings: TrophyOptimiserSettings): number {
  const weights = weightMap(settings);
  return trophy.modifiers.reduce((sum, m) => sum + Math.max(0, m.boostPct) * (weights.get(m.mutation) ?? 0), 0);
}

export function evaluateTrophySet(trophies: GavelTrophy[], settings: TrophyOptimiserSettings): TrophyCombinationResult {
  const weights = weightMap(settings);
  const totalBoosts: Record<string, number> = {};
  for (const trophy of trophies) for (const modifier of trophy.modifiers) {
    if (!modifier.mutation || modifier.boostPct <= 0) continue;
    totalBoosts[modifier.mutation] = (totalBoosts[modifier.mutation] ?? 0) + modifier.boostPct;
  }
  const weightedContributions: Record<string, number> = {};
  let score = 0;
  for (const [mutation, boost] of Object.entries(totalBoosts)) {
    const contribution = boost * (weights.get(mutation) ?? 0);
    weightedContributions[mutation] = contribution;
    score += contribution;
  }
  return { trophies, score, totalBoosts, weightedContributions };
}

export function optimiseTrophies(trophies: GavelTrophy[], settings: TrophyOptimiserSettings, limit = 100): TrophyCombinationResult[] {
  const count = Math.min(Math.max(1, settings.maxActive), trophies.length);
  if (!count) return [];
  const out: TrophyCombinationResult[] = [];
  for (const set of combinations(trophies, count)) out.push(evaluateTrophySet(set, settings));
  out.sort((a, b) => b.score - a.score || tieKey(a).localeCompare(tieKey(b)));
  return out.slice(0, limit);
}

export function specialistTrophySet(trophies: GavelTrophy[], settings: TrophyOptimiserSettings, mutation: string): TrophyCombinationResult | undefined {
  const count = Math.min(Math.max(1, settings.maxActive), trophies.length);
  if (!count) return undefined;
  let best: TrophyCombinationResult | undefined;
  for (const set of combinations(trophies, count)) {
    const result = evaluateTrophySet(set, settings);
    const boost = result.totalBoosts[mutation] ?? 0;
    const bestBoost = best?.totalBoosts[mutation] ?? -Infinity;
    if (!best || boost > bestBoost || (boost === bestBoost && result.score > best.score)) best = result;
  }
  return best;
}

export function analyseTrophies(trophies: GavelTrophy[], best: TrophyCombinationResult | undefined, settings: TrophyOptimiserSettings): TrophyAnalysis[] {
  const equipped = new Set(best?.trophies.map(t => t.id) ?? []);
  return trophies.map(item => {
    const score = trophyScore(item, settings);
    if (equipped.has(item.id)) return { item, verdict: 'EQUIP', score, reason: `Part of the current best ${best?.trophies.length ?? 0}-trophy set.` };
    const dominator = trophies.find(other => other.id !== item.id && dominates(other, item));
    if (dominator && !item.favourite) return {
      item, verdict: 'SAFE TO DISCARD', score, dominator,
      reason: `${dominator.name} has equal-or-higher boost for every mutation on this trophy and a strictly higher boost somewhere, so this trophy can never beat it in the same slot.`
    };
    if (dominator && item.favourite) return {
      item, verdict: 'KEEP', score, dominator,
      reason: `Dominated by ${dominator.name}, but this trophy is locked/favourited and is therefore protected from discard.`
    };
    return { item, verdict: 'KEEP', score, reason: 'Not directly dominated by another single trophy; it can still contribute useful mutation coverage in a four-trophy set.' };
  });
}

export function dominates(a: GavelTrophy, b: GavelTrophy): boolean {
  const am = modifierMap(a), bm = modifierMap(b);
  let strictlyBetter = false;
  const keys = new Set([...am.keys(), ...bm.keys()]);
  for (const key of keys) {
    const av = am.get(key) ?? 0, bv = bm.get(key) ?? 0;
    if (av < bv - 1e-9) return false;
    if (av > bv + 1e-9) strictlyBetter = true;
  }
  return strictlyBetter;
}

function modifierMap(trophy: GavelTrophy): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of trophy.modifiers) map.set(m.mutation, (map.get(m.mutation) ?? 0) + Math.max(0, m.boostPct));
  return map;
}

function *combinations<T>(items: T[], choose: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === choose) { yield prefix; return; }
  const needed = choose - prefix.length;
  for (let i = start; i <= items.length - needed; i++) yield* combinations(items, choose, i + 1, [...prefix, items[i]]);
}

function tieKey(result: TrophyCombinationResult): string { return result.trophies.map(t => t.id).sort().join('|'); }
