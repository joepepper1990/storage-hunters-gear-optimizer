import type { AuthModelEntry, OwnedCertificate, Slot } from './types';

export type CertificateInventoryType = OwnedCertificate['type'];
export type CertificateFamily = 'Normal' | 'Premium' | 'Limited';

export const CURRENT_AUTH_KINDS = ['Normal','Premium','Limited'] as const;

/**
 * One factual row of the canonical certificate catalogue: an outcome that can currently
 * be rolled by a certificate tier on a slot ('Any' = every slot), with its default
 * roll-strength range. Ranges are not invented: unresolved ones are left undefined.
 */
export interface CatalogueOutcome {
  type: CertificateInventoryType;
  slot: Slot | 'Any';
  effect: string;
  min?: number;
  typical?: number;
  max?: number;
  confidence: AuthModelEntry['confidence'];
  category: string;
}

const WOODEN='Wooden Certificate of Authenticity', RIPPED='Ripped Certificate of Authenticity';
const PREMIUM='Premium Certificate of Authenticity', LIMITED='Limited Certificate of Authenticity';

/**
 * The single source of truth for which outcomes exist. Selectors, the default catalogue
 * rows and the equal-probability pools are all derived from this list, so they cannot
 * drift. Plain Luck is not a current Wooden/Ripped outcome (it remains a native gear stat
 * and legacy authentications stay readable). Fossil Finder and Alien effects are historical.
 */
export const CERTIFICATE_CATALOGUE: readonly CatalogueOutcome[] = [
  {type:WOODEN,slot:'Any',effect:'Bid Recovery',min:5,max:25,confidence:'Medium',category:'Wooden basic'},
  {type:WOODEN,slot:'Any',effect:'Bid Arrow Speed',min:-60,max:-12,confidence:'Medium',category:'Wooden basic'},
  {type:WOODEN,slot:'Any',effect:'Bid Zone Width',min:15,max:75,confidence:'Medium',category:'Wooden basic'},
  {type:WOODEN,slot:'Any',effect:'Energy Drink Time',min:10,max:50,confidence:'Medium',category:'Wooden basic'},
  {type:WOODEN,slot:'Any',effect:'Tip Chance',min:3,max:15,confidence:'Medium',category:'Wooden basic'},
  {type:WOODEN,slot:'Any',effect:'NPC Offers Bonus',min:3,max:15,confidence:'Medium',category:'Wooden basic'},
  {type:WOODEN,slot:'Any',effect:'Walkspeed',min:10,max:50,confidence:'Medium',category:'Wooden basic'},
  {type:WOODEN,slot:'Head',effect:'Sunny',min:10,max:100,confidence:'Medium',category:'Wooden exclusive'},
  {type:WOODEN,slot:'Head',effect:'Nocturnal',min:10,max:100,confidence:'Medium',category:'Wooden exclusive'},
  {type:WOODEN,slot:'Head',effect:'Overcharged',min:5,max:20,confidence:'Medium',category:'Wooden exclusive'},
  {type:WOODEN,slot:'Back',effect:'Raindrop',min:10,max:100,confidence:'Medium',category:'Wooden exclusive'},
  {type:WOODEN,slot:'Back',effect:'Focused',confidence:'Unknown',category:'Wooden exclusive — formula/range unresolved'},
  {type:WOODEN,slot:'Wrist',effect:'Time Keeper',min:5,max:40,confidence:'Medium',category:'Wooden exclusive'},
  {type:WOODEN,slot:'Wrist',effect:'Connected',min:2,max:12,confidence:'Medium',category:'Wooden exclusive'},

  {type:RIPPED,slot:'Any',effect:'Bid Recovery',min:3.8,max:13,confidence:'Medium',category:'Ripped basic'},
  {type:RIPPED,slot:'Any',effect:'Bid Arrow Speed',min:-30,max:-15,confidence:'Low',category:'Ripped basic — published band remains community/unconfirmed'},
  {type:RIPPED,slot:'Any',effect:'Bid Zone Width',min:11,max:38,confidence:'Medium',category:'Ripped basic'},
  {type:RIPPED,slot:'Any',effect:'Energy Drink Time',min:7,max:25,confidence:'Medium',category:'Ripped basic'},
  {type:RIPPED,slot:'Any',effect:'Tip Chance',min:2.3,max:7.5,confidence:'Medium',category:'Ripped basic'},
  {type:RIPPED,slot:'Any',effect:'NPC Offers Bonus',min:2.3,max:7.5,confidence:'Medium',category:'Ripped basic'},
  {type:RIPPED,slot:'Any',effect:'Walkspeed',min:7.5,max:25,confidence:'Medium',category:'Ripped basic'},
  {type:RIPPED,slot:'Head',effect:'Sunny',confidence:'Unknown',category:'Ripped exclusive — available, range unresolved'},
  {type:RIPPED,slot:'Head',effect:'Nocturnal',confidence:'Unknown',category:'Ripped exclusive — available, range unresolved'},
  {type:RIPPED,slot:'Head',effect:'Overcharged',confidence:'Unknown',category:'Ripped exclusive — available, range unresolved'},
  {type:RIPPED,slot:'Back',effect:'Raindrop',min:8,max:50,confidence:'Medium',category:'Ripped exclusive — confirmed'},
  {type:RIPPED,slot:'Back',effect:'Focused',confidence:'Unknown',category:'Ripped exclusive — available, formula/range unresolved'},
  {type:RIPPED,slot:'Wrist',effect:'Time Keeper',min:4,max:20,confidence:'Medium',category:'Ripped exclusive — confirmed'},
  {type:RIPPED,slot:'Wrist',effect:'Connected',confidence:'Unknown',category:'Ripped exclusive — available, range unresolved'},

  {type:PREMIUM,slot:'Head',effect:'Mutated Luck',confidence:'High',category:'Premium perk'},
  {type:PREMIUM,slot:'Back',effect:'Golden Hour',confidence:'Low',category:'Premium perk'},
  {type:PREMIUM,slot:'Back',effect:'Drought Breaker',confidence:'Low',category:'Premium perk'},
  {type:PREMIUM,slot:'Wrist',effect:'Club Pact',confidence:'Medium',category:'Premium perk'},
  {type:PREMIUM,slot:'Wrist',effect:'Temporal Split',confidence:'Medium',category:'Premium perk'},

  {type:LIMITED,slot:'Head',effect:'Auto X-Ray',min:3,max:30,confidence:'High',category:'Limited passive'},
  {type:LIMITED,slot:'Head',effect:'Grade Re-Roll',min:5,max:25,confidence:'High',category:'Limited passive'},
  {type:LIMITED,slot:'Back',effect:'Luck Frenzy',min:10,max:110,confidence:'Medium',category:'Limited passive'},
  {type:LIMITED,slot:'Back',effect:'Featherweight',min:3,max:20,confidence:'High',category:'Limited passive'},
  {type:LIMITED,slot:'Wrist',effect:'Second Chance',min:4,max:33,confidence:'High',category:'Limited passive'},
  {type:LIMITED,slot:'Wrist',effect:'Steady Hand',min:4,max:33,confidence:'High',category:'Limited passive'}
];

