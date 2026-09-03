import { useEffect, useRef, useState } from 'react';
import type { GearItem, GearStats } from '../types';
import type { ParsedGearScan } from '../scanner/types';
import { parseGearOcrText, scanToGearDraft } from '../scanner/parser';
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

  useEffect(() => () => { alive.current = false; }, []);

  async function processFile(file: File) {
    setBusy(true);
    setError('');
    setScan(null);
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
    setPreviewUrl('');
    setError('');
    setProgress(0);
    setStatus('');
    fileRef.current?.click();
  }

  return <div className="modalBackdrop scannerBackdrop">
    <div className="modal scannerModal">
      <div className="modalHeader">
        <div><span className="eyebrow">EXPERIMENTAL · LOCAL MODE</span><h2>Scan gear screenshot</h2></div>
        <button className="iconButton" onClick={onClose} aria-label="Close scanner">×</button>
      </div>

      <div className="notice scannerPrivacy"><b>Private by design.</b> Your screenshot is processed on this device and is never uploaded. The OCR engine/language files may download the first time you scan.</div>

      {!busy && !scan && <div className="scannerStart">
        <div className="scannerGlyph">▣</div>
        <h3>Choose a Storage Hunters gear screenshot</h3>
        <p>The trial reads the item name, slot, stats and authentication, then sends the result to the normal gear editor for you to check.</p>
        <button className="primary" onClick={()=>fileRef.current?.click()}>Choose screenshot</button>
      </div>}

      {busy && <div className="scannerProgress">
        {previewUrl && <img src={previewUrl} alt="Screenshot being scanned" />}
        <strong>{status || 'Reading screenshot'}</strong>
        <progress max="1" value={progress}/>
        <span>{Math.round(progress * 100)}%</span>
        <p>Keep this screen open while local OCR reads the image.</p>
      </div>}

      {error && !busy && <div className="notice dangerNotice"><b>Scan failed.</b> {error}</div>}

      {scan && !busy && <div className="scannerResult">
        {previewUrl && <img className="scannerPreview" src={previewUrl} alt="Processed gear screenshot" />}
        <div className="scannerResultHeader">
          <div><span className="eyebrow">DETECTED ITEM</span><h3>{scan.baseName || 'Item name not recognised'}</h3><p>{scan.slotDetected ? scan.slot : 'Slot needs review'}</p></div>
          <span className={`scanConfidence ${scan.confidence.toLowerCase()}`}>{scan.confidence} confidence</span>
        </div>

        <div className="scannerDetectedStats">
          {scanStatLabels.filter(([key]) => scan.stats[key] !== 0).map(([key, label]) => <span key={key}><b>{label}</b> {displayScanStat(key, scan.stats[key])}</span>)}
          {!scanStatLabels.some(([key]) => scan.stats[key] !== 0) && <span>No stats recognised</span>}
        </div>

        {scan.authenticated && scan.authentication.effect && <div className="scannerAuth"><span>Authentication</span><strong>{scan.authentication.effect}{scan.authentication.value ? ` ${scan.authentication.value > 0 ? '+' : ''}${scan.authentication.value}%` : ''}</strong></div>}

        {scan.warnings.length > 0 && <div className="scannerWarnings"><strong>Check before saving</strong>{scan.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}

        <details className="scannerRaw"><summary>Show raw OCR text</summary><pre>{scan.rawText || 'No text returned.'}</pre></details>

        <div className="scannerActions"><button className="secondary" onClick={chooseAnother}>Scan another</button><button className="primary" onClick={()=>onConfirm(scanToGearDraft(scan))}>Review in gear editor</button></div>
      </div>}

      {error && !busy && !scan && <button className="primary scannerRetry" onClick={()=>fileRef.current?.click()}>Try another screenshot</button>}
      <input ref={fileRef} hidden type="file" accept="image/*" onChange={event=>{const file=event.target.files?.[0];event.currentTarget.value='';if(file)void processFile(file);}}/>
    </div>
  </div>;
}
