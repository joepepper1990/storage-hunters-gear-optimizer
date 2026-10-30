import { useEffect, useMemo, useRef, useState } from 'react';
import { makeEmptyData } from './defaults';
import { exportJson, keepThisWindow, loadData, onSavedElsewhere, saveData, saveEmergencyMirror } from './data/storage';
import { algorithmIssues } from './engine/settingsValidation';
import { useCertificateAnalysis, useGearAnalysis } from './hooks/useAnalysis';
import { useCloudSync } from './hooks/useCloudSync';
import { buildCertificateQueue } from './engine/certificateQueue';
import { buildGearLoadouts } from './engine/gearLoadouts';
import { addCertificateBatch } from './engine/certificateInventory';
import { Certificates } from './screens/Certificates';
import { Equipment, equipmentView } from './screens/Equipment';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { AddSheet, type AddChoice } from './components/AddSheet';
import { blankGear, GearEditor } from './components/GearEditor';
import { ScreenshotImport } from './components/ScreenshotImport';
import { blankTrophy, TrophyEditor, validateTrophy } from './components/TrophyEditor';
import { CertificateBatchEditor } from './components/CertificateEditors';
import { generateTrophyName } from './naming';
import type { AppData } from './types';
import { dateStamp, downloadText } from './ui';

export type Tab = 'Home' | 'Equipment' | 'Certificates' | 'Settings';
export const TABS: Array<{ tab: Exclude<Tab, 'Settings'>; label: string; icon: string }> = [
  { tab: 'Home', label: 'Home', icon: '◎' },
  { tab: 'Equipment', label: 'Equipment', icon: '◆' },
  { tab: 'Certificates', label: 'Certificates', icon: '◈' }
];

const CONFLICT_WITH_CHANGES = 'This app is also open somewhere else (another tab or the Home Screen app), and it saved first. Your changes here are not saved yet.';
const isConflict = (error: unknown) => (error as { name?: string } | undefined)?.name === 'StorageConflictError';

