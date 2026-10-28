// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEmptyData, makeInitialData, ZERO_STATS } from './defaults';
import type { AppData, GearItem, ItemAnalysis } from './types';
import { scoreStandalone } from './engine/scoring';
import { button, byText, cleanup, click, flush, labelled, render, type, waitFor } from './test/dom';

const store = vi.hoisted(() => ({ initial: undefined as unknown, saved: [] as unknown[], conflicts: 0, loads: 0, conflicted: false, next: undefined as unknown, notify: undefined as undefined | (() => void) }));
vi.mock('./data/storage', async importOriginal => {
  const actual = await importOriginal<typeof import('./data/storage')>();
  return {
    ...actual,
    loadData: vi.fn(async () => { store.loads++; return structuredClone(store.conflicted && store.next ? store.next : store.initial); }),
    saveData: vi.fn(async (data: unknown) => {
      // Simulates another window having saved newer data before this one.
      if (store.conflicts > 0) { store.conflicts--; store.conflicted = true; throw new actual.StorageConflictError(); }
      store.saved.push(data);
    }),
    saveEmergencyMirror: vi.fn(),
    onSavedElsewhere: vi.fn((callback: () => void) => { store.notify = callback; return () => { store.notify = undefined; }; })
  };
});
const scanner = vi.hoisted(() => ({ reads: [] as unknown[] }));
vi.mock('./scanner/panelOcr', () => ({
  createPanelReader: vi.fn(async () => ({
    read: vi.fn(async (file: File) => ({ read: scanner.reads.shift(), previewUrl: 'data:image/png;base64,', fullUrl: `blob:${file.name}` })),
    close: vi.fn(async () => {})
  }))
}));

import App from './App';
import { Discard } from './screens/Discard';

const lastSaved = () => store.saved.at(-1) as AppData;
function gear(id: string, slot: GearItem['slot'], stats: Partial<GearItem['stats']> = {}): GearItem {
  return { id, baseName: id, name: id, slot, stats: { ...ZERO_STATS, ...stats }, authenticated: false, authentication: { kind: 'None', effect: '', value: 0 }, favourite: false, createdAt: '', updatedAt: '' };
}
async function openApp(data: AppData) {
  store.initial = data;
  const root = await render(<StrictMode><App /></StrictMode>);
  await waitFor(() => byText(root, 'h1', 'Best setup'));
  return root;
}
async function go(root: HTMLElement, label: string) {
  await click(byText(root, 'nav button', new RegExp(label)));
}

beforeEach(() => {
  store.saved = []; store.conflicts = 0; store.loads = 0; store.conflicted = false; store.next = undefined;
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('prompt', () => null);
});
afterEach(async () => { await cleanup(); vi.unstubAllGlobals(); });

