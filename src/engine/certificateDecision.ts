import type { AppData, AuthModelEntry, GearItem, MainAuctionContext, OwnedCertificate, Slot } from '../types';
import { canonicalEffect, certificateFamily, currentPool } from '../authentication';
import {
  buildGearLoadouts,
  gradeRerollExpectedValueGainPct,
  LUCKY_GRADING,
  mainAuctionUtility,
  mutationLuckForItem,
  type DynamicScenario
} from './gearLoadouts';
import { catalogueRowsFor } from './authModel';
import { algorithmIssues } from './settingsValidation';
import { MODEL_ASSUMPTIONS } from './modelAssumptions';
import { arrowNeeded, CALCULATED_RANK_EFFECTS, isUnwanted, preferenceOrder, preferenceRank, wantedChance, wantedEffects } from './certificatePolicy';
import { arrowTargetBand } from './scoring';

/**
 * Certificate decisions sit on top of the one authoritative loadout engine. For every
 * outcome a certificate can roll on an item, the item is rebuilt with that roll, put back
 * into the inventory, and the Neutral, Day, Night and Rain auction sets are re-optimised
 * (Head x Back x Wrist) with the Arrow band ranked first. A roll counts as an improvement
 * only when that complete re-optimised result is better than doing nothing.
 *
 * Effect selection: every canonical outcome of a certificate on a slot is equally likely.
 * Roll history and range priors only shape how strong a roll is, never which effect.
 */

export type CertificateDecisionVerdict = 'USE' | 'CONSIDER' | 'HOLD' | 'DO NOT USE';

/** Dynamic sensitivity states. Cautious decides safety, central only orders candidates,
 * favourable shows upside. None of them is a claimed average game state. */
export interface StateRange { cautious: number; central: number; favourable: number }

export interface CertificateOutcomeDefinition {
  effect: string;
  slot: Slot | 'Any';
  min?: number;
  typical?: number;
  max?: number;
  confidence: number;
  modeledMechanic: boolean;
  modelEntryId: string;
}

export interface ResultingLoadout {
  context: MainAuctionContext;
  head: GearItem;
  back: GearItem;
  wrist: GearItem;
  arrow: number;
  inBand: boolean;
  luck: number;
  zone: number;
  energy: number;
}

export interface CalculatedRank {
  effect: string;
  defaultRank?: number;
  calculatedRank?: number;
  /** Calculated Luck contribution, only when the mechanic makes it computable. */
  contribution?: number;
  reason: string;
}

export interface CertificateTargetDecision {
  item: GearItem;
  verdict: CertificateDecisionVerdict;
  /** Share of equally likely outcomes this profile wants (context-sensitive for Arrow). */
  wantedChancePct: number;
  /** Share of outcomes that are real but unwanted; they stay in the odds and the downside. */
  unwantedOutcomePct: number;
  arrowNeeded: boolean;
  currentArrow: number;
  currentArrowInBand: boolean;
  /** Chance the best re-optimised loadout improves, per dynamic state (resolved outcomes only). */
  improveChancePct: StateRange;
  /** Conservative lower bounds of improveChancePct after numerical integration error. */
  improveChanceLowerPct: StateRange;
  /** Upper bound including unresolved outcomes that could help. */
  improveChanceUpperPct: number;
  worseChancePct: StateRange;
  /** Cautious-state worse chance, including unresolved outcomes that replace a valued authentication. */
  worseChanceUpperPct: number;
  safeInCautious: boolean;
  /** Resolved-only mean change of the Neutral auction set, per state. */
  expectedMainChangePct: StateRange;
  /** Resolved-only mean of the largest auction-set gain, per state; orders candidates. */
  expectedBestGainPct: StateRange;
  unresolvedOutcomeMassPct: number;
  unresolvedEffects: string[];
  numericalProbabilityErrorPct: number;
  outcomeLikelihoods: Array<{ effect: string; probability: number }>;
  /** Per outcome: its equal probability, whether it is wanted, and how often it improves. */
  outcomes: OutcomeSummary[];
  confidencePct: number;
  currentAuthentication?: { effect: string; value: number; rank?: { rank: number; of: number; higher: string[] }; calculated: boolean };
  /** Best roll; its loadout is from the cautious state when it helps there, else the central one. */
  bestRoll?: { effect: string; label: string; gainPct: number; loadout: ResultingLoadout; state: 'cautious' | 'central'; preference: number };
  calculatedRanks: CalculatedRank[];
  reasons: string[];
}

export interface OutcomeSummary {
  effect: string;
  probability: number;
  wanted: boolean;
  unresolved: boolean;
  /** Share of this outcome's roll strengths that improve the best loadout, per state. */
  improvePct: StateRange;
  /** Largest central-state gain any strength of this outcome reaches (%). */
  bestGainPct: number;
}

export interface OwnedCertificateDecision {
  certificate: OwnedCertificate;
  verdict: CertificateDecisionVerdict;
  recommendedTarget?: CertificateTargetDecision;
  targets: CertificateTargetDecision[];
  modelNotes: string[];
}

type RollSupport = {
  value:number;
  weight:number;
  unresolved:boolean;
  label?:string;
  /** Continuous-prior quadrature only; empirical samples never carry integration error. */
  integrationCellMass?:number;
};

