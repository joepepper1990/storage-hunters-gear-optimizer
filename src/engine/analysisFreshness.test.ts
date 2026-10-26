import { describe, expect, it } from 'vitest';
import { LOCKED_DEFAULT_SETTINGS, makeInitialData } from '../defaults';
import type { GearItem } from '../types';
import { certificateInputKey, optimisationInputKey } from './analysisFreshness';

const now='2026-10-26T00:00:00Z';
function item():GearItem{
  return {
    id:'x',baseName:'X',name:'X',slot:'Head',
    stats:{luck:10,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0},
    authenticated:false,authentication:{kind:'None',effect:'',value:0},
    favourite:false,createdAt:now,updatedAt:now
  };
}

describe('optimiser result freshness',()=>{
  it('changes immediately when a gear value relevant to discard decisions changes',()=>{
    const gear=[item()];
    const before=optimisationInputKey(gear,LOCKED_DEFAULT_SETTINGS);
    const changed=structuredClone(gear);
    changed[0].stats.luck=500;
    expect(optimisationInputKey(changed,LOCKED_DEFAULT_SETTINGS)).not.toBe(before);
  });

  it('changes when favourite or authentication state changes',()=>{
    const gear=[item()];
    const before=optimisationInputKey(gear,LOCKED_DEFAULT_SETTINGS);
    const favourite=structuredClone(gear);favourite[0].favourite=true;
    const auth=structuredClone(gear);auth[0].authenticated=true;auth[0].authentication={kind:'Normal',effect:'Sunny',value:100};
    expect(optimisationInputKey(favourite,LOCKED_DEFAULT_SETTINGS)).not.toBe(before);
    expect(optimisationInputKey(auth,LOCKED_DEFAULT_SETTINGS)).not.toBe(before);
  });
  it('invalidates certificate results when catalogue, history or owned certificate state changes',()=>{
    const data=makeInitialData();
    const before=certificateInputKey(data);

    const catalogue=structuredClone(data);
    catalogue.authModel[0].enabled=!catalogue.authModel[0].enabled;
    expect(certificateInputKey(catalogue)).not.toBe(before);

    const inventory=structuredClone(data);
    inventory.ownedCertificates[0].quantity+=1;
    expect(certificateInputKey(inventory)).not.toBe(before);

    const history=structuredClone(data);
    history.rollLog.push({
      id:'freshness-roll',date:now,certificateType:'Normal Certificate of Authenticity',
      certificateInventoryType:'Wooden Certificate of Authenticity',itemId:data.gear[0].id,itemName:data.gear[0].name,
      slot:data.gear[0].slot,previousAuthentication:'',previousValue:0,newAuthentication:'Bid Zone Width',newValue:20,
      improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0
    });
    expect(certificateInputKey(history)).not.toBe(before);
  });

});
