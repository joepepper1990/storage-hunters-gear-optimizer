import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {makeInitialData} from '../test/legacyDefaults';
import {buildGearLoadouts} from '../engine/gearLoadouts';
import {BestSetCards} from './Equipment';
import {chanceText,NextCertificate} from './Certificates';
import type {CertificateTargetDecision} from '../engine/certificateDecision';
import type {CertificateQueueRow} from '../engine/certificateQueue';

it('separates the screenshot numeric Luck from the modelled passive total',()=>{
 const data=makeInitialData();const best=buildGearLoadouts(data.gear,data.settings).main!;
 const html=renderToStaticMarkup(<BestSetCards best={best}/>);
 expect(html).toContain('Item Luck <b>232</b>');
 expect(html).toContain('Modelled Luck <b>292</b>');
 expect(html).toContain('Includes +60 Luck from modelled effects');
});
function target():CertificateTargetDecision {
 return {item:makeInitialData().gear[0],verdict:'CONSIDER',wantedChancePct:50,unwantedOutcomePct:50,
 improveChanceLowerPct:{cautious:10,central:10,favourable:10},improveChancePct:{cautious:10,central:10,favourable:10},improveChanceUpperPct:40,
 selectedNeutralChanceLowerPct:20,selectedNeutralChanceUpperPct:40,
 unresolvedOutcomeMassPct:30,unresolvedEffects:['Focused'],worseChanceUpperPct:20,safeInCautious:true,currentArrow:77,currentArrowInBand:true,
 calculatedRanks:[]} as unknown as CertificateTargetDecision;
}
it('shows the equal-mod chance bounds for the current best set',()=>{
 expect(chanceText(target()).value).toBe('20%–40%');
 const data=makeInitialData();const row={certificate:data.ownedCertificates[0],target:target()} as CertificateQueueRow;
 const html=renderToStaticMarkup(<NextCertificate row={row} computing={false} hasCertificates details/>);
 expect(html).toContain('Improves best set');expect(html).toContain('20%–40%');
 expect(html).toContain('Equal mod chances; unknown strength gives range.');
 expect(html).toContain('Neutral set, fixed bonuses; all gear re-optimised.');
});
it('shows a point chance only when the strength bounds coincide',()=>{
 const t=target();t.selectedNeutralChanceLowerPct=50;t.selectedNeutralChanceUpperPct=50;
 expect(chanceText(t).value).toBe('50%');
 t.selectedNeutralChanceLowerPct=0;t.selectedNeutralChanceUpperPct=100;
 expect(chanceText(t).value).toBe('0%–100%');
});
it('rounds displayed probability bounds outwards',()=>{
 const t=target();t.selectedNeutralChanceLowerPct=100/9;t.selectedNeutralChanceUpperPct=200/9;
 expect(chanceText(t).value).toBe('11.1%–22.3%');
});
