import type { AppData, AuthModelEntry, GearItem, OwnedCertificate, Slot } from '../types';
import {
  activeSpecialists,
  buildGearLoadouts,
  gradeRerollExpectedValueGainPct,
  LUCKY_GRADING,
  mainAuctionUtility,
  mutationLuckForItem
} from './gearLoadouts';
import { catalogueRowsFor } from './authModel';
import { algorithmIssues } from './settingsValidation';
import { MODEL_ASSUMPTIONS } from './modelAssumptions';

export type CertificateDecisionVerdict = 'USE' | 'CONSIDER' | 'HOLD' | 'DO NOT USE';

export interface CertificateOutcomeDefinition {
  effect: string;
  slot: Slot | 'Any';
  min?: number;
  typical?: number;
  max?: number;
  confidence: number;
  assumedLikelihoodClass: AuthModelEntry['assumedLikelihoodClass'];
  mainRelevant: boolean;
  specialist?: 'Drink Prep' | 'Grading' | 'Shop / Idle';
  note?: string;
  modeledMechanic: boolean;
  modelEntryId: string;
}

export interface CertificateConversionAdvice {
  diamondCost: number;
  recommendation: 'PREFER PREMIUM CONVERSION' | 'DIRECT USE COMPETITIVE' | 'HOLD / UNCERTAIN';
  directExpectedMainPct: number;
  premiumExpectedMainPct: number;
  premiumVerdict: CertificateDecisionVerdict;
  reason: string;
}

export interface CertificateTargetDecision {
  item: GearItem;
  verdict: CertificateDecisionVerdict;
  chanceOfImprovementPct: number;
  chanceOfPotentialImprovementPct: number;
  chanceOfMeaningfulImprovementPct: number;
  chanceOfAnyBenefitPct: number;
  chanceOfSecondaryImprovementPct: number;
  chanceOfWorsePct: number;
  chanceMainWorsePct: number;
  chancePotentialWorsePct: number;
  chanceDrinkPrepWorsePct: number;
  chanceGradingWorsePct: number;
  chanceShopWorsePct: number;
  chancePersonalPreferenceImprovesPct: number;
  chancePersonalPreferenceWorsePct: number;
  expectedPersonalPreferenceDelta: number;
  expectedPersonalPreferenceLowerBound: number;
  /** Null when any outcome is unresolved; other expected fields are conditional EV. */
  fullExpectedMainPct: number | null;
  fullMainLowerBoundPct: number;
  fullMainUpperBoundPct: number | null;
  expectedImprovementPct: number;
  expectedImprovementLowPct: number;
  expectedImprovementCentralPct: number;
  expectedImprovementHighPct: number;
  expectedContextualMainPct: number;
  expectedContextualMainLowerBoundPct: number;
  worstContextualMainPct: number;
  /** Absolute specialist utility points, with conservative integration bounds. */
  expectedDrinkPrepLowerBound: number;
  expectedGradingLowerBound: number;
  expectedShopLowerBound: number;
  expectedDrinkPrepPct: number;
  expectedGradingPct: number;
  expectedShopPct: number;
  averageGainWhenSuccessfulPct: number;
  averageLossWhenWorsePct: number;
  bestCasePct: number;
  worstCasePct: number;
  p10Pct: number;
  medianPct: number;
  p90Pct: number;
  currentAuthenticationValueAtRiskPct: number;
  currentAuthenticationMainRiskPct: number;
  currentAuthenticationContextRiskPct: number;
  currentAuthenticationDrinkRiskPct: number;
  currentAuthenticationGradingRiskPct: number;
  currentAuthenticationShopRiskPct: number;
  unresolvedOutcomeMassPct: number;
  resolvedOutcomeMassPct: number;
  outcomeLikelihoods: ReturnType<typeof certificateOutcomeLikelihoods>;
  /** Conservative continuous-prior integration uncertainty, in probability points. */
  numericalProbabilityErrorPct: number;
  numericalMainEvErrorPct: number;
  evidenceCoverage: ReturnType<typeof certificateEvidenceCoverage>;
  unresolvedEffects: string[];
  decisionBasis: 'Main Auction' | 'Contextual Main' | 'Main secondary preference' | 'Drink Prep' | 'Grading' | 'Shop / Idle' | 'None';
  /** Lower ranks first: Main, Day/Night/Rain, Main preference, then specialists in priority order. */
  goalRank: number;
  /** Conservative gain in the decision goal's own unit, comparable only within one goal. */
  goalGainLowerBound: number;
  /** Chance the decision goal improves versus the current authentication; null when unresolved outcomes prevent a full figure. */
  goalChancePct: number | null;
  /** Resolved-only lower bound of goalChancePct, including numerical integration error. */
  goalChanceLowerBoundPct: number;
  /** Upper bound of goalChancePct; null when unresolved outcomes prevent a finite bound below 100. */
  goalChanceUpperBoundPct: number | null;
  mainFitPct: number;
  confidencePct: number;
  bestPossibleOutcome: string;
  worstPossibleOutcome: string;
  reasons: string[];
}

export interface OwnedCertificateDecision {
  certificate: OwnedCertificate;
  verdict: CertificateDecisionVerdict;
  recommendedTarget?: CertificateTargetDecision;
  targets: CertificateTargetDecision[];
  modelNotes: string[];
  conversion?: CertificateConversionAdvice;
}

type RollSupport = {
  value:number;
  weight:number;
  unresolved:boolean;
  label?:string;
  /** Continuous-prior quadrature only; empirical samples never carry integration error. */
  integrationCellMass?:number;
};

type Branch = {
  p:number;
  integrationGroup?:string;
  integrationCellMass:number;
  delta:number;
  deltaCentral:number;
  deltaLow:number;
  deltaHigh:number;
  contextual:number;
  contextualWorst:number;
  contextualBest:number;
  drink:number;
  grading:number;
  shop:number;
  preferenceDelta:number;
  anyBenefit:boolean;
  unresolved:boolean;
  unresolvedMainPotential:boolean;
  unresolvedSecondaryPotential:boolean;
  confidence:number;
  label:string;
};

type OutcomeMeta = {
  mainRelevant:boolean;
  specialist?:CertificateOutcomeDefinition['specialist'];
  note?:string;
};

const TIER = { S:1, A:.8, B:.6, 'B-C':.5, C:.4, 'C-D':.3, D:.2, F:0 } as const;

export const USER_EFFECT_TIER: Record<string, keyof typeof TIER> = {
  'Luck':'S','Bid Recovery':'D','Bid Arrow Speed':'A','Bid Zone Width':'B','Energy Drink Time':'B-C',
  'Tip Chance':'C','NPC Offers Bonus':'C-D','Walkspeed':'F','Sunny':'B','Nocturnal':'B','Overcharged':'B',
  'Raindrop':'B','Focused':'A','Time Keeper':'F','Timekeeper':'F','Connected':'F','Mutated Luck':'C',
  'Droughtbreaker':'B','Drought Breaker':'B','Golden Hour':'B','Club Pact':'F','Club Packed':'F',
  'Temporal Split':'D','Auto X-Ray':'F','Grade Re-Roll':'C','Featherweight':'B','Luck Frenzy':'A',
  'Second Chance':'F','Steady Hand':'F','Safecracker':'D','Haggler':'F','Anti-Gravity Field':'B',
  'Exhibitor':'D','Rush':'D'
};

