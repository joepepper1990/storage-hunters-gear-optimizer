import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCKED_DEFAULT_SETTINGS, makeInitialData, ZERO_STATS } from './defaults';
import { analyseItems, optimise, specialistLoadout } from './engine/optimizer';
import { certificateTargets } from './engine/certificates';
import { addOutcomeToItem, removeNumericAuthentication } from './engine/dominance';
import { effectiveItemStats, gameArrowToReduction, reductionToGameArrow, scoreStandalone } from './engine/scoring';
import { csvToGear, gearToCsv } from './data/csv';
import { exportJson, importJson, loadData, saveData, saveEmergencyMirror } from './data/storage';
import { VehicleScreen } from './components/VehicleScreen';
import { TrophyScreen } from './components/TrophyScreen';
import { GearScanner } from './components/GearScanner';
import { generateGearName } from './naming';
import { activeAuthenticationOptions, activeCertificateOutcomeOptions, EXCLUSIVE_AUTH_EFFECTS, LEGACY_ALIEN_EFFECTS } from './authentication';
import type { AlgorithmSettings, AppData, AuthModelEntry, CertificateRollLog, CertificateTarget, CombinationResult, GearItem, GearStats, ItemAnalysis, Slot } from './types';

type Tab = 'Dashboard' | 'Gear' | 'Optimise' | 'Vehicle' | 'Trophies' | 'Certificates' | 'Settings';
const tabs: Tab[] = ['Dashboard','Gear','Optimise','Vehicle','Trophies','Certificates','Settings'];
const statLabels: Array<[keyof GearStats,string]> = [
  ['luck','Luck'],['energy','Energy Drink Time'],['tip','Tip Chance'],['walk','Walkspeed'],['vehicle','Vehicle Speed'],['recovery','Bid Recovery'],['zone','Bid Zone Width'],['arrowReduction','Bid Arrow Reduction'],['npc','NPC Offers Bonus']
];

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [editor, setEditor] = useState<GearItem | null>(null);
  const [editorMode, setEditorMode] = useState<'add'|'edit'>('add');
  const [toast, setToast] = useState('');
  const [loadError, setLoadError] = useState('');
  const [newAnalysis, setNewAnalysis] = useState<null | {name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats}>(null);
  const [pendingNewItem,setPendingNewItem]=useState<null|{item:GearItem;previous:number;previousBest?:CombinationResult}>(null);
  const [comboLimit, setComboLimit] = useState(10);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => { loadData().then(setData).catch(error=>setLoadError(error instanceof Error?error.message:String(error))); }, []);
  useEffect(() => {
    if (!data) return;
    void saveData(data).catch(() => showToast('Autosave failed — download a JSON backup'));
    applyTheme(data.theme);
    const flush=()=>{try{saveEmergencyMirror(data)}catch{/* IndexedDB autosave remains primary. */}};
    window.addEventListener('pagehide',flush);
    return () => window.removeEventListener('pagehide',flush);
  }, [data]);

  const computed = useOptimisationWorker(data);
  const top100 = computed.top100;
  const best = top100[0];
  const analyses = computed.analyses;
  const normalTargets = computed.normalTargets;

  useEffect(()=>{
    if(!pendingNewItem)return;
    const itemAnalysis=analyses.find(a=>a.item.id===pendingNewItem.item.id);
    if(!itemAnalysis)return; // Worker result still belongs to the previous inventory snapshot.
    const nextBest=top100[0];
    const normalCert=normalTargets[0];
    const previousBest=pendingNewItem.previousBest;
    const bestChanged=Boolean(nextBest)&&(!previousBest||previousBest.head.id!==nextBest.head.id||previousBest.back.id!==nextBest.back.id||previousBest.wrist.id!==nextBest.wrist.id);
    const certLabels=[normalCert?.item.id===pendingNewItem.item.id?'Normal certificate target':''].filter(Boolean).join(' + ');
    setNewAnalysis({name:pendingNewItem.item.name,standalone:scoreStandalone(pendingNewItem.item,data?.settings??LOCKED_DEFAULT_SETTINGS).total,previous:pendingNewItem.previous,next:nextBest?.score.total??0,bestChanged,combined:nextBest?.stats,replaced:previousBest&&nextBest?replacedName(previousBest,nextBest,pendingNewItem.item.slot):undefined,verdict:itemAnalysis.verdict,bestCert:certLabels||undefined});
    setPendingNewItem(null);
  },[pendingNewItem,analyses,top100,normalTargets,data?.settings]);

  if (!data) return <div className="splash"><div className="logoMark">SH</div>{loadError?<><strong>Local storage could not be opened</strong><p className="muted storageError">{loadError}</p><button className="danger" onClick={()=>{if(confirm('Start with empty local data? Do this only if you have a backup or are sure no recoverable browser data remains.')){setData(makeInitialData());setLoadError('')}}}>Start empty</button></>:<strong>Loading optimiser…</strong>}</div>;

  function showToast(message:string){ setToast(message); window.setTimeout(()=>setToast(''),2600); }
  function openAdd(){ setEditorMode('add'); setEditor(blankItem()); }
  function openEdit(item:GearItem){ setEditorMode('edit'); setEditor(structuredClone(item)); }
  function cloneItem(item:GearItem){ const c=structuredClone(item); c.id=crypto.randomUUID(); c.name=generateGearName(c.baseName,c.stats,c.authenticated,c.authentication); c.createdAt=c.updatedAt=new Date().toISOString(); setEditorMode('add'); setEditor(c); }

  function commitItem(input:GearItem) {
    const item={...input,name:generateGearName(input.baseName,input.stats,input.authenticated,input.authentication)};
    const validation = validateItem(item); if (validation) { alert(validation); return; }
    const previousBest = best;
    const isAdd = editorMode === 'add';
    const now = new Date().toISOString(); item.updatedAt=now; if(!item.createdAt) item.createdAt=now;
    const gear = isAdd ? [...data!.gear,item] : data!.gear.map(g=>g.id===item.id?item:g);
    const nextData = {...data!,gear}; setData(nextData); setEditor(null);
    if (isAdd) setPendingNewItem({item:structuredClone(item),previous:previousBest?.score.total??0,previousBest});
  }

  function deleteItem(item:GearItem){ if(confirm(`Delete ${item.name}? This cannot be undone except from a backup.`)) setData({...data!,gear:data!.gear.filter(g=>g.id!==item.id)}); }
  function bulkDiscard(){ const safe=analyses.filter(a=>a.verdict==='SAFE TO DISCARD'&&!a.item.favourite); const ids=safe.map(a=>a.item.id); if(!ids.length){showToast('All safe items are locked/favourites');return;} const names=safe.map(a=>`• ${a.item.name}`).join('\n'); if(confirm(`Delete these ${ids.length} proven SAFE TO DISCARD items?\n\n${names}\n\nFavourite/locked items are excluded.`)) setData({...data!,gear:data!.gear.filter(g=>!ids.includes(g.id))}); }
  function toggleFav(item:GearItem){ setData({...data!,gear:data!.gear.map(g=>g.id===item.id?{...g,favourite:!g.favourite,updatedAt:new Date().toISOString()}:g)}); }

  return <div className="appShell">
    <header className="topbar">
      <div className="brand"><div className="logoMark small">SH</div><div><strong>Storage Hunters Optimiser</strong><span>Algorithm 1.0{computed.computing?' · recalculating…':computed.error?' · fallback mode':''}</span></div></div>
      <button className="iconButton" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')} title="Backup">⇩</button>
    </header>

    <main className="content">
      {tab==='Dashboard' && <Dashboard data={data} best={best} analyses={analyses} bestCert={normalTargets[0]} onGo={setTab} />}
      {tab==='Gear' && <GearScreen gear={data.gear} analyses={analyses} settings={data.settings} certificateTargets={normalTargets} onAdd={openAdd} onScan={()=>setScannerOpen(true)} onEdit={openEdit} onClone={cloneItem} onDelete={deleteItem} onFav={toggleFav} onBulkDiscard={bulkDiscard} />}
      {tab==='Optimise' && <OptimiseScreen data={data} combinations={top100.slice(0,comboLimit)} limit={comboLimit} setLimit={setComboLimit} />}
      {tab==='Vehicle' && <VehicleScreen data={data} setData={setData} />}
      {tab==='Trophies' && <TrophyScreen data={data} setData={setData} />}
      {tab==='Certificates' && <CertificateScreen data={data} setData={setData} normal={normalTargets} />}
      {tab==='Settings' && <SettingsScreen data={data} setData={setData} showToast={showToast} />}
    </main>

    <nav className="bottomNav">{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}><span>{navIcon(t)}</span>{t}</button>)}</nav>
    {scannerOpen && <GearScanner onClose={()=>setScannerOpen(false)} onConfirm={item=>{setScannerOpen(false);setEditorMode('add');setEditor(item)}} />}
    {editor && <GearEditor item={editor} authModel={data.authModel} mode={editorMode} onClose={()=>setEditor(null)} onSave={commitItem} />}
    {newAnalysis && <NewItemSheet analysis={newAnalysis} onClose={()=>setNewAnalysis(null)} />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}


