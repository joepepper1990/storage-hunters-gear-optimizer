import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { authenticationCatalogueIssues, catalogueRowsFor, empiricalConfidenceForCount } from './authModel';

describe('authentication catalogue integrity',()=>{
  it('uses one deterministic row per effect and lets a slot-specific row override Any',()=>{
    const data=makeInitialData();
    const any=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width'&&m.slot==='Any')!;
    data.authModel.push({...any,id:'duplicate-any',min:99});
    data.authModel.push({...any,id:'slot-head',slot:'Head',min:70});
    const rows=catalogueRowsFor(data.authModel,'Wooden Certificate of Authenticity','Head');
    const zone=rows.filter(r=>r.outcome==='Bid Zone Width');
    expect(zone).toHaveLength(1);
    expect(zone[0].id).toBe('slot-head');
  });

  it('reports duplicate rows and invalid min/typical/max ordering',()=>{
    const data=makeInitialData();
    const row=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Recovery'&&m.slot==='Any')!;
    data.authModel.push({...row,id:'duplicate'});
    row.min=30;row.typical=20;row.max=10;
    const issues=authenticationCatalogueIssues(data.authModel);
    expect(issues.some(x=>x.includes('Duplicate live catalogue row'))).toBe(true);
    expect(issues.some(x=>x.includes('min exceeds max'))).toBe(true);
    expect(issues.some(x=>x.includes('typical is below min'))).toBe(true);
    expect(issues.some(x=>x.includes('typical is above max'))).toBe(true);
  });

  it('derives empirical confidence from sample size without changing mechanic confidence',()=>{
    expect(empiricalConfidenceForCount(0)).toBe('Unknown');
    expect(empiricalConfidenceForCount(1)).toBe('Low');
    expect(empiricalConfidenceForCount(4)).toBe('Medium');
    expect(empiricalConfidenceForCount(10)).toBe('Empirical');
  });
});
