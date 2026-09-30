import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Letterheads, template layouts and previews through the real screens (API
 * stubbed, pdf.js replaced): previews open in the in-app viewer from the
 * current, unsaved values, never download on their own, and change nothing.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import('../../test-support/fakePdfjs').fakePdfjs> | null }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: async () => fake.current!.module }));
const { fakePdfjs } = await import('../../test-support/fakePdfjs');

const { LetterheadsView, imageProblem } = await import('./LetterheadsView');
const { TemplatesView } = await import('./TemplatesView');
const { OfferEditor } = await import('./OfferEditor');
const { OfferDetailView } = await import('./OfferDetailView');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const pdf = () => new Response('%PDF-1.7 fake', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
const LETTERHEAD = {
  id: 'l1', name: 'Official', companyName: 'Acme Technologies Pvt Ltd', addressText: 'Pune', phone: null, email: null, website: null, registrationText: null, footerText: null,
  logoPosition: 'LEFT', headerHeightMm: 30, footerHeightMm: 16, isDefault: true, isArchived: false, images: { logo: false, header: false, footer: false }, updatedAt: '2026-10-01T00:00:00Z',
};
const TEMPLATE = {
  id: 't1', kind: 'OFFER_LETTER', name: 'Standard', isArchived: false, placeholders: [{ key: 'candidate_name', description: 'Name' }],
  versions: [{ id: 'tv1', number: 1, status: 'DRAFT', title: 'Offer', body: 'Dear {{candidate_name}},', layout: { letterheadId: 'l1', letterheadName: 'Official', pageSize: 'A4', marginMm: 20, showPageNumbers: true }, createdBy: null, approvedBy: null, approvedAt: null, updatedAt: '' }],
};
const OFFER = {
  id: 'o1', offerCode: 'OFR-2026-100001', status: 'DRAFT', candidate: { id: 'c1', name: 'Priya Rao', code: 'CAN', email: 'p@x.test', status: 'SELECTED' }, templateVersionId: 'tv2', templateName: 'Standard', templateVersion: 2,
  reportingManagerName: null, jobTitle: 'Backend Engineer', departmentId: null, designationId: null, employmentTypeId: null, reportingManagerEmployeeId: null, workLocation: null,
  components: [{ label: 'Basic', annualAmount: '900000.00' }], annualCtc: '900000.00', probationMonths: null, joiningDate: '2026-11-01', expiresOn: '2026-10-15', specialTerms: null,
  letter: { title: 'Offer', body: 'Dear Priya' }, letterIsFinal: false, approvals: [], submissionNumber: 0, awaitingMe: false, submittedAt: null, approvedAt: null, sentAt: null, sentBy: null,
  respondedAt: null, acceptedName: null, declineReason: null, withdrawnReason: null, hasPdf: false,
};

let calls: { url: string; method: string; body: unknown }[] = [];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['onboarding.view', 'onboarding.templates.manage', 'onboarding.templates.approve', 'onboarding.offers.manage']);
  fake.current = fakePdfjs(2);
  calls = [];
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null });
      if (url.endsWith('/preview-pdf') || url.endsWith('/pdf')) return pdf();
      if (url === '/api/v1/onboarding/letterheads' && method === 'POST') return json({ success: true, data: { ...LETTERHEAD, id: 'l2', name: 'Formal', isDefault: false } }, 201);
      if (url === '/api/v1/onboarding/letterheads') return json({ success: true, data: [LETTERHEAD] });
      if (url.includes('/letterheads/l2/images/logo') && method === 'POST') return json({ success: true, data: { ...LETTERHEAD, id: 'l2', images: { logo: true, header: false, footer: false } } }, 201);
      if (url.includes('/images/')) return new Response(new Uint8Array([0x89, 0x50]), { status: 200 });
      if (url === '/api/v1/onboarding/templates') return json({ success: true, data: [{ id: 't1', kind: 'OFFER_LETTER', name: 'Standard', isArchived: false, approvedVersion: null, draftVersion: { id: 'tv1', number: 1 } }] });
      if (url === '/api/v1/onboarding/templates/t1') return json({ success: true, data: TEMPLATE });
      if (url === '/api/v1/onboarding/templates/t1/draft') return json({ success: true, data: TEMPLATE });
      if (url.startsWith('/api/v1/onboarding/templates?kind=OFFER_LETTER')) return json({ success: true, data: [{ id: 't1', kind: 'OFFER_LETTER', name: 'Standard', isArchived: false, approvedVersion: { id: 'tv2', number: 2, title: 'Offer' }, draftVersion: null }] });
      if (url === '/api/v1/onboarding/offers/o1') return json({ success: true, data: OFFER });
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

