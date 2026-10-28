import { describe, expect, it } from 'vitest';
import { makeInitialData, LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { buildGearLoadouts } from './gearLoadouts';
import { estimateStarValue, expectedRegradeChange, regradeSuggestions } from './regrade';
import { normalizeData, exportJson, importJson } from '../data/storage';
import { applyDraft, knownSlots, matchDraft } from '../data/screenshotImport';
import { parsePanel } from '../scanner/panel';

describe('star value', () => {
  it('works out what a star adds from a regrade', () => {
    // 1★ → 3★ with 10% per star: (1 + 0.3) / (1 + 0.1).
    const est = estimateStarValue([{ id: 'a', date: '', itemName: 'X', fromStars: 1, toStars: 3, ratio: 1.3 / 1.1 }]);
    expect(est?.perStar).toBeCloseTo(0.1, 9);
    expect(est?.count).toBe(1);
    expect(estimateStarValue([])).toBeUndefined();
    expect(estimateStarValue([{ id: 'a', date: '', itemName: 'X', fromStars: 2, toStars: 2, ratio: 1 }])).toBeUndefined();
  });
  it('a regrade gains on average from 1★, nothing from 2★ and loses from 3★', () => {
    expect(expectedRegradeChange(1, 0.1)).toBeGreaterThan(0);
    expect(expectedRegradeChange(2, 0.1)).toBeCloseTo(0, 9);
    expect(expectedRegradeChange(3, 0.1)).toBeLessThan(0);
    expect(expectedRegradeChange(0, 0.1)).toBeCloseTo(0.2, 9);
  });
});

describe('regrade suggestions on the verified inventory', () => {
  const data = makeInitialData();
  const loadouts = buildGearLoadouts(data.gear, data.settings, 'low');
  const result = regradeSuggestions(loadouts, data.settings, []);
  it('suggests 1★ pieces of the best sets first, Main Auction before specialists', () => {
    const safe = result.suggestions.filter(s => s.advice !== 'gamble');
    expect(safe.map(s => [s.item.baseName, s.stars, s.sets[0]])).toEqual([
      ['Elegant Business Backpack', 1, 'Auction'],
      ['Luxury Ice Crown', 1, 'Shop / Idle']
    ]);
    expect(result.suggestions.filter(s => s.advice === 'gamble').every(s => s.stars === 2)).toBe(true);
    expect(result.suggestions.some(s => s.stars === 3)).toBe(false);
    expect(result.unrecorded).toEqual([]);
    expect(result.starValue).toBeUndefined();
  });
  it('ignores sets for activities set to 0', () => {
    const none = regradeSuggestions(buildGearLoadouts(data.gear, { ...LOCKED_DEFAULT_SETTINGS, shopPriority: 0 }, 'low'), { ...LOCKED_DEFAULT_SETTINGS, shopPriority: 0 }, []);
    expect(none.suggestions.some(s => s.sets.includes('Shop / Idle'))).toBe(false);
  });
});

describe('recorded star grades', () => {
  it('fills the screenshot grades once and keeps a grade already recorded', () => {
    const d = makeInitialData();
    const cow = d.gear.find(g => g.baseName === 'Cow Dominus')!;
    const old = { ...d, schemaVersion: 15, gear: d.gear.map(g => g.id === cow.id ? { ...g, gradeStars: 3 } : { ...g, gradeStars: undefined }),
      trophies: d.trophies.map(t => ({ ...t, gradeStars: undefined })) } as never;
    const filled = normalizeData(old);
    expect(filled.gear.find(g => g.id === cow.id)?.gradeStars).toBe(3);
    expect(filled.gear.find(g => g.baseName === 'Race Valk')?.gradeStars).toBe(3);
    expect(filled.gear.every(g => g.gradeStars !== undefined)).toBe(true);
    expect(filled.trophies.find(t => t.name === 'Gem +194%')?.gradeStars).toBe(1);
    // Display Gavels show no grade, so none is invented.
    expect(filled.trophies.find(t => t.name === 'Void +86%')?.gradeStars).toBeUndefined();
    // Saved at schema 16: later edits are never refilled.
    const cleared = { ...filled, gear: filled.gear.map(g => ({ ...g, gradeStars: undefined })) };
    expect(normalizeData(JSON.parse(exportJson(cleared))).gear.every(g => g.gradeStars === undefined)).toBe(true);
    expect(importJson(exportJson(cleared)).gear.every(g => g.gradeStars === undefined)).toBe(true);
  });
});

describe('importing a regraded item', () => {
  it('updates the item, lists every change and records what a star was worth', () => {
    const data = makeInitialData();
    const backpack = data.gear.find(g => g.baseName === 'Elegant Business Backpack')!; // 1★: Luck 80, Energy 11
    // Regraded to 3★ with 10% per star: × 1.3 / 1.1, shown rounded by the game.
    const scan = parsePanel({ stars: 3, infoLines: ['[Void] Elegant Business Backpack', 'Mythical', 'Condition: 92%'],
      statLines: [{ text: '+95% Luck', color: 'green' }, { text: '+13% Energy Drink Time', color: 'green' }] }, knownSlots(data));
    const match = matchDraft(data, scan);
    expect(match).toMatchObject({ status: 'update', id: backpack.id, regrade: { fromStars: 1, toStars: 3 } });
    expect(match.status === 'update' && match.changes).toEqual(['Regraded: 1★ → 3★', 'Luck: 80% → 95%', 'Energy: 11% → 13%']);
    const next = applyDraft(data, scan);
    expect(next.gear).toHaveLength(data.gear.length);
    expect(next.gear.find(g => g.id === backpack.id)).toMatchObject({ gradeStars: 3, stats: expect.objectContaining({ luck: 95, energy: 13 }) });
    expect(next.gradeObservations).toHaveLength(1);
    expect(estimateStarValue(next.gradeObservations)?.perStar).toBeCloseTo(0.1, 1);
  });
  it('does not treat a different roll of the same item as a regrade', () => {
    const data = makeInitialData();
    const scan = parsePanel({ stars: 3, infoLines: ['[Void] Elegant Business Backpack', 'Mythical'],
      statLines: [{ text: '+95% Luck', color: 'green' }, { text: '+30% Energy Drink Time', color: 'green' }] }, knownSlots(data));
    expect(matchDraft(data, scan).status).toBe('new');
  });
});
