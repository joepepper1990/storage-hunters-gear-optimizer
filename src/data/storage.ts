import { validateStatDeltas } from './statDeltas';
import { fillVerifiedTrophyStars, replaceWithVerifiedCertificates, replaceWithVerifiedTrophies } from './screenshotEquipment';
import { applyInventoryUpdate20261029, fillVerifiedGearStars, replaceWithVerifiedGear } from './knownGear';
import { DEFAULT_TROPHY_SETTINGS, makeInitialData, LEGACY_V20_ARROW_DEFAULTS, LOCKED_DEFAULT_SETTINGS } from '../defaults';
import type { AppData, CertificateRollLog, GavelTrophy, GearItem, TrophyOptimiserSettings } from '../types';
import { generateGearName, generateTrophyName, inferBaseName } from '../naming';

const DB_NAME = 'storage-hunters-gear-optimizer';
const STORE = 'app';
const KEY = 'data';
const MIRROR_KEY = 'storage-hunters-gear-optimizer:emergency-mirror';
const STORAGE_ENVELOPE_VERSION = 1;
let capturedHead: StoredSnapshot | undefined;
let committedHead: StoredSnapshot | undefined;
let storageConflict=false;
let ignoredMirrorToken: string | undefined;
let captures = new WeakMap<AppData, CapturedSnapshot>();
let localSnapshots = new Set<string>();
let saveChain: Promise<void> = Promise.resolve();

interface StoredEnvelope {
  storageEnvelopeVersion: 1;
  savedAt: number;
  revision?: number;
  snapshotId?: string;
  ancestorTokens?: string[];
  data: AppData;
}
export interface StoredSnapshot {
  savedAt: number;
  revision?: number;
  snapshotId?: string;
  ancestorTokens?: string[];
  data: AppData;
}

function decodeStoredSnapshot(value:unknown):StoredSnapshot|undefined {
  if(!value||typeof value!=='object')return undefined;
  const raw=value as any;
  if(raw.storageEnvelopeVersion===STORAGE_ENVELOPE_VERSION&&raw.data&&typeof raw.savedAt==='number'){
    return {savedAt:Number.isFinite(raw.savedAt)?raw.savedAt:0,revision:Number.isSafeInteger(raw.revision)&&raw.revision>0?raw.revision:0,snapshotId:typeof raw.snapshotId==='string'?raw.snapshotId:undefined,ancestorTokens:Array.isArray(raw.ancestorTokens)?raw.ancestorTokens.filter((token:unknown)=>typeof token==='string'):undefined,data:raw.data as AppData};
  }
  if(Array.isArray(raw.gear))return {savedAt:0,data:raw as AppData};
  return undefined;
}

export function selectNewestStoredSnapshot(a?:StoredSnapshot,b?:StoredSnapshot):StoredSnapshot|undefined {
  if(!a)return b;
  if(!b)return a;
  if(a.revision&&b.revision){
    if(a.revision!==b.revision)return b.revision>a.revision?b:a;
    // Two writers can capture the same parent. On a revision tie keep the first
    // source (IndexedDB at startup), rather than promoting a stale mirror by clock.
    if(a.snapshotId!==b.snapshotId)return a;
  }
  return b.savedAt>a.savedAt?b:a;
}

// Snapshot IDs prove ancestry across tabs. Legacy envelopes receive a content token
// so a new mirror can also prove which pre-provenance record it was edited from.
function snapshotToken(snapshot:StoredSnapshot):string {
  if(snapshot.snapshotId)return `id:${snapshot.snapshotId}`;
  const text=JSON.stringify(snapshot.data);
  let a=2166136261,b=2246822519;
  for(let i=0;i<text.length;i++){
    a=Math.imul(a^text.charCodeAt(i),16777619);
    b=Math.imul(b^text.charCodeAt(i),3266489917);
  }
  return `legacy:${snapshot.revision??0}:${snapshot.savedAt}:${text.length}:${a>>>0}:${b>>>0}`;
}

