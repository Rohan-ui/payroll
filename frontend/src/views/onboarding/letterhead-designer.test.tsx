import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The letterhead designer through the real screen (API stubbed): the footer
 * drags like the header at any zoom, the logo turns and locks, watermarks are
 * added, styled, copied, laid out in a grid, layered, hidden and deleted, the
 * logo is removed only after confirming, and saving sends millimetres,
 * degrees and opacity that come back the same on reloading.
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
  logoPosition: 'LEFT', headerHeightMm: 30, footerHeightMm: 16, placement: null, hiddenImages: [], lockedImages: [], elements: [], logoBox: null, headerArtBox: null, footerArtBox: null,
  isDefault: true, isArchived: false, images: { logo: true, header: false, footer: true }, updatedAt: '2026-10-01T00:00:00Z',
};

let stored: Record<string, unknown>;
let calls: { url: string; method: string; body: unknown }[];
let container: HTMLDivElement;
let root: Root;
const puts = () => calls.filter((c) => c.method === 'PUT').map((c) => c.body as Record<string, unknown>);

beforeEach(() => {
  stored = { ...LETTERHEAD };
  calls = [];
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      if (url === '/api/v1/onboarding/letterheads/l1' && method === 'PUT') {
        // The server gives every element its own id.
        stored = { ...stored, ...body, elements: body.elements.map((e: object, i: number) => ({ ...e, id: `e${i + 1}` })), updatedAt: '2026-10-02T00:00:00Z' };
        return json({ success: true, data: stored });
      }
      if (url === '/api/v1/onboarding/letterheads') return json({ success: true, data: [stored] });
      if (url.endsWith('/images/logo') && method === 'DELETE') {
        stored = { ...stored, images: { logo: false, header: false, footer: true } };
        return json({ success: true, data: stored });
      }
      if (url.endsWith('/images/logo')) return new Response(png(400, 100), { status: 200 });
      if (url.endsWith('/images/footer')) return new Response(png(1200, 90), { status: 200 });
      if (url === '/api/v1/onboarding/letterheads/l1/assets' && method === 'POST') return json({ success: true, data: { id: 'a1', widthPx: 200, heightPx: 100 } }, 201);
      if (url.endsWith('/assets/a1')) return new Response(png(200, 100), { status: 200 });
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
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement;
const byLabel = (text: string) => {
  const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement;
};
const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
/** A checkbox inside its label. */
const checkbox = (text: string) => [...container.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text))?.querySelector('input') as HTMLInputElement;
const slider = (which: 'header' | 'footer') => container.querySelector(`[data-boundary=${which}]`) as HTMLElement;
const object = (key: string) => container.querySelector(`[data-object="${key}"]`) as HTMLButtonElement;
const objects = () => [...container.querySelectorAll<HTMLButtonElement>('[data-object]')].filter((o) => o.dataset.object !== 'logo' && o.dataset.object !== 'footer');
const wrapper = (o: Element) => o.parentElement as HTMLElement;
const num = (label: string) => Number(byLabel(label).value);
const tab = (name: string) => [...container.querySelectorAll('[role=tab]')].find((t) => t.textContent === name) as HTMLButtonElement;
const key = (el: Element, k: string, extra: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra })); });

const PPM = 96 / 25.4;
const pointer = (type: string, target: EventTarget, x: number, y: number, extra: MouseEventInit = {}) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra })); });
/** Presses on an element and moves it by (dx, dy) millimetres of the page, at a zoom. */
const drag = (el: Element, dxMm: number, dyMm: number, zoom = 1) => {
  pointer('pointerdown', el, 200, 200);
  pointer('pointermove', window, 200 + dxMm * PPM * zoom, 200 + dyMm * PPM * zoom);
  pointer('pointerup', window, 200 + dxMm * PPM * zoom, 200 + dyMm * PPM * zoom);
};

async function open(zoomPercent = 100) {
  await act(async () => root.render(<LetterheadsView />));
  await settle();
  act(() => button('Official').click());
  await settle();
  const zoom = () => Number(container.querySelector('output')?.textContent?.replace('%', ''));
  while (zoom() < zoomPercent) act(() => button('Zoom in').click());
  while (zoom() > zoomPercent) act(() => button('Zoom out').click());
}
async function reopen() {
  act(() => root.unmount());
  root = createRoot(container);
  await open();
}
const addText = () => {
  act(() => tab('Layers').click());
  act(() => button('Add text watermark').click());
};
const save = async () => {
  await act(async () => button('Save letterhead').click());
  await settle();
};

