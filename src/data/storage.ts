import { makeInitialData, LOCKED_DEFAULT_SETTINGS } from '../defaults';
import type { AppData, GearItem } from '../types';

const DB_NAME = 'storage-hunters-gear-optimizer';
const STORE = 'app';
const KEY = 'data';
const MIRROR_KEY = 'storage-hunters-gear-optimizer:emergency-mirror';
let saveChain: Promise<void> = Promise.resolve();

export async function loadData(): Promise<AppData> {
  let indexedDbError: unknown;
  try {
    const db = await openDb();
    const value = await request<AppData | undefined>(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY));
    db.close();
    if (value) return normalizeData(value);
  } catch (error) {
    indexedDbError = error;
  }

  const mirror = loadEmergencyMirror();
  if (mirror) return mirror;
  if (indexedDbError) throw new Error(`Unable to open local gear storage and no emergency mirror was available: ${errorMessage(indexedDbError)}`);
  return makeInitialData();
}

/**
 * Serialise writes so rapid settings/gear edits cannot race and leave an older snapshot last.
 * IndexedDB is primary; localStorage is a best-effort emergency mirror.
 */
export function saveData(data: AppData): Promise<void> {
  const snapshot = structuredClone(data);
  saveChain = saveChain.catch(() => undefined).then(() => writeSnapshot(snapshot));
  return saveChain;
}

async function writeSnapshot(data: AppData): Promise<void> {
  let idbSaved = false;
  let mirrorSaved = false;
  let idbError: unknown;
  try {
    const db = await openDb();
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, KEY));
    db.close();
    idbSaved = true;
  } catch (error) {
    idbError = error;
  }
  try {
    saveEmergencyMirror(data);
    mirrorSaved = true;
  } catch {
    // A large inventory can exceed localStorage quota; IndexedDB remains authoritative.
  }
  if (!idbSaved && !mirrorSaved) throw new Error(`Local autosave failed: ${errorMessage(idbError)}`);
}

/** Synchronous best-effort mirror used on pagehide and as recovery if IndexedDB is unavailable. */
export function saveEmergencyMirror(data: AppData): void {
  localStorage.setItem(MIRROR_KEY, JSON.stringify(data));
}

