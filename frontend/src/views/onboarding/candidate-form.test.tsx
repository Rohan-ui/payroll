import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The candidate information form (API stubbed): the candidate's own page
 * explains what is missing before sending, sends only what they entered,
 * and shows a clear end state; HR's panel sends or reopens the form, shows
 * what was submitted, and records eligibility, asking for a reason to reject.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { PublicCandidateFormView } = await import('../public/PublicCandidateFormView');
const { CandidateFormPanel } = await import('./CandidateFormPanel');

const TOKEN = 't'.padEnd(43, 'x');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const DETAILS = {
  fullName: 'Arjun Mehta', email: 'arjun@candidate.test', phone: '+91 98000 11111', alternatePhone: null, dateOfBirth: null, genderCode: null,
  totalExperienceYears: null, expectedSalary: null, noticePeriodDays: null, lastWorkingDate: null, skills: null,
  emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null, additionalInformation: null,
  currentAddress: null, permanentAddress: null, education: [], experience: [], references: [],
};
const REVIEW = (extra: Record<string, unknown> = {}) => ({
  form: { linkNumber: 1, sentAt: '2026-11-10T05:00:00.000Z', expiresAt: '2026-11-24T05:00:00.000Z', isOpen: false, submittedAt: '2026-11-11T05:00:00.000Z', requestMessage: null },
  personal: { ...DETAILS, dateOfBirth: '1996-04-12', expectedSalary: '750000', noticePeriodDays: 30, emergencyContactName: 'Meera', emergencyContactPhone: '+91 98000 22222' },
  addresses: { CURRENT: { addressLine1: '12 MG Road', city: 'Pune', countryCode: 'IN' }, PERMANENT: null },
  education: [{ qualification: 'B.Com', institution: 'Symbiosis', university: null, passingYear: 2017, score: '72%' }],
  experience: [{ companyName: 'Acme Books', designation: 'Accountant', startDate: '2019-07-01', endDate: null, isCurrent: true, lastSalary: '420000.5', responsibilities: null }],
  references: [],
  eligibility: null,
  ...extra,
});
const CANDIDATE = { id: 'c1', fullName: 'Arjun Mehta', email: 'arjun@candidate.test', status: 'FORM_SUBMITTED', archivedAt: null } as never;

let calls: { url: string; method: string; body: any }[];
let submitStatus: number;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['onboarding.view', 'onboarding.candidates.manage', 'onboarding.candidates.decide']);
  calls = [];
  submitStatus = 200;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.includes('/public/candidate-form/') && method === 'GET') return json({ success: true, data: { companyName: 'Acme', position: 'Accountant', linkExpiresAt: '2026-11-30T00:00:00.000Z', message: 'Please add your degree.', details: DETAILS, documents: [{ id: 'r1', label: 'Resume', isRequired: true, state: 'MISSING', minFiles: 1, maxFiles: 1, slots: null, files: [] }] } });
    if (url.includes('/documents/r1/files')) return json({ success: true, data: [{ id: 'r1', label: 'Resume', isRequired: true, state: 'PENDING_REVIEW', minFiles: 1, maxFiles: 1, slots: null, files: [{ filename: 'cv.pdf', reviewStatus: 'PENDING_REVIEW', rejectionReason: null, slotName: null }] }] }, 201);
    if (url.includes('/public/candidate-form/')) return submitStatus === 200 ? json({ success: true, data: { submitted: true } }) : json({ message: 'This form has already been submitted.' }, submitStatus);
    if (url.endsWith('/candidates/c1/form')) return json({ success: true, data: REVIEW() });
    if (url.endsWith('/form/send')) return json({ success: true, data: { ...CANDIDATE, status: 'FORM_SENT' }, notifications: [{ recipient: 'arjun@candidate.test', status: 'SENT', duplicate: false, error: null }] });
    if (url.endsWith('/eligibility')) return json({ success: true, data: { ...CANDIDATE, status: body.decision }, notifications: [] });
    return json({ message: `Unexpected ${method} ${url}` }, 404);
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
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement | undefined) => { await act(async () => el!.click()); await settle(); };
const inputs = (labelText: string) => [...document.querySelectorAll('label')]
  .filter((l) => l.textContent?.replace(/\s*\*$/, '').trim() === labelText)
  .map((l) => document.getElementById(l.getAttribute('for') ?? '') as HTMLInputElement);
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
});
const check = async (text: string) => click([...document.querySelectorAll('label')].find((l) => l.textContent?.includes(text))?.querySelector('input') as HTMLInputElement);
const alert = () => document.querySelector('[role=alert]')?.textContent;

