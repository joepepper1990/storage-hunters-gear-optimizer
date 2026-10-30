import { useState, type ReactNode } from 'react';
import { applyRecordedCertificateRoll, correctRecordedCertificateRoll, deleteRecordedCertificateRoll } from '../engine/certificateRolls';
import type { CertificateQueue, CertificateQueueRow } from '../engine/certificateQueue';
import { addCertificateBatch, certificateLabel, setCertificateQuantity, updateCertificateGroup } from '../engine/certificateInventory';
import type { CertificateTargetDecision, OwnedCertificateDecision } from '../engine/certificateDecision';
import type { useCertificateAnalysis } from '../hooks/useAnalysis';
import { CertificateBatchEditor, HistoryEditor, RecordResultEditor } from '../components/CertificateEditors';
import type { AppData, CertificateRollLog, OwnedCertificate } from '../types';
import { Empty, itemTitle, Notice, num, type SetData } from '../ui';

function pct(value: number): string {
  if (value <= 0) return '0%';
  if (value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

/**
 * Chance this certificate improves the best re-optimised loadout. When the figure depends on
 * dynamic effects (Golden Hour, Drought Breaker, Luck Frenzy, Overcharged) it is shown as the
 * range across the cautious, central and favourable states; none of them is a claimed average.
 * Unresolved roll strengths can only raise the upper end.
 */
export function chanceText(target: CertificateTargetDecision): { value: string; detail: string } {
  const lower = target.improveChanceLowerPct, exact = target.improveChancePct;
  const low = Math.min(lower.cautious, lower.central, lower.favourable);
  const high = Math.max(exact.cautious, exact.central, exact.favourable, target.improveChanceUpperPct);
  const ranged = Math.round(high) - Math.round(low) >= 1;
  return { value: ranged ? `${pct(low)}–${pct(high)}` : pct(low), detail: ranged ? 'better sets · depends on active effects' : 'better sets' };
}

function arrowText(target: CertificateTargetDecision): string {
  return `Arrow ${Math.round(target.currentArrow)}%${target.currentArrowInBand ? '' : target.arrowNeeded ? ' · below band' : ' · above band'}`;
}

function TargetDetails({ target }: { target: CertificateTargetDecision }) {
  const best = target.bestRoll;
  return <details className="compactDetails">
    <summary>Why</summary>
    <ul className="plainList">
      {target.currentAuthentication && <li>Now: {target.currentAuthentication.effect}{target.currentAuthentication.rank ? ` (#${target.currentAuthentication.rank.rank} of ${target.currentAuthentication.rank.of} wanted${target.currentAuthentication.rank.higher.length ? `; higher: ${target.currentAuthentication.rank.higher.join(', ')}` : ''})` : target.currentAuthentication.calculated ? ' (value calculated from the trio)' : ' (not a wanted result for this certificate)'}</li>}
      {best && <li>Best roll: {best.label} → {best.loadout.context === 'Neutral' ? 'main' : best.loadout.context} set {itemTitle(best.loadout.head)} / {itemTitle(best.loadout.back)} / {itemTitle(best.loadout.wrist)} · Arrow {num(best.loadout.arrow)}%{best.loadout.inBand ? '' : ' (outside band)'} · Luck {num(best.loadout.luck)} · Zone {num(best.loadout.zone)} · Energy {num(best.loadout.energy)}{best.state === 'central' ? ' (with active effects at the central sensitivity setting)' : ''}</li>}
      <li>Worse: up to {pct(target.worseChanceUpperPct)} (cautious){target.safeInCautious ? ' · safe' : ''}</li>
      {target.calculatedRanks.map(r => <li key={r.effect}>{r.effect}{r.defaultRank ? ` · default #${r.defaultRank}` : ''}{r.calculatedRank ? ` · here #${r.calculatedRank}` : ''}: {r.reason}</li>)}
      {target.unwantedOutcomePct > 0 && <li>{pct(target.unwantedOutcomePct)} of outcomes are unwanted.</li>}
      {target.unresolvedOutcomeMassPct > 1e-6 && <li>Some roll strengths ({target.unresolvedEffects.join(', ')}) are unresolved, so the range is wider.</li>}
    </ul>
  </details>;
}

/** Certificates that look the same in the app (type, grade, mutation) are shown as one line. */
function groupByLabel(certificates: OwnedCertificate[]): Array<{ label: string; batches: OwnedCertificate[]; quantity: number }> {
  const groups = new Map<string, OwnedCertificate[]>();
  for (const cert of certificates) groups.set(certificateLabel(cert), [...(groups.get(certificateLabel(cert)) ?? []), cert]);
  return [...groups].map(([label, batches]) => ({ label, batches, quantity: batches.reduce((n, b) => n + b.quantity, 0) }));
}

const VERDICT_WORD: Record<CertificateTargetDecision['verdict'], string> = { USE: 'Use', CONSIDER: 'Consider', HOLD: 'Hold', 'DO NOT USE': "Don't use" };

/** The one next certificate action: use this certificate on this item, or hold them all. */
export function NextCertificate({ row, computing, hasCertificates, onRecord, details = false, more }: {
  row?: CertificateQueueRow; computing: boolean; hasCertificates: boolean; onRecord?: (row: CertificateQueueRow) => void; details?: boolean; more?: ReactNode;
}) {
  if (computing && !row) return <article className="answerCard"><span className="eyebrow">Next certificate</span><p className="updating" role="status">Working it out…</p>{more}</article>;
  if (!row) return <article className="answerCard">
    <span className="eyebrow">Next certificate</span>
    <strong className="verdict hold">{hasCertificates ? 'Hold certificates' : 'No certificates'}</strong>
    <small>{hasCertificates ? 'Nothing is worth using right now.' : 'Add certificates to get a recommendation.'}</small>
    {more}
  </article>;
  const t = row.target, chance = chanceText(t);
  return <article className="answerCard">
    <span className="eyebrow">Next certificate</span>
    <strong className={`verdict ${t.verdict === 'USE' ? 'use' : 'consider'}`}>{VERDICT_WORD[t.verdict]} {certificateLabel(row.certificate)}</strong>
    <p className="target">→ {itemTitle(t.item)} · {t.item.slot}</p>
    <ul className="facts">
      <li><b>{chance.value}</b> chance of a better Best Set</li>
      <li>Wanted roll {pct(t.wantedChancePct)}{t.unwantedOutcomePct > 0 ? ` · ${pct(t.unwantedOutcomePct)} of rolls unwanted` : ''}</li>
      {t.bestRoll && <li>Best result: {t.bestRoll.effect}</li>}
      <li>{arrowText(t)}</li>
    </ul>
    {details && <TargetDetails target={t} />}
    {onRecord && <button className="primary" onClick={() => onRecord(row)}>Record result</button>}
    {more}
  </article>;
}

function statusOf(decisions: OwnedCertificateDecision[], batches: OwnedCertificate[], next?: CertificateQueueRow): string {
  if (next && batches.some(b => b.id === next.certificate.id)) return 'Next';
  const verdicts = decisions.filter(d => batches.some(b => b.id === d.certificate.id)).map(d => d.verdict);
  if (verdicts.includes('USE')) return 'Use later';
  if (verdicts.includes('CONSIDER')) return 'Consider';
  if (verdicts.length && verdicts.every(v => v === 'DO NOT USE')) return "Don't use";
  return 'Hold';
}

export function Certificates({ data, setData, analysis, queue, onRecorded }: {
  data: AppData; setData: SetData; analysis: ReturnType<typeof useCertificateAnalysis>; queue?: CertificateQueue;
  /** Opens (id) or closes (undefined) the session-only Authenticator prompt. */
  onRecorded: (rollId: string | undefined) => void;
}) {
  const [recording, setRecording] = useState<{ certificate: OwnedCertificate; itemId?: string } | null>(null);
  const [fixing, setFixing] = useState<CertificateRollLog | null>(null);
  const [editing, setEditing] = useState<OwnedCertificate[] | 'new' | null>(null);
  const [error, setError] = useState('');
  const available = data.ownedCertificates.filter(c => c.quantity > 0);
  const post = analysis.postRoll;
  const next = queue?.rows[0];
  const run = (change: () => AppData) => { try { setData(change()); setEditing(null); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };

  const record = (certificate: OwnedCertificate, roll: CertificateRollLog, updated: Parameters<typeof applyRecordedCertificateRoll>[3]) => {
    try { setData(applyRecordedCertificateRoll(data, certificate.id, roll, updated)); onRecorded(roll.id); setRecording(null); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not record result.'); }
  };

  return <section aria-labelledby="cert-heading">
    <h1 id="cert-heading">Certificates</h1>
    {error && <Notice tone="danger">{error}</Notice>}
    {analysis.error && <Notice tone="danger">{analysis.error}</Notice>}

    {post && <div className="promptCard" role="status">
      <span className="eyebrow">Authenticator prompt</span>
      <strong className="bigAnswer">{post.recommendation === 'ACCEPT' ? 'Accept' : post.recommendation === 'REROLL EFFECT' ? 'Reroll' : 'Reroll number'}</strong>
      <button className="secondary compact" onClick={() => onRecorded(undefined)}>Prompt closed</button>
    </div>}
    {analysis.postRollError && <Notice tone="danger">{analysis.postRollError}</Notice>}

    <NextCertificate row={next} computing={!queue} hasCertificates={available.length > 0} details
      onRecord={row => setRecording({ certificate: row.certificate, itemId: row.target.item.id })} />

    <h2>Owned</h2>
    <div className="rowList">{groupByLabel(data.ownedCertificates).map(({ label, batches, quantity }) => {
      const last = [...batches].reverse().find(b => b.quantity > 0) ?? batches[batches.length - 1];
      return <div className="certRow" key={label}>
        <button className="link rowName" onClick={() => setEditing(batches)}><strong>{label}</strong><small>{queue ? statusOf(analysis.decisions, batches, next) : '…'}</small></button>
        <div className="stepper" role="group" aria-label={`${label} quantity`}>
          <button onClick={() => run(() => setCertificateQuantity(data, last.id, last.quantity - 1))} disabled={quantity < 1} aria-label="Remove one">−</button>
          <output aria-live="polite">{quantity}</output>
          <button onClick={() => run(() => setCertificateQuantity(data, batches[0].id, batches[0].quantity + 1))} aria-label="Add one">＋</button>
        </div>
      </div>;
    })}</div>
    {!data.ownedCertificates.length && <Empty>No certificates</Empty>}
    <div className="toolbar">
      <button className="secondary" onClick={() => setEditing('new')}>＋ Add certificates</button>
      {available.length > 0 && <select aria-label="Record another result" value="" onChange={e => { const c = available.find(x => x.id === e.target.value); if (c) setRecording({ certificate: c }); }}>
        <option value="">Record another result…</option>{groupByLabel(available).map(g => <option key={g.label} value={g.batches[0].id}>{g.label}</option>)}</select>}
    </div>

    <details className="drawer"><summary>History ({data.rollLog.length})</summary>
      {data.rollLog.length ? <div className="rowList">{data.rollLog.slice().reverse().map(r => <button className="itemRow" key={r.id} onClick={() => setFixing(r)}>
        <strong>{r.itemName}</strong><small>{r.newAuthentication} {num(r.newValue)}% · {new Date(r.date).toLocaleDateString()}</small>
      </button>)}</div> : <Empty>No results recorded</Empty>}
    </details>

    {editing && <CertificateBatchEditor batch={editing === 'new' ? undefined : { ...editing[0], quantity: editing.reduce((n, b) => n + b.quantity, 0) }} onClose={() => setEditing(null)}
      onSave={input => run(() => editing === 'new' ? addCertificateBatch(data, input) : updateCertificateGroup(data, editing.map(b => b.id), input))} />}
    {recording && <RecordResultEditor data={data} certificate={recording.certificate} initialItemId={recording.itemId} onClose={() => setRecording(null)}
      onSave={(roll, updated) => record(recording.certificate, roll, updated)} />}
    {fixing && <HistoryEditor data={data} roll={fixing} onClose={() => setFixing(null)}
      onSave={(effect, value) => { try { onRecorded(undefined); setData(correctRecordedCertificateRoll(data, fixing.id, { newAuthentication: effect, newValue: value })); setFixing(null); } catch (e) { setError(e instanceof Error ? e.message : 'Could not fix entry.'); } }}
      onDelete={() => { if (confirm('Delete this history entry? Certificates and gear are not changed.')) { onRecorded(undefined); setData(deleteRecordedCertificateRoll(data, fixing.id)); setFixing(null); } }} />}
  </section>;
}
