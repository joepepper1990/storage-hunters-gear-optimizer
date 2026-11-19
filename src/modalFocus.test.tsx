// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Modal } from './ui';
import { cleanup } from './test/dom';
import { createRoot } from 'react-dom/client';
afterEach(cleanup);
it('keeps the authentication result focused when its dialog rerenders',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const view=(close:()=>void)=><Modal title="Record result" onClose={close}><label>Result<select defaultValue=""><option value="">Select</option><option>Mutated Luck</option></select></label></Modal>;
 try {
 await act(async()=>root.render(view(()=>{})));
 const select=document.body.querySelector('select')!;select.focus();
 expect(document.activeElement).toBe(select);
 await act(async()=>root.render(view(()=>{})));
 expect(document.activeElement).toBe(select);
 } finally {await act(async()=>root.unmount());host.remove();}
});
it('uses the latest close callback on Escape without refocusing the dialog',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const first=vi.fn(),latest=vi.fn();
 const view=(close:()=>void)=><Modal title="Record result" onClose={close}><select><option>Select</option></select></Modal>;
 try {await act(async()=>root.render(view(first)));await act(async()=>root.render(view(latest)));
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(latest).toHaveBeenCalledOnce();expect(first).not.toHaveBeenCalled();
 } finally {await act(async()=>root.unmount());host.remove();}
});
