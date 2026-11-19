import {expect,it} from 'vitest';
import {makeEmptyData,ZERO_STATS} from '../defaults';
import {optimise} from './optimizer';
import {buildGearLoadouts} from './gearLoadouts';
import {arrowBandDistance} from './scoring';
import {normalizeData} from '../data/storage';
import type {GearItem} from '../types';
const item=(id:string,arrow:number,luck:number):GearItem=>({id,name:id,baseName:id,slot:'Head',stats:{...ZERO_STATS,arrowReduction:arrow,luck},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''});
function setup(heads:GearItem[]){const d=makeEmptyData();d.gear=[...heads,{...item('b',0,0),slot:'Back'},{...item('w',0,0),slot:'Wrist'}];return d;}
it('treats 95 and every higher Arrow value as satisfied',()=>{const s=makeEmptyData().settings;expect(arrowBandDistance(94,s)).toBe(1);for(const a of [95,100,140,500])expect(arrowBandDistance(a,s)).toBe(0);});
it('prioritises reaching the minimum over Luck, then maximises Luck without an overshoot penalty',()=>{
 for(const heads of [[item('below',94,999),item('at',95,10)],[item('at',95,10),item('above',140,100)]]){const d=setup(heads);for(const best of [optimise(d.gear,d.settings,1)[0],buildGearLoadouts(d.gear,d.settings).main!])expect(best.head.id).toBe(heads[1].id);}
});
it('chooses the smallest shortfall if no set reaches the minimum, even in Luck exploration',()=>{const d=setup([item('weak',80,100),item('closer',94,1)]);d.settings={...d.settings,goalMode:'luck',luckTarget:100};expect(buildGearLoadouts(d.gear,d.settings).main?.head.id).toBe('closer');expect(optimise(d.gear,d.settings,1)[0].head.id).toBe('closer');});
it('migrates old closest-target preferences to 95 without changing inventory',()=>{const d=makeEmptyData();delete d.settings.arrowPolicy;d.settings.arrowTargetMin=100;d.settings.arrowTargetMax=100;d.settings.goalMode='luck';d.settings.luckTarget=1;const restored=normalizeData(d);expect(restored.settings).toMatchObject({arrowPolicy:'minimum',arrowTargetMin:95,goalMode:'arrow'});expect(restored.gear).toEqual(d.gear);});
