import { describe, expect, it } from 'vitest';
import { TROPHY_UI_CONTRACT } from './trophyUiContract';

describe('Gavel UI contract',()=>{
  it('shows best-four, specialist protection and retention verdicts without alternate overall sets',()=>{
    expect(TROPHY_UI_CONTRACT.activeLimit).toBe(4);
    expect(TROPHY_UI_CONTRACT.showAlternateSets).toBe(false);
    expect(TROPHY_UI_CONTRACT.showSpecialistSets).toBe(true);
    expect(TROPHY_UI_CONTRACT.showInventoryVerdicts).toBe(true);
  });
});
