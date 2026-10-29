import { describe, expect, it } from 'vitest';
import { makeEmptyData, makeInitialData } from '../defaults';
import { csvToGear, gearToCsv } from './csv';
import { exportJson, importJson, normalizeData } from './storage';

function oldBackup(schemaVersion: number) {
  const data = makeEmptyData();
  Object.assign(data, { schemaVersion });
  const sample = makeInitialData();
  data.gear = [{ ...sample.gear[0], id: 'custom-gear', baseName: 'My Custom Gear' }];
  data.trophies = [{ ...sample.trophies[0], id: 'custom-trophy' }];
  return data;
}

describe('P1 backup preservation', () => {
  for (const version of [1, 5, 8]) {
    it(`restores schema-${version} inventory without screenshot replacement or additions`, () => {
      const restored = importJson(exportJson(oldBackup(version)));
      expect(restored.gear.map(item => item.id)).toEqual(['custom-gear']);
      expect(restored.gear[0].baseName).toBe('My Custom Gear');
      expect(restored.ownedCertificates).toEqual([]);
      expect(restored.trophies.map(item => item.id)).toEqual(['custom-trophy']);
    });
  }

  it('preserves explicitly empty old inventory arrays', () => {
    const data = makeEmptyData();
    Object.assign(data, { schemaVersion: 1 });
    const restored = importJson(exportJson(data));
    expect(restored.gear).toEqual([]);
    expect(restored.ownedCertificates).toEqual([]);
    expect(restored.trophies).toEqual([]);
  });

  it('retains the deliberate startup inventory migrations', () => {
    const migrated = normalizeData(oldBackup(1));
    expect(migrated.gear).toHaveLength(39);
    expect(migrated.gear.some(item => item.id === 'custom-gear')).toBe(false);
    expect(migrated.ownedCertificates).toHaveLength(9);
    expect(migrated.trophies).toHaveLength(18);
    expect('vehicleParts' in migrated).toBe(false);
  });

  it('round-trips authentication stat deltas including negative and zero values through CSV', () => {
    const gear = oldBackup(13).gear[0];
    gear.authenticated = true;
    gear.authentication = { kind: 'Premium', effect: 'Focused', value: 0, statDeltas: { luck: -12, zone: 7, walk: 0 } };
    const restored = csvToGear(gearToCsv([gear]))[0];
    expect(restored.authentication.statDeltas).toEqual(gear.authentication.statDeltas);
    expect(restored.stats).toEqual(gear.stats);
  });

  it('round-trips gear star grades through CSV', () => {
    const gear = { ...oldBackup(13).gear[0], gradeStars: 3 };
    expect(csvToGear(gearToCsv([gear]))[0].gradeStars).toBe(3);
    expect(csvToGear(gearToCsv([{ ...gear, gradeStars: undefined }]))[0].gradeStars).toBeUndefined();
  });

  it('applies the inventory update to a record without a schema version', () => {
    const data = oldBackup(1) as unknown as Record<string, unknown>;
    delete data.schemaVersion;
    expect(normalizeData(data as never).gear).toHaveLength(39);
  });

  it('accepts legacy CSV without a stat delta column', () => {
    const restored = csvToGear('Base Name,Slot,Luck\nOld Hat,Head,12')[0];
    expect(restored.authentication.statDeltas).toBeUndefined();
    expect(restored.stats.luck).toBe(12);
  });

  for (const payload of ['not-json', '[]', 'null', '12', '{"unknown":1}', '{"luck":"1"}', '{"luck":null}', '{"luck":1e999}']) {
    it(`rejects invalid authentication stat deltas: ${payload}`, () => {
      const cell = `"${payload.replaceAll('"', '""')}"`;
      expect(() => csvToGear(`Base Name,Slot,Authentication Stat Deltas\nHat,Head,${cell}`)).toThrow(/CSV row 2: Authentication Stat Deltas/);
    });
  }
});
