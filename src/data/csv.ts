import type { GearItem, Slot } from '../types';
import { gameArrowToReduction, reductionToGameArrow } from '../engine/scoring';

const headers = ['ID','Name','Slot','Luck','Energy Drink Time','Tip Chance','Walkspeed','Vehicle Speed','Bid Recovery','Bid Zone Width','Bid Arrow Speed (game display)','NPC Offers Bonus','Authenticated','Authentication Type','Authentication Effect','Authentication Value','Notes','Date Obtained','Favourite'];

export function gearToCsv(items: GearItem[]): string {
  const rows = items.map(i => [i.id,i.name,i.slot,i.stats.luck,i.stats.energy,i.stats.tip,i.stats.walk,i.stats.vehicle,i.stats.recovery,i.stats.zone,reductionToGameArrow(i.stats.arrowReduction),i.stats.npc,i.authenticated,i.authentication.kind,i.authentication.effect,i.authentication.value,i.notes ?? '',i.obtainedAt ?? '',i.favourite]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}

export function csvToGear(text: string): GearItem[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const map = new Map(rows[0].map((h, idx) => [h.trim(), idx]));
  for (const required of ['Name','Slot']) if (!map.has(required)) throw new Error(`CSV is missing required column: ${required}`);
  const at = (r: string[], h: string) => r[map.get(h) ?? -1] ?? '';
  const ids = new Set<string>();

  return rows.slice(1).filter(r => r.some(Boolean)).map((r,rowIndex) => {
    const rowNumber = rowIndex + 2;
    const now = new Date().toISOString();
    const slot = at(r,'Slot') as Slot;
    const name = at(r,'Name').trim();
    if (!name) throw new Error(`CSV row ${rowNumber}: item name is required.`);
    if (!['Head','Back','Wrist'].includes(slot)) throw new Error(`CSV row ${rowNumber}: invalid slot ${slot || '(blank)'}.`);
    const num = (h: string) => finite(at(r,h), rowNumber, h);
    let id = at(r,'ID').trim() || crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    const authenticated = /^(true|yes|1)$/i.test(at(r,'Authenticated').trim());
    const kindRaw = at(r,'Authentication Type').trim();
    const kind = (kindRaw || (authenticated ? 'Normal' : 'None')) as GearItem['authentication']['kind'];
    if (!['None','Normal','Alien'].includes(kind)) throw new Error(`CSV row ${rowNumber}: invalid authentication type ${kind}.`);
    if (authenticated && kind === 'None') throw new Error(`CSV row ${rowNumber}: authenticated item cannot use authentication type None.`);
    const effect = at(r,'Authentication Effect').trim();
    if (authenticated && !effect) throw new Error(`CSV row ${rowNumber}: authentication effect is required for authenticated gear.`);
    return {
      id, name, slot,
      stats: { luck:num('Luck'), energy:num('Energy Drink Time'), tip:num('Tip Chance'), walk:num('Walkspeed'), vehicle:num('Vehicle Speed'), recovery:num('Bid Recovery'), zone:num('Bid Zone Width'), arrowReduction:gameArrowToReduction(num('Bid Arrow Speed (game display)')), npc:num('NPC Offers Bonus') },
      authenticated,
      authentication: { kind, effect, value:num('Authentication Value') },
      notes:at(r,'Notes'), obtainedAt:at(r,'Date Obtained') || undefined, favourite:/^(true|yes|1)$/i.test(at(r,'Favourite').trim()), createdAt:now, updatedAt:now
    };
  });
}

function csvCell(v: unknown) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
function finite(v: unknown, row: number, field: string) {
  const text = String(v ?? '').trim();
  if (!text) return 0;
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(`CSV row ${row}: ${field} must be a finite number.`);
  return n;
}
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if(q){ if(c==='"'&&text[i+1]==='"'){cell+='"';i++;} else if(c==='"') q=false; else cell+=c; }
    else if(c==='"') q=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));out.push(row);row=[];cell='';}
    else cell+=c;
  }
  if (q) throw new Error('CSV contains an unterminated quoted field.');
  row.push(cell.replace(/\r$/,'')); if(row.some(x=>x.length)) out.push(row); return out;
}
