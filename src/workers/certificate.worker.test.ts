import {afterEach,expect,it,vi} from 'vitest';
import {makeEmptyData} from '../defaults';
import {analyseOwnedCertificates} from '../engine/certificateDecision';
import {analyseActivePostRoll} from '../engine/certificateReroll';
vi.mock('../engine/certificateDecision',()=>({analyseOwnedCertificates:vi.fn(()=>[])}));
vi.mock('../engine/certificateReroll',()=>({analyseActivePostRoll:vi.fn(()=>undefined)}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('paid advice request never waits for owned certificate analysis',async()=>{
 const worker={onmessage:undefined as any,postMessage:vi.fn()};vi.stubGlobal('self',worker);vi.resetModules();await import('./certificate.worker');
 worker.onmessage({data:{id:1,data:makeEmptyData(),mode:'postRoll',activePostRollId:'live'}});
 expect(analyseOwnedCertificates).not.toHaveBeenCalled();expect(analyseActivePostRoll).toHaveBeenCalled();
});
it('owned advice request does not run paid advice',async()=>{
 const worker={onmessage:undefined as any,postMessage:vi.fn()};vi.stubGlobal('self',worker);vi.resetModules();await import('./certificate.worker');
 worker.onmessage({data:{id:2,data:makeEmptyData(),mode:'owned'}});
 expect(analyseOwnedCertificates).toHaveBeenCalled();expect(analyseActivePostRoll).not.toHaveBeenCalled();
});
