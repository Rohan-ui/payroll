import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The visual letterhead editor through the real screen (API stubbed): the
 * header and footer resize by dragging within their limits, the numbers and
 * the page stay in step, images move and resize in millimetres (in proportion
 * unless set to stretch) inside their area, zoom changes only what is on
 * screen, changes can be undone, and saving sends and reloads the millimetres.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }));
const { LetterheadsView } = await import('./LetterheadsView');

const png = (width: number, height: number) => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const LETTERHEAD = {
  id: 'l1', name: 'Official', companyName: 'Acme Technologies Pvt Ltd', addressText: 'Pune', phone: null, email: null, website: null, registrationText: 'CIN U1', footerText: null,
  logoPosition: 'LEFT', headerHeightMm: 30, footerHeightMm: 16, logoBox: null, headerArtBox: null, footerArtBox: null,
  isDefault: true, isArchived: false, images: { logo: true, header: false, footer: true }, updatedAt: '2026-10-01T00:00:00Z',
};

let stored: Record<string, unknown>;
let puts: Record<string, unknown>[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  stored = { ...LETTERHEAD };
  puts = [];
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/v1/onboarding/letterheads/l1' && method === 'PUT') {
        const body = JSON.parse(String(init.body));
        puts.push(body);
        stored = { ...stored, ...body, name: body.name, updatedAt: '2026-10-02T00:00:00Z' };
        return json({ success: true, data: stored });
      }
      if (url === '/api/v1/onboarding/letterheads') return json({ success: true, data: [stored] });
      if (url.endsWith('/images/logo')) return new Response(png(400, 100), { status: 200 });
      if (url.endsWith('/images/footer')) return new Response(png(1200, 90), { status: 200 });
      return json({ success: true, data: [] });
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement;
const byLabel = (text: string) => {
  const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement;
};
const setValue = (el: HTMLInputElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const slider = (which: 'header' | 'footer') => container.querySelector(`[data-boundary=${which}]`) as HTMLElement;
const image = (slot: 'logo' | 'footer') => container.querySelector(`[data-image=${slot}]`) as HTMLButtonElement;
const corner = (c: string) => container.querySelector(`[data-corner=${c}]`) as HTMLElement;
const live = () => container.querySelector('[data-live]')?.textContent;
const num = (label: string) => Number(byLabel(label).value);

/** Screen pixels per millimetre at 100 %. */
const PPM = 96 / 25.4;
const pointer = (type: string, target: EventTarget, x: number, y: number) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })); });
/** Presses on an element, moves by (dx, dy) mm at 100 %, and optionally lets go. */
const drag = (el: Element, dxMm: number, dyMm: number, release = true) => {
  pointer('pointerdown', el, 200, 200);
  pointer('pointermove', window, 200 + dxMm * PPM, 200 + dyMm * PPM);
  if (release) pointer('pointerup', window, 200 + dxMm * PPM, 200 + dyMm * PPM);
};

/** Opens the letterhead at 100 % zoom. */
async function open() {
  await act(async () => root.render(<LetterheadsView />));
  await settle();
  act(() => button('Official').click());
  await settle();
  while (container.querySelector('output')?.textContent !== '100%') act(() => button('Zoom in').click());
}

