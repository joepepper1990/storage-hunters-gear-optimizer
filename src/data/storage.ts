import { DEFAULT_TROPHY_SETTINGS, DEFAULT_VEHICLE_PROFILE, DEFAULT_VEHICLE_SETTINGS, makeInitialData, LOCKED_DEFAULT_SETTINGS } from '../defaults';
import type { AppData, GavelTrophy, GearItem, Trailer, TrophyOptimiserSettings, VehiclePart } from '../types';
import { generateGearName, generateTrophyName, generateVehiclePartName, inferBaseName } from '../naming';

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
    schemaVersion: 4,
    gear: Array.isArray(raw?.gear) ? raw.gear.map(normalizeItem) : [],
    settings: normalizeSettings(raw?.settings),
    authModel: normalizeAuthModel(raw?.authModel, initial.authModel),
    rollLog: Array.isArray(raw?.rollLog) ? raw.rollLog : [],
    theme: raw?.theme ?? 'system',
    vehicleProfile: normalizeVehicleProfile(raw?.vehicleProfile),
    vehicleSettings: normalizeVehicleSettings(raw?.vehicleSettings),
    vehicleParts: Array.isArray(raw?.vehicleParts) ? raw.vehicleParts.map(normalizeVehiclePart) : initial.vehicleParts,
    trailers: Array.isArray(raw?.trailers) ? raw.trailers.map(normalizeTrailer) : initial.trailers,
    trophies: Array.isArray(raw?.trophies) ? raw.trophies.map(normalizeTrophy) : [],
    trophySettings: normalizeTrophySettings(raw?.trophySettings)
  };
}



function normalizeTrophy(item: GavelTrophy): GavelTrophy {
  const now = new Date().toISOString();
  const modifiers = Array.isArray(item?.modifiers) ? item.modifiers
    .filter(m => m && typeof m.mutation === 'string' && m.mutation.trim())
    .slice(0, 2)
    .map(m => ({ mutation: m.mutation.trim(), boostPct: Math.max(0, finite(m.boostPct)) })) : [];
  return {
    id: item?.id || crypto.randomUUID(),
    name: generateTrophyName(modifiers),
    modifiers,
    favourite: Boolean(item?.favourite),
    createdAt: item?.createdAt || now,
    updatedAt: item?.updatedAt || now
  };
}

function normalizeTrophySettings(raw: Partial<TrophyOptimiserSettings> | undefined): TrophyOptimiserSettings {
  const defaults = structuredClone(DEFAULT_TROPHY_SETTINGS);
  const maxActive = 4; // Current game rule: exactly four powered Gavel slots when available.
  const supplied = Array.isArray(raw?.mutationWeights) ? raw.mutationWeights : [];
  const merged = new Map(defaults.mutationWeights.map(w => [w.mutation, w]));
  for (const w of supplied) {
    if (!w || typeof w.mutation !== 'string' || !w.mutation.trim()) continue;
    const name = w.mutation.trim();
    const current = merged.get(name);
    merged.set(name, {
      mutation: name,
      multiplier: Math.max(0, finite(w.multiplier ?? current?.multiplier ?? 0)),
      enabled: w.enabled ?? current?.enabled ?? true,
      confidence: ['Confirmed','Community','Uncertain'].includes(String(w.confidence)) ? w.confidence as any : current?.confidence ?? 'Uncertain'
    });
  }
  return { maxActive, mutationWeights: [...merged.values()] };
}

function normalizeAuthModel(raw: AppData['authModel'] | undefined, defaults: AppData['authModel']): AppData['authModel'] {
  const supplied = Array.isArray(raw) ? raw.map(entry => ({ ...entry, observedValues: Array.isArray(entry.observedValues) ? [...entry.observedValues] : [] })) : [];
  const out = [...supplied];
  const key = (entry: AppData['authModel'][number]) => `${entry.certificateType}|${entry.slot}|${entry.outcome}`;
  const existing = new Set(out.map(key));
  // Merge in newly-added NORMAL outcomes (such as Energy Drink Time) without deleting
  // historical Alien model rows from older backups. Alien rows remain data-only.
  for (const entry of defaults) if (!existing.has(key(entry))) out.push(entry);
  return out;
}

