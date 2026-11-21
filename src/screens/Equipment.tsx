import { BestGavels } from '../components/BestGavels';
import { charmLabel } from '../engine/trophies';
import { useState } from 'react';
import { algorithmIssues } from '../engine/settingsValidation';
import { analyseTrophyRetention, trophyMutationBoost } from '../engine/trophies';
import { combineStats, effectiveItemStats } from '../engine/scoring';
import { classifyCollection, type CollectionRow, type MissingDisplay } from '../engine/collection';
import { buildGearLoadouts, type GearLoadoutResult } from '../engine/gearLoadouts';
import { GearEditor } from '../components/GearEditor';
import { TrophyEditor, validateTrophy } from '../components/TrophyEditor';
import { generateTrophyName } from '../naming';
import type { AppData, GavelTrophy, GearItem, ItemAnalysis, Slot } from '../types';
import { authSummary, Empty, gameStat, itemTitle, Modal, num, SHORT_STAT, type SetData } from '../ui';

export type EquipmentRow = CollectionRow;
export interface GavelRow { trophy: GavelTrophy; reason: string }
export interface EquipmentView {
  /** False while retention or the certificate targets are still being worked out: nothing is offered for discard then. */
  ready: boolean;
  /** Compatibility alias for retained accessory rows outside the worn set. */
  keep: EquipmentRow[];
  display?: EquipmentRow[];
  storage?: EquipmentRow[];
  missingDisplay?: MissingDisplay[];
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

/** Collection placement never changes ownership. Disposal requires a fresh retained-witness proof. */
export function equipmentView(data: AppData, analyses: ItemAnalysis[], current: boolean, certificateTargets?: Set<string>, best?: GearLoadoutResult): EquipmentView {
  const ready = current && certificateTargets !== undefined && algorithmIssues(data.settings).length === 0;
  const freshBest = best ?? (algorithmIssues(data.settings).length ? undefined : buildGearLoadouts(data.gear,data.settings).main);
  const wornIds = new Set(freshBest?[freshBest.head.id,freshBest.back.id,freshBest.wrist.id]:[]);
  const collection = classifyCollection(data.gear, wornIds, data.settings, { ready, certificateTargets, analyses });
  const gavelDiscard = ready ? analyseTrophyRetention(data.trophies, data.trophySettings)
    .filter(a => a.verdict === 'SAFE TO DISCARD' && !a.item.favourite)
    .map(a => ({ trophy: a.item, reason: a.dominator ? `Beaten by ${gavelLabel(a.dominator)}${beatenOn(a.item, a.dominator)}` : 'Beaten by another Gavel' })) : [];
  return { ready, ...collection, keep: [...collection.display, ...collection.storage], gavelDiscard };
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
  const itemLuck = combineStats([best.head, best.back, best.wrist]).luck;
  const modelledLuck = s.luck - itemLuck;
  return <div className="bestSet">
    {[best.head, best.back, best.wrist].map(item => <article className="pieceCard" key={item.id}>
      <span className="slotName">{item.slot}</span>
      <strong>{itemTitle(item)}</strong>
      {itemDetail(item) && <small>{itemDetail(item)}</small>}
      {keyStats(item) && <small>{keyStats(item)}</small>}
    </article>)}
    <details className="setBreakdown"><summary>Stat breakdown</summary><div className="totals" aria-label="Best Set totals">
      <span>Item Luck <b>{num(itemLuck)}</b></span>
      {Math.abs(modelledLuck) > 1e-9 && <span>Modelled Luck <b>{num(s.luck)}</b></span>}
      <span>Arrow <b>{num(s.arrowReduction)}%{best.arrowDistance <= 1e-9 ? ' ✓' : ''}</b></span>
      {Math.abs(s.zone) > 1e-9 && <span>Zone <b>{num(s.zone)}%</b></span>}
      {Math.abs(s.energy) > 1e-9 && <span>Energy <b>{num(s.energy)}%</b></span>}
    </div>
    {Math.abs(modelledLuck) > 1e-9 && <small>Includes {modelledLuck >= 0 ? '+' : ''}{num(modelledLuck)} Luck from modelled effects; excludes other game boosts.</small>}</details>
  </div>;
}

function copyEvidence(item: GearItem): string {
  const evidence = item as GearItem & { sourceImage?: string; needsReview?: boolean; metadataUncertain?: string[] };
  return [typeof item.displayedValue === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.displayedValue) : 'Value unknown', evidence.sourceImage,
    evidence.needsReview ? 'Needs stat review' : '', evidence.metadataUncertain?.length ? `Unverified: ${evidence.metadataUncertain.join(', ')}` : ''].filter(Boolean).join(' · ');
}
function ItemRow({ item, reason, onOpen }: { item: GearItem; reason?: string; onOpen: () => void }) {
  return <button className="itemRow" onClick={onOpen}>
    <strong>{itemTitle(item)}</strong>
    <small>{[keyStats(item), itemDetail(item)].filter(Boolean).join(' · ')}</small>
    <small>{copyEvidence(item)}</small>
    {reason && <em>{reason}</em>}
  </button>;
}

