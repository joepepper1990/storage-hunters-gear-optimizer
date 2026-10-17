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
type TrophySeed={id:string;rolls:[string,number][];conditionPct?:number};
const GAVELS:TrophySeed[]=[
  {id:'hologram154-silver143',rolls:[['Hologram',154],['Silver',143]]},
  {id:'hologram157-chrome76',rolls:[['Hologram',157],['Chrome',76]]},
  {id:'hologram124-chrome123-diamond34',rolls:[['Hologram',124],['Chrome',123],['Diamond',34]]},
  {id:'void86',rolls:[['Void',86]]},
  {id:'chrome133-diamond129',rolls:[['Chrome',133],['Diamond',129]],conditionPct:97},
  {id:'hologram93-silver161',rolls:[['Hologram',93],['Silver',161]],conditionPct:90},
  {id:'void74',rolls:[['Void',74]],conditionPct:92},
  {id:'huge188-chrome24',rolls:[['Huge',188],['Chrome',24]],conditionPct:93},
  {id:'hologram125',rolls:[['Hologram',125]],conditionPct:85},
  {id:'gem194',rolls:[['Gem',194]],conditionPct:93},
  {id:'hologram142',rolls:[['Hologram',142]],conditionPct:90},
  {id:'sandy167',rolls:[['Sandy',167]],conditionPct:92}
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
    return {id:`verified-oct17-gavel-${s.id}`,name:generateTrophyName(modifiers),
      modifiers,conditionPct:s.conditionPct,favourite:false,createdAt:WHEN,updatedAt:WHEN};
  });
}
export function screenshotCertificates():OwnedCertificate[]{
  return [{id:'verified-oct17-cert-wooden-56',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:1648,conditionPct:56,rarity:'Epic'}];
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
/** Match modifier *multisets*, including all three rolls, without discarding legitimate extra owned copies. */
export function mergeScreenshotTrophies(existing:GavelTrophy[]):GavelTrophy[]{
  const out=[...existing];
  for(const next of screenshotTrophies()){
    const signature=(t:GavelTrophy)=>t.modifiers.map(m=>`${m.mutation.toLowerCase()}:${m.boostPct}`).sort().join('|');
    const found=out.find(item=>signature(item)===signature(next));
    if(found){const index=out.indexOf(found);out[index]={...found,conditionPct:found.conditionPct??next.conditionPct};}
    else out.push(next);
  }
  return out;
}
/** The one photographed Wooden Certificate is tracked separately from used roll history. */
export function mergeScreenshotCertificates(existing:OwnedCertificate[]):OwnedCertificate[]{
  if(existing.some(x=>x.id==='verified-oct17-cert-wooden-56'||(x.type==='Wooden Certificate of Authenticity'&&x.conditionPct===56)))return existing;
  return [...existing,...screenshotCertificates()];
}
