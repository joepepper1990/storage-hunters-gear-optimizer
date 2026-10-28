import { useMemo } from 'react';
import { activeSpecialists, buildGearLoadouts, type GearLoadoutResult } from '../engine/gearLoadouts';
import { arrowTargetBand } from '../engine/scoring';
import { algorithmIssues } from '../engine/settingsValidation';
import { optimiseTrophies } from '../engine/trophies';
import type { AppData, GearItem } from '../types';
import { Empty, itemTitle, num } from '../ui';

type Stat = [label: string, value: string];

/** A stat that adds nothing is noise; Arrow is always shown because it decides the set. */
const isZero = (value: string) => /^0(\.0+)?%?$/.test(value);

function trioKey(l: GearLoadoutResult) { return [l.head.id, l.back.id, l.wrist.id].join('|'); }

function gradeReroll(items: GearItem[]): number {
  return items.reduce((sum, item) => sum + (item.authenticated && item.authentication.effect.trim() === 'Grade Re-Roll' ? Math.max(0, item.authentication.value) : 0), 0);
}

function LoadoutCard({ title, loadout, stats }: { title: string; loadout: GearLoadoutResult; stats: Stat[] }) {
  return <article className="setCard">
    <h3>{title}</h3>
    <ol className="pieces">{[loadout.head, loadout.back, loadout.wrist].map(item => <li key={item.slot}><span>{item.slot}</span><strong>{itemTitle(item)}</strong></li>)}</ol>
    <div className="setStats">{stats.filter(([label, value]) => label === 'Arrow' || !isZero(value)).map(([label, value]) => <span key={label}>{label} <b>{value}</b></span>)}</div>
  </article>;
}

export function BestSetup({ data }: { data: AppData }) {
  const valid = algorithmIssues(data.settings).length === 0;
  const loadouts = useMemo(() => valid ? buildGearLoadouts(data.gear, data.settings, 'low') : {}, [data.gear, data.settings, valid]);
  const gavels = useMemo(() => optimiseTrophies(data.trophies, data.trophySettings)[0], [data.trophies, data.trophySettings]);
  const band = arrowTargetBand(data.settings);
  const active = activeSpecialists(data.settings);

  // Identical auction trios share one card with combined context labels.
  const auctionGroups: Array<{ labels: string[]; loadout: GearLoadoutResult }> = [];
  for (const [label, loadout] of [['Neutral', loadouts.main], ['Day', loadouts.day], ['Night', loadouts.night], ['Rain', loadouts.rain]] as const) {
    if (!loadout) continue;
    const group = auctionGroups.find(g => trioKey(g.loadout) === trioKey(loadout));
    if (group) group.labels.push(label); else auctionGroups.push({ labels: [label], loadout });
  }
  const arrowStat = (r: number): Stat => ['Arrow', `${num(r)}%${r >= band.min - 1e-9 && r <= band.max + 1e-9 ? ' ✓' : ''}`];
  const missingSlots = (['Head', 'Back', 'Wrist'] as const).filter(slot => !data.gear.some(g => g.slot === slot));

  return <section aria-labelledby="best-heading">
    <h1 id="best-heading">Best setup</h1>

    <h2>Auction</h2>
    {!valid && <Empty>Fix preferences to see sets</Empty>}
    {valid && missingSlots.length > 0 && <Empty>Needs {missingSlots.join(', ')} gear</Empty>}
    <div className="setGrid">{auctionGroups.map(({ labels, loadout }) => <LoadoutCard key={labels.join()} title={labels.join(' · ')} loadout={loadout}
      stats={[['Luck', num(loadout.stats.luck)], arrowStat(loadout.stats.arrowReduction), ['Zone', `${num(loadout.stats.zone)}%`], ['Recovery', `${num(loadout.stats.recovery)}%`]]} />)}</div>

    <h2>Specialist</h2>
    <div className="setGrid">
      {loadouts.drink ? <LoadoutCard title="Drink Prep" loadout={loadouts.drink} stats={[['Energy', `${num(loadouts.drink.stats.energy)}%`]]} /> : <article className="setCard muted"><h3>Drink Prep</h3><Empty>{active.includes('Drink Prep') ? 'No Energy gear' : 'Ignored'}</Empty></article>}
      {loadouts.grading ? <LoadoutCard title="Grading" loadout={loadouts.grading} stats={[['Grade Re-Roll', `${num(gradeReroll([loadouts.grading.head, loadouts.grading.back, loadouts.grading.wrist]))}%`]]} /> : <article className="setCard muted"><h3>Grading</h3><Empty>{active.includes('Grading') ? 'No Grade Re-Roll gear' : 'Ignored'}</Empty></article>}
      {loadouts.shop ? <LoadoutCard title="Shop / Idle" loadout={loadouts.shop} stats={[['Tip', `${num(loadouts.shop.stats.tip)}%`], ['NPC', `${num(loadouts.shop.stats.npc)}%`]]} /> : <article className="setCard muted"><h3>Shop / Idle</h3><Empty>{active.includes('Shop / Idle') ? 'No Tip or NPC gear' : 'Ignored'}</Empty></article>}
    </div>

    <h2>Gavels</h2>
    {gavels?.trophies.length ? <article className="setCard">
      <ol className="pieces">{gavels.trophies.map((t, i) => <li key={t.id}><span>{i + 1}</span><strong>{t.modifiers.map(m => `${m.mutation} +${num(m.boostPct)}%`).join(' · ')}</strong></li>)}</ol>
      <div className="setStats"><span>Slots <b>{gavels.trophies.length}/{data.trophySettings.maxActive}</b></span></div>
    </article> : <Empty>No Gavels</Empty>}

  </section>;
}
