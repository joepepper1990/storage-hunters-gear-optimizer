import type { Authentication, GearItem, GearStats, Slot } from '../types';
import { generateGearName, inferBaseName } from '../naming';
const ZERO_STATS: GearStats = {
  luck:0, energy:0, tip:0, walk:0, vehicle:0,
  recovery:0, zone:0, arrowReduction:0, npc:0
};

// User-verified inventory captured 17 October 2026. Values are the stats shown on the
// accessory, excluding a separate coloured authentication / enchantment roll.
// Condition and mutation are descriptive fields. Neither modifies the nine stats.
type InventorySeed = {
  id: string; baseName: string; slot: Slot; mutation: string; conditionPct: number;
  stats: Partial<GearStats>; authentication?: Authentication;
};
const KNOWN_GEAR: InventorySeed[] = [
  { id:'head-reactor-fedora', baseName:'Reactor Fedora',slot:'Head',mutation:'None',conditionPct:55,
    stats:{arrowReduction:45,luck:75}, authentication:{kind:'Premium',effect:'Mutated Luck',value:0} },
  { id:'head-diamond-crypto-necklace',baseName:'Diamond Crypto Necklace',slot:'Head',mutation:'Diamond',conditionPct:83,
    stats:{luck:60,zone:46,npc:-1.5} },
  { id:'head-diamond-steampunk-goggle',baseName:'Diamond Steampunk Goggle',slot:'Head',mutation:'Diamond',conditionPct:85,
    stats:{luck:136,zone:64,tip:-2} },
  { id:'head-cow-dominus',baseName:'Cow Dominus',slot:'Head',mutation:'None',conditionPct:54,
    stats:{luck:58,arrowReduction:35} },
  { id:'head-gold-crypto-necklace',baseName:'Gold Crypto Necklace',slot:'Head',mutation:'Gold',conditionPct:60,
    stats:{tip:6.9,luck:46,recovery:-4} },
  { id:'head-desert-hood',baseName:'Desert Hood',slot:'Head',mutation:'Exclusive',conditionPct:90,
    stats:{arrowReduction:31,luck:53} },
  { id:'head-gangster-dominus',baseName:'Gangster Dominus',slot:'Head',mutation:'None',conditionPct:68,
    stats:{arrowReduction:28,walk:24} },
  { id:'head-pearl-dominus',baseName:'Pearl Dominus',slot:'Head',mutation:'None',conditionPct:51,
    stats:{zone:76,luck:100},authentication:{kind:'Normal',effect:'Nocturnal',value:35} },
  { id:'head-race-valk',baseName:'Race Valk',slot:'Head',mutation:'Cobwebbed',conditionPct:56,
    stats:{arrowReduction:76,energy:64,npc:7.7} },
  { id:'back-dark-heart-backpack',baseName:'Dark Heart Backpack',slot:'Back',mutation:'Exclusive',conditionPct:83,
    stats:{arrowReduction:40,walk:35} },
  { id:'back-police-vest',baseName:'Police Vest',slot:'Back',mutation:'Police',conditionPct:96,
    stats:{luck:65,npc:9.7,zone:18} },
  { id:'wrist-jellyfish-wristband',baseName:'Jellyfish Wristband',slot:'Wrist',mutation:'Diamond',conditionPct:73,
    stats:{arrowReduction:32,luck:54,walk:-1},authentication:{kind:'Premium',effect:'Temporal Split',value:12} },
  { id:'wrist-police-baton',baseName:'Police Baton',slot:'Wrist',mutation:'Police',conditionPct:93,
    stats:{tip:5.5,luck:37} },
  { id:'wrist-reactor-wristband',baseName:'Reactor Wristband',slot:'Wrist',mutation:'Cobwebbed',conditionPct:55,
    stats:{tip:8.9,luck:60},authentication:{kind:'Normal',effect:'Connected',value:2} }
];

function buildSeed(seed: InventorySeed): GearItem {
  const now = '2026-10-17T00:00:00.000Z';
  const stats = { ...ZERO_STATS, ...seed.stats };
  const authentication: Authentication = seed.authentication ?? { kind:'None', effect:'', value:0 };
  const authenticated = authentication.kind !== 'None';
  return {
    id:`verified-20261017-${seed.id}`, baseName:seed.baseName,
    name:generateGearName(seed.baseName, stats, authenticated, authentication),
    slot:seed.slot, mutation:seed.mutation, conditionPct:seed.conditionPct,
    stats, authenticated, authentication, favourite:false, createdAt:now, updatedAt:now
  };
}

export function makeKnownGear(): GearItem[] {
  return KNOWN_GEAR.map(buildSeed);
}

/**
 * One-off upgrade for older local inventories.
 * - Match exact game rolls, including authentication, and enrich missing metadata
 *   instead of duplicating hand-entered items.
 * - Preserve every existing item, including alternate rolls with the same name.
 * - A prior item with a different authentication is kept as a separate roll rather
 *   than silently overwritten based on a guess about its physical identity.
 * - Never run again when the schema has already been upgraded.
 */
export function mergeKnownGear(existing: GearItem[]): GearItem[] {
  const result = [...existing];
  for (const seed of makeKnownGear()) {
    const duplicate = result.find(item => sameRoll(item,seed));
    if (duplicate) {
      const index=result.indexOf(duplicate);
      result[index] = {
        ...duplicate,
        mutation: duplicate.mutation && duplicate.mutation!=='None' ? duplicate.mutation : seed.mutation,
        conditionPct: duplicate.conditionPct ?? seed.conditionPct
      };
    } else {
      result.push(seed);
    }
  }
  return result;
}

function sameRoll(a:GearItem,b:GearItem):boolean {
  const nameA=(a.baseName || inferBaseName(a.name)).trim().toLowerCase().replace(/\s+/g,' ');
  const nameB=b.baseName.trim().toLowerCase().replace(/\s+/g,' ');
  if(a.slot!==b.slot || nameA!==nameB) return false;
  if(Boolean(a.authenticated)!==Boolean(b.authenticated)) return false;
  if(a.authenticated && (
    a.authentication.kind!==b.authentication.kind ||
    a.authentication.effect.trim().toLowerCase()!==b.authentication.effect.trim().toLowerCase() ||
    Math.abs(a.authentication.value-b.authentication.value)>0.00001
  )) return false;
  return (Object.keys(ZERO_STATS) as Array<keyof GearStats>)
    .every(key => Math.abs((a.stats[key]??0)-(b.stats[key]??0))<0.00001);
}
