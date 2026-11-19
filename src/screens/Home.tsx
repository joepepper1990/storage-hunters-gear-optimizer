import {useMemo} from 'react';
import {optimise} from '../engine/optimizer';
import {arrowBandDistance} from '../engine/scoring';
import {optimiseTrophies,placedCharmLuck} from '../engine/trophies';
import type {GearLoadoutResult} from '../engine/gearLoadouts';
import type {CertificateQueue} from '../engine/certificateQueue';
import type {AppData} from '../types';
import {itemTitle,num,type SetData} from '../ui';
import {BestSetCards,type EquipmentView} from './Equipment';
import {NextCertificate} from './Certificates';

export function Home({data,setData,best,view,queue,onOpen}: {
 data:AppData;setData:SetData;best?:GearLoadoutResult;view:EquipmentView;queue?:CertificateQueue;
 onOpen:(screen:'Equipment'|'Certificates')=>void;onAdd:()=>void;
}) {
 const gavels=useMemo(()=>optimiseTrophies(data.trophies,data.trophySettings)[0],[data.trophies,data.trophySettings]);
 const charmLuck=gavels?placedCharmLuck(gavels.trophies):0;
 const all=useMemo(()=>optimise(data.gear,data.settings,Math.max(1,data.gear.length**3)),[data.gear,data.settings]);
 const eligible=useMemo(()=>{const min=all.length?Math.min(...all.map(c=>arrowBandDistance(c.stats.arrowReduction,data.settings))):0;return all.filter(c=>Math.abs(arrowBandDistance(c.stats.arrowReduction,data.settings)-min)<1e-9);},[all,data.settings]);
 const bounds=useMemo(()=>({min:eligible.length?Math.min(...eligible.map(c=>c.stats.luck)):0,max:eligible.length?Math.max(...eligible.map(c=>c.stats.luck)):0,arrow:all.length?Math.max(...all.map(c=>c.stats.arrowReduction)):95}),[all,eligible]);
 const alternatives=useMemo(()=>{
   const seen=new Set<number>();const rows=[];
   for(const c of all){if(c.stats.arrowReduction===best?.stats.arrowReduction||seen.has(c.stats.arrowReduction))continue;seen.add(c.stats.arrowReduction);rows.push(c);if(rows.length===3)break;}
   return rows;
 },[all,best?.stats.arrowReduction]);
 const target=data.settings.arrowTargetMin;
 const shownArrow=target;
 const luckTarget=data.settings.goalMode==='luck'?data.settings.luckTarget??best?.stats.luck??0:best?.stats.luck??0;
 const changeArrow=(v:number)=>setData({...data,settings:{...data.settings,goalMode:'arrow',arrowTargetMin:v,arrowTargetMax:v}});
 const changeLuck=(v:number)=>setData({...data,settings:{...data.settings,goalMode:'luck',luckTarget:v}});
 return <section aria-labelledby="home-heading" className="homeScreen">
  <div className="pageHeading"><div><span className="eyebrow">Auction setup</span><h1 id="home-heading">Make every bid count.</h1></div><span className="livePill">Your gear</span></div>
  <article className="heroStats" aria-label="Current auction stats">
   <div className="heroLuck"><span>Luck <small>gear + charms</small></span><strong>{num((best?.stats.luck??0)+charmLuck)}<em>%</em></strong></div>
   <div className="heroMetrics"><div><span>Arrow reduction</span><strong>{num(best?.stats.arrowReduction??0)}%</strong></div><div><span>Bid zone</span><strong>+{num(best?.stats.zone??0)}%</strong></div></div>
  </article>
  <article className="answerCard targetControls">
   <div className="sectionTitle"><strong>Find your balance</strong><span className="chip">{data.settings.goalMode==='luck'?'Explore Luck':'Max Luck'}</span></div>
   <label htmlFor="arrow-target">Arrow minimum <output>{num(shownArrow)}%</output></label>
   <input id="arrow-target" type="range" min="0" max={Math.max(150,bounds.arrow,target)} step="1" value={shownArrow} disabled={!all.length} onChange={e=>changeArrow(Number(e.target.value))}/>
   <label htmlFor="luck-target">Gear Luck <output>{num(Math.max(bounds.min,Math.min(bounds.max,luckTarget)))}%</output></label>
   <input id="luck-target" type="range" min={bounds.min} max={bounds.max} step="0.1" value={Math.max(bounds.min,Math.min(bounds.max,luckTarget))} disabled={bounds.min===bounds.max} onChange={e=>changeLuck(Number(e.target.value))}/>
   <div className="rangeEnds"><span>{num(bounds.min)}% min</span><span>{num(bounds.max)}% max</span></div>
   <small className="balanceHint">Meet the Arrow minimum → Luck → Bid Zone</small>
   <details className="compactDetails"><summary>Bonus assumptions</summary><ul className="plainList"><li>Golden Hour: +100% at maximum</li><li>Droughtbreaker: 0 stacks</li><li>Intermission: 0% · one-auction boost excluded</li><li>Charms: +{num(charmLuck)}% · separate from gear slider</li></ul></details>
  </article>
  <div className="sectionTitle"><h2>Best Set</h2><button className="link" onClick={()=>onOpen('Equipment')}>Manage →</button></div>
  <BestSetCards best={best}/>
  <details className="drawer"><summary>Alternative sets</summary>{alternatives.map(c=><div className="alternativeRow" key={[c.head.id,c.back.id,c.wrist.id].join('|')}><strong>{num(c.stats.luck)}% Luck · {num(c.stats.arrowReduction)}% Arrow</strong><small>{[c.head,c.back,c.wrist].map(itemTitle).join(' / ')}</small></div>)}</details>
  <NextCertificate row={queue?.rows[0]} computing={!queue} hasCertificates={data.ownedCertificates.some(c=>c.quantity>0)} more={<button className="link" onClick={()=>onOpen('Certificates')}>View certificates →</button>}/>
  <button className="inventoryShortcut" onClick={()=>onOpen('Equipment')}><span>Equipment <small>{data.gear.length} pieces · {data.trophies.length} gavels</small></span><strong>{view.ready?`${view.discard.length+view.gavelDiscard.length} discardable`:'Checking…'} →</strong></button>
 </section>;
}
