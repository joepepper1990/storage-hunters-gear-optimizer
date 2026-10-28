import { addCertificateBatch } from '../engine/certificateInventory';
import { generateGearName, generateTrophyName } from '../naming';
import type { PanelScan } from '../scanner/panel';
import type { AppData, GavelTrophy, GearItem, Slot } from '../types';

/** A screenshot reading after the user's edits, ready to be approved. */
export type ImportDraft = PanelScan;

export type ImportMatch =
  | { status: 'new' }
  | { status: 'update'; id: string; name: string; changes: string[] }
  | { status: 'add-one'; owned: number }
  | { status: 'invalid'; reason: string };

/** Base names already in the inventory decide the slot of a re-imported item. */
export function knownSlots(data: AppData): Map<string, Slot> {
  return new Map(data.gear.map(g => [g.baseName.toLowerCase(), g.slot]));
}

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** "Condition: 54% → 60%" when the screenshot shows something different; unrecorded values show as "—". */
function change(label: string, before: string | number | undefined, after: string | number | undefined, unit = ''): string | undefined {
  if (after === undefined || before === after) return undefined;
  const show = (v: string | number | undefined) => v === undefined ? '—' : `${v}${unit}`;
  return `${label}: ${show(before)} → ${show(after)}`;
}

function gearMatch(data: AppData, draft: Extract<ImportDraft, { kind: 'gear' }>): GearItem | undefined {
  return data.gear.find(g => g.slot === draft.slot && g.baseName.trim().toLowerCase() === draft.baseName.trim().toLowerCase()
    && (Object.keys(draft.stats) as Array<keyof GearItem['stats']>).every(k => sameNumber(g.stats[k] ?? 0, draft.stats[k])));
}

function signature(modifiers: GavelTrophy['modifiers']): string {
  return modifiers.map(m => `${m.mutation.trim().toLowerCase()}:${m.boostPct}`).sort().join('|');
}

/** Values the app could not load back are refused before saving. */
function conditionProblem(condition: number | undefined): string | undefined {
  return condition !== undefined && !(condition >= 0 && condition <= 100) ? 'Condition must be between 0 and 100%.' : undefined;
}

function gavelMatch(data: AppData, draft: Extract<ImportDraft, { kind: 'gavel' }>): GavelTrophy | undefined {
  return data.trophies.find(t => signature(t.modifiers) === signature(draft.modifiers));
}

/** What approving this draft would do: add a new record, update a matching one, or add one more certificate. */
export function matchDraft(data: AppData, draft: ImportDraft): ImportMatch {
  switch (draft.kind) {
    case 'unknown': return { status: 'invalid', reason: 'Not recognised as gear, a Gavel or a certificate.' };
    case 'gear': {
      if (!draft.baseName.trim()) return { status: 'invalid', reason: 'Enter the item name.' };
      const condition = conditionProblem(draft.conditionPct);
      if (condition) return { status: 'invalid', reason: condition };
      if (!draft.slot) return { status: 'invalid', reason: 'Choose a slot.' };
      if (/^focus(ed)?$/i.test(draft.authentication.effect) && !draft.baseConfirmed) return { status: 'invalid', reason: 'Check the base stats (Focused).' };
      const found = gearMatch(data, draft);
      if (!found) return { status: 'new' };
      const auth = (a: { kind: string; effect: string; value: number }) => a.kind === 'None' || !a.effect ? 'none' : `${a.effect} ${a.value}% (${a.kind})`;
      return { status: 'update', id: found.id, name: found.baseName, changes: [
        change('Condition', found.conditionPct, draft.conditionPct, '%'), change('Stars', found.gradeStars, draft.stars),
        change('Mutation', found.mutation || 'None', draft.mutation || 'None'),
        change('Effect', auth(found.authenticated ? found.authentication : { kind: 'None', effect: '', value: 0 }), auth(draft.authentication))
      ].filter((c): c is string => Boolean(c)) };
    }
    case 'gavel': {
      if (!draft.modifiers.length) return { status: 'invalid', reason: 'Add at least one mutation boost.' };
      if (draft.modifiers.some(m => !m.mutation.trim() || !(m.boostPct >= 0))) return { status: 'invalid', reason: 'Every row needs a mutation and a boost of 0% or more.' };
      const condition = conditionProblem(draft.conditionPct);
      if (condition) return { status: 'invalid', reason: condition };
      const found = gavelMatch(data, draft);
      if (!found) return { status: 'new' };
      return { status: 'update', id: found.id, name: found.name, changes: [
        change('Condition', found.conditionPct, draft.conditionPct, '%'), change('Stars', found.gradeStars, draft.stars)
      ].filter((c): c is string => Boolean(c)) };
    }
    case 'certificate': {
      const owned = data.ownedCertificates.filter(c => c.type === draft.type && (c.gradeStars ?? undefined) === draft.stars && (c.mutation ?? undefined) === draft.mutation)
        .reduce((n, c) => n + c.quantity, 0);
      return { status: 'add-one', owned };
    }
  }
}