export function Equipment({ data, setData, best, view }: { data: AppData; setData: SetData; best?: GearLoadoutResult; view: EquipmentView }) {
  const [editing, setEditing] = useState<GearItem | null>(null);
  const [gavel, setGavel] = useState<GavelTrophy | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const [search,setSearch]=useState('');
  const [slotFilter,setSlotFilter]=useState('All');
  const matches = (item: GearItem) => (slotFilter === 'All' || item.slot === slotFilter) && [itemTitle(item), itemDetail(item), keyStats(item), copyEvidence(item)].join(' ').toLowerCase().includes(search.toLowerCase());
  const display = view.display ?? [];
  const storage = view.storage ?? view.keep;
  const discardable = [...view.discard.map(r => ({ id: r.item.id, name: itemTitle(r.item), detail: `${r.item.slot} · ${keyStats(r.item)} · ${copyEvidence(r.item)}`, item: r.item, reason: r.reason })),
    ...view.gavelDiscard.map(r => ({ id: r.trophy.id, name: gavelLabel(r.trophy), detail: 'Gavel', trophy: r.trophy, reason: r.reason }))];

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
    const item = { ...input, name: input.name || generateTrophyName(input.modifiers), updatedAt: new Date().toISOString() };
    const issue = validateTrophy(item); if (issue) { setError(issue); return; }
    setData({ ...data, trophies: data.trophies.map(t => t.id === item.id ? item : t) }); setGavel(null); setError('');
  };

  return <section aria-labelledby="equipment-heading">
    <h1 id="equipment-heading">Equipment</h1>
    {error && <p className="formError" role="alert">{error}</p>}

    <h2>Best Set</h2>
    {best ? <div className="rowList">{[best.head, best.back, best.wrist].map(item => <ItemRow key={item.id} item={item} reason="Current Best Set" onOpen={() => setEditing(structuredClone(item))} />)}</div>
      : <Empty>Add a Head, Back and Wrist</Empty>}

    <div className="inventoryFilters"><input aria-label="Search equipment" type="search" placeholder="Search your gear…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Equipment slot" value={slotFilter} onChange={e => setSlotFilter(e.target.value)}>{['All', ...SLOTS].map(slot => <option key={slot}>{slot}</option>)}</select></div>
    <details className="drawer"><summary>Display ({display.length})</summary>
      {display.length ? SLOTS.map(slot => {
        const rows = display.filter(r => r.item.slot === slot && matches(r.item));
        return rows.length ? <div key={slot}><h3>{slot}</h3><div className="rowList">{rows.map(r => <ItemRow key={r.item.id} item={r.item} reason={r.reason} onOpen={() => setEditing(structuredClone(r.item))} />)}</div></div> : null;
      }) : <Empty>No spare display copies</Empty>}
      {view.missingDisplay?.map(item => <p className="muted" key={`${item.slot}-${item.baseName}`}>{item.baseName}: another physical copy is needed for display; the owned copy is in the Best Set.</p>)}
    </details>
    <details className="drawer"><summary>Chest Storage ({storage.length})</summary>
      {!view.ready && <p className="updating" role="status">Updating…</p>}
      {storage.length ? SLOTS.map(slot => {
        const rows = storage.filter(r => r.item.slot === slot && matches(r.item));
        return rows.length ? <div key={slot}><h3>{slot}</h3><div className="rowList">{rows.map(r => <ItemRow key={r.item.id} item={r.item} reason={r.reason} onOpen={() => setEditing(structuredClone(r.item))} />)}</div></div> : null;
      }) : <Empty>No copies in storage</Empty>}
    </details>
    <details className="drawer"><summary>Discard ({discardable.length})</summary>
    {!view.ready && data.gear.length > 0 ? <p className="updating" role="status">Updating…</p> : !discardable.length ? <Empty>Nothing to discard</Empty> : <>
      <p className="muted">Accessory copies are ordered by current displayed item value, lowest first. This is not a guaranteed disband reward. Records stay owned until you confirm removal.</p>
      <div className="toolbar">
        <button className="secondary compact" onClick={() => setPicked(selected.length === discardable.length ? new Set() : new Set(discardable.map(c => c.id)))}>{selected.length === discardable.length ? 'Clear' : 'Select all'}</button>
        <button className="danger compact" disabled={!selected.length} onClick={() => setReviewing(true)}>Remove ({selected.length})</button>
      </div>
      <div className="rowList">{discardable.filter(c => !('item' in c) || matches(c.item)).map(c => <div className="itemRow check" key={c.id}>
        <label><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} /><span><strong>{c.name}</strong><small>{c.detail}</small><em>{c.reason}</em></span></label>
        <button className="secondary compact" aria-label={`Edit ${c.name}`} onClick={() => 'item' in c ? setEditing(structuredClone(c.item)) : setGavel(structuredClone(c.trophy))}>Edit</button>
      </div>)}</div>
    </>}
    </details>

    <BestGavels data={data} onEdit={setGavel}/>
    <details className="drawer">
      <summary>All Gavels ({data.trophies.length})</summary>

      <div className="rowList">{data.trophies.map(t => <button className="itemRow" key={t.id} onClick={() => setGavel(structuredClone(t))}>
        <strong>{t.name}</strong><small>{gavelLabel(t)}</small><small>{charmLabel(t)}</small>{t.gradeStars ? <small>{t.gradeStars}★</small> : null}
      </button>)}</div>
      {!data.trophies.length && <Empty>No Gavels</Empty>}
    </details>

    <details className="drawer"><summary>Spare charms ({data.looseCharms?.length??0} listed)</summary>
      <p className="muted">Your listed best spare charms; lesser owned charms are not included.</p>
      {(data.looseCharms??[]).map((c,i)=><p key={i}>{c.type} Charm · {c.value}{c.type==='Diamond'?' diamonds/hr':'%'}</p>)}
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
