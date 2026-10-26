import type { AppData, GearItem, OwnedCertificate, Slot } from '../types';
import {
  buildGearLoadouts,
  gradeRerollExpectedValueGainPct,
  LUCKY_GRADING,
  mainAuctionUtility,
  mutationLuckForItem
} from './gearLoadouts';

export type CertificateDecisionVerdict = 'USE' | 'CONSIDER' | 'HOLD' | 'DO NOT USE';

export interface CertificateOutcomeDefinition {
  effect: string;
  slot: Slot | 'Any';
  min?: number;
  max?: number;
  confidence: number;
  mainRelevant: boolean;
  specialist?: 'Drink Prep' | 'Grading' | 'Shop / Idle';
  note?: string;
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
  expectedImprovementPct: number;
  expectedImprovementLowPct: number;
  expectedImprovementHighPct: number;
  expectedContextualMainPct: number;
  worstContextualMainPct: number;
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
  unresolvedEffects: string[];
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

type RollSupport = { value:number; unresolved:boolean; label?:string };

type Branch = {
  p:number;
  delta:number;
  deltaLow:number;
  deltaHigh:number;
  contextual:number;
  contextualWorst:number;
  contextualBest:number;
  drink:number;
  grading:number;
  shop:number;
  anyBenefit:boolean;
  unresolved:boolean;
  unresolvedMainPotential:boolean;
  unresolvedSecondaryPotential:boolean;
  confidence:number;
  label:string;
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

const NORMAL_BASIC: CertificateOutcomeDefinition[] = [
  {effect:'Luck',slot:'Any',confidence:.25,mainRelevant:true,note:'Confirmed positive Luck outcome; public numeric range remains unresolved.'},
  {effect:'Bid Recovery',slot:'Any',min:5,max:25,confidence:.70,mainRelevant:true},
  {effect:'Bid Arrow Speed',slot:'Any',min:-60,max:-12,confidence:.75,mainRelevant:true},
  {effect:'Bid Zone Width',slot:'Any',min:15,max:75,confidence:.75,mainRelevant:true},
  {effect:'Energy Drink Time',slot:'Any',min:10,max:50,confidence:.75,mainRelevant:false,specialist:'Drink Prep'},
  {effect:'Tip Chance',slot:'Any',min:3,max:15,confidence:.75,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'NPC Offers Bonus',slot:'Any',min:3,max:15,confidence:.75,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'Walkspeed',slot:'Any',min:10,max:50,confidence:.75,mainRelevant:false}
];

const NORMAL_EXCLUSIVE: Record<Slot,CertificateOutcomeDefinition[]> = {
  Head:[
    {effect:'Sunny',slot:'Head',min:10,max:100,confidence:.65,mainRelevant:false,note:'Day auction context only.'},
    {effect:'Nocturnal',slot:'Head',min:10,max:100,confidence:.65,mainRelevant:false,note:'Night auction context only.'},
    {effect:'Overcharged',slot:'Head',min:5,max:20,confidence:.60,mainRelevant:false,specialist:'Drink Prep'}
  ],
  Back:[
    {effect:'Raindrop',slot:'Back',min:10,max:100,confidence:.65,mainRelevant:false,note:'Rain auction context only.'},
    {effect:'Focused',slot:'Back',confidence:.20,mainRelevant:true,note:'Effect is confirmed, but the exact numerical formula/range is unresolved.'}
  ],
  Wrist:[
    {effect:'Time Keeper',slot:'Wrist',min:5,max:40,confidence:.65,mainRelevant:false},
    {effect:'Connected',slot:'Wrist',min:2,max:12,confidence:.65,mainRelevant:false}
  ]
};

const RIPPED_BASIC: CertificateOutcomeDefinition[] = [
  {effect:'Luck',slot:'Any',confidence:.20,mainRelevant:true,note:'Positive Luck outcome is possible, but the Ripped numeric range is unresolved.'},
  {effect:'Bid Recovery',slot:'Any',min:3.8,max:13,confidence:.55,mainRelevant:true},
  {effect:'Bid Arrow Speed',slot:'Any',min:-30,max:-15,confidence:.40,mainRelevant:true},
  {effect:'Bid Zone Width',slot:'Any',min:11,max:38,confidence:.55,mainRelevant:true},
  {effect:'Energy Drink Time',slot:'Any',min:7,max:25,confidence:.55,mainRelevant:false,specialist:'Drink Prep'},
  {effect:'Tip Chance',slot:'Any',min:2.3,max:7.5,confidence:.55,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'NPC Offers Bonus',slot:'Any',min:2.3,max:7.5,confidence:.55,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'Walkspeed',slot:'Any',min:7.5,max:25,confidence:.55,mainRelevant:false}
];

const LIMITED: Record<Slot,CertificateOutcomeDefinition[]> = {
  Head:[
    {effect:'Auto X-Ray',slot:'Head',min:3,max:30,confidence:.85,mainRelevant:false},
    {effect:'Grade Re-Roll',slot:'Head',min:5,max:25,confidence:.90,mainRelevant:false,specialist:'Grading'}
  ],
  Back:[
    {effect:'Featherweight',slot:'Back',min:3,max:20,confidence:.90,mainRelevant:false},
    {effect:'Luck Frenzy',slot:'Back',min:10,max:110,confidence:.55,mainRelevant:true,note:'Magnitude is known; activation frequency and duration remain scenario-sensitive.'}
  ],
  Wrist:[
    {effect:'Second Chance',slot:'Wrist',min:4,max:33,confidence:.90,mainRelevant:false},
    {effect:'Steady Hand',slot:'Wrist',min:4,max:33,confidence:.80,mainRelevant:false}
  ]
};

const PREMIUM: Record<Slot,CertificateOutcomeDefinition[]> = {
  Head:[{effect:'Mutated Luck',slot:'Head',confidence:.75,mainRelevant:true,note:'Calculated from mutations on the actual equipped trio.'}],
  Back:[
    {effect:'Droughtbreaker',slot:'Back',confidence:.45,mainRelevant:true,note:'Per-stack value uses observed/user-entered values; state is sensitivity-tested.'},
    {effect:'Golden Hour',slot:'Back',confidence:.40,mainRelevant:true,note:'State is sensitivity-tested rather than assigned one fixed expected value.'}
  ],
  Wrist:[
    {effect:'Club Pact',slot:'Wrist',confidence:.65,mainRelevant:false},
    {effect:'Temporal Split',slot:'Wrist',confidence:.60,mainRelevant:false}
  ]
};

export { gradeRerollExpectedValueGainPct, mutationLuckForItem, LUCKY_GRADING, mainAuctionUtility };

function authModelType(cert:OwnedCertificate):AppData['authModel'][number]['certificateType'] {
  if(cert.type==='Premium Certificate of Authenticity')return 'Premium Certificate of Authenticity';
  if(cert.type==='Limited Certificate of Authenticity')return 'Limited Certificate of Authenticity';
  return 'Normal Certificate of Authenticity';
}

function outcomesFor(cert:OwnedCertificate,slot:Slot):CertificateOutcomeDefinition[] {
  if(cert.type==='Limited Certificate of Authenticity')return LIMITED[slot];
  if(cert.type==='Premium Certificate of Authenticity')return PREMIUM[slot];
  if(cert.type==='Ripped Certificate of Authenticity')return [...RIPPED_BASIC,...NORMAL_EXCLUSIVE[slot].filter(x=>['Raindrop','Time Keeper'].includes(x.effect))];
  return [...NORMAL_BASIC,...NORMAL_EXCLUSIVE[slot]];
}

function rollMatchesCertificate(r:AppData['rollLog'][number],cert:OwnedCertificate):boolean {
  if(r.certificateInventoryType)return r.certificateInventoryType===cert.type;
  if(cert.type==='Premium Certificate of Authenticity')return r.certificateType==='Premium Certificate of Authenticity';
  if(cert.type==='Limited Certificate of Authenticity')return r.certificateType==='Limited Certificate of Authenticity';
  return false;
}

function observedEffectCounts(data:AppData,cert:OwnedCertificate,slot:Slot):Map<string,number> {
  const counts=new Map<string,number>();
  for(const r of data.rollLog){
    if(r.slot===slot&&rollMatchesCertificate(r,cert))counts.set(r.newAuthentication,(counts.get(r.newAuthentication)??0)+1);
  }
  return counts;
}

function outcomeProbabilities(defs:CertificateOutcomeDefinition[],counts:Map<string,number>) {
  // Exact game weighting is unpublished. Use a transparent symmetric Dirichlet(1)
  // prior, then allow exact-certificate observations to update it.
  const weighted=defs.map(def=>({def,w:1+(counts.get(def.effect)??0)}));
  const total=weighted.reduce((s,x)=>s+x.w,0)||1;
  return weighted.map(x=>({def:x.def,p:x.w/total}));
}

function modelRange(data:AppData,cert:OwnedCertificate,slot:Slot,effect:string):{min:number;max:number}|undefined {
  const type=authModelType(cert);
  const entries=data.authModel.filter(m=>m.enabled&&m.certificateType===type&&m.outcome===effect&&(m.slot==='Any'||m.slot===slot));
  const exact=entries.find(m=>m.slot===slot)??entries[0];
  if(exact?.min!==undefined&&exact.max!==undefined&&Number.isFinite(exact.min)&&Number.isFinite(exact.max))return {min:exact.min,max:exact.max};
  return undefined;
}

function effectNeedsNumericMagnitude(effect:string):boolean {
  return !['Mutated Luck','Golden Hour','Club Pact','Club Packed','Temporal Split','Auto X-Ray','Featherweight','Second Chance','Steady Hand','Time Keeper','Timekeeper','Connected','Walkspeed'].includes(effect);
}

function rollSupports(def:CertificateOutcomeDefinition,data:AppData,slot:Slot,cert:OwnedCertificate):RollSupport[] {
  const configured=def.min!==undefined&&def.max!==undefined?{min:def.min,max:def.max}:modelRange(data,cert,slot,def.effect);
  const observed=data.rollLog
    .filter(r=>r.slot===slot&&r.newAuthentication===def.effect&&rollMatchesCertificate(r,cert)&&
      (cert.gradeStars===undefined||r.certificateGradeStars===undefined||r.certificateGradeStars===cert.gradeStars))
    .map(r=>r.newValue)
    .filter(v=>Number.isFinite(v));

  if(configured){
    const inRange=observed.filter(v=>v>=configured.min&&v<=configured.max);
    if(inRange.length>=4){
      const sorted=[...inRange].sort((a,b)=>a-b);
      const quantiles=Array.from({length:7},(_,i)=>sorted[Math.round((sorted.length-1)*(i/6))]);
      const prior=Array.from({length:7},(_,i)=>configured.min+(configured.max-configured.min)*(i/6));
      return [...prior,...quantiles].map(value=>({value,unresolved:false}));
    }
    return Array.from({length:11},(_,i)=>({value:configured.min+(configured.max-configured.min)*(i/10),unresolved:false}));
  }

  if(observed.length)return [...new Set(observed)].sort((a,b)=>a-b).map(value=>({value,unresolved:false}));

  const kind=cert.type==='Premium Certificate of Authenticity'?'Premium':cert.type==='Limited Certificate of Authenticity'?'Limited':'Normal';
  const inventoryValues=data.gear
    .filter(g=>g.slot===slot&&g.authentication.kind===kind&&g.authentication.effect===def.effect)
    .map(g=>g.authentication.value)
    .filter(v=>Number.isFinite(v)&&v!==0);
  if(inventoryValues.length)return [...new Set(inventoryValues)].sort((a,b)=>a-b).map(value=>({value,unresolved:false}));

  if(!effectNeedsNumericMagnitude(def.effect))return [{value:0,unresolved:false}];
  return [{value:0,unresolved:true,label:def.effect+' magnitude unresolved'}];
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

function riskPct(before:number|undefined,after:number|undefined):number {
  if(before===undefined||before<=1e-9)return 0;
  const a=after??0;
  return Math.max(0,(before-a)/Math.abs(before)*100);
}

function contextualDeltas(before:ReturnType<typeof buildGearLoadouts>,after:ReturnType<typeof buildGearLoadouts>):number[] {
  return (['day','night','rain'] as const).map(k=>pct(after[k]?.utility,before[k]?.utility));
}

function bestMainContaining(data:AppData,item:GearItem):number|undefined {
  const heads=data.gear.filter(g=>g.slot==='Head'),backs=data.gear.filter(g=>g.slot==='Back'),wrists=data.gear.filter(g=>g.slot==='Wrist');
  let best=-Infinity;
  for(const h of heads)for(const b of backs)for(const w of wrists){
    const trio=[h,b,w];
    if(!trio.some(x=>x.id===item.id))continue;
    best=Math.max(best,mainAuctionUtility(trio,data.settings,'Neutral','central'));
  }
  return Number.isFinite(best)?best:undefined;
}

function percentile(values:Array<{x:number;p:number}>,q:number):number {
  const sorted=[...values].sort((a,b)=>a.x-b.x);
  let c=0;
  for(const v of sorted){c+=v.p;if(c+1e-12>=q)return v.x;}
  return sorted.at(-1)?.x??0;
}

function focusedPotential(item:GearItem):{main:boolean;secondary:boolean} {
  const entries=(Object.entries(item.stats) as Array<[keyof GearItem['stats'],number]>).filter(([,value])=>value>0);
  if(!entries.length)return {main:false,secondary:false};
  entries.sort((a,b)=>b[1]-a[1]);
  const key=entries[0][0];
  return {
    main:['luck','arrowReduction','zone','recovery'].includes(key),
    secondary:['energy','tip','npc'].includes(key)
  };
}

function unresolvedPotential(effect:string,item:GearItem):{main:boolean;secondary:boolean} {
  if(effect==='Luck')return {main:true,secondary:false};
  if(effect==='Focused')return focusedPotential(item);
  return {main:false,secondary:false};
}

function targetDecision(
  data:AppData,
  cert:OwnedCertificate,
  item:GearItem,
  baselines:Record<'low'|'central'|'high',ReturnType<typeof buildGearLoadouts>>
):CertificateTargetDecision|undefined {
  const baseline=baselines.central;
  if(!baseline.main||baseline.main.utility===0)return undefined;

  const containing=bestMainContaining(data,item);
  const bare={...item,authenticated:false,authentication:{kind:'None' as const,effect:'',value:0}};
  const withoutGear=data.gear.map(g=>g.id===item.id?bare:g);
  const without=buildGearLoadouts(withoutGear,data.settings,'central');

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

  const defs=outcomesFor(cert,item.slot);
  const probs=outcomeProbabilities(defs,observedEffectCounts(data,cert,item.slot));
  const branches:Branch[]=[];
  const unresolvedEffects=new Set<string>();

  for(const {def,p} of probs){
    const supports=rollSupports(def,data,item.slot,cert);
    for(const support of supports){
      const updated=replaceAuthentication(item,cert,def.effect,support.value);
      const gear=data.gear.map(g=>g.id===item.id?updated:g);
      const nextLow=buildGearLoadouts(gear,data.settings,'low');
      const nextCentral=buildGearLoadouts(gear,data.settings,'central');
      const nextHigh=buildGearLoadouts(gear,data.settings,'high');
      const mainDeltas=[
        pct(nextLow.main?.utility,baselines.low.main?.utility),
        pct(nextCentral.main?.utility,baselines.central.main?.utility),
        pct(nextHigh.main?.utility,baselines.high.main?.utility)
      ];
      const delta=mainDeltas[1];
      const deltaLow=Math.min(...mainDeltas);
      const deltaHigh=Math.max(...mainDeltas);

      const contextAll=[
        ...contextualDeltas(baselines.low,nextLow),
        ...contextualDeltas(baselines.central,nextCentral),
        ...contextualDeltas(baselines.high,nextHigh)
      ];
      const centralContext=contextualDeltas(baselines.central,nextCentral);
      const contextual=centralContext.reduce((sum,x)=>sum+x,0)/centralContext.length;
      const contextualWorst=Math.min(...contextAll);
      const contextualBest=Math.max(...contextAll);

      const drink=pct(nextCentral.drink?.utility,baseline.drink?.utility);
      const grading=pct(nextCentral.grading?.utility,baseline.grading?.utility);
      const shop=pct(nextCentral.shop?.utility,baseline.shop?.utility);
      const potential=support.unresolved?unresolvedPotential(def.effect,item):{main:false,secondary:false};
      if(support.unresolved)unresolvedEffects.add(def.effect);

      const anyBenefit=deltaHigh>1e-4||contextualBest>1e-4||drink>1e-4||grading>1e-4||shop>1e-4||potential.main||potential.secondary;
      const gradePenalty=cert.gradeStars!==undefined ? .08 : .04;
      branches.push({
        p:p/supports.length,
        delta,deltaLow,deltaHigh,contextual,contextualWorst,contextualBest,drink,grading,shop,anyBenefit,
        unresolved:support.unresolved,
        unresolvedMainPotential:potential.main,
        unresolvedSecondaryPotential:potential.secondary,
        confidence:Math.max(.05,def.confidence-gradePenalty-(support.unresolved?.15:0)),
        label:def.effect+(support.unresolved?' — magnitude unresolved':support.value?' '+support.value.toFixed(1)+'%':'')
      });
    }
  }

  const total=branches.reduce((s,b)=>s+b.p,0)||1;
  for(const b of branches)b.p/=total;

  const robustImprove=branches.filter(b=>b.deltaLow>1e-4);
  const potentialImprove=branches.filter(b=>b.deltaHigh>1e-4||b.unresolvedMainPotential);
  const meaningful=branches.filter(b=>b.deltaLow>=1);
  const worse=branches.filter(b=>!b.unresolvedMainPotential&&(b.deltaLow<-1e-4||b.contextualWorst<-1e-4));
  const secondary=branches.filter(b=>Math.max(b.contextualBest,b.drink,b.grading,b.shop)>1e-4||b.unresolvedSecondaryPotential);

  const chance=robustImprove.reduce((s,b)=>s+b.p,0)*100;
  const potentialChance=potentialImprove.reduce((s,b)=>s+b.p,0)*100;
  const meaningfulChance=meaningful.reduce((s,b)=>s+b.p,0)*100;
  const any=branches.filter(b=>b.anyBenefit).reduce((s,b)=>s+b.p,0)*100;
  const secondaryChance=secondary.reduce((s,b)=>s+b.p,0)*100;
  const chanceWorse=worse.reduce((s,b)=>s+b.p,0)*100;
  const unresolvedMass=branches.filter(b=>b.unresolved).reduce((s,b)=>s+b.p,0)*100;

  const expected=branches.reduce((s,b)=>s+b.p*b.delta,0);
  const expectedLow=branches.reduce((s,b)=>s+b.p*b.deltaLow,0);
  const expectedHigh=branches.reduce((s,b)=>s+b.p*b.deltaHigh,0);
  const expectedContextual=branches.reduce((s,b)=>s+b.p*b.contextual,0);
  const worstContextual=branches.reduce((s,b)=>s+b.p*b.contextualWorst,0);
  const expectedDrink=branches.reduce((s,b)=>s+b.p*b.drink,0);
  const expectedGrading=branches.reduce((s,b)=>s+b.p*b.grading,0);
  const expectedShop=branches.reduce((s,b)=>s+b.p*b.shop,0);

  const avgGain=robustImprove.length?robustImprove.reduce((s,b)=>s+b.p*b.deltaLow,0)/(robustImprove.reduce((s,b)=>s+b.p,0)||1):0;
  const avgLoss=worse.length?worse.reduce((s,b)=>s+b.p*Math.min(b.deltaLow,b.contextualWorst),0)/(worse.reduce((s,b)=>s+b.p,0)||1):0;
  const best=branches.reduce((a,b)=>b.deltaHigh>a.deltaHigh?b:a,branches[0]);
  const worst=branches.reduce((a,b)=>Math.min(b.deltaLow,b.contextualWorst)<Math.min(a.deltaLow,a.contextualWorst)?b:a,branches[0]);

  let confidence=branches.reduce((s,b)=>s+b.p*b.confidence,0)*100;
  if(cert.type==='Wooden Certificate of Authenticity'||cert.type==='Ripped Certificate of Authenticity')confidence*=.72;
  if(cert.type==='Limited Certificate of Authenticity')confidence*=.85;
  if(cert.type==='Premium Certificate of Authenticity')confidence*=.80;
  confidence*=Math.max(.35,1-unresolvedMass/140);

  const mainFit=containing!==undefined?Math.max(0,containing/baseline.main.utility*100):0;
  const rare=cert.type==='Limited Certificate of Authenticity'||cert.type==='Premium Certificate of Authenticity';
  const strongestSecondary=Math.max(expectedContextual,expectedDrink,expectedGrading,expectedShop);
  let verdict:CertificateDecisionVerdict='HOLD';

  if(unresolvedMass>1e-6){
    if(expectedLow>.5&&chance>=25&&chanceWorse<30)verdict='CONSIDER';
    else if(strongestSecondary>=3&&secondaryChance>=40&&chanceWorse<20)verdict='CONSIDER';
    else verdict='HOLD';
  }else{
    if(expectedLow<-.5||chanceWorse>=55)verdict='DO NOT USE';
    else if(expectedLow>(rare?2:1)&&chance>=(rare?45:35)&&chanceWorse<=25&&confidence>=45)verdict='USE';
    else if(expected>.25&&potentialChance>=20&&chanceWorse<45)verdict='CONSIDER';
    else if(expected>=-.05&&strongestSecondary>=3&&secondaryChance>=40&&chanceWorse<20)verdict='CONSIDER';
  }

  const existing=item.authentication.effect.trim();
  if(item.authenticated&&['Focused','Mutated Luck','Droughtbreaker','Drought Breaker','Golden Hour','Luck Frenzy'].includes(existing)&&verdict==='USE'){
    verdict='CONSIDER';
    confidence=Math.min(confidence,55);
  }

  return {
    item,verdict,
    chanceOfImprovementPct:chance,
    chanceOfPotentialImprovementPct:potentialChance,
    chanceOfMeaningfulImprovementPct:meaningfulChance,
    chanceOfAnyBenefitPct:any,
    chanceOfSecondaryImprovementPct:secondaryChance,
    chanceOfWorsePct:chanceWorse,
    expectedImprovementPct:expected,
    expectedImprovementLowPct:expectedLow,
    expectedImprovementHighPct:expectedHigh,
    expectedContextualMainPct:expectedContextual,
    worstContextualMainPct:worstContextual,
    expectedDrinkPrepPct:expectedDrink,
    expectedGradingPct:expectedGrading,
    expectedShopPct:expectedShop,
    averageGainWhenSuccessfulPct:avgGain,
    averageLossWhenWorsePct:avgLoss,
    bestCasePct:best?.deltaHigh??0,
    worstCasePct:worst?Math.min(worst.deltaLow,worst.contextualWorst):0,
    p10Pct:percentile(branches.map(b=>({x:b.delta,p:b.p})),.10),
    medianPct:percentile(branches.map(b=>({x:b.delta,p:b.p})),.50),
    p90Pct:percentile(branches.map(b=>({x:b.delta,p:b.p})),.90),
    currentAuthenticationValueAtRiskPct:authRisk,
    currentAuthenticationMainRiskPct:mainRisk,
    currentAuthenticationContextRiskPct:contextRisk,
    currentAuthenticationDrinkRiskPct:drinkRisk,
    currentAuthenticationGradingRiskPct:gradingRisk,
    currentAuthenticationShopRiskPct:shopRisk,
    unresolvedOutcomeMassPct:unresolvedMass,
    unresolvedEffects:[...unresolvedEffects],
    mainFitPct:mainFit,
    confidencePct:Math.max(0,Math.min(100,confidence)),
    bestPossibleOutcome:best?.label??'—',
    worstPossibleOutcome:worst?.label??'—',
    reasons:[
      'Main Auction uses the same unified Head + Back + Wrist evaluator as Gear and Optimise.',
      item.authenticated?'Replaces current '+item.authentication.kind+' authentication: '+(existing||'unspecified')+(item.authentication.value?' '+item.authentication.value+'%':'')+'.':'Clean target: no current authentication is destroyed.',
      'Main Fit '+mainFit.toFixed(1)+'%: best current Main Auction trio containing this item versus the absolute best trio.',
      'Low / central / high dynamic states are sensitivity-tested without assigning probabilities to those states.',
      'Day, Night and Rain losses are signed and included in downside rather than clamped to zero.',
      unresolvedMass>0?'Some outcome magnitude is unresolved; that probability mass is shown separately and cannot produce a USE verdict.':'All modelled outcome magnitudes have numeric support.',
      'Effect-selection odds use an equal neutral prior because the hidden game weighting is unpublished; exact-certificate roll history updates that prior.',
      cert.gradeStars!==undefined?String(cert.gradeStars)+'★ quality is recorded, but the exact star-to-roll transform is unpublished; confidence is reduced instead of inventing a multiplier.':'Certificate grade effect is not assumed.',
      'Lucky Grading is ON.'
    ]
  };
}

function withConversionAdvice(
  direct:OwnedCertificateDecision,
  premium:OwnedCertificateDecision
):OwnedCertificateDecision {
  const d=direct.recommendedTarget;
  const p=premium.recommendedTarget;
  if(!d||!p)return direct;
  const diff=p.expectedImprovementPct-d.expectedImprovementPct;
  let recommendation:CertificateConversionAdvice['recommendation']='HOLD / UNCERTAIN';
  if((p.verdict==='USE'||p.verdict==='CONSIDER')&&diff>=1&&p.chanceOfWorsePct<=d.chanceOfWorsePct+10)recommendation='PREFER PREMIUM CONVERSION';
  else if((d.verdict==='USE'||d.verdict==='CONSIDER')&&diff<1)recommendation='DIRECT USE COMPETITIVE';

  const conversion:CertificateConversionAdvice={
    diamondCost:150,
    recommendation,
    directExpectedMainPct:d.expectedImprovementPct,
    premiumExpectedMainPct:p.expectedImprovementPct,
    premiumVerdict:p.verdict,
    reason:'Compares direct Wooden use with converting that Wooden certificate plus 150 Diamonds into a Premium certificate. Diamond utility is not converted into gear score, and the converted certificate grade transform remains uncertain.'
  };

  return {
    ...direct,
    verdict:recommendation==='PREFER PREMIUM CONVERSION'?'HOLD':direct.verdict,
    conversion,
    modelNotes:[...direct.modelNotes,
      recommendation==='PREFER PREMIUM CONVERSION'
        ?'Direct Wooden use is held because the Premium conversion has the stronger modelled Main opportunity before valuing the 150-Diamond cost.'
        :'Premium conversion was evaluated as an explicit alternative to direct Wooden use.'
    ]
  };
}

export function analyseCertificate(
  data:AppData,
  cert:OwnedCertificate,
  sharedBaselines?:Record<'low'|'central'|'high',ReturnType<typeof buildGearLoadouts>>
):OwnedCertificateDecision {
  const baselines=sharedBaselines??{
    low:buildGearLoadouts(data.gear,data.settings,'low'),
    central:buildGearLoadouts(data.gear,data.settings,'central'),
    high:buildGearLoadouts(data.gear,data.settings,'high')
  };
  const targets=data.gear.map(item=>targetDecision(data,cert,item,baselines)).filter((x):x is CertificateTargetDecision=>Boolean(x));
  const vr=(v:CertificateDecisionVerdict)=>({USE:0,CONSIDER:1,HOLD:2,'DO NOT USE':3}[v]);
  targets.sort((a,b)=>vr(a.verdict)-vr(b.verdict)||b.expectedImprovementLowPct-a.expectedImprovementLowPct||
    b.chanceOfImprovementPct-a.chanceOfImprovementPct||b.mainFitPct-a.mainFitPct);
  const recommendedTarget=targets[0];
  return {
    certificate:cert,
    verdict:recommendedTarget?.verdict??'HOLD',
    recommendedTarget,
    targets,
    modelNotes:[
      'Percentages are modelled decision probabilities, not hidden Roblox loot odds.',
      'Unknown effect-selection odds use a symmetric neutral prior, then exact-certificate observations update it.',
      'Unresolved Luck/Focused magnitude is never silently treated as a known zero-value roll.',
      'Main Auction is solved first with the same shared engine used everywhere else.',
      'Low / central / high dynamic states are sensitivity-tested without assigning fake state probabilities.',
      'Drink Prep, Grading and Shop/Idle are separately re-optimised; one item may appear in several loadouts.',
      'HOLD is a first-class option with zero guaranteed change.'
    ]
  };
}

export function analyseOwnedCertificates(data:AppData):OwnedCertificateDecision[] {
  const baselines={
    low:buildGearLoadouts(data.gear,data.settings,'low'),
    central:buildGearLoadouts(data.gear,data.settings,'central'),
    high:buildGearLoadouts(data.gear,data.settings,'high')
  };
  const cache=new Map<string,OwnedCertificateDecision>();
  const decisions=data.ownedCertificates.filter(c=>c.quantity>0).map(cert=>{
    const key=cert.type+'|'+String(cert.gradeStars??'');
    const cached=cache.get(key);
    if(cached)return {...cached,certificate:cert};
    const decision=analyseCertificate(data,cert,baselines);
    cache.set(key,decision);
    return decision;
  });

  const wooden=decisions.filter(d=>d.certificate.type==='Wooden Certificate of Authenticity');
  if(wooden.length){
    const syntheticPremium:OwnedCertificate={id:'synthetic-premium-conversion',type:'Premium Certificate of Authenticity',quantity:1};
    const premium=analyseCertificate(data,syntheticPremium,baselines);
    return decisions.map(decision=>decision.certificate.type==='Wooden Certificate of Authenticity'
      ?withConversionAdvice(decision,premium)
      :decision);
  }
  return decisions;
}
