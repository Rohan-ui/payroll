import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HRMS → Onboarding through the real screens (API stubbed): the dashboard
 * links to the records it counts, candidates are added and opened, interviews
 * are scheduled at the right moment, and actions follow the viewer's permissions.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));

const { OnboardingView } = await import('./OnboardingView');

const ALL = ['onboarding.view', 'onboarding.candidates.manage', 'onboarding.candidates.decide', 'onboarding.candidates.override', 'onboarding.interviews.schedule', 'onboarding.interviews.feedback'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SUMMARY = {
  timezone: 'UTC',
  today: '2026-09-30',
  totalCandidates: 3,
  byStatus: { NEW: 1, SCREENING: 2, INTERVIEW_SCHEDULED: 0, INTERVIEW_COMPLETED: 0, SELECTED: 0, REJECTED: 0, OFFER_SENT: 0, OFFER_ACCEPTED: 0, OFFER_DECLINED: 0, DOCUMENT_COLLECTION: 0, VERIFICATION: 0, READY_TO_JOIN: 0, JOINED: 0, WITHDRAWN: 0 },
  interviewsToday: 0,
  interviewsAwaitingDecision: 1,
  myFeedbackDue: 0,
  joiningSoon: { count: 0, from: '2026-09-30', to: '2026-10-30' },
};
const SUMMARY_ROW = {
  id: 'c1', candidateCode: 'CAN-2026-100001', fullName: 'Priya Rao', email: 'priya@candidate.test', phone: null, appliedPosition: 'Backend Engineer',
  departmentId: null, departmentName: null, hiringSource: null, expectedSalary: null, experienceYears: null, expectedJoiningDate: null,
  recruiterMemberId: null, recruiterName: null, status: 'SCREENING', archivedAt: null, createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', nextInterview: null,
};
const DETAIL = {
  ...SUMMARY_ROW, designationId: null, designationName: null, employmentTypeId: null, employmentTypeName: null, address: null, notes: null, employeeId: null,
  manualMoves: ['REJECTED', 'WITHDRAWN'], interviews: [], offers: [],
  timeline: [{ id: 'e1', type: 'STATUS_CHANGED', summary: 'Moved to Screening', notes: 'CV looks strong', fromStatus: 'NEW', toStatus: 'SCREENING', isOverride: false, actorName: 'Asha HR', createdAt: '2026-09-30T00:00:00Z' }],
};
const META = { departments: [{ id: 'd1', name: 'Engineering' }], designations: [], employmentTypes: [], members: [{ id: 'm1', name: 'Ravi Interviewer', email: 'ravi@x.test' }] };

let calls: { url: string; method: string; body: any }[] = [];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(ALL);
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.startsWith('/api/v1/onboarding/dashboard')) return json({ success: true, data: SUMMARY });
      if (url === '/api/v1/onboarding/meta') return json({ success: true, data: META });
      if (url.startsWith('/api/v1/onboarding/candidates?')) return json({ success: true, data: [SUMMARY_ROW], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
      if (url === '/api/v1/onboarding/candidates' && method === 'POST') return json({ success: true, data: { ...DETAIL, id: 'c2', candidateCode: 'CAN-2026-100002', status: 'NEW' } }, 201);
      if (url.startsWith('/api/v1/onboarding/candidates/') && url.endsWith('/interviews')) {
        return json({ success: true, data: { candidate: { ...DETAIL, status: 'INTERVIEW_SCHEDULED' }, interviewId: 'i1', notifications: [{ recipient: 'priya@candidate.test', status: 'NOT_SENT', duplicate: false, error: 'The workspace has no active SMTP account.' }] } }, 201);
      }
      if (url.startsWith('/api/v1/onboarding/candidates/')) return json({ success: true, data: DETAIL });
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
    if (ms) await new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label, legend')].find((l) => l.textContent?.trim().startsWith(text));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement & HTMLSelectElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
const render = async () => {
  await act(async () => root.render(<OnboardingView />));
  await settle();
};

describe('Onboarding', () => {
  it('shows real counts, and each one opens the records it counts', async () => {
    await render();
    expect(calls.some((c) => c.url.startsWith('/api/v1/onboarding/dashboard?timezone='))).toBe(true);
    expect(container.textContent).toContain('Awaiting feedback or decision');
    act(() => button('Screening')?.click());
    await settle();
    expect(calls.find((c) => c.url.startsWith('/api/v1/onboarding/candidates?'))?.url).toContain('status=SCREENING');
    expect(container.querySelector('tbody')?.textContent).toContain('Priya Rao');
  });

  it('adds a candidate after checking the form, without sending bad input', async () => {
    await render();
    act(() => button('Add candidate')?.click());
    await act(async () => (document.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(container.textContent).toContain('Enter the candidate’s full name.');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    setValue(byLabel('Full name'), 'Anu Menon');
    setValue(byLabel('Email'), 'anu@candidate.test');
    setValue(byLabel('Position'), 'Designer');
    setValue(byLabel('Expected salary'), '9,00,000');
    await act(async () => (document.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(container.textContent).toContain('without commas');
    setValue(byLabel('Expected salary'), '900000');
    setValue(byLabel('Department'), 'd1');
    await act(async () => (document.querySelector('form') as HTMLFormElement).requestSubmit());
    await settle();
    const post = calls.find((c) => c.method === 'POST');
    expect(post).toMatchObject({ url: '/api/v1/onboarding/candidates', body: { fullName: 'Anu Menon', email: 'anu@candidate.test', appliedPosition: 'Designer', expectedSalary: '900000', departmentId: 'd1' } });
    expect(post?.body.status).toBeUndefined();
  });

  it('opens a candidate with their timeline, and schedules an interview at the exact moment chosen', async () => {
    await render();
    act(() => button('Candidates')?.click());
    await settle();
    act(() => button('Priya Rao')?.click());
    await settle();
    expect(container.querySelector('h1')?.textContent).toBe('Priya Rao');
    expect(container.textContent).toContain('Moved to Screening');
    expect(container.textContent).toContain('CV looks strong');

    act(() => button('Schedule interview')?.click());
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    setValue(byLabel('Date and time'), '2026-10-05T10:30');
    setValue(byLabel('Time zone'), 'Asia/Kolkata');
    setValue(byLabel('Meeting link'), 'https://meet.example.com/abc');
    act(() => (dialog.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    const confirm = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Schedule interview') as HTMLButtonElement;
    await act(async () => confirm.click());
    await settle();

    const post = calls.find((c) => c.url.endsWith('/interviews'));
    expect(post?.body).toMatchObject({ interviewType: 'ONLINE', startsAt: '2026-10-05T05:00:00.000Z', timezone: 'Asia/Kolkata', durationMinutes: 45, interviewerMemberIds: ['m1'] });
    // Emails that could not be sent are said so, with the reason.
    expect(container.querySelector('[role=status]')?.textContent).toContain('No email was sent. The workspace has no active SMTP account.');
  });

  it('offers only the actions the viewer may take', async () => {
    granted = new Set(['onboarding.view']);
    await render();
    expect(button('Add candidate')).toBeUndefined();
    act(() => button('Candidates')?.click());
    await settle();
    act(() => button('Priya Rao')?.click());
    await settle();
    for (const action of ['Schedule interview', 'Change stage', 'Override stage', 'Edit', 'Archive']) expect([action, button(action)]).toEqual([action, undefined]);
  });
});
