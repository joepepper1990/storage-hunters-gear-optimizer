import { describe, expect, it } from 'vitest';
import { DEFAULT_TROPHY_SETTINGS } from '../defaults';
import type { GavelTrophy } from '../types';
import { evaluateTrophySet, optimiseTrophies, TROPHY_ACTIVE_LIMIT, trophyScore } from './trophies';

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
});
