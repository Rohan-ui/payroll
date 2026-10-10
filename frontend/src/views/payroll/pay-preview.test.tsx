import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The pay preview: choose a month and employee, see each line with how it was worked out, and what stops pay. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const { PayPreviewTab } = await import('./PayPreviewTab');

const ATTENDANCE = {
  calendarDays: 30, workingDays: 26, presentDays: '23', halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 3, holidays: 0, weeklyOffs: 4, missingDays: 0,
  notEmployedDays: 0, paidDays: '27', unpaidDays: '3', workedMinutes: 11040, payableMinutes: 11040, lateCount: 0, lateMinutes: 0, earlyCount: 0, earlyMinutes: 0, overtimeMinutes: 0,
};
const pay = (extra: Record<string, unknown> = {}) => ({
  employee: { id: 'e1', code: 'E1', name: 'Priya Shah' }, period: { start: '2026-09-01', end: '2026-09-30' }, status: 'READY', exceptions: [], warnings: [], currency: 'INR',
  segments: [{ from: '2026-09-01', to: '2026-09-30', structure: { code: 'STD', name: 'Standard', version: 1 }, policy: { code: 'STANDARD', name: 'Standard', version: 1, reason: 'Default' }, payBasis: 'MONTHLY', variables: { DIVISOR: '30', PRORATION: '0.9' } }],
  attendance: ATTENDANCE,
  lines: [{ salaryComponentId: 'c1', componentCode: 'BASIC', componentName: 'Basic', componentCategory: 'EARNING', calculationType: 'PERCENTAGE', amount: '13500.00', displayOrder: 10, showOnPayslip: true, source: 'STRUCTURE', steps: ['50% of MONTHLY_SALARY (30000) = 15000', '× paid share of the month 0.9 = 13500.00'] }],
  totals: { earnings: '13500.00', deductions: '0.00', employerContributions: '0.00', gross: '13500.00', netBeforeRounding: '13500.00', roundingAdjustment: '0.00', net: '13500.00' },
  ...extra,
});

let calls: string[];
let result: ReturnType<typeof pay>;
let container: HTMLDivElement;
let root: Root;
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  result = pay();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace(/^.*\/api\/v1/, '');
    calls.push(path);
    if (path.startsWith('/payroll/calculation/employees')) return ok([{ id: 'e1', code: 'E1', name: 'Priya Shah', status: 'ACTIVE', hasSalary: true }, { id: 'e2', code: 'E2', name: 'No Salary', status: 'ACTIVE', hasSalary: false }]);
    if (path.startsWith('/payroll/calculation/preview')) return ok(result);
    return new Response('{}', { status: 404 });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const select = (label: string) => document.getElementById([...document.querySelectorAll('label')].find((l) => l.textContent === label)?.getAttribute('for') ?? '') as HTMLSelectElement & HTMLInputElement;
const setValue = (el: HTMLSelectElement | HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});

describe('pay preview', () => {
  it('explains each line and the days behind it, and flags people without a salary', async () => {
    await act(async () => root.render(<PayPreviewTab />));
    await settle();
    setValue(select('Month'), '2026-09');
    await settle();
    expect(document.body.textContent).toContain('1 active employee has no salary for this month');
    setValue(select('Employee'), 'e1');
    await settle();
    expect(calls).toContain('/payroll/calculation/preview?employeeId=e1&month=2026-09');
    expect(document.body.textContent).toContain('Ready to pay');
    expect(document.body.textContent).toContain('× paid share of the month 0.9 = 13500.00');
    expect(document.body.textContent).toContain('Standard v1 · Monthly salary · Standard v1');
    expect(document.body.textContent).toMatch(/Unpaid days\s*3/);
  });

  it('says plainly what stops an employee being paid', async () => {
    result = pay({ status: 'EXCEPTION', exceptions: ['No attendance on 1 working day: 2026-09-10. Record it, or set the policy to count such days unpaid.'] });
    await act(async () => root.render(<PayPreviewTab />));
    await settle();
    setValue(select('Month'), '2026-09');
    await settle();
    setValue(select('Employee'), 'e1');
    await settle();
    expect(document.body.textContent).toContain('Needs attention');
    expect(document.querySelector('[role=alert]')?.textContent).toContain('No attendance on 1 working day: 2026-09-10');
  });
});
