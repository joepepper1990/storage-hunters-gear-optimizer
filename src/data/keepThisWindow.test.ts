import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeEmptyData } from '../defaults';
import { clearReplacedCopy, keepThisWindow, loadData, replacedCopy, saveData } from './storage';

/** A minimal IndexedDB and localStorage, shared like two windows of one origin. */
let stored: unknown;
const memory = new Map<string, string>();
const asyncRequest = (result: unknown) => { const req: any = { result }; queueMicrotask(() => req.onsuccess?.()); return req; };
const db = { close: () => {}, transaction: () => {
  const tx: any = { objectStore: () => ({
    get: () => asyncRequest(stored),
    put: (value: unknown) => { stored = structuredClone(value); queueMicrotask(() => tx.oncomplete?.()); return asyncRequest(undefined); }
  }) };
  return tx;
} };
let oldStorage: Storage, oldDb: IDBFactory;

beforeEach(() => {
  stored = undefined; memory.clear();
  oldStorage = globalThis.localStorage; oldDb = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => asyncRequest(db) } });
});
afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: oldStorage });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: oldDb });
});

const named = (name: string) => { const d = makeEmptyData(); d.ownedCertificates = [{ id: name, type: 'Wooden Certificate of Authenticity', quantity: 1 }]; return d; };
const storedId = () => (stored as { data: ReturnType<typeof makeEmptyData> }).data.ownedCertificates[0]?.id;

describe('the window in use wins after another copy saved first', () => {
  it('saves this window over the other copy, keeps that copy, and later saves work normally', async () => {
    await loadData();
    await saveData(named('mine-1'));
    // Another copy of the app, opened from older data, saves its own version.
    const other = { ...(stored as object), snapshotId: 'other-window', revision: 50, ancestorTokens: [], data: named('theirs') };
    stored = other; memory.set('storage-hunters-gear-optimizer:emergency-mirror', JSON.stringify(other));
    // This window simply wins; there is no refusal any more.
    await saveData(named('mine-2'));
    expect(storedId()).toBe('mine-2');
    await keepThisWindow(named('mine-2b'));
    expect(storedId()).toBe('mine-2b');
    // What the other copy had saved is kept once, so it can be restored.
    expect(replacedCopy()?.data.ownedCertificates[0].id).toBe('theirs');
    clearReplacedCopy();
    expect(replacedCopy()).toBeUndefined();
    await saveData(named('mine-3'));
    expect(storedId()).toBe('mine-3');
  });
});
