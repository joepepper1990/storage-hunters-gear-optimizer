import type { AuthModelEntry, Slot } from './types';

export const CURRENT_AUTH_KINDS = ['Normal'] as const;
export const NORMAL_NUMERIC_AUTH_EFFECTS = ['Luck','Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance','NPC Offers Bonus','Walkspeed'] as const;
export const LEGACY_ALIEN_EFFECTS = ['Haggler','Anti-Gravity Field','Safecracker','Grade Re-Roll','Exhibitor','Rush'] as const;
export const EVENT_PASSIVE_EFFECTS = ['Fossil Finder','Luck Frenzy','Auto X-Ray','Featherweight','Second Chance','Steady Hand'] as const;
export const EXCLUSIVE_AUTH_EFFECTS:Record<Slot,readonly string[]>={Head:['Sunny','Nocturnal','Overcharged'],Back:['Raindrop','Focused'],Wrist:['Time Keeper','Connected']};

export function activeAuthenticationOptions(slot:Slot,current='',model:AuthModelEntry[]=[]):string[]{
  const modeled=model.filter(m=>m.certificateType==='Normal Certificate of Authenticity'&&(m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const options=[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot],...EVENT_PASSIVE_EFFECTS,...modeled];
  return ['',...new Set(current&&!options.includes(current as never)?[current,...options]:options)];
}

export function activeCertificateOutcomeOptions(slot:Slot|undefined,model:AuthModelEntry[]=[]):string[]{
  const modeled=model.filter(m=>m.certificateType==='Normal Certificate of Authenticity'&&(!slot||m.slot==='Any'||m.slot===slot)&&!LEGACY_ALIEN_EFFECTS.includes(m.outcome as never)).map(m=>m.outcome);
  const base=slot?[...NORMAL_NUMERIC_AUTH_EFFECTS,...EXCLUSIVE_AUTH_EFFECTS[slot]]:[...NORMAL_NUMERIC_AUTH_EFFECTS];
  return [...new Set([...base,...modeled])];
}
