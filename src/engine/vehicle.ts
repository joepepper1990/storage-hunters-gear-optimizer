import type {
  Trailer,
  VehicleCombinationResult,
  VehicleFinalStats,
  VehicleItemAnalysis,
  VehicleOptimiserSettings,
  VehiclePart,
  VehiclePartSlot,
  VehicleProfile
} from '../types';

export function calculateVehicleStats(
  profile: VehicleProfile,
  parts: Array<VehiclePart | null>,
  trailer: Trailer | null
): VehicleFinalStats {
  const speedBonusPct = sum(parts, 'speedPct');
  const accelerationBonusPct = sum(parts, 'accelerationPct');
  const handlingBonusPct = sum(parts, 'handlingPct');
  const flatCapacityBonusKg = sum(parts, 'capacityKg');
  const trailerCapacityKg = trailer?.capacityKg ?? 0;

  const speedExact = profile.baseSpeed * (1 + speedBonusPct / 100);
  const acceleration = profile.baseAcceleration * (1 + accelerationBonusPct / 100);
  const handlingExact = profile.baseHandling * (1 + handlingBonusPct / 100);
  const capacityKg = (profile.baseCapacityKg + trailerCapacityKg) * profile.capacityMultiplier + flatCapacityBonusKg;
  const baselineCapacity = profile.baseCapacityKg * profile.capacityMultiplier;
  const capacityImprovementPct = baselineCapacity === 0 ? 0 : ((capacityKg - baselineCapacity) / baselineCapacity) * 100;

  return {
    speedExact,
    speedDisplay: Math.round(speedExact),
    acceleration,
    handlingExact,
    handlingDisplay: Math.round(handlingExact),
    capacityKg,
    speedBonusPct,
    accelerationBonusPct,
    handlingBonusPct,
    flatCapacityBonusKg,
    trailerCapacityKg,
    capacityImprovementPct
  };
}

export function scoreVehicleStats(stats: VehicleFinalStats, settings: VehicleOptimiserSettings) {
  const totalWeight = Math.max(0, settings.speedWeight) + Math.max(0, settings.accelerationWeight) + Math.max(0, settings.handlingWeight) + Math.max(0, settings.capacityWeight);
  const unit = totalWeight > 0 ? 1 / totalWeight : 0;
  const scoreComponents = {
    speed: stats.speedBonusPct * Math.max(0, settings.speedWeight) * unit,
    acceleration: stats.accelerationBonusPct * Math.max(0, settings.accelerationWeight) * unit,
    handling: stats.handlingBonusPct * Math.max(0, settings.handlingWeight) * unit,
    capacity: stats.capacityImprovementPct * Math.max(0, settings.capacityWeight) * unit
  };
  return { score: scoreComponents.speed + scoreComponents.acceleration + scoreComponents.handling + scoreComponents.capacity, scoreComponents };
}

export function optimiseVehicle(
  parts: VehiclePart[],
  trailers: Trailer[],
  profile: VehicleProfile,
  settings: VehicleOptimiserSettings,
  limit = 100
): VehicleCombinationResult[] {
  const spoilers = options(parts, 'Spoiler');
  const exhausts = options(parts, 'Exhaust');
  const wheels = options(parts, 'Wheel Stack');
  const trailerOptions: Array<Trailer | null> = [null, ...trailers];
  const results: VehicleCombinationResult[] = [];

  for (const spoiler of spoilers) for (const exhaust of exhausts) for (const wheelStack of wheels) for (const trailer of trailerOptions) {
    const stats = calculateVehicleStats(profile, [spoiler, exhaust, wheelStack], trailer);
    const { score, scoreComponents } = scoreVehicleStats(stats, settings);
    results.push({ spoiler, exhaust, wheelStack, trailer, stats, score, scoreComponents });
  }

  results.sort(compareVehicleResults);
  return results.slice(0, Math.max(1, limit));
}

export function specialistVehicleLoadout(
  parts: VehiclePart[],
  trailers: Trailer[],
  profile: VehicleProfile,
  settings: VehicleOptimiserSettings,
  metric: 'speed' | 'acceleration' | 'handling' | 'capacity'
): VehicleCombinationResult | undefined {
  const all = optimiseVehicle(parts, trailers, profile, settings, Number.MAX_SAFE_INTEGER);
  const value = (r: VehicleCombinationResult) => metric === 'speed' ? r.stats.speedExact : metric === 'acceleration' ? r.stats.acceleration : metric === 'handling' ? r.stats.handlingExact : r.stats.capacityKg;
  return all.sort((a, b) => value(b) - value(a) || b.score - a.score)[0];
}

