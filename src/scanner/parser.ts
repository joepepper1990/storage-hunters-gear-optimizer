import type { GearItem, GearStats, Slot } from '../types';
import type { GearOcrVisualLine, ParsedGearScan } from './types';

const ZERO_STATS: GearStats = {
  luck: 0,
  energy: 0,
  tip: 0,
  walk: 0,
  vehicle: 0,
  recovery: 0,
  zone: 0,
  arrowReduction: 0,
  npc: 0
};

type StatKey = keyof GearStats;
interface StatDefinition {
  key: StatKey;
  canonical: string;
  aliases: string[];
}

const STAT_DEFINITIONS: StatDefinition[] = [
  { key: 'luck', canonical: 'Luck', aliases: ['luck'] },
  { key: 'energy', canonical: 'Energy Drink Time', aliases: ['energy drink time', 'energy time', 'energy'] },
  { key: 'tip', canonical: 'Tip Chance', aliases: ['tip chance', 'tip'] },
  { key: 'walk', canonical: 'Walkspeed', aliases: ['walkspeed', 'walk speed', 'walk'] },
  { key: 'vehicle', canonical: 'Vehicle Speed', aliases: ['vehicle speed', 'vehicle'] },
  { key: 'recovery', canonical: 'Bid Recovery', aliases: ['bid recovery', 'recovery'] },
  { key: 'zone', canonical: 'Bid Zone Width', aliases: ['bid zone width', 'zone width', 'bid zone', 'zone'] },
  { key: 'arrowReduction', canonical: 'Bid Arrow Speed', aliases: ['bid arrow speed', 'bid arrow reduction', 'arrow speed', 'arrow reduction', 'arrow'] },
  { key: 'npc', canonical: 'NPC Offers Bonus', aliases: ['npc offers bonus', 'npc offer bonus', 'npc offers', 'npc offer', 'npc'] }
];

const AUTH_EFFECTS = [
  'Luck', 'Bid Recovery', 'Bid Arrow Speed', 'Bid Zone Width', 'Energy Drink Time', 'Tip Chance', 'NPC Offers Bonus', 'Walkspeed',
  'Sunny', 'Nocturnal', 'Overcharged', 'Raindrop', 'Focused', 'Time Keeper', 'Connected'
];
const LEGACY_ALIEN_EFFECTS = ['Haggler', 'Anti-Gravity Field', 'Safecracker', 'Grade Re-Roll', 'Exhibitor', 'Rush'];
const GENERIC_LINES = new Set(['gear', 'stats', 'stat', 'item', 'equipped', 'equip', 'unequip', 'inventory', 'authenticated', 'authentication', 'normal']);

function cleanLine(line: string): string {
  return line.replace(/[|•·]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normaliseLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1|!]/g, 'i')
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = current[j];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / longest;
}

