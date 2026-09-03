import { useMemo, useState } from 'react';
import { DEFAULT_TROPHY_SETTINGS } from '../defaults';
import { optimiseTrophies, trophyScore } from '../engine/trophies';
import { TROPHY_UI_CONTRACT } from './trophyUiContract';
import { generateTrophyName } from '../naming';
import type { AppData, GavelTrophy, TrophyCombinationResult, TrophyMutationWeight, TrophyOptimiserSettings } from '../types';

type Section='Overview'|'Trophies'|'Settings';
type InventorySort='score'|'name'|'mutation';
type SortDirection='desc'|'asc';
const sections:Section[]=['Overview','Trophies','Settings'];

export function TrophyScreen({data,setData}:{data:AppData;setData:(d:AppData)=>void}){
  const [section,setSection]=useState<Section>('Overview');
  const [editor,setEditor]=useState<GavelTrophy|null>(null);
  const [mode,setMode]=useState<'add'|'edit'>('add');
  const best=useMemo(()=>optimiseTrophies(data.trophies,data.trophySettings)[0],[data.trophies,data.trophySettings]);
  const openAdd=()=>{setMode('add');setEditor(blankTrophy(data.trophySettings.mutationWeights));};
  const openEdit=(t:GavelTrophy)=>{setMode('edit');setEditor(structuredClone(t));};
  const clone=(t:GavelTrophy)=>{const c=structuredClone(t);c.id=crypto.randomUUID();c.name=generateTrophyName(c.modifiers);c.createdAt=c.updatedAt=new Date().toISOString();setMode('add');setEditor(c);};
  const save=(input:GavelTrophy)=>{const t={...input,name:generateTrophyName(input.modifiers)};const issue=validateTrophy(t);if(issue){alert(issue);return;}const now=new Date().toISOString();t.updatedAt=now;if(!t.createdAt)t.createdAt=now;setData({...data,trophies:mode==='add'?[...data.trophies,t]:data.trophies.map(x=>x.id===t.id?t:x)});setEditor(null);};
  const del=(t:GavelTrophy)=>{if(confirm(`Delete ${t.name}?`))setData({...data,trophies:data.trophies.filter(x=>x.id!==t.id)});};
  const fav=(t:GavelTrophy)=>setData({...data,trophies:data.trophies.map(x=>x.id===t.id?{...x,favourite:!x.favourite,updatedAt:new Date().toISOString()}:x)});
  return <section>
    <div className="pageHeading"><div><h1>Gavel Trophies</h1><p>{data.trophies.length} owned · maximum {TROPHY_UI_CONTRACT.activeLimit} equipped</p></div>{section==='Trophies'&&<button className="primary" onClick={openAdd}>＋ Add trophy</button>}</div>
    <div className="segmented trophySections">{sections.map(s=><button key={s} className={section===s?'active':''} onClick={()=>setSection(s)}>{s}</button>)}</div>
    {section==='Overview'&&<Overview data={data} best={best}/>}
    {section==='Trophies'&&<Inventory data={data} best={best} onAdd={openAdd} onEdit={openEdit} onClone={clone} onDelete={del} onFav={fav}/>}
    {section==='Settings'&&<Settings data={data} setData={setData}/>}
    {editor&&<TrophyEditor item={editor} weights={data.trophySettings.mutationWeights} mode={mode} onClose={()=>setEditor(null)} onSave={save}/>}
  </section>;
}

function Overview({data,best}:{data:AppData;best:TrophyCombinationResult|undefined}){
  return <>
    <div className="sectionTitle"><h2>BEST 4 GAVELS</h2></div>
    {!best&&<div className="empty"><h3>No Gavels yet</h3><p>Add Gavel Trophies and the best set will appear here automatically.</p></div>}
    {best&&<>
      <div className="heroCard trophyHero"><div><span className="eyebrow">TOTAL RELATIVE SCORE</span><div className="heroScore">{best.score.toFixed(0)}</div><span>{best.trophies.length} of {TROPHY_UI_CONTRACT.activeLimit} available slots filled</span></div></div>
      <div className="trophyLoadout">{best.trophies.map((t,i)=><div className="loadoutCard" key={t.id}><span>{i+1}. Gavel</span><strong>{t.name}</strong><small>{t.modifiers.map(m=>`${m.mutation} +${fmt(m.boostPct)}%`).join(' · ')}</small></div>)}</div>
      <div className="sectionTitle"><h2>Combined mutation boosts</h2></div><BoostGrid result={best}/>
    </>}
    <div className="notice"><b>Optimiser rule:</b> equip the four Gavels with the highest combined relative mutation-value score. If fewer than four are owned, all available Gavels are selected. Non-selected Gavels receive no KEEP or SAFE TO DISCARD verdict.</div>
    <div className="sectionTitle"><h2>Inventory</h2></div><div className="statsGrid three"><Stat label="Owned" value={data.trophies.length}/><Stat label="Equipped limit" value={TROPHY_UI_CONTRACT.activeLimit}/><Stat label="Selected" value={best?.trophies.length??0}/></div>
  </>;
}