type Loadouts = ReturnType<typeof buildGearLoadouts>;
type Loadout = NonNullable<Loadouts['main']>;
type Baselines = Record<DynamicScenario, Loadouts>;

const STATES: DynamicScenario[] = ['low', 'central', 'high'];
const AUCTION_KEYS = ['main', 'day', 'night', 'rain'] as const;

/** Effects whose loadout contribution is fully mapped (some, by design, at zero). */
const MODELLED_MECHANICS = new Set([
  'Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance','NPC Offers Bonus','Walkspeed',
  'Sunny','Nocturnal','Overcharged','Raindrop','Time Keeper','Connected',
  'Mutated Luck','Golden Hour','Drought Breaker','Club Pact','Temporal Split',
  'Auto X-Ray','Grade Re-Roll','Luck Frenzy','Featherweight','Second Chance','Steady Hand'
]);

const CONFIDENCE_VALUE:Record<AuthModelEntry['confidence'],number>={
  Unknown:.20, Low:.40, Medium:.65, High:.82, Empirical:.95
};

/** Roll-strength prior strength only; it never affects which effect is rolled. */
const PRIOR_STRENGTH=MODEL_ASSUMPTIONS.certificate.priorStrength;

export { gradeRerollExpectedValueGainPct, mutationLuckForItem, LUCKY_GRADING, mainAuctionUtility };

function outcomesFor(data:AppData,cert:OwnedCertificate,slot:Slot):CertificateOutcomeDefinition[] {
  return catalogueRowsFor(data.authModel,cert.type,slot).map(entry=>({
    effect:entry.outcome,
    slot:entry.slot,
    min:entry.min,
    typical:entry.typical,
    max:entry.max,
    confidence:CONFIDENCE_VALUE[entry.confidence],
    modeledMechanic:MODELLED_MECHANICS.has(entry.outcome),
    modelEntryId:entry.id
  }));
}

/** Equal probability across the canonical pool: 1 / number of outcomes, whatever the history. */
export function certificateOutcomeLikelihoods(_data:AppData,cert:OwnedCertificate,slot:Slot):Array<{effect:string;probability:number}> {
  const pool=currentPool(cert.type,slot);
  return pool.map(effect=>({effect,probability:1/pool.length}));
}

function rollMatchesCertificate(r:AppData['rollLog'][number],cert:OwnedCertificate):boolean {
  if(r.certificateInventoryType)return r.certificateInventoryType===cert.type;
  if(cert.type==='Wooden Certificate of Authenticity')return r.certificateType==='Normal Certificate of Authenticity';
  if(cert.type==='Premium Certificate of Authenticity')return r.certificateType==='Premium Certificate of Authenticity';
  if(cert.type==='Limited Certificate of Authenticity')return r.certificateType==='Limited Certificate of Authenticity';
  return false;
}

/** Only fully matching grade + mutation observations are exact evidence.
 * Unknown metadata has limited transferability; explicit mismatches are excluded.
 */
function evidenceWeight(roll:AppData['rollLog'][number],cert:OwnedCertificate):number {
  if(!rollMatchesCertificate(roll,cert))return 0;
  let weight=1;
  if(cert.gradeStars===undefined||roll.certificateGradeStars===undefined)weight*=.20;
  else if(cert.gradeStars!==roll.certificateGradeStars)return 0;
  const wanted=(cert.mutation??'').trim().toLowerCase();
  const observed=(roll.certificateMutation??'').trim().toLowerCase();
  if(wanted&&observed&&wanted!==observed)return 0;
  if(wanted!==observed)weight*=.20;
  return weight;
}

/** Remove roll-derived samples before treating a row as provenance-free legacy evidence.
 * Any rows aggregate every slot: even excluded grades/mutations and other slots
 * must be stripped here, then admitted only through evidenceWeight above.
 */
function modelOnlyObservations(row:AuthModelEntry,data:AppData):{values:number[];count:number} {
  const represented=data.rollLog.filter(r=>r.certificateType===row.certificateType&&
    (!row.certificateInventoryType||rollMatchesCertificate(r,{type:row.certificateInventoryType} as OwnedCertificate))&&
    (row.slot==='Any'||r.slot===row.slot)&&canonicalEffect(r.newAuthentication)===canonicalEffect(row.outcome));
  const values=(row.observedValues??[]).filter(Number.isFinite);
  for(const roll of represented){
    const index=values.findIndex(value=>Math.abs(value-roll.newValue)<1e-9);
    if(index>=0)values.splice(index,1);
  }
  return {values,count:Math.max(0,(row.observedSampleCount??0)-represented.length)};
}

function effectNeedsNumericMagnitude(effect:string):boolean {
  return ![
    'Mutated Luck','Golden Hour','Club Pact','Club Packed','Temporal Split',
    'Auto X-Ray','Featherweight','Second Chance','Steady Hand','Time Keeper',
    'Timekeeper','Connected','Walkspeed'
  ].includes(effect);
}

