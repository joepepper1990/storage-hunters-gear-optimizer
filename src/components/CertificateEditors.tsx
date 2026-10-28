import { useEffect, useMemo, useState } from 'react';
import { ZERO_STATS } from '../defaults';
import { activeCertificateOutcomeOptions } from '../authentication';
import { authModelTypeForOwnedCertificate, withObservedAuthenticationStats } from '../engine/certificateRolls';
import { addOutcomeToItem, removeNumericAuthentication } from '../engine/dominance';
import { optimise } from '../engine/optimizer';
import { arrowTier } from '../engine/gearLoadouts';
import { effectiveItemStats, gameArrowToReduction, reductionToGameArrow } from '../engine/scoring';
import { CERTIFICATE_TYPES, certificateLabel, type CertificateBatchInput } from '../engine/certificateInventory';
import { authModelCertificateType } from '../engine/authModel';
import { generateGearName } from '../naming';
import type { AppData, AuthModelEntry, CertificateRollLog, GearItem, GearStats, OwnedCertificate } from '../types';
import { itemTitle, Modal, NumberInput, STAT_LABELS } from '../ui';

function applyRollToItem(item: GearItem, effect: string, value: number, type: AuthModelEntry['certificateType']): GearItem {
  let base = removeNumericAuthentication(item);
  if (base.authenticated) { base = structuredClone(base); base.authenticated = false; base.authentication = { kind: 'None', effect: '', value: 0 }; }
  const updated = addOutcomeToItem(base, effect, value);
  updated.authentication.kind = type.startsWith('Premium') ? 'Premium' : type.startsWith('Limited') ? 'Limited' : 'Normal';
  updated.name = generateGearName(updated.baseName, updated.stats, updated.authenticated, updated.authentication);
  updated.updatedAt = new Date().toISOString();
  return updated;
}

/** Records the actual in-game result for one certificate and consumes it. */
export function RecordResultEditor({ data, certificate, initialItemId, onClose, onSave }: {
  data: AppData; certificate: OwnedCertificate; initialItemId?: string; onClose: () => void; onSave: (roll: CertificateRollLog, updated: GearItem) => void;
}) {
  const type = authModelTypeForOwnedCertificate(certificate);
  const [itemId, setItemId] = useState(initialItemId ?? data.gear[0]?.id ?? '');
  const item = data.gear.find(g => g.id === itemId);
  const [newAuth, setNewAuth] = useState('');
  const [newValue, setNewValue] = useState(0);
  const autoPreview = useMemo(() => item && newAuth ? applyRollToItem(item, newAuth, newValue, type) : item, [item, newAuth, newValue, type]);
  const expected = useMemo(() => autoPreview ? effectiveItemStats(autoPreview) : undefined, [autoPreview]);
  const [finalStats, setFinalStats] = useState<GearStats | undefined>(expected ? { ...expected } : undefined);
  useEffect(() => { setFinalStats(expected ? { ...expected } : undefined); }, [expected]);
  useEffect(() => { setNewAuth(''); setNewValue(0); }, [itemId, type]);
  const preview = useMemo(() => {
    if (!autoPreview || !finalStats) return autoPreview;
    const observed = withObservedAuthenticationStats(autoPreview, finalStats);
    return { ...observed, name: generateGearName(observed.baseName, observed.stats, observed.authenticated, observed.authentication) };
  }, [autoPreview, finalStats]);
  const kind = type.startsWith('Premium') ? 'Premium' : type.startsWith('Limited') ? 'Limited' : 'Normal';
  const setFinal = (key: keyof GearStats, value: number) => setFinalStats(current => ({ ...ZERO_STATS, ...current, [key]: Number.isFinite(value) ? value : 0 }));
  const save = () => {
    if (!item || !preview) return;
    // Same ranking as Best setup: the Arrow tier first, then the score.
    const best = (gear: GearItem[]) => { const top = optimise(gear, data.settings, 1)[0]; return { tier: top ? arrowTier(top.stats, data.settings) : 0, score: top?.score.total ?? 0 }; };
    const was = best(data.gear), now = best(data.gear.map(g => g.id === preview.id ? preview : g));
    const before = was.score, after = now.score;
    const improved = now.tier > was.tier || (now.tier === was.tier && after > before);
    onSave({ id: crypto.randomUUID(), date: new Date().toISOString(), certificateType: type, itemId: item.id, itemName: item.name, slot: item.slot,
      previousAuthentication: item.authentication.effect, previousValue: item.authentication.value, newAuthentication: newAuth, newValue,
      improvedBestSet: improved, bestScoreBefore: before, bestScoreAfter: after, certificateId: certificate.id,
      certificateGradeStars: certificate.gradeStars, certificateMutation: certificate.mutation, certificateInventoryType: certificate.type }, preview);
  };

  return <Modal title="Record result" onClose={onClose} actions={<>
    <button className="secondary" onClick={onClose}>Cancel</button>
    <button className="primary" disabled={!item || !newAuth || !preview || certificate.quantity < 1} onClick={save}>Save result</button>
  </>}>
    <p className="modalMeta">{certificateLabel(certificate)} · {certificate.quantity} left</p>
    <div className="formGrid">
      <label className="wide">Item<select value={itemId} onChange={e => setItemId(e.target.value)}>{data.gear.map(g => <option value={g.id} key={g.id}>{itemTitle(g)} · {g.slot}</option>)}</select></label>
      <label>Result<select value={newAuth} onChange={e => setNewAuth(e.target.value)}><option value="">Select</option>{activeCertificateOutcomeOptions(item?.slot, data.authModel, kind, certificate.type).map(a => <option key={a}>{a}</option>)}</select></label>
      <label>Value %<NumberInput value={newValue} onValue={setNewValue} /></label>
    </div>
    {finalStats && newAuth && <details className="compactDetails"><summary>Stats shown in game</summary><div className="formGrid">
      {STAT_LABELS.map(([key, label]) => key === 'arrowReduction'
        ? <label key={key}>{label} % (game sign)<NumberInput value={reductionToGameArrow(finalStats.arrowReduction)} onValue={n => setFinal('arrowReduction', gameArrowToReduction(n))} /></label>
        : <label key={key}>{label} %<NumberInput value={finalStats[key]} onValue={n => setFinal(key, n)} /></label>)}
    </div></details>}
  </Modal>;
}

