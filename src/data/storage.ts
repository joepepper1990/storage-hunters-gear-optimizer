import { mergeScreenshotParts, mergeScreenshotTrophies, screenshotCertificates } from './screenshotEquipment';
import { makeKnownGear } from './knownGear';
import { DEFAULT_TROPHY_SETTINGS, DEFAULT_VEHICLE_PROFILE, DEFAULT_VEHICLE_SETTINGS, makeInitialData, LOCKED_DEFAULT_SETTINGS } from '../defaults';
import type { AppData, GavelTrophy, GearItem, Trailer, TrophyOptimiserSettings, VehiclePart } from '../types';
import { generateGearName, generateTrophyName, generateVehiclePartName, inferBaseName } from '../naming';

const DB_NAME = 'storage-hunters-gear-optimizer';
const STORE = 'app';
const KEY = 'data';
const MIRROR_KEY = 'storage-hunters-gear-optimizer:emergency-mirror';
const STORAGE_ENVELOPE_VERSION = 1;
let lastRevision=0;
let saveChain: Promise<void> = Promise.resolve();

interface StoredEnvelope {
  storageEnvelopeVersion: 1;
  savedAt: number;
  revision?: number;
  data: AppData;
}
export interface StoredSnapshot {
  savedAt: number;
  revision?: number;
  data: AppData;
}

function decodeStoredSnapshot(value:unknown):StoredSnapshot|undefined {
  if(!value||typeof value!=='object')return undefined;
  const raw=value as any;
  if(raw.storageEnvelopeVersion===STORAGE_ENVELOPE_VERSION&&raw.data&&typeof raw.savedAt==='number'){
    return {savedAt:Number.isFinite(raw.savedAt)?raw.savedAt:0,revision:Number.isSafeInteger(raw.revision)&&raw.revision>0?raw.revision:0,data:raw.data as AppData};
  }
  if(Array.isArray(raw.gear))return {savedAt:0,data:raw as AppData};
  return undefined;
}

export function selectNewestStoredSnapshot(a?:StoredSnapshot,b?:StoredSnapshot):StoredSnapshot|undefined {
  if(!a)return b;
  if(!b)return a;
  if(a.revision&&b.revision&&a.revision!==b.revision)return b.revision>a.revision?b:a;
  return b.savedAt>a.savedAt?b:a;
}

export async function loadData(): Promise<AppData> {
  let indexedDbError: unknown;
  let indexed:StoredSnapshot|undefined;
  try {
    const db = await openDb();
    const value = await request<unknown>(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY));
    db.close();
    indexed=decodeStoredSnapshot(value);
  } catch (error) {
    indexedDbError = error;
  }

  const mirror=loadEmergencyMirror();
  lastRevision=Math.max(lastRevision,indexed?.revision??0,mirror?.revision??0);
  const selected=selectNewestStoredSnapshot(indexed,mirror);
  if(selected)return normalizeData(selected.data);
  if(indexedDbError)throw new Error(`Unable to open local gear storage and no emergency mirror was available: ${errorMessage(indexedDbError)}`);
  return makeInitialData();
}

/**
 * Serialise writes so rapid settings/gear edits cannot race and leave an older snapshot last.
 * IndexedDB is primary; localStorage is a best-effort emergency mirror.
 */
export function saveData(data: AppData): Promise<void> {
  const snapshot = structuredClone(data);
  const savedAt=Date.now();
  const revision=nextRevision();
  saveChain = saveChain.catch(() => undefined).then(() => writeSnapshot(snapshot,savedAt,revision));
  return saveChain;
}

async function writeSnapshot(data: AppData,savedAt:number,revision:number): Promise<void> {
  const envelope:StoredEnvelope={storageEnvelopeVersion:STORAGE_ENVELOPE_VERSION,savedAt,revision,data};
  let idbSaved = false;
  let mirrorSaved = false;
  let idbError: unknown;
  try {
    const db = await openDb();
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(envelope, KEY));
    db.close();
    idbSaved = true;
  } catch (error) {
    idbError = error;
  }
  try {
    const currentMirror=loadEmergencyMirror();
    if(!currentMirror||selectNewestStoredSnapshot(envelope,currentMirror)===envelope)writeEmergencyMirror(envelope);
    mirrorSaved = true;
  } catch {
    // A large inventory can exceed localStorage quota; IndexedDB remains authoritative.
  }
  if (!idbSaved && !mirrorSaved) throw new Error(`Local autosave failed: ${errorMessage(idbError)}`);
}

