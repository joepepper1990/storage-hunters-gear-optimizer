import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { arrowEffective, effectiveItemStats, energyEffective, gameArrowToReduction, scoreStandalone, zoneEffective } from './scoring';
import type { GearItem, GearStats } from '../types';

const s = LOCKED_DEFAULT_SETTINGS;
function item(name:string, stats:Partial<GearStats>, effect='', value=0, kind?:GearItem['authentication']['kind']):GearItem { const now='2026-09-03T00:00:00Z'; return {id:name,baseName:name,name,slot:'Wrist',stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:kind??(effect==='Rush'?'Alien':effect?'Normal':'None'),effect,value},favourite:false,createdAt:now,updatedAt:now}; }

describe('locked scoring 1.1',()=>{
  it('uses the approved scoring defaults',()=>{
    expect(s.version).toBe('1.1');
    expect(s.arrowWeight).toBe(1.25);
    expect(s.arrowSweetSpot).toBe(75);
    expect(s.arrowDiminishingMultiplier).toBe(0.25);
    expect(s.arrowCeiling).toBe(90);
    expect(s.arrowPenaltyThreshold).toBe(100);
    expect(s.arrowOvercapPenaltyMultiplier).toBe(0.25);
    expect(s.luckWeight).toBe(1);
    expect((s as any).luckBreakpoint1).toBe(100);
    expect((s as any).luckBreakpoint2).toBe(150);
    expect((s as any).luckBreakpoint3).toBe(200);
    expect((s as any).luckBreakpoint4).toBe(250);
    expect((s as any).luckMultiplier2).toBe(0.8);
    expect((s as any).luckMultiplier3).toBe(0.6);
    expect((s as any).luckMultiplier4).toBe(0.4);
    expect((s as any).luckMultiplier5).toBe(0.2);
    expect(s.zoneWeight).toBe(0.5);
    expect(s.npcWeight).toBe(0.35);
    expect((s as any).npcBreakpoint1).toBe(20);
    expect((s as any).npcBreakpoint2).toBe(40);
    expect((s as any).npcMultiplier2).toBe(0.75);
    expect((s as any).npcMultiplier3).toBe(0.5);
    expect(s.tipWeight).toBe(0.1);
    expect(s.recoveryWeight).toBe(0.05);
    expect(s.walkWeight).toBe(0.02);
    expect(s.vehicleWeight).toBe(0.01);
  });

  it('scores the approved Arrow curve with a gentle >100 penalty',()=>{
    const cases = [
      [32, 32, 40.0000],
      [50, 50, 62.5000],
      [75, 75, 93.7500],
      [80, 76.25, 95.3125],
      [85, 77.50, 96.8750],
      [90, 78.75, 98.4375],
      [95, 78.75, 98.4375],
      [100, 78.75, 98.4375],
      [101, 78.50, 98.1250],
      [105, 77.50, 96.8750],
      [110, 76.25, 95.3125],
      [120, 73.75, 92.1875],
      [130, 71.25, 89.0625]
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

  it('scores Luck with the approved progressive diminishing returns',()=>{
    const cases = [[50,50],[100,100],[150,140],[200,170],[219,177.6],[225,180],[250,190],[300,200],[400,220]] as const;
    for (const [luck, effective] of cases) {
      expect(scoreStandalone(item(`Luck ${luck}`,{luck}),s).luck).toBeCloseTo(effective,10);
    }
  });

  it('routes expected conditional Luck through the same Luck curve',()=>{
    const nocturnal=item('Nocturnal',{luck:219},'Nocturnal',35,'Normal');
    const score=scoreStandalone(nocturnal,s);
    expect(score.luck).toBeCloseTo(177.6,10);
    expect(score.passive).toBeCloseTo(7.0,10); // 219 -> 236.5 Luck only adds 7 points on this curve.
    expect(score.total).toBeCloseTo(184.6,10);
  });

  it('scores NPC Offers with moderate diminishing returns',()=>{
    const cases = [[10,10,3.5],[20,20,7],[30,27.5,9.625],[40,35,12.25],[60,45,15.75]] as const;
    for (const [npc, effective, score] of cases) {
      expect(scoreStandalone(item(`NPC ${npc}`,{npc}),s).npc).toBeCloseTo(score,10);
    }
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

  it('scores Zone transitions at weight 0.50',()=>{
    expect(zoneEffective(-5,s)).toBe(-5);
    expect(zoneEffective(30,s)).toBe(30);
    expect(zoneEffective(60,s)).toBe(52.5);
    expect(zoneEffective(76,s)).toBe(60.5);
    expect(scoreStandalone(item('Zone 76',{zone:76}),s).zone).toBeCloseTo(30.25,10);
  });

  it('regresses Crab Backpack under the approved weights',()=>expect(scoreStandalone(item('Crab',{luck:41,arrowReduction:24}),s).core).toBeCloseTo(71,8));
  it('automatically includes separate numeric authentication metadata in effective stats',()=>{
    expect(scoreStandalone(item('Crab auth',{luck:41},'Bid Arrow Speed',-24),s).core).toBeCloseTo(71,8);
    expect(scoreStandalone(item('Race auth',{arrowReduction:76,energy:64},'NPC Offers Bonus',7.7),s).core).toBeCloseTo(125.0275,8);
  });
  it('regresses Diamond Jellyfish core and legacy Rush separately',()=>{
    const jelly=item('Jelly',{luck:54,arrowReduction:32,walk:-1},'Rush',10,'Alien');
    const score=scoreStandalone(jelly,s);
    expect(score.core).toBeCloseTo(93.98,8);
    expect(score.passive).toBeCloseTo(1.5,8);
    expect(score.total).toBeCloseTo(95.48,8);
  });
  it('regresses Cobwebbed Race Valk',()=>expect(scoreStandalone(item('Race',{arrowReduction:76,energy:64,npc:7.7}),s).core).toBeCloseTo(125.0275,8));
  it('regresses Reactor Wristband',()=>expect(scoreStandalone(item('Reactor',{luck:60,tip:8.9}),s).core).toBeCloseTo(60.89,8));
});
