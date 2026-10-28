import { useRef, useState, type ReactNode } from 'react';
import { DEFAULT_TROPHY_SETTINGS, makeEmptyData } from '../defaults';
import { controlsFor, groupControls, resetPreferenceSection, roundedShares, setPreference, setWeightShare, sliderView, SLIDER_MAX, weightShares, type PreferenceControl, type PreferenceSection, type WeightGroup } from '../engine/preferences';
import { arrowTargetBand } from '../engine/scoring';
import { algorithmIssues } from '../engine/settingsValidation';
import { authenticationCatalogueIssues } from '../engine/authModel';
import { LEGACY_ALIEN_EFFECTS } from '../authentication';
import { csvToGear, gearToCsv } from '../data/csv';
import { exportJson, importJson } from '../data/storage';
import { CatalogueRow, newAuthModelEntry } from '../components/CertificateEditors';
import type { AppData, GearItem } from '../types';
import type { CloudSync } from '../hooks/useCloudSync';
import { CLOUD_SETUP_SQL, cloudConfigProblem } from '../data/cloud';
import { dateStamp, downloadText, Notice, num, type SetData } from '../ui';

function Slider({ control, data, setData }: { control: PreferenceControl; data: AppData; setData: SetData }) {
  const view = sliderView(control, data);
  const id = `pref-${control.id}`;
  const shown = view.custom ? num(view.exact, 2) : String(view.position);
  return <div className="slider">
    <label htmlFor={id}>{control.labelFor?.(data) ?? control.label}</label>
    <input id={id} type="range" min={0} max={SLIDER_MAX} step={1} value={view.position}
      aria-valuetext={`${shown}${view.custom ? ' (custom)' : ''} of ${SLIDER_MAX}`}
      onChange={e => setData(setPreference(data, control, Number(e.target.value)))} />
    <output htmlFor={id}>{shown}{view.custom && <small> custom</small>}</output>
  </div>;
}

/** One weight in a group whose weights always add up to 100%. */
function ShareSlider({ control, group, data, setData }: { control: PreferenceControl; group: WeightGroup; data: AppData; setData: SetData }) {
  const controls = groupControls(group);
  const index = controls.findIndex(c => c.id === control.id);
  const exact = weightShares(data, group);
  const shown = roundedShares(exact)[index];
  const id = `pref-${control.id}`;
  return <div className="slider">
    <label htmlFor={id}>{control.labelFor?.(data) ?? control.label}</label>
    <input id={id} type="range" min={0} max={100} step={1} value={Math.round(exact[index])}
      aria-valuetext={`${shown}%`}
      onChange={e => setData(setWeightShare(data, group, control.id, Number(e.target.value)))} />
    <output htmlFor={id}>{shown}%</output>
  </div>;
}

