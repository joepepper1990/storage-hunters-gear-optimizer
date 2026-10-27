import type { GavelTrophy, OwnedCertificate, TrophyModifier } from '../types';
import { generateTrophyName } from '../naming';

const WHEN = '2026-10-17T00:00:00.000Z';
type TrophySeed={id:string;rolls:[string,number][];conditionPct?:number;verifiedAt?:string};
/** The user's complete Gavel inventory from the 27 October 2026 screenshots (18 trophies:
 * fourteen in inventory, four on displays). Display tooltips do not show condition. Charm
 * perks shown on displays (Mint Charm, Magnifier Charm) are not mutation boosts and are not modelled.
 */
const GAVELS:TrophySeed[]=[
  {id:'hologram154-silver143',rolls:[['Hologram',154],['Silver',143]],conditionPct:54},
  {id:'hologram157-chrome76',rolls:[['Hologram',157],['Chrome',76]]},
  {id:'hologram124-chrome123-diamond34',rolls:[['Hologram',124],['Chrome',123],['Diamond',34]]},
  {id:'void86',rolls:[['Void',86]]},
  {id:'chrome133-diamond129',rolls:[['Chrome',133],['Diamond',129]],conditionPct:97},
  {id:'hologram93-silver161',rolls:[['Hologram',93],['Silver',161]],conditionPct:90},
  {id:'huge188-chrome24',rolls:[['Huge',188],['Chrome',24]],conditionPct:93},
  {id:'hologram125',rolls:[['Hologram',125]],conditionPct:85},
  {id:'gem194',rolls:[['Gem',194]],conditionPct:93},
  {id:'hologram142',rolls:[['Hologram',142]],conditionPct:90},
  {id:'sandy167',rolls:[['Sandy',167]],conditionPct:92},
  {id:'void47',rolls:[['Void',47]],conditionPct:59,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'tiny103-hologram121',rolls:[['Tiny',103],['Hologram',121]],conditionPct:55,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'void147-gold146',rolls:[['Void',147],['Gold',146]],verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'void74',rolls:[['Void',74]],conditionPct:92,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'corrupted44',rolls:[['Corrupted',44]],conditionPct:60,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'diamond91',rolls:[['Diamond',91]],conditionPct:84,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'gold94',rolls:[['Gold',94]],conditionPct:75,verifiedAt:'2026-10-27T00:00:00.000Z'}
];

export function screenshotTrophies():GavelTrophy[]{
  return GAVELS.map(s=>{
    const modifiers:TrophyModifier[]=s.rolls.map(([mutation,boostPct])=>({mutation,boostPct}));
    const when=s.verifiedAt??WHEN;
    return {id:`verified-oct17-gavel-${s.id}`,name:generateTrophyName(modifiers),
      modifiers,conditionPct:s.conditionPct,favourite:false,createdAt:when,updatedAt:when};
  });
}
/** The user's complete certificate inventory from the 27 October 2026 screenshots (nine). */
export function screenshotCertificates():OwnedCertificate[]{
  return [
    {id:'verified-oct26-cert-limited-6291',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:6291,gradeStars:2,rarity:'Limited'},
    {id:'verified-oct26-cert-limited-5967',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:5967,gradeStars:2,rarity:'Limited'},
    {id:'verified-oct26-cert-premium-4641',type:'Premium Certificate of Authenticity',quantity:1,displayedValue:4641,gradeStars:1},
    {id:'verified-oct27-cert-wooden-2646',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2646,gradeStars:2},
    {id:'verified-oct26-cert-wooden-2451-60',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2451.60,gradeStars:2},
    {id:'verified-oct27-cert-wooden-2451-60-second',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2451.60,gradeStars:2},
    {id:'verified-oct26-cert-wooden-2397-60',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2397.60,gradeStars:2},
    {id:'verified-oct26-cert-wooden-2203-20',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2203.20,gradeStars:2},
    {id:'verified-oct26-cert-wooden-2160',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2160,gradeStars:2,rarity:'Epic',conditionPct:50}
  ];
}

function trophySignature(t:GavelTrophy):string {
  return t.modifiers.map(m=>`${m.mutation.toLowerCase()}:${m.boostPct}`).sort().join('|');
}

/** Schema-14 and schema-15 one-time replacement: the verified screenshots are the complete Gavel inventory,
 * so anything else is removed. A stored trophy with identical rolls is matched one-to-one and
 * keeps its ID, favourite and created date; the screenshot's condition wins when it shows one.
 */
export function replaceWithVerifiedTrophies(existing:GavelTrophy[]):GavelTrophy[]{
  const unused=[...existing];
  return screenshotTrophies().map(next=>{
    const index=unused.findIndex(item=>trophySignature(item)===trophySignature(next));
    if(index<0)return next;
    const [found]=unused.splice(index,1);
    return {...next,id:found.id,favourite:found.favourite,createdAt:found.createdAt||next.createdAt,
      conditionPct:next.conditionPct??found.conditionPct};
  });
}

/** Schema-15 one-time replacement: the verified screenshots are the complete certificate
 * inventory. A stored certificate of the same type, value and grade is matched one-to-one
 * and keeps its ID; anything else is removed.
 */
export function replaceWithVerifiedCertificates(existing:OwnedCertificate[]):OwnedCertificate[]{
  const unused=[...existing];
  return screenshotCertificates().map(next=>{
    const index=unused.findIndex(item=>item.type===next.type&&item.gradeStars===next.gradeStars&&
      item.displayedValue!==undefined&&Math.abs(item.displayedValue-(next.displayedValue??0))<0.005);
    if(index<0)return next;
    const [found]=unused.splice(index,1);
    return {...next,id:found.id,mutation:next.mutation??found.mutation};
  });
}
