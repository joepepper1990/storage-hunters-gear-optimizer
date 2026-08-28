import type { AlgorithmSettings, GearItem, GearStats, ScoreBreakdown } from '../types';

export const EVENT_PASSIVES = new Set([
  'Fossil Finder', 'Luck Frenzy', 'Auto X-Ray', 'Featherweight', 'Second Chance', 'Steady Hand'
]);
export const UNKNOWN_PROTECTED_PASSIVES = new Set(['Haggler', 'Anti-Gravity Field', 'Safecracker', 'Exhibitor']);
export const PROVISIONAL_PASSIVES = new Set(['Time Keeper', 'Grade Re-Roll']);

export function arrowEffective(r: number, s: AlgorithmSettings): number {
  if (r <= s.arrowSweetSpot) return r;
  const plateau = s.arrowSweetSpot + (s.arrowCeiling - s.arrowSweetSpot) * s.arrowDiminishingMultiplier;
  if (r <= s.arrowCeiling) return s.arrowSweetSpot + (r - s.arrowSweetSpot) * s.arrowDiminishingMultiplier;
  if (r <= s.arrowPenaltyThreshold) return plateau;
  return plateau - (r - s.arrowPenaltyThreshold) * s.arrowOvercapPenaltyMultiplier;
}

export function energyEffective(e: number, s: AlgorithmSettings): number {
  if (e <= s.energyTarget) return e;
  if (e <= s.energyCeiling) return s.energyTarget + (e - s.energyTarget) * s.energySecondStageMultiplier;
  return s.energyTarget + (s.energyCeiling - s.energyTarget) * s.energySecondStageMultiplier;
}

export function zoneEffective(z: number, s: AlgorithmSettings): number {
  if (z <= s.zoneBreakpoint1) return z;
  if (z <= s.zoneBreakpoint2) return s.zoneBreakpoint1 + (z - s.zoneBreakpoint1) * s.zoneMultiplier2;
  const second = (s.zoneBreakpoint2 - s.zoneBreakpoint1) * s.zoneMultiplier2;
  return s.zoneBreakpoint1 + second + (z - s.zoneBreakpoint2) * s.zoneMultiplier3;
}

export function scoreCore(stats: GearStats, s: AlgorithmSettings): Omit<ScoreBreakdown, 'passive' | 'total' | 'passiveDetails' | 'hasUnknownProtectedPassive' | 'hasProvisionalPassive'> {
  const luck = finite(stats.luck) * s.luckWeight;
  const arrow = arrowEffective(finite(stats.arrowReduction), s) * s.arrowWeight;
  const npc = finite(stats.npc) * s.npcWeight;
  const energy = energyEffective(finite(stats.energy), s) * s.energyWeight;
  const zone = zoneEffective(finite(stats.zone), s) * s.zoneWeight;
  const tip = finite(stats.tip) * s.tipWeight;
  const recovery = finite(stats.recovery) * s.recoveryWeight;
  const vehicle = finite(stats.vehicle) * s.vehicleWeight;
  const walk = finite(stats.walk) * s.walkWeight;
  const core = luck + arrow + npc + energy + zone + tip + recovery + vehicle + walk;
  return { core, luck, arrow, npc, energy, zone, tip, recovery, vehicle, walk };
}

