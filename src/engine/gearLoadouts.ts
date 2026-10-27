import type {
  AlgorithmSettings, CombinationResult, GearItem, GearLoadoutMembership, GearLoadoutName,
  GearStats, ItemAnalysis, MainAuctionContext, ScoreBreakdown
} from '../types';
import { algorithmIssues } from './settingsValidation';
import { findDominator } from './dominance';
import { arrowEffective, combineStats, effectiveItemStats, energyEffective, scoreStandalone, zoneEffective } from './scoring';
import { MODEL_ASSUMPTIONS } from './modelAssumptions';

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

const USER_ZERO_VALUE_EFFECTS = new Set([
  'Walkspeed','Time Keeper','Timekeeper','Connected','Club Pact','Club Packed','Auto X-Ray',
  'Second Chance','Steady Hand','Haggler'
]);

const MODELED_EFFECTS = new Set([
  'Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance',
  'NPC Offers Bonus','Walkspeed','Sunny','Nocturnal','Overcharged','Raindrop','Mutated Luck',
  'Droughtbreaker','Drought Breaker','Golden Hour','Club Pact','Club Packed','Temporal Split',
  'Auto X-Ray','Grade Re-Roll','Featherweight','Luck Frenzy','Second Chance','Steady Hand',
  'Time Keeper','Timekeeper','Connected','Haggler','Anti-Gravity Field','Safecracker','Exhibitor','Rush'
]);

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
  dynamic:DynamicScenario|DynamicState='low'
):number {
  const stats=combineStats(items);
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
    wastedArrow:Math.max(0,stats.arrowReduction-settings.arrowSweetSpot),
    penalisedArrow:0,
    wastedEnergy:Math.max(0,stats.energy-settings.energyCeiling)
  };
}

function gradeRerollValue(items:GearItem[]):number {
  return items.reduce((sum,item)=>sum+(item.authenticated&&item.authentication.effect.trim()==='Grade Re-Roll'
    ?gradeRerollExpectedValueGainPct(Math.max(0,item.authentication.value)):0),0);
}
function shopValue(items:GearItem[]):number {
  const stats=combineStats(items);
  return stats.tip*.4+stats.npc*.3;
}
function drinkValue(items:GearItem[],settings:AlgorithmSettings):number {
  const stats=combineStats(items);
  return energyEffective(stats.energy,settings);
}

function allTrios(gear:GearItem[]):GearItem[][] {
  const heads=gear.filter(g=>g.slot==='Head'), backs=gear.filter(g=>g.slot==='Back'), wrists=gear.filter(g=>g.slot==='Wrist');
  if(!heads.length||!backs.length||!wrists.length)return [];
  const out:GearItem[][]=[];
  for(const h of heads)for(const b of backs)for(const w of wrists)out.push([h,b,w]);
  return out;
}

function makeResult(
  name:GearLoadoutName, trios:GearItem[][], utility:(items:GearItem[])=>number,
  settings:AlgorithmSettings, context?:MainAuctionContext, rationale='', requirePositive=false,
  dynamic:DynamicScenario|DynamicState='low'
):GearLoadoutResult|undefined {
  if(!trios.length)return undefined;
  const scored=trios.map(items=>({items,u:utility(items),main:mainAuctionUtility(items,settings,'Neutral','low')}));
  scored.sort((a,b)=>b.u-a.u||b.main-a.main||a.items.map(x=>x.id).join('|').localeCompare(b.items.map(x=>x.id).join('|')));
  const best=scored[0];
  if(requirePositive&&best.u<=1e-9)return undefined;
  const epsilon=1e-9;
  const tied=scored.filter(x=>Math.abs(x.u-best.u)<=epsilon&&Math.abs(x.main-best.main)<=epsilon);
  const tiedItemIds=new Set(tied.flatMap(x=>x.items.map(i=>i.id)));
  const stats=combineStats(best.items);
  return {
    name,context,head:best.items[0],back:best.items[1],wrist:best.items[2],
    stats:{...stats,luck:stats.luck+dynamicLuck(best.items,context??'Neutral',dynamic)},utility:best.u,mainUtility:best.main,tiedItemIds,rationale
  };
}

export function buildGearLoadouts(
  gear:GearItem[], settings:AlgorithmSettings, dynamic:DynamicScenario|DynamicState='low'
):GearLoadoutCollection {
  const trios=allTrios(gear);
  return {
    main:makeResult('Main Auction',trios,items=>mainAuctionUtility(items,settings,'Neutral',dynamic),settings,'Neutral','Primary loadout: Luck, Bid Arrow to 75%, Bid Zone and Recovery.',false,dynamic),
    day:makeResult('Day Auction',trios,items=>mainAuctionUtility(items,settings,'Day',dynamic),settings,'Day','Main Auction with Sunny effects active.',false,dynamic),
    night:makeResult('Night Auction',trios,items=>mainAuctionUtility(items,settings,'Night',dynamic),settings,'Night','Main Auction with Nocturnal effects active.',false,dynamic),
    rain:makeResult('Rain Auction',trios,items=>mainAuctionUtility(items,settings,'Rain',dynamic),settings,'Rain','Main Auction with Raindrop effects active.',false,dynamic),
    drink:makeResult('Drink Prep',trios,items=>drinkValue(items,settings),settings,undefined,'Temporary set used while consuming an Energy Drink; Energy duration matters. Overcharged is auction-time Luck and is evaluated in Main sensitivity states instead.',true),
    grading:makeResult('Grading',trios,items=>gradeRerollValue(items),settings,undefined,'Temporary grading set; Lucky Grading is owned and Grade Re-Roll is valued against that distribution.',true),
    shop:makeResult('Shop / Idle',trios,items=>shopValue(items),settings,undefined,'Optional selling set for deliberate shop/idle sessions; Tip Chance and NPC Offers matter.',true)
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
  if(!item.authenticated)return undefined;
  const effect=item.authentication.effect.trim();
  if(!effect)return undefined;
  if(effect==='Focused'||effect==='Focus')return 'Focused is A-tier for this profile but its exact numerical formula is still unresolved, so this item cannot be irreversibly discarded.';
  if(!MODELED_EFFECTS.has(effect))return effect+' is not yet modelled, so this item cannot be irreversibly discarded.';
  if(USER_ZERO_VALUE_EFFECTS.has(effect))return undefined;
  return undefined;
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

/** A Main score tradeoff cannot pay for losing a different specialist utility.
 * Componentwise bounds are deliberately conservative, and remain valid when
 * future complementary gear moves Energy across either saturation breakpoint.
 */
function futureSafeDominator(item:GearItem,candidates:GearItem[],settings:AlgorithmSettings) {
  const target=effectiveItemStats(item);
  const specialistSafe=candidates.filter(candidate=>{
    const stats=effectiveItemStats(candidate);
    return stats.energy>=target.energy && stats.tip>=target.tip && stats.npc>=target.npc
      && gradeRerollValue([candidate])>=gradeRerollValue([item])
      // A future companion with Mutated Luck reads every member's mutation.
      && mutationLuckForItem(candidate)>=mutationLuckForItem(item);
  });
  const mainSettings={...settings,energyWeight:0,npcWeight:0,tipWeight:0,vehicleWeight:0,walkWeight:0};
  const dominance=findDominator(item,specialistSafe,mainSettings);
  if(!dominance.dominated && specialistSafe.length!==candidates.length) {
    dominance.reason='No replacement is proven at least as useful for Main Auction and every specialist loadout across future complementary states (including Energy, Tip, NPC, Grade Re-Roll and Mutated Luck).';
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

