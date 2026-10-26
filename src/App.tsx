import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCKED_DEFAULT_SETTINGS, makeEmptyData, makeInitialData, ZERO_STATS } from './defaults';
import { analyseItems, optimise } from './engine/optimizer';
import type { OwnedCertificateDecision } from './engine/certificateDecision';
import { applyRecordedCertificateRoll, authModelTypeForOwnedCertificate, withObservedAuthenticationStats } from './engine/certificateRolls';
import { optimisationInputKey } from './engine/analysisFreshness';
import { buildGearLoadouts } from './engine/gearLoadouts';
import { addOutcomeToItem, removeNumericAuthentication } from './engine/dominance';
import { effectiveItemStats, gameArrowToReduction, reductionToGameArrow, scoreStandalone } from './engine/scoring';
import { csvToGear, gearToCsv } from './data/csv';
import { exportJson, importJson, loadData, saveData, saveEmergencyMirror } from './data/storage';
import { VehicleScreen } from './components/VehicleScreen';
import { TrophyScreen } from './components/TrophyScreen';
import { GearScanner } from './components/GearScanner';
import { generateGearName } from './naming';
import { activeAuthenticationOptions, activeCertificateOutcomeOptions, EXCLUSIVE_AUTH_EFFECTS, LEGACY_ALIEN_EFFECTS, LIMITED_AUTH_EFFECTS, PREMIUM_AUTH_EFFECTS, enchantmentDescription } from './authentication';
import type { AlgorithmSettings, AppData, AuthModelEntry, CertificateRollLog, CombinationResult, GearItem, GearStats, ItemAnalysis, OwnedCertificate, Slot } from './types';

type Tab = 'Dashboard' | 'Gear' | 'Optimise' | 'Vehicle' | 'Trophies' | 'Certificates' | 'Settings' | 'More';
const primaryTabs: Tab[] = ['Gear','Optimise','Trophies','Vehicle','More'];
const statLabels: Array<[keyof GearStats,string]> = [
  ['luck','Luck'],['energy','Energy Drink Time'],['tip','Tip Chance'],['walk','Walkspeed'],['vehicle','Vehicle Speed'],['recovery','Bid Recovery'],['zone','Bid Zone Width'],['arrowReduction','Bid Arrow Reduction'],['npc','NPC Offers Bonus']
];

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>('Gear');
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
  const top100 = computed.current ? computed.top100 : [];
  const best = top100[0];
  const analyses = computed.current ? computed.analyses : [];

  useEffect(()=>{
    if(!pendingNewItem)return;
    const itemAnalysis=analyses.find(a=>a.item.id===pendingNewItem.item.id);
    if(!itemAnalysis)return; // Worker result still belongs to the previous inventory snapshot.
    const nextBest=top100[0];
    const previousBest=pendingNewItem.previousBest;
    const bestChanged=Boolean(nextBest)&&(!previousBest||previousBest.head.id!==nextBest.head.id||previousBest.back.id!==nextBest.back.id||previousBest.wrist.id!==nextBest.wrist.id);
    setNewAnalysis({name:pendingNewItem.item.name,standalone:scoreStandalone(pendingNewItem.item,data?.settings??LOCKED_DEFAULT_SETTINGS).total,previous:pendingNewItem.previous,next:nextBest?.score.total??0,bestChanged,combined:nextBest?.stats,replaced:previousBest&&nextBest?replacedName(previousBest,nextBest,pendingNewItem.item.slot):undefined,verdict:itemAnalysis.verdict});
    setPendingNewItem(null);
  },[pendingNewItem,analyses,top100,data?.settings]);

  if (!data) return <div className="splash"><div className="logoMark">SH</div>{loadError?<><strong>Local storage could not be opened</strong><p className="muted storageError">{loadError}</p><button className="danger" onClick={()=>{if(confirm('Start with empty local data? Do this only if you have a backup or are sure no recoverable browser data remains.')){setData(makeEmptyData());setLoadError('')}}}>Start empty</button></>:<strong>Loading optimiser…</strong>}</div>;

  function showToast(message:string){ setToast(message); window.setTimeout(()=>setToast(''),2600); }
  function openAdd(){ setEditorMode('add'); setEditor(blankItem()); }
  function openEdit(item:GearItem){ setEditorMode('edit'); setEditor(structuredClone(item)); }
  function cloneItem(item:GearItem){ const c=structuredClone(item); c.id=crypto.randomUUID(); c.name=generateGearName(c.baseName,c.stats,c.authenticated,c.authentication); c.createdAt=c.updatedAt=new Date().toISOString(); setEditorMode('add'); setEditor(c); }

  function commitItem(input:GearItem, keepAdding = false) {
    const item={...input,name:generateGearName(input.baseName,input.stats,input.authenticated,input.authentication)};
    const validation = validateItem(item); if (validation) { alert(validation); return; }
    const previousBest = best;
    const isAdd = editorMode === 'add';
    const now = new Date().toISOString(); item.updatedAt=now; if(!item.createdAt) item.createdAt=now;
    const gear = isAdd ? [...data!.gear,item] : data!.gear.map(g=>g.id===item.id?item:g);
    const nextData = {...data!,gear}; setData(nextData);
    if (isAdd && keepAdding) {
      setEditorMode('add');
      setEditor(blankItem(item.slot));
      showToast(`${item.baseName} added`);
    } else {
      setEditor(null);
      if (isAdd) setPendingNewItem({item:structuredClone(item),previous:previousBest?.score.total??0,previousBest});
    }
  }

  function deleteItem(item:GearItem){ if(confirm(`Delete ${item.name}? This cannot be undone except from a backup.`)) setData({...data!,gear:data!.gear.filter(g=>g.id!==item.id)}); }
  function bulkDiscard(){
    if(!computed.current){showToast('Recalculation in progress — discard decisions are temporarily locked');return;}
    const safe=analyses.filter(a=>a.verdict==='SAFE TO DISCARD'&&!a.item.favourite);
    const ids=safe.map(a=>a.item.id);
    if(!ids.length){showToast('No current safe-to-discard items');return;}
    const names=safe.map(a=>`• ${a.item.name}`).join('\n');
    if(confirm(`Delete these ${ids.length} proven SAFE TO DISCARD items?\n\n${names}\n\nFavourite/locked items are excluded.`)) setData({...data!,gear:data!.gear.filter(g=>!ids.includes(g.id))});
  }
  function toggleFav(item:GearItem){ setData({...data!,gear:data!.gear.map(g=>g.id===item.id?{...g,favourite:!g.favourite,updatedAt:new Date().toISOString()}:g)}); }

  return <div className="appShell">
    <header className="topbar">
      <div className="brand"><div className="logoMark small">SH</div><div><strong>Storage Hunters Optimiser</strong><span>Algorithm 2.0{computed.computing?' · recalculating…':computed.error?' · fallback mode':''}</span></div></div>
      <button className="iconButton" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')} title="Backup">⇩</button>
    </header>

    <main className="content">
      {tab==='Dashboard' && <Dashboard data={data} best={best} analyses={analyses} onGo={setTab} />}
      {tab==='Gear' && <GearScreen gear={data.gear} analyses={analyses} settings={data.settings} analysisCurrent={computed.current} onAdd={openAdd} onScan={()=>setScannerOpen(true)} onEdit={openEdit} onClone={cloneItem} onDelete={deleteItem} onFav={toggleFav} onBulkDiscard={bulkDiscard} />}
      {tab==='Optimise' && <OptimiseScreen data={data} combinations={top100.slice(0,comboLimit)} limit={comboLimit} setLimit={setComboLimit} />}
      {tab==='Vehicle' && <VehicleScreen data={data} setData={setData} />}
      {tab==='Trophies' && <TrophyScreen data={data} setData={setData} />}
      {tab==='Certificates' && <CertificateScreen data={data} setData={setData} />}
      {tab==='Settings' && <SettingsScreen data={data} setData={setData} showToast={showToast} />}
      {tab==='More' && <MoreScreen data={data} onGo={setTab} />}
    </main>

    <nav className="bottomNav">{primaryTabs.map(t=>{const active=t==='More'?['More','Dashboard','Certificates','Settings'].includes(tab):tab===t;return <button key={t} className={active?'active':''} onClick={()=>setTab(t)}><span>{navIcon(t)}</span>{t}</button>})}</nav>
    {scannerOpen && <GearScanner onClose={()=>setScannerOpen(false)} onConfirm={item=>{setScannerOpen(false);setEditorMode('add');setEditor(item)}} />}
    {editor && <GearEditor key={editor.id} item={editor} authModel={data.authModel} mode={editorMode} onClose={()=>setEditor(null)} onSave={commitItem} />}
    {newAnalysis && <NewItemSheet analysis={newAnalysis} onClose={()=>setNewAnalysis(null)} />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}


