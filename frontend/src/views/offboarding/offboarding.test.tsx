import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Offboarding by role (API stubbed): an employee resigns and follows only
 * their own exit; HR sees every exit, and can complete one only once nothing
 * blocks it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
const { OffboardingView } = await import('./OffboardingView');

const person = { id: 'e1', code: 'NTS004', name: 'Sneha Patil', department: 'Engineering', designation: 'Engineer' };
const own = {
  id: 's1', employee: person, type: 'RESIGNATION', status: 'PENDING_APPROVAL', isSelfService: true, reason: 'Higher studies', noticeDate: '2026-10-15', noticePeriodDays: 60,
  requestedLastWorkingDate: '2026-12-14', lastWorkingDate: '2026-12-14', approvedAt: null, completedAt: null, closedAt: null, exitInterviewDate: null, checklist: [],
};
const detail = (blockers: string[]) => ({
  ...own, status: 'IN_PROGRESS', reason: 'Higher studies', requestedBy: 'Sneha Patil', approvedBy: 'Priya Nair', completedBy: null, closedBy: null, closeReason: null,
  exitInterview: null, hasSignIn: true, today: '2026-12-14', blockers, warnings: [],
  checklist: [{ id: 'i1', team: 'IT', title: 'Laptop and accessories returned', status: blockers.length ? 'PENDING' : 'CLEARED', note: null, clearedBy: null, clearedAt: null }],
});

let calls: { method: string; path: string; body: unknown }[];
let resigned: boolean;
let blockers: string[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  resigned = false;
  blockers = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const mine = () => ({ linked: true, employee: { ...person, status: 'ACTIVE', noticePeriodDays: 60 }, today: '2026-10-15', current: resigned ? own : null, past: [] });
    if (path === '/offboarding/my' && method === 'GET') return json({ success: true, data: mine() });
    if (path === '/offboarding/my/resignation' && method === 'POST') { resigned = true; return json({ success: true, data: mine() }, 201); }
    if (path === '/offboarding/summary') return json({ success: true, data: { pendingApproval: 1, inProgress: 2, leavingIn30Days: 1, pastLastDay: 0 } });
    if (path === '/offboarding/separations') {
      return json({ success: true, data: [{ id: 's1', employee: person, type: 'RESIGNATION', status: 'IN_PROGRESS', isSelfService: true, noticeDate: '2026-10-15', lastWorkingDate: '2026-12-14', checklist: { done: 0, total: 6 } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    }
    if (path === '/offboarding/separations/s1') return json({ success: true, data: detail(blockers) });
    return json({ message: 'Not stubbed' }, 404);
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

const settle = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };
const button = (text: RegExp) => [...document.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  await act(async () => { setter?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('an employee', () => {
  it('resigns after confirming, then sees only their own pending resignation', async () => {
    granted = new Set(['offboarding.my.view']);
    await render(<OffboardingView />);
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.textContent).toContain('Your notice period is 60 days.');
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-12-14');

    await type(container.querySelector('textarea') as HTMLTextAreaElement, 'Higher studies');
    await click(button(/^Submit resignation…$/));
    expect(document.body.textContent).toContain('Submit your resignation?');
    await click(button(/^Submit resignation$/));

    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/offboarding/my/resignation', body: { reason: 'Higher studies', lastWorkingDate: '2026-12-14' } });
    expect(container.textContent).toContain('Awaiting acceptance');
    expect(button(/Withdraw resignation/)).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith('/offboarding/separations') || c.path === '/offboarding/summary')).toBe(false);
  });
});

describe('HR', () => {
  const HR = ['offboarding.my.view', 'offboarding.view', 'offboarding.manage', 'offboarding.clearance.update', 'offboarding.complete'];

  it('lists exits and holds back completing one while something blocks it', async () => {
    granted = new Set(HR);
    blockers = ['The last working day, 2026-12-14, hasn’t come yet.'];
    await render(<OffboardingView />);
    expect(container.querySelector('[role="tablist"]')?.textContent).toBe('ExitsMy resignation');
    expect(container.textContent).toContain('Serving notice');
    await click(button(/^Sneha Patil$/));
    expect(button(/Complete exit/).disabled).toBe(true);
    expect(container.textContent).toContain('Can’t be completed yet: The last working day');
  });

  it('says what completing does before it is done', async () => {
    granted = new Set(HR);
    await render(<OffboardingView />);
    await click(button(/^Sneha Patil$/));
    await click(button(/Complete exit…/));
    expect(document.body.textContent).toContain('Complete Sneha Patil’s exit?');
    expect(document.body.textContent).toContain('Their sign-in to this workspace ends now');
    expect(calls.some((c) => c.path.endsWith('/complete'))).toBe(false);
  });

  it('shows only the exits list to someone who can view exits but not resign', async () => {
    granted = new Set(['offboarding.view']);
    await render(<OffboardingView />);
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(button(/Start an exit/)).toBeUndefined();
    await click(button(/^Sneha Patil$/));
    expect(button(/Complete exit/)).toBeUndefined();
    expect(button(/^Clear$/)).toBeUndefined();
  });
});