function normalizedPriorWeights(values:number[],min:number,max:number,typical?:number):number[] {
  if(typical===undefined||!Number.isFinite(typical)||typical<=min||typical>=max){
    return values.map(()=>1/values.length);
  }
  // Exact bin masses of the configured tent + .15 density, including bins
  // crossing an off-grid mode. Only utility evaluation uses midpoint nodes.
  const primitive=(value:number)=>value<=typical
    ?(value-min)**2/(2*(typical-min))
    :(typical-min)/2+(value-typical)-(value-typical)**2/(2*(max-typical));
  const width=(max-min)/values.length;
  const raw=values.map((_,i)=>.15*width+primitive(min+(i+1)*width)-primitive(min+i*width));
  const total=raw.reduce((a,b)=>a+b,0)||1;
  return raw.map(x=>x/total);
}

export function empiricalSupports(values:number[],mass:number):Array<{value:number;weight:number}> {
  if(!values.length||mass<=0)return [];
  // Aggregate equal values only: preserve every realised frequency and tail.
  const counts=new Map<number,number>();
  for(const value of values)counts.set(value,(counts.get(value)??0)+1);
  return [...counts].sort(([a],[b])=>a-b)
    .map(([value,count])=>({value,weight:mass*count/values.length}));
}

function rollSupports(def:CertificateOutcomeDefinition,data:AppData,slot:Slot,cert:OwnedCertificate):RollSupport[] {
  const relevant=data.rollLog
    .filter(r=>r.slot===slot&&canonicalEffect(r.newAuthentication)===def.effect&&rollMatchesCertificate(r,cert)&&Number.isFinite(r.newValue));
  const exact=relevant.filter(r=>evidenceWeight(r,cert)===1);
  const partial=relevant.filter(r=>evidenceWeight(r,cert)>0&&evidenceWeight(r,cert)<1);
  // Exact observations carry empirical mass. Incomplete metadata is a weak
  // sensitivity signal, not equivalent to an exact same-grade/mutation roll.
  const observed=exact.map(r=>r.newValue);
  const legacyEntry=data.authModel.find(m=>m.id===def.modelEntryId);
  const legacyValues=observed.length||cert.gradeStars!==undefined||Boolean(cert.mutation)
    ?[]:legacyEntry?modelOnlyObservations(legacyEntry,data).values:[];
  const fallbackValues=partial.map(r=>r.newValue).concat(legacyValues);

  const mechanicUnknown=!def.modeledMechanic;

  if(def.min!==undefined&&def.max!==undefined&&Number.isFinite(def.min)&&Number.isFinite(def.max)){
    const min=Math.min(def.min,def.max);
    const max=Math.max(def.min,def.max);
    // Real observations outside the configured range are model-conflict evidence,
    // not data to silently discard. Include them in the empirical support.
    const exactMass=observed.length/(PRIOR_STRENGTH+observed.length);
    const weakMass=exactMass>0?0:Math.min(.15,fallbackValues.length/(PRIOR_STRENGTH*8+fallbackValues.length));
    const empiricalMass=exactMass+weakMass;
    const priorMass=1-empiricalMass;

    // Midpoint quadrature represents a continuous prior without inventing atoms
    // at legal extrema. Uniform prior nodes each carry 1% of prior mass.
    const count=min===max?1:100;
    const priorValues=Array.from({length:count},(_,i)=>min+(max-min)*((i+.5)/count));
    const priorWeights=normalizedPriorWeights(priorValues,min,max,def.typical);
    const maxCellMass=min===max?0:priorMass*Math.max(...priorWeights);
    const prior:RollSupport[]=priorValues.map((value,i)=>({value,weight:priorMass*priorWeights[i],unresolved:mechanicUnknown,integrationCellMass:maxCellMass}));
    // Zero-weight endpoint evaluations bound the monotone utility variation in
    // each numeric effect. They are bounds, never endpoint probability atoms.
    if(min!==max)prior.push(...[min,max].map(value=>({value,weight:0,unresolved:mechanicUnknown,integrationCellMass:maxCellMass})));
    const empirical:RollSupport[]=[
      ...empiricalSupports(observed,exactMass),
      ...empiricalSupports(fallbackValues,weakMass)
    ].map(x=>({...x,unresolved:mechanicUnknown}));
    return [...prior,...empirical].filter(x=>x.weight>1e-12||Boolean(x.integrationCellMass));
  }

  if(observed.length||fallbackValues.length){
    // Observations without a configured/legal range are evidence about realised values,
    // not proof of the full roll distribution. Keep the branch unresolved.
    return empiricalSupports(observed.length?observed:fallbackValues,1).map(x=>({...x,unresolved:true}));
  }

  const kind=cert.type==='Premium Certificate of Authenticity'?'Premium':cert.type==='Limited Certificate of Authenticity'?'Limited':'Normal';
  const inventoryValues=data.gear
    .filter(g=>g.slot===slot&&g.authentication.kind===kind&&canonicalEffect(g.authentication.effect)===def.effect)
    .map(g=>g.authentication.value)
    .filter(v=>Number.isFinite(v)&&v!==0);
  if(inventoryValues.length){
    // Existing owned examples can inform plausible magnitude, but cannot establish
    // the complete future roll range on their own.
    const supports=empiricalSupports(inventoryValues,1);
    return supports.map(x=>({...x,unresolved:true}));
  }

  if(!effectNeedsNumericMagnitude(def.effect)&&def.modeledMechanic){
    return [{value:0,weight:1,unresolved:false}];
  }

  return [{
    value:0,
    weight:1,
    unresolved:true,
    label:def.modeledMechanic
      ?def.effect+' magnitude unresolved'
      :def.effect+' mechanic is not yet mapped into loadout utility'
  }];
}

