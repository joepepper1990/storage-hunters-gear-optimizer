import type { GavelTrophy, TrophyCombinationResult, TrophyOptimiserSettings } from '../types';

/** Maximum with the Extra Gavel Trophy gamepass; standard capacity is three. */
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
    .slice(0, Math.min(settings.maxActive===3?3:TROPHY_ACTIVE_LIMIT, trophies.length));
  return [evaluateTrophySet(selected, settings)];
}


export function trophyMutationBoost(trophy: GavelTrophy, mutation: string): number {
  return trophy.modifiers
    .filter(modifier => modifier.mutation === mutation)
    .reduce((sum, modifier) => sum + Math.max(0, modifier.boostPct), 0);
}

/**
 * Maximum mutation-specific set. Only trophies that actually contribute to the requested
 * mutation are returned; empty slots do not need protection because they cannot raise the
 * specialist total.
 */
export function specialistTrophyLoadout(
  trophies: GavelTrophy[],
  mutation: string,
  settings: TrophyOptimiserSettings
): TrophyCombinationResult | undefined {
  const contributors = trophies
    .filter(trophy => trophyMutationBoost(trophy, mutation) > 0)
    .sort((a, b) =>
      trophyMutationBoost(b, mutation) - trophyMutationBoost(a, mutation) ||
      trophyScore(b, settings) - trophyScore(a, settings) ||
      a.id.localeCompare(b.id)
    )
    .slice(0, settings.maxActive===3?3:TROPHY_ACTIVE_LIMIT);
  return contributors.length ? evaluateTrophySet(contributors, settings) : undefined;
}

export type TrophyRetentionVerdict = 'EQUIP' | 'KEEP' | 'SAFE TO DISCARD';

export interface TrophyRetentionAnalysis {
  item: GavelTrophy;
  verdict: TrophyRetentionVerdict;
  reason: string;
  specialistMutations: string[];
  /** For SAFE TO DISCARD: the Gavel that beats it boost by boost. */
  dominator?: GavelTrophy;
}

/**
 * A boost counts unless its mutation is listed and switched off; an unlisted mutation has
 * no known value, so it is never treated as worthless.
 */
function countsForRetention(mutation: string, settings: TrophyOptimiserSettings): boolean {
  const weight = settings.mutationWeights.find(w => w.mutation === mutation);
  return !weight || weight.enabled;
}

/** Another Gavel with at least the same boost on every counted mutation, and a higher overall score. */
function trophyDominator(item: GavelTrophy, trophies: GavelTrophy[], settings: TrophyOptimiserSettings): GavelTrophy | undefined {
  const mutations = [...new Set(item.modifiers.map(m => m.mutation))].filter(m => countsForRetention(m, settings));
  const score = trophyScore(item, settings);
  return trophies.find(other => other.id !== item.id
    && mutations.every(m => trophyMutationBoost(other, m) >= trophyMutationBoost(item, m) - 1e-9)
    && trophyScore(other, settings) > score + 1e-9);
}

/**
 * Strict retention rule requested for inventory clean-up:
 * - EQUIP when in the best overall four.
 * - KEEP when manually locked/favourited, tied for the last slot or required by at least
 *   one enabled maximum mutation-specific set.
 * - SAFE TO DISCARD only when another Gavel beats it boost by boost; KEEP otherwise.
 */
export function analyseTrophyRetention(
  trophies: GavelTrophy[],
  settings: TrophyOptimiserSettings
): TrophyRetentionAnalysis[] {
  const best = optimiseTrophies(trophies, settings)[0];
  const equipped = new Set(best?.trophies.map(trophy => trophy.id) ?? []);
  const specialistMembership = new Map<string, string[]>();
  const capacity=settings.maxActive===3?3:4;
  // Tied fourth-place trophies can participate in some equally optimal overall loadout.
  // Keep all tied eligible alternatives rather than incorrectly label them as discardable.
  const ranked=[...trophies].sort((a,b)=>trophyScore(b,settings)-trophyScore(a,settings));
  const overallCutoff=ranked.length>=capacity ? trophyScore(ranked[capacity-1],settings) : undefined;
  const overallAlternatives=new Set(overallCutoff!==undefined && overallCutoff>0
    ? ranked.filter(t=>Math.abs(trophyScore(t,settings)-overallCutoff)<1e-9).map(t=>t.id) : []);


  for(const weight of settings.mutationWeights.filter(w=>w.enabled)){
    const rankedSpecial=[...trophies].filter(t=>trophyMutationBoost(t,weight.mutation)>0)
      .sort((a,b)=>trophyMutationBoost(b,weight.mutation)-trophyMutationBoost(a,weight.mutation));
    const cutoff=rankedSpecial[Math.min(capacity,rankedSpecial.length)-1];
    const threshold=cutoff?trophyMutationBoost(cutoff,weight.mutation):Infinity;
    for(const trophy of rankedSpecial.filter(t=>trophyMutationBoost(t,weight.mutation)>=threshold-1e-9)){
      const mutations=specialistMembership.get(trophy.id)??[];
      mutations.push(weight.mutation);
      specialistMembership.set(trophy.id,mutations);
    }
  }

  return trophies.map(item => {
    if (equipped.has(item.id)) {
      return { item, verdict: 'EQUIP', reason: 'Part of the current best overall powered-Gavel set.', specialistMutations: specialistMembership.get(item.id) ?? [] };
    }
    if (item.favourite) {
      return { item, verdict: 'KEEP', reason: 'Manually locked / favourited.', specialistMutations: specialistMembership.get(item.id) ?? [] };
    }
    if(overallAlternatives.has(item.id))return {item,verdict:'KEEP',
      reason:'Tied with the final selected Gavel; may appear in an equally optimal overall set.',
      specialistMutations:specialistMembership.get(item.id)??[]};
    const specialistMutations = specialistMembership.get(item.id) ?? [];
    if (specialistMutations.length) {
      return {
        item,
        verdict: 'KEEP',
        reason: `Required by maximum ${specialistMutations.join(' / ')} specialist set${specialistMutations.length > 1 ? 's' : ''}.`,
        specialistMutations
      };
    }
    const dominator = trophyDominator(item, trophies, settings);
    if (!dominator) return {
      item,
      verdict: 'KEEP',
      reason: 'No other Gavel has at least the same boost on every one of its mutations.',
      specialistMutations: []
    };
    return {
      item,
      verdict: 'SAFE TO DISCARD',
      reason: `Not used by any best set, and ${dominator.name} has at least the same boost on every one of its mutations.`,
      specialistMutations: [],
      dominator
    };
  });
}
