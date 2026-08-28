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
    { mutation: 'Tiny', multiplier: 2, enabled: true, confidence: 'Confirmed' },
    { mutation: 'Huge', multiplier: 2, enabled: true, confidence: 'Uncertain' }
  ]
};


function seededVehicleParts(): VehiclePart[] {
  const now = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), name: '[Silver] Tractor Wheel Stack', slot: 'Wheel Stack', speedPct: 15, accelerationPct: 15, handlingPct: 0, capacityKg: 60, mutation: 'Silver', favourite: true, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Manta Spoiler', slot: 'Spoiler', speedPct: 26, accelerationPct: -16, handlingPct: 0, capacityKg: 0, favourite: true, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), name: 'Caution Line Exhaust', slot: 'Exhaust', speedPct: 18, accelerationPct: 18, handlingPct: 0, capacityKg: 0, favourite: true, createdAt: now, updatedAt: now }
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
  version: '1.0',
  luckWeight: 1,
  arrowWeight: 0.85,
  arrowSweetSpot: 75,
  arrowDiminishingMultiplier: 0.25,
  arrowCeiling: 80,
  arrowPenaltyThreshold: 100,
  arrowOvercapPenaltyMultiplier: 1,
  npcWeight: 0.75,
  energyWeight: 0.55,
  energyTarget: 50,
  energySecondStageMultiplier: 0.1,
  energyCeiling: 100,
  zoneWeight: 0.4,
  zoneBreakpoint1: 30,
  zoneBreakpoint2: 60,
  zoneMultiplier2: 0.75,
  zoneMultiplier3: 0.5,
  tipWeight: 0.1,
  recoveryWeight: 0.01,
  vehicleWeight: 0.01,
  walkWeight: 0.01,
  rushWeight: 0.15,
  sunnyUptime: 0.5,
  nocturnalUptime: 0.5,
  raindropUptime: 0.25,
  overchargedMultiplier: 0.5,
  timeKeeperWeight: 0,
  gradeRerollWeight: 0
};

const normalOutcomes = ['Luck', 'Bid Recovery', 'Bid Arrow Speed', 'Bid Zone Width', 'Tip Chance', 'NPC Offers Bonus', 'Walkspeed'];
const exclusive: Record<'Head' | 'Back' | 'Wrist', string[]> = {
  Head: ['Sunny', 'Nocturnal', 'Overcharged'],
  Back: ['Raindrop', 'Focused'],
  Wrist: ['Time Keeper', 'Connected']
};
const alien = ['Haggler', 'Anti-Gravity Field', 'Safecracker', 'Grade Re-Roll', 'Exhibitor', 'Rush'];

export function makeDefaultAuthModel(): AuthModelEntry[] {
  const entries: AuthModelEntry[] = [];
  for (const outcome of normalOutcomes) {
    entries.push({
      id: crypto.randomUUID(), certificateType: 'Normal Certificate of Authenticity', slot: 'Any', outcome,
      category: 'Normal numeric', assumedLikelihoodClass: 'HIGH', observedSampleCount: 0, observedValues: [], confidence: 'Unknown', enabled: true
    });
  }
  for (const [slot, outcomes] of Object.entries(exclusive) as Array<['Head' | 'Back' | 'Wrist', string[]]>) {
    for (const outcome of outcomes) entries.push({
      id: crypto.randomUUID(), certificateType: 'Normal Certificate of Authenticity', slot, outcome,
      category: 'Slot-exclusive', assumedLikelihoodClass: 'LOW', observedSampleCount: 0, observedValues: [], confidence: 'Unknown', enabled: true
    });
  }
  for (const outcome of alien) entries.push({
    id: crypto.randomUUID(), certificateType: 'Certificate of Alienticity', slot: 'Any', outcome,
    category: 'Alien', assumedLikelihoodClass: 'MEDIUM', observedSampleCount: 0, observedValues: [], confidence: 'Unknown', enabled: true
  });
  return entries;
}

export function makeInitialData(): AppData {
  return {
    schemaVersion: 3,
    gear: [],
    settings: { ...LOCKED_DEFAULT_SETTINGS },
    authModel: makeDefaultAuthModel(),
    rollLog: [],
    theme: 'system',
    vehicleProfile: { ...DEFAULT_VEHICLE_PROFILE },
    vehicleSettings: { ...DEFAULT_VEHICLE_SETTINGS },
    vehicleParts: seededVehicleParts(),
    trailers: seededTrailers(),
    trophies: [],
    trophySettings: structuredClone(DEFAULT_TROPHY_SETTINGS)
  };
}
