import type { Authentication, GearItem, GearStats, Slot } from '../types';
import { generateGearName, inferBaseName } from '../naming';

const ZERO_STATS: GearStats = {
  luck:0, energy:0, tip:0, walk:0, vehicle:0,
  recovery:0, zone:0, arrowReduction:0, npc:0
};

/**
 * User-verified complete accessory inventory: 22 items captured 26 October 2026 and
 * re-confirmed with seven more on 27 October 2026 (29 in all).
 * Base stats are only the green/red accessory stats. Blue authentication/enchantment
 * effects are stored separately. Negative in-game Bid Arrow Speed is represented
 * internally as positive arrowReduction; a red +3% Bid Arrow Speed is -3 reduction.
 */
type InventorySeed = {
  id:string;
  baseName:string;
  slot:Slot;
  mutation?:string;
  conditionPct:number;
  stats:Partial<GearStats>;
  authentication?:Authentication;
  /** Screenshot date; it is part of the record ID. */
  verified?:'2026-10-26'|'2026-10-27'|'2026-10-29'|'2026-10-30';
};

const KNOWN_GEAR:InventorySeed[]=[
  // Head — 23
  {id:'head-steampunk-goggle-a',baseName:'Steampunk Goggle',slot:'Head',mutation:'Diamond + Silver',conditionPct:85,
    stats:{luck:136,zone:64,tip:-2},authentication:{kind:'Premium',effect:'Mutated Luck',value:0}},
  {id:'head-cow-dominus',baseName:'Cow Dominus',slot:'Head',mutation:'None',conditionPct:54,
    stats:{luck:58,arrowReduction:35}},
  {id:'head-crypto-necklace',baseName:'Crypto Necklace',slot:'Head',mutation:'Hologram',conditionPct:98,
    stats:{luck:95,energy:18,arrowReduction:-3}},
  {id:'head-luxury-ice-crown',baseName:'Luxury Ice Crown',slot:'Head',mutation:'None',conditionPct:88,
    stats:{luck:75,zone:55}},
  {id:'head-pearl-dominus',baseName:'Pearl Dominus',slot:'Head',mutation:'None',conditionPct:51,
    stats:{zone:76,luck:100},authentication:{kind:'Normal',effect:'Nocturnal',value:35}},
  {id:'head-race-valk',baseName:'Race Valk',slot:'Head',mutation:'Cobwebbed',conditionPct:56,
    stats:{arrowReduction:76,energy:64},authentication:{kind:'Normal',effect:'NPC Offers Bonus',value:7.7}},
  {id:'head-reactor-fedora-a',baseName:'Reactor Fedora',slot:'Head',mutation:'None',conditionPct:55,
    stats:{arrowReduction:45,luck:75},authentication:{kind:'Premium',effect:'Mutated Luck',value:0}},
  {id:'head-royal-dominus',baseName:'Royal Dominus',slot:'Head',mutation:'None',conditionPct:85,
    stats:{arrowReduction:50,recovery:20}},
  {id:'head-steampunk-goggle-b',baseName:'Steampunk Goggle',slot:'Head',mutation:'Chrome',conditionPct:84,
    stats:{arrowReduction:27,luck:100}},
  {id:'head-luxury-ice-crown-c',baseName:'Luxury Ice Crown',slot:'Head',mutation:'None',conditionPct:63,
    stats:{recovery:17,tip:10},verified:'2026-10-27'},
  {id:'head-royal-dominus-b',baseName:'Royal Dominus',slot:'Head',mutation:'None',conditionPct:93,
    stats:{energy:37,luck:74},verified:'2026-10-27'},
  {id:'head-dark-aura-dominus',baseName:'Dark Aura Dominus',slot:'Head',mutation:'Limited',conditionPct:62,
    stats:{npc:11,recovery:18},verified:'2026-10-27'},
  {id:'head-steampunk-valk-helm',baseName:'Steampunk Valk Helm',slot:'Head',mutation:'Diamond',conditionPct:97,
    stats:{recovery:13,npc:7.5,arrowReduction:-3},verified:'2026-10-27'},
  {id:'head-royal-dominus-gold',baseName:'Royal Dominus',slot:'Head',mutation:'Gold',conditionPct:73,
    stats:{tip:13,arrowReduction:48},verified:'2026-10-29'},
  {id:'head-demon-pumpkin-chrome',baseName:'Demon Pumpkin Head',slot:'Head',mutation:'Chrome + Corrupted + Limited',conditionPct:98,
    stats:{npc:8,recovery:-4},verified:'2026-10-29'},
  {id:'head-grave-crown',baseName:'Grave Crown',slot:'Head',mutation:'Limited',conditionPct:68,
    stats:{energy:31,tip:9.3},verified:'2026-10-30'},
  {id:'head-candy-corn-antlers',baseName:'Candy Corn Antlers',slot:'Head',mutation:'Limited',conditionPct:76,
    stats:{energy:12,npc:3.6},verified:'2026-10-30'},
  {id:'head-noble-vampire-top-hat',baseName:'Noble Vampire Top Hat',slot:'Head',mutation:'Exclusive',conditionPct:97,
    stats:{energy:16,arrowReduction:-3},verified:'2026-10-30'},
  {id:'head-owl-beanie',baseName:'Owl Beanie',slot:'Head',mutation:'Exclusive',conditionPct:81,
    stats:{energy:10},verified:'2026-10-30'},
  {id:'head-turtle-fedora',baseName:'Turtle Fedora',slot:'Head',mutation:'None',conditionPct:67,
    stats:{arrowReduction:16},verified:'2026-10-30'},
  {id:'head-business-bowler',baseName:'Business Bowler',slot:'Head',mutation:'None',conditionPct:68,
    stats:{npc:3.8,luck:26},verified:'2026-10-30'},
  {id:'head-demon-pumpkin-silver',baseName:'Demon Pumpkin Head',slot:'Head',mutation:'Silver + Limited',conditionPct:76,
    stats:{zone:39,recovery:13},verified:'2026-10-30'},
  {id:'head-steampunk-goggle-c',baseName:'Steampunk Goggle',slot:'Head',mutation:'None',conditionPct:68,
    stats:{walk:22},verified:'2026-10-30'},

  // Back — 9
  {id:'back-dark-heart-a',baseName:'Dark Heart Backpack',slot:'Back',mutation:'Exclusive',conditionPct:91,
    stats:{luck:77,tip:12}},
  {id:'back-dark-heart-b',baseName:'Dark Heart Backpack',slot:'Back',mutation:'Exclusive',conditionPct:83,
    stats:{arrowReduction:40,walk:35},authentication:{kind:'Premium',effect:'Drought Breaker',value:18,notes:'Adds +18 Luck per auction without a mutation, up to 5 stacks.'}},
  {id:'back-elegant-business',baseName:'Elegant Business Backpack',slot:'Back',mutation:'Void',conditionPct:92,
    stats:{luck:80,energy:11}},
  {id:'back-police-vest',baseName:'Police Vest',slot:'Back',mutation:'Police',conditionPct:96,
    stats:{luck:65,npc:9.7},authentication:{kind:'Normal',effect:'Bid Zone Width',value:18}},
  {id:'back-steampunk',baseName:'Steampunk Backpack',slot:'Back',mutation:'None',conditionPct:96,
    stats:{luck:57,recovery:15}},
  {id:'back-halloween-boombox',baseName:'Halloween Boombox',slot:'Back',mutation:'Limited',conditionPct:73,
    stats:{zone:110,energy:74},verified:'2026-10-27'},
  {id:'back-elegant-business-hologram',baseName:'Elegant Business Backpack',slot:'Back',mutation:'Hologram',conditionPct:91,
    stats:{luck:76},verified:'2026-10-30'},
  {id:'back-steampunk-jacket',baseName:'Steampunk Jacket',slot:'Back',mutation:'None',conditionPct:70,
    stats:{luck:33,zone:24},verified:'2026-10-30'},
  {id:'back-autumn-wings',baseName:'Autumn Wings',slot:'Back',mutation:'Exclusive',conditionPct:97,
    stats:{energy:24,zone:37,luck:-5},verified:'2026-10-30'},

  // Wrist — 7
  {id:'wrist-jellyfish',baseName:'Jellyfish Wristband',slot:'Wrist',mutation:'Diamond',conditionPct:73,
    stats:{arrowReduction:32,luck:54,walk:-1},authentication:{kind:'Premium',effect:'Club Pact',value:4}},
  {id:'wrist-autumn-fox',baseName:'Autumn Fox Wristband',slot:'Wrist',mutation:'Exclusive',conditionPct:81,
    stats:{luck:73,zone:55,npc:-1.5}},
  {id:'wrist-maple',baseName:'Maple Wristband',slot:'Wrist',mutation:'Exclusive',conditionPct:85,
    stats:{luck:63,zone:47}},
  {id:'wrist-reactor',baseName:'Reactor Wristband',slot:'Wrist',mutation:'Cobwebbed',conditionPct:55,
    stats:{tip:8.9,luck:60},authentication:{kind:'Normal',effect:'Connected',value:2}},
  {id:'wrist-steam-engine',baseName:'Steam Engine Wristband',slot:'Wrist',mutation:'None',conditionPct:96,
    stats:{arrowReduction:32,energy:27,npc:-1.5}},
  {id:'wrist-franken-bunny',baseName:'Franken Bunny Wristband',slot:'Wrist',mutation:'Limited',conditionPct:69,
    stats:{recovery:13,tip:7.2,energy:-6},verified:'2026-10-27'},
  {id:'wrist-luxury',baseName:'Luxury Wristband',slot:'Wrist',mutation:'None',conditionPct:74,
    stats:{arrowReduction:32,tip:8.1,zone:-5},verified:'2026-10-30'}
];

