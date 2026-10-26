/// <reference lib="webworker" />
import { analyseOwnedCertificates } from '../engine/certificateDecision';
import { analysePostRollOptions } from '../engine/certificateReroll';
import type { AppData } from '../types';

interface Request {
  id: number;
  data: AppData;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, data } = event.data;
  try {
    const decisions = analyseOwnedCertificates(data);
    const latestRoll=data.rollLog.at(-1);
    const postRoll=latestRoll?analysePostRollOptions(data,latestRoll):undefined;
    self.postMessage({ id, decisions, postRoll });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