describe('newer data saved by another window', () => {
  it('is adopted silently when this window has no changes of its own', async () => {
    const older = makeEmptyData(); older.gear = [gear('Old Cap', 'Head')];
    const newer = makeEmptyData(); newer.gear = [gear('New Cap', 'Head')];
    store.conflicts = 1; store.next = newer;
    const root = await openApp(older);
    await go(root, 'Inventory');
    await waitFor(() => byText(root, '.row strong', 'New Cap'));
    expect(root.querySelector('.banner')).toBeNull();
    // The adopted data is already saved; it is not written back over the other window.
    expect(store.saved).toEqual([]);
  });
  it('is picked up as soon as another window saves, without saving it back', async () => {
    const older = makeEmptyData(); older.gear = [gear('Old Cap', 'Head')];
    const newer = makeEmptyData(); newer.gear = [gear('New Cap', 'Head')];
    const root = await openApp(older);
    await go(root, 'Inventory');
    await waitFor(() => byText(root, '.row strong', 'Old Cap'));
    const savesBefore = store.saved.length;
    store.conflicted = true; store.next = newer;
    await act(async () => { store.notify?.(); });
    await waitFor(() => byText(root, '.row strong', 'New Cap'));
    await flush(20);
    expect(store.saved.length).toBe(savesBefore);
    expect(root.querySelector('.banner')).toBeNull();
  });
  it('is not adopted over unsaved changes when another window saves', async () => {
    let release!: () => void;
    const root = await openApp(makeEmptyData());
    await go(root, 'Inventory');
    const { saveData } = await import('./data/storage');
    vi.mocked(saveData).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await click(button(root, '＋ Add gear'));
    await type(labelled(root, 'Name') as HTMLInputElement, 'Pending Visor');
    await click(button(root, 'Save'));
    store.conflicted = true; store.next = makeEmptyData();
    const loadsBefore = store.loads;
    await act(async () => { store.notify?.(); });
    await flush(20);
    expect(store.loads).toBe(loadsBefore);
    expect(byText(root, '.row strong', 'Pending Visor')).toBeTruthy();
    release();
  });
  it('keeps the warning when this window has unsaved changes', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Inventory');
    const loadsBefore = store.loads;
    store.conflicts = 1; store.next = makeEmptyData();
    await click(button(root, '＋ Add gear'));
    await type(labelled(root, 'Name') as HTMLInputElement, 'Unsaved Visor');
    await click(button(root, 'Save'));
    await waitFor(() => byText(root, '.banner', /Another window saved newer data/));
    expect(byText(root, '.banner', /Download this window's changes/)).toBeTruthy();
    expect(store.loads).toBe(loadsBefore);
    expect(byText(root, '.row strong', 'Unsaved Visor')).toBeTruthy();
  });
});

describe('navigation', () => {
  it('opens on Best setup and reaches every screen', async () => {
    const root = await openApp(makeInitialData());
    for (const [tab, heading] of [['Certificates', 'Certificates'], ['Discard', 'Discard'], ['Inventory', 'Inventory'], ['Preferences', 'Preferences'], ['Best setup', 'Best setup']]) {
      await go(root, tab);
      expect(root.querySelector('h1')?.textContent).toBe(heading);
      expect(byText(root, 'nav button', new RegExp(tab)).getAttribute('aria-current')).toBe('page');
    }
  });
});

describe('Best setup', () => {
  it('shows only selected items and short stats, with no score or explanation text', async () => {
    const data = makeEmptyData();
    data.gear = [gear('Lucky Cap', 'Head', { luck: 50 }), gear('Plain Cap', 'Head'), gear('Pack', 'Back', { arrowReduction: 70 }), gear('Watch', 'Wrist', { energy: 30 })];
    const root = await openApp(data);
    const auction = byText(root, '.setCard', /Neutral/);
    expect(auction.textContent).toContain('Lucky Cap');
    expect(auction.textContent).not.toContain('Plain Cap');
    expect(auction.textContent).toContain('Arrow -70% ✓');
    // Identical trios across contexts share one card.
    expect(auction.querySelector('h3')?.textContent).toBe('Neutral · Day · Night · Rain');
    expect(byText(root, '.setCard', /Drink Prep/).textContent).toContain('Watch');
    expect(root.querySelector('main')!.textContent).not.toMatch(/score|utility|confidence/i);
  });
  it('uses short empty states for an incomplete inventory', async () => {
    const data = makeEmptyData(); data.gear = [gear('Cap', 'Head')];
    const root = await openApp(data);
    expect(root.textContent).toContain('Needs Back, Wrist gear');
    expect(root.textContent).toContain('No Gavels');
    expect(root.textContent).not.toMatch(/vehicle/i);
  });
});

describe('Inventory', () => {
  it('keeps the minus sign while a negative Bid Arrow is typed key by key', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Inventory');
    await click(button(root, '＋ Add gear'));
    await type(labelled(root, 'Name') as HTMLInputElement, 'Test Hat');
    await click(button(root, /＋ Arrow/));
    const arrow = labelled(root, /Bid Arrow Speed/) as HTMLInputElement;
    for (const text of ['', '-', '-2', '-24']) {
      await type(arrow, text);
      expect(arrow.value).toBe(text);
    }
    await click(button(root, 'Save'));
    await waitFor(() => byText(root, '.row strong', 'Test Hat'));
    // Game -24% Bid Arrow Speed is a +24 reduction (a slower arrow is good).
    expect(lastSaved().gear[0].stats.arrowReduction).toBe(24);
  });
  it('adds, edits, duplicates and favourites gear', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Inventory');
    await click(button(root, '＋ Add gear'));
    await type(labelled(root, 'Name') as HTMLInputElement, 'Test Visor');
    await click(button(root, 'Save'));
    await waitFor(() => byText(root, '.row strong', 'Test Visor'));
    expect(lastSaved().gear.map(g => g.baseName)).toEqual(['Test Visor']);

    await click(button(root, 'Edit'));
    await type(labelled(root, 'Name') as HTMLInputElement, 'Renamed Visor');
    await click(button(root, 'Save'));
    await waitFor(() => byText(root, '.row strong', 'Renamed Visor'));

    await click(button(root, 'Duplicate'));
    await click(button(root, 'Save'));
    await waitFor(() => expect(lastSaved().gear).toHaveLength(2));
    expect(new Set(lastSaved().gear.map(g => g.id)).size).toBe(2);

    const star = root.querySelector<HTMLButtonElement>('.star')!;
    expect(star.getAttribute('aria-pressed')).toBe('false');
    await click(star);
    expect(root.querySelector('.star')!.getAttribute('aria-pressed')).toBe('true');
    expect(lastSaved().gear[0].favourite).toBe(true);
  });
  it('shows a validation message instead of saving an unnamed item', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Inventory');
    await click(button(root, '＋ Add gear'));
    await click(button(root, 'Save'));
    expect(root.querySelector('.formError')?.textContent).toBe('Name is required.');
    expect(store.saved.every(d => (d as AppData).gear.length === 0)).toBe(true);
  });
});

