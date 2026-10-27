import type { GearStats } from '../types';

const statKeys = new Set(['luck','energy','tip','walk','vehicle','recovery','zone','arrowReduction','npc']);

/** Both backup formats preserve observed deltas only when their meaning is known. */
export function validateStatDeltas(value: unknown, label: string): Partial<GearStats> {
  const error = () => new Error(`${label} must be an object containing known stat keys with finite numeric values.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw error();
  for (const [key, delta] of Object.entries(value)) {
    if (!statKeys.has(key) || typeof delta !== 'number' || !Number.isFinite(delta)) throw error();
  }
  return value as Partial<GearStats>;
}
