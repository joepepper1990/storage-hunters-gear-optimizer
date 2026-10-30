import type {
  AlgorithmSettings, CombinationResult, GearItem, GearLoadoutMembership, GearLoadoutName,
  GearStats, ItemAnalysis, MainAuctionContext, ScoreBreakdown
} from '../types';
import { algorithmIssues } from './settingsValidation';
import { arrowBandDistance, arrowEffective, arrowTargetBand, combineStats, effectiveItemStats, energyEffective, scoreStandalone, zoneEffective } from './scoring';
import { MODEL_ASSUMPTIONS } from './modelAssumptions';
import { hasUnknownEffect } from './effects';
import { futureSweep } from './retention';
import { canonicalEffect } from '../authentication';

export type DynamicScenario = 'low' | 'central' | 'high';

export interface DynamicState {
  droughtbreakerStacks: number;
  goldenHourLuck: number;
  luckFrenzyUptime: number;
  /** Base Luck supplied by an active Energy Drink before Overcharged is applied. */
  drinkLuckBoost: number;
  label: string;
}

export interface GearLoadoutResult {
  name: GearLoadoutName;
  context?: MainAuctionContext;
  head: GearItem;
  back: GearItem;
  wrist: GearItem;
  stats: GearStats;
  utility: number;
  mainUtility: number;
  /** Points of combined Bid Arrow outside the required band (0 = inside). Smaller ranks
   * before `utility` for auction sets and before `mainUtility` as every tie-break. */
  arrowDistance: number;
  tiedItemIds: Set<string>;
  rationale: string;
}

export interface GearLoadoutCollection {
  main?: GearLoadoutResult;
  day?: GearLoadoutResult;
  night?: GearLoadoutResult;
  rain?: GearLoadoutResult;
  drink?: GearLoadoutResult;
  grading?: GearLoadoutResult;
  shop?: GearLoadoutResult;
}

export const LUCKY_GRADING = true;

const MUTATED_LUCK: Record<string, number> = {
  Silver:5, Gold:10, Corrupted:15, Diamond:20, Gem:25, Chrome:30,
  Hologram:35, Void:40, Secret:45, Rainbow:60, Onyx:75
};


const LUCKY_GRADES = [
  // Lucky Grading gamepass: Replica 0%, 1★ 36%, 2★ 54%, 3★ 10%.
  {p:.36,value:1.05,eligible:true},
  {p:.54,value:1.35,eligible:false},
  {p:.10,value:2.00,eligible:false}
] as const;

const PRESET_STATES: Record<DynamicScenario,DynamicState> = {
  low:{droughtbreakerStacks:0,goldenHourLuck:0,luckFrenzyUptime:0,drinkLuckBoost:0,label:'Robust baseline'},
  central:{...MODEL_ASSUMPTIONS.dynamic.central,label:'Central sensitivity · Drink 2'},
  high:{...MODEL_ASSUMPTIONS.dynamic.high,label:'High sensitivity · Drink 3'}
};

export const RETENTION_DYNAMIC_STATES: DynamicState[] = [
  PRESET_STATES.low,
  ...[0,5].flatMap(droughtbreakerStacks=>
    [0,100].flatMap(goldenHourLuck=>
      [0,1].flatMap(luckFrenzyUptime=>
        [0,50,150,300].map(drinkLuckBoost=>({
          droughtbreakerStacks,goldenHourLuck,luckFrenzyUptime,drinkLuckBoost,
          label:'DB '+droughtbreakerStacks+' · GH '+goldenHourLuck+' · Frenzy '+(luckFrenzyUptime?'active':'inactive')+' · Drink '+drinkLuckBoost
        }))
      )
    )
  ),
  PRESET_STATES.central
];

export function gradeRerollExpectedValueGainPct(rollPct:number):number {
  const baseline=LUCKY_GRADES.reduce((s,g)=>s+g.p*g.value,0);
  const gain=LUCKY_GRADES.filter(g=>g.eligible).reduce((s,g)=>s+g.p*(rollPct/100)*(baseline-g.value),0);
  return baseline>0?gain/baseline*100:0;
}

export function mutationLuckForItem(item:GearItem):number {
  return (item.mutation??'').split('+').map(x=>x.trim()).reduce((best,name)=>Math.max(best,MUTATED_LUCK[name]??0),0);
}

