import { describe, expect, it } from 'vitest';
import { makeInitialData } from '../defaults';
import { rebuildEmpiricalModel } from './certificateRolls';
import type { AuthModelEntry, CertificateRollLog } from '../types';

const roll = (overrides: Partial<CertificateRollLog> = {}): CertificateRollLog => ({
  id: 'r1', date: '2026-10-20T00:00:00.000Z', certificateType: 'Normal Certificate of Authenticity', itemId: 'x', itemName: 'Cap', slot: 'Head',
  previousAuthentication: '', previousValue: 0, newAuthentication: 'Luck', newValue: 7.25, improvedBestSet: true, bestScoreBefore: 0, bestScoreAfter: 0, ...overrides
} as CertificateRollLog);

describe('rebuilding roll evidence', () => {
  const model = makeInitialData().authModel;
  const luckRows = (m: AuthModelEntry[]) => m.filter(e => e.outcome === 'Luck' && e.certificateType === 'Normal Certificate of Authenticity');
  const count = (m: AuthModelEntry[], value: number) => luckRows(m).reduce((n, e) => n + e.observedValues.filter(v => v === value).length, 0);

  it('re-saving an unchanged roll never adds a copy, with or without a certificate tier', () => {
    for (const r of [roll(), roll({ certificateInventoryType: 'Wooden Certificate of Authenticity' })]) {
      let m = rebuildEmpiricalModel(model, [], [r]);
      for (let i = 0; i < 3; i++) m = rebuildEmpiricalModel(m, [r], [r]);
      expect(count(m, 7.25)).toBe(1);
    }
  });
  it('deleting a roll removes exactly its own sample and keeps imported evidence', () => {
    const legacy: AuthModelEntry = { ...luckRows(model)[0], id: 'legacy', slot: 'Any', certificateInventoryType: undefined, observedValues: [7.25, 8], observedSampleCount: 2 };
    const base = [...model, legacy];
    const r = roll({ certificateInventoryType: 'Wooden Certificate of Authenticity' });
    const recorded = rebuildEmpiricalModel(base, [], [r]);
    const deleted = rebuildEmpiricalModel(recorded, [r], []);
    expect(deleted.find(e => e.id === 'legacy')?.observedValues).toEqual([7.25, 8]);
    expect(count(deleted, 7.25)).toBe(1);
  });
});

import { updateCertificateGroup } from './certificateInventory';
describe('editing a grouped certificate line', () => {
  const data = makeInitialData();
  const wooden = data.ownedCertificates.filter(c => c.type === 'Wooden Certificate of Authenticity');
  const total = (d: typeof data) => d.ownedCertificates.filter(c => c.type === 'Wooden Certificate of Authenticity' && c.gradeStars === 2).reduce((n, c) => n + c.quantity, 0);
  it('sets the line total, taking from the last batches first', () => {
    const next = updateCertificateGroup(data, wooden.map(c => c.id), { type: 'Wooden Certificate of Authenticity', quantity: 3, gradeStars: 2 });
    expect(total(next)).toBe(3);
    expect(next.ownedCertificates.find(c => c.id === wooden[0].id)?.quantity).toBe(1);
    expect(next.ownedCertificates.find(c => c.id === wooden[5].id)?.quantity).toBe(0);
    expect(total(updateCertificateGroup(data, wooden.map(c => c.id), { type: 'Wooden Certificate of Authenticity', quantity: 8, gradeStars: 2 }))).toBe(8);
  });
  it('changes the grade of every certificate on the line', () => {
    const next = updateCertificateGroup(data, wooden.map(c => c.id), { type: 'Wooden Certificate of Authenticity', quantity: 6, gradeStars: 3 });
    expect(next.ownedCertificates.filter(c => c.type === 'Wooden Certificate of Authenticity').every(c => c.gradeStars === 3)).toBe(true);
  });
});