function replaceAuthentication(item:GearItem,cert:OwnedCertificate,effect:string,value:number):GearItem {
  const kind=cert.type==='Limited Certificate of Authenticity'?'Limited':cert.type==='Premium Certificate of Authenticity'?'Premium':'Normal';
  return {...item,authenticated:true,authentication:{kind,effect,value}};
}


function pct(after:number|undefined,before:number|undefined):number {
  const a=after??0;
  const b=before??0;
  if(Math.abs(b)<1e-9)return a-b;
  return (a-b)/Math.abs(b)*100;
}

/** Moving nearer to or further from the Arrow band outranks any score change, so it is
 * the largest possible change, with its sign. At equal distance the change is the score change. */
export const ARROW_BAND_CHANGE_PCT=100;

function auctionChangePct(after:Loadout|undefined,before:Loadout|undefined):number {
  if(!after||!before)return after?ARROW_BAND_CHANGE_PCT:before?-ARROW_BAND_CHANGE_PCT:0;
  if(Math.abs(after.arrowDistance-before.arrowDistance)>1e-9)return after.arrowDistance<before.arrowDistance?ARROW_BAND_CHANGE_PCT:-ARROW_BAND_CHANGE_PCT;
  return pct(after.utility,before.utility);
}

/** A replacement changes only trios containing the target. Reuse the best unaffected
 * trio for each auction set instead of enumerating it for every roll value. */
function mergeLoadouts(a:Loadouts,b:Loadouts):Loadouts {
  const out:Loadouts={};
  for(const key of AUCTION_KEYS){
    const x=a[key],y=b[key];
    if(!x||!y){out[key]=x??y;continue;}
    const id=(v:Loadout)=>[v.head.id,v.back.id,v.wrist.id].join('|');
    // Same order as buildGearLoadouts: Arrow band distance, utility, robust Main score, IDs.
    const order=x.arrowDistance-y.arrowDistance||y.utility-x.utility||y.mainUtility-x.mainUtility||id(x).localeCompare(id(y));
    out[key]=order<=0?x:y;
  }
  return out;
}

function auctionOnly(loadouts:Loadouts):Loadouts {
  return {main:loadouts.main,day:loadouts.day,night:loadouts.night,rain:loadouts.rain};
}

function auctionLoadouts(gear:GearItem[],data:AppData,state:DynamicScenario):Loadouts {
  return auctionOnly(buildGearLoadouts(gear,{...data.settings,drinkPriority:0,gradingPriority:0,shopPriority:0},state));
}

interface StateOutcome {
  /** Signed change of the Neutral set (±100 when the Arrow band distance changes). */
  mainChange:number;
  /** Largest valid gain across Neutral, Day, Night and Rain (0 when none). */
  bestGain:number;
  bestContext:typeof AUCTION_KEYS[number];
  improves:boolean;
  worse:boolean;
}

/** One complete hypothetical: is the best re-optimised set better than doing nothing? */
function judge(before:Loadouts,after:Loadouts,data:AppData,eligible:boolean):StateOutcome {
  const tolerance=data.settings.mainMaterialLossPct;
  const main=auctionChangePct(after.main,before.main);
  // Neutral is the primary safeguard: never further from the band, never a material loss.
  const mainOK=Boolean(after.main&&before.main)&&after.main!.arrowDistance<=before.main!.arrowDistance+1e-9&&main>=-tolerance-1e-9;
  let bestGain=0,bestContext:StateOutcome['bestContext']='main',anyLower=false;
  for(const key of AUCTION_KEYS){
    const x=after[key],y=before[key];
    const change=auctionChangePct(x,y);
    if(change<-1e-4)anyLower=true;
    // A contextual gain counts only while that set stays as close to the band as before
    // (inside it whenever an in-band set exists, since sets rank by band distance first).
    const bandOK=Boolean(x&&y)&&x!.arrowDistance<=y!.arrowDistance+1e-9;
    if(bandOK&&change>bestGain+1e-12){bestGain=change;bestContext=key;}
  }
  const gain=bestGain>1e-4;
  return {
    mainChange:main,bestGain,bestContext,
    improves:eligible&&mainOK&&gain,
    worse:!mainOK||(!gain&&anyLower)
  };
}

type Branch = {
  p:number;
  effect:string;
  value:number;
  integrationGroup?:string;
  integrationCellMass:number;
  unresolved:boolean;
  potential:boolean;
  confidence:number;
  label:string;
  states?:Record<DynamicScenario,StateOutcome>;
  next?:Record<DynamicScenario,Loadouts>;
};

/** Monotone numeric effects: midpoint integration error is at most the largest cell mass
 * times the total variation of the integrand within each effect's prior. */