export function analyseVehicleParts(parts: VehiclePart[], best: VehicleCombinationResult | undefined): VehicleItemAnalysis[] {
  const equipped = new Set([best?.spoiler?.id, best?.exhaust?.id, best?.wheelStack?.id].filter(Boolean));
  return parts.map(item => {
    if (equipped.has(item.id)) return { item, verdict: 'EQUIP', reason: 'Part of the current highest-scoring vehicle setup.' };
    const domination = findPartDominator(item, parts.filter(p => p.slot === item.slot && p.id !== item.id));
    if (domination) return {
      item,
      verdict: 'SAFE TO DISCARD',
      dominator: domination,
      reason: `${domination.name} is at least as good for Speed, Acceleration, Handling and Capacity, and strictly better in at least one modifier.`
    };
    if (isDominatedByEmpty(item)) return {
      item,
      verdict: 'SAFE TO DISCARD',
      reason: 'Leaving this slot empty is at least as good across every performance modifier and strictly better in at least one.'
    };
    return { item, verdict: 'KEEP', reason: 'No same-slot part weakly dominates every performance modifier. It can still be useful in a different Speed / Acceleration / Capacity trade-off.' };
  });
}

export function analyseTrailers(trailers: Trailer[], best: VehicleCombinationResult | undefined) {
  return trailers.map(item => {
    if (best?.trailer?.id === item.id) return { item, verdict: 'EQUIP' as const, reason: 'Trailer in the current highest-scoring vehicle setup.' };
    const dominator = trailers.find(other => other.id !== item.id && other.capacityKg > item.capacityKg);
    if (dominator) return { item, verdict: 'SAFE TO DISCARD' as const, dominator, reason: `${dominator.name} provides more trailer capacity with no documented performance downside.` };
    if (item.capacityKg < 0) return { item, verdict: 'SAFE TO DISCARD' as const, reason: 'Leaving the trailer slot empty gives more usable capacity.' };
    return { item, verdict: 'KEEP' as const, reason: 'No owned trailer has strictly more documented capacity.' };
  });
}

export function vehicleCombinationCount(parts: VehiclePart[], trailers: Trailer[]) {
  return (parts.filter(p => p.slot === 'Spoiler').length + 1)
    * (parts.filter(p => p.slot === 'Exhaust').length + 1)
    * (parts.filter(p => p.slot === 'Wheel Stack').length + 1)
    * (trailers.length + 1);
}

function options(parts: VehiclePart[], slot: VehiclePartSlot): Array<VehiclePart | null> { return [null, ...parts.filter(p => p.slot === slot)]; }
function sum(parts: Array<VehiclePart | null>, key: 'speedPct' | 'accelerationPct' | 'handlingPct' | 'capacityKg') { return parts.reduce((total, part) => total + (part?.[key] ?? 0), 0); }
function findPartDominator(item: VehiclePart, candidates: VehiclePart[]) { return candidates.find(other => dominatesPart(other, item)); }
function dominatesPart(a: VehiclePart, b: VehiclePart) {
  const valuesA = [a.speedPct, a.accelerationPct, a.handlingPct, a.capacityKg];
  const valuesB = [b.speedPct, b.accelerationPct, b.handlingPct, b.capacityKg];
  return valuesA.every((v, i) => v >= valuesB[i]) && valuesA.some((v, i) => v > valuesB[i]);
}
function isDominatedByEmpty(item: VehiclePart) {
  const values = [item.speedPct, item.accelerationPct, item.handlingPct, item.capacityKg];
  return values.every(v => v <= 0) && values.some(v => v < 0);
}
function compareVehicleResults(a: VehicleCombinationResult, b: VehicleCombinationResult) {
  return b.score - a.score
    || b.stats.capacityKg - a.stats.capacityKg
    || b.stats.speedExact - a.stats.speedExact
    || b.stats.acceleration - a.stats.acceleration;
}
