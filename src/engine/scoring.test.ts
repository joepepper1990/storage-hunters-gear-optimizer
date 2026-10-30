import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { arrowEffective, arrowTargetBand, effectiveItemStats, gameArrowToReduction, scoreStandalone } from './scoring';
import type { GearItem, GearStats } from '../types';

const s=LOCKED_DEFAULT_SETTINGS;
function item(name:string,stats:Partial<GearStats>,effect='',value=0,kind?:GearItem['authentication']['kind']):GearItem{
  const now='2026-09-03T00:00:00Z';
  return {id:name,baseName:name,name,slot:'Wrist',stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:kind??(effect?'Normal':'None'),effect,value},favourite:false,createdAt:now,updatedAt:now};
}

describe('Main Auction scoring 2.2',()=>{
  it('uses the user-approved priorities',()=>{
    expect(s.version).toBe('2.3');
    expect(s.luckWeight).toBe(1);
    // Confirmed requirement: Arrow's default priority equals Luck, as the same coefficient.
    expect(s.arrowWeight).toBe(s.luckWeight);
    expect([s.arrowTargetMin,s.arrowTargetMax]).toEqual([70,90]);
    expect(s.zoneWeight).toBe(.6);
    expect(s.recoveryWeight).toBe(.2);
    expect(s.energyWeight).toBe(.3);
    expect(s.mainMaterialLossPct).toBe(2);
    expect(s.npcWeight).toBe(0);
    expect(s.tipWeight).toBe(0);
    expect(s.walkWeight).toBe(0);
    expect(s.vehicleWeight).toBe(0);
  });

  it('keeps displayed Luck linear instead of inventing hidden diminishing returns',()=>{
    expect(scoreStandalone(item('Luck 50',{luck:50}),s).luck).toBe(50);
    expect(scoreStandalone(item('Luck 250',{luck:250}),s).luck).toBe(250);
    expect(scoreStandalone(item('Luck 400',{luck:400}),s).luck).toBe(400);
  });

  it('treats every combined Bid Arrow value from 70% through 90% as equally good',()=>{
    expect(arrowTargetBand(s)).toEqual({min:70,max:90});
    // Below the band value still rises.
    expect(arrowEffective(50,s)).toBe(50);
    expect(arrowEffective(69.9,s)).toBeCloseTo(69.9,8);
    expect(arrowEffective(50,s)).toBeLessThan(arrowEffective(69,s));
    // 70 through 90 are all the same; more Arrow never adds value.
    for(const arrow of [70,75,80,85,90,91,130])expect(arrowEffective(arrow,s)).toBe(70);
    for(const arrow of [70,75,85,130])expect(scoreStandalone(item('Arrow '+arrow,{arrowReduction:arrow}),s).arrow).toBeCloseTo(70,8);
  });

  it('weights Luck and in-band Arrow points equally by default',()=>{
    expect(scoreStandalone(item('Luck',{luck:30}),s).total).toBeCloseTo(scoreStandalone(item('Arrow',{arrowReduction:30}),s).total,8);
  });

  it('keeps harmful positive in-game Bid Arrow Speed as a real negative',()=>{
    expect(gameArrowToReduction(3)).toBe(-3);
    expect(scoreStandalone(item('Game +3',{arrowReduction:gameArrowToReduction(3)}),s).arrow).toBeCloseTo(-3,8);
    expect(gameArrowToReduction(-24)).toBe(24);
  });

  it('keeps shop and travel stats out of Main Auction scoring, and gives Energy diminishing returns',()=>{
    const specialist=item('Specialist',{npc:40,tip:15,walk:50,vehicle:50});
    expect(scoreStandalone(specialist,s).total).toBe(0);
    // Full value to 50%, a tenth from 50% to 100%, nothing above 100%.
    expect(scoreStandalone(item('E50',{energy:50}),s).energy).toBeCloseTo(50*.3,8);
    expect(scoreStandalone(item('E100',{energy:100}),s).energy).toBeCloseTo((50+5)*.3,8);
    expect(scoreStandalone(item('E150',{energy:150}),s).energy).toBeCloseTo((50+5)*.3,8);
  });

  it('still applies numeric authentication to the underlying stat before scoring',()=>{
    const gear=item('Auth',{luck:41},'Bid Arrow Speed',-24);
    expect(effectiveItemStats(gear).arrowReduction).toBe(24);
    expect(scoreStandalone(gear,s).total).toBeCloseTo(41+24,8);
  });

  it('does not average conditional Luck into the neutral Main Auction score',()=>{
    const nocturnal=item('Nocturnal',{luck:100},'Nocturnal',35,'Normal');
    expect(scoreStandalone(nocturnal,s).total).toBe(100);
  });
});