function loadEmergencyMirror(): AppData | undefined {
  try {
    const text = localStorage.getItem(MIRROR_KEY);
    if (!text) return undefined;
    return normalizeData(JSON.parse(text) as AppData);
  } catch {
    return undefined;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export function normalizeData(raw: AppData): AppData {
  const initial = makeInitialData();
  return {
    schemaVersion: 1,
    gear: Array.isArray(raw?.gear) ? raw.gear.map(normalizeItem) : [],
    settings: normalizeSettings(raw?.settings),
    authModel: Array.isArray(raw?.authModel) && raw.authModel.length ? raw.authModel : initial.authModel,
    rollLog: Array.isArray(raw?.rollLog) ? raw.rollLog : [],
    theme: raw?.theme ?? 'system'
  };
}


function normalizeSettings(raw: Partial<AppData['settings']> | undefined): AppData['settings'] {
  const merged: Record<string, unknown> = { ...LOCKED_DEFAULT_SETTINGS, ...(raw ?? {}) };
  const out: Record<string, unknown> = { ...LOCKED_DEFAULT_SETTINGS, version: '1.0' };
  for (const [key, defaultValue] of Object.entries(LOCKED_DEFAULT_SETTINGS)) {
    if (key === 'version') continue;
    const n = Number(merged[key]);
    out[key] = Number.isFinite(n) ? n : defaultValue;
  }
  return out as unknown as AppData['settings'];
}

function normalizeItem(i: GearItem): GearItem {
  const now = new Date().toISOString();
  return {
    ...i,
    id: i?.id || crypto.randomUUID(),
    name: typeof i?.name === 'string' ? i.name : '',
    slot: i?.slot,
    favourite: Boolean(i?.favourite),
    authenticated: Boolean(i?.authenticated),
    authentication: i?.authentication ?? { kind: 'None', effect: '', value: 0 },
    stats: {
      luck: finite(i?.stats?.luck), energy: finite(i?.stats?.energy), tip: finite(i?.stats?.tip), walk: finite(i?.stats?.walk),
      vehicle: finite(i?.stats?.vehicle), recovery: finite(i?.stats?.recovery), zone: finite(i?.stats?.zone),
      arrowReduction: finite(i?.stats?.arrowReduction), npc: finite(i?.stats?.npc)
    },
    createdAt: i?.createdAt || now,
    updatedAt: i?.updatedAt || now
  };
}
function finite(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error ?? 'unknown error'); }

export function exportJson(data: AppData): string { return JSON.stringify(data, null, 2); }
export function importJson(text: string): AppData {
  const parsed = JSON.parse(text) as AppData;
  validateImportedData(parsed);
  return normalizeData(parsed);
}

function validateImportedData(raw: AppData): void {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.gear)) throw new Error('Invalid backup: gear array is missing.');
  const ids = new Set<string>();
  raw.gear.forEach((item, index) => {
    const prefix = `Gear row ${index + 1}`;
    if (!item || typeof item !== 'object') throw new Error(`${prefix}: invalid item.`);
    if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`${prefix}: item name is required.`);
    if (!['Head','Back','Wrist'].includes(item.slot)) throw new Error(`${prefix}: invalid slot.`);
    if (item.id) {
      if (ids.has(item.id)) throw new Error(`${prefix}: duplicate item ID ${item.id}.`);
      ids.add(item.id);
    }
    for (const [key,value] of Object.entries(item.stats ?? {})) {
      if (value !== '' && value !== null && value !== undefined && !Number.isFinite(Number(value))) throw new Error(`${prefix}: ${key} is not a finite number.`);
    }
    if (item.authentication?.kind !== undefined && !['None','Normal','Alien'].includes(item.authentication.kind)) throw new Error(`${prefix}: invalid authentication type.`);
    if (item.authentication?.value !== undefined && !Number.isFinite(Number(item.authentication.value))) throw new Error(`${prefix}: authentication value is not finite.`);
  });
  if (raw.settings && typeof raw.settings === 'object') {
    for (const [key,value] of Object.entries(raw.settings)) {
      if (key === 'version') continue;
      if (!Number.isFinite(Number(value))) throw new Error(`Settings: ${key} is not a finite number.`);
    }
  }
  if (raw.theme !== undefined && !['system','light','dark'].includes(raw.theme)) throw new Error('Invalid backup: theme is not supported.');
  if (raw.authModel !== undefined && !Array.isArray(raw.authModel)) throw new Error('Invalid backup: authentication model must be an array.');
  for (const [index,entry] of (raw.authModel ?? []).entries()) {
    if (!entry || typeof entry !== 'object' || typeof entry.outcome !== 'string' || !entry.outcome.trim()) throw new Error(`Authentication model row ${index + 1}: outcome is required.`);
    for (const [label,value] of [['min',entry.min],['typical',entry.typical],['max',entry.max]] as const) if (value !== undefined && !Number.isFinite(Number(value))) throw new Error(`Authentication model row ${index + 1}: ${label} is not finite.`);
    if (!Array.isArray(entry.observedValues) || entry.observedValues.some(v=>!Number.isFinite(Number(v)))) throw new Error(`Authentication model row ${index + 1}: observed values must be finite numbers.`);
  }
  if (raw.rollLog !== undefined && !Array.isArray(raw.rollLog)) throw new Error('Invalid backup: certificate roll log must be an array.');
  for (const [index,roll] of (raw.rollLog ?? []).entries()) for (const [label,value] of [['previousValue',roll.previousValue],['newValue',roll.newValue],['bestScoreBefore',roll.bestScoreBefore],['bestScoreAfter',roll.bestScoreAfter]] as const) if (!Number.isFinite(Number(value))) throw new Error(`Roll log row ${index + 1}: ${label} is not finite.`);
}
