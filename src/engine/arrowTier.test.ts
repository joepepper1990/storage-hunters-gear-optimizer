import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, ZERO_STATS } from '../defaults';
import { arrowTier, buildGearLoadouts } from './gearLoadouts';
import { optimise } from './optimizer';
import type { GearItem, GearStats, Slot } from '../types';

function gear(id:string,slot:Slot,stats:Partial<GearStats>={}):GearItem {
  return {id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:false,
    authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''};
}
const s=LOCKED_DEFAULT_SETTINGS;

describe('Arrow tiers: inside 65-80% first, then above 80%, then below 65%',()=>{
  it('classifies combined Arrow at the band edges',()=>{
    expect([64.9,65,72,80,80.1,95].map(r=>arrowTier({arrowReduction:r},s))).toEqual([0,2,2,2,1,1]);
  });
  it('picks a set inside the band over one above it with far more Luck',()=>{
    const items=[gear('in','Head',{arrowReduction:70}),gear('over','Head',{arrowReduction:90,luck:300}),gear('b','Back'),gear('w','Wrist')];
    expect(buildGearLoadouts(items,s).main!.head.id).toBe('in');
    expect(optimise(items,s,1)[0].head.id).toBe('in');
  });
  it('still prefers a set above the band to one below it',()=>{
    const items=[gear('over','Head',{arrowReduction:90}),gear('under','Head',{arrowReduction:60,luck:300}),gear('b','Back'),gear('w','Wrist')];
    expect(buildGearLoadouts(items,s).main!.head.id).toBe('over');
  });
  it('lets Luck decide within the band',()=>{
    const items=[gear('a','Head',{arrowReduction:66,luck:100}),gear('c','Head',{arrowReduction:79,luck:90}),gear('b','Back'),gear('w','Wrist')];
    expect(buildGearLoadouts(items,s).main!.head.id).toBe('a');
  });
  it('avoids overshooting by combining pieces',()=>{
    // 50 + 40 = 90% overshoots; 50 + 20 = 70% is inside the band.
    const items=[gear('h','Head',{arrowReduction:50}),gear('big','Back',{arrowReduction:40,luck:200}),gear('small','Back',{arrowReduction:20,luck:10}),gear('w','Wrist')];
    expect(buildGearLoadouts(items,s).main!.back.id).toBe('small');
  });
});
