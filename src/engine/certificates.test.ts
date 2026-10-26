import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeDefaultAuthModel } from '../defaults';
import { certificateTargets } from './certificates';
import type { GearItem, GearStats, Slot } from '../types';

function g(id:string,slot:Slot,stats:Partial<GearStats>,auth?:{effect:string;value:number;kind?:'Normal'|'Alien'}):GearItem{
  const now='2026-09-03T00:00:00Z';
  return {id,baseName:id,name:id,slot,stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!auth,authentication:auth?{kind:auth.kind??'Normal',effect:auth.effect,value:auth.value}:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now};
}

describe('legacy Normal certificate compatibility helper',()=>{
  it('retains the current Normal outcome model for roll logging and imports',()=>{
    const model=makeDefaultAuthModel();
    expect(model.some(x=>x.certificateType==='Normal Certificate of Authenticity'&&x.outcome==='Energy Drink Time')).toBe(true);
    expect(model.some(x=>x.certificateType==='Certificate of Alienticity')).toBe(false);
  });

  it('remains deterministic for identical inputs',()=>{
    const gear=[g('H','Head',{luck:80}),g('B','Back',{luck:70}),g('W','Wrist',{luck:60})];
    const model=makeDefaultAuthModel();
    const a=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,model,'Normal Certificate of Authenticity');
    const b=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,model,'Normal Certificate of Authenticity');
    expect(a.map(x=>[x.item.id,x.heuristicScore,x.likelihood])).toEqual(b.map(x=>[x.item.id,x.heuristicScore,x.likelihood]));
  });

  it('still prefers a clean competitive item over an unnecessary destructive reroll',()=>{
    const gear=[
      g('H','Head',{luck:100}),
      g('B','Back',{luck:100}),
      g('W','Wrist',{luck:100}),
      g('W2','Wrist',{luck:99},{effect:'Luck',value:20})
    ];
    const result=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity');
    expect(result[0].action).toBe('AUTHENTICATE');
  });

  it('never generates a current Alien certificate target',()=>{
    const gear=[g('H','Head',{luck:10}),g('B','Back',{luck:10}),g('W','Wrist',{luck:10})];
    expect(certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Certificate of Alienticity')).toEqual([]);
  });
});
