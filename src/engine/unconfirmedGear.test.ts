import {expect,it} from 'vitest';
import {makeInitialData} from '../defaults';
import {optimise} from './optimizer';
import {buildGearLoadouts,analyseGearRetention} from './gearLoadouts';
import {validateGear} from '../components/GearEditor';
it('excludes unconfirmed stats from best sets and always retains their records',()=>{
 const d=makeInitialData();const confirmed=d.gear.filter(g=>!g.needsReview);const base=optimise(confirmed,d.settings,1)[0];
 const unknown={...base.head,id:'unchecked',needsReview:true,stats:{...base.head.stats,luck:100000,arrowReduction:1000}};
 const gear=[...confirmed,unknown];expect(optimise(gear,d.settings,1)[0].head.id).not.toBe('unchecked');expect(buildGearLoadouts(gear,d.settings).main?.head.id).not.toBe('unchecked');
 expect(analyseGearRetention(gear,d.settings).find(r=>r.item.id==='unchecked')?.verdict).toBe('KEEP');expect(validateGear(unknown)).toContain('Verify');
});
