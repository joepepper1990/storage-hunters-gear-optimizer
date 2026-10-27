import { useEffect, useRef, type ReactNode } from 'react';
import type { AppData, GearItem, GearStats } from './types';
import { reductionToGameArrow } from './engine/scoring';

export const STAT_LABELS: Array<[keyof GearStats, string]> = [
  ['luck','Luck'],['energy','Energy Drink Time'],['tip','Tip Chance'],['walk','Walkspeed'],['vehicle','Vehicle Speed'],
  ['recovery','Bid Recovery'],['zone','Bid Zone Width'],['arrowReduction','Bid Arrow Speed'],['npc','NPC Offers Bonus']
];

export const SHORT_STAT: Record<keyof GearStats, string> = {
  luck:'Luck',energy:'Energy',tip:'Tip',walk:'Walk',vehicle:'Vehicle',recovery:'Recovery',zone:'Zone',arrowReduction:'Arrow',npc:'NPC'
};

export function num(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  // Rounded, without trailing zeros: 6.5 not 6.50, 70 not 70.0.
  return String(Number(value.toFixed(digits)));
}

export function signedPct(value: number): string {
  return `${value > 0 ? '+' : ''}${num(value)}%`;
}

/** Item stat as shown in game; Bid Arrow keeps its signed in-game sign. */
export function gameStat(key: keyof GearStats, value: number): string {
  return signedPct(key === 'arrowReduction' ? reductionToGameArrow(value) : value);
}

export function itemTitle(item: Pick<GearItem, 'baseName' | 'name'>): string {
  return item.baseName || item.name;
}

export function authSummary(item: GearItem): string {
  if (!item.authenticated || item.authentication.kind === 'None' || !item.authentication.effect) return '';
  const kind = item.authentication.kind === 'Alien' ? 'Legacy Alien' : item.authentication.kind;
  const value = item.authentication.value ? ` ${num(item.authentication.value)}%` : '';
  return `${kind}: ${item.authentication.effect}${value}`;
}

export function Modal({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="modalHeader"><h2>{title}</h2><button className="iconButton" onClick={onClose} aria-label="Close">×</button></div>
      {children}
      {actions && <div className="stickyActions">{actions}</div>}
    </div>
  </div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="emptyLine">{children}</p>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  return <div className={`notice ${tone === 'warning' ? 'warning' : tone === 'danger' ? 'dangerNotice' : ''}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function dateStamp() { return new Date().toISOString().slice(0, 10); }

export function downloadText(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export type SetData = (next: AppData) => void;
