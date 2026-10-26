import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import type { GearItem, GearStats, OwnedCertificate, Slot } from '../types';
import {
  analyseCertificate,
  analyseOwnedCertificates,
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
    expect(gradeRerollExpectedValueGainPct(25)).toBeGreaterThan(1.76);
    expect(gradeRerollExpectedValueGainPct(25)).toBeLessThan(1.78);
  });

  it('caps Main Auction Arrow value at the users 75% target',()=>{
    const h75=gear('H75','Head',{arrowReduction:75});
    const h110=gear('H110','Head',{arrowReduction:110});
    const b=gear('B','Back',{}),w=gear('W','Wrist',{});
    expect(mainAuctionUtility([h75,b,w],makeInitialData().settings)).toBe(mainAuctionUtility([h110,b,w],makeInitialData().settings));
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

  it('re-optimises specialist loadouts instead of treating them as loose additive bonuses',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100}),
      gear('B','Back',{luck:100}),
      gear('W','Wrist',{luck:100})
    ];
    const cert={id:'limited-head',type:'Limited Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    const decision=analyseCertificate(data,cert);
    const head=decision.targets.find(t=>t.item.id==='H')!;
    expect(head.chanceOfSecondaryImprovementPct).toBeGreaterThan(0);
    expect(head.expectedGradingPct).toBeGreaterThan(0);
  });

  it('does not silently score unresolved Luck or Focused as known zero-value outcomes',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    const decision=analyseCertificate(data,wooden);
    const head=decision.targets.find(t=>t.item.id==='H')!;
    const back=decision.targets.find(t=>t.item.id==='B')!;
    expect(head.unresolvedOutcomeMassPct).toBeGreaterThan(0);
    expect(head.unresolvedEffects).toContain('Luck');
    expect(back.unresolvedEffects).toEqual(expect.arrayContaining(['Luck','Focused']));
    expect(head.verdict).not.toBe('USE');
  });

  it('counts Day/Night/Rain authentication loss as downside',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{},'None',{kind:'Normal',effect:'Nocturnal',value:100}),
      gear('B','Back',{luck:100}),
      gear('W','Wrist',{luck:100})
    ];
    const cert={id:'limited-head',type:'Limited Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    const decision=analyseCertificate(data,cert);
    const head=decision.targets.find(t=>t.item.id==='H')!;
    expect(head.currentAuthenticationMainRiskPct).toBeCloseTo(0,8);
    expect(head.currentAuthenticationContextRiskPct).toBeGreaterThan(0);
    expect(head.chanceOfWorsePct).toBeGreaterThan(0);
    expect(head.worstContextualMainPct).toBeLessThan(0);
  });

  it('sensitivity-tests dynamic certificate effects rather than using only one central state',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const decision=analyseCertificate(data,limited);
    const back=decision.targets.find(t=>t.item.id==='B')!;
    expect(back.expectedImprovementHighPct).toBeGreaterThan(back.expectedImprovementLowPct);
    expect(back.chanceOfPotentialImprovementPct).toBeGreaterThanOrEqual(back.chanceOfImprovementPct);
  });

  it('reports specialist authentication replacement risk separately',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100},'None',{kind:'Limited',effect:'Grade Re-Roll',value:25}),
      gear('B','Back',{luck:100}),
      gear('W','Wrist',{luck:100})
    ];
    const decision=analyseCertificate(data,limited);
    const head=decision.targets.find(t=>t.item.id==='H')!;
    expect(head.currentAuthenticationGradingRiskPct).toBeGreaterThan(0);
    expect(head.currentAuthenticationValueAtRiskPct).toBeGreaterThanOrEqual(head.currentAuthenticationGradingRiskPct);
  });

  it('evaluates Wooden to Premium conversion as an explicit opportunity cost',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    data.ownedCertificates=[{id:'wooden',type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:2}];
    const decision=analyseOwnedCertificates(data)[0];
    expect(decision.conversion?.diamondCost).toBe(150);
    expect(decision.conversion?.recommendation).toBeTruthy();
  });

  it('does not produce a target without a complete Head + Back + Wrist inventory',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100})];
    data.ownedCertificates=[limited];
    const decision=analyseCertificate(data,limited);
    expect(decision.targets).toEqual([]);
    expect(decision.verdict).toBe('HOLD');
  });
  it('uses the editable catalogue as the live source for enabled outcomes and ranges',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-live',type:'Wooden Certificate of Authenticity' as const,quantity:1};
    data.authModel=data.authModel.map(m=>({...m,enabled:m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width'}));
    const row=data.authModel.find(m=>m.enabled)!;
    row.min=10;row.typical=20;row.max=30;
    const low=analyseCertificate(data,wooden).recommendedTarget!.expectedImprovementPct;
    row.min=70;row.typical=80;row.max=90;
    const high=analyseCertificate(data,wooden).recommendedTarget!.expectedImprovementPct;
    expect(high).toBeGreaterThan(low);
    row.enabled=false;
    expect(analyseCertificate(data,wooden).targets).toEqual([]);
  });

  it('lets explicit catalogue relative-weight assumptions alter EV while MEDIUM remains neutral by default',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-weight',type:'Wooden Certificate of Authenticity' as const,quantity:1};
    for(const m of data.authModel)m.enabled=false;
    const zone=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width')!;
    const walk=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Walkspeed')!;
    zone.enabled=walk.enabled=true;
    zone.assumedLikelihoodClass='VERY LOW';walk.assumedLikelihoodClass='VERY HIGH';
    const low=analyseCertificate(data,wooden).recommendedTarget!.expectedImprovementPct;
    zone.assumedLikelihoodClass='VERY HIGH';walk.assumedLikelihoodClass='VERY LOW';
    const high=analyseCertificate(data,wooden).recommendedTarget!.expectedImprovementPct;
    expect(high).toBeGreaterThan(low);
  });

  it('keeps the full Ripped Wooden outcome pool and treats unconfirmed exclusives as unresolved rather than impossible',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const ripped={id:'ripped',type:'Ripped Certificate of Authenticity' as const,quantity:1};
    const decision=analyseCertificate(data,ripped);
    const head=decision.targets.find(t=>t.item.id==='H')!;
    expect(head.unresolvedEffects).toEqual(expect.arrayContaining(['Luck','Sunny','Nocturnal','Overcharged']));
    const back=decision.targets.find(t=>t.item.id==='B')!;
    expect(back.unresolvedEffects).toContain('Focused');
    const rippedWooden=new Set(data.authModel.filter(m=>m.certificateInventoryType==='Ripped Certificate of Authenticity').map(m=>m.outcome));
    const woodenPool=new Set(data.authModel.filter(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity').map(m=>m.outcome));
    expect([...rippedWooden].sort()).toEqual([...woodenPool].sort());
  });

  it('allows empirical roll strength to progressively outweigh the range prior as samples accumulate',()=>{
    const base=makeInitialData();
    base.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-empirical',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    base.authModel=base.authModel.map(m=>({...m,enabled:m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width'}));
    const prior=analyseCertificate(base,wooden).recommendedTarget!.expectedImprovementPct;
    const withData=structuredClone(base);
    for(let i=0;i<80;i++)withData.rollLog.push({
      id:'r'+i,date:now,certificateType:'Normal Certificate of Authenticity',certificateInventoryType:'Wooden Certificate of Authenticity',
      certificateGradeStars:2,itemId:'H',itemName:'H',slot:'Head',previousAuthentication:'',previousValue:0,
      newAuthentication:'Bid Zone Width',newValue:75,improvedBestSet:true,bestScoreBefore:0,bestScoreAfter:1
    });
    const empirical=analyseCertificate(withData,wooden).recommendedTarget!.expectedImprovementPct;
    expect(empirical).toBeGreaterThan(prior);
  });

  it('keeps an unknown Luck range unresolved after a single observed roll',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-one-luck',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    data.authModel=data.authModel.map(m=>({...m,enabled:m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Luck'}));
    data.rollLog=[{
      id:'luck-1',date:now,certificateType:'Normal Certificate of Authenticity',
      certificateInventoryType:'Wooden Certificate of Authenticity',certificateGradeStars:2,
      itemId:'H',itemName:'H',slot:'Head',previousAuthentication:'',previousValue:0,
      newAuthentication:'Luck',newValue:45,improvedBestSet:true,bestScoreBefore:100,bestScoreAfter:145
    }];
    const target=analyseCertificate(data,wooden).targets.find(t=>t.item.id==='H')!;
    expect(target.unresolvedOutcomeMassPct).toBeCloseTo(100,8);
    expect(target.unresolvedEffects).toContain('Luck');
    expect(target.verdict).not.toBe('USE');
  });

  it('keeps Focused mechanically unresolved even when a numeric observation exists',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100,zone:20}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-focused',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    data.authModel=data.authModel.map(m=>({...m,enabled:m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Focused'}));
    data.rollLog=[{
      id:'focused-1',date:now,certificateType:'Normal Certificate of Authenticity',
      certificateInventoryType:'Wooden Certificate of Authenticity',certificateGradeStars:2,
      itemId:'B',itemName:'B',slot:'Back',previousAuthentication:'',previousValue:0,
      newAuthentication:'Focused',newValue:30,improvedBestSet:true,bestScoreBefore:100,bestScoreAfter:110
    }];
    const target=analyseCertificate(data,wooden).targets.find(t=>t.item.id==='B')!;
    expect(target.unresolvedOutcomeMassPct).toBeCloseTo(100,8);
    expect(target.unresolvedEffects).toContain('Focused');
    expect(target.verdict).not.toBe('USE');
  });

  it('excludes unresolved outcome mass from numeric Main EV instead of treating it as zero',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const wooden={id:'wooden-partial',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    data.authModel=data.authModel.map(m=>({...m,enabled:
      m.certificateInventoryType==='Wooden Certificate of Authenticity' &&
      ['Luck','Bid Zone Width'].includes(m.outcome)
    }));
    const target=analyseCertificate(data,wooden).targets.find(t=>t.item.id==='H')!;
    expect(target.unresolvedOutcomeMassPct).toBeGreaterThan(0);
    expect(target.resolvedOutcomeMassPct).toBeGreaterThan(0);
    expect(target.resolvedOutcomeMassPct+target.unresolvedOutcomeMassPct).toBeCloseTo(100,8);

    const resolvedOnly=structuredClone(data);
    resolvedOnly.authModel=resolvedOnly.authModel.map(m=>({...m,enabled:
      m.certificateInventoryType==='Wooden Certificate of Authenticity' && m.outcome==='Bid Zone Width'
    }));
    const resolvedTarget=analyseCertificate(resolvedOnly,wooden).targets.find(t=>t.item.id==='H')!;
    expect(target.expectedImprovementPct).toBeCloseTo(resolvedTarget.expectedImprovementPct,8);
  });

  it('counts specialist losses in overall downside even when robust Main is unchanged',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100},'None',{kind:'Limited',effect:'Grade Re-Roll',value:25}),
      gear('B','Back',{luck:100}),
      gear('W','Wrist',{luck:100})
    ];
    const target=analyseCertificate(data,limited).targets.find(t=>t.item.id==='H')!;
    expect(target.chanceGradingWorsePct).toBeGreaterThan(0);
    expect(target.chanceOfWorsePct).toBeGreaterThanOrEqual(target.chanceGradingWorsePct);
  });

  it('adds unresolved replacement mass to potential downside when a current authentication is at risk',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100},'None',{kind:'Normal',effect:'Luck',value:50}),
      gear('B','Back',{luck:100}),
      gear('W','Wrist',{luck:100})
    ];
    const wooden={id:'wooden-risk',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
    data.authModel=data.authModel.map(m=>({...m,enabled:
      m.certificateInventoryType==='Wooden Certificate of Authenticity' && m.outcome==='Luck'
    }));
    const target=analyseCertificate(data,wooden).targets.find(t=>t.item.id==='H')!;
    expect(target.unresolvedOutcomeMassPct).toBeCloseTo(100,8);
    expect(target.chancePotentialWorsePct).toBeGreaterThan(0);
    expect(target.verdict).toBe('HOLD');
  });

  it('records a lexicographic specialist decision basis instead of pooling specialist utility',()=>{
    const data=makeInitialData();
    data.gear=[gear('H','Head',{luck:100}),gear('B','Back',{luck:100}),gear('W','Wrist',{luck:100})];
    const headCert={id:'limited-head-basis',type:'Limited Certificate of Authenticity' as const,quantity:1};
    const target=analyseCertificate(data,headCert).targets.find(t=>t.item.id==='H')!;
    if(target.verdict==='CONSIDER'){
      expect(['Main Auction','Contextual Main','Drink Prep','Grading']).toContain(target.decisionBasis);
      expect(target.decisionBasis).not.toBe('Shop / Idle');
    }
  });

  it('uses LOW as the qualitative default prior for documented rarer Wooden/Ripped exclusives',()=>{
    const data=makeInitialData();
    expect(data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Sunny')?.assumedLikelihoodClass).toBe('LOW');
    expect(data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Luck')?.assumedLikelihoodClass).toBe('MEDIUM');
    expect(data.authModel.find(m=>m.certificateInventoryType==='Ripped Certificate of Authenticity'&&m.outcome==='Raindrop')?.assumedLikelihoodClass).toBe('LOW');
  });

  it('lets personal Limited Back tiers support a Main-competitive target without creating hauling utility',()=>{
    const data=makeInitialData();
    const cert=data.ownedCertificates.find(c=>c.type==='Limited Certificate of Authenticity')!;
    const decision=analyseCertificate(data,cert);
    const elegant=decision.targets.find(t=>t.item.baseName==='Elegant Business Backpack')!;
    expect(elegant.mainFitPct).toBeGreaterThanOrEqual(95);
    expect(elegant.chancePersonalPreferenceImprovesPct).toBeGreaterThan(0);
    expect(elegant.expectedPersonalPreferenceDelta).toBeGreaterThan(0);
    if(elegant.decisionBasis==='Main secondary preference'){
      expect(elegant.verdict).toBe('CONSIDER');
      expect(elegant.expectedImprovementPct).toBeGreaterThanOrEqual(-0.05);
    }
  });

  it('does not let a preferred secondary effect rescue a materially weaker Main target',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100}),
      gear('Strong','Back',{luck:200}),
      gear('Weak','Back',{luck:1}),
      gear('W','Wrist',{luck:100})
    ];
    const cert={id:'limited-back-pref',type:'Limited Certificate of Authenticity' as const,quantity:1};
    const weak=analyseCertificate(data,cert).targets.find(t=>t.item.id==='Weak')!;
    expect(weak.mainFitPct).toBeLessThan(95);
    expect(weak.decisionBasis).not.toBe('Main secondary preference');
  });

});