function integrationError(branches:Branch[],pick:(b:Branch)=>number):number {
  const groups=new Map<string,Branch[]>();
  for(const b of branches)if(b.integrationGroup&&!b.unresolved){
    const group=groups.get(b.integrationGroup)??[];group.push(b);groups.set(b.integrationGroup,group);
  }
  let error=0;
  for(const group of groups.values()){
    const values=group.map(pick);
    error+=Math.max(...group.map(b=>b.integrationCellMass))*(Math.max(...values)-Math.min(...values));
  }
  return error;
}

const NATIVE_STAT_LABEL:Record<string,string>={luck:'Luck',zone:'Bid Zone Width',energy:'Energy Drink Time',arrowReduction:'Bid Arrow',recovery:'Bid Recovery',tip:'Tip Chance',npc:'NPC Offers',walk:'Walkspeed',vehicle:'Vehicle'};

/** Focused targets the accessory's strongest native stat. Its exact boost is unresolved, so
 * only the target is reported, never an invented amount. */
export function focusedTarget(item:GearItem):{stat:keyof GearItem['stats'];label:string;value:number}|undefined {
  const entries=(Object.entries(item.stats) as Array<[keyof GearItem['stats'],number]>)
    .filter(([,value])=>value>0)
    .sort((a,b)=>b[1]-a[1]);
  if(!entries.length)return undefined;
  const [stat,value]=entries[0];
  return {stat,label:NATIVE_STAT_LABEL[stat]??stat,value};
}

function focusedHelps(item:GearItem,needArrow:boolean):boolean {
  const target=focusedTarget(item);
  return Boolean(target&&(['luck','zone','energy'].includes(target.stat)||(needArrow&&target.stat==='arrowReduction')));
}

/** Unresolved magnitudes are never valued at zero: a wanted one may help (upper bound). */
function unresolvedPotential(effect:string,item:GearItem,needArrow:boolean):boolean {
  if(isUnwanted(effect))return false;
  if(effect==='Focused')return focusedHelps(item,needArrow);
  return true;
}

function resultingLoadout(loadouts:Loadouts,key:typeof AUCTION_KEYS[number],data:AppData):ResultingLoadout|undefined {
  const l=loadouts[key];
  if(!l)return undefined;
  return {
    context:l.context??'Neutral',head:l.head,back:l.back,wrist:l.wrist,
    arrow:l.stats.arrowReduction,inBand:l.arrowDistance<=1e-9,
    luck:l.stats.luck,zone:l.stats.zone,energy:l.stats.energy
  };
}

function calculatedRanks(
  item:GearItem,cert:OwnedCertificate,pool:string[],needArrow:boolean,branches:Branch[]
):CalculatedRank[] {
  const family=certificateFamily(cert.type);
  const order=wantedEffects(family,item.slot,needArrow);
  const out:CalculatedRank[]=[];
  if(pool.includes('Focused')){
    const target=focusedTarget(item);
    const defaultRank=order.indexOf('Focused')+1||undefined;
    // Rank Focused where its target stat's own effect sits: dominant Luck (always-on) goes
    // first, Zone or Energy take that effect's place, anything else is not a wanted result.
    const calculatedRank=!target?undefined:target.stat==='luck'?1
      :target.stat==='zone'?order.indexOf('Bid Zone Width')+1||undefined
      :target.stat==='energy'?order.indexOf('Energy Drink Time')+1||undefined
      :target.stat==='arrowReduction'&&needArrow?1:undefined;
    out.push({
      effect:'Focused',defaultRank,calculatedRank,
      reason:target
        ?`Focused targets this item's strongest native stat: ${target.label} (+${Math.round(target.value*10)/10} native). The size of the boost is unresolved, so no amount is assumed.`
        :'This item has no positive native stat for Focused to boost.'
    });
  }
  if(pool.includes('Mutated Luck')){
    const branch=branches.find(b=>b.effect==='Mutated Luck'&&b.next);
    const main=branch?.next?.low.main;
    const contribution=main?[main.head,main.back,main.wrist].reduce((sum,g)=>sum+mutationLuckForItem(g),0):undefined;
    out.push({
      effect:'Mutated Luck',defaultRank:order.indexOf('Mutated Luck')+1||undefined,contribution,
      reason:main
        ?`Mutated Luck adds +${contribution} Luck from the mutations in the proposed trio (${[main.head,main.back,main.wrist].map(g=>(g.mutation||'none')).join(' / ')}).`
        :'Mutated Luck is calculated from the mutations on the equipped trio.'
    });
  }
  return out;
}

