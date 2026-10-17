import { TROPHY_ACTIVE_LIMIT } from '../engine/trophies';

export const TROPHY_UI_CONTRACT = {
  activeLimit: TROPHY_ACTIVE_LIMIT,
  showAlternateSets: false,
  showSpecialistSets: true,
  showInventoryVerdicts: true
} as const;
