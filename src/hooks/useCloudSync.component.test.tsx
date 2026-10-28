// @vitest-environment jsdom
import { StrictMode, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, flush, render, waitFor } from '../test/dom';
import { makeInitialData } from '../defaults';
import type { AppData } from '../types';
import { useCloudSync, type CloudSync } from './useCloudSync';
import { forgetCloudClients } from '../data/cloud';

/** A fake Supabase project: password accounts and one table with the same row rules. */
const server = vi.hoisted(() => ({
  users: new Map<string, { id: string; password: string }>(),
  rows: new Map<string, { data: unknown; revision: number; updated_at: string }>()
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    let session: { user: { id: string; email: string } } | null = null;
    const listeners = new Set<(e: string, s: typeof session) => void>();
    const emit = () => listeners.forEach(l => l('CHANGE', session));
    const filters = (rows: Map<string, { data: unknown; revision: number; updated_at: string }>) => {
      const conds: Array<[string, unknown]> = [];
      const match = (uid: string, row: { revision: number }) => conds.every(([k, v]) => k === 'user_id' ? v === uid && uid === session?.user.id : (row as Record<string, unknown>)[k] === v);
      return { conds, match, rows };
    };
    return {
      auth: {
        async getSession() { return { data: { session } }; },
        onAuthStateChange(cb: (e: string, s: typeof session) => void) { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
        async signUp({ email, password }: { email: string; password: string }) { server.users.set(email, { id: `uid-${email}`, password }); session = { user: { id: `uid-${email}`, email } }; emit(); return { data: { session }, error: null }; },
        async signInWithPassword({ email, password }: { email: string; password: string }) {
          const u = server.users.get(email);
          if (!u || u.password !== password) return { error: { message: 'Invalid login credentials' } };
          session = { user: { id: u.id, email } }; emit(); return { error: null };
        },
        async signOut() { session = null; emit(); return { error: null }; }
      },
      from() {
        return {
          select() { const f = filters(server.rows); const q = { eq(k: string, v: unknown) { f.conds.push([k, v]); return q; },
            async maybeSingle() { const uid = f.conds.find(c => c[0] === 'user_id')?.[1] as string; const row = server.rows.get(uid); return { data: row && f.match(uid, row) ? structuredClone(row) : null, error: null }; } }; return q; },
          async insert(v: { user_id: string; data: unknown; revision: number }) {
            if (v.user_id !== session?.user.id) return { error: { code: '42501', message: 'row-level security' } };
            if (server.rows.has(v.user_id)) return { error: { code: '23505', message: 'duplicate key' } };
            server.rows.set(v.user_id, { data: structuredClone(v.data), revision: v.revision, updated_at: '' }); return { error: null };
          },
          update(v: { data: unknown; revision: number; updated_at: string }) {
            const f = filters(server.rows); const q = { eq(k: string, val: unknown) { f.conds.push([k, val]); return q; },
              async select() { const uid = f.conds.find(c => c[0] === 'user_id')?.[1] as string; const row = server.rows.get(uid);
                if (!row || !f.match(uid, row)) return { data: [], error: null };
                server.rows.set(uid, { data: structuredClone(v.data), revision: v.revision, updated_at: v.updated_at }); return { data: [{ revision: v.revision }], error: null }; } };
            return q;
          }
        };
      }
    };
  }
}));

/** One "device": its own data, exposing the sync controls. */
function Device({ initial, onReady }: { initial: AppData; onReady: (api: { cloud: CloudSync; data: AppData; setData: (d: AppData) => void }) => void }) {
  const [data, setData] = useState(initial);
  const cloud = useCloudSync(data, setData);
  useEffect(() => onReady({ cloud, data, setData }));
  return null;
}

let api: { cloud: CloudSync; data: AppData; setData: (d: AppData) => void };
async function openDevice(initial: AppData) {
  await render(<StrictMode><Device initial={initial} onReady={next => { api = next; }} /></StrictMode>);
  return () => api;
}
const settle = async () => { await flush(2100); await flush(50); };

beforeEach(() => { vi.useRealTimers(); });
afterEach(async () => { await cleanup(); localStorage.clear(); forgetCloudClients(); });

describe('cloud sync in the app', () => {
  it('connects, signs in, uploads, and a second device joins only after choosing', async () => {
    server.users.clear(); server.rows.clear();
    // Device A: connect, create an account, first upload.
    let device = await openDevice(makeInitialData());
    expect(device().cloud.status).toBe('off');
    device().cloud.configure('https://test.supabase.co', 'eyJa.eyJb.sig');
    await waitFor(() => { if (device().cloud.status !== 'signed-out') throw new Error('starting'); });
    await device().cloud.signUp('joe@example.com', 'pw123456');
    await settle();
    await waitFor(() => { if (device().cloud.status !== 'synced') throw new Error(device().cloud.status); });
    expect(server.rows.get('uid-joe@example.com')?.revision).toBe(1);

    // A change on A is uploaded.
    device().setData({ ...device().data, settings: { ...device().data.settings, luckWeight: 4 } });
    await settle();
    await waitFor(() => { if (server.rows.get('uid-joe@example.com')?.revision !== 2) throw new Error('waiting'); });

    // Device B: a fresh device signs in and must choose; nothing is overwritten meanwhile.
    await cleanup(); localStorage.clear(); forgetCloudClients();
    device = await openDevice(makeInitialData());
    device().cloud.configure('https://test.supabase.co', 'eyJa.eyJb.sig');
    await waitFor(() => { if (device().cloud.status !== 'signed-out') throw new Error('starting'); });
    await device().cloud.signIn('joe@example.com', 'pw123456');
    await settle();
    await waitFor(() => { if (device().cloud.status !== 'conflict') throw new Error(device().cloud.status); });
    expect(device().cloud.firstJoin).toBe(true);
    expect(server.rows.get('uid-joe@example.com')?.revision).toBe(2);
    device().cloud.useCloud();
    await settle();
    expect(device().data.settings.luckWeight).toBe(4);
    await waitFor(() => { if (device().cloud.status !== 'synced') throw new Error(device().cloud.status); });
    expect(server.rows.get('uid-joe@example.com')?.revision).toBe(2); // Adopting does not re-upload.
  }, 30000);

  it('reports a wrong password without connecting', async () => {
    server.users.clear(); server.rows.clear();
    server.users.set('joe@example.com', { id: 'uid-joe@example.com', password: 'right' });
    const device = await openDevice(makeInitialData());
    device().cloud.configure('https://test.supabase.co', 'eyJa.eyJb.sig');
    await waitFor(() => { if (device().cloud.status !== 'signed-out') throw new Error('starting'); });
    await expect(device().cloud.signIn('joe@example.com', 'wrong')).rejects.toThrow('Invalid login credentials');
    expect(server.rows.size).toBe(0);
  });
});
