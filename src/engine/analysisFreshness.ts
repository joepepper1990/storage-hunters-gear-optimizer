import type { AlgorithmSettings, GearItem } from '../types';

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
