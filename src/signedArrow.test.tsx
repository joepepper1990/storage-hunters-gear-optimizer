// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import { GearEditor,blankGear } from './components/GearEditor';
import { RecordResultEditor } from './components/CertificateEditors';
import { makeEmptyData } from './defaults';
import { effectiveItemStats } from './engine/scoring';
import { render,cleanup,labelled,type,click,button } from './test/dom';
afterEach(cleanup);
it('preserves a typed minus sign in the equipment authentication value and saves negative Arrow',async()=>{
 const item=blankGear('Head');item.baseName='Test Hat';item.authenticated=true;item.authentication={kind:'Normal',effect:'Bid Arrow Speed',value:0};const save=vi.fn();
 const root=await render(<GearEditor item={item} mode="edit" onClose={()=>{}} onSave={save}/>);
 const value=labelled(root,'Value') as HTMLInputElement;await type(value,'-');expect(value.value).toBe('-');
 await type(value,'-24');await click(button(root,'Save'));
 expect(save.mock.calls[0][0].authentication.value).toBe(-24);expect(effectiveItemStats(save.mock.calls[0][0]).arrowReduction).toBe(24);
});
it('offers a minus toggle when recording an Arrow result on a phone',async()=>{
 const data=makeEmptyData();const item=blankGear('Head');item.baseName='Test Hat';data.gear=[item];const save=vi.fn();
 const cert={id:'cert',type:'Wooden Certificate of Authenticity' as const,quantity:1};
 const root=await render(<RecordResultEditor data={data} certificate={cert} onClose={()=>{}} onSave={save}/>);
 await type(labelled(root,'Result') as HTMLSelectElement,'Bid Arrow Speed');
 const value=labelled(root,'Value') as HTMLInputElement;await type(value,'24');
 const toggle=value.parentElement!.querySelector<HTMLButtonElement>('button[aria-label="Toggle minus sign"]');expect(toggle).not.toBeNull();await click(toggle!);
 expect(value.value).toBe('-24');await click(button(root,'Save result'));
 expect(save.mock.calls[0][0].newValue).toBe(-24);expect(effectiveItemStats(save.mock.calls[0][1]).arrowReduction).toBe(24);
});