/** Synchronous best-effort mirror used on pagehide and as recovery if IndexedDB is unavailable. */
function nextRevision():number {
  lastRevision=Math.max(lastRevision,loadEmergencyMirror()?.revision??0)+1;
  return lastRevision;
}

export function saveEmergencyMirror(data: AppData,savedAt=Date.now()): void {
  writeEmergencyMirror({storageEnvelopeVersion:STORAGE_ENVELOPE_VERSION,savedAt,revision:nextRevision(),data});
}

function writeEmergencyMirror(envelope:StoredEnvelope):void {
  localStorage.setItem(MIRROR_KEY,JSON.stringify(envelope));
}

function loadEmergencyMirror(): StoredSnapshot | undefined {
  try {
    const text = localStorage.getItem(MIRROR_KEY);
    if (!text) return undefined;
    return decodeStoredSnapshot(JSON.parse(text));
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
    schemaVersion: 13,
    // Schema 9 is a deliberate one-time inventory reset from the user's complete
    // 26 October 2026 screenshots. Any pre-schema-9 gear rows are replaced, not
    // merged, because the verified 22-item list is the user's entire owned gear.
    gear: Number(raw?.schemaVersion) >= 9
      ? (Array.isArray(raw?.gear) ? raw.gear.map(normalizeItem) : [])
      : makeKnownGear(),
    settings: normalizeSettings(raw?.settings),
    authModel: normalizeAuthModel(raw?.authModel, initial.authModel, Number(raw?.schemaVersion ?? 0)),
    rollLog: Array.isArray(raw?.rollLog) ? raw.rollLog : [],
    // Same one-time reset for certificates: the seven screenshot-confirmed
    // certificates are the complete owned inventory at this snapshot.
    ownedCertificates: Number(raw?.schemaVersion)>=9
      ? (Array.isArray(raw?.ownedCertificates)?raw.ownedCertificates.map(normalizeOwnedCertificate):[])
      : screenshotCertificates(),
    theme: raw?.theme ?? 'system',
    vehicleProfile: normalizeVehicleProfile(raw?.vehicleProfile),
    vehicleSettings: normalizeVehicleSettings(raw?.vehicleSettings),
    vehicleParts: Number(raw?.schemaVersion)>=6
      ? (Array.isArray(raw?.vehicleParts) ? raw.vehicleParts.map(normalizeVehiclePart) : [])
      : mergeScreenshotParts(Array.isArray(raw?.vehicleParts) ? raw.vehicleParts.map(normalizeVehiclePart) : []),
    trailers: Array.isArray(raw?.trailers) ? raw.trailers.map(normalizeTrailer) : initial.trailers,
    trophies: Number(raw?.schemaVersion)>=6
      ? (Array.isArray(raw?.trophies) ? raw.trophies.map(normalizeTrophy) : [])
      : mergeScreenshotTrophies(Array.isArray(raw?.trophies) ? raw.trophies.map(normalizeTrophy) : []),
    trophySettings: normalizeTrophySettings(raw?.trophySettings,Number(raw?.schemaVersion)<6)
  };
}



function normalizeTrophy(item: GavelTrophy): GavelTrophy {
  const now = new Date().toISOString();
  const modifiers = Array.isArray(item?.modifiers) ? item.modifiers
    .filter(m => m && typeof m.mutation === 'string' && m.mutation.trim())
    .slice(0, 3)
    .map(m => ({ mutation: m.mutation.trim(), boostPct: Math.max(0, finite(m.boostPct)) })) : [];
  return {
    id: item?.id || crypto.randomUUID(),
    name: generateTrophyName(modifiers),
    modifiers,
    conditionPct: conditionOrUndefined(item?.conditionPct),
    favourite: Boolean(item?.favourite),
    createdAt: item?.createdAt || now,
    updatedAt: item?.updatedAt || now
  };
}

function normalizeTrophySettings(raw: Partial<TrophyOptimiserSettings> | undefined,upgradeOldWet=false): TrophyOptimiserSettings {
  const defaults = structuredClone(DEFAULT_TROPHY_SETTINGS);
  const maxActive = raw?.maxActive === 3 ? 3 : 4; // 3 standard, 4 with Extra Gavel Trophy gamepass.
  const supplied = Array.isArray(raw?.mutationWeights) ? raw.mutationWeights : [];
  const merged = new Map(defaults.mutationWeights.map(w => [w.mutation, w]));
  for (const w of supplied) {
    if (!w || typeof w.mutation !== 'string' || !w.mutation.trim()) continue;
    const name = w.mutation.trim();
    const current = merged.get(name);
    merged.set(name, {
      mutation: name,
      multiplier: Math.max(0,finite(upgradeOldWet && name==='Wet' && Number(w.multiplier)===1.4 ? 6 : (w.multiplier ?? current?.multiplier ?? 0))),
      enabled: w.enabled ?? current?.enabled ?? true,
      confidence: ['Confirmed','Community','Uncertain'].includes(String(w.confidence)) ? w.confidence as any : current?.confidence ?? 'Uncertain'
    });
  }
  return { maxActive, mutationWeights: [...merged.values()] };
}