describe('footer', () => {
  it('drags like the header, the number and the page in step, the letter text giving way', async () => {
    await open();
    const body = () => parseFloat((container.querySelector('[data-body]') as HTMLElement).style.height);
    const before = body();
    drag(slider('footer'), 0, -14);
    expect(byLabel('Footer height').value).toBe('30');
    expect(slider('footer').getAttribute('aria-valuenow')).toBe('30');
    // The boundary is the footer's top: 297 − 20 − 30 mm, in screen pixels.
    expect(parseFloat(slider('footer').style.top)).toBeCloseTo((297 - 20 - 30) * PPM - 6, 3);
    expect(before - body()).toBeCloseTo(14 * PPM, 3);
    setValue(byLabel('Footer height'), '20');
    expect(parseFloat(slider('footer').style.top)).toBeCloseTo((297 - 20 - 20) * PPM - 6, 3);
    // Never past its limits, so header, text and footer never overlap.
    drag(slider('footer'), 0, -400);
    expect(byLabel('Footer height').value).toBe('50');
    await save();
    expect(puts()[0]).toMatchObject({ footerHeightMm: 50 });
  });

  it.each([50, 150])('moves the same millimetres at %i %% zoom', async (percent) => {
    await open(percent);
    drag(slider('footer'), 0, -10, percent / 100);
    expect(byLabel('Footer height').value).toBe('26');
    act(() => object('logo').click());
    drag(object('logo'), 10, 0, percent / 100);
    expect(num('From left')).toBe(10);
  });
});

describe('logo and artwork', () => {
  it('turn with the round handle or a number, lock, and save their turn', async () => {
    await open();
    act(() => object('logo').click());
    const handle = container.querySelector('[data-rotate]') as HTMLElement;
    // jsdom puts the box's centre at (0, 0): a pointer straight to the right is a quarter turn clockwise.
    pointer('pointerdown', handle, 0, -50);
    pointer('pointermove', window, 100, 0);
    pointer('pointerup', window, 100, 0);
    expect(num('Rotation')).toBe(90);
    expect(wrapper(object('logo')).style.transform).toBe('rotate(90deg)');
    setValue(byLabel('Rotation'), '-30');
    expect(wrapper(object('logo')).style.transform).toBe('rotate(-30deg)');

    act(() => button('Lock').click());
    const left = num('From left');
    drag(object('logo'), 20, 0);
    expect(num('From left')).toBe(left);
    expect(container.querySelector('[data-corner]')).toBeNull();
    expect(byLabel('From left').readOnly).toBe(true);
    await save();
    expect(puts()[0]).toMatchObject({ logoBox: { rotation: -30 }, lockedImages: ['logo'] });
  });

  it('are removed only after confirming, from the Delete key too', async () => {
    await open();
    act(() => object('logo').click());
    key(object('logo'), 'Delete');
    expect(document.body.textContent).toContain('Remove the logo?');
    act(() => button('Keep it').click());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    key(object('logo'), 'Delete');
    await act(async () => button('Remove logo').click());
    await settle();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['/api/v1/onboarding/letterheads/l1/images/logo']);
    expect(object('logo')).toBeNull();
  });

  it('can be hidden from Layers: kept, not printed, and saved so', async () => {
    await open();
    act(() => tab('Layers').click());
    act(() => button('Hide Logo').click());
    expect(object('logo')).toBeNull();
    act(() => button('Show Logo').click());
    expect(object('logo')).not.toBeNull();
    act(() => button('Hide Footer artwork').click());
    await save();
    expect(puts()[0]).toMatchObject({ hiddenImages: ['footer'] });
  });
});

