import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeInitialData, ZERO_STATS } from '../defaults';
import type { GearItem, GearStats, Slot } from '../types';
import { analyseGearRetention, buildGearLoadouts } from './gearLoadouts';

function gear(id: string, slot: Slot, stats: Partial<GearStats> = {}, auth?: GearItem['authentication'], mutation?: string): GearItem {
  return { id, baseName: id, name: id, slot, mutation, stats: { ...ZERO_STATS, ...stats }, authenticated: Boolean(auth),
    authentication: auth ?? { kind: 'None', effect: '', value: 0 }, favourite: false, createdAt: '', updatedAt: '' };
}
const s = LOCKED_DEFAULT_SETTINGS;
const result = (items: GearItem[], id: string) => analyseGearRetention(items, s).find(a => a.item.id === id)!;

describe('Keep: the Luck/Arrow frontier', () => {
  // Best set today: balanced Head 70 Luck / 35 Arrow + Back 35 Arrow = 70%.
  const balanced = gear('balanced', 'Head', { luck: 70, arrowReduction: 35 });
  const highLuck = gear('high-luck', 'Head', { luck: 95, arrowReduction: 10 });
  const highArrow = gear('high-arrow', 'Head', { luck: 20, arrowReduction: 70 });
  const back = gear('back', 'Back', { arrowReduction: 35 });
  const wrist = gear('wrist', 'Wrist', { luck: 10 });
  const items = [balanced, highLuck, highArrow, back, wrist];

  it('equips the balanced Head today', () => {
    expect(buildGearLoadouts(items, s).main!.head.id).toBe('balanced');
    expect(result(items, 'balanced')).toMatchObject({ verdict: 'EQUIP', reason: 'Current Best Set' });
  });
  it('keeps a high-Luck / low-Arrow alternative that a future high-Arrow piece would make best', () => {
    expect(result(items, 'high-luck')).toMatchObject({ verdict: 'KEEP', reason: 'High Luck alternative' });
  });
  it('keeps a high-Arrow / low-Luck item that would free the other slots for Luck', () => {
    expect(result(items, 'high-arrow')).toMatchObject({ verdict: 'KEEP', reason: 'High Arrow alternative' });
  });
  it('does not discard an item because another has more Luck but less Arrow, or the reverse', () => {
    for (const id of ['high-luck', 'high-arrow']) expect(result(items, id).verdict).not.toBe('SAFE TO DISCARD');
  });
  it('discards an item that is never best, whatever Arrow a future piece brings', () => {
    const redundant = gear('redundant', 'Head', { luck: 60, arrowReduction: 35 });
    expect(result([...items, redundant], 'redundant')).toMatchObject({ verdict: 'SAFE TO DISCARD', reason: 'Not needed in any best set' });
  });
  it('ignores a knife-edge win at one exact Arrow value', () => {
    // 3 Arrow apart, equal otherwise: only a 1-step window at the band edge separates them.
    const a = gear('a', 'Head', { luck: 100 }), b = gear('b', 'Head', { luck: 99, arrowReduction: -2 });
    const list = [a, b, gear('back2', 'Back', { arrowReduction: 70 }), gear('w2', 'Wrist')];
    expect(result(list, 'b').verdict).toBe('SAFE TO DISCARD');
  });
});

describe('Keep: authentication, mutation and other exceptions', () => {
  it('keeps an otherwise weaker item with a wanted contextual authentication that can be best', () => {
    const sunny = gear('sunny', 'Head', { luck: 60 }, { kind: 'Normal', effect: 'Sunny', value: 80 });
    const plain = gear('plain', 'Head', { luck: 80 });
    const list = [sunny, plain, gear('b', 'Back', { arrowReduction: 70 }), gear('w', 'Wrist')];
    expect(result(list, 'sunny')).toMatchObject({ verdict: 'KEEP', reason: 'Valuable authentication' });
  });
  it('keeps a mutation that pays off through Premium Mutated Luck, and not otherwise', () => {
    const onyx = gear('onyx', 'Back', { luck: 30 }, undefined, 'Onyx');
    const better = gear('better', 'Back', { luck: 40 });
    const list = [gear('h', 'Head', { arrowReduction: 70 }), onyx, better, gear('w', 'Wrist')];
    expect(result(list, 'onyx')).toMatchObject({ verdict: 'KEEP', reason: 'Valuable mutation' });
    const plain = gear('plain', 'Back', { luck: 30 });
    expect(result([...list.filter(g => g.id !== 'onyx'), plain], 'plain').verdict).toBe('SAFE TO DISCARD');
  });
  it('keeps unresolved Focused and favourites', () => {
    const focused = gear('focused', 'Back', {}, { kind: 'Normal', effect: 'Focused', value: 0 });
    const fav = { ...gear('fav', 'Back'), favourite: true };
    const list = [gear('h', 'Head', { arrowReduction: 70 }), gear('best', 'Back', { luck: 100 }), focused, fav, gear('w', 'Wrist')];
    expect(result(list, 'focused')).toMatchObject({ verdict: 'KEEP', reason: 'Focused potential' });
    expect(result(list, 'fav')).toMatchObject({ verdict: 'KEEP', reason: 'Locked by you' });
  });
  it('never discards a Best Set item or one tied with it', () => {
    const a = gear('a', 'Head', { luck: 50, arrowReduction: 70 }), twin = gear('twin', 'Head', { luck: 50, arrowReduction: 70 });
    const list = [a, twin, gear('b', 'Back'), gear('w', 'Wrist')];
    const verdicts = analyseGearRetention(list, s).filter(x => x.item.slot === 'Head').map(x => x.verdict).sort();
    expect(verdicts).toEqual(['EQUIP', 'KEEP']);
  });
  it('does not keep a weak item for Recovery, Tip, NPC or Walkspeed', () => {
    const minor = gear('minor', 'Head', { recovery: 20, tip: 15, npc: 15, walk: 30 });
    const list = [gear('h', 'Head', { luck: 100, arrowReduction: 70 }), gear('h0', 'Head', { luck: 50 }), minor, gear('b', 'Back'), gear('w', 'Wrist')];
    expect(result(list, 'minor').verdict).toBe('SAFE TO DISCARD');
  });
  it('keeps everything until a full Head + Back + Wrist set exists', () => {
    const list = [gear('h1', 'Head', { luck: 10 }), gear('h2', 'Head', { luck: 90 })];
    expect(analyseGearRetention(list, s).map(a => a.verdict)).toEqual(['KEEP', 'KEEP']);
  });
});

describe('Keep on the verified inventory', () => {
  it('is selective and fast', () => {
    const data = makeInitialData();
    const start = Date.now();
    const analyses = analyseGearRetention(data.gear, data.settings);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(analyses.filter(a => a.verdict === 'EQUIP')).toHaveLength(3);
    const kept = analyses.filter(a => a.verdict === 'KEEP').length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(data.gear.length / 2);
  });
});
