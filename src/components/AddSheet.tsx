import type { Slot } from '../types';
import { Modal } from '../ui';

export type AddChoice = { kind: 'scan' } | { kind: 'gear'; slot: Slot } | { kind: 'gavel' } | { kind: 'certificates' };

/** One place to add anything: scan first, manual entry second. */
export function AddSheet({ onChoose, onClose }: { onChoose: (choice: AddChoice) => void; onClose: () => void }) {
  return <Modal title="Add equipment" onClose={onClose}>
    <div className="addChoices">
      <button className="primary big" onClick={() => onChoose({ kind: 'scan' })}>Scan screenshots</button>
      <p className="muted">or add by hand</p>
      <div className="slotButtons">{(['Head', 'Back', 'Wrist'] as Slot[]).map(slot =>
        <button key={slot} className="secondary" onClick={() => onChoose({ kind: 'gear', slot })}>{slot}</button>)}</div>
      <div className="slotButtons two">
        <button className="secondary" onClick={() => onChoose({ kind: 'gavel' })}>Gavel</button>
        <button className="secondary" onClick={() => onChoose({ kind: 'certificates' })}>Certificates</button>
      </div>
    </div>
  </Modal>;
}
