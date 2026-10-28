import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cloudClient, forgetCloudClients, loadCloudConfig, saveCloudConfig, supabaseBackend, type CloudConfig } from '../data/cloud';
import { importJson } from '../data/storage';
import { fingerprint, keepThisDevice, syncOnce, type CloudRow, type SyncMark } from '../data/sync';
import type { AppData } from '../types';

export type CloudStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'conflict' | 'error';
export interface CloudSync {
  status: CloudStatus;
  configured: boolean;
  email?: string;
  lastSynced?: string;
  message?: string;
  /** True when this device has never synced and the cloud already holds data. */
  firstJoin?: boolean;
  configure(url: string, anonKey: string): void;
  disconnect(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
  syncNow(): void;
  useCloud(): void;
  keepDevice(): void;
}

const errorText = (e: unknown) => {
  const text = e instanceof Error ? e.message : typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : String(e);
  return /failed to fetch|networkerror|load failed/i.test(text) ? 'Couldn\'t reach Supabase. Check the Project URL and your connection.' : text;
};

/**
 * Keeps local data and the user's Supabase copy in step: after every local change (2 s
 * later), when the app regains focus and on demand. Cloud data is checked and normalised
 * exactly like a restored backup before it replaces anything on this device.
 */
export function useCloudSync(data: AppData | null, adopt: (next: AppData) => void): CloudSync {
  const [config, setConfig] = useState<CloudConfig | undefined>(() => loadCloudConfig());
  const [client, setClient] = useState<SupabaseClient>();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<CloudStatus>(config ? 'signed-out' : 'off');
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<CloudRow>();
  const latest = useRef(data); latest.current = data;
  const configRef = useRef(config); configRef.current = config;
  const running = useRef(false);

  const remember = (mark: SyncMark) => {
    const next = { ...configRef.current!, mark };
    configRef.current = next; setConfig(next); saveCloudConfig(next);
  };

  useEffect(() => {
    if (!config) { setClient(undefined); setUser(null); setStatus('off'); return; }
    let live = true, unsubscribe = () => {};
    cloudClient(config).then(async c => {
      if (!live) return;
      setClient(c);
      const { data: { session } } = await c.auth.getSession();
      if (!live) return;
      setUser(session?.user ?? null);
      setStatus(session ? 'syncing' : 'signed-out');
      const { data: { subscription } } = c.auth.onAuthStateChange((_event, next) => { setUser(next?.user ?? null); if (!next) setStatus('signed-out'); });
      unsubscribe = () => subscription.unsubscribe();
    }).catch(e => { setStatus('error'); setMessage(errorText(e)); });
    return () => { live = false; unsubscribe(); };
  }, [config?.url, config?.anonKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const adoptCloud = useCallback((row: CloudRow) => {
    const next = importJson(JSON.stringify(row.data));
    remember({ revision: row.revision, fingerprint: fingerprint(next), at: new Date().toISOString() });
    adopt(next);
  }, [adopt]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async () => {
    const current = latest.current, cfg = configRef.current;
    if (!client || !user || !current || !cfg || running.current) return;
    running.current = true; setStatus('syncing');
    try {
      const outcome = await syncOnce(supabaseBackend(client, user.id), current, cfg.mark);
      if (outcome.kind === 'conflict') { setConflict(outcome.cloud); setStatus('conflict'); return; }
      if (outcome.kind === 'uploaded') remember(outcome.mark);
      if (outcome.kind === 'downloaded') adoptCloud({ data: outcome.data, revision: outcome.mark.revision! });
      if (outcome.kind === 'in-sync' && !cfg.mark?.at) remember({ ...cfg.mark!, at: new Date().toISOString() });
      setConflict(undefined); setMessage(undefined); setStatus('synced');
    } catch (e) { setStatus('error'); setMessage(errorText(e)); }
    finally { running.current = false; }
  }, [client, user, adoptCloud]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a local change settles, and when signing in.
  useEffect(() => {
    if (!client || !user || !data || status === 'conflict') return;
    const timer = setTimeout(() => { void run(); }, 2000);
    return () => clearTimeout(timer);
  }, [data, client, user, run]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changes made on another device show up when this one is opened again.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [run]);

  return {
    status, configured: Boolean(config), email: user?.email, lastSynced: config?.mark?.at, message,
    firstJoin: Boolean(conflict) && !config?.mark,
    configure(url, anonKey) { const next = { url: url.trim(), anonKey: anonKey.trim() }; saveCloudConfig(next); setMessage(undefined); setConfig(next); },
    async disconnect() { try { await client?.auth.signOut(); } catch { /* already signed out */ } forgetCloudClients(); saveCloudConfig(undefined); setConflict(undefined); setConfig(undefined); },
    async signIn(email, password) {
      if (!client) throw new Error('Sync is still starting. Try again in a moment.');
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(errorText(error));
    },
    async signUp(email, password) {
      if (!client) throw new Error('Sync is still starting. Try again in a moment.');
      const { data: result, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.href.split('#')[0] } });
      if (error) throw new Error(errorText(error));
      return result.session ? 'Account created and signed in.' : 'Account created. Open the confirmation email, then sign in here.';
    },
    async signOut() { await client?.auth.signOut(); setConflict(undefined); },
    syncNow() { void run(); },
    useCloud() { if (conflict) { try { adoptCloud(conflict); setConflict(undefined); setStatus('synced'); } catch (e) { setStatus('error'); setMessage(errorText(e)); } } },
    keepDevice() {
      if (!conflict || !client || !user || !latest.current) return;
      keepThisDevice(supabaseBackend(client, user.id), latest.current, conflict)
        .then(mark => { remember(mark); setConflict(undefined); setStatus('synced'); })
        .catch(e => { setStatus('error'); setMessage(errorText(e)); });
    }
  };
}
