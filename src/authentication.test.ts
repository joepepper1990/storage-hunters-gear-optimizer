import { describe, expect, it } from 'vitest';
import { makeDefaultAuthModel } from './defaults';
import { activeAuthenticationOptions, activeCertificateOutcomeOptions, CURRENT_AUTH_KINDS, LEGACY_ALIEN_EFFECTS, NORMAL_NUMERIC_AUTH_EFFECTS } from './authentication';

describe('current authentication options',()=>{
  it('includes Energy Drink Time as a normal numeric authentication',()=>{
    expect(NORMAL_NUMERIC_AUTH_EFFECTS).toContain('Energy Drink Time');
    expect(activeAuthenticationOptions('Head','',makeDefaultAuthModel())).toContain('Energy Drink Time');
    expect(activeCertificateOutcomeOptions('Wrist',makeDefaultAuthModel())).toContain('Energy Drink Time');
  });

  it('offers Normal and Premium as current authentication types and no legacy Alien effects',()=>{
    expect(CURRENT_AUTH_KINDS).toEqual(['Normal','Premium']);
    expect(activeAuthenticationOptions('Head','',makeDefaultAuthModel(),'Premium')).toContain('Mutated Luck');
    expect(activeAuthenticationOptions('Back','',makeDefaultAuthModel(),'Premium')).toContain('Golden Hour');
    expect(activeAuthenticationOptions('Wrist','',makeDefaultAuthModel(),'Premium')).toContain('Temporal Split');
    const legacyMisclassified={id:'legacy',certificateType:'Normal Certificate of Authenticity' as const,slot:'Any' as const,outcome:'Rush',category:'legacy',assumedLikelihoodClass:'MEDIUM' as const,observedSampleCount:0,observedValues:[],confidence:'Unknown' as const,enabled:true};
    const model=[...makeDefaultAuthModel(),legacyMisclassified];
    const options=activeAuthenticationOptions('Wrist','',model);
    const certOptions=activeCertificateOutcomeOptions('Wrist',model);
    for(const effect of LEGACY_ALIEN_EFFECTS){ expect(options.includes(effect)).toBe(false); expect(certOptions.includes(effect)).toBe(false); }
  });
});
