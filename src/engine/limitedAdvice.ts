import type { AlgorithmSettings, GearItem, Slot } from '../types';
import { LIMITED_AUTH_EFFECTS } from '../authentication';
import { evaluateCombination } from './optimizer';
import { passiveScore } from './scoring';

export type LimitedPassiveTier = 'S' | 'A' | 'B' | 'C';
export type LimitedPassiveRole = 'Primary auction' | 'Grading specialist' | 'Hauling specialist' | 'Bidding recovery';

export interface LimitedPassiveProfile {
  effect: string;
  slot: Slot;
  tier: LimitedPassiveTier;
  overallRank: number;
  role: LimitedPassiveRole;
  description: string;
  rationale: string;
}

export const LIMITED_PASSIVE_PROFILES: Record<Slot, readonly LimitedPassiveProfile[]> = {
  Back: [
    { effect:'Luck Frenzy', slot:'Back', tier:'S', overallRank:1, role:'Primary auction',
      description:'Randomly activates a large burst of bonus Luck while equipped.',
      rationale:'The only confirmed Limited outcome that directly boosts Luck, so it has the highest broad auction/farming upside.' },
    { effect:'Featherweight', slot:'Back', tier:'A', overallRank:4, role:'Hauling specialist',
      description:'Chance for auction items loaded onto the vehicle to weigh nothing.',
      rationale:'Can materially increase hauling capacity/efficiency, but its value depends on vehicle-capacity pressure rather than every bid.' }
  ],
  Head: [
    { effect:'Auto X-Ray', slot:'Head', tier:'A', overallRank:2, role:'Primary auction',
      description:'Chance for an auction to start with X-Ray already active.',
      rationale:'Broadly useful every auction: saves X-Ray use and can reveal high-value targets immediately.' },
    { effect:'Grade Re-Roll', slot:'Head', tier:'A', overallRank:3, role:'Grading specialist',
      description:'Chance for a free automatic second grade roll after Replica or 1-Star.',
      rationale:'Potentially a major value/profit effect when grading lots of items, but it is specialist rather than direct bidding power.' }
  ],
  Wrist: [
    { effect:'Second Chance', slot:'Wrist', tier:'B', overallRank:5, role:'Bidding recovery',
      description:'Chance to skip the bidding cooldown after a missed bid.',
      rationale:'Useful in high-stakes bidding, but only creates value after a miss and therefore triggers less universally.' },
    { effect:'Steady Hand', slot:'Wrist', tier:'C', overallRank:6, role:'Bidding recovery',
      description:'Chance for the next bid zone to become wider after a missed bid.',
      rationale:'Helpful recovery after a miss, but it is reactive and generally weaker than avoiding the cooldown entirely.' }
  ]
};

export const LIMITED_SLOT_PRIORITY: Record<Slot, number> = { Back: 3, Head: 2, Wrist: 1 };

export type LimitedAdviceVerdict =
  | 'CONSIDER LIMITED'
  | 'REVIEW REPLACEMENT'
  | 'PROTECT ENCHANTMENT'
  | 'HOLD FOR NOW'
  | 'ALREADY LIMITED'
  | 'LOCKED'
  | 'COMPLETE LOADOUT FIRST';

export interface LimitedGearAdvice {
  item: GearItem;
  verdict: LimitedAdviceVerdict;
  recommendationScore: number;
  inCompetitiveSet: boolean;
  gapToBest: number | undefined;
  limitedOutcomes: readonly LimitedPassiveProfile[];
  reasons: string[];
}

/**
 * Ranks where to spend a Limited Certificate without inventing proc odds.
 * Main gear strength is still measured by the normal optimiser; Limited utility is a
 * separate qualitative layer. Back > Head > Wrist is the default broad-use priority,
 * while the result text exposes specialist uses for Grade Re-Roll and Featherweight.
 */