const OUTCOME_META:Record<string,OutcomeMeta>={
  Luck:{mainRelevant:true},
  'Bid Recovery':{mainRelevant:true},
  'Bid Arrow Speed':{mainRelevant:true},
  'Bid Zone Width':{mainRelevant:true},
  'Energy Drink Time':{mainRelevant:false,specialist:'Drink Prep'},
  'Tip Chance':{mainRelevant:false,specialist:'Shop / Idle'},
  'NPC Offers Bonus':{mainRelevant:false,specialist:'Shop / Idle'},
  Walkspeed:{mainRelevant:false},
  Sunny:{mainRelevant:false,note:'Day auction context only.'},
  Nocturnal:{mainRelevant:false,note:'Night auction context only.'},
  Overcharged:{mainRelevant:true,note:'Auction-time Energy Drink Luck amplification; evaluated in drink-active Main sensitivity states.'},
  Raindrop:{mainRelevant:false,note:'Rain auction context only.'},
  Focused:{mainRelevant:true,note:'Boosts the accessory strongest original stat; exact formula remains unresolved.'},
  'Time Keeper':{mainRelevant:false},
  Timekeeper:{mainRelevant:false},
  Connected:{mainRelevant:false},
  'Mutated Luck':{mainRelevant:true,note:'Calculated from mutations on the actual equipped trio.'},
  Droughtbreaker:{mainRelevant:true,note:'State is sensitivity-tested.'},
  'Drought Breaker':{mainRelevant:true,note:'State is sensitivity-tested.'},
  'Golden Hour':{mainRelevant:true,note:'State is sensitivity-tested.'},
  'Club Pact':{mainRelevant:false},
  'Club Packed':{mainRelevant:false},
  'Temporal Split':{mainRelevant:false},
  'Auto X-Ray':{mainRelevant:false},
  'Grade Re-Roll':{mainRelevant:false,specialist:'Grading'},
  Featherweight:{mainRelevant:false},
  'Luck Frenzy':{mainRelevant:true,note:'Magnitude is modelled; uptime remains sensitivity-tested.'},
  'Second Chance':{mainRelevant:false},
  'Steady Hand':{mainRelevant:false}
};

const CONFIDENCE_VALUE:Record<AuthModelEntry['confidence'],number>={
  Unknown:.20, Low:.40, Medium:.65, High:.82, Empirical:.95
};

const LIKELIHOOD_WEIGHT:Record<AuthModelEntry['assumedLikelihoodClass'],number>={
  'VERY HIGH':4,
  HIGH:2,
  MEDIUM:1,
  LOW:.5,
  'VERY LOW':.25
};

const PRIOR_STRENGTH=MODEL_ASSUMPTIONS.certificate.priorStrength;

export { gradeRerollExpectedValueGainPct, mutationLuckForItem, LUCKY_GRADING, mainAuctionUtility };

function authModelType(cert:OwnedCertificate):AuthModelEntry['certificateType'] {
  if(cert.type==='Premium Certificate of Authenticity')return 'Premium Certificate of Authenticity';
  if(cert.type==='Limited Certificate of Authenticity')return 'Limited Certificate of Authenticity';
  return 'Normal Certificate of Authenticity';
}

function outcomesFor(data:AppData,cert:OwnedCertificate,slot:Slot):CertificateOutcomeDefinition[] {
  const modelType=authModelType(cert);
  const exact=catalogueRowsFor(data.authModel,cert.type,slot);
  const legacyRaw=data.authModel.filter(m=>
    m.enabled &&
    !m.certificateInventoryType &&
    m.certificateType===modelType &&
    (m.slot==='Any'||m.slot===slot)
  );
  const legacyByEffect=new Map<string,AuthModelEntry>();
  for(const row of legacyRaw){
    const existing=legacyByEffect.get(row.outcome);
    if(!existing||(existing.slot==='Any'&&row.slot===slot))legacyByEffect.set(row.outcome,row);
  }
  const entries=exact.length?exact:[...legacyByEffect.values()];

  return entries.map(entry=>{
    const meta=OUTCOME_META[entry.outcome];
    return {
      effect:entry.outcome,
      slot:entry.slot,
      min:entry.min,
      typical:entry.typical,
      max:entry.max,
      confidence:CONFIDENCE_VALUE[entry.confidence],
      assumedLikelihoodClass:entry.assumedLikelihoodClass,
      mainRelevant:meta?.mainRelevant??false,
      specialist:meta?.specialist,
      note:meta?.note,
      modeledMechanic:Boolean(meta)&&entry.outcome!=='Focused',
      modelEntryId:entry.id
    };
  });
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
    (row.slot==='Any'||r.slot===row.slot)&&r.newAuthentication===row.outcome);
  const values=(row.observedValues??[]).filter(Number.isFinite);
  for(const roll of represented){
    const index=values.findIndex(value=>Math.abs(value-roll.newValue)<1e-9);
    if(index>=0)values.splice(index,1);
  }
  return {values,count:Math.max(0,(row.observedSampleCount??0)-represented.length)};
}

function observedEffectCounts(data:AppData,cert:OwnedCertificate,slot:Slot):Map<string,number> {
  const counts=new Map<string,number>();
  for(const r of data.rollLog){
    if(r.slot!==slot)continue;
    const weight=evidenceWeight(r,cert);
    if(weight>0)counts.set(r.newAuthentication,(counts.get(r.newAuthentication)??0)+weight);
  }
  // Historical model-only samples have no grade/mutation provenance. Include them
  // with low evidential weight and never add them twice to the matching rollLog.
  for(const row of catalogueRowsFor(data.authModel,cert.type,slot)){
    const existing=counts.get(row.outcome)??0;
    const modelOnly=modelOnlyObservations(row,data).count;
    counts.set(row.outcome,existing+Math.min(modelOnly,20)*.10);
  }
  return counts;
}

function outcomeProbabilities(defs:CertificateOutcomeDefinition[],counts:Map<string,number>,strength:number=MODEL_ASSUMPTIONS.certificate.outcomePriorStrength) {
  const priorTotal=defs.reduce((sum,def)=>sum+LIKELIHOOD_WEIGHT[def.assumedLikelihoodClass],0)||1;
  const weighted=defs.map(def=>({
    def,
    w:strength*LIKELIHOOD_WEIGHT[def.assumedLikelihoodClass]/priorTotal+(counts.get(def.effect)??0)
  }));
  const total=weighted.reduce((sum,x)=>sum+x.w,0)||1;
  return weighted.map(x=>({def:x.def,p:x.w/total}));
}

/** Diagnostic probabilities; these are model estimates, not published Roblox odds. */
export function certificateOutcomeLikelihoods(data:AppData,cert:OwnedCertificate,slot:Slot):Array<{effect:string;probability:number;minProbability:number;maxProbability:number}> {
  const defs=outcomesFor(data,cert,slot),counts=observedEffectCounts(data,cert,slot);
  const strength=MODEL_ASSUMPTIONS.certificate.outcomePriorStrength;
  const weak=outcomeProbabilities(defs,counts,strength/2);
  const strong=outcomeProbabilities(defs,counts,strength*2);
  return outcomeProbabilities(defs,counts).map(({def,p},i)=>({
    effect:def.effect,probability:p,
    minProbability:Math.min(p,weak[i].p,strong[i].p),
    maxProbability:Math.max(p,weak[i].p,strong[i].p)
  }));
}