export function resolveDynamicState(input:DynamicScenario|DynamicState='low'):DynamicState {
  return typeof input==='string'?PRESET_STATES[input]:input;
}

export function dynamicLuck(
  items:GearItem[],
  context:MainAuctionContext='Neutral',
  dynamic:DynamicScenario|DynamicState='low'
):number {
  const state=resolveDynamicState(dynamic);
  // An active drink is a shared baseline, independent of authentication count.
  let luck=state.drinkLuckBoost;
  if(!items.some(item=>item.authenticated))return luck;
  for(const item of items){
    if(!item.authenticated)continue;
    const effect=item.authentication.effect.trim();
    const value=Number(item.authentication.value)||0;
    if(effect==='Mutated Luck') {
      luck += items.reduce((sum,g)=>sum+mutationLuckForItem(g),0);
    } else if(effect==='Droughtbreaker'||effect==='Drought Breaker') {
      luck += value*state.droughtbreakerStacks;
    } else if(effect==='Golden Hour') {
      luck += state.goldenHourLuck;
    } else if(effect==='Luck Frenzy') {
      luck += value*state.luckFrenzyUptime;
    } else if(effect==='Overcharged'&&state.drinkLuckBoost>0) {
      luck += state.drinkLuckBoost*(Math.max(0,value)/100);
    } else if(effect==='Sunny'&&context==='Day') luck += value;
    else if(effect==='Nocturnal'&&context==='Night') luck += value;
    else if(effect==='Raindrop'&&context==='Rain') luck += value;
  }
  return luck;
}

export function mainAuctionUtility(
  items:GearItem[],
  settings:AlgorithmSettings,
  context:MainAuctionContext='Neutral',
  dynamic:DynamicScenario|DynamicState='low',
  stats:GearStats=combineStats(items)
):number {
  const luck=stats.luck+dynamicLuck(items,context,dynamic);
  return luck*settings.luckWeight
    + arrowEffective(stats.arrowReduction,settings)*settings.arrowWeight
    + zoneEffective(stats.zone,settings)*settings.zoneWeight
    + energyEffective(stats.energy,settings)*settings.energyWeight
    + stats.recovery*settings.recoveryWeight;
}

export function mainCombination(
  head:GearItem, back:GearItem, wrist:GearItem, settings:AlgorithmSettings,
  context:MainAuctionContext='Neutral', dynamic:DynamicScenario|DynamicState='low'
):CombinationResult {
  const items=[head,back,wrist];
  const stats=combineStats(items);
  const extraLuck=dynamicLuck(items,context,dynamic);
  const luck=(stats.luck+extraLuck)*settings.luckWeight;
  const arrow=arrowEffective(stats.arrowReduction,settings)*settings.arrowWeight;
  const zone=zoneEffective(stats.zone,settings)*settings.zoneWeight;
  const recovery=stats.recovery*settings.recoveryWeight;
  const energy=energyEffective(stats.energy,settings)*settings.energyWeight;
  const total=luck+arrow+zone+energy+recovery;
  const passive=extraLuck*settings.luckWeight;
  const score:ScoreBreakdown={
    core:total-passive, passive, total,
    luck, arrow, zone, recovery,
    npc:0, energy, tip:0, vehicle:0, walk:0,
    passiveDetails: extraLuck?[{label:'Dynamic / contextual Luck',score:passive}]:[],
    hasUnknownProtectedPassive:false, hasProvisionalPassive:false
  };
  const displayedStats={...stats,luck:stats.luck+extraLuck};
  return {
    head,back,wrist,stats:displayedStats,score,
    wastedArrow:Math.max(0,stats.arrowReduction-arrowTargetBand(settings).max),
    penalisedArrow:0,
    wastedEnergy:Math.max(0,stats.energy-settings.energyCeiling)
  };
}

function gradeRerollValue(items:GearItem[]):number {
  return items.reduce((sum,item)=>sum+(item.authenticated&&item.authentication.effect.trim()==='Grade Re-Roll'
    ?gradeRerollExpectedValueGainPct(Math.max(0,item.authentication.value)):0),0);
}
function shopValue(stats:GearStats,settings:AlgorithmSettings):number {
  return stats.tip*settings.shopTipWeight+stats.npc*settings.shopNpcWeight;
}

