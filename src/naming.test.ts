import { describe, expect, it } from 'vitest';
import { generateGearName, generateTrophyName, generateVehiclePartName } from './naming';
import type { GearStats } from './types';

const zero:GearStats={luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0};

describe('automatic inventory naming',()=>{
  it('names a one-modifier trophy exactly from the modifier',()=>{
    expect(generateTrophyName([{mutation:'Silver',boostPct:54}])).toBe('Silver +54%');
  });
  it('names a two-modifier trophy in entered order',()=>{
    expect(generateTrophyName([{mutation:'Gem',boostPct:110},{mutation:'Silver',boostPct:50}])).toBe('Gem +110% / Silver +50%');
  });
  it('appends non-zero gear stats and preserves game Arrow sign',()=>{
    expect(generateGearName('Crab Backpack',{...zero,luck:41,arrowReduction:24},true,{kind:'Normal',effect:'NPC Offers Bonus',value:7.7}))
      .toBe('Crab Backpack — Luck +41% / Arrow -24% / Auth NPC +7.7%');
  });
  it('appends vehicle part performance stats',()=>{
    expect(generateVehiclePartName('Manta Spoiler',{speedPct:26,accelerationPct:-16,handlingPct:0,capacityKg:0}))
      .toBe('Manta Spoiler — Speed +26% / Accel -16%');
  });
});