function useOptimisationWorker(data: AppData | null) {
  const [state,setState]=useState<{top100:CombinationResult[];analyses:ItemAnalysis[];normalTargets:CertificateTarget[];computing:boolean;error?:string}>({top100:[],analyses:[],normalTargets:[],computing:false});
  const requestId=useRef(0);
  useEffect(()=>{
    if(!data)return;
    const id=++requestId.current;
    setState(prev=>({...prev,computing:true,error:undefined}));
    const fallback=(message:string)=>{
      try{
        const top100=optimise(data.gear,data.settings,100);
        const analyses=analyseItems(data.gear,top100[0],data.settings);
        const normalTargets=certificateTargets(data.gear,data.settings,data.authModel,'Normal Certificate of Authenticity',10);
        setState({top100,analyses,normalTargets,computing:false,error:message});
      }catch(error){setState(prev=>({...prev,computing:false,error:error instanceof Error?error.message:String(error)}));}
    };
    let worker:Worker;
    try{worker=new Worker(new URL('./workers/optimiser.worker.ts',import.meta.url),{type:'module'});}catch(error){fallback(error instanceof Error?error.message:'Background optimiser unavailable.');return;}
    worker.onmessage=(event:MessageEvent<any>)=>{
      if(event.data.id!==id)return;
      if(event.data.phase==='core'){
        if(event.data.error){worker.terminate();fallback(event.data.error);return;}
        setState(prev=>({...prev,top100:event.data.top100,analyses:event.data.analyses,computing:true,error:undefined}));
        return;
      }
      if(event.data.phase==='certificates'){
        if(event.data.error)setState(prev=>({...prev,normalTargets:[],computing:false,error:`Certificate analysis: ${event.data.error}`}));
        else setState(prev=>({...prev,normalTargets:event.data.normalTargets,computing:false,error:undefined}));
        worker.terminate();
      }
    };
    worker.onerror=()=>{worker.terminate();fallback('Background optimiser failed; using foreground fallback mode.');};
    worker.postMessage({id,gear:data.gear,settings:data.settings,authModel:data.authModel});
    return()=>worker.terminate();
  },[data?.gear,data?.settings,data?.authModel]);
  return state;
}