function targetDecision(data:AppData,cert:OwnedCertificate,item:GearItem,baselines:Baselines):CertificateTargetDecision|undefined {
  const base=baselines.low;
  if(!base.main)return undefined;
  const defs=outcomesFor(data,cert,item.slot);
  if(!defs.length)return undefined;
  const pool=defs.map(d=>d.effect);
  const p=1/pool.length;
  const needArrow=arrowNeeded(base.main.stats,data.settings);
  const family=certificateFamily(cert.type);

  // What the current authentication is worth: the item bare, with everything re-optimised.
  const bare={...item,authenticated:false,authentication:{kind:'None' as const,effect:'',value:0}};
  const without=auctionLoadouts(data.gear.map(g=>g.id===item.id?bare:g),data,'low');
  const currentValued=judge(base,without,data,false).worse;

  const unaffectedGear=data.gear.filter(g=>g.id!==item.id);
  const unaffected={} as Record<DynamicScenario,Loadouts>;
  for(const state of STATES)unaffected[state]=auctionLoadouts(unaffectedGear,data,state);
  const others=data.gear.filter(g=>g.slot!==item.slot);

  const branches:Branch[]=[];
  for(const def of defs){
    const eligible=!isUnwanted(def.effect);
    for(const support of rollSupports(def,data,item.slot,cert)){
      const branch:Branch={
        p:p*support.weight,effect:def.effect,value:support.value,
        integrationGroup:support.integrationCellMass?def.effect:undefined,
        integrationCellMass:p*(support.integrationCellMass??0),
        unresolved:support.unresolved,
        potential:support.unresolved&&unresolvedPotential(def.effect,item,needArrow),
        confidence:Math.max(.05,def.confidence-(cert.gradeStars!==undefined?.04:.08)-(support.unresolved?.15:0)),
        label:def.effect+(support.unresolved?' — '+(support.label??'strength unresolved'):support.value?' '+(Math.round(support.value*10)/10)+'%':'')
      };
      if(!support.unresolved){
        const updated=replaceAuthentication(item,cert,def.effect,support.value);
        const gear=others.concat(updated);
        const next={} as Record<DynamicScenario,Loadouts>;
        const states={} as Record<DynamicScenario,StateOutcome>;
        for(const state of STATES){
          next[state]=mergeLoadouts(unaffected[state],auctionLoadouts(gear,data,state));
          states[state]=judge(baselines[state],next[state],data,eligible);
        }
        branch.next=next;branch.states=states;
      }
      branches.push(branch);
    }
  }
  if(!branches.length)return undefined;
  const total=branches.reduce((s,b)=>s+b.p,0)||1;
  for(const b of branches){b.p/=total;b.integrationCellMass/=total;}

  const resolved=branches.filter(b=>!b.unresolved);
  const resolvedMass=resolved.reduce((s,b)=>s+b.p,0);
  const unresolvedMass=1-resolvedMass;
  const mass=(f:(b:Branch)=>boolean)=>Math.min(100,resolved.filter(f).reduce((s,b)=>s+b.p,0)*100);
  const err=(f:(b:Branch)=>boolean)=>100*integrationError(branches,b=>f(b)?1:0);
  const range=(f:(o:StateOutcome)=>number):StateRange=>({
    cautious:f2(o=>f(o),'low'),central:f2(o=>f(o),'central'),favourable:f2(o=>f(o),'high')
  });
  function f2(f:(o:StateOutcome)=>number,state:DynamicScenario){return resolvedMass>1e-12?resolved.reduce((s,b)=>s+b.p*f(b.states![state]),0)/resolvedMass:0;}

  const improve=(state:DynamicScenario)=>(b:Branch)=>Boolean(b.states?.[state].improves);
  const worse=(state:DynamicScenario)=>(b:Branch)=>Boolean(b.states?.[state].worse);
  const improveChancePct:StateRange={cautious:mass(improve('low')),central:mass(improve('central')),favourable:mass(improve('high'))};
  const improveChanceLowerPct:StateRange={
    cautious:Math.max(0,improveChancePct.cautious-err(improve('low'))),
    central:Math.max(0,improveChancePct.central-err(improve('central'))),
    favourable:Math.max(0,improveChancePct.favourable-err(improve('high')))
  };
  const worseChancePct:StateRange={cautious:mass(worse('low')),central:mass(worse('central')),favourable:mass(worse('high'))};
  const potentialMass=branches.filter(b=>b.unresolved&&b.potential).reduce((s,b)=>s+b.p,0)*100;
  const unresolvedAtRisk=currentValued?unresolvedMass*100:0;
  const worseChanceUpperPct=Math.min(100,worseChancePct.cautious+err(worse('low'))+unresolvedAtRisk);
  const improveChanceUpperPct=Math.min(100,Math.max(improveChancePct.cautious,improveChancePct.central,improveChancePct.favourable)+err(improve('high'))+potentialMass);
  const expectedMainChangePct=range(o=>o.mainChange);
  const expectedBestGainPct=range(o=>o.improves?o.bestGain:0);
  const numericalProbabilityErrorPct=Math.max(...STATES.flatMap(s=>[err(improve(s)),err(worse(s))]));

  const confidence=Math.max(0,Math.min(100,branches.reduce((s,b)=>s+b.p*b.confidence,0)*100*Math.max(.35,1-unresolvedMass*100/140)));

  const use=MODEL_ASSUMPTIONS.certificate.use, consider=MODEL_ASSUMPTIONS.certificate.consider;
  const safeInCautious=worseChanceUpperPct<=use.maxCautiousWorsePct&&expectedMainChangePct.cautious>=-data.settings.mainMaterialLossPct;
  let verdict:CertificateDecisionVerdict='HOLD';
  if(worseChanceUpperPct>=MODEL_ASSUMPTIONS.certificate.doNotUse.minCautiousWorsePct)verdict='DO NOT USE';
  // Always-on rolls give the same figure in every state, so they qualify on the cautious
  // result; state-dependent rolls may qualify on their favourable upside, but only while
  // the cautious state is safe. Central alone never makes a USE.
  else if(safeInCautious&&confidence>=use.minConfidencePct&&
    (improveChanceLowerPct.cautious>=use.minCautiousImprovePct||improveChanceLowerPct.favourable>=use.minFavourableImprovePct))verdict='USE';
  else if(worseChanceUpperPct<consider.maxCautiousWorsePct&&improveChanceUpperPct>=consider.minImprovePct&&
    (improveChancePct.favourable>0||potentialMass>0))verdict='CONSIDER';

  // Best roll: the outcome with the largest central gain; preference order breaks ties.
  let best:Branch|undefined;
  for(const b of resolved){
    if(!b.states?.central.improves)continue;
    const gain=b.states.central.bestGain;
    if(!best||gain>best.states!.central.bestGain+1e-9||
      (Math.abs(gain-best.states!.central.bestGain)<=1e-9&&preferenceOrder(family,item.slot,b.effect)<preferenceOrder(family,item.slot,best.effect)))best=b;
  }
  const bestState:'cautious'|'central'=best?.states!.low.improves?'cautious':'central';
  const bestLoadout=best?(bestState==='cautious'
    ?resultingLoadout(best.next!.low,best.states!.low.bestContext,data)
    :resultingLoadout(best.next!.central,best.states!.central.bestContext,data)):undefined;

  const existing=canonicalEffect(item.authentication.effect);
  const currentAuthentication=item.authenticated&&existing?{
    effect:existing,value:item.authentication.value,
    rank:preferenceRank(family,item.slot,existing,needArrow),
    calculated:CALCULATED_RANK_EFFECTS.has(existing)
  }:undefined;
  const wanted=wantedChance(cert.type,item.slot,needArrow)*100;
  const band=arrowTargetBand(data.settings);

  return {
    item,verdict,
    wantedChancePct:wanted,
    unwantedOutcomePct:pool.filter(isUnwanted).length/pool.length*100,
    arrowNeeded:needArrow,
    currentArrow:base.main.stats.arrowReduction,
    currentArrowInBand:base.main.arrowDistance<=1e-9,
    improveChancePct,improveChanceLowerPct,improveChanceUpperPct,
    worseChancePct,worseChanceUpperPct,safeInCautious,
    expectedMainChangePct,expectedBestGainPct,
    unresolvedOutcomeMassPct:unresolvedMass*100,
    unresolvedEffects:[...new Set(branches.filter(b=>b.unresolved).map(b=>b.effect))],
    numericalProbabilityErrorPct,
    outcomeLikelihoods:pool.map(effect=>({effect,probability:p})),
    outcomes:pool.map(effect=>{
      const own=resolved.filter(b=>b.effect===effect);
      const ownMass=own.reduce((sum,b)=>sum+b.p,0);
      const share=(state:DynamicScenario)=>ownMass>1e-12?Math.min(100,own.filter(b=>b.states![state].improves).reduce((sum,b)=>sum+b.p,0)/ownMass*100):0;
      return {
        effect,probability:p,
        wanted:wantedEffects(family,item.slot,needArrow).includes(effect),
        unresolved:branches.some(b=>b.effect===effect&&b.unresolved),
        improvePct:{cautious:share('low'),central:share('central'),favourable:share('high')},
        bestGainPct:Math.max(0,...own.map(b=>b.states!.central.improves?b.states!.central.bestGain:0))
      };
    }),
    confidencePct:confidence,
    currentAuthentication,
    bestRoll:best&&bestLoadout?{effect:best.effect,label:best.label,gainPct:best.states!.central.bestGain,loadout:bestLoadout,state:bestState,preference:preferenceOrder(family,item.slot,best.effect)}:undefined,
    calculatedRanks:calculatedRanks(item,cert,pool,needArrow,branches),
    reasons:[
      `Every one of the ${pool.length} possible outcomes is equally likely (${(p*100).toFixed(1)}% each).`,
      `Each roll is put back into the inventory and the Neutral, Day, Night and Rain sets are re-optimised with the ${band.min}–${band.max}% Bid Arrow band first.`,
      'A roll improves things only if a re-optimised set gains, every set stays as close to the Arrow band, and the Neutral set loses no more than '+data.settings.mainMaterialLossPct+'%.',
      'Cautious, central and favourable dynamic states are shown as a range; none of them is a claimed average.',
      item.authenticated?'Replaces the current authentication: '+(existing||'unspecified')+'.':'Clean target: no current authentication is lost.',
      unresolvedMass>1e-6?'Some outcome strengths are unresolved; they are kept out of the resolved figures and widen the range instead of counting as zero.':'Every outcome has a mapped strength.'
    ]
  };
}

