import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { arrowEffective, effectiveItemStats, gameArrowToReduction, scoreStandalone } from './scoring';
import type { GearItem, GearStats } from '../types';

const s=LOCKED_DEFAULT_SETTINGS;
function item(name:string,stats:Partial<GearStats>,effect='',value=0,kind?:GearItem['authentication']['kind']):GearItem{
  const now='2026-09-03T00:00:00Z';
  return {id:name,baseName:name,name,slot:'Wrist',stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:kind??(effect?'Normal':'None'),effect,value},favourite:false,createdAt:now,updatedAt:now};
}

describe('Main Auction scoring 2.0',()=>{
  it('uses the user-approved priorities',()=>{
    expect(s.version).toBe('2.0');
    expect(s.luckWeight).toBe(1);
    expect(s.arrowWeight).toBe(.8);
    expect(s.arrowSweetSpot).toBe(75);
    expect(s.zoneWeight).toBe(.6);
    expect(s.recoveryWeight).toBe(.2);
    expect(s.energyWeight).toBe(0);
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

  it('caps Bid Arrow benefit at the users 75% sweet spot without inventing an over-cap penalty',()=>{
    expect(arrowEffective(50,s)).toBe(50);
    expect(arrowEffective(75,s)).toBe(75);
    expect(arrowEffective(90,s)).toBe(75);
    expect(arrowEffective(130,s)).toBe(75);
    expect(scoreStandalone(item('Arrow 75',{arrowReduction:75}),s).arrow).toBeCloseTo(60,8);
    expect(scoreStandalone(item('Arrow 130',{arrowReduction:130}),s).arrow).toBeCloseTo(60,8);
  });

  it('keeps harmful positive in-game Bid Arrow Speed as a real negative',()=>{
    expect(gameArrowToReduction(3)).toBe(-3);
    expect(scoreStandalone(item('Game +3',{arrowReduction:gameArrowToReduction(3)}),s).arrow).toBeCloseTo(-2.4,8);
    expect(gameArrowToReduction(-24)).toBe(24);
  });

  it('keeps specialist stats out of Main Auction scoring',()=>{
    const specialist=item('Specialist',{energy:100,npc:40,tip:15,walk:50,vehicle:50});
    expect(scoreStandalone(specialist,s).total).toBe(0);
  });

  it('still applies numeric authentication to the underlying stat before scoring',()=>{
    const gear=item('Auth',{luck:41},'Bid Arrow Speed',-24);
    expect(effectiveItemStats(gear).arrowReduction).toBe(24);
    expect(scoreStandalone(gear,s).total).toBeCloseTo(41+24*.8,8);
  });

  it('does not average conditional Luck into the neutral Main Auction score',()=>{
    const nocturnal=item('Nocturnal',{luck:100},'Nocturnal',35,'Normal');
    expect(scoreStandalone(nocturnal,s).total).toBe(100);
  });
});
