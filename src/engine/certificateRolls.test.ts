import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import type { CertificateRollLog, GearItem } from '../types';
import { applyRecordedCertificateRoll } from './certificateRolls';

describe('certificate roll inventory integrity',()=>{
  it('consumes exactly the selected physical certificate and records its identity',()=>{
    const data=makeInitialData();
    const selected=data.ownedCertificates.find(c=>c.type==='Limited Certificate of Authenticity')!;
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

});
