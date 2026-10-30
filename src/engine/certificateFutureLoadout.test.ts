import { describe, expect, it } from 'vitest';
import { makeEmptyData } from '../defaults';
import type { AppData, GearItem, GearStats, OwnedCertificate, Slot } from '../types';
import { analyseCertificate, type CertificateTargetDecision } from './certificateDecision';
import { arrowDistance, buildGearLoadouts } from './gearLoadouts';
import { combineStats } from './scoring';

function gear(id:string,slot:Slot,stats:Partial<GearStats>,auth?:GearItem['authentication'],mutation?:string):GearItem{
  return {id,baseName:id,name:id,slot,mutation,
    stats:{luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...stats},
    authenticated:Boolean(auth),authentication:auth??{kind:'None',effect:'',value:0},
    favourite:false,createdAt:'',updatedAt:''};
}
const cert=(type:OwnedCertificate['type']):OwnedCertificate=>({id:type,type,quantity:1});
function data(items:GearItem[]):AppData { return {...makeEmptyData(),gear:items}; }
function target(d:AppData,type:OwnedCertificate['type'],id:string):CertificateTargetDecision {
  return analyseCertificate(d,cert(type),undefined,id).targets[0];
}
const outcome=(t:CertificateTargetDecision,effect:string)=>t.outcomes.find(o=>o.effect===effect)!;

describe('certificates judged by the full re-optimised loadout',()=>{
  it('finds a better future trio when a Head loses its Arrow to Sunny and other gear restores the band',()=>{
    // Current best: Head 35 (from its Arrow roll) + Back 30 + Wrist 15 = 80%.
    // If the Head rolls Sunny, Back 40 + Wrist 35 keep the set at 75%: inside the band, with Sunny.
    const head=gear('head','Head',{},{kind:'Normal',effect:'Bid Arrow Speed',value:-35});
    const items=[head,gear('back30','Back',{arrowReduction:30}),gear('back40','Back',{arrowReduction:40}),
      gear('wrist15','Wrist',{arrowReduction:15}),gear('wrist35','Wrist',{arrowReduction:35})];
    const d=data(items);
    const before=buildGearLoadouts(items,d.settings).main!;
    expect([before.back.id,before.wrist.id,before.stats.arrowReduction]).toEqual(['back30','wrist15',80]);

    // A local item-for-item comparison sees only a loss: with the same companions the set
    // falls to 45%, out of the band, which outranks any Luck the Sunny roll adds.
    const sunnyHead={...head,authentication:{kind:'Normal' as const,effect:'Sunny',value:50}};
    const local=combineStats([sunnyHead,before.back,before.wrist]);
    expect(local.arrowReduction).toBe(45);
    expect(arrowDistance(local,d.settings)).toBeGreaterThan(arrowDistance(before.stats,d.settings));

    // The full-loadout simulation finds the redistributed trio.
    const t=target(d,'Wooden Certificate of Authenticity','head');
    expect(outcome(t,'Sunny').improvePct.cautious).toBe(100);
    const after=buildGearLoadouts(items.map(g=>g.id==='head'?sunnyHead:g),d.settings).day!;
    expect([after.back.id,after.wrist.id,after.stats.arrowReduction]).toEqual(['back40','wrist35',75]);
  });

  it('values Focused by the actual Back: Luck-dominant and Zone-dominant items differ, and unresolved is not zero',()=>{
    const backA=gear('A','Back',{luck:65,energy:28,npc:9.7});
    const backB=gear('B','Back',{luck:20,zone:70,energy:15});
    const items=[gear('h','Head',{arrowReduction:40}),backA,backB,gear('w','Wrist',{arrowReduction:35})];
    const d=data(items);
    const a=target(d,'Wooden Certificate of Authenticity','A');
    const b=target(d,'Wooden Certificate of Authenticity','B');
    const fa=a.calculatedRanks.find(r=>r.effect==='Focused')!, fb=b.calculatedRanks.find(r=>r.effect==='Focused')!;
    expect(fa.defaultRank).toBe(2);
    expect(fa.calculatedRank).toBe(1);
    expect(fa.reason).toContain('Luck (+65 native)');
    expect(fb.calculatedRank).toBe(3);
    expect(fb.reason).toContain('Bid Zone Width (+70 native)');
    for(const r of [fa,fb])expect(r.contribution).toBeUndefined();
    expect(a.unresolvedEffects).toContain('Focused');
    expect(a.improveChanceUpperPct).toBeGreaterThan(a.improveChancePct.favourable);
  });

  it('calculates Premium Mutated Luck from the future trio, so Back and Wrist mutations change it',()=>{
    const build=(backMutation:string)=>data([
      gear('h','Head',{arrowReduction:40},undefined,'Gold'),
      gear('b','Back',{arrowReduction:20},undefined,backMutation),
      gear('w','Wrist',{arrowReduction:20},undefined,'Silver')
    ]);
    const contribution=(d:AppData)=>target(d,'Premium Certificate of Authenticity','h').calculatedRanks.find(r=>r.effect==='Mutated Luck')!.contribution;
    expect(contribution(build('Gold'))).toBe(10+10+5);
    expect(contribution(build('Void'))).toBe(10+40+5);
  });

  it('keeps a large Bid Recovery roll unwanted while it still counts in the odds',()=>{
    const items=[gear('h','Head',{arrowReduction:40}),gear('b','Back',{arrowReduction:35}),gear('w','Wrist',{})];
    const t=target(data(items),'Wooden Certificate of Authenticity','w');
    const recovery=outcome(t,'Bid Recovery');
    expect(recovery.probability).toBeCloseTo(1/9);
    expect(recovery.wanted).toBe(false);
    expect(recovery.improvePct).toEqual({cautious:0,central:0,favourable:0});
    expect(t.outcomes).toHaveLength(9);
    expect(outcome(t,'Bid Zone Width').improvePct.cautious).toBe(100);
  });

  it('gives an always-on roll the same figure in every state, and lets it reach USE on that alone',()=>{
    const items=[gear('h','Head',{arrowReduction:40}),gear('spare','Head',{arrowReduction:40}),gear('b','Back',{arrowReduction:20}),gear('w','Wrist',{arrowReduction:20})];
    const t=target(data(items),'Wooden Certificate of Authenticity','h');
    const zone=outcome(t,'Bid Zone Width').improvePct;
    expect(zone.cautious).toBe(zone.central);
    expect(zone.central).toBe(zone.favourable);
    expect(t.improveChanceLowerPct.cautious).toBeGreaterThanOrEqual(30);
    expect(t.verdict).toBe('USE');
  });

  it('holds a 100%-wanted Premium Back when the current authentication carries the Arrow band',()=>{
    const items=[gear('h','Head',{arrowReduction:20}),gear('w','Wrist',{arrowReduction:10}),
      gear('b','Back',{},{kind:'Normal',effect:'Bid Arrow Speed',value:-50})];
    const t=target(data(items),'Premium Certificate of Authenticity','b');
    expect(t.wantedChancePct).toBe(100);
    expect(t.improveChancePct.favourable).toBe(0);
    expect(['HOLD','DO NOT USE']).toContain(t.verdict);
  });

  it('does not let certificate rarity change the ranking inputs',()=>{
    const items=[gear('h','Head',{arrowReduction:40}),gear('b','Back',{arrowReduction:20}),gear('w','Wrist',{arrowReduction:20})];
    const t=target(data(items),'Limited Certificate of Authenticity','w');
    expect(t.wantedChancePct).toBe(0);
    expect(t.verdict).not.toBe('USE');
  });
});
