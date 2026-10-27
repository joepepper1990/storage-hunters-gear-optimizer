import {it,expect} from 'vitest';
import {makeInitialData} from '../defaults';
import {effectiveItemStats} from './scoring';
import {editAuthentication} from './certificateRolls';
it('changing effect or value discards previous observed deltas, but unchanged identity preserves them',()=>{
 const item=makeInitialData().gear[0];item.stats.luck=100;item.authenticated=true;item.authentication={kind:'Normal',effect:'Focused',value:25,statDeltas:{luck:25}};
 const same=editAuthentication(item.authentication,{effect:'Focused'});expect(same.statDeltas).toEqual({luck:25});
 const changed=editAuthentication(item.authentication,{effect:'Luck',value:10});expect(effectiveItemStats({...item,authentication:changed}).luck).toBe(110);
 expect(editAuthentication(item.authentication,{value:30}).statDeltas).toBeUndefined();
});
