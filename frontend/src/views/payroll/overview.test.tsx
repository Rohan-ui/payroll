import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The payroll overview through the real screen (API stubbed). */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const { PayrollOverviewTab } = await import('./PayrollOverviewTab');

const totals = { totalCost: '612480.00', earnings: '600000.00', deductions: '47940.00', employerContributions: '12480.00', net: '552060.00', employees: 276, ready: 272, exceptions: 4 };
const OVERVIEW = {
  month: '2026-09', currency: 'INR',
  period: { id: 'p1', start: '2026-09-01', end: '2026-09-30', paymentDate: '2026-09-30' },
  run: { id: 'r1', number: '1', status: 'CALCULATED', calculatedAt: '', approvedAt: null, finalizedAt: null },
  summary: totals,
  previous: { month: '2026-08', ...totals, totalCost: '594000.00' },
  changes: { totalCost: '3.1', deductions: '-1.9', employerContributions: '0.0', employees: '1.2' },
  trend: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 10).padStart(2, '0')}`.replace('2025-13', '2026-01'), totalCost: i === 11 ? '612480.00' : null, status: i === 11 ? 'CALCULATED' : null })),
  readiness: { activeEmployees: 280, withoutSalary: 4 },
};
const employee = (n: number, extra: Record<string, unknown> = {}) => ({
  employeeId: `e${n}`, name: `Person ${n}`, code: `E${n}`, department: 'Sales', designation: 'Executive', gross: '30000.00', deductions: '1800.00', net: '28200.00',
  status: 'READY', problem: null, payslipNumber: null, payment: null, paymentDate: '2026-09-30', ...extra,
});

let calls: string[];
let overview: typeof OVERVIEW | (Omit<typeof OVERVIEW, 'run' | 'summary' | 'changes'> & { run: null; summary: null; changes: null });
let container: HTMLDivElement;
let root: Root;
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  overview = OVERVIEW;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace(/^.*\/api\/v1/, '');
    calls.push(path);
    if (path.startsWith('/payroll/dashboard/employees')) {
      const status = new URLSearchParams(path.split('?')[1]).get('status');
      const page = Number(new URLSearchParams(path.split('?')[1]).get('page'));
      const items = status === 'EXCEPTION' ? [employee(9, { status: 'EXCEPTION', problem: 'No attendance on 1 working day: 2026-09-10.' })] : [employee(page * 2 - 1), employee(page * 2)];
      return ok({ total: status === 'EXCEPTION' ? 1 : 25, page, limit: 20, counts: { all: 276, ready: 272, exceptions: 4, finalized: 0 }, items });
    }
    if (path.startsWith('/payroll/dashboard')) return ok(overview);
    return new Response('{}', { status: 404 });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const setValue = (el: HTMLInputElement, value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const render = async (onNavigate = vi.fn()) => {
  await act(async () => root.render(<PayrollOverviewTab onNavigate={onNavigate} />));
  await settle();
  setValue(document.querySelector('input[type=month]') as HTMLInputElement, '2026-09');
  await settle();
  return onNavigate;
};

describe('payroll overview', () => {
  it('summarises the month with figures, changes and the run’s progress', async () => {
    await render();
    expect(document.querySelector('h1')?.textContent).toBe('Payroll');
    expect(document.body.textContent).toContain('276 employees in September 2026 payroll, costing ₹6,12,480 in total. 4 need attention before approval.');
    expect(document.body.textContent).toContain('+3.1%');
    expect(document.body.textContent).toContain('-1.9%');
    expect(document.body.textContent).toContain('Pay on 30 Sept 2026');
    expect(document.querySelector('[aria-label="Pay run progress"]')?.textContent).toContain('Calculated (done)');
    expect(document.querySelector('[aria-label="Pay run progress"]')?.textContent).toContain('Approved (to do)');
    expect(document.body.textContent).toContain('4 of 280 active employees have no salary');
  });

  it('leads to the exceptions and sends the right next step', async () => {
    const onNavigate = await render();
    await click(button('Resolve 4 exceptions'));
    expect(onNavigate).toHaveBeenCalledWith('preview');
    await click([...document.querySelectorAll('dd button')][0] as HTMLButtonElement);
    expect(calls.some((c) => c.includes('/payroll/dashboard/employees') && c.includes('status=EXCEPTION'))).toBe(true);
    expect(document.body.textContent).toContain('No attendance on 1 working day');
    expect(document.body.textContent).toContain('Needs attention');
  });

  it('pages and searches employees on the server, and never claims payment that isn’t recorded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await render();
    expect(document.body.textContent).toContain('1–20 of 25');
    expect(document.body.textContent).toContain('Due 30 Sept 2026');
    expect(document.body.textContent).not.toMatch(/\bPaid\b/);
    await click(button('Next'));
    expect(calls.some((c) => c.includes('page=2'))).toBe(true);
    setValue(document.querySelector('input[type=search]') as HTMLInputElement, 'pers');
    await act(async () => { vi.advanceTimersByTime(350); });
    await settle();
    expect(calls.some((c) => c.includes('search=pers') && c.includes('page=1'))).toBe(true);
  });

  it('explains an uncalculated month instead of showing zeros', async () => {
    overview = { ...OVERVIEW, run: null, summary: null, changes: null };
    const onNavigate = await render();
    expect(document.body.textContent).toContain('September 2026 payroll hasn’t been calculated yet.');
    expect(document.body.textContent).toContain('Not calculated yet');
    await click(button('Calculate Sept payroll'));
    expect(onNavigate).toHaveBeenCalledWith('run');
  });
});
