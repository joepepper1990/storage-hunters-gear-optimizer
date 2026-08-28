import type { AlgorithmSettings, AuthModelEntry, CertificateTarget, CombinationResult, GearItem, LikelihoodClass } from '../types';
import { addOutcomeToItem, removeNumericAuthentication } from './dominance';
import { evaluateCombination, optimise } from './optimizer';
import { arrowEffective, passiveScore } from './scoring';

const NUMERIC_OUTCOMES = new Set(['Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Tip Chance','NPC Offers Bonus','Walkspeed']);
const MODELED_PASSIVES = new Set(['Rush','Sunny','Nocturnal','Raindrop','Overcharged','Time Keeper','Grade Re-Roll','Connected','Focused']);
const UNKNOWN_OUTCOMES = new Set(['Haggler','Anti-Gravity Field','Safecracker','Exhibitor']);

export function currentAuthMarginalValue(item: GearItem, gear: GearItem[], settings: AlgorithmSettings): number {
  if (!item.authenticated) return 0;
  const withScore = bestScoreContaining(item, gear, settings);
  const stripped = removeNumericAuthentication(item);
  if (stripped.authentication.effect === item.authentication.effect) {
    // Focused is embedded in the displayed final stat, so its removable contribution cannot
    // be reconstructed from the stored item alone. Other modeled passives are separable.
    if (item.authentication.effect === 'Focused') return 0;
    return passiveScore(item, settings).score;
  }
  const strippedGear = gear.map(g => g.id === item.id ? stripped : g);
  const withoutScore = bestScoreContaining(stripped, strippedGear, settings);
  return withScore - withoutScore;
}

export function certificateTargets(
  gear: GearItem[], settings: AlgorithmSettings, model: AuthModelEntry[], certificateType: AuthModelEntry['certificateType'], maxTargets = 10
): CertificateTarget[] {
  const best = optimise(gear, settings, 1)[0];
  if (!best) return [];
  const bestScore = best.score.total;
  return gear.map(item => makeTarget(item, gear, settings, model, certificateType, bestScore))
    .filter((x): x is CertificateTarget => Boolean(x))
    .sort((a,b) => b.heuristicScore - a.heuristicScore || a.item.name.localeCompare(b.item.name))
    .slice(0, maxTargets);
}

function makeTarget(item: GearItem, gear: GearItem[], settings: AlgorithmSettings, model: AuthModelEntry[], certificateType: AuthModelEntry['certificateType'], bestScore: number): CertificateTarget | undefined {
  const action = item.authenticated ? 'RE-AUTHENTICATE' : 'AUTHENTICATE';
  const focusedRiskUnknown = item.authenticated && item.authentication.effect === 'Focused';
  const unknownRisk = item.authenticated && UNKNOWN_OUTCOMES.has(item.authentication.effect);
  const baseItem = item.authenticated ? removeCurrentAuth(item) : structuredClone(item);
  const baseGear = gear.map(g => g.id === item.id ? baseItem : g);
  const baseCombos = combinationsContaining(baseItem, baseGear, settings);
  const baseline = maxComboScore(baseCombos);
  const currentContaining = bestScoreContaining(item, gear, settings);
  const gap = Math.max(0, bestScore - baseline);
  const currentValue = !item.authenticated || focusedRiskUnknown ? 0 : currentContaining - baseline;
  const relevant = model.filter(m => m.enabled && m.certificateType === certificateType && (m.slot === 'Any' || m.slot === item.slot));
  const outcomeThresholds = relevant.map(m => thresholdForOutcome(baseCombos, settings, bestScore, m.outcome));

  const totalObserved = relevant.reduce((sum, m) => sum + m.observedSampleCount, 0);
  let weightedReachable = 0;
  let weightedTotal = 0;
  relevant.forEach((m, idx) => {
    const weight = modelWeight(m, totalObserved);
    weightedTotal += weight;
    const t = outcomeThresholds[idx].minimumRoll;
    const reference = configuredReferenceValue(m);
    if (t !== undefined && reference !== undefined && directionCanReach(m.outcome, t, reference)) weightedReachable += weight;
  });
  const reachability = weightedTotal > 0 ? weightedReachable / weightedTotal : 0;
  const slotBestGap = Number.isFinite(currentContaining) ? Math.max(0, bestScore - currentContaining) : 999;

  let score = 0;
  score += Math.max(0, 45 - slotBestGap * 4);
  score += action === 'AUTHENTICATE' ? 30 : 8;
  score += Math.max(0, Math.min(22, 15 - currentValue * 3));
  score += reachability * 24;
  score -= Math.min(25, gap * 2);
  if (unknownRisk) score -= 28;
  if (focusedRiskUnknown) score -= 30;
  const likelihood = toLikelihood(score);

  const reasons: string[] = [];
  if (action === 'AUTHENTICATE') reasons.push('First authentication preserves existing core stats, so useful outcomes are pure upside.');
  if (slotBestGap <= 3) reasons.push('Underlying gear is already competitive with the current best loadout.');
  if (item.authenticated && currentValue < 0) reasons.push(`Current authentication is estimated to reduce best-containing score by ${Math.abs(currentValue).toFixed(2)} points, making a reroll attractive.`);
  else if (item.authenticated && currentValue <= 1.5 && !focusedRiskUnknown) reasons.push(`Current authentication contributes only ${currentValue.toFixed(2)} estimated marginal score points.`);
  if (focusedRiskUnknown) reasons.push('Focused is embedded in the displayed boosted stat; its loss on reroll cannot be reconstructed exactly, so this target is conservatively downgraded.');
  if (unknownRisk) reasons.push(`${item.authentication.effect} has unknown mechanics; its value at risk is not fabricated.`);
  if (gap > 0) reasons.push(`With the current authentication removed, this item needs about ${gap.toFixed(2)} score points to beat the current best set.`);
  if (weightedReachable > 0) reasons.push('Configured roll ranges indicate that one or more modeled outcomes can clear the exact improvement threshold.');
  if (totalObserved >= 20) reasons.push(`Empirical weighting is active from ${totalObserved} recorded ${certificateType.startsWith('Normal') ? 'Normal' : 'Alien'} rolls relevant to this slot.`);
  else reasons.push('Likelihood ranking uses editable heuristic classes because there are not yet enough empirical rolls to replace the assumptions.');

  return { item, action, heuristicScore: score, likelihood, currentAuthMarginalValue: currentValue, gapWithoutCurrentAuth: gap, outcomeThresholds, reasons };
}

