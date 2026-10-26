import type { AppData, GearItem, MainAuctionContext, OwnedCertificate, Slot } from '../types';
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
  priorWeight: number;
  confidence: number;
  mainRelevant: boolean;
  specialist?: 'Drink Prep' | 'Grading' | 'Shop / Idle';
  note?: string;
}

export interface CertificateTargetDecision {
  item: GearItem;
  verdict: CertificateDecisionVerdict;
  chanceOfImprovementPct: number;
  chanceOfMeaningfulImprovementPct: number;
  chanceOfAnyBenefitPct: number;
  chanceOfSecondaryImprovementPct: number;
  chanceOfWorsePct: number;
  expectedImprovementPct: number;
  expectedContextualMainPct: number;
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
}

type Branch = {
  p:number;
  delta:number;
  contextual:number;
  drink:number;
  grading:number;
  shop:number;
  anyBenefit:boolean;
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
  {effect:'Luck',slot:'Any',priorWeight:4,confidence:.35,mainRelevant:true,note:'Confirmed outcome; a reliable public numeric roll range is not available.'},
  {effect:'Bid Recovery',slot:'Any',min:5,max:25,priorWeight:4,confidence:.70,mainRelevant:true},
  {effect:'Bid Arrow Speed',slot:'Any',min:-60,max:-12,priorWeight:4,confidence:.75,mainRelevant:true},
  {effect:'Bid Zone Width',slot:'Any',min:15,max:75,priorWeight:4,confidence:.75,mainRelevant:true},
  {effect:'Energy Drink Time',slot:'Any',min:10,max:50,priorWeight:4,confidence:.75,mainRelevant:false,specialist:'Drink Prep'},
  {effect:'Tip Chance',slot:'Any',min:3,max:15,priorWeight:4,confidence:.75,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'NPC Offers Bonus',slot:'Any',min:3,max:15,priorWeight:4,confidence:.75,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'Walkspeed',slot:'Any',min:10,max:50,priorWeight:4,confidence:.75,mainRelevant:false}
];
const NORMAL_EXCLUSIVE: Record<Slot,CertificateOutcomeDefinition[]> = {
  Head:[
    {effect:'Sunny',slot:'Head',min:10,max:100,priorWeight:1,confidence:.65,mainRelevant:false,note:'Day auction context only; no invented uptime average.'},
    {effect:'Nocturnal',slot:'Head',min:10,max:100,priorWeight:1,confidence:.65,mainRelevant:false,note:'Night auction context only; no invented uptime average.'},
    {effect:'Overcharged',slot:'Head',min:5,max:20,priorWeight:1,confidence:.60,mainRelevant:false,specialist:'Drink Prep'}
  ],
  Back:[
    {effect:'Raindrop',slot:'Back',min:10,max:100,priorWeight:1,confidence:.65,mainRelevant:false,note:'Rain auction context only; no invented uptime average.'},
    {effect:'Focused',slot:'Back',priorWeight:1,confidence:.25,mainRelevant:true,note:'Exact numerical formula remains unverified, so the central model is conservative.'}
  ],
  Wrist:[
    {effect:'Time Keeper',slot:'Wrist',min:5,max:40,priorWeight:1,confidence:.65,mainRelevant:false},
    {effect:'Connected',slot:'Wrist',min:2,max:12,priorWeight:1,confidence:.65,mainRelevant:false}
  ]
};
const RIPPED_BASIC: CertificateOutcomeDefinition[] = [
  {effect:'Bid Recovery',slot:'Any',min:3.8,max:13,priorWeight:4,confidence:.55,mainRelevant:true},
  {effect:'Bid Arrow Speed',slot:'Any',min:-30,max:-15,priorWeight:4,confidence:.40,mainRelevant:true},
  {effect:'Bid Zone Width',slot:'Any',min:11,max:38,priorWeight:4,confidence:.55,mainRelevant:true},
  {effect:'Energy Drink Time',slot:'Any',min:7,max:25,priorWeight:4,confidence:.55,mainRelevant:false,specialist:'Drink Prep'},
  {effect:'Tip Chance',slot:'Any',min:2.3,max:7.5,priorWeight:4,confidence:.55,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'NPC Offers Bonus',slot:'Any',min:2.3,max:7.5,priorWeight:4,confidence:.55,mainRelevant:false,specialist:'Shop / Idle'},
  {effect:'Walkspeed',slot:'Any',min:7.5,max:25,priorWeight:4,confidence:.55,mainRelevant:false}
];
const LIMITED: Record<Slot,CertificateOutcomeDefinition[]> = {
  Head:[
    {effect:'Auto X-Ray',slot:'Head',min:3,max:30,priorWeight:1,confidence:.85,mainRelevant:false},
    {effect:'Grade Re-Roll',slot:'Head',min:5,max:25,priorWeight:1,confidence:.90,mainRelevant:false,specialist:'Grading'}
  ],
  Back:[
    {effect:'Featherweight',slot:'Back',min:3,max:20,priorWeight:1,confidence:.90,mainRelevant:false},
    {effect:'Luck Frenzy',slot:'Back',min:10,max:110,priorWeight:1,confidence:.55,mainRelevant:true,note:'Magnitude is known; activation frequency and duration are scenario-modelled.'}
  ],
  Wrist:[
    {effect:'Second Chance',slot:'Wrist',min:4,max:33,priorWeight:1,confidence:.90,mainRelevant:false},
    {effect:'Steady Hand',slot:'Wrist',min:4,max:33,priorWeight:1,confidence:.80,mainRelevant:false}
  ]
};
const PREMIUM: Record<Slot,CertificateOutcomeDefinition[]> = {
  Head:[{effect:'Mutated Luck',slot:'Head',priorWeight:1,confidence:.70,mainRelevant:true,note:'Calculated from mutations on the actual equipped trio.'}],
  Back:[
    {effect:'Droughtbreaker',slot:'Back',priorWeight:1,confidence:.45,mainRelevant:true,note:'Evaluated through shared low/central/high stack scenarios.'},
    {effect:'Golden Hour',slot:'Back',priorWeight:1,confidence:.40,mainRelevant:true,note:'Evaluated through shared low/central/high session scenarios.'}
  ],
  Wrist:[
    {effect:'Club Pact',slot:'Wrist',priorWeight:1,confidence:.65,mainRelevant:false},
    {effect:'Temporal Split',slot:'Wrist',priorWeight:1,confidence:.60,mainRelevant:false}
  ]
};