/** Specialist loadouts in the order they are considered after Main Auction.
 * Priority 0 means ignore: no loadout, no retention protection, no certificate goal.
 * Equal priorities keep the default order Drink Prep -> Grading -> Shop / Idle.
 */
export type SpecialistName='Drink Prep'|'Grading'|'Shop / Idle';
export function activeSpecialists(settings:AlgorithmSettings):SpecialistName[] {
  const all:Array<[SpecialistName,number]>=[
    ['Drink Prep',settings.drinkPriority],
    ['Grading',settings.gradingPriority],
    ['Shop / Idle',settings.shopPriority]
  ];
  return all.filter(([name,priority])=>priority>0&&(name!=='Shop / Idle'||settings.shopTipWeight>0||settings.shopNpcWeight>0))
    .map((entry,index)=>({entry,index}))
    .sort((a,b)=>b.entry[1]-a.entry[1]||a.index-b.index)
    .map(x=>x.entry[0]);
}
function drinkValue(stats:GearStats,settings:AlgorithmSettings):number {
  return energyEffective(stats.energy,settings);
}

/** One evaluated trio. Combined stats and the robust Main tie-break are computed once
 * and shared by every loadout, instead of once per loadout utility. */
interface Trio { items:GearItem[]; stats:GearStats; main:number; dist:number; key:string }

/** Auction priority: being inside the Bid Arrow band (70-90% by default) comes before
 * everything else; outside it, the set nearer the band wins, whichever side it is on.
 * Combined Arrow is unaffected by dynamic Luck states and contexts, so this is per trio. */
export function arrowDistance(stats:Pick<GearStats,'arrowReduction'>,settings:AlgorithmSettings):number {
  return arrowBandDistance(stats.arrowReduction,settings);
}

export function inArrowBand(stats:Pick<GearStats,'arrowReduction'>,settings:AlgorithmSettings):boolean {
  return arrowDistance(stats,settings)<=1e-9;
}

function allTrios(gear:GearItem[],settings:AlgorithmSettings):Trio[] {
  const heads=gear.filter(g=>g.slot==='Head'), backs=gear.filter(g=>g.slot==='Back'), wrists=gear.filter(g=>g.slot==='Wrist');
  if(!heads.length||!backs.length||!wrists.length)return [];
  // Each item's stats (authentication included) are worked out once per call, not once per trio.
  const ownStats=new Map<GearItem,GearStats>();
  const own=(item:GearItem)=>{ let stats=ownStats.get(item); if(!stats){stats=combineStats([item]);ownStats.set(item,stats);} return stats; };
  const sum=(a:GearStats,b:GearStats,c:GearStats):GearStats=>({
    luck:a.luck+b.luck+c.luck, energy:a.energy+b.energy+c.energy, tip:a.tip+b.tip+c.tip, walk:a.walk+b.walk+c.walk,
    vehicle:a.vehicle+b.vehicle+c.vehicle, recovery:a.recovery+b.recovery+c.recovery, zone:a.zone+b.zone+c.zone,
    arrowReduction:a.arrowReduction+b.arrowReduction+c.arrowReduction, npc:a.npc+b.npc+c.npc
  });
  const out:Trio[]=[];
  for(const h of heads)for(const b of backs)for(const w of wrists){
    const items=[h,b,w],stats=sum(own(h),own(b),own(w));
    out.push({items,stats,main:mainAuctionUtility(items,settings,'Neutral','low',stats),
      dist:arrowDistance(stats,settings),key:h.id+'|'+b.id+'|'+w.id});
  }
  return out;
}

