import { useMemo, useState } from 'react';
import { algorithmIssues } from '../engine/settingsValidation';
import { analyseTrophyRetention } from '../engine/trophies';
import { hasUnknownEffect } from '../engine/effects';
import type { AppData, ItemAnalysis } from '../types';
import { Empty, itemTitle, Modal, type SetData } from '../ui';

type Group = 'Gear' | 'Gavels';
interface Candidate { id: string; group: Group; name: string; detail: string }

/**
 * Only current, validated proofs feed the list. Gear needs a retention result for the
 * exact live inventory and settings; favourites and unknown effects are excluded again
 * here as a second guard. Gavel proofs are computed from live data.
 */
export function discardCandidates(data: AppData, gearAnalyses: ItemAnalysis[], gearCurrent: boolean, certificateTargets?: Set<string>): { candidates: Candidate[]; gearLocked: boolean } {
  // Gear waits for the certificate queue too: an item it targets is never offered for discard.
  const gearLocked = !gearCurrent || !certificateTargets || algorithmIssues(data.settings).length > 0;
  const live = new Map(data.gear.map(item => [item.id, item]));
  const gear = gearLocked ? [] : gearAnalyses
    .filter(a => a.verdict === 'SAFE TO DISCARD')
    .map(a => live.get(a.item.id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item) && !item!.favourite && !hasUnknownEffect(item!) && !certificateTargets!.has(item!.id))
    .map(item => ({ id: item.id, group: 'Gear' as const, name: itemTitle(item), detail: item.slot }));
  const gavels = analyseTrophyRetention(data.trophies, data.trophySettings)
    .filter(a => a.verdict === 'SAFE TO DISCARD' && !a.item.favourite)
    .map(a => ({ id: a.item.id, group: 'Gavels' as const, name: a.item.name, detail: '' }));
  return { candidates: [...gear, ...gavels], gearLocked };
}

export function removeRecords(data: AppData, ids: Set<string>): AppData {
  return {
    ...data,
    gear: data.gear.filter(x => !ids.has(x.id)),
    trophies: data.trophies.filter(x => !ids.has(x.id))
  };
}

export function Discard({ data, setData, gearAnalyses, gearCurrent, certificateTargets }: {
  data: AppData; setData: SetData; gearAnalyses: ItemAnalysis[]; gearCurrent: boolean;
  /** Items targeted by the current certificate queue; undefined while that queue is recalculating. */
  certificateTargets?: Set<string>;
}) {
  const { candidates, gearLocked } = useMemo(() => discardCandidates(data, gearAnalyses, gearCurrent, certificateTargets), [data, gearAnalyses, gearCurrent, certificateTargets]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const valid = new Set(candidates.map(c => c.id));
  // A selection never outlives its proof: anything no longer listed is dropped.
  const selected = candidates.filter(c => picked.has(c.id));
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const groups: Group[] = ['Gear', 'Gavels'];

  const confirmRemove = () => {
    const fresh = new Set(discardCandidates(data, gearAnalyses, gearCurrent, certificateTargets).candidates.map(c => c.id));
    const ids = new Set(selected.map(c => c.id).filter(id => fresh.has(id)));
    setData(removeRecords(data, ids));
    setPicked(new Set());
    setReviewing(false);
  };

  return <section aria-labelledby="discard-heading">
    <h1 id="discard-heading">Discard</h1>
    {gearLocked && data.gear.length > 0 && <p className="updating" role="status">{algorithmIssues(data.settings).length ? 'Gear locked: fix preferences' : 'Gear updating…'}</p>}
    {!candidates.length ? <Empty>Nothing to discard</Empty> : <>
      <div className="toolbar">
        <button className="secondary compact" onClick={() => setPicked(selected.length === candidates.length ? new Set() : new Set(valid))}>{selected.length === candidates.length ? 'Clear' : 'Select all'}</button>
        <button className="danger" disabled={!selected.length} onClick={() => setReviewing(true)}>Review ({selected.length})</button>
      </div>
      {groups.map(group => {
        const rows = candidates.filter(c => c.group === group);
        if (!rows.length) return null;
        return <fieldset className="discardGroup" key={group}><legend>{group}</legend>
          {rows.map(c => <label className="row check" key={c.id}><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} /><span className="rowMain"><strong>{c.name}</strong>{c.detail && <span>{c.detail}</span>}</span></label>)}
        </fieldset>;
      })}
    </>}
    {reviewing && <Modal title={`Remove ${selected.length} item${selected.length === 1 ? '' : 's'}?`} onClose={() => setReviewing(false)} actions={<>
      <button className="secondary" onClick={() => setReviewing(false)}>Cancel</button>
      <button className="danger" disabled={!selected.length} onClick={confirmRemove}>Remove {selected.length}</button>
    </>}>
      <ul className="reviewList">{selected.map(c => <li key={c.id}><span>{c.group}</span> {c.name}</li>)}</ul>
    </Modal>}
  </section>;
}
