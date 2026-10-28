import type { Authentication, GearStats, OwnedCertificate, Slot, TrophyModifier } from '../types';
export { AUTH_EFFECTS } from './parser';
import { bestAuthEffect, bestStatMatch, extractPercentage, inferSlotFromName, LIMITED_EFFECTS, PREMIUM_EFFECTS } from './parser';

/**
 * Reads the item panel of an in-game inventory screenshot. The panel has a fixed layout:
 * star grade at the top left, stat lines below it (green = base stat, red = harmful base
 * stat, blue = authentication, grey = effect description), and on the right the name with
 * [Tag] prefixes, rarity, value and condition. OCR runs on each region separately; this
 * module turns the recognised text into an item. Prices are ignored.
 */
export type PanelLineColor = 'green' | 'red' | 'blue' | 'neutral';
export interface PanelLine { text: string; color: PanelLineColor }
export interface PanelRead { infoLines: string[]; statLines: PanelLine[]; stars: number }

interface Common { stars: number; conditionPct?: number; warnings: string[] }
export type PanelScan =
  | (Common & { kind: 'gear'; baseName: string; mutation: string; slot?: Slot; stats: GearStats; authentication: Authentication;
      /** Focused changes the shown stats, so its base stats must be checked by hand before saving. */
      baseConfirmed?: boolean })
  | (Common & { kind: 'gavel'; modifiers: TrophyModifier[] })
  | (Common & { kind: 'certificate'; type: OwnedCertificate['type']; mutation?: string })
  | (Common & { kind: 'unknown' });

const ZERO: GearStats = { luck: 0, energy: 0, tip: 0, walk: 0, vehicle: 0, recovery: 0, zone: 0, arrowReduction: 0, npc: 0 };
const RARITY = /^(common|uncommon|rare|epic|legendary|mythical|mythic|exotic|secret|divine|celestial)$/i;
const CERTIFICATE = /\b(wooden|ripped|premium|limited)\s+certificate\b/i;

