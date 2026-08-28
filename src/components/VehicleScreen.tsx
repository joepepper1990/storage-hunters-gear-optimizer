import { useMemo, useState } from 'react';
import { DEFAULT_VEHICLE_PROFILE, DEFAULT_VEHICLE_SETTINGS } from '../defaults';
import { analyseTrailers, analyseVehicleParts, optimiseVehicle, specialistVehicleLoadout, vehicleCombinationCount } from '../engine/vehicle';
import type { AppData, Trailer, VehicleCombinationResult, VehicleOptimiserSettings, VehiclePart, VehiclePartSlot, VehicleProfile } from '../types';

type Section = 'Overview' | 'Parts' | 'Optimise' | 'Settings';
const sections: Section[] = ['Overview','Parts','Optimise','Settings'];

export function VehicleScreen({data,setData}:{data:AppData;setData:(d:AppData)=>void}) {
  const [section,setSection]=useState<Section>('Overview');
  const [partEditor,setPartEditor]=useState<VehiclePart|null>(null);
  const [partMode,setPartMode]=useState<'add'|'edit'>('add');
  const [trailerEditor,setTrailerEditor]=useState<Trailer|null>(null);
  const [trailerMode,setTrailerMode]=useState<'add'|'edit'>('add');
  const [limit,setLimit]=useState(10);

  const combinations=useMemo(()=>optimiseVehicle(data.vehicleParts,data.trailers,data.vehicleProfile,data.vehicleSettings,100),[data.vehicleParts,data.trailers,data.vehicleProfile,data.vehicleSettings]);
  const best=combinations[0];
  const partAnalyses=useMemo(()=>analyseVehicleParts(data.vehicleParts,best),[data.vehicleParts,best]);
  const trailerAnalyses=useMemo(()=>analyseTrailers(data.trailers,best),[data.trailers,best]);
  const count=vehicleCombinationCount(data.vehicleParts,data.trailers);

  const openAddPart=(slot:VehiclePartSlot='Spoiler')=>{setPartMode('add');setPartEditor(blankPart(slot));};
  const openEditPart=(part:VehiclePart)=>{setPartMode('edit');setPartEditor(structuredClone(part));};
  const clonePart=(part:VehiclePart)=>{const c=structuredClone(part);c.id=crypto.randomUUID();c.name=`${part.name} copy`;c.createdAt=c.updatedAt=new Date().toISOString();setPartMode('add');setPartEditor(c);};
  const savePart=(part:VehiclePart)=>{const issue=validatePart(part);if(issue){alert(issue);return;}const now=new Date().toISOString();part.updatedAt=now;if(!part.createdAt)part.createdAt=now;setData({...data,vehicleParts:partMode==='add'?[...data.vehicleParts,part]:data.vehicleParts.map(p=>p.id===part.id?part:p)});setPartEditor(null);};
  const deletePart=(part:VehiclePart)=>{if(confirm(`Delete ${part.name}?`))setData({...data,vehicleParts:data.vehicleParts.filter(p=>p.id!==part.id)});};
  const togglePartFav=(part:VehiclePart)=>setData({...data,vehicleParts:data.vehicleParts.map(p=>p.id===part.id?{...p,favourite:!p.favourite,updatedAt:new Date().toISOString()}:p)});

  const openAddTrailer=()=>{setTrailerMode('add');setTrailerEditor(blankTrailer());};
  const openEditTrailer=(trailer:Trailer)=>{setTrailerMode('edit');setTrailerEditor(structuredClone(trailer));};
  const saveTrailer=(trailer:Trailer)=>{const issue=validateTrailer(trailer);if(issue){alert(issue);return;}const now=new Date().toISOString();trailer.updatedAt=now;if(!trailer.createdAt)trailer.createdAt=now;setData({...data,trailers:trailerMode==='add'?[...data.trailers,trailer]:data.trailers.map(t=>t.id===trailer.id?trailer:t)});setTrailerEditor(null);};
  const deleteTrailer=(trailer:Trailer)=>{if(confirm(`Delete ${trailer.name}?`))setData({...data,trailers:data.trailers.filter(t=>t.id!==trailer.id)});};
  const toggleTrailerFav=(trailer:Trailer)=>setData({...data,trailers:data.trailers.map(t=>t.id===trailer.id?{...t,favourite:!t.favourite,updatedAt:new Date().toISOString()}:t)});

  return <section>
    <div className="pageHeading"><div><h1>Vehicle</h1><p>{data.vehicleProfile.name} · {data.vehicleParts.length} parts · {data.trailers.length} trailers</p></div>{section==='Parts'&&<button className="primary" onClick={()=>openAddPart()}>＋ Add part</button>}</div>
    <div className="segmented vehicleSections">{sections.map(s=><button key={s} className={section===s?'active':''} onClick={()=>setSection(s)}>{s}</button>)}</div>

    {section==='Overview'&&<VehicleOverview data={data} best={best} partAnalyses={partAnalyses} onGo={setSection}/>} 
    {section==='Parts'&&<VehicleParts inventory={data.vehicleParts} trailers={data.trailers} partAnalyses={partAnalyses} trailerAnalyses={trailerAnalyses} onAddPart={openAddPart} onEditPart={openEditPart} onClonePart={clonePart} onDeletePart={deletePart} onFavPart={togglePartFav} onAddTrailer={openAddTrailer} onEditTrailer={openEditTrailer} onDeleteTrailer={deleteTrailer} onFavTrailer={toggleTrailerFav}/>} 
    {section==='Optimise'&&<VehicleOptimise data={data} combinations={combinations.slice(0,limit)} count={count} limit={limit} setLimit={setLimit}/>} 
    {section==='Settings'&&<VehicleSettings data={data} setData={setData}/>} 

    {partEditor&&<VehiclePartEditor item={partEditor} mode={partMode} onClose={()=>setPartEditor(null)} onSave={savePart}/>} 
    {trailerEditor&&<TrailerEditor item={trailerEditor} mode={trailerMode} onClose={()=>setTrailerEditor(null)} onSave={saveTrailer}/>} 
  </section>;
}

