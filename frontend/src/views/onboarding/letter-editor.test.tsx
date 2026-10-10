import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { LETTER_FORMAT, heading, letter, paragraph, placeholder, stubLayout, text } from '../../test-support/letterDocument';

/**
 * The offer letter editor through the real template screen (API stubbed): the
 * letter is a page of the template's size, margins and letterhead; formatting
 * applies to exactly what is selected (placeholders included, which stay
 * placeholders); paragraphs and headings are formatted on their own; and the
 * document the editor holds is what is saved and previewed.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import('../../test-support/fakePdfjs').fakePdfjs> | null }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: async () => fake.current!.module }));
const { fakePdfjs } = await import('../../test-support/fakePdfjs');
const { TemplatesView } = await import('./TemplatesView');

const DOCUMENT = letter(
  heading(1, text('Offer of employment: '), placeholder('job_title')),
  paragraph(text('We are pleased to offer you employment with '), placeholder('company_name'), text(' for the position of '), placeholder('job_title'), text('.')),
  paragraph(text('Sincerely,')),
);
const LETTERHEAD = {
  id: 'l1', name: 'Official', companyName: 'Acme Technologies Pvt Ltd', addressText: null, phone: null, email: null, website: null, registrationText: null, footerText: null,
  logoPosition: 'LEFT', headerHeightMm: 30, footerHeightMm: 16, placement: null, hiddenImages: [], lockedImages: [], elements: [], logoBox: null, headerArtBox: null, footerArtBox: null, isDefault: true, isArchived: false,
  images: { logo: false, header: false, footer: false }, updatedAt: '2026-10-01T00:00:00Z',
};
/** A letterhead printed to the edges of the paper. */
const BANNER = { ...LETTERHEAD, id: 'l2', name: 'Banner', isDefault: false, placement: { headerOffsetMm: 0, footerOffsetMm: 0, sideOffsetMm: 0 } };
const TALL = { ...LETTERHEAD, id: 'l3', name: 'Tall', isDefault: false, headerHeightMm: 70, footerHeightMm: 50 };
const version = (extra: Record<string, unknown> = {}) => ({
  id: 'tv1', number: 1, status: 'DRAFT', title: 'Offer of employment: {{job_title}}', body: '', format: 'FORMATTED', document: DOCUMENT,
  layout: { letterheadId: null, letterheadName: null, pageSize: 'A4', marginsMm: { top: 20, right: 20, bottom: 20, left: 20 }, showPageNumbers: true }, createdBy: null, approvedBy: null, approvedAt: null, updatedAt: '', ...extra,
});
const template = (versions = [version()]) => ({
  id: 't1', kind: 'OFFER_LETTER', name: 'Standard offer letter', isArchived: false, format: LETTER_FORMAT,
  placeholders: [{ key: 'candidate_name', description: 'Name' }, { key: 'company_name', description: 'Company' }, { key: 'job_title', description: 'Job' }],
  versions,
});

let calls: { url: string; method: string; body: unknown }[] = [];
let detail: ReturnType<typeof template>;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  stubLayout();
  granted = new Set(['onboarding.view', 'onboarding.templates.manage', 'onboarding.templates.approve']);
  fake.current = fakePdfjs(1);
  calls = [];
  detail = template();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      if (url.endsWith('/preview-pdf')) return new Response('%PDF-1.7 fake', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
      if (url === '/api/v1/onboarding/templates') return json({ success: true, data: [{ id: 't1', kind: 'OFFER_LETTER', name: 'Standard offer letter', isArchived: false, approvedVersion: null, draftVersion: { id: 'tv1', number: 1 } }] });
      if (url === '/api/v1/onboarding/templates/t1/draft') {
        const { document, ...layout } = body;
        detail = template([version({ document, layout: { ...layout, letterheadName: null } })]);
        return json({ success: true, data: detail });
      }
      if (url === '/api/v1/onboarding/templates/t1') return json({ success: true, data: detail });
      if (url === '/api/v1/onboarding/letterheads') return json({ success: true, data: [LETTERHEAD, BANNER, TALL] });
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
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name) as HTMLButtonElement;
const control = (name: string) => container.querySelector(`[aria-label="${name}"]`) as HTMLInputElement & HTMLSelectElement;
const byLabel = (name: string) => {
  const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(name));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement & HTMLSelectElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const click = (name: string) => act(() => button(name).click());

