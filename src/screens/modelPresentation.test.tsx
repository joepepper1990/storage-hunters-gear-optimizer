import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {makeInitialData} from '../defaults';
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
 unresolvedOutcomeMassPct:30,unresolvedEffects:['Focused'],worseChanceUpperPct:20,safeInCautious:true,currentArrow:77,currentArrowInBand:true,
 calculatedRanks:[]} as unknown as CertificateTargetDecision;
}
it('identifies unresolved strengths separately from active-effect scenarios',()=>{
 expect(chanceText(target()).detail).toContain('unresolved roll strengths');
 expect(chanceText(target()).detail).not.toContain('active effects');
 const dynamic=target();dynamic.improveChancePct.central=20;
 expect(chanceText(dynamic).detail).toContain('active-effect scenarios');
 expect(chanceText(dynamic).detail).toContain('unresolved roll strengths');
});
it('labels certificate estimates and contextual downside without promising safety',()=>{
 const data=makeInitialData();const row={certificate:data.ownedCertificates[0],target:target()} as CertificateQueueRow;
 const html=renderToStaticMarkup(<NextCertificate row={row} computing={false} hasCertificates details/>);
 expect(html).toContain('Model estimate');expect(html).toContain('not official game odds');
 expect(html).toContain('equal effect odds');expect(html).toContain('unresolved roll strengths');
 expect(html).toContain('Main, Day, Night or Rain');expect(html).not.toContain(' · safe');
});