export { gradeRerollExpectedValueGainPct, mutationLuckForItem, LUCKY_GRADING, mainAuctionUtility };

function outcomesFor(cert:OwnedCertificate,slot:Slot):CertificateOutcomeDefinition[] {
  if(cert.type==='Limited Certificate of Authenticity')return LIMITED[slot];
  if(cert.type==='Premium Certificate of Authenticity')return PREMIUM[slot];
  if(cert.type==='Ripped Certificate of Authenticity')return [...RIPPED_BASIC,...NORMAL_EXCLUSIVE[slot].filter(x=>['Raindrop','Time Keeper'].includes(x.effect))];
  return [...NORMAL_BASIC,...NORMAL_EXCLUSIVE[slot]];
}

function observedEffectCounts(data:AppData,cert:OwnedCertificate,slot:Slot):Map<string,number> {
  const kind=cert.type==='Limited Certificate of Authenticity'?'Limited':cert.type==='Premium Certificate of Authenticity'?'Premium':'Normal';
  const counts=new Map<string,number>();
  for(const r of data.rollLog){
    const rk=r.certificateType.startsWith('Limited')?'Limited':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Normal')?'Normal':'Alien';
    if(r.slot===slot&&rk===kind)counts.set(r.newAuthentication,(counts.get(r.newAuthentication)??0)+1);
  }
  return counts;
}

