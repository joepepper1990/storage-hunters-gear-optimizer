import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeDefaultAuthModel } from '../defaults';
import { certificateTargets, minimumUsefulArrowMagnitude } from './certificates';
import type { GearItem, GearStats, Slot } from '../types';
function g(id:string,slot:Slot,stats:Partial<GearStats>,auth?:{effect:string;value:number}):GearItem{const now='2026-08-28T00:00:00Z';return{id,baseName:id,name:id,slot,stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!auth,authentication:auth?{kind:'Normal',effect:auth.effect,value:auth.value}:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}

describe('certificate heuristic',()=>{
  it('is deterministic/stable for identical inputs',()=>{
    const gear=[g('Head','Head',{arrowReduction:76,energy:64,npc:7.7}),g('Crab','Back',{luck:41,arrowReduction:24},{effect:'Bid Arrow Speed',value:-24}),g('Reactor','Wrist',{luck:60,tip:8.9})];
    const model=makeDefaultAuthModel();
    const a=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,model,'Normal Certificate of Authenticity');
    const b=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,model,'Normal Certificate of Authenticity');
    expect(a.map(x=>[x.item.id,x.heuristicScore,x.likelihood])).toEqual(b.map(x=>[x.item.id,x.heuristicScore,x.likelihood]));
  });

  it('finds the earliest useful Bid Arrow roll before the >100 region can turn the curve downward',()=>{
    const base=g('Base','Back',{});
    const gear=[g('Head','Head',{arrowReduction:70}),base,g('Wrist','Wrist',{})];
    const magnitude=minimumUsefulArrowMagnitude(base,gear,LOCKED_DEFAULT_SETTINGS,64);
    expect(magnitude).toBeDefined();
    expect(magnitude!).toBeGreaterThan(6.17);
    expect(magnitude!).toBeLessThan(6.18);
  });

  it('does not invent a useful Arrow roll when the loadout is already on the 80–100 plateau',()=>{
    const base=g('Base','Back',{});
    const gear=[g('Head','Head',{arrowReduction:90}),base,g('Wrist','Wrist',{})];
    const target=64.8125;
    expect(minimumUsefulArrowMagnitude(base,gear,LOCKED_DEFAULT_SETTINGS,target)).toBe(undefined);
  });
  it('computes exact modeled replacement thresholds without iterative loadout searches',()=>{
    const gear=[g('Head','Head',{luck:10}),g('Back','Back',{luck:10}),g('Wrist','Wrist',{luck:10})];
    const target=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity')[0];
    const luck=target.outcomeThresholds.find(x=>x.outcome==='Luck');
    expect(luck?.minimumRoll).toBeDefined();
    expect(luck!.minimumRoll!).toBeGreaterThan(0);
    expect(luck!.minimumRoll!).toBeLessThan(0.00001);
  });
  it('favours pure-upside first authentication when gear is competitive',()=>{
    const gear=[g('Head','Head',{luck:10}),g('Back','Back',{luck:10}),g('Wrist','Wrist',{luck:10}),g('Wrist2','Wrist',{luck:9},{effect:'Luck',value:1})];
    const targets=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity');
    expect(targets[0].action).toBe('AUTHENTICATE');
  });
});
