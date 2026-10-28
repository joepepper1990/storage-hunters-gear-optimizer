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

export function setCertificateQuantity(data: AppData, id: string, quantity: number): AppData {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Quantity must be a whole number of 0 or more.');
  return { ...data, ownedCertificates: data.ownedCertificates.map(cert => cert.id === id ? { ...cert, quantity } : cert) };
}

export function removeCertificateBatch(data: AppData, id: string): AppData {
  return { ...data, ownedCertificates: data.ownedCertificates.filter(cert => cert.id !== id) };
}
