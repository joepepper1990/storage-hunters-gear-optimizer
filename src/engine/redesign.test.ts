import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeEmptyData, makeInitialData, ZERO_STATS } from '../defaults';
import type { AlgorithmSettings, AppData, AuthKind, GearItem, GearStats, OwnedCertificate, Slot } from '../types';
import { activeSpecialists, analyseGearRetention, buildGearLoadouts, mainAuctionUtility } from './gearLoadouts';
import { findDominator } from './dominance';
import { analyseCertificate, analyseOwnedCertificates, compareCertificateTargets, type CertificateTargetDecision, type OwnedCertificateDecision } from './certificateDecision';
import { buildCertificateQueue } from './certificateQueue';
import { addCertificateBatch, removeCertificateBatch, setCertificateQuantity, updateCertificateBatch } from './certificateInventory';
import { applyRecordedCertificateRoll } from './certificateRolls';
import { PREFERENCE_CONTROLS, controlsFor, resetPreferenceSection, roundedShares, setPreference, setWeightShare, sliderView, weightShares } from './preferences';
import { analyseTrailers, analyseVehicleParts, optimiseVehicle } from './vehicle';
import { optimiseTrophies } from './trophies';
import { effectiveItemStats, scoreStandalone } from './scoring';

function gear(id:string,slot:Slot,stats:Partial<GearStats>={},effect='',value=0,kind:AuthKind='Normal'):GearItem {
  return {id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:!!effect,
    authentication:{kind:effect?kind:'None',effect,value},favourite:false,createdAt:'',updatedAt:''};
}
const s=LOCKED_DEFAULT_SETTINGS;
const verdictOf=(items:GearItem[],id:string,settings:AlgorithmSettings=s)=>analyseGearRetention(items,settings).find(a=>a.item.id===id)!.verdict;

describe('P1: unknown effects are protected for every authentication kind',()=>{
  const unknownEffects=['Mystery Effect','Safecracker','Anti-Gravity Field','Rush','Exhibitor','Sonic','Fossil Finder','Focused'];
  const kinds:AuthKind[]=['Limited','Premium','Normal','Alien'];
  for(const effect of unknownEffects)for(const kind of kinds){
    it(`${kind} ${effect} is never SAFE TO DISCARD and never proves another item redundant`,()=>{
      const target=gear('target','Head',{},effect,10,kind);
      const strong=gear('strong','Head',{luck:100,energy:50,tip:20,npc:20});
      const others=[gear('back','Back'),gear('wrist','Wrist')];
      expect(verdictOf([target,strong,...others],'target')).not.toBe('SAFE TO DISCARD');
      const weak=gear('weak','Head');
      const unknownStrong=gear('unknownStrong','Head',{luck:100,energy:50,tip:20,npc:20},effect,10,kind);
      expect(findDominator(weak,[unknownStrong],s).dominated).toBe(false);
      expect(verdictOf([weak,unknownStrong,...others],'weak')).not.toBe('SAFE TO DISCARD');
    });
  }
  it('still discards a uniformly inferior item next to a known Limited effect',()=>{
    const weak=gear('weak','Head');
    const known=gear('known','Head',{luck:100,energy:50,tip:20,npc:20},'Auto X-Ray',10,'Limited');
    expect(verdictOf([weak,known,gear('back','Back'),gear('wrist','Wrist')],'weak')).toBe('SAFE TO DISCARD');
  });
});

describe('specialist priorities',()=>{
  it('keep Drink Prep -> Grading -> Shop / Idle by default',()=>{
    expect(activeSpecialists(s)).toEqual(['Drink Prep','Grading','Shop / Idle']);
  });
  it('reorder when the user changes priorities and drop ignored specialists',()=>{
    expect(activeSpecialists({...s,shopPriority:10})).toEqual(['Shop / Idle','Drink Prep','Grading']);
    expect(activeSpecialists({...s,drinkPriority:0})).toEqual(['Grading','Shop / Idle']);
    expect(activeSpecialists({...s,shopTipWeight:0,shopNpcWeight:0})).toEqual(['Drink Prep','Grading']);
  });
});

