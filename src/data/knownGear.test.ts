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

  it('contains exactly 29 separate accessories: 16 Head, 7 Back and 6 Wrist',()=>{
    expect(gear).toHaveLength(29);
    expect(gear.filter(g=>g.slot==='Head')).toHaveLength(16);
    expect(gear.filter(g=>g.slot==='Back')).toHaveLength(7);
    expect(gear.filter(g=>g.slot==='Wrist')).toHaveLength(6);
    expect(new Set(gear.map(g=>g.id)).size).toBe(29);
    expect(by('Luxury Ice Crown')).toHaveLength(3);
    expect(by('Royal Dominus')).toHaveLength(2);
    expect(by('Steampunk Goggle')).toHaveLength(2);
    expect(by('Reactor Fedora')).toHaveLength(2);
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

    const dark=by('Dark Heart Backpack').find(g=>g.authentication.effect==='Droughtbreaker')!;
    expect(dark.stats).toMatchObject({arrowReduction:40,walk:35});
    expect(dark.authentication).toMatchObject({kind:'Premium',effect:'Droughtbreaker',value:18});

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
      by('Dark Heart Backpack').find(g=>g.authentication.effect==='Droughtbreaker')!
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
    expect(premium?.reasons.some(r=>r.includes('Replaces current Premium authentication'))).toBe(true);
  });

  it('stores the seven accessories added on 27 October with their signed stats',()=>{
    const added=gear.filter(g=>g.id.startsWith('verified-20261027-'));
    expect(added.map(g=>g.baseName).sort()).toEqual(['Dark Aura Dominus','Franken Bunny Wristband','Halloween Boombox',
      'Luxury Ice Crown','Luxury Ice Crown','Royal Dominus','Steampunk Valk Helm']);
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
    expect(upgraded.schemaVersion).toBe(15);
    expect(upgraded.gear).toHaveLength(29);
    // An item with the same base stats keeps its ID and favourite; one with other stats is not owned.
    expect(upgraded.gear.find(g=>g.id==='my-luxury')?.favourite).toBe(true);
    expect(upgraded.gear.some(g=>g.id==='manual-cow')).toBe(false);

    // Once schema 15 has been saved, later user edits are respected.
    const edited={...upgraded,gear:upgraded.gear.slice(1)};
    const again=normalizeData(JSON.parse(exportJson(edited)));
    expect(again.gear).toHaveLength(28);
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
