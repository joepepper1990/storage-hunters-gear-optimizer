import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import { analyseItems, optimise, specialistLoadout } from './optimizer';
import type { GearItem, GearStats, Slot } from '../types';

function g(id:string,slot:Slot,stats:Partial<GearStats>,effect='',value=0):GearItem{
  const now='2026-08-28T00:00:00Z';
  return {id,baseName:id,name:id,slot,stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},authenticated:!!effect,authentication:{kind:effect?'Alien':'None',effect,value},favourite:false,createdAt:now,updatedAt:now};
}

describe('combination optimiser',()=>{
  it('requires exactly one Head, Back and Wrist',()=>expect(optimise([g('H','Head',{luck:10})],LOCKED_DEFAULT_SETTINGS)).toEqual([]));

  it('optimises the full three-item combination rather than standalone items',()=>{
    const items=[
      g('H1','Head',{luck:100,arrowReduction:70}),
      g('H2','Head',{luck:110}),
      g('B','Back',{arrowReduction:10}),
      g('W','Wrist',{luck:50})
    ];
    const best=optimise(items,LOCKED_DEFAULT_SETTINGS,1)[0];
    expect(best.head.id).toBe('H1');
    expect(best.stats.arrowReduction).toBe(80);
    expect(best.score.arrow).toBeCloseTo(60,8);
  });

  it('treats Arrow above 75 as wasted rather than beneficial or penalised',()=>{
    const h=g('H','Head',{arrowReduction:75});
    const over=g('Over','Back',{arrowReduction:30,luck:20});
    const plain=g('Plain','Back',{luck:20});
    const w=g('W','Wrist',{});
    const overResult=optimise([h,over,w],LOCKED_DEFAULT_SETTINGS,1)[0];
    expect(overResult.score.arrow).toBeCloseTo(60,8);
    expect(overResult.wastedArrow).toBe(30);
    expect(overResult.penalisedArrow).toBe(0);
    const best=optimise([h,over,plain,w],LOCKED_DEFAULT_SETTINGS,1)[0];
    expect(['Over','Plain']).toContain(best.back.id);
  });

  it('ranks Arrow specialists by effective utility capped at 75',()=>{
    const h75=g('Arrow75','Head',{arrowReduction:75});
    const h108=g('Arrow108','Head',{arrowReduction:108});
    const b=g('B','Back',{}),w=g('W','Wrist',{});
    const best=specialistLoadout([h75,h108,b,w],'arrowReduction',LOCKED_DEFAULT_SETTINGS);
    expect(best?.stats.arrowReduction).toBeGreaterThanOrEqual(75);
  });

  it('protects unknown passives from safe discard',()=>{
    const unknown=g('Unknown','Wrist',{},'Unmodelled Alien Effect',10); unknown.authentication.kind='Alien';
    const strong=g('Strong','Wrist',{luck:100});
    const gear=[g('H','Head',{}),g('B','Back',{}),unknown,strong];
    const results=analyseItems(gear,optimise(gear,LOCKED_DEFAULT_SETTINGS,1)[0],LOCKED_DEFAULT_SETTINGS);
    expect(results.find(x=>x.item.id==='Unknown')?.verdict).toBe('PROTECTED / UNKNOWN');
  });
  it('resolves exact-score ties deterministically by Head/Back/Wrist IDs',()=>{
    const gear=[
      g('H2','Head',{luck:100}),g('H1','Head',{luck:100}),
      g('B2','Back',{luck:100}),g('B1','Back',{luck:100}),
      g('W2','Wrist',{luck:100}),g('W1','Wrist',{luck:100})
    ];
    const first=optimise(gear,LOCKED_DEFAULT_SETTINGS,8);
    const second=optimise([...gear].reverse(),LOCKED_DEFAULT_SETTINGS,8);
    const keys=(values:ReturnType<typeof optimise>)=>values.map(v=>[v.head.id,v.back.id,v.wrist.id].join('|'));
    expect(keys(first)).toEqual(keys(second));
    expect(keys(first)[0]).toBe('H1|B1|W1');
  });

});
