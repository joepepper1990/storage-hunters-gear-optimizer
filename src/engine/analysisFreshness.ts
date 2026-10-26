import type { AlgorithmSettings, AppData, GearItem } from '../types';

export function optimisationInputKey(gear:GearItem[],settings:AlgorithmSettings):string {
  return JSON.stringify({
    settings,
    gear:gear.map(item=>({
      id:item.id,
      slot:item.slot,
      mutation:item.mutation??'',
      favourite:item.favourite,
      stats:item.stats,
      authenticated:item.authenticated,
      authentication:item.authentication
    }))
  });
}


export function certificateInputKey(data:AppData):string {
  return JSON.stringify({
    gear:data.gear.map(item=>({
      id:item.id,slot:item.slot,mutation:item.mutation??'',stats:item.stats,
      authenticated:item.authenticated,authentication:item.authentication
    })),
    settings:data.settings,
    authModel:data.authModel,
    rollLog:data.rollLog,
    ownedCertificates:data.ownedCertificates
  });
}
