import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { analyseGearRetention } from '../engine/gearLoadouts';
import { analyseCertificate } from '../engine/certificateDecision';
import { effectiveItemStats } from '../engine/scoring';
import { exportJson, importJson, normalizeData } from './storage';
import { csvToGear, gearToCsv } from './csv';
import { makeKnownGear, makeMapleWristband } from './knownGear';

describe('verified 26-27 October 2026 accessory inventory',()=>{
  const gear=makeKnownGear();
  const by=(name:string)=>gear.filter(g=>g.baseName===name);
  const one=(name:string)=>by(name)[0];

  it('contains exactly 39 separate accessories after the 29-30 October updates: 23 Head, 9 Back and 7 Wrist',()=>{
    expect(gear).toHaveLength(39);
    expect(gear.filter(g=>g.slot==='Head')).toHaveLength(23);
    expect(gear.filter(g=>g.slot==='Back')).toHaveLength(9);
    expect(gear.filter(g=>g.slot==='Wrist')).toHaveLength(7);
    expect(new Set(gear.map(g=>g.id)).size).toBe(39);
    expect(by('Elegant Business Backpack').map(g=>g.mutation).sort()).toEqual(['Hologram','Void']);
    expect(one('Luxury Wristband').stats).toMatchObject({arrowReduction:32,tip:8.1,zone:-5});
    expect(one('Noble Vampire Top Hat').stats).toMatchObject({energy:16,arrowReduction:-3});
    expect(one('Autumn Wings').stats).toMatchObject({energy:24,zone:37,luck:-5});
    expect(by('Luxury Ice Crown')).toHaveLength(2);
    expect(by('Royal Dominus')).toHaveLength(3);
    expect(by('Desert Hood')).toHaveLength(0);
    expect(by('Luxury Backpack')).toHaveLength(0);
    expect(by('Steampunk Goggle')).toHaveLength(3);
    expect(by('Reactor Fedora')).toHaveLength(1);
    expect(by('Dark Heart Backpack')).toHaveLength(2);
  });

  it('stores current Head rolls and preserves the signed Bid Arrow convention',()=>{
    const chrome=by('Steampunk Goggle').find(g=>g.mutation==='Chrome')!;
    expect(chrome.stats).toMatchObject({luck:100,arrowReduction:27});
    expect(chrome.conditionPct).toBe(84);
    const xrayCandidate=one('Crypto Necklace');
    expect(xrayCandidate.stats).toMatchObject({luck:95,energy:18,arrowReduction:-3});
    expect(xrayCandidate.mutation).toBe('Hologram');
    expect(one('Race Valk').stats).toMatchObject({arrowReduction:76,energy:64,npc:0});
  });

  it('keeps blue authentication effects separate from base stats',()=>{
    const steampunk=by('Steampunk Goggle').find(g=>g.authentication.effect==='Mutated Luck')!;
    expect(steampunk.stats).toMatchObject({luck:136,zone:64,tip:-2});
    expect(steampunk.authentication).toMatchObject({kind:'Premium',effect:'Mutated Luck',value:0});

    const race=one('Race Valk');
    expect(race.authentication).toMatchObject({kind:'Normal',effect:'NPC Offers Bonus',value:7.7});
    expect(effectiveItemStats(race).npc).toBe(7.7);

    const police=one('Police Vest');
    expect(police.stats.zone).toBe(0);
    expect(police.authentication).toMatchObject({kind:'Normal',effect:'Bid Zone Width',value:18});
    expect(effectiveItemStats(police).zone).toBe(18);

    const dark=by('Dark Heart Backpack').find(g=>g.authentication.effect==='Drought Breaker')!;
    expect(dark.stats).toMatchObject({arrowReduction:40,walk:35});
    expect(dark.authentication).toMatchObject({kind:'Premium',effect:'Drought Breaker',value:18});

    const jelly=one('Jellyfish Wristband');
    expect(jelly.authentication).toMatchObject({kind:'Premium',effect:'Club Pact',value:4});
    expect(jelly.stats).toMatchObject({arrowReduction:32,luck:54,walk:-1});
  });

  it('captures the three strongest clean Limited-certificate candidates exactly',()=>{
    const elegant=one('Elegant Business Backpack');
    expect(elegant).toMatchObject({slot:'Back',mutation:'Void',conditionPct:92,authenticated:false});
    expect(elegant.stats).toMatchObject({luck:80,energy:11});

    const chrome=by('Steampunk Goggle').find(g=>g.mutation==='Chrome')!;
    expect(chrome.authenticated).toBe(false);

    const fox=one('Autumn Fox Wristband');
    expect(fox).toMatchObject({slot:'Wrist',mutation:'Exclusive',conditionPct:81,authenticated:false});
    expect(fox.stats).toMatchObject({luck:73,zone:55,npc:-1.5});
  });

  it('uses the unified retention model for current dynamic and F-tier authentications',()=>{
    const data=makeInitialData();
    const analyses=analyseGearRetention(data.gear,data.settings);
    for(const item of [
      by('Steampunk Goggle').find(g=>g.authentication.effect==='Mutated Luck')!,
      one('Jellyfish Wristband'),
      one('Reactor Wristband'),
      by('Dark Heart Backpack').find(g=>g.authentication.effect==='Drought Breaker')!
    ]){
      expect(analyses.find(a=>a.item.id===item.id)?.verdict).not.toBe('PROTECTED / UNKNOWN');
    }
  });

  it('evaluates authenticated gear as certificate targets with the current auth retained as replacement cost',()=>{
    const data=makeInitialData();
    const cert=data.ownedCertificates.find(c=>c.type==='Limited Certificate of Authenticity')!;
    const decision=analyseCertificate(data,cert);
    const premium=decision.targets.find(t=>t.item.authentication.kind==='Premium');
    expect(premium).toBeDefined();
    expect(premium?.reasons.some(r=>r.includes('Replaces the current authentication'))).toBe(true);
  });

  it('stores the seven accessories added on 27 October with their signed stats',()=>{
    const added=gear.filter(g=>g.id.startsWith('verified-20261027-'));
    expect(added.map(g=>g.baseName).sort()).toEqual(['Dark Aura Dominus','Franken Bunny Wristband','Halloween Boombox',
      'Luxury Ice Crown','Royal Dominus','Steampunk Valk Helm']);
    expect(one('Halloween Boombox')).toMatchObject({slot:'Back',mutation:'Limited',conditionPct:73,stats:expect.objectContaining({zone:110,energy:74})});
    expect(one('Steampunk Valk Helm').stats).toMatchObject({recovery:13,npc:7.5,arrowReduction:-3});
    expect(one('Franken Bunny Wristband').stats).toMatchObject({recovery:13,tip:7.2,energy:-6});
    expect(added.every(g=>!g.authenticated)).toBe(true);
  });

  it('upgrades older data by replacing all old gear with the complete verified inventory',()=>{
    const changed={...one('Cow Dominus'),id:'manual-cow',stats:{...one('Cow Dominus').stats,luck:59}};
    const matching={...one('Luxury Ice Crown'),id:'my-luxury',favourite:true};
    const old={...makeInitialData(),schemaVersion:8,gear:[matching,changed]} as any;
    const upgraded=normalizeData(old);
    expect(upgraded.schemaVersion).toBe(19);
    expect(upgraded.gear).toHaveLength(39);
    // An item with the same base stats keeps its ID and favourite; one with other stats is not owned.
    expect(upgraded.gear.find(g=>g.id==='my-luxury')?.favourite).toBe(true);
    expect(upgraded.gear.some(g=>g.id==='manual-cow')).toBe(false);

    // Once schema 15 has been saved, later user edits are respected.
    const edited={...upgraded,gear:upgraded.gear.slice(1)};
    const again=normalizeData(JSON.parse(exportJson(edited)));
    expect(again.gear).toHaveLength(38);
  });

  it('round-trips condition, mutation and signed stats in JSON and CSV',()=>{
    const g=one('Crypto Necklace');
    const json=importJson(exportJson({...makeInitialData(),gear:[g]})).gear[0];
    const csv=csvToGear(gearToCsv([g]))[0];
    expect(json.mutation).toBe('Hologram');
    expect(json.conditionPct).toBe(98);
    expect(json.stats.arrowReduction).toBe(-3);
    expect(csv.mutation).toBe('Hologram');
    expect(csv.conditionPct).toBe(98);
    expect(csv.stats.arrowReduction).toBe(-3);
  });

  it('retains the compatibility Maple helper with the current verified roll',()=>{
    const maple=makeMapleWristband();
    expect(maple).toMatchObject({baseName:'Maple Wristband',slot:'Wrist',mutation:'Exclusive',conditionPct:85});
    expect(maple.stats).toMatchObject({luck:63,zone:47});
  });
});