function useOptimisationWorker(data: AppData | null) {
  const inputKey=useMemo(()=>data?optimisationInputKey(data.gear,data.settings):'',[data?.gear,data?.settings]);
  const [state,setState]=useState<{top100:CombinationResult[];analyses:ItemAnalysis[];computing:boolean;resultKey:string;error?:string}>({
    top100:[],analyses:[],computing:false,resultKey:''
  });
  const requestId=useRef(0);
  useEffect(()=>{
    if(!data)return;
    const id=++requestId.current;
    const requestKey=inputKey;
    setState(prev=>({...prev,computing:true,error:undefined}));
    const fallback=(message:string)=>{
      try{
        const top100=optimise(data.gear,data.settings,100);
        const analyses=analyseItems(data.gear,top100[0],data.settings);
        setState({top100,analyses,computing:false,resultKey:requestKey,error:message});
      }catch(error){
        setState(prev=>({...prev,computing:false,error:error instanceof Error?error.message:String(error)}));
      }
    };
    let worker:Worker;
    try{
      worker=new Worker(new URL('./workers/optimiser.worker.ts',import.meta.url),{type:'module'});
    }catch(error){
      fallback(error instanceof Error?error.message:'Background optimiser unavailable.');
      return;
    }
    worker.onmessage=(event:MessageEvent<any>)=>{
      if(event.data.id!==id)return;
      if(event.data.phase==='core'){
        if(event.data.error){worker.terminate();fallback(event.data.error);return;}
        setState({top100:event.data.top100,analyses:event.data.analyses,computing:false,resultKey:requestKey,error:undefined});
        worker.terminate();
      }
    };
    worker.onerror=()=>{
      worker.terminate();
      fallback('Background optimiser failed; using foreground fallback mode.');
    };
    worker.postMessage({id,gear:data.gear,settings:data.settings});
    return()=>worker.terminate();
  },[data?.gear,data?.settings,inputKey]);
  return {...state,current:Boolean(data)&&state.resultKey===inputKey&&!state.computing};
}

function useCertificateWorker(data:AppData) {
  const [state,setState]=useState<{decisions:OwnedCertificateDecision[];computing:boolean;error?:string}>({decisions:[],computing:false});
  const requestId=useRef(0);
  useEffect(()=>{
    const id=++requestId.current;
    setState(prev=>({...prev,computing:true,error:undefined}));
    let worker:Worker;
    try{
      worker=new Worker(new URL('./workers/certificate.worker.ts',import.meta.url),{type:'module'});
    }catch(error){
      setState(prev=>({...prev,computing:false,error:error instanceof Error?error.message:'Certificate worker unavailable.'}));
      return;
    }
    worker.onmessage=(event:MessageEvent<any>)=>{
      if(event.data.id!==id)return;
      if(event.data.error)setState(prev=>({...prev,computing:false,error:event.data.error}));
      else setState({decisions:event.data.decisions??[],computing:false,error:undefined});
      worker.terminate();
    };
    worker.onerror=()=>{
      setState(prev=>({...prev,computing:false,error:'Certificate analysis failed in the background worker.'}));
      worker.terminate();
    };
    worker.postMessage({id,data});
    return()=>worker.terminate();
  },[data.gear,data.settings,data.rollLog,data.ownedCertificates,data.authModel]);
  return state;
}

function MoreScreen({data,onGo}:{data:AppData;onGo:(t:Tab)=>void}){
  const options:Array<{tab:Tab;title:string;text:string}>=[
    {tab:'Dashboard',title:'Dashboard',text:'Current best set and combined stats'},
    {tab:'Certificates',title:'Certificates',text:'Normal, Premium and Limited targeting and roll history'},
    {tab:'Settings',title:'Settings',text:'Algorithm, authentication model, backups and appearance'}
  ];
  return <section><div className="pageHeading"><div><h1>More</h1><p>Secondary tools and settings</p></div></div><div className="moreGrid">{options.map(option=><button className="moreCard" key={option.tab} onClick={()=>onGo(option.tab)}><span>{navIcon(option.tab)}</span><div><strong>{option.title}</strong><small>{option.text}</small></div><b>›</b></button>)}</div><div className="sectionTitle"><h2>Data at a glance</h2></div><div className="statsGrid three"><StatTile label="Gear" value={data.gear.length}/><StatTile label="Trophies" value={data.trophies.length}/><StatTile label="Vehicle parts" value={data.vehicleParts.length}/></div></section>;
}

function Dashboard({data,best,analyses,onGo}:{data:AppData;best:any;analyses:any[];onGo:(t:Tab)=>void}){
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
    <div className="statsGrid three"><StatTile label="Gear items" value={data.gear.length}/><StatTile label="Safe to discard" value={safe}/><StatTile label="Modelled Main Luck" value={best?.stats.luck ?? 0} suffix="%"/></div>
    <div className="sectionTitle"><h2>Certificate decisions</h2></div>
    <div className="card"><p className="muted">Certificate use is assessed by the unified expected-value engine using the complete three-item Main Auction loadout and current authentications.</p><button className="secondary" onClick={()=>onGo('Certificates')}>Open certificate optimiser</button></div>
  </section>;
}

