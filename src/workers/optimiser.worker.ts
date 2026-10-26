/// <reference lib="webworker" />
import { analyseItems, optimise } from '../engine/optimizer';
import type { AlgorithmSettings, GearItem } from '../types';

interface Request {
  id: number;
  gear: GearItem[];
  settings: AlgorithmSettings;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, gear, settings } = event.data;
  try {
    const top100 = optimise(gear, settings, 100);
    const analyses = analyseItems(gear, top100[0], settings);
    self.postMessage({ id, phase: 'core', top100, analyses });
  } catch (error) {
    self.postMessage({ id, phase: 'core', error: error instanceof Error ? error.message : String(error) });
  }
};