function extractPercentage(line: string): number | undefined {
  const match = line.match(/([+\-−]?\s*\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/\s/g, '').replace('−', '-').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function labelWithoutNumber(line: string): string {
  return normaliseLabel(
    line
      .replace(/([+\-−]?\s*\d+(?:[.,]\d+)?)\s*%/g, ' ')
      .replace(/\bauth(?:enticated|entication)?\b/gi, ' ')
      .replace(/\bnormal\b/gi, ' ')
  );
}

function bestStatMatch(line: string): { definition: StatDefinition; alias: string; confidence: number } | undefined {
  const label = labelWithoutNumber(line);
  if (!label) return undefined;
  let best: { definition: StatDefinition; alias: string; confidence: number } | undefined;
  for (const definition of STAT_DEFINITIONS) {
    for (const rawAlias of definition.aliases) {
      const alias = normaliseLabel(rawAlias);
      const score = label.includes(alias) || alias.includes(label)
        ? Math.min(1, 0.94 + Math.min(label.length, alias.length) / Math.max(label.length, alias.length) * 0.06)
        : similarity(label, alias);
      if (!best || score > best.confidence) best = { definition, alias, confidence: score };
    }
  }
  return best && best.confidence >= 0.72 ? best : undefined;
}

function bestAuthEffect(line: string): { effect: string; confidence: number } | undefined {
  const label = labelWithoutNumber(line);
  if (!label) return undefined;
  let best: { effect: string; confidence: number } | undefined;
  for (const effect of AUTH_EFFECTS) {
    const candidate = normaliseLabel(effect);
    const score = label.includes(candidate) || candidate.includes(label)
      ? Math.min(1, 0.95 + Math.min(label.length, candidate.length) / Math.max(label.length, candidate.length) * 0.05)
      : similarity(label, candidate);
    if (!best || score > best.confidence) best = { effect, confidence: score };
  }
  return best && best.confidence >= 0.72 ? best : undefined;
}

function explicitSlot(lines: string[]): Slot | undefined {
  for (const line of lines) {
    const label = normaliseLabel(line);
    if (/\bwrist\b/.test(label)) return 'Wrist';
    if (/\bback\b/.test(label)) return 'Back';
    if (/\bhead\b/.test(label)) return 'Head';
  }
  return undefined;
}

function inferSlotFromName(name: string): Slot | undefined {
  const value = normaliseLabel(name);
  if (/\b(wristband|wrist|bracelet|watch)\b/.test(value)) return 'Wrist';
  if (/\b(backpack|back pack|vest|cape|rucksack)\b/.test(value)) return 'Back';
  if (/\b(dominus|valk|helm|helmet|hat|crown)\b/.test(value)) return 'Head';
  return undefined;
}

function isSlotOnlyLine(line: string): boolean {
  return /^(head|back|wrist)$/i.test(cleanLine(line));
}

function findItemName(lines: string[], authLineIndexes: Set<number>): string {
  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanLine(lines[index]);
    if (!line || authLineIndexes.has(index) || line.includes('%') || isSlotOnlyLine(line)) continue;
    const normalised = normaliseLabel(line);
    if (!normalised || GENERIC_LINES.has(normalised)) continue;
    if (normalised.includes('legacy alien') || normalised === 'alien') continue;
    if (bestStatMatch(line)) continue;
    if (bestAuthEffect(line) && AUTH_EFFECTS.some(effect => normaliseLabel(effect) === normalised)) continue;
    if (/[a-z]/i.test(line)) return line.replace(/^[-–—:]+|[-–—:]+$/g, '').trim();
  }
  return '';
}

function parseTextOnly(text: string): ParsedGearScan {
  const lines = String(text ?? '').split(/\r?\n/).map(cleanLine).filter(Boolean);
  const stats: GearStats = { ...ZERO_STATS };
  const warnings: string[] = [];
  const recognisedFields: string[] = [];
  const fieldConfidence: Record<string, number> = {};
  const authLineIndexes = new Set<number>();

  const legacyAlienDetected = lines.some(line => {
    const normalised = normaliseLabel(line);
    return normalised === 'alien' || LEGACY_ALIEN_EFFECTS.some(effect => normalised.includes(normaliseLabel(effect)));
  });
  if (legacyAlienDetected) warnings.push('Legacy Alien text detected — review this item manually; the scanner will not create a new Alien authentication.');

  let authenticated = false;
  let authEffect = '';
  let authValue = 0;
  let authConfidence = 0;
  let expectAuthOnNextLine = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const authMarker = /\bauth(?:enticated|entication)?\b/i.test(line);
    const effectMatch = bestAuthEffect(line);
    const numeric = extractPercentage(line);

    if (authMarker) {
      authenticated = true;
      authLineIndexes.add(index);
      if (effectMatch) {
        authEffect = effectMatch.effect;
        authValue = numeric ?? 0;
        authConfidence = effectMatch.confidence;
        expectAuthOnNextLine = false;
      } else {
        expectAuthOnNextLine = true;
      }
      continue;
    }

    if (expectAuthOnNextLine && effectMatch) {
      authLineIndexes.add(index);
      authEffect = effectMatch.effect;
      authValue = numeric ?? 0;
      authConfidence = effectMatch.confidence;
      expectAuthOnNextLine = false;
    }
  }

  if (legacyAlienDetected) {
    authenticated = false;
    authEffect = '';
    authValue = 0;
    authConfidence = 0;
  } else if (authenticated && !authEffect) {
    warnings.push('Authentication was detected but its effect could not be identified — review before saving.');
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (authLineIndexes.has(index)) continue;
    const line = lines[index];
    const value = extractPercentage(line);
    if (value === undefined) continue;
    const match = bestStatMatch(line);
    if (!match) continue;
    let storedValue = value;
    if (match.definition.key === 'arrowReduction') {
      storedValue = match.alias.includes('reduction') ? value : -value;
    }
    stats[match.definition.key] = storedValue;
    recognisedFields.push(match.definition.canonical);
    fieldConfidence[match.definition.key] = match.confidence;
  }

  const baseName = findItemName(lines, authLineIndexes);
  const directSlot = explicitSlot(lines.filter(line => isSlotOnlyLine(line)));
  const hintedSlot = inferSlotFromName(baseName);
  const detectedSlot = directSlot ?? hintedSlot;
  const slot = detectedSlot ?? 'Head';

  if (!baseName) warnings.push('Item name could not be identified — enter it before saving.');
  if (!detectedSlot) warnings.push('Slot could not be identified — review before saving.');
  if (!recognisedFields.length) warnings.push('No recognised gear stats were found — review the screenshot or enter stats manually.');

  if (authenticated && authEffect) {
    recognisedFields.push(`Authentication: ${authEffect}`);
    fieldConfidence.authentication = authConfidence;
  }
  if (baseName) fieldConfidence.baseName = 0.9;
  if (detectedSlot) fieldConfidence.slot = directSlot ? 1 : 0.82;

  let confidence: ParsedGearScan['confidence'];
  if (!baseName || recognisedFields.filter(field => !field.startsWith('Authentication:')).length === 0) confidence = 'Low';
  else if (!detectedSlot || warnings.some(warning => warning.startsWith('Authentication was detected'))) confidence = 'Medium';
  else confidence = 'High';

  return {
    rawText: text,
    baseName,
    slot,
    slotDetected: Boolean(detectedSlot),
    stats,
    authenticated,
    authentication: authenticated && authEffect
      ? { kind: 'Normal', effect: authEffect, value: authValue }
      : { kind: 'None', effect: '', value: 0 },
    confidence,
    warnings,
    recognisedFields,
    fieldConfidence
  };
}


