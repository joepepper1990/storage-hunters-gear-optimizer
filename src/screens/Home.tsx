import { useMemo } from 'react';
import type { GearLoadoutResult } from '../engine/gearLoadouts';
import { optimiseTrophies } from '../engine/trophies';
import { regradeSuggestions } from '../engine/regrade';
import type { CertificateQueue } from '../engine/certificateQueue';
import type { AppData } from '../types';
import { itemTitle, num } from '../ui';
import { BestSetCards, type EquipmentView } from './Equipment';
import { NextCertificate } from './Certificates';

/** Everything that matters on one screen: what to wear, what certificate to use, what can go. */
export function Home({ data, best, view, queue, onOpen, onAdd }: {
  data: AppData; best?: GearLoadoutResult; view: EquipmentView; queue?: CertificateQueue;
  onOpen: (screen: 'Equipment' | 'Certificates') => void; onAdd: () => void;
}) {
  const gavels = useMemo(() => optimiseTrophies(data.trophies, data.trophySettings)[0], [data.trophies, data.trophySettings]);
  // Regrading is judged on the Best Set only.
  const regrade = useMemo(() => regradeSuggestions({ main: best }, data.settings, data.gradeObservations ?? []).suggestions
    .filter(s => s.advice !== 'gamble'), [best, data.settings, data.gradeObservations]);

  return <section aria-labelledby="home-heading">
    <h1 id="home-heading" className="visuallyHidden">Home</h1>
    <h2>Best Set</h2>
    <BestSetCards best={best} />
    {regrade.length > 0 && <p className="note">Regrade: {regrade.map(s => `${itemTitle(s.item)} (${s.stars ? `${s.stars}★` : 'not graded'})`).join(', ')}</p>}
    {gavels?.trophies.length ? <p className="note">Best Gavels: {gavels.trophies.map(t => t.modifiers.map(m => `${m.mutation} +${num(m.boostPct)}%`).join(' · ')).join(' / ')}</p> : null}

    <NextCertificate row={queue?.rows[0]} computing={!queue} hasCertificates={data.ownedCertificates.some(c => c.quantity > 0)}
      more={<button className="link" onClick={() => onOpen('Certificates')}>Certificates →</button>} />

    <article className="answerCard">
      <span className="eyebrow">Equipment</span>
      {view.ready ? <p className="counts"><span>Keep <b>{view.keep.length}</b></span><span>Safe to discard <b>{view.discard.length + view.gavelDiscard.length}</b></span></p>
        : <p className="updating" role="status">Updating…</p>}
      <button className="link" onClick={() => onOpen('Equipment')}>Equipment →</button>
    </article>

    <button className="primary addButton" onClick={onAdd}>＋ Add equipment</button>
  </section>;
}
