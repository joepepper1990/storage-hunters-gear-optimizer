import { describe, expect, it } from 'vitest';
import { DEFAULT_TROPHY_SETTINGS } from '../defaults';
import type { GavelTrophy } from '../types';
import { analyseTrophies, dominates, evaluateTrophySet, optimiseTrophies, specialistTrophySet, trophyScore } from './trophies';

const now='2026-08-28T00:00:00Z';
function t(name:string, modifiers:Array<[string,number]>, favourite=false):GavelTrophy { return {id:name,name,modifiers:modifiers.map(([mutation,boostPct])=>({mutation,boostPct})),favourite,createdAt:now,updatedAt:now}; }

describe('gavel trophy optimiser',()=>{
  it('uses the documented relative score formula',()=>{
    expect(trophyScore(t('Example',[['Silver',67],['Gold',123]]),DEFAULT_TROPHY_SETTINGS)).toBe(626);
  });
  it('stacks boosts across powered trophies',()=>{
    const r=evaluateTrophySet([t('A',[['Void',10]]),t('B',[['Void',20],['Gold',5]])],DEFAULT_TROPHY_SETTINGS);
    expect(r.totalBoosts.Void).toBe(30);
    expect(r.totalBoosts.Gold).toBe(5);
    expect(r.score).toBe(30*35+5*4);
  });
  it('uses all four slots when four or more trophies exist',()=>{
    const list=[t('A',[['Silver',10]]),t('B',[['Gold',10]]),t('C',[['Diamond',10]]),t('D',[['Void',10]]),t('E',[['Silver',1]])];
    const best=optimiseTrophies(list,DEFAULT_TROPHY_SETTINGS,10)[0];
    expect(best.trophies).toHaveLength(4);
    expect(best.trophies.map(x=>x.name)).not.toContain('E');
  });
  it('finds mutation-specialist four-trophy sets',()=>{
    const list=[t('A',[['Void',10]]),t('B',[['Void',20]]),t('C',[['Gold',99]]),t('D',[['Void',5]]),t('E',[['Void',7]])];
    const best=specialistTrophySet(list,DEFAULT_TROPHY_SETTINGS,'Void');
    expect(best?.totalBoosts.Void).toBe(42);
  });
  it('proves simple direct dominance and protects favourites from discard',()=>{
    const strong=t('Strong',[['Gold',20],['Void',10]]), weak=t('Weak',[['Gold',15]]), fav=t('Fav',[['Gold',10]],true);
    expect(dominates(strong,weak)).toBe(true);
    const analyses=analyseTrophies([strong,weak,fav],evaluateTrophySet([strong],DEFAULT_TROPHY_SETTINGS),DEFAULT_TROPHY_SETTINGS);
    expect(analyses.find(a=>a.item.id==='Weak')?.verdict).toBe('SAFE TO DISCARD');
    expect(analyses.find(a=>a.item.id==='Fav')?.verdict).toBe('KEEP');
  });
});
