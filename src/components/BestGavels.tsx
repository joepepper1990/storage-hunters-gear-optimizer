import { useMemo } from 'react';
import type { AppData, GavelTrophy } from '../types';
import { optimiseTrophies, placedCharmLuck, effectiveTrophyModifiers, charmLabel, gavelMoveOpportunity } from '../engine/trophies';
import { num } from '../ui';
export function BestGavels({data,onEdit}:{data:AppData;onEdit?:(t:GavelTrophy)=>void}){
 const best=useMemo(()=>optimiseTrophies(data.trophies,data.trophySettings)[0],[data.trophies,data.trophySettings]);
 const move=useMemo(()=>gavelMoveOpportunity(data.trophies,data.trophySettings,data.looseCharms),[data.trophies,data.trophySettings,data.looseCharms]);
 if(!best)return null;
 return <article className="answerCard">
  <h2>Top {best.trophies.length} Gavels to display</h2>
  <p className="muted">With current charms · +{num(placedCharmLuck(best.trophies))}% general Luck</p>
  <ol className="gavelRecommendations">{best.trophies.map(t=><li key={t.id}>
   {onEdit?<button className="link" onClick={()=>onEdit(structuredClone(t))}><strong>{t.name}</strong></button>:<strong>{t.name}</strong>}
   <small>{effectiveTrophyModifiers(t).map(m=>`${m.mutation} +${num(m.boostPct)}%`).join(' · ')}</small>
   <small>{charmLabel(t)}</small>
  </li>)}</ol>
  <details className="compactDetails"><summary>Why these four?</summary><small>Preserves Mosaic Luck first, then compares mutation boosts using value weights. This is a comparison score, not a drop-rate or profit prediction.</small></details>
  {move&&<details className="compactDetails"><summary>Possible upgrade · {move.cost} gems</summary>
   <p>{move.spare?'Attach':'Move'} {move.charm.type} Charm {move.charm.value>0?`+${move.charm.value}%`:''} from {move.spare?'your spare charms':move.from.name} to {move.to.name}, then display {move.to.name} instead of {move.from.name}. Keeps +{move.luck}% Mosaic Luck and improves the mutation comparison score.</p>
   <small>Requires the destination gavel’s charm slot to be unlocked. Removal is reported free; attachment costs 50 gems. Your recorded arrangement stays unchanged until you edit it.</small>
  </details>}
 </article>;
}