function makeResult(
  name:GearLoadoutName, trios:Trio[], utility:(trio:Trio)=>number,
  settings:AlgorithmSettings, context?:MainAuctionContext, rationale='', requirePositive=false,
  dynamic:DynamicScenario|DynamicState='low', auction=false
):GearLoadoutResult|undefined {
  if(!trios.length)return undefined;
  // Auction sets: distance to the Arrow band first, then utility. Specialists: utility
  // first. Ties then fall to the Main priority (band distance, robust Main score), then IDs.
  const scored=trios.map(trio=>({trio,u:utility(trio),rank:auction?trio.dist:0}));
  const better=(x:typeof scored[number],y:typeof scored[number])=>
    x.rank!==y.rank?x.rank<y.rank:x.u!==y.u?x.u>y.u:x.trio.dist!==y.trio.dist?x.trio.dist<y.trio.dist
      :x.trio.main!==y.trio.main?x.trio.main>y.trio.main:x.trio.key.localeCompare(y.trio.key)<0;
  let best=scored[0];
  for(const x of scored)if(better(x,best))best=x;
  if(requirePositive&&best.u<=1e-9)return undefined;
  const epsilon=1e-9;
  const tied=scored.filter(x=>x.rank===best.rank&&x.trio.dist===best.trio.dist&&Math.abs(x.u-best.u)<=epsilon&&Math.abs(x.trio.main-best.trio.main)<=epsilon);
  const tiedItemIds=new Set(tied.flatMap(x=>x.trio.items.map(i=>i.id)));
  const items=best.trio.items,stats=best.trio.stats;
  return {
    name,context,head:items[0],back:items[1],wrist:items[2],
    stats:{...stats,luck:stats.luck+dynamicLuck(items,context??'Neutral',dynamic)},utility:best.u,mainUtility:best.trio.main,
    arrowDistance:best.trio.dist,tiedItemIds,rationale
  };
}

export function buildGearLoadouts(
  gear:GearItem[], settings:AlgorithmSettings, dynamic:DynamicScenario|DynamicState='low'
):GearLoadoutCollection {
  const trios=allTrios(gear,settings);
  const specialists=activeSpecialists(settings);
  const auction=(context:MainAuctionContext)=>(t:Trio)=>mainAuctionUtility(t.items,settings,context,dynamic,t.stats);
  return {
    main:makeResult('Main Auction',trios,auction('Neutral'),settings,'Neutral','Primary loadout: get inside the Bid Arrow band first, then Luck, Bid Zone, Energy and Recovery.',false,dynamic,true),
    day:makeResult('Day Auction',trios,auction('Day'),settings,'Day','Main Auction with Sunny effects active.',false,dynamic,true),
    night:makeResult('Night Auction',trios,auction('Night'),settings,'Night','Main Auction with Nocturnal effects active.',false,dynamic,true),
    rain:makeResult('Rain Auction',trios,auction('Rain'),settings,'Rain','Main Auction with Raindrop effects active.',false,dynamic,true),
    drink:specialists.includes('Drink Prep')?makeResult('Drink Prep',trios,t=>drinkValue(t.stats,settings),settings,undefined,'Temporary set used while consuming an Energy Drink; Energy duration matters. Overcharged is auction-time Luck and is evaluated in Main sensitivity states instead.',true):undefined,
    grading:specialists.includes('Grading')?makeResult('Grading',trios,t=>gradeRerollValue(t.items),settings,undefined,'Temporary grading set; Lucky Grading is owned and Grade Re-Roll is valued against that distribution.',true):undefined,
    shop:specialists.includes('Shop / Idle')?makeResult('Shop / Idle',trios,t=>shopValue(t.stats,settings),settings,undefined,'Optional selling set for deliberate shop/idle sessions; Tip Chance and NPC Offers matter.',true):undefined
  };
}

export function membershipsForItem(
  item:GearItem, loadouts:GearLoadoutCollection, scenario?:string
):GearLoadoutMembership[] {
  const memberships:GearLoadoutMembership[]=[];
  const entries=Object.values(loadouts).filter(Boolean) as GearLoadoutResult[];
  for(const loadout of entries){
    if(loadout.tiedItemIds.has(item.id)){
      const selected=[loadout.head.id,loadout.back.id,loadout.wrist.id].includes(item.id);
      memberships.push({loadout:loadout.name,context:loadout.context,scenario,tied:!selected,selected});
    }
  }
  return memberships;
}

/** Short reasons shown beside each item; the engine behind them is not shown. */
export type RetentionReason =
  | 'Current Best Set' | 'Tied with Best Set' | 'High Luck alternative' | 'High Arrow alternative'
  | 'Useful Luck/Arrow balance' | 'Valuable authentication' | 'Valuable mutation' | 'Focused potential'
  | 'Locked by you' | 'Strong future certificate target' | 'Needed for a full set' | 'Not needed in any best set';

const VALUABLE_EFFECTS = new Set(['Sunny','Nocturnal','Overcharged','Raindrop','Focused','Mutated Luck','Golden Hour','Drought Breaker','Luck Frenzy','Featherweight']);

