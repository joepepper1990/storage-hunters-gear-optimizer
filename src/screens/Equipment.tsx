import { useMemo, useState } from 'react';
import { algorithmIssues } from '../engine/settingsValidation';
import { analyseTrophyRetention, optimiseTrophies, trophyMutationBoost } from '../engine/trophies';
import { effectiveItemStats } from '../engine/scoring';
import { hasUnknownEffect } from '../engine/effects';
import type { GearLoadoutResult } from '../engine/gearLoadouts';
import { GearEditor } from '../components/GearEditor';
import { TrophyEditor, validateTrophy } from '../components/TrophyEditor';
import { generateTrophyName } from '../naming';
import type { AppData, GavelTrophy, GearItem, ItemAnalysis, Slot } from '../types';
import { authSummary, Empty, gameStat, itemTitle, Modal, num, SHORT_STAT, type SetData } from '../ui';

export interface EquipmentRow { item: GearItem; reason: string }
export interface GavelRow { trophy: GavelTrophy; reason: string }
export interface EquipmentView {
  /** False while retention or the certificate targets are still being worked out: nothing is offered for discard then. */
  ready: boolean;
  keep: EquipmentRow[];
  discard: EquipmentRow[];
  gavelDiscard: GavelRow[];
}

const SLOTS: Slot[] = ['Head', 'Back', 'Wrist'];

/** The four stats that decide a set, as shown in game; others are left out. */
export function keyStats(item: GearItem): string {
  const stats = effectiveItemStats(item);
  return (['luck', 'arrowReduction', 'zone', 'energy'] as const).filter(key => Math.abs(stats[key]) > 1e-12)
    .map(key => `${SHORT_STAT[key]} ${gameStat(key, stats[key])}`).join(' · ');
}

export function itemDetail(item: GearItem): string {
  return [item.mutation && item.mutation !== 'None' ? item.mutation : '', item.gradeStars ? `${item.gradeStars}★` : '', authSummary(item)].filter(Boolean).join(' · ');
}

function gavelLabel(t: GavelTrophy): string {
  return t.modifiers.map(m => `${m.mutation} +${num(m.boostPct)}%`).join(' · ') || t.name;
}

/**
 * Equipment in three groups. The Best Set comes from the loadout engine; Keep and Safe to
 * discard come from the retention analysis. An item a certificate is aimed at, a favourite,
 * or one with an unresolved effect is always kept; nothing is offered for discard while the
 * analysis or the certificate targets are out of date.
 */
export function equipmentView(data: AppData, analyses: ItemAnalysis[], current: boolean, certificateTargets?: Set<string>): EquipmentView {
  const ready = current && certificateTargets !== undefined && algorithmIssues(data.settings).length === 0;
  const verdicts = new Map(analyses.map(a => [a.item.id, a]));
  const keep: EquipmentRow[] = [], discard: EquipmentRow[] = [];
  if (ready) for (const item of data.gear) {
    const analysis = verdicts.get(item.id);
    if (!analysis || analysis.verdict === 'EQUIP') continue;
    if (analysis.verdict === 'KEEP') keep.push({ item, reason: analysis.reason });
    else if (certificateTargets!.has(item.id)) keep.push({ item, reason: 'Strong future certificate target' });
    else if (item.favourite) keep.push({ item, reason: 'Locked by you' });
    else if (hasUnknownEffect(item)) keep.push({ item, reason: 'Valuable authentication' });
    else discard.push({ item, reason: analysis.reason });
  }
  const gavelDiscard = analyseTrophyRetention(data.trophies, data.trophySettings)
    .filter(a => a.verdict === 'SAFE TO DISCARD' && !a.item.favourite)
    .map(a => ({ trophy: a.item, reason: a.dominator ? `Beaten by ${gavelLabel(a.dominator)}${beatenOn(a.item, a.dominator)}` : 'Beaten by another Gavel' }));
  return { ready, keep, discard, gavelDiscard };
}

function beatenOn(item: GavelTrophy, by: GavelTrophy): string {
  const better = [...new Set(item.modifiers.map(m => m.mutation))].filter(m => trophyMutationBoost(by, m) > trophyMutationBoost(item, m) + 1e-9);
  return better.length ? `: more ${better.join(', ')}` : '';
}

export function removeRecords(data: AppData, ids: Set<string>): AppData {
  return { ...data, gear: data.gear.filter(x => !ids.has(x.id)), trophies: data.trophies.filter(x => !ids.has(x.id)) };
}

/** The three items to equip, large, with the set's totals. */
export function BestSetCards({ best }: { best?: GearLoadoutResult }) {
  if (!best) return <Empty>Add a Head, Back and Wrist to see your Best Set</Empty>;
  const s = best.stats;
  return <div className="bestSet">
    {[best.head, best.back, best.wrist].map(item => <article className="pieceCard" key={item.id}>
      <span className="slotName">{item.slot}</span>
      <strong>{itemTitle(item)}</strong>
      {itemDetail(item) && <small>{itemDetail(item)}</small>}
      {keyStats(item) && <small>{keyStats(item)}</small>}
    </article>)}
    <div className="totals" aria-label="Best Set totals">
      <span>Luck <b>{num(s.luck)}</b></span>
      <span>Arrow <b>{num(s.arrowReduction)}%{best.arrowDistance <= 1e-9 ? ' ✓' : ''}</b></span>
      {Math.abs(s.zone) > 1e-9 && <span>Zone <b>{num(s.zone)}%</b></span>}
      {Math.abs(s.energy) > 1e-9 && <span>Energy <b>{num(s.energy)}%</b></span>}
    </div>
  </div>;
}