function VehicleOverview({data,best,partAnalyses,onGo}:{data:AppData;best:VehicleCombinationResult|undefined;partAnalyses:ReturnType<typeof analyseVehicleParts>;onGo:(s:Section)=>void}) {
  const safe=partAnalyses.filter(a=>a.verdict==='SAFE TO DISCARD').length;
  const baselineCapacity=data.vehicleProfile.baseCapacityKg*data.vehicleProfile.capacityMultiplier;
  return <>
    <div className="heroCard vehicleHero"><div><span className="eyebrow">BEST BALANCED SETUP</span><div className="heroScore">{best?.score.toFixed(2)??'—'}</div><span>Weighted improvement score</span></div><button className="primary compact" onClick={()=>onGo('Optimise')}>Inspect setup</button></div>
    {best&&<>
      <div className="vehicleLoadoutGrid"><VehicleSlotCard label="Spoiler" item={best.spoiler?.name}/><VehicleSlotCard label="Exhaust" item={best.exhaust?.name}/><VehicleSlotCard label="Wheel Stack" item={best.wheelStack?.name}/><VehicleSlotCard label="Trailer" item={best.trailer?.name}/></div>
      <div className="sectionTitle"><h2>Final vehicle stats</h2></div>
      <div className="statsGrid vehicleStats"><VehicleStat label="Speed" value={best.stats.speedDisplay} sub={`${signed(best.stats.speedBonusPct)}% parts`}/><VehicleStat label="Acceleration" value={best.stats.acceleration} suffix="×" sub={`${signed(best.stats.accelerationBonusPct)}% parts`}/><VehicleStat label="Handling" value={best.stats.handlingDisplay} sub={`${signed(best.stats.handlingBonusPct)}% parts`}/><VehicleStat label="Weight limit" value={best.stats.capacityKg} suffix=" kg" sub={`${signed(best.stats.capacityImprovementPct)}% vs ${formatNumber(baselineCapacity)} kg baseline`}/></div>
      <div className="notice vehicleFormula"><b>Confirmed game formula:</b> Speed and Acceleration part percentages add together before applying to the vehicle base stat. Trailer capacity is added before the ×{data.vehicleProfile.capacityMultiplier.toFixed(2)} capacity multiplier; flat part capacity is added afterwards.</div>
      <div className="sectionTitle"><h2>Score contribution</h2></div><div className="statsGrid"><VehicleStat label="Speed" value={best.scoreComponents.speed}/><VehicleStat label="Acceleration" value={best.scoreComponents.acceleration}/><VehicleStat label="Capacity" value={best.scoreComponents.capacity}/><VehicleStat label="Handling" value={best.scoreComponents.handling}/></div>
    </>}
    <div className="sectionTitle"><h2>Inventory</h2></div><div className="statsGrid three"><VehicleStat label="Parts" value={data.vehicleParts.length}/><VehicleStat label="Trailers" value={data.trailers.length}/><VehicleStat label="Safe parts" value={safe}/></div>
  </>;
}