function normalizeVehicleProfile(raw: Partial<AppData['vehicleProfile']> | undefined): AppData['vehicleProfile'] {
  return {
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name : DEFAULT_VEHICLE_PROFILE.name,
    baseSpeed: finite(raw?.baseSpeed ?? DEFAULT_VEHICLE_PROFILE.baseSpeed),
    baseAcceleration: finite(raw?.baseAcceleration ?? DEFAULT_VEHICLE_PROFILE.baseAcceleration),
    baseHandling: finite(raw?.baseHandling ?? DEFAULT_VEHICLE_PROFILE.baseHandling),
    baseCapacityKg: finite(raw?.baseCapacityKg ?? DEFAULT_VEHICLE_PROFILE.baseCapacityKg),
    capacityMultiplier: finite(raw?.capacityMultiplier ?? DEFAULT_VEHICLE_PROFILE.capacityMultiplier)
  };
}

function normalizeVehicleSettings(raw: Partial<AppData['vehicleSettings']> | undefined): AppData['vehicleSettings'] {
  return {
    speedWeight: finite(raw?.speedWeight ?? DEFAULT_VEHICLE_SETTINGS.speedWeight),
    accelerationWeight: finite(raw?.accelerationWeight ?? DEFAULT_VEHICLE_SETTINGS.accelerationWeight),
    handlingWeight: finite(raw?.handlingWeight ?? DEFAULT_VEHICLE_SETTINGS.handlingWeight),
    capacityWeight: finite(raw?.capacityWeight ?? DEFAULT_VEHICLE_SETTINGS.capacityWeight)
  };
}

function normalizeVehiclePart(item: VehiclePart): VehiclePart {
  const now = new Date().toISOString();
  const baseName = typeof item?.baseName === 'string' && item.baseName.trim()
    ? item.baseName.trim()
    : inferBaseName(typeof item?.name === 'string' ? item.name : '');
  const part = {
    speedPct: finite(item?.speedPct), accelerationPct: finite(item?.accelerationPct),
    handlingPct: finite(item?.handlingPct), capacityKg: finite(item?.capacityKg)
  };
  return {
    id: item?.id || crypto.randomUUID(),
    baseName,
    name: generateVehiclePartName(baseName, part),
    slot: ['Spoiler','Exhaust','Wheel Stack'].includes(item?.slot) ? item.slot : 'Spoiler',
    ...part,
    mutation: typeof item?.mutation === 'string' ? item.mutation : undefined,
    rarity: typeof item?.rarity === 'string' ? item.rarity : undefined,
    favourite: Boolean(item?.favourite), createdAt: item?.createdAt || now, updatedAt: item?.updatedAt || now
  };
}