/** Corrects or deletes historical evidence only; current gear and quantities are untouched. */
export function HistoryEditor({ data, roll, onClose, onSave, onDelete }: {
  data: AppData; roll: CertificateRollLog; onClose: () => void; onSave: (effect: string, value: number) => void; onDelete: () => void;
}) {
  const kind = roll.certificateType.startsWith('Premium') ? 'Premium' : roll.certificateType.startsWith('Limited') ? 'Limited' : 'Normal';
  const [effect, setEffect] = useState(roll.newAuthentication);
  const [value, setValue] = useState(roll.newValue);
  const options = activeCertificateOutcomeOptions(roll.slot, data.authModel, kind, roll.certificateInventoryType);
  return <Modal title="Fix history entry" onClose={onClose} actions={<>
    <button className="danger" onClick={onDelete}>Delete entry</button>
    <button className="secondary" onClick={onClose}>Cancel</button>
    <button className="primary" disabled={!effect.trim() || !Number.isFinite(value)} onClick={() => onSave(effect, value)}>Save</button>
  </>}>
    <p className="modalMeta">{roll.itemName} · history only</p>
    <div className="formGrid">
      <label>Result<select value={effect} onChange={e => setEffect(e.target.value)}>{[...new Set([effect, ...options])].filter(Boolean).map(o => <option key={o}>{o}</option>)}</select></label>
      <label>Value %<input type="number" step="any" value={value} onChange={e => setValue(Number(e.target.value))} /></label>
    </div>
  </Modal>;
}

