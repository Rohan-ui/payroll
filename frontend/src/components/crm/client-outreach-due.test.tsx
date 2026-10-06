import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../../api/client';
import SLeadCadenceCenter from './SLeadCadenceCenter';

/**
 * Client Outreach by due date, through the real screen (API stubbed): it opens
 * on today's touchpoints, the date and "my leads" choices go to the server,
 * each card says when its touchpoint is due, columns count what is due, a
 * touchpoint can be rescheduled, and the calendar opens a day's touchpoints.
 */

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock('../../api/client', () => ({ apiFetch: vi.fn(), apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/industryTaxonomy', () => ({
  useTenantIndustries: () => ({ industries: [], getSubIndustries: () => [] }),
  getSubIndustries: () => [], getIndustryLabel: (value: string) => value, getSubIndustryLabel: (_: string, value: string) => value,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STEP = { id: 'step-1', dayNumber: 1, title: 'Triple Platform Launch', goal: 'First contact', channels: ['EMAIL'], templates: {} };
const card = (id: string, company: string, due: Record<string, unknown>) => ({
  id, company_name: company, first_name: 'Asha', cadence: { status: 'ACTIVE' }, currentStep: { ...STEP, ...due },
});

let container: HTMLDivElement;
let root: Root;
let requests: { url: string; method: string; body: any }[] = [];

beforeEach(() => {
  requests = [];
  vi.mocked(apiFetch).mockImplementation(async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    requests.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (url.startsWith('/api/v1/crm/cadence/calendar')) {
      return new Response(JSON.stringify({ success: true, data: { month: '2026-10', today: '2026-10-08', days: { '2026-10-09': 3, '2026-10-12': 1 }, overdue: 2, holidays: ['2026-10-20'] } }));
    }
    if (method === 'POST') return new Response(JSON.stringify({ success: true, data: { dueOn: '2026-10-15', message: 'Day 1 (Triple Platform Launch) moved to 2026-10-15' } }));
    return new Response(JSON.stringify({
      success: true,
      data: {
        sop: { name: '30-Day Multi-Touch SOP', milestones: 1, days: 30 },
        masterSteps: [STEP],
        schedule: { today: '2026-10-08', timeZone: 'Asia/Kolkata', due: { filter: 'TODAY', from: '2026-10-08', to: '2026-10-08', withOverdue: true } },
        stats: { totalEnrolled: 5, activeCount: 5, dueTodayCount: 1, overdueCount: 1, branchedCount: 0, convertedCount: 0, completedCount: 0, platformCounts: {} },
        facets: { enrolledCount: 5, industryCounts: {}, subIndustryCounts: {}, milestoneCounts: { 'step-1': 5 }, milestoneDueCounts: { 'step-1': 2 } },
        pagination: { page: 1, total: 3, totalPages: 1, hasMore: false },
        radar: { allActive: [
          card('late', 'Late Co', { dueOn: '2026-10-06', dueStatus: 'OVERDUE', overdueDays: 2 }),
          card('now', 'Now Co', { dueOn: '2026-10-08', dueStatus: 'DUE_TODAY', overdueDays: 0 }),
          card('soon', 'Soon Co', { dueOn: '2026-10-09', dueStatus: 'UPCOMING', overdueDays: 0 }),
        ] },
      },
    }));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const lastBoardQuery = () => new URL(requests.filter((r) => r.url.startsWith('/api/v1/crm/cadence?')).at(-1)!.url, 'http://x').searchParams;
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const button = (text: string, scope: ParentNode = container) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const render = async () => {
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await flush();
};

it('opens on today’s touchpoints, and asks the server for the date and the leads chosen', async () => {
  await render();
  expect(lastBoardQuery().get('due')).toBe('TODAY');
  expect(lastBoardQuery().get('mine')).toBeNull();
  expect(container.textContent).toContain('Showing touchpoints due Thu, 8 Oct, with overdue ones first.');
  setValue(container.querySelector('select[aria-label="Due"]') as HTMLSelectElement, 'TOMORROW');
  await flush();
  expect(lastBoardQuery().get('due')).toBe('TOMORROW');
  setValue(container.querySelector('select[aria-label="Due"]') as HTMLSelectElement, 'DATE');
  setValue(container.querySelector('input[aria-label="Due date"]') as HTMLInputElement, '2026-10-20');
  await flush();
  expect(Object.fromEntries(lastBoardQuery())).toMatchObject({ due: 'DATE', dueDate: '2026-10-20' });
  act(() => button('My leads')!.click());
  await flush();
  expect(lastBoardQuery().get('mine')).toBe('true');
});

it('says on every card when its touchpoint is due, and counts what is due in each column', async () => {
  await render();
  expect(container.textContent).toContain('Overdue by 2 days (was due Tue, 6 Oct)');
  expect(container.textContent).toContain('Due today');
  expect(container.textContent).toContain('Due Fri, 9 Oct');
  expect(container.textContent).toContain('2 due · 5 total');
  const order = ['Late Co', 'Now Co', 'Soon Co'].map((name) => container.textContent!.indexOf(name));
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

it('reschedules a touchpoint to a chosen date and reloads', async () => {
  await render();
  const loads = requests.filter((r) => r.url.startsWith('/api/v1/crm/cadence?')).length;
  act(() => [...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Reschedule')[0].click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('Reschedule Day 1 for Late Co');
  expect((dialog.querySelector('input[type="date"]') as HTMLInputElement).min).toBe('2026-10-08');
  setValue(dialog.querySelector('input[type="date"]') as HTMLInputElement, '2026-10-15');
  setValue(dialog.querySelectorAll('input')[1] as HTMLInputElement, 'Asked to call after Dussehra');
  await act(async () => button('Move to Thu, 15 Oct', dialog)!.click());
  await flush();
  expect(requests.find((r) => r.method === 'POST')?.body).toEqual({ action: 'RESCHEDULE', leadId: 'late', dueDate: '2026-10-15', notes: 'Asked to call after Dussehra' });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(requests.filter((r) => r.url.startsWith('/api/v1/crm/cadence?')).length).toBeGreaterThan(loads);
});

it('shows how much is due each day of the month, and opens a day’s touchpoints', async () => {
  await render();
  act(() => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Calendar')!.click());
  await flush();
  expect(requests.some((r) => r.url === '/api/v1/crm/cadence/calendar?month=2026-10')).toBe(true);
  const day9 = container.querySelector('button[aria-label^="2026-10-09"]')!;
  expect(day9.getAttribute('aria-label')).toBe('2026-10-09: 3 touchpoints due');
  expect(container.querySelector('button[aria-label^="2026-10-20"]')!.getAttribute('aria-label')).toContain('holiday');
  expect(container.textContent).toContain("2 overdue — open today's list");
  act(() => (day9 as HTMLButtonElement).click());
  await flush();
  expect(Object.fromEntries(lastBoardQuery())).toMatchObject({ due: 'DATE', dueDate: '2026-10-09' });
});
