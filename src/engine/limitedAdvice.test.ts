import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeInitialData } from '../defaults';
import type { AuthKind, GearItem, GearStats, Slot } from '../types';
import { assessLimitedUpgrades, LIMITED_PASSIVE_PROFILES } from './limitedAdvice';

function gear(id:string,slot:Slot,luck:number,auth?:{kind:AuthKind;effect:string;value:number},favourite=false):GearItem{
  const stats:GearStats={luck,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0};
  return {id,baseName:id,name:id,slot,stats,authenticated:Boolean(auth),authentication:auth??{kind:'None',effect:'',value:0},favourite,
    createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z'};
}

describe('Limited certificate advice',()=>{
  it('uses the confirmed six slot-locked outcomes and qualitative ranking',()=>{
    expect(LIMITED_PASSIVE_PROFILES.Back.map(x=>[x.effect,x.tier,x.overallRank])).toEqual([
      ['Luck Frenzy','S',1],['Featherweight','A',4]
    ]);
    expect(LIMITED_PASSIVE_PROFILES.Head.map(x=>x.effect)).toEqual(['Auto X-Ray','Grade Re-Roll']);
    expect(LIMITED_PASSIVE_PROFILES.Wrist.map(x=>x.effect)).toEqual(['Second Chance','Steady Hand']);
    expect(LIMITED_PASSIVE_PROFILES.Wrist.find(x=>x.effect==='Second Chance')?.overallRank).toBe(5);
    expect(LIMITED_PASSIVE_PROFILES.Wrist.find(x=>x.effect==='Steady Hand')?.overallRank).toBe(6);
  });

  it('prioritises Back then Head then Wrist for equally strong clean gear',()=>{
    const items=[gear('H','Head',50),gear('B','Back',50),gear('W','Wrist',50)];
    const ranked=assessLimitedUpgrades(items,LOCKED_DEFAULT_SETTINGS).filter(x=>x.verdict==='CONSIDER LIMITED');
    expect(ranked.map(x=>x.item.id)).toEqual(['B','H','W']);
  });

  it('protects Premium, Limited and dynamic authentications from replacement',()=>{
    const base=[gear('H','Head',50),gear('B','Back',50),gear('W','Wrist',50)];
    for(const auth of [
      {kind:'Premium' as const,effect:'Mutated Luck',value:0},
      {kind:'Limited' as const,effect:'Auto X-Ray',value:10},
      {kind:'Normal' as const,effect:'Nocturnal',value:35}
    ]){
      const items=base.map(x=>x.id==='H'?gear('H','Head',50,auth):x);
      const advice=assessLimitedUpgrades(items,LOCKED_DEFAULT_SETTINGS).find(x=>x.item.id==='H')!;
      expect(['PROTECT ENCHANTMENT','ALREADY LIMITED']).toContain(advice.verdict);
    }
  });

  it('ranks the current inventory with Elegant Business Backpack as the first clean Limited target',()=>{
    const data=makeInitialData();
    const advice=assessLimitedUpgrades(data.gear,data.settings);
    const first=advice.find(x=>x.verdict==='CONSIDER LIMITED');
    expect(first?.item.baseName).toBe('Elegant Business Backpack');

    const cleanHead=advice.filter(x=>x.item.slot==='Head'&&x.verdict==='CONSIDER LIMITED')[0];
    expect(cleanHead?.item.baseName).toBe('Steampunk Goggle');
    expect(cleanHead?.item.mutation).toBe('Chrome');

    const cleanWrist=advice.filter(x=>x.item.slot==='Wrist'&&x.verdict==='CONSIDER LIMITED')[0];
    expect(cleanWrist?.item.baseName).toBe('Autumn Fox Wristband');
  });
});