function VehicleParts(props:{inventory:VehiclePart[];trailers:Trailer[];partAnalyses:ReturnType<typeof analyseVehicleParts>;trailerAnalyses:ReturnType<typeof analyseTrailers>;onAddPart:(s?:VehiclePartSlot)=>void;onEditPart:(p:VehiclePart)=>void;onClonePart:(p:VehiclePart)=>void;onDeletePart:(p:VehiclePart)=>void;onFavPart:(p:VehiclePart)=>void;onAddTrailer:()=>void;onEditTrailer:(t:Trailer)=>void;onDeleteTrailer:(t:Trailer)=>void;onFavTrailer:(t:Trailer)=>void}) {
  const [slot,setSlot]=useState<'All'|VehiclePartSlot>('All');
  const [q,setQ]=useState('');
  const analysisMap=new Map(props.partAnalyses.map(a=>[a.item.id,a]));
  const trailerMap=new Map(props.trailerAnalyses.map(a=>[a.item.id,a]));
  const parts=props.inventory.filter(p=>(slot==='All'||p.slot===slot)&&(!q||p.name.toLowerCase().includes(q.toLowerCase())));
  return <>
    <div className="filters vehicleFilters"><input placeholder="Search vehicle parts" value={q} onChange={e=>setQ(e.target.value)}/><select value={slot} onChange={e=>setSlot(e.target.value as typeof slot)}><option>All</option><option>Spoiler</option><option>Exhaust</option><option>Wheel Stack</option></select></div>
    <div className="quickAddRow"><button className="secondary compact" onClick={()=>props.onAddPart('Spoiler')}>＋ Spoiler</button><button className="secondary compact" onClick={()=>props.onAddPart('Exhaust')}>＋ Exhaust</button><button className="secondary compact" onClick={()=>props.onAddPart('Wheel Stack')}>＋ Wheel Stack</button></div>
    <div className="gearList">{parts.map(p=>{const a=analysisMap.get(p.id);return <article className="gearCard" key={p.id}><div className="rowBetween"><div><div className="slotLabel">{p.slot} · <code>{p.id.slice(0,8)}</code></div><h3>{p.name}</h3></div><button className={`star ${p.favourite?'on':''}`} onClick={()=>props.onFavPart(p)}>★</button></div><div className="chipRow"><VehicleStatus status={a?.verdict??'KEEP'}/>{p.mutation&&<span className="chip">{p.mutation}</span>}{p.rarity&&<span className="chip">{p.rarity}</span>}</div><div className="miniStats"><span>Speed <b>{signed(p.speedPct)}%</b></span><span>Acceleration <b>{signed(p.accelerationPct)}%</b></span>{p.handlingPct!==0&&<span>Handling <b>{signed(p.handlingPct)}%</b></span>}{p.capacityKg!==0&&<span>Capacity <b>{signed(p.capacityKg)} kg</b></span>}</div><p className="reason">{a?.reason}</p><div className="actions"><button onClick={()=>props.onEditPart(p)}>Edit</button><button onClick={()=>props.onClonePart(p)}>Clone</button><button className="textDanger" onClick={()=>props.onDeletePart(p)}>Delete</button></div></article>})}</div>
    {!parts.length&&<div className="empty"><h3>No matching vehicle parts</h3><p>Add a part or change the filters.</p></div>}

    <div className="sectionTitle"><h2>Trailers</h2><button className="secondary compact" onClick={props.onAddTrailer}>＋ Add trailer</button></div>
    <div className="gearList trailerList">{props.trailers.map(t=>{const a=trailerMap.get(t.id);return <article className="gearCard" key={t.id}><div className="rowBetween"><div><div className="slotLabel">TRAILER · <code>{t.id.slice(0,8)}</code></div><h3>{t.name}</h3></div><button className={`star ${t.favourite?'on':''}`} onClick={()=>props.onFavTrailer(t)}>★</button></div><div className="chipRow"><VehicleStatus status={a?.verdict??'KEEP'}/><span className="chip">+{formatNumber(t.capacityKg)} kg before capacity multiplier</span></div><p className="reason">{a?.reason}</p><div className="actions"><button onClick={()=>props.onEditTrailer(t)}>Edit</button><button className="textDanger" onClick={()=>props.onDeleteTrailer(t)}>Delete</button></div></article>})}</div>
  </>;
}

