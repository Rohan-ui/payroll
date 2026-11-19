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
  notice: { requiredDays: 30, servedDays: 14, requestedLastDay: '2026-12-14', contractualLastDay: '2026-12-30', lastDay: '2026-12-14', shortfallDays: 16, decision: null, decisionReason: null, decidedBy: null, decidedAt: null },
  dateChanges: [], directReports: [{ id: 'r1', code: 'E-9', name: 'Ravi Kumar' }],
  managerComments: [{ id: 'c1', kind: 'HANDOVER', body: 'Billing service goes to Asha.', author: 'Mona Shah', createdAt: '2026-12-01T10:00:00.000Z' }],
  obligations: { outstanding: '5000.00', loans: [{ id: 'l1', number: 'L-1', type: 'LOAN', principal: '10000.00', installment: '5000.00', outstanding: '5000.00', installmentsLeft: 1, dueAfterLastDay: '5000.00', installmentsAfterLastDay: 1 }] },
  checklist: [
    { id: 'i1', team: 'IT', title: 'Laptop and accessories returned', description: null, isRequired: true, dueDate: '2026-12-14', hasOwnDueDate: false, assignedTo: { id: 'm9', name: 'Ivan Rao' },
      status: blockers.length ? 'PENDING' : 'CLEARED', note: null, waiverReason: null, clearedBy: null, clearedAt: null, canClear: granted.has('offboarding.clearance.update'), canWaive: granted.has('offboarding.clearance.update') },
    { id: 'i2', team: 'IT', title: 'Wiki badge removed', description: 'From the team page', isRequired: false, dueDate: '2026-12-10', hasOwnDueDate: true, assignedTo: null,
      status: 'PENDING', note: null, waiverReason: null, clearedBy: null, clearedAt: null, canClear: granted.has('offboarding.clearance.update'), canWaive: granted.has('offboarding.clearance.update') },
  ],
});

const teamExit = (comments: unknown[], itemStatus = 'PENDING') => ({
  id: 's1', type: 'RESIGNATION', status: 'IN_PROGRESS', lastWorkingDate: '2026-12-14', noticeDate: '2026-10-15', employee: { name: 'Sneha Patil', code: 'NTS004', department: 'Engineering', designation: 'Engineer' },
  checklistProgress: { done: 0, total: 2 }, canComment: true, comments,
  checklist: [
    { id: 'm1', team: 'MANAGER', title: 'Work handed over', status: itemStatus, note: null, clearedAt: null, canUpdate: true },
    { id: 'f1', team: 'FINANCE', title: 'Advances settled', status: 'PENDING', note: null, clearedAt: null, canUpdate: false },
  ],
});

