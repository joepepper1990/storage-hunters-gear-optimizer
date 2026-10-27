import { describe, expect, it } from 'vitest';
import { DEFAULT_TROPHY_SETTINGS, LOCKED_DEFAULT_SETTINGS, makeInitialData, ZERO_STATS } from '../defaults';
import { analyseGearRetention } from './gearLoadouts';
import { analyseTrophyRetention } from './trophies';
import type { GavelTrophy, GearItem, GearStats, Slot } from '../types';

function gear(id:string,slot:Slot,stats:Partial<GearStats>={}):GearItem {
  return {id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:false,
    authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''};
}
function gavel(id:string,rolls:Array<[string,number]>):GavelTrophy {
  return {id,name:id,modifiers:rolls.map(([mutation,boostPct])=>({mutation,boostPct})),favourite:false,createdAt:'',updatedAt:''};
}
const s=LOCKED_DEFAULT_SETTINGS;
const gearVerdict=(items:GearItem[],id:string,settings=s)=>analyseGearRetention(items,settings).find(a=>a.item.id===id)!.verdict;
// The Head filler alone reaches the Arrow band, so it fills the best set; having no other
// stat, it never dominates the items under test, which are judged only against each other.
const filler=[gear('main','Head',{arrowReduction:70}),gear('b','Back'),gear('w','Wrist')];

describe('gear is discarded only when beaten stat by stat',()=>{
  it('keeps an item that is better on one weighted stat, however much Luck the other has',()=>{
    const zone=gear('zone','Head',{luck:10,zone:12});
    const lucky=gear('lucky','Head',{luck:60});
    expect(gearVerdict([...filler,zone,lucky],'zone')).not.toBe('SAFE TO DISCARD');
  });
  it('discards an item beaten or matched on every stat and beaten on one',()=>{
    const weaker=gear('weaker','Head',{luck:53,arrowReduction:31});
    const better=gear('better','Head',{luck:58,arrowReduction:35});
    expect(gearVerdict([...filler,weaker,better],'weaker')).toBe('SAFE TO DISCARD');
    expect(gearVerdict([...filler,weaker,better],'better')).not.toBe('SAFE TO DISCARD');
  });
  it('ignores a stat whose importance is 0',()=>{
    const zone=gear('zone','Head',{luck:10,zone:12});
    const lucky=gear('lucky','Head',{luck:60});
    expect(gearVerdict([...filler,zone,lucky],'zone',{...s,zoneWeight:0})).toBe('SAFE TO DISCARD');
  });
  it('never discards an exact duplicate on the strength of its twin',()=>{
    const a=gear('a','Head',{luck:40}),b=gear('b2','Head',{luck:40});
    const verdicts=[a,b].map(x=>gearVerdict([...filler,a,b],x.id));
    expect(verdicts).not.toContain('SAFE TO DISCARD');
  });
});

describe('Gavels are discarded only when beaten boost by boost',()=>{
  const settings={...DEFAULT_TROPHY_SETTINGS,maxActive:3 as const};
  const top=[gavel('t1',[['Void',300]]),gavel('t2',[['Void',290]]),gavel('t3',[['Void',280]]),gavel('t4',[['Void',270]])];
  const verdict=(items:GavelTrophy[],id:string)=>analyseTrophyRetention(items,settings).find(a=>a.item.id===id)!.verdict;
  it('discards a Gavel outside every best set that another beats on its only boost',()=>{
    const tiny=[30,29,28,27].map((boost,i)=>gavel('tiny'+i,[['Tiny',boost]]));
    expect(verdict([...top,...tiny],'tiny3')).toBe('SAFE TO DISCARD');
    expect(verdict([...top,...tiny],'tiny0')).not.toBe('SAFE TO DISCARD');
  });
  it('keeps a Gavel that is better on one of its boosts than every other Gavel',()=>{
    const mixed=[...top,
      gavel('a',[['Gold',40],['Silver',10]]),gavel('b',[['Gold',50]]),gavel('c',[['Gold',45]]),gavel('d',[['Gold',44]]),gavel('e',[['Gold',43]]),
      gavel('s1',[['Silver',20]]),gavel('s2',[['Silver',19]]),gavel('s3',[['Silver',18]]),gavel('s4',[['Silver',17]])];
    // 'a' is below the top Gold and Silver sets, but no single Gavel has both its Gold and Silver.
    expect(verdict(mixed,'a')).toBe('KEEP');
    // 'e' is beaten on its only boost by 'b'.
    expect(verdict(mixed,'e')).toBe('SAFE TO DISCARD');
  });
  it('does not let a switched-off mutation save a Gavel',()=>{
    const off={...settings,mutationWeights:settings.mutationWeights.map(w=>w.mutation==='Silver'?{...w,enabled:false}:w)};
    const items=[...top,gavel('a',[['Gold',40],['Silver',10]]),gavel('b',[['Gold',50]]),gavel('c',[['Gold',45]]),gavel('d',[['Gold',44]]),gavel('e',[['Gold',43]])];
    expect(analyseTrophyRetention(items,off).find(x=>x.item.id==='a')!.verdict).toBe('SAFE TO DISCARD');
  });
});

describe('the verified inventory',()=>{
  it('has no exact duplicate gear or Gavels',()=>{
    const d=makeInitialData();
    const gearKey=(g:GearItem)=>JSON.stringify([g.slot,g.baseName,g.stats,g.authentication.effect,g.authentication.value]);
    expect(new Set(d.gear.map(gearKey)).size).toBe(d.gear.length);
    const gavelKey=(t:GavelTrophy)=>t.modifiers.map(m=>m.mutation+m.boostPct).sort().join('|');
    expect(new Set(d.trophies.map(gavelKey)).size).toBe(d.trophies.length);
  });
});
