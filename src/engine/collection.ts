import type { AlgorithmSettings, GearItem, GearStats, ItemAnalysis, Slot } from '../types';
import { hasUnknownEffect } from './effects';
import { effectiveItemStats } from './scoring';
import { algorithmIssues } from './settingsValidation';

export interface CollectionRow { item: GearItem; reason: string; provisional?: boolean; witnessId?: string }
export interface MissingDisplay { baseName: string; slot: Slot }
export interface CollectionView { display: CollectionRow[]; storage: CollectionRow[]; discard: CollectionRow[]; missingDisplay: MissingDisplay[] }
export interface CollectionOptions { ready: boolean; certificateTargets?: Set<string>; analyses?: ItemAnalysis[] }

// Accessory value factors verified in the catalogue. This is deliberately separate
// from mutation Luck and editable gavel chance/weight settings.
const VALUE_FACTORS: Record<string, number> = { Silver: 2, Gold: 4, Corrupted: 6, Diamond: 8, Gem: 10, Chrome: 12, Hologram: 15, Void: 35, Tiny: 2 };
const MUTATION_LUCK: Record<string, number> = { Silver: 5, Gold: 10, Corrupted: 15, Diamond: 20, Gem: 25, Chrome: 30, Hologram: 35, Void: 40, Secret: 45, Rainbow: 60, Onyx: 75 };
const LABELS = new Set(['None', 'Exclusive', 'Limited', 'Mint']);
const KNOWN_OTHER = new Set(['Dirty', 'Pure', 'Spotless', 'Fossil', 'Tiny', 'Huge', 'Moonlit', 'Firefly', 'Wet', 'Shocked', 'Acid', 'Caustic', 'Radioactive', 'Nuclear', 'Dune', 'Sandy', 'Redacted', 'Seized', 'Probed', 'Abducted', 'Extraterrestrial', 'Tumbleweed', 'Gunsmoked', 'Goldrush', 'Polished Brass', 'Steam', 'Clockwork', 'Falling Leaves', 'Senescence', 'Cobwebbed', 'Antique', 'Ancient', 'Timeless', 'Ruby', 'Titanium', 'Gummy']);
const POSITIVE_VALUE = new Set([...Object.keys(VALUE_FACTORS), ...Object.keys(MUTATION_LUCK), ...[...KNOWN_OTHER].filter(x => x !== 'Dirty'), 'Emerald']);
const AUCTION_KEYS: Array<keyof GearStats> = ['luck', 'arrowReduction', 'zone', 'recovery', 'energy', 'tip', 'npc'];
const EPS = 1e-9;
const tokens = (item: GearItem) => (item.mutation ?? '').match(/Polished Brass|Falling Leaves|[^+;\s]+/g)?.filter(x => !LABELS.has(x)) ?? [];
const stackIdentity = (item: GearItem) => tokens(item).sort().join('+');
const price = (item: GearItem) => typeof item.displayedValue === 'number' && Number.isFinite(item.displayedValue) && item.displayedValue >= 0 ? item.displayedValue : undefined;
const metadata = (item: GearItem): string[] => (item as GearItem & { metadataUncertain?: string[] }).metadataUncertain ?? [];
function unresolved(item: GearItem): boolean {
  return Boolean((item as GearItem & { needsReview?: boolean }).needsReview)
    || metadata(item).some(x => /stats|authentication|mutation/i.test(x))
    || Object.values(item.stats).some(x => !Number.isFinite(x))
    || (item.authenticated && item.authentication.kind !== 'None' && (!Number.isFinite(item.authentication.value)
      || (item.authentication.secondaryValue !== undefined && !Number.isFinite(item.authentication.secondaryValue))
      || Object.values(item.authentication.statDeltas ?? {}).some(x => !Number.isFinite(x))));
}
export function combinedMutationValue(item: GearItem): number | undefined {
  if (metadata(item).some(x => /mutation/i.test(x))) return undefined;
  let value = 1;
  for (const token of tokens(item)) {
    if (VALUE_FACTORS[token] === undefined) return undefined;
    value *= VALUE_FACTORS[token];
  }
  return value;
}
function mutationLuck(item: GearItem): number | undefined {
  if (unresolved(item)) return undefined;
  let value = 0;
  for (const token of tokens(item)) {
    if (MUTATION_LUCK[token] !== undefined) value = Math.max(value, MUTATION_LUCK[token]);
    else if (!KNOWN_OTHER.has(token)) return undefined;
  }
  return value;
}
function strongest(item: GearItem): string {
  const max = Math.max(0, ...Object.values(item.stats));
  // Walk and vehicle participate in Focused targeting even though they are not
  // auction ranking criteria. Equal maxima are unresolved unless both match.
  return Object.entries(item.stats).filter(([, v]) => v > 0 && Math.abs(v - max) <= EPS).map(([k]) => k).sort().join(',');
}
function authIdentity(item: GearItem): string {
  if (!item.authenticated || item.authentication.kind === 'None') return '';
  const a = item.authentication;
  return JSON.stringify([a.kind, a.effect.trim(), a.value, a.secondaryValue ?? null]);
}
function safePolicy(settings: AlgorithmSettings): boolean {
  return algorithmIssues(settings).length === 0 && settings.arrowPolicy === 'minimum' && settings.arrowTargetMin >= 95 && settings.goalMode !== 'luck';
}
/** A direct proof against a replacement that the caller will retain. */
export function retainedReplacement(target: GearItem, retained: GearItem[], settings: AlgorithmSettings): GearItem | undefined {
  if (!safePolicy(settings) || unresolved(target) || target.favourite || (target.gradeStars === undefined || !Number.isFinite(target.gradeStars) || target.gradeStars < 0) || mutationLuck(target) === undefined || hasUnknownEffect(target)) return undefined;
  const observed = effectiveItemStats(target), ml = mutationLuck(target)!;
  return retained.find(candidate => {
    if (candidate.id === target.id || candidate.slot !== target.slot || unresolved(candidate) || hasUnknownEffect(candidate)) return false;
    if (candidate.gradeStars === undefined || !Number.isFinite(candidate.gradeStars) || candidate.gradeStars < 0 || candidate.gradeStars > target.gradeStars!) return false;
    const candidateMl = mutationLuck(candidate);
    if (candidateMl === undefined || candidateMl < ml || authIdentity(candidate) !== authIdentity(target) || (strongest(target) && strongest(candidate) !== strongest(target))) return false;
    const current = effectiveItemStats(candidate);
    const pairs = AUCTION_KEYS.flatMap(k => [[current[k], observed[k]], [candidate.stats[k], target.stats[k]]]);
    pairs.push([candidateMl, ml]);
    if (pairs.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b) || a < b - EPS)) return false;
    return pairs.some(([a, b]) => a > b + EPS);
  });
}

