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
    keepThisWindow: vi.fn(async (data: unknown) => { store.conflicted = false; store.saved.push(data); }),
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
import { Equipment, equipmentView } from './screens/Equipment';

const lastSaved = () => store.saved.at(-1) as AppData;
function gear(id: string, slot: GearItem['slot'], stats: Partial<GearItem['stats']> = {}): GearItem {
  return { id, baseName: id, name: id, slot, stats: { ...ZERO_STATS, ...stats }, authenticated: false, authentication: { kind: 'None', effect: '', value: 0 }, favourite: false, createdAt: '', updatedAt: '' };
}
async function openApp(data: AppData) {
  store.initial = data;
  const root = await render(<StrictMode><App /></StrictMode>);
  await waitFor(() => byText(root, 'h2', 'Best Set'));
  return root;
}
async function go(root: HTMLElement, label: string) {
  if (label === 'Settings') await click(root.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!);
  else await click(byText(root, 'nav button', new RegExp(label)));
}
/** Opens the manual gear editor through the one Add action. */
const addButton = (root: HTMLElement) => byText(root, 'nav button', /Add/) as HTMLButtonElement;
async function addGear(root: HTMLElement, slot = 'Head') {
  await click(addButton(root));
  await click(button(root, slot));
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
    await go(root, 'Equipment');
    await waitFor(() => byText(root, '.itemRow strong', 'New Cap'));
    expect(root.querySelector('.banner')).toBeNull();
    // The adopted data is already saved; it is not written back over the other window.
    expect(store.saved).toEqual([]);
  });
  it('is picked up as soon as another window saves, without saving it back', async () => {
    const older = makeEmptyData(); older.gear = [gear('Old Cap', 'Head')];
    const newer = makeEmptyData(); newer.gear = [gear('New Cap', 'Head')];
    const root = await openApp(older);
    await go(root, 'Equipment');
    await waitFor(() => byText(root, '.itemRow strong', 'Old Cap'));
    const savesBefore = store.saved.length;
    store.conflicted = true; store.next = newer;
    await act(async () => { store.notify?.(); });
    await waitFor(() => byText(root, '.itemRow strong', 'New Cap'));
    await flush(20);
    expect(store.saved.length).toBe(savesBefore);
    expect(root.querySelector('.banner')).toBeNull();
  });
  it('is not adopted over unsaved changes when another window saves', async () => {
    let release!: () => void;
    const root = await openApp(makeEmptyData());
    await go(root, 'Equipment');
    const { saveData } = await import('./data/storage');
    vi.mocked(saveData).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await addGear(root);
    await type(labelled(root, 'Name') as HTMLInputElement, 'Pending Visor');
    await click(button(root, 'Save'));
    store.conflicted = true; store.next = makeEmptyData();
    const loadsBefore = store.loads;
    await act(async () => { store.notify?.(); });
    await flush(20);
    expect(store.loads).toBe(loadsBefore);
    expect(byText(root, '.itemRow strong', 'Pending Visor')).toBeTruthy();
    release();
  });
  it('keeps this window\'s changes without asking when another copy saved first', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Equipment');
    const loadsBefore = store.loads;
    store.conflicts = 1; store.next = makeEmptyData();
    await addGear(root);
    await type(labelled(root, 'Name') as HTMLInputElement, 'Unsaved Visor');
    await click(button(root, 'Save'));
    await waitFor(() => expect(lastSaved().gear.map(g => g.baseName)).toEqual(['Unsaved Visor']));
    await flush(20);
    expect(root.querySelector('.banner')).toBeNull();
    expect(store.loads).toBe(loadsBefore);
  });
});

describe('navigation', () => {
  it('opens on Home, reaches every screen, and keeps Add one tap away', async () => {
    const root = await openApp(makeInitialData());
    expect([...root.querySelectorAll('nav button')].map(b => b.textContent)).toEqual(['◎Home', '◆Equipment', '＋Add', '◈Certificates']);
    for (const [tab, heading] of [['Equipment', 'Equipment'], ['Certificates', 'Certificates'], ['Settings', 'Settings'], ['Home', 'Home']]) {
      await go(root, tab);
      expect(root.querySelector('h1')?.textContent).toBe(heading);
      if (tab !== 'Settings') expect(byText(root, 'nav button', new RegExp(tab)).getAttribute('aria-current')).toBe('page');
      expect(addButton(root)).toBeTruthy();
    }
  });
});

