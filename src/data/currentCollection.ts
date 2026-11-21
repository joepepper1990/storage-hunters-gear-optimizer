import evidence from '../../docs/audits/2026-11-21-inventory.json';
import type { Authentication, GearItem, GearStats } from '../types';
import { canonicalEffect } from '../authentication';
import { generateGearName } from '../naming';
import { makeCurrentGear as makeNovember18Gear } from './currentInventory';

const SNAPSHOT_DATE = '2026-11-21T00:00:00.000Z';
const STAT_KEYS: Array<keyof GearStats> = ['luck','energy','tip','walk','vehicle','recovery','zone','arrowReduction','npc'];
const NUMERIC_AUTH: Record<string, keyof GearStats> = {
  Luck:'luck', 'Bid Recovery':'recovery', 'Bid Arrow Speed':'arrowReduction',
  'Bid Zone Width':'zone', 'Energy Drink Time':'energy', 'Tip Chance':'tip',
  'NPC Offers Bonus':'npc', Walkspeed:'walk'
};
const PREMIUM_EFFECTS = new Set(['Mutated Luck','Golden Hour','Drought Breaker']);

/** All 78 photographed copies and both owner-reported additions remain owned.
 * Display/disband recommendations never remove records from this snapshot. */
export function makeCurrentGear(): GearItem[] {
  const rows = evidence.items.map(row => {
    const uncertainFields: string[] = row.uncertainFields;
    const stats = Object.fromEntries(STAT_KEYS.map(key => [key,
      (row.displayedStats as Partial<Record<keyof GearStats, number | null>>)[key] ?? 0
    ])) as unknown as GearStats;
    const effect = row.authentication.effect ? canonicalEffect(row.authentication.effect) : '';
    const authentication: Authentication = {
      kind: effect ? (PREMIUM_EFFECTS.has(effect) ? 'Premium' : 'Normal') : 'None',
      effect, value: row.authentication.value ?? 0
    };
    const numericKey = NUMERIC_AUTH[effect];
    if (numericKey) stats[numericKey] -= effect === 'Bid Arrow Speed' ? -authentication.value : authentication.value;
    // Observed 80 -> 103 takes precedence over estimating a percentage or rounding.
    if (row.source === 'IMG_8390.jpg') {
      stats.luck = 80;
      authentication.statDeltas = { luck: 23 };
    }
    const needsReview = uncertainFields.includes('displayedStats');
    const metadataUncertain = uncertainFields.filter(field => field !== 'displayedStats');
    if (row.source.startsWith('USER_')) metadataUncertain.push('authentication');
    const mutation = uncertainFields.includes('mutation') ? undefined : row.mutation?.trim() || 'None';
    return {
      id: `verified-20261121-${row.source.replace(/\.jpg$/, '').toLowerCase()}`,
      sourceImage: row.source,
      baseName: row.baseName, slot: row.slot as GearItem['slot'], mutation,
      ...(row.gradeStars === null ? {} : { gradeStars: row.gradeStars }),
      ...(row.conditionPct === null ? {} : { conditionPct: row.conditionPct }),
      ...(row.displayedValue === null ? {} : { displayedValue: row.displayedValue }),
      ...(needsReview ? { needsReview:true, reviewNotes:row.notes } : {}),
      ...(metadataUncertain.length ? { metadataUncertain } : {}),
      stats, authenticated: authentication.kind !== 'None', authentication,
      name:generateGearName(row.baseName,stats,authentication.kind !== 'None',authentication),
      favourite:false, createdAt:SNAPSHOT_DATE, updatedAt:SNAPSHOT_DATE
    };
  });
  return retainIdentities(rows, makeNovember18Gear());
}

function sameType(a: GearItem, b: GearItem): boolean {
  return a.slot === b.slot && a.baseName.trim().toLowerCase() === b.baseName.trim().toLowerCase();
}
function sameStats(a: GearItem, b: GearItem): boolean {
  return STAT_KEYS.every(key => Math.abs((a.stats[key] ?? 0) - (b.stats[key] ?? 0)) < 1e-5);
}
function mutationKey(item: GearItem): string {
  return (item.mutation ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean).filter(v => v !== 'none').sort().join('|');
}

/** Match copies once each. Provenance and exact stats come first; an observed
 * unique price or grading fingerprint can identify a previously corrected roll. */
function retainIdentities(rows: GearItem[], existing: GearItem[]): GearItem[] {
  const unused = [...existing];
  return rows.map(next => {
    let index = unused.findIndex(old => old.sourceImage === next.sourceImage || old.id === next.id);
    if (index < 0 && !next.needsReview) index = unused.findIndex(old => sameType(old,next) && sameStats(old,next) && mutationKey(old) === mutationKey(next));
    if (index < 0 && !next.needsReview) index = unused.findIndex(old => sameType(old,next) && sameStats(old,next));
    if (index < 0 && next.displayedValue !== undefined) {
      const candidates = unused.map((old,index) => ({old,index})).filter(({old}) => sameType(old,next) && old.displayedValue === next.displayedValue);
      if (candidates.length === 1) index = candidates[0].index;
    }
    if (index < 0 && !next.needsReview) {
      const candidates = unused.map((old,index) => ({old,index})).filter(({old}) => sameType(old,next) && mutationKey(old) === mutationKey(next)
        && STAT_KEYS.every(key => next.stats[key] < 0 ? old.stats[key] === next.stats[key] : old.stats[key] >= 0)
        && STAT_KEYS.every(key => Boolean(old.stats[key]) === Boolean(next.stats[key])));
      if (candidates.length === 1) index = candidates[0].index;
    }
    if (index < 0) return next;
    const [old] = unused.splice(index,1);
    return {...next,id:old.id,favourite:old.favourite,createdAt:old.createdAt};
  });
}

/** Schema 22 only. Imports and subsequent reloads bypass snapshot reconciliation. */
export function reconcileCurrentGear(existing: GearItem[]): GearItem[] {
  return retainIdentities(makeCurrentGear(), existing);
}