function Section({ title, data, setData, section, note, children }: { title: string; data: AppData; setData: SetData; section?: PreferenceSection; note?: string; children?: ReactNode }) {
  const controls = section ? controlsFor(section) : [];
  const priorities = controls.filter(control => !control.group);
  const weights = controls.filter(control => control.group);
  return <div className="prefSection">
    <div className="prefHeader"><h2>{title}</h2>{section && <button className="link" onClick={() => setData(resetPreferenceSection(data, section))}>Reset</button>}</div>
    {note && <p className="prefNote">{note}</p>}
    {priorities.map(control => <Slider key={control.id} control={control} data={data} setData={setData} />)}
    {weights.length > 0 && <div className="weightGroup" role="group" aria-label={`${title} weights, total 100%`}>
      {weights.map(control => <ShareSlider key={control.id} control={control} group={control.group!} data={data} setData={setData} />)}
    </div>}
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

export function Preferences({ data, setData, cloud }: { data: AppData; setData: SetData; cloud?: CloudSync }) {
  const jsonRef = useRef<HTMLInputElement>(null), csvRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string }>();
  const issues = algorithmIssues(data.settings);
  const catalogueIssues = authenticationCatalogueIssues(data.authModel);
  const trophy = data.trophySettings;
  const setTrophy = (next: AppData['trophySettings']) => setData({ ...data, trophySettings: next });
  const finiteOr = (value: string, fallback: number) => { const n = Number(value); return value.trim() !== '' && Number.isFinite(n) ? n : fallback; };

  return <section aria-labelledby="prefs-heading">
    <h1 id="prefs-heading">Preferences</h1>
    {issues.length > 0 && <Notice tone="danger">Fix: {issues.join(' · ')}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}

    <Section title="Auctions" section="Auctions" data={data} setData={setData}
      note={`Reaching ${arrowTargetBand(data.settings).min}–${arrowTargetBand(data.settings).max}% Bid Arrow reduction always comes first.`} />
    <Section title="Drink Prep" section="Drink Prep" data={data} setData={setData} />
    <Section title="Grading" section="Grading" data={data} setData={setData} />
    <Section title="Shop / Idle" section="Shop / Idle" data={data} setData={setData} />

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

    {cloud && <CloudSection cloud={cloud} />}

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

const PAGE_URL = 'https://joepepper1990.github.io/storage-hunters-gear-optimizer/';

/** Cloud sync with the user's own Supabase project: set up, sign in, status. */
function CloudSection({ cloud }: { cloud: CloudSync }) {
  const [url, setUrl] = useState(''), [key, setKey] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [note, setNote] = useState<{ tone: 'info' | 'danger'; text: string }>();
  const act = (work: () => Promise<string | void>) => { setNote(undefined); work().then(text => text && setNote({ tone: 'info', text })).catch(e => setNote({ tone: 'danger', text: e instanceof Error ? e.message : String(e) })); };
  const when = cloud.lastSynced ? new Date(cloud.lastSynced).toLocaleString() : 'not yet';
  return <div className="prefSection">
    <h2>Cloud sync</h2>
    {note && <Notice tone={note.tone}>{note.text}</Notice>}
    {!cloud.configured && <>
      <p className="muted cloudNote">Keeps your data in your own Supabase project, so every device you sign in on has the same inventory. Nothing is shared with anyone else.</p>
      <div className="formGrid">
        <label className="wide">Project URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" autoComplete="off" /></label>
        <label className="wide">Public anon key<input value={key} onChange={e => setKey(e.target.value)} placeholder="eyJ… or sb_publishable_…" autoComplete="off" /></label>
      </div>
      <button className="primary" onClick={() => { const problem = cloudConfigProblem(url, key); if (problem) setNote({ tone: 'danger', text: problem }); else { setNote(undefined); cloud.configure(url, key); } }}>Connect</button>
      <details className="compactDetails"><summary>Setting up Supabase (once)</summary>
        <ol className="cloudSteps">
          <li>In Supabase, open your project (or create one).</li>
          <li>SQL Editor → New query → paste this and Run:<pre className="cloudSql">{CLOUD_SETUP_SQL}</pre>
            <button className="secondary compact" onClick={() => { void navigator.clipboard?.writeText(CLOUD_SETUP_SQL); setNote({ tone: 'info', text: 'Setup script copied' }); }}>Copy script</button></li>
          <li>Authentication → URL Configuration: set Site URL to <code>{PAGE_URL}</code></li>
          <li>Project Settings → API: copy the Project URL and the anon public key into the fields above.</li>
        </ol>
      </details>
    </>}
    {cloud.configured && cloud.status === 'signed-out' && <>
      <div className="formGrid">
        <label className="wide">Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
        <label className="wide">Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
      </div>
      <div className="buttonGrid">
        <button className="primary" onClick={() => act(() => cloud.signIn(email, password))}>Sign in</button>
        <button className="secondary" onClick={() => act(() => cloud.signUp(email, password))}>Create account</button>
      </div>
      <button className="link danger" onClick={() => { if (confirm('Disconnect this device from cloud sync? Your data on this device stays.')) void cloud.disconnect(); }}>Disconnect</button>
    </>}
    {cloud.configured && cloud.status !== 'signed-out' && cloud.status !== 'off' && <>
      <p className="cloudStatus"><strong>{cloud.status === 'syncing' ? 'Syncing…' : cloud.status === 'synced' ? 'Synced' : cloud.status === 'conflict' ? 'Waiting for your choice' : 'Sync failed'}</strong>
        {cloud.email && <span> · {cloud.email}</span>}<span className="muted"> · last synced {when}</span></p>
      {cloud.status === 'error' && cloud.message && <Notice tone="danger">{cloud.message}</Notice>}
      <div className="buttonGrid">
        <button className="secondary" onClick={() => cloud.syncNow()}>Sync now</button>
        <button className="secondary" onClick={() => act(() => cloud.signOut())}>Sign out</button>
      </div>
    </>}
  </div>;
}
