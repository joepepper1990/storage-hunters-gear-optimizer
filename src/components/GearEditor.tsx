import { useState } from 'react';
import { ZERO_STATS } from '../defaults';
import { editAuthentication } from '../engine/certificateRolls';
import { gameArrowToReduction, reductionToGameArrow } from '../engine/scoring';
import { activeAuthenticationOptions, EXCLUSIVE_AUTH_EFFECTS, LEGACY_ALIEN_EFFECTS, LIMITED_AUTH_EFFECTS, PREMIUM_AUTH_EFFECTS } from '../authentication';
import { generateGearName } from '../naming';
import type { AuthModelEntry, GearItem, GearStats, Slot } from '../types';
import { NumberInput, SHORT_STAT, STAT_LABELS } from '../ui';

export function blankGear(slot: Slot = 'Head'): GearItem {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), baseName: '', name: '', slot, stats: { ...ZERO_STATS }, authenticated: false,
    authentication: { kind: 'None', effect: '', value: 0 }, favourite: false, createdAt: now, updatedAt: now };
}

export function duplicateGear(item: GearItem): GearItem {
  const copy = structuredClone(item);
  copy.id = crypto.randomUUID();
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  return copy;
}

export function GearEditor({ item, authModel, mode, onClose, onSave }: {
  item: GearItem; authModel: AuthModelEntry[]; mode: 'add' | 'edit'; onClose: () => void; onSave: (item: GearItem, keepAdding?: boolean) => void;
}) {
  const [v, setV] = useState({ ...item, name: generateGearName(item.baseName, item.stats, item.authenticated, item.authentication) });
  const [shown, setShown] = useState<Array<keyof GearStats>>(STAT_LABELS.filter(([key]) => Math.abs(item.stats[key]) > 1e-12).map(([key]) => key));
  const [error, setError] = useState('');
  const renamed = (next: GearItem) => ({ ...next, name: generateGearName(next.baseName, next.stats, next.authenticated, next.authentication) });
  const patch = (next: Partial<GearItem>) => setV(current => renamed({ ...current, ...next }));
  const setStat = (key: keyof GearStats, n: number) => setV(current => renamed({ ...current, stats: { ...current.stats, [key]: Number.isFinite(n) ? n : 0 } }));
  const setAuthentication = (next: Partial<GearItem['authentication']>) => setV(current => renamed({ ...current, authentication: editAuthentication(current.authentication, next) }));
  const hideStat = (key: keyof GearStats) => { setStat(key, 0); setShown(current => current.filter(k => k !== key)); };
  const legacyAlien = v.authenticated && v.authentication.kind === 'Alien';
  const kind = v.authentication.kind === 'Premium' ? 'Premium' : v.authentication.kind === 'Limited' ? 'Limited' : 'Normal';
  const save = (keepAdding = false) => {
    const issue = validateGear(v);
    if (issue) { setError(issue); return; }
    onSave(renamed(v), keepAdding);
  };

  return <div className="modalBackdrop"><div className="modal sheet" role="dialog" aria-modal="true" aria-label={mode === 'add' ? 'Add gear' : 'Edit gear'}>
    <div className="modalHeader"><h2>{mode === 'add' ? 'Add gear' : 'Edit gear'}</h2><button className="iconButton" onClick={onClose} aria-label="Close">×</button></div>
    <div className="formGrid">
      <label className="wide">Name<input autoFocus value={v.baseName} onChange={e => patch({ baseName: e.target.value })} placeholder="e.g. Pearl Dominus" /></label>
      <label>Slot<select value={v.slot} onChange={e => patch({ slot: e.target.value as Slot })}><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label>Mutation<input list="gear-mutations" value={v.mutation ?? ''} onChange={e => patch({ mutation: e.target.value })} placeholder="None" />
        <datalist id="gear-mutations">{['None','Silver','Gold','Corrupted','Diamond','Gem','Chrome','Hologram','Void','Secret','Rainbow','Onyx','Cobwebbed','Exclusive','Police'].map(m => <option key={m} value={m} />)}</datalist></label>
      <label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct ?? ''} onChange={e => patch({ conditionPct: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Optional" /></label>
      <label>Stars<select value={v.gradeStars ?? ''} onChange={e => patch({ gradeStars: e.target.value === '' ? undefined : Number(e.target.value) })}>
        <option value="">Not recorded</option><option value="0">Not graded</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}★</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={v.favourite} onChange={e => patch({ favourite: e.target.checked })} /> Favourite</label>
    </div>

    <div className="quickEntrySection">
      <strong>Stats</strong>
      {STAT_LABELS.some(([key]) => !shown.includes(key)) && <div className="statPicker">{STAT_LABELS.filter(([key]) => !shown.includes(key)).map(([key]) =>
        <button type="button" key={key} onClick={() => setShown(current => [...current, key])}>＋ {SHORT_STAT[key]}</button>)}</div>}
      <div className="quickStatGrid">{STAT_LABELS.filter(([key]) => shown.includes(key)).map(([key, label]) => <div className="quickStatField" key={key}>
        {key === 'arrowReduction'
          ? <label>{label} % (game sign)<NumberInput value={reductionToGameArrow(v.stats.arrowReduction)} onValue={n => setStat('arrowReduction', gameArrowToReduction(n))} placeholder="-24" /></label>
          : <label>{label} %<NumberInput value={v.stats[key]} onValue={n => setStat(key, n)} /></label>}
        <button type="button" className="removeStat" onClick={() => hideStat(key)} aria-label={`Remove ${label}`}>×</button>
      </div>)}</div>
    </div>

    <div className="formGrid">
      <label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e => {
        const authenticated = e.target.checked;
        const authentication = authenticated ? (v.authenticated ? v.authentication : { kind: 'Normal' as const, effect: '', value: 0 }) : { kind: 'None' as const, effect: '', value: 0 };
        setV(current => renamed({ ...current, authenticated, authentication }));
      }} /> Authenticated</label>
      {v.authenticated && (legacyAlien ? <>
        <label>Type<input value="Legacy Alien" readOnly /></label>
        <label>Effect<input value={v.authentication.effect} readOnly /></label>
        <label>Value %<input type="number" step="any" value={v.authentication.value} onChange={e => setAuthentication({ value: Number(e.target.value) })} /></label>
      </> : <>
        <label>Certificate<select value={kind} onChange={e => setAuthentication({ kind: e.target.value as 'Normal' | 'Premium' | 'Limited', effect: '', value: 0 })}><option>Normal</option><option>Premium</option><option>Limited</option></select></label>
        <label>Effect<select value={v.authentication.effect} onChange={e => setAuthentication({ effect: e.target.value })}>{activeAuthenticationOptions(v.slot, v.authentication.effect, kind).map(x => <option value={x} key={x}>{x || 'Select effect'}</option>)}</select></label>
        <label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e => setAuthentication({ value: Number(e.target.value) })} /></label>
      </>)}
    </div>
    {error && <p className="formError" role="alert">{error}</p>}
    <div className="stickyActions">
      <button className="secondary" onClick={onClose}>Cancel</button>
      {mode === 'add' && <button className="secondary" onClick={() => save(true)}>Save + another</button>}
      <button className="primary" onClick={() => save()}>Save</button>
    </div>
  </div></div>;
}