function ItemRow({ item, reason, onOpen }: { item: GearItem; reason?: string; onOpen: () => void }) {
  return <button className="itemRow" onClick={onOpen}>
    <strong>{itemTitle(item)}</strong>
    <small>{[keyStats(item), itemDetail(item)].filter(Boolean).join(' · ')}</small>
    {reason && <em>{reason}</em>}
  </button>;
}

export function Equipment({ data, setData, best, view }: { data: AppData; setData: SetData; best?: GearLoadoutResult; view: EquipmentView }) {
  const [editing, setEditing] = useState<GearItem | null>(null);
  const [gavel, setGavel] = useState<GavelTrophy | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const bestGavels = useMemo(() => optimiseTrophies(data.trophies, data.trophySettings)[0], [data.trophies, data.trophySettings]);

  const discardable = [...view.discard.map(r => ({ id: r.item.id, name: itemTitle(r.item), detail: `${r.item.slot} · ${keyStats(r.item)}` })),
    ...view.gavelDiscard.map(r => ({ id: r.trophy.id, name: gavelLabel(r.trophy), detail: 'Gavel' }))];
  // A selection never outlives its proof: anything no longer listed is dropped.
  const selected = discardable.filter(c => picked.has(c.id));
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const remove = () => {
    setData(removeRecords(data, new Set(selected.map(c => c.id))));
    setPicked(new Set()); setReviewing(false);
  };
  const saveGear = (item: GearItem) => {
    setData({ ...data, gear: data.gear.map(g => g.id === item.id ? { ...item, updatedAt: new Date().toISOString() } : g) });
    setEditing(null);
  };
  const saveGavel = (input: GavelTrophy) => {
    const item = { ...input, name: generateTrophyName(input.modifiers), updatedAt: new Date().toISOString() };
    const issue = validateTrophy(item); if (issue) { setError(issue); return; }
    setData({ ...data, trophies: data.trophies.map(t => t.id === item.id ? item : t) }); setGavel(null); setError('');
  };

  return <section aria-labelledby="equipment-heading">
    <h1 id="equipment-heading">Equipment</h1>
    {error && <p className="formError" role="alert">{error}</p>}

    <h2>Best Set</h2>
    {best ? <div className="rowList">{[best.head, best.back, best.wrist].map(item => <ItemRow key={item.id} item={item} reason="Current Best Set" onOpen={() => setEditing(structuredClone(item))} />)}</div>
      : <Empty>Add a Head, Back and Wrist</Empty>}

    <h2>Keep</h2>
    {!view.ready ? <p className="updating" role="status">Updating…</p> : !view.keep.length ? <Empty>Nothing else worth keeping</Empty>
      : SLOTS.map(slot => {
        const rows = view.keep.filter(r => r.item.slot === slot);
        return rows.length ? <div key={slot}><h3>{slot}</h3><div className="rowList">{rows.map(r => <ItemRow key={r.item.id} item={r.item} reason={r.reason} onOpen={() => setEditing(structuredClone(r.item))} />)}</div></div> : null;
      })}

    <h2>Safe to Discard</h2>
    {!view.ready && data.gear.length > 0 ? <p className="updating" role="status">Updating…</p> : !discardable.length ? <Empty>Nothing to discard</Empty> : <>
      <div className="toolbar">
        <button className="secondary compact" onClick={() => setPicked(selected.length === discardable.length ? new Set() : new Set(discardable.map(c => c.id)))}>{selected.length === discardable.length ? 'Clear' : 'Select all'}</button>
        <button className="danger compact" disabled={!selected.length} onClick={() => setReviewing(true)}>Remove ({selected.length})</button>
      </div>
      <div className="rowList">{discardable.map(c => <label className="itemRow check" key={c.id}>
        <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
        <span><strong>{c.name}</strong><small>{c.detail}</small></span>
      </label>)}</div>
    </>}

    <details className="drawer">
      <summary>All equipment ({data.gear.length})</summary>
      <div className="rowList">{SLOTS.flatMap(slot => data.gear.filter(g => g.slot === slot)).map(item =>
        <ItemRow key={item.id} item={item} onOpen={() => setEditing(structuredClone(item))} />)}</div>
      {!data.gear.length && <Empty>No equipment yet</Empty>}
    </details>

    <details className="drawer">
      <summary>Gavels ({data.trophies.length})</summary>
      {bestGavels?.trophies.length ? <p className="muted">Best: {bestGavels.trophies.map(gavelLabel).join(' / ')}</p> : null}
      <div className="rowList">{data.trophies.map(t => <button className="itemRow" key={t.id} onClick={() => setGavel(structuredClone(t))}>
        <strong>{gavelLabel(t)}</strong>{t.gradeStars ? <small>{t.gradeStars}★</small> : null}
      </button>)}</div>
      {!data.trophies.length && <Empty>No Gavels</Empty>}
    </details>

    {editing && <GearEditor key={editing.id} item={editing} mode="edit" onClose={() => setEditing(null)} onSave={saveGear}
      onDelete={() => { if (confirm(`Delete ${itemTitle(editing)}?`)) { setData({ ...data, gear: data.gear.filter(g => g.id !== editing.id) }); setEditing(null); } }} />}
    {gavel && <TrophyEditor item={gavel} weights={data.trophySettings.mutationWeights} mode="edit" onClose={() => setGavel(null)} onSave={saveGavel} />}
    {reviewing && <Modal title={`Remove ${selected.length} item${selected.length === 1 ? '' : 's'}?`} onClose={() => setReviewing(false)} actions={<>
      <button className="secondary" onClick={() => setReviewing(false)}>Cancel</button>
      <button className="danger" disabled={!selected.length} onClick={remove}>Remove {selected.length}</button>
    </>}>
      <ul className="reviewList">{selected.map(c => <li key={c.id}>{c.name}<small> · {c.detail}</small></li>)}</ul>
    </Modal>}
  </section>;
}
