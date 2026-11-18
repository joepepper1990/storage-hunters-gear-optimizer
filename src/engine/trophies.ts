import type { GavelCharm, GavelTrophy, TrophyCombinationResult, TrophyOptimiserSettings } from '../types';

/** Maximum with the Extra Gavel Trophy gamepass; standard capacity is three. */
export const TROPHY_ACTIVE_LIMIT = 4;

function weightMap(settings: TrophyOptimiserSettings): Map<string, number> {
  return new Map(settings.mutationWeights.filter(w => w.enabled).map(w => [w.mutation, w.multiplier]));
}

export function trophyScore(trophy: GavelTrophy, settings: TrophyOptimiserSettings): number {
  const weights = weightMap(settings);
  return effectiveTrophyModifiers(trophy).reduce((sum, m) => sum + Math.max(0, m.boostPct) * (weights.get(m.mutation) ?? 0), 0);
}

export function evaluateTrophySet(trophies: GavelTrophy[], settings: TrophyOptimiserSettings): TrophyCombinationResult {
  const weights = weightMap(settings);
  const totalBoosts: Record<string, number> = {};
  for (const trophy of trophies) for (const modifier of effectiveTrophyModifiers(trophy)) {
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
  const capacity=Math.min(settings.maxActive===3?3:TROPHY_ACTIVE_LIMIT,trophies.length);
  if(!trophies.some(t=>t.charm?.type==='Mosaic'))return [evaluateTrophySet([...trophies].sort((a,b)=>trophyScore(b,settings)-trophyScore(a,settings)||a.id.localeCompare(b.id)).slice(0,capacity),settings)];
  let best:GavelTrophy[]=[];
  const visit=(start:number,picked:GavelTrophy[])=>{
    if(picked.length===capacity){
      const luck=placedCharmLuck(picked),previous=placedCharmLuck(best);
      if(!best.length||luck>previous||luck===previous&&evaluateTrophySet(picked,settings).score>evaluateTrophySet(best,settings).score)best=[...picked];
      return;
    }
    for(let i=start;i<=trophies.length-(capacity-picked.length);i++)visit(i+1,[...picked,trophies[i]]);
  };
  visit(0,[...[]]);
  return best.length?[evaluateTrophySet(best,settings)]:[];
}


export function trophyMutationBoost(trophy: GavelTrophy, mutation: string): number {
  return effectiveTrophyModifiers(trophy)
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
    if(item.charm)return {item,verdict:'KEEP',reason:'Carries an owned charm; removal and future charm combinations matter.',specialistMutations:[]};
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

export function effectiveTrophyModifiers(trophy:GavelTrophy):GavelTrophy['modifiers'] {
  const rows=trophy.modifiers.map(m=>({...m}));
  if(trophy.charm?.type==='Clover'&&rows.length){
    const best=rows.reduce((a,b)=>b.boostPct>a.boostPct?b:a);best.boostPct+=Math.max(0,trophy.charm.value);
  }
  if(trophy.charm?.type==='Moon')rows.push({mutation:'Moonlit',boostPct:Math.max(0,trophy.charm.value)});
  return rows;
}
export function placedCharmLuck(trophies:GavelTrophy[]):number {
  const charms=trophies.flatMap(t=>t.charm?[t.charm]:[]);
  const mosaic=Math.max(0,...charms.filter(c=>c.type==='Mosaic').map(c=>c.value));
  return mosaic*new Set(charms.map(c=>c.type)).size;
}
export function charmLabel(t:GavelTrophy):string {
 const c=t.charm;if(!c)return 'No charm';
 return c.type+' Charm'+(c.type==='Clover'?` +${c.value}% to best mutation`:c.type==='Mosaic'?` +${c.value}% Luck per different charm`:c.type==='Moon'?` +${c.value}% Moonlit`:c.type==='Diamond'?` ${c.value} diamonds/hr`:c.type==='Star'?' +1 grading slot':' · highlights missing Index items');
}
/** Optional plan: keep the best Mosaic's diversity, then improve the mutation portfolio.
 * Only moves a known charm to an empty gavel; requires destination forge unlock.
 * No costs are silently applied and the actual owned arrangement stays unchanged. */
export function gavelMoveOpportunity(trophies:GavelTrophy[],settings:TrophyOptimiserSettings,spares:GavelCharm[]=[]){
 const current=optimiseTrophies(trophies,settings)[0];if(!current)return undefined;
 const ids=new Set(current.trophies.map(t=>t.id));
 let result:{from:GavelTrophy;to:GavelTrophy;trophies:GavelTrophy[];cost:number;luck:number;charm:GavelCharm;spare:boolean}|undefined;
 let score=current.score;
 for(const from of current.trophies)for(const to of trophies.filter(t=>!ids.has(t.id)&&!t.charm)){
  const choices=[...(from.charm?[{charm:from.charm,spare:false}]:[]),...spares.map(charm=>({charm,spare:true}))];
  for(const choice of choices){
   const next=current.trophies.filter(t=>t.id!==from.id).concat({...to,charm:choice.charm});
   const evaluated=evaluateTrophySet(next,settings);
   if(placedCharmLuck(next)>=placedCharmLuck(current.trophies)&&evaluated.score>score){score=evaluated.score;result={from,to,trophies:next,cost:50,luck:placedCharmLuck(next),...choice};}
  }
 }
 return result;
}
