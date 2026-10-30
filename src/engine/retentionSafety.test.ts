import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, ZERO_STATS } from '../defaults';
import type { AlgorithmSettings, GearItem, GearStats, Slot } from '../types';
import { algorithmIssues } from './settingsValidation';
import { findDominator } from './dominance';
import { analyseGearRetention, buildGearLoadouts, dynamicLuck, mainCombination } from './gearLoadouts';

function gear(id:string,slot:Slot,stats:Partial<GearStats>={},effect='',value=0):GearItem {
  return {id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:!!effect,
    authentication:{kind:effect?'Limited':'None',effect,value},favourite:false,createdAt:'',updatedAt:''};
}
const settings=LOCKED_DEFAULT_SETTINGS;
function verdict(items:GearItem[],id:string,s:AlgorithmSettings=settings) {
  return analyseGearRetention(items,s).find(a=>a.item.id===id)!;
}

describe('shared settings validation',()=>{
  it('accepts the locked model and valid non-default increasing slopes',()=>{
    expect(algorithmIssues(settings)).toEqual([]);
    expect(algorithmIssues({...settings,zoneMultiplier2:3,zoneMultiplier3:2})).toEqual([]);
  });
  it.each(['luckWeight','arrowWeight','arrowTargetMin','recoveryWeight','zoneWeight','zoneBreakpoint1','zoneBreakpoint2','zoneMultiplier2','zoneMultiplier3','energyTarget','energyCeiling','energySecondStageMultiplier'] as const)('rejects nonfinite and negative active model values for %s',key=>{
    for(const value of [NaN,Infinity,-Infinity,-1])expect(algorithmIssues({...settings,[key]:value}).length).toBeGreaterThan(0);
  });
});

describe('irreversible retention safety',()=>{
  it.each([
    {zoneBreakpoint1:60,zoneBreakpoint2:30,zoneMultiplier2:3,zoneMultiplier3:2},
    {energyTarget:200,energyCeiling:100}, {zoneMultiplier2:-1}, {energySecondStageMultiplier:-1},
    {energyTarget:-1}, {energyCeiling:Infinity}, {arrowTargetMin:NaN}, {recoveryWeight:-1}
  ])('never certifies discard with invalid settings %j',invalid=>{
    const s={...settings,...invalid};
    const weak=gear('weak','Head');
    const strong=gear('strong','Head',{luck:100,zone:100});
    const items=[weak,strong,gear('back','Back'),gear('wrist','Wrist')];
    expect(findDominator(weak,[strong],s).dominated).toBe(false);
    expect(verdict(items,'weak',s).verdict).not.toBe('SAFE TO DISCARD');
  });

  it('counts Energy in the Best Set rather than in a separate Drink Prep set',()=>{
    const head=gear('energy-head','Head',{energy:100});
    const luckyHead=gear('luck-head','Head',{luck:1});
    const items=[head,luckyHead,gear('back','Back'),gear('wrist','Wrist')];
    expect(buildGearLoadouts(items,settings).drink).toBeUndefined();
    expect(verdict(items,head.id).verdict).toBe('EQUIP');
  });

  it.each(['Tip Chance','NPC Offers Bonus','Grade Re-Roll'])('does not keep a weak item for %s alone',effect=>{
    const specialist=gear('specialist','Head',{},effect,20);
    const winner=gear('main','Head',{luck:100});
    const items=[specialist,winner,gear('back','Back'),gear('wrist','Wrist')];
    expect(verdict(items,specialist.id).verdict).toBe('SAFE TO DISCARD');
  });

  it('keeps a Head whose mutation would pay off once it gets Premium Mutated Luck',()=>{
    const target={...gear('mutation','Head'),mutation:'Onyx'};
    const better=gear('static','Head',{luck:1});
    const items=[target,better,gear('back','Back'),gear('wrist','Wrist')];
    const result=verdict(items,target.id);
    expect(result.verdict).toBe('KEEP');
    expect(result.reason).toBe('Strong future certificate target');
    const premium={...target,authenticated:true,authentication:{kind:'Premium' as const,effect:'Mutated Luck',value:0}};
    expect(buildGearLoadouts([premium,better,items[2],items[3]],settings).main?.head.id).toBe(target.id);
  });

  it('still certifies a uniformly inferior ordinary item',()=>{
    const weak=gear('weak','Head');
    const items=[weak,gear('strong','Head',{luck:10,energy:10,tip:10,npc:10}),gear('back','Back'),gear('wrist','Wrist')];
    expect(verdict(items,weak.id).verdict).toBe('SAFE TO DISCARD');
  });
});

describe('active drink baseline',()=>{
  const state={droughtbreakerStacks:0,goldenHourLuck:0,luckFrenzyUptime:0,drinkLuckBoost:150,label:'Drink active'};
  it('adds drink Luck exactly once to a trio and displays the modeled total',()=>{
    const items=[gear('head','Head',{luck:100}),gear('back','Back',{luck:100}),gear('wrist','Wrist',{luck:100})];
    expect(dynamicLuck(items,'Neutral',state)).toBe(150);
    expect(mainCombination(items[0],items[1],items[2],settings,'Neutral',state).stats.luck).toBe(450);
    expect(buildGearLoadouts(items,settings,state).main?.stats.luck).toBe(450);
  });
  it('adds Overcharged amplification after counting the drink baseline',()=>{
    const items=[gear('head','Head',{luck:100},'Overcharged',20),gear('back','Back',{luck:100}),gear('wrist','Wrist',{luck:100})];
    expect(dynamicLuck(items,'Neutral',state)).toBe(180);
    expect(buildGearLoadouts(items,settings,state).main?.stats.luck).toBe(480);
  });
});
