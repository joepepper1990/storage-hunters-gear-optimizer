import type { AlgorithmSettings } from '../types';

const NUMERIC_FIELDS: Record<Exclude<keyof AlgorithmSettings,'version'>,string> = {
  luckWeight:'Luck weight',arrowWeight:'Arrow weight',arrowTargetMin:'Arrow band start',arrowTargetMax:'Arrow band end',
  npcWeight:'NPC weight',npcBreakpoint1:'NPC breakpoint 1',npcBreakpoint2:'NPC breakpoint 2',
  npcMultiplier2:'NPC middle multiplier',npcMultiplier3:'NPC upper multiplier',
  energyWeight:'Energy weight',energyTarget:'Energy target',energyCeiling:'Energy ceiling',
  energySecondStageMultiplier:'Energy above-target multiplier',zoneWeight:'Zone weight',
  zoneBreakpoint1:'Zone breakpoint 1',zoneBreakpoint2:'Zone breakpoint 2',
  zoneMultiplier2:'Zone middle multiplier',zoneMultiplier3:'Zone upper multiplier',
  tipWeight:'Tip weight',recoveryWeight:'Recovery weight',mainMaterialLossPct:'Allowed main-set loss',vehicleWeight:'Vehicle weight',walkWeight:'Walk weight',
  drinkPriority:'Drink Prep priority',gradingPriority:'Grading priority',shopPriority:'Shop / Idle priority',
  shopTipWeight:'Shop Tip Chance importance',shopNpcWeight:'Shop NPC Offers importance'
};

/** Shared precondition for scoring, recommendations and irreversible discard proofs. */
export function algorithmIssues(s:AlgorithmSettings):string[] {
  const issues:string[]=[];
  for(const [key,label] of Object.entries(NUMERIC_FIELDS)) {
    const value=s[key as keyof typeof NUMERIC_FIELDS];
    if(typeof value!=='number'||!Number.isFinite(value))issues.push(`${label} must be finite`);
    else if(value<0)issues.push(`${label} cannot be negative`);
  }
  if(s.arrowTargetMin>=s.arrowTargetMax)issues.push('Arrow band start must be below its end');
  if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');
  if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');
  if(s.npcBreakpoint1>s.npcBreakpoint2)issues.push('NPC breakpoint 1 must be ≤ breakpoint 2');
  return issues;
}
