import {it,expect} from 'vitest';
import {makeInitialData,ZERO_STATS} from '../defaults';
import {analyseCertificate,analyseConditionalNumberReroll} from './certificateDecision';
import {analysePostRollOptions} from './certificateReroll';
import type {Slot,OwnedCertificate} from '../types';
const cert:OwnedCertificate={id:'bounds',type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:2};
function fixture(){const d=makeInitialData();d.rollLog=[];d.gear=(['Head','Back','Wrist'] as Slot[]).map(slot=>({id:slot,baseName:slot,name:slot,slot,stats:{...ZERO_STATS,luck:100},authenticated:false,authentication:{kind:'None' as const,effect:'',value:0},favourite:false,createdAt:'',updatedAt:''}));return d;}
it('does not recommend a paid number reroll when only its midpoint estimate meets30%',()=>{
 const d=fixture();d.gear[0].stats.arrowReduction=70;
 d.gear[0].authenticated=true;d.gear[0].authentication={kind:'Normal' as never,effect:'Bid Zone Width',value:15};
 d.gear.push({...structuredClone(d.gear[0]),id:'alternative',authentication:{kind:'Normal' as never,effect:'Bid Zone Width',value:57.24}});
 const r:any={id:'r',itemId:'Head',newAuthentication:'Bid Zone Width',newValue:15,certificateInventoryType:cert.type,certificateGradeStars:2};
 const result=analyseConditionalNumberReroll(d,r,cert)!;
 expect(result.improveChancePct).toBeCloseTo(30,8);
 expect(analysePostRollOptions(d,r)!.numberReroll!.recommendable).toBe(false);
 expect(analysePostRollOptions(d,r)!.recommendation).toBe('ACCEPT');
});
it('includes unknown native Arrow overshoot in the downside upper bound',()=>{
 const d=fixture();d.gear.forEach(g=>g.stats.luck=0);d.gear[1].stats.arrowReduction=75;
 const t=analyseCertificate(d,cert,undefined,'Back').targets[0];
 expect(t.unresolvedOutcomeMassPct).toBeCloseTo(100/9,8);
 expect(t.worseChanceUpperPct).toBeGreaterThanOrEqual(100/9+10.416-1e-6);
});
it('bounds a narrow improvement interval even when no midpoint observes it',()=>{
 const d=fixture();d.gear[0].stats.arrowReduction=69.9;
 d.authModel=d.authModel.map(m=>m.certificateInventoryType===cert.type&&m.outcome==='Bid Arrow Speed'?{...m,min:-100,max:0,typical:undefined}:m);
 d.settings.arrowTargetMax=70.01;
 const t=analyseCertificate(d,cert,undefined,'Head').targets[0];
 expect(t.improveChanceUpperPct).toBeGreaterThanOrEqual(50.0209);
});
it('counts losing Night as downside even when replacing Nocturnal improves Day',()=>{
 const d=fixture();d.gear[0].stats.arrowReduction=70;
 d.gear[0].authenticated=true;d.gear[0].authentication={kind:'Normal' as never,effect:'Nocturnal',value:100};
 const t=analyseCertificate(d,cert,undefined,'Head').targets[0];
 // Sunny is10% of the pool and every strength loses the100 Night bonus.
 expect(t.worseChancePct.cautious).toBeGreaterThanOrEqual(10-1e-8);
 expect(t.outcomes.find(o=>o.effect==='Sunny')!.improvePct.cautious).toBe(0);
});
it('encloses dense independent Arrow probabilities on both sides of wide and narrow bands',()=>{
 for(const baseArrow of [10,45,69.9,85,100])for(const bandMax of [90,70.01]){
  const d=fixture();d.settings.arrowTargetMax=bandMax;
  d.gear[0].stats.arrowReduction=baseArrow;
  d.gear[0].authenticated=true;d.gear[0].authentication={kind:'Normal' as never,effect:'Bid Arrow Speed',value:-20};
  const roll:any={itemId:'Head',newAuthentication:'Bid Arrow Speed',newValue:-20};
  const result=analyseConditionalNumberReroll(d,roll,cert)!;
  const distance=(arrow:number)=>arrow<70?70-arrow:arrow>bandMax?arrow-bandMax:0;
  const beforeArrow=baseArrow+20,beforeDistance=distance(beforeArrow);
  const beforeUtility=300+Math.min(beforeArrow,70);
  let better=0,worse=0;
  const n=4000;
  for(let i=0;i<n;i++){
   const arrow=baseArrow+12+48*(i+.5)/n,dist=distance(arrow),utility=300+Math.min(arrow,70);
   const change=Math.abs(dist-beforeDistance)>1e-9?(dist<beforeDistance?100:-100):(utility-beforeUtility)/beforeUtility*100;
   if(change>1e-4)better++;
   if(change < -1e-4)worse++;
  }
  expect(result.improveChanceLowerPct).toBeLessThanOrEqual(better/n*100+.03);
  expect(result.improveChanceUpperPct).toBeGreaterThanOrEqual(better/n*100-.03);
  expect(result.worseChanceUpperPct).toBeGreaterThanOrEqual(worse/n*100-.03);
 }
});
