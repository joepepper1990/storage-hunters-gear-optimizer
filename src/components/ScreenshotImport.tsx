import { useEffect, useRef, useState } from 'react';
import { applyDraft, knownSlots, matchDraft, type ImportDraft } from '../data/screenshotImport';
import { AUTH_EFFECTS, parsePanel } from '../scanner/panel';
import { createPanelReader } from '../scanner/panelOcr';
import { CERTIFICATE_TYPES } from '../engine/certificateInventory';
import { gameArrowToReduction, reductionToGameArrow } from '../engine/scoring';
import type { AppData, Authentication, GearStats, Slot } from '../types';
import { Modal, NumberInput, STAT_LABELS, type SetData } from '../ui';

interface Entry { id: string; fileName: string; previewUrl: string; fullUrl: string; draft: ImportDraft; state: 'pending' | 'approved' | 'skipped' }

const EDITABLE_STATS = STAT_LABELS.filter(([key]) => key !== 'vehicle');
const STARS = [0, 1, 2, 3, 4, 5];
const numberOr = (value: string, fallback: number | undefined) => value.trim() === '' ? fallback : Number.isFinite(Number(value)) ? Number(value) : fallback;

function GearFields({ draft, onChange }: { draft: Extract<ImportDraft, { kind: 'gear' }>; onChange: (next: ImportDraft) => void }) {
  const set = (patch: Partial<typeof draft>) => onChange({ ...draft, ...patch });
  const setStat = (key: keyof GearStats, value: number) => set({ stats: { ...draft.stats, [key]: value } });
  const setAuth = (patch: Partial<Authentication>) => {
    const next = { ...draft.authentication, ...patch };
    set({ authentication: next.effect ? { ...next, kind: next.kind === 'None' ? 'Normal' : next.kind } : { kind: 'None', effect: '', value: 0 } });
  };
  const focused = /^focus(ed)?$/i.test(draft.authentication.effect);
  // Only the stats the item has are shown; a stat the reader missed can be added.
  const [added, setAdded] = useState<Array<keyof GearStats>>([]);
  const shown = EDITABLE_STATS.filter(([key]) => draft.stats[key] !== 0 || added.includes(key));
  const missing = EDITABLE_STATS.filter(([key]) => !shown.some(([k]) => k === key));
  return <div className="formGrid">
    <label className="wide">Name<input value={draft.baseName} onChange={e => set({ baseName: e.target.value })} /></label>
    <label>Slot<select value={draft.slot ?? ''} onChange={e => set({ slot: (e.target.value || undefined) as Slot | undefined })}>
      <option value="">Choose</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
    <label>Stars<select value={draft.stars} onChange={e => set({ stars: Number(e.target.value) })}>{STARS.map(n => <option key={n} value={n}>{n ? `${n}★` : 'Not graded'}</option>)}</select></label>
    <label>Mutation<input value={draft.mutation} onChange={e => set({ mutation: e.target.value })} /></label>
    <label>Condition %<input type="number" min={0} max={100} inputMode="decimal" value={draft.conditionPct ?? ''} onChange={e => set({ conditionPct: numberOr(e.target.value, undefined) })} /></label>
    {shown.map(([key, label]) => <label key={key}>{label} %
      <NumberInput value={key === 'arrowReduction' ? reductionToGameArrow(draft.stats[key]) : draft.stats[key]}
        onValue={v => setStat(key, key === 'arrowReduction' ? gameArrowToReduction(v) : v)} /></label>)}
    {missing.length > 0 && <label>Add a stat<select value="" onChange={e => setAdded(current => [...current, e.target.value as keyof GearStats])}>
      <option value="">＋ Stat</option>{missing.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
    <label>Authentication<select value={draft.authentication.effect} onChange={e => setAuth({ effect: e.target.value })}>
      <option value="">None</option>{[...new Set([draft.authentication.effect, ...AUTH_EFFECTS])].filter(Boolean).map(a => <option key={a}>{a}</option>)}</select></label>
    {draft.authentication.effect && <>
      <label>Value %<NumberInput value={draft.authentication.value} onValue={value => setAuth({ value })} /></label>
      <label>Kind<select value={draft.authentication.kind} onChange={e => setAuth({ kind: e.target.value as Authentication['kind'] })}><option>Normal</option><option>Premium</option><option>Limited</option></select></label>
    </>}
    {focused && <label className="check wide"><input type="checkbox" checked={Boolean(draft.baseConfirmed)} onChange={e => set({ baseConfirmed: e.target.checked })} /> Base stats checked</label>}
  </div>;
}

function GavelFields({ draft, onChange }: { draft: Extract<ImportDraft, { kind: 'gavel' }>; onChange: (next: ImportDraft) => void }) {
  const set = (patch: Partial<typeof draft>) => onChange({ ...draft, ...patch });
  const setRow = (index: number, patch: Partial<typeof draft.modifiers[number]>) => set({ modifiers: draft.modifiers.map((m, i) => i === index ? { ...m, ...patch } : m) });
  return <div className="formGrid">
    {draft.modifiers.map((m, i) => <div className="wide importRow" key={i}>
      <label>Mutation<input value={m.mutation} onChange={e => setRow(i, { mutation: e.target.value })} /></label>
      <label>Boost %<input type="number" step="any" inputMode="decimal" value={m.boostPct} onChange={e => setRow(i, { boostPct: numberOr(e.target.value, 0)! })} /></label>
      <button className="link danger" onClick={() => set({ modifiers: draft.modifiers.filter((_, j) => j !== i) })}>Remove</button>
    </div>)}
    {draft.modifiers.length < 3 && <button className="secondary compact wide" onClick={() => set({ modifiers: [...draft.modifiers, { mutation: '', boostPct: 0 }] })}>＋ Mutation</button>}
    <label>Stars<select value={draft.stars} onChange={e => set({ stars: Number(e.target.value) })}>{STARS.map(n => <option key={n} value={n}>{n ? `${n}★` : 'Not graded'}</option>)}</select></label>
    <label>Condition %<input type="number" min={0} max={100} inputMode="decimal" value={draft.conditionPct ?? ''} onChange={e => set({ conditionPct: numberOr(e.target.value, undefined) })} /></label>
  </div>;
}

function CertificateFields({ draft, onChange }: { draft: Extract<ImportDraft, { kind: 'certificate' }>; onChange: (next: ImportDraft) => void }) {
  const set = (patch: Partial<typeof draft>) => onChange({ ...draft, ...patch });
  return <div className="formGrid">
    <label className="wide">Type<select value={draft.type} onChange={e => set({ type: e.target.value as typeof draft.type })}>{CERTIFICATE_TYPES.map(t => <option key={t} value={t}>{t.replace(' Certificate of Authenticity', '')}</option>)}</select></label>
    <label>Stars<select value={draft.stars} onChange={e => set({ stars: Number(e.target.value) })}>{STARS.map(n => <option key={n} value={n}>{n ? `${n}★` : 'Not graded'}</option>)}</select></label>
    <label>Mutation<input value={draft.mutation ?? ''} onChange={e => set({ mutation: e.target.value.trim() || undefined })} /></label>
  </div>;
}

const KIND_LABEL: Record<ImportDraft['kind'], string> = { gear: 'Gear', gavel: 'Gavel', certificate: 'Certificate', unknown: 'Not recognised' };

export function ScreenshotImport({ data, setData, onClose }: { data: AppData; setData: SetData; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number; status: string }>();
  const [zoom, setZoom] = useState<string>();
  const [error, setError] = useState('');
  const urls = useRef<string[]>([]);
  const closed = useRef(false);
  // Closing stops any reading still in progress and frees every screenshot it loaded.
  useEffect(() => { closed.current = false; return () => { closed.current = true; urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; }; }, []);

  const readFiles = async (files: File[]) => {
    if (!files.length) return;
    setError(''); setReading({ done: 0, total: files.length, status: 'Loading text reader' });
    let reader: Awaited<ReturnType<typeof createPanelReader>> | undefined;
    try {
      reader = await createPanelReader();
      const slots = knownSlots(data);
      for (const [index, file] of files.entries()) {
        if (closed.current) break;
        setReading({ done: index, total: files.length, status: `Reading ${file.name}` });
        try {
          const image = await reader.read(file);
          if (closed.current) { URL.revokeObjectURL(image.fullUrl); break; }
          urls.current.push(image.fullUrl);
          const entry: Entry = { id: crypto.randomUUID(), fileName: file.name, previewUrl: image.previewUrl, fullUrl: image.fullUrl, draft: parsePanel(image.read, slots), state: 'pending' };
          setEntries(current => [...current, entry]);
        } catch (e) {
          setEntries(current => [...current, { id: crypto.randomUUID(), fileName: file.name, previewUrl: '', fullUrl: '', state: 'pending',
            draft: { kind: 'unknown', stars: 0, warnings: [e instanceof Error ? e.message : 'Could not read this screenshot.'] } }]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The text reader could not start.');
    } finally {
      await reader?.close();
      setReading(undefined);
    }
  };

  const update = (id: string, patch: Partial<Entry>) => setEntries(current => current.map(e => e.id === id ? { ...e, ...patch } : e));
  const approve = (entry: Entry) => {
    try { setData(applyDraft(data, entry.draft)); update(entry.id, { state: 'approved' }); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save this item.'); }
  };
  const pending = entries.filter(e => e.state === 'pending').length;
  // Screenshots read cleanly (recognised, no warnings, nothing invalid) can be saved in one tap.
  const ready = entries.filter(e => e.state === 'pending' && e.draft.kind !== 'unknown' && !e.draft.warnings.length && matchDraft(data, e.draft).status !== 'invalid');
  const saveReady = () => {
    let next = data;
    const saved: string[] = [];
    try {
      for (const entry of ready) {
        if (matchDraft(next, entry.draft).status === 'invalid') continue;
        next = applyDraft(next, entry.draft);
        saved.push(entry.id);
      }
      setData(next);
      setEntries(current => current.map(e => saved.includes(e.id) ? { ...e, state: 'approved' } : e));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save these items.'); }
  };

  return <Modal title="Import screenshots" onClose={onClose}>
    <div className="importModal">
      {!entries.length && !reading && <div className="scannerStart">
        <p>Choose screenshots of your items. They are read on this device; clear ones can be saved in one tap, anything unclear is shown for you to check.</p>
        <button className="primary" onClick={() => fileRef.current?.click()}>Choose screenshots</button>
      </div>}
      {reading && <div className="scannerProgress" role="status"><progress max={reading.total} value={reading.done} /><span>{reading.status} · {reading.done} of {reading.total} done</span></div>}
      {error && <p className="formError" role="alert">{error}</p>}
      {entries.length > 0 && <p className="muted importSummary">{entries.length - pending} of {entries.length} done{pending ? ` · ${pending} to check` : ''}</p>}
      {ready.length > 0 && !reading && <button className="primary wideButton" onClick={saveReady}>Save all ready ({ready.length})</button>}
      {entries.map((entry, index) => {
        const match = matchDraft(data, entry.draft);
        const onChange = (draft: ImportDraft) => update(entry.id, { draft });
        const label = match.status === 'update' ? `Update ${match.name}` : match.status === 'add-one' ? `Add one (you have ${match.owned})` : 'Add';
        return <article className={`importCard ${entry.state}`} key={entry.id} aria-label={`Screenshot ${index + 1}`}>
          <header><strong>{index + 1}. {KIND_LABEL[entry.draft.kind]}</strong><span className="muted">{entry.fileName}</span>
            {entry.state !== 'pending' && <span className="chip">{entry.state === 'approved' ? 'Saved' : 'Skipped'}</span>}</header>
          {entry.state === 'pending' && <div className="importGrid">
            <div className="importImage">{entry.previewUrl
              ? <button className="imageButton" onClick={() => setZoom(entry.fullUrl)} aria-label="Show full screenshot"><img src={entry.previewUrl} alt={`Item panel from ${entry.fileName}`} /></button>
              : <p className="muted">No preview</p>}</div>
            <div className="importFields">
              {entry.draft.kind === 'gear' && <GearFields draft={entry.draft} onChange={onChange} />}
              {entry.draft.kind === 'gavel' && <GavelFields draft={entry.draft} onChange={onChange} />}
              {entry.draft.kind === 'certificate' && <CertificateFields draft={entry.draft} onChange={onChange} />}
              {entry.draft.warnings.length > 0 && <ul className="importWarnings">{entry.draft.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
              {match.status === 'invalid' && entry.draft.kind !== 'unknown' && <p className="formError">{match.reason}</p>}
              {match.status === 'update' && <div className="importChanges">{match.changes.length
                ? <><strong>Will change</strong><ul>{match.changes.map(c => <li key={c}>{c}</li>)}</ul></>
                : <strong>Matches your inventory exactly</strong>}</div>}
              {match.status === 'new' && entry.draft.kind !== 'certificate' && <div className="importChanges"><strong>New: not in your inventory yet</strong></div>}
              <div className="importActions">
                <button className="secondary" onClick={() => update(entry.id, { state: 'skipped' })}>Skip</button>
                {entry.draft.kind !== 'unknown' && <button className="primary" disabled={match.status === 'invalid'} onClick={() => approve(entry)}>{label}</button>}
              </div>
            </div>
          </div>}
        </article>;
      })}
      {entries.length > 0 && !reading && <button className="secondary importMore" onClick={() => fileRef.current?.click()}>＋ More screenshots</button>}
      <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={e => { const files = [...(e.target.files ?? [])]; e.currentTarget.value = ''; void readFiles(files); }} />
      {zoom && <div className="zoomOverlay" onClick={() => setZoom(undefined)} role="dialog" aria-label="Full screenshot"><img src={zoom} alt="Full screenshot" /></div>}
    </div>
  </Modal>;
}
