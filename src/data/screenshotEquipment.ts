import type { GavelTrophy, VehiclePart, OwnedCertificate, TrophyModifier } from '../types';
import { generateTrophyName, generateVehiclePartName } from '../naming';

const WHEN = '2026-10-17T00:00:00.000Z';
type PartSeed = {
  id:string; baseName:string; slot:VehiclePart['slot'];
  speedPct:number; accelerationPct:number; capacityKg:number; handlingPct?:number;
  conditionPct?:number; mutation?:string; rarity?:string;
};
const PARTS: PartSeed[]=[
  {id:'lotus-ruby-wheel',baseName:'Lotus Ruby Wheel Stack',slot:'Wheel Stack',speedPct:59,accelerationPct:0,capacityKg:228},
  {id:'jewelled-exhaust',baseName:'Jewelled Exhaust',slot:'Exhaust',speedPct:54,accelerationPct:54,capacityKg:0},
  {id:'sapphire-spoiler',baseName:'Sapphire Spoiler',slot:'Spoiler',speedPct:0,accelerationPct:68,capacityKg:0},
  {id:'sunflower-wheel',baseName:'[Exclusive] Sunflower Wheel Stack',slot:'Wheel Stack',speedPct:0,accelerationPct:58,capacityKg:214,mutation:'Exclusive',rarity:'Legendary',conditionPct:92},
  {id:'autumn-exhaust',baseName:'[Exclusive] Autumn Exhaust',slot:'Exhaust',speedPct:-11,accelerationPct:39,capacityKg:0,mutation:'Exclusive',rarity:'Epic',conditionPct:89},
  {id:'cogwheel-wheel',baseName:'Cogwheel Wheel Stack',slot:'Wheel Stack',speedPct:27,accelerationPct:0,capacityKg:85,rarity:'Epic',conditionPct:92},
  {id:'manta-spoiler-newroll',baseName:'Manta Spoiler',slot:'Spoiler',speedPct:-16,accelerationPct:15,capacityKg:0,rarity:'Epic',conditionPct:95}
];
type TrophySeed={id:string;rolls:[string,number][];conditionPct?:number;verifiedAt?:string};
/** The user's complete Gavel inventory from the 27 October 2026 screenshots (15 trophies:
 * eleven in inventory, four on displays). Display tooltips do not show condition. Charm
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
  {id:'huge188-chrome24-second',rolls:[['Huge',188],['Chrome',24]],conditionPct:93,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'void47',rolls:[['Void',47]],conditionPct:59,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'tiny103-hologram121',rolls:[['Tiny',103],['Hologram',121]],conditionPct:55,verifiedAt:'2026-10-27T00:00:00.000Z'},
  {id:'void147-gold146',rolls:[['Void',147],['Gold',146]],verifiedAt:'2026-10-27T00:00:00.000Z'}
];

export function screenshotVehicleParts():VehiclePart[]{
  return PARTS.map(s=>{
    const p={...s,handlingPct:s.handlingPct??0};
    return {...p,id:`verified-oct17-part-${s.id}`,name:generateVehiclePartName(s.baseName,p),favourite:false,createdAt:WHEN,updatedAt:WHEN};
  });
}
export function screenshotTrophies():GavelTrophy[]{
  return GAVELS.map(s=>{
    const modifiers:TrophyModifier[]=s.rolls.map(([mutation,boostPct])=>({mutation,boostPct}));
    const when=s.verifiedAt??WHEN;
    return {id:`verified-oct17-gavel-${s.id}`,name:generateTrophyName(modifiers),
      modifiers,conditionPct:s.conditionPct,favourite:false,createdAt:when,updatedAt:when};
  });
}
export function screenshotCertificates():OwnedCertificate[]{
  return [
    {id:'verified-oct26-cert-limited-6291',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:6291,gradeStars:2,rarity:'Limited'},
    {id:'verified-oct26-cert-limited-5967',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:5967,gradeStars:2,rarity:'Limited'},
    {id:'verified-oct26-cert-premium-4641',type:'Premium Certificate of Authenticity',quantity:1,displayedValue:4641,gradeStars:1},
    {id:'verified-oct26-cert-wooden-2451-60',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2451.60,gradeStars:2},
    {id:'verified-oct26-cert-wooden-2397-60',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2397.60,gradeStars:2},
    {id:'verified-oct26-cert-wooden-2203-20',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2203.20,gradeStars:2},
    {id:'verified-oct26-cert-wooden-2160',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:2160,gradeStars:2}
  ];
}

/** Match exact rolls, not just names. Two different stat rolls of Manta Spoiler must coexist. */
export function mergeScreenshotParts(existing:VehiclePart[]):VehiclePart[]{
  const out=[...existing];
  for(const next of screenshotVehicleParts()){
    const found=out.find(item=>samePart(item,next));
    if(found){
      const index=out.indexOf(found);
      out[index]={...found,conditionPct:found.conditionPct??next.conditionPct,mutation:found.mutation??next.mutation,rarity:found.rarity??next.rarity};
    }else out.push(next);
  }
  return out;
}
function samePart(a:VehiclePart,b:VehiclePart):boolean{
  return a.slot===b.slot && (a.baseName||a.name.split(' — ')[0]).trim().toLowerCase()===b.baseName.trim().toLowerCase()
    && ['speedPct','accelerationPct','handlingPct','capacityKg'].every(key=>
      Math.abs((a as unknown as Record<string,number>)[key]-(b as unknown as Record<string,number>)[key])<0.000001);
}
function trophySignature(t:GavelTrophy):string {
  return t.modifiers.map(m=>`${m.mutation.toLowerCase()}:${m.boostPct}`).sort().join('|');
}

/** Schema-14 one-time replacement: the verified screenshots are the complete Gavel inventory,
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

/** One-off schema-8 certificate refresh. Preserve manual records but replace the old auto-seeded screenshot certificate. */
export function mergeScreenshotCertificates(existing:OwnedCertificate[]):OwnedCertificate[]{
  const out=existing.filter(x=>x.id!=='verified-oct17-cert-wooden-56');
  for(const next of screenshotCertificates()){
    const duplicate=out.find(x=>x.id===next.id||
      (x.type===next.type&&x.displayedValue===next.displayedValue&&x.gradeStars===next.gradeStars));
    if(!duplicate)out.push(next);
  }
  return out;
}