/** Seen in the 27 October screenshots, absent from the 29 October inventory (sold or discarded). */
const GONE_20261029:InventorySeed[]=[
  {id:'head-desert-hood',baseName:'Desert Hood',slot:'Head',mutation:'Exclusive',conditionPct:90,
    stats:{arrowReduction:31,luck:53}},
  {id:'head-reactor-fedora-b',baseName:'Reactor Fedora',slot:'Head',mutation:'Saloon Sparkle',conditionPct:64,
    stats:{arrowReduction:42,zone:51}},
  {id:'head-luxury-ice-crown-b',baseName:'Luxury Ice Crown',slot:'Head',mutation:'None',conditionPct:79,
    stats:{walk:41,energy:41},verified:'2026-10-27'},
  {id:'back-luxury',baseName:'Luxury Backpack',slot:'Back',mutation:'None',conditionPct:82,
    stats:{tip:11,walk:38}}
];

/**
 * Schema-17 one-time inventory update from the 29 October screenshots: the four items no
 * longer owned are removed (only an exact match of name, slot and base stats) and the two
 * new items whose stats were shown are added unless already present. Everything else,
 * including favourites, history and grades, is untouched.
 */
export function applyInventoryUpdate20261029(existing:GearItem[]):GearItem[]{
  const gone=GONE_20261029.map(buildSeed);
  return addVerifiedItems(existing.filter(item=>!gone.some(g=>sameBase(item,g))),'20261029');
}

