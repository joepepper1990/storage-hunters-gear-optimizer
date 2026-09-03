import type { AlgorithmSettings, DominanceResult, GearItem, GearStats } from '../types';
import { arrowEffective, effectiveItemStats, energyEffective, expectedConditionalLuck, isNumericAuth, luckEffective, npcEffective, passiveScore, zoneEffective } from './scoring';

interface PiecewiseSpec { breakpoints: number[]; fn: (x: number) => number; }

export function pairWorstCaseAdvantage(a: GearItem, b: GearItem, s: AlgorithmSettings): number {
  const ae = effectiveItemStats(a), be = effectiveItemStats(b);
  const linear =
    (ae.tip - be.tip) * s.tipWeight +
    (ae.recovery - be.recovery) * s.recoveryWeight +
    (ae.vehicle - be.vehicle) * s.vehicleWeight +
    (ae.walk - be.walk) * s.walkWeight;

  const luck = minDifference(ae.luck + expectedConditionalLuck(a, s), be.luck + expectedConditionalLuck(b, s), {
    breakpoints: [s.luckBreakpoint1, s.luckBreakpoint2, s.luckBreakpoint3, s.luckBreakpoint4], fn: x => luckEffective(x, s) * s.luckWeight
  });
  const npc = minDifference(ae.npc, be.npc, {
    breakpoints: [s.npcBreakpoint1, s.npcBreakpoint2], fn: x => npcEffective(x, s) * s.npcWeight
  });
  const arrow = minDifference(ae.arrowReduction, be.arrowReduction, {
    breakpoints: [s.arrowSweetSpot, s.arrowCeiling, s.arrowPenaltyThreshold], fn: x => arrowEffective(x, s) * s.arrowWeight
  });
  const energy = minDifference(ae.energy, be.energy, {
    breakpoints: [s.energyTarget, s.energyCeiling], fn: x => energyEffective(x, s) * s.energyWeight
  });
  const zone = minDifference(ae.zone, be.zone, {
    breakpoints: [s.zoneBreakpoint1, s.zoneBreakpoint2], fn: x => zoneEffective(x, s) * s.zoneWeight
  });
  const passive = passiveScore(a, s).score - passiveScore(b, s).score;
  return linear + luck + npc + arrow + energy + zone + passive;
}

export function pairBestCaseAdvantage(a: GearItem, b: GearItem, s: AlgorithmSettings): number {
  const ae = effectiveItemStats(a), be = effectiveItemStats(b);
  const linear =
    (ae.tip - be.tip) * s.tipWeight +
    (ae.recovery - be.recovery) * s.recoveryWeight +
    (ae.vehicle - be.vehicle) * s.vehicleWeight +
    (ae.walk - be.walk) * s.walkWeight;
  const luck = maxDifference(ae.luck + expectedConditionalLuck(a, s), be.luck + expectedConditionalLuck(b, s), { breakpoints: [s.luckBreakpoint1, s.luckBreakpoint2, s.luckBreakpoint3, s.luckBreakpoint4], fn: x => luckEffective(x, s) * s.luckWeight });
  const npc = maxDifference(ae.npc, be.npc, { breakpoints: [s.npcBreakpoint1, s.npcBreakpoint2], fn: x => npcEffective(x, s) * s.npcWeight });
  const arrow = maxDifference(ae.arrowReduction, be.arrowReduction, { breakpoints: [s.arrowSweetSpot, s.arrowCeiling, s.arrowPenaltyThreshold], fn: x => arrowEffective(x, s) * s.arrowWeight });
  const energy = maxDifference(ae.energy, be.energy, { breakpoints: [s.energyTarget, s.energyCeiling], fn: x => energyEffective(x, s) * s.energyWeight });
  const zone = maxDifference(ae.zone, be.zone, { breakpoints: [s.zoneBreakpoint1, s.zoneBreakpoint2], fn: x => zoneEffective(x, s) * s.zoneWeight });
  const passive = passiveScore(a, s).score - passiveScore(b, s).score;
  return linear + luck + npc + arrow + energy + zone + passive;
}

