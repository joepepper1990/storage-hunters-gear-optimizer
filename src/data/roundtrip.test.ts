import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { csvToGear, gearToCsv } from './csv';
import { exportJson, importJson } from './storage';
import type { GearItem } from '../types';

const now='2026-08-28T00:00:00Z';
const gear:GearItem={id:'abc',name:'Duplicate, "quoted"',slot:'Back',stats:{luck:41,energy:0,tip:0,walk:-1,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:7.7},authenticated:true,authentication:{kind:'Normal',effect:'Bid Arrow Speed',value:-24},notes:'line 1\nline 2',favourite:true,createdAt:now,updatedAt:now};

describe('backup round trips',()=>{
  it('round-trips JSON without losing gear values',()=>{
    const d=makeInitialData();d.gear=[gear];const restored=importJson(exportJson(d));
    expect(restored.gear[0].stats.arrowReduction).toBe(0);
    expect(restored.gear[0].name).toBe(gear.name);
  });
  it('round-trips CSV including game Arrow sign convention',()=>{
    const restored=csvToGear(gearToCsv([gear]))[0];
    expect(restored.stats.arrowReduction).toBe(0);
    expect(restored.authentication.value).toBe(-24);
    expect(restored.notes).toBe(gear.notes);
  });
  it('treats blank CSV numeric fields as zero',()=>{
    const restored=csvToGear('Name,Slot,Luck\nBlank stats,Head,\n')[0];
    expect(restored.stats.luck).toBe(0);
    expect(restored.stats.arrowReduction).toBe(0);
  });
  it('rejects malformed JSON numeric values rather than silently producing NaN',()=>{
    const d=makeInitialData() as any;
    d.gear=[{...gear,stats:{...gear.stats,luck:'not-a-number'}}];
    expect(()=>importJson(JSON.stringify(d))).toThrow();
  });
  it('rejects malformed algorithm settings from backups',()=>{
    const d=makeInitialData() as any;
    d.settings.arrowPenaltyThreshold='not-a-number';
    expect(()=>importJson(JSON.stringify(d))).toThrow();
  });
  it('round-trips vehicle parts, trailers and active vehicle configuration',()=>{
    const d=makeInitialData();
    d.vehicleProfile.capacityMultiplier=1.5;
    d.vehicleParts[0].capacityKg=60;
    d.trailers[2].capacityKg=600;
    const restored=importJson(exportJson(d));
    expect(restored.vehicleProfile.name).toBe('Dumpster Truck');
    expect(restored.vehicleProfile.capacityMultiplier).toBe(1.5);
    expect(restored.vehicleParts[0].capacityKg).toBe(60);
    expect(restored.trailers[2].capacityKg).toBe(600);
  });

  it('round-trips Gavel Trophies and editable mutation weights',()=>{
    const d=makeInitialData();
    d.trophies=[{id:'t1',name:'Void / Gold',modifiers:[{mutation:'Void',boostPct:42},{mutation:'Gold',boostPct:80}],favourite:true,createdAt:now,updatedAt:now}];
    d.trophySettings.mutationWeights.find(w=>w.mutation==='Rainbow')!.multiplier=90;
    const restored=importJson(exportJson(d));
    expect(restored.trophies[0].modifiers[0].boostPct).toBe(42);
    expect(restored.trophySettings.maxActive).toBe(4);
    expect(restored.trophySettings.mutationWeights.find(w=>w.mutation==='Rainbow')?.multiplier).toBe(90);
  });
  it('migrates an older gear-only backup without losing gear',()=>{
    const d=makeInitialData() as any;
    d.schemaVersion=1;
    d.gear=[gear];
    delete d.vehicleProfile; delete d.vehicleSettings; delete d.vehicleParts; delete d.trailers; delete d.trophies; delete d.trophySettings;
    const restored=importJson(JSON.stringify(d));
    expect(restored.gear[0].name).toBe(gear.name);
    expect(restored.vehicleProfile.name).toBe('Dumpster Truck');
    expect(restored.vehicleParts.length).toBeGreaterThan(0);
    expect(restored.trailers.find((t:any)=>t.name==='Long Trailer')?.capacityKg).toBe(600);
    expect(restored.trophies).toEqual([]);
    expect(restored.trophySettings.maxActive).toBe(4);
  });
});