/**
 * Adds the verified items of one screenshot batch that are not already stored (same slot,
 * name and base stats, e.g. imported by hand). Used by schema 18 for the twelve accessories
 * whose detail screenshots arrived on 30 October.
 */
export function addVerifiedItems(existing:GearItem[],batch:string):GearItem[]{
  const added=makeKnownGear().filter(seed=>seed.id.startsWith(`verified-${batch}-`)&&!existing.some(item=>sameBase(item,seed)));
  return [...existing,...added];
}

/** Star grades read from the same 27 October screenshots (every item had been graded). */
const STARS:Record<string,number>={
  'head-steampunk-goggle-a':3,'head-cow-dominus':1,'head-crypto-necklace':2,'head-desert-hood':2,'head-luxury-ice-crown':1,
  'head-pearl-dominus':2,'head-race-valk':3,'head-reactor-fedora-a':2,'head-reactor-fedora-b':2,'head-royal-dominus':2,
  'head-steampunk-goggle-b':2,'head-luxury-ice-crown-b':2,'head-luxury-ice-crown-c':1,'head-royal-dominus-b':1,
  'head-dark-aura-dominus':1,'head-steampunk-valk-helm':1,'head-royal-dominus-gold':1,'head-demon-pumpkin-chrome':2,
  'head-grave-crown':2,'head-candy-corn-antlers':1,'head-noble-vampire-top-hat':2,'head-owl-beanie':1,'head-turtle-fedora':1,'head-business-bowler':2,'head-demon-pumpkin-silver':2,'head-steampunk-goggle-c':1,
  'back-elegant-business-hologram':1,'back-steampunk-jacket':2,'back-autumn-wings':1,'wrist-luxury':2,
  'back-dark-heart-a':2,'back-dark-heart-b':1,'back-elegant-business':1,'back-luxury':2,'back-police-vest':2,'back-steampunk':2,
  'back-halloween-boombox':3,
  'wrist-jellyfish':2,'wrist-autumn-fox':2,'wrist-maple':2,'wrist-reactor':2,'wrist-steam-engine':2,'wrist-franken-bunny':1
};