describe('Certificates', () => {
  it('creates certificates in an empty workspace and keeps variants separate', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Certificates');
    await click(button(root, '＋ Add certificates'));
    await type(labelled(root, 'Type'), 'Limited Certificate of Authenticity');
    await type(labelled(root, 'Grade'), '2');
    await type(labelled(root, 'Mutation') as HTMLInputElement, 'Gold');
    await type(labelled(root, 'Quantity') as HTMLInputElement, '3');
    await click(button(root, 'Save'));
    await click(button(root, '＋ Add certificates'));
    await type(labelled(root, 'Type'), 'Limited Certificate of Authenticity');
    await click(button(root, 'Save'));
    expect(lastSaved().ownedCertificates.map(c => [c.type, c.gradeStars, c.mutation, c.quantity])).toEqual([
      ['Limited Certificate of Authenticity', 2, 'Gold', 3], ['Limited Certificate of Authenticity', undefined, undefined, 1]]);
    await click(root.querySelectorAll<HTMLButtonElement>('.stepper button[aria-label="Add one"]')[0]);
    expect(lastSaved().ownedCertificates[0].quantity).toBe(4);
    // No gear: every certificate is held rather than given an invented target.
    await waitFor(() => byText(root, '.hold h3', 'Hold'));
  });

  it('lists a numbered queue and records a result against the current item', async () => {
    const data = makeInitialData();
    const root = await openApp(data);
    await go(root, 'Certificates');
    const rows = await waitFor(() => { if (root.querySelector('.updating')) throw new Error('pending'); return root.querySelectorAll('.queueRow'); }, 60000);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].querySelector('.queueNo')?.textContent).toBe('1');
    expect(rows[0].querySelector('.chance b')?.textContent).toMatch(/^(Unclear|\d+%\+|0%|<1%|\d+%|\d+%–\d+%)$/);
    const before = data.ownedCertificates.reduce((n, c) => n + c.quantity, 0);
    await click(rows[0].querySelector('button')!);
    const result = labelled(document.body, 'Result') as HTMLSelectElement;
    await type(result, result.options[1].value);
    await type(labelled(document.body, 'Value') as HTMLInputElement, '5');
    await click(button(document.body, 'Save result'));
    await waitFor(() => expect(lastSaved().rollLog).toHaveLength(1));
    expect(lastSaved().ownedCertificates.reduce((n, c) => n + c.quantity, 0)).toBe(before - 1);
    expect(byText(root, 'summary', /History/).textContent).toBe('History (1)');
    // The Authenticator prompt answer appears only after a fresh result, and closes for good.
    await waitFor(() => byText(root, '.promptCard', /Authenticator prompt/), 60000);
    expect(root.querySelector('.bigAnswer')?.textContent).toMatch(/^(Accept|Reroll|Reroll number)$/);
    await click(button(root, 'Prompt closed'));
    expect(root.querySelector('.promptCard')).toBeNull();
  }, 120000);
});

