import { screenshotVehicleParts, screenshotTrophies, screenshotCertificates } from './data/screenshotEquipment';
import { makeKnownGear } from './data/knownGear';
import type { AlgorithmSettings, AppData, AuthModelEntry, GearStats, Trailer, TrophyOptimiserSettings, VehicleOptimiserSettings, VehiclePart, VehicleProfile } from './types';

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


export const DEFAULT_VEHICLE_PROFILE: VehicleProfile = {
  name: 'Dumpster Truck',
  baseSpeed: 69,
  baseAcceleration: 1,
  baseHandling: 90,
  baseCapacityKg: 2750,
  capacityMultiplier: 1.5
};

export const DEFAULT_VEHICLE_SETTINGS: VehicleOptimiserSettings = {
  capacityWeight: 45,
  speedWeight: 30,
  accelerationWeight: 15,
  handlingWeight: 10
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


function seededVehicleParts(): VehiclePart[] {
  const now = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), baseName: '[Silver] Tractor Wheel Stack', name: '[Silver] Tractor Wheel Stack — Speed +15% / Accel +15% / Capacity +60kg', slot: 'Wheel Stack', speedPct: 15, accelerationPct: 15, handlingPct: 0, capacityKg: 60, mutation: 'Silver', favourite: true, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), baseName: 'Manta Spoiler', name: 'Manta Spoiler — Speed +26% / Accel -16%', slot: 'Spoiler', speedPct: 26, accelerationPct: -16, handlingPct: 0, capacityKg: 0, favourite: true, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), baseName: 'Caution Line Exhaust', name: 'Caution Line Exhaust — Speed +18% / Accel +18%', slot: 'Exhaust', speedPct: 18, accelerationPct: 18, handlingPct: 0, capacityKg: 0, favourite: true, createdAt: now, updatedAt: now }
  ];
}

function seededTrailers(): Trailer[] {
  const now = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), name: 'Wooden Trailer', capacityKg: 175, favourite: false, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Trailer', capacityKg: 300, favourite: false, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Long Trailer', capacityKg: 600, favourite: true, createdAt: now, updatedAt: now }
  ];
}

export const LOCKED_DEFAULT_SETTINGS: AlgorithmSettings = {
  version: '2.0',
  luckWeight: 1,
  luckBreakpoint1: 100,
  luckBreakpoint2: 150,
  luckBreakpoint3: 200,
  luckBreakpoint4: 250,
  luckMultiplier2: 0.8,
  luckMultiplier3: 0.6,
  luckMultiplier4: 0.4,
  luckMultiplier5: 0.2,
  arrowWeight: 0.8,
  arrowSweetSpot: 75,
  arrowDiminishingMultiplier: 0,
  arrowCeiling: 75,
  arrowPenaltyThreshold: 75,
  arrowOvercapPenaltyMultiplier: 0,
  npcWeight: 0,
  npcBreakpoint1: 20,
  npcBreakpoint2: 40,
  npcMultiplier2: 0.75,
  npcMultiplier3: 0.5,
  energyWeight: 0,
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
  vehicleWeight: 0,
  walkWeight: 0,
  rushWeight: 0.15,
  sunnyUptime: 0,
  nocturnalUptime: 0,
  raindropUptime: 0,
  overchargedMultiplier: 0,
  timeKeeperWeight: 0,
  gradeRerollWeight: 0
};

type ModelSeed={
  outcome:string;
  slot:'Any'|'Head'|'Back'|'Wrist';
  min?:number;
  typical?:number;
  max?:number;
  confidence:AuthModelEntry['confidence'];
  category:string;
};

