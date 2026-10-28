import type { AppData, OwnedCertificate } from '../types';

export const CERTIFICATE_TYPES: OwnedCertificate['type'][] = [
  'Wooden Certificate of Authenticity',
  'Ripped Certificate of Authenticity',
  'Premium Certificate of Authenticity',
  'Limited Certificate of Authenticity'
];

export interface CertificateBatchInput {
  type: OwnedCertificate['type'];
  quantity: number;
  gradeStars?: number;
  mutation?: string;
}

/** One batch per distinct type + star grade + mutation. */
export function certificateVariantKey(cert: Pick<OwnedCertificate, 'type' | 'gradeStars' | 'mutation'>): string {
  return [cert.type, cert.gradeStars ?? '', (cert.mutation ?? '').trim().toLowerCase()].join('|');
}

export function certificateLabel(cert: Pick<OwnedCertificate, 'type' | 'gradeStars' | 'mutation'>): string {
  const tier = cert.type.replace(' Certificate of Authenticity', '');
  return [tier, cert.gradeStars !== undefined ? `${cert.gradeStars}★` : '', cert.mutation?.trim() ?? ''].filter(Boolean).join(' · ');
}

function validated(input: CertificateBatchInput): CertificateBatchInput {
  if (!CERTIFICATE_TYPES.includes(input.type)) throw new Error('Choose a certificate type.');
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) throw new Error('Quantity must be a whole number of 0 or more.');
  if (input.gradeStars !== undefined && (!Number.isSafeInteger(input.gradeStars) || input.gradeStars < 0 || input.gradeStars > 5)) throw new Error('Grade must be 0 to 5 stars.');
  const mutation = input.mutation?.trim();
  return { ...input, mutation: mutation && mutation.toLowerCase() !== 'none' ? mutation : undefined };
}

/** Adds owned certificates. An identical variant gains quantity; a new variant becomes its own batch. */
export function addCertificateBatch(data: AppData, input: CertificateBatchInput): AppData {
  const batch = validated(input);
  if (batch.quantity < 1) throw new Error('Add at least one certificate.');
  const key = certificateVariantKey(batch);
  const existing = data.ownedCertificates.find(cert => certificateVariantKey(cert) === key);
  if (existing) return setCertificateQuantity(data, existing.id, existing.quantity + batch.quantity);
  const created: OwnedCertificate = { id: crypto.randomUUID(), type: batch.type, quantity: batch.quantity,
    ...(batch.gradeStars === undefined ? {} : { gradeStars: batch.gradeStars }),
    ...(batch.mutation ? { mutation: batch.mutation } : {}) };
  return { ...data, ownedCertificates: [...data.ownedCertificates, created] };
}

/** Edits a batch's identity or quantity. Other recorded fields (value, condition, rarity) are kept. */
export function updateCertificateBatch(data: AppData, id: string, input: CertificateBatchInput): AppData {
  const batch = validated(input);
  const current = data.ownedCertificates.find(cert => cert.id === id);
  if (!current) throw new Error('That certificate batch no longer exists.');
  const key = certificateVariantKey(batch);
  // Changing identity into another existing variant would split one variant across rows.
  // Rows that already share a variant (distinct physical certificates) stay editable.
  if (key !== certificateVariantKey(current) && data.ownedCertificates.some(cert => cert.id !== id && certificateVariantKey(cert) === key))
    throw new Error('A batch with this type, grade and mutation already exists. Adjust its quantity instead.');
  const next: OwnedCertificate = { ...current, type: batch.type, quantity: batch.quantity, gradeStars: batch.gradeStars, mutation: batch.mutation };
  if (next.gradeStars === undefined) delete next.gradeStars;
  if (next.mutation === undefined) delete next.mutation;
  return { ...data, ownedCertificates: data.ownedCertificates.map(cert => cert.id === id ? next : cert) };
}

/**
 * Edits every batch shown as one line (same type, grade and mutation). The identity change
 * applies to all of them; the quantity is the line's total, added to the first batch or
 * taken from the last batches first, so each physical certificate keeps its record.
 */
export function updateCertificateGroup(data: AppData, ids: string[], input: CertificateBatchInput): AppData {
  if (ids.length === 1) return updateCertificateBatch(data, ids[0], input);
  const batch = validated(input);
  const group = ids.map(id => data.ownedCertificates.find(cert => cert.id === id));
  if (group.some(cert => !cert)) throw new Error('That certificate batch no longer exists.');
  const key = certificateVariantKey(batch);
  if (key !== certificateVariantKey(group[0]!) && data.ownedCertificates.some(cert => !ids.includes(cert.id) && certificateVariantKey(cert) === key))
    throw new Error('A batch with this type, grade and mutation already exists. Adjust its quantity instead.');
  const quantities = new Map(group.map(cert => [cert!.id, cert!.quantity]));
  let change = batch.quantity - group.reduce((n, cert) => n + cert!.quantity, 0);
  if (change > 0) quantities.set(ids[0], quantities.get(ids[0])! + change);
  for (const id of [...ids].reverse()) {
    if (change >= 0) break;
    const take = Math.min(quantities.get(id)!, -change);
    quantities.set(id, quantities.get(id)! - take);
    change += take;
  }
  return { ...data, ownedCertificates: data.ownedCertificates.map(cert => {
    if (!quantities.has(cert.id)) return cert;
    const next: OwnedCertificate = { ...cert, type: batch.type, quantity: quantities.get(cert.id)!, gradeStars: batch.gradeStars, mutation: batch.mutation };
    if (next.gradeStars === undefined) delete next.gradeStars;
    if (next.mutation === undefined) delete next.mutation;
    return next;
  }) };
}

export function setCertificateQuantity(data: AppData, id: string, quantity: number): AppData {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Quantity must be a whole number of 0 or more.');
  return { ...data, ownedCertificates: data.ownedCertificates.map(cert => cert.id === id ? { ...cert, quantity } : cert) };
}

export function removeCertificateBatch(data: AppData, id: string): AppData {
  return { ...data, ownedCertificates: data.ownedCertificates.filter(cert => cert.id !== id) };
}
