import {it,expect} from 'vitest';
import {makeInitialData,ZERO_STATS} from '../defaults';
import {analyseConditionalNumberReroll} from './certificateDecision';
it('continuous range prior does not invent a 20% atom at the maximum',()=>{
 const d=makeInitialData();d.rollLog=[];
 d.gear=['Head','Back','Wrist'].map((slot,i)=>({id:String(i),baseName:slot,name:slot,slot:slot as 'Head'|'Back'|'Wrist',stats:{...ZERO_STATS,luck:100},authenticated:i===0,authentication:i===0?{kind:'Normal' as const,effect:'Bid Zone Width',value:75}:{kind:'None' as const,effect:'',value:0},favourite:false,createdAt:'2026-10-27',updatedAt:'2026-10-27'}));
 d.authModel=d.authModel.filter(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Zone Width').map(m=>({...m,min:15,max:75,typical:undefined,observedValues:[],observedSampleCount:0}));
 const roll={id:'r',date:'2026-10-27',certificateType:'Normal Certificate of Authenticity' as const,itemId:'0',itemName:'Head',slot:'Head' as const,previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:75,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0};
 const cert={id:'c',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2};
 expect(analyseConditionalNumberReroll(d,roll,cert)!.chanceAnyWorsePct).toBeCloseTo(100,6);
 roll.newValue=45;d.gear[0].authentication.value=45;
 expect(analyseConditionalNumberReroll(d,roll,cert)!.chanceAnyWorsePct).toBeCloseTo(50,6);
});