function VehicleOptimise({data,combinations,count,limit,setLimit}:{data:AppData;combinations:VehicleCombinationResult[];count:number;limit:number;setLimit:(n:number)=>void}) {
  const [sort,setSort]=useState<'score'|'speed'|'acceleration'|'capacity'>('score');
  const ranked=combinations.map((c,index)=>({c,rank:index+1}));
  if(sort!=='score')ranked.sort((a,b)=>metric(b.c,sort)-metric(a.c,sort)||b.c.score-a.c.score);
  const specialists=[
    ['Maximum Speed',specialistVehicleLoadout(data.vehicleParts,data.trailers,data.vehicleProfile,data.vehicleSettings,'speed'),'speed'],
    ['Maximum Acceleration',specialistVehicleLoadout(data.vehicleParts,data.trailers,data.vehicleProfile,data.vehicleSettings,'acceleration'),'acceleration'],
    ['Maximum Capacity',specialistVehicleLoadout(data.vehicleParts,data.trailers,data.vehicleProfile,data.vehicleSettings,'capacity'),'capacity']
  ] as const;
  return <>
    <div className="pageHeading"><div><h2>Vehicle optimisation</h2><p>{count.toLocaleString()} Spoiler × Exhaust × Wheel Stack × Trailer possibilities, including empty slots</p></div></div>
    <div className="toolbarRow"><div className="segmented">{[10,25,100].map(n=><button key={n} className={limit===n?'active':''} onClick={()=>setLimit(n)}>Top {n}</button>)}</div><label className="sortControl">Sort<select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="score">Balanced score</option><option value="speed">Speed</option><option value="acceleration">Acceleration</option><option value="capacity">Capacity</option></select></label></div>
    {ranked.map(({c,rank},index)=><details className={`comboCard vehicleCombo ${rank===1?'best':''}`} key={comboKey(c)} open={index===0}><summary><div><span className="rank">#{rank}</span><strong>{c.score.toFixed(2)}</strong><span>{comboName(c)}</span></div></summary><div className="comboBody"><div className="vehicleLoadoutGrid"><VehicleSlotCard label="Spoiler" item={c.spoiler?.name}/><VehicleSlotCard label="Exhaust" item={c.exhaust?.name}/><VehicleSlotCard label="Wheel Stack" item={c.wheelStack?.name}/><VehicleSlotCard label="Trailer" item={c.trailer?.name}/></div><div className="statsGrid vehicleStats"><VehicleStat label="Speed" value={c.stats.speedDisplay} sub={`${signed(c.stats.speedBonusPct)}%`}/><VehicleStat label="Acceleration" value={c.stats.acceleration} suffix="×" sub={`${signed(c.stats.accelerationBonusPct)}%`}/><VehicleStat label="Handling" value={c.stats.handlingDisplay}/><VehicleStat label="Weight limit" value={c.stats.capacityKg} suffix=" kg" sub={`${signed(c.stats.capacityImprovementPct)}% baseline`}/></div><div className="scoreBreakdown"><b>Balanced {c.score.toFixed(2)}</b><span>Speed {c.scoreComponents.speed.toFixed(2)}</span><span>Acceleration {c.scoreComponents.acceleration.toFixed(2)}</span><span>Capacity {c.scoreComponents.capacity.toFixed(2)}</span></div></div></details>)}
    <div className="sectionTitle"><h2>Specialist setups</h2></div><div className="specialists">{specialists.map(([label,c,key])=><div className="card" key={label}><strong>{label}</strong>{c?<><div className="specialValue">{key==='speed'?c.stats.speedDisplay:key==='acceleration'?`${c.stats.acceleration.toFixed(2)}×`:`${formatNumber(c.stats.capacityKg)} kg`}</div><span>{comboName(c)}</span></>:<span className="muted">No setup</span>}</div>)}</div>
  </>;
}

function VehicleSettings({data,setData}:{data:AppData;setData:(d:AppData)=>void}) {
  const p=data.vehicleProfile,s=data.vehicleSettings;
  const setP=<K extends keyof VehicleProfile>(k:K,v:VehicleProfile[K])=>setData({...data,vehicleProfile:{...p,[k]:v}});
  const setS=<K extends keyof VehicleOptimiserSettings>(k:K,v:VehicleOptimiserSettings[K])=>setData({...data,vehicleSettings:{...s,[k]:v}});
  const baseline=p.baseCapacityKg*p.capacityMultiplier;
  return <>
    <div className="sectionTitle"><h2>Active vehicle</h2><button className="secondary compact" onClick={()=>setData({...data,vehicleProfile:{...DEFAULT_VEHICLE_PROFILE}})}>Reset Dumpster Truck</button></div>
    <div className="settingsGrid"><label className="settingField"><span>Vehicle name</span><input value={p.name} onChange={e=>setP('name',e.target.value)}/></label><NumberSetting label="Base Speed" value={p.baseSpeed} onChange={v=>setP('baseSpeed',v)}/><NumberSetting label="Base Acceleration" value={p.baseAcceleration} onChange={v=>setP('baseAcceleration',v)}/><NumberSetting label="Base Handling" value={p.baseHandling} onChange={v=>setP('baseHandling',v)}/><NumberSetting label="Base Capacity kg" value={p.baseCapacityKg} onChange={v=>setP('baseCapacityKg',v)}/><NumberSetting label="Capacity multiplier" value={p.capacityMultiplier} onChange={v=>setP('capacityMultiplier',v)}/></div>
    <div className="notice">Current no-trailer/no-part capacity baseline: <b>{formatNumber(baseline)} kg</b>. Your 50% capacity gamepass is represented by multiplier <b>1.50</b>.</div>
    <div className="sectionTitle"><h2>Balanced score priorities</h2><button className="secondary compact" onClick={()=>setData({...data,vehicleSettings:{...DEFAULT_VEHICLE_SETTINGS}})}>Reset 45 / 30 / 15 / 10</button></div>
    <div className="settingsGrid"><NumberSetting label="Capacity priority" value={s.capacityWeight} suffix="%" onChange={v=>setS('capacityWeight',v)}/><NumberSetting label="Speed priority" value={s.speedWeight} suffix="%" onChange={v=>setS('speedWeight',v)}/><NumberSetting label="Acceleration priority" value={s.accelerationWeight} suffix="%" onChange={v=>setS('accelerationWeight',v)}/><NumberSetting label="Handling priority" value={s.handlingWeight} suffix="%" onChange={v=>setS('handlingWeight',v)}/></div>
    <div className="notice"><b>This is your optimiser model, not an official game score.</b> Each raw stat is converted to percentage improvement versus the active vehicle baseline, then weighted by the relative priorities above. The weights are normalised automatically, so they do not have to total exactly 100.</div>
    <div className="notice"><b>Handling:</b> no owned part currently has a documented Handling roll. The field is supported for future evidence, but its score contribution is currently zero for the known inventory.</div>
  </>;
}

function VehiclePartEditor({item,mode,onClose,onSave}:{item:VehiclePart;mode:'add'|'edit';onClose:()=>void;onSave:(p:VehiclePart)=>void}) {
  const [v,setV]=useState(item);
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'NEW VEHICLE PART':'EDIT VEHICLE PART'}</span><h2>{v.name||v.slot}</h2></div><button className="iconButton" onClick={onClose}>×</button></div><div className="formGrid"><label className="wide">Name<input autoFocus value={v.name} onChange={e=>setV({...v,name:e.target.value})}/></label><label>Slot<select value={v.slot} onChange={e=>setV({...v,slot:e.target.value as VehiclePartSlot})}><option>Spoiler</option><option>Exhaust</option><option>Wheel Stack</option></select></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>setV({...v,favourite:e.target.checked})}/> Lock / favourite</label><NumberInput label="Vehicle Speed %" value={v.speedPct} onChange={n=>setV({...v,speedPct:n})}/><NumberInput label="Vehicle Acceleration %" value={v.accelerationPct} onChange={n=>setV({...v,accelerationPct:n})}/><NumberInput label="Weight Capacity kg" value={v.capacityKg} onChange={n=>setV({...v,capacityKg:n})}/><NumberInput label="Handling % (only if shown)" value={v.handlingPct} onChange={n=>setV({...v,handlingPct:n})}/><label>Mutation / prefix<input value={v.mutation??''} onChange={e=>setV({...v,mutation:e.target.value})}/></label><label>Rarity<input value={v.rarity??''} onChange={e=>setV({...v,rarity:e.target.value})}/></label><label className="wide">Notes<textarea rows={3} value={v.notes??''} onChange={e=>setV({...v,notes:e.target.value})}/></label><label>Date obtained<input type="date" value={v.obtainedAt??''} onChange={e=>setV({...v,obtainedAt:e.target.value})}/></label></div><div className="notice">Enter part modifiers exactly as displayed in game. Positive and negative decimal rolls are allowed. Capacity is stored as flat kg.</div><div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave(v)}>{mode==='add'?'Add part':'Save changes'}</button></div></div></div>;
}

