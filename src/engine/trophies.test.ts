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
  it('protects every trophy required by a mutation-specialist max set even when the overall set is different',()=>{
    const list=[
      t('Chrome 100',[['Chrome',100]]),
      t('Chrome 90',[['Chrome',90]]),
      t('Chrome 80',[['Chrome',80]]),
      t('Chrome 70',[['Chrome',70]]),
      t('Chrome 60',[['Chrome',60]]),
      t('Rainbow A',[['Rainbow',100]]),
      t('Rainbow B',[['Rainbow',99]]),
      t('Rainbow C',[['Rainbow',98]]),
      t('Rainbow D',[['Rainbow',97]]),
    ];
    expect(dominates(list[0],list[1])).toBe(true);
    const best=optimiseTrophies(list,DEFAULT_TROPHY_SETTINGS,1)[0];
    expect(best.trophies.every(x=>x.name.startsWith('Rainbow'))).toBe(true);
    const analyses=analyseTrophies(list,best,DEFAULT_TROPHY_SETTINGS);
    for(const name of ['Chrome 100','Chrome 90','Chrome 80','Chrome 70']){
      expect(analyses.find(a=>a.item.id===name)?.verdict).toBe('KEEP');
      expect(analyses.find(a=>a.item.id===name)?.reason).toMatch(/maximum Chrome/);
    }
    expect(analyses.find(a=>a.item.id==='Chrome 60')?.verdict).toBe('SAFE TO DISCARD');
  });


  it('marks undominated mixed trophies safe when they are outside the overall and specialist optimum sets',()=>{
    const list=[
      t('Chrome 100',[['Chrome',100]]),t('Chrome 90',[['Chrome',90]]),t('Chrome 80',[['Chrome',80]]),t('Chrome 70',[['Chrome',70]]),
      t('Gem 100',[['Gem',100]]),t('Gem 90',[['Gem',90]]),t('Gem 80',[['Gem',80]]),t('Gem 70',[['Gem',70]]),
      t('Mixed spare',[['Chrome',20],['Gem',20]]),
    ];
    const best=optimiseTrophies(list,DEFAULT_TROPHY_SETTINGS,1)[0];
    const analyses=analyseTrophies(list,best,DEFAULT_TROPHY_SETTINGS);
    const mixed=analyses.find(a=>a.item.id==='Mixed spare');
    expect(mixed?.verdict).toBe('SAFE TO DISCARD');
    expect(mixed?.reason).toMatch(/Not used by the best overall/);
  });

  it('keeps only overall, specialist, or manually locked trophies',()=>{
    const list=[
      t('Chrome 100',[['Chrome',100]]),t('Chrome 90',[['Chrome',90]]),t('Chrome 80',[['Chrome',80]]),t('Chrome 70',[['Chrome',70]]),
      t('Weak spare',[['Chrome',1]]),
      t('Locked weak',[['Chrome',0.5]],true),
    ];
    const best=optimiseTrophies(list,DEFAULT_TROPHY_SETTINGS,1)[0];
    const analyses=analyseTrophies(list,best,DEFAULT_TROPHY_SETTINGS);
    expect(analyses.find(a=>a.item.id==='Weak spare')?.verdict).toBe('SAFE TO DISCARD');
    expect(analyses.find(a=>a.item.id==='Locked weak')?.verdict).toBe('KEEP');
  });

  it('still protects favourites from discard when they are outside all optimum sets',()=>{
    const list=[
      t('A',[['Chrome',100]]),t('B',[['Chrome',90]]),t('C',[['Chrome',80]]),t('D',[['Chrome',70]]),
      t('Favourite weak',[['Chrome',1]],true),
    ];
    const best=optimiseTrophies(list,DEFAULT_TROPHY_SETTINGS,1)[0];
    const analyses=analyseTrophies(list,best,DEFAULT_TROPHY_SETTINGS);
    expect(analyses.find(a=>a.item.id==='Favourite weak')?.verdict).toBe('KEEP');
  });
});