export function validateGear(i: GearItem): string {
  if (!i.baseName.trim()) return 'Name is required.';
  if (!['Head','Back','Wrist'].includes(i.slot)) return 'Choose a slot.';
  if (i.conditionPct !== undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct < 0 || i.conditionPct > 100)) return 'Condition must be 0–100%.';
  for (const [key, label] of STAT_LABELS) if (!Number.isFinite(i.stats[key])) return `${label} must be a number.`;
  if (!Number.isFinite(i.authentication.value)) return 'Authentication value must be a number.';
  if (!i.authenticated) return '';
  if (i.authentication.kind === 'None') return 'Choose a certificate.';
  const effect = i.authentication.effect.trim();
  if (!effect) return 'Choose an authentication effect.';
  if (i.authentication.kind === 'Normal' && LEGACY_ALIEN_EFFECTS.includes(effect as never)) return `${effect} is a legacy Alien effect.`;
  if (i.authentication.kind === 'Alien') return '';
  const exclusive = i.authentication.kind === 'Premium' ? PREMIUM_AUTH_EFFECTS : i.authentication.kind === 'Limited' ? LIMITED_AUTH_EFFECTS : EXCLUSIVE_AUTH_EFFECTS;
  for (const [slot, effects] of Object.entries(exclusive) as Array<[Slot, readonly string[]]>) if (effects.includes(effect) && slot !== i.slot) return `${effect} is ${slot} only.`;
  return '';
}