function syntheticTarget(id:string,basis:CertificateTargetDecision['decisionBasis'],rank:number,gain:number):CertificateTargetDecision {
  return {item:gear(id,'Head'),verdict:'CONSIDER',decisionBasis:basis,goalRank:rank,goalGainLowerBound:gain,
    goalChancePct:60,goalChanceLowerBoundPct:60,goalChanceUpperBoundPct:60,resolvedOutcomeMassPct:100,
    expectedImprovementLowPct:0,chanceOfImprovementPct:0,mainFitPct:50} as unknown as CertificateTargetDecision;
}

describe('P2: certificate sorting honours specialist priority and gain, not item IDs',()=>{
  it('ranks Drink Prep +9 above Shop +3.6 even when the Shop item ID sorts first',()=>{
    const shop=syntheticTarget('a-shop','Shop / Idle',5,3.6);
    const drink=syntheticTarget('z-drink','Drink Prep',3,9);
    expect([shop,drink].sort(compareCertificateTargets).map(t=>t.item.id)).toEqual(['z-drink','a-shop']);
  });
  it('ranks the larger gain first within one goal regardless of ID',()=>{
    const small=syntheticTarget('a','Drink Prep',3,4);
    const large=syntheticTarget('z','Drink Prep',3,9);
    expect([small,large].sort(compareCertificateTargets)[0].item.id).toBe('z');
  });
  it('keeps Main Auction ahead of every specialist',()=>{
    const main=syntheticTarget('z-main','Main Auction',0,.5);
    const drink=syntheticTarget('a-drink','Drink Prep',3,50);
    expect([drink,main].sort(compareCertificateTargets)[0].item.id).toBe('z-main');
  });
  it('engine decisions carry ranks that follow the user priorities',()=>{
    const data=makeInitialData();
    const cert=data.ownedCertificates.find(c=>c.quantity>0)!;
    const decision=analyseCertificate(data,cert);
    for(const target of decision.targets){
      if(target.decisionBasis==='Drink Prep')expect(target.goalRank).toBe(3);
      if(target.decisionBasis==='Shop / Idle')expect(target.goalRank).toBe(5);
    }
    // Sorted output is consistent with the comparator.
    for(let i=1;i<decision.targets.length;i++)expect(compareCertificateTargets(decision.targets[i-1],decision.targets[i])).toBeLessThanOrEqual(0);
  });
  it('never presents a conditional chance as complete when outcomes are unresolved',()=>{
    const data=makeInitialData();
    for(const decision of analyseOwnedCertificates(data))for(const target of decision.targets){
      if(target.unresolvedOutcomeMassPct>1e-6){
        expect(target.goalChancePct).toBeNull();
        expect(target.goalChanceUpperBoundPct).toBeNull();
      }
      if(target.decisionBasis==='None')expect(target.goalChancePct).toBeNull();
      expect(target.goalChanceLowerBoundPct).toBeGreaterThanOrEqual(0);
    }
  });
});

function decision(cert:OwnedCertificate,targets:CertificateTargetDecision[]):OwnedCertificateDecision {
  return {certificate:cert,verdict:targets[0]?.verdict??'HOLD',recommendedTarget:targets[0],targets,modelNotes:[]};
}
const wooden=(id:string,quantity:number):OwnedCertificate=>({id,type:'Wooden Certificate of Authenticity',quantity});

