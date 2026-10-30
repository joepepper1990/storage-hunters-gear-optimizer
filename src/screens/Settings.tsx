import { useRef, useState } from 'react';
import { makeEmptyData } from '../defaults';
import { csvToGear, gearToCsv } from '../data/csv';
import { exportJson, importJson } from '../data/storage';
import type { AppData, GearItem } from '../types';
import type { CloudSync } from '../hooks/useCloudSync';
import { CLOUD_SETUP_SQL, cloudConfigProblem, OWNER_PROJECT } from '../data/cloud';
import { dateStamp, downloadText, Notice, type SetData } from '../ui';

function prepareImportedGear(existing: GearItem[], incoming: GearItem[]): GearItem[] {
  const used = new Set(existing.map(x => x.id));
  return incoming.map(item => { const clone = structuredClone(item); if (!clone.id || used.has(clone.id)) clone.id = crypto.randomUUID(); used.add(clone.id); return clone; });
}

/**
 * Settings hold only things that are not optimisation: sync, backups, theme and reset.
 * The optimiser's policy (Arrow band, stat priorities, certificate rules) is fixed in the engine.
 */
export function Settings({ data, setData, cloud }: { data: AppData; setData: SetData; cloud?: CloudSync }) {
  const jsonRef = useRef<HTMLInputElement>(null), csvRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string }>();

  return <section aria-labelledby="settings-heading">
    <h1 id="settings-heading">Settings</h1>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}

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

    <div className="prefSection">
      <h2>Appearance</h2>
      <label className="inlineSelect">Theme<select value={data.theme} onChange={e => setData({ ...data, theme: e.target.value as AppData['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    </div>

    <details className="drawer"><summary>Reset</summary>
      <button className="danger" onClick={() => { if (prompt('Type RESET ALL DATA to clear everything.') === 'RESET ALL DATA') setData(makeEmptyData()); }}>Clear all local data</button>
    </details>
  </section>;
}

const PAGE_URL = 'https://joepepper1990.github.io/storage-hunters-gear-optimizer/';

/** Cloud sync with the user's own Supabase project: set up, sign in, status. */
function CloudSection({ cloud }: { cloud: CloudSync }) {
  const [url, setUrl] = useState(OWNER_PROJECT.url), [key, setKey] = useState(OWNER_PROJECT.anonKey);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [note, setNote] = useState<{ tone: 'info' | 'danger'; text: string }>();
  const act = (work: () => Promise<string | void>) => { setNote(undefined); work().then(text => text && setNote({ tone: 'info', text })).catch(e => setNote({ tone: 'danger', text: e instanceof Error ? e.message : String(e) })); };
  const when = cloud.lastSynced ? new Date(cloud.lastSynced).toLocaleString() : 'not yet';
  return <div className="prefSection">
    <h2>Cloud sync</h2>
    {note && <Notice tone={note.tone}>{note.text}</Notice>}
    {!cloud.configured && <>
      <p className="muted cloudNote">Keeps your data in your own Supabase project, so every device you sign in on has the same inventory. Nothing is shared with anyone else. Your storage-hunters project is filled in: tap Connect.</p>
      <div className="formGrid">
        <label className="wide">Project URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" autoComplete="off" /></label>
        <label className="wide">Public anon key<input value={key} onChange={e => setKey(e.target.value)} placeholder="eyJ… or sb_publishable_…" autoComplete="off" /></label>
      </div>
      <button className="primary" onClick={() => { const problem = cloudConfigProblem(url, key); if (problem) setNote({ tone: 'danger', text: problem }); else { setNote(undefined); cloud.configure(url, key); } }}>Connect</button>
      <details className="compactDetails"><summary>Using a different Supabase project</summary>
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
