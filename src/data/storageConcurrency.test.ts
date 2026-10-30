import { describe, it, expect } from 'vitest';
import { makeEmptyData, makeInitialData } from '../defaults';
import { importJson, loadData, replacedCopy, saveData, saveEmergencyMirror } from './storage';

const mirrorKey = 'storage-hunters-gear-optimizer:emergency-mirror';
function browserStorage() {
  const memory = new Map<string, string>();
  let stored: unknown;
  const previousStorage = globalThis.localStorage, previousDb = globalThis.indexedDB;
  const request = (result: unknown) => { const req: any = { result }; queueMicrotask(() => req.onsuccess?.()); return req; };
  const db = { close() {}, transaction() {
    const tx: any = { objectStore: () => ({
      get: () => request(stored),
      put: (value: unknown) => { stored = value; queueMicrotask(() => tx.oncomplete?.()); return request(undefined); }
    }) };
    return tx;
  } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => request(db) } });
  return {
    foreignSave(revision=50, mirror=true, snapshotId: string | null = 'foreign-tab') {
      const data = makeEmptyData(); data.theme = 'dark';
      const envelope = { storageEnvelopeVersion: 1, savedAt: Date.now() - 1000, revision, ...(snapshotId ? { snapshotId } : {}), data };
      stored = envelope; if(mirror)memory.set(mirrorKey, JSON.stringify(envelope));
    },
    persisted: () => stored as any,
    mirror: () => JSON.parse(memory.get(mirrorKey)!),
    restore() {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage });
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: previousDb });
    }
  };
}

describe('storage snapshot provenance', () => {
  it('lets this window\'s pagehide save win over another copy, keeping that copy', async () => {
    const browser = browserStorage();
    try {
      const mine = await loadData(); await saveData(mine);
      browser.foreignSave();
      expect(() => saveEmergencyMirror({ ...mine, theme: 'light' })).not.toThrow();
      expect(browser.mirror().data.theme).toBe('light');
      expect((await loadData()).theme).toBe('light');
      expect(replacedCopy()?.data.theme).toBe('dark');
    } finally { browser.restore(); }
  });
  it('lets this window\'s autosave win over a higher-revision foreign save, keeping that copy', async () => {
    const browser = browserStorage();
    try {
      const mine = await loadData(); browser.foreignSave(50);
      await saveData({ ...mine, theme: 'light' });
      expect(browser.persisted().data.theme).toBe('light');
      expect(browser.persisted().revision).toBeGreaterThan(50);
      expect(browser.mirror().data.theme).toBe('light');
      expect((await loadData()).theme).toBe('light');
      expect(replacedCopy()?.data.theme).toBe('dark');
    } finally { browser.restore(); }
  });
  it('wins over an IndexedDB-only foreign save and over pre-provenance envelopes too', async () => {
    for (const snapshotId of ['foreign-tab', null]) {
      const browser = browserStorage();
      try {
        const mine = await loadData(); await saveData(mine);
        browser.foreignSave(2, false, snapshotId);
        await saveData({ ...mine, theme: 'light' });
        saveEmergencyMirror({ ...mine, theme: 'system' });
        expect((await loadData()).theme).toBe('system');
        await saveData({ ...mine, theme: 'light' });
        expect((await loadData()).theme).toBe('light');
      } finally { browser.restore(); }
    }
  });
  it('recovers legitimate unsaved pagehide edits descending from a legacy IndexedDB envelope', async () => {
    const browser = browserStorage();
    try {
      browser.foreignSave(2, false, null);
      const current = await loadData();
      saveEmergencyMirror({ ...current, theme: 'light' });
      expect((await loadData()).theme).toBe('light');
    } finally { browser.restore(); }
  });
  it('retains current unsaved edits on pagehide and serializes queued local saves', async () => {
    const browser = browserStorage();
    try {
      const initial = await loadData();
      const first = { ...initial, theme: 'dark' as const }, second = { ...initial, theme: 'light' as const };
      const a = saveData(first), b = saveData(second);
      saveEmergencyMirror(second);
      await Promise.all([a, b]);
      expect((await loadData()).theme).toBe('light');
      const unsaved = { ...second, theme: 'dark' as const };
      saveEmergencyMirror(unsaved);
      expect((await loadData()).theme).toBe('dark');
    } finally { browser.restore(); }
  });
});

describe('JSON authentication stat delta validation', () => {
  it('preserves legitimate negative, zero and positive JSON deltas without changing base stats', () => {
    const data = makeInitialData();
    data.gear = [data.gear[0]];
    data.gear[0].authentication = { kind: 'Premium', effect: 'Focused', value: 0, statDeltas: { luck: -12, zone: 7, walk: 0 } };
    const restored = importJson(JSON.stringify(data));
    expect(restored.gear[0].authentication.statDeltas).toEqual({ luck: -12, zone: 7, walk: 0 });
    expect(restored.gear[0].stats).toEqual(data.gear[0].stats);
  });
  for (const [index, statDeltas] of [[], null, 'luck', { unknown: 1 }, { luck: '2' }, { luck: null }, { luck: 1e400 }].entries()) {
    it(`rejects invalid deltas case ${index + 1}: ${JSON.stringify(statDeltas)}`, () => {
      const data = makeEmptyData();
      data.gear = [{ id: 'item', baseName: 'Hat', name: 'Hat', slot: 'Head', stats: {}, authentication: { kind: 'Premium', value: 1, effect: 'Luck', statDeltas } } as any];
      expect(() => importJson(JSON.stringify(data))).toThrow(/stat deltas/i);
    });
  }
});