let calls: { method: string; path: string; body: unknown }[];
let itemsLeft: string[];
let resigned: boolean;
let blockers: string[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  itemsLeft = ['x1', 'x2'];
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
    if (path === '/offboarding/separations/s1/notifications') {
      return json({ success: true, data: [{ id: 'n1', event: 'RESIGNATION_ACCEPTED', channel: 'EMAIL', recipient: 'mona@example.com', status: 'NOT_SENT', error: 'The workspace has no active SMTP account.', attempts: 2, sentAt: null, createdAt: '2026-12-01T10:00:00.000Z', updatedAt: '2026-12-02T10:00:00.000Z' }] });
    }
    if (path === '/offboarding/separations/s1/checklist/i2' && method === 'PUT') return json({ success: true, data: detail(blockers) });
    if (path === '/offboarding/checklist/mine') {
      return json({ success: true, data: itemsLeft.map((id) => ({ id, separationId: 's1', team: 'IT', title: id === 'x1' ? 'Laptop returned' : 'Access removed', description: null, isRequired: true, dueDate: '2026-12-14', lastWorkingDate: '2026-12-14', assignedTo: null, isMine: id === 'x1', employee: { name: 'Sneha Patil', code: 'NTS004' } })) });
    }
    if (path.startsWith('/offboarding/checklist/items/')) {
      itemsLeft = itemsLeft.filter((i) => i !== path.split('/').pop());
      return json({ success: true, data: itemsLeft.map((id) => ({ id, separationId: 's1', team: 'IT', title: 'Access removed', description: null, isRequired: true, dueDate: '2026-12-14', lastWorkingDate: '2026-12-14', assignedTo: null, isMine: false, employee: { name: 'Sneha Patil', code: 'NTS004' } })) });
    }
    if (path === '/offboarding/checklist-template' && method === 'GET') return json({ success: true, data: [] });
    if (path === '/offboarding/checklist-template' && method === 'PUT') return json({ success: true, data: JSON.parse(String(init?.body)).items });
    if (path === '/offboarding/team') return json({ success: true, data: [{ ...teamExit([]), pendingManagerItems: 1 }] });
    if (path === '/offboarding/team/s1') return json({ success: true, data: teamExit([]) });
    if (path === '/offboarding/team/s1/comments') {
      const body = JSON.parse(String(init?.body));
      return json({ success: true, data: teamExit([{ id: 'c1', kind: body.kind, body: body.body, author: 'Mona Shah', createdAt: '2026-12-01T10:00:00.000Z', isMine: true }]) }, 201);
    }
    if (path === '/offboarding/team/s1/checklist/m1') return json({ success: true, data: teamExit([], JSON.parse(String(init?.body)).status) });
    if (path === '/offboarding/separations/s1/notice-decision') return json({ success: true, data: { ...detail(blockers), notice: { ...detail(blockers).notice, decision: 'RECOVER', decidedBy: 'Priya Nair' } } });
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

describe('Manager', () => {
  const STAFF = ['offboarding.my.view', 'offboarding.team.view'];

  it('lists their team’s exits and leaves a handover note', async () => {
    granted = new Set(STAFF);
    await render(<OffboardingView />);
    expect(container.querySelector('[role="tablist"]')?.textContent).toBe('My teamMy resignation');
    await click(button(/^My team$/));
    expect(container.textContent).toContain('1 open');
    await click(button(/^Sneha Patil$/));
    expect(container.textContent).toContain('Your handover items');
    expect(container.textContent).not.toContain('Higher studies');
    const note = container.querySelector('textarea') as HTMLTextAreaElement;
    await type(note, 'Billing service goes to Asha.');
    await click(button(/Add handover note/));
    expect(calls.find((c) => c.path === '/offboarding/team/s1/comments')).toMatchObject({ method: 'POST', body: { kind: 'HANDOVER', body: 'Billing service goes to Asha.' } });
    expect(container.textContent).toContain('Billing service goes to Asha.');
  });

  it('clears only their own checklist items', async () => {
    granted = new Set(STAFF);
    await render(<OffboardingView />);
    await click(button(/^My team$/));
    await click(button(/^Sneha Patil$/));
    const labelled = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(labelled('Clear: Advances settled')).toBeNull();
    await click(labelled('Clear: Work handed over') as HTMLButtonElement);
    expect(calls.find((c) => c.path === '/offboarding/team/s1/checklist/m1')).toMatchObject({ method: 'PUT', body: { status: 'CLEARED' } });
    expect(labelled('Reopen: Work handed over')).not.toBeNull();
  });
});

describe('Checklist owners', () => {
  it('lists the items their team owns and clears or waives them with a reason', async () => {
    granted = new Set(['offboarding.my.view', 'offboarding.clearance.it']);
    await render(<OffboardingView />);
    expect(container.querySelector('[role="tablist"]')?.textContent).toBe('My checklistMy resignation');
    await click(button(/^My checklist$/));
    expect(container.textContent).toContain('Laptop returned');
    expect(container.textContent).toContain('given to you');
    const labelled = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    await click(labelled('Clear: Laptop returned for Sneha Patil') as HTMLButtonElement);
    expect(calls.find((c) => c.path === '/offboarding/checklist/items/x1')).toMatchObject({ method: 'PUT', body: { status: 'CLEARED' } });
    expect(container.textContent).not.toContain('Laptop returned');

    await click(labelled('Waive: Access removed for Sneha Patil') as HTMLButtonElement);
    expect(button(/^Waive item$/).disabled).toBe(true);
    await type(document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, 'Never had access');
    await click(button(/^Waive item$/));
    expect(calls.find((c) => c.path === '/offboarding/checklist/items/x2')).toMatchObject({ body: { status: 'WAIVED', waiverReason: 'Never had access' } });
    expect(container.textContent).toContain('Nothing to clear');
  });
});

describe('HR', () => {
  const HR = ['offboarding.my.view', 'offboarding.view', 'offboarding.manage', 'offboarding.clearance.update', 'offboarding.complete'];

  it('lists exits and holds back completing one while something blocks it', async () => {
    granted = new Set(HR);
    blockers = ['The last working day, 2026-12-14, hasn’t come yet.'];
    await render(<OffboardingView />);
    expect(container.querySelector('[role="tablist"]')?.textContent).toBe('ExitsMy checklistMy resignation');
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

  it('shows the notice shortfall, team and loans, and records a decision on the shortfall', async () => {
    granted = new Set(HR);
    await render(<OffboardingView />);
    await click(button(/^Sneha Patil$/));
    expect(container.textContent).toContain('Shortfall16 days');
    expect(container.textContent).toContain('Last day by contract');
    expect(container.textContent).toContain('Ravi Kumar · E-9');
    expect(button(/Reassign/)).toBeUndefined(); // needs People access as well
    expect(container.textContent).toMatch(/Loans and advances.*outstanding/);
    await click(button(/^Recover$/));
    expect(calls.find((c) => c.path.endsWith('/notice-decision'))).toMatchObject({ method: 'PUT', body: { decision: 'RECOVER' } });
    expect(container.textContent).toContain('To be recovered');
  });

  it('shows each item’s owner, due date and whether it’s optional, and waives with a reason', async () => {
    granted = new Set(HR);
    blockers = ['1 required checklist item is still open.'];
    await render(<OffboardingView />);
    await click(button(/^Sneha Patil$/));
    expect(container.textContent).toContain('(last day) · with Ivan Rao');
    expect(container.textContent).toContain('Wiki badge removed(optional)');
    expect(container.textContent).toContain('From the team page');
    expect(container.textContent).toMatch(/Overdue · was due/);
    const labelled = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    await click(labelled('Waive: Wiki badge removed') as HTMLButtonElement);
    await type(document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, 'Not on the wiki');
    await click(button(/^Waive item$/));
    expect(calls.find((c) => c.path === '/offboarding/separations/s1/checklist/i2')).toMatchObject({ method: 'PUT', body: { status: 'WAIVED', waiverReason: 'Not on the wiki' } });
  });

  it('adds the workspace’s own items to every new exit', async () => {
    granted = new Set(HR);
    await render(<OffboardingView />);
    await click(button(/^Checklist$/));
    await type(document.querySelector('[role="dialog"] input:not([type])') as HTMLInputElement, 'Return the parking pass');
    await click(button(/^Add$/));
    expect(document.body.textContent).toContain('Return the parking pass');
    await click(button(/^Save$/));
    expect(calls.find((c) => c.path === '/offboarding/checklist-template' && c.method === 'PUT')).toMatchObject({ body: { items: [{ team: 'IT', title: 'Return the parking pass', isRequired: true, description: null }] } });
  });

  it('shows the manager’s handover notes and every email the exit sent, with why one didn’t go out', async () => {
    granted = new Set(HR);
    await render(<OffboardingView />);
    await click(button(/^Sneha Patil$/));
    expect(container.textContent).toContain('From the manager');
    expect(container.textContent).toContain('Billing service goes to Asha.');
    expect(container.textContent).toContain('Resignation accepted → mona@example.com');
    expect(container.textContent).toContain('Not sent');
    expect(container.textContent).toContain('tried 2 times');
    expect(container.textContent).toContain('no active SMTP account');
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
