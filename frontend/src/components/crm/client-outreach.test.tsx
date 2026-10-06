import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../../api/client';
import SLeadCadenceCenter from './SLeadCadenceCenter';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock('../../api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/industryTaxonomy', () => ({
  useTenantIndustries: () => ({
    industries: [{ key: 'manufacturing', name: 'Manufacturing' }],
    getSubIndustries: () => [{ key: 'engineering_wire', name: 'Engineering Wire' }],
  }),
  getSubIndustries: () => [], getIndustryLabel: (value: string) => value, getSubIndustryLabel: (_: string, value: string) => value,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const requests: URLSearchParams[] = [];
const latestRequest = () => requests[requests.length - 1];
const response = (company = 'Loaded prospect', page = 1, total = 152) => new Response(JSON.stringify({
  success: true, data: {
    stats: { totalEnrolled: 152, activeCount: 152, dueTodayCount: 152, overdueCount: 0, convertedCount: 0 },
    masterSteps: [{ id: 'step-1', dayNumber: 1, title: 'Triple Platform Launch', goal: 'First contact', channels: ['EMAIL'], templates: {} }],
    facets: { enrolledCount: 152, industryCounts: { manufacturing: 152 }, subIndustryCounts: { engineering_wire: 102 } },
    pagination: { page, total, totalPages: Math.ceil(total / 50), hasMore: page * 50 < total },
    radar: { allActive: [{ id: 'lead-151', company_name: company, first_name: 'Asha', industry: 'Manufacturing', sub_industry: 'Engineering Wire',
      cadence: { status: 'ACTIVE' }, currentStep: { id: 'step-1', dayNumber: 1, channels: ['EMAIL'], dueStatus: 'DUE_TODAY', templates: {} } }] },
  },
}));
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const chooseIndustry = () => act(() => {
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Industry"]')!;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'manufacturing');
  select.dispatchEvent(new Event('change', { bubbles: true }));
});

beforeEach(() => {
  vi.useFakeTimers();
  requests.length = 0;
  vi.mocked(apiFetch).mockImplementation(async (url) => {
    const params = new URL(url, 'http://localhost').searchParams;
    requests.push(params);
    return response(params.get('search') ? 'Server search result' : 'Loaded prospect', Number(params.get('page')));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('fetches 50 per page, resets filters to page one and searches on the server', async () => {
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await flush();
  expect(requests[0].get('limit')).toBe('50');
  expect(container.textContent).toContain('1-50 of 152 leads');
  act(() => button('Next page').click());
  await flush();
  expect(latestRequest().get('page')).toBe('2');
  expect(container.textContent).toContain('51-100 of 152 leads');
  chooseIndustry();
  await flush();
  expect(latestRequest().get('page')).toBe('1');
  expect(latestRequest().get('industry')).toBe('manufacturing');
  act(() => [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Engineering Wire'))!.click());
  await flush();
  expect(latestRequest().get('subIndustry')).toBe('engineering_wire');
  act(() => {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search outreach leads"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Rare company');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTime(300));
  await flush();
  expect(latestRequest().get('search')).toBe('Rare company');
  expect(container.textContent).toContain('Server search result');
});

it('ignores an older page response after changing filters and offers retry on failure', async () => {
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await flush();
  let finishOld: (value: Response) => void = () => undefined;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  act(() => button('Next page').click());
  chooseIndustry();
  await flush();
  await act(async () => finishOld(response('Stale prospect', 2)));
  expect(container.textContent).not.toContain('Stale prospect');
  expect(container.textContent).toContain('1-50 of 152 leads');
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Network failed'));
  act(() => button('Next page').click());
  await flush();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
  act(() => [...container.querySelectorAll('button')].find(b => b.textContent === 'Retry')!.click());
  await flush();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
