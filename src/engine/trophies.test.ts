import { describe, expect, it } from 'vitest';
import { DEFAULT_TROPHY_SETTINGS } from '../defaults';
import type { GavelTrophy } from '../types';
import { analyseTrophyRetention, evaluateTrophySet, optimiseTrophies, specialistTrophyLoadout, TROPHY_ACTIVE_LIMIT, trophyScore } from './trophies';

const now='2026-09-03T00:00:00Z';
function t(name:string, modifiers:Array<[string,number]>, favourite=false):GavelTrophy { return {id:name,name,modifiers:modifiers.map(([mutation,boostPct])=>({mutation,boostPct})),favourite,createdAt:now,updatedAt:now}; }

describe('gavel trophy optimiser',()=>{
  it('uses the documented relative score formula',()=>{
    expect(trophyScore(t('Example',[['Silver',67],['Gold',123]]),DEFAULT_TROPHY_SETTINGS)).toBe(626);
  });

  it('stacks boosts across equipped trophies',()=>{
    const r=evaluateTrophySet([t('A',[['Void',10]]),t('B',[['Void',20],['Gold',5]])],DEFAULT_TROPHY_SETTINGS);
    expect(r.totalBoosts.Void).toBe(30);
    expect(r.totalBoosts.Gold).toBe(5);
    expect(r.score).toBe(30*35+5*4);
  });

  it('selects exactly the best four when four or more Gavels exist',()=>{
    const list=[t('A',[['Silver',10]]),t('B',[['Gold',10]]),t('C',[['Diamond',10]]),t('D',[['Void',10]]),t('E',[['Silver',1]])];
    const results=optimiseTrophies(list,DEFAULT_TROPHY_SETTINGS);
    expect(results).toHaveLength(1);
    expect(results[0].trophies).toHaveLength(TROPHY_ACTIVE_LIMIT);
    expect(results[0].trophies.map(x=>x.name)).toEqual(['D','C','B','A']);
    expect(results[0].trophies.map(x=>x.name)).not.toContain('E');
  });

  it('selects all available Gavels when fewer than four exist',()=>{
    const list=[t('A',[['Void',10]]),t('B',[['Gold',20]]),t('C',[['Diamond',5]])];
    const results=optimiseTrophies(list,DEFAULT_TROPHY_SETTINGS);
    expect(results).toHaveLength(1);
    expect(results[0].trophies).toHaveLength(3);
    expect(new Set(results[0].trophies.map(x=>x.name))).toEqual(new Set(['A','B','C']));
  });

  it('ignores legacy maxActive values and always uses the current four-slot rule',()=>{
    const legacy={...DEFAULT_TROPHY_SETTINGS,maxActive:1};
    const list=[t('A',[['Silver',10]]),t('B',[['Gold',10]]),t('C',[['Diamond',10]]),t('D',[['Void',10]])];
    expect(optimiseTrophies(list,legacy)[0].trophies).toHaveLength(4);
  });
  it('supports three modifier rolls on a single Gavel',()=>{
    const triple=t('Triple',[['Chrome',25],['Gem',30],['Silver',40]]);
    expect(trophyScore(triple,DEFAULT_TROPHY_SETTINGS)).toBe(25*12+30*10+40*2);
  });

  it('protects the maximum specialist set and marks the fifth weaker same-mutation trophy safe',()=>{
    const list=[
      t('Chrome 100',[['Chrome',100]]),
      t('Chrome 90',[['Chrome',90]]),
      t('Chrome 80',[['Chrome',80]]),
      t('Chrome 70',[['Chrome',70]]),
      t('Chrome 1',[['Chrome',1]])
    ];
    const specialist=specialistTrophyLoadout(list,'Chrome',DEFAULT_TROPHY_SETTINGS);
    expect(specialist?.trophies.map(x=>x.name)).toEqual(['Chrome 100','Chrome 90','Chrome 80','Chrome 70']);
    const analyses=analyseTrophyRetention(list,DEFAULT_TROPHY_SETTINGS);
    expect(analyses.find(a=>a.item.name==='Chrome 70')?.verdict).toBe('EQUIP');
    expect(analyses.find(a=>a.item.name==='Chrome 1')?.verdict).toBe('SAFE TO DISCARD');
  });

  it('keeps a non-overall trophy when it is needed by a different specialist set',()=>{
    const list=[
      t('Void 100',[['Void',100]]),t('Void 90',[['Void',90]]),t('Void 80',[['Void',80]]),t('Void 70',[['Void',70]]),
      t('Wet 42',[['Wet',42]])
    ];
    const analyses=analyseTrophyRetention(list,DEFAULT_TROPHY_SETTINGS);
    expect(analyses.find(a=>a.item.name==='Wet 42')?.verdict).toBe('KEEP');
    expect(analyses.find(a=>a.item.name==='Wet 42')?.reason).toContain('Wet');
  });

  it('keeps manually favourited trophies even when they are otherwise surplus',()=>{
    const list=[
      t('Void 100',[['Void',100]]),t('Void 90',[['Void',90]]),t('Void 80',[['Void',80]]),t('Void 70',[['Void',70]]),
      t('Locked spare',[['Void',1]],true)
    ];
    const analyses=analyseTrophyRetention(list,DEFAULT_TROPHY_SETTINGS);
    expect(analyses.find(a=>a.item.name==='Locked spare')?.verdict).toBe('KEEP');
  });
  it('protects equal fourth-place specialist rolls instead of discarding a usable tie',()=>{
    const list=[
      t('A',[['Chrome',99]]),t('B',[['Chrome',90]]),
      t('C',[['Chrome',80]]),t('D',[['Chrome',70]]),
      t('E',[['Chrome',70]]),t('F',[['Chrome',1]])
    ];
    const result=analyseTrophyRetention(list,DEFAULT_TROPHY_SETTINGS);
    expect(result.find(r=>r.item.id==='E')?.verdict).toBe('KEEP');
    expect(result.find(r=>r.item.id==='F')?.verdict).toBe('SAFE TO DISCARD');
  });

});