function clean(text: string): string {
  return text.replace(/[|“”"]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Name lines come before the rarity line; long names wrap onto a second line. */
function readInfo(lines: string[]): { name: string; tags: string[]; conditionPct?: number } {
  const cleaned = lines.map(clean).filter(Boolean);
  const rarity = cleaned.findIndex(line => RARITY.test(line));
  const nameLines = rarity > 0 ? cleaned.slice(0, rarity) : cleaned.slice(0, 1);
  const full = nameLines.join(' ');
  const tags = [...full.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim());
  const name = full.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const condition = cleaned.join(' ').match(/condition\W*(\d{1,3})\s*%/i);
  const conditionPct = condition ? Number(condition[1]) : undefined;
  return { name, tags, conditionPct: conditionPct !== undefined && conditionPct <= 100 ? conditionPct : undefined };
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, word => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function authKind(effect: string): Authentication['kind'] {
  return PREMIUM_EFFECTS.has(effect) ? 'Premium' : LIMITED_EFFECTS.has(effect) ? 'Limited' : 'Normal';
}

/** Stat lines over busy artwork can lose letters ("-1.5% N PoE Bonus"); one distinctive word is enough. */
const STAT_KEYWORDS: Array<[RegExp, keyof GearStats]> = [
  [/\bbonus\b|\boffers?\b|\bnpc\b/i, 'npc'], [/\barrow\b/i, 'arrowReduction'], [/\bzone\b|\bwidth\b/i, 'zone'],
  [/\brecovery\b/i, 'recovery'], [/\bdrink\b|\benergy\b/i, 'energy'], [/\btip\b|\bchance\b/i, 'tip'],
  [/\bwalk/i, 'walk'], [/\bluck\b/i, 'luck']
];
function statByKeyword(text: string): keyof GearStats | undefined {
  return STAT_KEYWORDS.find(([pattern]) => pattern.test(text))?.[1];
}

export function parsePanel(read: PanelRead, knownSlots: Map<string, Slot> = new Map()): PanelScan {
  const { name, tags, conditionPct } = readInfo(read.infoLines);
  const common: Common = { stars: read.stars, conditionPct, warnings: [] };
  if (!name && !tags.length) return { ...common, kind: 'unknown', warnings: ['No item name found. This may not be an item screenshot.'] };

  if (/gavel\s*trophy/i.test(name)) {
    // Tolerant of stray symbols the reader adds inside a tag, e.g. "[Chrome +24%)]".
    const modifiers = tags.map(tag => tag.match(/([A-Za-z][A-Za-z ]*?)\s*\+\s*(\d+(?:[.,]\d+)?)/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map(m => ({ mutation: titleCase(m[1].trim()), boostPct: Number(m[2].replace(',', '.')) }));
    if (!modifiers.length) common.warnings.push('No mutation boosts found in the name.');
    return { ...common, kind: 'gavel', modifiers };
  }

  const certificate = name.match(CERTIFICATE);
  if (certificate) {
    const tier = titleCase(certificate[1]) as 'Wooden' | 'Ripped' | 'Premium' | 'Limited';
    const mutation = tags.filter(tag => tag.toLowerCase() !== tier.toLowerCase()).join(' + ') || undefined;
    return { ...common, kind: 'certificate', type: `${tier} Certificate of Authenticity`, mutation };
  }

  const stats = { ...ZERO };
  let authentication: Authentication = { kind: 'None', effect: '', value: 0 };
  let describedValue = false;
  for (const line of read.statLines) {
    const text = clean(line.text);
    // Item artwork behind the text can read as stray symbols; real lines contain a word.
    if (!/[a-z]{4,}/i.test(text)) continue;
    // The authentication is always the last stat line; everything after it describes it,
    // whatever colour the artwork behind it gives ("+35% luck during the night"). Some
    // effects show their number only there ("Droughtbreaker" / "+18 Luck per auction ..."),
    // so the first number of the first description line fills an effect shown without one.
    if (authentication.kind !== 'None') {
      if (!describedValue && authentication.value === 0) {
        const number = text.match(/[+\-]?\s*(\d+(?:[.,]\d+)?)/);
        if (number) authentication = { ...authentication, value: Number(number[1].replace(',', '.')) };
      }
      describedValue = true;
      continue;
    }
    const value = extractPercentage(text);
    if (line.color === 'blue') {
      const effect = bestAuthEffect(text);
      if (effect) authentication = { kind: authKind(effect.effect), effect: effect.effect, value: value ?? 0 };
      else common.warnings.push(`Authentication not recognised: "${text}".`);
      continue;
    }
    const key = value === undefined ? undefined : bestStatMatch(text)?.definition.key ?? statByKeyword(text);
    if (!key || value === undefined) continue; // Grey effect descriptions and stray text.
    if (line.color === 'neutral') common.warnings.push(`Colour unclear for "${text}"; read as a base stat.`);
    // The colour says which way a stat goes (green helps, red hurts), so a sign the reader
    // missed cannot flip it. Only an unclear colour falls back to the sign as read.
    const helps = line.color === 'green' ? true : line.color === 'red' ? false : undefined;
    // Bid Arrow Speed is stored as reduction: a green -45% is +45, a red +3% is -3.
    const stored = key === 'arrowReduction' ? -value : value;
    stats[key] += helps === undefined ? stored : helps ? Math.abs(value) : -Math.abs(value);
  }
  if (Object.values(stats).every(v => v === 0)) common.warnings.push('No stats found.');
  if (/^focus(ed)?$/i.test(authentication.effect)) common.warnings.push('Focused changes the stats shown in the game. Enter the original base stats, then tick "Base stats checked".');

  const baseName = name;
  const slot = knownSlots.get(baseName.toLowerCase()) ?? inferSlotFromName(baseName);
  if (!slot) common.warnings.push('Slot unknown: choose Head, Back or Wrist.');
  return { ...common, kind: 'gear', baseName, mutation: tags.join(' + ') || 'None', slot, stats, authentication };
}

/** Star icons in the top-left strip, from per-column counts of bright pixels. */
export function countStars(brightPerColumn: number[], minWidth: number): number {
  let stars = 0, run = 0, gap = 0;
  for (const count of [...brightPerColumn, 0, 0, 0, 0, 0]) {
    if (count >= 2) { run += 1 + gap; gap = 0; continue; }
    if (run && ++gap > 3) { if (run >= minWidth) stars++; run = 0; gap = 0; }
  }
  return stars;
}
