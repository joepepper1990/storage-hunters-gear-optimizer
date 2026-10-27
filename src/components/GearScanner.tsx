import { useEffect, useRef, useState } from 'react';
import type { GearItem, GearStats } from '../types';
import type { ParsedGearScan } from '../scanner/types';
import { confirmFocusedScanBaseStats, observedScanStatKeys, parseGearOcrText, scanNeedsBaseStatConfirmation, scanToGearDraft } from '../scanner/parser';
import { recogniseGearScreenshot } from '../scanner/ocr';

const scanStatLabels: Array<[keyof GearStats, string]> = [
  ['luck', 'Luck'],
  ['energy', 'Energy Drink Time'],
  ['tip', 'Tip Chance'],
  ['walk', 'Walkspeed'],
  ['vehicle', 'Vehicle Speed'],
  ['recovery', 'Bid Recovery'],
  ['zone', 'Bid Zone Width'],
  ['arrowReduction', 'Bid Arrow Speed'],
  ['npc', 'NPC Offers Bonus']
];

function displayScanStat(key: keyof GearStats, value: number): string {
  const shown = key === 'arrowReduction' ? -value : value;
  return `${shown > 0 ? '+' : ''}${shown}%`;
}

export function GearScanner({ onClose, onConfirm }: { onClose: () => void; onConfirm: (item: GearItem) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [scan, setScan] = useState<ParsedGearScan | null>(null);
  const [error, setError] = useState('');
  const [baseInputs, setBaseInputs] = useState<Partial<Record<keyof GearStats, string>>>({});

  // StrictMode replays effects (mount, cleanup, mount) in development; re-arm on every
  // mount so a replayed cleanup cannot permanently discard the scan result.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function processFile(file: File) {
    setBusy(true);
    setError('');
    setScan(null);
    setBaseInputs({});
    setProgress(0);
    setStatus('Preparing screenshot');
    try {
      const result = await recogniseGearScreenshot(file, (nextProgress, nextStatus) => {
        if (!alive.current) return;
        setProgress(nextProgress);
        setStatus(nextStatus);
      });
      if (!alive.current) return;
      setPreviewUrl(result.previewUrl);
      setScan(parseGearOcrText(result.text, result.lines));
      setProgress(1);
      setStatus('Scan complete');
    } catch (reason) {
      if (!alive.current) return;
      setError(reason instanceof Error ? reason.message : 'The screenshot could not be read.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function chooseAnother() {
    setScan(null);
    setBaseInputs({});
    setPreviewUrl('');
    setError('');
    setProgress(0);
    setStatus('');
    fileRef.current?.click();
  }

  const focusedScan = Boolean(scan?.authenticated && ['focused', 'focus'].includes(scan.authentication.effect.toLowerCase()));
  const baseStatKeys = scan ? observedScanStatKeys(scan) : [];
  const baseInputsComplete = baseStatKeys.length > 0 && baseStatKeys.every(key => {
    const value = baseInputs[key];
    return value !== undefined && value.trim() !== '' && Number.isFinite(Number(value));
  });

  function confirmBaseStats() {
    if (!scan || !baseInputsComplete) return;
    const baseStats: Partial<GearStats> = {};
    for (const key of baseStatKeys) {
      const shown = Number(baseInputs[key]);
      baseStats[key] = key === 'arrowReduction' ? -shown : shown;
    }
    setScan(confirmFocusedScanBaseStats(scan, baseStats));
  }

  return <div className="modalBackdrop scannerBackdrop">
    <div className="modal scannerModal">
      <div className="modalHeader">
        <h2>Scan screenshot</h2>
        <button className="iconButton" onClick={onClose} aria-label="Close scanner">×</button>
      </div>

      <p className="modalMeta">Read on this device. Always review before saving.</p>

      {!busy && !scan && <div className="scannerStart">
        <div className="scannerGlyph">▣</div>
        <button className="primary" onClick={()=>fileRef.current?.click()}>Choose screenshot</button>
      </div>}

      {busy && <div className="scannerProgress">
        {previewUrl && <img src={previewUrl} alt="Screenshot being scanned" />}
        <strong>{status || 'Reading screenshot'}</strong>
        <progress max="1" value={progress}/>
        <span>{Math.round(progress * 100)}%</span>
      </div>}

      {error && !busy && <div className="notice dangerNotice"><b>Scan failed.</b> {error}</div>}

      {scan && !busy && <div className="scannerResult">
        {previewUrl && <img className="scannerPreview" src={previewUrl} alt="Processed gear screenshot" />}
        <div className="scannerResultHeader">
          <div><h3>{scan.baseName || 'Name not recognised'}</h3><p>{scan.slotDetected ? scan.slot : 'Slot needs review'}{scan.mutation?` · ${scan.mutation} mutation`:''}{scan.conditionPct!==undefined?` · ${scan.conditionPct}% condition`:''}</p></div>
          <span className={`scanConfidence ${scan.confidence.toLowerCase()}`}>{scan.confidence} confidence</span>
        </div>

        <div className="scannerDetectedStats">
          {scanStatLabels.filter(([key]) => scan.stats[key] !== 0).map(([key, label]) => <span key={key}><b>{label}</b> {displayScanStat(key, scan.stats[key])}</span>)}
          {!scanStatLabels.some(([key]) => scan.stats[key] !== 0) && <span>No stats recognised</span>}
        </div>

        {scan.authenticated && scan.authentication.effect && <div className="scannerAuth"><span>Authentication</span><strong>{scan.authentication.effect}{scan.authentication.value ? ` ${scan.authentication.value > 0 ? '+' : ''}${scan.authentication.value}%` : ''}</strong></div>}

        {focusedScan && <div className="notice scannerBaseConfirmation">
          <strong>Confirm original base stats</strong>
          <p>Focused may be included. Enter each stat as it was before authentication (game sign).</p>
          {scanStatLabels.filter(([key]) => baseStatKeys.includes(key)).map(([key, label]) => <label key={key} className="field">
            <span>{label} · seen {displayScanStat(key, scan.stats[key])}</span>
            <input type="number" step="any" value={baseInputs[key] ?? ''} placeholder="Original %" onChange={event => {
              setBaseInputs(current => ({ ...current, [key]: event.target.value }));
              if (scan.baseStatsProvenance === 'confirmed') setScan({ ...scan, baseStatsProvenance: 'requires-confirmation', confirmedBaseStats: undefined });
            }} />
          </label>)}
          {!baseStatKeys.length && <p>No stats recognised. Try a clearer screenshot.</p>}
          <button className="secondary" disabled={!baseInputsComplete || scan.baseStatsProvenance === 'confirmed'} onClick={confirmBaseStats}>{scan.baseStatsProvenance === 'confirmed' ? 'Original base stats confirmed' : 'Confirm these original base stats'}</button>
        </div>}

        {scan.warnings.length > 0 && <div className="scannerWarnings"><strong>Check before saving</strong>{scan.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}

        <details className="scannerRaw"><summary>Raw text</summary><pre>{scan.rawText || 'No text returned.'}</pre></details>

        <div className="scannerActions"><button className="secondary" onClick={chooseAnother}>Scan another</button><button className="primary" disabled={scanNeedsBaseStatConfirmation(scan)} onClick={()=>onConfirm(scanToGearDraft(scan))}>Review in gear editor</button></div>
      </div>}

      {error && !busy && !scan && <button className="primary scannerRetry" onClick={()=>fileRef.current?.click()}>Try another screenshot</button>}
      <input ref={fileRef} hidden type="file" accept="image/*" onChange={event=>{const file=event.target.files?.[0];event.currentTarget.value='';if(file)void processFile(file);}}/>
    </div>
  </div>;
}

