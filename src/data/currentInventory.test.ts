import {describe,it,expect} from 'vitest';
import {makeInitialData} from '../defaults';
import {makeKnownGear} from './knownGear';
import {normalizeData,importJson,exportJson} from './storage';
import {effectiveItemStats} from '../engine/scoring';
import evidence from '../../docs/audits/2026-11-21-inventory.json';
import {makeCurrentGear as makeNovember18Gear} from './currentInventory';

describe('80-copy snapshot plus five reviewed additions',()=>{
 it('seeds 40 Head, 29 Back and 16 Wrist with authentication separate from base stats',()=>{
  const d=makeInitialData();
  expect(d.gear).toHaveLength(85);
  expect(['Head','Back','Wrist'].map(s=>d.gear.filter(g=>g.slot===s).length)).toEqual([40,29,16]);
  const voidBack=d.gear.find(g=>g.baseName==='Elegant Business Backpack'&&g.mutation==='Void')!;
  expect(voidBack.stats.luck).toBe(80);
  expect(effectiveItemStats(voidBack).luck).toBe(103);
  const jelly=d.gear.find(g=>g.baseName==='Jellyfish Wristband')!;
  expect(jelly.authentication).toMatchObject({kind:'Normal',effect:'Energy Drink Time',value:24});
  expect(jelly.stats.walk).toBe(-1);
 });
 it('keeps every evidence copy, including all seven disband recommendations',()=>{
  const gear=makeInitialData().gear;
  expect(new Set(gear.map(g=>g.id)).size).toBe(85);
  expect(gear.slice(0,80).map(g=>g.sourceImage)).toEqual(evidence.items.map(row=>row.source));
  expect(gear.filter(g=>g.sourceImage?.startsWith('IMG_'))).toHaveLength(78);
  expect(gear.filter(g=>g.sourceImage?.startsWith('USER_'))).toHaveLength(2);
  expect(gear.filter(g=>g.baseName==='Safe Wristband')).toHaveLength(3);
  for(const row of evidence.items.filter(row=>row.plannedLocation==='Disband'))expect(gear.some(g=>g.sourceImage===row.source)).toBe(true);
 });
 it('converts each displayed numeric authentication exactly once',()=>{
  const gear=makeInitialData().gear;
  for(const row of evidence.items.filter(row=>!row.uncertainFields.length||!row.uncertainFields.some(field=>field==='displayedStats'))){
   const item=gear.find(g=>g.sourceImage===row.source)!;
   const shown=effectiveItemStats(item);
   for(const [key,value] of Object.entries(row.displayedStats))expect(shown[key as keyof typeof shown],`${row.source} ${key}`).toBe(value);
  }
  const royal=gear.find(g=>g.sourceImage==='IMG_8363.jpg')!;
  expect(royal.authentication).toMatchObject({kind:'Normal',effect:'Overcharged',value:6});
  const luxury=gear.find(g=>g.sourceImage==='IMG_8383.jpg')!;
  expect(luxury.stats.arrowReduction).toBe(0);
  expect(luxury.authentication).toMatchObject({effect:'Bid Arrow Speed',value:-21});
  const mutated=gear.filter(g=>g.authentication.effect==='Mutated Luck');
  expect(mutated).toHaveLength(2);
  expect(mutated.every(g=>g.authentication.value===0)).toBe(true);
 });
 it('retains unknown tooltip stats as explicitly unverified records and keeps missing metadata absent',()=>{
  const gear=makeInitialData().gear;
  const unknown=gear.filter(g=>g.needsReview);
  expect(unknown.map(g=>g.sourceImage)).toEqual(['IMG_8407.jpg','IMG_8420.jpg']);
  expect(unknown.every(g=>Boolean(g.reviewNotes)&&Object.values(g.stats).every(value=>Number.isFinite(value)))).toBe(true);
  expect(unknown.find(g=>g.baseName==='Safe Wristband')?.displayedValue).toBe(700.44);
  expect(unknown.find(g=>g.baseName==='Witch Robe')?.displayedValue).toBeUndefined();
  const additions=gear.filter(g=>g.sourceImage?.startsWith('USER_'));
  for(const item of additions){expect(item.gradeStars).toBeUndefined();expect(item.conditionPct).toBeUndefined();expect(item.displayedValue).toBeUndefined();}
  const safe=additions.find(g=>g.baseName==='Safe Wristband')!;
  expect(safe.mutation).toBeUndefined();
  expect(safe.metadataUncertain).toContain('mutation');
  expect(safe.stats).toMatchObject({arrowReduction:14,zone:17});
  expect(additions.find(g=>g.baseName==='Gem Backpack')).toMatchObject({mutation:'Gold',stats:expect.objectContaining({arrowReduction:11,tip:2.8,luck:-5})});
 });
 it('migrates schema 21 once and preserves identities, certificate quantities, gavels, charms, settings and roll references',()=>{
  const old={...makeInitialData(),schemaVersion:21,gear:makeNovember18Gear()};
  const fedora=old.gear.find(g=>g.baseName==='Reactor Fedora')!;
  fedora.id='owner-fedora';fedora.favourite=true;fedora.createdAt='2020-01-01';
  old.ownedCertificates[0].quantity=42;
  old.trophies=old.trophies.slice(0,1);old.trophies[0].id='owner-gavel';old.trophies[0].favourite=true;
  old.looseCharms=[{type:'Moon',value:17}];
  old.settings.arrowTargetMin=123;old.settings.arrowTargetMax=123;
  old.rollLog=[{id:'roll',date:'2026-11-20',certificateType:'Normal Certificate of Authenticity',itemId:fedora.id,itemName:fedora.name,slot:'Head',previousAuthentication:'',previousValue:0,newAuthentication:'Luck',newValue:5,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0}];
  const next=normalizeData(old as never);
  expect(next.schemaVersion).toBe(23);expect(next.gear).toHaveLength(85);
  expect(next.gear.find(g=>g.id==='owner-fedora')).toMatchObject({favourite:true,createdAt:'2020-01-01'});
  expect(next.ownedCertificates).toEqual(old.ownedCertificates);expect(next.trophies).toEqual(old.trophies);
  expect(next.looseCharms).toEqual(old.looseCharms);expect(next.settings).toEqual(old.settings);expect(next.rollLog).toEqual(old.rollLog);
  const edited={...next,gear:next.gear.slice(2)};
  edited.gear[0]={...edited.gear[0],stats:{...edited.gear[0].stats,luck:999}};
  const reloaded=normalizeData(JSON.parse(exportJson(edited))).gear;
  expect(reloaded.map(g=>g.id)).toEqual(edited.gear.map(g=>g.id));
  expect(reloaded[0].stats.luck).toBe(999);
 });
 it('preserves evidence, uncertainty and review fields through backup imports and later reloads',()=>{
  const initial=makeInitialData();
  const restored=importJson(exportJson(initial));
  expect(restored.gear).toEqual(initial.gear);
  const own={...initial,schemaVersion:21,gear:initial.gear.filter(g=>g.needsReview)};
  const imported=importJson(JSON.stringify(own));
  expect(imported.schemaVersion).toBe(23);expect(imported.gear).toHaveLength(2);
  expect(normalizeData(JSON.parse(exportJson(imported))).gear).toEqual(own.gear);
  expect(normalizeData(importJson(JSON.stringify({...own,gear:[]}))).gear).toEqual([]);
 });
 it('retains old blue-authentication copy identity and respects later owner corrections',()=>{
  const old={...makeInitialData(),schemaVersion:21,gear:makeNovember18Gear()};
  const luxury=old.gear.find(g=>g.baseName==='Luxury Backpack')!;
  luxury.id='my-luxury';luxury.favourite=true;
  const migrated=normalizeData(old as never);
  const item=migrated.gear.find(g=>g.id==='my-luxury')!;
  expect(item.sourceImage).toBe('IMG_8383.jpg');
  expect(item.favourite).toBe(true);
  expect(item.authentication).toMatchObject({effect:'Bid Arrow Speed',value:-21});
  item.authentication={kind:'Normal',effect:'Bid Arrow Speed',value:-25};
  item.stats.luck=105;
  const reloaded=normalizeData(JSON.parse(exportJson(migrated))).gear.find(g=>g.id===item.id)!;
  expect(reloaded.authentication).toEqual(item.authentication);
  expect(reloaded.stats).toEqual(item.stats);
 });
 it('reconciles old saves once while retaining matching identity and unrelated data',()=>{
  const d=makeInitialData(),old=makeKnownGear();
  const fedora=old.find(g=>g.baseName==='Reactor Fedora')!;
  fedora.id='my-fedora';fedora.favourite=true;fedora.createdAt='2020-01-01';
  const next=normalizeData({...d,schemaVersion:19,gear:old} as never);
  expect(next.gear).toHaveLength(85);
  expect(next.gear.find(g=>g.id==='my-fedora')).toMatchObject({favourite:true,createdAt:'2020-01-01'});
  expect(next.ownedCertificates).toEqual(d.ownedCertificates);expect(next.trophies).toEqual(d.trophies);
  expect(next.rollLog).toEqual(d.rollLog);expect(next.settings).toEqual(d.settings);
  expect(normalizeData({...next,gear:[]}).gear).toEqual([]);
 });
 it('preserves explicitly restored old inventories',()=>{
  const old={...makeInitialData(),schemaVersion:19,gear:makeKnownGear()};
  expect(importJson(JSON.stringify(old)).gear).toHaveLength(39);
  expect(normalizeData(importJson(JSON.stringify(old))).gear).toHaveLength(39);
  expect(importJson(exportJson(makeInitialData())).gear).toEqual(makeInitialData().gear);
 });
});