function Dashboard({data,best,analyses,bestCert,onGo}:{data:AppData;best:any;analyses:any[];bestCert:any;onGo:(t:Tab)=>void}){
  const safe=analyses.filter(a=>a.verdict==='SAFE TO DISCARD').length;
  return <section>
    <div className="heroCard">
      <div><span className="eyebrow">CURRENT BEST</span><div className="heroScore">{best?best.score.total.toFixed(2):'—'}</div><span>Total score</span></div>
      <button className="primary compact" onClick={()=>onGo('Optimise')}>Inspect set</button>
    </div>
    {!best && <EmptyState title="Add one Head, Back and Wrist item" text="The optimiser will calculate the best set automatically as soon as all three slots exist." action="Add gear" onClick={()=>onGo('Gear')} />}
    {best && <>
      <div className="loadoutGrid">
        <LoadoutCard slot="Head" item={best.head}/><LoadoutCard slot="Back" item={best.back}/><LoadoutCard slot="Wrist" item={best.wrist}/>
      </div>
      <div className="sectionTitle"><h2>Combined stats</h2></div>
      <div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={best.stats[k]} suffix="%" />)}</div>
      <ArrowThresholdCard value={best.stats.arrowReduction} settings={data.settings}/>
      <ThresholdCard label="Energy Drink Time" value={best.stats.energy} target={data.settings.energyTarget} ceiling={data.settings.energyCeiling}/>
    </>}
    <div className="sectionTitle"><h2>Inventory</h2></div>
    <div className="statsGrid three"><StatTile label="Gear items" value={data.gear.length}/><StatTile label="Safe to discard" value={safe}/><StatTile label="Current Luck" value={best?.stats.luck ?? 0} suffix="%"/></div>
    <div className="sectionTitle"><h2>Certificate target</h2></div>
    <div className="card">{bestCert?<><div className="rowBetween"><div><strong>{bestCert.item.name}</strong><div className="muted">{bestCert.action} · {bestCert.likelihood}</div></div><span className="badge heuristic">HEURISTIC</span></div><p>{bestCert.reasons[0]}</p><button className="secondary" onClick={()=>onGo('Certificates')}>Open certificate optimiser</button></>:<p className="muted">Add a complete three-slot inventory to generate certificate targeting.</p>}</div>
  </section>;
}

