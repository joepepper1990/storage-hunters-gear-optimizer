import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { csvToGear, gearToCsv } from './csv';
import { exportJson, importJson } from './storage';
import type { GearItem } from '../types';

const now='2026-08-28T00:00:00Z';
const gear:GearItem={id:'abc',name:'Duplicate, "quoted"',slot:'Back',stats:{luck:41,energy:0,tip:0,walk:-1,vehicle:0,recovery:0,zone:0,arrowReduction:24,npc:7.7},authenticated:true,authentication:{kind:'Normal',effect:'Bid Arrow Speed',value:-24},notes:'line 1\nline 2',favourite:true,createdAt:now,updatedAt:now};

describe('backup round trips',()=>{
  it('round-trips JSON without losing gear values',()=>{
    const d=makeInitialData();d.gear=[gear];const restored=importJson(exportJson(d));
    expect(restored.gear[0].stats.arrowReduction).toBe(24);
    expect(restored.gear[0].name).toBe(gear.name);
  });
  it('round-trips CSV including game Arrow sign convention',()=>{
    const restored=csvToGear(gearToCsv([gear]))[0];
    expect(restored.stats.arrowReduction).toBe(24);
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
});
