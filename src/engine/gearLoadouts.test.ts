import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeInitialData } from '../defaults';
import type { GearItem, GearStats, Slot } from '../types';
import { analyseGearRetention, buildGearLoadouts, mainAuctionUtility } from './gearLoadouts';
import { optimise } from './optimizer';

const now='2026-10-26T00:00:00Z';
function g(id:string,slot:Slot,stats:Partial<GearStats>,auth?:GearItem['authentication'],mutation='None',favourite=false):GearItem{
  return {
    id,baseName:id,name:id,slot,mutation,
    stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},
    authenticated:Boolean(auth),authentication:auth??{kind:'None',effect:'',value:0},
    favourite,createdAt:now,updatedAt:now
  };
}

describe('unified gear loadouts and retention',()=>{
  it('allows the same physical item to be used by multiple loadouts',()=>{
    const shared=g('Shared','Back',{luck:100,energy:100,tip:30,npc:30});
    const gear=[g('H','Head',{luck:100}),shared,g('W','Wrist',{luck:100})];
    const loadouts=buildGearLoadouts(gear,LOCKED_DEFAULT_SETTINGS);
    expect(loadouts.main?.back.id).toBe('Shared');
    expect(loadouts.drink?.back.id).toBe('Shared');
    expect(loadouts.shop?.back.id).toBe('Shared');
    const analysis=analyseGearRetention(gear,LOCKED_DEFAULT_SETTINGS).find(a=>a.item.id==='Shared')!;
    expect(analysis.verdict).toBe('EQUIP');
    expect(analysis.loadoutMemberships.map(m=>m.loadout)).toEqual(expect.arrayContaining(['Main Auction','Drink Prep','Shop / Idle']));
  });

  it('keeps a specialist-only item even when it is not part of Main Auction',()=>{
    const mainBack=g('MainBack','Back',{luck:120});
    const drinkBack=g('DrinkBack','Back',{energy:100});
    const gear=[g('H','Head',{luck:100}),mainBack,drinkBack,g('W','Wrist',{luck:100})];
    const loadouts=buildGearLoadouts(gear,LOCKED_DEFAULT_SETTINGS);
    expect(loadouts.main?.back.id).toBe('MainBack');
    expect(loadouts.drink?.back.id).toBe('DrinkBack');
    const analysis=analyseGearRetention(gear,LOCKED_DEFAULT_SETTINGS).find(a=>a.item.id==='DrinkBack')!;
    expect(analysis.verdict).toBe('KEEP');
    expect(analysis.loadoutMemberships.some(m=>m.loadout==='Drink Prep')).toBe(true);
  });

  it('does not create a fake Grading loadout when no Grade Re-Roll exists',()=>{
    const gear=[g('H','Head',{luck:100}),g('B','Back',{luck:100}),g('W','Wrist',{luck:100})];
    const loadouts=buildGearLoadouts(gear,LOCKED_DEFAULT_SETTINGS);
    expect(loadouts.grading).toBeUndefined();
    expect(analyseGearRetention(gear,LOCKED_DEFAULT_SETTINGS).every(a=>!a.loadoutMemberships.some(m=>m.loadout==='Grading'))).toBe(true);
  });

  it('uses Main Auction quality to break irrelevant specialist-slot ties',()=>{
    const grading=g('GradeHead','Head',{}, {kind:'Limited',effect:'Grade Re-Roll',value:25});
    const strongBack=g('StrongBack','Back',{luck:100});
    const weakBack=g('WeakBack','Back',{});
    const strongWrist=g('StrongWrist','Wrist',{luck:100});
    const weakWrist=g('WeakWrist','Wrist',{});
    const gear=[grading,strongBack,weakBack,strongWrist,weakWrist];
    const loadouts=buildGearLoadouts(gear,LOCKED_DEFAULT_SETTINGS);
    expect(loadouts.grading?.head.id).toBe('GradeHead');
    expect(loadouts.grading?.back.id).toBe('StrongBack');
    expect(loadouts.grading?.wrist.id).toBe('StrongWrist');
    const retention=analyseGearRetention(gear,LOCKED_DEFAULT_SETTINGS);
    expect(retention.find(a=>a.item.id==='WeakBack')?.loadoutMemberships.some(m=>m.loadout==='Grading')).toBe(false);
    expect(retention.find(a=>a.item.id==='WeakWrist')?.loadoutMemberships.some(m=>m.loadout==='Grading')).toBe(false);
  });

  it('does not protect F-tier Connected merely because friend count is unknown',()=>{
    const weak=g('Weak','Wrist',{}, {kind:'Normal',effect:'Connected',value:2});
    const strong=g('Strong','Wrist',{luck:100});
    const gear=[g('H','Head',{luck:100}),g('B','Back',{luck:100}),weak,strong];
    const result=analyseGearRetention(gear,LOCKED_DEFAULT_SETTINGS).find(a=>a.item.id==='Weak')!;
    expect(result.verdict).not.toBe('PROTECTED / UNKNOWN');
  });

  it('does not auto-protect the four previously stale authenticated inventory items',()=>{
    const data=makeInitialData();
    const analyses=analyseGearRetention(data.gear,data.settings);
    const ids=[
      'verified-20261026-head-reactor-fedora-a',
      'verified-20261026-back-dark-heart-b',
      'verified-20261026-wrist-jellyfish',
      'verified-20261026-wrist-reactor'
    ];
    for(const id of ids){
      expect(analyses.find(a=>a.item.id===id)?.verdict).not.toBe('PROTECTED / UNKNOWN');
    }
  });

  it('never marks a stateful dynamic item SAFE when static dominance cannot prove its mechanic',()=>{
    const dynamic=g('Dynamic','Back',{}, {kind:'Premium',effect:'Droughtbreaker',value:1});
    const strong=g('Strong','Back',{luck:100});
    const gear=[g('H','Head',{luck:100}),dynamic,strong,g('W','Wrist',{luck:100})];
    const result=analyseGearRetention(gear,LOCKED_DEFAULT_SETTINGS).find(a=>a.item.id==='Dynamic')!;
    expect(result.verdict).toBe('KEEP');
    expect(result.verdict).not.toBe('PROTECTED / UNKNOWN');
    expect(result.reason).toContain('state- or trio-dependent');
  });

  it('never marks an item SAFE TO DISCARD if it belongs to any relevant loadout',()=>{
    const data=makeInitialData();
    const analyses=analyseGearRetention(data.gear,data.settings);
    for(const analysis of analyses.filter(a=>a.verdict==='SAFE TO DISCARD')){
      expect(analysis.loadoutMemberships).toHaveLength(0);
    }
  });

  it('uses the same Main Auction evaluator as the top-combination optimiser',()=>{
    const data=makeInitialData();
    const best=optimise(data.gear,data.settings,1)[0]!;
    expect(best.score.total).toBeCloseTo(mainAuctionUtility([best.head,best.back,best.wrist],data.settings),10);
    const loadout=buildGearLoadouts(data.gear,data.settings).main!;
    expect([best.head.id,best.back.id,best.wrist.id]).toEqual([loadout.head.id,loadout.back.id,loadout.wrist.id]);
  });
  it('returns modelled dynamic Luck in the Main combination display stats',()=>{
    const h=g('H','Head',{luck:10},{kind:'Premium',effect:'Mutated Luck',value:0},'Diamond');
    const b=g('B','Back',{},undefined,'Void');
    const w=g('W','Wrist',{},undefined,'Chrome');
    const best=optimise([h,b,w],LOCKED_DEFAULT_SETTINGS,1)[0]!;
    expect(best.stats.luck).toBe(100);
    expect(best.score.luck).toBe(100);
  });

  it('labels KEEP membership when an item is only relevant in a dynamic sensitivity state',()=>{
    const dynamic=g('Dynamic','Back',{luck:70},{kind:'Premium',effect:'Droughtbreaker',value:10});
    const staticBack=g('Static','Back',{luck:110});
    const gear=[g('H','Head',{luck:100}),dynamic,staticBack,g('W','Wrist',{luck:100})];
    const analysis=analyseGearRetention(gear,LOCKED_DEFAULT_SETTINGS).find(a=>a.item.id==='Dynamic')!;
    expect(analysis.verdict).toBe('KEEP');
    expect(analysis.loadoutMemberships.some(m=>m.scenario)).toBe(true);
    expect(analysis.reason).toMatch(/DB 5|dynamic sensitivity/);
  });

  it('uses a robust zero-state Main baseline instead of assuming Droughtbreaker, Golden Hour or Frenzy uptime',()=>{
    const dynamic=g('Dynamic','Back',{luck:10},{kind:'Premium',effect:'Droughtbreaker',value:100});
    const staticBack=g('Static','Back',{luck:80});
    const gear=[g('H','Head',{luck:100}),dynamic,staticBack,g('W','Wrist',{luck:100})];
    const defaultMain=buildGearLoadouts(gear,LOCKED_DEFAULT_SETTINGS).main!;
    const central=buildGearLoadouts(gear,LOCKED_DEFAULT_SETTINGS,'central').main!;
    expect(defaultMain.back.id).toBe('Static');
    expect(central.back.id).toBe('Dynamic');
  });

  it('treats Overcharged as auction-time drink Luck rather than Drink Prep duration',()=>{
    const over=g('Over','Head',{},{kind:'Normal',effect:'Overcharged',value:20});
    const energy=g('Energy','Head',{energy:40});
    const gear=[over,energy,g('B','Back',{}),g('W','Wrist',{})];
    const prep=buildGearLoadouts(gear,LOCKED_DEFAULT_SETTINGS,'low').drink!;
    expect(prep.head.id).toBe('Energy');
    const noDrink=mainAuctionUtility([over,gear[2],gear[3]],LOCKED_DEFAULT_SETTINGS,'Neutral','low');
    const drinkState={droughtbreakerStacks:0,goldenHourLuck:0,luckFrenzyUptime:0,drinkLuckBoost:150,label:'Drink 2 active'};
    const withDrink=mainAuctionUtility([over,gear[2],gear[3]],LOCKED_DEFAULT_SETTINGS,'Neutral',drinkState);
    expect(withDrink-noDrink).toBeCloseTo(30,8);
  });

  it('uses the current Lucky Grading distribution for Grade Re-Roll EV',()=>{
    expect(gradeRerollExpectedValueGainPct(25)).toBeGreaterThan(1.76);
    expect(gradeRerollExpectedValueGainPct(25)).toBeLessThan(1.78);
  });

});
