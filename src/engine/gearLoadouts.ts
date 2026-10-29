import type {
  AlgorithmSettings, CombinationResult, GearItem, GearLoadoutMembership, GearLoadoutName,
  GearStats, ItemAnalysis, MainAuctionContext, ScoreBreakdown
} from '../types';
import { algorithmIssues } from './settingsValidation';
import { findDominator } from './dominance';
import { arrowEffective, arrowTargetBand, combineStats, effectiveItemStats, energyEffective, scoreStandalone, zoneEffective } from './scoring';
import { MODEL_ASSUMPTIONS } from './modelAssumptions';
import { hasUnknownEffect } from './effects';

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
  /** 1 when the set reaches the ideal Bid Arrow band. Ranks before `utility` for auction sets
   * and before `mainUtility` as every tie-break: reaching the band always comes first. */
  arrowTier: number;
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

const TRIO_DEPENDENT_OR_STATEFUL = new Set([
  'Mutated Luck','Droughtbreaker','Drought Breaker','Golden Hour','Luck Frenzy'
]);

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
  const total=luck+arrow+zone+recovery;
  const passive=extraLuck*settings.luckWeight;
  const score:ScoreBreakdown={
    core:total-passive, passive, total,
    luck, arrow, zone, recovery,
    npc:0, energy:0, tip:0, vehicle:0, walk:0,
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
interface Trio { items:GearItem[]; stats:GearStats; main:number; tier:number; key:string }

/** Main Auction priority: reaching the Bid Arrow band (65% by default) comes before
 * everything else; only then do Luck and the other weighted stats decide. Combined
 * Arrow is unaffected by dynamic Luck states and contexts, so the tier is per trio. */
export function arrowBandReached(stats:Pick<GearStats,'arrowReduction'>,settings:AlgorithmSettings):boolean {
  return stats.arrowReduction>=settings.arrowSweetSpot-1e-9;
}

/** Arrow tier of a set, compared before any score: 2 inside the ideal band (65-80% by
 * default), 1 above it (the band is reached but overshot), 0 below it. */
export function arrowTier(stats:Pick<GearStats,'arrowReduction'>,settings:AlgorithmSettings):number {
  if(!arrowBandReached(stats,settings))return 0;
  return stats.arrowReduction<=arrowTargetBand(settings).max+1e-9?2:1;
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
      tier:arrowTier(stats,settings),key:h.id+'|'+b.id+'|'+w.id});
  }
  return out;
}

function makeResult(
  name:GearLoadoutName, trios:Trio[], utility:(trio:Trio)=>number,
  settings:AlgorithmSettings, context?:MainAuctionContext, rationale='', requirePositive=false,
  dynamic:DynamicScenario|DynamicState='low', auction=false
):GearLoadoutResult|undefined {
  if(!trios.length)return undefined;
  // Auction sets: Arrow band first, then utility. Specialists: utility first. Ties then
  // fall to the Main priority (band, then robust Main score), then trio IDs.
  const scored=trios.map(trio=>({trio,u:utility(trio),rank:auction?trio.tier:0}));
  const better=(x:typeof scored[number],y:typeof scored[number])=>
    x.rank!==y.rank?x.rank>y.rank:x.u!==y.u?x.u>y.u:x.trio.tier!==y.trio.tier?x.trio.tier>y.trio.tier
      :x.trio.main!==y.trio.main?x.trio.main>y.trio.main:x.trio.key.localeCompare(y.trio.key)<0;
  let best=scored[0];
  for(const x of scored)if(better(x,best))best=x;
  if(requirePositive&&best.u<=1e-9)return undefined;
  const epsilon=1e-9;
  const tied=scored.filter(x=>x.rank===best.rank&&x.trio.tier===best.trio.tier&&Math.abs(x.u-best.u)<=epsilon&&Math.abs(x.trio.main-best.trio.main)<=epsilon);
  const tiedItemIds=new Set(tied.flatMap(x=>x.trio.items.map(i=>i.id)));
  const items=best.trio.items,stats=best.trio.stats;
  return {
    name,context,head:items[0],back:items[1],wrist:items[2],
    stats:{...stats,luck:stats.luck+dynamicLuck(items,context??'Neutral',dynamic)},utility:best.u,mainUtility:best.trio.main,
    arrowTier:best.trio.tier,tiedItemIds,rationale
  };
}

