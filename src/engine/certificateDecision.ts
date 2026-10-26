import type { AppData, AuthModelEntry, GearItem, OwnedCertificate, Slot } from '../types';
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
  expectedImprovementPct: number;
  expectedImprovementLowPct: number;
  expectedImprovementCentralPct: number;
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
  resolvedOutcomeMassPct: number;
  unresolvedEffects: string[];
  decisionBasis: 'Main Auction' | 'Contextual Main' | 'Main secondary preference' | 'Drink Prep' | 'Grading' | 'Shop / Idle' | 'None';
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
};

type Branch = {
  p:number;
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

const PRIOR_STRENGTH=8;

export { gradeRerollExpectedValueGainPct, mutationLuckForItem, LUCKY_GRADING, mainAuctionUtility };

function authModelType(cert:OwnedCertificate):AuthModelEntry['certificateType'] {
  if(cert.type==='Premium Certificate of Authenticity')return 'Premium Certificate of Authenticity';
  if(cert.type==='Limited Certificate of Authenticity')return 'Limited Certificate of Authenticity';
  return 'Normal Certificate of Authenticity';
}

function outcomesFor(data:AppData,cert:OwnedCertificate,slot:Slot):CertificateOutcomeDefinition[] {
  const modelType=authModelType(cert);
  const scopedAll=data.authModel.filter(m=>
    m.certificateType===modelType &&
    (m.slot==='Any'||m.slot===slot)
  );
  const exactAll=scopedAll.filter(m=>m.certificateInventoryType===cert.type);
  const legacyAll=scopedAll.filter(m=>!m.certificateInventoryType);
  const entries=(exactAll.length?exactAll:legacyAll).filter(m=>m.enabled);

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

function observedEffectCounts(data:AppData,cert:OwnedCertificate,slot:Slot):Map<string,number> {
  const counts=new Map<string,number>();
  for(const r of data.rollLog){
    if(r.slot===slot&&rollMatchesCertificate(r,cert)){
      counts.set(r.newAuthentication,(counts.get(r.newAuthentication)??0)+1);
    }
  }
  return counts;
}

function outcomeProbabilities(defs:CertificateOutcomeDefinition[],counts:Map<string,number>) {
  const weighted=defs.map(def=>({
    def,
    w:LIKELIHOOD_WEIGHT[def.assumedLikelihoodClass]+(counts.get(def.effect)??0)
  }));
  const total=weighted.reduce((s,x)=>s+x.w,0)||1;
  return weighted.map(x=>({def:x.def,p:x.w/total}));
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
  const raw=values.map(value=>{
    const shape=value<=typical
      ?(value-min)/Math.max(1e-9,typical-min)
      :(max-value)/Math.max(1e-9,max-typical);
    return .15+Math.max(0,shape);
  });
  const total=raw.reduce((a,b)=>a+b,0)||1;
  return raw.map(x=>x/total);
}

function empiricalSupports(values:number[],mass:number):Array<{value:number;weight:number}> {
  if(!values.length||mass<=0)return [];
  const sorted=[...values].sort((a,b)=>a-b);
  const count=Math.min(7,sorted.length);
  const points=Array.from({length:count},(_,i)=>
    sorted[Math.round((sorted.length-1)*(count===1?0:i/(count-1)))]
  );
  return points.map(value=>({value,weight:mass/points.length}));
}

function rollSupports(def:CertificateOutcomeDefinition,data:AppData,slot:Slot,cert:OwnedCertificate):RollSupport[] {
  const gradeMatched=data.rollLog
    .filter(r=>r.slot===slot&&r.newAuthentication===def.effect&&rollMatchesCertificate(r,cert)&&
      (cert.gradeStars===undefined||r.certificateGradeStars===undefined||r.certificateGradeStars===cert.gradeStars));
  const mutationMatched=cert.mutation?.trim()
    ?gradeMatched.filter(r=>r.certificateMutation===cert.mutation)
    :gradeMatched.filter(r=>!r.certificateMutation);
  const evidenceRows=mutationMatched.length?mutationMatched:gradeMatched;
  const observed=evidenceRows.map(r=>r.newValue).filter(v=>Number.isFinite(v));

  const mechanicUnknown=!def.modeledMechanic;

  if(def.min!==undefined&&def.max!==undefined&&Number.isFinite(def.min)&&Number.isFinite(def.max)){
    const min=Math.min(def.min,def.max);
    const max=Math.max(def.min,def.max);
    const inRange=observed.filter(v=>v>=min&&v<=max);
    const empiricalMass=inRange.length/(PRIOR_STRENGTH+inRange.length);
    const priorMass=1-empiricalMass;

    const priorValues=Array.from({length:7},(_,i)=>min+(max-min)*(i/6));
    const priorWeights=normalizedPriorWeights(priorValues,min,max,def.typical);
    const prior=priorValues.map((value,i)=>({
      value,
      weight:priorMass*priorWeights[i],
      unresolved:mechanicUnknown
    }));
    const empirical=empiricalSupports(inRange,empiricalMass).map(x=>({
      ...x,
      unresolved:mechanicUnknown
    }));
    return [...prior,...empirical].filter(x=>x.weight>1e-12);
  }

  if(observed.length){
    // Observations without a configured/legal range are evidence about realised values,
    // not proof of the full roll distribution. Keep the branch unresolved.
    return empiricalSupports(observed,1).map(x=>({...x,unresolved:true}));
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

function targetDecision(
  data:AppData,
  cert:OwnedCertificate,
  item:GearItem,
  baselines:Record<'low'|'central'|'high',ReturnType<typeof buildGearLoadouts>>
):CertificateTargetDecision|undefined {
  const baseline=baselines.low;
  if(!baseline.main||baseline.main.utility===0)return undefined;

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

  const probs=outcomeProbabilities(defs,observedEffectCounts(data,cert,item.slot));
  const branches:Branch[]=[];
  const baselineUsesTarget=loadoutUsesItem(baseline.main,item.id);
  const baselinePreference=baselineUsesTarget?effectTierValue(item.authentication.effect.trim()):0;
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

      const drink=pct(nextLow.drink?.utility,baseline.drink?.utility);
      const grading=pct(nextLow.grading?.utility,baseline.grading?.utility);
      const shop=pct(nextLow.shop?.utility,baseline.shop?.utility);
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
  for(const b of branches)b.p/=total;

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
    ?anyWorse.reduce((sum,b)=>sum+b.p*Math.min(b.deltaLow,b.contextualWorst,b.drink,b.grading,b.shop),0)/anyWorseMass
    :0;
  const numericBranches=resolved.length?resolved:[];
  const best=numericBranches.length?numericBranches.reduce((a,b)=>b.deltaHigh>a.deltaHigh?b:a,numericBranches[0]):undefined;
  const worst=numericBranches.length?numericBranches.reduce((a,b)=>
    Math.min(b.deltaLow,b.contextualWorst,b.drink,b.grading,b.shop)<Math.min(a.deltaLow,a.contextualWorst,a.drink,a.grading,a.shop)?b:a,
    numericBranches[0]
  ):undefined;

  let confidence=branches.reduce((sum,b)=>sum+b.p*b.confidence,0)*100;
  if(cert.type==='Wooden Certificate of Authenticity'||cert.type==='Ripped Certificate of Authenticity')confidence*=.72;
  if(cert.type==='Limited Certificate of Authenticity')confidence*=.85;
  if(cert.type==='Premium Certificate of Authenticity')confidence*=.80;
  confidence*=Math.max(.35,1-unresolvedMass/140);

  const mainFit=containing!==undefined?Math.max(0,containing/baseline.main.utility*100):0;
  const rare=cert.type==='Limited Certificate of Authenticity'||cert.type==='Premium Certificate of Authenticity';
  let verdict:CertificateDecisionVerdict='HOLD';
  let decisionBasis:CertificateTargetDecision['decisionBasis']='None';

  const mainBlocked=expectedLow<-.5||chanceMainWorse>=55;
  const mainUse=expectedLow>(rare?2:1)&&chance>=(rare?45:35)&&chanceMainWorse<=25&&confidence>=45;
  const mainConsider=expected>.25&&potentialChance>=20&&chanceMainWorse<45;
  const contextualConsider=expected>=-.05&&expectedContextual>=1&&chanceMainWorse<30;

  if(unresolvedMass>1e-6){
    if(!mainBlocked&&expectedLow>.5&&chance>=25&&chancePotentialWorse<30){
      verdict='CONSIDER';decisionBasis='Main Auction';
    }else if(!mainBlocked&&expected>=-.05&&expectedContextual>=1&&chancePotentialWorse<25){
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
    expectedPreference>=0.20 &&
    chancePreferenceImprove>=40 &&
    chancePreferenceWorse<20
  ){
    // Personal effect tiers are an ordinal secondary preference only. They can support
    // a Main-competitive item, but never override a weaker Main Auction result.
    verdict='CONSIDER';decisionBasis='Main secondary preference';
  }else{
    // Main is neutral: only now may specialist value matter. Specialists are lexicographic,
    // not pooled: Drink Prep -> Grading -> Shop / Idle.
    const specialistSignal=(ev:number,improve:(b:Branch)=>boolean,worseChance:number)=>
      ev>=3&&resolved.filter(improve).reduce((sum,b)=>sum+b.p,0)*100>=40&&worseChance<20;
    const neutral=(ev:number,worseChance:number)=>Math.abs(ev)<.25&&worseChance<10;

    if(specialistSignal(expectedDrink,b=>b.drink>1e-4,chanceDrinkWorse)){
      verdict='CONSIDER';decisionBasis='Drink Prep';
    }else if(neutral(expectedDrink,chanceDrinkWorse)&&specialistSignal(expectedGrading,b=>b.grading>1e-4,chanceGradingWorse)){
      verdict='CONSIDER';decisionBasis='Grading';
    }else if(
      neutral(expectedDrink,chanceDrinkWorse)&&
      neutral(expectedGrading,chanceGradingWorse)&&
      specialistSignal(expectedShop,b=>b.shop>1e-4,chanceShopWorse)
    ){
      verdict='CONSIDER';decisionBasis='Shop / Idle';
    }
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
    chanceMainWorsePct:chanceMainWorse,
    chancePotentialWorsePct:chancePotentialWorse,
    chanceDrinkPrepWorsePct:chanceDrinkWorse,
    chanceGradingWorsePct:chanceGradingWorse,
    chanceShopWorsePct:chanceShopWorse,
    chancePersonalPreferenceImprovesPct:chancePreferenceImprove,
    chancePersonalPreferenceWorsePct:chancePreferenceWorse,
    expectedPersonalPreferenceDelta:expectedPreference,
    expectedImprovementPct:expected,
    expectedImprovementLowPct:expectedLow,
    expectedImprovementCentralPct:expectedCentral,
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
    unresolvedEffects:[...unresolvedEffects],
    decisionBasis,
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
      'Outcome selection uses the editable catalogue relative-weight class plus exact-certificate roll history. Default current rows are MEDIUM, so the starting prior is neutral.',
      cert.gradeStars!==undefined
        ?String(cert.gradeStars)+'★ quality is recorded. Higher grade is known to push rolls upward, but the exact transform is unpublished; the unshifted range is therefore treated as a conservative floor rather than inventing a multiplier.'
        :'Certificate grade effect is not assumed.',
      cert.mutation
        ?'Certificate mutation '+cert.mutation+' is recorded and exact-mutation roll evidence is preferred when available; its unpublished strength shift is not fabricated.'
        :'No certificate mutation is recorded.',
      'Personal effect tiers are used only as an ordinal secondary signal when the target remains in a robust Main Auction trio; they never compensate for weaker Main utility.',
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
  if((p.verdict==='USE'||p.verdict==='CONSIDER')&&diff>=1&&p.chanceOfWorsePct<=d.chanceOfWorsePct+10){
    recommendation='PREFER PREMIUM CONVERSION';
  }else if((d.verdict==='USE'||d.verdict==='CONSIDER')&&diff<1){
    recommendation='DIRECT USE COMPETITIVE';
  }

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
    modelNotes:[
      ...direct.modelNotes,
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

  const targets=data.gear
    .map(item=>targetDecision(data,cert,item,baselines))
    .filter((x):x is CertificateTargetDecision=>Boolean(x));

  const vr=(v:CertificateDecisionVerdict)=>({USE:0,CONSIDER:1,HOLD:2,'DO NOT USE':3}[v]);
  targets.sort((a,b)=>
    vr(a.verdict)-vr(b.verdict)||
    b.expectedImprovementLowPct-a.expectedImprovementLowPct||
    b.chanceOfImprovementPct-a.chanceOfImprovementPct||
    b.mainFitPct-a.mainFitPct
  );

  const recommendedTarget=targets[0];
  return {
    certificate:cert,
    verdict:recommendedTarget?.verdict??'HOLD',
    recommendedTarget,
    targets,
    modelNotes:[
      'The Authentication Outcome Catalogue is the live source of truth for enabled outcomes, ranges, confidence and user-assumed relative weighting.',
      'Default current rows use MEDIUM relative weight unless edited; hidden exact game odds are not claimed.',
      'Exact-certificate observations update outcome weights and progressively dominate roll-strength priors as samples grow.',
      'Unresolved Luck/Focused/custom mechanics are never silently treated as known zero-value rolls.',
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

  if(decisions.some(d=>d.certificate.type==='Wooden Certificate of Authenticity')){
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