describe('certificate action queue',()=>{
  it('allocates no more rows than owned units and shows each target once',()=>{
    const a=syntheticTarget('target-a','Main Auction',0,5),b=syntheticTarget('target-b','Main Auction',0,3),c=syntheticTarget('target-c','Main Auction',0,1);
    const queue=buildCertificateQueue([decision(wooden('w1',2),[a,b,c]),decision(wooden('w2',3),[a,b])]);
    expect(queue.rows.length).toBe(3);
    expect(new Set(queue.rows.map(r=>r.target.item.id)).size).toBe(3);
    const used=(id:string)=>queue.rows.filter(r=>r.certificate.id===id).length;
    expect(used('w1')).toBeLessThanOrEqual(2);
    expect(used('w2')).toBeLessThanOrEqual(3);
    // Remaining units without an unclaimed opportunity are held.
    expect(queue.hold.reduce((n,h)=>n+h.quantity,0)).toBe(5-3);
  });
  it('holds certificates with no qualifying opportunity',()=>{
    const hold=syntheticTarget('x','None',9,0);(hold as {verdict:string}).verdict='HOLD';
    const queue=buildCertificateQueue([decision(wooden('w1',2),[hold])]);
    expect(queue.rows).toEqual([]);
    expect(queue.hold).toEqual([{certificate:wooden('w1',2),quantity:2}]);
  });
  it('is rebuilt from the recorded result, never from an invented earlier outcome',()=>{
    const data=makeInitialData();
    const before=buildCertificateQueue(analyseOwnedCertificates(data));
    if(!before.rows.length)return;
    const first=before.rows[0];
    const item=data.gear.find(g=>g.id===first.target.item.id)!;
    const updated:GearItem={...item,authenticated:true,authentication:{kind:'Normal',effect:'Bid Recovery',value:5}};
    const recorded=applyRecordedCertificateRoll(data,first.certificate.id,{id:'r1',date:new Date().toISOString(),certificateType:'Normal Certificate of Authenticity',
      itemId:item.id,itemName:item.name,slot:item.slot,previousAuthentication:item.authentication.effect,previousValue:item.authentication.value,
      newAuthentication:'Bid Recovery',newValue:5,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0},updated);
    const after=buildCertificateQueue(analyseOwnedCertificates(recorded));
    const total=(d:AppData)=>d.ownedCertificates.reduce((n,c)=>n+c.quantity,0);
    expect(after.rows.length+after.hold.reduce((n,h)=>n+h.quantity,0)).toBe(total(recorded));
    expect(total(recorded)).toBe(total(data)-1);
    // Later rows are always evaluated against the item's current recorded authentication.
    const again=after.rows.find(r=>r.target.item.id===item.id);
    if(again)expect(again.target.item.authentication.effect).toBe('Bid Recovery');
  });
  it('handles an incomplete inventory by holding everything',()=>{
    const data=makeEmptyData();
    const withCert=addCertificateBatch(data,{type:'Wooden Certificate of Authenticity',quantity:2});
    const queue=buildCertificateQueue(analyseOwnedCertificates(withCert));
    expect(queue.rows).toEqual([]);
    expect(queue.hold[0].quantity).toBe(2);
  });
});

describe('P2: certificate batches',()=>{
  it('can be created in an empty workspace',()=>{
    const data=addCertificateBatch(makeEmptyData(),{type:'Limited Certificate of Authenticity',quantity:3,gradeStars:2,mutation:'Gold'});
    expect(data.ownedCertificates).toHaveLength(1);
    expect(data.ownedCertificates[0]).toMatchObject({type:'Limited Certificate of Authenticity',quantity:3,gradeStars:2,mutation:'Gold'});
  });
  it('keeps distinct grade/mutation variants separate and merges identical ones',()=>{
    let data=addCertificateBatch(makeEmptyData(),{type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:1});
    data=addCertificateBatch(data,{type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:2});
    data=addCertificateBatch(data,{type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:2,mutation:'Silver'});
    data=addCertificateBatch(data,{type:'Wooden Certificate of Authenticity',quantity:2,gradeStars:1});
    expect(data.ownedCertificates.map(c=>[c.gradeStars,c.mutation,c.quantity])).toEqual([[1,undefined,3],[2,undefined,1],[2,'Silver',1]]);
  });
  it('edits, adjusts quantity and refuses to create a duplicate variant',()=>{
    let data=addCertificateBatch(makeEmptyData(),{type:'Wooden Certificate of Authenticity',quantity:1});
    data=addCertificateBatch(data,{type:'Ripped Certificate of Authenticity',quantity:1});
    const [a,b]=data.ownedCertificates;
    data=setCertificateQuantity(data,a.id,4);
    expect(data.ownedCertificates[0].quantity).toBe(4);
    expect(()=>updateCertificateBatch(data,b.id,{type:'Wooden Certificate of Authenticity',quantity:1})).toThrow(/already exists/);
    data=updateCertificateBatch(data,b.id,{type:'Ripped Certificate of Authenticity',quantity:2,gradeStars:3});
    expect(data.ownedCertificates[1]).toMatchObject({quantity:2,gradeStars:3});
    expect(()=>setCertificateQuantity(data,a.id,-1)).toThrow();
    expect(removeCertificateBatch(data,a.id).ownedCertificates).toHaveLength(1);
  });
});