/**
 * Applies an approved draft. A matching gear piece or Gavel is updated in place (keeping its
 * ID, favourite and history) with what the screenshot shows: condition, stars, mutation and
 * authentication. Otherwise a new record is added. A certificate always adds one.
 */
export function applyDraft(data: AppData, draft: ImportDraft, now = new Date().toISOString(), id: string = crypto.randomUUID()): AppData {
  const match = matchDraft(data, draft);
  if (match.status === 'invalid') throw new Error(match.reason);
  if (draft.kind === 'gear') {
    const authenticated = draft.authentication.kind !== 'None' && Boolean(draft.authentication.effect);
    const authentication = authenticated ? draft.authentication : { kind: 'None' as const, effect: '', value: 0 };
    const fields = {
      baseName: draft.baseName.trim(), slot: draft.slot!, mutation: draft.mutation || 'None', conditionPct: draft.conditionPct,
      gradeStars: draft.stars, stats: { ...draft.stats }, authenticated, authentication,
      name: generateGearName(draft.baseName.trim(), draft.stats, authenticated, authentication), updatedAt: now
    };
    if (match.status === 'update') return { ...data, gear: data.gear.map(g => g.id === match.id
      // The same authentication keeps any notes or observed stat deltas recorded for it;
      // a condition the screenshot does not show keeps the stored one.
      ? { ...g, ...fields, conditionPct: fields.conditionPct ?? g.conditionPct, authentication: sameAuth(g, fields) ? g.authentication : authentication } : g) };
    return { ...data, gear: [...data.gear, { id, ...fields, favourite: false, createdAt: now }] };
  }
  if (draft.kind === 'gavel') {
    const modifiers = draft.modifiers.map(m => ({ mutation: m.mutation.trim(), boostPct: m.boostPct }));
    const fields = { modifiers, name: generateTrophyName(modifiers), conditionPct: draft.conditionPct, gradeStars: draft.stars, updatedAt: now };
    // Display tooltips show no condition: keep the stored one.
    if (match.status === 'update') return { ...data, trophies: data.trophies.map(t => t.id === match.id ? { ...t, ...fields, conditionPct: fields.conditionPct ?? t.conditionPct } : t) };
    return { ...data, trophies: [...data.trophies, { id, ...fields, favourite: false, createdAt: now }] };
  }
  if (draft.kind === 'certificate') return addCertificateBatch(data, { type: draft.type, quantity: 1, gradeStars: draft.stars, mutation: draft.mutation });
  return data;
}

function sameAuth(a: Pick<GearItem, 'authenticated' | 'authentication'>, b: Pick<GearItem, 'authenticated' | 'authentication'>): boolean {
  return a.authenticated === b.authenticated && a.authentication.kind === b.authentication.kind
    && a.authentication.effect.trim().toLowerCase() === b.authentication.effect.trim().toLowerCase()
    && sameNumber(a.authentication.value, b.authentication.value);
}
