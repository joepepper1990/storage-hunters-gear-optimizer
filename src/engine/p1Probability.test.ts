import {it,expect} from 'vitest';
import {makeInitialData,ZERO_STATS} from '../defaults';
import {analyseConditionalNumberReroll} from './certificateDecision';
it('continuous range prior does not invent a 20% atom at the maximum',()=>{
 const d=makeInitialData();d.rollLog=[];
 d.gear=['Head','Back','Wrist'].map((slot,i)=>({id:String(i),baseName:slot,name:slot,slot:slot as 'Head'|'Back'|'Wrist',stats:{...ZERO_STATS,luck:100},authenticated:i===0,authentication:i===0?{kind:'Normal' as const,effect:'Bid Zone Width',value:75}:{kind:'None' as const,effect:'',value:0},favourite:false,createdAt:'2026-10-27',updatedAt:'2026-10-27'}));
 d.authModel=d.authModel.filter(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width').map(m=>({...m,min:15,max:75,typical:undefined,observedValues:[],observedSampleCount:0}));
 const roll={id:'r',date:'2026-10-27',certificateType:'Normal Certificate of Authenticity' as const,itemId:'0',itemName:'Head',slot:'Head' as const,previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:75,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0};
 const cert={id:'c',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
 expect(analyseConditionalNumberReroll(d,roll,cert)!.worseChancePct).toBeCloseTo(100,6);
 roll.newValue=45;d.gear[0].authentication.value=45;
 expect(analyseConditionalNumberReroll(d,roll,cert)!.worseChancePct).toBeCloseTo(50,6);
});
it('affected-trio optimisation matches the full enumeration number evaluator',async()=>{
 const {analyseCertificate}=await import('./certificateDecision');
 const d=makeInitialData();d.rollLog=[];
 d.gear=d.gear.filter(g=>g.slot==='Wrist').slice(0,1).concat(d.gear.filter(g=>g.slot==='Back').slice(0,2),d.gear.filter(g=>g.slot==='Head').slice(0,3)).map(g=>({...g,authenticated:false,authentication:{kind:'None' as const,effect:'',value:0}}));
 const h=d.gear.find(g=>g.slot==='Head')!;
 d.authModel=d.authModel.filter(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width').map(m=>({...m,min:15,max:75,typical:undefined,observedValues:[],observedSampleCount:0}));
 const cert={id:'c',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
 const roll={id:'r',date:'2026-10-27',certificateType:'Normal Certificate of Authenticity' as const,itemId:h.id,itemName:h.name,slot:'Head' as const,previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:0,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0};
 const brute=analyseConditionalNumberReroll(d,roll,cert)!;
 const target=analyseCertificate(d,cert).targets.find(t=>t.item.id===h.id)!;
 expect(target.outcomes.find(o=>o.effect==='Bid Zone Width')!.improvePct.cautious).toBeCloseTo(brute.improveChancePct,9);
});
