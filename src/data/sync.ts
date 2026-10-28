import type { AppData } from '../types';

/**
 * Cloud sync. The whole AppData is stored as one row per signed-in user, with a revision
 * number that goes up on every write. Each device remembers the revision and a fingerprint
 * of the data it last synced, so it can tell what changed since:
 *  - only this device changed  → upload (only if the cloud is still at that revision)
 *  - only the cloud changed     → use the cloud data
 *  - both changed               → ask which to keep; nothing is overwritten silently
 * The backend is an interface so the rules can be tested without a server.
 */
export interface CloudRow { data: unknown; revision: number; updatedAt?: string }
export interface SyncBackend {
  read(): Promise<CloudRow | null>;
  /** Writes `data` as `revision` only if the cloud is at `expected` (null = no row yet). False if it moved on. */
  write(data: AppData, revision: number, expected: number | null): Promise<boolean>;
}
export interface SyncMark { revision: number | null; fingerprint: string; at?: string }

export type SyncOutcome =
  | { kind: 'in-sync' }
  | { kind: 'uploaded'; mark: SyncMark }
  | { kind: 'downloaded'; data: unknown; mark: Omit<SyncMark, 'fingerprint'> }
  | { kind: 'conflict'; cloud: CloudRow };

/** Stable fingerprint of the data (FNV-1a over its JSON). */
export function fingerprint(data: AppData): string {
  const text = JSON.stringify(data);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `${text.length}:${hash.toString(16)}`;
}

export async function syncOnce(backend: SyncBackend, local: AppData, mark: SyncMark | undefined, now = new Date().toISOString()): Promise<SyncOutcome> {
  const cloud = await backend.read();
  const localPrint = fingerprint(local);
  const localChanged = !mark || mark.fingerprint !== localPrint;
  const cloudChanged = cloud ? cloud.revision !== mark?.revision : false;

  if (!cloud) {
    // First device to sync: upload.
    return await backend.write(local, 1, null) ? { kind: 'uploaded', mark: { revision: 1, fingerprint: localPrint, at: now } } : { kind: 'conflict', cloud: (await backend.read())! };
  }
  if (!mark) return { kind: 'conflict', cloud }; // A device joining an existing cloud copy must choose.
  if (!localChanged && !cloudChanged) return { kind: 'in-sync' };
  if (!localChanged) return { kind: 'downloaded', data: cloud.data, mark: { revision: cloud.revision, at: now } };
  if (!cloudChanged) {
    const next = cloud.revision + 1;
    if (await backend.write(local, next, cloud.revision)) return { kind: 'uploaded', mark: { revision: next, fingerprint: localPrint, at: now } };
    return { kind: 'conflict', cloud: (await backend.read()) ?? cloud };
  }
  return { kind: 'conflict', cloud };
}

/** The user chose this device's data: overwrite the cloud copy. */
export async function keepThisDevice(backend: SyncBackend, local: AppData, cloud: CloudRow, now = new Date().toISOString()): Promise<SyncMark> {
  const next = cloud.revision + 1;
  if (!await backend.write(local, next, cloud.revision)) throw new Error('The cloud copy changed again. Try once more.');
  return { revision: next, fingerprint: fingerprint(local), at: now };
}
