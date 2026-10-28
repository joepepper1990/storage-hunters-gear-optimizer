import { useState } from 'react';
import { effectiveItemStats } from '../engine/scoring';
import { generateGearName, generateTrophyName } from '../naming';
import { blankGear, duplicateGear, GearEditor } from '../components/GearEditor';
import { ScreenshotImport } from '../components/ScreenshotImport';
import { blankTrophy, TrophyEditor, validateTrophy } from '../components/TrophyEditor';
import { CertificateBatches } from './Certificates';
import type { AppData, GavelTrophy, GearItem, Slot } from '../types';
import { authSummary, Empty, gameStat, itemTitle, num, SHORT_STAT, STAT_LABELS, type SetData } from '../ui';

type Category = 'Gear' | 'Gavels' | 'Certificates';
const CATEGORIES: Category[] = ['Gear', 'Gavels', 'Certificates'];
type Editing<T> = { item: T; mode: 'add' | 'edit' } | null;

function Actions({ favourite, onFav, onEdit, onDuplicate, onDelete, name }: { favourite: boolean; onFav: () => void; onEdit: () => void; onDuplicate?: () => void; onDelete: () => void; name: string }) {
  return <div className="rowActions">
    <button className={`star ${favourite ? 'on' : ''}`} aria-pressed={favourite} aria-label={`${favourite ? 'Unfavourite' : 'Favourite'} ${name}`} onClick={onFav}>★</button>
    <button className="link" onClick={onEdit}>Edit</button>
    {onDuplicate && <button className="link" onClick={onDuplicate}>Duplicate</button>}
    <button className="link danger" onClick={onDelete}>Delete</button>
  </div>;
}

const stamp = <T extends { createdAt: string; updatedAt: string }>(item: T): T => { const now = new Date().toISOString(); return { ...item, updatedAt: now, createdAt: item.createdAt || now }; };
function upsert<T extends { id: string }>(list: T[], item: T, mode: 'add' | 'edit'): T[] { return mode === 'add' ? [...list, item] : list.map(x => x.id === item.id ? item : x); }

