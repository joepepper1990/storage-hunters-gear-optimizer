import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import type { CertificateRollLog, GearItem, GearStats, Slot } from '../types';
import { analyseGearRetention } from './gearLoadouts';
import { optimise } from './optimizer';
import { analyseCertificate, certificateOutcomeLikelihoods } from './certificateDecision';
import { analyseActivePostRoll, analysePostRollOptions } from './certificateReroll';

const date='2026-10-26T00:00:00Z';
function g(id:string,slot:Slot,stats:Partial<GearStats>,auth?:GearItem['authentication']):GearItem{
  return {
    id,baseName:id,name:id,slot,
    stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},
    authenticated:!!auth,authentication:auth??{kind:'None',effect:'',value:0},
    favourite:false,createdAt:date,updatedAt:date
  };
}

function simpleInventory(){
  const data=makeInitialData();
  data.gear=[g('H','Head',{luck:100}),g('B','Back',{luck:100}),g('W','Wrist',{luck:100})];
  return data;
}

function limitedWooden(data:ReturnType<typeof makeInitialData>){
  data.authModel=data.authModel.map(m=>({
    ...m,
    enabled:m.certificateInventoryType==='Wooden Certificate of Authenticity' &&
      ['Bid Zone Width','Walkspeed'].includes(m.outcome)
  }));
  return {id:'wooden-2',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2,mutation:'Onyx'};
}

function recordedRoll(id:string,effect:string,value:number,grade?:number,mutation?:string):CertificateRollLog {
  return {
    id,date,certificateType:'Normal Certificate of Authenticity',
    certificateInventoryType:'Wooden Certificate of Authenticity',certificateGradeStars:grade,
    certificateMutation:mutation,
    itemId:'H',itemName:'H',slot:'Head',
    previousAuthentication:'',previousValue:0,newAuthentication:effect,newValue:value,
    improvedBestSet:false,bestScoreBefore:100,bestScoreAfter:100
  };
}

describe('P1 certificate and Main coherence corrections',()=>{
  it('Gear EQUIP uses the same low-state Main combination as Dashboard, retaining a central-only winner as KEEP',()=>{
    const gear=[
      g('H','Head',{luck:100}),
      g('Bstatic','Back',{luck:80}),
      g('Bdynamic','Back',{luck:10},{kind:'Premium',effect:'Droughtbreaker',value:100}),
      g('W','Wrist',{luck:100})
    ];
    const chosen=optimise(gear,makeInitialData().settings,1)[0]!;
    const results=analyseGearRetention(gear,makeInitialData().settings);
    expect(chosen.back.id).toBe('Bstatic');
    expect(results.find(x=>x.item.id==='Bstatic')?.verdict).toBe('EQUIP');
    expect(results.find(x=>x.item.id==='Bdynamic')?.verdict).toBe('KEEP');
    expect(results.find(x=>x.item.id==='Bdynamic')?.loadoutMemberships.find(m=>m.loadout==='Main Auction')?.scenario).toBeTruthy();
    expect(results.filter(x=>x.item.slot==='Back'&&x.verdict==='EQUIP').map(x=>x.item.id)).toEqual(['Bstatic']);
  });

  it('one exact roll cannot overwhelm the 40-sample outcome-selection prior',()=>{
    const data=simpleInventory();
    const cert=limitedWooden(data);
    const before=certificateOutcomeLikelihoods(data,cert,'Head');
    expect(before.find(x=>x.effect==='Bid Zone Width')?.probability).toBeCloseTo(.5,6);
    data.rollLog=[recordedRoll('one','Bid Zone Width',75,2,'Onyx')];
    const after=certificateOutcomeLikelihoods(data,cert,'Head');
    const probability=after.find(x=>x.effect==='Bid Zone Width')!.probability;
    expect(probability).toBeGreaterThan(.5);
    expect(probability).toBeLessThan(.53);
  });

  it('other grade and mutation results are not treated as exact evidence',()=>{
    const data=simpleInventory();
    const cert=limitedWooden(data);
    const baseline=analyseCertificate(data,cert).targets.find(x=>x.item.id==='H')!.expectedImprovementPct;
    const prior=certificateOutcomeLikelihoods(data,cert,'Head')[0].probability;
    data.rollLog=[
      ...Array.from({length:20},(_,i)=>recordedRoll('other-grade-'+i,'Bid Zone Width',75,1,'Onyx')),
      ...Array.from({length:20},(_,i)=>recordedRoll('other-mutation-'+i,'Bid Zone Width',75,2,'Diamond'))
    ];
    const after=analyseCertificate(data,cert).targets.find(x=>x.item.id==='H')!.expectedImprovementPct;
    const afterProb=certificateOutcomeLikelihoods(data,cert,'Head')[0].probability;
    expect(after).toBeCloseTo(baseline,7);
    expect(afterProb).toBeCloseTo(prior,7);
    data.rollLog.push(...Array.from({length:20},(_,i)=>recordedRoll('exact-'+i,'Bid Zone Width',75,2,'Onyx')));
    const exact=analyseCertificate(data,cert).targets.find(x=>x.item.id==='H')!.expectedImprovementPct;
    expect(exact).toBeGreaterThan(after);
  });

  it('Reroll Number is a same-effect conditional choice and refuses to reroll a maximum-value roll',()=>{
    const data=simpleInventory();
    data.gear[0]=g('H','Head',{luck:100},{kind:'Normal',effect:'Bid Zone Width',value:75});
    const roll=recordedRoll('max-roll','Bid Zone Width',75,2);
    data.rollLog=[roll];
    const decision=analysePostRollOptions(data,roll)!;
    expect(decision.numberReroll).toBeDefined();
    expect(decision.numberReroll?.expectedMainPct).toBeLessThan(0);
    expect(decision.numberReroll?.recommendable).toBe(false);
  });

  it('an in-progress roll is never used to train its own paid-reroll probability',()=>{
    const data=simpleInventory();
    data.gear[0]=g('H','Head',{luck:100},{kind:'Normal',effect:'Bid Zone Width',value:15});
    const roll=recordedRoll('current','Bid Zone Width',15,2);
    const before=analysePostRollOptions(data,roll)!;
    data.rollLog=[roll];
    const after=analysePostRollOptions(data,roll)!;
    expect(after.numberReroll?.expectedMainPct).toBeCloseTo(before.numberReroll!.expectedMainPct,8);
    expect(after.effectReroll?.expectedMainPct).toBeCloseTo(before.effectReroll!.expectedMainPct,8);
  });

  it('historical rolls cannot create an actionable paid reroll without a new in-memory session token',()=>{
    const data=simpleInventory();
    data.gear[0]=g('H','Head',{luck:100},{kind:'Normal',effect:'Bid Zone Width',value:15});
    const roll=recordedRoll('session-roll','Bid Zone Width',15,2);
    data.rollLog=[roll];
    expect(analyseActivePostRoll(data)).toBeUndefined();
    expect(analyseActivePostRoll(data,'wrong-session')).toBeUndefined();
    expect(analyseActivePostRoll(data,'session-roll')?.roll.id).toBe('session-roll');
  });
});