function removeCurrentAuth(item: GearItem): GearItem {
  const stripped = removeNumericAuthentication(item);
  if (stripped.authenticated) {
    stripped.authenticated = false;
    stripped.authentication = { kind: 'None', effect: '', value: 0 };
  }
  return stripped;
}

function thresholdForOutcome(baseCombos: CombinationResult[], settings: AlgorithmSettings, bestScore: number, outcome: string) {
  if (!NUMERIC_OUTCOMES.has(outcome) && !MODELED_PASSIVES.has(outcome)) {
    return { outcome, note: 'Unknown/protected mechanics; no fabricated threshold.' };
  }
  if (outcome === 'Connected' || outcome === 'Focused') return { outcome, note: 'No separate score; threshold cannot be inferred from an independent passive value.' };
  if (outcome === 'Bid Arrow Speed') {
    const magnitude = minimumUsefulArrowMagnitudeFromCombos(baseCombos, settings, bestScore);
    return magnitude === undefined
      ? { outcome, note: 'No useful negative Bid Arrow Speed roll can beat the current best score under the current settings.' }
      : { outcome, minimumRoll: -magnitude, unit: '%' };
  }

  const minimumRoll = minimumUsefulPositiveRoll(baseCombos, settings, bestScore, outcome);
  return minimumRoll === undefined
    ? { outcome, note: 'No finite useful threshold found under current settings.' }
    : { outcome, minimumRoll, unit: '%' };
}

