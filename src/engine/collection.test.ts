import { describe, expect, it } from 'vitest';
import { makeEmptyData, ZERO_STATS } from '../defaults';
import type { GearItem } from '../types';
import { classifyCollection, combinedMutationValue, retainedReplacement } from './collection';

const settings = makeEmptyData().settings;
function item(id: string, baseName = id, stats: Partial<GearItem['stats']> = {}, extra: Partial<GearItem> = {}): GearItem {
  return { id, baseName, name: baseName, slot: 'Head', stats: { ...ZERO_STATS, ...stats }, mutation: 'None', gradeStars: 1, displayedValue: 10,
    authenticated: false, authentication: { kind: 'None', effect: '', value: 0 }, favourite: false, createdAt: '', updatedAt: '', ...extra };
}
const classify = (gear: GearItem[], worn = new Set<string>(), extra = {}) => classifyCollection(gear, worn, settings, { ready: true, certificateTargets: new Set<string>(), ...extra });
describe('physical display collection', () => {
  it('reserves worn copies first and compares mutation stack value rather than Luck or price', () => {
    const gear = [item('worn', 'Goggle', {}, { mutation: 'Void' }), item('stack', 'Goggle', {}, { mutation: 'Diamond + Silver', displayedValue: 20 }), item('chrome', 'Goggle', { luck: 100 }, { mutation: 'Chrome', displayedValue: 1000 })];
    expect(combinedMutationValue(gear[1])).toBe(16);
    const result = classify(gear, new Set(['worn']));
    expect(result.display.map(r => r.item.id)).toEqual(['stack']);
    expect(result.storage.map(r => r.item.id)).toEqual(['chrome']);
  });
  it('keeps provisional competitors and reports a worn type without a spare', () => {
    const gear = [item('worn', 'Jellyfish Wristband'), item('a', 'Vest', {}, { mutation: 'Mystery' }), item('b', 'Vest', {}, { mutation: 'Chrome' })];
    const result = classify(gear, new Set(['worn']));
    expect(result.missingDisplay).toEqual([{ baseName: 'Jellyfish Wristband', slot: 'Head' }]);
    expect(result.display[0].provisional).toBe(true);
    expect(result.storage).toHaveLength(1);
    expect(result.discard).toEqual([]);
  });
  it('groups the same base name separately by slot and retains all records', () => {
    const gear = [item('a', 'Shared'), item('b', 'Shared', {}, { slot: 'Back' })];
    const result = classify(gear);
    expect(result.display).toHaveLength(2);
    expect(gear).toHaveLength(2);
  });
});
describe('retained disposal proof', () => {
  it('proves componentwise current/native auction dominance, allows extra Arrow, and ignores irrelevant Walk', () => {
    const target = item('weak', 'Duplicate', { arrowReduction: 19, recovery: -4, walk: 20 });
    const witness = item('strong', 'Other', { arrowReduction: 45, energy: 38 });
    // Walk is strongest on weak, so a future Focused roll would change target: keep it.
    expect(retainedReplacement(target, [witness], settings)).toBeUndefined();
    target.stats.walk = -1;
    expect(retainedReplacement(target, [witness], settings)?.id).toBe('strong');
  });
  it('uses only retained witnesses and sorts recommendations by known observed value', () => {
    const gear = [item('display', 'Duplicate', {}, { mutation: 'Diamond' }), item('weak', 'Duplicate', { luck: 1 }, { displayedValue: 20 }), item('middle', 'Duplicate', { luck: 2 }, { displayedValue: 5 }), item('witness', 'Other', { luck: 3 })];
    const result = classify(gear);
    expect(result.discard.map(r => r.item.id)).toEqual(['middle', 'weak']);
    const retained = new Set([...result.display, ...result.storage].map(r => r.item.id));
    expect(result.discard.every(r => r.witnessId && retained.has(r.witnessId))).toBe(true);
  });
  it('protects locks, certificate targets, unpriced items, unknown stats/mutations, grade potential and native losses', () => {
    const witness = item('witness', 'Other', { luck: 10 }, { gradeStars: 2 });
    const target = item('target', 'Duplicate', { luck: 5 }, { gradeStars: 1 });
    expect(retainedReplacement(target, [witness], settings)).toBeUndefined();
    witness.gradeStars = 1;
    for (const patch of [{ favourite: true }, { displayedValue: undefined }, { needsReview: true }, { mutation: 'Emerald' }]) {
      const gear = [item('display', 'Duplicate', {}, { mutation: 'Diamond' }), { ...target, ...patch }, witness];
      expect(classify(gear).discard).toEqual([]);
    }
    expect(classify([item('display', 'Duplicate', {}, { mutation: 'Diamond' }), target, witness], new Set(), { certificateTargets: new Set(['target']) }).discard).toEqual([]);
    expect(retainedReplacement(target, [{ ...witness, stats: { ...witness.stats, luck: 1 }, authenticated: true, authentication: { kind: 'Normal', effect: 'Luck', value: 20 } }], settings)).toBeUndefined();
  });
  it('requires fresh analyses and preserves exact Luck exploration and unverified mutation witnesses', () => {
    const gear = [item('display', 'Duplicate', {}, { mutation: 'Diamond' }), item('target', 'Duplicate', { luck: 1 }), item('witness', 'Other', { luck: 10 })];
    expect(classify(gear, new Set(), { ready: false }).discard).toEqual([]);
    expect(classifyCollection(gear, new Set(), { ...settings, goalMode: 'luck', luckTarget: 1 }, { ready: true, certificateTargets: new Set() }).discard).toEqual([]);
    expect(retainedReplacement(gear[1], [{ ...gear[2], mutation: 'Emerald' }], settings)).toBeUndefined();
  });
});

