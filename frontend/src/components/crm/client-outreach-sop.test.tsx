import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../../api/client';
import SLeadCadenceCenter from './SLeadCadenceCenter';

/**
 * The Client Outreach board draws its milestones from the playbook the server
 * sends (CRM Masters), in that order, with that step's title and channels and
 * the server's lead counts; replies and conversions are shown apart from the
 * milestones.
 */

vi.mock('../../api/client', () => ({ apiFetch: vi.fn(), apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/industryTaxonomy', () => ({
  useTenantIndustries: () => ({ industries: [], getSubIndustries: () => [] }),
  getSubIndustries: () => [], getIndustryLabel: (value: string) => value, getSubIndustryLabel: (_: string, value: string) => value,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STEPS = [
  { id: 'step-1', dayNumber: 1, title: 'Triple Platform Launch', goal: 'First contact', channels: ['LINKEDIN', 'EMAIL', 'WHATSAPP'], templates: {} },
  { id: 'step-10', dayNumber: 10, title: 'Day 10: Value & Tip', goal: 'Free insight', channels: ['EMAIL', 'WHATSAPP'], templates: {} },
  { id: 'step-5', dayNumber: 5, title: 'Customer Success Story', goal: 'Proof', channels: ['EMAIL', 'LINKEDIN'], templates: {} },
];
const lead = (id: string, company: string, extra: Record<string, unknown>) => ({ id, company_name: company, first_name: 'Asha', ...extra });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({
    success: true,
    data: {
      sop: { name: '30-Day Multi-Touch SOP', milestones: 3, days: 10 },
      masterSteps: STEPS,
      stats: { totalEnrolled: 140, activeCount: 120, dueTodayCount: 0, overdueCount: 0, branchedCount: 12, convertedCount: 8, completedCount: 0, platformCounts: {} },
      facets: { enrolledCount: 140, industryCounts: {}, subIndustryCounts: {}, milestoneCounts: { 'step-1': 100, 'step-5': 20 } },
      pagination: { page: 1, total: 140, totalPages: 3, hasMore: true },
      radar: {
        allActive: [
          lead('a', 'At Day 5 Co', { cadence: { status: 'ACTIVE' }, currentStep: { ...STEPS[2], dueStatus: 'UPCOMING' } }),
          lead('b', 'At Day 1 Co', { cadence: { status: 'ACTIVE' }, currentStep: { ...STEPS[0], dueStatus: 'UPCOMING' } }),
        ],
        branched: [lead('c', 'Replied Co', { cadence: { status: 'BRANCHED' }, currentStep: STEPS[0] })],
        converted: [lead('d', 'Converted Co', { cadence: { status: 'CONVERTED', convertedToOpportunity: true }, currentStep: STEPS[0] })],
      },
    },
  })));
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

it('draws exactly the playbook’s milestones, in its order, with their channels and the server’s counts', async () => {
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await flush();
  const columns = [...container.querySelectorAll('h3')].filter((h) => /^Day \d/.test(h.textContent ?? ''));
  expect(columns.map((h) => h.textContent)).toEqual(['Day 1: Triple Platform Launch', 'Day 10: Value & Tip', 'Day 5: Customer Success Story']);
  const header = (title: string) => columns.find((h) => h.textContent === title)!.closest('div.p-3\\.5')!;
  expect(header('Day 1: Triple Platform Launch').textContent).toContain('100');
  expect(header('Day 10: Value & Tip').textContent).toContain('0');
  expect(header('Day 5: Customer Success Story').textContent).toContain('20');
  expect([...header('Day 5: Customer Success Story').querySelectorAll('span.text-\\[9px\\]')].map((s) => s.textContent)).toEqual(['EM', 'LI']);
  // Each lead sits under the step the server says it is at.
  const column = (title: string) => header(title).parentElement!;
  expect(column('Day 5: Customer Success Story').textContent).toContain('At Day 5 Co');
  expect(column('Day 1: Triple Platform Launch').textContent).toContain('At Day 1 Co');
  expect(container.textContent).toContain('3 milestones');
  expect(container.textContent).not.toContain('Branched / Responded');
});

it('shows no replied or converted columns, only the playbook’s milestones', async () => {
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await flush();
  const headings = [...container.querySelectorAll('div.p-3\\.5 h3')].map((h) => h.textContent);
  expect(headings).toEqual(['Day 1: Triple Platform Launch', 'Day 10: Value & Tip', 'Day 5: Customer Success Story']);
  expect(container.querySelector('section[aria-label="Outside the playbook"]')).toBeNull();
  expect(container.textContent).not.toContain('Replied Co');
  expect(container.textContent).not.toContain('Converted Co');
});
