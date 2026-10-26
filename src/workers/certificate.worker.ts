/// <reference lib="webworker" />
import { analyseOwnedCertificates } from '../engine/certificateDecision';
import type { AppData } from '../types';

interface Request {
  id: number;
  data: AppData;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, data } = event.data;
  try {
    const decisions = analyseOwnedCertificates(data);
    self.postMessage({ id, decisions });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