function Inventory({data,best,onAdd,onEdit,onClone,onDelete,onFav}:{data:AppData;best:TrophyCombinationResult|undefined;onAdd:()=>void;onEdit:(t:GavelTrophy)=>void;onClone:(t:GavelTrophy)=>void;onDelete:(t:GavelTrophy)=>void;onFav:(t:GavelTrophy)=>void}){
  const [sortBy,setSortBy]=useState<InventorySort>('score');
  const [direction,setDirection]=useState<SortDirection>('desc');
  const enabled=data.trophySettings.mutationWeights.filter(w=>w.enabled);
  const [mutation,setMutation]=useState(enabled[0]?.mutation??'Silver');
  const selected=new Set(best?.trophies.map(t=>t.id)??[]);
  const boost=(t:GavelTrophy,m:string)=>t.modifiers.filter(x=>x.mutation===m).reduce((n,x)=>n+x.boostPct,0);
  const items=[...data.trophies].sort((a,b)=>{
    let cmp=0;
    if(sortBy==='score')cmp=trophyScore(a,data.trophySettings)-trophyScore(b,data.trophySettings);
    else if(sortBy==='name')cmp=a.name.localeCompare(b.name);
    else cmp=boost(a,mutation)-boost(b,mutation);
    return direction==='desc'?-cmp:cmp;
  });
  return <>
    <div className="toolbarRow trophyInventorySort"><label className="sortControl">Sort by<select value={sortBy} onChange={e=>setSortBy(e.target.value as InventorySort)}><option value="score">Trophy score</option><option value="name">Name</option><option value="mutation">Specific modifier</option></select></label>{sortBy==='mutation'&&<label className="sortControl">Modifier<select value={mutation} onChange={e=>setMutation(e.target.value)}>{enabled.map(w=><option key={w.mutation}>{w.mutation}</option>)}</select></label>}<label className="sortControl">Order<select value={direction} onChange={e=>setDirection(e.target.value as SortDirection)}><option value="desc">{sortBy==='name'?'Z → A':'Highest → lowest'}</option><option value="asc">{sortBy==='name'?'A → Z':'Lowest → highest'}</option></select></label></div>
    {!data.trophies.length&&<div className="empty"><h3>No Gavel Trophies yet</h3><p>Add the mutation boosts exactly as displayed on each trophy. The name is generated automatically.</p><button className="primary" onClick={onAdd}>＋ Add trophy</button></div>}
    <div className="gearList">{items.map(t=><article className="gearCard" key={t.id}><div className="rowBetween"><div><div className="slotLabel">GAVEL TROPHY · <code>{t.id.slice(0,8)}</code></div><h3>{t.name}</h3></div><button className={`star ${t.favourite?'on':''}`} onClick={()=>onFav(t)}>★</button></div><div className="chipRow">{selected.has(t.id)&&<span className="badge status equip">EQUIP</span>}<span className="chip score">{trophyScore(t,data.trophySettings).toFixed(0)} score</span></div><div className="miniStats">{t.modifiers.map((m,i)=><span key={`${m.mutation}-${i}`}>{m.mutation} <b>+{fmt(m.boostPct)}%</b></span>)}</div><div className="actions"><button onClick={()=>onEdit(t)}>Edit</button><button onClick={()=>onClone(t)}>Clone</button><button className="textDanger" onClick={()=>onDelete(t)}>Delete</button></div></article>)}</div>
  </>;
}

function Settings({data,setData}:{data:AppData;setData:(d:AppData)=>void}){
  const s=data.trophySettings;
  const setS=(next:TrophyOptimiserSettings)=>setData({...data,trophySettings:{...next,maxActive:TROPHY_UI_CONTRACT.activeLimit}});
  const updateWeight=(mutation:string,patch:Partial<TrophyMutationWeight>)=>setS({...s,mutationWeights:s.mutationWeights.map(w=>w.mutation===mutation?{...w,...patch}:w)});
  const addWeight=()=>{const name=prompt('Mutation name');if(!name?.trim()||s.mutationWeights.some(w=>w.mutation.toLowerCase()===name.trim().toLowerCase()))return;setS({...s,mutationWeights:[...s.mutationWeights,{mutation:name.trim(),multiplier:1,enabled:true,confidence:'Uncertain'}]});};
  return <>
    <div className="notice"><b>Equipped Gavel limit: {TROPHY_UI_CONTRACT.activeLimit}.</b> This is locked to the current game rule and is not an optimisation setting.</div>
    <div className="sectionTitle"><h2>Mutation value weights</h2><div><button className="secondary compact" onClick={addWeight}>＋ Custom</button> <button className="secondary compact" onClick={()=>setS(structuredClone(DEFAULT_TROPHY_SETTINGS))}>Reset defaults</button></div></div>
    <div className="card trophyWeights">{s.mutationWeights.map(w=><div className="trophyWeightRow" key={w.mutation}><label className="check"><input type="checkbox" checked={w.enabled} onChange={e=>updateWeight(w.mutation,{enabled:e.target.checked})}/> {w.mutation}</label><label>Value multiplier<input type="number" step="any" min="0" value={w.multiplier} onChange={e=>updateWeight(w.mutation,{multiplier:Math.max(0,Number(e.target.value)||0)})}/></label><label>Confidence<select value={w.confidence} onChange={e=>updateWeight(w.mutation,{confidence:e.target.value as TrophyMutationWeight['confidence']})}><option>Confirmed</option><option>Community</option><option>Uncertain</option></select></label></div>)}</div>
    <div className="notice warning"><b>Rainbow and some newer/rarer multipliers are not equally well established across public sources.</b> They remain editable so the four-Gavel ranking recalculates immediately when evidence changes.</div>
  </>;
}

