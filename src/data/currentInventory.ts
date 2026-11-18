import type { Authentication, GearItem, GearStats, Slot } from '../types';
import { generateGearName } from '../naming';
import { makeKnownGear } from './knownGear';

// Complete owner-confirmed inventory, including November 18 grading updates.
// Blue certificate bonuses are separate from base stats; unknown metadata stays absent.
const ROWS: Array<{baseName:string;slot:Slot;gradeStars?:number;conditionPct?:number;displayedValue?:number;
 stats:Partial<GearStats>;mutation:string;authentication:Authentication}> = [
  {
    "baseName": "Reactor Fedora",
    "slot": "Head",
    "stats": {
      "arrowReduction": 45,
      "luck": 75
    },
    "mutation": "None",
    "authentication": {
      "kind": "Premium",
      "effect": "Mutated Luck",
      "value": 0
    },
    "displayedValue": 53136,
    "conditionPct": 55,
    "gradeStars": 2
  },
  {
    "baseName": "Autumn Dominus",
    "slot": "Head",
    "stats": {
      "arrowReduction": 82,
      "tip": 20
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 555540,
    "conditionPct": 85
  },
  {
    "baseName": "Cow Dominus",
    "slot": "Head",
    "stats": {
      "zone": 50,
      "npc": 10
    },
    "mutation": "Gold",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 382320,
    "conditionPct": 86
  },
  {
    "baseName": "Desert Bandit Mask",
    "slot": "Head",
    "stats": {
      "energy": 15,
      "npc": 4.5,
      "recovery": -4
    },
    "mutation": "Exclusive + Mint",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 2940,
    "conditionPct": 100
  },
  {
    "baseName": "Electrical Fedora",
    "slot": "Head",
    "stats": {
      "luck": 61,
      "npc": 9.2
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 85806,
    "conditionPct": 77
  },
  {
    "baseName": "Electrical Fedora",
    "slot": "Head",
    "stats": {
      "luck": 73,
      "tip": 11
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 109350,
    "conditionPct": 75
  },
  {
    "baseName": "Autumn Valk",
    "slot": "Head",
    "stats": {
      "npc": 12
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 255960,
    "conditionPct": 87
  },
  {
    "baseName": "Fireman Hat",
    "slot": "Head",
    "stats": {
      "zone": 31
    },
    "mutation": "Gem",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 34131.24,
    "conditionPct": 71,
    "gradeStars": 2
  },
  {
    "baseName": "Green Ghillie Mask",
    "slot": "Head",
    "stats": {
      "luck": 33,
      "arrowReduction": 19,
      "npc": -1.5
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 3043,
    "conditionPct": 95
  },
  {
    "baseName": "Green Ghillie Mask",
    "slot": "Head",
    "stats": {
      "luck": 69
    },
    "mutation": "Hologram",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 32313,
    "conditionPct": 73
  },
  {
    "baseName": "Green Ghillie Mask",
    "slot": "Head",
    "stats": {
      "luck": 88,
      "arrowReduction": -3
    },
    "mutation": "Void",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 94765,
    "conditionPct": 68
  },
  {
    "baseName": "Motorbike Helmet",
    "slot": "Head",
    "stats": {
      "walk": 7.4
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 324,
    "conditionPct": 83
  },
  {
    "baseName": "Motorbike Helmet",
    "slot": "Head",
    "stats": {
      "tip": 1,
      "recovery": -4
    },
    "mutation": "Corrupted",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 1517,
    "conditionPct": 73
  },
  {
    "baseName": "Pickle Necklace",
    "slot": "Head",
    "stats": {
      "recovery": 9.2
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 5088.96,
    "conditionPct": 98
  },
  {
    "baseName": "Race Car Dominus",
    "slot": "Head",
    "stats": {
      "arrowReduction": 45,
      "energy": 38
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 195210,
    "conditionPct": 91
  },
  {
    "baseName": "Race Car Dominus",
    "slot": "Head",
    "stats": {
      "npc": 10,
      "tip": 10
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 142380,
    "conditionPct": 76
  },
  {
    "baseName": "Pilot Helm",
    "slot": "Head",
    "stats": {
      "arrowReduction": 13
    },
    "mutation": "Wet + Mint",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 2156,
    "conditionPct": 100
  },
  {
    "baseName": "Race Valk",
    "slot": "Head",
    "stats": {
      "arrowReduction": 76,
      "energy": 64
    },
    "mutation": "Cobwebbed",
    "authentication": {
      "kind": "Normal",
      "effect": "NPC Offers Bonus",
      "value": 7.7
    },
    "displayedValue": 118656,
    "gradeStars": 3
  },
  {
    "baseName": "Red Beret",
    "slot": "Head",
    "stats": {
      "luck": 19
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 2589,
    "conditionPct": 73
  },
  {
    "baseName": "Reactor Dominus",
    "slot": "Head",
    "stats": {
      "walk": 31,
      "recovery": 16
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 155232,
    "conditionPct": 74
  },
  {
    "baseName": "Royal Dominus",
    "slot": "Head",
    "stats": {
      "luck": 120,
      "zone": 90
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 493960,
    "conditionPct": 83,
    "gradeStars": 3
  },
  {
    "baseName": "Scrap Valk",
    "slot": "Head",
    "stats": {
      "luck": 26,
      "recovery": 6.5,
      "npc": -1.5
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 496,
    "conditionPct": 81
  },
  {
    "baseName": "Spec Ops Dominus",
    "slot": "Head",
    "stats": {
      "luck": 98,
      "npc": 15
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 592488,
    "conditionPct": 61
  },
  {
    "baseName": "Spec Ops Dominus",
    "slot": "Head",
    "stats": {
      "arrowReduction": 54,
      "zone": 68
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 687960,
    "conditionPct": 95,
    "gradeStars": 2
  },
  {
    "baseName": "Spec Ops Dominus",
    "slot": "Head",
    "stats": {
      "arrowReduction": 80,
      "recovery": 34
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 965120,
    "conditionPct": 82,
    "gradeStars": 3
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "luck": 88
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 140304,
    "conditionPct": 87,
    "gradeStars": 3
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "luck": 61,
      "tip": 9.2,
      "zone": -5
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 95904,
    "conditionPct": 90,
    "gradeStars": 2
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "luck": 59,
      "energy": -6
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 81918,
    "conditionPct": 55,
    "gradeStars": 2
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "arrowReduction": 62,
      "recovery": 26,
      "walk": -1
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 125504,
    "conditionPct": 62,
    "gradeStars": 3
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "arrowReduction": 36
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 97102.8,
    "gradeStars": 2
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "tip": 8.9,
      "walk": -1
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 92307.6,
    "conditionPct": 81,
    "gradeStars": 2
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "tip": 8.9,
      "energy": -6
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 75524.4,
    "conditionPct": 93,
    "gradeStars": 1
  },
  {
    "baseName": "Spec Ops Fedora",
    "slot": "Head",
    "stats": {
      "npc": 7.6,
      "luck": -5
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 77078.4,
    "gradeStars": 1
  },
  {
    "baseName": "Steampunk Fedora",
    "slot": "Head",
    "stats": {
      "recovery": 18
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 110246
  },
  {
    "baseName": "Steampunk Goggle",
    "slot": "Head",
    "stats": {
      "luck": 136,
      "zone": 64,
      "tip": -2
    },
    "mutation": "Diamond + Silver",
    "authentication": {
      "kind": "Premium",
      "effect": "Mutated Luck",
      "value": 0
    },
    "displayedValue": 451200,
    "conditionPct": 85,
    "gradeStars": 3
  },
  {
    "baseName": "Steampunk Goggle",
    "slot": "Head",
    "stats": {
      "arrowReduction": 27,
      "luck": 100
    },
    "mutation": "Chrome",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 227448,
    "conditionPct": 84,
    "gradeStars": 2
  },
  {
    "baseName": "Steampunk Goggle",
    "slot": "Head",
    "stats": {
      "luck": 72,
      "walk": 18
    },
    "mutation": "Gem",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 133560,
    "conditionPct": 62
  },
  {
    "baseName": "Steampunk Valk Helm",
    "slot": "Head",
    "stats": {
      "tip": 5.4
    },
    "mutation": "Gummy",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 22008,
    "conditionPct": 50
  },
  {
    "baseName": "Tactical Mask",
    "slot": "Head",
    "stats": {
      "arrowReduction": 19,
      "recovery": -4
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Toxic Dominus",
    "slot": "Head",
    "stats": {
      "recovery": 36,
      "tip": 22
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Zombie Head Helm",
    "slot": "Head",
    "stats": {
      "energy": 16,
      "arrowReduction": 19,
      "walk": -1
    },
    "mutation": "Sandy + Limited",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 5292.54,
    "conditionPct": 92
  },
  {
    "baseName": "Tactical Vest",
    "slot": "Back",
    "stats": {
      "luck": 110,
      "tip": 8.2
    },
    "mutation": "Chrome",
    "authentication": {
      "kind": "Premium",
      "effect": "Golden Hour",
      "value": 1.2
    },
    "displayedValue": 203355.36,
    "conditionPct": 71,
    "gradeStars": 2
  },
  {
    "baseName": "Tactical Vest",
    "slot": "Back",
    "stats": {
      "arrowReduction": 44,
      "npc": 11
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 24537.6,
    "conditionPct": 66,
    "gradeStars": 3
  },
  {
    "baseName": "Luxury Backpack",
    "slot": "Back",
    "stats": {
      "luck": 104,
      "npc": 16
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 232502.4,
    "conditionPct": 57,
    "gradeStars": 2
  },
  {
    "baseName": "Elegant Business Backpack",
    "slot": "Back",
    "stats": {
      "luck": 80,
      "energy": 11
    },
    "mutation": "Void",
    "authentication": {
      "kind": "Normal",
      "effect": "Focused",
      "value": 28,
      "statDeltas": {
        "luck": 23
      }
    },
    "displayedValue": 48914.25,
    "conditionPct": 92,
    "gradeStars": 1
  },
  {
    "baseName": "Halloween Boombox",
    "slot": "Back",
    "stats": {
      "luck": 91,
      "walk": 46
    },
    "mutation": "Limited",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 210924,
    "conditionPct": 67,
    "gradeStars": 2
  },
  {
    "baseName": "Steampunk Jacket",
    "slot": "Back",
    "stats": {
      "luck": 83,
      "npc": 4.7,
      "walk": -1
    },
    "mutation": "Hologram",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 232407,
    "conditionPct": 88,
    "gradeStars": 1
  },
  {
    "baseName": "Steampunk Backpack",
    "slot": "Back",
    "stats": {
      "luck": 57,
      "recovery": 15
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 119556,
    "conditionPct": 96,
    "gradeStars": 2
  },
  {
    "baseName": "Bunny Balloon Backpack",
    "slot": "Back",
    "stats": {
      "luck": 53,
      "walk": 27
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 66690,
    "conditionPct": 97,
    "gradeStars": 2
  },
  {
    "baseName": "Dark Heart Backpack",
    "slot": "Back",
    "stats": {
      "arrowReduction": 40,
      "walk": 35
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "Premium",
      "effect": "Drought Breaker",
      "value": 18
    },
    "displayedValue": 244650,
    "conditionPct": 83,
    "gradeStars": 1
  },
  {
    "baseName": "Green Ghillie Vest",
    "slot": "Back",
    "stats": {
      "luck": 19,
      "recovery": 4.6,
      "walk": -1
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 3601.8,
    "gradeStars": 2
  },
  {
    "baseName": "Pickle Backpack",
    "slot": "Back",
    "stats": {
      "zone": 47,
      "energy": -6
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 42778.8,
    "conditionPct": 83,
    "gradeStars": 2
  },
  {
    "baseName": "Shark Tail Backpack",
    "slot": "Back",
    "stats": {
      "energy": 9.2,
      "npc": -1.5
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 8571.12,
    "conditionPct": 81,
    "gradeStars": 2
  },
  {
    "baseName": "Military Fanny Pack",
    "slot": "Back",
    "stats": {
      "energy": 12,
      "luck": -5
    },
    "mutation": "Mint",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 3003.75,
    "conditionPct": 100,
    "gradeStars": 2
  },
  {
    "baseName": "Autumn Fox Wristband",
    "slot": "Wrist",
    "stats": {
      "luck": 73,
      "zone": 55,
      "npc": -1.5
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 99792,
    "conditionPct": 81,
    "gradeStars": 2
  },
  {
    "baseName": "Autumn Fox Wristband",
    "slot": "Wrist",
    "stats": {
      "luck": 50,
      "energy": -6
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 77280,
    "conditionPct": 80,
    "gradeStars": 1
  },
  {
    "baseName": "Jellyfish Wristband",
    "slot": "Wrist",
    "stats": {
      "arrowReduction": 32,
      "luck": 54,
      "walk": -1
    },
    "mutation": "Diamond",
    "authentication": {
      "kind": "Normal",
      "effect": "Energy Drink Time",
      "value": 24
    },
    "displayedValue": 23120.64,
    "conditionPct": 73,
    "gradeStars": 2
  },
  {
    "baseName": "Bat Wristband",
    "slot": "Wrist",
    "stats": {
      "arrowReduction": 30
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 29462.4,
    "gradeStars": 2
  },
  {
    "baseName": "Luxury Watch",
    "slot": "Wrist",
    "stats": {
      "energy": 23
    },
    "mutation": "Corrupted",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 185220,
    "conditionPct": 60,
    "gradeStars": 1
  },
  {
    "baseName": "Military Bullet Wristband",
    "slot": "Wrist",
    "stats": {
      "zone": 26,
      "tip": 5.3,
      "energy": -6
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 7949.76,
    "conditionPct": 58,
    "gradeStars": 1
  },
  {
    "baseName": "Safe Wristband",
    "slot": "Wrist",
    "stats": {
      "energy": 19,
      "walk": -1
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 700.44,
    "conditionPct": 55,
    "gradeStars": 3
  },
  {
    "baseName": "Flower Wristband",
    "slot": "Wrist",
    "stats": {
      "npc": 4.1,
      "arrowReduction": 16,
      "luck": -5
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 824.93,
    "gradeStars": 2
  },
  {
    "baseName": "Satellite Dish Wristband",
    "slot": "Wrist",
    "stats": {
      "walk": 7.5
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    },
    "displayedValue": 667.82,
    "conditionPct": 93,
    "gradeStars": 1
  }
];

export function makeCurrentGear(): GearItem[] {
  const legacy=makeKnownGear();
  return ROWS.map((row,index)=>{
    const stats:GearStats={luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...row.stats};
    const previous=legacy.find(g=>sameBase(g,{...row,stats}));
    const authenticated=row.authentication.kind!=='None';
    return {...structuredClone(row),stats,authenticated,
      id:previous?.id??`verified-20261118-${index}`,
      name:generateGearName(row.baseName,stats,authenticated,row.authentication),
      favourite:false,createdAt:previous?.createdAt??'2026-11-18T00:00:00.000Z',updatedAt:'2026-11-18T00:00:00.000Z'};
  });
}

function sameBase(a:Pick<GearItem,'baseName'|'slot'|'stats'>,b:Pick<GearItem,'baseName'|'slot'|'stats'>):boolean {
  return a.slot===b.slot&&a.baseName.trim().toLowerCase()===b.baseName.trim().toLowerCase()
    && (Object.keys(b.stats) as Array<keyof GearStats>).every(k=>Math.abs((a.stats[k]??0)-b.stats[k])<1e-5);
}

/** Once-only reconciliation; retain matching identity, favourite and history links.
 * Explicit restores bypass this operation. Later schema-20 edits are never reseeded. */
export function reconcileCurrentGear(existing:GearItem[]):GearItem[] {
  const unused=[...existing];
  return makeCurrentGear().map(next=>{
    let index=unused.findIndex(old=>sameBase(old,next));
    if(index<0){
      // A grading update changes positives but not the item's negative-stat fingerprint.
      const candidates=unused.map((old,index)=>({old,index})).filter(({old})=>old.slot===next.slot&&old.baseName===next.baseName&&old.mutation===next.mutation
        && (Object.keys(next.stats) as Array<keyof GearStats>).every(k=>next.stats[k]<0?old.stats[k]===next.stats[k]:old.stats[k]>=0)
        && (Object.keys(next.stats) as Array<keyof GearStats>).every(k=>Boolean(old.stats[k])===Boolean(next.stats[k])));
      if(candidates.length===1)index=candidates[0].index;
    }
    if(index<0)return next;
    const [old]=unused.splice(index,1);
    return {...next,id:old.id,favourite:old.favourite,createdAt:old.createdAt};
  });
}