it('does not treat missing condition digits as unknown stats and preserves Focused targeting including Walk', () => {
 const weak = { ...item('weak', 'Duplicate', { luck: 2 }, { displayedValue: 5 }), metadataUncertain: ['conditionPct'] };
 const gear = [item('display', 'Duplicate', {}, { mutation: 'Diamond' }), weak, item('witness', 'Other', { luck: 3 })];
 expect(classify(gear).discard.map(r => r.item.id)).toEqual(['weak']);
 const strongWalk = item('walk', 'Other', { luck: 100, walk: 101 });
 expect(retainedReplacement(weak, [strongWalk], settings)).toBeUndefined();
});

it('recalculates the reviewed 80-copy snapshot from current worn gear and retained proofs', async () => {
 const { makeCurrentGear } = await import('../data/currentCollection');
 const { buildGearLoadouts } = await import('./gearLoadouts');
 const gear = makeCurrentGear();
 const best = buildGearLoadouts(gear, settings).main!;
 const worn = new Set([best.head.id, best.back.id, best.wrist.id]);
 const result = classify(gear, worn);
 expect(gear).toHaveLength(80);
 expect([best.head.sourceImage, best.back.sourceImage, best.wrist.sourceImage]).toEqual(['IMG_8366.jpg', 'IMG_8403.jpg', 'IMG_8408.jpg']);
 expect(result.display).toHaveLength(54);
 expect(result.discard.map(r => r.item.sourceImage)).toEqual(['IMG_8376.jpg', 'IMG_8392.jpg', 'IMG_8379.jpg', 'IMG_8386.jpg', 'IMG_8416.jpg', 'IMG_8406.jpg', 'IMG_8369.jpg']);
 expect(result.storage).toHaveLength(16);
 expect(result.display.find(r => r.item.baseName === 'Steampunk Goggle')?.item.sourceImage).toBe('IMG_8375.jpg');
 expect(result.display.find(r => r.item.baseName === 'Tactical Vest')?.item.sourceImage).toBe('IMG_8405.jpg');
 expect(result.missingDisplay).toContainEqual({ baseName: 'Jellyfish Wristband', slot: 'Wrist' });
 const retained = new Set([...worn, ...result.display.map(r => r.item.id), ...result.storage.map(r => r.item.id)]);
 expect(result.discard.every(r => r.witnessId && retained.has(r.witnessId))).toBe(true);
 expect(result.display.length + result.storage.length + result.discard.length + worn.size).toBe(80);
});
