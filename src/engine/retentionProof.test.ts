import { expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS as settings, makeInitialData, ZERO_STATS } from '../defaults';
import type { GearItem, GearStats, Slot } from '../types';
import { analyseGearRetention, buildGearLoadouts, RETENTION_DYNAMIC_STATES } from './gearLoadouts';
function gear(id:string,slot:Slot,stats:Partial<GearStats>={}):GearItem {
  return {id,name:id,baseName:id,slot,stats:{...ZERO_STATS,...stats},authenticated:false,
    authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''};
}
it('keeps a Luck alternative that wins when a future companion saturates Energy',()=>{
  const items=[gear('energy','Head',{energy:100}),gear('luck','Head',{luck:10}),gear('back','Back',{arrowReduction:70}),gear('wrist','Wrist')];
  const future=gear('future','Back',{energy:50,arrowReduction:70});
  expect(buildGearLoadouts([...items,future],settings).main?.head.id).toBe('luck');
  expect(analyseGearRetention(items,settings).find(x=>x.item.id==='luck')?.verdict).toBe('KEEP');
});
it.each([{arrow:0,id:'verified-20261026-head-race-valk'},{arrow:23,id:'verified-20261101-3'}])('keeps the short future Arrow role at $arrow',({arrow,id})=>{
  const d=makeInitialData();
  const added=[...d.gear,gear('future','Wrist',{luck:200,arrowReduction:arrow})];
  expect(buildGearLoadouts(added,d.settings).main?.head.id).toBe(id);
  expect(analyseGearRetention(d.gear,d.settings).find(x=>x.item.id===id)?.verdict).toBe('KEEP');
});
it('retains all current contextual and dynamic optima when discards are removed together',()=>{
  const d=makeInitialData(),a=analyseGearRetention(d.gear,d.settings);
  const kept=d.gear.filter(x=>a.find(r=>r.item.id===x.id)?.verdict!=='SAFE TO DISCARD');
  for(const state of RETENTION_DYNAMIC_STATES){
    const before=buildGearLoadouts(d.gear,d.settings,state),after=buildGearLoadouts(kept,d.settings,state);
    for(const key of ['main','day','night','rain'] as const){
      expect(after[key]?.utility).toBe(before[key]?.utility);
      expect(after[key]?.arrowDistance).toBe(before[key]?.arrowDistance);
    }
  }
});

it('keeps a higher-mutation alternative for future Mutated Luck companions',()=>{
  const mutated={...gear('mutated','Back',{luck:10}),mutation:'Onyx'};
  const items=[gear('head','Head',{arrowReduction:70}),gear('strong','Back',{luck:11}),mutated,gear('wrist','Wrist')];
  expect(analyseGearRetention(items,settings).find(x=>x.item.id==='mutated')?.verdict).toBe('KEEP');
});
it('does not use an unknown candidate to certify disposal',()=>{
  const unknown={...gear('unknown','Head',{luck:100}),authenticated:true,authentication:{kind:'Normal' as const,effect:'Focused',value:0}};
  const items=[unknown,gear('ordinary','Head',{luck:10}),gear('back','Back',{arrowReduction:70}),gear('wrist','Wrist')];
  expect(analyseGearRetention(items,settings).find(x=>x.item.id==='ordinary')?.verdict).toBe('KEEP');
});
it('keeps base Arrow alternatives when numeric authentication would be overwritten',()=>{
  const numeric={...gear('numeric','Head',{luck:20,arrowReduction:60}),authenticated:true,authentication:{kind:'Normal' as const,effect:'Bid Arrow Speed',value:-10}};
  const items=[numeric,gear('base','Head',{luck:10,arrowReduction:70}),gear('back','Back'),gear('wrist','Wrist')];
  expect(analyseGearRetention(items,settings).find(x=>x.item.id==='base')?.verdict).toBe('KEEP');
});
it('batch deletion leaves the maximal member of a strict same-slot replacement chain',()=>{
  const items=[gear('one','Head',{luck:1}),gear('two','Head',{luck:2}),gear('three','Head',{luck:3}),gear('back','Back',{arrowReduction:70}),gear('wrist','Wrist')];
  const a=analyseGearRetention(items,settings);
  expect(a.filter(x=>x.verdict==='SAFE TO DISCARD').map(x=>x.item.id).sort()).toEqual(['one','two']);
  const survivors=items.filter(x=>a.find(r=>r.item.id===x.id)?.verdict!=='SAFE TO DISCARD');
  expect(buildGearLoadouts(survivors,settings).main?.utility).toBe(buildGearLoadouts(items,settings).main?.utility);
});
it('keeps native Back stats that a future certificate would otherwise erase from the replacement',()=>{
  const native=gear('native','Back',{luck:10,energy:50});
  const numeric={...gear('numeric-back','Back',{luck:11}),authenticated:true,
    authentication:{kind:'Normal' as const,effect:'Energy Drink Time',value:50}};
  const items=[gear('head','Head',{arrowReduction:70}),native,numeric,gear('wrist','Wrist')];
  expect(analyseGearRetention(items,settings).find(x=>x.item.id==='native')?.verdict).toBe('KEEP');
});
