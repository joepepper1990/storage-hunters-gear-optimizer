import { LOCKED_DEFAULT_SETTINGS } from '../defaults';
import type { AlgorithmSettings, AppData } from '../types';
import { arrowTargetBand } from './scoring';

export type PreferenceSection = 'Auctions' | 'Drink Prep' | 'Grading' | 'Shop / Idle';
export type WeightGroup = 'auction' | 'shop';

/**
 * A 0-10 importance slider is a fixed linear view of one stored engine coefficient:
 * coefficient = position x scale. The mapping is reversible, so any stored value,
 * including a custom value between or beyond slider positions, is preserved
 * unchanged until the user moves that slider.
 */
export interface PreferenceControl {
  id: string;
  section: PreferenceSection;
  label: string;
  /** Label computed from live data, when it depends on other settings. */
  labelFor?(data: AppData): string;
  /** Weights in one group are shown and edited as percentages that add up to 100. */
  group?: WeightGroup;
  scale: number;
  read(data: AppData): number;
  write(data: AppData, coefficient: number): AppData;
  defaultValue: number;
}

function algorithm(id: keyof AlgorithmSettings & string, section: PreferenceSection, label: string, scale: number): PreferenceControl {
  return {
    id, section, label, scale,
    read: data => data.settings[id] as number,
    write: (data, coefficient) => ({ ...data, settings: { ...data.settings, [id]: coefficient } }),
    defaultValue: LOCKED_DEFAULT_SETTINGS[id] as number
  };
}

const weight = (group: WeightGroup, control: PreferenceControl): PreferenceControl => ({ ...control, group });

export const PREFERENCE_CONTROLS: PreferenceControl[] = [
  weight('auction', algorithm('luckWeight', 'Auctions', 'Luck', 0.1)),
  weight('auction', { ...algorithm('arrowWeight', 'Auctions', 'Bid Arrow', 0.1),
    labelFor: data => `Bid Arrow below ${arrowTargetBand(data.settings).min}%` }),
  weight('auction', algorithm('zoneWeight', 'Auctions', 'Bid Zone Width', 0.1)),
  weight('auction', algorithm('recoveryWeight', 'Auctions', 'Bid Recovery', 0.1)),
  algorithm('drinkPriority', 'Drink Prep', 'Priority', 1),
  algorithm('gradingPriority', 'Grading', 'Priority', 1),
  algorithm('shopPriority', 'Shop / Idle', 'Priority', 1),
  weight('shop', algorithm('shopTipWeight', 'Shop / Idle', 'Tip Chance', 0.05)),
  weight('shop', algorithm('shopNpcWeight', 'Shop / Idle', 'NPC Offers', 0.05))
];

export function groupControls(group: WeightGroup): PreferenceControl[] {
  return PREFERENCE_CONTROLS.filter(control => control.group === group);
}

/**
 * Exact percentage of each weight in its group (adding up to 100). Engines only use the
 * ratios between weights in a group, so a percentage view loses nothing; the stored
 * coefficients keep their overall size, which native-unit thresholds such as the Shop
 * minimum gain depend on.
 */
export function weightShares(data: AppData, group: WeightGroup): number[] {
  const values = groupControls(group).map(control => Math.max(0, control.read(data)));
  const total = values.reduce((a, b) => a + b, 0);
  return values.map(value => total > 0 ? value / total * 100 : 0);
}

/** Whole percentages for display that still add up to exactly 100 (largest remainder). */
export function roundedShares(shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0);
  if (total <= 0) return shares.map(() => 0);
  const floors = shares.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = shares.map((share, index) => ({ index, rest: share - Math.floor(share) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) { if (left <= 0) break; floors[index]++; left--; }
  return floors;
}

/**
 * Sets one weight to `percent` of its group. The other weights keep their proportions
 * and fill the rest, so the group still adds up to 100. Untouched groups never change.
 */
export function setWeightShare(data: AppData, group: WeightGroup, id: string, percent: number): AppData {
  const controls = groupControls(group);
  const index = controls.findIndex(control => control.id === id);
  if (index < 0) return data;
  const target = Math.max(0, Math.min(100, Math.round(percent)));
  const shares = weightShares(data, group);
  const others = shares.reduce((sum, share, i) => i === index ? sum : sum + share, 0);
  const next = shares.map((share, i) => i === index ? target
    : others > 0 ? share / others * (100 - target) : (100 - target) / (controls.length - 1));
  const stored = controls.reduce((sum, control) => sum + Math.max(0, control.read(data)), 0);
  const size = stored > 0 ? stored : controls.reduce((sum, control) => sum + control.defaultValue, 0);
  return controls.reduce((acc, control, i) => control.write(acc, Number((next[i] / 100 * size).toFixed(10))), data);
}

export const SLIDER_MAX = 10;

export interface SliderView {
  /** Position shown on the slider, clamped to 0-10. */
  position: number;
  /** Exact stored value expressed in slider units; may be fractional or above 10. */
  exact: number;
  /** True when the stored coefficient is not exactly one of the 0-10 integer positions. */
  custom: boolean;
}

export function sliderView(control: PreferenceControl, data: AppData): SliderView {
  const exact = control.read(data) / control.scale;
  const rounded = Math.round(exact);
  const custom = Math.abs(exact - rounded) > 1e-9 || rounded < 0 || rounded > SLIDER_MAX;
  return { position: Math.max(0, Math.min(SLIDER_MAX, custom ? exact : rounded)), exact, custom };
}

/** Coefficient for an integer slider position, without floating-point residue (6 x 0.1 = 0.6). */
export function coefficientForPosition(control: PreferenceControl, position: number): number {
  const clamped = Math.max(0, Math.min(SLIDER_MAX, Math.round(position)));
  return Number((clamped * control.scale).toFixed(10));
}

export function setPreference(data: AppData, control: PreferenceControl, position: number): AppData {
  return control.write(data, coefficientForPosition(control, position));
}

/** Resets only the controls of one section; every other stored value is untouched. */
export function resetPreferenceSection(data: AppData, section: PreferenceSection): AppData {
  return PREFERENCE_CONTROLS.filter(control => control.section === section)
    .reduce((next, control) => control.write(next, control.defaultValue), data);
}

export function controlsFor(section: PreferenceSection): PreferenceControl[] {
  return PREFERENCE_CONTROLS.filter(control => control.section === section);
}
