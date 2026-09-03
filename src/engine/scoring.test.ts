import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { arrowEffective, effectiveItemStats, energyEffective, gameArrowToReduction, scoreStandalone, zoneEffective } from './scoring';
import type { GearItem, GearStats } from '../types';

const s = LOCKED_DEFAULT_SETTINGS;
function item(name:string, stats:Partial<GearStats>, effect='', value=0, kind?:GearItem['authentication']['kind']):GearItem { const now='2026-09-03T00:00:00Z'; return {id:name,baseName:name,name,slot:'Wrist',stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:kind??(effect==='Rush'?'Alien':effect?'Normal':'None'),effect,value},favourite:false,createdAt:now,updatedAt:now}; }

describe('locked scoring 1.0',()=>{
  it('uses the current editable Arrow defaults',()=>{
    expect(s.arrowWeight).toBe(1.25);
    expect(s.arrowSweetSpot).toBe(75);
    expect(s.arrowDiminishingMultiplier).toBe(0.25);
    expect(s.arrowCeiling).toBe(90);
    expect(s.arrowPenaltyThreshold).toBe(100);
    expect(s.arrowOvercapPenaltyMultiplier).toBe(1);
  });
  it('scores the current Arrow curve exactly, including the 90–100 plateau and >100 penalty',()=>{
    const cases = [
      [32, 32, 40.0000],
      [50, 50, 62.5000],
      [75, 75, 93.7500],
      [80, 76.25, 95.3125],
      [85, 77.50, 96.8750],
      [90, 78.75, 98.4375],
      [95, 78.75, 98.4375],
      [100, 78.75, 98.4375],
      [101, 77.75, 97.1875],
      [105, 73.75, 92.1875],
      [110, 68.75, 85.9375],
      [120, 58.75, 73.4375]
    ] as const;
    for (const [reduction, effective, score] of cases) {
      expect(arrowEffective(reduction,s)).toBeCloseTo(effective,10);
      expect(scoreStandalone(item(`Arrow ${reduction}`,{arrowReduction:reduction}),s).arrow).toBeCloseTo(score,10);
    }
  });

  it('keeps negative Arrow totals as real penalties',()=>{
    expect(arrowEffective(-10,s)).toBe(-10);
    expect(scoreStandalone(item('Negative Arrow',{arrowReduction:-10}),s).arrow).toBeCloseTo(-12.5,10);
    expect(gameArrowToReduction(3)).toBe(-3);
    expect(scoreStandalone(item('Game +3',{arrowReduction:gameArrowToReduction(3)}),s).arrow).toBeCloseTo(-3.75,10);
    expect(gameArrowToReduction(-24)).toBe(24);
  });

  it('uses editable Arrow penalty threshold and penalty multiplier',()=>{
    const custom={...s,arrowPenaltyThreshold:110,arrowOvercapPenaltyMultiplier:0.5};
    expect(arrowEffective(105,custom)).toBeCloseTo(78.75,10);
    expect(arrowEffective(120,custom)).toBeCloseTo(73.75,10);
  });

  it('scores Energy transitions',()=>{
    expect(energyEffective(-5,s)).toBe(-5);
    expect(energyEffective(50,s)).toBe(50);
    expect(energyEffective(64,s)).toBeCloseTo(51.4,10);
    expect(energyEffective(100,s)).toBe(55);
    expect(energyEffective(150,s)).toBe(55);
  });

  it('Energy Drink Time authentication adds to base Energy and uses diminishing returns',()=>{
    const gear=item('Energy auth',{energy:40},'Energy Drink Time',20);
    expect(effectiveItemStats(gear).energy).toBe(60);
    const score=scoreStandalone(gear,s);
    expect(score.energy).toBeCloseTo(51*0.55,10);
    expect(score.total).toBeCloseTo(28.05,10);
  });

  it('scores Zone transitions',()=>{
    expect(zoneEffective(-5,s)).toBe(-5);
    expect(zoneEffective(30,s)).toBe(30);
    expect(zoneEffective(60,s)).toBe(52.5);
    expect(zoneEffective(70,s)).toBe(57.5);
  });

  it('regresses Crab Backpack under the new Arrow weight',()=>expect(scoreStandalone(item('Crab',{luck:41,arrowReduction:24}),s).core).toBeCloseTo(71,8));
  it('automatically includes separate numeric authentication metadata in effective stats',()=>{
    expect(scoreStandalone(item('Crab auth',{luck:41},'Bid Arrow Speed',-24),s).core).toBeCloseTo(71,8);
    expect(scoreStandalone(item('Race auth',{arrowReduction:76,energy:64},'NPC Offers Bonus',7.7),s).core).toBeCloseTo(128.1075,8);
  });
  it('regresses Diamond Jellyfish core and legacy Rush separately',()=>{
    const jelly=item('Jelly',{luck:54,arrowReduction:32,walk:-1},'Rush',10,'Alien');
    const score=scoreStandalone(jelly,s);
    expect(score.core).toBeCloseTo(93.99,8);
    expect(score.passive).toBeCloseTo(1.5,8);
    expect(score.total).toBeCloseTo(95.49,8);
  });
  it('regresses Cobwebbed Race Valk',()=>expect(scoreStandalone(item('Race',{arrowReduction:76,energy:64,npc:7.7}),s).core).toBeCloseTo(128.1075,8));
  it('regresses Reactor Wristband',()=>expect(scoreStandalone(item('Reactor',{luck:60,tip:8.9}),s).core).toBeCloseTo(60.89,8));
});
