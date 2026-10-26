import type { AuthModelEntry, Slot } from './types';

export const CURRENT_AUTH_KINDS = ['Normal','Premium','Limited'] as const;
export const NORMAL_NUMERIC_AUTH_EFFECTS = ['Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance','NPC Offers Bonus','Walkspeed'] as const;
export const PREMIUM_AUTH_EFFECTS:Record<Slot,readonly string[]>={Head:['Mutated Luck'],Back:['Droughtbreaker','Golden Hour'],Wrist:['Club Pact','Club Packed','Temporal Split']};
/**
 * Limited Certificate outcomes currently confirmed by the user's in-game information.
 * Exact proc-rate ranges are not independently verified, so these are utility-ranked
 * separately from the numeric optimiser rather than assigned invented score values.
 */
export const LIMITED_AUTH_EFFECTS:Record<Slot,readonly string[]>={
  Head:['Auto X-Ray','Grade Re-Roll'],
  Back:['Luck Frenzy','Featherweight'],
  Wrist:['Second Chance','Steady Hand']
};
// Current guides use these spellings alongside older in-game/community spellings. Keep both selectable; uncertain aliases stay protected until their exact mechanics are verified.
export const CURRENT_NAME_ALIASES:Record<Slot,readonly string[]>={Head:['Sonic','Overcharge'],Back:['Focus'],Wrist:['Timekeeper']};
export const LEGACY_ALIEN_EFFECTS = ['Haggler','Anti-Gravity Field','Safecracker','Grade Re-Roll','Exhibitor','Rush'] as const;
/** Historical/event passives that may exist on accessories but are not assumed to be current Limited Certificate outcomes. */
export const EVENT_PASSIVE_EFFECTS = ['Fossil Finder','Luck Frenzy','Auto X-Ray','Featherweight','Second Chance','Steady Hand'] as const;
export const EXCLUSIVE_AUTH_EFFECTS:Record<Slot,readonly string[]>={Head:['Sunny','Nocturnal','Overcharged'],Back:['Raindrop','Focused'],Wrist:['Time Keeper','Connected']};

export function activeAuthenticationOptions(slot:Slot,current='',model:AuthModelEntry[]=[],kind:'Normal'|'Premium'|'Limited'='Normal'):string[]{
  if(kind==='Premium'){
    const modeled=model.filter(m=>m.certificateType==='Premium Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)).map(m=>m.outcome);
    const options=[...PREMIUM_AUTH_EFFECTS[slot],...modeled];
    return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
  }
  if(kind==='Limited'){
    const modeled=model.filter(m=>m.certificateType==='Limited Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)).map(m=>m.outcome);
    const options=[...LIMITED_AUTH_EFFECTS[slot],...modeled];
    return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
  }
  const modeled=model.filter(m=>m.certificateType==='Normal Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const options=[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot],...CURRENT_NAME_ALIASES[slot],...modeled];
  return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
}

export function activeCertificateOutcomeOptions(slot:Slot|undefined,model:AuthModelEntry[]=[],kind:'Normal'|'Premium'|'Limited'='Normal'):string[]{
  if(kind==='Premium')return slot?activeAuthenticationOptions(slot,'',model,'Premium').filter(Boolean):[...new Set(Object.values(PREMIUM_AUTH_EFFECTS).flat())];
  if(kind==='Limited')return slot?activeAuthenticationOptions(slot,'',model,'Limited').filter(Boolean):[...new Set(Object.values(LIMITED_AUTH_EFFECTS).flat())];
  const modeled=model.filter(m=>m.certificateType==='Normal Certificate of Authenticity'&&(!slot||m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const base=slot?[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot]]:[...NORMAL_NUMERIC_AUTH_EFFECTS];
  return [...new Set([...base,...modeled])];
}

/** Player-reported enchantment behaviour; informational, not an official score formula. */
export function enchantmentDescription(effect:string,value:number):string {
  switch(effect){
    case 'Mutated Luck': return 'Each worn accessory adds extra Luck based on its mutator. The amount is not yet modelled.';
    case 'Nocturnal': return `Adds +${value}% Luck at night. The optimiser uses adjustable expected nighttime uptime.`;
    case 'Temporal Split': return `${value}% chance for an item to instantly mutate when placed in the Time Capsule. Not counted as ordinary gear Luck.`;
    case 'Club Pact': return 'Premium wrist enchantment increasing club-associated Luck; the exact added amount depends on club context and is not safely modelled.';
    case 'Club Packed': return 'Legacy spelling of Club Pact; kept for older saved data.';
    case 'Connected': return `Each friend grants +${value}% Luck. Friend count is unknown, so this benefit is not added to gear score.`;
    case 'Auto X-Ray': return 'Limited Head passive: chance for an auction to begin with X-Ray already active. Exact proc rate is not yet verified.';
    case 'Grade Re-Roll': return 'Limited Head passive: chance for a free automatic second grade roll after Replica or 1-Star. Exact proc rate is not yet verified.';
    case 'Luck Frenzy': return 'Limited Back passive: can trigger a large temporary Luck burst while equipped. Trigger rate, duration and magnitude are not yet verified.';
    case 'Featherweight': return 'Limited Back passive: chance for an auction item loaded onto the vehicle to add no weight. Exact proc rate is not yet verified.';
    case 'Second Chance': return 'Limited Wrist passive: chance to skip the bidding cooldown after a missed bid. Exact proc rate is not yet verified.';
    case 'Steady Hand': return 'Limited Wrist passive: chance for the next bid zone to be wider after a missed bid. Exact proc rate and width increase are not yet verified.';
    case 'Fossil Finder': return 'Older Limited-event passive: chance for an auction item to gain Fossil. It is not assumed to be a current Limited Certificate outcome.';
    default: return '';
  }
}
