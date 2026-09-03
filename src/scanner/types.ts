import type { Authentication, GearStats, Slot } from '../types';

export type ScanConfidence = 'High' | 'Medium' | 'Low';
export type OcrLineColor = 'green' | 'blue' | 'neutral';

export interface GearOcrVisualLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  color: OcrLineColor;
}

export interface ParsedGearScan {
  rawText: string;
  baseName: string;
  slot: Slot;
  slotDetected: boolean;
  stats: GearStats;
  authenticated: boolean;
  authentication: Authentication;
  confidence: ScanConfidence;
  warnings: string[];
  recognisedFields: string[];
  fieldConfidence: Record<string, number>;
}
