import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { arrowEffective, energyEffective, gameArrowToReduction, scoreStandalone, zoneEffective } from './scoring';
import type { GearItem, GearStats } from '../types';

const s = LOCKED_DEFAULT_SETTINGS;
function item(name:string, stats:Partial<GearStats>, effect='', value=0):GearItem { const now='2026-08-28T00:00:00Z'; return {id:name,name,slot:'Wrist',stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:effect==='Rush'?'Alien':effect?'Normal':'None',effect,value},favourite:false,createdAt:now,updatedAt:now}; }

describe('locked scoring 1.0',()=>{
  it('scores Arrow transitions including flat 80–100 and the >100 penalty',()=>{
    expect(arrowEffective(-10,s)).toBe(-10);
    expect(arrowEffective(50,s)).toBe(50);
    const cases = [
      [75, 75, 63.75],
      [80, 76.25, 64.8125],
      [90, 76.25, 64.8125],
      [100, 76.25, 64.8125],
      [101, 75.25, 63.9625],
      [105, 71.25, 60.5625],
      [110, 66.25, 56.3125],
      [120, 56.25, 47.8125]
    ] as const;
    for (const [reduction, effective, score] of cases) {
      expect(arrowEffective(reduction,s)).toBeCloseTo(effective,10);
      expect(scoreStandalone(item(`Arrow ${reduction}`,{arrowReduction:reduction}),s).arrow).toBeCloseTo(score,10);
    }
    expect(gameArrowToReduction(-24)).toBe(24);
    expect(gameArrowToReduction(3)).toBe(-3);
  });

  it('uses editable Arrow penalty threshold and penalty multiplier',()=>{
    const custom={...s,arrowPenaltyThreshold:110,arrowOvercapPenaltyMultiplier:0.5};
    expect(arrowEffective(105,custom)).toBeCloseTo(76.25,10);
    expect(arrowEffective(120,custom)).toBeCloseTo(71.25,10);
  });
  it('scores Energy transitions',()=>{
    expect(energyEffective(-5,s)).toBe(-5);
    expect(energyEffective(50,s)).toBe(50);
    expect(energyEffective(64,s)).toBeCloseTo(51.4,10);
    expect(energyEffective(100,s)).toBe(55);
    expect(energyEffective(150,s)).toBe(55);
  });
  it('scores Zone transitions',()=>{
    expect(zoneEffective(-5,s)).toBe(-5);
    expect(zoneEffective(30,s)).toBe(30);
    expect(zoneEffective(60,s)).toBe(52.5);
    expect(zoneEffective(70,s)).toBe(57.5);
  });
  it('regresses Crab Backpack',()=>expect(scoreStandalone(item('Crab',{luck:41,arrowReduction:24}),s).core).toBeCloseTo(61.4,8));
  it('automatically includes separate numeric authentication metadata in effective stats',()=>{
    expect(scoreStandalone(item('Crab auth',{luck:41},'Bid Arrow Speed',-24),s).core).toBeCloseTo(61.4,8);
    expect(scoreStandalone(item('Race auth',{arrowReduction:76,energy:64},'NPC Offers Bonus',7.7),s).core).toBeCloseTo(98.0075,8);
  });
  it('regresses Diamond Jellyfish core and Rush separately',()=>{
    const jelly=item('Jelly',{luck:54,arrowReduction:32,walk:-1},'Rush',10);
    const score=scoreStandalone(jelly,s);
    expect(score.core).toBeCloseTo(81.19,8);
    expect(score.passive).toBeCloseTo(1.5,8);
    expect(score.total).toBeCloseTo(82.69,8);
  });
  it('regresses Cobwebbed Race Valk',()=>expect(scoreStandalone(item('Race',{arrowReduction:76,energy:64,npc:7.7}),s).core).toBeCloseTo(98.0075,8));
  it('regresses Reactor Wristband',()=>expect(scoreStandalone(item('Reactor',{luck:60,tip:8.9}),s).core).toBeCloseTo(60.89,8));
});