function minimumUsefulPositiveRoll(combos: CombinationResult[], s: AlgorithmSettings, targetScore: number, outcome: string): number | undefined {
  let best = Infinity;
  for (const combo of combos) {
    let required: number | undefined;
    switch (outcome) {
      case 'Luck': required = linearRequired(combo, combo.stats.luck, combo.score.luck, s.luckWeight, targetScore); break;
      case 'Bid Recovery': required = linearRequired(combo, combo.stats.recovery, combo.score.recovery, s.recoveryWeight, targetScore); break;
      case 'Bid Zone Width': required = piecewiseRequired(combo, combo.stats.zone, combo.score.zone, s.zoneWeight, targetScore, s, 'zone'); break;
      case 'Tip Chance': required = linearRequired(combo, combo.stats.tip, combo.score.tip, s.tipWeight, targetScore); break;
      case 'NPC Offers Bonus': required = linearRequired(combo, combo.stats.npc, combo.score.npc, s.npcWeight, targetScore); break;
      case 'Walkspeed': required = linearRequired(combo, combo.stats.walk, combo.score.walk, s.walkWeight, targetScore); break;
      case 'Rush': required = passiveRequired(combo, s.rushWeight, targetScore); break;
      case 'Sunny': required = passiveRequired(combo, s.sunnyUptime * s.luckWeight, targetScore); break;
      case 'Nocturnal': required = passiveRequired(combo, s.nocturnalUptime * s.luckWeight, targetScore); break;
      case 'Raindrop': required = passiveRequired(combo, s.raindropUptime * s.luckWeight, targetScore); break;
      case 'Overcharged': required = passiveRequired(combo, s.overchargedMultiplier * s.luckWeight, targetScore); break;
      case 'Time Keeper': required = passiveRequired(combo, s.timeKeeperWeight, targetScore); break;
      case 'Grade Re-Roll': required = passiveRequired(combo, s.gradeRerollWeight, targetScore); break;
      default: return undefined;
    }
    if (required !== undefined && required < best) best = required;
  }
  return Number.isFinite(best) ? best : undefined;
}

function linearRequired(combo: CombinationResult, currentStat: number, currentContribution: number, weight: number, targetScore: number): number | undefined {
  if (!Number.isFinite(weight) || weight <= 0) return undefined;
  const fixed = combo.score.total - currentContribution;
  const neededStat = (targetScore + 1e-9 - fixed) / weight;
  return Math.max(0, neededStat - currentStat);
}

function passiveRequired(combo: CombinationResult, coefficient: number, targetScore: number): number | undefined {
  if (!Number.isFinite(coefficient) || coefficient <= 0) return undefined;
  return Math.max(0, (targetScore + 1e-9 - combo.score.total) / coefficient);
}

function piecewiseRequired(combo: CombinationResult, currentStat: number, currentContribution: number, weight: number, targetScore: number, s: AlgorithmSettings, kind: 'zone'): number | undefined {
  if (!Number.isFinite(weight) || weight <= 0) return undefined;
  const fixed = combo.score.total - currentContribution;
  const neededEffective = (targetScore + 1e-9 - fixed) / weight;
  if (kind === 'zone') return firstPositiveMagnitudeReachingZone(currentStat, neededEffective, s);
  return undefined;
}

function firstPositiveMagnitudeReachingZone(base: number, neededEffective: number, s: AlgorithmSettings): number | undefined {
  const zone = (x: number) => {
    if (x <= s.zoneBreakpoint1) return x;
    if (x <= s.zoneBreakpoint2) return s.zoneBreakpoint1 + (x - s.zoneBreakpoint1) * s.zoneMultiplier2;
    const atSecond = s.zoneBreakpoint1 + (s.zoneBreakpoint2 - s.zoneBreakpoint1) * s.zoneMultiplier2;
    return atSecond + (x - s.zoneBreakpoint2) * s.zoneMultiplier3;
  };
  if (zone(base) > neededEffective) return 0;
  const boundaries = [0, Math.max(0, s.zoneBreakpoint1 - base), Math.max(0, s.zoneBreakpoint2 - base)].sort((a,b)=>a-b);
  const unique = [...new Set(boundaries)];
  for (let i=0; i<unique.length-1; i++) {
    const lo = unique[i], hi = unique[i+1];
    const eLo = zone(base + lo), eHi = zone(base + hi);
    if (eHi > neededEffective && eHi > eLo) return lo + (neededEffective - eLo) / ((eHi - eLo) / (hi - lo || 1)) + 1e-9;
  }
  const lo = unique[unique.length-1] ?? 0;
  const eLo = zone(base + lo);
  if (eLo > neededEffective) return lo;
  if (s.zoneMultiplier3 <= 0) return undefined;
  return lo + (neededEffective - eLo) / s.zoneMultiplier3 + 1e-9;
}

/**
 * Exact minimum magnitude of a useful negative game-displayed Bid Arrow Speed roll.
 * For a fixed complementary pair every score component except Arrow is constant, and
 * Arrow is piecewise linear at the configured 75/80/100-style breakpoints. We solve
 * each segment analytically and take the earliest crossing over all complementary pairs.
 */
export function minimumUsefulArrowMagnitude(baseItem: GearItem, gear: GearItem[], settings: AlgorithmSettings, targetScore: number): number | undefined {
  return minimumUsefulArrowMagnitudeFromCombos(combinationsContaining(baseItem, gear, settings), settings, targetScore);
}