/**
 * Conditional "Reroll Number": the effect is fixed and only its strength is redrawn,
 * compared with keeping the current roll. The current roll must be excluded from training.
 */
export function analyseConditionalNumberReroll(
  data:AppData,
  roll:AppData['rollLog'][number],
  cert:OwnedCertificate
):{improveChancePct:number;worseChancePct:number;worseChanceUpperPct:number;resolvedMassPct:number;unresolvedMassPct:number;modelNote:string}|undefined {
  if(algorithmIssues(data.settings).length)return undefined;
  const original=data.gear.find(g=>g.id===roll.itemId);
  if(!original)return undefined;
  const def=outcomesFor(data,cert,original.slot).find(d=>d.effect===canonicalEffect(roll.newAuthentication));
  if(!def)return undefined;
  const supports=rollSupports(def,data,original.slot,cert);
  if(!supports.length)return undefined;
  const baseline=auctionLoadouts(data.gear,data,'low');
  if(!baseline.main)return undefined;
  let resolvedMass=0,improve=0,worse=0,largestCell=0;
  const priorWorse:number[]=[];
  for(const support of supports){
    if(support.unresolved)continue;
    const hypothetical=replaceAuthentication(original,cert,def.effect,support.value);
    const result=judge(baseline,auctionLoadouts(data.gear.map(item=>item.id===original.id?hypothetical:item),data,'low'),data,!isUnwanted(def.effect));
    resolvedMass+=support.weight;
    if(result.improves)improve+=support.weight;
    if(result.worse)worse+=support.weight;
    if(support.integrationCellMass){largestCell=Math.max(largestCell,support.integrationCellMass);priorWorse.push(result.worse?1:0);}
  }
  // Midpoint quadrature can misplace at most one prior cell across the worse/not-worse edge.
  const error=priorWorse.length?largestCell*(Math.max(...priorWorse)-Math.min(...priorWorse)):0;
  return {
    improveChancePct:improve*100,worseChancePct:worse*100,worseChanceUpperPct:Math.min(100,(worse+error)*100),
    resolvedMassPct:resolvedMass*100,unresolvedMassPct:Math.max(0,1-resolvedMass)*100,
    modelNote:'Same authentication effect only, judged in the cautious state. The current roll is excluded from the strength model.'
  };
}