describe('preference sliders drive the engines',()=>{
  const data=()=>{const d=makeInitialData();return d;};
  it('maps every default to an exact integer position',()=>{
    for(const control of PREFERENCE_CONTROLS){
      const view=sliderView(control,data());
      expect(view.custom,control.id).toBe(false);
      expect(Number.isInteger(view.position)).toBe(true);
    }
    const luck=controlsFor('Auctions').find(c=>c.id==='luckWeight')!,arrow=controlsFor('Auctions').find(c=>c.id==='arrowWeight')!;
    expect(sliderView(luck,data()).position).toBe(sliderView(arrow,data()).position);
  });
  it('round-trips positions without float residue and preserves custom values until changed',()=>{
    const zone=PREFERENCE_CONTROLS.find(c=>c.id==='zoneWeight')!;
    const set=setPreference(data(),zone,6);
    expect(set.settings.zoneWeight).toBe(.6);
    const custom={...data(),settings:{...data().settings,zoneWeight:.65,luckWeight:2.5}};
    expect(sliderView(zone,custom)).toMatchObject({custom:true,exact:6.5});
    const luck=PREFERENCE_CONTROLS.find(c=>c.id==='luckWeight')!;
    expect(sliderView(luck,custom)).toMatchObject({custom:true,position:10,exact:25});
    // Moving another slider leaves the custom values exact.
    const moved=setPreference(custom,PREFERENCE_CONTROLS.find(c=>c.id==='recoveryWeight')!,3);
    expect(moved.settings.zoneWeight).toBe(.65);
    expect(moved.settings.luckWeight).toBe(2.5);
  });
  it('resets only the selected section',()=>{
    const custom={...data(),settings:{...data().settings,zoneWeight:.65,drinkPriority:1},vehicleSettings:{...data().vehicleSettings,speedWeight:3}};
    const reset=resetPreferenceSection(custom,'Auctions');
    expect(reset.settings.zoneWeight).toBe(s.zoneWeight);
    expect(reset.settings.drinkPriority).toBe(1);
    expect(reset.vehicleSettings.speedWeight).toBe(3);
  });
  it('Luck and Arrow sliders change the Main Auction trio',()=>{
    const items=[gear('lucky','Head',{luck:40}),gear('arrow','Head',{arrowReduction:30}),gear('b','Back'),gear('w','Wrist')];
    const pick=(settings:AlgorithmSettings)=>buildGearLoadouts(items,settings).main!.head.id;
    expect(pick(s)).toBe('lucky');
    expect(pick({...s,luckWeight:0})).toBe('arrow');
    expect(pick({...s,arrowWeight:0})).toBe('lucky');
  });
  it('a specialist priority of 0 removes its loadout and its retention protection consistently',()=>{
    const energy=gear('energy','Head',{energy:40});
    const main=gear('main','Head',{luck:100});
    const items=[energy,main,gear('b','Back'),gear('w','Wrist')];
    expect(buildGearLoadouts(items,s).drink?.head.id).toBe('energy');
    expect(verdictOf(items,'energy')).toBe('KEEP');
    const ignore={...s,drinkPriority:0};
    expect(buildGearLoadouts(items,ignore).drink).toBeUndefined();
    expect(verdictOf(items,'energy',ignore)).toBe('SAFE TO DISCARD');
  });
  it('Shop sliders change the Shop / Idle trio',()=>{
    const items=[gear('tip','Head',{tip:10}),gear('npc','Head',{npc:12}),gear('b','Back'),gear('w','Wrist')];
    const pick=(settings:AlgorithmSettings)=>buildGearLoadouts(items,settings).shop?.head.id;
    expect(pick(s)).toBe('tip'); // 10 x 0.4 > 12 x 0.3
    expect(pick({...s,shopTipWeight:.1})).toBe('npc');
    expect(pick({...s,shopPriority:0})).toBeUndefined();
  });
  it('Vehicle sliders change the vehicle setup and its retention',()=>{
    const d=makeEmptyData();
    const now='';
    const fast={id:'fast',baseName:'Fast',name:'Fast',slot:'Spoiler' as const,speedPct:30,accelerationPct:0,handlingPct:0,capacityKg:0,favourite:false,createdAt:now,updatedAt:now};
    const heavy={...fast,id:'heavy',baseName:'Heavy',name:'Heavy',speedPct:0,capacityKg:400};
    const parts=[fast,heavy];
    const best=(settings:typeof d.vehicleSettings)=>optimiseVehicle(parts,[],d.vehicleProfile,settings,1)[0].spoiler?.id;
    expect(best({...d.vehicleSettings,capacityWeight:0})).toBe('fast');
    expect(best({...d.vehicleSettings,speedWeight:0})).toBe('heavy');
    const speedOnly={...d.vehicleSettings,capacityWeight:0,accelerationWeight:0,handlingWeight:0};
    const analysis=analyseVehicleParts(parts,optimiseVehicle(parts,[],d.vehicleProfile,speedOnly,1)[0],speedOnly);
    expect(analysis.find(a=>a.item.id==='heavy')!.verdict).toBe('SAFE TO DISCARD');
    expect(analyseVehicleParts(parts,optimiseVehicle(parts,[],d.vehicleProfile,d.vehicleSettings,1)[0],d.vehicleSettings).every(a=>a.verdict!=='SAFE TO DISCARD')).toBe(true);
    const trailers=[{id:'t1',name:'Small',capacityKg:100,favourite:false,createdAt:now,updatedAt:now},{id:'t2',name:'Big',capacityKg:600,favourite:false,createdAt:now,updatedAt:now}];
    expect(analyseTrailers(trailers,undefined,speedOnly).every(a=>a.verdict==='KEEP')).toBe(true);
  });
  it('Gavel slots control how many trophies are equipped',()=>{
    const d=makeInitialData();
    expect(optimiseTrophies(d.trophies,{...d.trophySettings,maxActive:3})[0]?.trophies.length??0).toBeLessThanOrEqual(3);
  });
  it('Arrow band is consistent across Main, retention and standalone scoring',()=>{
    const at65=gear('a65','Head',{arrowReduction:65}),at85=gear('a85','Head',{arrowReduction:85});
    const back=gear('b','Back'),wrist=gear('w','Wrist');
    expect(mainAuctionUtility([at65,back,wrist],s)).toBeCloseTo(mainAuctionUtility([at85,back,wrist],s),8);
    expect(scoreStandalone(at65,s).total).toBeCloseTo(scoreStandalone(at85,s).total,8);
    // 85% alone is not worse than 65%, but with a future complementary Arrow piece 65% can be better: both are kept.
    expect(verdictOf([at65,at85,back,wrist],'a85')).not.toBe('SAFE TO DISCARD');
  });
});

