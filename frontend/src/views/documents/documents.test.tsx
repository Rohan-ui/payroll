import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LETTER_FORMAT, letter, paragraph, stubLayout, text } from '../../test-support/letterDocument';

/**
 * Documents & letterheads through the real screens (API stubbed): templates
 * of each kind, a quotation template created from its own standard wording
 * with an items table instead of a pay table, and quotations downloaded as a
 * PDF with an approved quotation template.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import('../../test-support/fakePdfjs').fakePdfjs> | null }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: async () => fake.current!.module }));
const { fakePdfjs } = await import('../../test-support/fakePdfjs');
const { DocumentsView } = await import('./DocumentsView');
const { QuotationPdfViewer } = await import('../../components/crm/QuotationPdfViewer');

const row = (id: string, kind: string, name: string, approved = true) => ({ id, kind, name, isArchived: false, approvedVersion: approved ? { id: `${id}v`, number: 1, title: name } : null, draftVersion: approved ? null : { id: `${id}d`, number: 1 } });
const QUOTATION = {
  id: 'q1', kind: 'QUOTATION', name: 'Standard quotation', isArchived: false, format: LETTER_FORMAT,
  placeholders: [{ key: 'quotation_number', description: 'The quotation number' }, { key: 'total_amount', description: 'The total including GST' }],
  versions: [{
    id: 'qv1', number: 1, status: 'DRAFT', title: 'Quotation', body: 'Quotation', format: 'FORMATTED', document: letter(paragraph(text('Quotation'))),
    layout: { letterheadId: null, letterheadName: null, pageSize: 'A4', marginsMm: { top: 20, right: 20, bottom: 20, left: 20 }, showPageNumbers: true }, createdBy: null, approvedBy: null, approvedAt: null, updatedAt: '',
  }],
};

let calls: { url: string; method: string; body: unknown }[];
let quotationTemplates: unknown[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  stubLayout();
  fake.current = fakePdfjs(1);
  granted = new Set(['documents.view', 'documents.templates.manage', 'documents.templates.approve']);
  calls = [];
  quotationTemplates = [{ id: 'q1', name: 'Standard quotation', versionNumber: 1 }];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : null });
    if (url === '/api/v1/documents/templates' && method === 'GET') return json({ success: true, data: [row('o1', 'OFFER_LETTER', 'Standard offer letter'), row('q1', 'QUOTATION', 'Standard quotation', false), row('a1', 'APPRAISAL_LETTER', 'Annual appraisal')] });
    if (url === '/api/v1/documents/templates' && method === 'POST') return json({ success: true, data: QUOTATION }, 201);
    if (url === '/api/v1/documents/templates/q1') return json({ success: true, data: QUOTATION });
    if (url === '/api/v1/documents/letterheads') return json({ success: true, data: [] });
    if (url === '/api/v1/crm/quotations/document-templates') return json({ success: true, data: quotationTemplates });
    if (url.startsWith('/api/v1/crm/quotations/qt1/pdf')) return new Response('%PDF-1.7 fake', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    return json({ success: true, data: [] });
  }));
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
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name || b.title === name) as HTMLButtonElement;
const startsWith = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(name)) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };

describe('Documents & letterheads', () => {
  it('lists templates of every kind, filtered by kind', async () => {
    await render(<DocumentsView />);
    expect(container.textContent).toContain('Standard offer letter');
    expect(container.textContent).toContain('Annual appraisal');
    await click(startsWith('Quotations (1)'));
    expect(container.textContent).toContain('Standard quotation');
    expect(container.textContent).not.toContain('Standard offer letter');
    expect(container.textContent).toContain('Not approved yet');
    await click(startsWith('Appraisal letters (1)'));
    expect(container.textContent).toContain('Annual appraisal');
  });

  it('creates a quotation template from its standard wording, with an items table instead of a pay table', async () => {
    await render(<DocumentsView />);
    await click(startsWith('Quotations'));
    await click(button('New template'));
    const quotation = [...document.querySelectorAll('input[type=radio]')].find((r) => r.closest('label')?.textContent?.startsWith('Quotation')) as HTMLInputElement;
    expect(quotation.checked).toBe(true);
    expect((document.querySelector('[role=dialog] input:not([type=radio])') as HTMLInputElement).value).toBe('Standard quotation');
    await click(button('Create draft'));
    const created = calls.find((c) => c.url === '/api/v1/documents/templates' && c.method === 'POST');
    expect(created?.body).toMatchObject({ kind: 'QUOTATION', name: 'Standard quotation' });
    expect(created?.body).not.toHaveProperty('document');
    expect(button('Insert items table')).toBeDefined();
    expect(button('Insert pay table')).toBeUndefined();
    await click(button('Insert items table'));
    expect(container.querySelector('[data-pay-table]')?.textContent).toContain('Quotation details');
  });

  it('shows only templates to someone who may not create them', async () => {
    granted = new Set(['documents.view']);
    await render(<DocumentsView />);
    expect(button('New template')).toBeUndefined();
    await click(button('Letterheads'));
    expect(button('New letterhead')).toBeUndefined();
  });
});

describe('viewing a quotation', () => {
  const pdfCalls = () => calls.filter((c) => c.url.startsWith('/api/v1/crm/quotations/qt1/pdf')).map((c) => c.url);
  const view = () => render(<QuotationPdfViewer quotationId="qt1" quotationNumber="QT-2026-0042" client="Northwind" onClose={() => undefined} />);

  it('shows the quotation’s PDF, printed with the approved template, with Download', async () => {
    await view();
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Quotation QT-2026-0042');
    expect(pdfCalls()).toEqual(['/api/v1/crm/quotations/qt1/pdf?templateId=q1']);
    expect(container.querySelector('select')).toBeNull();
    expect(button('Download')).toBeDefined();
  });

  it('lets you choose among several templates, and prints with the standard wording when none is approved', async () => {
    quotationTemplates = [{ id: 'q1', name: 'Standard quotation', versionNumber: 1 }, { id: 'q2', name: 'Detailed quotation', versionNumber: 3 }];
    await view();
    const select = document.querySelector('[role=dialog] select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Standard quotation (v1)', 'Detailed quotation (v3)']);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'q2');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(pdfCalls()).toEqual(['/api/v1/crm/quotations/qt1/pdf?templateId=q1', '/api/v1/crm/quotations/qt1/pdf?templateId=q2']);

    act(() => root.unmount());
    root = createRoot(container);
    calls = [];
    quotationTemplates = [];
    await view();
    expect(pdfCalls()).toEqual(['/api/v1/crm/quotations/qt1/pdf']);
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Printed with the standard quotation wording');
  });
});