function GearScreen({gear,analyses,settings,certificateTargets,onAdd,onScan,onEdit,onClone,onDelete,onFav,onBulkDiscard}:{gear:GearItem[];analyses:ItemAnalysis[];settings:AlgorithmSettings;certificateTargets:CertificateTarget[];onAdd:()=>void;onScan:()=>void;onEdit:(i:GearItem)=>void;onClone:(i:GearItem)=>void;onDelete:(i:GearItem)=>void;onFav:(i:GearItem)=>void;onBulkDiscard:()=>void}){
  const [q,setQ]=useState(''); const [slot,setSlot]=useState<'All'|Slot>('All'); const [status,setStatus]=useState('All'); const [auth,setAuth]=useState('All'); const [sort,setSort]=useState('scoreDesc');
  const map=new Map(analyses.map(a=>[a.item.id,a]));
  const certMap=new Map<string,CertificateTarget>(); for(const t of certificateTargets){const prior=certMap.get(t.item.id);if(!prior||t.heuristicScore>prior.heuristicScore)certMap.set(t.item.id,t);}
  let items=gear.filter(i=>(slot==='All'||i.slot===slot)&&(!q||i.name.toLowerCase().includes(q.toLowerCase())||i.id.includes(q))&&(status==='All'||map.get(i.id)?.verdict===status)&&(auth==='All'||(auth==='Unauthenticated'?!i.authenticated:i.authentication.kind===auth)));
  items=[...items].sort((a,b)=>sort==='nameAsc'?a.name.localeCompare(b.name):sort==='nameDesc'?b.name.localeCompare(a.name):sort==='scoreAsc'?(map.get(a.id)?.standalone.total??0)-(map.get(b.id)?.standalone.total??0):(map.get(b.id)?.standalone.total??0)-(map.get(a.id)?.standalone.total??0));
  const safe=analyses.filter(a=>a.verdict==='SAFE TO DISCARD');
  return <section>
    <div className="pageHeading"><div><h1>Gear</h1><p>{gear.length} items · duplicates allowed</p></div><div className="headingActions"><button className="secondary" onClick={onScan}>▣ Scan screenshot</button><button className="primary" onClick={onAdd}>＋ Add gear</button></div></div>
    <div className="filters"><input placeholder="Search name or ID" value={q} onChange={e=>setQ(e.target.value)}/><select value={slot} onChange={e=>setSlot(e.target.value as any)}><option>All</option><option>Head</option><option>Back</option><option>Wrist</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>EQUIP</option><option>KEEP</option><option>SAFE TO DISCARD</option><option>PROTECTED / UNKNOWN</option></select><select value={auth} onChange={e=>setAuth(e.target.value)}><option>All</option><option>Unauthenticated</option><option>Normal</option><option value="Alien">Legacy Alien</option></select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="scoreDesc">Score: highest → lowest</option><option value="scoreAsc">Score: lowest → highest</option><option value="nameAsc">Name: A → Z</option><option value="nameDesc">Name: Z → A</option></select></div>
    {safe.length>0 && <details className="dangerPanel"><summary>{safe.length} item{safe.length!==1?'s':''} proven SAFE TO DISCARD</summary><div className="discardList">{safe.map(a=><div key={a.item.id}><strong>{a.item.name}</strong><span>{a.dominance?.reason}</span></div>)}</div><button className="danger" onClick={onBulkDiscard}>Review confirmation & delete all safe items</button></details>}
    <div className="gearList">{items.map(item=>{const a=map.get(item.id);return <article className="gearCard" key={item.id}>
      <div className="rowBetween"><div><div className="slotLabel">{item.slot} · <code>{item.id.slice(0,8)}</code></div><h3>{item.name}</h3></div><button className={`star ${item.favourite?'on':''}`} onClick={()=>onFav(item)}>★</button></div>
      <div className="chipRow"><StatusBadge status={a?.verdict ?? 'KEEP'}/>{certMap.get(item.id)&&<span className="badge certificateAction">{certMap.get(item.id)!.action==='AUTHENTICATE'?'AUTHENTICATE':'RE-AUTH CANDIDATE'}</span>}<span className="chip score">{a?.standalone.total.toFixed(2) ?? scoreStandalone(item,settings).total.toFixed(2)} standalone</span>{item.authenticated&&<span className="chip">{item.authentication.kind==='Alien'?'Legacy Alien':item.authentication.kind}: {item.authentication.effect||'—'} {item.authentication.value?`${item.authentication.value}%`:''}</span>}</div>
      <div className="miniStats">{statLabels.filter(([k])=>Math.abs(effectiveItemStats(item)[k])>1e-12).map(([k,l])=><span key={k}>{shortStat(l)} <b>{displayStat(k,effectiveItemStats(item)[k])}</b></span>)}</div>
      <p className="reason">{a?.reason}</p>
      <div className="actions"><button onClick={()=>onEdit(item)}>Edit</button><button onClick={()=>onClone(item)}>Clone</button><button className="textDanger" onClick={()=>onDelete(item)}>Delete</button></div>
    </article>})}</div>
    {!items.length&&<EmptyState title="No matching gear" text="Change the filters or add an item." action="Add gear" onClick={onAdd}/>} 
  </section>;
}

