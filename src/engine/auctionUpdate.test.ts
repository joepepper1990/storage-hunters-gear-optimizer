import { describe,it,expect } from 'vitest';
import { makeInitialData,LOCKED_DEFAULT_SETTINGS,ZERO_STATS } from '../defaults';
import { buildGearLoadouts } from './gearLoadouts';
import { normalizeData } from '../data/storage';
import type { GearItem } from '../types';
const item=(id:string,slot:GearItem['slot'],stats:Partial<GearItem['stats']>):GearItem=>({id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''});
describe('November auction requirements',()=>{
 it('loads all 63 current accessories and five gavels with latest grades',()=>{
 const d=makeInitialData();expect(d.gear).toHaveLength(63);expect(d.trophies).toHaveLength(5);
 expect(d.gear.find(g=>g.baseName==='Fireman Hat')?.stats.zone).toBe(31);
 expect(d.gear.find(g=>g.baseName==='Tactical Vest'&&g.stats.arrowReduction>0)?.stats.arrowReduction).toBe(44);
 });
 it('persists an exact target rather than resetting it to the old band',()=>{
 const d=makeInitialData(); d.settings.arrowTargetMin=123;d.settings.arrowTargetMax=123;
 expect(normalizeData(d).settings.arrowTargetMin).toBe(123);
 });
 it('uses closest Arrow then Luck before Zone and secondary stats',()=>{
 const gear=[item('luck','Head',{luck:101,arrowReduction:100}),item('zone','Head',{luck:100,zone:1000,arrowReduction:100}),item('b','Back',{}),item('w','Wrist',{})];
 expect(buildGearLoadouts(gear,{...LOCKED_DEFAULT_SETTINGS,arrowTargetMin:100,arrowTargetMax:100}).main?.head.id).toBe('luck');
 });
 it('uses maximum Golden Hour and zero Droughtbreaker by default',()=>{
 const h=item('h','Head',{}),w=item('w','Wrist',{}),b=item('gold','Back',{luck:110});
 b.authenticated=true;b.authentication={kind:'Premium',effect:'Golden Hour',value:1.2};
 expect(buildGearLoadouts([h,b,w],LOCKED_DEFAULT_SETTINGS).main?.stats.luck).toBe(210);
 });
});

it('preserves Mosaic diversity when choosing the four gavels',async()=>{
 const {optimiseTrophies}=await import('./trophies');const d=makeInitialData();
 const best=optimiseTrophies(d.trophies,d.trophySettings)[0];
 expect(best.trophies.some(t=>t.charm?.type==='Mosaic')).toBe(true);
});
it('counts only the strongest placed Mosaic, including itself',async()=>{
 const {placedCharmLuck}=await import('./trophies'); const d=makeInitialData();
 expect(placedCharmLuck(d.trophies.slice(0,4))).toBe(52);
 expect(placedCharmLuck([d.trophies[2]])).toBe(13);
});
it('makes certificate odds explicitly unknown in the simple view',async()=>{
 const {chanceText}=await import('../screens/Certificates');
 expect(chanceText({} as never).value).toBe('Unknown');
});
it('does not trade Luck for Arrow when both choices are equally close',()=>{
 const d=makeInitialData(); const gear=[item('fast','Head',{luck:15,arrowReduction:90}),item('slow','Head',{luck:10,arrowReduction:110}),item('b','Back',{}),item('w','Wrist',{})];
 expect(buildGearLoadouts(gear,d.settings).main?.head.id).toBe('fast');
});
it('suggests a stronger gavel through a single charm move without reducing Mosaic Luck',async()=>{
 const {gavelMoveOpportunity}=await import('./trophies');const d=makeInitialData();
 const move=gavelMoveOpportunity(d.trophies,d.trophySettings,d.looseCharms)!;
 expect(move.charm).toEqual({type:'Mosaic',value:13});expect(move.to.modifiers).toContainEqual({mutation:'Secret',boostPct:113});expect(move.luck).toBe(52);expect(move.cost).toBe(50);
});
it('preserves charm and name on a backup round trip',async()=>{
 const {exportJson,importJson}=await import('../data/storage');const d=makeInitialData();
 expect(importJson(exportJson(d)).trophies).toEqual(d.trophies);
 expect(importJson(exportJson(d)).looseCharms).toEqual(d.looseCharms);
});
it('enforces Carnival slot restrictions when editing equipment',async()=>{
 const {validateGear}=await import('../components/GearEditor');
 const g=item('wrong','Head',{});g.authenticated=true;g.authentication={kind:'Carnival',effect:'Intermission',value:0};
 expect(validateGear(g)).toContain('Back only');
});
