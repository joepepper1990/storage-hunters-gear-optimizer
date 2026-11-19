// @vitest-environment jsdom
import {useState} from 'react';
import {afterEach,expect,it} from 'vitest';
import {makeEmptyData,ZERO_STATS} from '../defaults';
import {buildGearLoadouts} from '../engine/gearLoadouts';
import {cleanup,render,type} from '../test/dom';
import {Home} from './Home';
afterEach(cleanup);
it('links both slider outputs to achievable stats without editable passive assumptions',async()=>{
 const initial=makeEmptyData();const item=(id:string,slot:'Head'|'Back'|'Wrist',luck:number,arrowReduction:number)=>({id,name:id,baseName:id,slot,stats:{...ZERO_STATS,luck,arrowReduction},authenticated:false,authentication:{kind:'None' as const,effect:'',value:0},favourite:false,createdAt:'',updatedAt:''});
 initial.gear=[item('fast','Head',100,30),item('slow','Head',20,100),item('b','Back',0,0),item('w','Wrist',0,0)];
 function Harness(){const [data,setData]=useState(initial);return <Home data={data} setData={setData} best={buildGearLoadouts(data.gear,data.settings).main} view={{ready:true,keep:[],discard:[],gavelDiscard:[]}} onOpen={()=>{}} onAdd={()=>{}}/>;}
 const root=await render(<Harness/>);const arrow=root.querySelector<HTMLInputElement>('#arrow-target')!;const luck=root.querySelector<HTMLInputElement>('#luck-target')!;
 expect(luck.value).toBe('20');await type(luck,'100');expect(arrow.value).toBe('30');expect(root.querySelector('.heroLuck strong')?.textContent).toBe('100%');
 await type(arrow,'100');expect(luck.value).toBe('20');expect(root.querySelector('.heroLuck strong')?.textContent).toBe('20%');
 expect(root.querySelector('[aria-label="Golden Hour Luck"]')).toBeNull();
 expect(root.querySelectorAll('input[type=number],select')).toHaveLength(0);
});