describe('Home', () => {
  it('shows exactly one Best Set, one next certificate and the equipment counts, with no other loadouts', async () => {
    const data = makeEmptyData();
    data.gear = [gear('Lucky Cap', 'Head', { luck: 50 }), gear('Plain Cap', 'Head'), gear('Pack', 'Back', { arrowReduction: 70 }), gear('Watch', 'Wrist', { energy: 30 })];
    const root = await openApp(data);
    const cards = root.querySelectorAll('.bestSet .pieceCard');
    expect([...cards].map(c => c.querySelector('strong')?.textContent)).toEqual(['Lucky Cap', 'Pack', 'Watch']);
    expect(byText(root, '.totals', /Arrow/).textContent).toContain('Arrow 70% ✓');
    expect(root.querySelectorAll('.answerCard .eyebrow')[0].textContent).toBe('Next certificate');
    expect(root.textContent).toContain('No certificates');
    await waitFor(() => byText(root, '.counts', /Keep/));
    const main = root.querySelector('main')!.textContent!;
    expect(main).not.toMatch(/Day Auction|Night Auction|Rain Auction|Drink Prep|Grading|Shop \/ Idle|score|utility|confidence/i);
  });
  it('uses short empty states for an incomplete inventory', async () => {
    const data = makeEmptyData(); data.gear = [gear('Cap', 'Head')];
    const root = await openApp(data);
    expect(root.textContent).toContain('Add a Head, Back and Wrist to see your Best Set');
    expect(root.textContent).not.toMatch(/vehicle/i);
  });
});

describe('Equipment', () => {
  it('splits equipment into Best Set, Keep and Safe to Discard, and never discards without a full set', async () => {
    const data = makeEmptyData();
    data.gear = [gear('Lucky Cap', 'Head', { luck: 50 }), gear('Plain Cap', 'Head'), gear('Pack', 'Back', { arrowReduction: 70 }), gear('Watch', 'Wrist')];
    const root = await openApp(data);
    await go(root, 'Equipment');
    expect([...root.querySelectorAll('h2')].map(h => h.textContent)).toEqual(['Best Set', 'Keep', 'Safe to Discard']);
    await waitFor(() => byText(root, '.itemRow.check strong', 'Plain Cap'));
    const partial = makeEmptyData(); partial.gear = [gear('Only Cap', 'Head')];
    const view = equipmentView(partial, [{ item: partial.gear[0], verdict: 'KEEP', reason: 'Needed for a full set', standalone: scoreStandalone(partial.gear[0], partial.settings), currentlyEquipped: false, loadoutMemberships: [] }], true, new Set());
    expect(view.discard).toEqual([]);
  });
});