function selectRecoverySnapshot(indexed?:StoredSnapshot,mirror?:StoredSnapshot):StoredSnapshot|undefined {
  if(!indexed||!mirror)return indexed??mirror;
  if(sameSnapshot(indexed,mirror))return indexed;
  // Preserve historical recovery ordering for two old-format records. Every new
  // mirror must prove descent from the actual committed record, regardless of revision.
  if(!indexed.snapshotId&&!mirror.snapshotId&&!indexed.ancestorTokens&&!mirror.ancestorTokens)return selectNewestStoredSnapshot(indexed,mirror);
  if(mirror.ancestorTokens?.includes(snapshotToken(indexed)))return selectNewestStoredSnapshot(indexed,mirror);
  return indexed;
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
  const selected=selectRecoverySnapshot(indexed,mirror);
  ignoredMirrorToken=selected===indexed&&mirror&&indexed&&!sameSnapshot(indexed,mirror)?snapshotToken(mirror):undefined;
  storageConflict=false;
  committedHead=indexed;
  capturedHead=selected;
  captures=new WeakMap();
  localSnapshots=new Set();
  if(selected)return normalizeData(selected.data);
  if(indexedDbError)throw new Error(`Unable to open local gear storage and no emergency mirror was available: ${errorMessage(indexedDbError)}`);
  return makeInitialData();
}

export class StorageConflictError extends Error {
  constructor() { super('Another tab saved newer data. Download a backup of this tab before reloading.'); this.name='StorageConflictError'; }
}

interface CapturedSnapshot { envelope: StoredEnvelope; base?: StoredSnapshot }

// Capture provenance before queuing. Never rebase an old in-memory inventory on a
// newer mirror observed at write/pagehide time: that would turn stale data into a winner.
function captureSnapshot(data: AppData, savedAt=Date.now()): CapturedSnapshot {
  if(storageConflict)throw new StorageConflictError();
  const existing=captures.get(data);
  if(existing)return existing;
  let ancestorTokens=capturedHead?[snapshotToken(capturedHead),...(capturedHead.ancestorTokens??[])]:[];
  // Once an ancestor commits, older ancestry is no longer needed by future edits.
  const committedIndex=committedHead?ancestorTokens.indexOf(snapshotToken(committedHead)):-1;
  if(committedIndex>=0)ancestorTokens=ancestorTokens.slice(0,committedIndex+1);
  const envelope:StoredEnvelope={storageEnvelopeVersion:STORAGE_ENVELOPE_VERSION,savedAt,
    revision:(capturedHead?.revision??0)+1,snapshotId:crypto.randomUUID(),ancestorTokens,data:structuredClone(data)};
  const captured={envelope,base:capturedHead};
  captures.set(data,captured);
  capturedHead=envelope;
  localSnapshots.add(envelope.snapshotId!);
  return captured;
}

function sameSnapshot(a:StoredSnapshot,b:StoredSnapshot):boolean {
  if(a.snapshotId||b.snapshotId)return a.snapshotId===b.snapshotId;
  return snapshotToken(a)===snapshotToken(b);
}

function assertCompatible(current:StoredSnapshot|undefined,captured:CapturedSnapshot,mirror=false):void {
  if(storageConflict)throw new StorageConflictError();
  if(!current)return;
  if(mirror&&snapshotToken(current)===ignoredMirrorToken)return;
  if(captured.envelope.ancestorTokens?.includes(snapshotToken(current)))return;
  if(current.snapshotId&&localSnapshots.has(current.snapshotId))return;
  if(captured.base&&sameSnapshot(current,captured.base))return;
  storageConflict=true;
  throw new StorageConflictError();
}

/** Serialise local writes and compare the captured parent within the IDB write transaction. */
export async function saveData(data: AppData): Promise<void> {
  if(storageConflict)return Promise.reject(new StorageConflictError());
  const captured=captureSnapshot(data);
  saveChain=saveChain.catch(()=>undefined).then(()=>writeSnapshot(captured));
  return saveChain;
}

