import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { analyseGearRetention } from '../engine/gearLoadouts';
import { analyseCertificate } from '../engine/certificateDecision';
import { effectiveItemStats } from '../engine/scoring';
import { exportJson, importJson, normalizeData } from './storage';
import { csvToGear, gearToCsv } from './csv';
import { makeKnownGear, makeMapleWristband, mergeKnownGear } from './knownGear';

describe('verified 26 October 2026 accessory inventory',()=>{
  const gear=makeKnownGear();
  const by=(name:string)=>gear.filter(g=>g.baseName===name);
  const one=(name:string)=>by(name)[0];

  it('contains exactly 22 separate accessories: 11 Head, 6 Back and 5 Wrist',()=>{
    expect(gear).toHaveLength(22);
    expect(gear.filter(g=>g.slot==='Head')).toHaveLength(11);
    expect(gear.filter(g=>g.slot==='Back')).toHaveLength(6);
    expect(gear.filter(g=>g.slot==='Wrist')).toHaveLength(5);
    expect(new Set(gear.map(g=>g.id)).size).toBe(22);
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
    const cert=data.ownedCertificates.find(c=>c.type==='Wooden Certificate of Authenticity')!;
    const decision=analyseCertificate(data,cert);
    const premium=decision.targets.find(t=>t.item.authentication.kind==='Premium');
    expect(premium).toBeDefined();
    expect(premium?.reasons.some(r=>r.includes('Replaces current Premium authentication'))).toBe(true);
  });

  it('upgrades pre-schema-10 data by replacing all old gear with the complete verified inventory',()=>{
    const manual={...one('Cow Dominus'),id:'manual-cow',stats:{...one('Cow Dominus').stats,luck:59}};
    const stale={...one('Luxury Ice Crown'),id:'verified-20261017-old-luxury'};
    const old={...makeInitialData(),schemaVersion:8,gear:[stale,manual]} as any;
    const upgraded=normalizeData(old);
    expect(upgraded.schemaVersion).toBe(10);
    expect(upgraded.gear).toHaveLength(22);
    expect(upgraded.gear.some(g=>g.id==='verified-20261017-old-luxury')).toBe(false);
    expect(upgraded.gear.some(g=>g.id==='manual-cow')).toBe(false);
    expect(upgraded.gear.every(g=>g.id.startsWith('verified-20261026-'))).toBe(true);

    // Once schema 10 has been saved, later user edits are respected.
    const edited={...upgraded,gear:upgraded.gear.slice(1)};
    const again=importJson(exportJson(edited));
    expect(again.gear).toHaveLength(21);
  });

  it('mergeKnownGear is idempotent and preserves a matching user-owned copy',()=>{
    const manual={...one('Luxury Ice Crown'),id:'user-luxury',favourite:true};
    const merged=mergeKnownGear([manual]);
    expect(merged).toHaveLength(22);
    expect(merged.find(g=>g.id==='user-luxury')?.favourite).toBe(true);
    expect(mergeKnownGear(merged)).toHaveLength(22);
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
