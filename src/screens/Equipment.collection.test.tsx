// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { makeEmptyData, ZERO_STATS } from '../defaults';
import type { GearItem, ItemAnalysis } from '../types';
import { scoreStandalone } from '../engine/scoring';
import { button, byText, cleanup, click, render } from '../test/dom';
import { Equipment, equipmentView } from './Equipment';

function gear(id: string, name: string, luck: number, mutation = 'None'): GearItem {
 return { id, name, baseName: name, slot: 'Head', mutation, gradeStars: 1, displayedValue: 10 + luck, stats: { ...ZERO_STATS, luck }, authenticated: false, authentication: { kind: 'None', effect: '', value: 0 }, favourite: false, createdAt: '', updatedAt: '' };
}
afterEach(cleanup);
it('shows exactly three accessory drawers followed by the existing gavel and charm sections; every copy remains editable', async () => {
 const data = makeEmptyData(); data.gear = [gear('display', 'Cap', 1, 'Diamond'), gear('weak', 'Cap', 2), gear('witness', 'Other Cap', 3)];
 const analyses: ItemAnalysis[] = data.gear.map(item => ({ item, verdict: 'KEEP', reason: '', standalone: scoreStandalone(item, data.settings), currentlyEquipped: false, loadoutMemberships: [] }));
 const setData = vi.fn();
 const root = await render(<Equipment data={data} setData={setData} view={equipmentView(data, analyses, true, new Set())} />);
 expect([...root.querySelectorAll('section > details > summary')].map(x => x.textContent)).toEqual(['Display (2)', 'Chest Storage (0)', 'Discard (1)', 'All Gavels (0)', 'Spare charms (0 listed)']);
 expect(root.textContent).not.toMatch(/All equipment|Safe to Discard|Keep \(/);
 await click(root.querySelector<HTMLButtonElement>('button[aria-label="Edit Cap"]')!);
 expect(button(root, 'Delete')).toBeTruthy();
 await click(button(root, 'Cancel'));
 await click(root.querySelector<HTMLInputElement>('.itemRow.check input')!);
 await click(button(root, 'Remove (1)'));
 expect(setData).not.toHaveBeenCalled();
 expect(document.body.querySelector('.reviewList')?.textContent).toContain('Cap');
 await click(button(document.body, 'Remove 1'));
 expect(setData.mock.calls[0][0].gear).toHaveLength(2);
});
it('keeps every record reachable while analysis is stale and marks unverified copies', async () => {
 const data = makeEmptyData(); data.gear = [{ ...gear('unknown', 'Unknown Cap', 0), needsReview: true, sourceImage: 'IMG_8420.jpg' } as GearItem];
 const root = await render(<Equipment data={data} setData={() => {}} view={equipmentView(data, [], false)} />);
 expect(root.textContent).toContain('Needs stat review');
 expect(root.textContent).toContain('IMG_8420.jpg');
 expect(byText(root, '.itemRow strong', 'Unknown Cap')).toBeTruthy();
 expect(root.querySelector('.itemRow.check')).toBeNull();
});
it('reserves the freshly selected worn copy while background retention is stale',()=>{
 const data=makeEmptyData();const old=gear('old','Cap',10),fresh=gear('fresh','Cap',20);
 data.gear=[old,fresh,{...gear('b','Pack',0),slot:'Back'},{...gear('w','Watch',0),slot:'Wrist'}];
 const stale:ItemAnalysis[]=[{item:old,verdict:'EQUIP',reason:'',standalone:scoreStandalone(old,data.settings),currentlyEquipped:true,loadoutMemberships:[]}];
 const view=equipmentView(data,stale,false);
 expect([...(view.display??[]),...(view.storage??[]),...view.discard].some(r=>r.item.id==='fresh')).toBe(false);
 expect(view.display?.some(r=>r.item.id==='old')).toBe(true);
});
