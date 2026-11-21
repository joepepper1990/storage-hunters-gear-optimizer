// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {GearEditor} from './components/GearEditor';
import {makeInitialData} from './defaults';
import {cleanup,render,click,button,labelled} from './test/dom';
afterEach(cleanup);
it('clears the reviewed stats/authentication flags only after explicit verification',async()=>{
 const item={...makeInitialData().gear[0],needsReview:true,metadataUncertain:['displayedStats','authentication','conditionPct'],reviewNotes:'Check stats'};const save=vi.fn();
 const root=await render(<GearEditor item={item} mode="edit" onClose={()=>{}} onSave={save}/>);
 await click(button(root,'Save'));expect(save).not.toHaveBeenCalled();
 await click(labelled(root,'I verified') as HTMLInputElement);await click(button(root,'Save'));
 expect(save).toHaveBeenCalledOnce();expect(save.mock.calls[0][0].needsReview).toBe(false);expect(save.mock.calls[0][0].metadataUncertain).toEqual(['conditionPct']);
});
