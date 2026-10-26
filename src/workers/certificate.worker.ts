/// <reference lib="webworker" />
import { analyseOwnedCertificates } from '../engine/certificateDecision';
import { analyseActivePostRoll } from '../engine/certificateReroll';
import type { AppData } from '../types';

interface Request {
  id: number;
  data: AppData;
  activePostRollId?: string;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, data, activePostRollId } = event.data;
  try {
    const decisions = analyseOwnedCertificates(data);
    // A saved roll is historical evidence, not a live paid-reroll opportunity.
    const postRoll=analyseActivePostRoll(data,activePostRollId);
    self.postMessage({ id, decisions, postRoll });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