describe('adding gear', () => {
  it('keeps the minus sign while a negative Bid Arrow is typed key by key', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Equipment');
    await addGear(root);
    await type(labelled(root, 'Name') as HTMLInputElement, 'Test Hat');
    await click(button(root, /＋ Arrow/));
    const arrow = labelled(root, /Bid Arrow Speed/) as HTMLInputElement;
    for (const text of ['', '-', '-2', '-24']) {
      await type(arrow, text);
      expect(arrow.value).toBe(text);
    }
    await click(button(root, 'Save'));
    await waitFor(() => byText(root, '.itemRow strong', 'Test Hat'));
    // Game -24% Bid Arrow Speed is a +24 reduction (a slower arrow is good).
    expect(lastSaved().gear[0].stats.arrowReduction).toBe(24);
  });
  it('adds, edits, locks and deletes gear', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Equipment');
    await addGear(root);
    await type(labelled(root, 'Name') as HTMLInputElement, 'Test Visor');
    await click(button(root, 'Save'));
    await waitFor(() => byText(root, '.itemRow strong', 'Test Visor'));
    expect(lastSaved().gear.map(g => g.baseName)).toEqual(['Test Visor']);

    await click(byText(root, '.itemRow', /Test Visor/));
    await type(labelled(root, 'Name') as HTMLInputElement, 'Renamed Visor');
    await click(labelled(root, 'Always keep'));
    await click(button(root, 'Save'));
    await waitFor(() => byText(root, '.itemRow strong', 'Renamed Visor'));
    expect(lastSaved().gear[0]).toMatchObject({ baseName: 'Renamed Visor', favourite: true });

    await click(byText(root, '.itemRow', /Renamed Visor/));
    await click(button(root, 'Delete'));
    await waitFor(() => expect(lastSaved().gear).toHaveLength(0));
  });
  it('shows a validation message instead of saving an unnamed item', async () => {
    const root = await openApp(makeEmptyData());
    await go(root, 'Equipment');
    await addGear(root);
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
    await waitFor(() => byText(root, '.answerCard .verdict', 'Hold certificates'));
  });

  it('shows one next action and records a result against its item', async () => {
    const data = makeInitialData();
    const root = await openApp(data);
    await go(root, 'Certificates');
    const card = await waitFor(() => { if (root.querySelector('.updating')) throw new Error('pending'); return byText(root, '.answerCard', /Next certificate/); }, 60000);
    expect(root.querySelectorAll('.answerCard')).toHaveLength(1);
    expect(card.querySelector('.verdict')?.textContent).toMatch(/^(Use|Consider) /);
    expect(card.querySelector('.facts b')?.textContent).toMatch(/^(0%|<1%|\d+%|\d+%–\d+%)$/);
    const before = data.ownedCertificates.reduce((n, c) => n + c.quantity, 0);
    await click(button(card, 'Record result'));
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

describe('Safe to Discard', () => {
  const data = makeEmptyData();
  data.gear = [gear('weak', 'Head'), gear('fav', 'Head'), gear('strong', 'Head', { luck: 100, energy: 50, tip: 20, npc: 20 }), gear('back', 'Back'), gear('wrist', 'Wrist')];
  data.gear[1].favourite = true;
  const safe = (item: GearItem): ItemAnalysis => ({ item, verdict: 'SAFE TO DISCARD', reason: 'Not needed in any best set', standalone: scoreStandalone(item, data.settings), currentlyEquipped: false, loadoutMemberships: [] });
  const analyses = [safe(data.gear[0]), safe(data.gear[1])];
  const show = (setData: (d: AppData) => void, current: boolean, targets?: Set<string>) =>
    render(<Equipment data={data} setData={setData} view={equipmentView(data, analyses, current, targets)} />);

  it('offers nothing while the analysis is out of date', async () => {
    const root = await show(() => {}, false, new Set());
    expect(root.textContent).toContain('Updating…');
    expect(root.querySelector('.itemRow.check')).toBeNull();
  });
  it('keeps favourites and removes only reviewed, confirmed selections', async () => {
    const setData = vi.fn();
    const root = await show(setData, true, new Set());
    expect(byText(root, '.itemRow.check strong', 'weak')).toBeTruthy();
    expect(root.querySelectorAll('.itemRow.check')).toHaveLength(1);
    expect(button(root, 'Remove (0)').disabled).toBe(true);
    await click(root.querySelector<HTMLInputElement>('.itemRow.check input')!);
    await click(button(root, 'Remove (1)'));
    expect(setData).not.toHaveBeenCalled();
    expect(document.body.querySelector('.reviewList')?.textContent).toContain('weak');
    await click(button(document.body, 'Remove 1'));
    expect(setData).toHaveBeenCalledTimes(1);
    expect((setData.mock.calls[0][0] as AppData).gear.map(g => g.id)).toEqual(['fav', 'strong', 'back', 'wrist']);
  });
  it('keeps an item a certificate is aimed at, and waits for the certificate queue', async () => {
    const pending = await show(() => {}, true);
    expect(pending.querySelector('.itemRow.check')).toBeNull();
    const view = equipmentView(data, analyses, true, new Set(['weak']));
    expect(view.discard).toEqual([]);
    expect(view.keep.find(r => r.item.id === 'weak')?.reason).toBe('Strong future certificate target');
  });
});

describe('Settings', () => {
  it('has no optimiser weights, sliders or model values', async () => {
    const root = await openApp(makeInitialData());
    await go(root, 'Settings');
    expect(root.querySelector('input[type=range]')).toBeNull();
    expect(root.querySelector('main')!.textContent).not.toMatch(/weight|priority|breakpoint|sweet spot|catalogue/i);
    expect(root.textContent).toContain('Backup');
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
    await click(addButton(root));
    await click(button(root, 'Scan screenshots'));
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
  it('saves every cleanly read screenshot in one tap and leaves the rest to check', async () => {
    URL.revokeObjectURL = vi.fn();
    scanner.reads = [
      { stars: 1, infoLines: ['Cow Dominus', 'Mythical', 'Condition: 60%'], statLines: [{ text: '+58% Luck', color: 'green' }, { text: '-35% Bid Arrow Speed', color: 'green' }] },
      { stars: 0, infoLines: ['Brand New Thing', 'Rare'], statLines: [{ text: '+20% Luck', color: 'green' }] }
    ];
    const data = makeInitialData();
    const root = await openApp(data);
    await click(addButton(root));
    await click(button(root, 'Scan screenshots'));
    const input = document.body.querySelector<HTMLInputElement>('input[type=file][multiple]')!;
    Object.defineProperty(input, 'files', { value: ['a.png', 'b.png'].map(n => new File(['x'], n, { type: 'image/png' })), configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => { if (document.body.querySelectorAll('.importCard').length !== 2) throw new Error('reading'); return true; });
    await click(button(document.body, 'Save all ready (1)'));
    expect(lastSaved().gear.find(g => g.baseName === 'Cow Dominus')).toMatchObject({ conditionPct: 60, gradeStars: 1 });
    expect(document.body.textContent).toContain('1 of 2 done · 1 to check');
  });
});
