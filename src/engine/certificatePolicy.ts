import { canonicalEffect, certificateFamily, currentPool, type CertificateFamily, type CertificateInventoryType } from '../authentication';
import type { AlgorithmSettings, GearStats, Slot } from '../types';
import { arrowTargetBand } from './scoring';

/**
 * This user's certificate preferences. Personal policy only: which outcomes exist and how
 * likely they are is game data in the canonical catalogue (authentication.ts). An outcome
 * being unwanted never removes it from a pool; it still takes its equal share of the odds.
 */

/** Wanted outcomes, most preferred first. The order only breaks ties between rolls whose
 * calculated full-loadout value is equal; it never overrides that value. Bid Arrow Speed is
 * not listed: it is wanted (first) only while the best set is below the Arrow band. */
export const WANTED_ORDER: Record<CertificateFamily, Record<Slot, readonly string[]>> = {
  Normal: {
    Head: ['Sunny', 'Nocturnal', 'Overcharged', 'Bid Zone Width', 'Energy Drink Time'],
    Back: ['Raindrop', 'Focused', 'Bid Zone Width', 'Energy Drink Time'],
    Wrist: ['Bid Zone Width', 'Energy Drink Time']
  },
  Premium: { Head: ['Mutated Luck'], Back: ['Golden Hour', 'Drought Breaker'], Wrist: [] },
  Limited: { Head: [], Back: ['Luck Frenzy', 'Featherweight'], Wrist: [] }
};

/** Default order across every wanted Back outcome, for explanations and ties. */
export const BACK_FALLBACK_ORDER = ['Golden Hour', 'Raindrop', 'Luck Frenzy', 'Drought Breaker', 'Focused', 'Bid Zone Width', 'Energy Drink Time', 'Featherweight'] as const;

/** Effects whose value depends on the item or the trio, so a fixed rank would mislead. */
export const CALCULATED_RANK_EFFECTS = new Set(['Focused', 'Mutated Luck']);

/** Real outcomes this profile never counts as a certificate success, however a generic
 * score values them. They stay in the odds and in the downside. */
export const UNWANTED_EFFECTS = new Set([
  'Bid Recovery', 'Tip Chance', 'NPC Offers Bonus', 'Walkspeed', 'Time Keeper', 'Connected',
  'Club Pact', 'Temporal Split', 'Auto X-Ray', 'Grade Re-Roll', 'Second Chance', 'Steady Hand'
]);

export function isUnwanted(effect: string): boolean {
  return UNWANTED_EFFECTS.has(canonicalEffect(effect));
}

/** The best set needs more Bid Arrow while it is below the band. */
export function arrowNeeded(stats: Pick<GearStats, 'arrowReduction'> | undefined, settings: AlgorithmSettings): boolean {
  return (stats?.arrowReduction ?? 0) < arrowTargetBand(settings).min - 1e-9;
}

export function wantedEffects(family: CertificateFamily, slot: Slot, needArrow: boolean): string[] {
  const order = [...WANTED_ORDER[family][slot]];
  return needArrow && family === 'Normal' ? ['Bid Arrow Speed', ...order] : order;
}

/** Share of a certificate's equally likely outcomes on this slot that are wanted. */
export function wantedChance(type: CertificateInventoryType, slot: Slot, needArrow: boolean): number {
  const pool = currentPool(type, slot);
  if (!pool.length) return 0;
  const wanted = new Set(wantedEffects(certificateFamily(type), slot, needArrow));
  return pool.filter(effect => wanted.has(effect)).length / pool.length;
}

/** 1-based position of an effect in the slot's wanted order, with the effects ranked above it. */
export function preferenceRank(family: CertificateFamily, slot: Slot, effect: string, needArrow: boolean):
  { rank: number; of: number; higher: string[] } | undefined {
  const order = wantedEffects(family, slot, needArrow);
  const index = order.indexOf(canonicalEffect(effect));
  if (index < 0) return undefined;
  return { rank: index + 1, of: order.length, higher: order.slice(0, index) };
}

/** Lower is preferred; unlisted effects sort last. Used only to break ties. */
export function preferenceOrder(family: CertificateFamily, slot: Slot, effect: string): number {
  const name = canonicalEffect(effect);
  if (name === 'Bid Arrow Speed') return -1;
  const order: readonly string[] = slot === 'Back' && family !== 'Normal' ? BACK_FALLBACK_ORDER : WANTED_ORDER[family][slot];
  const index = order.indexOf(name);
  return index < 0 ? 99 : index;
}