export function certificateEvidenceCoverage(data:AppData,cert:OwnedCertificate,slot:Slot):{exact:number;partial:number;excluded:number} {
  const relevant=data.rollLog.filter(r=>r.slot===slot&&rollMatchesCertificate(r,cert));
  return {
    exact:relevant.filter(r=>evidenceWeight(r,cert)===1).length,
    partial:relevant.filter(r=>evidenceWeight(r,cert)>0&&evidenceWeight(r,cert)<1).length,
    excluded:relevant.filter(r=>evidenceWeight(r,cert)===0).length
  };
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
    .filter(r=>r.slot===slot&&r.newAuthentication===def.effect&&rollMatchesCertificate(r,cert)&&Number.isFinite(r.newValue));
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
    .filter(g=>g.slot===slot&&g.authentication.kind===kind&&g.authentication.effect===def.effect)
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

/** Specialist metrics already have meaningful native units: energy duration
 * points, expected grading-value points, and weighted shop points. Absolute
 * changes stay continuous at zero and comparable across candidate outcomes.
 * The legacy API field suffix Pct is retained for persisted/UI compatibility.
 */
export function specialistUtilityDelta(after:number|undefined,before:number|undefined):number {
  return (after??0)-(before??0);
}

function riskPct(before:number|undefined,after:number|undefined):number {
  if(before===undefined||before<=1e-9)return 0;
  const a=after??0;
  return Math.max(0,(before-a)/Math.abs(before)*100);
}

function contextualDeltas(before:ReturnType<typeof buildGearLoadouts>,after:ReturnType<typeof buildGearLoadouts>):number[] {
  return (['day','night','rain'] as const).map(k=>pct(after[k]?.utility,before[k]?.utility));
}

function bestMainContaining(data:AppData,item:GearItem):number|undefined {
  const heads=data.gear.filter(g=>g.slot==='Head');
  const backs=data.gear.filter(g=>g.slot==='Back');
  const wrists=data.gear.filter(g=>g.slot==='Wrist');
  let best=-Infinity;
  for(const h of heads)for(const b of backs)for(const w of wrists){
    const trio=[h,b,w];
    if(!trio.some(x=>x.id===item.id))continue;
    best=Math.max(best,mainAuctionUtility(trio,data.settings,'Neutral','low'));
  }
  return Number.isFinite(best)?best:undefined;
}

function percentile(values:Array<{x:number;p:number}>,q:number):number {
  const sorted=[...values].sort((a,b)=>a.x-b.x);
  let c=0;
  for(const v of sorted){
    c+=v.p;
    if(c+1e-12>=q)return v.x;
  }
  return sorted.at(-1)?.x??0;
}

function focusedPotential(item:GearItem):{main:boolean;secondary:boolean} {
  const entries=(Object.entries(item.stats) as Array<[keyof GearItem['stats'],number]>)
    .filter(([,value])=>value>0)
    .sort((a,b)=>b[1]-a[1]);
  if(!entries.length)return {main:false,secondary:false};
  const key=entries[0][0];
  return {
    main:['luck','arrowReduction','zone','recovery'].includes(key),
    secondary:['energy','tip','npc'].includes(key)
  };
}

function unresolvedPotential(effect:string,item:GearItem,modeledMechanic:boolean):{main:boolean;secondary:boolean} {
  if(effect==='Luck')return {main:true,secondary:false};
  if(effect==='Focused')return focusedPotential(item);
  if(!modeledMechanic)return {main:true,secondary:true};
  const meta=OUTCOME_META[effect];
  return {
    main:Boolean(meta?.mainRelevant||['Sunny','Nocturnal','Raindrop'].includes(effect)),
    secondary:Boolean(meta?.specialist)
  };
}

function effectTierValue(effect:string):number {
  const tier=USER_EFFECT_TIER[effect];
  return tier ? TIER[tier] : 0;
}

function loadoutUsesItem(loadout:ReturnType<typeof buildGearLoadouts>['main'],itemId:string):boolean {
  return Boolean(loadout&&[loadout.head.id,loadout.back.id,loadout.wrist.id].includes(itemId));
}

/** A replacement changes only trios containing the target. Reuse the best
 * unaffected trio for each loadout instead of enumerating it for every prior node. */
function mergeLoadouts(a:ReturnType<typeof buildGearLoadouts>,b:ReturnType<typeof buildGearLoadouts>):ReturnType<typeof buildGearLoadouts> {
  const out:ReturnType<typeof buildGearLoadouts>={};
  for(const key of ['main','day','night','rain','drink','grading','shop'] as const){
    const x=a[key],y=b[key];
    if(!x||!y){out[key]=x??y;continue;}
    const id=(v:typeof x)=>[v.head.id,v.back.id,v.wrist.id].join('|');
    const order=y.utility-x.utility||y.mainUtility-x.mainUtility||id(x).localeCompare(id(y));
    const best=order<=0?x:y;
    out[key]=Math.abs(x.utility-y.utility)<=1e-9&&Math.abs(x.mainUtility-y.mainUtility)<=1e-9
      ?{...best,tiedItemIds:new Set([...x.tiedItemIds,...y.tiedItemIds])}:best;
  }
  return out;
}

/** Each mapped numeric effect is nondecreasing in its magnitude, including
 * re-optimisation (maximum of monotone loadouts) and robust state minima.
 * For monotone f, midpoint integration error is bounded by largest cell mass
 * times total variation. Indicator probabilities have variation at most one.
 * Empirical atoms are excluded from this bound and keep their exact mass.
 */
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

function targetDecision(
  data:AppData,
  cert:OwnedCertificate,
  item:GearItem,
  baselines:Record<'low'|'central'|'high',ReturnType<typeof buildGearLoadouts>>
):CertificateTargetDecision|undefined {
  const baseline=baselines.low;
  if(!baseline.main||baseline.main.utility<=1e-9)return undefined;

  const defs=outcomesFor(data,cert,item.slot);
  if(!defs.length)return undefined;

  const containing=bestMainContaining(data,item);
  const bare={...item,authenticated:false,authentication:{kind:'None' as const,effect:'',value:0}};
  const withoutGear=data.gear.map(g=>g.id===item.id?bare:g);
  const without=buildGearLoadouts(withoutGear,data.settings,'low');

  const mainRisk=riskPct(baseline.main?.utility,without.main?.utility);
  const contextRisk=Math.max(
    riskPct(baseline.day?.utility,without.day?.utility),
    riskPct(baseline.night?.utility,without.night?.utility),
    riskPct(baseline.rain?.utility,without.rain?.utility)
  );
  const drinkRisk=riskPct(baseline.drink?.utility,without.drink?.utility);
  const gradingRisk=riskPct(baseline.grading?.utility,without.grading?.utility);
  const shopRisk=riskPct(baseline.shop?.utility,without.shop?.utility);
  const authRisk=Math.max(mainRisk,contextRisk,drinkRisk,gradingRisk,shopRisk);

  const unaffectedGear=data.gear.filter(g=>g.id!==item.id);
  const unaffected={low:buildGearLoadouts(unaffectedGear,data.settings,'low'),central:buildGearLoadouts(unaffectedGear,data.settings,'central'),high:buildGearLoadouts(unaffectedGear,data.settings,'high')};
  const probs=outcomeProbabilities(defs,observedEffectCounts(data,cert,item.slot));
  const branches:Branch[]=[];
  const baselineUsesTarget=loadoutUsesItem(baseline.main,item.id);
  const baselinePreference=baselineUsesTarget?effectTierValue(item.authentication.effect.trim()):0;
  const unresolvedEffects=new Set<string>();

  for(const {def,p} of probs){
    const supports=rollSupports(def,data,item.slot,cert);
    for(const support of supports){
      const updated=replaceAuthentication(item,cert,def.effect,support.value);
      const gear=data.gear.filter(g=>g.slot!==item.slot).concat(updated);
      const nextLow=mergeLoadouts(unaffected.low,buildGearLoadouts(gear,data.settings,'low'));
      const nextCentral=mergeLoadouts(unaffected.central,buildGearLoadouts(gear,data.settings,'central'));
      const nextHigh=mergeLoadouts(unaffected.high,buildGearLoadouts(gear,data.settings,'high'));

      const mainDeltas=[
        pct(nextLow.main?.utility,baselines.low.main?.utility),
        pct(nextCentral.main?.utility,baselines.central.main?.utility),
        pct(nextHigh.main?.utility,baselines.high.main?.utility)
      ];
      const delta=mainDeltas[0];
      const deltaCentral=mainDeltas[1];
      const deltaLow=Math.min(...mainDeltas);
      const deltaHigh=Math.max(...mainDeltas);

      const contextAll=[
        ...contextualDeltas(baselines.low,nextLow),
        ...contextualDeltas(baselines.central,nextCentral),
        ...contextualDeltas(baselines.high,nextHigh)
      ];
      const robustContext=contextualDeltas(baselines.low,nextLow);
      const contextual=robustContext.reduce((sum,x)=>sum+x,0)/robustContext.length;
      const contextualWorst=Math.min(...contextAll);
      const contextualBest=Math.max(...contextAll);

      const drink=specialistUtilityDelta(nextLow.drink?.utility,baseline.drink?.utility);
      const grading=specialistUtilityDelta(nextLow.grading?.utility,baseline.grading?.utility);
      const shop=specialistUtilityDelta(nextLow.shop?.utility,baseline.shop?.utility);
      const nextUsesTarget=loadoutUsesItem(nextLow.main,item.id);
      const preferenceDelta=!support.unresolved&&nextUsesTarget
        ?effectTierValue(def.effect)-baselinePreference
        :0;
      const potential=support.unresolved
        ?unresolvedPotential(def.effect,item,def.modeledMechanic)
        :{main:false,secondary:false};
      if(support.unresolved)unresolvedEffects.add(def.effect);

      const anyBenefit=
        deltaHigh>1e-4||
        contextualBest>1e-4||
        drink>1e-4||
        grading>1e-4||
        shop>1e-4||
        potential.main||
        potential.secondary;

      const gradePenalty=cert.gradeStars!==undefined ? .04 : .08;
      branches.push({
        p:p*support.weight,
        integrationGroup:support.integrationCellMass?def.effect:undefined,
        integrationCellMass:p*(support.integrationCellMass??0),
        delta,deltaCentral,deltaLow,deltaHigh,contextual,contextualWorst,contextualBest,drink,grading,shop,preferenceDelta,anyBenefit,
        unresolved:support.unresolved,
        unresolvedMainPotential:potential.main,
        unresolvedSecondaryPotential:potential.secondary,
        confidence:Math.max(.05,def.confidence-gradePenalty-(support.unresolved?.15:0)),
        label:def.effect+(support.unresolved?' — '+(support.label??'unresolved'):support.value?' '+support.value.toFixed(1)+'%':'')
      });
    }
  }

  if(!branches.length)return undefined;

  const total=branches.reduce((s,b)=>s+b.p,0)||1;
  for(const b of branches){b.p/=total;b.integrationCellMass/=total;}

  const resolved=branches.filter(b=>!b.unresolved);
  const resolvedMass=resolved.reduce((sum,b)=>sum+b.p,0);
  const robustImprove=resolved.filter(b=>b.deltaLow>1e-4);
  const potentialImprove=branches.filter(b=>b.deltaHigh>1e-4||b.unresolvedMainPotential);
  const meaningful=resolved.filter(b=>b.deltaLow>=1);
  const mainWorse=resolved.filter(b=>b.deltaLow<-1e-4||b.contextualWorst<-1e-4);
  const drinkWorse=resolved.filter(b=>b.drink<-1e-4);
  const gradingWorse=resolved.filter(b=>b.grading<-1e-4);
  const shopWorse=resolved.filter(b=>b.shop<-1e-4);
  const preferenceImprove=resolved.filter(b=>b.preferenceDelta>1e-9);
  const preferenceWorse=resolved.filter(b=>b.preferenceDelta<-1e-9);
  const anyWorse=resolved.filter(b=>Math.min(b.deltaLow,b.contextualWorst,b.drink,b.grading,b.shop)<-1e-4);
  const unresolvedAtRisk=branches.filter(b=>b.unresolved&&authRisk>1e-9);
  const secondary=branches.filter(b=>
    Math.max(b.contextualBest,b.drink,b.grading,b.shop)>1e-4||
    b.unresolvedSecondaryPotential
  );

  const chance=robustImprove.reduce((sum,b)=>sum+b.p,0)*100;
  const potentialChance=potentialImprove.reduce((sum,b)=>sum+b.p,0)*100;
  const meaningfulChance=meaningful.reduce((sum,b)=>sum+b.p,0)*100;
  const any=branches.filter(b=>b.anyBenefit).reduce((sum,b)=>sum+b.p,0)*100;
  const secondaryChance=secondary.reduce((sum,b)=>sum+b.p,0)*100;
  const chanceWorse=anyWorse.reduce((sum,b)=>sum+b.p,0)*100;
  const chanceMainWorse=mainWorse.reduce((sum,b)=>sum+b.p,0)*100;
  const chancePotentialWorse=Math.min(100,chanceWorse+unresolvedAtRisk.reduce((sum,b)=>sum+b.p,0)*100);
  const chanceDrinkWorse=drinkWorse.reduce((sum,b)=>sum+b.p,0)*100;
  const chanceGradingWorse=gradingWorse.reduce((sum,b)=>sum+b.p,0)*100;
  const chanceShopWorse=shopWorse.reduce((sum,b)=>sum+b.p,0)*100;
  const chancePreferenceImprove=preferenceImprove.reduce((sum,b)=>sum+b.p,0)*100;
  const chancePreferenceWorse=preferenceWorse.reduce((sum,b)=>sum+b.p,0)*100;
  const unresolvedMass=branches.filter(b=>b.unresolved).reduce((sum,b)=>sum+b.p,0)*100;

  const resolvedExpected=(pick:(b:Branch)=>number)=>resolvedMass>1e-12
    ?resolved.reduce((sum,b)=>sum+b.p*pick(b),0)/resolvedMass
    :0;
  // Unresolved branches are deliberately excluded instead of being assigned a fake zero value.
  const expected=resolvedExpected(b=>b.delta);
  const expectedLow=resolvedExpected(b=>b.deltaLow);
  const expectedCentral=resolvedExpected(b=>b.deltaCentral);
  const expectedHigh=resolvedExpected(b=>b.deltaHigh);
  const expectedContextual=resolvedExpected(b=>b.contextual);
  const worstContextual=resolvedExpected(b=>b.contextualWorst);
  const expectedDrink=resolvedExpected(b=>b.drink);
  const expectedGrading=resolvedExpected(b=>b.grading);
  const expectedShop=resolvedExpected(b=>b.shop);
  const expectedPreference=resolvedExpected(b=>b.preferenceDelta);

  const robustImproveMass=robustImprove.reduce((sum,b)=>sum+b.p,0);
  const anyWorseMass=anyWorse.reduce((sum,b)=>sum+b.p,0);
  const avgGain=robustImproveMass>1e-12
    ?robustImprove.reduce((sum,b)=>sum+b.p*b.deltaLow,0)/robustImproveMass
    :0;
  const avgLoss=anyWorseMass>1e-12
    ?anyWorse.reduce((sum,b)=>sum+b.p*Math.min(b.deltaLow,b.contextualWorst),0)/anyWorseMass
    :0;
  const numericBranches=resolved.length?resolved:[];
  const best=numericBranches.length?numericBranches.reduce((a,b)=>b.deltaHigh>a.deltaHigh?b:a,numericBranches[0]):undefined;
  const worst=numericBranches.length?numericBranches.reduce((a,b)=>
    Math.min(b.deltaLow,b.contextualWorst)<Math.min(a.deltaLow,a.contextualWorst)?b:a,
    numericBranches[0]
  ):undefined;

  let confidence=branches.reduce((sum,b)=>sum+b.p*b.confidence,0)*100;
  if(cert.type==='Wooden Certificate of Authenticity'||cert.type==='Ripped Certificate of Authenticity')confidence*=.72;
  if(cert.type==='Limited Certificate of Authenticity')confidence*=.85;
  if(cert.type==='Premium Certificate of Authenticity')confidence*=.80;
  confidence*=Math.max(.35,1-unresolvedMass/140);

  const specialists=activeSpecialists(data.settings);
  const mainFit=containing!==undefined?Math.max(0,containing/baseline.main.utility*100):0;
  const rare=cert.type==='Limited Certificate of Authenticity'||cert.type==='Premium Certificate of Authenticity';
  let verdict:CertificateDecisionVerdict='HOLD';
  let decisionBasis:CertificateTargetDecision['decisionBasis']='None';

  const evError=(pick:(b:Branch)=>number)=>resolvedMass>1e-12?integrationError(branches,pick)/resolvedMass:0;
  const probabilityError=(predicate:(b:Branch)=>boolean)=>100*integrationError(branches,b=>predicate(b)?1:0);
  const mainEvError=evError(b=>b.deltaLow);
  const conservativeExpectedLow=expectedLow-mainEvError;
  const conservativeExpected=expected-evError(b=>b.delta);
  const conservativeContext=expectedContextual-evError(b=>b.contextual);
  const conservativeChance=chance-probabilityError(b=>b.deltaLow>1e-4);
  const conservativePotential=potentialChance-probabilityError(b=>b.deltaHigh>1e-4||b.unresolvedMainPotential);
  const mainWorseUpper=chanceMainWorse+probabilityError(b=>b.deltaLow<-1e-4||b.contextualWorst<-1e-4);
  const potentialWorseUpper=chancePotentialWorse+probabilityError(b=>Math.min(b.deltaLow,b.contextualWorst,b.drink,b.grading,b.shop)<-1e-4);
  const numericalProbabilityErrorPct=Math.max(
    probabilityError(b=>b.deltaLow<-1e-4||b.contextualWorst<-1e-4),
    probabilityError(b=>Math.min(b.deltaLow,b.contextualWorst,b.drink,b.grading,b.shop)<-1e-4),
    probabilityError(b=>b.deltaLow>1e-4),
    probabilityError(b=>b.deltaHigh>1e-4),
    probabilityError(b=>b.drink>1e-4),probabilityError(b=>b.grading>1e-4),probabilityError(b=>b.shop>1e-4),
    probabilityError(b=>b.preferenceDelta>1e-9),probabilityError(b=>b.preferenceDelta<-1e-9)
  );
  const mainBlocked=conservativeExpectedLow<-.5||mainWorseUpper>=55;
  const usePolicy=MODEL_ASSUMPTIONS.certificate.use;
  const considerPolicy=MODEL_ASSUMPTIONS.certificate.consider;
  const mainUse=conservativeExpectedLow>(rare?usePolicy.rareMinWorstStateEvPct:usePolicy.normalMinWorstStateEvPct)&&
    conservativeChance>=(rare?usePolicy.rareMinImproveChancePct:usePolicy.normalMinImproveChancePct)&&
    mainWorseUpper<=usePolicy.maxMainWorsePct&&confidence>=usePolicy.minConfidencePct;
  const mainConsider=conservativeExpected>considerPolicy.minResolvedEvPct&&
    conservativePotential>=considerPolicy.minPotentialImproveChancePct&&
    mainWorseUpper<considerPolicy.maxMainWorsePct;
  const contextualConsider=conservativeExpected>=-.05&&conservativeContext>=1&&mainWorseUpper<30;

  if(unresolvedMass>1e-6){
    if(!mainBlocked&&conservativeExpectedLow>.5&&conservativeChance>=25&&potentialWorseUpper<30){
      verdict='CONSIDER';decisionBasis='Main Auction';
    }else if(!mainBlocked&&conservativeExpected>=-.05&&conservativeContext>=1&&potentialWorseUpper<25){
      verdict='CONSIDER';decisionBasis='Contextual Main';
    }else{
      verdict='HOLD';
    }
  }else if(mainBlocked){
    verdict='DO NOT USE';decisionBasis='Main Auction';
  }else if(mainUse){
    verdict='USE';decisionBasis='Main Auction';
  }else if(mainConsider){
    verdict='CONSIDER';decisionBasis='Main Auction';
  }else if(contextualConsider){
    verdict='CONSIDER';decisionBasis='Contextual Main';
  }else if(
    mainFit>=95 &&
    expectedPreference-evError(b=>b.preferenceDelta)>=0.20 &&
    chancePreferenceImprove-probabilityError(b=>b.preferenceDelta>1e-9)>=40 &&
    chancePreferenceWorse+probabilityError(b=>b.preferenceDelta<-1e-9)<20
  ){
    // Personal effect tiers are an ordinal secondary preference only. They can support
    // a Main-competitive item, but never override a weaker Main Auction result.
    verdict='CONSIDER';decisionBasis='Main secondary preference';
  }else{
    // Main is neutral: only now may specialist value matter. Specialists are lexicographic,
    // not pooled, in the user's priority order (default Drink Prep -> Grading -> Shop / Idle).
    // A lower priority can win only when every higher-priority specialist is neutral.
    const specialistPolicy=MODEL_ASSUMPTIONS.certificate.specialist;
    const specialistSignal=(minGain:number,ev:number,improve:(b:Branch)=>boolean,worseChance:number)=>
      ev>=minGain&&resolved.filter(improve).reduce((sum,b)=>sum+b.p,0)*100-probabilityError(improve)>=40&&worseChance<20;
    const neutral=(ev:number,worseChance:number,error:number)=>Math.abs(ev)+error<specialistPolicy.neutralTolerancePoints&&worseChance<10;
    const specialistMetric={
      'Drink Prep':{pick:(b:Branch)=>b.drink,expected:expectedDrink,worse:chanceDrinkWorse,minGain:specialistPolicy.drinkMinGainPoints},
      Grading:{pick:(b:Branch)=>b.grading,expected:expectedGrading,worse:chanceGradingWorse,minGain:specialistPolicy.gradingMinGainPoints},
      'Shop / Idle':{pick:(b:Branch)=>b.shop,expected:expectedShop,worse:chanceShopWorse,minGain:specialistPolicy.shopMinGainPoints}
    } as const;
    for(const name of specialists){
      const metric=specialistMetric[name];
      const worse=metric.worse+probabilityError(b=>metric.pick(b)<-1e-4);
      if(specialistSignal(metric.minGain,metric.expected-evError(metric.pick),b=>metric.pick(b)>1e-4,worse)){
        verdict='CONSIDER';decisionBasis=name;break;
      }
      if(!neutral(metric.expected,worse,evError(metric.pick)))break;
    }
  }

  const existing=item.authentication.effect.trim();
  if(item.authenticated&&['Focused','Mutated Luck','Droughtbreaker','Drought Breaker','Golden Hour','Luck Frenzy'].includes(existing)&&verdict==='USE'){
    verdict='CONSIDER';
    confidence=Math.min(confidence,55);
  }

  // The decision goal decides which improvement is measured and how targets compare.
  const goal=goalMeasure(decisionBasis,specialists,{
    main:[b=>b.deltaLow,expectedLow],
    context:[b=>b.contextual,expectedContextual-evError(b=>b.contextual)],
    preference:[b=>b.preferenceDelta,expectedPreference-evError(b=>b.preferenceDelta)],
    drink:[b=>b.drink,expectedDrink-evError(b=>b.drink)],
    grading:[b=>b.grading,expectedGrading-evError(b=>b.grading)],
    shop:[b=>b.shop,expectedShop-evError(b=>b.shop)]
  });
  const goalImproves=(b:Branch)=>goal.pick(b)>(decisionBasis==='Main secondary preference'?1e-9:1e-4);
  const goalResolvedChance=resolved.filter(goalImproves).reduce((sum,b)=>sum+b.p,0)*100;
  const goalError=probabilityError(goalImproves);
  const goalComplete=unresolvedMass<=1e-6;

  return {
    item,verdict,
    chanceOfImprovementPct:chance,
    chanceOfPotentialImprovementPct:potentialChance,
    chanceOfMeaningfulImprovementPct:meaningfulChance,
    chanceOfAnyBenefitPct:any,
    chanceOfSecondaryImprovementPct:secondaryChance,
    chanceOfWorsePct:chanceWorse,
    chanceMainWorsePct:chanceMainWorse,
    chancePotentialWorsePct:chancePotentialWorse,
    chanceDrinkPrepWorsePct:chanceDrinkWorse,
    chanceGradingWorsePct:chanceGradingWorse,
    chanceShopWorsePct:chanceShopWorse,
    chancePersonalPreferenceImprovesPct:chancePreferenceImprove,
    chancePersonalPreferenceWorsePct:chancePreferenceWorse,
    expectedPersonalPreferenceDelta:expectedPreference,
    expectedPersonalPreferenceLowerBound:expectedPreference-evError(b=>b.preferenceDelta),
    fullExpectedMainPct:unresolvedMass>1e-6?null:expected,
    fullMainLowerBoundPct:(expected-evError(b=>b.delta))*resolvedMass-unresolvedMass,
    fullMainUpperBoundPct:unresolvedMass>1e-6?null:expected+evError(b=>b.delta),
    expectedImprovementPct:expected,
    expectedImprovementLowPct:expectedLow,
    expectedImprovementCentralPct:expectedCentral,
    expectedImprovementHighPct:expectedHigh,
    expectedContextualMainPct:expectedContextual,
    expectedContextualMainLowerBoundPct:expectedContextual-evError(b=>b.contextual),
    worstContextualMainPct:worstContextual,
    expectedDrinkPrepLowerBound:expectedDrink-evError(b=>b.drink),
    expectedGradingLowerBound:expectedGrading-evError(b=>b.grading),
    expectedShopLowerBound:expectedShop-evError(b=>b.shop),
    expectedDrinkPrepPct:expectedDrink,
    expectedGradingPct:expectedGrading,
    expectedShopPct:expectedShop,
    averageGainWhenSuccessfulPct:avgGain,
    averageLossWhenWorsePct:avgLoss,
    bestCasePct:best?.deltaHigh??0,
    worstCasePct:worst?Math.min(worst.deltaLow,worst.contextualWorst):0,
    p10Pct:numericBranches.length?percentile(numericBranches.map(b=>({x:b.delta,p:b.p/resolvedMass})),.10):0,
    medianPct:numericBranches.length?percentile(numericBranches.map(b=>({x:b.delta,p:b.p/resolvedMass})),.50):0,
    p90Pct:numericBranches.length?percentile(numericBranches.map(b=>({x:b.delta,p:b.p/resolvedMass})),.90):0,
    currentAuthenticationValueAtRiskPct:authRisk,
    currentAuthenticationMainRiskPct:mainRisk,
    currentAuthenticationContextRiskPct:contextRisk,
    currentAuthenticationDrinkRiskPct:drinkRisk,
    currentAuthenticationGradingRiskPct:gradingRisk,
    currentAuthenticationShopRiskPct:shopRisk,
    unresolvedOutcomeMassPct:unresolvedMass,
    resolvedOutcomeMassPct:resolvedMass*100,
    outcomeLikelihoods:certificateOutcomeLikelihoods(data,cert,item.slot),
    numericalProbabilityErrorPct,
    numericalMainEvErrorPct:Math.max(mainEvError,evError(b=>b.delta)),
    evidenceCoverage:certificateEvidenceCoverage(data,cert,item.slot),
    unresolvedEffects:[...unresolvedEffects],
    decisionBasis,
    goalRank:goal.rank,
    goalGainLowerBound:goal.gain,
    goalChancePct:decisionBasis==='None'||!goalComplete?null:goalResolvedChance,
    goalChanceLowerBoundPct:decisionBasis==='None'?0:Math.max(0,goalResolvedChance-goalError),
    goalChanceUpperBoundPct:decisionBasis==='None'||!goalComplete?null:Math.min(100,goalResolvedChance+goalError),
    mainFitPct:mainFit,
    confidencePct:Math.max(0,Math.min(100,confidence)),
    bestPossibleOutcome:best?.label??'—',
    worstPossibleOutcome:worst?.label??'—',
    reasons:[
      'Main Auction uses the same unified Head + Back + Wrist evaluator as Gear and Optimise.',
      item.authenticated
        ?'Replaces current '+item.authentication.kind+' authentication: '+(existing||'unspecified')+(item.authentication.value?' '+item.authentication.value+'%':'')+'.'
        :'Clean target: no current authentication is destroyed.',
      'Main Fit '+mainFit.toFixed(1)+'%: best current Main Auction trio containing this item versus the absolute best trio.',
      'Robust / central / high dynamic states are sensitivity-tested without assigning probabilities to those states. The default Main verdict uses the robust zero-state baseline.',
      'Day, Night and Rain losses are signed and included in downside rather than clamped to zero.',
      unresolvedMass>0
        ?'Some catalogue outcome magnitude/mechanic remains unresolved. It is excluded from numeric EV instead of being assigned a fake zero, and that probability mass cannot produce a USE verdict.'
        :'All enabled catalogue outcomes for this slot have mapped numeric/mechanic support.',
      'Outcome selection uses the editable catalogue relative-weight class plus exact-certificate roll history. Basic/exclusive relative weights are editable qualitative assumptions; the explicit prior strength is not published game odds.',
      cert.gradeStars!==undefined
        ?String(cert.gradeStars)+'★ quality is recorded. Higher grade is known to push rolls upward, but the exact transform is unpublished; the unshifted range is therefore treated as a conservative floor rather than inventing a multiplier.'
        :'Certificate grade effect is not assumed.',
      cert.mutation
        ?'Certificate mutation '+cert.mutation+' is recorded and exact-mutation roll evidence is preferred when available; its unpublished strength shift is not fabricated.'
        :'No certificate mutation is recorded.',
      'Personal effect tiers are used only as an ordinal secondary signal when the target remains in a robust Main Auction trio; they never compensate for weaker Main utility.',
      'Numeric priors use midpoint quadrature with explicit conservative monotone integration bounds at decision thresholds; endpoints carry zero probability mass. Empirical samples retain their exact frequency. Specialist deltas use absolute native utility points, including at zero baseline.',
      'Lucky Grading is ON.'
    ]
  };
}

/**
 * Conditional 199-Robux "Reroll Number" distribution. The effect is fixed:
 * calculate fresh same-effect numeric outcomes against accepting the current roll.
 * The caller must exclude the current observation from the training dataset.
 */
export function analyseConditionalNumberReroll(
  data:AppData,
  roll:AppData['rollLog'][number],
  cert:OwnedCertificate
):{
  expectedMainPct:number;
  expectedMainLowerBoundPct:number;
  expectedContextualMainLowerBoundPct:number;
  chanceMainWorseUpperBoundPct:number;
  chanceAnyWorseUpperBoundPct:number;
  expectedDrinkPrepLowerBound:number;
  expectedGradingLowerBound:number;
  expectedShopLowerBound:number;
  chanceMainWorsePct:number;
  chanceAnyWorsePct:number;
  resolvedMassPct:number;
  unresolvedMassPct:number;
  expectedContextualMainPct:number;
  expectedDrinkPrepPct:number;
  expectedGradingPct:number;
  expectedShopPct:number;
  modelNote:string;
}|undefined {
  if(algorithmIssues(data.settings).length)return undefined;
  const original=data.gear.find(g=>g.id===roll.itemId);
  if(!original)return undefined;
  const def=outcomesFor(data,cert,original.slot).find(d=>d.effect===roll.newAuthentication);
  if(!def)return undefined;
  const supports=rollSupports(def,data,original.slot,cert);
  if(!supports.length)return undefined;
  const baseline=buildGearLoadouts(data.gear,data.settings,'low');
  if(!baseline.main||baseline.main.utility<=1e-9)return undefined;
  let resolvedMass=0,main=0,mainWorse=0,anyWorse=0,context=0,drink=0,grading=0,shop=0;
  const priorMetrics:Array<{main:number;context:number;mainWorse:number;anyWorse:number;drink:number;grading:number;shop:number}>=[];
  let largestCell=0;
  for(const support of supports){
    if(support.unresolved)continue;
    const hypothetical=replaceAuthentication(original,cert,roll.newAuthentication,support.value);
    const nextGear=data.gear.map(item=>item.id===original.id?hypothetical:item);
    const result=buildGearLoadouts(nextGear,data.settings,'low');
    const mainDelta=pct(result.main?.utility,baseline.main?.utility);
    const day=pct(result.day?.utility,baseline.day?.utility);
    const night=pct(result.night?.utility,baseline.night?.utility);
    const rain=pct(result.rain?.utility,baseline.rain?.utility);
    const drinkDelta=specialistUtilityDelta(result.drink?.utility,baseline.drink?.utility);
    const gradingDelta=specialistUtilityDelta(result.grading?.utility,baseline.grading?.utility);
    const shopDelta=specialistUtilityDelta(result.shop?.utility,baseline.shop?.utility);
    if(support.integrationCellMass){
      largestCell=Math.max(largestCell,support.integrationCellMass);
      priorMetrics.push({main:mainDelta,context:(day+night+rain)/3,mainWorse:mainDelta<-1e-4?1:0,
        anyWorse:Math.min(mainDelta,day,night,rain,drinkDelta,gradingDelta,shopDelta)<-1e-4?1:0,
        drink:drinkDelta,grading:gradingDelta,shop:shopDelta});
    }
    const weight=support.weight;
    resolvedMass+=weight;
    main+=weight*mainDelta;
    context+=weight*(day+night+rain)/3;
    drink+=weight*drinkDelta;
    grading+=weight*gradingDelta;
    shop+=weight*shopDelta;
    if(mainDelta < -1e-4)mainWorse+=weight;
    if(Math.min(mainDelta,day,night,rain,drinkDelta,gradingDelta,shopDelta)<-1e-4)anyWorse+=weight;
  }
  const divisor=resolvedMass>1e-10?resolvedMass:1;
  const error=(key:keyof typeof priorMetrics[number])=>priorMetrics.length
    ?largestCell*(Math.max(...priorMetrics.map(x=>x[key]))-Math.min(...priorMetrics.map(x=>x[key]))):0;
  return {
    expectedMainPct:main/divisor,
    expectedMainLowerBoundPct:(main-error('main'))/divisor,
    expectedContextualMainLowerBoundPct:(context-error('context'))/divisor,
    chanceMainWorseUpperBoundPct:Math.min(100,(mainWorse+error('mainWorse'))*100),
    chanceAnyWorseUpperBoundPct:Math.min(100,(anyWorse+error('anyWorse'))*100),
    expectedDrinkPrepLowerBound:(drink-error('drink'))/divisor,
    expectedGradingLowerBound:(grading-error('grading'))/divisor,
    expectedShopLowerBound:(shop-error('shop'))/divisor,
    chanceMainWorsePct:mainWorse*100,
    chanceAnyWorsePct:anyWorse*100,
    resolvedMassPct:resolvedMass*100,
    unresolvedMassPct:Math.max(0,1-resolvedMass)*100,
    expectedContextualMainPct:context/divisor,
    expectedDrinkPrepPct:drink/divisor,
    expectedGradingPct:grading/divisor,
    expectedShopPct:shop/divisor,
    modelNote:'Same authentication effect only. Roll strengths are conditioned on this certificate tier, grade and mutation; the current roll is excluded from training. No unknown effect-selection odds are used.'
  };
}

function withConversionAdvice(
  direct:OwnedCertificateDecision,
  premium:OwnedCertificateDecision
):OwnedCertificateDecision {
  const d=direct.recommendedTarget;
  const p=premium.recommendedTarget;
  if(!d||!p)return direct;
  const complete=d.resolvedOutcomeMassPct>=100-1e-6&&p.resolvedOutcomeMassPct>=100-1e-6;
  const diff=p.expectedImprovementLowPct-d.expectedImprovementLowPct;
  let recommendation:CertificateConversionAdvice['recommendation']='HOLD / UNCERTAIN';
  if((p.verdict==='USE'||p.verdict==='CONSIDER')&&diff>=1&&p.chanceOfWorsePct<=d.chanceOfWorsePct+10){
    // Converted grade, diamond affordability and personal value are unknown.
    recommendation='HOLD / UNCERTAIN';
  }else if(complete&&(d.verdict==='USE'||d.verdict==='CONSIDER')&&diff<1){
    recommendation='DIRECT USE COMPETITIVE';
  }

  const conversion:CertificateConversionAdvice={
    diamondCost:150,
    recommendation,
    directExpectedMainPct:d.expectedImprovementPct,
    premiumExpectedMainPct:p.expectedImprovementPct,
    premiumVerdict:p.verdict,
    reason:'Indicative gear comparison only. Diamond affordability, the value of preserving the Wooden certificate, and converted grade/mutation are unknown. No economic conversion recommendation is made; unresolved conditional EVs are not comparable full-certificate EVs.'
  };

  return {
    ...direct,
    verdict:direct.verdict,
    conversion,
    modelNotes:[
      ...direct.modelNotes,
      'Premium conversion is an indicative alternative only; unknown resource value and converted quality prevent a complete economic recommendation.'
    ]
  };
}

type GoalPick=[(b:Branch)=>number,number];

function goalMeasure(
  basis:CertificateTargetDecision['decisionBasis'],
  specialists:ReturnType<typeof activeSpecialists>,
  measures:Record<'main'|'context'|'preference'|'drink'|'grading'|'shop',GoalPick>
):{rank:number;gain:number;pick:(b:Branch)=>number} {
  const of=([pick,gain]:GoalPick,rank:number)=>({rank,gain,pick});
  switch(basis){
    case 'Main Auction':return of(measures.main,0);
    case 'Contextual Main':return of(measures.context,1);
    case 'Main secondary preference':return of(measures.preference,2);
    case 'Drink Prep':return of(measures.drink,3+specialists.indexOf('Drink Prep'));
    case 'Grading':return of(measures.grading,3+specialists.indexOf('Grading'));
    case 'Shop / Idle':return of(measures.shop,3+specialists.indexOf('Shop / Idle'));
    default:return {rank:9,gain:0,pick:()=>0};
  }
}

/** Same verdict: goal priority first (Main before specialists, specialists in the user's
 * priority order), then resolved coverage, then conservative gain in that goal, then
 * chance; item IDs only break exact ties.
 */
export function compareCertificateTargets(a:CertificateTargetDecision,b:CertificateTargetDecision):number {
  const vr=(v:CertificateDecisionVerdict)=>({USE:0,CONSIDER:1,HOLD:2,'DO NOT USE':3}[v]);
  const gain=(x:CertificateTargetDecision)=>x.goalGainLowerBound??x.expectedImprovementLowPct;
  const chance=(x:CertificateTargetDecision)=>x.goalChanceLowerBoundPct??x.chanceOfImprovementPct;
  return vr(a.verdict)-vr(b.verdict)||
    (a.goalRank??0)-(b.goalRank??0)||
    (Math.abs(b.resolvedOutcomeMassPct-a.resolvedOutcomeMassPct)>1e-6?b.resolvedOutcomeMassPct-a.resolvedOutcomeMassPct:0)||
    gain(b)-gain(a)||
    chance(b)-chance(a)||
    b.mainFitPct-a.mainFitPct||a.item.id.localeCompare(b.item.id);
}

export function analyseCertificate(
  data:AppData,
  cert:OwnedCertificate,
  sharedBaselines?:Record<'low'|'central'|'high',ReturnType<typeof buildGearLoadouts>>,
  targetId?:string
):OwnedCertificateDecision {
  if(algorithmIssues(data.settings).length)return {certificate:cert,verdict:'HOLD',targets:[],modelNotes:['Invalid algorithm settings: '+algorithmIssues(data.settings).join('; ')]};
  const baselines=sharedBaselines??{
    low:buildGearLoadouts(data.gear,data.settings,'low'),
    central:buildGearLoadouts(data.gear,data.settings,'central'),
    high:buildGearLoadouts(data.gear,data.settings,'high')
  };

  const targets=data.gear
    .filter(item=>!targetId||item.id===targetId)
    .map(item=>targetDecision(data,cert,item,baselines))
    .filter((x):x is CertificateTargetDecision=>Boolean(x));

  targets.sort(compareCertificateTargets);

  const recommendedTarget=targets[0];
  return {
    certificate:cert,
    verdict:recommendedTarget?.verdict??'HOLD',
    recommendedTarget,
    targets,
    modelNotes:[
      'The Authentication Outcome Catalogue is the live source of truth for enabled outcomes, ranges, confidence and user-assumed relative weighting.',
      'Basic/exclusive weights and the 40-sample outcome prior are model assumptions, not measured game odds.',
      'Exact-certificate observations update outcome weights and progressively dominate roll-strength priors as samples grow.',
      'Unresolved Luck/Focused/custom mechanics are never silently treated as known zero-value rolls.',
      'Main Auction is solved first with the same shared engine used everywhere else.',
      'Low / central / high dynamic states are sensitivity-tested without assigning fake state probabilities.',
      'Drink Prep, Grading and Shop/Idle are separately re-optimised; one item may appear in several loadouts.',
      'Targets of the same verdict rank by resolved coverage before conditional EV; incomplete evidence cannot win merely through an attractive conditional average.',
      'HOLD is a first-class option with zero guaranteed change.'
    ]
  };
}

/** `conversion: false` skips the indicative Wooden -> Premium comparison for callers that do not show it. */
export function analyseOwnedCertificates(data:AppData,options:{conversion?:boolean}={}):OwnedCertificateDecision[] {
  if(algorithmIssues(data.settings).length)return data.ownedCertificates.filter(c=>c.quantity>0).map(cert=>analyseCertificate(data,cert));
  const baselines={
    low:buildGearLoadouts(data.gear,data.settings,'low'),
    central:buildGearLoadouts(data.gear,data.settings,'central'),
    high:buildGearLoadouts(data.gear,data.settings,'high')
  };
  const cache=new Map<string,OwnedCertificateDecision>();

  const decisions=data.ownedCertificates
    .filter(c=>c.quantity>0)
    .map(cert=>{
      const catalogueSignature=data.authModel
        .filter(m=>m.enabled&&m.certificateInventoryType===cert.type)
        .map(m=>[
          m.id,m.slot,m.outcome,m.assumedLikelihoodClass,m.min,m.typical,m.max,m.confidence,m.observedSampleCount
        ].join(':'))
        .sort()
        .join('|');
      const key=cert.type+'|'+String(cert.gradeStars??'')+'|'+String(cert.mutation??'')+'|'+catalogueSignature;
      const cached=cache.get(key);
      if(cached)return {...cached,certificate:cert};
      const decision=analyseCertificate(data,cert,baselines);
      cache.set(key,decision);
      return decision;
    });

  if(options.conversion!==false&&decisions.some(d=>d.certificate.type==='Wooden Certificate of Authenticity')){
    const syntheticPremium:OwnedCertificate={
      id:'synthetic-premium-conversion',
      type:'Premium Certificate of Authenticity',
      quantity:1
    };
    const premium=analyseCertificate(data,syntheticPremium,baselines);
    return decisions.map(decision=>
      decision.certificate.type==='Wooden Certificate of Authenticity'
        ?withConversionAdvice(decision,premium)
        :decision
    );
  }

  return decisions;
}

