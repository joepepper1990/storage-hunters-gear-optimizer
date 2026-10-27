import { useRef, useState, type ReactNode } from 'react';
import { DEFAULT_TROPHY_SETTINGS, DEFAULT_VEHICLE_PROFILE, makeEmptyData } from '../defaults';
import { controlsFor, resetPreferenceSection, setPreference, sliderView, SLIDER_MAX, type PreferenceControl, type PreferenceSection } from '../engine/preferences';
import { algorithmIssues } from '../engine/settingsValidation';
import { authenticationCatalogueIssues } from '../engine/authModel';
import { LEGACY_ALIEN_EFFECTS } from '../authentication';
import { csvToGear, gearToCsv } from '../data/csv';
import { exportJson, importJson } from '../data/storage';
import { CatalogueRow, newAuthModelEntry } from '../components/CertificateEditors';
import type { AppData, GearItem, VehicleProfile } from '../types';
import { dateStamp, downloadText, Notice, num, type SetData } from '../ui';

function Slider({ control, data, setData }: { control: PreferenceControl; data: AppData; setData: SetData }) {
  const view = sliderView(control, data);
  const id = `pref-${control.id}`;
  const shown = view.custom ? num(view.exact, 2) : String(view.position);
  return <div className="slider">
    <label htmlFor={id}>{control.label}</label>
    <input id={id} type="range" min={0} max={SLIDER_MAX} step={1} value={view.position}
      aria-valuetext={`${shown}${view.custom ? ' (custom)' : ''} of ${SLIDER_MAX}`}
      onChange={e => setData(setPreference(data, control, Number(e.target.value)))} />
    <output htmlFor={id}>{shown}{view.custom && <small> custom</small>}</output>
  </div>;
}

function Section({ title, data, setData, section, children }: { title: string; data: AppData; setData: SetData; section?: PreferenceSection; children?: ReactNode }) {
  return <div className="prefSection">
    <div className="prefHeader"><h2>{title}</h2>{section && <button className="link" onClick={() => setData(resetPreferenceSection(data, section))}>Reset</button>}</div>
    {section && controlsFor(section).map(control => <Slider key={control.id} control={control} data={data} setData={setData} />)}
    {children}
  </div>;
}

/** Stored model parameters stay editable here so earlier custom values remain reachable. */
const MODEL_FIELDS: Array<[keyof Omit<AppData['settings'], 'version'>, string]> = [
  ['arrowSweetSpot', 'Arrow band start %'], ['zoneBreakpoint1', 'Zone breakpoint 1'], ['zoneBreakpoint2', 'Zone breakpoint 2'],
  ['zoneMultiplier2', 'Zone middle multiplier'], ['zoneMultiplier3', 'Zone upper multiplier'], ['energyTarget', 'Energy target'],
  ['energyCeiling', 'Energy ceiling'], ['energySecondStageMultiplier', 'Energy above-target multiplier']
];

function prepareImportedGear(existing: GearItem[], incoming: GearItem[]): GearItem[] {
  const used = new Set(existing.map(x => x.id));
  return incoming.map(item => { const clone = structuredClone(item); if (!clone.id || used.has(clone.id)) clone.id = crypto.randomUUID(); used.add(clone.id); return clone; });
}

