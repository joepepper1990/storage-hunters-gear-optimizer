import { describe, expect, it } from 'vitest';
import { makeDefaultAuthModel } from './defaults';
import {
  activeAuthenticationOptions,
  activeCertificateOutcomeOptions,
  CURRENT_AUTH_KINDS,
  LEGACY_ALIEN_EFFECTS,
  LIMITED_AUTH_EFFECTS,
  NORMAL_NUMERIC_AUTH_EFFECTS
} from './authentication';

describe('current authentication options',()=>{
  it('includes Energy Drink Time as a normal numeric authentication',()=>{
    expect(NORMAL_NUMERIC_AUTH_EFFECTS).toContain('Energy Drink Time');
    expect(activeAuthenticationOptions('Head','',makeDefaultAuthModel())).toContain('Energy Drink Time');
    expect(activeCertificateOutcomeOptions('Wrist',makeDefaultAuthModel())).toContain('Energy Drink Time');
  });

  it('offers Normal, Premium and Limited as current authentication types',()=>{
    expect(CURRENT_AUTH_KINDS).toEqual(['Normal','Premium','Limited']);
    expect(activeAuthenticationOptions('Head','',makeDefaultAuthModel(),'Premium')).toContain('Mutated Luck');
    expect(activeAuthenticationOptions('Back','',makeDefaultAuthModel(),'Premium')).toContain('Golden Hour');
    expect(activeAuthenticationOptions('Wrist','',makeDefaultAuthModel(),'Premium')).toContain('Temporal Split');
  });

  it('keeps the six Limited Certificate outcomes slot-locked and out of Normal rolls',()=>{
    const model=makeDefaultAuthModel();
    expect(LIMITED_AUTH_EFFECTS).toEqual({
      Head:['Auto X-Ray','Grade Re-Roll'],
      Back:['Luck Frenzy','Featherweight'],
      Wrist:['Second Chance','Steady Hand']
    });
    expect(activeAuthenticationOptions('Head','',model,'Limited').filter(Boolean)).toEqual(['Auto X-Ray','Grade Re-Roll']);
    expect(activeAuthenticationOptions('Back','',model,'Limited').filter(Boolean)).toEqual(['Luck Frenzy','Featherweight']);
    expect(activeAuthenticationOptions('Wrist','',model,'Limited').filter(Boolean)).toEqual(['Second Chance','Steady Hand']);
    expect(activeAuthenticationOptions('Head','',model,'Normal')).not.toContain('Auto X-Ray');
    expect(activeAuthenticationOptions('Back','',model,'Normal')).not.toContain('Luck Frenzy');
    expect(activeCertificateOutcomeOptions(undefined,model,'Limited')).toEqual(expect.arrayContaining([
      'Auto X-Ray','Grade Re-Roll','Luck Frenzy','Featherweight','Second Chance','Steady Hand'
    ]));
  });

  it('does not expose legacy Alien effects as current Normal outcomes',()=>{
    const legacyMisclassified={id:'legacy',certificateType:'Normal Certificate of Authenticity' as const,slot:'Any' as const,outcome:'Rush',category:'legacy',assumedLikelihoodClass:'MEDIUM' as const,observedSampleCount:0,observedValues:[],confidence:'Unknown' as const,enabled:true};
    const model=[...makeDefaultAuthModel(),legacyMisclassified];
    const options=activeAuthenticationOptions('Wrist','',model);
    const certOptions=activeCertificateOutcomeOptions('Wrist',model);
    for(const effect of LEGACY_ALIEN_EFFECTS){ expect(options.includes(effect)).toBe(false); expect(certOptions.includes(effect)).toBe(false); }
  });
});
