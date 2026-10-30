import { describe, expect, it } from 'vitest';
import { makeInitialData, ZERO_STATS } from '../defaults';
import type { AppData, CertificateRollLog, OwnedCertificate, Slot } from '../types';
import { analyseCertificate, analyseConditionalNumberReroll, certificateOutcomeLikelihoods } from './certificateDecision';

const cert:OwnedCertificate={id:'test',type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:2,mutation:'Onyx'};
function fixture():AppData {
  const data=makeInitialData();data.rollLog=[];
  data.gear=(['Head','Back','Wrist'] as Slot[]).map(slot=>({id:slot,baseName:slot,name:slot,slot,stats:{...ZERO_STATS,luck:100},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'2026-10-27',updatedAt:'2026-10-27'}));
  return data;
}
function roll(slot:Slot='Head',overrides:Partial<CertificateRollLog>={}):CertificateRollLog {
  return {id:'r',date:'2026-10-27',certificateType:'Normal Certificate of Authenticity',certificateInventoryType:cert.type,certificateGradeStars:2,certificateMutation:'Onyx',itemId:slot,itemName:slot,slot,previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:75,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0,...overrides};
}
/** Sets the Wooden Zone range. Other outcomes stay in the fixed pool. */
function zoneRange(data:AppData,min:number,max:number,typical?:number){
  data.authModel=data.authModel.map(row=>row.certificateInventoryType===cert.type&&row.outcome==='Bid Zone Width'
    ?{...row,min,max,typical,observedValues:[],observedSampleCount:0}:row);
}

describe('certificate evidence and numerical integrity',()=>{
  it('never lets observations change which effect is rolled',()=>{
    const data=fixture();
    const before=certificateOutcomeLikelihoods(data,cert,'Head');
    data.rollLog=[roll('Back',{certificateGradeStars:1,certificateMutation:'Diamond'}),roll('Head')];
    data.authModel=data.authModel.map(row=>row.certificateInventoryType===cert.type&&row.outcome==='Bid Zone Width'?{...row,observedValues:[75],observedSampleCount:1}:row);
    expect(certificateOutcomeLikelihoods(data,cert,'Head')).toEqual(before);
  });

  it('adds the integration guard so a true 25.4% downside cannot read as 25%',()=>{
    const data=fixture();zoneRange(data,0,100);
    data.gear[0].authenticated=true;data.gear[0].authentication={kind:'Normal',effect:'Bid Zone Width',value:25.4};
    const conditional=analyseConditionalNumberReroll(data,roll('Head',{newValue:25.4}),cert)!;
    expect(conditional.worseChancePct).toBeCloseTo(25,8);
    expect(conditional.worseChanceUpperPct).toBeGreaterThan(25.4);
    const target=analyseCertificate(data,cert,undefined,'Head').targets[0];
    expect(target.numericalProbabilityErrorPct).toBeGreaterThan(0);
  });

  it('keeps empirical atom mass exact and applies the integration guard only to remaining prior mass',()=>{
    const data=fixture();zoneRange(data,0,100);
    data.gear[0].authenticated=true;data.gear[0].authentication={kind:'Normal',effect:'Bid Zone Width',value:25.4};
    data.rollLog=Array.from({length:72},(_,i)=>roll('Head',{id:String(i),newValue:0}));
    const result=analyseConditionalNumberReroll(data,roll(),cert)!;
    expect(result.worseChancePct).toBeCloseTo(92.5,8);
    expect(result.worseChanceUpperPct-result.worseChancePct).toBeCloseTo(.1,8);
  });

  it('integrates exact tent-prior bin mass when the mode falls inside a bin',()=>{
    const data=fixture();zoneRange(data,15,75,47.3);
    data.gear[0].authenticated=true;data.gear[0].authentication={kind:'Normal',effect:'Bid Zone Width',value:47.4};
    const result=analyseConditionalNumberReroll(data,roll('Head',{newValue:47.4}),cert)!;
    const x=47.4,mode=47.3;
    const integral=.15*(x-15)+(mode-15)/2+(x-mode)-(x-mode)**2/(2*(75-mode));
    expect(result.worseChancePct).toBeCloseTo(integral/(.65*60)*100,8);
    expect(result.resolvedMassPct).toBeCloseTo(100,8);
    expect(result.worseChanceUpperPct).toBeGreaterThan(result.worseChancePct);
  });
});