function buildSeed(seed:InventorySeed):GearItem{
  const day=seed.verified??'2026-10-26';
  const now=`${day}T00:00:00.000Z`;
  const stats={...ZERO_STATS,...seed.stats};
  const authentication:Authentication=seed.authentication??{kind:'None',effect:'',value:0};
  const authenticated=authentication.kind!=='None';
  return {
    id:`verified-${day.replace(/-/g,'')}-${seed.id}`,
    baseName:seed.baseName,
    name:generateGearName(seed.baseName,stats,authenticated,authentication),
    slot:seed.slot,
    mutation:seed.mutation,
    conditionPct:seed.conditionPct,
    ...(STARS[seed.id]===undefined?{}:{gradeStars:STARS[seed.id]}),
    stats,
    authenticated,
    authentication,
    favourite:false,
    createdAt:now,
    updatedAt:now
  };
}

export function makeKnownGear():GearItem[]{ return KNOWN_GEAR.map(buildSeed); }

/**
 * Schema-15 one-time replacement: the verified screenshots are the complete accessory
 * inventory, so anything else is removed. A stored item with the same slot, base name and
 * base stats is matched one-to-one and keeps its ID, favourite and created date, so roll
 * history still points at it. The screenshot's authentication, mutation and condition win;
 * a stored authentication is kept only when it is the same one (it may carry notes or
 * observed stat deltas the screenshot cannot show).
 */
export function replaceWithVerifiedGear(existing:GearItem[]):GearItem[]{
  const unused=[...existing];
  return makeKnownGear().map(next=>{
    const index=unused.findIndex(item=>sameBase(item,next));
    if(index<0)return next;
    const [found]=unused.splice(index,1);
    const authentication=sameAuthentication(found,next)?found.authentication:next.authentication;
    return {...next,id:found.id,favourite:found.favourite,createdAt:found.createdAt||next.createdAt,authentication,
      name:generateGearName(next.baseName,next.stats,next.authenticated,authentication)};
  });
}

/**
 * Schema-16 one-time fill: stored gear without a recorded star grade takes the grade the
 * screenshots showed for the same item. A grade already recorded (by an import) is kept.
 */
export function fillVerifiedGearStars(existing:GearItem[]):GearItem[]{
  const seeds=makeKnownGear();
  return existing.map(item=>{
    if(item.gradeStars!==undefined)return item;
    const seed=seeds.find(next=>sameBase(item,next));
    return seed?.gradeStars===undefined?item:{...item,gradeStars:seed.gradeStars};
  });
}

function sameBase(a:GearItem,b:GearItem):boolean{
  const nameA=(a.baseName||inferBaseName(a.name)).trim().toLowerCase().replace(/\s+/g,' ');
  const nameB=b.baseName.trim().toLowerCase().replace(/\s+/g,' ');
  return a.slot===b.slot&&nameA===nameB&&(Object.keys(ZERO_STATS) as Array<keyof GearStats>)
    .every(key=>Math.abs((a.stats[key]??0)-(b.stats[key]??0))<0.00001);
}

function sameAuthentication(a:GearItem,b:GearItem):boolean{
  if(Boolean(a.authenticated)!==Boolean(b.authenticated))return false;
  return !a.authenticated||(a.authentication.kind===b.authentication.kind&&
    a.authentication.effect.trim().toLowerCase()===b.authentication.effect.trim().toLowerCase()&&
    Math.abs(a.authentication.value-b.authentication.value)<=0.00001);
}

function sameRoll(a:GearItem,b:GearItem):boolean{
  const nameA=(a.baseName||inferBaseName(a.name)).trim().toLowerCase().replace(/\s+/g,' ');
  const nameB=b.baseName.trim().toLowerCase().replace(/\s+/g,' ');
  if(a.slot!==b.slot||nameA!==nameB)return false;
  if(Boolean(a.authenticated)!==Boolean(b.authenticated))return false;
  if(a.authenticated&&(
    a.authentication.kind!==b.authentication.kind||
    a.authentication.effect.trim().toLowerCase()!==b.authentication.effect.trim().toLowerCase()||
    Math.abs(a.authentication.value-b.authentication.value)>0.00001
  ))return false;
  return (Object.keys(ZERO_STATS) as Array<keyof GearStats>)
    .every(key=>Math.abs((a.stats[key]??0)-(b.stats[key]??0))<0.00001);
}

/** Compatibility helper retained for older migration tests/importers. */
export function makeMapleWristband():GearItem{
  return makeKnownGear().find(item=>item.baseName==='Maple Wristband')!;
}

/** Compatibility helper: merge the current verified Maple roll once. */
export function mergeMapleWristband(existing:GearItem[]):GearItem[]{
  const incoming=makeMapleWristband();
  if(existing.some(item=>item.id===incoming.id||sameRoll(item,incoming)))return existing;
  return [...existing,incoming];
}
