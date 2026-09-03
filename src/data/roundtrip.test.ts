import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { csvToGear, gearToCsv } from './csv';
import { exportJson, importJson } from './storage';
import type { GearItem } from '../types';

const now='2026-08-28T00:00:00Z';
const gear:GearItem={id:'abc',baseName:'Duplicate, "quoted"',name:'Duplicate, "quoted" — Luck +41% / Walk -1% / NPC +7.7% / Auth Arrow -24%',slot:'Back',stats:{luck:41,energy:0,tip:0,walk:-1,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:7.7},authenticated:true,authentication:{kind:'Normal',effect:'Bid Arrow Speed',value:-24},favourite:true,createdAt:now,updatedAt:now};

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
    expect(restored.baseName).toBe(gear.baseName);
    expect(restored.name).toContain('Auth Arrow -24%');
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
    d.trophies=[{id:'t1',name:'legacy label',modifiers:[{mutation:'Void',boostPct:42},{mutation:'Gold',boostPct:80}],favourite:true,createdAt:now,updatedAt:now}];
    d.trophySettings.mutationWeights.find(w=>w.mutation==='Rainbow')!.multiplier=90;
    const restored=importJson(exportJson(d));
    expect(restored.trophies[0].modifiers[0].boostPct).toBe(42);
    expect(restored.trophies[0].name).toBe('Void +42% / Gold +80%');
    expect(restored.trophySettings.maxActive).toBe(4);
    expect(restored.trophySettings.mutationWeights.find(w=>w.mutation==='Rainbow')?.multiplier).toBe(90);
  });

  it('preserves historical Alien authentication and legacy roll history while adding current normal auth defaults',()=>{
    const d=makeInitialData() as any;
    d.gear=[{...gear,id:'legacy-alien',baseName:'Legacy Wrist',slot:'Wrist',authenticated:true,authentication:{kind:'Alien',effect:'Rush',value:10}}];
    d.authModel=[{id:'old-rush',certificateType:'Certificate of Alienticity',slot:'Any',outcome:'Rush',category:'Alien',assumedLikelihoodClass:'MEDIUM',observedSampleCount:1,observedValues:[10],confidence:'Low',enabled:true}];
    d.rollLog=[{id:'r1',date:now,certificateType:'Certificate of Alienticity',itemId:'legacy-alien',itemName:'Legacy Wrist',slot:'Wrist',previousAuthentication:'',previousValue:0,newAuthentication:'Rush',newValue:10,improvedBestSet:true,bestScoreBefore:0,bestScoreAfter:1.5}];
    const restored=importJson(exportJson(d));
    expect(restored.gear[0].authentication).toEqual({kind:'Alien',effect:'Rush',value:10});
    expect(restored.rollLog[0].certificateType).toBe('Certificate of Alienticity');
    expect(restored.authModel.some((m:any)=>m.certificateType==='Certificate of Alienticity'&&m.outcome==='Rush')).toBe(true);
    expect(restored.authModel.some((m:any)=>m.certificateType==='Normal Certificate of Authenticity'&&m.outcome==='Energy Drink Time')).toBe(true);
  });

  it('round-trips Energy Drink Time authentication metadata',()=>{
    const d=makeInitialData();
    d.gear=[{...gear,id:'energy-auth',baseName:'Energy Helm',slot:'Head',stats:{...gear.stats,energy:40},authentication:{kind:'Normal',effect:'Energy Drink Time',value:20}}];
    const restored=importJson(exportJson(d));
    expect(restored.gear[0].stats.energy).toBe(40);
    expect(restored.gear[0].authentication.effect).toBe('Energy Drink Time');
    expect(restored.gear[0].authentication.value).toBe(20);
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
