// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {Modal} from './ui';
import {cleanup,render} from './test/dom';
afterEach(cleanup);
it('keeps dialog actions outside the page scroller and outside the form scroller',async()=>{
 const root=await render(<main style={{overflow:'auto',transform:'translateZ(0)'}}><Modal title="Record result" onClose={()=>{}} actions={<button>Save result</button>}><label>Result<select><option>Luck</option></select></label></Modal></main>);
 const main=root.querySelector('main')!;const dialog=document.querySelector('[role=dialog]')!;
 expect(main.contains(dialog)).toBe(false);
 expect(dialog.querySelector('.modalBody select')).toBeTruthy();
 expect(dialog.querySelector('.modalBody .stickyActions')).toBeNull();
 expect(dialog.querySelector('.stickyActions button')?.textContent).toBe('Save result');
});