function candidateXs(a: number, b: number, breakpoints: number[]): number[] {
  const xs = breakpoints.flatMap(bp => [bp - a, bp - b]);
  if (!xs.length) return [0];
  const min = Math.min(...xs), max = Math.max(...xs);
  const span = Math.max(1, max - min + Math.abs(a - b) + 1);
  xs.push(min - span, max + span);
  return [...new Set(xs)].sort((x, y) => x - y);
}

export function minDifference(a: number, b: number, spec: PiecewiseSpec): number {
  return Math.min(...candidateXs(a, b, spec.breakpoints).map(x => spec.fn(x + a) - spec.fn(x + b)));
}
export function maxDifference(a: number, b: number, spec: PiecewiseSpec): number {
  return Math.max(...candidateXs(a, b, spec.breakpoints).map(x => spec.fn(x + a) - spec.fn(x + b)));
}

export function findDominator(target: GearItem, candidates: GearItem[], s: AlgorithmSettings): DominanceResult {
  let strongest: { item: GearItem; margin: number } | undefined;
  let counterexample: { item: GearItem; advantage: number } | undefined;
  let comparable = 0;
  for (const candidate of candidates) {
    if (candidate.slot !== target.slot) continue;
    if (isProtected(candidate, s) || isProtected(target, s)) continue;
    comparable++;
    const worst = pairWorstCaseAdvantage(candidate, target, s);
    const best = pairBestCaseAdvantage(candidate, target, s);
    if (worst >= -1e-9 && best > 1e-9) {
      if (!strongest || worst > strongest.margin) strongest = { item: candidate, margin: worst };
    } else if (worst < -1e-9) {
      const targetCanLeadBy = -worst;
      if (!counterexample || targetCanLeadBy > counterexample.advantage) counterexample = { item: candidate, advantage: targetCanLeadBy };
    }
  }
  if (strongest) return {
    dominated: true,
    dominator: strongest.item,
    worstCaseAdvantage: strongest.margin,
    reason: `Dominated by ${strongest.item.name}. Worst-case score advantage across all complementary states: +${strongest.margin.toFixed(2)}.`
  };
  if (!comparable) return {
    dominated: false,
    reason: candidates.length ? 'No safe dominance proof is possible because the comparable same-slot alternatives contain protected/provisional effects.' : 'No other item exists in this slot, so this item cannot be redundant.'
  };
  if (counterexample) return {
    dominated: false,
    reason: `No same-slot item dominates this one across every complementary future state. Against ${counterexample.item.name}, this item can reverse the comparison by up to ${counterexample.advantage.toFixed(2)} score points in a mathematically relevant state.`
  };
  return {
    dominated: false,
    reason: 'No same-slot item is proven to weakly dominate this item across every mathematically relevant complementary state.'
  };
}

function isProtected(item: GearItem, s: AlgorithmSettings): boolean {
  if (!item.authenticated) return false;
  const passive = passiveScore(item, s);
  return passive.unknown || passive.provisional;
}

export function removeNumericAuthentication(item: GearItem): GearItem {
  const clone = structuredClone(item);
  if (!clone.authenticated || clone.authentication.kind === 'None' || !isNumericAuth(clone.authentication.effect)) return clone;
  clone.authenticated = false;
  clone.authentication = { kind: 'None', effect: '', value: 0 };
  return clone;
}

export function addOutcomeToItem(item: GearItem, outcome: string, roll: number): GearItem {
  const clone = structuredClone(item);
  clone.authenticated = true;
  clone.authentication = { kind: 'Normal', effect: outcome, value: roll };
  return clone;
}

export const STAT_KEYS: Array<keyof GearStats> = ['luck','energy','tip','walk','vehicle','recovery','zone','arrowReduction','npc'];
