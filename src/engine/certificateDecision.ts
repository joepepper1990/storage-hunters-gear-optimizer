import type { AppData, GearItem, OwnedCertificate, Slot } from '../types';
import { combineStats } from './scoring';

export type CertificateDecisionVerdict = 'USE' | 'CONSIDER' | 'HOLD' | 'DO NOT USE';
export type MainContext = 'Neutral' | 'Day' | 'Night' | 'Rain';

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
  chanceOfWorsePct: number;
  expectedImprovementPct: number;
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

type Branch = { p:number; delta:number; anyBenefit:boolean; confidence:number; label:string };

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

const MAIN = { luck:TIER.S, arrow:TIER.A, zone:TIER.B, recovery:TIER.D, arrowSweetSpot:75 };
export const LUCKY_GRADING = true;

const LUCKY_GRADES = [
  {p:.28,value:1.05,eligible:true},{p:.62,value:1.35,eligible:false},{p:.10,value:2.00,eligible:false}
] as const;
const STANDARD_GRADES = [
  {p:.22,value:.85,eligible:true},{p:.30,value:1.05,eligible:true},{p:.43,value:1.35,eligible:false},{p:.05,value:2.00,eligible:false}
] as const;

const MUTATED_LUCK: Record<string,number> = {
  Silver:5,Gold:10,Corrupted:15,Diamond:20,Gem:25,Chrome:30,Hologram:35,Void:40,Secret:45,Rainbow:60,Onyx:75
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
    {effect:'Luck Frenzy',slot:'Back',min:10,max:110,priorWeight:1,confidence:.55,mainRelevant:true,note:'Magnitude is known; activation frequency and duration are not.'}
  ],
  Wrist:[
    {effect:'Second Chance',slot:'Wrist',min:4,max:33,priorWeight:1,confidence:.90,mainRelevant:false},
    {effect:'Steady Hand',slot:'Wrist',min:4,max:33,priorWeight:1,confidence:.80,mainRelevant:false}
  ]
};
const PREMIUM: Record<Slot,CertificateOutcomeDefinition[]> = {
  Head:[{effect:'Mutated Luck',slot:'Head',priorWeight:1,confidence:.70,mainRelevant:true,note:'Calculated from mutations on the actual equipped trio.'}],
  Back:[
    {effect:'Droughtbreaker',slot:'Back',priorWeight:1,confidence:.45,mainRelevant:true,note:'Central model uses 3/5 stacks and is confidence-downgraded.'},
    {effect:'Golden Hour',slot:'Back',priorWeight:1,confidence:.40,mainRelevant:true,note:'Central model uses +50 Luck, halfway to the reported ~+100 cap.'}
  ],
  Wrist:[
    {effect:'Club Pact',slot:'Wrist',priorWeight:1,confidence:.65,mainRelevant:false},
    {effect:'Temporal Split',slot:'Wrist',priorWeight:1,confidence:.60,mainRelevant:false}
  ]
};

export function gradeRerollExpectedValueGainPct(rollPct:number,lucky=LUCKY_GRADING):number {
  const grades=lucky?LUCKY_GRADES:STANDARD_GRADES;
  const baseline=grades.reduce((s,g)=>s+g.p*g.value,0);
  const gain=grades.filter(g=>g.eligible).reduce((s,g)=>s+g.p*(rollPct/100)*(baseline-g.value),0);
  return baseline>0?gain/baseline*100:0;
}

export function mutationLuckForItem(item:GearItem):number {
  return (item.mutation??'').split('+').map(x=>x.trim()).reduce((best,name)=>Math.max(best,MUTATED_LUCK[name]??0),0);
}

function dynamicLuck(items:GearItem[],context:MainContext):number {
  let luck=0;
  for(const item of items){
    if(!item.authenticated)continue;
    const effect=item.authentication.effect.trim();
    const value=Number(item.authentication.value)||0;
    if(effect==='Mutated Luck')luck+=items.reduce((s,g)=>s+mutationLuckForItem(g),0);
    else if(effect==='Droughtbreaker'||effect==='Drought Breaker')luck+=value*3;
    else if(effect==='Golden Hour')luck+=value>0?Math.min(100,value):50;
    else if(effect==='Luck Frenzy')luck+=value*.15;
    else if(effect==='Sunny'&&context==='Day')luck+=value;
    else if(effect==='Nocturnal'&&context==='Night')luck+=value;
    else if(effect==='Raindrop'&&context==='Rain')luck+=value;
  }
  return luck;
}