const WOODEN_MODEL:ModelSeed[]=[
  {outcome:'Luck',slot:'Any',confidence:'Unknown',category:'Wooden basic — range unresolved'},
  {outcome:'Bid Recovery',slot:'Any',min:5,max:25,confidence:'Medium',category:'Wooden basic'},
  {outcome:'Bid Arrow Speed',slot:'Any',min:-60,max:-12,confidence:'Medium',category:'Wooden basic'},
  {outcome:'Bid Zone Width',slot:'Any',min:15,max:75,confidence:'Medium',category:'Wooden basic'},
  {outcome:'Energy Drink Time',slot:'Any',min:10,max:50,confidence:'Medium',category:'Wooden basic'},
  {outcome:'Tip Chance',slot:'Any',min:3,max:15,confidence:'Medium',category:'Wooden basic'},
  {outcome:'NPC Offers Bonus',slot:'Any',min:3,max:15,confidence:'Medium',category:'Wooden basic'},
  {outcome:'Walkspeed',slot:'Any',min:10,max:50,confidence:'Medium',category:'Wooden basic'},
  {outcome:'Sunny',slot:'Head',min:10,max:100,confidence:'Medium',category:'Wooden exclusive'},
  {outcome:'Nocturnal',slot:'Head',min:10,max:100,confidence:'Medium',category:'Wooden exclusive'},
  {outcome:'Overcharged',slot:'Head',min:5,max:20,confidence:'Medium',category:'Wooden exclusive'},
  {outcome:'Raindrop',slot:'Back',min:10,max:100,confidence:'Medium',category:'Wooden exclusive'},
  {outcome:'Focused',slot:'Back',confidence:'Unknown',category:'Wooden exclusive — formula/range unresolved'},
  {outcome:'Time Keeper',slot:'Wrist',min:5,max:40,confidence:'Medium',category:'Wooden exclusive'},
  {outcome:'Connected',slot:'Wrist',min:2,max:12,confidence:'Medium',category:'Wooden exclusive'}
];

const RIPPED_MODEL:ModelSeed[]=[
  {outcome:'Luck',slot:'Any',confidence:'Unknown',category:'Ripped basic — range unresolved'},
  {outcome:'Bid Recovery',slot:'Any',min:3.8,max:13,confidence:'Medium',category:'Ripped basic'},
  {outcome:'Bid Arrow Speed',slot:'Any',min:-30,max:-15,confidence:'Low',category:'Ripped basic — published band remains community/unconfirmed'},
  {outcome:'Bid Zone Width',slot:'Any',min:11,max:38,confidence:'Medium',category:'Ripped basic'},
  {outcome:'Energy Drink Time',slot:'Any',min:7,max:25,confidence:'Medium',category:'Ripped basic'},
  {outcome:'Tip Chance',slot:'Any',min:2.3,max:7.5,confidence:'Medium',category:'Ripped basic'},
  {outcome:'NPC Offers Bonus',slot:'Any',min:2.3,max:7.5,confidence:'Medium',category:'Ripped basic'},
  {outcome:'Walkspeed',slot:'Any',min:7.5,max:25,confidence:'Medium',category:'Ripped basic'},
  {outcome:'Sunny',slot:'Head',confidence:'Unknown',category:'Ripped exclusive — availability/range not yet confirmed'},
  {outcome:'Nocturnal',slot:'Head',confidence:'Unknown',category:'Ripped exclusive — availability/range not yet confirmed'},
  {outcome:'Overcharged',slot:'Head',confidence:'Unknown',category:'Ripped exclusive — availability/range not yet confirmed'},
  {outcome:'Raindrop',slot:'Back',min:8,max:50,confidence:'Medium',category:'Ripped exclusive — confirmed'},
  {outcome:'Focused',slot:'Back',confidence:'Unknown',category:'Ripped exclusive — availability/range not yet confirmed'},
  {outcome:'Time Keeper',slot:'Wrist',min:4,max:20,confidence:'Medium',category:'Ripped exclusive — confirmed'},
  {outcome:'Connected',slot:'Wrist',confidence:'Unknown',category:'Ripped exclusive — availability/range not yet confirmed'}
];