export function Inventory({ data, setData, initialCategory = 'Gear' }: { data: AppData; setData: SetData; initialCategory?: Category }) {
  const [category, setCategory] = useState<Category>(initialCategory);
  const [slot, setSlot] = useState<'All' | Slot>('All');
  const [query, setQuery] = useState('');
  const [gearEdit, setGearEdit] = useState<Editing<GearItem>>(null);
  const [trophyEdit, setTrophyEdit] = useState<Editing<GavelTrophy>>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const confirmDelete = (name: string) => confirm(`Delete ${name}?`);

  const saveGear = (item: GearItem, keepAdding = false) => {
    if (!gearEdit) return;
    setData({ ...data, gear: upsert(data.gear, stamp(item), gearEdit.mode) });
    setGearEdit(keepAdding ? { item: blankGear(item.slot), mode: 'add' } : null);
  };
  const saveTrophy = (input: GavelTrophy) => {
    const item = stamp({ ...input, name: generateTrophyName(input.modifiers) });
    const issue = validateTrophy(item); if (issue) { setError(issue); return; }
    setData({ ...data, trophies: upsert(data.trophies, item, trophyEdit!.mode) }); setTrophyEdit(null); setError('');
  };
  const copyOf = <T extends { id: string; createdAt: string; updatedAt: string }>(item: T): T => ({ ...structuredClone(item), id: crypto.randomUUID(), createdAt: '', updatedAt: '' });

  const q = query.trim().toLowerCase();
  const gear = data.gear.filter(i => (slot === 'All' || i.slot === slot) && (!q || i.name.toLowerCase().includes(q)));

  return <section aria-labelledby="inventory-heading">
    <h1 id="inventory-heading">Inventory</h1>
    <div className="segmented" role="tablist" aria-label="Category">{CATEGORIES.map(c => <button key={c} role="tab" aria-selected={category === c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
    {error && <p className="formError" role="alert">{error}</p>}

    {category === 'Gear' && <>
      <div className="toolbar">
        <button className="primary" onClick={() => setGearEdit({ item: blankGear(slot === 'All' ? 'Head' : slot), mode: 'add' })}>＋ Add gear</button>
        <button className="secondary" onClick={() => setScanning(true)}>Import screenshots</button>
      </div>
      <div className="toolbar">
        <input type="search" placeholder="Search" aria-label="Search gear" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Slot" value={slot} onChange={e => setSlot(e.target.value as 'All' | Slot)}><option>All</option><option>Head</option><option>Back</option><option>Wrist</option></select>
      </div>
      <ul className="itemList">{gear.map(item => {
        const stats = effectiveItemStats(item);
        return <li className="row" key={item.id}>
          <div className="rowMain">
            <strong>{itemTitle(item)}</strong>
            <span>{[item.slot, item.mutation && item.mutation !== 'None' ? item.mutation : '', authSummary(item)].filter(Boolean).join(' · ')}</span>
            <small>{STAT_LABELS.filter(([k]) => Math.abs(stats[k]) > 1e-12).map(([k]) => `${SHORT_STAT[k]} ${gameStat(k, stats[k])}`).join(' · ')}</small>
          </div>
          <Actions name={itemTitle(item)} favourite={item.favourite}
            onFav={() => setData({ ...data, gear: data.gear.map(g => g.id === item.id ? { ...g, favourite: !g.favourite, updatedAt: new Date().toISOString() } : g) })}
            onEdit={() => setGearEdit({ item: structuredClone(item), mode: 'edit' })}
            onDuplicate={() => setGearEdit({ item: duplicateGear(item), mode: 'add' })}
            onDelete={() => { if (confirmDelete(itemTitle(item))) setData({ ...data, gear: data.gear.filter(g => g.id !== item.id) }); }} />
        </li>;
      })}</ul>
      {!gear.length && <Empty>{data.gear.length ? 'No matches' : 'No gear'}</Empty>}
    </>}

    {category === 'Gavels' && <>
      <div className="toolbar"><button className="primary" onClick={() => setTrophyEdit({ item: blankTrophy(data.trophySettings.mutationWeights), mode: 'add' })}>＋ Add Gavel</button></div>
      <ul className="itemList">{data.trophies.map(t => <li className="row" key={t.id}>
        <div className="rowMain"><strong>{t.modifiers.map(m => `${m.mutation} +${num(m.boostPct)}%`).join(' · ') || t.name}</strong></div>
        <Actions name={t.name} favourite={t.favourite}
          onFav={() => setData({ ...data, trophies: data.trophies.map(x => x.id === t.id ? { ...x, favourite: !x.favourite, updatedAt: new Date().toISOString() } : x) })}
          onEdit={() => setTrophyEdit({ item: structuredClone(t), mode: 'edit' })}
          onDuplicate={() => setTrophyEdit({ item: copyOf(t), mode: 'add' })}
          onDelete={() => { if (confirmDelete(t.name)) setData({ ...data, trophies: data.trophies.filter(x => x.id !== t.id) }); }} />
      </li>)}</ul>
      {!data.trophies.length && <Empty>No Gavels</Empty>}
    </>}

    {category === 'Certificates' && <CertificateBatches data={data} setData={setData} />}

    {gearEdit && <GearEditor key={gearEdit.item.id} item={gearEdit.item} authModel={data.authModel} mode={gearEdit.mode} onClose={() => setGearEdit(null)} onSave={saveGear} />}
    {trophyEdit && <TrophyEditor item={trophyEdit.item} weights={data.trophySettings.mutationWeights} mode={trophyEdit.mode} onClose={() => setTrophyEdit(null)} onSave={saveTrophy} />}
    {scanning && <ScreenshotImport data={data} setData={setData} onClose={() => setScanning(false)} />}
  </section>;
}
