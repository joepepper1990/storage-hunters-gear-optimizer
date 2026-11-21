import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { normalizeData, importJson, exportJson } from './storage';
import { buildGearLoadouts } from '../engine/gearLoadouts';
import { classifyCollection } from '../engine/collection';

describe('seven-accessory owner review', () => {
 it('adds five distinct copies and corrects two existing copies without double-counting mutation Luck', () => {
  const d=makeInitialData();
  expect(d.gear).toHaveLength(85);
  expect(['Head','Back','Wrist'].map(slot=>d.gear.filter(g=>g.slot===slot).length)).toEqual([40,29,16]);
  expect(d.gear.filter(g=>g.baseName==='Tactical Vest')).toHaveLength(6);
  expect(d.gear.filter(g=>g.baseName==='Military Stopwatch Wristband')).toHaveLength(4);
  const jacket=d.gear.find(g=>g.sourceImage==='IMG_8401.jpg')!;
  expect(jacket).toMatchObject({conditionPct:88,stats:{luck:83},foundBy:'Markersaur',foundDate:'2026-11-06'});
  expect(jacket.metadataUncertain??[]).not.toContain('conditionPct');
  expect(d.gear.find(g=>g.sourceImage==='IMG_8416.jpg')).toMatchObject({conditionPct:57,stats:{zone:24,walk:16,luck:-5}});
  expect(d.gear.find(g=>g.baseName==='Candy Corn Antlers')).toMatchObject({conditionPct:91,stats:{tip:2.2,npc:-1.5}});
  expect(d.gear.find(g=>g.baseName==='Candy Corn Antlers')?.gradeStars).toBeUndefined();
 });
 it('appends only missing additions to schema22, preserving edits and manually entered matching copies', () => {
  const current=makeInitialData();
  const manual={...current.gear.find(g=>g.displayedValue===21465.60)!,id:'owner-entered-watch',sourceImage:undefined,favourite:true};
  const old={...current,schemaVersion:22,gear:[...current.gear.filter(g=>!g.sourceImage?.startsWith('OWNER_REVIEW_')),manual]};
  old.gear[0]={...old.gear[0],stats:{...old.gear[0].stats,luck:777}};
  const next=normalizeData(old as never);
  expect(next.gear).toHaveLength(85);
  expect(next.gear.filter(g=>g.displayedValue===21465.60)).toHaveLength(1);
  expect(next.gear.find(g=>g.id==='owner-entered-watch')?.favourite).toBe(true);
  expect(next.gear[0].stats.luck).toBe(777);
  expect(next.ownedCertificates).toEqual(old.ownedCertificates);
  expect(next.rollLog).toEqual(old.rollLog);
  const removed={...next,gear:next.gear.filter(g=>g.displayedValue!==13250.16)};
  expect(normalizeData(removed).gear).toHaveLength(84);
  expect(importJson(JSON.stringify({...old,gear:[]})).gear).toEqual([]);
 });
 it('preserves the best set, the recorded discard decision and both uncertain Vest display candidates', () => {
  const d=makeInitialData(),best=buildGearLoadouts(d.gear,d.settings).main!;
  expect([best.head.sourceImage,best.back.sourceImage,best.wrist.sourceImage]).toEqual(['IMG_8366.jpg','IMG_8403.jpg','IMG_8408.jpg']);
  expect(best.stats).toMatchObject({arrowReduction:112,luck:264});
  const c=classifyCollection(d.gear,new Set([best.head.id,best.back.id,best.wrist.id]),d.settings,{ready:true,certificateTargets:new Set()});
  expect(c.discard.some(r=>r.item.sourceImage==='IMG_8416.jpg')).toBe(true);
  expect(c.display.some(r=>r.item.sourceImage==='IMG_8401.jpg')).toBe(true);
  expect(c.storage.some(r=>r.item.displayedValue===16930944)).toBe(true);
  expect(c.storage.some(r=>r.item.displayedValue===21465.60)).toBe(true);
  expect(c.storage.some(r=>r.item.displayedValue===16486.20)).toBe(true);
  expect(c.display.some(r=>r.item.baseName==='Candy Corn Antlers')).toBe(true);
  expect(c.display.some(r=>r.item.baseName==='Sailor Bag')).toBe(true);
 });
});
