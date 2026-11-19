import {expect,it} from 'vitest';
import {makeInitialData} from '../defaults';
import {optimise} from './optimizer';
import {buildGearLoadouts,defaultDynamicState} from './gearLoadouts';
it('locks passive assumptions even when old preferences exist',()=>{
 const d=makeInitialData();expect(defaultDynamicState({...d.settings,goldenHourLuck:4,droughtbreakerStacks:5,intermissionLuck:125})).toMatchObject({goldenHourLuck:100,droughtbreakerStacks:0,intermissionLuck:0});
});
it('selects Luck endpoints and intermediate targets consistently in both engines',()=>{
 const d=makeInitialData();const all=optimise(d.gear,d.settings,10000);const minShortfall=Math.min(...all.map(c=>Math.max(0,d.settings.arrowTargetMin-c.stats.arrowReduction)));const lucks=all.filter(c=>Math.max(0,d.settings.arrowTargetMin-c.stats.arrowReduction)===minShortfall).map(c=>c.stats.luck);
 for(const target of [Math.min(...lucks),Math.max(...lucks),(Math.min(...lucks)+Math.max(...lucks))/2]){
 const settings={...d.settings,goalMode:'luck' as const,luckTarget:target};const result=optimise(d.gear,settings,1)[0];const best=buildGearLoadouts(d.gear,settings).main!;
 expect(Math.abs(result.stats.luck-target)).toBeCloseTo(Math.min(...lucks.map(l=>Math.abs(l-target))));
 expect([best.head.id,best.back.id,best.wrist.id]).toEqual([result.head.id,result.back.id,result.wrist.id]);
 }
});

it('uses the same final tie-break and keeps lower-Luck future alternatives',async()=>{
 const {ZERO_STATS}=await import('../defaults');const {hasSafeReplacement}=await import('./retention');
 const d=makeInitialData();const item=(id:string,slot:'Head'|'Back'|'Wrist',luck:number)=>({...d.gear[0],id,baseName:id,name:id,slot,stats:{...ZERO_STATS,luck},authenticated:false,authentication:{kind:'None' as const,effect:'',value:0}});
 const gear=[item('a','Head',40),item('z','Head',60),item('b','Back',0),item('w','Wrist',0)];
 const settings={...d.settings,goalMode:'luck' as const,luckTarget:50};
 expect(optimise(gear,settings,1)[0].head.id).toBe(buildGearLoadouts(gear,settings).main?.head.id);
 expect(hasSafeReplacement(gear[0],gear,settings)).toBe(false);
 expect(hasSafeReplacement(gear[0],gear,{...settings,goalMode:'arrow'})).toBe(false);
});
it('round trips slider preferences and replaces old editable bonus assumptions',async()=>{
 const {importJson,exportJson}=await import('../data/storage');const d=makeInitialData();d.settings={...d.settings,goalMode:'luck',luckTarget:272,goldenHourLuck:5,droughtbreakerStacks:5,intermissionLuck:125};
 const restored=importJson(exportJson(d));expect(restored.settings).toMatchObject({goalMode:'luck',luckTarget:272,goldenHourLuck:100,droughtbreakerStacks:0,intermissionLuck:0});expect(restored.gear).toEqual(d.gear);
});
it('does not call a Luck addition safe when it overshoots the chosen target',async()=>{
 const {makeEmptyData,ZERO_STATS}=await import('../defaults');const {analyseCertificate}=await import('./certificateDecision');const d=makeEmptyData();
 const item=(id:string,slot:'Head'|'Back'|'Wrist')=>({...makeInitialData().gear[0],id,name:id,baseName:id,slot,stats:{...ZERO_STATS,luck:slot==='Head'?100:0,arrowReduction:slot==='Head'?100:0},authenticated:false,authentication:{kind:'None' as const,effect:'',value:0},mutation:slot==='Head'?'Chrome':'None'});
 d.gear=[item('h','Head'),item('b','Back'),item('w','Wrist')];d.settings={...d.settings,goalMode:'luck',luckTarget:100};
 const target=analyseCertificate(d,{id:'p',type:'Premium Certificate of Authenticity',quantity:1},undefined,'h').targets[0];
 expect(target.safeInCautious).toBe(false);expect(target.verdict).not.toBe('USE');
});