/** Verdict first, then the conservative central chance (ordering only), then the central
 * gain, then the preference order of the best roll; item IDs only break exact ties.
 * Certificate rarity or cost is never considered. */
export function compareCertificateTargets(a:CertificateTargetDecision,b:CertificateTargetDecision):number {
  const vr=(v:CertificateDecisionVerdict)=>({USE:0,CONSIDER:1,HOLD:2,'DO NOT USE':3}[v]);
  return vr(a.verdict)-vr(b.verdict)||
    b.improveChanceLowerPct.central-a.improveChanceLowerPct.central||
    b.expectedBestGainPct.central-a.expectedBestGainPct.central||
    (a.bestRoll?.preference??99)-(b.bestRoll?.preference??99)||
    a.worseChanceUpperPct-b.worseChanceUpperPct||
    a.item.id.localeCompare(b.item.id);
}

function baselinesFor(data:AppData):Baselines {
  return {low:auctionLoadouts(data.gear,data,'low'),central:auctionLoadouts(data.gear,data,'central'),high:auctionLoadouts(data.gear,data,'high')};
}

export function analyseCertificate(data:AppData,cert:OwnedCertificate,sharedBaselines?:Baselines,targetId?:string):OwnedCertificateDecision {
  if(algorithmIssues(data.settings).length)return {certificate:cert,verdict:'HOLD',targets:[],modelNotes:['Invalid algorithm settings: '+algorithmIssues(data.settings).join('; ')]};
  const baselines=sharedBaselines??baselinesFor(data);
  const targets=data.gear
    .filter(item=>!targetId||item.id===targetId)
    .map(item=>targetDecision(data,cert,item,baselines))
    .filter((x):x is CertificateTargetDecision=>Boolean(x))
    .sort(compareCertificateTargets);
  const recommendedTarget=targets[0];
  return {
    certificate:cert,
    verdict:recommendedTarget?.verdict??'HOLD',
    recommendedTarget,
    targets,
    modelNotes:[
      'Outcome pools are fixed game data; every outcome of a certificate on a slot is equally likely.',
      'Roll history only informs roll strength, never which effect is rolled.',
      'Every roll is judged by re-optimising the complete Head + Back + Wrist sets with the Arrow band first.',
      'HOLD is a first-class option with zero guaranteed change.'
    ]
  };
}

export function analyseOwnedCertificates(data:AppData):OwnedCertificateDecision[] {
  if(algorithmIssues(data.settings).length)return data.ownedCertificates.filter(c=>c.quantity>0).map(cert=>analyseCertificate(data,cert));
  const baselines=baselinesFor(data);
  const cache=new Map<string,OwnedCertificateDecision>();
  return data.ownedCertificates.filter(c=>c.quantity>0).map(cert=>{
    const catalogueSignature=data.authModel
      .filter(m=>m.certificateInventoryType===cert.type)
      .map(m=>[m.id,m.slot,m.outcome,m.min,m.typical,m.max,m.confidence,m.observedSampleCount].join(':'))
      .sort().join('|');
    const key=cert.type+'|'+String(cert.gradeStars??'')+'|'+String(cert.mutation??'')+'|'+catalogueSignature;
    const cached=cache.get(key);
    if(cached)return {...cached,certificate:cert};
    const decision=analyseCertificate(data,cert,baselines);
    cache.set(key,decision);
    return decision;
  });
}
