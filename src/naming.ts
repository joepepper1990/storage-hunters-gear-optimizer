import type { Authentication, GearStats, TrophyModifier, VehiclePart } from './types';
import { reductionToGameArrow } from './engine/scoring';

export function compactNumber(value:number):string {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
}

function signed(value:number, suffix=''):string {
  return `${value > 0 ? '+' : ''}${compactNumber(value)}${suffix}`;
}

export function generateTrophyName(modifiers:TrophyModifier[]):string {
  const parts = modifiers
    .filter(m => m && m.mutation?.trim())
    .slice(0,2)
    .map(m => `${m.mutation.trim()} +${compactNumber(Math.max(0, m.boostPct))}%`);
  return parts.join(' / ') || 'Gavel Trophy';
}

const gearOrder:Array<[keyof GearStats,string]> = [
  ['luck','Luck'],
  ['energy','Energy'],
  ['tip','Tip'],
  ['walk','Walk'],
  ['vehicle','Vehicle'],
  ['recovery','Recovery'],
  ['zone','Zone'],
  ['arrowReduction','Arrow'],
  ['npc','NPC']
];

function shortAuthEffect(effect:string):string {
  return effect
    .replace('Energy Drink Time','Energy')
    .replace('Vehicle Speed','Vehicle')
    .replace('Bid Recovery','Recovery')
    .replace('Bid Zone Width','Zone')
    .replace('Bid Arrow Speed','Arrow')
    .replace('Tip Chance','Tip')
    .replace('NPC Offers Bonus','NPC')
    .replace('Walkspeed','Walk');
}

export function generateGearName(baseName:string, stats:GearStats, authenticated=false, authentication?:Authentication):string {
  const base = baseName.trim();
  if (!base) return '';
  const parts:string[] = [];
  for (const [key,label] of gearOrder) {
    const raw = stats[key];
    if (!raw) continue;
    const shown = key === 'arrowReduction' ? reductionToGameArrow(raw) : raw;
    parts.push(`${label} ${signed(shown,'%')}`);
  }
  if (authenticated && authentication?.effect?.trim()) {
    const effect = shortAuthEffect(authentication.effect.trim());
    if (authentication.value) parts.push(`Auth ${effect} ${signed(authentication.value,'%')}`);
    else parts.push(`Auth ${effect}`);
  }
  return parts.length ? `${base} — ${parts.join(' / ')}` : base;
}

export function generateVehiclePartName(baseName:string, part:Pick<VehiclePart,'speedPct'|'accelerationPct'|'handlingPct'|'capacityKg'>):string {
  const base = baseName.trim();
  if (!base) return '';
  const parts:string[] = [];
  if (part.speedPct) parts.push(`Speed ${signed(part.speedPct,'%')}`);
  if (part.accelerationPct) parts.push(`Accel ${signed(part.accelerationPct,'%')}`);
  if (part.handlingPct) parts.push(`Handling ${signed(part.handlingPct,'%')}`);
  if (part.capacityKg) parts.push(`Capacity ${signed(part.capacityKg,'kg')}`);
  return parts.length ? `${base} — ${parts.join(' / ')}` : base;
}

export function inferBaseName(name:string):string {
  return String(name ?? '').split(' — ')[0].trim();
}
