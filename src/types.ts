export type Slot = 'Head' | 'Back' | 'Wrist';
export type AuthKind = 'None' | 'Normal' | 'Alien';
export type ThemeMode = 'system' | 'light' | 'dark';
export type Verdict = 'EQUIP' | 'KEEP' | 'SAFE TO DISCARD' | 'PROTECTED / UNKNOWN';
export type LikelihoodClass = 'VERY HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY LOW';
export type Confidence = 'Unknown' | 'Low' | 'Medium' | 'High' | 'Empirical';

export type VehiclePartSlot = 'Spoiler' | 'Exhaust' | 'Wheel Stack';
export type VehicleVerdict = 'EQUIP' | 'KEEP' | 'SAFE TO DISCARD';

export interface TrophyModifier {
  mutation: string;
  boostPct: number;
}

export interface GavelTrophy {
  id: string;
  name: string;
  modifiers: TrophyModifier[];
  favourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrophyMutationWeight {
  mutation: string;
  multiplier: number;
  enabled: boolean;
  confidence: 'Confirmed' | 'Community' | 'Uncertain';
}

export interface TrophyOptimiserSettings {
  maxActive: number;
  mutationWeights: TrophyMutationWeight[];
}

export interface TrophyCombinationResult {
  trophies: GavelTrophy[];
  score: number;
  totalBoosts: Record<string, number>;
  weightedContributions: Record<string, number>;
}

export interface VehiclePart {
  id: string;
  baseName: string;
  name: string;
  slot: VehiclePartSlot;
  speedPct: number;
  accelerationPct: number;
  handlingPct: number;
  capacityKg: number;
  mutation?: string;
  rarity?: string;
  favourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Trailer {
  id: string;
  name: string;
  capacityKg: number;
  favourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleProfile {
  name: string;
  baseSpeed: number;
  baseAcceleration: number;
  baseHandling: number;
  baseCapacityKg: number;
  capacityMultiplier: number;
}

export interface VehicleOptimiserSettings {
  speedWeight: number;
  accelerationWeight: number;
  handlingWeight: number;
  capacityWeight: number;
}

export interface VehicleFinalStats {
  speedExact: number;
  speedDisplay: number;
  acceleration: number;
  handlingExact: number;
  handlingDisplay: number;
  capacityKg: number;
  speedBonusPct: number;
  accelerationBonusPct: number;
  handlingBonusPct: number;
  flatCapacityBonusKg: number;
  trailerCapacityKg: number;
  capacityImprovementPct: number;
}

export interface VehicleCombinationResult {
  spoiler: VehiclePart | null;
  exhaust: VehiclePart | null;
  wheelStack: VehiclePart | null;
  trailer: Trailer | null;
  stats: VehicleFinalStats;
  score: number;
  scoreComponents: { speed: number; acceleration: number; handling: number; capacity: number };
}

export interface VehicleItemAnalysis {
  item: VehiclePart;
  verdict: VehicleVerdict;
  reason: string;
  dominator?: VehiclePart;
}

export interface GearStats {
  luck: number;
  energy: number;
  tip: number;
  walk: number;
  vehicle: number;
  recovery: number;
  zone: number;
  arrowReduction: number;
  npc: number;
}

export interface Authentication {
  kind: AuthKind;
  effect: string;
  value: number;
  secondaryValue?: number;
  notes?: string;
}

export interface GearItem {
  id: string;
  baseName: string;
  name: string;
  slot: Slot;
  stats: GearStats;
  authenticated: boolean;
  authentication: Authentication;
  favourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlgorithmSettings {
  version: '1.1';
  luckWeight: number;
  luckBreakpoint1: number;
  luckBreakpoint2: number;
  luckBreakpoint3: number;
  luckBreakpoint4: number;
  luckMultiplier2: number;
  luckMultiplier3: number;
  luckMultiplier4: number;
  luckMultiplier5: number;
  arrowWeight: number;
  arrowSweetSpot: number;
  arrowDiminishingMultiplier: number;
  arrowCeiling: number;
  arrowPenaltyThreshold: number;
  arrowOvercapPenaltyMultiplier: number;
  npcWeight: number;
  npcBreakpoint1: number;
  npcBreakpoint2: number;
  npcMultiplier2: number;
  npcMultiplier3: number;
  energyWeight: number;
  energyTarget: number;
  energySecondStageMultiplier: number;
  energyCeiling: number;
  zoneWeight: number;
  zoneBreakpoint1: number;
  zoneBreakpoint2: number;
  zoneMultiplier2: number;
  zoneMultiplier3: number;
  tipWeight: number;
  recoveryWeight: number;
  vehicleWeight: number;
  walkWeight: number;
  rushWeight: number;
  sunnyUptime: number;
  nocturnalUptime: number;
  raindropUptime: number;
  overchargedMultiplier: number;
  timeKeeperWeight: number;
  gradeRerollWeight: number;
}

export interface ScoreBreakdown {
  core: number;
  passive: number;
  total: number;
  luck: number;
  arrow: number;
  npc: number;
  energy: number;
  zone: number;
  tip: number;
  recovery: number;
  vehicle: number;
  walk: number;
  passiveDetails: Array<{ label: string; score: number; provisional?: boolean }>;
  hasUnknownProtectedPassive: boolean;
  hasProvisionalPassive: boolean;
}

export interface CombinedStats extends GearStats {}

export interface CombinationResult {
  head: GearItem;
  back: GearItem;
  wrist: GearItem;
  stats: CombinedStats;
  score: ScoreBreakdown;
  wastedArrow: number;
  penalisedArrow: number;
  wastedEnergy: number;
}

export interface DominanceResult {
  dominated: boolean;
  dominator?: GearItem;
  worstCaseAdvantage?: number;
  reason: string;
  provisionalSensitive?: boolean;
}

export interface ItemAnalysis {
  item: GearItem;
  verdict: Verdict;
  reason: string;
  standalone: ScoreBreakdown;
  dominance?: DominanceResult;
  currentlyEquipped: boolean;
}

export interface AuthModelEntry {
  id: string;
  certificateType: 'Normal Certificate of Authenticity' | 'Certificate of Alienticity';
  slot: Slot | 'Any';
  outcome: string;
  category: string;
  assumedLikelihoodClass: LikelihoodClass;
  observedSampleCount: number;
  observedValues: number[];
  min?: number;
  typical?: number;
  max?: number;
  confidence: Confidence;
  enabled: boolean;
}

export interface CertificateRollLog {
  id: string;
  date: string;
  certificateType: AuthModelEntry['certificateType'];
  itemId: string;
  itemName: string;
  slot: Slot;
  previousAuthentication: string;
  previousValue: number;
  newAuthentication: string;
  newValue: number;
  improvedBestSet: boolean;
  bestScoreBefore: number;
  bestScoreAfter: number;
}

export interface CertificateTarget {
  item: GearItem;
  action: 'AUTHENTICATE' | 'RE-AUTHENTICATE';
  heuristicScore: number;
  likelihood: LikelihoodClass;
  currentAuthMarginalValue: number;
  gapWithoutCurrentAuth: number;
  outcomeThresholds: Array<{ outcome: string; minimumRoll?: number; unit?: string; note?: string }>;
  reasons: string[];
}

export interface AppData {
  schemaVersion: 4;
  gear: GearItem[];
  settings: AlgorithmSettings;
  authModel: AuthModelEntry[];
  rollLog: CertificateRollLog[];
  theme: ThemeMode;
  vehicleProfile: VehicleProfile;
  vehicleSettings: VehicleOptimiserSettings;
  vehicleParts: VehiclePart[];
  trailers: Trailer[];
  trophies: GavelTrophy[];
  trophySettings: TrophyOptimiserSettings;
}
