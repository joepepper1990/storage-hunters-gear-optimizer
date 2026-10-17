import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeInitialData } from '../defaults';
import type { AuthKind, GearItem, GearStats, Slot } from '../types';
import { assessPremiumUpgrades } from './premiumAdvice';

function gear(id:string,slot:Slot,luck:number,auth?:{kind:AuthKind;effect:string;value:number},favourite=false):GearItem {
  const stats:GearStats={luck,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0};
  return {id,slot,baseName:id,name:id,stats,favourite,authenticated:Boolean(auth),authentication:auth??{kind:'None',effect:'',value:0},
    createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z'};
}
const base=()=>[gear('Head strong','Head',100),gear('Head weak','Head',10),gear('Back','Back',40),gear('Wrist','Wrist',50)];

describe('per-item Wooden-to-Premium decision guide',()=>{
  it('considers current best unenchanted items but does not encourage weaker alternatives',()=>{
    const advice=assessPremiumUpgrades(base(),LOCKED_DEFAULT_SETTINGS);
    expect(advice.find(a=>a.item.id==='Head strong')?.verdict).toBe('CONSIDER PREMIUM');
    expect(advice.find(a=>a.item.id==='Head weak')?.verdict).toBe('HOLD FOR NOW');
    expect(advice.find(a=>a.item.id==='Head weak')?.gapToBest).toBeGreaterThan(0);
    expect(advice.map(a=>a.item.id)[0]).not.toBe('Head weak');
    expect(advice).toHaveLength(4);
  });

  it('recognises equal-scoring alternative Head items, not just one chosen winner',()=>{
    const items=[gear('H1','Head',100),gear('H2','Head',100),gear('B','Back',20),gear('W','Wrist',30)];
    const advice=assessPremiumUpgrades(items,LOCKED_DEFAULT_SETTINGS);
    for(const id of ['H1','H2']) {
      expect(advice.find(a=>a.item.id===id)?.verdict).toBe('CONSIDER PREMIUM');
      expect(advice.find(a=>a.item.id===id)?.gapToBest).toBe(0);
    }
  });

  it('protects existing Premium effects and does not promise an additional upgrade',()=>{
    const items=base().map(g=>g.id==='Wrist'?gear('Wrist','Wrist',50,{kind:'Premium',effect:'Temporal Split',value:12}):g);
    const advice=assessPremiumUpgrades(items,LOCKED_DEFAULT_SETTINGS);
    const wrist=advice.find(a=>a.item.id==='Wrist')!;
    expect(wrist.verdict).toBe('ALREADY PREMIUM');
    expect(wrist.reasons.join(' ')).toContain('Temporal Split');
  });

  it('protects unknown/conditional/provisional enchants, including Nocturnal and Connected',()=>{
    const scenarios=[
      {kind:'Normal' as const,effect:'Nocturnal',value:35},
      {kind:'Normal' as const,effect:'Connected',value:2},
      {kind:'Normal' as const,effect:'Focused',value:0},
      {kind:'Normal' as const,effect:'Time Keeper',value:10},
      {kind:'Normal' as const,effect:'Haggler',value:0}
    ];
    for(const auth of scenarios){
      const items=base().map(g=>g.id==='Wrist'?gear('Wrist','Wrist',50,auth):g);
      expect(assessPremiumUpgrades(items,LOCKED_DEFAULT_SETTINGS).find(a=>a.item.id==='Wrist')?.verdict).toBe('PROTECT ENCHANTMENT');
    }
  });

  it('warns before replacing a known Normal enchantment',()=>{
    const items=base().map(g=>g.id==='Head strong'?gear('Head strong','Head',100,{kind:'Normal',effect:'Luck',value:10}):g);
    const advice=assessPremiumUpgrades(items,LOCKED_DEFAULT_SETTINGS);
    const head=advice.find(a=>a.item.id==='Head strong')!;
    expect(head.verdict).toBe('REVIEW REPLACEMENT');
    expect(head.reasons.join(' ')).toContain('Luck');
  });

  it('treats favourites as locked rather than automatically upgrading',()=>{
    const items=base().map(g=>g.id==='Head strong'?{...g,favourite:true}:g);
    const head=assessPremiumUpgrades(items,LOCKED_DEFAULT_SETTINGS).find(a=>a.item.id==='Head strong')!;
    expect(head.verdict).toBe('LOCKED');
  });

  it('does not pretend to have a full-loadout score with missing slots',()=>{
    const result=assessPremiumUpgrades([gear('H','Head',100),gear('W','Wrist',50)],LOCKED_DEFAULT_SETTINGS);
    expect(result).toHaveLength(2);
    expect(result.every(a=>a.verdict==='COMPLETE LOADOUT FIRST'&&a.gapToBest===undefined)).toBe(true);
  });

  it('uses correct Premium slot effects with Club Pact, not the outdated alias',()=>{
    const advice=assessPremiumUpgrades(base(),LOCKED_DEFAULT_SETTINGS);
    expect(advice.find(a=>a.item.slot==='Head')?.premiumOutcomes).toEqual(['Mutated Luck']);
    expect(advice.find(a=>a.item.slot==='Back')?.premiumOutcomes).toEqual(['Drought Breaker','Golden Hour']);
    expect(advice.find(a=>a.item.slot==='Wrist')?.premiumOutcomes).toEqual(['Club Pact','Temporal Split']);
  });

  it('assesses all user-owned October gear without a fabricated Premium probability',()=>{
    const data=makeInitialData();
    const result=assessPremiumUpgrades(data.gear,data.settings);
    expect(result).toHaveLength(data.gear.length);
    expect(result.some(a=>a.item.baseName==='Maple Wristband')).toBe(true);
    expect(result.find(a=>a.item.baseName==='Jellyfish Wristband')?.verdict).toBe('ALREADY PREMIUM');
    expect(result.find(a=>a.item.baseName==='Reactor Fedora')?.verdict).toBe('ALREADY PREMIUM');
    expect(result.find(a=>a.item.baseName==='Pearl Dominus')?.verdict).toBe('PROTECT ENCHANTMENT');
  });
});
