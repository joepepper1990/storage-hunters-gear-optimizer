import type { AuthModelEntry, Slot } from './types';

export const CURRENT_AUTH_KINDS = ['Normal','Premium'] as const;
export const NORMAL_NUMERIC_AUTH_EFFECTS = ['Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance','NPC Offers Bonus','Walkspeed'] as const;
export const PREMIUM_AUTH_EFFECTS:Record<Slot,readonly string[]>={Head:['Mutated Luck'],Back:['Drought Breaker','Golden Hour'],Wrist:['Club Packed','Temporal Split']};
// Current guides use these spellings alongside older in-game/community spellings. Keep both selectable; uncertain aliases stay protected until their exact mechanics are verified.
export const CURRENT_NAME_ALIASES:Record<Slot,readonly string[]>={Head:['Sonic','Overcharge'],Back:['Focus'],Wrist:['Timekeeper']};
export const LEGACY_ALIEN_EFFECTS = ['Haggler','Anti-Gravity Field','Safecracker','Grade Re-Roll','Exhibitor','Rush'] as const;
export const EVENT_PASSIVE_EFFECTS = ['Fossil Finder','Luck Frenzy','Auto X-Ray','Featherweight','Second Chance','Steady Hand'] as const;
export const EXCLUSIVE_AUTH_EFFECTS:Record<Slot,readonly string[]>={Head:['Sunny','Nocturnal','Overcharged'],Back:['Raindrop','Focused'],Wrist:['Time Keeper','Connected']};

export function activeAuthenticationOptions(slot:Slot,current='',model:AuthModelEntry[]=[],kind:'Normal'|'Premium'='Normal'):string[]{
  if(kind==='Premium'){
    const modeled=model.filter(m=>m.certificateType==='Premium Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)).map(m=>m.outcome);
    const options=[...PREMIUM_AUTH_EFFECTS[slot],...modeled];
    return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
  }
  const modeled=model.filter(m=>m.certificateType==='Normal Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const options=[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot],...CURRENT_NAME_ALIASES[slot],...EVENT_PASSIVE_EFFECTS,...modeled];
  return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
}

export function activeCertificateOutcomeOptions(slot:Slot|undefined,model:AuthModelEntry[]=[]):string[]{
  const modeled=model.filter(m=>m.certificateType==='Normal Certificate of Authenticity'&&(!slot||m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const base=slot?[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot]]:[...NORMAL_NUMERIC_AUTH_EFFECTS];
  return [...new Set([...base,...modeled])];
}