/** Older or community spellings of the same mechanic. An alias is never a separate outcome. */
export const EFFECT_ALIASES: Readonly<Record<string,string>> = {
  'Droughtbreaker':'Drought Breaker',
  'Club Packed':'Club Pact',
  'Timekeeper':'Time Keeper',
  'Overcharge':'Overcharged',
  'Focus':'Focused'
};

export function canonicalEffect(effect:string):string {
  const name=effect.trim();
  return EFFECT_ALIASES[name]??name;
}

export function certificateFamily(type:CertificateInventoryType):CertificateFamily {
  return type===PREMIUM?'Premium':type===LIMITED?'Limited':'Normal';
}

/** Fixed, canonical outcome pool of a certificate tier on a slot. Each entry is equally likely. */
export function currentPool(type:CertificateInventoryType,slot:Slot):string[] {
  return [...new Set(CERTIFICATE_CATALOGUE.filter(o=>o.type===type&&(o.slot==='Any'||o.slot===slot)).map(o=>o.effect))];
}

/** Catalogue row for one canonical outcome, slot-specific rows winning over 'Any'. */
export function catalogueOutcome(type:CertificateInventoryType,slot:Slot,effect:string):CatalogueOutcome|undefined {
  const rows=CERTIFICATE_CATALOGUE.filter(o=>o.type===type&&o.effect===canonicalEffect(effect)&&(o.slot==='Any'||o.slot===slot));
  return rows.find(o=>o.slot===slot)??rows[0];
}

const FAMILY_TYPES:Record<CertificateFamily,CertificateInventoryType[]>={
  Normal:[WOODEN,RIPPED],Premium:[PREMIUM],Limited:[LIMITED]
};