function outcomeProbabilities(defs:CertificateOutcomeDefinition[],counts:Map<string,number>) {
  const weighted=defs.map(def=>({def,w:def.priorWeight+(counts.get(def.effect)??0)}));
  const total=weighted.reduce((s,x)=>s+x.w,0)||1;
  return weighted.map(x=>({def:x.def,p:x.w/total}));
}

function rollValues(def:CertificateOutcomeDefinition,data:AppData,slot:Slot,cert:OwnedCertificate):number[] {
  if(def.min!==undefined&&def.max!==undefined){
    const observed=data.rollLog
      .filter(r=>r.slot===slot&&r.newAuthentication===def.effect&&
        (cert.gradeStars===undefined||r.certificateGradeStars===undefined||r.certificateGradeStars===cert.gradeStars))
      .map(r=>r.newValue)
      .filter(v=>Number.isFinite(v)&&v>=def.min!&&v<=def.max!);
    if(observed.length>=4){
      const sorted=[...observed].sort((a,b)=>a-b);
      const quantiles=Array.from({length:21},(_,i)=>sorted[Math.round((sorted.length-1)*(i/20))]);
      const prior=Array.from({length:21},(_,i)=>def.min!+(def.max!-def.min!)*(i/20));
      return [...prior,...quantiles];
    }
    return Array.from({length:51},(_,i)=>def.min!+(def.max!-def.min!)*(i/50));
  }
  const kind=cert.type==='Premium Certificate of Authenticity'?'Premium':cert.type==='Limited Certificate of Authenticity'?'Limited':'Normal';
  const observed=[
    ...data.gear.filter(g=>g.slot===slot&&g.authentication.kind===kind&&g.authentication.effect===def.effect).map(g=>g.authentication.value),
    ...data.rollLog.filter(r=>r.slot===slot&&r.newAuthentication===def.effect).map(r=>r.newValue)
  ].filter(v=>Number.isFinite(v)&&v!==0);
  return observed.length?[...new Set(observed)].sort((a,b)=>a-b):[0];
}

function replaceAuthentication(item:GearItem,cert:OwnedCertificate,effect:string,value:number):GearItem {
  const kind=cert.type==='Limited Certificate of Authenticity'?'Limited':cert.type==='Premium Certificate of Authenticity'?'Premium':'Normal';
  return {...item,authenticated:true,authentication:{kind,effect,value}};
}

function pct(after:number|undefined,before:number|undefined):number {
  if(after===undefined||before===undefined)return 0;
  if(Math.abs(before)<1e-9)return after-before;
  return (after-before)/Math.abs(before)*100;
}