export function mainAuctionUtility(items:GearItem[],context:MainContext='Neutral'):number {
  const stats=combineStats(items);
  const luck=stats.luck+dynamicLuck(items,context);
  const arrow=stats.arrowReduction<0?stats.arrowReduction:Math.min(stats.arrowReduction,MAIN.arrowSweetSpot);
  return luck*MAIN.luck+arrow*MAIN.arrow+stats.zone*MAIN.zone+stats.recovery*MAIN.recovery;
}

function bestUtility(gear:GearItem[],context:MainContext='Neutral',requiredId?:string):{utility:number;items:GearItem[]}|undefined {
  const heads=gear.filter(g=>g.slot==='Head'),backs=gear.filter(g=>g.slot==='Back'),wrists=gear.filter(g=>g.slot==='Wrist');
  if(!heads.length||!backs.length||!wrists.length)return undefined;
  let best=-Infinity,bestItems:GearItem[]=[];
  for(const h of heads)for(const b of backs)for(const w of wrists){
    const trio=[h,b,w];
    if(requiredId&&!trio.some(x=>x.id===requiredId))continue;
    const u=mainAuctionUtility(trio,context);
    if(u>best){best=u;bestItems=trio;}
  }
  return Number.isFinite(best)?{utility:best,items:bestItems}:undefined;
}

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
    const n=51,out:number[]=[];
    for(let i=0;i<n;i++)out.push(def.min+(def.max-def.min)*(i/(n-1)));
    return out;
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

function specialistBenefit(def:CertificateOutcomeDefinition,value:number):number {
  if(def.effect==='Grade Re-Roll')return gradeRerollExpectedValueGainPct(Math.max(0,value),true);
  if(def.effect==='Energy Drink Time')return Math.max(0,value);
  if(def.effect==='Overcharged')return Math.max(0,value)*TIER.B;
  if(def.effect==='Tip Chance')return Math.max(0,value)*TIER.C;
  if(def.effect==='NPC Offers Bonus')return Math.max(0,value)*TIER['C-D'];
  if(def.effect==='Featherweight')return Math.max(0,value)*TIER.B*.1;
  return TIER[USER_EFFECT_TIER[def.effect]??'F']*.1;
}

function percentile(values:Array<{x:number;p:number}>,q:number):number {
  const sorted=[...values].sort((a,b)=>a.x-b.x);
  let c=0;
  for(const v of sorted){c+=v.p;if(c+1e-12>=q)return v.x;}
  return sorted.at(-1)?.x??0;
}

