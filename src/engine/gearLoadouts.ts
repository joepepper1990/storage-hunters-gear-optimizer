import type {
  AlgorithmSettings, CombinationResult, GearItem, GearLoadoutMembership, GearLoadoutName,
  GearStats, ItemAnalysis, MainAuctionContext, ScoreBreakdown
} from '../types';
import { findDominator } from './dominance';
import { arrowEffective, combineStats, effectiveItemStats, energyEffective, scoreStandalone, zoneEffective } from './scoring';

export type DynamicScenario = 'low' | 'central' | 'high';

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

const LUCKY_GRADES = [
  {p:.28,value:1.05,eligible:true},
  {p:.62,value:1.35,eligible:false},
  {p:.10,value:2.00,eligible:false}
] as const;

export function gradeRerollExpectedValueGainPct(rollPct:number):number {
  const baseline=LUCKY_GRADES.reduce((s,g)=>s+g.p*g.value,0);
  const gain=LUCKY_GRADES.filter(g=>g.eligible).reduce((s,g)=>s+g.p*(rollPct/100)*(baseline-g.value),0);
  return baseline>0?gain/baseline*100:0;
}

export function mutationLuckForItem(item:GearItem):number {
  return (item.mutation??'').split('+').map(x=>x.trim()).reduce((best,name)=>Math.max(best,MUTATED_LUCK[name]??0),0);
}

