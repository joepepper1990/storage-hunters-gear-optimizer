import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData } from '../types';
import type { CloudRow, SyncBackend, SyncMark } from './sync';

/** One row per user; row-level security lets each signed-in user reach only their own. */
export const CLOUD_TABLE = 'storage_hunters_data';

export const CLOUD_SETUP_SQL = `create table if not exists public.${CLOUD_TABLE} (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  revision bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.${CLOUD_TABLE} enable row level security;
create policy "Own row: read" on public.${CLOUD_TABLE} for select using (auth.uid() = user_id);
create policy "Own row: add" on public.${CLOUD_TABLE} for insert with check (auth.uid() = user_id);
create policy "Own row: change" on public.${CLOUD_TABLE} for update using (auth.uid() = user_id) with check (auth.uid() = user_id);`;

/**
 * The owner's project ("storage-hunters", London). The publishable key is public by design:
 * row-level security limits every account to its own row. Used to pre-fill the Connect form.
 */
export const OWNER_PROJECT = { url: 'https://egdvpgokrsvjhzrefsqz.supabase.co', anonKey: 'sb_publishable_YijehDgtxomSKIYAK3VvKA_47sp24ej' };

/** Per-device settings: which project to use and what was last synced. Never synced or exported. */
export interface CloudConfig { url: string; anonKey: string; mark?: SyncMark }
const CONFIG_KEY = 'storage-hunters-gear-optimizer:cloud';

export function loadCloudConfig(): CloudConfig | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    return raw && typeof raw.url === 'string' && typeof raw.anonKey === 'string' ? raw : undefined;
  } catch { return undefined; }
}
export function saveCloudConfig(config: CloudConfig | undefined) {
  try { if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); else localStorage.removeItem(CONFIG_KEY); } catch { /* storage unavailable */ }
}

/** Checks the pasted project details before they are saved. */
export function cloudConfigProblem(url: string, anonKey: string): string | undefined {
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch { return 'Enter the Project URL, e.g. https://abcd1234.supabase.co'; }
  if (parsed.protocol !== 'https:') return 'The Project URL must start with https://';
  if (anonKey.trim().split('.').length !== 3 && !anonKey.trim().startsWith('sb_publishable_')) return 'Paste the public anon (or publishable) key, not the service key.';
  return undefined;
}

let clients = new Map<string, Promise<SupabaseClient>>();
/** The Supabase library is only downloaded once sync is set up. */
export function cloudClient(config: Pick<CloudConfig, 'url' | 'anonKey'>): Promise<SupabaseClient> {
  const key = `${config.url}|${config.anonKey}`;
  if (!clients.has(key)) clients.set(key, import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.url.trim(), config.anonKey.trim(), { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'storage-hunters-gear-optimizer:auth' } })));
  return clients.get(key)!;
}
export function forgetCloudClients() { clients = new Map(); }

export function supabaseBackend(client: SupabaseClient, userId: string): SyncBackend {
  return {
    async read(): Promise<CloudRow | null> {
      const { data, error } = await client.from(CLOUD_TABLE).select('data, revision, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(cloudError(error.message));
      return data ? { data: data.data, revision: Number(data.revision), updatedAt: data.updated_at } : null;
    },
    async write(data: AppData, revision: number, expected: number | null): Promise<boolean> {
      if (expected === null) {
        const { error } = await client.from(CLOUD_TABLE).insert({ user_id: userId, data, revision });
        if (error?.code === '23505') return false; // Another device created the row first.
        if (error) throw new Error(cloudError(error.message));
        return true;
      }
      const { data: rows, error } = await client.from(CLOUD_TABLE).update({ data, revision, updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('revision', expected).select('revision');
      if (error) throw new Error(cloudError(error.message));
      return (rows ?? []).length === 1;
    }
  };
}

function cloudError(message: string): string {
  return /relation .* does not exist|could not find the table/i.test(message)
    ? 'The sync table is missing. Run the setup script in your Supabase SQL editor.' : message;
}
