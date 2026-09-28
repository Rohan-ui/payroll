import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuotationsManager from './QuotationsManager';
import { formatPaise, quotationTotals } from './QuotationBuilder';

/**
 * Quotations (API stubbed; the screens are the real ones): creating and
 * editing happen in the app, never by navigating to a page that does not exist.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const DRAFT = {
  id: 'q-draft', quotation_number: 'QT-2026-000001', lead_id: 'lead-1', status: 'DRAFT', quotation_status: 'DRAFT', tax_mode: 'INTER_STATE',
  lead_company_name: 'Acme Corp', contact_person: 'Asha Rao', subtotal: '751.50', total_tax: '135.27', total_amount: 886.77, valid_until: '2026-10-28',
  notes: 'Phase 1', items: [{ id: 'i1', description: 'Audit and report', sac_code: '998314', quantity: '3', unit_rate: '250.5', line_amount: '751.50', sort_order: 1 }],
};
const SENT = { ...DRAFT, id: 'q-sent', quotation_number: 'QT-2026-000002', status: 'SENT', quotation_status: 'SENT', tax_mode: 'INTRA_STATE' };
const TEMPLATE = { id: 't1', template_name: 'Website package', items_json: [{ service_name: 'Design', sac_code: '998314', qty: 2, unit_rate: 1000.1 }, { service_name: 'Hosting', qty: 1, unit_rate: 0.33 }] };
const LEADS = [
  { id: 'lead-1', company_name: 'Acme Corp', first_name: 'Asha', last_name: 'Rao', lead_code: 'LD-1' },
  { id: 'lead-2', company_name: 'Beta Ltd', first_name: 'Ravi', lead_code: 'LD-2' },
];

let calls: { url: string; method: string; body: any }[] = [];
let saveReply: () => Response;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  saveReply = () => json({ success: true, data: { id: 'q-new' }, message: 'Quotation created' }, 201);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (method !== 'GET') return saveReply();
      if (url.startsWith('/api/v1/crm/quotations?')) return json({ success: true, data: [DRAFT, SENT], pagination: { total: 2, totalPages: 1 } });
      if (url === '/api/v1/crm/quotation-templates') return json({ success: true, data: [TEMPLATE] });
      if (url.startsWith('/api/v1/crm/leads?')) {
        const search = new URL(url, 'http://x').searchParams.get('search') ?? '';
        return json({ success: true, data: { leads: LEADS.filter((l) => l.company_name.toLowerCase().includes(search.toLowerCase())) } });
      }
      if (url === '/api/v1/crm/leads/lead-2') return json({ success: true, data: LEADS[1] });
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

const settle = (ms = 0) =>
  act(async () => {
    if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(text)) as HTMLButtonElement | undefined;
const byLabel = (text: string) => {
  const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement | HTMLSelectElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
const render = async (props: Record<string, unknown> = {}) => {
  await act(async () => root.render(<QuotationsManager leads={[]} services={[{ id: 'srv-1', name: 'SEO retainer', sac_code: '998365', default_rate: '15000.00' }]} onRefreshParent={() => undefined} {...props} />));
  await settle();
};
const posts = () => calls.filter((c) => c.method === 'POST');

describe('quotation totals preview', () => {
  it('gives the same amounts the server saves', () => {
    const intra = quotationTotals([{ quantity: '2', unitRate: '1000.10' }, { quantity: '1', unitRate: '0.33' }], 'INTRA_STATE');
    expect([intra.subtotal, intra.cgst, intra.sgst, intra.total].map(formatPaise)).toEqual(['₹2,000.53', '₹180.05', '₹180.05', '₹2,360.63']);
    const inter = quotationTotals([{ quantity: '3', unitRate: '250.50' }], 'INTER_STATE');
    expect([inter.subtotal, inter.igst, inter.total].map(formatPaise)).toEqual(['₹751.50', '₹135.27', '₹886.77']);
    expect(formatPaise(quotationTotals([{ quantity: '3', unitRate: '250.50' }], 'INTRA_STATE').total)).toBe('₹886.78');
    expect(quotationTotals([{ quantity: 'abc', unitRate: '10' }], 'INTRA_STATE').lines).toEqual([null]);
  });
});

describe('Quotations', () => {
  it('lists quotations with their lead, GST type and tax, and previews their lines', async () => {
    await render();
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('Acme Corp');
    expect(rows[0]).toContain('Asha Rao');
    expect(rows[0]).toContain('IGST (18%)');
    expect(rows[1]).toContain('CGST+SGST');
    act(() => button('QT-2026-000001')?.click());
    expect(container.textContent).toContain('Audit and report');
    expect(container.textContent).toContain('751.50');
    expect(container.textContent).toContain('Phase 1');
  });

  it('creates a quotation in the app: lead search, template lines, live totals, then back to the list', async () => {
    const href = window.location.href;
    await render();
    act(() => button('Create Quotation')?.click());
    expect(container.querySelector('h3')?.textContent).toBe('New quotation');
    expect(window.location.href).toBe(href);

    // Saving with nothing chosen explains what is missing and sends nothing.
    await act(async () => button('Save quotation')?.click());
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Choose the lead this quotation is for.');
    expect(posts()).toHaveLength(0);

    setValue(byLabel('Find a lead'), 'beta');
    await settle(300);
    expect([...(byLabel('Lead *') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Choose a lead', 'Beta Ltd — Ravi (LD-2)']);
    setValue(byLabel('Lead *'), 'lead-2');
    setValue(byLabel('Start from a template'), 't1');
    act(() => button('Use template lines')?.click());
    expect((byLabel('Description *') as HTMLInputElement).value).toBe('Design');
    expect(container.querySelector('[data-quotation-total]')?.textContent).toBe('₹2,360.63');

    await act(async () => button('Save quotation')?.click());
    await settle();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({
      url: '/api/v1/crm/quotations',
      body: {
        leadId: 'lead-2',
        taxMode: 'INTRA_STATE',
        validDays: 30,
        items: [
          { description: 'Design', sacCode: '998314', quantity: '2', unitRate: '1000.1' },
          { description: 'Hosting', quantity: '1', unitRate: '0.33' },
        ],
      },
    });
    expect(container.querySelector('h3')?.textContent).toBe('Quotations');
  });

  it('keeps the page open with the server’s reason when saving is refused', async () => {
    saveReply = () => json({ statusCode: 400, message: 'Line 1: enter the quantity as a number.' }, 400);
    await render({ initialLeadId: 'lead-2', autoOpenCreate: true, onCloseCreate: () => undefined });
    await settle(300);
    // Opened from a lead: that lead is already chosen.
    expect(byLabel('Lead *').value).toBe('lead-2');
    setValue(byLabel('Service'), 'srv-1');
    expect((byLabel('Rate (₹) *') as HTMLInputElement).value).toBe('15000.00');
    await act(async () => button('Save quotation')?.click());
    await settle();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Line 1: enter the quantity as a number.');
    expect(container.querySelector('h3')?.textContent).toBe('New quotation');
  });

  it('edits only draft quotations, with their lines loaded', async () => {
    await render();
    const menuOf = (number: string) => [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes(number))!.querySelector('button[title="Actions"]') as HTMLButtonElement;
    act(() => menuOf('QT-2026-000002').click());
    expect(button('Edit Quotation')).toBeUndefined();
    act(() => menuOf('QT-2026-000002').click());

    act(() => menuOf('QT-2026-000001').click());
    act(() => button('Edit Quotation')?.click());
    expect(container.querySelector('h3')?.textContent).toBe('Edit quotation QT-2026-000001');
    expect((byLabel('Description *') as HTMLInputElement).value).toBe('Audit and report');
    expect(container.querySelector('[data-quotation-total]')?.textContent).toBe('₹886.77');
    setValue(byLabel('Qty *'), '4');
    await act(async () => button('Save changes')?.click());
    await settle();
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe('/api/v1/crm/quotations/q-draft');
    expect(puts[0].body).toMatchObject({ taxMode: 'INTER_STATE', items: [{ description: 'Audit and report', quantity: '4', unitRate: '250.5' }] });
    expect(puts[0].body.leadId).toBeUndefined();
    expect(puts[0].body.validDays).toBeUndefined();
  });
});
