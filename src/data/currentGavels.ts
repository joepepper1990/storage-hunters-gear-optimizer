import type { GavelTrophy, GavelCharm } from '../types';
export function currentGavels():GavelTrophy[] {
 const rows:Array<[string,Array<[string,number]>,GavelCharm|undefined,number?,number?]>=[
 ['Red Gavel',[['Secret',101]],{type:'Clover',value:28}],
 ['Blue Gavel',[['Void',147],['Gold',146]],{type:'Magnifier',value:0}],
 ['Red Gavel #2',[['Secret',39],['Hologram',57]],{type:'Mosaic',value:13}],
 ['Hologram Gavel',[['Hologram',124],['Chrome',123],['Diamond',34]],{type:'Star',value:1}],
 ['Gavel Trophy [Secret][Silver]',[['Secret',113],['Silver',76]],undefined,59,5643]
 ];
 return rows.map(([name,rolls,charm,conditionPct,displayedValue],i)=>({id:`owner-20261118-gavel-${i}`,name,modifiers:rolls.map(([mutation,boostPct])=>({mutation,boostPct})),charm,conditionPct,displayedValue,favourite:false,createdAt:'2026-11-18T00:00:00Z',updatedAt:'2026-11-18T00:00:00Z'}));
}
export function currentLooseCharms():GavelCharm[]{
 return [{type:'Clover',value:25},{type:'Clover',value:19},...[92,59,37,34,32,27].map(value=>({type:'Moon' as const,value})),{type:'Diamond',value:22},{type:'Diamond',value:21}];
}

export function reconcileCurrentGavels(existing:GavelTrophy[]):GavelTrophy[]{
 const unused=[...existing];
 const signature=(t:GavelTrophy)=>t.modifiers.map(m=>`${m.mutation}:${m.boostPct}`).sort().join('|');
 return currentGavels().map(next=>{
  const index=unused.findIndex(old=>signature(old)===signature(next));
  if(index<0)return next;
  const [old]=unused.splice(index,1);
  return {...next,id:old.id,favourite:old.favourite,createdAt:old.createdAt};
 });
}
