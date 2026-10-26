import {describe,it,expect} from 'vitest';
import {makeInitialData,makeEmptyData} from '../defaults';
import {selectNewestStoredSnapshot,saveEmergencyMirror} from '../data/storage';
import {empiricalSupports,compareCertificateTargets,analyseOwnedCertificates,analyseCertificate,certificateOutcomeLikelihoods} from './certificateDecision';

describe('P2 statistical and recovery integrity',()=>{
  it('preserves observed frequencies and rare tails without quantile compression',()=>{
    const points=empiricalSupports([...Array(99).fill(10),100],1);
    expect(points.find(p=>p.value===100)?.weight).toBeCloseTo(.01);
    expect(points.find(p=>p.value===10)?.weight).toBeCloseTo(.99);
  });
  it('orders same-millisecond snapshots by revision regardless of source',()=>{
    const old={savedAt:100,revision:1,data:makeInitialData()};
    const fresh={savedAt:100,revision:2,data:makeEmptyData()};
    expect(selectNewestStoredSnapshot(old,fresh)).toBe(fresh);
    expect(selectNewestStoredSnapshot(fresh,old)).toBe(fresh);
  });
  it('does not rank attractive conditional EV above complete evidence',()=>{
    const partial={verdict:'CONSIDER',resolvedOutcomeMassPct:30,expectedImprovementLowPct:20,chanceOfImprovementPct:20,mainFitPct:100,item:{id:'partial'}};
    const complete={...partial,resolvedOutcomeMassPct:100,expectedImprovementLowPct:2,item:{id:'complete'}};
    expect(compareCertificateTargets(complete as never,partial as never)).toBeLessThan(0);
  });
  it('keeps a complete EV unavailable when the outcome range is unresolved',()=>{
    const data=makeInitialData();
    data.authModel=data.authModel.map(m=>({...m,enabled:m.outcome==='Luck'&&m.certificateInventoryType==='Wooden Certificate of Authenticity'}));
    const cert={id:'test',type:'Wooden Certificate of Authenticity' as const,quantity:1};
    const target=analyseCertificate(data,cert).targets[0];
    expect(target.fullExpectedMainPct).toBeNull();
    expect(target.fullMainUpperBoundPct).toBeNull();
    expect(target.fullMainLowerBoundPct).toBe(-100);
  });
  it('exposes sensitivity to weaker and stronger outcome priors',()=>{
    const data=makeInitialData();
    const cert={id:'test',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    const item=data.gear.find(g=>g.slot==='Head')!;
    data.rollLog=[{id:'one',date:'2026-10-26',certificateType:'Normal Certificate of Authenticity',certificateInventoryType:cert.type,certificateGradeStars:2,itemId:item.id,itemName:item.name,slot:'Head',previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:50,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0}];
    const row=certificateOutcomeLikelihoods(data,cert,'Head').find(r=>r.effect==='Bid Zone Width')!;
    expect(row.minProbability).toBeLessThan(row.probability);
    expect(row.maxProbability).toBeGreaterThan(row.probability);
  });
  it('allocates distinct mirror revisions even within one millisecond',()=>{
    const memory=new Map<string,string>();
    const previous=globalThis.localStorage;
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)}});
    try {
      saveEmergencyMirror(makeEmptyData(),100);
      const first=JSON.parse([...memory.values()][0]);
      saveEmergencyMirror(makeInitialData(),100);
      const second=JSON.parse([...memory.values()][0]);
      expect(second.revision).toBeGreaterThan(first.revision);
      expect(selectNewestStoredSnapshot(first,second)).toBe(second);
    } finally {Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous});}
  });
  it('never presents an unpriced conversion as an economic recommendation',()=>{
    const data=makeInitialData();
    const decision=analyseOwnedCertificates(data).find(d=>d.conversion);
    expect(decision?.conversion?.recommendation).not.toBe('PREFER PREMIUM CONVERSION');
    expect(decision?.conversion?.reason).toContain('affordability');
  });
});
