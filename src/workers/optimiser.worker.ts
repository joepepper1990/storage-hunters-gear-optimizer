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
    const analyses = analyseItems(gear, optimise(gear, settings, 1)[0], settings);
    self.postMessage({ id, analyses });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