// Only verified comparisons can eliminate a display contender. An established
// value-increasing mutation also beats an unmutated stack without inventing its factor.
function compareDisplay(a: GearItem, b: GearItem): number | undefined {
  if (metadata(a).some(x => /mutation/i.test(x)) || metadata(b).some(x => /mutation/i.test(x))) return undefined;
  const av = combinedMutationValue(a), bv = combinedMutationValue(b);
  if (av !== undefined && bv !== undefined && av !== bv) return av > bv ? 1 : -1;
  const at = tokens(a), bt = tokens(b);
  if (!at.length && bt.length && bt.every(t => POSITIVE_VALUE.has(t))) return -1;
  if (!bt.length && at.length && at.every(t => POSITIVE_VALUE.has(t))) return 1;
  if ((av !== undefined && bv !== undefined && av === bv) || stackIdentity(a) === stackIdentity(b)) {
    const ap = price(a), bp = price(b);
    if (ap === undefined || bp === undefined) return undefined;
    return ap === bp ? 0 : ap > bp ? 1 : -1;
  }
  return undefined;
}
export function classifyCollection(gear: GearItem[], wornIds: Set<string>, settings: AlgorithmSettings, options: CollectionOptions): CollectionView {
  const display: CollectionRow[] = [], storage: CollectionRow[] = [], discard: CollectionRow[] = [], missingDisplay: MissingDisplay[] = [];
  const competing = new Set<string>();
  const groups = new Map<string, GearItem[]>();
  for (const item of gear) {
    const key = `${item.slot}\0${item.baseName.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    const spare = group.filter(item => !wornIds.has(item.id));
    if (!spare.length) { missingDisplay.push({ baseName: group[0].baseName, slot: group[0].slot }); continue; }
    const contenders = spare.filter(item => !spare.some(other => other.id !== item.id && compareDisplay(other, item) === 1));
    // The provisional representative is stable; competing copies remain in storage.
    const chosen = contenders[0];
    const uncertainCompetitors = contenders.filter(item => item.id !== chosen.id && compareDisplay(chosen, item) === undefined);
    const provisional = uncertainCompetitors.length > 0 || combinedMutationValue(chosen) === undefined || unresolved(chosen);
    if (uncertainCompetitors.length) for (const item of [chosen, ...uncertainCompetitors]) competing.add(item.id);
    display.push({ item: chosen, reason: provisional ? 'Provisional display choice · keep competing copies until verified' : 'Best remaining combined mutation value', provisional });
  }
  const displayIds = new Set(display.map(r => r.item.id));
  const membership = new Set((options.analyses ?? []).filter(a => a.loadoutMemberships.some(m => m.selected || m.tied)).map(a => a.item.id));
  const protectedReason = (item: GearItem): string | undefined => {
    if (options.certificateTargets?.has(item.id)) return 'Strong future certificate target';
    if (item.favourite) return 'Locked by you';
    if (unresolved(item)) return 'Unverified information · retain until checked';
    if (hasUnknownEffect(item) || mutationLuck(item) === undefined) return 'Unverified authentication or mutation mechanics';
    if (competing.has(item.id)) return 'Competing provisional display copy';
    if (membership.has(item.id)) return 'Useful in an active or contextual setup';
    if (price(item) === undefined) return 'Item value not recorded · retain until checked';
    return undefined;
  };
  const remaining = gear.filter(item => !wornIds.has(item.id) && !displayIds.has(item.id));
  const canProve = options.ready && options.certificateTargets !== undefined && safePolicy(settings);
  const possibleDiscard = new Set(canProve ? remaining.filter(item => !protectedReason(item) && retainedReplacement(item, gear, settings)).map(item => item.id) : []);
  const retained = gear.filter(item => !possibleDiscard.has(item.id));
  for (const item of remaining) {
    const protection = protectedReason(item);
    const witness = canProve && !protection ? retainedReplacement(item, retained, settings) : undefined;
    if (witness) discard.push({ item, reason: `Retained replacement: ${witness.baseName} (${witness.sourceImage ?? witness.id}) · no worse current/native auction stats, mutation Luck and grading potential`, witnessId: witness.id });
    else storage.push({ item, reason: protection ?? (canProve ? 'Useful alternative or no complete disposal proof' : 'Retained while analysis is being checked') });
  }
  discard.sort((a, b) => price(a.item)! - price(b.item)! || a.item.id.localeCompare(b.item.id));
  return { display, storage, discard, missingDisplay };
}