describe('candidate’s own form', () => {
  it('opens with what the company already knows and its message', async () => {
    await render(<PublicCandidateFormView token={TOKEN} />);
    expect(document.querySelector('h1')?.textContent).toBe('Your details for the Accountant role');
    expect(document.body.textContent).toContain('From Acme: Please add your degree.');
    expect(inputs('Full name')[0].value).toBe('Arjun Mehta');
    expect(inputs('Mobile number')[0].value).toBe('+91 98000 11111');
  });

  it('says what is missing, in order, before sending anything', async () => {
    await render(<PublicCandidateFormView token={TOKEN} />);
    await click(button('Submit my details'));
    expect(alert()).toBe('Enter your date of birth.');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('sends exactly what was entered and shows the end state', async () => {
    await render(<PublicCandidateFormView token={TOKEN} />);
    await type(inputs('Date of birth')[0], '1996-04-12');
    await type(inputs('Address line 1')[0], '12 MG Road');
    await type(inputs('City')[0], 'Pune');
    await type(inputs('Qualification')[0], 'B.Com');
    await type(inputs('Institution')[0], 'Symbiosis');
    await type(inputs('Name')[0], 'Meera Mehta');
    await type(inputs('Phone')[0], '+91 98000 22222');
    await check('I confirm');
    await click(button('Submit my details'));
    const sent = calls.find((c) => c.method === 'POST')!.body;
    expect(sent).toEqual({
      fullName: 'Arjun Mehta', dateOfBirth: '1996-04-12', phone: '+91 98000 11111',
      currentAddress: { addressLine1: '12 MG Road', city: 'Pune', countryCode: 'IN' },
      education: [{ qualification: 'B.Com', institution: 'Symbiosis' }], experience: [],
      emergencyContactName: 'Meera Mehta', emergencyContactPhone: '+91 98000 22222', references: [], confirmed: true,
    });
    expect(document.body.textContent).toContain('Thank you, your details have been sent');
  });

  it('uploads a requested document and shows it as uploaded', async () => {
    await render(<PublicCandidateFormView token={TOKEN} />);
    expect(document.body.textContent).toContain('Not uploaded');
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await settle();
    expect(calls.find((c) => c.url.endsWith('/documents/r1/files'))?.method).toBe('POST');
    expect(document.body.textContent).toContain('Uploaded · cv.pdf');
  });

  it('explains a used link instead of the form', async () => {
    submitStatus = 410;
    await render(<PublicCandidateFormView token={TOKEN} />);
    await type(inputs('Date of birth')[0], '1996-04-12');
    await type(inputs('Address line 1')[0], '1 Road');
    await type(inputs('City')[0], 'Pune');
    await type(inputs('Qualification')[0], 'B.Com');
    await type(inputs('Institution')[0], 'X');
    await type(inputs('Name')[0], 'Meera');
    await type(inputs('Phone')[0], '98000 22222');
    await check('I confirm');
    await click(button('Submit my details'));
    expect(document.querySelector('h1')?.textContent).toBe("This form can't be opened");
    expect(alert()).toContain('already been submitted');
  });
});

describe('HR’s form and eligibility panel', () => {
  it('shows what the candidate submitted', async () => {
    await render(<CandidateFormPanel candidate={CANDIDATE} onChanged={() => undefined} />);
    expect(document.body.textContent).toContain('Submitted');
    expect(document.body.textContent).toContain('12 MG Road, Pune, IN');
    expect(document.body.textContent).toContain('B.Com');
    expect(document.body.textContent).toContain('Acme Books');
  });

  it('reopens the form only with a message saying what more is needed', async () => {
    const onChanged = vi.fn();
    await render(<CandidateFormPanel candidate={CANDIDATE} onChanged={onChanged} />);
    await click(button('Ask for more information'));
    await click(button('Send'));
    expect(alert()).toMatch(/Say what more you need/);
    await type(document.querySelector('[role=dialog] textarea') as HTMLTextAreaElement, 'Please add your M.Com.');
    await click(button('Send'));
    expect(calls.find((c) => c.url.endsWith('/form/send'))?.body).toEqual({ message: 'Please add your M.Com.', channels: ['EMAIL'] });
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: 'FORM_SENT' }), { tone: 'ok', text: 'Sent by email.' });
  });

  it('marks not eligible only with a reason, and notifies by default', async () => {
    await render(<CandidateFormPanel candidate={CANDIDATE} onChanged={() => undefined} />);
    await click(button('Not eligible'));
    await click(button('Mark not eligible'));
    expect(calls.some((c) => c.url.endsWith('/eligibility'))).toBe(false);
    await type(document.querySelector('[role=dialog] input:not([type=checkbox])') as HTMLInputElement, 'Needs CA qualification');
    await click(button('Mark not eligible'));
    expect(calls.find((c) => c.url.endsWith('/eligibility'))?.body).toEqual({ decision: 'NOT_ELIGIBLE', reason: 'Needs CA qualification', notifyCandidate: true });
  });

  it('offers no actions without the permissions', async () => {
    granted = new Set(['onboarding.view']);
    await render(<CandidateFormPanel candidate={CANDIDATE} onChanged={() => undefined} />);
    expect(button('Ask for more information')).toBeUndefined();
    expect(button('Mark eligible')).toBeUndefined();
  });
});

describe('delivery summary', () => {
  it('names each channel and why one was not sent', async () => {
    const { describeDeliveries } = await import('./CandidateFormPanel');
    expect(describeDeliveries([
      { recipient: 'a@x.test', status: 'SENT', duplicate: false, error: null },
      { recipient: 'WhatsApp +91 98000', status: 'NOT_SENT', duplicate: false, error: 'WhatsApp isn’t set up.' },
    ] as never)).toEqual({ tone: 'warn', text: 'Sent by email. WhatsApp not sent: WhatsApp isn’t set up.' });
  });
});
