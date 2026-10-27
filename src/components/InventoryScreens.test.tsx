import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeInitialData } from '../defaults';
import { VehicleScreen } from './VehicleScreen';
import { TrophyScreen } from './TrophyScreen';

function fixture() {
  const data = makeInitialData();
  const dates = { createdAt: '2026-10-27', updatedAt: '2026-10-27' };
  data.vehicleParts = [{id: 'spoiler', name: 'Owned spoiler', baseName: 'Owned spoiler', slot: 'Spoiler', speedPct: 10, accelerationPct: 0, handlingPct: 0, capacityKg: 0, favourite: false, ...dates}];
  data.trailers = [{id: 'trailer', name: 'Owned trailer', capacityKg: 100, favourite: false, ...dates}];
  data.trophies = [{id: 'gavel', name: 'Gold +10%', modifiers: [{mutation: 'Gold', boostPct: 10}], favourite: false, ...dates}];
  return data;
}

// These catch compact inventories accidentally rendering an overview, verdicts,
// or settings instead of the owned items and their editing controls.
describe('inventory entry screens', () => {
  it('shows owned vehicle parts and trailers without nested navigation or analysis', () => {
    const data = fixture();
    const html = renderToStaticMarkup(<VehicleScreen data={data} setData={() => {}} inventoryOnly />);
    expect(html).toContain('Search vehicle parts');
    expect(html).toContain('Add trailer');
    for (const item of [...data.vehicleParts, ...data.trailers]) expect(html).toContain(item.name.replaceAll('&', '&amp;'));
    expect(html).toContain('Edit');
    expect(html).toContain('Clone');
    expect(html).toContain('Delete');
    expect(html).not.toContain('vehicleSections');
    expect(html).not.toContain('BEST BALANCED SETUP');
    expect(html).not.toContain('class="reason"');
    expect(html).not.toContain('badge status');
  });

  it('shows owned Gavels without nested navigation, scores or retention prose', () => {
    const data = fixture();
    const html = renderToStaticMarkup(<TrophyScreen data={data} setData={() => {}} inventoryOnly />);
    expect(html).toContain('Add trophy');
    for (const item of data.trophies) expect(html).toContain(item.name.replaceAll('&', '&amp;'));
    expect(html).toContain('Edit');
    expect(html).toContain('Clone');
    expect(html).toContain('Delete');
    expect(html).not.toContain('trophySections');
    expect(html).not.toContain('score');
    expect(html).not.toContain('class="reason"');
    expect(html).not.toContain('SAFE TO DISCARD');
    expect(html).not.toContain('Optimiser rule');
  });

  it('keeps add controls available for empty inventories', () => {
    const data = makeInitialData();
    data.vehicleParts = []; data.trailers = []; data.trophies = [];
    const vehicle = renderToStaticMarkup(<VehicleScreen data={data} setData={() => {}} inventoryOnly />);
    const trophies = renderToStaticMarkup(<TrophyScreen data={data} setData={() => {}} inventoryOnly />);
    expect(vehicle).toContain('Spoiler');
    expect(vehicle).toContain('Add trailer');
    expect(trophies).toContain('Add trophy');
    expect(vehicle).not.toContain('BEST BALANCED SETUP');
    expect(trophies).not.toContain('TOTAL RELATIVE SCORE');
  });
});
