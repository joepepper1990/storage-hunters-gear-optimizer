import { useMemo, useState } from 'react';
import { algorithmIssues } from '../engine/settingsValidation';
import { analyseTrophyRetention, trophyMutationBoost } from '../engine/trophies';
import { effectiveItemStats } from '../engine/scoring';
import { hasUnknownEffect } from '../engine/effects';
import type { AppData, GavelTrophy, GearItem, GearStats, ItemAnalysis } from '../types';
import { Empty, gameStat, itemTitle, Modal, SHORT_STAT, STAT_LABELS, type SetData } from '../ui';

type Group = 'Gear' | 'Gavels';
interface Candidate { id: string; group: Group; name: string; detail: string; why?: string }

/** Short stat line so items sharing a name can be told apart, e.g. "Luck +53% · Arrow -31%". */
function statLine(item: GearItem): string {
  return STAT_LABELS.filter(([key]) => Math.abs(item.stats[key]) > 1e-12).map(([key]) => `${SHORT_STAT[key]} ${gameStat(key, item.stats[key])}`).join(' · ');
}

const COMPARED: Array<keyof GearStats> = ['luck', 'arrowReduction', 'zone', 'recovery', 'energy', 'tip', 'npc'];

/** "Beaten by X: more Luck, Arrow" — the stats where the replacement is strictly better. */
export function gearWhy(item: GearItem, by: GearItem): string {
  const a = effectiveItemStats(by), b = effectiveItemStats(item);
  const better = COMPARED.filter(key => a[key] > b[key] + 1e-9).map(key => SHORT_STAT[key]);
  return `Beaten by ${itemTitle(by)} (${statLine(by)})${better.length ? `: more ${better.join(', ')}` : ''}`;
}

export function gavelWhy(item: GavelTrophy, by: GavelTrophy): string {
  const better = [...new Set(item.modifiers.map(m => m.mutation))].filter(m => trophyMutationBoost(by, m) > trophyMutationBoost(item, m) + 1e-9);
  const name = by.modifiers.map(m => `${m.mutation} +${m.boostPct}%`).join(' / ');
  return `Beaten by ${name}${better.length ? `: more ${better.join(', ')}` : ''}`;
}

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
    .map(a => ({ item: live.get(a.item.id), by: a.dominance?.dominator && live.get(a.dominance.dominator.id) }))
    .filter((x): x is { item: GearItem; by: GearItem | undefined } => Boolean(x.item) && !x.item!.favourite && !hasUnknownEffect(x.item!) && !certificateTargets!.has(x.item!.id))
    .map(({ item, by }) => ({ id: item.id, group: 'Gear' as const, name: itemTitle(item), detail: `${item.slot} · ${statLine(item)}`, why: by ? gearWhy(item, by) : undefined }));
  const gavels = analyseTrophyRetention(data.trophies, data.trophySettings)
    .filter(a => a.verdict === 'SAFE TO DISCARD' && !a.item.favourite)
    .map(a => ({ id: a.item.id, group: 'Gavels' as const, name: a.item.name, detail: '', why: a.dominator ? gavelWhy(a.item, a.dominator) : undefined }));
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
          {rows.map(c => <label className="row check" key={c.id}><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} /><span className="rowMain"><strong>{c.name}</strong>{c.detail && <span>{c.detail}</span>}{c.why && <small>{c.why}</small>}</span></label>)}
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
