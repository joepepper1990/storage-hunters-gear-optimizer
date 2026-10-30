import { useState } from 'react';
import { applyRecordedCertificateRoll, correctRecordedCertificateRoll, deleteRecordedCertificateRoll } from '../engine/certificateRolls';
import type { CertificateQueue } from '../engine/certificateQueue';
import { addCertificateBatch, certificateLabel, setCertificateQuantity, updateCertificateGroup } from '../engine/certificateInventory';
import type { CertificateTargetDecision } from '../engine/certificateDecision';
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

function holdGroups(hold: CertificateQueue['hold']): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const h of hold) totals.set(certificateLabel(h.certificate), (totals.get(certificateLabel(h.certificate)) ?? 0) + h.quantity);
  return [...totals];
}

/** Certificates that look the same in the app (type, grade, mutation) are shown as one line. */
function groupByLabel(certificates: OwnedCertificate[]): Array<{ label: string; batches: OwnedCertificate[]; quantity: number }> {
  const groups = new Map<string, OwnedCertificate[]>();
  for (const cert of certificates) groups.set(certificateLabel(cert), [...(groups.get(certificateLabel(cert)) ?? []), cert]);
  return [...groups].map(([label, batches]) => ({ label, batches, quantity: batches.reduce((n, b) => n + b.quantity, 0) }));
}