const PREMIUM_MODEL:ModelSeed[]=[
  {outcome:'Mutated Luck',slot:'Head',confidence:'High',category:'Premium perk'},
  {outcome:'Droughtbreaker',slot:'Back',confidence:'Low',category:'Premium perk'},
  {outcome:'Golden Hour',slot:'Back',confidence:'Low',category:'Premium perk'},
  {outcome:'Club Pact',slot:'Wrist',confidence:'Medium',category:'Premium perk'},
  {outcome:'Temporal Split',slot:'Wrist',confidence:'Medium',category:'Premium perk'}
];

const LIMITED_MODEL:ModelSeed[]=[
  {outcome:'Auto X-Ray',slot:'Head',min:3,max:30,confidence:'High',category:'Limited passive'},
  {outcome:'Grade Re-Roll',slot:'Head',min:5,max:25,confidence:'High',category:'Limited passive'},
  {outcome:'Luck Frenzy',slot:'Back',min:10,max:110,confidence:'Medium',category:'Limited passive'},
  {outcome:'Featherweight',slot:'Back',min:3,max:20,confidence:'High',category:'Limited passive'},
  {outcome:'Second Chance',slot:'Wrist',min:4,max:33,confidence:'High',category:'Limited passive'},
  {outcome:'Steady Hand',slot:'Wrist',min:4,max:33,confidence:'High',category:'Limited passive'}
];

function modelEntry(seed:ModelSeed,inventoryType:AuthModelEntry['certificateInventoryType'],certificateType:AuthModelEntry['certificateType']):AuthModelEntry{
  return {
    id:crypto.randomUUID(),
    certificateInventoryType:inventoryType,
    certificateType,
    slot:seed.slot,
    outcome:seed.outcome,
    category:seed.category,
    assumedLikelihoodClass:'MEDIUM',
    observedSampleCount:0,
    observedValues:[],
    min:seed.min,
    typical:seed.typical,
    max:seed.max,
    confidence:seed.confidence,
    enabled:true
  };
}

export function makeDefaultAuthModel(): AuthModelEntry[] {
  return [
    ...WOODEN_MODEL.map(seed=>modelEntry(seed,'Wooden Certificate of Authenticity','Normal Certificate of Authenticity')),
    ...RIPPED_MODEL.map(seed=>modelEntry(seed,'Ripped Certificate of Authenticity','Normal Certificate of Authenticity')),
    ...PREMIUM_MODEL.map(seed=>modelEntry(seed,'Premium Certificate of Authenticity','Premium Certificate of Authenticity')),
    ...LIMITED_MODEL.map(seed=>modelEntry(seed,'Limited Certificate of Authenticity','Limited Certificate of Authenticity'))
  ];
}

export function makeEmptyData():AppData{
  return {
    schemaVersion:11,
    gear:[],
    settings:{...LOCKED_DEFAULT_SETTINGS},
    authModel:makeDefaultAuthModel(),
    rollLog:[],
    ownedCertificates:[],
    theme:'system',
    vehicleProfile:{...DEFAULT_VEHICLE_PROFILE},
    vehicleSettings:{...DEFAULT_VEHICLE_SETTINGS},
    vehicleParts:[],
    trailers:[],
    trophies:[],
    trophySettings:structuredClone(DEFAULT_TROPHY_SETTINGS)
  };
}

export function makeInitialData(): AppData {
  return {
    schemaVersion: 11,
    gear: makeKnownGear(),
    settings: { ...LOCKED_DEFAULT_SETTINGS },
    authModel: makeDefaultAuthModel(),
    rollLog: [],
    ownedCertificates: screenshotCertificates(),
    theme: 'system',
    vehicleProfile: { ...DEFAULT_VEHICLE_PROFILE },
    vehicleSettings: { ...DEFAULT_VEHICLE_SETTINGS },
    vehicleParts: [...seededVehicleParts(),...screenshotVehicleParts()],
    trailers: seededTrailers(),
    trophies: screenshotTrophies(),
    trophySettings: structuredClone(DEFAULT_TROPHY_SETTINGS)
  };
}