describe('Discard', () => {
  const data = makeEmptyData();
  data.gear = [gear('weak', 'Head'), gear('fav', 'Head'), gear('strong', 'Head', { luck: 100, energy: 50, tip: 20, npc: 20 }), gear('back', 'Back'), gear('wrist', 'Wrist')];
  data.gear[1].favourite = true;
  const safe = (item: GearItem): ItemAnalysis => ({ item, verdict: 'SAFE TO DISCARD', reason: '', standalone: scoreStandalone(item, data.settings), currentlyEquipped: false, loadoutMemberships: [] });
  const analyses = [safe(data.gear[0]), safe(data.gear[1])];

  it('locks stale gear proofs', async () => {
    const root = await render(<Discard data={data} setData={() => {}} gearAnalyses={analyses} gearCurrent={false} certificateTargets={new Set()} />);
    expect(root.textContent).toContain('Gear updating…');
    expect(root.textContent).not.toContain('weak');
  });
  it('excludes favourites and removes only reviewed, confirmed selections', async () => {
    const setData = vi.fn();
    const root = await render(<Discard data={data} setData={setData} gearAnalyses={analyses} gearCurrent={true} certificateTargets={new Set()} />);
    expect(root.textContent).toContain('weak');
    expect(root.textContent).not.toContain('fav');
    expect(button(root, 'Review (0)').disabled).toBe(true);
    await click(root.querySelector<HTMLInputElement>('input[type=checkbox]')!);
    await click(button(root, 'Review (1)'));
    expect(setData).not.toHaveBeenCalled();
    expect(document.body.querySelector('.reviewList')?.textContent).toContain('weak');
    await click(button(document.body, 'Remove 1'));
    expect(setData).toHaveBeenCalledTimes(1);
    expect((setData.mock.calls[0][0] as AppData).gear.map(g => g.id)).toEqual(['fav', 'strong', 'back', 'wrist']);
  });
  it('never offers an item the certificate queue targets, and waits for that queue', async () => {
    const pending = await render(<Discard data={data} setData={() => {}} gearAnalyses={analyses} gearCurrent={true} />);
    expect(pending.textContent).toContain('Gear updating…');
    expect(pending.textContent).not.toContain('weak');
    const targeted = await render(<Discard data={data} setData={() => {}} gearAnalyses={analyses} gearCurrent={true} certificateTargets={new Set(['weak'])} />);
    expect(targeted.textContent).toContain('Nothing to discard');
  });
  it('shows a short empty state', async () => {
    const root = await render(<Discard data={makeEmptyData()} setData={() => {}} gearAnalyses={[]} gearCurrent={true} certificateTargets={new Set()} />);
    expect(root.textContent).toContain('Nothing to discard');
  });
});

