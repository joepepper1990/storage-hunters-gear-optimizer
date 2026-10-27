import type { OwnedCertificate } from '../types';
import { compareCertificateTargets, type CertificateTargetDecision, type OwnedCertificateDecision } from './certificateDecision';
import { CERTIFICATE_TYPES } from './certificateInventory';

export interface CertificateQueueRow {
  certificate: OwnedCertificate;
  target: CertificateTargetDecision;
}

export interface CertificateHold {
  certificate: OwnedCertificate;
  /** Units of this batch with no qualifying target in the current queue. */
  quantity: number;
}

export interface CertificateQueue {
  rows: CertificateQueueRow[];
  hold: CertificateHold[];
}

const ACTIONABLE = new Set(['USE', 'CONSIDER']);

/**
 * Ranked action queue for the current inventory. Every row is evaluated against the
 * same current, fully-recorded state: no row assumes an earlier row's unknown result.
 * Each row consumes one owned unit, and each target appears at most once. After any
 * recorded result the caller re-analyses and rebuilds the queue from scratch.
 */
export function buildCertificateQueue(decisions: OwnedCertificateDecision[]): CertificateQueue {
  const candidates = decisions.flatMap((decision, batchIndex) =>
    decision.targets.filter(target => ACTIONABLE.has(target.verdict)).map(target => ({ decision, batchIndex, target })));
  const typeRank = (cert: OwnedCertificate) => CERTIFICATE_TYPES.indexOf(cert.type);
  candidates.sort((a, b) =>
    compareCertificateTargets(a.target, b.target) ||
    // Equal opportunities prefer the more common certificate, keeping rarer ones for later.
    typeRank(a.decision.certificate) - typeRank(b.decision.certificate) ||
    a.batchIndex - b.batchIndex);

  const remaining = new Map(decisions.map(decision => [decision.certificate.id, Math.max(0, decision.certificate.quantity)]));
  // Per target, the batches that qualify for it, best first.
  const options = new Map<string, Array<{ decision: OwnedCertificateDecision; target: CertificateTargetDecision }>>();
  for (const candidate of candidates) {
    const list = options.get(candidate.target.item.id) ?? [];
    list.push(candidate);
    options.set(candidate.target.item.id, list);
  }
  const rows: CertificateQueueRow[] = [];
  const usedTargets = new Set<string>();

  // Frees one unit of a batch, if needed by moving one of its rows to another qualifying
  // batch (augmenting path). Targets are claimed in rank order, so a higher-ranked
  // target is never displaced; only which batch serves it can change.
  const free = (id: string, visited: Set<string>): boolean => {
    if ((remaining.get(id) ?? 0) > 0) return true;
    visited.add(id);
    for (const row of rows) {
      if (row.certificate.id !== id) continue;
      for (const option of options.get(row.target.item.id) ?? []) {
        const other = option.decision.certificate.id;
        if (visited.has(other) || !free(other, visited)) continue;
        row.certificate = option.decision.certificate;
        row.target = option.target;
        remaining.set(other, (remaining.get(other) ?? 0) - 1);
        remaining.set(id, (remaining.get(id) ?? 0) + 1);
        return true;
      }
    }
    return false;
  };

  for (const { decision, target } of candidates) {
    if (usedTargets.has(target.item.id) || !free(decision.certificate.id, new Set())) continue;
    rows.push({ certificate: decision.certificate, target });
    remaining.set(decision.certificate.id, (remaining.get(decision.certificate.id) ?? 0) - 1);
    usedTargets.add(target.item.id);
  }
  rows.sort((a, b) => compareCertificateTargets(a.target, b.target) || typeRank(a.certificate) - typeRank(b.certificate));

  const hold = decisions
    .map(decision => ({ certificate: decision.certificate, quantity: remaining.get(decision.certificate.id) ?? 0 }))
    .filter(entry => entry.quantity > 0);
  return { rows, hold };
}