describe('loadout evaluator optimisation is exact',()=>{
  // Reference: recompute everything and fully sort (Arrow band first, then score).
  function reference(items:GearItem[],settings:AlgorithmSettings,utility:(trio:GearItem[])=>number){
    const heads=items.filter(g=>g.slot==='Head'),backs=items.filter(g=>g.slot==='Back'),wrists=items.filter(g=>g.slot==='Wrist');
    const trios:GearItem[][]=[];for(const h of heads)for(const b of backs)for(const w of wrists)trios.push([h,b,w]);
    const tier=(t:GearItem[])=>t.reduce((n,i)=>n+effectiveItemStats(i).arrowReduction,0)>=settings.arrowSweetSpot?1:0;
    const scored=trios.map(t=>({t,tier:tier(t),u:utility(t),main:mainAuctionUtility(t,settings,'Neutral','low')}));
    scored.sort((a,b)=>b.tier-a.tier||b.u-a.u||b.main-a.main||a.t.map(x=>x.id).join('|').localeCompare(b.t.map(x=>x.id).join('|')));
    const best=scored[0];
    const tied=scored.filter(x=>x.tier===best.tier&&Math.abs(x.u-best.u)<=1e-9&&Math.abs(x.main-best.main)<=1e-9);
    return {ids:best.t.map(x=>x.id),u:best.u,tied:[...new Set(tied.flatMap(x=>x.t.map(i=>i.id)))].sort()};
  }
  let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const pick=<T,>(xs:T[])=>xs[Math.floor(rand()*xs.length)];
  it('matches the full-sort reference on random inventories, including ties',()=>{
    for(let run=0;run<60;run++){
      const items:GearItem[]=[];
      for(const slot of ['Head','Back','Wrist'] as Slot[])for(let i=0;i<1+Math.floor(rand()*4);i++){
        const effect=pick(['','','Sunny','Raindrop','Grade Re-Roll','Mutated Luck']);
        items.push({...gear(`${slot}-${run}-${i}`,slot,{luck:pick([0,10,20]),arrowReduction:pick([0,30,70]),zone:pick([0,15]),energy:pick([0,20,60]),tip:pick([0,5]),npc:pick([0,6])},effect,pick([10,20]),effect==='Grade Re-Roll'?'Limited':effect==='Mutated Luck'?'Premium':'Normal'),mutation:pick([undefined,'Gold'])});
      }
      const loadouts=buildGearLoadouts(items,s);
      const main=reference(items,s,t=>mainAuctionUtility(t,s,'Neutral','low'));
      expect([loadouts.main!.head.id,loadouts.main!.back.id,loadouts.main!.wrist.id]).toEqual(main.ids);
      expect(loadouts.main!.utility).toBe(main.u);
      expect([...loadouts.main!.tiedItemIds].sort()).toEqual(main.tied);
      const rain=reference(items,s,t=>mainAuctionUtility(t,s,'Rain','low'));
      expect([loadouts.rain!.head.id,loadouts.rain!.back.id,loadouts.rain!.wrist.id]).toEqual(rain.ids);
    }
  });
});

