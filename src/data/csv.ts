import type { GearItem, GearStats, Slot } from '../types';
import { gameArrowToReduction, reductionToGameArrow } from '../engine/scoring';
import { validateStatDeltas } from './statDeltas';
import { generateGearName, inferBaseName } from '../naming';

const headers = ['ID','Base Name','Slot','Luck','Energy Drink Time','Tip Chance','Walkspeed','Vehicle Speed','Bid Recovery','Bid Zone Width','Bid Arrow Speed (game display)','NPC Offers Bonus','Authenticated','Authentication Type','Authentication Effect','Authentication Value','Favourite','Mutation','Condition %','Authentication Stat Deltas'];

export function gearToCsv(items: GearItem[]): string {
  const rows = items.map(i => [i.id,i.baseName,i.slot,i.stats.luck,i.stats.energy,i.stats.tip,i.stats.walk,i.stats.vehicle,i.stats.recovery,i.stats.zone,reductionToGameArrow(i.stats.arrowReduction),i.stats.npc,i.authenticated,i.authentication.kind,i.authentication.effect,i.authentication.value,i.favourite,i.mutation??'',i.conditionPct??'',i.authentication.statDeltas===undefined?'':JSON.stringify(i.authentication.statDeltas)]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}

export function csvToGear(text: string): GearItem[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const map = new Map(rows[0].map((h, idx) => [h.trim(), idx]));
  if (!map.has('Base Name') && !map.has('Name')) throw new Error('CSV is missing required column: Base Name (or legacy Name)');
  if (!map.has('Slot')) throw new Error('CSV is missing required column: Slot');
  const at = (r: string[], h: string) => r[map.get(h) ?? -1] ?? '';
  const ids = new Set<string>();

  return rows.slice(1).filter(r => r.some(Boolean)).map((r,rowIndex) => {
    const rowNumber = rowIndex + 2;
    const now = new Date().toISOString();
    const slot = at(r,'Slot') as Slot;
    const baseName = (at(r,'Base Name').trim() || inferBaseName(at(r,'Name').trim()));
    if (!baseName) throw new Error(`CSV row ${rowNumber}: item name is required.`);
    if (!['Head','Back','Wrist'].includes(slot)) throw new Error(`CSV row ${rowNumber}: invalid slot ${slot || '(blank)'}.`);
    const num = (h: string) => finite(at(r,h), rowNumber, h);
    let id = at(r,'ID').trim() || crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    const authenticated = /^(true|yes|1)$/i.test(at(r,'Authenticated').trim());
    const kindRaw = at(r,'Authentication Type').trim();
    const kind = (kindRaw || (authenticated ? 'Normal' : 'None')) as GearItem['authentication']['kind'];
    if (!['None','Normal','Premium','Limited','Alien'].includes(kind)) throw new Error(`CSV row ${rowNumber}: invalid authentication type ${kind}.`);
    if (authenticated && kind === 'None') throw new Error(`CSV row ${rowNumber}: authenticated item cannot use authentication type None.`);
    const effect = at(r,'Authentication Effect').trim();
    if (authenticated && !effect) throw new Error(`CSV row ${rowNumber}: authentication effect is required for authenticated gear.`);
    const stats = { luck:num('Luck'), energy:num('Energy Drink Time'), tip:num('Tip Chance'), walk:num('Walkspeed'), vehicle:num('Vehicle Speed'), recovery:num('Bid Recovery'), zone:num('Bid Zone Width'), arrowReduction:gameArrowToReduction(num('Bid Arrow Speed (game display)')), npc:num('NPC Offers Bonus') };
    const statDeltas = parseStatDeltas(at(r,'Authentication Stat Deltas'), rowNumber);
    const authentication = { kind, effect, value:num('Authentication Value'), ...(statDeltas === undefined ? {} : { statDeltas }) };
    const conditionText=at(r,'Condition %').trim();
    const conditionPct=conditionText===''?undefined:finite(conditionText,rowNumber,'Condition %');
    if(conditionPct!==undefined && (conditionPct<0 || conditionPct>100)) throw new Error(`CSV row ${rowNumber}: condition must be between 0 and 100%.`);
    return {
      id, baseName, name:generateGearName(baseName,stats,authenticated,authentication), slot, stats,
      authenticated, authentication, mutation:at(r,'Mutation').trim()||undefined, conditionPct,
      favourite:/^(true|yes|1)$/i.test(at(r,'Favourite').trim()), createdAt:now, updatedAt:now
    };
  });
}

// The optional JSON column keeps older CSV files compatible while preserving observed
// authentication changes separately from the item's displayed base stats.
function parseStatDeltas(text: string, row: number): Partial<GearStats> | undefined {
  if (!text.trim()) return undefined;
  const error = () => new Error(`CSV row ${row}: Authentication Stat Deltas must be a JSON object containing known stat keys with finite numeric values.`);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw error(); }
  return validateStatDeltas(parsed, `CSV row ${row}: Authentication Stat Deltas`);
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