describe('letterhead editor', () => {
  it('resizes the header and footer by dragging their boundaries, within their limits, showing the height while dragging', async () => {
    await open();
    expect(slider('header').getAttribute('aria-valuenow')).toBe('30');
    drag(slider('header'), 0, 10, false);
    expect(live()).toBe('Header 40 mm');
    pointer('pointerup', window, 0, 0);
    expect(live()).toBeUndefined();
    expect(slider('header').getAttribute('aria-valuenow')).toBe('40');
    expect(num('Header height')).toBe(40);
    // The boundary sits at the top margin plus the header, in screen pixels.
    expect(parseFloat(slider('header').style.top)).toBeCloseTo((20 + 40) * PPM - 6, 3);
    drag(slider('header'), 0, 100);
    expect(num('Header height')).toBe(70);
    drag(slider('header'), 0, -200);
    expect(num('Header height')).toBe(15);

    // Dragging the footer's boundary up makes it taller.
    drag(slider('footer'), 0, -10);
    expect(num('Footer height')).toBe(26);
    drag(slider('footer'), 0, 100);
    expect(num('Footer height')).toBe(8);
    act(() => { slider('footer').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
    expect(slider('footer').getAttribute('aria-valuenow')).toBe('9');
  });

  it('keeps the numbers and the page in step', async () => {
    await open();
    setValue(byLabel('Header height'), '45');
    expect(slider('header').getAttribute('aria-valuenow')).toBe('45');
    expect(parseFloat(slider('header').style.top)).toBeCloseTo((20 + 45) * PPM - 6, 3);
    setValue(byLabel('Header height'), '90');
    expect(byLabel('Header height').getAttribute('aria-invalid')).toBe('true');
    expect(slider('header').getAttribute('aria-valuenow')).toBe('45');
    act(() => { byLabel('Header height').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(byLabel('Header height').value).toBe('45');
  });

  it('resizes the logo in proportion from a corner, moves it, keeps it inside the header, and stretches it only when asked', async () => {
    await open();
    expect(image('logo').getAttribute('aria-label')).toContain('placed automatically');
    act(() => image('logo').click());
    expect(image('logo').getAttribute('aria-pressed')).toBe('true');
    // The automatic layout's place: 51 × 12.8 mm, 8.6 mm down.
    expect([num('From left'), num('From top'), num('Width'), num('Height')]).toEqual([0, 8.6, 51, 12.8]);

    drag(corner('se'), 20, 0, false);
    expect(live()).toBe('71 × 17.8 mm');
    pointer('pointerup', window, 0, 0);
    expect(num('Width') / num('Height')).toBeCloseTo(4, 1);
    expect(image('logo').getAttribute('aria-label')).not.toContain('automatically');

    drag(image('logo'), 10, -5);
    expect([num('From left'), num('From top')]).toEqual([10, 3.5]);
    drag(image('logo'), 0, 100);
    expect(num('From top') + num('Height')).toBeCloseTo(30, 5);
    drag(corner('se'), 500, 500);
    expect(num('From top') + num('Height')).toBeLessThanOrEqual(30);
    expect(num('From left') + num('Width')).toBeLessThanOrEqual(170);

    // A typed width keeps the proportions too.
    setValue(byLabel('Width'), '40');
    expect([num('Width'), num('Height')]).toEqual([40, 10]);

    const keep = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Keep proportions')!.querySelector('input') as HTMLInputElement;
    expect(keep.checked).toBe(true);
    act(() => keep.click());
    drag(corner('se'), 0, -4);
    expect([num('Width'), num('Height')]).toEqual([40, 6]);

    // A shorter header pulls the logo in with it.
    setValue(byLabel('Header height'), '15');
    expect(num('From top') + num('Height')).toBeLessThanOrEqual(15);
  });

  it('moves and resizes footer artwork inside the footer', async () => {
    await open();
    act(() => image('footer').click());
    expect([num('Width'), num('Height')]).toEqual([170, 12.8]);
    drag(corner('se'), -50, 0);
    expect(num('Width')).toBe(120);
    expect(num('Width') / num('Height')).toBeCloseTo(1200 / 90, 0);
    drag(image('footer'), 30, 50);
    expect(num('From left')).toBe(30);
    expect(num('From top') + num('Height')).toBeCloseTo(16, 5);
    drag(corner('se'), 500, 500);
    expect(num('From top') + num('Height')).toBeLessThanOrEqual(16);
    expect(num('From left') + num('Width')).toBeLessThanOrEqual(170);
  });

  it('zooms the page on screen without changing any measurement', async () => {
    await open();
    act(() => image('logo').click());
    const box = () => image('logo').parentElement as HTMLElement;
    const before = { width: parseFloat(box().style.width), mm: num('Width') };
    expect(before.width).toBeCloseTo(51 * PPM, 3);
    act(() => button('Zoom in').click());
    expect(container.querySelector('output')?.textContent).toBe('110%');
    expect(parseFloat(box().style.width)).toBeCloseTo(51 * PPM * 1.1, 3);
    expect(num('Width')).toBe(before.mm);
    // Dragging at 110 % still moves by millimetres.
    pointer('pointerdown', slider('header'), 0, 0);
    pointer('pointermove', window, 0, 10 * PPM * 1.1);
    pointer('pointerup', window, 0, 0);
    expect(num('Header height')).toBe(40);
  });

  it('undoes and redoes layout changes, one drag at a time', async () => {
    await open();
    expect(button('Undo layout change').disabled).toBe(true);
    pointer('pointerdown', slider('header'), 0, 0);
    pointer('pointermove', window, 0, 5 * PPM);
    pointer('pointermove', window, 0, 10 * PPM);
    pointer('pointerup', window, 0, 0);
    drag(slider('footer'), 0, -4);
    expect([num('Header height'), num('Footer height')]).toEqual([40, 20]);
    act(() => button('Undo layout change').click());
    expect([num('Header height'), num('Footer height')]).toEqual([40, 16]);
    act(() => button('Undo layout change').click());
    expect(num('Header height')).toBe(30);
    act(() => button('Redo layout change').click());
    expect(num('Header height')).toBe(40);
  });

  it('saves the millimetres, which come back when the letterhead is opened again', async () => {
    await open();
    drag(slider('header'), 0, 6);
    act(() => image('logo').click());
    drag(image('logo'), 12, 0);
    const placed = { x: num('From left'), y: num('From top'), width: num('Width'), height: num('Height'), stretch: false };
    await act(async () => button('Save letterhead').click());
    await settle();
    expect(puts[0]).toMatchObject({ headerHeightMm: 36, footerHeightMm: 16, logoBox: placed, headerArtBox: null, footerArtBox: null });

    act(() => root.unmount());
    root = createRoot(container);
    await open();
    expect(slider('header').getAttribute('aria-valuenow')).toBe('36');
    act(() => image('logo').click());
    expect({ x: num('From left'), y: num('From top'), width: num('Width'), height: num('Height'), stretch: false }).toEqual(placed);
    expect(image('logo').getAttribute('aria-label')).not.toContain('automatically');
  });

  it('lets the page scroll normally, and keeps the settings in tabs that follow what is being edited', async () => {
    await open();
    // No inner vertical scroll area or sticky pane to trap the mouse wheel.
    expect(container.querySelector('.sticky, [class*="max-h-["], [class*="overflow-auto"], [class*="overflow-y"]')).toBeNull();
    const tab = (name: string) => [...container.querySelectorAll('[role=tab]')].find((t) => t.textContent === name) as HTMLButtonElement;
    expect(tab('Layout').getAttribute('aria-selected')).toBe('true');
    act(() => tab('Company details').click());
    expect(byLabel('Company name').closest('[role=tabpanel]')?.hasAttribute('hidden')).toBe(false);
    expect(byLabel('Header height').closest('[role=tabpanel]')?.hasAttribute('hidden')).toBe(true);
    act(() => image('logo').click());
    expect(tab('Layout').getAttribute('aria-selected')).toBe('true');

    setValue(byLabel('Company name') as HTMLInputElement, ' ');
    await act(async () => button('Save letterhead').click());
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Enter the company name.');
    expect(tab('Company details').getAttribute('aria-selected')).toBe('true');
    expect(puts).toHaveLength(0);
  });

  it('leaves an existing letterhead’s automatic layout alone when only its details change', async () => {
    await open();
    setValue(byLabel('Company name'), 'Acme Renamed Pvt Ltd');
    await act(async () => button('Save letterhead').click());
    await settle();
    expect(puts[0]).toMatchObject({ companyName: 'Acme Renamed Pvt Ltd', headerHeightMm: 30, footerHeightMm: 16, logoBox: null, headerArtBox: null, footerArtBox: null });
  });
});