describe('existing physical certificates that share a variant',()=>{
  it('stay separately editable without a false duplicate error',()=>{
    const data=makeInitialData();
    const wooden=data.ownedCertificates.filter(c=>c.type==='Wooden Certificate of Authenticity');
    expect(wooden.length).toBeGreaterThan(1);
    const edited=updateCertificateBatch(data,wooden[0].id,{type:wooden[0].type,quantity:2,gradeStars:wooden[0].gradeStars});
    expect(edited.ownedCertificates.find(c=>c.id===wooden[0].id)).toMatchObject({quantity:2,displayedValue:wooden[0].displayedValue});
  });
});

describe('review: queue allocation never downgrades a higher-ranked row',()=>{
  it('keeps the strong certificate on the Auction target instead of trading it for a Shop row',()=>{
    const limited:OwnedCertificate={id:'L',type:'Limited Certificate of Authenticity',quantity:1};
    const woodenCert:OwnedCertificate={id:'W',type:'Wooden Certificate of Authenticity',quantity:1};
    const strongMain={...syntheticTarget('main-item','Main Auction',0,20),verdict:'USE'} as CertificateTargetDecision;
    const shop=syntheticTarget('shop-item','Shop / Idle',5,.5);
    const weakMain=syntheticTarget('main-item','Main Auction',0,1);
    const queue=buildCertificateQueue([decision(limited,[strongMain,shop]),decision(woodenCert,[weakMain])]);
    expect(queue.rows[0]).toMatchObject({certificate:{id:'L'},target:{item:{id:'main-item'}}});
    expect(queue.rows.some(r=>r.certificate.id==='L'&&r.target.item.id==='shop-item')).toBe(false);
  });
  it('still re-routes between equally good certificates to fill more rows',()=>{
    const a=syntheticTarget('target-a','Main Auction',0,5),b=syntheticTarget('target-b','Main Auction',0,3);
    const queue=buildCertificateQueue([decision(wooden('w1',1),[a,b]),decision(wooden('w2',1),[a])]);
    expect(queue.rows.map(r=>r.target.item.id).sort()).toEqual(['target-a','target-b']);
  });
});