function minimumUsefulArrowMagnitudeFromCombos(combos: CombinationResult[], settings: AlgorithmSettings, targetScore: number): number | undefined {
  if (!Number.isFinite(settings.arrowWeight) || settings.arrowWeight <= 0) return undefined;
  let bestMagnitude = Infinity;
  for (const combo of combos) {
    const fixed = combo.score.total - combo.score.arrow;
    const neededEffective = (targetScore + 1e-9 - fixed) / settings.arrowWeight;
    const magnitude = firstMagnitudeReachingEffective(combo.stats.arrowReduction, neededEffective, settings);
    if (magnitude !== undefined && magnitude < bestMagnitude) bestMagnitude = magnitude;
  }
  return Number.isFinite(bestMagnitude) ? bestMagnitude : undefined;
}

function firstMagnitudeReachingEffective(baseArrow: number, neededEffective: number, s: AlgorithmSettings): number | undefined {
  // Search exact linear regions in ascending roll magnitude. The last region slopes down,
  // so it can never create the first upward crossing unless the score was already above target.
  const boundaries = [0,
    Math.max(0, s.arrowSweetSpot - baseArrow),
    Math.max(0, s.arrowCeiling - baseArrow),
    Math.max(0, s.arrowPenaltyThreshold - baseArrow)
  ].sort((a,b)=>a-b);
  const unique = [...new Set(boundaries)];
  for (let i=0; i<unique.length; i++) {
    const lo = unique[i];
    const hi = i + 1 < unique.length ? unique[i+1] : undefined;
    const eLo = arrowEffective(baseArrow + lo, s);
    if (eLo > neededEffective) return lo;
    if (hi === undefined) break;
    const eHi = arrowEffective(baseArrow + hi, s);
    if (eHi > neededEffective && eHi > eLo) {
      const slope = (eHi - eLo) / (hi - lo || 1);
      return lo + (neededEffective - eLo) / slope + 1e-9;
    }
  }
  return undefined;
}

function directionCanReach(outcome: string, threshold: number, value: number) {
  return outcome === 'Bid Arrow Speed' ? value <= threshold : value >= threshold;
}

function configuredReferenceValue(m: AuthModelEntry): number | undefined {
  if (m.observedValues.length >= 4 && m.typical !== undefined) return m.typical;
  return m.typical ?? m.max;
}

function modelWeight(m: AuthModelEntry, totalObserved: number): number {
  if (totalObserved >= 20) return m.observedSampleCount / totalObserved;
  return ({'VERY HIGH':5,'HIGH':4,'MEDIUM':3,'LOW':2,'VERY LOW':1} as const)[m.assumedLikelihoodClass];
}

function bestScoreContaining(item: GearItem, gear: GearItem[], settings: AlgorithmSettings): number {
  return maxComboScore(combinationsContaining(item, gear, settings));
}

function combinationsContaining(item: GearItem, gear: GearItem[], settings: AlgorithmSettings): CombinationResult[] {
  const pairs = complementaryPairs(item, gear);
  const combos: CombinationResult[] = [];
  for (const [a,b] of pairs) {
    const [h,back,w] = makeTriplet(item,a,b);
    combos.push(evaluateCombination(h,back,w,settings));
  }
  return combos;
}

function maxComboScore(combos: CombinationResult[]): number {
  let best = -Infinity;
  for (const combo of combos) if (combo.score.total > best) best = combo.score.total;
  return best;
}

function complementaryPairs(item: GearItem, gear: GearItem[]): Array<[GearItem,GearItem]> {
  const others = gear.filter(g => g.id !== item.id);
  const slots = item.slot === 'Head' ? ['Back','Wrist'] : item.slot === 'Back' ? ['Head','Wrist'] : ['Head','Back'];
  const first = others.filter(g => g.slot === slots[0]);
  const second = others.filter(g => g.slot === slots[1]);
  const pairs: Array<[GearItem,GearItem]> = [];
  for (const a of first) for (const b of second) pairs.push([a,b]);
  return pairs;
}

function makeTriplet(item: GearItem, a: GearItem, b: GearItem): [GearItem,GearItem,GearItem] {
  const all = [item,a,b];
  return [all.find(x=>x.slot==='Head')!, all.find(x=>x.slot==='Back')!, all.find(x=>x.slot==='Wrist')!];
}

function toLikelihood(score: number): LikelihoodClass {
  if (score >= 75) return 'VERY HIGH';
  if (score >= 58) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 22) return 'LOW';
  return 'VERY LOW';
}