function normalizeTrailer(item: Trailer): Trailer {
  const now = new Date().toISOString();
  return { id: item?.id || crypto.randomUUID(), name: typeof item?.name === 'string' ? item.name : '', capacityKg: finite(item?.capacityKg), favourite: Boolean(item?.favourite), createdAt: item?.createdAt || now, updatedAt: item?.updatedAt || now };
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
  const baseName = typeof i?.baseName === 'string' && i.baseName.trim()
    ? i.baseName.trim()
    : inferBaseName(typeof i?.name === 'string' ? i.name : '');
  const stats = {
    luck: finite(i?.stats?.luck), energy: finite(i?.stats?.energy), tip: finite(i?.stats?.tip), walk: finite(i?.stats?.walk),
    vehicle: finite(i?.stats?.vehicle), recovery: finite(i?.stats?.recovery), zone: finite(i?.stats?.zone),
    arrowReduction: finite(i?.stats?.arrowReduction), npc: finite(i?.stats?.npc)
  };
  const authenticated = Boolean(i?.authenticated);
  const authentication = i?.authentication ?? { kind: 'None' as const, effect: '', value: 0 };
  return {
    id: i?.id || crypto.randomUUID(),
    baseName,
    name: generateGearName(baseName, stats, authenticated, authentication),
    slot: i?.slot,
    favourite: Boolean(i?.favourite),
    authenticated,
    authentication,
    stats,
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
    const sourceName = typeof item.baseName === 'string' && item.baseName.trim() ? item.baseName : item.name;
    if (typeof sourceName !== 'string' || !sourceName.trim()) throw new Error(`${prefix}: item name is required.`);
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
  if (raw.vehicleProfile !== undefined) {
    if (!raw.vehicleProfile || typeof raw.vehicleProfile.name !== 'string' || !raw.vehicleProfile.name.trim()) throw new Error('Vehicle profile: name is required.');
    for (const [label,value] of Object.entries(raw.vehicleProfile)) if (label !== 'name' && !Number.isFinite(Number(value))) throw new Error(`Vehicle profile: ${label} is not finite.`);
  }
  if (raw.vehicleSettings !== undefined) for (const [label,value] of Object.entries(raw.vehicleSettings)) if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`Vehicle settings: ${label} must be a non-negative finite number.`);
  if (raw.vehicleParts !== undefined && !Array.isArray(raw.vehicleParts)) throw new Error('Vehicle parts must be an array.');
  for (const [index,item] of (raw.vehicleParts ?? []).entries()) {
    const sourceName = item?.baseName?.trim?.() || item?.name?.trim?.();
    if (!sourceName) throw new Error(`Vehicle part row ${index + 1}: name is required.`);
    if (!['Spoiler','Exhaust','Wheel Stack'].includes(item.slot)) throw new Error(`Vehicle part row ${index + 1}: invalid slot.`);
    for (const [label,value] of [['speedPct',item.speedPct],['accelerationPct',item.accelerationPct],['handlingPct',item.handlingPct],['capacityKg',item.capacityKg]] as const) if (!Number.isFinite(Number(value))) throw new Error(`Vehicle part row ${index + 1}: ${label} is not finite.`);
  }
  if (raw.trailers !== undefined && !Array.isArray(raw.trailers)) throw new Error('Trailers must be an array.');
  for (const [index,item] of (raw.trailers ?? []).entries()) {
    if (!item?.name?.trim()) throw new Error(`Trailer row ${index + 1}: name is required.`);
    if (!Number.isFinite(Number(item.capacityKg))) throw new Error(`Trailer row ${index + 1}: capacityKg is not finite.`);
  }
  if (raw.trophies !== undefined && !Array.isArray(raw.trophies)) throw new Error('Gavel trophies must be an array.');
  for (const [index,item] of (raw.trophies ?? []).entries()) {
    if (!Array.isArray(item.modifiers) || item.modifiers.length > 2) throw new Error(`Gavel Trophy row ${index + 1}: modifiers must contain at most two entries.`);
    for (const modifier of item.modifiers) {
      if (!modifier?.mutation?.trim()) throw new Error(`Gavel Trophy row ${index + 1}: mutation is required.`);
      if (!Number.isFinite(Number(modifier.boostPct)) || Number(modifier.boostPct) < 0) throw new Error(`Gavel Trophy row ${index + 1}: boost must be a non-negative finite number.`);
    }
  }
  if (raw.trophySettings !== undefined) {
    if (raw.trophySettings.maxActive !== undefined && !Number.isFinite(Number(raw.trophySettings.maxActive))) throw new Error('Trophy settings: legacy maxActive must be finite when present.');
    if (!Array.isArray(raw.trophySettings.mutationWeights)) throw new Error('Trophy settings: mutation weights must be an array.');
    for (const weight of raw.trophySettings.mutationWeights) if (!weight?.mutation?.trim() || !Number.isFinite(Number(weight.multiplier)) || Number(weight.multiplier) < 0) throw new Error('Trophy settings: every mutation needs a non-negative finite multiplier.');
  }
}