export function CertificateBatches({ data, setData }: { data: AppData; setData: SetData }) {
  const [editing, setEditing] = useState<OwnedCertificate[] | 'new' | null>(null);
  const [error, setError] = useState('');
  const run = (change: () => AppData) => { try { setData(change()); setEditing(null); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  return <div className="batchList">
    {groupByLabel(data.ownedCertificates).map(({ label, batches, quantity }) => {
      // Adding goes to the first batch; removing takes from the last batch that still has one.
      const last = [...batches].reverse().find(b => b.quantity > 0) ?? batches[batches.length - 1];
      return <div className="row" key={label}>
        <div className="rowMain"><strong>{label}</strong></div>
        <div className="stepper" role="group" aria-label={`${label} quantity`}>
          <button onClick={() => run(() => setCertificateQuantity(data, last.id, last.quantity - 1))} disabled={quantity < 1} aria-label="Remove one">−</button>
          <output aria-live="polite">{quantity}</output>
          <button onClick={() => run(() => setCertificateQuantity(data, batches[0].id, batches[0].quantity + 1))} aria-label="Add one">＋</button>
        </div>
        <button className="link" onClick={() => setEditing(batches)}>Edit</button>
      </div>;
    })}
    {!data.ownedCertificates.length && <Empty>No certificates</Empty>}
    {error && <p className="formError" role="alert">{error}</p>}
    <button className="secondary" onClick={() => setEditing('new')}>＋ Add certificates</button>
    {editing && <CertificateBatchEditor batch={editing === 'new' ? undefined : { ...editing[0], quantity: editing.reduce((n, b) => n + b.quantity, 0) }} onClose={() => setEditing(null)}
      onSave={input => run(() => editing === 'new' ? addCertificateBatch(data, input) : updateCertificateGroup(data, editing.map(b => b.id), input))} />}
  </div>;
}

export function Certificates({ data, setData, analysis, queue, onRecorded }: {
  data: AppData; setData: SetData; analysis: ReturnType<typeof useCertificateAnalysis>; queue?: CertificateQueue;
  /** Opens (id) or closes (undefined) the session-only Authenticator prompt. */
  onRecorded: (rollId: string | undefined) => void;
}) {
  const setActivePostRollId = onRecorded;
  const [recording, setRecording] = useState<{ certificate: OwnedCertificate; itemId?: string } | null>(null);
  const [fixing, setFixing] = useState<CertificateRollLog | null>(null);
  const [error, setError] = useState('');
  const available = data.ownedCertificates.filter(c => c.quantity > 0);
  const post = analysis.postRoll;

  const record = (certificate: OwnedCertificate, roll: CertificateRollLog, updated: Parameters<typeof applyRecordedCertificateRoll>[3]) => {
    try { setData(applyRecordedCertificateRoll(data, certificate.id, roll, updated)); setActivePostRollId(roll.id); setRecording(null); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not record result.'); }
  };

  return <section aria-labelledby="cert-heading">
    <h1 id="cert-heading">Certificates</h1>
    {error && <Notice tone="danger">{error}</Notice>}
    {analysis.error && <Notice tone="danger">{analysis.error}</Notice>}

    {post && <div className="promptCard" role="status">
      <span className="eyebrow">Authenticator prompt</span>
      <strong className="bigAnswer">{post.recommendation === 'ACCEPT' ? 'Accept' : post.recommendation === 'REROLL EFFECT' ? 'Reroll' : 'Reroll number'}</strong>
      <button className="secondary compact" onClick={() => setActivePostRollId(undefined)}>Prompt closed</button>
    </div>}
    {analysis.postRollError && <Notice tone="danger">{analysis.postRollError}</Notice>}

    <h2>Use in this order</h2>
    {!queue ? <p className="updating" role="status">Updating…</p> : <>
      {queue.rows.length ? <ol className="queue">{queue.rows.map((row, index) => {
        const chance = chanceText(row.target);
        return <li key={row.certificate.id + row.target.item.id} className="queueRow">
          <span className="queueNo">{index + 1}</span>
          <div className="rowMain">
            <strong>{certificateLabel(row.certificate)}</strong>
            <span>→ {itemTitle(row.target.item)} · {row.target.item.slot}</span>
            <small>Wanted roll {pct(row.target.wantedChancePct)} · {arrowText(row.target)}{row.target.verdict === 'CONSIDER' ? ' · consider' : ''}</small>
            <TargetDetails target={row.target} />
          </div>
          <div className="chance" aria-label="Chance of a better loadout"><b>{chance.value}</b><small>{chance.detail}</small></div>
          <button className="primary compact" onClick={() => setRecording({ certificate: row.certificate, itemId: row.target.item.id })}>Record result</button>
        </li>;
      })}</ol> : <Empty>{data.ownedCertificates.some(c => c.quantity > 0) ? 'Nothing worth using now' : 'No certificates'}</Empty>}
      {queue.hold.length > 0 && <div className="hold"><h3>Hold</h3><ul>{holdGroups(queue.hold).map(([label, quantity]) => <li key={label}>{label} <b>×{quantity}</b></li>)}</ul></div>}
    </>}

    <h2>Owned</h2>
    <CertificateBatches data={data} setData={setData} />
    {available.length > 0 && <label className="inlineSelect">Record another result<select value="" onChange={e => { const c = available.find(x => x.id === e.target.value); if (c) setRecording({ certificate: c }); }}>
      <option value="">Choose certificate</option>{groupByLabel(available).map(g => <option key={g.label} value={g.batches[0].id}>{g.label}</option>)}</select></label>}

    <details className="drawer"><summary>History ({data.rollLog.length})</summary>
      {data.rollLog.length ? <ul className="historyList">{data.rollLog.slice().reverse().map(r => <li key={r.id} className="row">
        <div className="rowMain"><strong>{r.itemName}</strong><span>{r.newAuthentication} {num(r.newValue)}% · {new Date(r.date).toLocaleDateString()}</span></div>
        <button className="link" onClick={() => setFixing(r)}>Fix</button>
      </li>)}</ul> : <Empty>No results recorded</Empty>}
    </details>

    {recording && <RecordResultEditor data={data} certificate={recording.certificate} initialItemId={recording.itemId} onClose={() => setRecording(null)}
      onSave={(roll, updated) => record(recording.certificate, roll, updated)} />}
    {fixing && <HistoryEditor data={data} roll={fixing} onClose={() => setFixing(null)}
      onSave={(effect, value) => { try { setActivePostRollId(undefined); setData(correctRecordedCertificateRoll(data, fixing.id, { newAuthentication: effect, newValue: value })); setFixing(null); } catch (e) { setError(e instanceof Error ? e.message : 'Could not fix entry.'); } }}
      onDelete={() => { if (confirm('Delete this history entry? Certificates and gear are not changed.')) { setActivePostRollId(undefined); setData(deleteRecordedCertificateRoll(data, fixing.id)); setFixing(null); } }} />}
  </section>;
}