describe('review: Arrow slider label follows the stored band',()=>{
  it('reflects a customised band start',()=>{
    const control=PREFERENCE_CONTROLS.find(c=>c.id==='arrowWeight')!;
    expect(control.labelFor!(makeInitialData())).toBe('Bid Arrow below 65%');
    const d=makeInitialData();d.settings.arrowSweetSpot=70;
    expect(control.labelFor!(d)).toBe('Bid Arrow below 70%');
  });
});

describe('Main Auction: reach the Arrow band first, then Luck',()=>{
  const items=()=>[
    gear('luck-back','Back',{luck:120}),gear('arrow-back','Back',{arrowReduction:40}),
    gear('head','Head',{luck:100}),gear('wrist','Wrist',{luck:50,arrowReduction:32})
  ];
  it('picks the set that reaches 65% even when another set has far more Luck',()=>{
    for(const luckWeight of [1,.3,.01]){
      const main=buildGearLoadouts(items(),{...s,luckWeight}).main!;
      expect(main.back.id).toBe('arrow-back');
      expect(main.arrowTier).toBe(1);
      expect(main.stats.arrowReduction).toBe(72);
    }
  });
  it('then maximises Luck among the sets that reach the band',()=>{
    const extra=[...items(),gear('arrow-luck-back','Back',{arrowReduction:40,luck:30})];
    expect(buildGearLoadouts(extra,s).main!.back.id).toBe('arrow-luck-back');
  });
  it('falls back to the weighted score when no set can reach the band',()=>{
    const unreachable=[gear('luck-back','Back',{luck:120}),gear('arrow-back','Back',{arrowReduction:20}),gear('head','Head',{luck:100}),gear('wrist','Wrist',{luck:50,arrowReduction:32})];
    expect(buildGearLoadouts(unreachable,s).main!.back.id).toBe('luck-back');
    expect(buildGearLoadouts(unreachable,{...s,luckWeight:.1}).main!.back.id).toBe('arrow-back');
  });
  it('applies to Day / Night / Rain sets too',()=>{
    const contextual=[...items(),gear('rain-back','Back',{luck:60},'Raindrop',100)];
    const loadouts=buildGearLoadouts(contextual,s);
    expect(loadouts.rain!.back.id).toBe('arrow-back');
  });
  it('never offers a band-enabling Arrow piece for discard',()=>{
    // Without the Arrow piece no set reaches the band.
    expect(verdictOf(items(),'arrow-back')).toBe('EQUIP');
    const spare=[...items(),gear('weaker-arrow','Back',{arrowReduction:39,luck:200})];
    expect(verdictOf(spare,'weaker-arrow')).not.toBe('SAFE TO DISCARD');
  });
  it('counts gaining the band as an improvement for certificates and losing it as a loss',()=>{
    const data=makeEmptyData();
    data.gear=[gear('head','Head',{luck:100}),gear('back','Back',{luck:120}),gear('wrist','Wrist',{luck:50,arrowReduction:32})];
    data.authModel=data.authModel.map(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'
      ?{...m,enabled:m.outcome==='Bid Arrow Speed',min:-40,max:-40}:m);
    const cert:OwnedCertificate={id:'w',type:'Wooden Certificate of Authenticity',quantity:1};
    const target=analyseCertificate(data,cert).targets.find(t=>t.item.id==='head')!;
    // Every roll gives -40% Arrow: 32 + 40 = 72% reaches the band, despite replacing no Luck.
    expect(target.chanceOfImprovementPct).toBeGreaterThan(99);
    expect(target.expectedImprovementPct).toBeGreaterThanOrEqual(99);
    expect(['USE','CONSIDER']).toContain(target.verdict);
    expect(target.decisionBasis).toBe('Main Auction');

    // Rerolling the authentication that holds the band can only lose it.
    const holding=makeEmptyData();
    holding.gear=[gear('head','Head',{luck:100},'Bid Arrow Speed',-40),gear('back','Back',{luck:120}),gear('wrist','Wrist',{luck:50,arrowReduction:32})];
    holding.authModel=holding.authModel.map(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'
      ?{...m,enabled:m.outcome==='Bid Recovery',min:20,max:25}:m);
    const risky=analyseCertificate(holding,cert).targets.find(t=>t.item.id==='head')!;
    expect(risky.chanceMainWorsePct).toBeGreaterThan(99);
    expect(risky.verdict).toBe('DO NOT USE');
  });
});

