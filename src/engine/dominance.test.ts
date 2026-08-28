import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { findDominator, pairBestCaseAdvantage, pairWorstCaseAdvantage } from './dominance';
import type { GearItem, GearStats } from '../types';
function g(id:string,stats:Partial<GearStats>,effect=''):GearItem{const now='2026-08-28T00:00:00Z';return{id,name:id,slot:'Back',stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:effect?'Alien':'None',effect,value:0},favourite:false,createdAt:now,updatedAt:now}}

describe('analytical dominance proof',()=>{
  it('combines exact worst cases across separable stats',()=>{
    const a=g('A',{luck:10,arrowReduction:75}); const b=g('B',{arrowReduction:80});
    expect(pairWorstCaseAdvantage(a,b,LOCKED_DEFAULT_SETTINGS)).toBeGreaterThan(5.7);
    expect(findDominator(b,[a],LOCKED_DEFAULT_SETTINGS).dominated).toBe(true);
  });
  it('does not claim dominance when nonlinear saturation creates a future use case',()=>{
    const a=g('A',{luck:0.5,arrowReduction:75}); const b=g('B',{arrowReduction:80});
    expect(findDominator(b,[a],LOCKED_DEFAULT_SETTINGS).dominated).toBe(false);
  });

  it('includes the >100 penalty breakpoint in exact future-state comparisons',()=>{
    const lower=g('Lower',{arrowReduction:80});
    const overstacked=g('Overstacked',{arrowReduction:120});
    // At a zero complement, 80% beats 120% because 120% is actively penalised.
    expect(pairBestCaseAdvantage(lower,overstacked,LOCKED_DEFAULT_SETTINGS)).toBeGreaterThan(16.9);
    // But an arbitrarily low complementary Arrow total can still reverse that pair, so no false proof is made.
    expect(pairWorstCaseAdvantage(lower,overstacked,LOCKED_DEFAULT_SETTINGS)).toBeLessThan(-33.9);
    expect(findDominator(overstacked,[lower],LOCKED_DEFAULT_SETTINGS).dominated).toBe(false);
  });

  it('never uses an unknown/protected item as proof that another item is safe to discard',()=>{
    const unknownCandidate=g('Mystery',{luck:100},'Unmodelled Alien Effect');
    const target=g('Target',{});
    expect(findDominator(target,[unknownCandidate],LOCKED_DEFAULT_SETTINGS).dominated).toBe(false);
  });
  it('keeps negative stats as genuine penalties',()=>{
    const a=g('A',{luck:1,energy:-20}); const b=g('B',{});
    expect(findDominator(b,[a],LOCKED_DEFAULT_SETTINGS).dominated).toBe(false);
  });
});
