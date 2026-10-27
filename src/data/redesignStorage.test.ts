import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeInitialData } from '../defaults';
import { exportJson, importJson, normalizeData } from './storage';
import type { AppData } from '../types';

function roll(overrides:Record<string,unknown>={}) {
  return {id:'r1',date:'2026-10-20T10:00:00.000Z',certificateType:'Normal Certificate of Authenticity',itemId:'x',itemName:'Old Cap',slot:'Head',
    previousAuthentication:'',previousValue:0,newAuthentication:'Luck',newValue:12,improvedBestSet:true,bestScoreBefore:100,bestScoreAfter:112,
    certificateInventoryType:'Wooden Certificate of Authenticity',...overrides};
}
function backupWith(rows:unknown[]):string {
  const d=makeInitialData() as unknown as Record<string,unknown>;
  d.rollLog=rows;
  return JSON.stringify(d);
}

describe('settings migration 2.0 -> 2.1',()=>{
  const v20={...LOCKED_DEFAULT_SETTINGS,version:'2.0',arrowWeight:.8,arrowSweetSpot:75} as unknown as AppData['settings'];
  it('moves the old default Arrow coefficient and sweet spot to the new defaults',()=>{
    const d=makeInitialData();d.settings=v20;
    const migrated=normalizeData(d);
    expect(migrated.settings.version).toBe('2.1');
    expect(migrated.settings.arrowWeight).toBe(migrated.settings.luckWeight);
    expect(migrated.settings.arrowSweetSpot).toBe(65);
  });
  it('keeps every customised value exactly, including unrelated settings',()=>{
    const d=makeInitialData();
    d.settings={...v20,arrowWeight:.55,arrowSweetSpot:70,luckWeight:1.37,zoneWeight:.65,recoveryWeight:.33,energyTarget:60};
    const migrated=normalizeData(d);
    expect(migrated.settings).toMatchObject({arrowWeight:.55,arrowSweetSpot:70,luckWeight:1.37,zoneWeight:.65,recoveryWeight:.33,energyTarget:60});
  });
  it('adds specialist priorities that preserve the previous order',()=>{
    const d=makeInitialData();d.settings=v20;
    const migrated=normalizeData(d).settings;
    expect(migrated.drinkPriority).toBeGreaterThan(migrated.gradingPriority);
    expect(migrated.gradingPriority).toBeGreaterThan(migrated.shopPriority);
    expect([migrated.shopTipWeight,migrated.shopNpcWeight]).toEqual([.4,.3]);
  });
  it('never re-migrates a 2.1 value that happens to equal an old default',()=>{
    const d=makeInitialData();d.settings={...LOCKED_DEFAULT_SETTINGS,arrowWeight:.8,arrowSweetSpot:75};
    expect(normalizeData(d).settings).toMatchObject({arrowWeight:.8,arrowSweetSpot:75});
  });
  it('preserves inventory, certificates, settings and history on reload',()=>{
    const d=makeInitialData();
    d.settings={...d.settings,zoneWeight:.61,shopPriority:9};
    d.rollLog=[roll() as AppData['rollLog'][number]];
    const reloaded=normalizeData(JSON.parse(exportJson(d)));
    expect(reloaded.gear).toEqual(d.gear);
    expect(reloaded.ownedCertificates).toEqual(d.ownedCertificates);
    expect(reloaded.settings).toEqual(d.settings);
    expect(reloaded.rollLog).toEqual(d.rollLog);
    expect(reloaded.trophies.length).toBe(d.trophies.length);
    expect(reloaded.vehicleParts.length).toBe(d.vehicleParts.length);
  });
  it('round-trips a backup with custom preferences unchanged',()=>{
    const d=makeInitialData();
    d.settings={...d.settings,luckWeight:2.5,zoneWeight:.65,drinkPriority:0};
    d.vehicleSettings={...d.vehicleSettings,speedWeight:37};
    const restored=importJson(exportJson(d));
    expect(restored.settings).toEqual(d.settings);
    expect(restored.vehicleSettings).toEqual(d.vehicleSettings);
    expect(restored.gear).toEqual(d.gear);
  });
});

describe('P2: JSON roll history is validated and normalised on restore',()=>{
  it('converts numeric strings to numbers so accepted rows can render',()=>{
    const restored=importJson(backupWith([roll({previousValue:'0',newValue:'12.5',bestScoreBefore:'100',bestScoreAfter:'112',certificateGradeStars:'2'})]));
    const r=restored.rollLog[0];
    expect(typeof r.newValue).toBe('number');
    expect(r.newValue).toBe(12.5);
    expect(r.bestScoreBefore.toFixed(2)).toBe('100.00');
    expect(r.certificateGradeStars).toBe(2);
  });
  it.each([
    ['non-numeric score',{bestScoreBefore:'abc'}],
    ['empty-string value',{newValue:''}],
    ['object value',{newValue:{}}],
    ['missing outcome',{newAuthentication:undefined}],
    ['numeric outcome',{newAuthentication:5}],
    ['invalid slot',{slot:'Leg'}],
    ['unknown certificate type',{certificateType:'Gold Certificate',certificateInventoryType:undefined}],
    ['fractional grade',{certificateGradeStars:1.5}],
    ['bad warnings',{modelWarnings:'oops'}],
    ['bad stat deltas',{observedStatDeltas:{luck:'5'}}]
  ])('rejects %s',(_label,overrides)=>{
    expect(()=>importJson(backupWith([roll(overrides)]))).toThrow(/Roll log row 1/);
  });
  it('rejects a non-object row',()=>{
    expect(()=>importJson(backupWith(['nope']))).toThrow(/Roll log row 1/);
  });
  it('keeps malformed stored history renderable on startup instead of refusing to load',()=>{
    const d=makeInitialData() as unknown as Record<string,unknown>;
    d.rollLog=[roll({bestScoreBefore:'abc',newValue:'7'})];
    const loaded=normalizeData(d as unknown as AppData);
    expect(loaded.rollLog).toHaveLength(1);
    expect(loaded.rollLog[0].newValue).toBe(7);
    expect(loaded.rollLog[0].bestScoreBefore.toFixed(2)).toBe('0.00');
  });
});

describe('review: startup coercion keeps every stored roll field',()=>{
  it('preserves evidence fields and does not relabel an unknown certificate type',()=>{
    const d=makeInitialData() as unknown as Record<string,unknown>;
    d.rollLog=[roll({modelWarnings:[null,'kept'],normalizedRollPosition:.4,observedStatDeltas:{luck:12},certificateType:'Future Certificate',certificateInventoryType:undefined,customField:'x'})];
    const loaded=normalizeData(d as unknown as AppData).rollLog[0] as unknown as Record<string,unknown>;
    expect(loaded.normalizedRollPosition).toBe(.4);
    expect(loaded.observedStatDeltas).toEqual({luck:12});
    expect(loaded.modelWarnings).toEqual(['kept']);
    expect(loaded.certificateType).toBe('Future Certificate');
    expect(loaded.customField).toBe('x');
    expect(loaded.newValue).toBe(12);
  });
});