const settle = (ms = 0) => act(async () => { if (ms) await new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const viewer = () => document.querySelector('[role=dialog][aria-modal=true]') as HTMLElement | null;
const downloads = () => vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

describe('letterheads', () => {
  it('refuses images that are not PNG or JPEG, or over 2 MB, before uploading', () => {
    expect(imageProblem(new File(['x'], 'logo.png', { type: 'image/png' }))).toBeNull();
    expect(imageProblem(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))).toBe('Choose a PNG or JPEG image.');
    expect(imageProblem(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }))).toBe('That image is larger than 2 MB. Upload a smaller copy.');
  });

  it('creates a letterhead, then takes its logo, and previews unsaved changes in the viewer', async () => {
    const clicks = downloads();
    await act(async () => root.render(<LetterheadsView />));
    await settle();
    expect(container.textContent).toContain('Official');
    act(() => button('New letterhead')?.click());
    expect(container.textContent).toContain('Create the letterhead first, then add its logo or artwork.');
    setValue(byLabel('Letterhead name'), 'Formal');
    await act(async () => button('Create letterhead')?.click());
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Enter the company name.');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    setValue(byLabel('Company name'), 'Acme Technologies Pvt Ltd');
    await act(async () => button('Create letterhead')?.click());
    await settle();
    expect(calls.find((c) => c.url === '/api/v1/onboarding/letterheads' && c.method === 'POST')?.body).toMatchObject({ name: 'Formal', companyName: 'Acme Technologies Pvt Ltd', logoPosition: 'LEFT', headerHeightMm: 30 });

    const logo = container.querySelector('input[aria-label="Upload logo"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(logo, 'files', { value: [new File([new Uint8Array(3 * 1024 * 1024)], 'huge.png', { type: 'image/png' })], configurable: true });
      logo.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('That image is larger than 2 MB.');
    expect(calls.some((c) => c.url.includes('/images/logo') && c.method === 'POST')).toBe(false);
    await act(async () => {
      Object.defineProperty(logo, 'files', { value: [new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' })], configurable: true });
      logo.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect((calls.find((c) => c.url === '/api/v1/onboarding/letterheads/l2/images/logo' && c.method === 'POST')?.body as FormData).get('file')).toBeInstanceOf(File);

    setValue(byLabel('Footer text'), 'Unsaved footer');
    await act(async () => button('Preview on a sample letter')?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/letterheads/preview-pdf'))?.body).toMatchObject({ footerText: 'Unsaved footer', letterheadId: 'l2' });
    expect(viewer()?.querySelector('h2')?.textContent).toBe('Sample: Formal');
    expect(viewer()?.textContent).toContain('Sample preview: made-up data');
    expect(clicks).not.toHaveBeenCalled();
    act(() => (viewer()?.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
    expect(viewer()).toBeNull();
    expect(byLabel('Footer text').value).toBe('Unsaved footer');
  });

  it('is read-only for members who can’t approve templates', async () => {
    granted = new Set(['onboarding.view']);
    await act(async () => root.render(<LetterheadsView />));
    await settle();
    expect(button('New letterhead')).toBeUndefined();
    act(() => button('Official')?.click());
    expect(button('Save letterhead')).toBeUndefined();
    expect(button('Preview on a sample letter')).toBeUndefined();
    expect(byLabel('Company name').readOnly).toBe(true);
  });
});

describe('template layout and preview', () => {
  it('previews the unsaved text and layout as a sample in the viewer, and saves the layout with the draft', async () => {
    const clicks = downloads();
    await act(async () => root.render(<TemplatesView />));
    await settle();
    act(() => button('Standard')?.click());
    await settle();
    expect(byLabel('Letterhead').value).toBe('l1');
    expect([...byLabel('Letterhead').options].map((o) => o.textContent)).toEqual(['None: plain page with the company name', 'Official (default)']);

    setValue(byLabel('Letter heading'), '');
    await act(async () => button('Preview PDF')?.click());
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Enter the letter heading before previewing.');
    expect(calls.some((c) => c.url.endsWith('/preview-pdf'))).toBe(false);

    setValue(byLabel('Letter heading'), 'Unsaved heading');
    setValue(byLabel('Margins (mm)'), '25');
    setValue(byLabel('Page size'), 'LETTER');
    await act(async () => button('Preview PDF')?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/templates/preview-pdf'))?.body).toEqual({
      kind: 'OFFER_LETTER', title: 'Unsaved heading', body: 'Dear {{candidate_name}},', letterheadId: 'l1', pageSize: 'LETTER', marginMm: 25, showPageNumbers: true,
    });
    expect(viewer()?.textContent).toContain('Sample preview: made-up data');
    expect(viewer()?.querySelectorAll('[data-page]')).toHaveLength(2);
    expect(calls.some((c) => c.url.endsWith('/draft'))).toBe(false);
    expect(clicks).not.toHaveBeenCalled();
    act(() => (viewer()?.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
    expect(byLabel('Letter heading').value).toBe('Unsaved heading');

    await act(async () => button('Save draft')?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/t1/draft'))?.body).toMatchObject({ title: 'Unsaved heading', letterheadId: 'l1', pageSize: 'LETTER', marginMm: 25, showPageNumbers: true });
  });
});

describe('offer letters', () => {
  it('previews an unsaved offer form in the viewer without saving it, keeping the form', async () => {
    const saved = vi.fn();
    await act(async () => root.render(<OfferEditor candidateId="c1" candidateName="Priya Rao" offer={OFFER as never} meta={null} onCancel={() => undefined} onSaved={saved} />));
    await settle();
    setValue(byLabel('Job title'), 'Principal Engineer');
    await act(async () => button('Preview letter')?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/offers/preview-pdf'))?.body).toMatchObject({ candidateId: 'c1', jobTitle: 'Principal Engineer', templateVersionId: 'tv2' });
    expect(viewer()?.textContent).toContain('Preview only: nothing is saved, approved or sent.');
    expect(calls.some((c) => c.method === 'PUT' || c.url.endsWith('/offers'))).toBe(false);
    expect(saved).not.toHaveBeenCalled();
    act(() => (viewer()?.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
    expect(byLabel('Job title').value).toBe('Principal Engineer');
  });

  it('shows the offer’s PDF in the viewer instead of downloading it, changing nothing', async () => {
    const clicks = downloads();
    await act(async () => root.render(<OfferDetailView offerId="o1" meta={null} onBack={() => undefined} onEdit={() => undefined} onOpenCandidate={() => undefined} />));
    await settle();
    await act(async () => button('Preview PDF')?.click());
    await settle();
    expect(calls.find((c) => c.url === '/api/v1/onboarding/offers/o1/pdf')?.method).toBe('GET');
    expect(viewer()?.querySelector('h2')?.textContent).toBe('Offer OFR-2026-100001');
    expect(viewer()?.textContent).toContain('Preview: this is not the sent letter.');
    expect(clicks).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    act(() => button('Download', viewer()!)?.click());
    expect(clicks).toHaveBeenCalledTimes(1);
  });
});