const editor = () => (container.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor;
const json$ = () => editor().getJSON();
/** Selects the first run of text matching, or (with a placeholder key) the nth such placeholder. */
const select = (needle: string) => act(() => {
  let range: { from: number; to: number } | null = null;
  editor().state.doc.descendants((node, pos) => {
    if (range || !node.isText || !node.text?.includes(needle)) return;
    const from = pos + node.text.indexOf(needle);
    range = { from, to: from + needle.length };
  });
  editor().commands.setTextSelection(range!);
});
const selectPlaceholder = (key: string, nth: number) => act(() => {
  const found: number[] = [];
  editor().state.doc.descendants((node, pos) => { if (node.type.name === 'placeholder' && node.attrs.key === key) found.push(pos); });
  editor().commands.setNodeSelection(found[nth]);
});
const cursorIn = (needle: string) => act(() => {
  let at = 0;
  editor().state.doc.descendants((node, pos) => { if (!at && node.isText && node.text?.includes(needle)) at = pos + 1; });
  editor().commands.setTextSelection(at);
});
const size = (n: number) => ({ type: 'textStyle', attrs: { fontFamily: null, fontSize: n, color: null, backgroundColor: null } });

async function open() {
  await act(async () => root.render(<TemplatesView />));
  await settle();
  act(() => [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Standard offer letter'))!.click());
  await settle();
}

describe('offer letter editor', () => {
  it('shows the letter on a page of the template’s size, margins and letterhead, zoomed on screen only', async () => {
    await open();
    const page = () => container.querySelector('[data-letter-page]') as HTMLElement;
    expect([page().style.width, page().style.minHeight]).toEqual(['210mm', '297mm']);
    const content = () => [...page().children].find((c) => (c as HTMLElement).style.paddingTop) as HTMLElement;
    const padding = () => ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((k) => parseFloat(content().style[k as 'paddingTop']));
    expect(padding()).toEqual([20, 20, 20, 20]);

    setValue(byLabel('Zoom'), '1.5');
    expect((page().parentElement as HTMLElement).style.zoom).toBe('1.5');
    expect(page().style.width).toBe('210mm');
    expect(container.textContent).toContain('All changes saved');

    setValue(byLabel('Page size'), 'LETTER');
    setValue(byLabel('Top'), '30');
    setValue(byLabel('Right'), '10');
    setValue(byLabel('Bottom'), '0');
    setValue(byLabel('Left'), '35');
    expect(page().style.width).toBe('215.9mm');
    expect(padding()).toEqual([30, 10, 0, 35]);

    // A letterhead takes its header and footer; the letter starts below the header, as in the PDF.
    setValue(byLabel('Letterhead'), 'l1');
    await settle();
    const pt = 25.4 / 72;
    const [top, right, bottom, left] = padding();
    expect([right, left]).toEqual([10, 35]);
    expect(top).toBeCloseTo(30 + 30 + 12 * pt, 3);
    expect(bottom).toBeCloseTo(0 + 16 + 8 * pt, 3);
    expect(page().textContent).toContain('Acme Technologies Pvt Ltd');

    // Placed from the paper's edges, the header sits at the very top: the text starts below it, or lower when the top margin says so.
    setValue(byLabel('Letterhead'), 'l2');
    await settle();
    setValue(byLabel('Top'), '0');
    expect(padding()[0]).toBeCloseTo(30 + 12 * pt, 3);
    setValue(byLabel('Top'), '45');
    expect(padding()[0]).toBe(45);
    expect(container.textContent).not.toContain('needs at least');
    // Margins that leave the text too little room are flagged before the PDF refuses them.
    setValue(byLabel('Letterhead'), 'l3');
    await settle();
    setValue(byLabel('Top'), '60');
    setValue(byLabel('Bottom'), '60');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('it needs at least 60 mm');

    setValue(byLabel('Letterhead'), '');
    expect(padding()).toEqual([60, 10, 60, 35]);
  });

  it('formats only the selected words, and placeholders without making them text', async () => {
    await open();
    select('pleased to offer you');
    click('Bold');
    click('Italic');
    setValue(control('Font size (pt)'), '13');
    expect(button('Bold').getAttribute('aria-pressed')).toBe('true');
    expect(control('Font size (pt)').value).toBe('13');

    selectPlaceholder('job_title', 1);
    click('Bold');
    setValue(control('Font size (pt)'), '12');
    setValue(control('Font'), 'times');

    const [title, body] = json$().content!;
    expect(body.content).toEqual([
      { type: 'text', text: 'We are ' },
      // Marks are kept in the schema's order: the text style first.
      { type: 'text', text: 'pleased to offer you', marks: [size(13), { type: 'bold' }, { type: 'italic' }] },
      { type: 'text', text: ' employment with ' },
      { type: 'placeholder', attrs: { key: 'company_name' } },
      { type: 'text', text: ' for the position of ' },
      { type: 'placeholder', attrs: { key: 'job_title' }, marks: [{ type: 'textStyle', attrs: { fontFamily: 'times', fontSize: 12, color: null, backgroundColor: null } }, { type: 'bold' }] },
      { type: 'text', text: '.' },
    ]);
    // The heading's placeholder is untouched.
    expect(title.content![1]).toEqual({ type: 'placeholder', attrs: { key: 'job_title' } });

    select('employment with');
    click('Underline');
    setValue(control('Text colour'), '#c00000');
    const run = (t: string) => (json$().content![1].content as { text?: string }[]).find((n) => n.text?.includes(t));
    expect(run('employment with')).toEqual({ type: 'text', text: 'employment with', marks: [{ type: 'textStyle', attrs: { fontFamily: null, fontSize: null, color: '#c00000', backgroundColor: null } }, { type: 'underline' }] });
    expect(run('We are')).toEqual({ type: 'text', text: 'We are ' });

    click('Undo');
    click('Undo');
    expect(run('employment with')).toEqual({ type: 'text', text: ' employment with ' });
  });

  it('formats headings and paragraphs each on their own', async () => {
    await open();
    cursorIn('Offer of employment');
    expect(control('Paragraph style').value).toBe('1');
    expect(control('Font size (pt)').value).toBe('20');
    click('Centre');
    expect(button('Centre').getAttribute('aria-pressed')).toBe('true');

    cursorIn('pleased');
    expect(button('Align left').getAttribute('aria-pressed')).toBe('true');
    click('Justify');
    setValue(control('Line height'), '1.5');
    setValue(control('Space before paragraph (pt)'), '12');
    setValue(control('Space after paragraph (pt)'), '18');

    cursorIn('Sincerely');
    setValue(control('Paragraph style'), '4');
    click('Align right');

    const [title, body, closing] = json$().content!;
    expect(title.attrs).toMatchObject({ level: 1, textAlign: 'center', lineHeight: null });
    expect(body.attrs).toMatchObject({ textAlign: 'justify', lineHeight: 1.5, spaceBefore: 12, spaceAfter: 18 });
    expect(closing).toMatchObject({ type: 'heading', attrs: { level: 4, textAlign: 'right' } });
  });

  it('adds lists, dividers and the pay table, which goes in once', async () => {
    await open();
    cursorIn('Sincerely');
    click('Bulleted list');
    expect(json$().content![2]).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem' }] });
    click('Numbered list');
    expect(json$().content![2].type).toBe('orderedList');
    click('Insert pay table');
    // It goes after the list, never inside it (an empty paragraph follows, to write after it).
    expect(json$().content!.map((n) => n.type)).toEqual(['heading', 'paragraph', 'orderedList', 'compensationTable', 'paragraph']);
    expect(button('The pay table is already in the letter').disabled).toBe(true);
  });

  it('inserts a placeholder where the cursor is', async () => {
    await open();
    act(() => { editor().commands.setTextSelection(editor().state.doc.content.size - 1); });
    act(() => [...container.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Placeholders')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    click('{{candidate_name}} Name');
    expect(json$().content![2].content).toEqual([{ type: 'text', text: 'Sincerely,' }, { type: 'placeholder', attrs: { key: 'candidate_name' } }]);
  });

  it('saves the document with its layout, says when changes are unsaved, and asks before leaving them', async () => {
    await open();
    expect(container.textContent).toContain('All changes saved');
    expect(button('Save draft').disabled).toBe(true);
    select('Sincerely');
    click('Bold');
    expect(container.textContent).toContain('Unsaved changes');
    expect(button('Approve draft v1').disabled).toBe(true);

    click('Back to templates');
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Leave without saving?');
    click('Keep editing');
    expect(document.querySelector('[role=dialog]')).toBeNull();

    const edited = json$();
    await act(async () => button('Save draft').click());
    await settle();
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ document: edited, letterheadId: null, pageSize: 'A4', marginsMm: { top: 20, right: 20, bottom: 20, left: 20 }, showPageNumbers: true });
    expect(container.textContent).toContain('All changes saved');
    expect(button('Approve draft v1').disabled).toBe(false);
    // The editor still has the saved letter, formatting and all.
    expect(json$()).toEqual(edited);
  });

  it('previews the PDF from the same document the editor has', async () => {
    await open();
    select('pleased to offer you');
    click('Bold');
    await act(async () => button('Preview PDF').click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/templates/preview-pdf'))?.body).toEqual({ kind: 'OFFER_LETTER', document: json$(), letterheadId: null, pageSize: 'A4', marginsMm: { top: 20, right: 20, bottom: 20, left: 20 }, showPageNumbers: true });
    expect(document.querySelector('[role=dialog][aria-modal=true]')?.textContent).toContain('Sample preview');
  });

  it('opens plain-text versions as a page, saying how they print', async () => {
    detail = template([version({ format: 'PLAIN', status: 'APPROVED' })]);
    await open();
    expect(container.textContent).toContain('Version 1 was written as plain text.');
    expect(button('Save as new draft')).toBeDefined();
  });

  it('is read-only for members who can’t edit templates', async () => {
    granted = new Set(['onboarding.view']);
    await open();
    expect(container.textContent).toContain('Read only');
    expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false');
    expect(button('Bold')).toBeUndefined();
  });
});