export function dynamicLuck(items:GearItem[], context:MainAuctionContext='Neutral', scenario:DynamicScenario='central'):number {
  let luck=0;
  for(const item of items){
    if(!item.authenticated)continue;
    const effect=item.authentication.effect.trim();
    const value=Number(item.authentication.value)||0;
    if(effect==='Mutated Luck') {
      luck += items.reduce((sum,g)=>sum+mutationLuckForItem(g),0);
    } else if(effect==='Droughtbreaker'||effect==='Drought Breaker') {
      const stacks=scenario==='low'?0:scenario==='high'?5:3;
      luck += value*stacks;
    } else if(effect==='Golden Hour') {
      luck += scenario==='low'?0:scenario==='high'?100:(value>0?Math.min(100,value):50);
    } else if(effect==='Luck Frenzy') {
      const uptime=scenario==='low'?.05:scenario==='high'?.30:.15;
      luck += value*uptime;
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
  scenario:DynamicScenario='central'
):number {
  const stats=combineStats(items);
  const luck=stats.luck+dynamicLuck(items,context,scenario);
  return luck*settings.luckWeight
    + arrowEffective(stats.arrowReduction,settings)*settings.arrowWeight
    + zoneEffective(stats.zone,settings)*settings.zoneWeight
    + stats.recovery*settings.recoveryWeight;
}

export function mainCombination(
  head:GearItem, back:GearItem, wrist:GearItem, settings:AlgorithmSettings,
  context:MainAuctionContext='Neutral', scenario:DynamicScenario='central'
):CombinationResult {
  const items=[head,back,wrist];
  const stats=combineStats(items);
  const dynamic=dynamicLuck(items,context,scenario);
  const luck=(stats.luck+dynamic)*settings.luckWeight;
  const arrow=arrowEffective(stats.arrowReduction,settings)*settings.arrowWeight;
  const zone=zoneEffective(stats.zone,settings)*settings.zoneWeight;
  const recovery=stats.recovery*settings.recoveryWeight;
  const total=luck+arrow+zone+recovery;
  const passive=dynamic*settings.luckWeight;
  const score:ScoreBreakdown={
    core:total-passive, passive, total,
    luck, arrow, zone, recovery,
    npc:0, energy:0, tip:0, vehicle:0, walk:0,
    passiveDetails: dynamic?[{label:'Dynamic / contextual Luck',score:dynamic*settings.luckWeight}]:[],
    hasUnknownProtectedPassive:false, hasProvisionalPassive:false
  };
  return {
    head,back,wrist,stats,score,
    wastedArrow:Math.max(0,stats.arrowReduction-settings.arrowSweetSpot),
    penalisedArrow:0,
    wastedEnergy:Math.max(0,stats.energy-settings.energyCeiling)
  };
}

function overchargedValue(items:GearItem[]):number {
  return items.reduce((sum,item)=>sum+(item.authenticated&&item.authentication.effect.trim()==='Overcharged'?Math.max(0,item.authentication.value):0),0);
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
  return energyEffective(stats.energy,settings)+overchargedValue(items)*.6;
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
  settings:AlgorithmSettings, context?:MainAuctionContext, rationale='', requirePositive=false
):GearLoadoutResult|undefined {
  if(!trios.length)return undefined;
  const scored=trios.map(items=>({items,u:utility(items),main:mainAuctionUtility(items,settings,'Neutral','central')}));
  scored.sort((a,b)=>b.u-a.u||b.main-a.main||a.items.map(x=>x.id).join('|').localeCompare(b.items.map(x=>x.id).join('|')));
  const best=scored[0];
  if(requirePositive&&best.u<=1e-9)return undefined;
  const epsilon=1e-9;
  // Specialist objective is primary; Main Auction utility breaks otherwise-irrelevant
  // Head/Back/Wrist ties so a specialist does not retain the entire inventory.
  const tied=scored.filter(x=>Math.abs(x.u-best.u)<=epsilon&&Math.abs(x.main-best.main)<=epsilon);
  const tiedItemIds=new Set(tied.flatMap(x=>x.items.map(i=>i.id)));
  return {
    name,context,head:best.items[0],back:best.items[1],wrist:best.items[2],
    stats:combineStats(best.items),utility:best.u,mainUtility:best.main,tiedItemIds,rationale
  };
}

export function buildGearLoadouts(
  gear:GearItem[], settings:AlgorithmSettings, scenario:DynamicScenario='central'
):GearLoadoutCollection {
  const trios=allTrios(gear);
  return {
    main:makeResult('Main Auction',trios,items=>mainAuctionUtility(items,settings,'Neutral',scenario),settings,'Neutral','Primary loadout: Luck, Bid Arrow to 75%, Bid Zone and Recovery.'),
    day:makeResult('Day Auction',trios,items=>mainAuctionUtility(items,settings,'Day',scenario),settings,'Day','Main Auction with Sunny effects active.'),
    night:makeResult('Night Auction',trios,items=>mainAuctionUtility(items,settings,'Night',scenario),settings,'Night','Main Auction with Nocturnal effects active.'),
    rain:makeResult('Rain Auction',trios,items=>mainAuctionUtility(items,settings,'Rain',scenario),settings,'Rain','Main Auction with Raindrop effects active.'),
    drink:makeResult('Drink Prep',trios,items=>drinkValue(items,settings),settings,undefined,'Temporary set used while consuming an Energy Drink; Energy duration and Overcharged matter.',true),
    grading:makeResult('Grading',trios,items=>gradeRerollValue(items),settings,undefined,'Temporary grading set; Lucky Grading is owned and Grade Re-Roll is valued against that distribution.',true),
    shop:makeResult('Shop / Idle',trios,items=>shopValue(items),settings,undefined,'Optional selling set for deliberate shop/idle sessions; Tip Chance and NPC Offers matter.',true)
  };
}

export function membershipsForItem(
  item:GearItem, loadouts:GearLoadoutCollection
):GearLoadoutMembership[] {
  const memberships:GearLoadoutMembership[]=[];
  const entries=Object.values(loadouts).filter(Boolean) as GearLoadoutResult[];
  for(const loadout of entries){
    if(loadout.tiedItemIds.has(item.id)){
      const selected=[loadout.head.id,loadout.back.id,loadout.wrist.id].includes(item.id);
      memberships.push({loadout:loadout.name,context:loadout.context,tied:!selected,selected});
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

function scenarioMemberships(item:GearItem, gear:GearItem[], settings:AlgorithmSettings):GearLoadoutMembership[] {
  const all:GearLoadoutMembership[]=[];
  for(const scenario of ['low','central','high'] as DynamicScenario[]){
    const memberships=membershipsForItem(item,buildGearLoadouts(gear,settings,scenario));
    for(const m of memberships)if(!all.some(x=>x.loadout===m.loadout&&x.context===m.context))all.push(m);
  }
  return all;
}

export function analyseGearRetention(gear:GearItem[],settings:AlgorithmSettings):ItemAnalysis[] {
  const central=buildGearLoadouts(gear,settings,'central');
  const mainIds=new Set(central.main?[central.main.head.id,central.main.back.id,central.main.wrist.id]:[]);
  return gear.map(item=>{
    const standalone=scoreStandalone(item,settings);
    const memberships=scenarioMemberships(item,gear,settings);
    const relevant=memberships.filter(m=>m.loadout!=='Day Auction'||m.context==='Day');
    if(mainIds.has(item.id)){
      return {
        item,verdict:'EQUIP',reason:'Part of the current best Main Auction loadout.',
        standalone,currentlyEquipped:true,loadoutMemberships:memberships
      };
    }
    if(relevant.length){
      return {
        item,verdict:'KEEP',
        reason:'Required by '+relevant.map(m=>m.loadout+(m.tied?' (tied optimum)':'')).join(' / ')+'.',
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
    const sameSlot=gear.filter(x=>x.slot===item.slot&&x.id!==item.id);
    const dominance=findDominator(item,sameSlot,settings);
    if(dominance.dominated){
      return {
        item,verdict:'SAFE TO DISCARD',
        reason:'Not used by Main Auction, Day/Night/Rain, Drink Prep, Grading or Shop/Idle, and '+dominance.reason,
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