function buildMembershipMap(gear:GearItem[],settings:AlgorithmSettings):Map<string,GearLoadoutMembership[]> {
  const map=new Map<string,GearLoadoutMembership[]>();
  for(const state of RETENTION_DYNAMIC_STATES){
    const loadouts=buildGearLoadouts(gear,settings,state);
    // Only auction sets protect items; there are no user-facing specialist sets.
    const auction={main:loadouts.main,day:loadouts.day,night:loadouts.night,rain:loadouts.rain};
    for(const item of gear){
      for(const membership of membershipsForItem(item,auction,state.label)){
        const list=map.get(item.id)??[];
        if(!list.some(m=>m.loadout===membership.loadout))list.push(membership);
        map.set(item.id,list);
      }
    }
  }
  return map;
}

/**
 * Equip / Keep / Safe to discard for every item, with one short reason each.
 *
 * KEEP when the item is in or tied with the Best Set, belongs to any optimal Neutral, Day,
 * Night or Rain set in any dynamic state, is a favourite, carries an effect whose value is
 * unresolved, or could become part of the best set if one new piece arrived in another slot
 * (see retention.ts). Only items none of that applies to are SAFE TO DISCARD. Items targeted
 * by a certificate are kept by the screens, which know the certificate queue.
 */
export function analyseGearRetention(gear:GearItem[],settings:AlgorithmSettings):ItemAnalysis[] {
  const issues=algorithmIssues(settings);
  if(issues.length)return gear.map(item=>({item,verdict:'KEEP',
    reason:'Invalid settings: '+issues.join('; '),
    standalone:scoreStandalone(item,settings),currentlyEquipped:false,loadoutMemberships:[]}));
  const best=buildGearLoadouts(gear,settings,'low').main;
  const bestIds=new Set(best?[best.head.id,best.back.id,best.wrist.id]:[]);
  const bestInSlot=(slot:GearItem['slot'])=>best?[best.head,best.back,best.wrist].find(g=>g.slot===slot):undefined;
  const memberships=buildMembershipMap(gear,settings);
  const sweep=futureSweep(gear,settings);
  return gear.map(item=>{
    const standalone=scoreStandalone(item,settings);
    const loadoutMemberships=memberships.get(item.id)??[];
    const result=(verdict:ItemAnalysis['verdict'],reason:RetentionReason)=>({item,verdict,reason,standalone,currentlyEquipped:verdict==='EQUIP',loadoutMemberships});
    const effect=item.authenticated?canonicalEffect(item.authentication.effect):'';
    if(bestIds.has(item.id))return result('EQUIP','Current Best Set');
    if(best?.tiedItemIds.has(item.id))return result('KEEP','Tied with Best Set');
    if(item.favourite)return result('KEEP','Locked by you');
    if(hasUnknownEffect(item))return result('KEEP',effect==='Focused'?'Focused potential':'Valuable authentication');
    const profile=():RetentionReason=>{
      const current=bestInSlot(item.slot);
      if(!current)return 'Useful Luck/Arrow balance';
      const a=effectiveItemStats(item),b=effectiveItemStats(current);
      if(a.luck>b.luck+1e-9&&a.arrowReduction<b.arrowReduction-1e-9)return 'High Luck alternative';
      if(a.arrowReduction>b.arrowReduction+1e-9&&a.luck<b.luck-1e-9)return 'High Arrow alternative';
      return 'Useful Luck/Arrow balance';
    };
    if(loadoutMemberships.length)return result('KEEP',VALUABLE_EFFECTS.has(effect)?'Valuable authentication':profile());
    if(sweep.plain.has(item.id))return result('KEEP',VALUABLE_EFFECTS.has(effect)?'Valuable authentication':profile());
    // Kept only once a Premium certificate gives Heads Mutated Luck: a Head is then itself
    // the certificate target; a Back or Wrist is kept for the Luck its mutation would add.
    if(sweep.mutation.has(item.id))return result('KEEP',item.slot==='Head'?'Strong future certificate target':'Valuable mutation');
    // Without a full Head + Back + Wrist set nothing can be proven unnecessary yet.
    if(!best)return result('KEEP','Needed for a full set');
    return result('SAFE TO DISCARD','Not needed in any best set');
  });
}
