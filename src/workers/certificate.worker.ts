/// <reference lib="webworker" />
import { analyseOwnedCertificates } from '../engine/certificateDecision';
import { analyseActivePostRoll } from '../engine/certificateReroll';
import { algorithmIssues } from '../engine/settingsValidation';
import type { AppData } from '../types';

interface Request {
  id: number;
  data: AppData;
  activePostRollId?: string;
  mode?: 'owned' | 'postRoll';
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, data, activePostRollId } = event.data;
  try {
    const issues=algorithmIssues(data.settings);
    if(issues.length)throw new Error('Correct invalid settings before using certificate advice: '+issues.join('; '));
    if(event.data.mode==='postRoll')self.postMessage({id,postRoll:analyseActivePostRoll(data,activePostRollId)});
    else self.postMessage({id,decisions:analyseOwnedCertificates(data,{conversion:false})});
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