function GearScreen({gear,analyses,settings,analysisCurrent,onAdd,onScan,onEdit,onClone,onDelete,onFav,onBulkDiscard}:{gear:GearItem[];analyses:ItemAnalysis[];settings:AlgorithmSettings;analysisCurrent:boolean;onAdd:()=>void;onScan:()=>void;onEdit:(i:GearItem)=>void;onClone:(i:GearItem)=>void;onDelete:(i:GearItem)=>void;onFav:(i:GearItem)=>void;onBulkDiscard:()=>void}){
  const [q,setQ]=useState(''); const [slot,setSlot]=useState<'All'|Slot>('All'); const [status,setStatus]=useState('All'); const [auth,setAuth]=useState('All'); const [sort,setSort]=useState('scoreDesc');
  const map=new Map(analyses.map(a=>[a.item.id,a]));
  let items=gear.filter(i=>(slot==='All'||i.slot===slot)&&(!q||i.name.toLowerCase().includes(q.toLowerCase())||i.id.includes(q))&&(status==='All'||map.get(i.id)?.verdict===status)&&(auth==='All'||(auth==='Unauthenticated'?!i.authenticated:i.authentication.kind===auth)));
  items=[...items].sort((a,b)=>sort==='nameAsc'?a.name.localeCompare(b.name):sort==='nameDesc'?b.name.localeCompare(a.name):sort==='scoreAsc'?(map.get(a.id)?.standalone.total??0)-(map.get(b.id)?.standalone.total??0):(map.get(b.id)?.standalone.total??0)-(map.get(a.id)?.standalone.total??0));
  const safe=analyses.filter(a=>a.verdict==='SAFE TO DISCARD');
  return <section>
    <div className="pageHeading"><div><h1>Gear</h1><p>{gear.length} items · fast entry first</p></div><div className="headingActions"><button className="secondary" onClick={onScan}>▣ Scan screenshot</button><button className="primary" onClick={onAdd}>＋ Add gear</button></div></div>
    <div className="gearQuickBar"><input placeholder="Search gear" value={q} onChange={e=>setQ(e.target.value)}/><div className="segmented compactSegments">{(['All','Head','Back','Wrist'] as const).map(value=><button key={value} className={slot===value?'active':''} onClick={()=>setSlot(value)}>{value}</button>)}</div></div>
    <details className="filterPanel"><summary>Filters & sorting</summary><div className="filters compactFilters"><select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>EQUIP</option><option>KEEP</option><option>SAFE TO DISCARD</option><option>PROTECTED / UNKNOWN</option></select><select value={auth} onChange={e=>setAuth(e.target.value)}><option>All</option><option>Unauthenticated</option><option>Normal</option><option>Premium</option><option>Limited</option><option value="Alien">Legacy Alien</option></select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="scoreDesc">Score: highest → lowest</option><option value="scoreAsc">Score: lowest → highest</option><option value="nameAsc">Name: A → Z</option><option value="nameDesc">Name: Z → A</option></select></div></details>
    {!analysisCurrent&&<div className="notice warning"><b>Recalculating gear verdicts.</b> SAFE TO DISCARD actions are locked until the result matches the current inventory.</div>}
    {analysisCurrent&&safe.length>0 && <details className="dangerPanel"><summary>{safe.length} item{safe.length!==1?'s':''} proven SAFE TO DISCARD</summary><div className="discardList">{safe.map(a=><div key={a.item.id}><strong>{a.item.name}</strong><span>{a.reason}</span></div>)}</div><button className="danger" onClick={onBulkDiscard}>Review confirmation & delete all safe items</button></details>}
    <div className="gearList">{items.map(item=>{const a=map.get(item.id);return <article className="gearCard" key={item.id}>
      <div className="rowBetween"><div><div className="slotLabel">{item.slot}{item.mutation&&item.mutation!=='None'?` · ${item.mutation}`:''}{item.conditionPct!==undefined?` · ${item.conditionPct}% condition`:''}</div><h3>{item.baseName||item.name}</h3></div><button className={`star ${item.favourite?'on':''}`} onClick={()=>onFav(item)}>★</button></div>
      <div className="chipRow"><StatusBadge status={a?.verdict ?? 'KEEP'}/><span className="chip score">{a?.standalone.total.toFixed(2) ?? scoreStandalone(item,settings).total.toFixed(2)} standalone</span>{a?.loadoutMemberships.map((m,i)=><span className="chip" key={m.loadout+'-'+(m.context??'')+'-'+i}>{m.loadout}{m.tied?' · tied':''}{m.scenario?' · '+m.scenario:''}</span>)}{item.authenticated&&<span className="chip">{item.authentication.kind==='Alien'?'Legacy Alien':item.authentication.kind}: {item.authentication.effect||'—'} {item.authentication.value?`${item.authentication.value}%`:''}</span>}</div>
      <div className="miniStats">{statLabels.filter(([k])=>Math.abs(effectiveItemStats(item)[k])>1e-12).map(([k,l])=><span key={k}>{shortStat(l)} <b>{displayStat(k,effectiveItemStats(item)[k])}</b></span>)}</div>
      <details className="gearDetails"><summary>Details & verdict explanation</summary>
        {item.authenticated&&enchantmentDescription(item.authentication.effect,item.authentication.value)&&<p><b>{item.authentication.effect}:</b> {enchantmentDescription(item.authentication.effect,item.authentication.value)}</p>}
        <p className="reason">{a?.reason}</p>
        <p className="fieldHelp">Record ID: {item.id}</p>
      </details>
      <div className="actions"><button onClick={()=>onEdit(item)}>Edit</button><button onClick={()=>onClone(item)}>Clone</button><button className="textDanger" onClick={()=>onDelete(item)}>Delete</button></div>
    </article>})}</div>
    {!items.length&&<EmptyState title="No matching gear" text="Change the filters or add an item." action="Add gear" onClick={onAdd}/>} 
  </section>;
}

function OptimiseScreen({data,combinations,limit,setLimit}:{data:AppData;combinations:CombinationResult[];limit:number;setLimit:(n:number)=>void}){
  const loadouts=useMemo(()=>buildGearLoadouts(data.gear,data.settings,'central'),[data.gear,data.settings]);
  const primary=[loadouts.main,loadouts.drink,loadouts.grading,loadouts.shop].filter(Boolean);
  const contextual=[loadouts.day,loadouts.night,loadouts.rain].filter(Boolean);
  const slotCounts={Head:data.gear.filter(g=>g.slot==='Head').length,Back:data.gear.filter(g=>g.slot==='Back').length,Wrist:data.gear.filter(g=>g.slot==='Wrist').length};
  const totalCombinations=slotCounts.Head*slotCounts.Back*slotCounts.Wrist;
  return <section>
    <div className="pageHeading"><div><h1>Optimise</h1><p>{totalCombinations.toLocaleString()} valid Head × Back × Wrist combinations · one item can be reused across multiple loadouts</p></div></div>

    <div className="sectionTitle"><h2>Your loadouts</h2></div>
    <div className="specialists">{primary.map(loadout=>loadout&&<div className="card" key={loadout.name}>
      <div className="rowBetween"><div><strong>{loadout.name}</strong><p className="muted">{loadout.rationale}</p></div><span className="badge heuristic">{loadout.name==='Main Auction'?'PRIORITY':'SPECIALIST'}</span></div>
      <div className="specialValue">{loadout.utility.toFixed(2)}</div>
      <div className="loadoutGrid"><LoadoutCard slot="Head" item={loadout.head}/><LoadoutCard slot="Back" item={loadout.back}/><LoadoutCard slot="Wrist" item={loadout.wrist}/></div>
    </div>)}</div>

    <div className="sectionTitle"><h2>Contextual Main Auction variants</h2></div>
    <div className="specialists">{contextual.map(loadout=>loadout&&<div className="card" key={loadout.name}>
      <strong>{loadout.name}</strong><div className="specialValue">{loadout.utility.toFixed(2)}</div>
      <span>{loadout.head.baseName} · {loadout.back.baseName} · {loadout.wrist.baseName}</span>
    </div>)}</div>

    <div className="sectionTitle"><h2>Top Main Auction combinations</h2></div>
    <div className="toolbarRow"><div className="segmented">{[10,25,100].map(n=><button className={limit===n?'active':''} onClick={()=>setLimit(n)} key={n}>Top {n}</button>)}</div></div>
    {!combinations.length&&<EmptyState title="A complete loadout is required" text="Add at least one item in each slot." />}
    {combinations.map((c,idx)=><details className={`comboCard ${idx===0?'best':''}`} key={`${c.head.id}-${c.back.id}-${c.wrist.id}`} open={idx===0}>
      <summary><div><span className="rank">#{idx+1}</span><strong>{c.score.total.toFixed(2)}</strong><span>{c.head.name} · {c.back.name} · {c.wrist.name}</span></div></summary>
      <div className="comboBody"><div className="loadoutGrid"><LoadoutCard slot="Head" item={c.head}/><LoadoutCard slot="Back" item={c.back}/><LoadoutCard slot="Wrist" item={c.wrist}/></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={c.stats[k]} suffix="%" />)}</div>
      <div className="scoreBreakdown"><b>Main utility {c.score.total.toFixed(2)}</b>{c.wastedArrow>0&&<span>Wasted Arrow above 75%: {c.wastedArrow.toFixed(1)}%</span>}</div></div>
    </details>)}
  </section>;
}