async function writeSnapshot(captured:CapturedSnapshot):Promise<void> {
  if(storageConflict)throw new StorageConflictError();
  const {envelope}=captured;
  let wroteIndexed=false;
  let idbSaved=false, mirrorSaved=false;
  let idbError:unknown;
  try {
    const db=await openDb();
    try {
      const transaction=db.transaction(STORE,'readwrite');
      await new Promise<void>((resolve,reject)=>{
        transaction.oncomplete=()=>resolve();
        transaction.onabort=()=>reject(transaction.error??new Error('IndexedDB transaction aborted.'));
        transaction.onerror=()=>reject(transaction.error??new Error('IndexedDB transaction failed.'));
        const store=transaction.objectStore(STORE);
        const read=store.get(KEY);
        read.onerror=()=>reject(read.error??new Error('IndexedDB read failed.'));
        read.onsuccess=()=>{
          try {
            const indexed=decodeStoredSnapshot(read.result),mirror=loadEmergencyMirror();
            assertCompatible(indexed,captured);
            assertCompatible(mirror,captured,true);
            const current=selectNewestStoredSnapshot(indexed,mirror&&snapshotToken(mirror)!==ignoredMirrorToken?mirror:undefined);
            // A later local pagehide already protected a queued edit; keep it newer.
            if(current&&current.snapshotId!==envelope.snapshotId&&selectNewestStoredSnapshot(envelope,current)===current){resolve();return;}
            store.put(envelope,KEY);
            wroteIndexed=true;
          } catch(error) { reject(error); }
        };
      });
      idbSaved=true;
      if(wroteIndexed)committedHead=envelope;
    } finally {db.close();}
  } catch(error) {
    if(error instanceof StorageConflictError)throw error;
    idbError=error;
  }
  try {
    const current=loadEmergencyMirror();
    assertCompatible(current,captured,true);
    if(!current||snapshotToken(current)===ignoredMirrorToken||sameSnapshot(current,envelope)||selectNewestStoredSnapshot(envelope,current)===envelope)writeEmergencyMirror(envelope);
    mirrorSaved=true;
  } catch(error) {
    if(error instanceof StorageConflictError)throw error;
    // Quota failure is safe when the IndexedDB transaction committed.
  }
  if(!idbSaved&&!mirrorSaved)throw new Error(`Local autosave failed: ${errorMessage(idbError)}`);
}

/** Synchronous recovery preserves capture-time lineage, including current unsaved edits. */
export function saveEmergencyMirror(data: AppData,savedAt=Date.now()):void {
  const captured=captureSnapshot(data,savedAt);
  const current=loadEmergencyMirror();
  assertCompatible(current,captured,true);
  if(!current||snapshotToken(current)===ignoredMirrorToken||sameSnapshot(current,captured.envelope)||selectNewestStoredSnapshot(captured.envelope,current)===captured.envelope)writeEmergencyMirror(captured.envelope);
}