export function CertificateBatchEditor({ batch, onClose, onSave }: {
  batch?: OwnedCertificate; onClose: () => void; onSave: (input: CertificateBatchInput) => void;
}) {
  const [type, setType] = useState<OwnedCertificate['type']>(batch?.type ?? 'Wooden Certificate of Authenticity');
  const [grade, setGrade] = useState(batch?.gradeStars === undefined ? '' : String(batch.gradeStars));
  const [mutation, setMutation] = useState(batch?.mutation ?? '');
  const [quantity, setQuantity] = useState(String(batch?.quantity ?? 1));
  const q = Number(quantity);
  const g = grade === '' ? undefined : Number(grade);
  const valid = Number.isSafeInteger(q) && q >= (batch ? 0 : 1);
  return <Modal title={batch ? 'Edit certificates' : 'Add certificates'} onClose={onClose} actions={<>
    <button className="secondary" onClick={onClose}>Cancel</button>
    <button className="primary" disabled={!valid} onClick={() => onSave({ type, quantity: q, gradeStars: g, mutation: mutation.trim() || undefined })}>Save</button>
  </>}>
    <div className="formGrid">
      <label className="wide">Type<select value={type} onChange={e => setType(e.target.value as OwnedCertificate['type'])}>{CERTIFICATE_TYPES.map(t => <option key={t} value={t}>{t.replace(' Certificate of Authenticity', '')}</option>)}</select></label>
      <label>Grade<select value={grade} onChange={e => setGrade(e.target.value)}><option value="">Not recorded</option>{[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}★</option>)}</select></label>
      <label>Mutation<input value={mutation} onChange={e => setMutation(e.target.value)} placeholder="None" /></label>
      <label>Quantity<input type="number" min={batch ? 0 : 1} step="1" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
    </div>
  </Modal>;
}

export function newAuthModelEntry(): AuthModelEntry {
  return { id: crypto.randomUUID(), certificateInventoryType: 'Wooden Certificate of Authenticity', certificateType: 'Normal Certificate of Authenticity', slot: 'Any',
    outcome: 'Custom outcome', category: 'Custom / unknown', assumedLikelihoodClass: 'MEDIUM', observedSampleCount: 0, observedValues: [], confidence: 'Unknown', empiricalConfidence: 'Unknown', enabled: true };
}

export function CatalogueRow({ entry, onChange, onDelete }: { entry: AuthModelEntry; onChange: (e: AuthModelEntry) => void; onDelete: () => void }) {
  const inventoryType = entry.certificateInventoryType ?? (
    entry.certificateType === 'Premium Certificate of Authenticity' ? 'Premium Certificate of Authenticity' :
    entry.certificateType === 'Limited Certificate of Authenticity' ? 'Limited Certificate of Authenticity' : 'Wooden Certificate of Authenticity');
  const optional = (value: string) => value === '' ? undefined : Number(value);
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity', '')} · {entry.slot}{entry.enabled ? '' : ' · off'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e => onChange({ ...entry, outcome: e.target.value })} /></label>
      <label>Certificate<select value={inventoryType} onChange={e => { const t = e.target.value as OwnedCertificate['type']; onChange({ ...entry, certificateInventoryType: t, certificateType: authModelCertificateType(t) }); }}>{CERTIFICATE_TYPES.map(t => <option key={t} value={t}>{t.replace(' Certificate of Authenticity', '')}</option>)}</select></label>
      <label>Slot<select value={entry.slot} onChange={e => onChange({ ...entry, slot: e.target.value as AuthModelEntry['slot'] })}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label>Relative weight<select value={entry.assumedLikelihoodClass} onChange={e => onChange({ ...entry, assumedLikelihoodClass: e.target.value as AuthModelEntry['assumedLikelihoodClass'] })}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e => onChange({ ...entry, confidence: e.target.value as AuthModelEntry['confidence'] })}>{['Unknown','Low','Medium','High','Empirical'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Min<input type="number" step="any" value={entry.min ?? ''} onChange={e => onChange({ ...entry, min: optional(e.target.value) })} /></label>
      <label>Typical<input type="number" step="any" value={entry.typical ?? ''} onChange={e => onChange({ ...entry, typical: optional(e.target.value) })} /></label>
      <label>Max<input type="number" step="any" value={entry.max ?? ''} onChange={e => onChange({ ...entry, max: optional(e.target.value) })} /></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e => onChange({ ...entry, enabled: e.target.checked })} /> Enabled</label>
      <p className="wide modalMeta">{entry.observedSampleCount} observed</p>
      <button className="danger wide" onClick={onDelete}>Delete outcome</button>
    </div>
  </details>;
}
