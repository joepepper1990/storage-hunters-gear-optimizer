import type { AlgorithmSettings, AppData, AuthModelEntry, GearStats } from './types';

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
    schemaVersion: 1,
    gear: [],
    settings: { ...LOCKED_DEFAULT_SETTINGS },
    authModel: makeDefaultAuthModel(),
    rollLog: [],
    theme: 'system'
  };
}
