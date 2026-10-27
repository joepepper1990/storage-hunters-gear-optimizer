import { describe, it, expect } from 'vitest';
import { makeEmptyData, makeInitialData } from '../defaults';
import { importJson, loadData, saveData, saveEmergencyMirror } from './storage';

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
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } });
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
  it('does not promote stale pagehide data above a newer foreign save', async () => {
    const browser = browserStorage();
    try {
      const stale = await loadData(); await saveData(stale);
      browser.foreignSave();
      expect(() => saveEmergencyMirror(stale)).toThrow(/another tab/i);
      expect(browser.mirror().data.theme).toBe('dark');
      expect((await loadData()).theme).toBe('dark');
    } finally { browser.restore(); }
  });
  it('keeps committed IndexedDB authoritative over a concurrent mirror with the same revision', async () => {
    const browser = browserStorage();
    try {
      const stale = await loadData(); browser.foreignSave(1, false);
      saveEmergencyMirror(stale);
      expect((await loadData()).theme).toBe('dark');
    } finally { browser.restore(); }
  });
  it('also keeps committed pre-provenance envelopes authoritative on a revision tie', async () => {
    const browser = browserStorage();
    try {
      const stale = await loadData(); browser.foreignSave(1, false, null);
      saveEmergencyMirror(stale);
      expect((await loadData()).theme).toBe('dark');
    } finally { browser.restore(); }
  });
  it('rejects stale autosaves without overwriting newer IndexedDB data', async () => {
    const browser = browserStorage();
    try {
      const stale = await loadData(); browser.foreignSave();
      await expect(saveData({ ...stale, theme: 'light' })).rejects.toThrow(/another tab/i);
      expect(browser.persisted().data.theme).toBe('dark');
      expect(browser.mirror().data.theme).toBe('dark');
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