function visualLineHeight(line: GearOcrVisualLine): number {
  return Math.max(1, line.bbox.y1 - line.bbox.y0);
}

function horizontalOverlap(a: GearOcrVisualLine, b: GearOcrVisualLine): number {
  const overlap = Math.max(0, Math.min(a.bbox.x1, b.bbox.x1) - Math.max(a.bbox.x0, b.bbox.x0));
  return overlap / Math.max(1, Math.min(a.bbox.x1 - a.bbox.x0, b.bbox.x1 - b.bbox.x0));
}

function legacyEffectMatch(line: string): string | undefined {
  const label = labelWithoutNumber(line);
  return LEGACY_ALIEN_EFFECTS.find(effect => {
    const candidate = normaliseLabel(effect);
    return label.includes(candidate) || candidate.includes(label) || similarity(label, candidate) >= 0.76;
  });
}

function parseVisual(text: string, lines: GearOcrVisualLine[]): ParsedGearScan | undefined {
  const candidates = lines
    .map(line => ({ line, stat: bestStatMatch(line.text), auth: bestAuthEffect(line.text), legacy: legacyEffectMatch(line.text), value: extractPercentage(line.text) }))
    .filter(candidate => candidate.value !== undefined && (candidate.stat || candidate.auth || candidate.legacy));
  if (!candidates.length) return undefined;

  const maxHeight = Math.max(...candidates.map(candidate => visualLineHeight(candidate.line)));
  const large = candidates.filter(candidate => visualLineHeight(candidate.line) >= maxHeight * 0.62);
  if (!large.length) return undefined;
  large.sort((a, b) => a.line.bbox.y0 - b.line.bbox.y0 || a.line.bbox.x0 - b.line.bbox.x0);

  // Keep the spatial cluster around the largest recognised stat text. This rejects the tiny TOTAL BONUSES list.
  const anchor = [...large].sort((a, b) => visualLineHeight(b.line) - visualLineHeight(a.line))[0];
  const anchorHeight = visualLineHeight(anchor.line);
  const cluster = large.filter(candidate => {
    const xClose = horizontalOverlap(candidate.line, anchor.line) >= 0.15 || Math.abs(candidate.line.bbox.x0 - anchor.line.bbox.x0) <= anchorHeight * 3.5;
    const yClose = Math.abs(candidate.line.bbox.y0 - anchor.line.bbox.y0) <= anchorHeight * 7;
    return xClose && yClose;
  }).sort((a, b) => a.line.bbox.y0 - b.line.bbox.y0);
  if (!cluster.length) return undefined;

  const stats: GearStats = { ...ZERO_STATS };
  const warnings: string[] = [];
  const recognisedFields: string[] = [];
  const fieldConfidence: Record<string, number> = {};
  let authenticated = false;
  let authEffect = '';
  let authValue = 0;

  for (const candidate of cluster) {
    const value = candidate.value!;
    if (candidate.line.color === 'blue') {
      if (candidate.legacy) {
        warnings.push('Legacy Alien text detected — review this item manually; the scanner will not create a new Alien authentication.');
        continue;
      }
      const effect = candidate.auth?.effect ?? candidate.stat?.definition.canonical;
      if (effect) {
        authenticated = true;
        authEffect = effect;
        authValue = value;
        recognisedFields.push(`Authentication: ${effect}`);
        fieldConfidence.authentication = Math.max(candidate.auth?.confidence ?? 0, candidate.stat?.confidence ?? 0, 0.9);
      }
      continue;
    }
    if (!candidate.stat) continue;
    let storedValue = value;
    if (candidate.stat.definition.key === 'arrowReduction') storedValue = candidate.stat.alias.includes('reduction') ? value : -value;
    stats[candidate.stat.definition.key] = storedValue;
    recognisedFields.push(candidate.stat.definition.canonical);
    fieldConfidence[candidate.stat.definition.key] = candidate.stat.confidence;
  }

  const firstStatLine = cluster[0].line;
  const statTop = Math.min(...cluster.map(candidate => candidate.line.bbox.y0));
  const titleCandidates = lines.filter(line => {
    if (!line.text.trim() || extractPercentage(line.text) !== undefined || isSlotOnlyLine(line.text)) return false;
    const height = visualLineHeight(line);
    const gap = statTop - line.bbox.y1;
    if (gap < -anchorHeight * 0.25 || gap > anchorHeight * 2.4) return false;
    if (height < anchorHeight * 0.65) return false;
    return horizontalOverlap(line, firstStatLine) >= 0.08 || Math.abs(line.bbox.x0 - firstStatLine.bbox.x0) <= anchorHeight * 2.5;
  });
  titleCandidates.sort((a, b) => {
    const aGap = Math.abs(statTop - a.bbox.y1);
    const bGap = Math.abs(statTop - b.bbox.y1);
    if (aGap !== bGap) return aGap - bGap;
    return visualLineHeight(b) - visualLineHeight(a);
  });
  const baseName = titleCandidates[0]?.text.replace(/^[-–—:]+|[-–—:]+$/g, '').trim() ?? '';
  const detectedSlot = inferSlotFromName(baseName);
  const slot = detectedSlot ?? 'Head';

  if (!baseName) warnings.push('Item name could not be identified — enter it before saving.');
  if (!detectedSlot) warnings.push('Slot could not be identified — review before saving.');
  const baseStatCount = recognisedFields.filter(field => !field.startsWith('Authentication:')).length;
  if (!baseStatCount) warnings.push('No recognised base gear stats were found — review the screenshot or enter stats manually.');
  if (baseName) fieldConfidence.baseName = 0.94;
  if (detectedSlot) fieldConfidence.slot = 0.86;

  let confidence: ParsedGearScan['confidence'];
  if (!baseName || baseStatCount === 0) confidence = 'Low';
  else if (!detectedSlot || warnings.length > 0) confidence = 'Medium';
  else confidence = 'High';

  return {
    rawText: text,
    baseName,
    slot,
    slotDetected: Boolean(detectedSlot),
    stats,
    authenticated,
    authentication: authenticated && authEffect ? { kind: 'Normal', effect: authEffect, value: authValue } : { kind: 'None', effect: '', value: 0 },
    confidence,
    warnings,
    recognisedFields,
    fieldConfidence
  };
}

export function parseGearOcrText(text: string, visualLines: GearOcrVisualLine[] = []): ParsedGearScan {
  const visual = visualLines.length ? parseVisual(text, visualLines) : undefined;
  return visual ?? parseTextOnly(text);
}

export function scanToGearDraft(scan: ParsedGearScan, now = new Date().toISOString(), id: string = crypto.randomUUID()): GearItem {
  return {
    id,
    baseName: scan.baseName,
    name: scan.baseName,
    slot: scan.slot,
    stats: { ...scan.stats },
    authenticated: scan.authenticated && scan.authentication.kind === 'Normal' && Boolean(scan.authentication.effect),
    authentication: { ...scan.authentication },
    favourite: false,
    createdAt: now,
    updatedAt: now
  };
}
