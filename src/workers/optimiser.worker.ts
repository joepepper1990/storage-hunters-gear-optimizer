/// <reference lib="webworker" />
import { analyseItems, optimise } from '../engine/optimizer';
import { certificateTargets } from '../engine/certificates';
import type { AlgorithmSettings, AuthModelEntry, GearItem } from '../types';

interface Request {
  id: number;
  gear: GearItem[];
  settings: AlgorithmSettings;
  authModel: AuthModelEntry[];
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, gear, settings, authModel } = event.data;
  try {
    const top100 = optimise(gear, settings, 100);
    const analyses = analyseItems(gear, top100[0], settings);
    // Publish the loadout and discard proof first. Certificate heuristics are materially
    // heavier on large inventories and should not delay the core optimiser UI.
    self.postMessage({ id, phase: 'core', top100, analyses });

    try {
      const normalTargets = certificateTargets(gear, settings, authModel, 'Normal Certificate of Authenticity', 10);
      self.postMessage({ id, phase: 'certificates', normalTargets });
    } catch (error) {
      self.postMessage({ id, phase: 'certificates', error: error instanceof Error ? error.message : String(error) });
    }
  } catch (error) {
    self.postMessage({ id, phase: 'core', error: error instanceof Error ? error.message : String(error) });
  }
};
