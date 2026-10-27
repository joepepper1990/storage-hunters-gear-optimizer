import type { AlgorithmSettings, GearItem, GearStats, ScoreBreakdown } from '../types';
import { effectKnowledge } from './effects';

/** Upper edge of the ideal combined Bid Arrow band. Display only: value is already flat above the sweet spot. */
export const ARROW_TARGET_MAX = 85;

/** The band of combined Bid Arrow reduction that is equally ideal for Main Auction. */
export function arrowTargetBand(s: AlgorithmSettings): { min: number; max: number } {
  return { min: s.arrowSweetSpot, max: Math.max(s.arrowSweetSpot, ARROW_TARGET_MAX) };
}

export function arrowEffective(r: number, s: AlgorithmSettings): number {
  // User preference: value rises up to 65% combined reduction, then every value from
  // 65% through 85% is equally ideal. Beyond 85% adds nothing; no game penalty is invented.
  if (r < 0) return r;
  return Math.min(r, s.arrowSweetSpot);
}

export function luckEffective(l: number, _s: AlgorithmSettings): number {
  // No published game formula justifies diminishing displayed Luck in the optimiser.
  // Keep displayed Luck linear and never present this as hidden mutation/drop probability.
  return l;
}

export function npcEffective(n: number, s: AlgorithmSettings): number {
  if (n <= s.npcBreakpoint1) return n;
  if (n <= s.npcBreakpoint2) return s.npcBreakpoint1 + (n - s.npcBreakpoint1) * s.npcMultiplier2;
  const at2 = s.npcBreakpoint1 + (s.npcBreakpoint2 - s.npcBreakpoint1) * s.npcMultiplier2;
  return at2 + (n - s.npcBreakpoint2) * s.npcMultiplier3;
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
  const luck = luckEffective(finite(stats.luck), s) * s.luckWeight;
  const arrow = arrowEffective(finite(stats.arrowReduction), s) * s.arrowWeight;
  const npc = npcEffective(finite(stats.npc), s) * s.npcWeight;
  const energy = energyEffective(finite(stats.energy), s) * s.energyWeight;
  const zone = zoneEffective(finite(stats.zone), s) * s.zoneWeight;
  const tip = finite(stats.tip) * s.tipWeight;
  const recovery = finite(stats.recovery) * s.recoveryWeight;
  const vehicle = finite(stats.vehicle) * s.vehicleWeight;
  const walk = finite(stats.walk) * s.walkWeight;
  const core = luck + arrow + npc + energy + zone + tip + recovery + vehicle + walk;
  return { core, luck, arrow, npc, energy, zone, tip, recovery, vehicle, walk };
}

export function passiveScore(item: GearItem, _s: AlgorithmSettings) {
  const effect = item.authentication.effect.trim();
  if (!item.authenticated || item.authentication.kind === 'None' || !effect) {
    return { score: 0, details: [], unknown: false, provisional: false };
  }
  // Static passives carry no score of their own; loadout/certificate engines value
  // them. Unknown effects stay protected whatever the authentication kind.
  if (effectKnowledge(effect) === 'unknown') {
    return { score: 0, details: [{ label: `${effect} (unmodelled/protected)`, score: 0 }], unknown: true, provisional: false };
  }
  return { score: 0, details: [], unknown: false, provisional: false };
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
  if (!item.authenticated || item.authentication.kind === 'None') return stats;
  if (isNumericAuth(item.authentication.effect)) {
    const value = finite(item.authentication.value);
    switch (item.authentication.effect) {
      case 'Luck': stats.luck += value; break;
      case 'Bid Recovery': stats.recovery += value; break;
      case 'Bid Arrow Speed': stats.arrowReduction += -value; break;
      case 'Bid Zone Width': stats.zone += value; break;
      case 'Energy Drink Time': stats.energy += value; break;
      case 'Tip Chance': stats.tip += value; break;
      case 'NPC Offers Bonus': stats.npc += value; break;
      case 'Walkspeed': stats.walk += value; break;
    }
  }
  for (const [key,delta] of Object.entries(item.authentication.statDeltas ?? {}) as Array<[keyof GearStats, number]>) {
    stats[key] += finite(delta);
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
  }, { luck: 0, energy: 0,tip: 0, walk: 0, vehicle: 0, recovery: 0, zone: 0, arrowReduction: 0, npc: 0 });
}

export function scoreStandalone(item: GearItem, s: AlgorithmSettings): ScoreBreakdown {
  return scoreItemOrCombination(effectiveItemStats(item), [item], s);
}

export function gameArrowToReduction(gameDisplayed: number): number { return gameDisplayed === 0 ? 0 : -gameDisplayed; }
export function reductionToGameArrow(reduction: number): number { return reduction === 0 ? 0 : -reduction; }

export function isNumericAuth(effect: string): boolean {
  return new Set(['Luck', 'Bid Recovery', 'Bid Arrow Speed', 'Bid Zone Width', 'Energy Drink Time', 'Tip Chance', 'NPC Offers Bonus', 'Walkspeed']).has(effect);
}

export function finite(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