export function buildGearLoadouts(
  gear:GearItem[], settings:AlgorithmSettings, dynamic:DynamicScenario|DynamicState='low'
):GearLoadoutCollection {
  const trios=allTrios(gear,settings);
  const specialists=activeSpecialists(settings);
  const auction=(context:MainAuctionContext)=>(t:Trio)=>mainAuctionUtility(t.items,settings,context,dynamic,t.stats);
  return {
    main:makeResult('Main Auction',trios,auction('Neutral'),settings,'Neutral','Primary loadout: reach the Bid Arrow band first, then Luck, Bid Zone and Recovery.',false,dynamic,true),
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

function uncertainProtection(item:GearItem):string|undefined {
  if(!hasUnknownEffect(item))return undefined;
  const effect=item.authentication.effect.trim();
  if(effect==='Focused'||effect==='Focus')return 'Focused is A-tier for this profile but its exact numerical formula is still unresolved, so this item cannot be irreversibly discarded.';
  return effect+' is not yet modelled, so this item cannot be irreversibly discarded.';
}

function hasStatefulOrTrioDependentValue(item:GearItem):boolean {
  return Boolean(item.authenticated&&TRIO_DEPENDENT_OR_STATEFUL.has(item.authentication.effect.trim()));
}

function buildMembershipMap(gear:GearItem[],settings:AlgorithmSettings):Map<string,GearLoadoutMembership[]> {
  const map=new Map<string,GearLoadoutMembership[]>();
  for(const state of RETENTION_DYNAMIC_STATES){
    const loadouts=buildGearLoadouts(gear,settings,state);
    for(const item of gear){
      const memberships=membershipsForItem(item,loadouts,state.label);
      for(const membership of memberships){
        const list=map.get(item.id)??[];
        const key=(m:GearLoadoutMembership)=>m.loadout+'|'+(m.context??'');
        const existing=list.find(m=>key(m)===key(membership));
        if(existing){
          existing.selected=existing.selected||membership.selected;
          existing.tied=existing.tied&&membership.tied;
          if(state.label===PRESET_STATES.low.label)existing.scenario=undefined;
          else if(existing.scenario&&existing.scenario!==state.label)existing.scenario='dynamic sensitivity';
        }else{
          list.push({...membership,scenario:state.label===PRESET_STATES.low.label?undefined:state.label});
        }
        map.set(item.id,list);
      }
    }
  }
  return map;
}

/** Discard is stat by stat: a replacement must be at least as good on every stat that
 * matters (importance above 0), so no trade-off between stats can make an item redundant.
 * Componentwise bounds also stay valid when future complementary gear moves a stat across
 * a saturation breakpoint.
 */
function futureSafeDominator(item:GearItem,candidates:GearItem[],settings:AlgorithmSettings) {
  const target=effectiveItemStats(item);
  const specialists=activeSpecialists(settings);
  const drink=specialists.includes('Drink Prep');
  const grading=specialists.includes('Grading');
  const shop=specialists.includes('Shop / Idle');
  const specialistSafe=candidates.filter(candidate=>{
    const stats=effectiveItemStats(candidate);
    // Ignored specialists (priority 0) and zero-importance Shop stats impose no requirement.
    // Less raw Arrow could drop a future set out of the Arrow band, which outranks any score.
    return stats.arrowReduction>=target.arrowReduction
      && (settings.luckWeight<=0||stats.luck>=target.luck)
      && (settings.zoneWeight<=0||stats.zone>=target.zone)
      && (settings.recoveryWeight<=0||stats.recovery>=target.recovery)
      && (!drink||stats.energy>=target.energy)
      && (!shop||settings.shopTipWeight<=0||stats.tip>=target.tip)
      && (!shop||settings.shopNpcWeight<=0||stats.npc>=target.npc)
      && (!grading||gradeRerollValue([candidate])>=gradeRerollValue([item]))
      // A future companion with Mutated Luck reads every member's mutation.
      && mutationLuckForItem(candidate)>=mutationLuckForItem(item);
  });
  // Being strictly better on a stat for an active specialist also counts as beating the
  // item: a tiny weight makes it register without ever outweighing a Main stat.
  const tiny=1e-6;
  const mainSettings={...settings,vehicleWeight:0,walkWeight:0,
    energyWeight:drink?tiny:0,
    tipWeight:shop&&settings.shopTipWeight>0?tiny:0,
    npcWeight:shop&&settings.shopNpcWeight>0?tiny:0};
  const dominance=findDominator(item,specialistSafe,mainSettings);
  if(!dominance.dominated && specialistSafe.length!==candidates.length) {
    dominance.reason='No other item in this slot is at least as good on every stat that matters (Luck, Arrow, Zone, Recovery, Energy, Tip, NPC, Grade Re-Roll and Mutated Luck).';
  }
  return dominance;
}

export function analyseGearRetention(gear:GearItem[],settings:AlgorithmSettings):ItemAnalysis[] {
  const issues=algorithmIssues(settings);
  if(issues.length)return gear.map(item=>({item,verdict:'KEEP',
    reason:'Invalid algorithm settings prevent safe retention recommendations: '+issues.join('; ')+'.',
    standalone:scoreStandalone(item,settings),currentlyEquipped:false,loadoutMemberships:[]}));
  // EQUIP must agree with Dashboard/Optimise, which use the robust ('low') Main baseline.
  // Central/high alternatives are still retained by buildMembershipMap as KEEP.
  const active=buildGearLoadouts(gear,settings,'low');
  const mainIds=new Set(active.main?[active.main.head.id,active.main.back.id,active.main.wrist.id]:[]);
  const membershipMap=buildMembershipMap(gear,settings);
  return gear.map(item=>{
    const standalone=scoreStandalone(item,settings);
    const memberships=membershipMap.get(item.id)??[];
    if(mainIds.has(item.id)){
      return {
        item,verdict:'EQUIP',reason:'Part of the current best Main Auction loadout.',
        standalone,currentlyEquipped:true,loadoutMemberships:memberships
      };
    }
    if(memberships.length){
      const reasons=memberships.map(m=>m.loadout+(m.tied?' (tied optimum)':'')+(m.scenario?' ['+m.scenario+']':''));
      return {
        item,verdict:'KEEP',
        reason:'Required by '+reasons.join(' / ')+'.',
        standalone,currentlyEquipped:false,loadoutMemberships:memberships
      };
    }
    if(item.favourite){
      return {item,verdict:'KEEP',reason:'Manually locked / favourited.',standalone,currentlyEquipped:false,loadoutMemberships:[]};
    }
    const protection=uncertainProtection(item);
    if(protection){
      return {item,verdict:'PROTECTED / UNKNOWN',reason:protection,standalone,currentlyEquipped:false,loadoutMemberships:[]};
    }
    if(hasStatefulOrTrioDependentValue(item)){
      return {
        item,verdict:'KEEP',
        reason:item.authentication.effect+' has state- or trio-dependent value that is not represented by the static dominance proof, so it is retained unless a future exact proof can establish redundancy.',
        standalone,currentlyEquipped:false,loadoutMemberships:[]
      };
    }
    const sameSlot=gear.filter(x=>x.slot===item.slot&&x.id!==item.id);
    const dominance=futureSafeDominator(item,sameSlot,settings);
    if(dominance.dominated){
      return {
        item,verdict:'SAFE TO DISCARD',
        reason:'No loss of Main Auction or specialist utility across future complementary states is proven, and '+dominance.reason,
        standalone,currentlyEquipped:false,dominance,loadoutMemberships:[]
      };
    }
    return {
      item,verdict:'KEEP',
      reason:dominance.reason||'Not globally redundant across the relevant loadouts.',
      standalone,currentlyEquipped:false,dominance,loadoutMemberships:[]
    };
  });
}