function normalizeAuthModel(raw: AppData['authModel'] | undefined, defaults: AppData['authModel'], schemaVersion=0): AppData['authModel'] {
  const supplied = Array.isArray(raw) ? raw.map(entry => ({
    ...entry,
    observedValues: Array.isArray(entry.observedValues) ? [...entry.observedValues] : []
  })) : [];

  const migrated = supplied.flatMap(entry=>{
    if(schemaVersion>=11 || entry.certificateInventoryType) return [entry];
    if(entry.certificateType==='Normal Certificate of Authenticity'){
      return [{
        ...entry,
        certificateInventoryType:'Wooden Certificate of Authenticity' as const,
        // Schema-10 HIGH/LOW values represented the old invented basic/exclusive weighting.
        // Reset current built-in rows to a neutral prior while retaining custom rows and observations.
        assumedLikelihoodClass:['Normal numeric','Slot-exclusive'].includes(entry.category)?'MEDIUM' as const:entry.assumedLikelihoodClass
      }];
    }
    if(entry.certificateType==='Premium Certificate of Authenticity')return [{...entry,certificateInventoryType:'Premium Certificate of Authenticity' as const}];
    if(entry.certificateType==='Limited Certificate of Authenticity')return [{...entry,certificateInventoryType:'Limited Certificate of Authenticity' as const}];
    return [entry];
  });

  const key=(entry:AppData['authModel'][number])=>`${entry.certificateInventoryType??'legacy'}|${entry.certificateType}|${entry.slot}|${entry.outcome}`;
  const defaultsByKey=new Map(defaults.map(entry=>[key(entry),entry]));
  const out=migrated.map(entry=>{
    if(schemaVersion>=11)return entry;
    const fallback=defaultsByKey.get(key(entry));
    if(!fallback)return entry;
    const oldBuiltIn=['Normal numeric','Slot-exclusive','Premium perk — community-documented','Limited passive — exact proc range unverified'].includes(entry.category);
    return {
      ...fallback,
      ...entry,
      certificateInventoryType:entry.certificateInventoryType??fallback.certificateInventoryType,
      category:oldBuiltIn?fallback.category:entry.category,
      min:oldBuiltIn?fallback.min:(entry.min??fallback.min),
      typical:oldBuiltIn?fallback.typical:(entry.typical??fallback.typical),
      max:oldBuiltIn?fallback.max:(entry.max??fallback.max)
    };
  });
  const upgraded=out.map(entry=>{
    let next={...entry};
    if(
      schemaVersion<12 &&
      next.assumedLikelihoodClass==='MEDIUM' &&
      (next.category.startsWith('Wooden exclusive')||next.category.startsWith('Ripped exclusive'))
    ){
      next={...next,assumedLikelihoodClass:'LOW' as const};
    }
    if(schemaVersion<13){
      const fallback=defaultsByKey.get(key(next));
      const empiricalConfidence=next.observedSampleCount>=10?'Empirical':next.observedSampleCount>=4?'Medium':next.observedSampleCount>=1?'Low':'Unknown';
      // Older builds overwrote mechanic confidence with sample-size confidence.
      // Restore the built-in mechanic/range confidence where known.
      next={
        ...next,
        confidence:fallback?.confidence??next.confidence,
        empiricalConfidence
      };
    }else if(!next.empiricalConfidence){
      next={...next,empiricalConfidence:next.observedSampleCount>=10?'Empirical':next.observedSampleCount>=4?'Medium':next.observedSampleCount>=1?'Low':'Unknown'};
    }
    return next;
  });
  const existing=new Set(upgraded.map(key));
  if(schemaVersion<11){
    for(const entry of defaults) if(!existing.has(key(entry))) upgraded.push(entry);
  }
  return upgraded;
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
    conditionPct: conditionOrUndefined(item?.conditionPct),
    favourite: Boolean(item?.favourite), createdAt: item?.createdAt || now, updatedAt: item?.updatedAt || now
  };
}

function conditionOrUndefined(value:unknown):number|undefined {
  if(value===undefined||value===null||value==='')return undefined;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>100)throw new Error('Item condition must be between 0 and 100%.');
  return n;
}

