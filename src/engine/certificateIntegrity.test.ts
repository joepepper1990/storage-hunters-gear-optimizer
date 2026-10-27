import { describe, expect, it } from 'vitest';
import { makeInitialData, ZERO_STATS } from '../defaults';
import type { AppData, CertificateRollLog, OwnedCertificate, Slot } from '../types';
import { analyseCertificate, analyseConditionalNumberReroll, certificateEvidenceCoverage, certificateOutcomeLikelihoods, specialistUtilityDelta } from './certificateDecision';

const cert:OwnedCertificate={id:'test',type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:2,mutation:'Onyx'};
function fixture():AppData {
  const data=makeInitialData();data.rollLog=[];
  data.gear=(['Head','Back','Wrist'] as Slot[]).map(slot=>({id:slot,baseName:slot,name:slot,slot,stats:{...ZERO_STATS,luck:100},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'2026-10-27',updatedAt:'2026-10-27'}));
  return data;
}
function roll(slot:Slot='Head',overrides:Partial<CertificateRollLog>={}):CertificateRollLog {
  return {id:'r',date:'2026-10-27',certificateType:'Normal Certificate of Authenticity',certificateInventoryType:cert.type,certificateGradeStars:2,certificateMutation:'Onyx',itemId:slot,itemName:slot,slot,previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:75,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0,...overrides};
}
function onlyZone(data:AppData){
  data.authModel=data.authModel.filter(row=>row.certificateInventoryType===cert.type&&row.outcome==='Bid Zone Width').map(row=>({...row,slot:'Any',min:15,max:75,typical:undefined,observedValues:[],observedSampleCount:0}));
}

describe('certificate evidence and numerical integrity',()=>{
  it('strips other-slot Any-row observations before legacy counts, including explicitly excluded histories',()=>{
    const data=fixture();
    const before=certificateOutcomeLikelihoods(data,cert,'Head');
    data.rollLog=[roll('Back',{certificateGradeStars:1,certificateMutation:'Diamond'})];
    data.authModel=data.authModel.map(row=>row.certificateInventoryType===cert.type&&row.outcome==='Bid Zone Width'?{...row,observedValues:[75],observedSampleCount:1}:row);
    expect(certificateOutcomeLikelihoods(data,cert,'Head')).toEqual(before);
  });
  it('does not duplicate partial roll strengths through model-only fallback while retaining manual samples',()=>{
    const data=fixture();onlyZone(data);
    const unknown={...cert,gradeStars:undefined,mutation:undefined};
    data.rollLog=[roll('Head',{certificateGradeStars:undefined,certificateMutation:undefined})];
    const current=roll();
    const before=analyseConditionalNumberReroll(data,current,unknown)!;
    data.authModel[0].observedValues=[75];data.authModel[0].observedSampleCount=1;
    const represented=analyseConditionalNumberReroll(data,current,unknown)!;
    expect(represented.expectedMainPct).toBeCloseTo(before.expectedMainPct,12);
    data.authModel[0].observedValues.push(75);data.authModel[0].observedSampleCount++;
    expect(analyseConditionalNumberReroll(data,current,unknown)!.expectedMainPct).toBeGreaterThan(before.expectedMainPct);
  });
  it('preserves exact / partial / excluded evidence matching after stripping provenance',()=>{
    const data=fixture();
    data.rollLog=[roll(),roll('Head',{id:'partial',certificateGradeStars:undefined}),roll('Head',{id:'excluded',certificateMutation:'Diamond'})];
    expect(certificateEvidenceCoverage(data,cert,'Head')).toEqual({exact:1,partial:1,excluded:1});
  });
  it('cannot pass the 25% downside policy when midpoint rounding reports 25% for a true 25.4%',()=>{
    const data=fixture();onlyZone(data);
    data.authModel[0]={...data.authModel[0],min:0,max:100,confidence:'Empirical'};
    data.gear[0].authenticated=true;data.gear[0].authentication={kind:'Normal',effect:'Bid Zone Width',value:25.4};
    const target=analyseCertificate(data,cert,undefined,'Head').recommendedTarget!;
    expect(target.chanceMainWorsePct).toBeCloseTo(25,8);
    expect(target.numericalProbabilityErrorPct).toBeGreaterThanOrEqual(1-1e-10);
    expect(target.verdict).not.toBe('USE');
    const conditional=analyseConditionalNumberReroll(data,roll('Head',{newValue:25.4}),cert)!;
    expect(conditional.chanceMainWorseUpperBoundPct).toBeGreaterThan(25.4);
  });
  it('keeps empirical atom mass exact and applies the integration guard only to remaining prior mass',()=>{
    const data=fixture();onlyZone(data);data.authModel[0]={...data.authModel[0],min:0,max:100};
    data.gear[0].authenticated=true;data.gear[0].authentication={kind:'Normal',effect:'Bid Zone Width',value:25.4};
    data.rollLog=Array.from({length:72},(_,i)=>roll('Head',{id:String(i),newValue:0}));
    const result=analyseConditionalNumberReroll(data,roll(),cert)!;
    expect(result.chanceMainWorsePct).toBeCloseTo(92.5,8);
    expect(result.chanceMainWorseUpperBoundPct-result.chanceMainWorsePct).toBeCloseTo(.1,8);
  });
  it('requires the specialist EV threshold to pass its integration lower bound',()=>{
    const data=fixture();onlyZone(data);
    data.gear.push({...structuredClone(data.gear[0]),id:'strong-head',stats:{...ZERO_STATS,luck:200}});
    data.authModel[0]={...data.authModel[0],outcome:'Energy Drink Time',min:2.01,max:4.01};
    const target=analyseCertificate(data,cert,undefined,'Head').recommendedTarget!;
    expect(target.expectedDrinkPrepPct).toBeGreaterThan(3);
    expect(target.expectedDrinkPrepLowerBound).toBeLessThan(3);
    expect(target.verdict).toBe('HOLD');
  });
  it('uses continuous specialist utility points at zero and tiny baselines',()=>{
    expect(specialistUtilityDelta(1,0)).toBe(1);
    expect(specialistUtilityDelta(1.001,.001)).toBeCloseTo(1,12);
    const zero=fixture();onlyZone(zero);
    zero.authModel[0]={...zero.authModel[0],outcome:'Energy Drink Time',min:1,max:2};
    const tiny=structuredClone(zero);tiny.gear[0].stats.energy=.001;
    const a=analyseCertificate(zero,cert,undefined,'Head').recommendedTarget!;
    const b=analyseCertificate(tiny,cert,undefined,'Head').recommendedTarget!;
    expect(b.expectedDrinkPrepPct).toBeCloseTo(a.expectedDrinkPrepPct,8);
    expect(b.verdict).toBe(a.verdict);
  });
});