function CertificateScreen({data,setData}:{data:AppData;setData:(d:AppData)=>void}){
  const [logOpen,setLogOpen]=useState(false);
  const [editInventory,setEditInventory]=useState(false);
  const availableCertificates=data.ownedCertificates.filter(c=>c.quantity>0);
  const [selectedCertificateId,setSelectedCertificateId]=useState(availableCertificates[0]?.id??'');
  const certificateState=useCertificateWorker(data);
  const decisions=certificateState.decisions;
  useEffect(()=>{
    if(!availableCertificates.some(c=>c.id===selectedCertificateId))setSelectedCertificateId(availableCertificates[0]?.id??'');
  },[data.ownedCertificates,selectedCertificateId]);
  const selectedCertificate=availableCertificates.find(c=>c.id===selectedCertificateId);
  const changeQty=(id:string,amount:number)=>setData({...data,ownedCertificates:data.ownedCertificates.map(x=>x.id===id?{...x,quantity:Math.max(0,x.quantity+amount)}:x)});
  const patchCertificate=(id:string,patch:Partial<OwnedCertificate>)=>setData({...data,ownedCertificates:data.ownedCertificates.map(x=>x.id===id?{...x,...patch}:x)});
  const signed=(n:number)=>(n>=0?'+':'')+n.toFixed(2)+'%';

  return <section>
    <div className="pageHeading"><div><h1>Certificates</h1><p>Expected-value decisions · Main Auction first · Lucky Grading ON</p></div></div>

    <div className="notice"><b>Decision rule:</b> every certificate is tested against every eligible item. Main Auction uses the robust zero-state baseline first, with central/high states shown only as sensitivity. Unknown Luck/Focused magnitude is explicit unresolved mass rather than fake zero EV. Specialists are considered only after Main, in the order Drink Prep → Grading → Shop/Idle.</div>

    {certificateState.computing&&<div className="notice">Recalculating certificate decisions in the background…</div>}
    {certificateState.error&&<div className="notice dangerNotice"><b>Certificate analysis error:</b> {certificateState.error}</div>}

    <div className="sectionTitle"><h2>What should I do now?</h2></div>
    <div className="premiumAdviceList">
      {decisions.map(decision=>{
        const target=decision.recommendedTarget;
        return <details className="certCard premiumAdviceCard" key={decision.certificate.id} open={decision.verdict==='USE'||decision.verdict==='CONSIDER'}>
          <summary>
            <div>
              <strong>{decision.certificate.type}</strong>
              <span>{decision.certificate.mutation?decision.certificate.mutation+' · ':''}{decision.certificate.gradeStars!==undefined?'★'.repeat(decision.certificate.gradeStars)+' · ':''}Owned {decision.certificate.quantity}{decision.certificate.displayedValue!==undefined?' · 
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label={target.unresolvedOutcomeMassPct>0?"Resolved-branch robust Main EV":"Robust Main EV"} value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceMainWorsePct} suffix="%"/>
                <StatTile label="Chance any relevant loadout worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Potential downside incl. unresolved" value={target.chancePotentialWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Robust / central / high Main EV</b><span>{signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementCentralPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Worst dynamic-state Main EV</b><span>{signed(target.expectedImprovementLowPct)}</span></div>
                <div><b>Decision basis</b><span>{target.decisionBasis}</span></div>
                <div><b>Resolved / unresolved probability mass</b><span>{target.resolvedOutcomeMassPct.toFixed(1)}% / {target.unresolvedOutcomeMassPct.toFixed(1)}%</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)} · worse {target.chanceDrinkPrepWorsePct.toFixed(1)}%</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)} · worse {target.chanceGradingWorsePct.toFixed(1)}%</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)} · worse {target.chanceShopWorsePct.toFixed(1)}%</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved outcome mass:</b> {target.unresolvedEffects.join(', ')}. Those branches are excluded from the numeric EV rather than scored as zero. The displayed EV therefore describes only the resolved {target.resolvedOutcomeMassPct.toFixed(1)}% of the model, and a USE verdict remains blocked.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. The untouched catalogue uses neutral relative weights; exact game effect-selection odds are unpublished. Higher certificate grade/mutation is treated as directionally favourable but its unpublished roll-strength transform is not invented. Unresolved branches remain explicit.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.mutation?' · '+cert.mutation:''}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · 
      <div className="notice">Recording a roll below consumes the exact selected certificate automatically and stores its grade and mutation. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.mutation?cert.mutation+' · ':''}{cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.mutation?' · '+certificate.mutation:''}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · 
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateMutation:certificate.mutation,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="formGrid"><label>Mutation<input value={cert.mutation??''} placeholder="None / Secret / …" onChange={e=>patchCertificate(cert.id,{mutation:e.target.value.trim()||undefined})}/></label><label>Grade stars<input type="number" min="0" max="5" step="1" value={cert.gradeStars??''} onChange={e=>patchCertificate(cert.id,{gradeStars:e.target.value===''?undefined:Math.max(0,Math.min(5,Math.trunc(Number(e.target.value)||0)))})}/></label><div className="actions wide"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="formGrid"><label>Mutation<input value={cert.mutation??''} placeholder="None / Secret / …" onChange={e=>patchCertificate(cert.id,{mutation:e.target.value.trim()||undefined})}/></label><label>Grade stars<input type="number" min="0" max="5" step="1" value={cert.gradeStars??''} onChange={e=>patchCertificate(cert.id,{gradeStars:e.target.value===''?undefined:Math.max(0,Math.min(5,Math.trunc(Number(e.target.value)||0)))})}/></label><div className="actions wide"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="formGrid"><label>Mutation<input value={cert.mutation??''} placeholder="None / Secret / …" onChange={e=>patchCertificate(cert.id,{mutation:e.target.value.trim()||undefined})}/></label><label>Grade stars<input type="number" min="0" max="5" step="1" value={cert.gradeStars??''} onChange={e=>patchCertificate(cert.id,{gradeStars:e.target.value===''?undefined:Math.max(0,Math.min(5,Math.trunc(Number(e.target.value)||0)))})}/></label><div className="actions wide"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="formGrid"><label>Mutation<input value={cert.mutation??''} placeholder="None / Secret / …" onChange={e=>patchCertificate(cert.id,{mutation:e.target.value.trim()||undefined})}/></label><label>Grade stars<input type="number" min="0" max="5" step="1" value={cert.gradeStars??''} onChange={e=>patchCertificate(cert.id,{gradeStars:e.target.value===''?undefined:Math.max(0,Math.min(5,Math.trunc(Number(e.target.value)||0)))})}/></label><div className="actions wide"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
+decision.certificate.displayedValue.toLocaleString():''}</span>
            </div>
            <div className="premiumVerdict">{decision.verdict}</div>
          </summary>
          <div className="comboBody">
            {target?<>
              <div className="rowBetween"><div><span className="eyebrow">BEST CURRENT TARGET</span><h3>{target.item.baseName||target.item.name}</h3><p>{target.item.slot}{target.item.authenticated?' · replacing '+target.item.authentication.effect:''}</p></div><span className="badge heuristic">{target.confidencePct.toFixed(0)}% CONFIDENCE</span></div>

              <div className="statsGrid three">
                <StatTile label="Robust Main improves" value={target.chanceOfImprovementPct} suffix="%"/>
                <StatTile label="Potential Main improves" value={target.chanceOfPotentialImprovementPct} suffix="%"/>
                <StatTile label="Expected Main change" value={target.expectedImprovementPct} suffix="%"/>
                <StatTile label="Chance Main/context worsens" value={target.chanceOfWorsePct} suffix="%"/>
                <StatTile label="Meaningful robust gain ≥1%" value={target.chanceOfMeaningfulImprovementPct} suffix="%"/>
                <StatTile label="Unresolved outcome mass" value={target.unresolvedOutcomeMassPct} suffix="%"/>
                <StatTile label="Current Main fit" value={target.mainFitPct} suffix="%"/>
              </div>

              <div className="thresholdTable">
                <div><b>Main sensitivity low / central / high</b><span>{signed(target.expectedImprovementLowPct)} / {signed(target.expectedImprovementPct)} / {signed(target.expectedImprovementHighPct)}</span></div>
                <div><b>Average robust gain when successful</b><span>{signed(target.averageGainWhenSuccessfulPct)}</span></div>
                <div><b>Average demonstrated loss when worse</b><span>{signed(target.averageLossWhenWorsePct)}</span></div>
                <div><b>10th / median / 90th central percentile</b><span>{signed(target.p10Pct)} / {signed(target.medianPct)} / {signed(target.p90Pct)}</span></div>
                <div><b>Best possible modelled branch</b><span>{target.bestPossibleOutcome} · {signed(target.bestCasePct)}</span></div>
                <div><b>Worst modelled Main/context branch</b><span>{target.worstPossibleOutcome} · {signed(target.worstCasePct)}</span></div>
                <div><b>Authentication risk — neutral Main</b><span>{signed(target.currentAuthenticationMainRiskPct)}</span></div>
                <div><b>Authentication risk — Day/Night/Rain</b><span>{signed(target.currentAuthenticationContextRiskPct)}</span></div>
                <div><b>Authentication risk — Drink Prep</b><span>{signed(target.currentAuthenticationDrinkRiskPct)}</span></div>
                <div><b>Authentication risk — Grading</b><span>{signed(target.currentAuthenticationGradingRiskPct)}</span></div>
                <div><b>Authentication risk — Shop/Idle</b><span>{signed(target.currentAuthenticationShopRiskPct)}</span></div>
                <div><b>Worst authentication risk anywhere relevant</b><span>{signed(target.currentAuthenticationValueAtRiskPct)}</span></div>
                <div><b>Average Day/Night/Rain impact</b><span>{signed(target.expectedContextualMainPct)}</span></div>
                <div><b>Worst Day/Night/Rain impact</b><span>{signed(target.worstContextualMainPct)}</span></div>
                <div><b>Expected Drink Prep impact</b><span>{signed(target.expectedDrinkPrepPct)}</span></div>
                <div><b>Expected Grading impact</b><span>{signed(target.expectedGradingPct)}</span></div>
                <div><b>Expected Shop/Idle impact</b><span>{signed(target.expectedShopPct)}</span></div>
              </div>

              {target.unresolvedEffects.length>0&&<div className="notice warning"><b>Unresolved magnitude:</b> {target.unresolvedEffects.join(', ')}. These branches are not treated as zero-value known outcomes and cannot produce a USE verdict until supported by numeric evidence.</div>}
              <ul>{target.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>

              {decision.conversion&&<div className="notice"><b>Wooden → Premium opportunity cost:</b> {decision.conversion.recommendation}. Direct Wooden EV {signed(decision.conversion.directExpectedMainPct)} vs synthetic Premium EV {signed(decision.conversion.premiumExpectedMainPct)}. Conversion costs {decision.conversion.diamondCost} Diamonds. {decision.conversion.reason}</div>}

              <details>
                <summary>Other targets</summary>
                <div className="thresholdTable">{decision.targets.slice(1,7).map((alt,index)=><div key={alt.item.id}><b>#{index+2} {alt.item.baseName||alt.item.name} · {alt.verdict}</b><span>{alt.chanceOfImprovementPct.toFixed(1)}% robust improve · EV {signed(alt.expectedImprovementPct)}</span></div>)}</div>
              </details>
            </>:<p className="muted">A complete Head, Back and Wrist inventory is required.</p>}

            <div className="notice warning"><b>Evidence boundary:</b> these are modelled decision percentages, not hidden Roblox loot odds. Effect selection uses a neutral equal prior until exact-certificate observations exist. Unknown star transforms and unresolved magnitudes reduce confidence instead of being invented.</div>
          </div>
        </details>;
      })}
      {!certificateState.computing&&!certificateState.error&&!decisions.length&&<p className="muted">No owned certificates are available for analysis.</p>}
    </div>

    <div className="card">
      <div className="sectionTitle"><h2>Owned certificates</h2><button className="secondary compact" onClick={()=>setEditInventory(!editInventory)}>{editInventory?'Done':'Manual adjustment'}</button></div>
      <div className="gearList">{data.ownedCertificates.map(cert=><div className="gearCard" key={cert.id}><strong>{cert.type}</strong><p>{cert.rarity||'Certificate'}{cert.gradeStars!==undefined?' · '+'★'.repeat(cert.gradeStars):''}{cert.displayedValue!==undefined?' · $'+cert.displayedValue.toLocaleString():''} · Owned: {cert.quantity}</p>{editInventory&&<div className="actions"><button onClick={()=>changeQty(cert.id,-1)} disabled={cert.quantity===0}>− Remove one</button><button onClick={()=>changeQty(cert.id,1)}>＋ Add one</button></div>}</div>)}</div>
      <div className="notice">Recording a roll below now consumes the exact selected certificate automatically. Wooden → Premium is compared explicitly against direct Wooden use at the current 150-Diamond conversion cost.</div>
    </div>

    <div className="sectionTitle"><h2>Record a result</h2></div>
    {availableCertificates.length?<div className="card">
      <label>Certificate actually used<select value={selectedCertificateId} onChange={e=>setSelectedCertificateId(e.target.value)}>{availableCertificates.map(cert=><option value={cert.id} key={cert.id}>{cert.type} · {cert.gradeStars!==undefined?'★'.repeat(cert.gradeStars)+' · ':''}{cert.displayedValue!==undefined?'$'+cert.displayedValue.toLocaleString()+' · ':''}owned {cert.quantity}</option>)}</select></label>
      <button className="secondary" disabled={!selectedCertificate} onClick={()=>setLogOpen(true)}>＋ Record selected certificate roll</button>
    </div>:<p className="muted">No certificate with quantity remaining is available to record.</p>}

    <div className="sectionTitle"><h2>Roll history</h2></div>
    <div className="card tableCard">{data.rollLog.length?data.rollLog.slice().reverse().map(r=><div className="logRow" key={r.id}><div><strong>{r.itemName}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.certificateInventoryType??(r.certificateType.startsWith('Normal')?'Legacy Normal':r.certificateType.startsWith('Premium')?'Premium':r.certificateType.startsWith('Limited')?'Limited':'Legacy Alien')}</span></div><div><b>{r.newAuthentication} {r.newValue}%</b><span>{r.bestScoreBefore.toFixed(2)} → {r.bestScoreAfter.toFixed(2)}</span></div></div>):<p className="muted">No certificate rolls recorded yet.</p>}</div>

    {logOpen&&selectedCertificate&&<RollLogEditor data={data} certificate={selectedCertificate} onClose={()=>setLogOpen(false)} onSave={(r,updated)=>{
      try{
        setData(applyRecordedCertificateRoll(data,selectedCertificate.id,r,updated));
        setLogOpen(false);
      }catch(error){alert(error instanceof Error?error.message:'Could not record certificate roll.')}
    }}/>}
  </section>;
}

