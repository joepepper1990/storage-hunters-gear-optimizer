import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeInitialData } from '../defaults';
import type { CertificateRollLog, GearItem, Slot } from '../types';
import * as decisions from './certificateDecision';
import { analysePostRollOptions } from './certificateReroll';

const date='2026-10-26T00:00:00Z';
function gear(id:string,slot:Slot,tip=0):GearItem {
  return {
    id,baseName:id,name:id,slot,
    stats:{luck:100,energy:0,tip,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0},
    authenticated:slot==='Head',
    authentication:slot==='Head'?{kind:'Normal',effect:'Energy Drink Time',value:25}:{kind:'None',effect:'',value:0},
    favourite:false,createdAt:date,updatedAt:date
  };
}
function fixture(){
  const data=makeInitialData();
  data.gear=[gear('H','Head'),gear('B','Back',1),gear('W','Wrist')];
  data.authModel=data.authModel.map(row=>({
    ...row,
    enabled:row.certificateInventoryType==='Wooden Certificate of Authenticity'&&
      ['Energy Drink Time','Tip Chance'].includes(row.outcome),
    min:row.outcome==='Energy Drink Time'?30:15,
    typical:row.outcome==='Energy Drink Time'?30:15,
    max:row.outcome==='Energy Drink Time'?30:15,
    assumedLikelihoodClass:row.outcome==='Tip Chance'?'LOW':'MEDIUM'
  }));
  const roll:CertificateRollLog={
    id:'latest',date,certificateType:'Normal Certificate of Authenticity',
    certificateInventoryType:'Wooden Certificate of Authenticity',
    itemId:'H',itemName:'H',slot:'Head',previousAuthentication:'',previousValue:0,
    newAuthentication:'Energy Drink Time',newValue:25,
    improvedBestSet:false,bestScoreBefore:300,bestScoreAfter:300
  };
  data.rollLog=[roll];
  return {data,roll};
}

const neutral={
  expectedMainPct:0,expectedContextualMainPct:0,expectedPersonalPreferenceDelta:0,
  expectedDrinkPrepPct:0,expectedGradingPct:0,expectedShopPct:0
};
type Gains=Partial<typeof neutral>;
function mockedDecision(effect:Gains,number:Gains={},verdict:decisions.CertificateDecisionVerdict='CONSIDER'){
  const {data,roll}=fixture();
  const values={...neutral,...effect};
  vi.spyOn(decisions,'analyseCertificate').mockReturnValue({
    targets:[{
      item:data.gear[0],verdict,expectedImprovementPct:values.expectedMainPct,
      ...values,chancePotentialWorsePct:0,unresolvedOutcomeMassPct:0
    }]
  } as ReturnType<typeof decisions.analyseCertificate>);
  vi.spyOn(decisions,'analyseConditionalNumberReroll').mockReturnValue({
    ...neutral,...number,chanceMainWorsePct:0,chanceAnyWorsePct:0,
    resolvedMassPct:100,unresolvedMassPct:0,modelNote:''
  });
  return analysePostRollOptions(data,roll)!;
}

afterEach(()=>vi.restoreAllMocks());

describe('P1 paid reroll priority',()=>{
  it('keeps Drink Prep ahead of a much larger Shop expected gain in the actual catalogue model',()=>{
    const {data,roll}=fixture();
    const result=analysePostRollOptions(data,roll)!;
    expect(result.effectReroll?.expectedDrinkPrepPct).toBeCloseTo(-20);
    expect(result.effectReroll?.expectedShopPct).toBeCloseTo(500);
    expect(result.effectReroll?.recommendable).toBe(false);
    expect(result.numberReroll?.expectedDrinkPrepPct).toBeCloseTo(20);
    expect(result.recommendation).toBe('REROLL NUMBER');
  });

  it.each([
    {expectedMainPct:-1,expectedShopPct:1e9},
    {expectedContextualMainPct:-2,expectedDrinkPrepPct:1e9},
    {expectedPersonalPreferenceDelta:-1,expectedDrinkPrepPct:1e9},
    {expectedDrinkPrepPct:-2,expectedGradingPct:1e9},
    {expectedGradingPct:-2,expectedShopPct:1e9}
  ])('blocks lower-priority benefits after a material higher-priority loss: %j',gains=>{
    const result=mockedDecision(gains);
    expect(result.effectReroll?.recommendable).toBe(false);
    expect(result.recommendation).toBe('ACCEPT');
  });

  it.each([
    [{expectedMainPct:1,expectedShopPct:1e12},{expectedMainPct:2}],
    [{expectedContextualMainPct:2,expectedShopPct:1e12},{expectedContextualMainPct:3}],
    [{expectedPersonalPreferenceDelta:.3,expectedShopPct:1e12},{expectedPersonalPreferenceDelta:.4}],
    [{expectedDrinkPrepPct:3,expectedShopPct:1e12},{expectedDrinkPrepPct:4}],
    [{expectedGradingPct:3,expectedShopPct:1e12},{expectedGradingPct:4}]
  ] satisfies [Gains,Gains][])('ranks tuples without mixing magnitudes: %j versus %j',(effect,number)=>{
    // Conditional number rerolls do not have a personal-tier delta. Compare
    // against its Drink gain to exercise the preference-before-specialist tier.
    if(number.expectedPersonalPreferenceDelta){
      const result=mockedDecision(effect,{expectedDrinkPrepPct:1e12});
      expect(result.recommendation).toBe('REROLL EFFECT');
      return;
    }
    const result=mockedDecision(effect,number);
    expect(result.effectReroll?.recommendable).toBe(true);
    expect(result.numberReroll?.recommendable).toBe(true);
    expect(result.recommendation).toBe('REROLL NUMBER');
  });

  it('uses personal preference only while Main is neutral',()=>{
    const result=mockedDecision({expectedMainPct:1,expectedPersonalPreferenceDelta:1e12},
      {expectedMainPct:1,expectedDrinkPrepPct:4});
    expect(result.recommendation).toBe('REROLL NUMBER');
  });

  it.each(['HOLD','DO NOT USE'] as const)('respects a %s effect target verdict',verdict=>{
    const result=mockedDecision({expectedDrinkPrepPct:20},{},verdict);
    expect(result.effectReroll?.recommendable).toBe(false);
    expect(result.recommendation).toBe('ACCEPT');
  });
});
