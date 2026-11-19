import {expect,it} from 'vitest';
import {makeEmptyData,ZERO_STATS} from '../defaults';
import type {GearItem,OwnedCertificate} from '../types';
import {analyseCertificate} from './certificateDecision';
const gear=(id:string,slot:GearItem['slot'],stats:Partial<GearItem['stats']>={}):GearItem=>({id,baseName:id,name:id,slot,stats:{...ZERO_STATS,...stats},authenticated:false,authentication:{kind:'None',effect:'',value:0},favourite:false,createdAt:'',updatedAt:''});
const premium:OwnedCertificate={id:'p',type:'Premium Certificate of Authenticity',quantity:1};
it('evaluates Golden Hour maximum even when another owned item records a per-minute roll',()=>{
 const d=makeEmptyData();const seed=gear('rate','Back',{luck:10});seed.authenticated=true;seed.authentication={kind:'Premium',effect:'Golden Hour',value:1.2};
 d.gear=[gear('h','Head',{arrowReduction:100}),gear('target','Back',{luck:200}),seed,gear('w','Wrist')];
 const t=analyseCertificate(d,premium,undefined,'target').targets[0];
 expect(t.outcomes.find(o=>o.effect==='Golden Hour')?.unresolved).toBe(false);
 expect(t.bestRoll?.effect).toBe('Golden Hour');expect(t.bestRoll?.loadout.luck).toBe(300);
});
it('recognises safe Mutated Luck on an unauthenticated head without requiring spare gear',()=>{
 const d=makeEmptyData();const h=gear('h','Head',{arrowReduction:100,luck:100});h.mutation='Chrome';const b=gear('b','Back');b.mutation='Void';const w=gear('w','Wrist');w.mutation='Diamond';d.gear=[h,b,w];
 const t=analyseCertificate(d,premium,undefined,'h').targets[0];
 expect(t.bestRoll?.loadout.luck).toBe(190);expect(t.verdict).toBe('USE');
});
it('does not treat replacing a valuable existing bonus as automatically safe',()=>{
 const d=makeEmptyData();const h=gear('h','Head',{arrowReduction:100});h.authenticated=true;h.authentication={kind:'Normal',effect:'Sunny',value:100};d.gear=[h,gear('b','Back'),gear('w','Wrist')];
 expect(analyseCertificate(d,premium,undefined,'h').targets[0].verdict).toBe('DO NOT USE');
});
it('evaluates Limited back Luck Frenzy separately from Premium perks',()=>{
 const d=makeEmptyData();d.gear=[gear('h','Head',{arrowReduction:100}),gear('b','Back',{luck:100}),gear('w','Wrist')];
 const t=analyseCertificate(d,{id:'l',type:'Limited Certificate of Authenticity',quantity:1},undefined,'b').targets[0];
 expect(t.outcomes.map(o=>o.effect).sort()).toEqual(['Featherweight','Luck Frenzy']);expect(t.bestRoll?.effect).toBe('Luck Frenzy');expect(t.verdict).toBe('USE');
});
it('ranks the better resulting auction set ahead of assumed outcome probabilities',async()=>{
 const {compareCertificateTargets}=await import('./certificateDecision');const d=makeEmptyData();
 const a=gear('a','Head',{luck:100,arrowReduction:100});a.mutation='Chrome';const b=gear('b','Head',{luck:150,arrowReduction:100});b.mutation='Silver';const back=gear('back','Back');back.mutation='Void';const wrist=gear('w','Wrist');wrist.mutation='Diamond';d.gear=[a,b,back,wrist];
 const decision=analyseCertificate(d,premium);const higher=decision.targets.find(t=>t.item.id==='b')!,lower=decision.targets.find(t=>t.item.id==='a')!;
 expect(higher.bestRoll!.loadout.luck).toBeGreaterThan(lower.bestRoll!.loadout.luck);
 higher.improveChanceLowerPct.central=0;lower.improveChanceLowerPct.central=100;
 expect(compareCertificateTargets(higher,lower)).toBeLessThan(0);
});
it('accepts Arrow rolls above the minimum without penalising overshoot',()=>{
 const d=makeEmptyData();d.gear=[gear('h','Head',{arrowReduction:70}),gear('b','Back',{luck:100}),gear('w','Wrist')];
 const t=analyseCertificate(d,{id:'wooden',type:'Wooden Certificate of Authenticity',quantity:1},undefined,'b').targets[0];
 expect(t.bestRoll?.effect).toBe('Bid Arrow Speed');expect(t.bestRoll?.loadout.arrow).toBeGreaterThanOrEqual(95);
});
it('prefers an improvement under selected bonuses before drink-based sensitivity',()=>{
 const d=makeEmptyData();d.gear=[gear('h','Head',{arrowReduction:100}),gear('b','Back'),gear('w','Wrist')];
 const t=analyseCertificate(d,{id:'wooden',type:'Wooden Certificate of Authenticity',quantity:1},undefined,'h').targets[0];
 expect(t.bestRoll?.state).toBe('cautious');expect(t.bestRoll?.effect).toBe('Sunny');expect(t.bestRoll?.loadout.luck).toBe(100);
});
