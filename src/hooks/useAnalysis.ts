import { useEffect, useMemo, useRef, useState } from 'react';
import { analyseItems, optimise } from '../engine/optimizer';
import { analyseOwnedCertificates, type OwnedCertificateDecision } from '../engine/certificateDecision';
import { analyseActivePostRoll, type PostRollDecision } from '../engine/certificateReroll';
import { certificateInputKey, optimisationInputKey } from '../engine/analysisFreshness';
import { algorithmIssues } from '../engine/settingsValidation';
import type { AppData, ItemAnalysis } from '../types';

// Vite bundles a worker only when `new Worker(new URL(...))` is written inline.
function optimiserWorker(): Worker | undefined {
  try { return typeof Worker === 'undefined' ? undefined : new Worker(new URL('../workers/optimiser.worker.ts', import.meta.url), { type: 'module' }); } catch { return undefined; }
}
function certificateWorker(): Worker | undefined {
  try { return typeof Worker === 'undefined' ? undefined : new Worker(new URL('../workers/certificate.worker.ts', import.meta.url), { type: 'module' }); } catch { return undefined; }
}

/** Gear retention verdicts. `current` is true only when the result matches the live inventory and settings. */
export function useGearAnalysis(data: AppData | null) {
  const inputKey = useMemo(() => data ? optimisationInputKey(data.gear, data.settings) : '', [data?.gear, data?.settings]);
  const [state, setState] = useState<{ analyses: ItemAnalysis[]; resultKey: string; computing: boolean; error?: string }>({ analyses: [], resultKey: '', computing: false });
  const requestId = useRef(0);
  useEffect(() => {
    if (!data) return;
    const id = ++requestId.current;
    if (algorithmIssues(data.settings).length) { setState({ analyses: [], resultKey: '', computing: false, error: 'Invalid settings' }); return; }
    setState(prev => ({ ...prev, computing: true, error: undefined }));
    const foreground = () => {
      try {
        const analyses = analyseItems(data.gear, optimise(data.gear, data.settings, 1)[0], data.settings);
        if (id === requestId.current) setState({ analyses, resultKey: inputKey, computing: false });
      } catch (error) {
        if (id === requestId.current) setState(prev => ({ ...prev, computing: false, error: error instanceof Error ? error.message : String(error) }));
      }
    };
    const worker = optimiserWorker();
    if (!worker) { foreground(); return; }
    worker.onmessage = (event: MessageEvent<{ id: number; analyses?: ItemAnalysis[]; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) { foreground(); return; }
      setState({ analyses: event.data.analyses ?? [], resultKey: inputKey, computing: false });
    };
    worker.onerror = () => { worker.terminate(); foreground(); };
    worker.postMessage({ id, gear: data.gear, settings: data.settings });
    return () => worker.terminate();
  }, [inputKey]);
  return { ...state, current: Boolean(data) && state.resultKey === inputKey && !state.computing };
}

/** Certificate decisions plus the optional live post-roll prompt, each with its own freshness key. */
export function useCertificateAnalysis(data: AppData | null, activePostRollId?: string) {
  const sourceKey = useMemo(() => data ? certificateInputKey(data) : '', [data?.gear, data?.settings, data?.rollLog, data?.ownedCertificates, data?.authModel]);
  const postKey = sourceKey + '|postroll:' + (activePostRollId ?? 'none');
  const [state, setState] = useState<{ decisions: OwnedCertificateDecision[]; resultKey: string; computing: boolean; error?: string }>({ decisions: [], resultKey: '', computing: false });
  const [post, setPost] = useState<{ value?: PostRollDecision; key: string; error?: string }>({ key: '' });
  const requestId = useRef(0), postId = useRef(0);

  useEffect(() => {
    if (!data) return;
    const id = ++requestId.current;
    const issues = algorithmIssues(data.settings);
    if (issues.length) { setState({ decisions: [], resultKey: '', computing: false, error: 'Correct invalid preferences first.' }); return; }
    setState(prev => ({ ...prev, computing: true, error: undefined }));
    const foreground = () => {
      try { const decisions = analyseOwnedCertificates(data, { conversion: false }); if (id === requestId.current) setState({ decisions, resultKey: sourceKey, computing: false }); }
      catch (error) { if (id === requestId.current) setState(prev => ({ ...prev, computing: false, error: error instanceof Error ? error.message : String(error) })); }
    };
    const worker = certificateWorker();
    if (!worker) { const timer = setTimeout(foreground, 0); return () => clearTimeout(timer); }
    worker.onmessage = (event: MessageEvent<{ id: number; decisions?: OwnedCertificateDecision[]; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      setState({ decisions: event.data.decisions ?? [], resultKey: event.data.error ? '' : sourceKey, computing: false, error: event.data.error });
    };
    worker.onerror = () => { worker.terminate(); foreground(); };
    worker.postMessage({ id, data, mode: 'owned' });
    return () => worker.terminate();
  }, [sourceKey]);

  useEffect(() => {
    const id = ++postId.current;
    setPost({ key: '' });
    if (!data || !activePostRollId) return;
    const foreground = () => {
      try { const value = analyseActivePostRoll(data, activePostRollId); if (id === postId.current) setPost({ value, key: postKey }); }
      catch (error) { if (id === postId.current) setPost({ key: postKey, error: error instanceof Error ? error.message : String(error) }); }
    };
    const worker = certificateWorker();
    if (!worker) { const timer = setTimeout(foreground, 0); return () => clearTimeout(timer); }
    worker.onmessage = (event: MessageEvent<{ id: number; postRoll?: PostRollDecision; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      setPost({ value: event.data.postRoll, key: postKey, error: event.data.error });
    };
    worker.onerror = () => { worker.terminate(); foreground(); };
    worker.postMessage({ id, data, mode: 'postRoll', activePostRollId });
    return () => worker.terminate();
  }, [postKey]);

  return {
    ...state,
    current: Boolean(data) && state.resultKey === sourceKey && !state.computing,
    postRoll: post.key === postKey ? post.value : undefined,
    postRollError: post.key === postKey ? post.error : undefined
  };
}