function SettingsScreen({data,setData,showToast}:{data:AppData;setData:(d:AppData)=>void;showToast:(s:string)=>void}){
  const jsonRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null);
  function setS<K extends keyof AlgorithmSettings>(k:K,v:AlgorithmSettings[K]){setData({...data,settings:{...data.settings,[k]:v}})}
  const fields:Array<[keyof AlgorithmSettings,string]>=[['luckWeight','Main Auction Luck weight'],['arrowWeight','Main Auction Bid Arrow weight'],['arrowSweetSpot','Bid Arrow sweet spot'],['zoneWeight','Main Auction Bid Zone weight'],['zoneBreakpoint1','Bid Zone breakpoint 1'],['zoneBreakpoint2','Bid Zone breakpoint 2'],['zoneMultiplier2','Bid Zone middle multiplier'],['zoneMultiplier3','Bid Zone upper multiplier'],['recoveryWeight','Main Auction Bid Recovery weight'],['energyTarget','Drink Prep Energy target'],['energyCeiling','Drink Prep Energy ceiling'],['energySecondStageMultiplier','Drink Prep above-target multiplier']];
  const issues=algorithmIssues(data.settings);
  return <section><div className="pageHeading"><div><h1>Settings</h1><p>Algorithm Version 2.0</p></div></div>
    <div className="sectionTitle"><h2>Appearance</h2></div><div className="card"><label>Theme<select value={data.theme} onChange={e=>setData({...data,theme:e.target.value as any})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div className="sectionTitle"><h2>Algorithm editor</h2><button className="secondary compact" onClick={()=>setData({...data,settings:{...LOCKED_DEFAULT_SETTINGS}})}>Reset to locked defaults</button></div>
    <div className="settingsGrid">{fields.map(([k,label])=><label className="settingField" key={k}><span>{label}</span><input type="number" step="any" value={data.settings[k]} onChange={e=>setS(k,Number(e.target.value) as never)}/></label>)}</div>
    {issues.length>0&&<div className="notice dangerNotice"><b>Settings need correction:</b> {issues.join(' · ')}</div>}
    <div className="notice">Algorithm 2.0 uses one shared model for Main Auction, retention and certificate decisions. Displayed Luck is linear. Bid Arrow benefit caps at your 75% sweet spot with no invented over-cap penalty. Drink Prep, Grading and Shop/Idle are separate loadouts and never compensate for a weaker Main Auction result. Day, Night and Rain are evaluated as contextual Main variants instead of fake uptime averages.</div>
    <div className="sectionTitle"><h2>Authentication outcome catalogue</h2><button className="secondary compact" onClick={()=>setData({...data,authModel:[...data.authModel,newAuthModelEntry()]})}>＋ Add outcome</button></div><div className="card authModel"><p className="muted">This is the live certificate model. Enabled rows, certificate tier, min / typical / max, confidence and relative-weight class all feed directly into certificate EV. MEDIUM is the neutral default because the real per-effect odds are unpublished; changing the class is an explicit user assumption, not a game fact.</p>{data.authModel.filter(m=>m.certificateType!=='Certificate of Alienticity'&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).slice().sort((a,b)=>(a.certificateInventoryType??'').localeCompare(b.certificateInventoryType??'')||a.slot.localeCompare(b.slot)||a.outcome.localeCompare(b.outcome)).map(m=><AuthModelRow key={m.id} entry={m} onChange={entry=>setData({...data,authModel:data.authModel.map(x=>x.id===entry.id?entry:x)})} onDelete={()=>{if(confirm(`Remove authentication model outcome ${m.outcome}? Roll history is not deleted.`))setData({...data,authModel:data.authModel.filter(x=>x.id!==m.id)})}}/>)}</div>
    <div className="sectionTitle"><h2>Backup & data safety</h2></div><div className="card buttonStack"><button className="primary" onClick={()=>downloadText(`storage-hunters-backup-${dateStamp()}.json`,exportJson(data),'application/json')}>Download JSON backup</button><button className="secondary" onClick={()=>jsonRef.current?.click()}>Restore JSON backup</button><button className="secondary" onClick={()=>downloadText(`storage-hunters-gear-${dateStamp()}.csv`,gearToCsv(data.gear),'text/csv')}>Export gear CSV</button><button className="secondary" onClick={()=>csvRef.current?.click()}>Import gear CSV</button><input hidden type="file" accept="application/json,.json" ref={jsonRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=importJson(await f.text());if(confirm(`Restore backup containing ${d.gear.length} gear items? This replaces current local data.`)){setData(d);showToast('Backup restored')}}catch(err){alert(err instanceof Error?err.message:'Invalid backup')}}}/><input hidden type="file" accept="text/csv,.csv" ref={csvRef} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=csvToGear(await f.text());if(confirm(`Import ${g.length} gear items? They will be added to the current inventory.`)){const imported=prepareImportedGear(data.gear,g);setData({...data,gear:[...data.gear,...imported]});showToast('CSV imported')}}catch(err){alert(err instanceof Error?err.message:'Invalid CSV')}}}/><button className="danger" onClick={()=>{const phrase=prompt('Type RESET ALL DATA to permanently clear all local inventory, certificates, roll history, vehicle parts, trophies and settings back to an empty workspace.');if(phrase==='RESET ALL DATA')setData(makeEmptyData())}}>Clear all local data</button></div>
  </section>;
}