describe('weights as percentages adding up to 100',()=>{
  it('reports exact shares and whole-number shares that total 100',()=>{
    const d=makeInitialData();
    const shares=weightShares(d,'auction');
    expect(shares.reduce((a,b)=>a+b,0)).toBeCloseTo(100,9);
    expect(shares[0]).toBeCloseTo(100/2.8,9); // Luck 1 of 1 + 1 + 0.6 + 0.2
    expect(roundedShares(shares).reduce((a,b)=>a+b,0)).toBe(100);
    expect(roundedShares([33.4,33.3,33.3])).toEqual([34,33,33]);
    expect(roundedShares([0,0])).toEqual([0,0]);
  });
  it('setting one share rebalances the rest proportionally and keeps the group size',()=>{
    const d=makeInitialData();
    const next=setWeightShare(d,'shop','shopTipWeight',25);
    const [tip,npc]=weightShares(next,'shop');
    expect(tip).toBeCloseTo(25,9);expect(npc).toBeCloseTo(75,9);
    expect(next.settings.shopTipWeight+next.settings.shopNpcWeight).toBeCloseTo(.7,9); // native Shop thresholds keep their scale
    const vehicle=setWeightShare(d,'vehicle','capacityWeight',100);
    expect(weightShares(vehicle,'vehicle').map(x=>Math.round(x))).toEqual([100,0,0,0]);
    expect(weightShares(setWeightShare(vehicle,'vehicle','speedWeight',40),'vehicle').map(x=>Math.round(x))).toEqual([60,40,0,0]);
    // When every other weight is zero, the rest is shared equally.
    expect(weightShares(setWeightShare(vehicle,'vehicle','capacityWeight',40),'vehicle').map(x=>Math.round(x))).toEqual([40,20,20,20]);
  });
  it('drives the engines the same way as the raw coefficients',()=>{
    const items=[gear('tip','Head',{tip:10}),gear('npc','Head',{npc:12}),gear('b','Back'),gear('w','Wrist')];
    const d=makeInitialData();
    expect(buildGearLoadouts(items,setWeightShare(d,'shop','shopTipWeight',80).settings).shop?.head.id).toBe('tip');
    expect(buildGearLoadouts(items,setWeightShare(d,'shop','shopTipWeight',20).settings).shop?.head.id).toBe('npc');
  });
});
