import type { Authentication, GearItem, GearStats, Slot } from '../types';
import { generateGearName } from '../naming';
import { makeKnownGear } from './knownGear';

// Complete inventory explicitly confirmed by the owner from 28 detail screenshots.
// Keep base stats separate from blue authentication; Focused's displayed 103 was 80.
const ROWS: Array<{baseName:string;slot:Slot;gradeStars:number;conditionPct:number;
  stats:Partial<GearStats>;mutation:string;authentication:Authentication}> = [
  {
    "baseName": "Reactor Fedora",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 55,
    "stats": {
      "arrowReduction": 45,
      "luck": 75
    },
    "mutation": "None",
    "authentication": {
      "kind": "Premium",
      "effect": "Mutated Luck",
      "value": 0
    }
  },
  {
    "baseName": "Autumn Dominus",
    "slot": "Head",
    "gradeStars": 1,
    "conditionPct": 84,
    "stats": {
      "energy": 44,
      "zone": 64
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Business Bowler",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 100,
    "stats": {
      "arrowReduction": 15,
      "energy": -6
    },
    "mutation": "Mint",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Luxury Fedora",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 96,
    "stats": {
      "arrowReduction": 61,
      "energy": 51
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Mummy Fedora",
    "slot": "Head",
    "gradeStars": 1,
    "conditionPct": 74,
    "stats": {
      "energy": 17
    },
    "mutation": "Gold + Limited",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Race Valk",
    "slot": "Head",
    "gradeStars": 3,
    "conditionPct": 56,
    "stats": {
      "arrowReduction": 76,
      "energy": 64
    },
    "mutation": "Cobwebbed",
    "authentication": {
      "kind": "Normal",
      "effect": "NPC Offers Bonus",
      "value": 7.7
    }
  },
  {
    "baseName": "Royal Dominus",
    "slot": "Head",
    "gradeStars": 3,
    "conditionPct": 83,
    "stats": {
      "luck": 120,
      "zone": 90
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Steampunk Goggle",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 52,
    "stats": {
      "energy": 19,
      "luck": 38,
      "zone": -5
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Steampunk Goggle",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 84,
    "stats": {
      "arrowReduction": 27,
      "luck": 100
    },
    "mutation": "Chrome",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Steampunk Goggle",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 83,
    "stats": {
      "tip": 4.9,
      "arrowReduction": 19,
      "energy": -6
    },
    "mutation": "Spellbound",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Steampunk Goggle",
    "slot": "Head",
    "gradeStars": 3,
    "conditionPct": 85,
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
    }
  },
  {
    "baseName": "Steampunk Monocle",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 62,
    "stats": {
      "walk": 14,
      "luck": 83
    },
    "mutation": "Chrome",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Steampunk Valk Helm",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 93,
    "stats": {
      "luck": 44,
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
    "baseName": "Steampunk Valk Helm",
    "slot": "Head",
    "gradeStars": 2,
    "conditionPct": 85,
    "stats": {
      "tip": 7.3
    },
    "mutation": "Void + Silver",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Vampire Dominus",
    "slot": "Head",
    "gradeStars": 3,
    "conditionPct": 99,
    "stats": {
      "zone": 86,
      "arrowReduction": 68
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Elegant Business Backpack",
    "slot": "Back",
    "gradeStars": 1,
    "conditionPct": 92,
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
    }
  },
  {
    "baseName": "Dark Heart Backpack",
    "slot": "Back",
    "gradeStars": 2,
    "conditionPct": 91,
    "stats": {
      "luck": 77,
      "tip": 12
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Dark Heart Backpack",
    "slot": "Back",
    "gradeStars": 1,
    "conditionPct": 83,
    "stats": {
      "arrowReduction": 40,
      "walk": 35
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "Premium",
      "effect": "Drought Breaker",
      "value": 18
    }
  },
  {
    "baseName": "Elegant Business Backpack",
    "slot": "Back",
    "gradeStars": 1,
    "conditionPct": 91,
    "stats": {
      "luck": 76
    },
    "mutation": "Hologram",
    "authentication": {
      "kind": "Normal",
      "effect": "Energy Drink Time",
      "value": 35
    }
  },
  {
    "baseName": "Fox Backpack",
    "slot": "Back",
    "gradeStars": 1,
    "conditionPct": 84,
    "stats": {
      "luck": 94,
      "tip": 14
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Halloween Boombox",
    "slot": "Back",
    "gradeStars": 2,
    "conditionPct": 67,
    "stats": {
      "walk": 46,
      "luck": 91
    },
    "mutation": "Limited",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Luxury Backpack",
    "slot": "Back",
    "gradeStars": 2,
    "conditionPct": 57,
    "stats": {
      "luck": 104,
      "npc": 16
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Steampunk Backpack",
    "slot": "Back",
    "gradeStars": 2,
    "conditionPct": 96,
    "stats": {
      "luck": 57,
      "recovery": 15
    },
    "mutation": "None",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Steampunk Ribbon Backpack",
    "slot": "Back",
    "gradeStars": 2,
    "conditionPct": 50,
    "stats": {
      "arrowReduction": 15,
      "luck": 25
    },
    "mutation": "Spellbound",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Jellyfish Wristband",
    "slot": "Wrist",
    "gradeStars": 2,
    "conditionPct": 73,
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
    }
  },
  {
    "baseName": "Autumn Fox Wristband",
    "slot": "Wrist",
    "gradeStars": 2,
    "conditionPct": 81,
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
    }
  },
  {
    "baseName": "Bat Wristband",
    "slot": "Wrist",
    "gradeStars": 2,
    "conditionPct": 88,
    "stats": {
      "arrowReduction": 42,
      "walk": 35
    },
    "mutation": "Exclusive",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  },
  {
    "baseName": "Hazard Wristband",
    "slot": "Wrist",
    "gradeStars": 2,
    "conditionPct": 96,
    "stats": {
      "luck": 41,
      "zone": -5
    },
    "mutation": "Spiderwebbed + Limited",
    "authentication": {
      "kind": "None",
      "effect": "",
      "value": 0
    }
  }
];

export function makeCurrentGear(): GearItem[] {
  const legacy=makeKnownGear();
  return ROWS.map((row,index)=>{
    const stats:GearStats={luck:0,energy:0,tip:0,walk:0,vehicle:0,recovery:0,zone:0,arrowReduction:0,npc:0,...row.stats};
    const previous=legacy.find(g=>sameBase(g,{...row,stats}));
    const authenticated=row.authentication.kind!=='None';
    return {...structuredClone(row),stats,authenticated,
      id:previous?.id??`verified-20261101-${index}`,
      name:generateGearName(row.baseName,stats,authenticated,row.authentication),
      favourite:false,createdAt:previous?.createdAt??'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z'};
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
    const index=unused.findIndex(old=>sameBase(old,next));
    if(index<0)return next;
    const [old]=unused.splice(index,1);
    return {...next,id:old.id,favourite:old.favourite,createdAt:old.createdAt};
  });
}
