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

export function luckEffective(l: number, s: AlgorithmSettings): number {
  if (l <= s.luckBreakpoint1) return l;
  if (l <= s.luckBreakpoint2) return s.luckBreakpoint1 + (l - s.luckBreakpoint1) * s.luckMultiplier2;
  const at2 = s.luckBreakpoint1 + (s.luckBreakpoint2 - s.luckBreakpoint1) * s.luckMultiplier2;
  if (l <= s.luckBreakpoint3) return at2 + (l - s.luckBreakpoint2) * s.luckMultiplier3;
  const at3 = at2 + (s.luckBreakpoint3 - s.luckBreakpoint2) * s.luckMultiplier3;
  if (l <= s.luckBreakpoint4) return at3 + (l - s.luckBreakpoint3) * s.luckMultiplier4;
  const at4 = at3 + (s.luckBreakpoint4 - s.luckBreakpoint3) * s.luckMultiplier4;
  return at4 + (l - s.luckBreakpoint4) * s.luckMultiplier5;
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

export function expectedConditionalLuck(item: GearItem, s: AlgorithmSettings): number {
  if (!item.authenticated || item.authentication.kind === 'None') return 0;
  const effect = item.authentication.effect.trim();
  const value = finite(item.authentication.value);
  if (effect === 'Sunny') return value * s.sunnyUptime;
  if (effect === 'Nocturnal') return value * s.nocturnalUptime;
  if (effect === 'Raindrop') return value * s.raindropUptime;
  if (effect === 'Overcharged') return value * s.overchargedMultiplier;
  return 0;
}

function conditionalLuckLabel(item: GearItem, s: AlgorithmSettings): string | undefined {
  const expected = expectedConditionalLuck(item, s);
  if (!expected) return undefined;
  const effect = item.authentication.effect.trim();
  const value = finite(item.authentication.value);
  const multiplier = value ? expected / value : 0;
  const suffix = effect === 'Overcharged' ? 'theoretical extra Luck' : 'Luck';
  return `${effect}: ${value}% ${suffix} × ${Math.round(multiplier * 100)}%`;
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
  if (['Sunny', 'Nocturnal', 'Raindrop', 'Overcharged'].includes(effect)) {
    // Conditional Luck is scored at combination level so it passes through the same
    // diminishing-return curve as ordinary Luck and can interact correctly with other gear.
    return { score: 0, details: [], unknown: false, provisional: false };
  }
  if (UNKNOWN_PROTECTED_PASSIVES.has(effect)) {
    return { score: 0, details: [{ label: `${effect} (unknown/protected)`, score: 0 }], unknown: true, provisional: false };
  }
  if (effect === 'Rush') return { score: value * s.rushWeight, details: [{ label: `Rush ${value}%`, score: value * s.rushWeight }], unknown: false, provisional: false };
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

export function scoreItemOrCombination(stats: GearStats, items: GearItem[], s: AlgorithmSettings): ScoreBreakdown {
  const core = scoreCore(stats, s);
  const passives = items.map(i => passiveScore(i, s));
  const conditional = items
    .map(item => ({ item, expectedLuck: expectedConditionalLuck(item, s), label: conditionalLuckLabel(item, s) }))
    .filter(x => x.expectedLuck !== 0 && x.label);
  const totalExpectedLuck = conditional.reduce((sum, x) => sum + x.expectedLuck, 0);
  const conditionalLuckScore = (
    luckEffective(finite(stats.luck) + totalExpectedLuck, s) - luckEffective(finite(stats.luck), s)
  ) * s.luckWeight;
  const ordinaryPassive = passives.reduce((sum, p) => sum + p.score, 0);
  const passive = ordinaryPassive + conditionalLuckScore;
  const conditionalDetails = conditional.map(x => ({
    label: x.label!,
    score: totalExpectedLuck === 0 ? 0 : conditionalLuckScore * (x.expectedLuck / totalExpectedLuck)
  }));
  return {
    ...core,
    passive,
    total: core.core + passive,
    passiveDetails: [...passives.flatMap(p => p.details), ...conditionalDetails],
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
    case 'Energy Drink Time': stats.energy += value; break;
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