function GearEditor({item,authModel,mode,onClose,onSave}:{item:GearItem;authModel:AuthModelEntry[];mode:'add'|'edit';onClose:()=>void;onSave:(i:GearItem,keepAdding?:boolean)=>void}){
  const [v,setV]=useState({...item,name:generateGearName(item.baseName,item.stats,item.authenticated,item.authentication)});
  const initialShown=statLabels.filter(([key])=>Math.abs(item.stats[key])>1e-12).map(([key])=>key);
  const [shownStats,setShownStats]=useState<Array<keyof GearStats>>(initialShown);
  const patch=(next:Partial<GearItem>)=>setV(current=>{const updated={...current,...next};return {...updated,name:generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication)};});
  const setStat=(k:keyof GearStats,n:number)=>setV(current=>{const stats={...current.stats,[k]:Number.isFinite(n)?n:0};return {...current,stats,name:generateGearName(current.baseName,stats,current.authenticated,current.authentication)};});
  const setAuthentication=(next:Partial<GearItem['authentication']>)=>setV(current=>{const authentication={...current.authentication,...next};return {...current,authentication,name:generateGearName(current.baseName,current.stats,current.authenticated,authentication)};});
  const showStat=(key:keyof GearStats)=>setShownStats(current=>current.includes(key)?current:[...current,key]);
  const hideStat=(key:keyof GearStats)=>{setStat(key,0);setShownStats(current=>current.filter(k=>k!==key));};
  const orderedShown=statLabels.filter(([key])=>shownStats.includes(key));
  const hidden=statLabels.filter(([key])=>!shownStats.includes(key));
  const displayedArrow=reductionToGameArrow(v.stats.arrowReduction);
  const legacyAlien=v.authenticated&&v.authentication.kind==='Alien';
  const currentKind=v.authentication.kind==='Premium'?'Premium':v.authentication.kind==='Limited'?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal sheet"><div className="modalHeader"><div><span className="eyebrow">{mode==='add'?'QUICK ADD GEAR':'EDIT GEAR'}</span><h2>{v.baseName||'New gear'}</h2></div><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="formGrid quickIdentity"><label className="wide">Actual gear name<input autoFocus value={v.baseName} onChange={e=>patch({baseName:e.target.value})} placeholder="e.g. Pearl Dominus"/></label><label>Slot<select value={v.slot} onChange={e=>patch({slot:e.target.value as Slot})}><option>Head</option><option>Back</option><option>Wrist</option></select></label><label>Mutation<input list={`mutations-${v.id}`} value={v.mutation??''} onChange={e=>patch({mutation:e.target.value})} placeholder="None, Diamond, Gold…"/><datalist id={`mutations-${v.id}`}>{['None','Diamond','Gold','Silver','Cobwebbed','Exclusive','Police','Chrome','Gem','Void','Onyx'].map(m=><option key={m} value={m}/>)}</datalist></label><label>Condition %<input type="number" min="0" max="100" step="any" inputMode="decimal" value={v.conditionPct??''} onChange={e=>patch({conditionPct:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Optional"/></label><label className="check"><input type="checkbox" checked={v.favourite} onChange={e=>patch({favourite:e.target.checked})}/> Lock / favourite</label></div>
    <div className="autoNamePreview"><span>Automatic name</span><strong>{v.name||'Name updates as stats are entered'}</strong></div>
    <div className="quickEntrySection"><div className="rowBetween"><div><strong>Stats shown on this item</strong><div className="fieldHelp">Tap only the stats visible in game. Empty fields stay out of the way.</div></div></div>
      {hidden.length>0&&<div className="statPicker">{hidden.map(([key,label])=><button type="button" key={key} onClick={()=>showStat(key)}>＋ {shortStat(label)}</button>)}</div>}
      {!orderedShown.length&&<div className="quickEmpty">No stats selected yet.</div>}
      <div className="quickStatGrid">{orderedShown.map(([key,label])=>key==='arrowReduction'
        ? <div className="quickStatField arrowQuick" key={key}><label>{label}<input inputMode="decimal" type="number" step="any" value={displayedArrow} onChange={e=>setStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><small>Enter the signed game value, e.g. -24.</small></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>
        : <div className="quickStatField" key={key}><label>{label} %<input inputMode="decimal" type="number" step="any" value={v.stats[key]} onChange={e=>setStat(key,Number(e.target.value))}/></label><button type="button" className="removeStat" onClick={()=>hideStat(key)}>×</button></div>)}</div>
    </div>
    <details className="finalStatsEditor authQuick" open={v.authenticated}><summary>Authentication {v.authenticated?`— ${v.authentication.kind} · ${v.authentication.effect||'select effect'}`:'— none'}</summary><div className="formGrid"><label className="check wide"><input type="checkbox" checked={v.authenticated} onChange={e=>{const authenticated=e.target.checked;const authentication=authenticated?(v.authenticated?v.authentication:{kind:'Normal' as const,effect:'',value:0}):{kind:'None' as const,effect:'',value:0};setV(current=>({...current,authenticated,authentication,name:generateGearName(current.baseName,current.stats,authenticated,authentication)}));}}/> Authenticated</label>{v.authenticated&&<>{legacyAlien?<><div className="wide notice"><b>Legacy Alien</b> — retained for historical compatibility.</div><label>Type<input value="Legacy Alien" readOnly/></label><label>Legacy effect<input value={v.authentication.effect} readOnly/></label><label>Legacy value %<input type="number" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label></>:<><label>Certificate type<select value={currentKind} onChange={e=>setAuthentication({kind:e.target.value as 'Normal'|'Premium'|'Limited',effect:'',value:0})}><option>Normal</option><option>Premium</option><option>Limited</option></select></label><label>Effect<select value={v.authentication.effect} onChange={e=>setAuthentication({effect:e.target.value})}>{activeAuthenticationOptions(v.slot,v.authentication.effect,authModel,currentKind).map(x=><option value={x} key={x}>{x||'Select effect'}</option>)}</select></label><label>Value %<input type="number" inputMode="decimal" step="any" value={v.authentication.value} onChange={e=>setAuthentication({value:Number(e.target.value)})}/></label><p className="wide fieldHelp">{currentKind==='Premium'?'Premium effects are evaluated by the shared loadout engine where possible; unresolved effects remain protected.':currentKind==='Limited'?'Limited effects are evaluated against your actual Main and specialist loadouts; unknown proc behaviour reduces confidence rather than creating fake certainty.':'Enter the normal/base accessory stats separately. Numeric authentication is added automatically by the optimiser.'}</p></>}</>}</div></details>
    <div className="stickyActions quickActions"><button className="secondary" onClick={onClose}>Cancel</button>{mode==='add'&&<button className="secondary addAnother" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)},true)}>Save + another</button>}<button className="primary" onClick={()=>onSave({...v,name:generateGearName(v.baseName,v.stats,v.authenticated,v.authentication)})}>{mode==='add'?'Analyse & add':'Save changes'}</button></div>
  </div></div>;
}
function NewItemSheet({analysis,onClose}:{analysis:{name:string;standalone:number;previous:number;next:number;bestChanged:boolean;replaced?:string;verdict?:string;bestCert?:string;combined?:GearStats};onClose:()=>void}){const d=analysis.next-analysis.previous;return <div className="modalBackdrop"><div className="modal resultModal"><span className="eyebrow">NEW ITEM ANALYSIS</span><h2>{analysis.name}</h2><div className="resultScore">{analysis.next.toFixed(2)}</div><div className="statsGrid three resultStats"><StatTile label="Standalone" value={analysis.standalone}/><StatTile label="Previous best" value={analysis.previous}/><StatTile label="Improvement" value={d}/></div><p>Best loadout changed: <b>{analysis.bestChanged?'YES':'NO'}</b></p>{analysis.replaced&&<p>Replaces: <b>{analysis.replaced}</b></p>}<StatusBadge status={analysis.verdict??'KEEP'}/>{analysis.combined&&<><div className="sectionTitle"><h3>New combined stats</h3></div><div className="statsGrid">{statLabels.map(([k,l])=><StatTile key={k} label={l} value={analysis.combined![k]} suffix="%"/>)}</div></>}{analysis.bestCert&&<p className="notice">Best certificate targeting: <b>{analysis.bestCert}</b>.</p>}<button className="primary" onClick={onClose}>Done</button></div></div>}

