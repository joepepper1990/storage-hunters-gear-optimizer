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

describe('certificate decision engine',()=>{
  it('uses Lucky Grading by default and values Grade Re-Roll against the Lucky distribution',()=>{
    expect(LUCKY_GRADING).toBe(true);
    expect(gradeRerollExpectedValueGainPct(25)).toBeGreaterThan(1.76);
    expect(gradeRerollExpectedValueGainPct(25)).toBeLessThan(1.78);
  });

  it('gives Arrow no extra value past the 70% band start',()=>{
    const h70=gear('H70','Head',{arrowReduction:70});
    const h110=gear('H110','Head',{arrowReduction:110});
    const b=gear('B','Back',{}),w=gear('W','Wrist',{});
    expect(mainAuctionUtility([h70,b,w],makeInitialData().settings)).toBe(mainAuctionUtility([h110,b,w],makeInitialData().settings));
  });

  it('calculates Mutated Luck from the actual three equipped mutations',()=>{
    const h=gear('H','Head',{luck:10},'Diamond',{kind:'Premium',effect:'Mutated Luck',value:0});
    const b=gear('B','Back',{},'Void');
    const w=gear('W','Wrist',{},'Chrome');
    expect(mutationLuckForItem(h)).toBe(20);
    expect(mutationLuckForItem(b)).toBe(40);
    expect(mutationLuckForItem(w)).toBe(30);
    expect(mainAuctionUtility([h,b,w],makeInitialData().settings)).toBeCloseTo(100,8);
  });

  it('never recommends a Limited certificate on a Wrist, where no outcome is wanted',()=>{
    const data=makeInitialData();
    const cert=data.ownedCertificates.find(c=>c.type==='Limited Certificate of Authenticity')!;
    const decision=analyseCertificate(data,cert);
    for(const wrist of decision.targets.filter(t=>t.item.slot==='Wrist')){
      expect(wrist.wantedChancePct).toBe(0);
      expect(wrist.improveChancePct.favourable).toBe(0);
      expect(['USE','CONSIDER']).not.toContain(wrist.verdict);
    }
    for(const back of decision.targets.filter(t=>t.item.slot==='Back'))expect(back.wantedChancePct).toBe(100);
  });

  it('counts an existing strong authentication as replacement cost rather than pure upside',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100,arrowReduction:40}),
      gear('B','Back',{luck:100,arrowReduction:30},'None',{kind:'Normal',effect:'Luck',value:50}),
      gear('W','Wrist',{luck:100})
    ];
    const back=analyseCertificate(data,limited).targets.find(t=>t.item.id==='B')!;
    expect(back.worseChanceUpperPct).toBeGreaterThan(50);
    expect(back.verdict).toBe('DO NOT USE');
  });

  it('can explicitly HOLD rather than forcing a certificate use',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100,arrowReduction:40}),gear('B','Back',{luck:100,arrowReduction:30}),gear('W','Wrist',{luck:100})];
    const wrist=analyseCertificate(data,limited).targets.find(t=>t.item.id==='W')!;
    expect(wrist.improveChancePct).toEqual({cautious:0,central:0,favourable:0});
    expect(wrist.verdict).toBe('HOLD');
  });

  it('keeps Focused and the unconfirmed Ripped exclusives unresolved rather than impossible or zero',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100,arrowReduction:40}),gear('B','Back',{luck:100,arrowReduction:30}),gear('W','Wrist',{luck:100})];
    const ripped={id:'ripped',type:'Ripped Certificate of Authenticity' as const,quantity:1};
    const decision=analyseCertificate(data,ripped);
    const head=decision.targets.find(t=>t.item.id==='H')!;
    expect(head.unresolvedEffects.sort()).toEqual(['Nocturnal','Overcharged','Sunny']);
    expect(head.outcomes).toHaveLength(10);
    expect(head.improveChanceUpperPct).toBeGreaterThan(head.improveChancePct.favourable);
    const back=decision.targets.find(t=>t.item.id==='B')!;
    expect(back.unresolvedEffects).toEqual(['Focused']);
  });

  it('counts Day/Night/Rain authentication loss as downside',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{arrowReduction:40},'None',{kind:'Normal',effect:'Nocturnal',value:100}),
      gear('B','Back',{luck:100,arrowReduction:30}),
      gear('W','Wrist',{luck:100})
    ];
    const head=analyseCertificate(data,{id:'limited-head',type:'Limited Certificate of Authenticity',quantity:1}).targets.find(t=>t.item.id==='H')!;
    expect(head.worseChancePct.cautious).toBe(100);
    expect(head.verdict).toBe('DO NOT USE');
  });

  it('shows dynamic effects as a cautious-to-favourable range instead of one central state',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100,arrowReduction:40}),gear('B','Back',{luck:100,arrowReduction:30}),gear('W','Wrist',{luck:100})];
    const back=analyseCertificate(data,limited).targets.find(t=>t.item.id==='B')!;
    const frenzy=back.outcomes.find(o=>o.effect==='Luck Frenzy')!;
    expect(frenzy.improvePct.cautious).toBe(0);
    expect(frenzy.improvePct.favourable).toBe(100);
    expect(back.improveChancePct.favourable).toBeGreaterThan(back.improveChancePct.cautious);
    expect(back.safeInCautious).toBe(true);
  });

  it('does not produce a target without a complete Head + Back + Wrist inventory',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100})];
    const decision=analyseCertificate(data,limited);
    expect(decision.targets).toEqual([]);
    expect(decision.verdict).toBe('HOLD');
  });

  it('takes ranges from the editable catalogue, but never its outcome list',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100,arrowReduction:40}),gear('B','Back',{luck:100,arrowReduction:30}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-live',type:'Wooden Certificate of Authenticity' as const,quantity:1};
    const row=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width')!;
    const gain=()=>analyseCertificate(data,wooden,undefined,'W').targets[0].expectedBestGainPct.cautious;
    row.min=10;row.max=30;
    const low=gain();
    row.min=70;row.max=90;
    expect(gain()).toBeGreaterThan(low);
    row.enabled=false;
    expect(analyseCertificate(data,wooden,undefined,'W').targets[0].outcomes.map(o=>o.effect)).toContain('Bid Zone Width');
  });

  it('allows empirical roll strength to progressively outweigh the range prior as samples accumulate',()=>{
    const base=makeInitialData();
    base.gear=[gear('H','Head',{luck:100,arrowReduction:40}),gear('B','Back',{luck:100,arrowReduction:30}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-empirical',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    const gain=(d:typeof base)=>analyseCertificate(d,wooden,undefined,'W').targets[0].expectedBestGainPct.cautious;
    const prior=gain(base);
    const withData=structuredClone(base);
    for(let i=0;i<80;i++)withData.rollLog.push({
      id:'r'+i,date:now,certificateType:'Normal Certificate of Authenticity',certificateInventoryType:'Wooden Certificate of Authenticity',
      certificateGradeStars:2,itemId:'W',itemName:'W',slot:'Wrist',previousAuthentication:'',previousValue:0,
      newAuthentication:'Bid Zone Width',newValue:75,improvedBestSet:true,bestScoreBefore:0,bestScoreAfter:1
    });
    expect(gain(withData)).toBeGreaterThan(prior);
  });

  it('keeps Focused unresolved even when a numeric observation exists',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100,arrowReduction:40}),gear('B','Back',{luck:100,zone:20,arrowReduction:30}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-focused',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    data.rollLog=[{
      id:'focused-1',date:now,certificateType:'Normal Certificate of Authenticity',
      certificateInventoryType:'Wooden Certificate of Authenticity',certificateGradeStars:2,
      itemId:'B',itemName:'B',slot:'Back',previousAuthentication:'',previousValue:0,
      newAuthentication:'Focused',newValue:30,improvedBestSet:true,bestScoreBefore:100,bestScoreAfter:110
    }];
    const target=analyseCertificate(data,wooden).targets.find(t=>t.item.id==='B')!;
    expect(target.unresolvedOutcomeMassPct).toBeCloseTo(100/9,8);
    expect(target.unresolvedEffects).toEqual(['Focused']);
  });

  it('adds unresolved replacement mass to the downside when the current authentication is valued',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100,arrowReduction:40},'None',{kind:'Normal',effect:'Bid Zone Width',value:50}),
      gear('B','Back',{luck:100,arrowReduction:30}),
      gear('W','Wrist',{luck:100})
    ];
    const ripped={id:'ripped-risk',type:'Ripped Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    const target=analyseCertificate(data,ripped).targets.find(t=>t.item.id==='H')!;
    expect(target.unresolvedOutcomeMassPct).toBeCloseTo(30,8);
    expect(target.worseChanceUpperPct).toBeGreaterThanOrEqual(target.worseChancePct.cautious+30-1e-9);
    expect(target.currentAuthentication?.rank).toEqual({rank:4,of:5,higher:['Sunny','Nocturnal','Overcharged']});
  });
});