function contextualGain(before:ReturnType<typeof buildGearLoadouts>,after:ReturnType<typeof buildGearLoadouts>):number {
  const contexts:Array<'day'|'night'|'rain'>=['day','night','rain'];
  return Math.max(0,...contexts.map(k=>pct(after[k]?.utility,before[k]?.utility)));
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

function targetDecision(data:AppData,cert:OwnedCertificate,item:GearItem):CertificateTargetDecision|undefined {
  const baseline=buildGearLoadouts(data.gear,data.settings,'central');
  if(!baseline.main||baseline.main.utility===0)return undefined;

  const containing=bestMainContaining(data,item);
  const bare={...item,authenticated:false,authentication:{kind:'None' as const,effect:'',value:0}};
  const without=buildGearLoadouts(data.gear.map(g=>g.id===item.id?bare:g),data.settings,'central');
  const authRisk=pct(baseline.main.utility,without.main?.utility);
  const defs=outcomesFor(cert,item.slot);
  const probs=outcomeProbabilities(defs,observedEffectCounts(data,cert,item.slot));
  const branches:Branch[]=[];
  let uncertain=false;

  for(const {def,p} of probs){
    const rolls=rollValues(def,data,item.slot,cert);
    if(def.min===undefined||def.max===undefined)uncertain=true;
    for(const value of rolls){
      const updated=replaceAuthentication(item,cert,def.effect,value);
      const gear=data.gear.map(g=>g.id===item.id?updated:g);
      const next=buildGearLoadouts(gear,data.settings,'central');
      const delta=pct(next.main?.utility,baseline.main.utility);
      const contextual=contextualGain(baseline,next);
      const drink=pct(next.drink?.utility,baseline.drink?.utility);
      const grading=pct(next.grading?.utility,baseline.grading?.utility);
      const shop=pct(next.shop?.utility,baseline.shop?.utility);
      const anyBenefit=delta>1e-4||contextual>1e-4||drink>1e-4||grading>1e-4||shop>1e-4;
      const starPenalty=cert.gradeStars&&cert.gradeStars>0?.08:0;
      branches.push({
        p:p/rolls.length,delta,contextual,drink,grading,shop,anyBenefit,
        confidence:Math.max(.1,def.confidence-starPenalty),
        label:def.effect+(value?' '+value.toFixed(1)+'%':'')
      });
    }
  }

  const total=branches.reduce((s,b)=>s+b.p,0)||1;
  for(const b of branches)b.p/=total;
  const improve=branches.filter(b=>b.delta>1e-4);
  const meaningful=branches.filter(b=>b.delta>=1);
  const worse=branches.filter(b=>b.delta<-1e-4);
  const secondary=branches.filter(b=>Math.max(b.contextual,b.drink,b.grading,b.shop)>1e-4);
  const chance=improve.reduce((s,b)=>s+b.p,0)*100;
  const meaningfulChance=meaningful.reduce((s,b)=>s+b.p,0)*100;
  const any=branches.filter(b=>b.anyBenefit).reduce((s,b)=>s+b.p,0)*100;
  const secondaryChance=secondary.reduce((s,b)=>s+b.p,0)*100;
  const chanceWorse=worse.reduce((s,b)=>s+b.p,0)*100;
  const expected=branches.reduce((s,b)=>s+b.p*b.delta,0);
  const expectedContextual=branches.reduce((s,b)=>s+b.p*b.contextual,0);
  const expectedDrink=branches.reduce((s,b)=>s+b.p*b.drink,0);
  const expectedGrading=branches.reduce((s,b)=>s+b.p*b.grading,0);
  const expectedShop=branches.reduce((s,b)=>s+b.p*b.shop,0);
  const avgGain=improve.length?improve.reduce((s,b)=>s+b.p*b.delta,0)/(improve.reduce((s,b)=>s+b.p,0)||1):0;
  const avgLoss=worse.length?worse.reduce((s,b)=>s+b.p*b.delta,0)/(worse.reduce((s,b)=>s+b.p,0)||1):0;
  const best=branches.reduce((a,b)=>b.delta>a.delta?b:a,branches[0]);
  const worst=branches.reduce((a,b)=>b.delta<a.delta?b:a,branches[0]);

  let confidence=branches.reduce((s,b)=>s+b.p*b.confidence,0)*100;
  if(cert.type==='Wooden Certificate of Authenticity'||cert.type==='Ripped Certificate of Authenticity')confidence*=.75;
  if(cert.type==='Limited Certificate of Authenticity')confidence*=.85;
  if(cert.type==='Premium Certificate of Authenticity')confidence*=.80;
  if(uncertain)confidence*=.85;

  const mainFit=containing!==undefined?Math.max(0,containing/baseline.main.utility*100):0;
  const rare=cert.type==='Limited Certificate of Authenticity'||cert.type==='Premium Certificate of Authenticity';
  const strongestSecondary=Math.max(expectedContextual,expectedDrink,expectedGrading,expectedShop);
  let verdict:CertificateDecisionVerdict='HOLD';
  if(expected<-.5||chanceWorse>=55)verdict='DO NOT USE';
  else if(expected>(rare?3:1.5)&&chance>=(rare?50:40)&&chanceWorse<=30&&confidence>=45)verdict='USE';
  else if(expected>.25&&chance>=20&&chanceWorse<50)verdict='CONSIDER';
  else if(expected>=-.05&&strongestSecondary>=3&&secondaryChance>=40&&chanceWorse<20)verdict='CONSIDER';

  const existing=item.authentication.effect.trim();
  if(item.authenticated&&['Focused','Mutated Luck','Droughtbreaker','Drought Breaker','Golden Hour','Luck Frenzy'].includes(existing)&&verdict==='USE'){
    verdict='CONSIDER';
    confidence=Math.min(confidence,55);
  }

  return {
    item,verdict,
    chanceOfImprovementPct:chance,
    chanceOfMeaningfulImprovementPct:meaningfulChance,
    chanceOfAnyBenefitPct:any,
    chanceOfSecondaryImprovementPct:secondaryChance,
    chanceOfWorsePct:chanceWorse,
    expectedImprovementPct:expected,
    expectedContextualMainPct:expectedContextual,
    expectedDrinkPrepPct:expectedDrink,
    expectedGradingPct:expectedGrading,
    expectedShopPct:expectedShop,
    averageGainWhenSuccessfulPct:avgGain,
    averageLossWhenWorsePct:avgLoss,
    bestCasePct:best?.delta??0,
    worstCasePct:worst?.delta??0,
    p10Pct:percentile(branches.map(b=>({x:b.delta,p:b.p})),.10),
    medianPct:percentile(branches.map(b=>({x:b.delta,p:b.p})),.50),
    p90Pct:percentile(branches.map(b=>({x:b.delta,p:b.p})),.90),
    currentAuthenticationValueAtRiskPct:authRisk,
    mainFitPct:mainFit,
    confidencePct:Math.max(0,Math.min(100,confidence)),
    bestPossibleOutcome:best?.label??'—',
    worstPossibleOutcome:worst?.label??'—',
    reasons:[
      'Main Auction uses the same unified Head + Back + Wrist evaluator as the Gear and Optimise screens.',
      item.authenticated?'Replaces current '+item.authentication.kind+' authentication: '+(existing||'unspecified')+(item.authentication.value?' '+item.authentication.value+'%':'')+'.':'Clean target: no current authentication is destroyed.',
      'Main Fit '+mainFit.toFixed(1)+'%: best current Main Auction trio containing this item versus the absolute best trio.',
      'Secondary loadouts are recalculated independently and may reuse the same physical item; they never compensate for a harmful Main Auction reroll.',
      cert.gradeStars?String(cert.gradeStars)+'★ quality is recorded, but the exact star-to-roll transform is unpublished; confidence is reduced instead of inventing a multiplier.':'Certificate grade effect is not assumed.',
      'Lucky Grading is ON.'
    ]
  };
}

export function analyseCertificate(data:AppData,cert:OwnedCertificate):OwnedCertificateDecision {
  const targets=data.gear.map(item=>targetDecision(data,cert,item)).filter((x):x is CertificateTargetDecision=>Boolean(x));
  const vr=(v:CertificateDecisionVerdict)=>({USE:0,CONSIDER:1,HOLD:2,'DO NOT USE':3}[v]);
  targets.sort((a,b)=>vr(a.verdict)-vr(b.verdict)||b.expectedImprovementPct-a.expectedImprovementPct||
    b.chanceOfImprovementPct-a.chanceOfImprovementPct||b.mainFitPct-a.mainFitPct);
  const recommendedTarget=targets[0];
  return {
    certificate:cert,
    verdict:recommendedTarget?.verdict??'HOLD',
    recommendedTarget,
    targets,
    modelNotes:[
      'Percentages are modelled decision probabilities, not hidden Roblox loot/mutation odds.',
      'Main Auction is solved first with the same shared engine used everywhere else.',
      'Drink Prep, Grading and Shop/Idle are separately re-optimised; one item may appear in several loadouts.',
      'Unknown effect weights use transparent priors plus recorded roll history; uncertainty reduces confidence.',
      'HOLD is a first-class option with zero guaranteed change.'
    ]
  };
}

export function analyseOwnedCertificates(data:AppData):OwnedCertificateDecision[] {
  return data.ownedCertificates.filter(c=>c.quantity>0).map(c=>analyseCertificate(data,c));
}
