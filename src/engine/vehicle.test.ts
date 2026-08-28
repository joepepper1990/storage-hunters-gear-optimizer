import { describe, expect, it } from 'vitest';
import { analyseTrailers, analyseVehicleParts, calculateVehicleStats, optimiseVehicle, scoreVehicleStats, vehicleCombinationCount } from './vehicle';
import type { Trailer, VehicleOptimiserSettings, VehiclePart, VehicleProfile } from '../types';

const profile: VehicleProfile = { name: 'Dumpster Truck', baseSpeed: 69, baseAcceleration: 1, baseHandling: 90, baseCapacityKg: 2750, capacityMultiplier: 1.5 };
const settings: VehicleOptimiserSettings = { capacityWeight: 45, speedWeight: 30, accelerationWeight: 15, handlingWeight: 10 };
const now = '2026-08-28T00:00:00.000Z';
const part = (id:string,name:string,slot:VehiclePart['slot'],speedPct:number,accelerationPct:number,capacityKg=0,handlingPct=0):VehiclePart => ({id,name,slot,speedPct,accelerationPct,capacityKg,handlingPct,favourite:false,createdAt:now,updatedAt:now});
const trailer = (id:string,name:string,capacityKg:number):Trailer => ({id,name,capacityKg,favourite:false,createdAt:now,updatedAt:now});
const tractor=part('wheel','[Silver] Tractor Wheel Stack','Wheel Stack',15,15,60);
const caution=part('exhaust','Caution Line Exhaust','Exhaust',18,18);
const manta=part('spoiler','Manta Spoiler','Spoiler',26,-16);
const long=trailer('long','Long Trailer',600);

describe('vehicle formula',()=>{
  it('matches the Silver Tractor Wheel Stack in-game test',()=>{
    const s=calculateVehicleStats(profile,[tractor],null);
    expect(s.speedExact).toBeCloseTo(79.35,10);
    expect(s.speedDisplay).toBe(79);
    expect(s.acceleration).toBeCloseTo(1.15,10);
    expect(s.handlingDisplay).toBe(90);
    expect(s.capacityKg).toBe(4185);
  });

  it('stacks Speed and Acceleration percentages additively',()=>{
    const s=calculateVehicleStats(profile,[tractor,caution],null);
    expect(s.speedBonusPct).toBe(33);
    expect(s.speedExact).toBeCloseTo(91.77,10);
    expect(s.speedDisplay).toBe(92);
    expect(s.acceleration).toBeCloseTo(1.33,10);
  });

  it('matches the predicted three-part setup',()=>{
    const s=calculateVehicleStats(profile,[tractor,caution,manta],null);
    expect(s.speedBonusPct).toBe(59);
    expect(s.speedDisplay).toBe(110);
    expect(s.accelerationBonusPct).toBe(17);
    expect(s.acceleration).toBeCloseTo(1.17,10);
    expect(s.capacityKg).toBe(4185);
  });

  it('applies trailer capacity before the 50% gamepass and wheel capacity after it',()=>{
    const s=calculateVehicleStats(profile,[tractor],long);
    expect(s.capacityKg).toBe(5085);
  });

  it('does not multiply accessory percentage rolls',()=>{
    const additive=calculateVehicleStats(profile,[tractor,caution],null);
    expect(additive.speedExact).not.toBeCloseTo(69*1.15*1.18,5);
  });
});

describe('vehicle optimiser',()=>{
  it('uses editable priority weights on percentage improvements',()=>{
    const s=calculateVehicleStats(profile,[tractor,caution,manta],long);
    const scored=scoreVehicleStats(s,settings);
    expect(scored.scoreComponents.speed).toBeCloseTo(17.7,5);
    expect(scored.scoreComponents.acceleration).toBeCloseTo(2.55,5);
    expect(scored.scoreComponents.capacity).toBeCloseTo(s.capacityImprovementPct*0.45,5);
  });

  it('includes a no-part and no-trailer option',()=>{
    expect(vehicleCombinationCount([tractor,caution,manta],[long])).toBe(16);
    const results=optimiseVehicle([],[],profile,settings,10);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].stats.capacityKg).toBe(4125);
  });

  it('chooses the strongest known balanced setup from the seeded examples',()=>{
    const results=optimiseVehicle([tractor,caution,manta],[long],profile,settings,10);
    expect(results[0].spoiler?.id).toBe('spoiler');
    expect(results[0].exhaust?.id).toBe('exhaust');
    expect(results[0].wheelStack?.id).toBe('wheel');
    expect(results[0].trailer?.id).toBe('long');
  });

  it('proves same-slot raw performance dominance',()=>{
    const weak=part('weak','Weak wheels','Wheel Stack',10,10,30);
    const analyses=analyseVehicleParts([tractor,weak],optimiseVehicle([tractor,weak],[],profile,settings,10)[0]);
    const verdict=analyses.find(a=>a.item.id==='weak');
    expect(verdict?.verdict).toBe('SAFE TO DISCARD');
    expect(verdict?.dominator?.id).toBe('wheel');
  });

  it('keeps trade-offs that are not globally dominated',()=>{
    const fast=part('fast','Fast spoiler','Spoiler',30,-20,0);
    const balanced=part('balanced','Balanced spoiler','Spoiler',20,10,0);
    const analyses=analyseVehicleParts([fast,balanced],optimiseVehicle([fast,balanced],[],profile,settings,10)[0]);
    expect(analyses.every(a=>a.verdict!=='SAFE TO DISCARD')).toBe(true);
  });

  it('marks lower-capacity trailers redundant when no downside is documented',()=>{
    const wooden=trailer('wood','Wooden Trailer',175);
    const normal=trailer('normal','Trailer',300);
    const best=optimiseVehicle([], [wooden,normal,long], profile, settings, 10)[0];
    const analyses=analyseTrailers([wooden,normal,long],best);
    expect(analyses.find(a=>a.item.id==='wood')?.verdict).toBe('SAFE TO DISCARD');
    expect(analyses.find(a=>a.item.id==='long')?.verdict).toBe('EQUIP');
  });
});
