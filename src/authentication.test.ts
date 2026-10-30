import { describe, expect, it } from 'vitest';
import { makeDefaultAuthModel } from './defaults';
import {
  activeAuthenticationOptions,
  activeCertificateOutcomeOptions,
  CERTIFICATE_CATALOGUE,
  CURRENT_AUTH_KINDS,
  LEGACY_ALIEN_EFFECTS,
  LIMITED_AUTH_EFFECTS,
  NORMAL_NUMERIC_AUTH_EFFECTS
} from './authentication';

describe('current authentication options',()=>{
  it('has seven common Wooden/Ripped outcomes, Energy Drink Time included and plain Luck not',()=>{
    expect([...NORMAL_NUMERIC_AUTH_EFFECTS]).toEqual(['Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance','NPC Offers Bonus','Walkspeed']);
    expect(activeAuthenticationOptions('Head','')).toContain('Energy Drink Time');
    expect(activeCertificateOutcomeOptions('Wrist')).toContain('Energy Drink Time');
    expect(activeAuthenticationOptions('Head','')).not.toContain('Luck');
  });

  it('keeps a legacy Luck authentication selectable on the item that already has it',()=>{
    expect(activeAuthenticationOptions('Back','Luck')).toContain('Luck');
  });

  it('offers Normal, Premium and Limited as current authentication types',()=>{
    expect(CURRENT_AUTH_KINDS).toEqual(['Normal','Premium','Limited']);
    expect(activeAuthenticationOptions('Head','','Premium')).toContain('Mutated Luck');
    expect(activeAuthenticationOptions('Back','','Premium')).toEqual(['','Golden Hour','Drought Breaker']);
    expect(activeAuthenticationOptions('Wrist','','Premium')).toEqual(['','Club Pact','Temporal Split']);
  });

  it('keeps the six Limited Certificate outcomes slot-locked and out of Normal rolls',()=>{
    expect(LIMITED_AUTH_EFFECTS).toEqual({
      Head:['Auto X-Ray','Grade Re-Roll'],
      Back:['Luck Frenzy','Featherweight'],
      Wrist:['Second Chance','Steady Hand']
    });
    expect(activeAuthenticationOptions('Head','','Limited').filter(Boolean)).toEqual(['Auto X-Ray','Grade Re-Roll']);
    expect(activeAuthenticationOptions('Back','','Limited').filter(Boolean)).toEqual(['Luck Frenzy','Featherweight']);
    expect(activeAuthenticationOptions('Wrist','','Limited').filter(Boolean)).toEqual(['Second Chance','Steady Hand']);
    expect(activeAuthenticationOptions('Head','','Normal')).not.toContain('Auto X-Ray');
    expect(activeAuthenticationOptions('Back','','Normal')).not.toContain('Luck Frenzy');
    expect(activeCertificateOutcomeOptions(undefined,'Limited')).toEqual(expect.arrayContaining([
      'Auto X-Ray','Grade Re-Roll','Luck Frenzy','Featherweight','Second Chance','Steady Hand'
    ]));
    expect(activeCertificateOutcomeOptions(undefined,'Limited')).not.toContain('Fossil Finder');
  });

  it('does not expose legacy Alien effects as current Normal outcomes',()=>{
    const options=activeAuthenticationOptions('Wrist','');
    const certOptions=activeCertificateOutcomeOptions('Wrist');
    for(const effect of LEGACY_ALIEN_EFFECTS.filter(e=>e!=='Grade Re-Roll')){ expect(options.includes(effect)).toBe(false); expect(certOptions.includes(effect)).toBe(false); }
  });

  it('derives the default catalogue rows from the one canonical catalogue',()=>{
    const model=makeDefaultAuthModel();
    expect(model.map(r=>[r.certificateInventoryType,r.slot,r.outcome])).toEqual(CERTIFICATE_CATALOGUE.map(o=>[o.type,o.slot,o.effect]));
  });
});
