import { describe, expect, it } from 'vitest';
import { confirmFocusedScanBaseStats, parseGearOcrText, scanToGearDraft } from './parser';
import type { GearOcrVisualLine } from './types';
import { effectiveItemStats } from '../engine/scoring';
import { editAuthentication } from '../engine/certificateRolls';

const focusedText = 'Reactor Fedora\nHead\nLuck +125%\nAuthenticated\nFocused +25%';
const visualLines: GearOcrVisualLine[] = [
  { text: 'Reactor Fedora', bbox: { x0: 500, y0: 100, x1: 800, y1: 135 }, color: 'neutral' },
  { text: 'Luck +125%', bbox: { x0: 500, y0: 150, x1: 800, y1: 185 }, color: 'green' },
  { text: 'Focused +25%', bbox: { x0: 500, y0: 200, x1: 800, y1: 235 }, color: 'blue' }
];

describe('Focused scanner base stat integrity', () => {
  it.each([['text', []], ['visual', visualLines]] as const)('%s OCR requires original base stat confirmation', (_source, lines) => {
    const scan = parseGearOcrText(focusedText, [...lines]);
    expect(scan.authentication.effect).toBe('Focused');
    expect(scan.baseStatsProvenance).toBe('requires-confirmation');
    expect(scan.confidence).not.toBe('High');
    expect(scan.warnings.some(warning => warning.includes('original base stats'))).toBe(true);
    expect(() => scanToGearDraft(scan)).toThrow(/original base stats/i);
  });

  it.each([['text', []], ['visual', visualLines]] as const)('%s confirmation separates observed changes and survives a replacement', (_source, lines) => {
    const scan = confirmFocusedScanBaseStats(parseGearOcrText(focusedText, [...lines]), { luck: 100 });
    const item = scanToGearDraft(scan);
    expect(item.stats.luck).toBe(100);
    expect(item.authentication.statDeltas).toEqual({ luck: 25 });
    expect(effectiveItemStats(item).luck).toBe(125);
    const replacement = editAuthentication(item.authentication, { effect: 'Luck', value: 10 });
    expect(effectiveItemStats({ ...item, authentication: replacement }).luck).toBe(110);
  });

  it('requires every observed stat, including zero and signed arrow speed, without assuming a formula', () => {
    const scan = parseGearOcrText(`${focusedText}\nBid Arrow Speed -50%\nWalkspeed +0%`);
    expect(() => confirmFocusedScanBaseStats(scan, { luck: 100 })).toThrow(/every observed stat/i);
    expect(() => confirmFocusedScanBaseStats(scan, { luck: 100, arrowReduction: 40, walk: NaN })).toThrow(/every observed stat/i);
    const item = scanToGearDraft(confirmFocusedScanBaseStats(scan, { luck: 120, arrowReduction: 40, walk: -2 }));
    expect(item.authentication.statDeltas).toEqual({ luck: 5, arrowReduction: 10, walk: 2 });
    expect(effectiveItemStats(item)).toMatchObject({ luck: 125, arrowReduction: 50, walk: 0 });
  });

  it('does not require confirmation for a separate numeric authentication', () => {
    const scan = parseGearOcrText('Reactor Fedora\nHead\nLuck +100%\nAuthenticated\nLuck +10%');
    expect(scan.baseStatsProvenance).toBeUndefined();
    expect(scanToGearDraft(scan).stats.luck).toBe(100);
  });
});