function targetDecision(data:AppData,cert:OwnedCertificate,item:GearItem):CertificateTargetDecision|undefined {
  const baseline=bestUtility(data.gear,'Neutral');
  if(!baseline||baseline.utility===0)return undefined;
  const containing=bestUtility(data.gear,'Neutral',item.id);
  const bare={...item,authenticated:false,authentication:{kind:'None' as const,effect:'',value:0}};
  const without=bestUtility(data.gear.map(g=>g.id===item.id?bare:g),'Neutral')?.utility??baseline.utility;
  const authRisk=(baseline.utility-without)/Math.abs(baseline.utility)*100;
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
      const next=bestUtility(gear,'Neutral')?.utility??baseline.utility;
      const delta=(next-baseline.utility)/Math.abs(baseline.utility)*100;
      let contextual=0;
      if(['Sunny','Nocturnal','Raindrop'].includes(def.effect)){
        for(const ctx of ['Day','Night','Rain'] as MainContext[]){
          const before=bestUtility(data.gear,ctx)?.utility??baseline.utility;
          const after=bestUtility(gear,ctx)?.utility??before;
          contextual=Math.max(contextual,before?((after-before)/Math.abs(before))*100:0);
        }
      }
      const secondary=specialistBenefit(def,value);
      const anyBenefit=delta>1e-4||(Math.abs(delta)<=1e-4&&(contextual>1e-4||secondary>1e-4));
      const starPenalty=cert.gradeStars && cert.gradeStars>0 ? .08 : 0;
      branches.push({p:p/rolls.length,delta,anyBenefit,confidence:Math.max(.1,def.confidence-starPenalty),label:def.effect+(value?' '+value.toFixed(1)+'%':'')});
    }
  }

  const total=branches.reduce((s,b)=>s+b.p,0)||1;
  for(const b of branches)b.p/=total;
  const improve=branches.filter(b=>b.delta>1e-4),meaningful=branches.filter(b=>b.delta>=1),worse=branches.filter(b=>b.delta<-1e-4);
  const chance=improve.reduce((s,b)=>s+b.p,0)*100;
  const meaningfulChance=meaningful.reduce((s,b)=>s+b.p,0)*100;
  const any=branches.filter(b=>b.anyBenefit).reduce((s,b)=>s+b.p,0)*100;
  const chanceWorse=worse.reduce((s,b)=>s+b.p,0)*100;
  const expected=branches.reduce((s,b)=>s+b.p*b.delta,0);
  const avgGain=improve.length?improve.reduce((s,b)=>s+b.p*b.delta,0)/(improve.reduce((s,b)=>s+b.p,0)||1):0;
  const avgLoss=worse.length?worse.reduce((s,b)=>s+b.p*b.delta,0)/(worse.reduce((s,b)=>s+b.p,0)||1):0;
  const best=branches.reduce((a,b)=>b.delta>a.delta?b:a,branches[0]);
  const worst=branches.reduce((a,b)=>b.delta<a.delta?b:a,branches[0]);

  let confidence=branches.reduce((s,b)=>s+b.p*b.confidence,0)*100;
  if(cert.type==='Wooden Certificate of Authenticity'||cert.type==='Ripped Certificate of Authenticity')confidence*=.75;
  if(cert.type==='Limited Certificate of Authenticity')confidence*=.85;
  if(cert.type==='Premium Certificate of Authenticity')confidence*=.80;
  if(uncertain)confidence*=.85;

  const mainFit=containing?Math.max(0,containing.utility/baseline.utility*100):0;
  const rare=cert.type==='Limited Certificate of Authenticity'||cert.type==='Premium Certificate of Authenticity';
  let verdict:CertificateDecisionVerdict='HOLD';
  if(expected<-.5||chanceWorse>=55)verdict='DO NOT USE';
  else if(expected>(rare?3:1.5)&&chance>=(rare?50:40)&&chanceWorse<=30&&confidence>=45)verdict='USE';
  else if(expected>.25&&chance>=20&&chanceWorse<50)verdict='CONSIDER';

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
    chanceOfWorsePct:chanceWorse,
    expectedImprovementPct:expected,
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
      'Main Auction baseline is the best exhaustive Head + Back + Wrist trio; specialist effects never compensate for a Main loss.',
      item.authenticated?'Replaces current '+item.authentication.kind+' authentication: '+(existing||'unspecified')+(item.authentication.value?' '+item.authentication.value+'%':'')+'.':'Clean target: no current authentication is destroyed.',
      'Main Fit '+mainFit.toFixed(1)+'%: best current auction trio containing this item versus the absolute best trio.',
      cert.gradeStars?String(cert.gradeStars)+'★ quality is recorded, but the exact star-to-roll transform is unpublished; confidence is reduced instead of inventing a multiplier.':'Certificate grade effect is not assumed.',
      'Lucky Grading is ON; Grade Re-Roll uses 0% Replica / 28% 1★ / 62% 2★ / 10% 3★.'
    ]
  };
}

export function analyseCertificate(data:AppData,cert:OwnedCertificate):OwnedCertificateDecision {
  const targets=data.gear.map(item=>targetDecision(data,cert,item)).filter((x):x is CertificateTargetDecision=>Boolean(x));
  const vr=(v:CertificateDecisionVerdict)=>({USE:0,CONSIDER:1,HOLD:2,'DO NOT USE':3}[v]);
  targets.sort((a,b)=>vr(a.verdict)-vr(b.verdict)||b.expectedImprovementPct-a.expectedImprovementPct||b.chanceOfImprovementPct-a.chanceOfImprovementPct||b.mainFitPct-a.mainFitPct);
  const recommendedTarget=targets[0];
  return {
    certificate:cert,
    verdict:recommendedTarget?.verdict??'HOLD',
    recommendedTarget,
    targets,
    modelNotes:[
      'Percentages are modelled decision probabilities, not hidden Roblox loot/mutation odds.',
      'Main Auction always uses exactly one Head, one Back and one Wrist and is optimised before Drink Prep, Grading or Shop/Idle.',
      'Unknown effect weights use transparent priors plus recorded roll history; uncertainty reduces confidence.',
      'HOLD is a first-class option with zero guaranteed change.'
    ]
  };
}

export function analyseOwnedCertificates(data:AppData):OwnedCertificateDecision[] {
  return data.ownedCertificates.filter(c=>c.quantity>0).map(c=>analyseCertificate(data,c));
}
