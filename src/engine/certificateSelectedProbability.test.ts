import {describe,expect,it} from 'vitest';
import {makeEmptyData,ZERO_STATS} from '../defaults';
import type {AppData,GearItem,OwnedCertificate} from '../types';
import {analyseCertificate,certificateOutcomeLikelihoods} from './certificateDecision';
import {buildGearLoadouts} from './gearLoadouts';

const wooden:OwnedCertificate={id:'wood',type:'Wooden Certificate of Authenticity',quantity:1,gradeStars:2};
const gear=(id:string,slot:GearItem['slot'],stats:Partial<GearItem['stats']>={},authentication?:GearItem['authentication']):GearItem=>({
 id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:Boolean(authentication),
 authentication:authentication??{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''
});
function fixture():AppData {
 const d=makeEmptyData();d.gear=[gear('h','Head',{arrowReduction:50}),gear('b','Back',{arrowReduction:45}),gear('w','Wrist')];return d;
}
const target=(d:AppData,id='w',cert=wooden)=>analyseCertificate(d,cert,undefined,id).targets[0];

describe('equal-mod probability of improving the current Neutral best set',()=>{
 it('keeps every true pool effect at 1/N despite unequal observation counts',()=>{
  const d=fixture(),before=target(d);
  for(let i=0;i<35;i++)d.rollLog.push({id:'r'+i,date:'',certificateType:'Normal Certificate of Authenticity',certificateInventoryType:wooden.type,
   certificateGradeStars:2,itemId:'w',itemName:'w',slot:'Wrist',previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',
   newValue:60,improvedBestSet:true,bestScoreBefore:0,bestScoreAfter:1});
  const after=target(d);
  expect(certificateOutcomeLikelihoods(d,wooden,'Wrist')).toHaveLength(9);
  expect(after.outcomes.every(o=>Math.abs(o.probability-1/9)<1e-12)).toBe(true);
  expect(after.selectedNeutralChanceLowerPct).toBeCloseTo(before.selectedNeutralChanceLowerPct);
  expect(after.selectedNeutralChanceUpperPct).toBeCloseTo(before.selectedNeutralChanceUpperPct);
 });

 it('counts secondary-stat improvements even when the mod is unwanted, and excludes contextual-only gains',()=>{
  const d=fixture(),w=target(d),h=target(d,'h');
  const recovery=w.outcomes.find(o=>o.effect==='Bid Recovery')!;
  expect(recovery.wanted).toBe(false);
  expect(recovery.selectedNeutralChanceLowerPct).toBe(100);
  expect(w.selectedNeutralChanceLowerPct).toBeCloseTo(5/9*100);
  expect(w.selectedNeutralChanceUpperPct).toBeCloseTo(5/9*100);
  const sunny=h.outcomes.find(o=>o.effect==='Sunny')!;
  expect(sunny.improvePct.cautious).toBe(100);
  expect(sunny.selectedNeutralChanceUpperPct).toBe(0);
  const frenzy=target(d,'b',{id:'limited',type:'Limited Certificate of Authenticity',quantity:1});
  expect(frenzy.improveChancePct.favourable).toBeGreaterThan(0);
  expect(frenzy.selectedNeutralChanceUpperPct).toBe(0);
 });

 it('bounds a variable strength that may beat the current bonus without assuming uniform strengths',()=>{
  const d=fixture();d.gear[2].authenticated=true;d.gear[2].authentication={kind:'Normal',effect:'Bid Zone Width',value:40};
  const t=target(d),zone=t.outcomes.find(o=>o.effect==='Bid Zone Width')!;
  expect(zone.selectedNeutralChanceLowerPct).toBe(0);
  expect(zone.selectedNeutralChanceUpperPct).toBe(100);
  expect(t.selectedNeutralChanceLowerPct).toBe(0);
  expect(t.selectedNeutralChanceUpperPct).toBeCloseTo(100/9);
  // A different prior mode cannot turn the unknown strength distribution into odds.
  d.authModel=d.authModel.map(m=>m.certificateInventoryType===wooden.type&&m.outcome==='Bid Zone Width'?{...m,typical:16}:m);
  expect(target(d).selectedNeutralChanceUpperPct).toBeCloseTo(100/9);
 });

 it('keeps unknown ranges and unproved Arrow intervals conservative',()=>{
  const d=fixture();
  const back=target(d,'b'),focused=back.outcomes.find(o=>o.effect==='Focused')!;
  expect([focused.selectedNeutralChanceLowerPct,focused.selectedNeutralChanceUpperPct]).toEqual([0,100]);
  expect(back.selectedNeutralChanceUpperPct-back.selectedNeutralChanceLowerPct).toBeCloseTo(100/9);
  d.authModel=d.authModel.map(m=>m.certificateInventoryType===wooden.type&&m.outcome==='Bid Zone Width'?{...m,min:undefined,max:undefined}:m);
  const zone=target(d).outcomes.find(o=>o.effect==='Bid Zone Width')!;
  expect([zone.selectedNeutralChanceLowerPct,zone.selectedNeutralChanceUpperPct]).toEqual([0,100]);
  d.settings.arrowPolicy=undefined;d.settings.arrowTargetMin=95;d.settings.arrowTargetMax=100;
  d.gear[0].stats.arrowReduction=20;
  const arrow=target(d).outcomes.find(o=>o.effect==='Bid Arrow Speed')!;
  expect([arrow.selectedNeutralChanceLowerPct,arrow.selectedNeutralChanceUpperPct]).toEqual([0,100]);
 });

 it('re-optimises companion gear after replacing the Arrow bonus',()=>{
  const d=fixture();d.gear=[gear('h','Head',{luck:10},{kind:'Normal',effect:'Bid Arrow Speed',value:-40}),
   gear('b','Back',{luck:100}),gear('backup','Back',{luck:90,arrowReduction:40}),gear('w','Wrist',{arrowReduction:55})];
  for(const g of d.gear)g.mutation='Void';
  const premium:OwnedCertificate={id:'premium',type:'Premium Certificate of Authenticity',quantity:1};
  expect(buildGearLoadouts(d.gear,d.settings).main?.back.id).toBe('b');
  const t=target(d,'h',premium);
  expect(t.selectedNeutralChanceLowerPct).toBe(100);
  expect(t.selectedNeutralChanceUpperPct).toBe(100);
  expect(t.bestRoll?.loadout.back.id).toBe('backup');
 });

 it('can improve the best set by authenticating a backup that is not currently equipped',()=>{
  const d=fixture();d.gear.push(gear('backup','Head',{luck:-20,arrowReduction:50}));
  d.gear.find(g=>g.id==='backup')!.mutation='Void';
  expect(buildGearLoadouts(d.gear,d.settings).main?.head.id).toBe('h');
  const t=target(d,'backup',{id:'premium',type:'Premium Certificate of Authenticity',quantity:1});
  expect(t.selectedNeutralChanceLowerPct).toBe(100);
  expect(t.selectedNeutralChanceUpperPct).toBe(100);
 });

 it('excludes targets whose stats or current authentication still need verification',()=>{
  const d=fixture();d.gear[0].needsReview=true;d.gear[0].stats.arrowReduction=999;
  d.gear[1].metadataUncertain=['authentication'];d.gear.push(gear('verified','Head',{arrowReduction:50}));
  expect(analyseCertificate(d,wooden).targets.map(t=>t.item.id).sort()).toEqual(['verified','w']);
  // Observed stats remain valid companions when only the blue/native split is unknown.
  expect(target(d).currentArrow).toBe(95);
 });
});
