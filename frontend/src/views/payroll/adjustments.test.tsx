import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Monthly entries, overtime approval and loans through the real screens (API stubbed). */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { MonthlyEntriesTab } = await import('./MonthlyEntriesTab');
const { OvertimeTab } = await import('./OvertimeTab');
const { LoansTab } = await import('./LoansTab');

const entry = (extra: Record<string, unknown> = {}) => ({
  id: 'i1', employee: { id: 'e1', code: 'E1', name: 'Wasim' }, component: { code: 'BONUS', name: 'Bonus', category: 'EARNING' }, amount: '2000.00', status: 'PENDING',
  note: 'Festival', rejectionReason: null, createdBy: 'Asha', createdByMemberId: 'm1', approvedBy: null, approvedAt: null, createdAt: '', ...extra,
});
const otDay = (date: string, extra: Record<string, unknown> = {}) => ({
  employee: { id: 'e1', code: 'E1', name: 'Wasim' }, date, attendanceStatus: 'PRESENT', recordedMinutes: 70, eligible: true, state: 'PENDING', approvedMinutes: null, note: null, decidedBy: null, decidedAt: null, ...extra,
});
const loan = {
  id: 'l1', loanNumber: 'LN-2026-0001', loanType: 'LOAN', employee: { id: 'e1', code: 'E1', name: 'Wasim' }, principal: '3000.00', installmentAmount: '1000.00', firstMonth: '2026-11',
  expectedEnd: '2027-01-31', status: 'ACTIVE', recovered: '0.00', outstanding: '3000.00', nextDue: { date: '2026-11-30', amount: '1000.00' },
  installments: [{ id: 'n1', number: 1, dueDate: '2026-11-30', amount: '1000.00', status: 'SCHEDULED' }, { id: 'n2', number: 2, dueDate: '2026-12-31', amount: '1000.00', status: 'SCHEDULED' }, { id: 'n3', number: 3, dueDate: '2027-01-31', amount: '1000.00', status: 'SCHEDULED' }],
  repayments: [],
};

let calls: { path: string; method: string; body: any }[];
let container: HTMLDivElement;
let root: Root;
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  granted = new Set(['payroll.view', 'payroll.inputs.manage', 'payroll.inputs.approve', 'payroll.overtime.approve', 'payroll.loans.manage', 'salary.view']);
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    calls.push({ path, method, body });
    if (path === '/payroll/inputs' && method === 'GET') return ok({ month: '2026-10', finalized: false, entries: [entry()] });
    if (path === '/payroll/inputs' && method === 'POST') return ok({ month: '2026-10', finalized: false, entries: [entry(), entry({ id: 'i2', amount: body.amount })] });
    if (path === '/payroll/inputs/components') return ok([{ id: 'c1', code: 'BONUS', name: 'Bonus', category: 'EARNING' }]);
    if (path === '/payroll/calculation/employees') return ok([{ id: 'e1', code: 'E1', name: 'Wasim', status: 'ACTIVE', hasSalary: true }]);
    if (path === '/payroll/inputs/i1/approve') return ok({ month: '2026-10', finalized: false, entries: [entry({ status: 'APPROVED', approvedBy: 'Appu' })] });
    if (path === '/payroll/overtime') return ok([otDay('2026-09-01'), otDay('2026-09-06', { attendanceStatus: 'WEEKEND', recordedMinutes: 120 })]);
    if (path === '/payroll/overtime/decisions') return ok({ decided: body.decisions.length });
    if (path === '/payroll/loans' && method === 'GET') return ok([loan]);
    if (path === '/payroll/loans' && method === 'POST') return ok(loan);
    if (path === '/payroll/loans/l1') return ok(loan);
    if (path === '/payroll/loans/l1/installments/n1/defer') return ok({ ...loan, installments: [{ ...loan.installments[0], status: 'DEFERRED' }, ...loan.installments.slice(1)] });
    return new Response('{}', { status: 404 });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return (document.getElementById(label?.getAttribute('for') ?? '') ?? document.querySelector(`[aria-label="${text}"]`)) as HTMLInputElement & HTMLSelectElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };

describe('monthly entries', () => {
  it('shows what waits for approval, adds an entry, and approves', async () => {
    await render(<MonthlyEntriesTab />);
    expect(document.body.textContent).toContain('1 entry is waiting for approval');
    await click(button('New entry'));
    setValue(byLabel('Employee'), 'e1');
    setValue(byLabel('Component'), 'c1');
    setValue(byLabel('Amount'), '1500');
    await click(button('Save entry'));
    expect(calls.find((c) => c.path === '/payroll/inputs' && c.method === 'POST')?.body).toMatchObject({ employeeId: 'e1', salaryComponentId: 'c1', amount: '1500' });
    await click(button('Approve'));
    expect(calls.some((c) => c.path === '/payroll/inputs/i1/approve')).toBe(true);
    expect(document.body.textContent).toContain('approved by Appu');
  });

  it('offers no changes to people who can only view', async () => {
    granted = new Set(['payroll.view']);
    await render(<MonthlyEntriesTab />);
    expect(button('New entry')).toBeUndefined();
    expect(button('Approve')).toBeUndefined();
  });
});

describe('overtime approval', () => {
  it('approves part of a day, or everything waiting at once', async () => {
    await render(<OvertimeTab />);
    expect(document.body.textContent).toContain('Weekly off');
    setValue(document.querySelector('input[type=number]') as HTMLInputElement, '60');
    await click([...document.querySelectorAll('button')].filter((b) => b.textContent === 'Approve')[0]);
    expect(calls.find((c) => c.path === '/payroll/overtime/decisions')?.body).toEqual({ decisions: [{ employeeId: 'e1', date: '2026-09-01', decision: 'APPROVED', approvedMinutes: 60 }] });
    await click(button('Approve all 2 waiting'));
    expect(calls.filter((c) => c.path === '/payroll/overtime/decisions')[1].body.decisions).toHaveLength(2);
  });
});

describe('loans', () => {
  it('records a loan with its recovery plan and can skip a month', async () => {
    await render(<LoansTab />);
    expect(document.body.textContent).toContain('LN-2026-0001');
    await click(button('New loan or advance'));
    setValue(byLabel('Employee'), 'e1');
    setValue(byLabel('Amount given'), '3000');
    setValue(byLabel('Number of monthly instalments'), '3');
    await click(button('Record and schedule recovery'));
    expect(calls.find((c) => c.path === '/payroll/loans' && c.method === 'POST')?.body).toMatchObject({ employeeId: 'e1', loanType: 'LOAN', principal: '3000', installments: 3 });
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('2027-01');
    await click(button('Skip this month'));
    setValue(byLabel('Why'), 'Medical emergency');
    await click([...document.querySelectorAll('[role=dialog] button')].filter((b) => b.textContent === 'Skip this month').pop() as HTMLButtonElement);
    expect(calls.find((c) => c.path === '/payroll/loans/l1/installments/n1/defer')?.body).toEqual({ reason: 'Medical emergency' });
    expect(document.body.textContent).toContain('Moved to the end');
  });
});