function TrailerEditor({item,mode,onClose,onSave}:{item:Trailer;mode:'add'|'edit';onClose:()=>void;onSave:(t:Trailer)=>void}) {
  const [v,setV]=useState(item);
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'NEW TRAILER':'EDIT TRAILER'}</span><h2>{v.name||'Trailer'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div><div className="formGrid"><label className="wide">Name<input autoFocus value={v.name} onChange={e=>setV({...v,name:e.target.value})}/></label><NumberInput label="Trailer capacity kg" value={v.capacityKg} onChange={n=>setV({...v,capacityKg:n})}/><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>setV({...v,favourite:e.target.checked})}/> Lock / favourite</label><label className="wide">Notes<textarea rows={3} value={v.notes??''} onChange={e=>setV({...v,notes:e.target.value})}/></label></div><div className="notice">Trailer capacity is applied before the vehicle capacity multiplier, matching the in-game Long Trailer test.</div><div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave(v)}>{mode==='add'?'Add trailer':'Save changes'}</button></div></div></div>;
}

function VehicleSlotCard({label,item}:{label:string;item?:string}) { return <div className="loadoutCard"><span>{label}</span><strong>{item??'None'}</strong></div>; }
function VehicleStat({label,value,suffix='',sub}:{label:string;value:number;suffix?:string;sub?:string}) { return <div className="statTile"><span>{label}</span><strong>{formatNumber(value)}{suffix}</strong>{sub&&<small className="vehicleStatSub">{sub}</small>}</div>; }
function VehicleStatus({status}:{status:string}) { return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-')}`}>{status}</span>; }
function NumberSetting({label,value,suffix,onChange}:{label:string;value:number;suffix?:string;onChange:(v:number)=>void}) { return <label className="settingField"><span>{label}{suffix?` ${suffix}`:''}</span><input type="number" step="any" value={value} onChange={e=>onChange(finiteInput(e.target.value))}/></label>; }
function NumberInput({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}) { return <label>{label}<input inputMode="decimal" type="number" step="any" value={value} onChange={e=>onChange(finiteInput(e.target.value))}/></label>; }

function blankPart(slot:VehiclePartSlot):VehiclePart { const now=new Date().toISOString();return{id:crypto.randomUUID(),name:'',slot,speedPct:0,accelerationPct:0,handlingPct:0,capacityKg:0,favourite:false,createdAt:now,updatedAt:now}; }
function blankTrailer():Trailer { const now=new Date().toISOString();return{id:crypto.randomUUID(),name:'',capacityKg:0,favourite:false,createdAt:now,updatedAt:now}; }
function validatePart(p:VehiclePart) { if(!p.name.trim())return 'Part name is required.';if(!['Spoiler','Exhaust','Wheel Stack'].includes(p.slot))return 'Valid part slot is required.';for(const [label,value] of [['Speed',p.speedPct],['Acceleration',p.accelerationPct],['Handling',p.handlingPct],['Capacity',p.capacityKg]] as const)if(!Number.isFinite(value))return `${label} must be a finite number.`;return ''; }
function validateTrailer(t:Trailer) { if(!t.name.trim())return 'Trailer name is required.';if(!Number.isFinite(t.capacityKg))return 'Trailer capacity must be a finite number.';return ''; }
function finiteInput(value:string){const n=Number(value);return Number.isFinite(n)?n:0;}
function signed(v:number){return `${v>0?'+':''}${formatNumber(v)}`;}
function formatNumber(v:number){if(!Number.isFinite(v))return '—';const abs=Math.abs(v);const digits=Number.isInteger(v)?0:abs<10?2:1;return v.toFixed(digits).replace(/\.0$/,'').replace(/(\.\d)0$/,'$1');}
function metric(c:VehicleCombinationResult,k:'speed'|'acceleration'|'capacity'){return k==='speed'?c.stats.speedExact:k==='acceleration'?c.stats.acceleration:c.stats.capacityKg;}
function comboName(c:VehicleCombinationResult){return [c.spoiler?.name,c.exhaust?.name,c.wheelStack?.name,c.trailer?.name].filter(Boolean).join(' · ')||'No accessories';}
function comboKey(c:VehicleCombinationResult){return [c.spoiler?.id??'none',c.exhaust?.id??'none',c.wheelStack?.id??'none',c.trailer?.id??'none'].join('-');}