function RollLogEditor({data,certificate,onClose,onSave}:{data:AppData;certificate:OwnedCertificate;onClose:()=>void;onSave:(r:CertificateRollLog,updated:GearItem)=>void}){
  const type=authModelTypeForOwnedCertificate(certificate);
  const [itemId,setItemId]=useState(data.gear[0]?.id??'');
  const item=data.gear.find(g=>g.id===itemId);
  const [newAuth,setNewAuth]=useState('');
  const [newValue,setNewValue]=useState(0);
  const autoPreview=useMemo(()=>item&&newAuth?applyRollToItem(item,newAuth,newValue,type):item,[item,newAuth,newValue,type]);
  const expectedDisplayedStats=useMemo(()=>autoPreview?effectiveItemStats(autoPreview):undefined,[autoPreview]);
  const [finalStats,setFinalStats]=useState<GearStats|undefined>(expectedDisplayedStats?{...expectedDisplayedStats}:undefined);
  useEffect(()=>{setFinalStats(expectedDisplayedStats?{...expectedDisplayedStats}:undefined)},[expectedDisplayedStats]);
  useEffect(()=>{setNewAuth('');setNewValue(0)},[itemId,type]);
  const preview=useMemo(()=>{
    if(!autoPreview||!finalStats)return autoPreview;
    const observed=withObservedAuthenticationStats(autoPreview,finalStats);
    return {...observed,name:generateGearName(observed.baseName,observed.stats,observed.authenticated,observed.authentication)};
  },[autoPreview,finalStats]);
  const before=optimise(data.gear,data.settings,1)[0]?.score.total??0;
  const previewGear=preview?data.gear.map(g=>g.id===preview.id?preview:g):data.gear;
  const after=optimise(previewGear,data.settings,1)[0]?.score.total??before;
  const setFinalStat=(key:keyof GearStats,value:number)=>setFinalStats(current=>({...ZERO_STATS,...current,[key]:Number.isFinite(value)?value:0}));
  const authKind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h2>Record certificate roll</h2><button className="iconButton" onClick={onClose}>×</button></div>
    <div className="notice"><b>Certificate being consumed:</b> {certificate.type}{certificate.gradeStars!==undefined?' · '+'★'.repeat(certificate.gradeStars):''}{certificate.displayedValue!==undefined?' · $'+certificate.displayedValue.toLocaleString():''}. Saving this roll reduces its owned quantity by one.</div>
    <div className="formGrid"><label className="wide">Item<select value={itemId} onChange={e=>setItemId(e.target.value)}>{data.gear.map(g=><option value={g.id} key={g.id}>{g.name} · {g.slot}</option>)}</select></label><label>New authentication<select value={newAuth} onChange={e=>setNewAuth(e.target.value)}><option value="">Select result</option>{activeCertificateOutcomeOptions(item?.slot,data.authModel,authKind,certificate.type).map(a=><option key={a}>{a}</option>)}</select></label><label>New value %<input type="number" step="any" value={newValue} onChange={e=>setNewValue(Number(e.target.value))}/></label><label>Best score before<input type="number" value={before} readOnly/></label><label>Calculated score after<input type="number" value={after} readOnly/></label><p className="wide fieldHelp">These are the final stats displayed in game after the new authentication. Any difference caused by the authentication (especially Focused) is stored on that authentication only; the item's base stats are not overwritten.</p></div>
    {finalStats&&<details className="finalStatsEditor"><summary>Confirm / correct final displayed stats</summary><div className="formGrid">{statLabels.filter(([k])=>k!=='arrowReduction').map(([k,l])=><label key={k}>{l} %<input type="number" inputMode="decimal" step="any" value={finalStats[k]} onChange={e=>setFinalStat(k,Number(e.target.value))}/></label>)}<label className="wide arrowInput">Bid Arrow Speed — game display %<input type="number" inputMode="decimal" step="any" value={reductionToGameArrow(finalStats.arrowReduction)} onChange={e=>setFinalStat('arrowReduction',gameArrowToReduction(Number(e.target.value)))}/><span>Enter the signed value shown by the game.</span></label></div></details>}
    <div className="stickyActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!item||!newAuth||!preview||certificate.quantity<1} onClick={()=>{item&&preview&&onSave({id:crypto.randomUUID(),date:new Date().toISOString(),certificateType:type,itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,newAuthentication:newAuth,newValue,improvedBestSet:after>before,bestScoreBefore:before,bestScoreAfter:after,certificateId:certificate.id,certificateGradeStars:certificate.gradeStars,certificateInventoryType:certificate.type},preview)}}>Apply, record & consume</button></div>
  </div></div>;
}

function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType']{
  return type==='Premium Certificate of Authenticity'
    ?'Premium Certificate of Authenticity'
    :type==='Limited Certificate of Authenticity'
      ?'Limited Certificate of Authenticity'
      :'Normal Certificate of Authenticity';
}

