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
});