export function passiveScore(item: GearItem, s: AlgorithmSettings) {
  const effect = item.authentication.effect.trim();
  const value = finite(item.authentication.value);
  if (!item.authenticated || item.authentication.kind === 'None' || !effect) {
    return { score: 0, details: [], unknown: false, provisional: false };
  }
  if (EVENT_PASSIVES.has(effect) || effect === 'Focused' || effect === 'Connected' || isNumericAuth(effect)) {
    return { score: 0, details: [], unknown: false, provisional: false };
  }
  if (UNKNOWN_PROTECTED_PASSIVES.has(effect)) {
    return { score: 0, details: [{ label: `${effect} (unknown/protected)`, score: 0 }], unknown: true, provisional: false };
  }
  if (effect === 'Rush') return { score: value * s.rushWeight, details: [{ label: `Rush ${value}%`, score: value * s.rushWeight }], unknown: false, provisional: false };
  if (effect === 'Sunny') return conditionalLuck(effect, value, s.sunnyUptime, s);
  if (effect === 'Nocturnal') return conditionalLuck(effect, value, s.nocturnalUptime, s);
  if (effect === 'Raindrop') return conditionalLuck(effect, value, s.raindropUptime, s);
  if (effect === 'Overcharged') return conditionalLuck(effect, value, s.overchargedMultiplier, s, 'theoretical extra Luck');
  if (effect === 'Time Keeper') {
    const score = value * s.timeKeeperWeight;
    return { score, details: [{ label: `Time Keeper (provisional)`, score, provisional: true }], unknown: false, provisional: true };
  }
  if (effect === 'Grade Re-Roll') {
    const score = value * s.gradeRerollWeight;
    return { score, details: [{ label: `Grade Re-Roll (provisional)`, score, provisional: true }], unknown: false, provisional: true };
  }
  return { score: 0, details: [{ label: `${effect} (unmodelled/protected)`, score: 0 }], unknown: true, provisional: false };
}

function conditionalLuck(label: string, value: number, uptime: number, s: AlgorithmSettings, suffix = 'Luck') {
  const score = value * uptime * s.luckWeight;
  return { score, details: [{ label: `${label}: ${value}% ${suffix} × ${Math.round(uptime * 100)}%`, score }], unknown: false, provisional: false };
}

export function scoreItemOrCombination(stats: GearStats, items: GearItem[], s: AlgorithmSettings): ScoreBreakdown {
  const core = scoreCore(stats, s);
  const passives = items.map(i => passiveScore(i, s));
  const passive = passives.reduce((sum, p) => sum + p.score, 0);
  return {
    ...core,
    passive,
    total: core.core + passive,
    passiveDetails: passives.flatMap(p => p.details),
    hasUnknownProtectedPassive: passives.some(p => p.unknown),
    hasProvisionalPassive: passives.some(p => p.provisional)
  };
}

export function effectiveItemStats(item: GearItem): GearStats {
  const stats: GearStats = { ...item.stats };
  if (!item.authenticated || item.authentication.kind === 'None' || !isNumericAuth(item.authentication.effect)) return stats;
  const value = finite(item.authentication.value);
  switch (item.authentication.effect) {
    case 'Luck': stats.luck += value; break;
    case 'Bid Recovery': stats.recovery += value; break;
    case 'Bid Arrow Speed': stats.arrowReduction += -value; break;
    case 'Bid Zone Width': stats.zone += value; break;
    case 'Tip Chance': stats.tip += value; break;
    case 'NPC Offers Bonus': stats.npc += value; break;
    case 'Walkspeed': stats.walk += value; break;
  }
  return stats;
}

export function combineStats(items: GearItem[]): GearStats {
  return items.reduce<GearStats>((a, i) => {
    const stats = effectiveItemStats(i);
    return {
      luck: a.luck + finite(stats.luck),
      energy: a.energy + finite(stats.energy),
      tip: a.tip + finite(stats.tip),
      walk: a.walk + finite(stats.walk),
      vehicle: a.vehicle + finite(stats.vehicle),
      recovery: a.recovery + finite(stats.recovery),
      zone: a.zone + finite(stats.zone),
      arrowReduction: a.arrowReduction + finite(stats.arrowReduction),
      npc: a.npc + finite(stats.npc)
    };
  }, { luck: 0, energy: 0, tip: 0, walk: 0, vehicle: 0, recovery: 0, zone: 0, arrowReduction: 0, npc: 0 });
}

export function scoreStandalone(item: GearItem, s: AlgorithmSettings): ScoreBreakdown {
  return scoreItemOrCombination(effectiveItemStats(item), [item], s);
}

export function gameArrowToReduction(gameDisplayed: number): number { return gameDisplayed === 0 ? 0 : -gameDisplayed; }
export function reductionToGameArrow(reduction: number): number { return reduction === 0 ? 0 : -reduction; }

export function isNumericAuth(effect: string): boolean {
  return new Set(['Luck', 'Bid Recovery', 'Bid Arrow Speed', 'Bid Zone Width', 'Tip Chance', 'NPC Offers Bonus', 'Walkspeed']).has(effect);
}

export function finite(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
