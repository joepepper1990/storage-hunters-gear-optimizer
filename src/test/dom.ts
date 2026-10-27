import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];

export async function render(ui: ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}

export async function cleanup() {
  for (const { root, container } of mounted) { await act(async () => root.unmount()); container.remove(); }
  mounted = [];
  document.body.innerHTML = '';
}

export async function flush(ms = 0) {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
}

/** Polls until the assertion passes; analysis may finish on a later tick. */
export async function waitFor<T>(check: () => T, timeout = 20000): Promise<T> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeout) {
    try { return check(); } catch (error) { last = error; }
    await flush(10);
  }
  throw last;
}

export function byText(root: ParentNode, selector: string, text: string | RegExp): HTMLElement {
  const match = [...root.querySelectorAll<HTMLElement>(selector)].find(el => typeof text === 'string' ? el.textContent?.trim() === text : text.test(el.textContent ?? ''));
  if (!match) throw new Error(`No ${selector} with text ${text}`);
  return match;
}

export function button(root: ParentNode, text: string | RegExp): HTMLButtonElement {
  return byText(root, 'button', text) as HTMLButtonElement;
}

export async function click(el: HTMLElement) {
  await act(async () => { el.click(); });
}

/** Sets a value the way a user would, so React's onChange fires. */
export async function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function labelled(root: ParentNode, label: string | RegExp): HTMLInputElement | HTMLSelectElement {
  const labelEl = [...root.querySelectorAll('label')].find(el => typeof label === 'string' ? el.textContent?.trim().startsWith(label) : label.test(el.textContent ?? ''));
  if (!labelEl) throw new Error(`No label ${label}`);
  const control = labelEl.htmlFor ? root.querySelector<HTMLInputElement>(`[id="${labelEl.htmlFor}"]`) : labelEl.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
  if (!control) throw new Error(`No control for ${label}`);
  return control;
}