describe('watermarks', () => {
  it('add as text across the page, change look, turn and opacity live, and save and reload the same', async () => {
    await open();
    addText();
    const [mark] = objects();
    expect(mark.textContent).toBe('CONFIDENTIAL');
    expect(tab('Selected').getAttribute('aria-selected')).toBe('true');
    expect([num('From left'), num('From top'), num('Width'), num('Height'), num('Rotation')]).toEqual([25, 133.5, 160, 30, -45]);
    expect(wrapper(mark).style.transform).toBe('rotate(-45deg)');
    expect((mark.firstElementChild as HTMLElement).style.opacity).toBe('0.25');

    setValue(byLabel('Text') as unknown as HTMLTextAreaElement, 'DRAFT');
    setValue(byLabel('Opacity'), '50');
    setValue(byLabel('Rotation'), '30');
    setValue(byLabel('Font size'), '60');
    act(() => checkbox('Italic').click());
    expect(objects()[0].textContent).toBe('DRAFT');
    expect((objects()[0].firstElementChild as HTMLElement).style.opacity).toBe('0.5');
    expect(wrapper(objects()[0]).style.transform).toBe('rotate(30deg)');

    await save();
    const [sent] = puts()[0].elements as Record<string, unknown>[];
    expect(sent).toEqual({
      kind: 'TEXT', x: 25, y: 133.5, width: 160, height: 30, rotation: 30, opacity: 0.5, aboveText: false, hidden: false, locked: false,
      imageId: null, text: 'DRAFT', fontFamily: 'helvetica', fontSizePt: 60, bold: true, italic: true, color: '#64748b', align: 'center',
    });
    await reopen();
    expect(objects().map((o) => o.textContent)).toEqual(['DRAFT']);
    expect(wrapper(objects()[0]).style.transform).toBe('rotate(30deg)');
  });

  it('add from an uploaded image, in its proportions, in the middle of the page', async () => {
    await open();
    act(() => tab('Layers').click());
    const input = container.querySelector('input[aria-label="Add image watermark"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([png(200, 100)], 'seal.png', { type: 'image/png' })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
    expect(calls.some((c) => c.url === '/api/v1/onboarding/letterheads/l1/assets' && c.method === 'POST')).toBe(true);
    expect([num('From left'), num('From top'), num('Width'), num('Height')]).toEqual([65, 128.5, 80, 40]);
    expect(objects()[0].querySelector('img')?.getAttribute('src')).toBe('blob:x');
    // In proportion: a new width sets the height.
    setValue(byLabel('Width'), '120');
    expect(num('Height')).toBe(60);
    await save();
    expect(puts()[0].elements).toEqual([expect.objectContaining({ kind: 'IMAGE', imageId: 'a1', width: 120, height: 60, opacity: 0.25 })]);
  });

  it('copy with an offset, fill a grid of independent copies, and undo', async () => {
    await open();
    addText();
    act(() => button('Duplicate').click());
    expect(objects()).toHaveLength(2);
    expect([num('From left'), num('From top')]).toEqual([30, 138.5]);

    // Too wide to repeat three times across the page: refused with the reason.
    act(() => button('Generate 9 watermarks').click());
    expect(container.textContent).toContain('wider than the page');
    expect(objects()).toHaveLength(2);
    setValue(byLabel('Width'), '40');
    act(() => button('Generate 9 watermarks').click());
    expect(objects()).toHaveLength(10);
    const grid = objects().slice(1).map((o) => [parseFloat(wrapper(o).style.left) / PPM, parseFloat(wrapper(o).style.top) / PPM].map((n) => Math.round(n * 10) / 10));
    // 3 × 40 mm with 20 mm between: 160 mm, centred on 210 mm; rows 3 × 30 mm with 20 mm between, centred on 297 mm.
    expect(grid).toEqual([[25, 83.5], [85, 83.5], [145, 83.5], [25, 133.5], [85, 133.5], [145, 133.5], [25, 183.5], [85, 183.5], [145, 183.5]]);
    // Each copy moves on its own.
    act(() => objects()[5].click());
    key(objects()[5], 'ArrowRight');
    expect(Math.round((parseFloat(wrapper(objects()[5]).style.left) / PPM) * 10) / 10).toBe(86);
    expect(Math.round((parseFloat(wrapper(objects()[4]).style.left) / PPM) * 10) / 10).toBe(25);
    expect(Math.round((parseFloat(wrapper(objects()[6]).style.left) / PPM) * 10) / 10).toBe(145);
    act(() => button('Undo layout change').click());
    act(() => button('Undo layout change').click());
    expect(objects()).toHaveLength(2);
  });

  it('change layer, behind or in front of the letter text, delete with the Delete key, and come back with Undo', async () => {
    await open();
    addText();
    const body = container.querySelector('[data-body]') as HTMLElement;
    const after = (el: Element) => Boolean(body.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(objects()[0])).toBe(false);
    act(() => button('Bring forward').click());
    expect(container.textContent).toContain('In front of the letter text.');
    expect(after(objects()[0])).toBe(true);
    act(() => button('Send to back').click());
    expect(after(objects()[0])).toBe(false);

    key(objects()[0], 'Delete');
    expect(objects()).toHaveLength(0);
    act(() => button('Undo layout change').click());
    expect(objects()).toHaveLength(1);

    act(() => tab('Layers').click());
    const name = 'Text: CONFIDENTIAL';
    act(() => button(`Hide ${name}`).click());
    expect(objects()).toHaveLength(0);
    act(() => button(`Show ${name}`).click());
    act(() => button(`Lock ${name}`).click());
    await save();
    expect(puts()[0].elements).toEqual([expect.objectContaining({ aboveText: false, hidden: false, locked: true })]);
  });

  it('snap to the page centre when dragged near it, unless snapping is off', async () => {
    await open();
    addText();
    // 25 mm from the left and 160 mm wide: its centre is on the page's. Dragged 1 mm, it snaps back.
    drag(objects()[0], 1, 0);
    expect(num('From left')).toBe(25);
    act(() => checkbox('Snap to guides').click());
    drag(objects()[0], 1, 0);
    expect(num('From left')).toBe(26);
  });
});