function OptimiseScreen({data,combinations,limit,setLimit}:{data:AppData;combinations:CombinationResult[];limit:number;setLimit:(n:number)=>void}){
  const [sortBy,setSortBy]=useState<'score'|'luck'|'npc'|'zone'|'arrowReduction'|'energy'>('score');
  const specialists=[['Maximum Luck','luck'],['Maximum NPC Offers','npc'],['Maximum Bid Zone','zone'],['Best Bid Arrow utility','arrowReduction'],['Maximum Energy Duration','energy']] as const;
  const slotCounts={Head:data.gear.filter(g=>g.slot==='Head').length,Back:data.gear.filter(g=>g.slot==='Back').length,Wrist:data.gear.filter(g=>g.slot==='Wrist').length};
  const totalCombinations=slotCounts.Head*slotCounts.Back*slotCounts.Wrist;
  const ranked=combinations.map((c,idx)=>({c,rank:idx+1}));
  if(sortBy!=='score')ranked.sort((a,b)=>b.c.stats[sortBy]-a.c.stats[sortBy]||b.c.score.total-a.c.score.total);
  return <section><div className="pageHeading"><div><h1>Optimise</h1><p>{totalCombinations.toLocaleString()} valid Head × Back × Wrist combinations</p></div></div>
    <div className="toolbarRow"><div className="segmented">{[10,25,100].map(n=><button className={limit===n?'active':''} onClick={()=>setLimit(n)} key={n}>Top {n}</button>)}</div><label className="sortControl">Sort<select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)}><option value="score">Overall score</option><option value="luck">Luck</option><option value="npc">NPC Offers</option><option value="zone">Bid Zone</option><option value="arrowReduction">Bid Arrow reduction</option><option value="energy">Energy duration</option></select></label></div>
    {!combinations.length&&<EmptyState title="A complete loadout is required" text="Add at least one item in each slot." />}
    {ranked.map(({c,rank},idx)=><details className={`comboCard ${rank===1?'best':''}`} key={`${c.head.id}-${c.back.id}-${c.wrist.id}`} open={idx===0}>
      <summary><div><span className="rank">#{rank}</span><strong>{c.score.total.toFixed(2)}</strong><span>{c.head.name} · {c.back.name} · {c.wrist.name}</span></div></summary>
      <div className="comboBody"><div className="loadoutGrid"><LoadoutCard slot="Head" item={c.head}/><LoadoutCard slot="Back" item={c.back}/><LoadoutCard slot="Wrist" item={c.wrist}/></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={c.stats[k]} suffix="%" />)}</div>
      <div className="scoreBreakdown"><b>Core {c.score.core.toFixed(2)}</b><b>Passives {c.score.passive.toFixed(2)}</b><b>Total {c.score.total.toFixed(2)}</b>{c.wastedArrow>0&&<span>Flat / wasted Arrow: {c.wastedArrow.toFixed(1)}%</span>}{c.penalisedArrow>0&&<span className="penaltyText">Penalised Arrow above {data.settings.arrowPenaltyThreshold}%: {c.penalisedArrow.toFixed(1)}%</span>}{c.wastedEnergy>0&&<span>Wasted Energy: {c.wastedEnergy.toFixed(1)}%</span>}</div></div>
    </details>)}
    <div className="sectionTitle"><h2>Specialist loadouts</h2></div>
    <div className="specialists">{specialists.map(([label,key])=>{const c=specialistLoadout(data.gear,key,data.settings);return <div className="card" key={key}><strong>{label}</strong>{c?<><div className="specialValue">{c.stats[key].toFixed(2)}%</div><span>{c.head.name} · {c.back.name} · {c.wrist.name}</span></>:<span className="muted">Incomplete inventory</span>}</div>})}</div>
  </section>;
}

