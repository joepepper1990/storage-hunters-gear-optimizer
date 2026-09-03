import type { GavelTrophy, TrophyCombinationResult, TrophyOptimiserSettings } from '../types';

/** Current game rule: a maximum of four Gavel Trophies can be powered. */
export const TROPHY_ACTIVE_LIMIT = 4;

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

/**
 * Returns only the single set the player should equip. The score is additive with
 * non-negative mutation weights, so selecting the four highest individual scores is
 * exactly equivalent to enumerating every four-trophy combination.
 */
export function optimiseTrophies(trophies: GavelTrophy[], settings: TrophyOptimiserSettings): TrophyCombinationResult[] {
  if (!trophies.length) return [];
  const selected = [...trophies]
    .sort((a, b) => trophyScore(b, settings) - trophyScore(a, settings) || a.id.localeCompare(b.id))
    .slice(0, Math.min(TROPHY_ACTIVE_LIMIT, trophies.length));
  return [evaluateTrophySet(selected, settings)];
}