export function assessLimitedUpgrades(gear: GearItem[], settings: AlgorithmSettings): LimitedGearAdvice[] {
  const heads=gear.filter(item=>item.slot==='Head');
  const backs=gear.filter(item=>item.slot==='Back');
  const wrists=gear.filter(item=>item.slot==='Wrist');
  const bestContaining=new Map<string,number>();
  let bestScore=-Infinity;

  for(const head of heads) for(const back of backs) for(const wrist of wrists){
    const score=evaluateCombination(head,back,wrist,settings).score.total;
    if(score>bestScore) bestScore=score;
    for(const item of [head,back,wrist]){
      if(score>(bestContaining.get(item.id)??-Infinity)) bestContaining.set(item.id,score);
    }
  }

  const allSlotsPresent=Number.isFinite(bestScore);
  const result=gear.map(item=>{
    const gapValue=allSlotsPresent?Math.max(0,bestScore-(bestContaining.get(item.id)??-Infinity)):undefined;
    const gapToBest=gapValue!==undefined&&Number.isFinite(gapValue)?gapValue:undefined;
    const inCompetitiveSet=gapToBest!==undefined&&gapToBest<=0.000001;
    const effect=item.authenticated?item.authentication.effect.trim():'';
    const limitedOutcomes=LIMITED_PASSIVE_PROFILES[item.slot];
    const reasons:string[]=[];
    let verdict:LimitedAdviceVerdict;

    if(item.authenticated&&item.authentication.kind==='Limited'){
      verdict='ALREADY LIMITED';
      reasons.push(`Already has a Limited passive: ${effect||'unspecified'}; do not overwrite it without a deliberate reroll decision.`);
    } else if(item.favourite){
      verdict='LOCKED';
      reasons.push('Manually locked/favourited: preserve this item unless you deliberately unlock it.');
    } else if(item.authenticated&&isProtectedAuthentication(item,settings)){
      verdict='PROTECT ENCHANTMENT';
      reasons.push(`${effect||item.authentication.kind} is valuable, dynamic or insufficiently quantified; a Limited roll would replace it.`);
    } else if(!allSlotsPresent){
      verdict='COMPLETE LOADOUT FIRST';
      reasons.push('Enter at least one Head, Back and Wrist accessory before comparing Limited targets.');
    } else if(item.authenticated){
      verdict='REVIEW REPLACEMENT';
      reasons.push(`A Limited roll would replace ${effect||'the current authentication'}${item.authentication.value?` (${item.authentication.value}%)`:''}; prefer a clean item unless this replacement is intentional.`);
    } else if((gapToBest??Infinity)>35){
      verdict='HOLD FOR NOW';
      reasons.push(`This item is ${gapToBest?.toFixed(2)} core-score points behind the best loadout when forced into its slot, so a stronger clean item is a better Limited target.`);
    } else {
      verdict='CONSIDER LIMITED';
      reasons.push('No authentication is at risk, so this is a clean Limited Certificate target.');
    }

    if(inCompetitiveSet) reasons.push('Part of at least one maximum-scoring current Head + Back + Wrist combination before unquantified Limited utility.');
    else if(gapToBest!==undefined) reasons.push(`Core-loadout gap: ${gapToBest.toFixed(2)} points before any Limited passive utility.`);

    reasons.push(`Possible Limited ${item.slot} outcomes: ${LIMITED_AUTH_EFFECTS[item.slot].join(' / ')}.`);
    reasons.push(slotReason(item.slot));

    const gapBonus=gapToBest===undefined?0:Math.max(0,50-Math.min(50,gapToBest*2));
    const cleanBonus=!item.authenticated?50:0;
    const replacementPenalty=item.authenticated?35:0;
    const recommendationScore=LIMITED_SLOT_PRIORITY[item.slot]*100+gapBonus+cleanBonus-replacementPenalty;

    return {item,verdict,recommendationScore,inCompetitiveSet,gapToBest,limitedOutcomes,reasons};
  });

  const priority:Record<LimitedAdviceVerdict,number>={
    'CONSIDER LIMITED':0,
    'REVIEW REPLACEMENT':1,
    'HOLD FOR NOW':2,
    'PROTECT ENCHANTMENT':3,
    'LOCKED':4,
    'ALREADY LIMITED':5,
    'COMPLETE LOADOUT FIRST':6
  };
  return result.sort((a,b)=>priority[a.verdict]-priority[b.verdict]||
    b.recommendationScore-a.recommendationScore||
    (a.gapToBest??Infinity)-(b.gapToBest??Infinity)||
    a.item.baseName.localeCompare(b.item.baseName)||
    a.item.id.localeCompare(b.item.id));
}

function isProtectedAuthentication(item:GearItem,settings:AlgorithmSettings):boolean{
  if(!item.authenticated)return false;
  if(['Premium','Limited','Alien'].includes(item.authentication.kind))return true;
  const effect=item.authentication.effect.trim();
  if(['Focused','Sunny','Nocturnal','Raindrop','Overcharged','Time Keeper','Connected','Grade Re-Roll'].includes(effect))return true;
  const scored=passiveScore(item,settings);
  return scored.unknown||scored.provisional;
}

function slotReason(slot:Slot):string{
  if(slot==='Back')return 'Default slot priority #1: Luck Frenzy is the strongest broad-use Limited outcome; Featherweight remains a strong hauling specialist.';
  if(slot==='Head')return 'Default slot priority #2: Auto X-Ray is strong general utility and Grade Re-Roll is a high-value grading specialist.';
  return 'Default slot priority #3: both Wrist outcomes are reactive bidding-recovery effects that only matter after a missed bid.';
}