function normalizeOwnedCertificate(raw: AppData['ownedCertificates'][number]):AppData['ownedCertificates'][number]{
  const types=['Wooden Certificate of Authenticity','Ripped Certificate of Authenticity','Premium Certificate of Authenticity','Limited Certificate of Authenticity'];
  if(!types.includes(raw?.type))throw new Error('Unsupported certificate type.');
  const quantity=Number(raw?.quantity);
  if(!Number.isSafeInteger(quantity)||quantity<0)throw new Error('Certificate quantity must be a non-negative integer.');
  const gradeStars=raw.gradeStars===undefined?undefined:Number(raw.gradeStars);
  if(gradeStars!==undefined&&(!Number.isSafeInteger(gradeStars)||gradeStars<0||gradeStars>5))throw new Error('Certificate star grade must be an integer from 0 to 5.');
  return {id:raw.id||crypto.randomUUID(),type:raw.type,quantity,
    displayedValue:raw.displayedValue===undefined?undefined:finite(raw.displayedValue),
    conditionPct:conditionOrUndefined(raw.conditionPct),
    rarity:typeof raw.rarity==='string'?raw.rarity:undefined,
    gradeStars,
    mutation:typeof raw.mutation==='string'&&raw.mutation.trim()?raw.mutation.trim():undefined};
}

function normalizeTrailer(item: Trailer): Trailer {
  const now = new Date().toISOString();
  return { id: item?.id || crypto.randomUUID(), name: typeof item?.name === 'string' ? item.name : '', capacityKg: finite(item?.capacityKg), favourite: Boolean(item?.favourite), createdAt: item?.createdAt || now, updatedAt: item?.updatedAt || now };
}


function normalizeSettings(raw: Partial<AppData['settings']> | undefined): AppData['settings'] {
  const source = (raw ?? {}) as Record<string, unknown>;
  const sourceVersion = String(source.version ?? '1.0');
  const merged: Record<string, unknown> = { ...LOCKED_DEFAULT_SETTINGS, ...source };

  // Algorithm 2.0 unifies Main Auction, specialist loadouts, retention and certificate evaluation. Old installations may have
  // persisted the 1.0 defaults in IndexedDB, so simply changing defaults would leave
  // those browsers on the obsolete model. Override the shared scoring fields changed by 2.0 once,
  // while retaining unrelated user settings and all inventory/history data.
  if (sourceVersion !== '2.0') {
    const v20Keys: Array<keyof AppData['settings']> = [
      'luckWeight','arrowWeight','arrowSweetSpot',
      'npcWeight','npcBreakpoint1','npcBreakpoint2','npcMultiplier2','npcMultiplier3',
      'zoneWeight','zoneBreakpoint1','zoneBreakpoint2','zoneMultiplier2','zoneMultiplier3',
      'tipWeight','recoveryWeight','walkWeight','vehicleWeight'
    ];
    for (const key of v20Keys) merged[key] = LOCKED_DEFAULT_SETTINGS[key];
  }

  const out: Record<string, unknown> = { ...LOCKED_DEFAULT_SETTINGS, version: '2.0' };
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
    mutation: typeof i?.mutation === 'string' ? i.mutation : undefined,
    conditionPct: i?.conditionPct === undefined || i?.conditionPct === null
      ? undefined : finite(i.conditionPct),
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
    if (item.mutation !== undefined && typeof item.mutation !== 'string') throw new Error(`${prefix}: invalid mutation label.`);
    if (item.conditionPct !== undefined && (typeof item.conditionPct !== 'number' || !Number.isFinite(item.conditionPct) || item.conditionPct < 0 || item.conditionPct > 100))
      throw new Error(`${prefix}: condition must be between 0 and 100%.`);
    if (item.id) {
      if (ids.has(item.id)) throw new Error(`${prefix}: duplicate item ID ${item.id}.`);
      ids.add(item.id);
    }
    for (const [key,value] of Object.entries(item.stats ?? {})) {
      if (value !== '' && value !== null && value !== undefined && !Number.isFinite(Number(value))) throw new Error(`${prefix}: ${key} is not a finite number.`);
    }
    if (item.authentication?.kind !== undefined && !['None','Normal','Premium','Limited','Alien'].includes(item.authentication.kind)) throw new Error(`${prefix}: invalid authentication type.`);
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
    if (!Array.isArray(item.modifiers) || item.modifiers.length > 3) throw new Error(`Gavel Trophy row ${index + 1}: modifiers must contain at most three entries.`);
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

