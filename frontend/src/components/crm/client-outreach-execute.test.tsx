import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../../api/client';
import SLeadCadenceCenter from './SLeadCadenceCenter';

/**
 * Executing a WhatsApp and LinkedIn touchpoint from the real Client Outreach
 * screen (API stubbed): the window links to the lead's own WhatsApp chat, with
 * the touchpoint's message filled in for the lead exactly (emoji and all), and
 * to the lead's own LinkedIn profile, never LinkedIn's home page or a search.
 */

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock('../../api/client', () => ({ apiFetch: vi.fn(), apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/industryTaxonomy', () => ({
  useTenantIndustries: () => ({ industries: [], getSubIndustries: () => [] }),
  getSubIndustries: () => [], getIndustryLabel: (value: string) => value, getSubIndustryLabel: (_: string, value: string) => value,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STEP = {
  id: 'step-1', dayNumber: 1, title: 'Triple Platform Launch', goal: 'First contact', channels: ['WHATSAPP', 'LINKEDIN'],
  dueOn: '2026-10-08', dueStatus: 'DUE_TODAY', overdueDays: 0,
  templates: {
    whatsapp: { message: "Hi {{First Name}} 👋,\n\nWe'd love to explore how Voogyo can help {{Company Name}} 🚀.\n\nLooking forward to connecting with you 😊\n\n₹12,50,000" },
    linkedin: { actionType: 'CONNECT', message: 'Hi {{First Name}} 👋, would you be open to a quick conversation this week? 🚀', actionNote: '' },
  },
};
const LEAD = {
  id: 'rajesh', company_name: 'Apex Heavy Engineering Ltd', first_name: 'Rajesh', last_name: 'Sharma', phone: '+91 98250 12345',
  linkedin_url: 'https://www.linkedin.com/in/rajesh-sharma/', cadence: { status: 'ACTIVE' }, currentStep: STEP,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({
    success: true,
    data: {
      sop: { name: '30-Day Multi-Touch SOP', milestones: 1, days: 30 },
      masterSteps: [STEP],
      schedule: { today: '2026-10-08', timeZone: 'Asia/Kolkata', due: { filter: 'TODAY', from: '2026-10-08', to: '2026-10-08', withOverdue: true } },
      stats: { totalEnrolled: 1, activeCount: 1, dueTodayCount: 1, overdueCount: 0, branchedCount: 0, convertedCount: 0, completedCount: 0, platformCounts: {} },
      facets: { enrolledCount: 1, industryCounts: {}, subIndustryCounts: {}, milestoneCounts: { 'step-1': 1 }, milestoneDueCounts: { 'step-1': 1 } },
      pagination: { page: 1, total: 1, totalPages: 1, hasMore: false },
      radar: { allActive: [LEAD] },
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

it('links to the lead’s own WhatsApp chat with the exact message, and to the lead’s own LinkedIn profile', async () => {
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
  act(() => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Execute')!.click());

  const links = [...document.querySelectorAll('a')];
  const whatsapp = links.find((a) => a.textContent?.includes('Open WhatsApp'))!;
  const expected = "Hi Rajesh 👋,\n\nWe'd love to explore how Voogyo can help Apex Heavy Engineering Ltd 🚀.\n\nLooking forward to connecting with you 😊\n\n₹12,50,000";
  expect(new URL(whatsapp.href).origin).toBe('https://api.whatsapp.com');
  expect(new URL(whatsapp.href).searchParams.get('phone')).toBe('919825012345');
  expect(new URL(whatsapp.href).searchParams.get('text')).toBe(expected);
  // The preview shows the same text, line breaks included.
  expect(document.body.textContent).toContain(expected);

  const linkedIn = links.find((a) => a.textContent?.includes('Open LinkedIn'))!;
  expect(linkedIn.href).toBe('https://www.linkedin.com/in/rajesh-sharma/');
  expect(links.some((a) => /google\.com|linkedin\.com\/?$/.test(a.href))).toBe(false);
});
