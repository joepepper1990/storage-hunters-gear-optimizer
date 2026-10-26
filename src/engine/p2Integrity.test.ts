import {describe,it,expect} from 'vitest';
import {makeInitialData,makeEmptyData} from '../defaults';
import {selectNewestStoredSnapshot} from '../data/storage';
import {empiricalSupports,compareCertificateTargets,analyseOwnedCertificates} from './certificateDecision';

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
  it('never presents an unpriced conversion as an economic recommendation',()=>{
    const data=makeInitialData();
    const decision=analyseOwnedCertificates(data).find(d=>d.conversion);
    expect(decision?.conversion?.recommendation).not.toBe('PREFER PREMIUM CONVERSION');
    expect(decision?.conversion?.reason).toContain('affordability');
  });
});
