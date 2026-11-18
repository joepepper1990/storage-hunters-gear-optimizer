import { BestGavels } from '../components/BestGavels';
import { optimise } from '../engine/optimizer';
import { placedCharmLuck } from '../engine/trophies';
import { effectiveItemStats } from '../engine/scoring';
import { useMemo } from 'react';
import type { GearLoadoutResult } from '../engine/gearLoadouts';
import { optimiseTrophies } from '../engine/trophies';
import { regradeSuggestions } from '../engine/regrade';
import type { CertificateQueue } from '../engine/certificateQueue';
import type { AppData } from '../types';
import { itemTitle, num, type SetData } from '../ui';
import { BestSetCards, type EquipmentView } from './Equipment';
import { NextCertificate } from './Certificates';

/** Everything that matters on one screen: what to wear, what certificate to use, what can go. */
export function Home({ data, setData, best, view, queue, onOpen, onAdd }: {
  data: AppData; setData:SetData; best?: GearLoadoutResult; view: EquipmentView; queue?: CertificateQueue;
  onOpen: (screen: 'Equipment' | 'Certificates') => void; onAdd: () => void;
}) {
  const gavels = useMemo(() => optimiseTrophies(data.trophies, data.trophySettings)[0], [data.trophies, data.trophySettings]);
  const target=data.settings.arrowTargetMin;
  const maxArrow=Math.ceil(['Head','Back','Wrist'].reduce((sum,slot)=>sum+Math.max(0,...data.gear.filter(g=>g.slot===slot).map(g=>effectiveItemStats(g).arrowReduction)),0));
  const alternatives=useMemo(()=>{
    const all=optimise(data.gear,data.settings,Math.max(1,data.gear.filter(g=>g.slot==='Head').length*data.gear.filter(g=>g.slot==='Back').length*data.gear.filter(g=>g.slot==='Wrist').length));
    return [all.find(c=>c.stats.arrowReduction<(best?.stats.arrowReduction??target)),all.find(c=>c.stats.arrowReduction>(best?.stats.arrowReduction??target))].filter(Boolean);
  },[data.gear,data.settings,best?.stats.arrowReduction]);
  const change=(key:'droughtbreakerStacks'|'goldenHourLuck'|'intermissionLuck',value:number)=>setData({...data,settings:{...data.settings,[key]:value}});
  // Regrading is judged on the Best Set only.
  const regrade = useMemo(() => regradeSuggestions({ main: best }, data.settings, data.gradeObservations ?? []).suggestions
    .filter(s => s.advice !== 'gamble'), [best, data.settings, data.gradeObservations]);

  return <section aria-labelledby="home-heading">
    <h1 id="home-heading" className="visuallyHidden">Home</h1>
    <article className="answerCard targetControls">
      <label htmlFor="arrow-target"><strong>Arrow reduction target: {num(target)}%</strong></label>
      <input id="arrow-target" type="range" min="0" max={Math.max(150,maxArrow,target)} step="1" value={target} onChange={e=>setData({...data,settings:{...data.settings,arrowTargetMin:Number(e.target.value),arrowTargetMax:Number(e.target.value)}})}/>
      <small>Closest match first → highest Luck → widest Bid Zone.</small>
      <details className="compactDetails"><summary>Luck bonuses</summary>
        <label>Golden Hour Luck <input aria-label="Golden Hour Luck" type="number" min="0" max="100" value={data.settings.goldenHourLuck??100} onChange={e=>change('goldenHourLuck',Math.min(100,Math.max(0,Number(e.target.value))))}/></label>
        <label>Droughtbreaker stacks <select value={data.settings.droughtbreakerStacks??0} onChange={e=>change('droughtbreakerStacks',Number(e.target.value))}>{[0,1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Intermission Luck <input aria-label="Intermission Luck" type="number" min="0" max="125" value={data.settings.intermissionLuck??0} onChange={e=>change('intermissionLuck',Math.min(125,Math.max(0,Number(e.target.value))))}/></label>
        <small>Golden Hour defaults to its maximum. Droughtbreaker and Intermission default to zero; Intermission is spent on one auction.</small>
      </details>
    </article>
    <h2>Best Set</h2>
    <BestSetCards best={best} />
    {regrade.length > 0 && <p className="note">Regrade: {regrade.map(s => `${itemTitle(s.item)} (${s.stars ? `${s.stars}★` : 'not graded'})`).join(', ')}</p>}
    {gavels&&<p className="note">Gear + charms: <strong>{num((best?.stats.luck??0)+placedCharmLuck(gavels.trophies))}% Luck</strong> · includes +{num(placedCharmLuck(gavels.trophies))}% from charms.</p>}
    {alternatives.length>0&&<details className="drawer"><summary>Alternative sets</summary>{alternatives.map(c=>c&&<article className="answerCard" key={[c.head.id,c.back.id,c.wrist.id].join('|')}><strong>{c.stats.arrowReduction<(best?.stats.arrowReduction??target)?'Faster arrows':'Slower arrows'} · {num(c.stats.arrowReduction)}% reduction</strong><p>Luck {num(c.stats.luck)} · Zone {num(c.stats.zone)}%</p><small>{[c.head,c.back,c.wrist].map(itemTitle).join(' / ')}</small></article>)}</details>}
    <BestGavels data={data}/>


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
