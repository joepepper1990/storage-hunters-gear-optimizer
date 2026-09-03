import { describe, expect, it } from 'vitest';
import { TROPHY_UI_CONTRACT } from './trophyUiContract';

describe('Gavel UI contract',()=>{
  it('shows only the best four recommendation with no alternate/specialist/verdict optimiser UI',()=>{
    expect(TROPHY_UI_CONTRACT.activeLimit).toBe(4);
    expect(TROPHY_UI_CONTRACT.showAlternateSets).toBe(false);
    expect(TROPHY_UI_CONTRACT.showSpecialistSets).toBe(false);
    expect(TROPHY_UI_CONTRACT.showInventoryVerdicts).toBe(false);
  });
});