import { applyInventoryUpdate20261029 } from './knownGear';
describe('29 October inventory update (schema 17)',()=>{
  // A schema-16 store: the 29 gear items as they were, one of the gone ones favourited.
  const before=()=>{
    const d=makeInitialData();
    const gone=[
      {baseName:'Desert Hood',slot:'Head' as const,stats:{arrowReduction:31,luck:53}},
      {baseName:'Reactor Fedora',slot:'Head' as const,stats:{arrowReduction:42,zone:51}},
      {baseName:'Luxury Ice Crown',slot:'Head' as const,stats:{walk:41,energy:41}},
      {baseName:'Luxury Backpack',slot:'Back' as const,stats:{tip:11,walk:38}}
    ].map((g,i)=>({...d.gear[0],id:`old-${i}`,baseName:g.baseName,name:g.baseName,slot:g.slot,authenticated:false,
      authentication:{kind:'None' as const,effect:'',value:0},stats:{...d.gear[0].stats,luck:0,zone:0,tip:0,arrowReduction:0,...g.stats}}));
    const current=d.gear.filter(g=>!g.id.startsWith('verified-20261029-')&&!g.id.startsWith('verified-20261030-'));
    return {...d,schemaVersion:16,gear:[...current,...gone]} as never as typeof d;
  };
  it('removes the four items no longer owned and adds the two new ones, once',()=>{
    const old=before();
    expect(old.gear).toHaveLength(29);
    const next=normalizeData(old);
    expect(next.schemaVersion).toBe(19);
    expect(next.gear).toHaveLength(39); // 29 - 4 gone + 2 (schema 17) + 12 (schema 18)
    expect(next.gear.some(g=>g.id.startsWith('old-'))).toBe(false);
    expect(next.gear.find(g=>g.baseName==='Demon Pumpkin Head')).toMatchObject({slot:'Head',gradeStars:2,conditionPct:98,stats:expect.objectContaining({npc:8,recovery:-4})});
    expect(next.gear.find(g=>g.mutation==='Gold')).toMatchObject({baseName:'Royal Dominus',gradeStars:1,stats:expect.objectContaining({tip:13,arrowReduction:48})});
    // Saved at 17: never applied again, so a re-added item stays.
    const readded={...next,gear:[...next.gear,old.gear.find(g=>g.id==='old-0')!]};
    expect(normalizeData(JSON.parse(exportJson(readded))).gear).toHaveLength(40);
  });
  it('removes only exact matches and never duplicates an item already added',()=>{
    const old=before();
    const changed=old.gear.map(g=>g.id==='old-1'?{...g,stats:{...g.stats,zone:52}}:g);
    const gold=makeKnownGear().find(g=>g.mutation==='Gold')!;
    const imported=[...changed,{...gold,id:'my-gold',favourite:true}];
    const next=applyInventoryUpdate20261029(imported);
    expect(next.some(g=>g.id==='old-1')).toBe(true); // Different stats: not the item that was sold.
    expect(next.filter(g=>g.mutation==='Gold')).toEqual([expect.objectContaining({id:'my-gold',favourite:true})]);
  });
  it('leaves a backup restore exactly as it was',()=>{
    expect(importJson(exportJson(before())).gear).toHaveLength(29);
  });
});

import { addVerifiedItems } from './knownGear';
describe('30 October additions (schema 18)',()=>{
  it('adds the ten new accessories once, skipping any already imported',()=>{
    const d=makeInitialData();
    const without=d.gear.filter(g=>!g.id.startsWith('verified-20261030-'));
    expect(without).toHaveLength(27);
    const turtle=makeKnownGear().find(g=>g.baseName==='Turtle Fedora')!;
    const next=normalizeData({...d,schemaVersion:17,gear:[...without,{...turtle,id:'my-turtle',favourite:true}]} as never);
    expect(next.gear).toHaveLength(39);
    expect(next.gear.filter(g=>g.baseName==='Turtle Fedora')).toEqual([expect.objectContaining({id:'my-turtle',favourite:true})]);
    expect(addVerifiedItems(next.gear,'20261030')).toHaveLength(39);
    expect(normalizeData(JSON.parse(exportJson({...next,gear:next.gear.slice(1)}))).gear).toHaveLength(38);
  });
});