function CertificateScreen({data,setData,normal}:{data:AppData;setData:(d:AppData)=>void;normal:any[]}){
  const [logOpen,setLogOpen]=useState(false);
  const targets=normal;
  const type:AuthModelEntry['certificateType']='Normal Certificate of Authenticity';
  return <section><div className="pageHeading"><div><h1>Certificates</h1><p>NORMAL CERTIFICATE HEURISTIC — official roll odds unknown</p></div></div>
    <div className="notice"><b>Recommendation rule:</b> maximise estimated likelihood of improving the current best overall loadout, not jackpot size. Recalculate after every roll. Alien certificates are historical only and are not targeted.</div>
    {targets.length?targets.map((t,idx)=><details className={`certCard ${idx===0?'best':''}`} key={t.item.id} open={idx===0}><summary><div className="certRank">{idx+1}</div><div><strong>{t.item.name}</strong><span>{t.action} · {t.item.slot}</span></div><div className={`likelihood ${t.likelihood.replaceAll(' ','').toLowerCase()}`}>{t.likelihood}</div></summary><div className="comboBody"><div className="statsGrid three"><StatTile label="Heuristic rank" value={t.heuristicScore}/><StatTile label="Auth value at risk" value={t.currentAuthMarginalValue}/><StatTile label="Gap without auth" value={t.gapWithoutCurrentAuth}/></div><ul>{t.reasons.map((r:string)=><li key={r}>{r}</li>)}</ul><details><summary>Minimum replacement roll thresholds</summary><div className="thresholdTable">{t.outcomeThresholds.map((o:any)=><div key={o.outcome}><b>{o.outcome}</b><span>{o.minimumRoll!==undefined?`${o.minimumRoll.toFixed(2)}%`:o.note}</span></div>)}</div></details></div></details>):<EmptyState title="No certificate target yet" text="A complete Head/Back/Wrist inventory is required."/>}
    {targets.length>0&&['LOW','VERY LOW'].includes(targets[0].likelihood)&&<div className="notice warning"><b>HOLD CERTIFICATE</b> — no current target has a convincing heuristic case.</div>}
    <div className="sectionTitle"><h2>Roll history</h2><button className="secondary compact" onClick={()=>setLogOpen(true)}>＋ Record normal roll</button></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateType.startsWith('Normal')?'Normal':'Legacy Alien'}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>
    {logOpen&&<RollLogEditor data={data} type={type} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{const authModel=recordEmpiricalRoll(data.authModel,r);setData({...data,gear:data.gear.map(g=>g.id===updated.id?updated:g),authModel,rollLog:[...data.rollLog,r]});setLogOpen(false)}}/>}
  </section>;
}
function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['arrowWeight','Arrow weight'],['arrowSweetSpot','Arrow sweet spot'],['arrowDiminishingMultiplier','Arrow 75–90 multiplier'],['arrowCeiling','Arrow flat region starts'],['arrowPenaltyThreshold','Arrow penalty starts'],['arrowOvercapPenaltyMultiplier','Arrow >100 penalty multiplier'],['luckWeight','Luck weight'],['luckBreakpoint1','Luck breakpoint 1'],['luckBreakpoint2','Luck breakpoint 2'],['luckBreakpoint3','Luck breakpoint 3'],['luckBreakpoint4','Luck breakpoint 4'],['luckMultiplier2','Luck 100–150 multiplier'],['luckMultiplier3','Luck 150–200 multiplier'],['luckMultiplier4','Luck 200–250 multiplier'],['luckMultiplier5','Luck 250+ multiplier'],['zoneWeight','Zone weight'],['zoneBreakpoint1','Zone breakpoint 1'],['zoneBreakpoint2','Zone breakpoint 2'],['zoneMultiplier2','Zone middle multiplier'],['zoneMultiplier3','Zone upper multiplier'],['npcWeight','NPC Offers weight'],['npcBreakpoint1','NPC breakpoint 1'],['npcBreakpoint2','NPC breakpoint 2'],['npcMultiplier2','NPC middle multiplier'],['npcMultiplier3','NPC upper multiplier'],['energyWeight','Energy weight'],['energyTarget','Energy target'],['energySecondStageMultiplier','Energy 50–100 multiplier'],['energyCeiling','Energy ceiling'],['tipWeight','Tip weight'],['recoveryWeight','Recovery weight'],['walkWeight','Walk weight'],['vehicleWeight','Vehicle weight'],['sunnyUptime','Sunny uptime'],['nocturnalUptime','Nocturnal uptime'],['raindropUptime','Raindrop uptime'],['overchargedMultiplier','Overcharged general-use multiplier'],['timeKeeperWeight','Time Keeper weight (PROVISIONAL)']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 1.1</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Changing any setting immediately recalculates loadouts, dominance proofs and certificate targeting. Defaults: Arrow is full value to 75%, 25% marginal value to 90%, flat 90–100%, then a gentle 25% penalty rate above 100%. Luck diminishes at 100/150/200/250% with 0.80/0.60/0.40/0.20 marginal multipliers. Zone uses 1.00/0.75/0.50 marginal multipliers at 30/60%, and NPC Offers uses 1.00/0.75/0.50 at 20/40%. Conditional Luck passives use the same Luck curve. Time Keeper remains provisional. Legacy Alien scoring data is retained but hidden from current gameplay settings.</div>
    <div className="sectionTitle"><h2>Authentication model</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">Normal outcomes default to a higher assumed likelihood class than slot-exclusive outcomes. This is an editable heuristic assumption, not an official probability. Custom unknown outcomes can be added now and will remain protected until a scoring formula is implemented.</p>{data.authModel.filter(m=>m.certificateType==='Normal Certificate of Authenticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear local data.');if(phrase==='RESET ALL DATA')setData(makeInitialData())}}>Reset all data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'NEW ITEM':'EDIT ITEM'}</span><h2>{v.name||'Gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})}/></label><div className="wide autoNamePreview"><span>Automatic name</span><strong>{v.name||'Enter the gear name'}</strong></div><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label>
      {statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input inputMode="decimal" type="number" step="any" value={v.stats[k]} onChange={e=>setStat(k,Number(e.target.value))}/></label>)}
      <label className="wide arrowInput">Bid Arrow Speed — enter exactly as shown in game %<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Game <b>-24%</b> ⇒ optimiser <b>+24% reduction</b>. Game <b>+3%</b> ⇒ optimiser <b>-3% reduction</b>. Stored internally: {v.stats.arrowReduction.toFixed(2)}% reduction.</span></label>
    </div>
    <div className="sectionTitle"><h3>Authentication</h3></div><div className="formGrid"><label className="check"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility. New Alien authentications cannot be created.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Type<input value="Normal" readOnly/></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({kind:'Normal',effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Authentication value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">Enter the item's normal stats above without adding the separate authentication roll. Numeric authentication, including Energy Drink Time, is applied automatically by the optimiser and included in the generated name as an Auth stat.</p></>}</>}</div>
    <div className="notice">Type the actual gear name once. The app automatically appends every non-zero stat, making duplicate rolls much quicker to identify.</div>
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,type,onClose,onSave}:{data:AppData;type:AuthModelEntry['certificateType'];onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(autoPreview?{...autoPreview.stats}:undefined);
  useEffect(()=>{setFinalStats(autoPreview?{...autoPreview.stats}:undefined)},[autoPreview]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=autoPreview&&finalStats?{...autoPreview,stats:finalStats,name:generateGearName(autoPreview.baseName,finalStats,autoPreview.authenticated,autoPreview.authentication)}:autoPreview;
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">Numeric authentication is stored separately and applied automatically. Only edit the core stats below if the underlying item stats themselves changed; this is especially important when Focused was gained or lost.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview} onClick={()=>item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after},preview)}>Apply & record</button></div>
  </div></div>;
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){return <details className="modelRow"><summary><span>{entry.outcome}</span><span>Normal · {entry.slot} · {entry.assumedLikelihoodClass}</span></summary><div className="formGrid"><label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label><label>Certificate<input value="Normal Certificate of Authenticity" readOnly/></label><label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label><label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label><label>Likelihood class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as any})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label><label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as any})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label><label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label><label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label><label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label><label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled</label><div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}.</div><button className="danger wide" onClick={onDelete}>Delete model outcome</button></div></details>}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowPenaltyThreshold,settings.arrowCeiling,settings.arrowSweetSpot,1);const pct=Math.min(100,Math.max(0,value/max*100));const penalised=Math.max(0,value-settings.arrowPenaltyThreshold);return <div className={`thresholdCard ${penalised>0?'penalised':''}`}><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · sweet {settings.arrowSweetSpot}% · flat {settings.arrowCeiling}–{settings.arrowPenaltyThreshold}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/><em style={{left:`${settings.arrowCeiling/max*100}%`}}/><u style={{left:`${settings.arrowPenaltyThreshold/max*100}%`}}/></div>{penalised>0&&<div className="penaltyText">{penalised.toFixed(1)}% is above the penalty threshold and reduces score at ×{settings.arrowOvercapPenaltyMultiplier.toFixed(2)} of normal Arrow value.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot>s.arrowCeiling)issues.push('Arrow sweet spot must be ≤ flat-region start');if(s.arrowCeiling>s.arrowPenaltyThreshold)issues.push('Arrow flat-region start must be ≤ penalty threshold');if(!(s.luckBreakpoint1<=s.luckBreakpoint2&&s.luckBreakpoint2<=s.luckBreakpoint3&&s.luckBreakpoint3<=s.luckBreakpoint4))issues.push('Luck breakpoints must be in ascending order');if(s.npcBreakpoint1>s.npcBreakpoint2)issues.push('NPC breakpoint 1 must be ≤ breakpoint 2');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');if(s.arrowOvercapPenaltyMultiplier<0)issues.push('Arrow over-cap penalty multiplier cannot be negative');for(const [label,value] of [['Luck multiplier 2',s.luckMultiplier2],['Luck multiplier 3',s.luckMultiplier3],['Luck multiplier 4',s.luckMultiplier4],['Luck multiplier 5',s.luckMultiplier5],['NPC multiplier 2',s.npcMultiplier2],['NPC multiplier 3',s.npcMultiplier3],['Zone multiplier 2',s.zoneMultiplier2],['Zone multiplier 3',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem():GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot:'Head',stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind='Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function recordEmpiricalRoll(model:AuthModelEntry[],roll:CertificateRollLog):AuthModelEntry[]{
  const candidates=model.filter(m=>m.certificateType===roll.certificateType&&m.outcome===roll.newAuthentication&&(m.slot==='Any'||m.slot===roll.slot));
  const target=candidates.find(m=>m.slot===roll.slot)??candidates[0]; if(!target)return model;
  return model.map(m=>{if(m.id!==target.id)return m;const values=[...m.observedValues,roll.newValue];const sorted=[...values].sort((a,b)=>a-b);const mid=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;return{...m,observedValues:values,observedSampleCount:values.length,min:Math.min(...values),typical:mid,max:Math.max(...values),confidence:values.length>=10?'Empirical':values.length>=4?'Medium':'Low'};});
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose a Normal authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙'} as Record<Tab,string>)[t]}
