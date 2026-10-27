import { DEFAULT_VEHICLE_SETTINGS, LOCKED_DEFAULT_SETTINGS } from '../defaults';
import type { AlgorithmSettings, AppData, VehicleOptimiserSettings } from '../types';
import { arrowTargetBand } from './scoring';

export type PreferenceSection = 'Auctions' | 'Drink Prep' | 'Grading' | 'Shop / Idle' | 'Vehicle';

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

function vehicle(id: keyof VehicleOptimiserSettings & string, label: string): PreferenceControl {
  return {
    id, section: 'Vehicle', label, scale: 5,
    read: data => data.vehicleSettings[id],
    write: (data, coefficient) => ({ ...data, vehicleSettings: { ...data.vehicleSettings, [id]: coefficient } }),
    defaultValue: DEFAULT_VEHICLE_SETTINGS[id]
  };
}

export const PREFERENCE_CONTROLS: PreferenceControl[] = [
  algorithm('luckWeight', 'Auctions', 'Luck', 0.1),
  { ...algorithm('arrowWeight', 'Auctions', 'Bid Arrow', 0.1),
    labelFor: data => { const band = arrowTargetBand(data.settings); return `Bid Arrow (${band.min}–${band.max}%)`; } },
  algorithm('zoneWeight', 'Auctions', 'Bid Zone Width', 0.1),
  algorithm('recoveryWeight', 'Auctions', 'Bid Recovery', 0.1),
  algorithm('drinkPriority', 'Drink Prep', 'Priority', 1),
  algorithm('gradingPriority', 'Grading', 'Priority', 1),
  algorithm('shopPriority', 'Shop / Idle', 'Priority', 1),
  algorithm('shopTipWeight', 'Shop / Idle', 'Tip Chance', 0.05),
  algorithm('shopNpcWeight', 'Shop / Idle', 'NPC Offers', 0.05),
  vehicle('capacityWeight', 'Capacity'),
  vehicle('speedWeight', 'Speed'),
  vehicle('accelerationWeight', 'Acceleration'),
  vehicle('handlingWeight', 'Handling')
];

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