/** Calls back when another window of this app saves. Returns an unsubscribe function. */
export function onSavedElsewhere(callback:()=>void):()=>void {
  if(typeof window==='undefined')return ()=>{};
  const listener=(event:StorageEvent)=>{ if(event.key===MIRROR_KEY&&event.newValue)callback(); };
  window.addEventListener('storage',listener);
  return ()=>window.removeEventListener('storage',listener);
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

export function normalizeData(raw: AppData, options: { preserveInventory?: boolean } = {}): AppData {
  const initial = makeInitialData();
  const preserveInventory = options.preserveInventory === true;
  // Schema 15 is a deliberate one-time replacement of gear, certificates and Gavels from the
  // user's complete 27 October 2026 screenshots (earlier schemas 9 and 14 did the same from
  // older screenshots). Stored records that match a screenshot keep their ID, favourite and
  // created date; anything not in the screenshots is removed. Explicit backup restores keep
  // their own inventory. Vehicle data from older versions is dropped: vehicles are no longer modelled.
  const replace = !preserveInventory && !(Number(raw?.schemaVersion) >= 15);
  const storedGear = Array.isArray(raw?.gear) ? raw.gear.map(normalizeItem) : [];
  const storedCertificates = Array.isArray(raw?.ownedCertificates) ? raw.ownedCertificates.map(normalizeOwnedCertificate) : [];
  const storedTrophies = Array.isArray(raw?.trophies) ? raw.trophies.map(normalizeTrophy) : [];
  // Schema 16 fills the star grades the same screenshots showed, once, without overwriting
  // a grade already recorded. Backup restores keep exactly what they contain.
  const fillStars = !preserveInventory && !(Number(raw?.schemaVersion) >= 16);
  // Schema 17 applies the 29 October inventory screenshots once: four items gone, two added.
  const update1029 = !preserveInventory && !(Number(raw?.schemaVersion) >= 17);
  const replaced = replace ? replaceWithVerifiedGear(storedGear) : storedGear;
  const gear = update1029 ? applyInventoryUpdate20261029(replaced) : replaced;
  const trophies = replace ? replaceWithVerifiedTrophies(storedTrophies) : storedTrophies;
  return {
    schemaVersion: 17,
    gear: fillStars ? fillVerifiedGearStars(gear) : gear,
    settings: normalizeSettings(raw?.settings),
    authModel: normalizeAuthModel(raw?.authModel, initial.authModel, Number(raw?.schemaVersion ?? 0)),
    rollLog: Array.isArray(raw?.rollLog) ? raw.rollLog.map((roll, index) => preserveInventory ? normalizeRollLog(roll, index) : coerceStoredRollLog(roll, index)) : [],
    ownedCertificates: replace ? replaceWithVerifiedCertificates(storedCertificates) : storedCertificates,
    theme: raw?.theme ?? 'system',
    trophies: fillStars ? fillVerifiedTrophyStars(trophies) : trophies,
    trophySettings: normalizeTrophySettings(raw?.trophySettings,Number(raw?.schemaVersion)<6),
    gradeObservations: Array.isArray(raw?.gradeObservations) ? raw.gradeObservations.filter(validGradeObservation) : []
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
    ...gradeOf(item?.gradeStars),
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

const ROLL_CERTIFICATE_TYPES = ['Normal Certificate of Authenticity','Premium Certificate of Authenticity','Limited Certificate of Authenticity','Certificate of Alienticity'] as const;
const OWNED_CERTIFICATE_TYPES = ['Wooden Certificate of Authenticity','Ripped Certificate of Authenticity','Premium Certificate of Authenticity','Limited Certificate of Authenticity'] as const;

/** Every roll-history row is rebuilt with typed fields, so restored numeric strings
 * become numbers and malformed rows are rejected before any screen renders them.
 */
export function normalizeRollLog(raw: unknown, index = 0): CertificateRollLog {
  const prefix = `Roll log row ${index + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${prefix}: invalid entry.`);
  const r = raw as Record<string, unknown>;
  const text = (key: string, required = true): string => {
    const value = r[key];
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) { if (required) throw new Error(`${prefix}: ${key} is required.`); return ''; }
    throw new Error(`${prefix}: ${key} must be text.`);
  };
  const number = (key: string): number => {
    const value = r[key];
    const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
    if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(n)) throw new Error(`${prefix}: ${key} is not a finite number.`);
    return n;
  };
  const optionalNumber = (key: string): number | undefined => r[key] === undefined || r[key] === null ? undefined : number(key);
  const slot = text('slot');
  if (!['Head','Back','Wrist'].includes(slot)) throw new Error(`${prefix}: invalid slot.`);
  const inventoryType = r.certificateInventoryType === undefined || r.certificateInventoryType === null ? undefined : text('certificateInventoryType');
  if (inventoryType !== undefined && !OWNED_CERTIFICATE_TYPES.includes(inventoryType as never)) throw new Error(`${prefix}: unsupported certificate type.`);
  const certificateType = r.certificateType === undefined && inventoryType
    ? (inventoryType.startsWith('Premium') ? 'Premium Certificate of Authenticity' : inventoryType.startsWith('Limited') ? 'Limited Certificate of Authenticity' : 'Normal Certificate of Authenticity')
    : text('certificateType');
  if (!ROLL_CERTIFICATE_TYPES.includes(certificateType as never)) throw new Error(`${prefix}: unsupported certificate type.`);
  const gradeStars = optionalNumber('certificateGradeStars');
  if (gradeStars !== undefined && (!Number.isSafeInteger(gradeStars) || gradeStars < 0 || gradeStars > 5)) throw new Error(`${prefix}: certificate star grade must be an integer from 0 to 5.`);
  const date = text('date', false);
  if (r.modelWarnings !== undefined && (!Array.isArray(r.modelWarnings) || r.modelWarnings.some(w => typeof w !== 'string'))) throw new Error(`${prefix}: model warnings must be text.`);
  const position = optionalNumber('normalizedRollPosition');
  return {
    id: text('id', false) || crypto.randomUUID(),
    date: date || new Date(0).toISOString(),
    certificateType: certificateType as CertificateRollLog['certificateType'],
    itemId: text('itemId', false),
    itemName: text('itemName', false),
    slot: slot as CertificateRollLog['slot'],
    previousAuthentication: text('previousAuthentication', false),
    previousValue: number('previousValue'),
    newAuthentication: text('newAuthentication'),
    newValue: number('newValue'),
    improvedBestSet: Boolean(r.improvedBestSet),
    bestScoreBefore: number('bestScoreBefore'),
    bestScoreAfter: number('bestScoreAfter'),
    ...(r.certificateId === undefined || r.certificateId === null ? {} : { certificateId: text('certificateId') }),
    ...(gradeStars === undefined ? {} : { certificateGradeStars: gradeStars }),
    ...(typeof r.certificateMutation === 'string' && r.certificateMutation.trim() ? { certificateMutation: r.certificateMutation.trim() } : {}),
    ...(inventoryType ? { certificateInventoryType: inventoryType as CertificateRollLog['certificateInventoryType'] } : {}),
    ...(position === undefined ? {} : { normalizedRollPosition: position }),
    ...(r.observedStatDeltas === undefined || r.observedStatDeltas === null ? {} : { observedStatDeltas: validateStatDeltas(r.observedStatDeltas, `${prefix}: observed stat deltas`) }),
    ...(Array.isArray(r.modelWarnings) ? { modelWarnings: [...r.modelWarnings as string[]] } : {})
  };
}