function familyPool(family:CertificateFamily,slot?:Slot):string[] {
  const types=FAMILY_TYPES[family];
  return [...new Set(CERTIFICATE_CATALOGUE.filter(o=>types.includes(o.type)&&(!slot||o.slot==='Any'||o.slot===slot)).map(o=>o.effect))];
}

const sharedNormal=CERTIFICATE_CATALOGUE.filter(o=>o.type===WOODEN&&o.slot==='Any').map(o=>o.effect);
/** The seven common Wooden/Ripped outcomes. Plain Luck is not among them. */
export const NORMAL_NUMERIC_AUTH_EFFECTS: readonly string[] = sharedNormal;
const bySlot=(family:CertificateFamily):Record<Slot,readonly string[]>=>({
  Head:familyPool(family,'Head').filter(e=>family!=='Normal'||!sharedNormal.includes(e)),
  Back:familyPool(family,'Back').filter(e=>family!=='Normal'||!sharedNormal.includes(e)),
  Wrist:familyPool(family,'Wrist').filter(e=>family!=='Normal'||!sharedNormal.includes(e))
});
export const EXCLUSIVE_AUTH_EFFECTS:Record<Slot,readonly string[]>=bySlot('Normal');
export const PREMIUM_AUTH_EFFECTS:Record<Slot,readonly string[]>=bySlot('Premium');
export const LIMITED_AUTH_EFFECTS:Record<Slot,readonly string[]>=bySlot('Limited');
export const LEGACY_ALIEN_EFFECTS = ['Haggler','Anti-Gravity Field','Safecracker','Grade Re-Roll','Exhibitor','Rush'] as const;
/** Readable on old items and logs, never part of a current certificate pool. */
export const HISTORICAL_EFFECTS = ['Luck','Fossil Finder'] as const;

/** Effect choices for an item's authentication: the current family pool, plus the item's own legacy value. */
export function activeAuthenticationOptions(slot:Slot,current='',kind:CertificateFamily='Normal'):string[]{
  const options=familyPool(kind,slot);
  return ['',...new Set(current&&!options.includes(current)?[current,...options]:options)];
}

/** Outcomes a certificate can currently roll; without a slot, every slot's outcomes. */
export function activeCertificateOutcomeOptions(
  slot:Slot|undefined,
  kind:CertificateFamily='Normal',
  inventoryType?:CertificateInventoryType
):string[]{
  if(inventoryType)return slot?currentPool(inventoryType,slot):[...new Set((['Head','Back','Wrist'] as Slot[]).flatMap(s=>currentPool(inventoryType,s)))];
  return familyPool(kind,slot);
}

/** Player-reported enchantment behaviour; informational, not an official score formula. */
export function enchantmentDescription(effect:string,value:number):string {
  switch(effect){
    case 'Mutated Luck': return 'Adds Luck from the actual mutations on the equipped Head + Back + Wrist trio; calculated by the unified loadout engine.';
    case 'Nocturnal': return `Adds +${value}% Luck at night. Evaluated in the Night Auction context rather than averaged with invented uptime.`;
    case 'Temporal Split': return `${value}% chance for an item to instantly mutate when placed in the Time Capsule. Not counted as ordinary gear Luck.`;
    case 'Club Pact': return 'Premium wrist effect. It is not a wanted result for this profile and adds no auction value.';
    case 'Club Packed': return 'Legacy spelling of Club Pact; kept for older saved data.';
    case 'Connected': return `Friend-based Luck effect. It is not a wanted result for this profile, so unknown friend count does not protect the item from discard.`;
    case 'Auto X-Ray': return `Limited Head passive: ${value}% roll shown by the game. It is not a wanted result for this profile.`;
    case 'Grade Re-Roll': return `Limited Head passive: ${value}% chance for a free automatic second grade roll after a low grade. Lucky Grading is owned and included in the grading model.`;
    case 'Luck Frenzy': return `Limited Back passive: ${value}% Luck burst magnitude. Trigger uptime is scenario-modelled because frequency/duration are not published.`;
    case 'Featherweight': return 'Limited Back passive: chance for an auction item loaded onto the vehicle to add no weight. Exact proc rate is not yet verified.';
    case 'Second Chance': return 'Limited Wrist passive: chance to skip the bidding cooldown after a missed bid. Exact proc rate is not yet verified.';
    case 'Steady Hand': return 'Limited Wrist passive: chance for the next bid zone to be wider after a missed bid. Exact proc rate and width increase are not yet verified.';
    case 'Fossil Finder': return 'Older Limited-event passive: chance for an auction item to gain Fossil. It is not assumed to be a current Limited Certificate outcome.';
    default: return '';
  }
}
