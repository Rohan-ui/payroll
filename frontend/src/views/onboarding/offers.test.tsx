import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { totalOf } from './OfferEditor';

/**
 * Offers, templates and the candidate's offer page through the real screens
 * (API stubbed): offers are drafted, approved and sent with specific
 * confirmations, templates are edited with placeholders, and the candidate
 * accepts only after confirming and typing their name.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));

const { OnboardingView } = await import('./OnboardingView');
const { PublicOfferView } = await import('../public/PublicOfferView');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const META = { departments: [{ id: 'd1', name: 'Engineering' }], designations: [], employmentTypes: [], members: [{ id: 'm1', name: 'Asha Approver', email: 'a@x.test' }, { id: 'm2', name: 'Ravi Approver', email: 'r@x.test' }] };
const SUMMARY = {
  timezone: 'UTC', today: '2026-09-30', totalCandidates: 1, byStatus: { NEW: 0, SCREENING: 0, INTERVIEW_SCHEDULED: 0, INTERVIEW_COMPLETED: 0, SELECTED: 1, REJECTED: 0, OFFER_SENT: 0, OFFER_ACCEPTED: 0, OFFER_DECLINED: 0, DOCUMENT_COLLECTION: 0, VERIFICATION: 0, READY_TO_JOIN: 0, JOINED: 0, WITHDRAWN: 0 },
  interviewsToday: 0, interviewsAwaitingDecision: 0, myFeedbackDue: 0, joiningSoon: { count: 0, from: '2026-09-30', to: '2026-10-30' },
  offersAwaitingApproval: 1, myApprovalsDue: 1, offersAwaitingResponse: 0,
};
const CANDIDATE = {
  id: 'c1', candidateCode: 'CAN-2026-100001', fullName: 'Priya Rao', email: 'priya@candidate.test', phone: null, appliedPosition: 'Backend Engineer', departmentId: null, departmentName: null,
  hiringSource: null, expectedSalary: null, experienceYears: null, expectedJoiningDate: null, recruiterMemberId: null, recruiterName: null, status: 'SELECTED', archivedAt: null,
  createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', designationId: null, designationName: null, employmentTypeId: null, employmentTypeName: null, address: null, notes: null,
  employeeId: null, manualMoves: ['WITHDRAWN'], timeline: [], interviews: [], offers: [],
};
const offer = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'o1', offerCode: 'OFR-2026-100001', status, candidate: { id: 'c1', name: 'Priya Rao', code: 'CAN-2026-100001', email: 'priya@candidate.test', status: 'SELECTED' },
  templateVersionId: 'tv1', templateName: 'Standard', templateVersion: 2, reportingManagerName: null, jobTitle: 'Backend Engineer', departmentId: 'd1', designationId: null, employmentTypeId: null,
  reportingManagerEmployeeId: null, workLocation: 'Pune', components: [{ label: 'Basic', annualAmount: '900000.50' }, { label: 'HRA', annualAmount: '300000.25' }], annualCtc: '1200000.75',
  probationMonths: 6, joiningDate: '2026-11-01', expiresOn: '2026-10-15', specialTerms: null, letter: { title: 'Offer of employment', body: 'Dear Priya Rao,\n\nWe are pleased…' },
  letterIsFinal: status !== 'DRAFT', approvals: [], submissionNumber: 1, awaitingMe: status === 'PENDING_APPROVAL', submittedAt: null, approvedAt: null, sentAt: null, sentBy: null,
  respondedAt: null, acceptedName: null, declineReason: null, withdrawnReason: null, hasPdf: false, ...extra,
});

let calls: { url: string; method: string; body: any }[] = [];
let currentOffer: ReturnType<typeof offer>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['onboarding.view', 'onboarding.offers.manage', 'onboarding.offers.approve', 'onboarding.offers.send', 'onboarding.templates.manage', 'onboarding.templates.approve']);
  calls = [];
  currentOffer = offer('PENDING_APPROVAL');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.startsWith('/api/v1/onboarding/dashboard')) return json({ success: true, data: SUMMARY });
      if (url === '/api/v1/onboarding/meta') return json({ success: true, data: META });
      if (url.startsWith('/api/v1/onboarding/offers?')) return json({ success: true, data: [{ id: 'o1', offerCode: 'OFR-2026-100001', status: currentOffer.status, candidate: { id: 'c1', name: 'Priya Rao', code: 'CAN' }, jobTitle: 'Backend Engineer', annualCtc: '1200000.75', joiningDate: '2026-11-01', expiresOn: '2026-10-15', awaitingApprovalFrom: 'You', awaitingMe: true, updatedAt: '2026-09-30T00:00:00Z' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
      if (url.endsWith('/approve') && url.includes('/offers/')) { currentOffer = offer('APPROVED'); return json({ success: true, data: { offer: currentOffer, notifications: [] } }); }
      if (url.endsWith('/send')) { currentOffer = offer('SENT', { hasPdf: true, sentAt: '2026-09-30T10:00:00Z' }); return json({ success: true, data: { offer: currentOffer, notifications: [{ recipient: 'priya@candidate.test', status: 'SENT', duplicate: false, error: null }] } }); }
      if (url === '/api/v1/onboarding/offers/o1') return json({ success: true, data: currentOffer });
      if (url === '/api/v1/onboarding/candidates/c1') return json({ success: true, data: CANDIDATE });
      if (url.startsWith('/api/v1/onboarding/templates?kind=OFFER_LETTER')) return json({ success: true, data: [{ id: 't1', kind: 'OFFER_LETTER', name: 'Standard', isArchived: false, approvedVersion: { id: 'tv2', number: 2, title: 'Offer' }, draftVersion: null }, { id: 't2', kind: 'OFFER_LETTER', name: 'Unapproved', isArchived: false, approvedVersion: null, draftVersion: { id: 'tv9', number: 1 } }] });
      if (url === '/api/v1/onboarding/candidates/c1/offers') return json({ success: true, data: offer('DRAFT') }, 201);
      if (url === '/api/v1/onboarding/templates' && method === 'POST') return json({ success: true, data: { id: 't3', kind: 'OFFER_LETTER', name: 'New', isArchived: false, placeholders: [{ key: 'candidate_name', description: 'Name' }], versions: [{ id: 'tv3', number: 1, status: 'DRAFT', title: 'Offer', body: 'Dear ', createdBy: null, approvedBy: null, approvedAt: null, updatedAt: '' }] } }, 201);
      if (url === '/api/v1/onboarding/templates/t3') return json({ success: true, data: { id: 't3', kind: 'OFFER_LETTER', name: 'New', isArchived: false, placeholders: [{ key: 'candidate_name', description: 'Name' }], versions: [{ id: 'tv3', number: 1, status: 'DRAFT', title: 'Offer', body: 'Dear ', createdBy: null, approvedBy: null, approvedAt: null, updatedAt: '' }] } });
      if (url.startsWith('/api/v1/onboarding/templates')) return json({ success: true, data: [] });
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

const settle = (ms = 0) => act(async () => { if (ms) await new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });

describe('offer totals', () => {
  it('adds pay lines exactly, in paise', () => {
    expect(totalOf(['900000.50', '300000.25'])).toBe('1200000.75');
    expect(totalOf(['0.1', '0.2'])).toBe('0.30');
    expect(totalOf(['9,00,000'])).toBeNull();
  });
});

describe('offers', () => {
  it('shows my approvals due on the dashboard, and approving then sending needs specific confirmations', async () => {
    await act(async () => root.render(<OnboardingView />));
    await settle();
    act(() => button('Your approvals due')?.click());
    await settle();
    expect(calls.some((c) => c.url.includes('/offers?') && c.url.includes('awaitingMyApproval=true'))).toBe(true);
    act(() => button('OFR-2026-100001')?.click());
    await settle();
    expect(container.textContent).toContain('Dear Priya Rao');

    act(() => button('Approve')?.click());
    const approve = document.querySelector('[role=dialog]') as HTMLElement;
    expect(approve.textContent).toContain('₹12,00,000.75');
    await act(async () => button('Approve', approve)?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/o1/approve'))?.method).toBe('POST');

    act(() => button('Send to candidate')?.click());
    const send = document.querySelector('[role=dialog]') as HTMLElement;
    expect(send.querySelector('h2')?.textContent).toBe('Send offer OFR-2026-100001 to Priya Rao?');
    expect(send.textContent).toContain('priya@candidate.test');
    await act(async () => button('Send offer', send)?.click());
    await settle();
    expect(container.querySelector('[role=status]')?.textContent).toContain('Email sent to 1 recipient.');
    expect(button('View sent PDF')).toBeDefined();
  });

  it('drafts with the chosen template and the exact total', async () => {
    const { OfferEditor } = await import('./OfferEditor');
    const saved = vi.fn();
    await act(async () => root.render(<OfferEditor candidateId="c1" candidateName="Priya Rao" meta={META} onCancel={() => undefined} onSaved={saved} />));
    await settle();
    expect([...byLabel('Offer letter template').options].map((o) => o.textContent)).toEqual(['Choose a template', 'Standard (version 2)']);
    await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Choose an approved offer letter template.');

    setValue(byLabel('Offer letter template'), 'tv2');
    setValue(byLabel('Job title'), 'Backend Engineer');
    setValue(byLabel('Line 1 name'), 'Basic');
    setValue(byLabel('Amount (₹ per year)'), '900000.50');
    act(() => button('Add pay line')?.click());
    setValue(byLabel('Line 2 name'), 'HRA');
    setValue([...document.querySelectorAll('input[inputmode=decimal]')][1] as HTMLInputElement, '300000.25');
    expect(container.querySelector('[data-offer-total]')?.textContent).toBe('Total (CTC): ₹12,00,000.75');
    setValue(byLabel('Last day to accept'), '2026-10-15');
    setValue(byLabel('Joining date'), '2026-11-01');
    await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
    await settle();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      templateVersionId: 'tv2', jobTitle: 'Backend Engineer', joiningDate: '2026-11-01', expiresOn: '2026-10-15',
      components: [{ label: 'Basic', annualAmount: '900000.50' }, { label: 'HRA', annualAmount: '300000.25' }],
    });
    expect(saved).toHaveBeenCalled();
  });

  it('hides offer actions from members without the permissions', async () => {
    granted = new Set(['onboarding.view']);
    const { OfferDetailView } = await import('./OfferDetailView');
    await act(async () => root.render(<OfferDetailView offerId="o1" meta={META} onBack={() => undefined} onEdit={() => undefined} onOpenCandidate={() => undefined} />));
    await settle();
    for (const action of ['Approve', 'Send back', 'Withdraw', 'Edit']) expect([action, button(action)]).toEqual([action, undefined]);
    expect(button('Preview PDF')).toBeDefined();
  });
});

describe('templates', () => {
  it('creates a draft, and placeholders are inserted by clicking them', async () => {
    const { TemplatesView } = await import('./TemplatesView');
    await act(async () => root.render(<TemplatesView />));
    await settle();
    expect(container.textContent).toContain('No templates yet');
    act(() => button('New template')?.click());
    await act(async () => button('Create draft')?.click());
    await settle();
    expect(calls.find((c) => c.url === '/api/v1/onboarding/templates' && c.method === 'POST')?.body).toMatchObject({ kind: 'OFFER_LETTER', name: 'Standard offer letter' });
    await settle();
    // With the cursor at the end of the text, the placeholder goes there.
    const text = byLabel('Letter text');
    act(() => text.setSelectionRange(text.value.length, text.value.length));
    act(() => button('{{candidate_name}}')?.click());
    expect(byLabel('Letter text').value).toBe('Dear {{candidate_name}}');
  });
});

describe('the candidate’s offer page', () => {
  const view = (status: string, canRespond: boolean) => ({
    companyName: 'Acme Technologies', offerCode: 'OFR-2026-100001', candidateName: 'Priya Rao', jobTitle: 'Backend Engineer', joiningDate: '2026-11-01', expiresOn: '2026-10-15',
    annualCtc: '1200000.75', components: [{ label: 'Basic', annualAmount: '900000.50' }], letter: { title: 'Offer of employment', body: 'Dear Priya' }, status, respondedAt: null, canRespond,
  });

  it('accepts only after confirming and typing a name, and says what was recorded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
      return json({ success: true, data: init.method === 'POST' ? view('ACCEPTED', false) : view('SENT', true) });
    }));
    await act(async () => root.render(<PublicOfferView token="abc123" />));
    await settle();
    expect(container.querySelector('h1')?.textContent).toBe('Your offer: Backend Engineer');
    expect(container.textContent).toContain('This is not a verified digital signature.');
    expect(document.querySelector('meta[name=referrer]')?.getAttribute('content')).toBe('no-referrer');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/api/v1/public/offers/abc123/pdf?download=1');
    expect(button('View the offer letter (PDF)')).toBeDefined();

    await act(async () => button('Accept the offer')?.click());
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Tick the box');
    act(() => (container.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    setValue(byLabel('Type your full name'), 'Priya Rao');
    await act(async () => button('Accept the offer')?.click());
    await settle();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/v1/public/offers/abc123/accept', body: { typedName: 'Priya Rao', confirm: true } });
    expect(container.textContent).toContain('You accepted this offer.');
  });

  it('declines with an optional reason, and explains a link that no longer works', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('bad')) return json({ statusCode: 404, message: 'This offer link is not valid.' }, 404);
      return json({ success: true, data: init.method === 'POST' ? view('DECLINED', false) : view('SENT', true) });
    }));
    await act(async () => root.render(<PublicOfferView token="abc123" />));
    await settle();
    act(() => button('Decline instead')?.click());
    setValue(byLabel('Would you like to tell us why?'), 'Accepted another offer');
    await act(async () => button('Decline the offer')?.click());
    await settle();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/v1/public/offers/abc123/decline', body: { reason: 'Accepted another offer' } });
    expect(container.textContent).toContain('You declined this offer.');

    await act(async () => root.render(<PublicOfferView token="bad" />));
    await settle();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('This offer link is not valid.');
  });
});
