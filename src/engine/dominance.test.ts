import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { findDominator, pairBestCaseAdvantage, pairWorstCaseAdvantage } from './dominance';
import type { GearItem, GearStats } from '../types';

function g(id:string,stats:Partial<GearStats>,effect=''):GearItem{
  const now='2026-08-28T00:00:00Z';
  return {id,baseName:id,name:id,slot:'Back',stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:effect?'Alien':'None',effect,value:0},favourite:false,createdAt:now,updatedAt:now};
}

describe('analytical dominance proof',()=>{
  it('combines exact worst cases across Main Auction stats',()=>{
    const a=g('A',{luck:50,arrowReduction:75});
    const b=g('B',{arrowReduction:80});
    expect(pairWorstCaseAdvantage(a,b,LOCKED_DEFAULT_SETTINGS)).toBeGreaterThan(49);
    expect(findDominator(b,[a],LOCKED_DEFAULT_SETTINGS).dominated).toBe(true);
  });

  it('does not claim dominance when saturation can preserve a future complementary use case',()=>{
    const a=g('A',{luck:.5,arrowReduction:75});
    const b=g('B',{arrowReduction:80});
    expect(findDominator(b,[a],LOCKED_DEFAULT_SETTINGS).dominated).toBe(false);
  });

  it('treats Arrow above 75 as equal utility rather than an invented penalty',()=>{
    const atTarget=g('AtTarget',{arrowReduction:75});
    const overstacked=g('Overstacked',{arrowReduction:120});
    expect(pairBestCaseAdvantage(atTarget,overstacked,LOCKED_DEFAULT_SETTINGS)).toBeCloseTo(0,8);
    expect(pairWorstCaseAdvantage(atTarget,overstacked,LOCKED_DEFAULT_SETTINGS)).toBeLessThan(0);
  });

  it('never uses an unknown/protected item as proof that another item is safe to discard',()=>{
    const unknownCandidate=g('Mystery',{luck:100},'Unmodelled Alien Effect');
    const target=g('Target',{});
    expect(findDominator(target,[unknownCandidate],LOCKED_DEFAULT_SETTINGS).dominated).toBe(false);
  });

  it('ignores specialist-only Energy Drink Time when proving Main Auction dominance',()=>{
    const betterMain=g('BetterMain',{luck:1,energy:-20});
    const weakerMain=g('WeakerMain',{});
    expect(findDominator(weakerMain,[betterMain],LOCKED_DEFAULT_SETTINGS).dominated).toBe(true);
  });
});
