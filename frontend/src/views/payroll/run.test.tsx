import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Running a month's payroll through the real screen (API stubbed): every step is a server call. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { PayrollRunTab } = await import('./PayrollRunTab');

const totals = (exceptions: number) => ({ totalCost: '61248.00', earnings: '60000.00', deductions: '3600.00', employerContributions: '1248.00', net: '56400.00', employees: 3, ready: 3 - exceptions, exceptions });
const base = { month: '2026-09', currency: 'INR', period: { id: 'p1', start: '2026-09-01', end: '2026-09-30', paymentDate: null }, previous: null, changes: null, trend: [], readiness: { activeEmployees: 3, withoutSalary: 0 } };
let state: 'none' | 'DRAFT' | 'EXCEPTIONS' | 'CALCULATED' | 'APPROVED' | 'FINALIZED';
const overview = () => ({
  ...base,
  run: state === 'none' ? null : { id: 'r1', number: 'RUN-1', status: state === 'EXCEPTIONS' ? 'CALCULATED' : state, calculatedAt: state === 'DRAFT' ? null : 'x', approvedAt: null, finalizedAt: state === 'FINALIZED' ? '2026-10-01T10:00:00Z' : null },
  summary: state === 'none' || state === 'DRAFT' ? null : totals(state === 'EXCEPTIONS' ? 1 : 0),
});

let calls: { path: string; method: string; body: unknown }[];
let container: HTMLDivElement;
let root: Root;
const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  granted = new Set(['payroll.view', 'payroll.create', 'payroll.process', 'payroll.approve', 'payroll.finalize', 'salary.view']);
  calls = [];
  state = 'none';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^.*\/api\/v1/, '');
    const method = init.method ?? 'GET';
    calls.push({ path, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : null });
    if (path.startsWith('/payroll/dashboard/employees')) return ok({ success: true, data: { total: 0, page: 1, limit: 20, counts: { all: 3, ready: 2, exceptions: 1, finalized: 0 }, items: [] } });
    if (path.startsWith('/payroll/dashboard')) return ok({ success: true, data: overview() });
    if (path === '/payroll/months/2026-09/start') { state = 'DRAFT'; return ok({ success: true, data: { id: 'r1' } }); }
    if (path === '/payroll/runs/r1/calculate') { state = state === 'DRAFT' ? 'EXCEPTIONS' : 'CALCULATED'; return ok({ id: 'r1' }); }
    if (path === '/payroll/runs/r1/approve') { state = 'APPROVED'; return ok({ id: 'r1' }); }
    if (path === '/payroll/runs/r1/finalize') { state = 'FINALIZED'; return ok({ id: 'r1' }); }
    return new Response('{}', { status: 404 });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const settle = () => act(async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const text = () => document.body.textContent ?? '';

describe('payroll run', () => {
  it('starts, calculates, holds for exceptions, then approves and finalizes on the server', async () => {
    await act(async () => root.render(<PayrollRunTab month="2026-09" onMonthChange={() => undefined} />));
    await settle();
    expect(text()).toContain('September 2026 payroll hasn’t started');
    await click(button('Start September 2026 payroll'));
    expect(calls.some((c) => c.path === '/payroll/months/2026-09/start' && c.method === 'POST')).toBe(true);

    await click(button('Calculate payroll'));
    expect(text()).toContain('1 employee needs attention');
    expect(button('Approve payroll')).toBeUndefined();

    await click(button('Recalculate'));
    expect(text()).toContain('Everyone’s pay is ready');
    await click(button('Approve payroll'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Once approved, this payroll can’t be recalculated.');
    await click(button('Approve 3 employees'));
    expect(calls.some((c) => c.path === '/payroll/runs/r1/approve')).toBe(true);

    await click(button('Finalize payroll'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Finalized payslips can’t be recalculated in place.');
    await click(button('Finalize and issue payslips'));
    expect(calls.some((c) => c.path === '/payroll/runs/r1/finalize')).toBe(true);
    expect(text()).toContain('September 2026 payroll is finalized');
    expect(text()).toContain('No payment is recorded yet.');
  });

  it('offers only the steps a member may take', async () => {
    granted = new Set(['payroll.view']);
    state = 'CALCULATED';
    await act(async () => root.render(<PayrollRunTab month="2026-09" onMonthChange={() => undefined} />));
    await settle();
    expect(button('Approve payroll')).toBeUndefined();
    expect(text()).toContain('You don’t have permission to approve payroll.');
  });
});