/** Startup never refuses or drops saved history: a row this build cannot type strictly
 * keeps every stored field; only fields that would break rendering are coerced. An
 * unrecognised certificate type or slot is kept verbatim, so it matches no model.
 */
function coerceStoredRollLog(raw: unknown, index: number): CertificateRollLog {
  try { return normalizeRollLog(raw, index); } catch { /* lenient fallback below */ }
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const str = (value: unknown) => typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  const out: Record<string, unknown> = {
    ...r,
    id: str(r.id) || crypto.randomUUID(), date: str(r.date) || new Date(0).toISOString(),
    certificateType: str(r.certificateType), itemId: str(r.itemId), itemName: str(r.itemName), slot: str(r.slot),
    previousAuthentication: str(r.previousAuthentication), previousValue: finite(r.previousValue),
    newAuthentication: str(r.newAuthentication), newValue: finite(r.newValue), improvedBestSet: Boolean(r.improvedBestSet),
    bestScoreBefore: finite(r.bestScoreBefore), bestScoreAfter: finite(r.bestScoreAfter)
  };
  const grade = Number(r.certificateGradeStars);
  if (r.certificateGradeStars !== undefined && !(r.certificateGradeStars !== null && Number.isSafeInteger(grade) && grade >= 0 && grade <= 5)) delete out.certificateGradeStars;
  else if (r.certificateGradeStars !== undefined) out.certificateGradeStars = grade;
  if (r.normalizedRollPosition !== undefined && !Number.isFinite(Number(r.normalizedRollPosition))) delete out.normalizedRollPosition;
  else if (r.normalizedRollPosition !== undefined) out.normalizedRollPosition = Number(r.normalizedRollPosition);
  if (r.observedStatDeltas !== undefined) { try { validateStatDeltas(r.observedStatDeltas, 'stored deltas'); } catch { delete out.observedStatDeltas; } }
  if (r.modelWarnings !== undefined) {
    if (Array.isArray(r.modelWarnings)) out.modelWarnings = r.modelWarnings.filter((w): w is string => typeof w === 'string');
    else delete out.modelWarnings;
  }
  return out as unknown as CertificateRollLog;
}

