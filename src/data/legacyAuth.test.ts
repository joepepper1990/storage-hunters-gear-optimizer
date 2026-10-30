import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { normalizeData } from './storage';
import { buildGearLoadouts } from '../engine/gearLoadouts';
import { catalogueRowsFor } from '../engine/authModel';
import type { AppData, GearItem } from '../types';

function legacy(effect:string,kind:GearItem['authentication']['kind']='Normal',id=effect):GearItem {
  return {id,baseName:'Old '+id,name:'Old '+id,slot:'Back',stats:{luck:10,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:30,npc:0},
    authenticated:true,authentication:{kind,effect,value:12},favourite:false,createdAt:'',updatedAt:''};
}

describe('legacy authentications stay readable',()=>{
  it('loads old Luck, Fossil Finder and Alien gear and canonicalises alias spellings',()=>{
    const raw={...makeInitialData(),schemaVersion:18,gear:[
      legacy('Luck'),legacy('Fossil Finder','Limited'),legacy('Haggler','Alien'),
      legacy('Droughtbreaker','Premium'),legacy('Club Packed','Premium','cp'),legacy('Timekeeper','Normal','tk')
    ]} as unknown as AppData;
    const data=normalizeData(raw,{preserveInventory:true});
    expect(data.schemaVersion).toBe(19);
    expect(data.gear.map(g=>g.authentication.effect)).toEqual(['Luck','Fossil Finder','Haggler','Drought Breaker','Club Pact','Time Keeper']);
    // A legacy plain-Luck authentication still adds Luck in the loadout engine.
    const loadouts=buildGearLoadouts([...data.gear.slice(0,1),
      {...data.gear[0],id:'h',slot:'Head',authenticated:false,authentication:{kind:'None',effect:'',value:0}},
      {...data.gear[0],id:'w',slot:'Wrist',authenticated:false,authentication:{kind:'None',effect:'',value:0}}],data.settings);
    expect(loadouts.main!.stats.luck).toBe(10+12+10+10);
  });

  it('merges alias catalogue rows and marks plain Luck rows as history only, keeping observations',()=>{
    const base=makeInitialData();
    const premiumBack=base.authModel.find(r=>r.certificateInventoryType==='Premium Certificate of Authenticity'&&r.outcome==='Drought Breaker')!;
    const raw={...base,schemaVersion:18,authModel:[
      ...base.authModel.filter(r=>r!==premiumBack),
      {...premiumBack,id:'old',outcome:'Droughtbreaker',observedValues:[18],observedSampleCount:1},
      {...premiumBack,id:'new',outcome:'Drought Breaker',observedValues:[20],observedSampleCount:1},
      {...premiumBack,id:'luck',certificateInventoryType:'Wooden Certificate of Authenticity',certificateType:'Normal Certificate of Authenticity',slot:'Any',outcome:'Luck',category:'Wooden basic — range unresolved',observedValues:[7],observedSampleCount:1}
    ]} as unknown as AppData;
    const data=normalizeData(raw,{preserveInventory:true});
    const drought=data.authModel.filter(r=>r.certificateInventoryType==='Premium Certificate of Authenticity'&&r.slot==='Back'&&r.outcome==='Drought Breaker');
    expect(drought).toHaveLength(1);
    expect(drought[0].observedValues.sort()).toEqual([18,20]);
    const luck=data.authModel.find(r=>r.outcome==='Luck')!;
    expect(luck.enabled).toBe(false);
    expect(luck.observedValues).toEqual([7]);
    expect(catalogueRowsFor(data.authModel,'Premium Certificate of Authenticity','Back').map(r=>r.outcome).sort()).toEqual(['Drought Breaker','Golden Hour']);
    expect(catalogueRowsFor(data.authModel,'Wooden Certificate of Authenticity','Back').map(r=>r.outcome)).not.toContain('Luck');
  });

  it('moves old Arrow settings to the fixed 70-90 band',()=>{
    const settings=(version:string,arrowSweetSpot:number)=>normalizeData({...makeInitialData(),schemaVersion:18,
      settings:{...makeInitialData().settings,version,arrowSweetSpot}} as unknown as AppData).settings;
    for(const [version,start] of [['2.1',65],['2.0',75],['2.1',72],['2.1',95]] as const){
      const s=settings(version,start);
      expect([s.arrowTargetMin,s.arrowTargetMax,s.version]).toEqual([70,90,'2.3']);
    }
  });
});
