import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePdfjs } from '../../test-support/fakePdfjs';

/**
 * The PDF viewer with pdf.js replaced by a stand-in (jsdom can't draw): a
 * large in-app view, zoom, fitting, page navigation, keys, full screen, and a
 * download only when asked.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import('../../test-support/fakePdfjs').fakePdfjs> | null }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: async () => fake.current!.module }));

const { PdfViewer } = await import('./PdfViewer');

const PDF_BYTES = new TextEncoder().encode('%PDF-1.7 fake').buffer;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fake.current = fakePdfjs(3);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const settle = () => act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
const dialog = () => document.querySelector('[role=dialog]') as HTMLElement;
const byLabel = (label: string) => dialog().querySelector(`[aria-label="${label}"]`) as HTMLElement;
const button = (text: string) => [...dialog().querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const zoomText = () => dialog().querySelector('output')?.textContent;
const pageInput = () => byLabel('Page number') as HTMLInputElement;
const key = (k: string) => act(() => { dialog().querySelector('[aria-label="Document pages"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

async function open(props: Partial<React.ComponentProps<typeof PdfViewer>> = {}) {
  const onClose = vi.fn();
  const load = vi.fn(async () => PDF_BYTES);
  await act(async () => root.render(<PdfViewer title="Offer OFR-1" description="Backend Engineer" load={load} downloadName="OFR-1.pdf" onClose={onClose} {...props} />));
  await settle();
  return { onClose, load };
}

describe('PDF viewer', () => {
  it('opens as a large view inside the app, drawing every page of the document', async () => {
    await open();
    const panel = dialog();
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.parentElement?.className).toContain('fixed inset-0');
    expect(panel.className).toContain('h-full');
    expect(panel.querySelector('h2')?.textContent).toBe('Offer OFR-1');
    expect(panel.textContent).toContain('/ 3');
    expect(panel.querySelectorAll('[data-page]')).toHaveLength(3);
    expect(fake.current!.drawn.sort()).toEqual([1, 2, 3]);
    expect(panel.querySelectorAll('canvas[role=img]')).toHaveLength(3);
    expect(panel.querySelector('canvas')?.getAttribute('aria-label')).toBe('Page 1 of 3');
    expect(panel.querySelector('iframe, embed, object')).toBeNull();
  });

  it('zooms in and out in steps, and shows the zoom as a percentage', async () => {
    await open();
    // Opens fitted to the width (jsdom has no layout: 800 px wide), never above 125%.
    expect(zoomText()).toBe('94%');
    act(() => byLabel('Zoom in').click());
    expect(zoomText()).toBe('100%');
    act(() => byLabel('Zoom in').click());
    expect(zoomText()).toBe('110%');
    act(() => byLabel('Zoom out').click());
    act(() => byLabel('Zoom out').click());
    expect(zoomText()).toBe('90%');
    const page = dialog().querySelector('[data-page="1"]') as HTMLElement;
    expect(page.style.width).toBe(`${612 * 0.9 * (96 / 72)}px`);
  });

  it('fits to the width, to the page, and shows the actual size', async () => {
    await open();
    act(() => button('Fit page').click());
    expect(zoomText()).toBe('54%');
    expect(button('Fit page').getAttribute('aria-pressed')).toBe('true');
    act(() => byLabel('Actual size').click());
    expect(zoomText()).toBe('100%');
    expect(button('Fit page').getAttribute('aria-pressed')).toBe('false');
    act(() => button('Fit width').click());
    expect(zoomText()).toBe('94%');
    expect(button('Fit width').getAttribute('aria-pressed')).toBe('true');
  });

  it('moves between pages with the buttons, the page number and the keys', async () => {
    const { onClose } = await open();
    expect((byLabel('Previous page') as HTMLButtonElement).disabled).toBe(true);
    act(() => byLabel('Next page').click());
    expect(pageInput().value).toBe('2');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(pageInput(), '3');
      pageInput().dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { pageInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(pageInput().value).toBe('3');
    expect((byLabel('Next page') as HTMLButtonElement).disabled).toBe(true);
    key('Home');
    expect(pageInput().value).toBe('1');
    key('ArrowRight');
    expect(pageInput().value).toBe('2');
    key('+');
    expect(zoomText()).toBe('100%');
    key('0');
    expect(zoomText()).toBe('100%');
    key('-');
    expect(zoomText()).toBe('90%');
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('goes full screen on request, and closes with the close button', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: request, configurable: true });
    try {
      const { onClose } = await open();
      act(() => byLabel('Full screen').click());
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.contexts[0]).toBe(dialog());
      act(() => byLabel('Close').click());
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
      delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
    }
  });

  it('downloads only when Download is clicked, under the given name', async () => {
    const createUrl = vi.fn(() => 'blob:pdf');
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('OFR-1.pdf');
    });
    await open();
    act(() => byLabel('Zoom in').click());
    act(() => byLabel('Next page').click());
    expect(clicks).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
    act(() => button('Download').click());
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalledTimes(1);
    act(() => byLabel('Close').click());
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('offers no download when none is given', async () => {
    await open({ downloadName: undefined });
    expect(button('Download')).toBeUndefined();
  });

  it('shows loading, then an error with the reason, and tries again on request', async () => {
    let fail = true;
    let release: (() => void) | null = null;
    const load = vi.fn(
      () =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          release = () => (fail ? reject(new Error('Offer not found.')) : resolve(PDF_BYTES));
        }),
    );
    await act(async () => root.render(<PdfViewer title="Offer" load={load} onClose={() => undefined} />));
    expect(dialog().querySelector('[role=status]')?.textContent).toBe('Loading the PDF…');
    await act(async () => release!());
    await settle();
    expect(dialog().querySelector('[role=alert]')?.textContent).toContain('Offer not found.');
    fail = false;
    act(() => button('Try again').click());
    await act(async () => release!());
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(dialog().querySelector('[role=alert]')).toBeNull();
    expect(dialog().querySelectorAll('[data-page]')).toHaveLength(3);
  });

  it('says so when the file is not a PDF', async () => {
    await open({ load: async () => new ArrayBuffer(0) });
    expect(dialog().querySelector('[role=alert]')?.textContent).toContain('This file could not be read as a PDF.');
  });

  it('releases the document and restores the page when closed', async () => {
    document.body.style.overflow = 'auto';
    await open();
    expect(document.body.style.overflow).toBe('hidden');
    act(() => root.unmount());
    root = createRoot(container);
    await settle();
    expect(fake.current!.destroyed.count).toBe(1);
    expect(document.body.style.overflow).toBe('auto');
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
});
