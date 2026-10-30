import {describe,it,expect} from 'vitest';
import {makeInitialData,makeEmptyData} from '../defaults';
import {selectNewestStoredSnapshot,saveEmergencyMirror,saveData,loadData} from '../data/storage';
import {empiricalSupports,analyseOwnedCertificates,certificateOutcomeLikelihoods} from './certificateDecision';

describe('P2 statistical and recovery integrity',()=>{
  it('preserves observed frequencies and rare tails without quantile compression',()=>{
    const points=empiricalSupports([...Array(99).fill(10),100],1);
    expect(points.find(p=>p.value===100)?.weight).toBeCloseTo(.01);
    expect(points.find(p=>p.value===10)?.weight).toBeCloseTo(.99);
  });
  it('orders same-millisecond snapshots by revision regardless of source',()=>{
    const old={savedAt:100,revision:1,data:makeInitialData()};
    const fresh={savedAt:100,revision:2,data:makeEmptyData()};
    expect(selectNewestStoredSnapshot(old,fresh)).toBe(fresh);
    expect(selectNewestStoredSnapshot(fresh,old)).toBe(fresh);
  });
  it('does not reintroduce mismatched rolls through derived catalogue counts',()=>{
    const data=makeInitialData();
    const cert={id:'known',type:'Wooden Certificate of Authenticity' as const,quantity:1,gradeStars:2,mutation:'Onyx'};
    const before=certificateOutcomeLikelihoods(data,cert,'Head');
    data.rollLog=[{id:'mismatch',date:'2026-10-26',certificateType:'Normal Certificate of Authenticity',certificateInventoryType:cert.type,certificateGradeStars:1,certificateMutation:'Diamond',itemId:'h',itemName:'h',slot:'Head',previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:75,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0}];
    data.authModel=data.authModel.map(m=>m.certificateInventoryType===cert.type&&m.outcome==='Bid Zone Width'?{...m,observedValues:[75],observedSampleCount:1}:m);
    expect(certificateOutcomeLikelihoods(data,cert,'Head')).toEqual(before);
  });
  it('orders modern revisions correctly when the wall clock moves backwards',()=>{
    const a={savedAt:200,revision:1,data:makeEmptyData()};
    const b={savedAt:100,revision:2,data:makeEmptyData()};
    expect(selectNewestStoredSnapshot(a,b)).toBe(b);
  });
  it('allocates distinct mirror revisions even within one millisecond',()=>{
    const memory=new Map<string,string>();
    const previous=globalThis.localStorage;
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)}});
    try {
      saveEmergencyMirror(makeEmptyData(),100);
      const first=JSON.parse([...memory.values()][0]);
      saveEmergencyMirror(makeInitialData(),100);
      const second=JSON.parse([...memory.values()][0]);
      expect(second.revision).toBeGreaterThan(first.revision);
      expect(selectNewestStoredSnapshot(first,second)).toBe(second);
    } finally {Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous});}
  });
  it('a delayed autosave cannot overwrite a newer synchronous pagehide mirror',async()=>{
    const memory=new Map<string,string>();
    const oldStorage=globalThis.localStorage,oldDb=globalThis.indexedDB;
    let stored:unknown;
    const asyncRequest=(result:unknown)=>{const req:any={result};queueMicrotask(()=>req.onsuccess?.());return req;};
    const db={close:()=>{},transaction:()=>{const tx:any={objectStore:()=>({put:(value:unknown)=>{stored=value;queueMicrotask(()=>tx.oncomplete?.());return asyncRequest(undefined);},get:()=>asyncRequest(stored)})};return tx;}};
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)}});
    Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>asyncRequest(db)}});
    try {
      const old=makeEmptyData(),fresh=makeEmptyData();
      fresh.ownedCertificates=[{id:'newest',type:'Wooden Certificate of Authenticity',quantity:7}];
      const pending=saveData(old);
      saveEmergencyMirror(fresh);
      await pending;
      expect(JSON.parse([...memory.values()][0]).data.ownedCertificates[0].id).toBe('newest');
      expect((await loadData()).ownedCertificates[0]).toMatchObject({id:'newest',quantity:7});
    } finally {
      Object.defineProperty(globalThis,'localStorage',{configurable:true,value:oldStorage});
      Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:oldDb});
    }
  });
  it('rejects autosave if the IndexedDB transaction aborts and the mirror also fails',async()=>{
    const oldStorage=globalThis.localStorage,oldDb=globalThis.indexedDB;
    const db={close:()=>{},transaction:()=>{
      const tx:any={error:new Error('commit aborted'),objectStore:()=>({get:()=>{const req:any={result:undefined};queueMicrotask(()=>req.onsuccess?.());return req;},put:()=>{
        const req:any={};
        queueMicrotask(()=>{req.onsuccess?.();queueMicrotask(()=>tx.onabort?.());});
        return req;
      }})};return tx;
    }};
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw new Error('quota');}}});
    Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>{const req:any={result:db};queueMicrotask(()=>req.onsuccess?.());return req;}}});
    try {await expect(saveData(makeEmptyData())).rejects.toThrow('Local autosave failed');}
    finally {
      Object.defineProperty(globalThis,'localStorage',{configurable:true,value:oldStorage});
      Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:oldDb});
    }
  });
  it('never uses certificate rarity, cost or a Premium conversion in the recommendation',()=>{
    const data=makeInitialData();
    data.gear=[...new Map(data.gear.map(g=>[g.slot,g])).values()];
    for(const decision of analyseOwnedCertificates(data))expect('conversion' in decision).toBe(false);
  });
});