export function Preferences({ data, setData }: { data: AppData; setData: SetData }) {
  const jsonRef = useRef<HTMLInputElement>(null), csvRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string }>();
  const issues = algorithmIssues(data.settings);
  const catalogueIssues = authenticationCatalogueIssues(data.authModel);
  const trophy = data.trophySettings;
  const setTrophy = (next: AppData['trophySettings']) => setData({ ...data, trophySettings: next });
  const setProfile = <K extends keyof VehicleProfile>(key: K, value: VehicleProfile[K]) => setData({ ...data, vehicleProfile: { ...data.vehicleProfile, [key]: value } });
  const finiteOr = (value: string, fallback: number) => { const n = Number(value); return value.trim() !== '' && Number.isFinite(n) ? n : fallback; };

  return <section aria-labelledby="prefs-heading">
    <h1 id="prefs-heading">Preferences</h1>
    {issues.length > 0 && <Notice tone="danger">Fix: {issues.join(' · ')}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}

    <Section title="Auctions" section="Auctions" data={data} setData={setData} />
    <Section title="Drink Prep" section="Drink Prep" data={data} setData={setData} />
    <Section title="Grading" section="Grading" data={data} setData={setData} />
    <Section title="Shop / Idle" section="Shop / Idle" data={data} setData={setData} />
    <Section title="Vehicle" section="Vehicle" data={data} setData={setData} />

    <div className="prefSection">
      <div className="prefHeader"><h2>Gavels</h2><button className="link" onClick={() => { if (confirm('Reset Gavel slots and mutation values to defaults?')) setTrophy(structuredClone(DEFAULT_TROPHY_SETTINGS)); }}>Reset</button></div>
      <label className="inlineSelect">Gavel slots<select value={trophy.maxActive} onChange={e => setTrophy({ ...trophy, maxActive: Number(e.target.value) === 3 ? 3 : 4 })}><option value={3}>3</option><option value={4}>4</option></select></label>
      <details className="compactDetails"><summary>Mutation values</summary>
        <div className="weightList">{trophy.mutationWeights.map(w => <div className="weightRow" key={w.mutation}>
          <label className="check"><input type="checkbox" checked={w.enabled} onChange={e => setTrophy({ ...trophy, mutationWeights: trophy.mutationWeights.map(x => x.mutation === w.mutation ? { ...x, enabled: e.target.checked } : x) })} /> {w.mutation}</label>
          <input type="number" min="0" step="any" inputMode="decimal" aria-label={`${w.mutation} value`} value={w.multiplier}
            onChange={e => setTrophy({ ...trophy, mutationWeights: trophy.mutationWeights.map(x => x.mutation === w.mutation ? { ...x, multiplier: Math.max(0, finiteOr(e.target.value, x.multiplier)) } : x) })} />
        </div>)}</div>
        <button className="secondary compact" onClick={() => { const name = prompt('Mutation name')?.trim(); if (name && !trophy.mutationWeights.some(w => w.mutation.toLowerCase() === name.toLowerCase())) setTrophy({ ...trophy, mutationWeights: [...trophy.mutationWeights, { mutation: name, multiplier: 1, enabled: true, confidence: 'Uncertain' }] }); }}>＋ Mutation</button>
      </details>
    </div>

    <div className="prefSection">
      <h2>Backup</h2>
      <div className="buttonGrid">
        <button className="primary" onClick={() => downloadText(`storage-hunters-backup-${dateStamp()}.json`, exportJson(data), 'application/json')}>Download backup</button>
        <button className="secondary" onClick={() => jsonRef.current?.click()}>Restore backup</button>
        <button className="secondary" onClick={() => downloadText(`storage-hunters-gear-${dateStamp()}.csv`, gearToCsv(data.gear), 'text/csv')}>Export gear CSV</button>
        <button className="secondary" onClick={() => csvRef.current?.click()}>Import gear CSV</button>
      </div>
      <input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e => {
        const file = e.target.files?.[0]; e.currentTarget.value = ''; if (!file) return;
        try { const restored = importJson(await file.text()); if (confirm(`Replace all local data with this backup (${restored.gear.length} gear)?`)) { setData(restored); setMessage({ tone: 'info', text: 'Backup restored' }); } }
        catch (err) { setMessage({ tone: 'danger', text: `Restore failed: ${err instanceof Error ? err.message : 'invalid backup'}` }); }
      }} />
      <input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e => {
        const file = e.target.files?.[0]; e.currentTarget.value = ''; if (!file) return;
        try { const rows = csvToGear(await file.text()); if (confirm(`Add ${rows.length} gear from CSV?`)) { setData({ ...data, gear: [...data.gear, ...prepareImportedGear(data.gear, rows)] }); setMessage({ tone: 'info', text: 'CSV imported' }); } }
        catch (err) { setMessage({ tone: 'danger', text: `Import failed: ${err instanceof Error ? err.message : 'invalid CSV'}` }); }
      }} />
    </div>

    <div className="prefSection">
      <h2>Appearance</h2>
      <label className="inlineSelect">Theme<select value={data.theme} onChange={e => setData({ ...data, theme: e.target.value as AppData['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    </div>

    <details className="drawer maintenance"><summary>Maintenance</summary>
      <h3>Vehicle profile</h3>
      <div className="formGrid">
        <label className="wide">Vehicle<input value={data.vehicleProfile.name} onChange={e => setProfile('name', e.target.value)} /></label>
        {([['baseSpeed', 'Base speed'], ['baseAcceleration', 'Base acceleration'], ['baseHandling', 'Base handling'], ['baseCapacityKg', 'Base capacity kg'], ['capacityMultiplier', 'Capacity multiplier']] as const).map(([key, label]) =>
          <label key={key}>{label}<input type="number" step="any" inputMode="decimal" value={data.vehicleProfile[key]} onChange={e => setProfile(key, finiteOr(e.target.value, data.vehicleProfile[key]))} /></label>)}
        <button className="secondary compact wide" onClick={() => setData({ ...data, vehicleProfile: { ...DEFAULT_VEHICLE_PROFILE } })}>Reset vehicle profile</button>
      </div>
      <h3>Model values</h3>
      <div className="formGrid">{MODEL_FIELDS.map(([key, label]) => <label key={key}>{label}<input type="number" step="any" inputMode="decimal" value={data.settings[key]}
        onChange={e => setData({ ...data, settings: { ...data.settings, [key]: finiteOr(e.target.value, data.settings[key]) } })} /></label>)}</div>
      <h3>Certificate outcomes</h3>
      {catalogueIssues.length > 0 && <Notice tone="warning">Catalogue conflicts: {catalogueIssues.join(' · ')}</Notice>}
      <div className="catalogue">{data.authModel.filter(m => m.certificateType !== 'Certificate of Alienticity' && !LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice()
        .sort((a, b) => (a.certificateInventoryType ?? '').localeCompare(b.certificateInventoryType ?? '') || a.slot.localeCompare(b.slot) || a.outcome.localeCompare(b.outcome))
        .map(m => <CatalogueRow key={m.id} entry={m} onChange={entry => setData({ ...data, authModel: data.authModel.map(x => x.id === entry.id ? entry : x) })}
          onDelete={() => { if (confirm(`Remove outcome ${m.outcome}? History is kept.`)) setData({ ...data, authModel: data.authModel.filter(x => x.id !== m.id) }); }} />)}</div>
      <button className="secondary compact" onClick={() => setData({ ...data, authModel: [...data.authModel, newAuthModelEntry()] })}>＋ Outcome</button>
      <h3>Reset</h3>
      <button className="danger" onClick={() => { if (prompt('Type RESET ALL DATA to clear everything.') === 'RESET ALL DATA') setData(makeEmptyData()); }}>Clear all local data</button>
    </details>
  </section>;
}