function normalizeSettings(raw: Partial<AppData['settings']> | undefined): AppData['settings'] {
  const source = (raw ?? {}) as Record<string, unknown>;
  const sourceVersion = String(source.version ?? '1.0');
  const merged: Record<string, unknown> = { ...LOCKED_DEFAULT_SETTINGS, ...source };

  // Algorithm 2.0 unifies Main Auction, specialist loadouts, retention and certificate evaluation. Old installations may have
  // persisted the 1.0 defaults in IndexedDB, so simply changing defaults would leave
  // those browsers on the obsolete model. Override the shared scoring fields changed by 2.0 once,
  // while retaining unrelated user settings and all inventory/history data.
  if (sourceVersion !== '2.0' && sourceVersion !== '2.1') {
    const v20Keys: Array<keyof AppData['settings']> = [
      'luckWeight','arrowWeight','arrowSweetSpot',
      'npcWeight','npcBreakpoint1','npcBreakpoint2','npcMultiplier2','npcMultiplier3',
      'zoneWeight','zoneBreakpoint1','zoneBreakpoint2','zoneMultiplier2','zoneMultiplier3',
      'tipWeight','recoveryWeight','walkWeight','vehicleWeight'
    ];
    for (const key of v20Keys) merged[key] = LOCKED_DEFAULT_SETTINGS[key];
  }

  // 2.0 -> 2.1: the 65-85% Arrow band and Luck-equal Arrow priority replace the old
  // 75% / 0.8 defaults. Only values still equal to those old defaults move; any
  // customised value, and every unrelated setting, is kept exactly.
  if (sourceVersion === '2.0') {
    if (Number(merged.arrowWeight) === LEGACY_V20_ARROW_DEFAULTS.arrowWeight) merged.arrowWeight = LOCKED_DEFAULT_SETTINGS.arrowWeight;
    if (Number(merged.arrowSweetSpot) === LEGACY_V20_ARROW_DEFAULTS.arrowSweetSpot) merged.arrowSweetSpot = LOCKED_DEFAULT_SETTINGS.arrowSweetSpot;
  }

  const out: Record<string, unknown> = { ...LOCKED_DEFAULT_SETTINGS, version: '2.1' };
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
    ...gradeOf(i?.gradeStars),
    favourite: Boolean(i?.favourite),
    authenticated,
    authentication,
    stats,
    createdAt: i?.createdAt || now,
    updatedAt: i?.updatedAt || now
  };
}

function validGradeObservation(o: unknown): o is AppData['gradeObservations'][number] {
  const v = o as AppData['gradeObservations'][number];
  return Boolean(v) && typeof v.id === 'string' && typeof v.itemName === 'string'
    && [v.fromStars, v.toStars].every(n => Number.isInteger(n) && n >= 0 && n <= 5) && Number.isFinite(v.ratio) && v.ratio > 0;
}

/** A recorded star grade (whole number 0-5); anything else is left unrecorded. */
function gradeOf(value: unknown): { gradeStars?: number } {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isInteger(n) && n >= 0 && n <= 5 ? { gradeStars: n } : {};
}
function finite(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error ?? 'unknown error'); }

export function exportJson(data: AppData): string { return JSON.stringify(data, null, 2); }
export function importJson(text: string): AppData {
  const parsed = JSON.parse(text) as AppData;
  validateImportedData(parsed);
  return normalizeData(parsed, { preserveInventory: true });
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
    if (item.authentication?.statDeltas !== undefined) validateStatDeltas(item.authentication.statDeltas, `${prefix}: Authentication Stat Deltas`);
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
  // Rows are fully validated and typed by normalizeRollLog during normalisation.
  for (const [index,roll] of (raw.rollLog ?? []).entries()) normalizeRollLog(roll, index);
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

