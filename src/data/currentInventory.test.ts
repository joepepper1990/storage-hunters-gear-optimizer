import {describe,it,expect} from 'vitest';
import {makeInitialData} from '../defaults';
import {makeKnownGear} from './knownGear';
import {normalizeData,importJson,exportJson} from './storage';
import {effectiveItemStats} from '../engine/scoring';

describe('confirmed complete 63-item inventory',()=>{
 it('seeds 41 Head, 13 Back and 9 Wrist with authentication separate from base stats',()=>{
  const d=makeInitialData();
  expect(d.gear).toHaveLength(63);
  expect(['Head','Back','Wrist'].map(s=>d.gear.filter(g=>g.slot===s).length)).toEqual([41,13,9]);
  const voidBack=d.gear.find(g=>g.baseName==='Elegant Business Backpack'&&g.mutation==='Void')!;
  expect(voidBack.stats.luck).toBe(80);
  expect(effectiveItemStats(voidBack).luck).toBe(103);
  const jelly=d.gear.find(g=>g.baseName==='Jellyfish Wristband')!;
  expect(jelly.authentication).toMatchObject({kind:'Normal',effect:'Energy Drink Time',value:24});
  expect(jelly.stats.walk).toBe(-1);
 });
 it('reconciles old saves once while retaining matching identity and unrelated data',()=>{
  const d=makeInitialData(),old=makeKnownGear();
  const fedora=old.find(g=>g.baseName==='Reactor Fedora')!;
  fedora.id='my-fedora';fedora.favourite=true;fedora.createdAt='2020-01-01';
  const next=normalizeData({...d,schemaVersion:19,gear:old} as never);
  expect(next.gear).toHaveLength(63);
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