function applyTheme(theme: AppData['theme']) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>('Home');
  const [adding, setAdding] = useState<AddChoice | 'menu' | null>(null);
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

  const cloud = useCloudSync(data, edit);
  const gear = useGearAnalysis(data);
  // Shared so Discard never offers an item the certificate queue currently targets.
  // The Authenticator prompt id is session-only and never persisted.
  const [activePostRollId, setActivePostRollId] = useState<string>();
  const certificates = useCertificateAnalysis(data, activePostRollId);
  const queue = useMemo(() => certificates.current ? buildCertificateQueue(certificates.decisions) : undefined, [certificates.current, certificates.decisions]);
  const certificateTargets = useMemo(() => queue ? new Set(queue.rows.map(row => row.target.item.id)) : undefined, [queue]);
  const valid = data ? algorithmIssues(data.settings).length === 0 : false;
  const best = useMemo(() => data && valid ? buildGearLoadouts(data.gear, data.settings, 'low').main : undefined, [data?.gear, data?.settings, valid]);
  const view = useMemo(() => data ? equipmentView(data, gear.analyses, gear.current, certificateTargets) : undefined, [data, gear.analyses, gear.current, certificateTargets]);

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
      <div className="brand"><div className="logoMark small">SH</div><strong>Storage Hunters</strong></div>
      {(gear.computing || certificates.computing) && <span className="status" role="status">Updating…</span>}
      <button className={`iconButton${tab === 'Settings' ? ' active' : ''}`} aria-label="Settings" onClick={() => setTab('Settings')}>⚙</button>
    </header>
    {saveError && <div className="notice dangerNotice banner" role="alert">{saveError}
      <div className="actions">
        {saveError === CONFLICT_WITH_CHANGES && <button onClick={() => {
          if (!confirm('Keep this window\'s data? It replaces what the other copy saved.')) return;
          const kept = data;
          keepThisWindow(kept).then(() => { if (latest.current === kept) dirty.current = false; setSaveError(''); })
            .catch(error => setSaveError(isConflict(error) ? CONFLICT_WITH_CHANGES : 'Not saved. Download a backup before leaving.'));
        }}>Keep my changes</button>}
        <button onClick={() => downloadText(`storage-hunters-backup-${dateStamp()}.json`, exportJson(data), 'application/json')}>Download backup</button>
        <button onClick={() => { if (confirm(saveError === CONFLICT_WITH_CHANGES ? 'Use the other copy\'s data? This window\'s unsaved changes are lost unless you downloaded a backup.' : 'Reload saved data? Download a backup first to keep this window\'s edits.')) window.location.reload(); }}>{saveError === CONFLICT_WITH_CHANGES ? 'Use the other copy' : 'Reload'}</button>
      </div>
    </div>}
    {cloud.status === 'conflict' && <div className="notice warning banner" role="alert">
      {cloud.firstJoin ? 'Your cloud copy already has data. Which should this device use?' : 'This device and your cloud copy both changed since the last sync. Which should be kept?'}
      <div className="actions">
        <button onClick={() => { if (confirm('Replace this device\'s data with the cloud copy?')) cloud.useCloud(); }}>Use cloud copy</button>
        <button onClick={() => { if (confirm('Replace the cloud copy with this device\'s data?')) cloud.keepDevice(); }}>Keep this device</button>
      </div>
    </div>}
    {cloud.status === 'error' && tab !== 'Settings' && <div className="notice dangerNotice banner" role="alert">Cloud sync failed: {cloud.message} <button className="link" onClick={() => setTab('Settings')}>Open</button></div>}

    <main className="content">
      {tab === 'Home' && view && <Home data={data} best={best} view={view} queue={queue} onOpen={setTab} onAdd={() => setAdding('menu')} />}
      {tab === 'Equipment' && view && <Equipment data={data} setData={edit} best={best} view={view} />}
      {tab === 'Certificates' && <Certificates data={data} setData={edit} analysis={certificates} queue={queue} onRecorded={setActivePostRollId} />}
      {tab === 'Settings' && <Settings data={data} setData={edit} cloud={cloud} />}
    </main>

    {adding === 'menu' && <AddSheet onClose={() => setAdding(null)} onChoose={setAdding} />}
    {adding && adding !== 'menu' && adding.kind === 'scan' && <ScreenshotImport data={data} setData={edit} onClose={() => setAdding(null)} />}
    {adding && adding !== 'menu' && adding.kind === 'gear' && <GearEditor item={blankGear(adding.slot)} mode="add" onClose={() => setAdding(null)}
      onSave={(item, keepAdding) => { edit({ ...data, gear: [...data.gear, item] }); setAdding(keepAdding ? { kind: 'gear', slot: item.slot } : null); }} />}
    {adding && adding !== 'menu' && adding.kind === 'gavel' && <TrophyEditor item={blankTrophy(data.trophySettings.mutationWeights)} weights={data.trophySettings.mutationWeights} mode="add" onClose={() => setAdding(null)}
      onSave={input => { const item = { ...input, name: generateTrophyName(input.modifiers) }; if (validateTrophy(item)) return; edit({ ...data, trophies: [...data.trophies, item] }); setAdding(null); }} />}
    {adding && adding !== 'menu' && adding.kind === 'certificates' && <CertificateBatchEditor onClose={() => setAdding(null)}
      onSave={input => { try { edit(addCertificateBatch(data, input)); setAdding(null); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }} />}

    <nav className="bottomNav" aria-label="Main">
      {TABS.slice(0, 2).map(t => <NavButton key={t.tab} tab={t} current={tab} onClick={setTab} />)}
      <button className="addNav" aria-label="Add equipment" onClick={() => setAdding('menu')}><span aria-hidden="true">＋</span>Add</button>
      {TABS.slice(2).map(t => <NavButton key={t.tab} tab={t} current={tab} onClick={setTab} />)}
    </nav>
  </div>;
}

function NavButton({ tab, current, onClick }: { tab: typeof TABS[number]; current: Tab; onClick: (tab: Tab) => void }) {
  return <button className={current === tab.tab ? 'active' : ''} aria-current={current === tab.tab ? 'page' : undefined} onClick={() => onClick(tab.tab)}>
    <span aria-hidden="true">{tab.icon}</span>{tab.label}
  </button>;
}
