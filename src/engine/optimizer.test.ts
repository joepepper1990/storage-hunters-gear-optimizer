import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { analyseItems, optimise, specialistLoadout } from './optimizer';
import type { GearItem, GearStats, Slot } from '../types';

function g(id:string,slot:Slot,stats:Partial<GearStats>,effect='',value=0):GearItem {const now='2026-08-28T00:00:00Z';return{id,baseName:id,name:id,slot,stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:effect? 'Alien':'None',effect,value},favourite:false,createdAt:now,updatedAt:now}}

describe('combination optimiser',()=>{
  it('handles empty slots',()=>expect(optimise([g('H','Head',{luck:10})],LOCKED_DEFAULT_SETTINGS)).toEqual([]));
  it('allows duplicate item names because IDs are unique',()=>{
    const items=[g('same','Head',{luck:10}),{...g('same2','Head',{luck:20}),name:'same'},g('B','Back',{}),g('W','Wrist',{})];
    expect(optimise(items,LOCKED_DEFAULT_SETTINGS,10)[0].head.id).toBe('same2');
  });
  it('scores combined nonlinear totals rather than standalone sums',()=>{
    const h=g('H','Head',{arrowReduction:70}); const b=g('B','Back',{arrowReduction:20}); const w=g('W','Wrist',{});
    const result=optimise([h,b,w],LOCKED_DEFAULT_SETTINGS,1)[0];
    expect(result.stats.arrowReduction).toBe(90);
    expect(result.score.arrow).toBeCloseTo(98.4375,8);
  });
  it('actively avoids >100 Arrow over-stacking when the penalty outweighs other gains',()=>{
    const h=g('H','Head',{arrowReduction:75});
    const over=g('Over','Back',{arrowReduction:30});
    const balanced=g('Balanced','Back',{arrowReduction:14});
    const w=g('W','Wrist',{});
    const best=optimise([h,over,balanced,w],LOCKED_DEFAULT_SETTINGS,10)[0];
    expect(best.back.id).toBe('Balanced');
    expect(best.stats.arrowReduction).toBe(89);
    expect(best.penalisedArrow).toBe(0);
    const overResult=optimise([h,over,w],LOCKED_DEFAULT_SETTINGS,1)[0];
    expect(overResult.stats.arrowReduction).toBe(105);
    expect(overResult.penalisedArrow).toBe(5);
    expect(overResult.score.arrow).toBeCloseTo(96.875,8);
  });

  it('ranks Arrow specialists by actual Arrow utility rather than raw reduction',()=>{
    const h89=g('Arrow89','Head',{arrowReduction:89});
    const h108=g('Arrow108','Head',{arrowReduction:108});
    const b=g('B','Back',{}); const w=g('W','Wrist',{});
    const best=specialistLoadout([h89,h108,b,w],'arrowReduction',LOCKED_DEFAULT_SETTINGS);
    expect(best?.head.id).toBe('Arrow89');
  });
  it('protects unknown passives from safe discard',()=>{
    const unknown=g('Unknown','Wrist',{},'Haggler',10); unknown.authentication.kind='Alien';
    const strong=g('Strong','Wrist',{luck:100});
    const results=analyseItems([g('H','Head',{}),g('B','Back',{}),unknown,strong],optimise([g('H','Head',{}),g('B','Back',{}),unknown,strong],LOCKED_DEFAULT_SETTINGS,1)[0],LOCKED_DEFAULT_SETTINGS);
    expect(results.find(x=>x.item.id==='Unknown')?.verdict).toBe('PROTECTED / UNKNOWN');
  });
});