describe('Preferences', () => {
  const outputs = (root: HTMLElement, section: RegExp) =>
    [...byText(root, '.prefSection', section).querySelectorAll('.weightGroup output')].map(o => o.textContent);
  it('shows each weight group as percentages that always add up to 100', async () => {
    const root = await openApp(makeInitialData());
    await go(root, 'Preferences');
    for (const section of [/^Auctions/, /^Shop/]) {
      const shown = outputs(root, section).map(t => Number(t!.replace('%', '')));
      expect(shown.reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(byText(root, '.prefSection', /^Auctions/).textContent).toContain('Reaching 65–80% Bid Arrow reduction always comes first.');
  });
  it('moving one weight rebalances the others in its group immediately, and Reset restores it', async () => {
    const root = await openApp(makeInitialData());
    await go(root, 'Preferences');
    const luck = labelled(root, 'Luck') as HTMLInputElement;
    expect(luck.type).toBe('range');
    await type(luck, '70');
    expect(outputs(root, /^Auctions/)[0]).toBe('70%');
    expect(outputs(root, /^Auctions/).map(t => Number(t!.replace('%', ''))).reduce((a, b) => a + b, 0)).toBe(100);
    const s = lastSaved().settings;
    const total = s.luckWeight + s.arrowWeight + s.zoneWeight + s.recoveryWeight;
    expect(s.luckWeight / total).toBeCloseTo(.7, 9);
    // The other three keep their proportions (default Arrow 1 : Zone 0.6 : Recovery 0.2).
    expect(s.zoneWeight / s.arrowWeight).toBeCloseTo(.6, 9);
    expect(s.recoveryWeight / s.arrowWeight).toBeCloseTo(.2, 9);
    // Other groups are untouched.
    expect(s.shopTipWeight).toBe(makeInitialData().settings.shopTipWeight);
    expect(s.shopNpcWeight).toBe(makeInitialData().settings.shopNpcWeight);
    await click(button(byText(root, '.prefSection', /^Auctions/), 'Reset'));
    expect(lastSaved().settings.luckWeight).toBe(1);
  });
  it('keeps stored custom weights exactly until a weight in that group is moved', async () => {
    const data = makeInitialData(); data.settings.zoneWeight = .65; data.settings.luckWeight = .3;
    const root = await openApp(data);
    await go(root, 'Preferences');
    await type(labelled(root, 'Tip Chance') as HTMLInputElement, '50');
    expect(lastSaved().settings.zoneWeight).toBe(.65);
    expect(lastSaved().settings.luckWeight).toBe(.3);
  });
});

describe('screenshot import', () => {
  it('shows each screenshot beside its reading, then saves only what is approved', async () => {
    URL.revokeObjectURL = vi.fn();
    scanner.reads = [
      { stars: 1, infoLines: ['Cow Dominus', 'Mythical', 'Condition: 60%'], statLines: [{ text: '+58% Luck', color: 'green' }, { text: '-35% Bid Arrow Speed', color: 'green' }] },
      { stars: 0, infoLines: ['Brand New Thing', 'Rare'], statLines: [{ text: '+20% Luck', color: 'green' }] },
      { stars: 2, infoLines: ['[Void +74%] Gavel Trophy', 'Legendary'], statLines: [] }
    ];
    const data = makeInitialData();
    const root = await openApp(data);
    await go(root, 'Inventory');
    await click(button(root, 'Import screenshots'));
    const input = document.body.querySelector<HTMLInputElement>('input[type=file][multiple]')!;
    Object.defineProperty(input, 'files', { value: ['a.png', 'b.png', 'c.png'].map(n => new File(['x'], n, { type: 'image/png' })), configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => { if (document.body.querySelectorAll('.importCard').length !== 3) throw new Error('reading'); return true; });
    const cards = [...document.body.querySelectorAll<HTMLElement>('.importCard')];
    expect(cards[0].querySelector('img')?.getAttribute('alt')).toContain('a.png');

    // A known item updates in place; nothing is saved until it is approved.
    const saves = store.saved.length;
    await click(button(cards[0], 'Update Cow Dominus'));
    expect(store.saved.length).toBeGreaterThan(saves);
    const cow = lastSaved().gear.find(g => g.baseName === 'Cow Dominus')!;
    expect(cow).toMatchObject({ conditionPct: 60, gradeStars: 1 });
    expect(lastSaved().gear).toHaveLength(data.gear.length);

    // An unplaceable name cannot be added until a slot is chosen.
    expect(button(cards[1], 'Add').disabled).toBe(true);
    await type(labelled(cards[1], 'Slot'), 'Back');
    await click(button(cards[1], 'Add'));
    expect(lastSaved().gear.find(g => g.baseName === 'Brand New Thing')).toMatchObject({ slot: 'Back', gradeStars: 0 });

    await click(button(cards[2], 'Skip'));
    expect(lastSaved().trophies).toHaveLength(data.trophies.length);
    expect(document.body.textContent).toContain('3 of 3 done');
  });
});

