import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, ZERO_STATS } from '../defaults';
import { analyseGearRetention, arrowDistance, buildGearLoadouts, inArrowBand } from './gearLoadouts';
import { optimise } from './optimizer';
import type { GearItem, GearStats, Slot } from '../types';

function gear(id:string,slot:Slot,stats:Partial<GearStats>={}):GearItem {
  return {id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:false,
    authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''};
}
const s=LOCKED_DEFAULT_SETTINGS;
const main=(items:GearItem[])=>buildGearLoadouts(items,s).main!;

describe('Bid Arrow band 70-90%',()=>{
  it('defaults to an explicit 70-90% band',()=>{
    expect([s.arrowTargetMin,s.arrowTargetMax]).toEqual([70,90]);
  });

  it('includes both edges: 69 and 91 are out, 70 and 90 are in',()=>{
    expect([69,70,75,80,85,90,91].map(r=>inArrowBand({arrowReduction:r},s))).toEqual([false,true,true,true,true,true,false]);
    expect(arrowDistance({arrowReduction:69},s)).toBeCloseTo(1);
    expect(arrowDistance({arrowReduction:91},s)).toBeCloseTo(1);
  });

  it('does not prefer 90 over 70 for the Arrow alone',()=>{
    const items=[gear('h70','Head',{arrowReduction:70,luck:1}),gear('h90','Head',{arrowReduction:90}),gear('b','Back'),gear('w','Wrist')];
    expect(main(items).head.id).toBe('h70');
  });

  it('picks 75% with more Luck over 89% with less',()=>{
    const items=[gear('h75','Head',{arrowReduction:75,luck:60}),gear('h89','Head',{arrowReduction:89,luck:40}),gear('b','Back'),gear('w','Wrist')];
    expect(main(items).head.id).toBe('h75');
    expect(optimise(items,s,1)[0].head.id).toBe('h75');
  });

  it('prefers 85% to 91% even when 91% has far more Luck',()=>{
    const items=[gear('h85','Head',{arrowReduction:85}),gear('h91','Head',{arrowReduction:91,luck:300}),gear('b','Back'),gear('w','Wrist')];
    expect(main(items).head.id).toBe('h85');
  });

  it('treats 69% and 91% as equally far from the band, so other stats decide',()=>{
    const low=[gear('h69','Head',{arrowReduction:69,luck:50}),gear('h91','Head',{arrowReduction:91,luck:10}),gear('b','Back'),gear('w','Wrist')];
    expect(main(low).head.id).toBe('h69');
    const high=[gear('h69','Head',{arrowReduction:69,luck:10}),gear('h91','Head',{arrowReduction:91,luck:50}),gear('b','Back'),gear('w','Wrist')];
    expect(main(high).head.id).toBe('h91');
  });

  it('does not let 110% beat 69%',()=>{
    const items=[gear('h69','Head',{arrowReduction:69}),gear('h110','Head',{arrowReduction:110,luck:200}),gear('b','Back'),gear('w','Wrist')];
    expect(main(items).head.id).toBe('h69');
  });

  it('gives Arrow top priority below the band',()=>{
    const items=[gear('h60','Head',{arrowReduction:60,luck:500}),gear('h70','Head',{arrowReduction:70}),gear('b','Back'),gear('w','Wrist')];
    expect(main(items).head.id).toBe('h70');
  });

  it('redistributes Arrow across the trio to free a slot for other stats',()=>{
    // Current-style set: 35 + 30 + 15 = 80. Alternative: a Luck Head with 0 Arrow, Back 40 + Wrist 35 = 75.
    const items=[
      gear('arrowHead','Head',{arrowReduction:35}),gear('luckHead','Head',{luck:60}),
      gear('back30','Back',{arrowReduction:30}),gear('back40','Back',{arrowReduction:40}),
      gear('wrist15','Wrist',{arrowReduction:15}),gear('wrist35','Wrist',{arrowReduction:35})
    ];
    const best=main(items);
    expect([best.head.id,best.back.id,best.wrist.id]).toEqual(['luckHead','back40','wrist35']);
    expect(best.stats.arrowReduction).toBe(75);
  });

  it('still values native Luck although plain Luck is no longer a certificate roll',()=>{
    const items=[gear('lucky','Head',{arrowReduction:70,luck:80}),gear('plain','Head',{arrowReduction:70,luck:20}),gear('b','Back'),gear('w','Wrist')];
    expect(main(items).head.id).toBe('lucky');
  });

  it('counts Energy in the auction set with diminishing returns and less weight than Zone',()=>{
    const items=[gear('energy','Head',{arrowReduction:70,energy:30}),gear('zone','Head',{arrowReduction:70,zone:30}),gear('none','Head',{arrowReduction:70}),gear('b','Back'),gear('w','Wrist')];
    expect(main(items).head.id).toBe('zone');
    expect(main(items.filter(g=>g.id!=='zone')).head.id).toBe('energy');
    expect(s.energyWeight).toBeLessThan(s.zoneWeight);
  });

  it('never discards a lower-Arrow item in favour of a higher-Arrow one that would overshoot the band',()=>{
    // The main set is best + back70 (70%). Beside back55, only low keeps a set in band (75%):
    // high would overshoot (95%) and best would fall short (55%). More Arrow is not "better".
    const items=[gear('best','Head',{luck:100}),gear('low','Head',{arrowReduction:20,luck:10}),gear('high','Head',{arrowReduction:40,luck:20}),
      gear('back70','Back',{arrowReduction:70}),gear('back55','Back',{arrowReduction:55}),gear('w','Wrist')];
    const verdict=(id:string,list=items)=>analyseGearRetention(list,s).find(a=>a.item.id===id)!.verdict;
    expect(verdict('low')).not.toBe('SAFE TO DISCARD');
    // With the same Arrow, a better item still proves redundancy.
    const twin=[...items,gear('lowTwin','Head',{arrowReduction:20,luck:15})];
    expect(verdict('low',twin)).toBe('SAFE TO DISCARD');
  });
});
