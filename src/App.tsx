import { useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyData } from './defaults';
import { exportJson, loadData, onSavedElsewhere, saveData, saveEmergencyMirror } from './data/storage';
import { algorithmIssues } from './engine/settingsValidation';
import { useCertificateAnalysis, useGearAnalysis } from './hooks/useAnalysis';
import { buildCertificateQueue } from './engine/certificateQueue';
import { BestSetup } from './screens/BestSetup';
import { Certificates } from './screens/Certificates';
import { Discard } from './screens/Discard';
import { Inventory } from './screens/Inventory';
import { Preferences } from './screens/Preferences';
import type { AppData } from './types';
import { dateStamp, downloadText } from './ui';

export type Tab = 'Best' | 'Certificates' | 'Discard' | 'Inventory' | 'Preferences';
export const TABS: Array<{ tab: Tab; label: string; icon: string }> = [
  { tab: 'Best', label: 'Best setup', icon: '◎' },
  { tab: 'Certificates', label: 'Certificates', icon: '◈' },
  { tab: 'Discard', label: 'Discard', icon: '⌫' },
  { tab: 'Inventory', label: 'Inventory', icon: '◆' },
  { tab: 'Preferences', label: 'Preferences', icon: '⚙' }
];

const CONFLICT_WITH_CHANGES = 'Another window saved newer data. Download this window\'s changes, then Reload.';
const isConflict = (error: unknown) => (error as { name?: string } | undefined)?.name === 'StorageConflictError';

function applyTheme(theme: AppData['theme']) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>('Best');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  // `dirty` is true while this window holds a change of its own that has not finished
  // saving. A clean window has nothing to lose, so newer data saved by another window
  // (including that window's startup migration) is adopted instead of raising a conflict.
  const dirty = useRef(false);
  const latest = useRef<AppData | null>(null);
  // Data read back from storage is already saved; writing it again would only make other
  // windows reload in turn, so it is never re-saved.
  const adopted = useRef<AppData | null>(null);
  const edit = (next: AppData) => { dirty.current = true; setData(next); };
  latest.current = data;

  useEffect(() => { loadData().then(setData).catch(error => setLoadError(error instanceof Error ? error.message : String(error))); }, []);

  const adoptSaved = () => loadData().then(fresh => {
    // An edit made while reading would be lost by adopting; keep it and ask instead.
    if (dirty.current) { setSaveError(CONFLICT_WITH_CHANGES); return; }
    adopted.current = fresh;
    setSaveError('');
    setData(fresh);
  }).catch(() => setSaveError('Another window saved newer data. Reload to use it.'));

  // Another window saved: a clean window picks the new data up straight away.
  useEffect(() => onSavedElsewhere(() => { if (latest.current && !dirty.current) void adoptSaved(); }), []);

  useEffect(() => {
    if (!data) return;
    applyTheme(data.theme);
    if (data !== adopted.current) {
      void saveData(data).then(() => {
        if (latest.current === data) dirty.current = false;
        setSaveError('');
      }).catch(error => {
        if (isConflict(error) && !dirty.current) { void adoptSaved(); return; }
        setSaveError(isConflict(error) ? CONFLICT_WITH_CHANGES : 'Not saved. Download a backup before leaving.');
      });
    }
    const flush = () => {
      if (!dirty.current) return; // Nothing unsaved in this window to protect.
      try { saveEmergencyMirror(data); }
      catch (error) { setSaveError(isConflict(error) ? CONFLICT_WITH_CHANGES : error instanceof Error ? error.message : 'Recovery save failed. Download a backup.'); }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [data]);

  const gear = useGearAnalysis(data);
  // Shared so Discard never offers an item the certificate queue currently targets.
  // The Authenticator prompt id is session-only and never persisted.
  const [activePostRollId, setActivePostRollId] = useState<string>();
  const certificates = useCertificateAnalysis(data, activePostRollId);
  const queue = useMemo(() => certificates.current ? buildCertificateQueue(certificates.decisions) : undefined, [certificates.current, certificates.decisions]);
  const certificateTargets = useMemo(() => queue ? new Set(queue.rows.map(row => row.target.item.id)) : undefined, [queue]);

  if (!data) return <div className="splash">
    <div className="logoMark">SH</div>
    {loadError ? <>
      <strong>Storage could not be opened</strong>
      <p className="muted storageError">{loadError}</p>
      <button className="danger" onClick={() => { if (confirm('Start with empty data? Only do this if you have a backup.')) { edit(makeEmptyData()); setLoadError(''); } }}>Start empty</button>
    </> : <strong>Loading…</strong>}
  </div>;

  return <div className="appShell">
    <header className="topbar">
      <div className="brand"><div className="logoMark small">SH</div><strong>Storage Hunters Optimiser</strong></div>
      {(gear.computing || certificates.computing) && <span className="status" role="status">Updating…</span>}
    </header>
    {saveError && <div className="notice dangerNotice banner" role="alert">{saveError}
      <div className="actions">
        <button onClick={() => downloadText(`storage-hunters-backup-${dateStamp()}.json`, exportJson(data), 'application/json')}>Download</button>
        <button onClick={() => { if (confirm('Reload saved data? Download this tab first to keep its edits.')) window.location.reload(); }}>Reload</button>
      </div>
    </div>}
    {algorithmIssues(data.settings).length > 0 && tab !== 'Preferences' && <div className="notice dangerNotice banner" role="alert">Preferences need fixing <button className="link" onClick={() => setTab('Preferences')}>Open</button></div>}

    <main className="content">
      {tab === 'Best' && <BestSetup data={data} />}
      {tab === 'Certificates' && <Certificates data={data} setData={edit} analysis={certificates} queue={queue} onRecorded={setActivePostRollId} />}
      {tab === 'Discard' && <Discard data={data} setData={edit} gearAnalyses={gear.analyses} gearCurrent={gear.current} certificateTargets={certificateTargets} />}
      {tab === 'Inventory' && <Inventory data={data} setData={edit} />}
      {tab === 'Preferences' && <Preferences data={data} setData={edit} />}
    </main>

    <nav className="bottomNav" aria-label="Main">{TABS.map(t =>
      <button key={t.tab} className={tab === t.tab ? 'active' : ''} aria-current={tab === t.tab ? 'page' : undefined} onClick={() => setTab(t.tab)}>
        <span aria-hidden="true">{t.icon}</span>{t.label}
      </button>)}</nav>
  </div>;
}
