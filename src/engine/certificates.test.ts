import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeDefaultAuthModel } from '../defaults';
import { certificateTargets, minimumUsefulArrowMagnitude } from './certificates';
import type { GearItem, GearStats, Slot } from '../types';
function g(id:string,slot:Slot,stats:Partial<GearStats>,auth?:{effect:string;value:number;kind?:'Normal'|'Alien'}):GearItem{const now='2026-09-03T00:00:00Z';return{id,baseName:id,name:id,slot,stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!auth,authentication:auth?{kind:auth.kind??'Normal',effect:auth.effect,value:auth.value}:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}

describe('normal certificate heuristic',()=>{
  it('default model contains Energy Drink Time and no new Alien outcomes',()=>{
    const model=makeDefaultAuthModel();
    expect(model.some(x=>x.certificateType==='Normal Certificate of Authenticity'&&x.outcome==='Energy Drink Time')).toBe(true);
    expect(model.some(x=>x.certificateType==='Certificate of Alienticity')).toBe(false);
  });

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
    const magnitude=minimumUsefulArrowMagnitude(base,gear,LOCKED_DEFAULT_SETTINGS,95);
    expect(magnitude).toBeDefined();
    expect(magnitude!).toBeGreaterThan(9);
    expect(magnitude!).toBeLessThan(9.01);
  });

  it('does not invent a useful Arrow roll when the loadout is already on the 90–100 plateau',()=>{
    const base=g('Base','Back',{});
    const gear=[g('Head','Head',{arrowReduction:90}),base,g('Wrist','Wrist',{})];
    const target=98.4375;
    expect(minimumUsefulArrowMagnitude(base,gear,LOCKED_DEFAULT_SETTINGS,target)).toBe(undefined);
  });

  it('models Energy Drink Time replacement thresholds through the Energy curve',()=>{
    const gear=[g('Head','Head',{luck:10}),g('Back','Back',{luck:10}),g('Wrist','Wrist',{luck:10})];
    const target=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity')[0];
    const energy=target.outcomeThresholds.find(x=>x.outcome==='Energy Drink Time');
    expect(energy).toBeDefined();
    expect(energy?.minimumRoll).toBeDefined();
    expect(energy!.minimumRoll!).toBeGreaterThan(0);
    expect(energy!.minimumRoll!).toBeLessThan(0.00001);
  });

  it('computes modeled replacement thresholds from the exact piecewise scoring curves',()=>{
    const gear=[g('Head','Head',{luck:10}),g('Back','Back',{luck:10}),g('Wrist','Wrist',{luck:10})];
    const target=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity')[0];
    const luck=target.outcomeThresholds.find(x=>x.outcome==='Luck');
    expect(luck?.minimumRoll).toBeDefined();
    expect(luck!.minimumRoll!).toBeGreaterThan(0);
    expect(luck!.minimumRoll!).toBeLessThan(0.00001);
  });


  it('uses the Luck diminishing curve for certificate thresholds at high total Luck',()=>{
    const gear=[g('Target','Head',{luck:200}),g('Best','Head',{luck:200,tip:50}),g('Back','Back',{}),g('Wrist','Wrist',{})];
    const target=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity').find(x=>x.item.id==='Target');
    const luck=target?.outcomeThresholds.find(x=>x.outcome==='Luck');
    expect(luck?.minimumRoll).toBeDefined();
    expect(luck!.minimumRoll!).toBeGreaterThan(12.49);
    expect(luck!.minimumRoll!).toBeLessThan(12.51);
  });

  it('uses the NPC diminishing curve for certificate thresholds',()=>{
    const gear=[g('Target','Head',{npc:30}),g('Best','Head',{npc:30,tip:30}),g('Back','Back',{}),g('Wrist','Wrist',{})];
    const target=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity').find(x=>x.item.id==='Target');
    const npc=target?.outcomeThresholds.find(x=>x.outcome==='NPC Offers Bonus');
    expect(npc?.minimumRoll).toBeDefined();
    expect(npc!.minimumRoll!).toBeGreaterThan(12.13);
    expect(npc!.minimumRoll!).toBeLessThan(12.16);
  });

  it('routes Nocturnal certificate thresholds through the total Luck curve',()=>{
    const gear=[g('Target','Head',{luck:200}),g('Best','Head',{luck:200,tip:50}),g('Back','Back',{}),g('Wrist','Wrist',{})];
    const target=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity').find(x=>x.item.id==='Target');
    const nocturnal=target?.outcomeThresholds.find(x=>x.outcome==='Nocturnal');
    expect(nocturnal?.minimumRoll).toBeDefined();
    expect(nocturnal!.minimumRoll!).toBeGreaterThan(24.99);
    expect(nocturnal!.minimumRoll!).toBeLessThan(25.01);
  });
  it('favours pure-upside first authentication when gear is competitive',()=>{
    const gear=[g('Head','Head',{luck:10}),g('Back','Back',{luck:10}),g('Wrist','Wrist',{luck:10}),g('Wrist2','Wrist',{luck:9},{effect:'Luck',value:1})];
    const targets=certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Normal Certificate of Authenticity');
    expect(targets[0].action).toBe('AUTHENTICATE');
  });

  it('never generates a new Alien certificate target',()=>{
    const gear=[g('Head','Head',{luck:10}),g('Back','Back',{luck:10}),g('Wrist','Wrist',{luck:10})];
    expect(certificateTargets(gear,LOCKED_DEFAULT_SETTINGS,makeDefaultAuthModel(),'Certificate of Alienticity')).toEqual([]);
  });
});