function TrophyEditor({item,weights,mode,onClose,onSave}:{item:GavelTrophy;weights:TrophyMutationWeight[];mode:'add'|'edit';onClose:()=>void;onSave:(t:GavelTrophy)=>void}){
  const [v,setV]=useState({...item,name:generateTrophyName(item.modifiers)});
  const names=weights.map(w=>w.mutation);
  const updateModifiers=(modifiers:GavelTrophy['modifiers'])=>setV(current=>({...current,modifiers,name:generateTrophyName(modifiers)}));
  const setModifier=(index:number,key:'mutation'|'boostPct',value:string|number)=>{const modifiers=[...v.modifiers];while(modifiers.length<=index)modifiers.push({mutation:names[0]??'Silver',boostPct:0});modifiers[index]={...modifiers[index],[key]:value};updateModifiers(modifiers);};
  const removeSecond=()=>updateModifiers(v.modifiers.slice(0,1));
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'NEW GAVEL TROPHY':'EDIT GAVEL TROPHY'}</span><h2>{v.name}</h2></div><button className="iconButton" onClick={onClose}>×</button></div><div className="formGrid"><div className="wide autoNamePreview"><span>Automatic name</span><strong>{v.name}</strong></div><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>setV({...v,favourite:e.target.checked})}/> Lock / favourite</label><span></span><label>Modifier 1<select autoFocus value={v.modifiers[0]?.mutation??names[0]??'Silver'} onChange={e=>setModifier(0,'mutation',e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select></label><label>Boost 1 %<input type="number" step="any" min="0" value={v.modifiers[0]?.boostPct??0} onChange={e=>setModifier(0,'boostPct',Number(e.target.value)||0)}/></label><label>Modifier 2<select value={v.modifiers[1]?.mutation??''} onChange={e=>e.target.value?setModifier(1,'mutation',e.target.value):removeSecond()}><option value="">None</option>{names.map(n=><option key={n}>{n}</option>)}</select></label><label>Boost 2 %<input type="number" step="any" min="0" disabled={!v.modifiers[1]} value={v.modifiers[1]?.boostPct??0} onChange={e=>setModifier(1,'boostPct',Number(e.target.value)||0)}/></label></div><div className="notice">The trophy name is generated automatically from its one or two modifiers. Enter the percentages exactly as displayed in game.</div><div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave({...v,name:generateTrophyName(v.modifiers)})}>{mode==='add'?'Add trophy':'Save changes'}</button></div></div></div>;
}

function BoostGrid({result}:{result:TrophyCombinationResult}){const rows=Object.entries(result.totalBoosts).sort((a,b)=>(result.weightedContributions[b[0]]??0)-(result.weightedContributions[a[0]]??0));return <div className="trophyBoostGrid">{rows.map(([mutation,boost])=><div className="statTile" key={mutation}><span>{mutation}</span><strong>+{fmt(boost)}%</strong><small className="vehicleStatSub">{(result.weightedContributions[mutation]??0).toFixed(0)} weighted pts</small></div>)}</div>}
function Stat({label,value}:{label:string;value:number}){return <div className="statTile"><span>{label}</span><strong>{fmt(value)}</strong></div>}
function blankTrophy(weights:TrophyMutationWeight[]):GavelTrophy{const now=new Date().toISOString();const modifiers=[{mutation:weights[0]?.mutation??'Silver',boostPct:0}];return{id:crypto.randomUUID(),name:generateTrophyName(modifiers),modifiers,favourite:false,createdAt:now,updatedAt:now};}
function validateTrophy(t:GavelTrophy){if(!t.modifiers.length||t.modifiers.length>2)return'Enter one or two trophy modifiers.';for(const m of t.modifiers){if(!m.mutation.trim())return'Mutation name is required.';if(!Number.isFinite(m.boostPct)||m.boostPct<0)return'Boost percentages must be non-negative finite numbers.';}return'';}
function fmt(v:number){if(!Number.isFinite(v))return'—';return Number.isInteger(v)?String(v):v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');}
