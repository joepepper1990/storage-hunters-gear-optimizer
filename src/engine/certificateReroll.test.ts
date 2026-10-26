import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import type { CertificateRollLog, GearItem, GearStats, Slot } from '../types';
import { analysePostRollOptions, AUTHENTICATOR_REROLL_COST_ROBUX } from './certificateReroll';

const now='2026-10-26T00:00:00Z';
function gear(id:string,slot:Slot,stats:Partial<GearStats>,auth?:GearItem['authentication']):GearItem{
  return {
    id,baseName:id,name:id,slot,
    stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},
    authenticated:Boolean(auth),authentication:auth??{kind:'None',effect:'',value:0},
    favourite:false,createdAt:now,updatedAt:now
  };
}

describe('immediate Authenticator paid rerolls',()=>{
  it('models both 199-Robux options without consuming another certificate',()=>{
    const data=makeInitialData();
    data.gear=[
      gear('H','Head',{luck:100},{kind:'Normal',effect:'Bid Zone Width',value:15}),
      gear('B','Back',{luck:100}),
      gear('W','Wrist',{luck:100})
    ];
    const roll:CertificateRollLog={
      id:'latest',date:now,certificateType:'Normal Certificate of Authenticity',
      certificateInventoryType:'Wooden Certificate of Authenticity',
      itemId:'H',itemName:'H',slot:'Head',previousAuthentication:'',previousValue:0,
      newAuthentication:'Bid Zone Width',newValue:15,improvedBestSet:false,bestScoreBefore:300,bestScoreAfter:309
    };
    data.rollLog=[roll];
    const before=structuredClone(data.ownedCertificates);
    const decision=analysePostRollOptions(data,roll)!;
    expect(decision.costRobux).toBe(199);
    expect(AUTHENTICATOR_REROLL_COST_ROBUX).toBe(199);
    expect(decision.effectReroll).toBeDefined();
    expect(decision.numberReroll).toBeDefined();
    expect(decision.numberReroll?.recommendable).toBe(true);
    expect(decision.recommendation).toBe('REROLL NUMBER');
    expect(data.ownedCertificates).toEqual(before);
  });

  it('does not fabricate paid-reroll advice for legacy history without exact certificate tier',()=>{
    const data=makeInitialData();
    const roll:CertificateRollLog={
      id:'legacy',date:now,certificateType:'Normal Certificate of Authenticity',
      itemId:data.gear[0].id,itemName:data.gear[0].name,slot:data.gear[0].slot,
      previousAuthentication:'',previousValue:0,newAuthentication:'Luck',newValue:10,
      improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0
    };
    expect(analysePostRollOptions(data,roll)).toBeUndefined();
  });
});
