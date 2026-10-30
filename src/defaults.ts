import { screenshotTrophies, screenshotCertificates } from './data/screenshotEquipment';
import { makeKnownGear } from './data/knownGear';
import { CERTIFICATE_CATALOGUE } from './authentication';
import { authModelCertificateType } from './engine/authModel';
import type { AlgorithmSettings, AppData, AuthModelEntry, GearStats, TrophyOptimiserSettings } from './types';

export const ZERO_STATS: GearStats = {
  luck: 0,
  energy: 0,
  tip: 0,
  walk: 0,
  vehicle: 0,
  recovery: 0,
  zone: 0,
  arrowReduction: 0,
  npc: 0
};


export const DEFAULT_TROPHY_SETTINGS: TrophyOptimiserSettings = {
  maxActive: 4,
  mutationWeights: [
    { mutation: 'Dirty', multiplier: 0.8, enabled: false, confidence: 'Community' },
    { mutation: 'Pure', multiplier: 1.5, enabled: false, confidence: 'Community' },
    { mutation: 'Spotless', multiplier: 3, enabled: false, confidence: 'Community' },
    { mutation: 'Fossil', multiplier: 5, enabled: false, confidence: 'Community' },
    { mutation: 'Silver', multiplier: 2, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Gold', multiplier: 4, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Corrupted', multiplier: 6, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Diamond', multiplier: 8, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Gem', multiplier: 10, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Chrome', multiplier: 12, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Hologram', multiplier: 15, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Void', multiplier: 35, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Secret', multiplier: 50, enabled: true, confidence: 'Community' },
    { mutation: 'Rainbow', multiplier: 100, enabled: true, confidence: 'Uncertain' },
    { mutation: 'Onyx', multiplier: 175, enabled: true, confidence: 'Community' },
    { mutation: 'Tiny', multiplier: 2, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Huge', multiplier: 2, enabled: true, confidence: 'Uncertain' },
    { mutation: 'Moonlit', multiplier: 1.5, enabled: true, confidence: 'Community' },
    { mutation: 'Firefly', multiplier: 5, enabled: true, confidence: 'Community' },
    { mutation: 'Wet', multiplier: 6, enabled: true, confidence: 'Community' },
    { mutation: 'Shocked', multiplier: 6, enabled: true, confidence: 'Community' },
    { mutation: 'Acid', multiplier: 5, enabled: true, confidence: 'Uncertain' },
    { mutation: 'Caustic', multiplier: 30, enabled: true, confidence: 'Uncertain' },
    { mutation: 'Radioactive', multiplier: 10, enabled: true, confidence: 'Community' },
    { mutation: 'Nuclear', multiplier: 50, enabled: true, confidence: 'Community' },
    { mutation: 'Dune', multiplier: 12.5, enabled: true, confidence: 'Community' },
    { mutation: 'Sandy', multiplier: 2.25, enabled: true, confidence: 'Community' },
    { mutation: 'Redacted', multiplier: 1.25, enabled: true, confidence: 'Community' },
    { mutation: 'Seized', multiplier: 15, enabled: true, confidence: 'Community' },
    { mutation: 'Probed', multiplier: 4, enabled: true, confidence: 'Community' },
    { mutation: 'Abducted', multiplier: 10, enabled: true, confidence: 'Community' },
    { mutation: 'Extraterrestrial', multiplier: 25, enabled: true, confidence: 'Community' },
    { mutation: 'Tumbleweed', multiplier: 3.5, enabled: true, confidence: 'Community' },
    { mutation: 'Gunsmoked', multiplier: 11, enabled: true, confidence: 'Community' },
    { mutation: 'Goldrush', multiplier: 25, enabled: true, confidence: 'Community' },
    { mutation: 'Polished Brass', multiplier: 3.5, enabled: true, confidence: 'Community' },
    { mutation: 'Steam', multiplier: 10, enabled: true, confidence: 'Community' },
    { mutation: 'Clockwork', multiplier: 25, enabled: true, confidence: 'Community' },
    { mutation: 'Falling Leaves', multiplier: 2, enabled: true, confidence: 'Community' },
    { mutation: 'Senescence', multiplier: 20, enabled: true, confidence: 'Community' },
    { mutation: 'Cobwebbed', multiplier: 1.2, enabled: true, confidence: 'Community' },
    { mutation: 'Antique', multiplier: 2, enabled: true, confidence: 'Community' },
    { mutation: 'Ancient', multiplier: 5, enabled: true, confidence: 'Community' },
    { mutation: 'Timeless', multiplier: 12, enabled: true, confidence: 'Community' },
    { mutation: 'Ruby', multiplier: 110, enabled: false, confidence: 'Uncertain' },
    { mutation: 'Titanium', multiplier: 7, enabled: false, confidence: 'Uncertain' }
  ]
};


export const LOCKED_DEFAULT_SETTINGS: AlgorithmSettings = {
  version: '2.3',
  luckWeight: 1,
  // Arrow is a band, not a stat to maximise: value rises to 70% combined reduction and is
  // flat through 90%. Sets inside 70-90% always rank first.
  arrowWeight: 1,
  arrowTargetMin: 70,
  arrowTargetMax: 90,
  npcWeight: 0,
  npcBreakpoint1: 20,
  npcBreakpoint2: 40,
  npcMultiplier2: 0.75,
  npcMultiplier3: 0.5,
  // Policy default, not a game fact: Energy counts in auction sets below Zone, with
  // full value to 50%, a tenth from 50% to 100% and nothing above 100%.
  energyWeight: 0.3,
  energyTarget: 50,
  energySecondStageMultiplier: 0.1,
  energyCeiling: 100,
  zoneWeight: 0.6,
  zoneBreakpoint1: 30,
  zoneBreakpoint2: 60,
  zoneMultiplier2: 0.75,
  zoneMultiplier3: 0.5,
  tipWeight: 0,
  recoveryWeight: 0.2,
  // Policy default, not a game fact: a certificate roll that costs the Neutral auction
  // set more than this percentage is not counted as an improvement.
  mainMaterialLossPct: 2,
  vehicleWeight: 0,
  walkWeight: 0,
  // No specialist sets: the app answers with one best set. Energy counts in that set.
  drinkPriority: 0,
  gradingPriority: 0,
  shopPriority: 0,
  shopTipWeight: 0.4,
  shopNpcWeight: 0.3
};

export function makeDefaultAuthModel(): AuthModelEntry[] {
  return CERTIFICATE_CATALOGUE.map(outcome=>({
    id:crypto.randomUUID(),
    certificateInventoryType:outcome.type,
    certificateType:authModelCertificateType(outcome.type),
    slot:outcome.slot,
    outcome:outcome.effect,
    category:outcome.category,
    // Stored for compatibility only: effect-selection chance is always equal.
    assumedLikelihoodClass:'MEDIUM' as const,
    observedSampleCount:0,
    observedValues:[],
    min:outcome.min,
    typical:outcome.typical,
    max:outcome.max,
    confidence:outcome.confidence,
    empiricalConfidence:'Unknown' as const,
    enabled:true
  }));
}

export function makeEmptyData():AppData{
  return {
    schemaVersion:19,
    gear:[],
    settings:{...LOCKED_DEFAULT_SETTINGS},
    authModel:makeDefaultAuthModel(),
    rollLog:[],
    ownedCertificates:[],
    theme:'system',
    trophies:[],
    trophySettings:structuredClone(DEFAULT_TROPHY_SETTINGS),
    gradeObservations:[]
  };
}

export function makeInitialData(): AppData {
  return {
    schemaVersion: 19,
    gear: makeKnownGear(),
    settings: { ...LOCKED_DEFAULT_SETTINGS },
    authModel: makeDefaultAuthModel(),
    rollLog: [],
    ownedCertificates: screenshotCertificates(),
    theme: 'system',
    trophies: screenshotTrophies(),
    trophySettings: structuredClone(DEFAULT_TROPHY_SETTINGS),
    gradeObservations: []
  };
}
