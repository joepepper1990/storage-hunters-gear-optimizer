import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import type { CertificateRollLog, GearItem } from '../types';
import { applyRecordedCertificateRoll, correctRecordedCertificateRoll, deleteRecordedCertificateRoll, rollModelWarnings, withObservedAuthenticationStats } from './certificateRolls';
import { effectiveItemStats } from './scoring';

describe('certificate roll inventory integrity',()=>{
  it('consumes exactly the selected physical certificate and records its identity',()=>{
    const data=makeInitialData();
    const selected=data.ownedCertificates.find(c=>c.type==='Limited Certificate of Authenticity')!;
    selected.mutation='Secret';
    const other=data.ownedCertificates.filter(c=>c.type==='Limited Certificate of Authenticity').find(c=>c.id!==selected.id)!;
    const item=data.gear.find(g=>g.slot==='Head')!;
    const updated:GearItem={...item,authenticated:true,authentication:{kind:'Limited',effect:'Grade Re-Roll',value:25}};
    const roll:CertificateRollLog={
      id:'roll-1',date:'2026-10-26T00:00:00Z',certificateType:'Limited Certificate of Authenticity',
      itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,
      previousValue:item.authentication.value,newAuthentication:'Grade Re-Roll',newValue:25,
      improvedBestSet:false,bestScoreBefore:100,bestScoreAfter:100
    };
    const next=applyRecordedCertificateRoll(data,selected.id,roll,updated);
    expect(next.ownedCertificates.find(c=>c.id===selected.id)?.quantity).toBe(selected.quantity-1);
    expect(next.ownedCertificates.find(c=>c.id===other.id)?.quantity).toBe(other.quantity);
    const saved=next.rollLog.at(-1)!;
    expect(saved.certificateId).toBe(selected.id);
    expect(saved.certificateGradeStars).toBe(selected.gradeStars);
    expect(saved.certificateMutation).toBe('Secret');
    expect(saved.certificateInventoryType).toBe(selected.type);
  });

  it('refuses to consume a certificate with no quantity remaining',()=>{
    const data=makeInitialData();
    const selected=data.ownedCertificates[0];
    data.ownedCertificates=data.ownedCertificates.map(c=>c.id===selected.id?{...c,quantity:0}:c);
    const item=data.gear[0];
    const roll:CertificateRollLog={
      id:'roll-2',date:'2026-10-26T00:00:00Z',certificateType:'Limited Certificate of Authenticity',
      itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,
      previousValue:item.authentication.value,newAuthentication:'Auto X-Ray',newValue:10,
      improvedBestSet:false,bestScoreBefore:100,bestScoreAfter:100
    };
    expect(()=>applyRecordedCertificateRoll(data,selected.id,roll,item)).toThrow(/already been used/);
  });
  it('updates only the exact Wooden/Ripped catalogue row and preserves configured legal ranges',()=>{
    const data=makeInitialData();
    const wooden=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width'&&m.slot==='Any')!;
    const ripped=data.authModel.find(m=>m.certificateInventoryType==='Ripped Certificate of Authenticity'&&m.outcome==='Bid Zone Width'&&m.slot==='Any')!;
    const beforeWooden={min:wooden.min,typical:wooden.typical,max:wooden.max};
    const beforeRippedCount=ripped.observedSampleCount;
    const selected=data.ownedCertificates.find(c=>c.type==='Wooden Certificate of Authenticity')!;
    const item=data.gear.find(g=>g.slot==='Head')!;
    const updated:GearItem={...item,authenticated:true,authentication:{kind:'Normal',effect:'Bid Zone Width',value:70}};
    const roll:CertificateRollLog={
      id:'roll-wooden',date:'2026-10-26T00:00:00Z',certificateType:'Normal Certificate of Authenticity',
      certificateInventoryType:'Wooden Certificate of Authenticity',itemId:item.id,itemName:item.name,slot:item.slot,
      previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,
      newAuthentication:'Bid Zone Width',newValue:70,improvedBestSet:true,bestScoreBefore:100,bestScoreAfter:101
    };
    const next=applyRecordedCertificateRoll(data,selected.id,roll,updated);
    const nextWooden=next.authModel.find(m=>m.id===wooden.id)!;
    const nextRipped=next.authModel.find(m=>m.id===ripped.id)!;
    expect(nextWooden.observedValues).toContain(70);
    expect({min:nextWooden.min,typical:nextWooden.typical,max:nextWooden.max}).toEqual(beforeWooden);
    expect(nextRipped.observedSampleCount).toBe(beforeRippedCount);
  });

  it('stores Focused display changes on the authentication instead of baking them into base stats',()=>{
    const data=makeInitialData();
    const base=data.gear.find(g=>g.slot==='Back')!;
    const focused:GearItem={
      ...base,
      stats:{...base.stats,luck:50,zone:20},
      authenticated:true,
      authentication:{kind:'Normal',effect:'Focused',value:30}
    };
    const observed=withObservedAuthenticationStats(focused,{...effectiveItemStats(focused),luck:80});
    expect(observed.stats.luck).toBe(50);
    expect(observed.authentication.statDeltas?.luck).toBe(30);
    expect(effectiveItemStats(observed).luck).toBe(80);

    const rerolled:GearItem={
      ...observed,
      authenticated:true,
      authentication:{kind:'Normal',effect:'Luck',value:10}
    };
    expect(effectiveItemStats(rerolled).luck).toBe(60);
  });

  it('keeps out-of-range real observations as evidence and surfaces a model warning',()=>{
    const data=makeInitialData();
    const selected=data.ownedCertificates.find(c=>c.type==='Wooden Certificate of Authenticity')!;
    const item=data.gear.find(g=>g.slot==='Head')!;
    const updated:GearItem={...item,authenticated:true,authentication:{kind:'Normal',effect:'Bid Zone Width',value:99}};
    const roll:CertificateRollLog={
      id:'outlier',date:'2026-10-26T00:00:00Z',certificateType:'Normal Certificate of Authenticity',
      itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,
      previousValue:item.authentication.value,newAuthentication:'Bid Zone Width',newValue:99,
      improvedBestSet:true,bestScoreBefore:100,bestScoreAfter:101
    };
    expect(rollModelWarnings(data.authModel,{...roll,certificateInventoryType:selected.type})).toEqual(
      expect.arrayContaining([expect.stringContaining('above the configured maximum')])
    );
    const next=applyRecordedCertificateRoll(data,selected.id,roll,updated);
    const saved=next.rollLog.at(-1)!;
    expect(saved.modelWarnings?.some(w=>w.includes('above the configured maximum'))).toBe(true);
    const model=next.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width'&&m.slot==='Any')!;
    expect(model.observedValues).toContain(99);
  });

  it('corrects and deletes historical evidence without refunding certificate quantity or mutating current gear',()=>{
    const data=makeInitialData();
    const selected=data.ownedCertificates.find(c=>c.type==='Wooden Certificate of Authenticity')!;
    const item=data.gear.find(g=>g.slot==='Head')!;
    const updated:GearItem={...item,authenticated:true,authentication:{kind:'Normal',effect:'Bid Zone Width',value:70}};
    const roll:CertificateRollLog={
      id:'correct-me',date:'2026-10-26T00:00:00Z',certificateType:'Normal Certificate of Authenticity',
      itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,
      previousValue:item.authentication.value,newAuthentication:'Bid Zone Width',newValue:70,
      improvedBestSet:true,bestScoreBefore:100,bestScoreAfter:101
    };
    const recorded=applyRecordedCertificateRoll(data,selected.id,roll,updated);
    const quantity=recorded.ownedCertificates.find(c=>c.id===selected.id)!.quantity;
    const currentGear=structuredClone(recorded.gear);
    const corrected=correctRecordedCertificateRoll(recorded,'correct-me',{newAuthentication:'Bid Zone Width',newValue:20});
    const model=corrected.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width'&&m.slot==='Any')!;
    expect(model.observedValues).toContain(20);
    expect(model.observedValues).not.toContain(70);
    expect(corrected.ownedCertificates.find(c=>c.id===selected.id)!.quantity).toBe(quantity);
    expect(corrected.gear).toEqual(currentGear);

    const deleted=deleteRecordedCertificateRoll(corrected,'correct-me');
    expect(deleted.rollLog.some(r=>r.id==='correct-me')).toBe(false);
    expect(deleted.ownedCertificates.find(c=>c.id===selected.id)!.quantity).toBe(quantity);
    expect(deleted.gear).toEqual(currentGear);
  });

  it('keeps mechanic confidence separate from empirical sample confidence',()=>{
    const data=makeInitialData();
    const selected=data.ownedCertificates.find(c=>c.type==='Wooden Certificate of Authenticity')!;
    const item=data.gear.find(g=>g.slot==='Head')!;
    const original=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width'&&m.slot==='Any')!;
    let current=data;
    for(let i=0;i<10;i++){
      const updated:GearItem={...item,authenticated:true,authentication:{kind:'Normal',effect:'Bid Zone Width',value:50}};
      current=applyRecordedCertificateRoll(
        {...current,ownedCertificates:current.ownedCertificates.map(c=>c.id===selected.id?{...c,quantity:1}:c)},
        selected.id,
        {id:'confidence-'+i,date:'2026-10-26T00:00:00Z',certificateType:'Normal Certificate of Authenticity',itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:50,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0},
        updated
      );
    }
    const learned=current.authModel.find(m=>m.id===original.id)!;
    expect(learned.confidence).toBe(original.confidence);
    expect(learned.empiricalConfidence).toBe('Empirical');
  });

});
