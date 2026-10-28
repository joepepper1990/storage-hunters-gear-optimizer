import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { fingerprint, keepThisDevice, syncOnce, type CloudRow, type SyncBackend, type SyncMark } from './sync';
import type { AppData } from '../types';

/** An in-memory cloud row with the same conditional-write rule as the Supabase backend. */
function memoryCloud() {
  let row: CloudRow | null = null;
  const backend: SyncBackend = {
    async read() { return row && { ...row, data: structuredClone(row.data) }; },
    async write(data, revision, expected) {
      if ((row?.revision ?? null) !== expected) return false;
      row = { data: structuredClone(data), revision };
      return true;
    }
  };
  return { backend, get row() { return row; } };
}

const withLuck = (data: AppData, luck: number): AppData => ({ ...data, settings: { ...data.settings, luckWeight: luck } });

describe('cloud sync between two devices', () => {
  it('uploads from the first device, and a second device must choose before anything is replaced', async () => {
    const cloud = memoryCloud();
    const a = makeInitialData();
    const first = await syncOnce(cloud.backend, a, undefined);
    expect(first).toMatchObject({ kind: 'uploaded', mark: { revision: 1 } });
    const b = withLuck(makeInitialData(), 3);
    expect(await syncOnce(cloud.backend, b, undefined)).toMatchObject({ kind: 'conflict' });
    expect(cloud.row?.revision).toBe(1); // Nothing overwritten while waiting for a choice.
  });

  it('a change on one device reaches the other, which had no changes', async () => {
    const cloud = memoryCloud();
    let a = makeInitialData();
    const up = await syncOnce(cloud.backend, a, undefined);
    let markA = (up as { mark: SyncMark }).mark;
    const b = structuredClone(a);
    const markB: SyncMark = { revision: 1, fingerprint: fingerprint(b) };
    a = withLuck(a, 2);
    const changed = await syncOnce(cloud.backend, a, markA);
    expect(changed).toMatchObject({ kind: 'uploaded', mark: { revision: 2 } });
    markA = (changed as { mark: SyncMark }).mark;
    const down = await syncOnce(cloud.backend, b, markB);
    expect(down).toMatchObject({ kind: 'downloaded', mark: { revision: 2 } });
    expect((down as { data: AppData }).data.settings.luckWeight).toBe(2);
    expect(await syncOnce(cloud.backend, a, markA)).toEqual({ kind: 'in-sync' });
  });

  it('asks when both devices changed, and keeping one device overwrites the cloud copy', async () => {
    const cloud = memoryCloud();
    const base = makeInitialData();
    await syncOnce(cloud.backend, base, undefined);
    const mark: SyncMark = { revision: 1, fingerprint: fingerprint(base) };
    await syncOnce(cloud.backend, withLuck(base, 2), mark); // Device A uploads revision 2.
    const b = withLuck(base, 5);
    const outcome = await syncOnce(cloud.backend, b, mark); // Device B also changed.
    expect(outcome.kind).toBe('conflict');
    const kept = await keepThisDevice(cloud.backend, b, (outcome as { cloud: CloudRow }).cloud);
    expect(kept.revision).toBe(3);
    expect((cloud.row?.data as AppData).settings.luckWeight).toBe(5);
  });

  it('never overwrites a cloud copy that moved on during the upload', async () => {
    const cloud = memoryCloud();
    const base = makeInitialData();
    await syncOnce(cloud.backend, base, undefined);
    const racing: SyncBackend = { ...cloud.backend, async write() { return false; } };
    expect((await syncOnce(racing, withLuck(base, 2), { revision: 1, fingerprint: fingerprint(base) })).kind).toBe('conflict');
    expect((cloud.row?.data as AppData).settings.luckWeight).toBe(base.settings.luckWeight);
  });

  it('fingerprints change with the data and not otherwise', () => {
    const a = makeInitialData();
    expect(fingerprint(a)).toBe(fingerprint(structuredClone(a)));
    expect(fingerprint(a)).not.toBe(fingerprint(withLuck(a, 9)));
  });
});

import { cloudConfigProblem } from './cloud';
describe('connecting a project', () => {
  it('checks the pasted details', () => {
    expect(cloudConfigProblem('not a url', 'a.b.c')).toMatch(/Project URL/);
    expect(cloudConfigProblem('http://x.supabase.co', 'a.b.c')).toMatch(/https/);
    expect(cloudConfigProblem('https://x.supabase.co', 'secret')).toMatch(/anon/);
    expect(cloudConfigProblem('https://x.supabase.co', 'eyJa.eyJb.sig')).toBeUndefined();
    expect(cloudConfigProblem('https://x.supabase.co', 'sb_publishable_abc')).toBeUndefined();
  });
});