function AuthModelRow({entry,onChange,onDelete}:{entry:AuthModelEntry;onChange:(e:AuthModelEntry)=>void;onDelete:()=>void}){
  const inventoryType=entry.certificateInventoryType??(
    entry.certificateType==='Premium Certificate of Authenticity'?'Premium Certificate of Authenticity':
    entry.certificateType==='Limited Certificate of Authenticity'?'Limited Certificate of Authenticity':
    'Wooden Certificate of Authenticity'
  );
  return <details className="modelRow">
    <summary><span>{entry.outcome}</span><span>{inventoryType.replace(' Certificate of Authenticity','')} · {entry.slot} · {entry.assumedLikelihoodClass}{entry.enabled?'':' · disabled'}</span></summary>
    <div className="formGrid">
      <label className="wide">Outcome<input value={entry.outcome} onChange={e=>onChange({...entry,outcome:e.target.value})}/></label>
      <label>Certificate tier<select value={inventoryType} onChange={e=>{const certificateInventoryType=e.target.value as OwnedCertificate['type'];onChange({...entry,certificateInventoryType,certificateType:authModelCertificateType(certificateInventoryType)})}}><option>Wooden Certificate of Authenticity</option><option>Ripped Certificate of Authenticity</option><option>Premium Certificate of Authenticity</option><option>Limited Certificate of Authenticity</option></select></label>
      <label>Slot<select value={entry.slot} onChange={e=>onChange({...entry,slot:e.target.value as AuthModelEntry['slot']})}><option>Any</option><option>Head</option><option>Back</option><option>Wrist</option></select></label>
      <label className="wide">Category<input value={entry.category} onChange={e=>onChange({...entry,category:e.target.value})}/></label>
      <label>Relative-weight class<select value={entry.assumedLikelihoodClass} onChange={e=>onChange({...entry,assumedLikelihoodClass:e.target.value as AuthModelEntry['assumedLikelihoodClass']})}>{['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Confidence<select value={entry.confidence} onChange={e=>onChange({...entry,confidence:e.target.value as AuthModelEntry['confidence']})}>{['Unknown','Low','Medium','High','Empirical'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Optional min<input type="number" step="any" value={entry.min??''} onChange={e=>onChange({...entry,min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional typical<input type="number" step="any" value={entry.typical??''} onChange={e=>onChange({...entry,typical:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Optional max<input type="number" step="any" value={entry.max??''} onChange={e=>onChange({...entry,max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={entry.enabled} onChange={e=>onChange({...entry,enabled:e.target.checked})}/> Enabled in live EV</label>
      <div className="wide fieldHelp">Observed samples: {entry.observedSampleCount}. Values: {entry.observedValues.length?entry.observedValues.join(', '):'none yet'}. As exact-tier samples accumulate, empirical roll strength progressively outweighs the min/typical/max prior.</div>
      <button className="danger wide" onClick={onDelete}>Delete model outcome</button>
    </div>
  </details>;
}

function LoadoutCard({slot,item}:{slot:string;item:GearItem}){return <div className="loadoutCard"><span>{slot}</span><strong>{item.baseName||item.name}</strong>{item.authentication.effect&&<small>{item.authentication.effect} {item.authentication.value?`${item.authentication.value}%`:''}</small>}</div>}
function StatTile({label,value,suffix=''}:{label:string;value:number;suffix?:string}){return <div className="statTile"><span>{label}</span><strong>{Number.isFinite(value)?value.toFixed(Math.abs(value)%1?2:0):'—'}{suffix}</strong></div>}
function ArrowThresholdCard({value,settings}:{value:number;settings:AlgorithmSettings}){const max=Math.max(settings.arrowSweetSpot,100);const pct=Math.min(100,Math.max(0,value/max*100));const excess=Math.max(0,value-settings.arrowSweetSpot);return <div className="thresholdCard"><div className="rowBetween"><strong>Bid Arrow reduction</strong><span>{value.toFixed(1)}% · target {settings.arrowSweetSpot}%</span></div><div className="progress arrowProgress"><i style={{width:`${pct}%`}}/><b style={{left:`${settings.arrowSweetSpot/max*100}%`}}/></div>{excess>0&&<div className="fieldHelp">{excess.toFixed(1)}% is above your 75% sweet spot. It is treated as wasted, not as an invented gameplay penalty.</div>}</div>}
function ThresholdCard({label,value,target,ceiling}:{label:string;value:number;target:number;ceiling:number}){const pct=Math.min(100,Math.max(0,value/ceiling*100));return <div className="thresholdCard"><div className="rowBetween"><strong>{label}</strong><span>{value.toFixed(1)}% · target {target}% · ceiling {ceiling}%</span></div><div className="progress"><i style={{width:`${pct}%`}}/><b style={{left:`${target/ceiling*100}%`}}/></div></div>}
function StatusBadge({status}:{status:string}){return <span className={`badge status ${status.toLowerCase().replaceAll(' ','-').replaceAll('/','')}`}>{status}</span>}
function EmptyState({title,text,action,onClick}:{title:string;text:string;action?:string;onClick?:()=>void}){return <div className="empty"><div className="emptyIcon">⌁</div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>}

function algorithmIssues(s:AlgorithmSettings):string[]{const issues:string[]=[];for(const [k,v] of Object.entries(s))if(k!=='version'&&!Number.isFinite(Number(v)))issues.push(`${k} is not finite`);if(s.arrowSweetSpot<0)issues.push('Arrow sweet spot cannot be negative');if(s.energyTarget>s.energyCeiling)issues.push('Energy target must be ≤ Energy ceiling');if(s.zoneBreakpoint1>s.zoneBreakpoint2)issues.push('Zone breakpoint 1 must be ≤ breakpoint 2');for(const [label,value] of [['Luck weight',s.luckWeight],['Arrow weight',s.arrowWeight],['Zone weight',s.zoneWeight],['Recovery weight',s.recoveryWeight],['Zone middle multiplier',s.zoneMultiplier2],['Zone upper multiplier',s.zoneMultiplier3]] as const)if(value<0)issues.push(`${label} cannot be negative`);return issues;}
function newAuthModelEntry():AuthModelEntry{return{id:crypto.randomUUID(),certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Custom outcome',category:'Custom / unknown',assumedLikelihoodClass:'MEDIUM',observedSampleCount:0,observedValues:[],confidence:'Unknown',enabled:true}}
function blankItem(slot:Slot='Head'):GearItem{const now=new Date().toISOString();return{id:crypto.randomUUID(),baseName:'',name:'',slot,stats:{...ZERO_STATS},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:now,updatedAt:now}}
function applyRollToItem(item:GearItem,effect:string,value:number,type:AuthModelEntry['certificateType']):GearItem{
  let base=removeNumericAuthentication(item);
  if(base.authenticated){base=structuredClone(base);base.authenticated=false;base.authentication={kind:'None',effect:'',value:0};}
  const updated=addOutcomeToItem(base,effect,value);
  updated.authentication.kind=type.startsWith('Premium')?'Premium':type.startsWith('Limited')?'Limited':'Normal';
  updated.name=generateGearName(updated.baseName,updated.stats,updated.authenticated,updated.authentication);
  updated.updatedAt=new Date().toISOString();
  return updated;
}
function prepareImportedGear(existing:GearItem[],incoming:GearItem[]):GearItem[]{const used=new Set(existing.map(x=>x.id));return incoming.map(item=>{const clone=structuredClone(item);if(!clone.id||used.has(clone.id))clone.id=crypto.randomUUID();used.add(clone.id);return clone;});}
function validateItem(i:GearItem){
  if(!i.baseName.trim())return 'Item name is required.';
  if(!['Head','Back','Wrist'].includes(i.slot))return 'Valid slot is required.';
  if(i.conditionPct!==undefined && (!Number.isFinite(i.conditionPct) || i.conditionPct<0 || i.conditionPct>100))return 'Condition must be between 0 and 100%.';
  if(i.mutation!==undefined && typeof i.mutation!=='string')return 'Mutation must be text.';
  for(const [k] of statLabels)if(!Number.isFinite(i.stats[k]))return `${k} must be a finite number.`;
  if(!Number.isFinite(i.authentication.value))return 'Authentication value must be a finite number.';
  if(!i.authenticated)return '';
  if(i.authentication.kind==='None')return 'Choose an authentication type.';
  const effect=i.authentication.effect.trim();
  if(!effect)return 'Choose an authentication effect.';
  if(i.authentication.kind==='Normal'&&LEGACY_ALIEN_EFFECTS.includes(effect as never))return `${effect} is a legacy Alien effect and cannot be selected for a new Normal authentication.`;
  if(i.authentication.kind==='Alien')return ''; // Historical Alien gear remains valid and editable as legacy data.
  if(i.authentication.kind==='Premium'){
    for(const [slot,effects] of Object.entries(PREMIUM_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  if(i.authentication.kind==='Limited'){
    for(const [slot,effects] of Object.entries(LIMITED_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
    return '';
  }
  for(const [slot,effects] of Object.entries(EXCLUSIVE_AUTH_EFFECTS) as Array<[Slot,readonly string[]]>) if(effects.includes(effect)&&slot!==i.slot)return `${effect} is exclusive to ${slot} gear.`;
  return '';
}
function displayStat(k:keyof GearStats,v:number){const n=k==='arrowReduction'?reductionToGameArrow(v):v;return `${n>0?'+':''}${n.toFixed(Math.abs(n)%1?1:0)}%`}
function shortStat(s:string){return s.replace('Energy Drink Time','Energy').replace('Vehicle Speed','Vehicle').replace('Bid Recovery','Recovery').replace('Bid Zone Width','Zone').replace('Bid Arrow Reduction','Arrow').replace('NPC Offers Bonus','NPC')}
function replacedName(prev:any,next:any,slot:Slot){const key=slot.toLowerCase() as 'head'|'back'|'wrist';return prev[key].id!==next[key].id?prev[key].name:undefined}
function dateStamp(){return new Date().toISOString().slice(0,10)}
function downloadText(name:string,text:string,type:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function applyTheme(theme:AppData['theme']){document.documentElement.dataset.theme=theme;if(theme==='system')delete document.documentElement.dataset.theme}
function navIcon(t:Tab){return ({Dashboard:'▦',Gear:'◆',Optimise:'◎',Vehicle:'▰',Trophies:'♜',Certificates:'◈',Settings:'⚙',More:'•••'} as Record<Tab,string>)[t]}
