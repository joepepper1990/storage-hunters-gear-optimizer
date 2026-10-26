import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import type { GearItem, GearStats, OwnedCertificate, Slot } from '../types';
import {
  analyseCertificate,
  gradeRerollExpectedValueGainPct,
  LUCKY_GRADING,
  mainAuctionUtility,
  mutationLuckForItem
} from './certificateDecision';

const now='2026-10-26T00:00:00Z';
function gear(id:string,slot:Slot,stats:Partial<GearStats>,mutation='None',auth?:GearItem['authentication']):GearItem{
  return {
    id,baseName:id,name:id,slot,mutation,
    stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},
    authenticated:Boolean(auth),authentication:auth??{kind:'None',effect:'',value:0},
    favourite:false,createdAt:now,updatedAt:now
  };
}
const limited:OwnedCertificate={id:'limited',type:'Limited Certificate of Authenticity',quantity:1,gradeStars:2};

describe('certificate expected-value engine',()=>{
  it('uses Lucky Grading by default and values Grade Re-Roll against the Lucky distribution',()=>{
    expect(LUCKY_GRADING).toBe(true);
    expect(gradeRerollExpectedValueGainPct(25,true)).toBeGreaterThan(1.4);
    expect(gradeRerollExpectedValueGainPct(25,true)).toBeLessThan(1.6);
    expect(gradeRerollExpectedValueGainPct(25,false)).toBeGreaterThan(gradeRerollExpectedValueGainPct(25,true));
  });

  it('caps Main Auction Arrow value at the users 75% target',()=>{
    const h75=gear('H75','Head',{arrowReduction:75});
    const h110=gear('H110','Head',{arrowReduction:110});
    const b=gear('B','Back',{}),w=gear('W','Wrist',{});
    expect(mainAuctionUtility([h75,b,w])).toBe(mainAuctionUtility([h110,b,w]));
  });

  it('calculates Mutated Luck from the actual three equipped mutations',()=>{
    const h=gear('H','Head',{luck:10},'Diamond',{kind:'Premium',effect:'Mutated Luck',value:0});
    const b=gear('B','Back',{},'Void');
    const w=gear('W','Wrist',{},'Chrome');
    expect(mutationLuckForItem(h)).toBe(20);
    expect(mutationLuckForItem(b)).toBe(40);
    expect(mutationLuckForItem(w)).toBe(30);
    expect(mainAuctionUtility([h,b,w])).toBeCloseTo(100,8);
  });

  it('prefers a Limited Back opportunity over Head/Wrist on the verified current inventory',()=>{
    const data=makeInitialData();
    const cert=data.ownedCertificates.find(c=>c.type==='Limited Certificate of Authenticity')!;
    const decision=analyseCertificate(data,cert);
    expect(decision.recommendedTarget?.item.slot).toBe('Back');
    expect(decision.recommendedTarget?.item.baseName).toBe('Elegant Business Backpack');
    const bestWrist=decision.targets.find(t=>t.item.slot==='Wrist');
    expect(bestWrist?.chanceOfImprovementPct).toBe(0);
  });

  it('counts an existing strong authentication as replacement cost rather than pure upside',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100}),
      gear('B','Back',{luck:100},'None',{kind:'Normal',effect:'Luck',value:50}),
      gear('W','Wrist',{luck:100})
    ];
    data.ownedCertificates=[limited];
    const decision=analyseCertificate(data,limited);
    const back=decision.targets.find(t=>t.item.id==='B')!;
    expect(back.currentAuthenticationValueAtRiskPct).toBeGreaterThan(0);
    expect(back.chanceOfWorsePct).toBeGreaterThan(50);
    expect(back.verdict).toBe('DO NOT USE');
  });

  it('can explicitly HOLD rather than forcing a certificate use',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    data.ownedCertificates=[limited];
    const decision=analyseCertificate(data,limited);
    const wrist=decision.targets.find(t=>t.item.id==='W')!;
    expect(wrist.chanceOfImprovementPct).toBe(0);
    expect(wrist.verdict).toBe('HOLD');
  });

  it('does not produce a target without a complete Head + Back + Wrist inventory',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100})];
    data.ownedCertificates=[limited];
    const decision=analyseCertificate(data,limited);
    expect(decision.targets).toEqual([]);
    expect(decision.verdict).toBe('HOLD');
  });
});
