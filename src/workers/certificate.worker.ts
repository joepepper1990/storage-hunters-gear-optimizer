/// <reference lib="webworker" />
import { analyseOwnedCertificates } from '../engine/certificateDecision';
import { analysePostRollOptions } from '../engine/certificateReroll';
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
    const latestRoll=data.rollLog.at(-1);
    // The session token only exists in the current React session, never in saved history.
    const postRoll=activePostRollId&&latestRoll?.id===activePostRollId
      ?analysePostRollOptions(data,latestRoll):undefined;
    self.postMessage({ id, decisions, postRoll });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
