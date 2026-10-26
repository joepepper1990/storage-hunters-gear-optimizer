import type { AuthModelEntry, OwnedCertificate, Slot } from './types';

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
    const modeled=model.filter(m=>m.enabled&&m.certificateType==='Premium Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)).map(m=>m.outcome);
    const options=[...PREMIUM_AUTH_EFFECTS[slot],...modeled];
    return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
  }
  if(kind==='Limited'){
    const modeled=model.filter(m=>m.enabled&&m.certificateType==='Limited Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)).map(m=>m.outcome);
    const options=[...LIMITED_AUTH_EFFECTS[slot],...modeled];
    return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
  }
  const modeled=model.filter(m=>m.enabled&&m.certificateType==='Normal Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const options=[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot],...CURRENT_NAME_ALIASES[slot],...modeled];
  return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
}

export function activeCertificateOutcomeOptions(
  slot:Slot|undefined,
  model:AuthModelEntry[]=[],
  kind:'Normal'|'Premium'|'Limited'='Normal',
  inventoryType?:OwnedCertificate['type']
):string[]{
  const certificateType=
    kind==='Premium'?'Premium Certificate of Authenticity':
    kind==='Limited'?'Limited Certificate of Authenticity':
    'Normal Certificate of Authenticity';

  const exact=model.filter(m=>
    m.enabled &&
    m.certificateType===certificateType &&
    (!slot||m.slot==='Any'||m.slot===slot) &&
    (!inventoryType||m.certificateInventoryType===inventoryType)
  );
  if(exact.length)return [...new Set(exact.map(m=>m.outcome))];

  if(kind==='Premium')return slot?activeAuthenticationOptions(slot,'',model,'Premium').filter(Boolean):[...new Set(Object.values(PREMIUM_AUTH_EFFECTS).flat())];
  if(kind==='Limited')return slot?activeAuthenticationOptions(slot,'',model,'Limited').filter(Boolean):[...new Set(Object.values(LIMITED_AUTH_EFFECTS).flat())];

  const modeled=model.filter(m=>m.enabled&&m.certificateType==='Normal Certificate of Authenticity'&&(!slot||m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const base=slot?[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot]]:[...NORMAL_NUMERIC_AUTH_EFFECTS];
  return [...new Set([...base,...modeled])];
}

/** Player-reported enchantment behaviour; informational, not an official score formula. */
export function enchantmentDescription(effect:string,value:number):string {
  switch(effect){
    case 'Mutated Luck': return 'Adds Luck from the actual mutations on the equipped Head + Back + Wrist trio; calculated by the unified loadout engine.';
    case 'Nocturnal': return `Adds +${value}% Luck at night. Evaluated in the Night Auction context rather than averaged with invented uptime.`;
    case 'Temporal Split': return `${value}% chance for an item to instantly mutate when placed in the Time Capsule. Not counted as ordinary gear Luck.`;
    case 'Club Pact': return 'Premium wrist effect. It is F-tier for this profile, so it does not create Main or specialist retention value.';
    case 'Club Packed': return 'Legacy spelling of Club Pact; kept for older saved data.';
    case 'Connected': return `Friend-based Luck effect. It is F-tier for this profile, so unknown friend count does not protect the item from discard.`;
    case 'Auto X-Ray': return `Limited Head passive: ${value}% roll shown by the game. It is F-tier for this profile.`;
    case 'Grade Re-Roll': return `Limited Head passive: ${value}% chance for a free automatic second grade roll after a low grade. Lucky Grading is owned and included in the grading model.`;
    case 'Luck Frenzy': return `Limited Back passive: ${value}% Luck burst magnitude. Trigger uptime is scenario-modelled because frequency/duration are not published.`;
    case 'Featherweight': return 'Limited Back passive: chance for an auction item loaded onto the vehicle to add no weight. Exact proc rate is not yet verified.';
    case 'Second Chance': return 'Limited Wrist passive: chance to skip the bidding cooldown after a missed bid. Exact proc rate is not yet verified.';
    case 'Steady Hand': return 'Limited Wrist passive: chance for the next bid zone to be wider after a missed bid. Exact proc rate and width increase are not yet verified.';
    case 'Fossil Finder': return 'Older Limited-event passive: chance for an auction item to gain Fossil. It is not assumed to be a current Limited Certificate outcome.';
    default: return '';
  }
}
