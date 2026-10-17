import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { effectiveItemStats, scoreStandalone } from '../engine/scoring';
import { analyseItems } from '../engine/optimizer';
import { certificateTargets } from '../engine/certificates';
import { importJson, exportJson } from './storage';
import { csvToGear, gearToCsv } from './csv';
import { makeKnownGear, mergeKnownGear } from './knownGear';

describe('verified 17 October 2026 inventory', () => {
  const gear = makeKnownGear();
  const item = (name:string) => gear.find(g=>g.baseName===name)!;

  it('contains exactly 14 identified accessories in 9 head, 2 back, and 3 wrist slots',()=>{
    expect(gear).toHaveLength(14);
    expect(gear.filter(g=>g.slot==='Head')).toHaveLength(9);
    expect(gear.filter(g=>g.slot==='Back')).toHaveLength(2);
    expect(gear.filter(g=>g.slot==='Wrist')).toHaveLength(3);
    expect(new Set(gear.map(g=>g.id)).size).toBe(14);
    expect(gear.every(g=>g.conditionPct!==undefined && g.conditionPct>=0 && g.conditionPct<=100)).toBe(true);
  });

  it('preserves exact mutations and conditions',()=>{
    expect(item('Reactor Fedora')).toMatchObject({mutation:'None',conditionPct:55});
    expect(item('Diamond Crypto Necklace')).toMatchObject({mutation:'Diamond',conditionPct:83});
    expect(item('Diamond Steampunk Goggle')).toMatchObject({mutation:'Diamond',conditionPct:85});
    expect(item('Cow Dominus')).toMatchObject({mutation:'None',conditionPct:54});
    expect(item('Gold Crypto Necklace')).toMatchObject({mutation:'Gold',conditionPct:60});
    expect(item('Desert Hood')).toMatchObject({mutation:'Exclusive',conditionPct:90});
    expect(item('Gangster Dominus')).toMatchObject({mutation:'None',conditionPct:68});
    expect(item('Pearl Dominus')).toMatchObject({mutation:'None',conditionPct:51});
    expect(item('Race Valk')).toMatchObject({mutation:'Cobwebbed',conditionPct:56});
    expect(item('Dark Heart Backpack')).toMatchObject({mutation:'Exclusive',conditionPct:83});
    expect(item('Police Vest')).toMatchObject({mutation:'Police',conditionPct:96});
    expect(item('Jellyfish Wristband')).toMatchObject({mutation:'Diamond',conditionPct:73});
    expect(item('Police Baton')).toMatchObject({mutation:'Police',conditionPct:93});
    expect(item('Reactor Wristband')).toMatchObject({mutation:'Cobwebbed',conditionPct:55});
  });

  it('preserves all signed numbers and special enchantments',()=>{
    expect(item('Reactor Fedora').stats).toMatchObject({arrowReduction:45,luck:75});
    expect(item('Reactor Fedora').authentication).toMatchObject({kind:'Premium',effect:'Mutated Luck',value:0});
    expect(item('Diamond Crypto Necklace').stats).toMatchObject({luck:60,zone:46,npc:-1.5});
    expect(item('Diamond Steampunk Goggle').stats).toMatchObject({luck:136,zone:64,tip:-2});
    expect(item('Cow Dominus').stats).toMatchObject({luck:58,arrowReduction:35});
    expect(item('Gold Crypto Necklace').stats).toMatchObject({tip:6.9,luck:46,recovery:-4});
    expect(item('Desert Hood').stats).toMatchObject({arrowReduction:31,luck:53});
    expect(item('Gangster Dominus').stats).toMatchObject({arrowReduction:28,walk:24});
    expect(item('Pearl Dominus').stats).toMatchObject({zone:76,luck:100});
    expect(item('Pearl Dominus').authentication).toMatchObject({kind:'Normal',effect:'Nocturnal',value:35});
    expect(item('Race Valk').stats).toMatchObject({arrowReduction:76,energy:64,npc:7.7});
    expect(item('Race Valk').authenticated).toBe(false);
    expect(item('Dark Heart Backpack').stats).toMatchObject({arrowReduction:40,walk:35});
    expect(item('Police Vest').stats).toMatchObject({luck:65,npc:9.7,zone:18});
    expect(item('Jellyfish Wristband').stats).toMatchObject({arrowReduction:32,luck:54,walk:-1});
    expect(item('Jellyfish Wristband').authentication).toMatchObject({kind:'Premium',effect:'Temporal Split',value:12});
    expect(item('Police Baton').stats).toMatchObject({tip:5.5,luck:37});
    expect(item('Reactor Wristband').stats).toMatchObject({tip:8.9,luck:60});
    expect(item('Reactor Wristband').authentication).toMatchObject({kind:'Normal',effect:'Connected',value:2});
    expect(effectiveItemStats(item('Race Valk')).npc).toBe(7.7);
  });

  it('protects dynamic enchantments from SAFE TO DISCARD without assigning fictitious stat boosts',()=>{
    const settings=makeInitialData().settings;
    for(const name of ['Reactor Fedora','Jellyfish Wristband','Reactor Wristband']){
      const g=item(name);
      const score=scoreStandalone(g,settings);
      expect(score.hasUnknownProtectedPassive).toBe(true);
      expect(score.passive).toBe(0);
      const verdict=analyseItems([g],undefined,settings)[0];
      expect(verdict.verdict).toBe('PROTECTED / UNKNOWN');
    }
  });

  it('does not suggest a Normal certificate reroll on a Premium enchantment',()=>{
    const data=makeInitialData();
    const targets=certificateTargets(data.gear,data.settings,data.authModel,'Normal Certificate of Authenticity',100);
    expect(targets.some(t=>t.item.authentication.kind==='Premium')).toBe(false);
    expect(targets.some(t=>t.item.baseName==='Reactor Fedora')).toBe(false);
    expect(targets.some(t=>t.item.baseName==='Jellyfish Wristband')).toBe(false);
  });

  it('idempotently merges existing matching gear and enriches missing item metadata',()=>{
    const legacy={...item('Police Vest'), id:'existing-police-vest',mutation:undefined,conditionPct:undefined};
    const out=mergeKnownGear([legacy]);
    expect(out).toHaveLength(14);
    const enriched=out.find(g=>g.id==='existing-police-vest')!;
    expect(enriched.mutation).toBe('Police');
    expect(enriched.conditionPct).toBe(96);
    expect(mergeKnownGear(out)).toHaveLength(14);
  });

  it('preserves alternative real rolls even with the same accessory name',()=>{
    const other={...item('Police Vest'),id:'different-roll',stats:{...item('Police Vest').stats,luck:66},conditionPct:75};
    const result=mergeKnownGear([other]);
    expect(result).toHaveLength(15);
    expect(result.find(g=>g.id==='different-roll')?.stats.luck).toBe(66);
  });

  it('adds the known inventory exactly once when migrating an older local backup',()=>{
    const d=makeInitialData() as any;
    d.schemaVersion=4;
    d.gear=[{...item('Police Vest'),id:'pre-existing-police-vest',mutation:undefined,conditionPct:undefined}];
    const once=importJson(JSON.stringify(d));
    expect(once.schemaVersion).toBe(6);
    expect(once.gear).toHaveLength(14);
    expect(once.gear.some(g=>g.id==='pre-existing-police-vest'&&g.conditionPct===96)).toBe(true);
    const again=importJson(exportJson(once));
    expect(again.gear).toHaveLength(14);
  });

  it('round-trips condition and mutation in both JSON and CSV and keeps old CSV valid',()=>{
    const g=item('Diamond Steampunk Goggle');
    const json=importJson(exportJson({...makeInitialData(),gear:[g]})).gear[0];
    const csv=csvToGear(gearToCsv([g]))[0];
    expect(json.mutation).toBe('Diamond');
    expect(json.conditionPct).toBe(85);
    expect(csv.mutation).toBe('Diamond');
    expect(csv.conditionPct).toBe(85);
    expect(csv.stats.tip).toBe(-2);
    const legacy=csvToGear('Name,Slot,Luck\nOld Head,Head,1\n')[0];
    expect(legacy.conditionPct).toBeUndefined();
  });

  it('rejects invalid imported conditions rather than silently changing them',()=>{
    const d=makeInitialData();
    d.gear=[{...item('Reactor Fedora'),conditionPct:101}];
    expect(()=>importJson(exportJson(d))).toThrow('condition');
  });
});
