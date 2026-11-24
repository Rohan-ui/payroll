import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reports: only the reports the member may run, each saying what it holds,
 * exported from the server with the chosen dates; a refusal shows in the card.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
const saved: string[] = [];
vi.mock('../utils/download', () => ({ saveFile: (_: Blob, name: string) => saved.push(name) }));
const { ReportsView } = await import('./ReportsView');

const OVERVIEW = {
  people: { active: 42, onNotice: 2, inactive: 5, joinedThisMonth: 3 },
  attendance: { month: '2026-11', attendanceRate: 94, absentDays: 12, leaveDays: 8, lateMarks: 7, overtimeHours: 15 },
  leave: { pending: 4, onLeaveToday: 1, approvedDaysThisMonth: 9 },
  payroll: { latestPeriod: { code: '2026-10', employees: 40, gross: '1250000.00', deductions: '150000.00', net: '1100000.00' }, openPeriods: 1 },
  exits: null,
  sales: null,
};

let container: HTMLDivElement;
let root: Root;
let calls: string[];
let reply: (url: string) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  saved.length = 0;
  reply = (url) => url.includes('/reports/overview') ? json({ success: true, data: OVERVIEW })
    : url.includes('/payroll/periods')
    ? json([{ id: 'p1', period_code: '2026-09', period_start: '2026-09-01', period_end: '2026-09-30', period_status: 'CLOSED' }])
    : new Response(new Blob(['xlsx']), { status: 200, headers: { 'Content-Disposition': "attachment; filename*=UTF-8''attendance-2026-10.xlsx" } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(String(url)); return reply(String(url)); }));
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
const card = (title: string) => [...container.querySelectorAll('article')].find((a) => a.querySelector('h4')?.textContent === title) as HTMLElement;
const titles = () => [...container.querySelectorAll('article h4')].map((h) => h.textContent);

describe('Reports', () => {
  it('lists only the reports the member may run, each with its columns', async () => {
    granted = new Set(['reports.view', 'attendance.view', 'leads.export']);
    await act(async () => root.render(<ReportsView />));
    await settle();
    expect(titles()).toEqual(['Monthly attendance', 'CRM leads']);
    expect(card('Monthly attendance').textContent).toContain('Minutes late');
    expect(container.textContent).not.toMatch(/PF ECR|Form 16|Compliance Tracker/);
  });

  it('exports the chosen month from the server and saves the file', async () => {
    granted = new Set(['reports.view', 'attendance.view']);
    await act(async () => root.render(<ReportsView />));
    const month = card('Monthly attendance').querySelector('input[type="month"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(month, '2026-10');
      month.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const button = [...card('Monthly attendance').querySelectorAll('button')].find((b) => b.textContent?.includes('Export')) as HTMLButtonElement;
    await act(async () => button.click());
    await settle();
    expect(calls.at(-1)).toContain('/api/v1/reports/attendance?month=2026-10');
    expect(saved).toEqual(['attendance-2026-10.xlsx']);
  });

  it('exports a payroll period picked from the server’s list, and shows a refusal in the card', async () => {
    granted = new Set(['reports.view', 'payroll.view', 'salary.view']);
    await act(async () => root.render(<ReportsView />));
    await settle();
    expect((card('Payroll register').querySelector('select') as HTMLSelectElement).value).toBe('p1');
    reply = () => json({ message: 'That payroll period was not found.' }, 404);
    const button = [...card('Payroll register').querySelectorAll('button')].find((b) => b.textContent?.includes('Export')) as HTMLButtonElement;
    await act(async () => button.click());
    await settle();
    expect(calls.at(-1)).toContain('/reports/payroll-register?periodId=p1');
    expect(card('Payroll register').querySelector('[role="alert"]')?.textContent).toContain('That payroll period was not found.');
    expect(saved).toEqual([]);
  });

  it('says so when no report is available', async () => {
    granted = new Set();
    await act(async () => root.render(<ReportsView />));
    expect(container.textContent).toContain('No reports available to you');
  });

  it('shows each area’s current figures with what they mean, only for areas the member may see', async () => {
    granted = new Set(['reports.view', 'attendance.view', 'leave.view', 'payroll.view', 'salary.view']);
    await act(async () => root.render(<ReportsView />));
    await settle();
    const section = (name: string) => [...container.querySelectorAll('section')].find((x) => x.querySelector('h2')?.textContent === name) as HTMLElement;
    expect([...container.querySelectorAll('section h2')].map((h) => h.textContent)).toEqual(['Time and leave', 'Payroll']);
    expect(section('Time and leave').textContent).toContain('Attendance rate94%');
    expect(section('Time and leave').textContent).toContain('Leave requests waiting4');
    expect(section('Payroll').textContent).toContain('Net pay₹11,00,000');
    expect(section('Payroll').textContent).toContain('40 payslips issued');
    const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.startsWith('Payroll')) as HTMLButtonElement;
    act(() => tab.click());
    expect([...container.querySelectorAll('section h2')].map((h) => h.textContent)).toEqual(['Payroll']);
  });
});
