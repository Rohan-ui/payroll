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

it('keeps “Mark Day complete” off until each message of the day is sent, with “not on LinkedIn” for leads without a profile', async () => {
  const board = vi.mocked(apiFetch).getMockImplementation()!;
  const actions: Record<string, unknown> = {};
  const posted: { url: string; body: any }[] = [];
  vi.mocked(apiFetch).mockImplementation(async (url, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (init?.method === 'POST') posted.push({ url: String(url), body });
    if (url === '/api/v1/crm/cadence/channel-action') {
      const state = body.action === 'NOT_AVAILABLE'
        ? { status: 'NOT_AVAILABLE', executedBy: { name: 'Ravi Shah' }, markedAt: '2026-10-08T05:00:00Z', ...(body.reason ? { reason: body.reason } : {}) }
        : { status: body.action === 'MARKED_SENT' ? 'SENT' : 'OPENED', executedBy: { name: 'Ravi Shah' }, sentAt: '2026-10-08T05:00:00Z' };
      actions[body.channel] = state;
      return new Response(JSON.stringify({ success: true, data: { channel: body.channel, action: body.action, channelActions: { ...actions }, state, touchpointCompleted: false, message: 'Recorded' } }));
    }
    if (url === '/api/v1/crm/cadence' && init?.method === 'POST') return new Response(JSON.stringify({ success: true, data: { success: true } }));
    return board(url, init);
  });
  const settle = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
  const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await settle();
  act(() => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Execute')!.click());

  const complete = button('Mark Day 1 Complete');
  expect(complete.disabled).toBe(true);
  expect(document.getElementById('day-complete-blocked')?.textContent).toBe('To complete Day 1: send the WhatsApp message, send the LinkedIn message (or mark the lead as not on LinkedIn).');
  // While LinkedIn is still to do, sending WhatsApp can't complete the day from there.
  expect(document.body.textContent).not.toContain('Mark Day 1 complete too');

  await act(async () => button('I’ve sent it').click());
  await settle();
  expect(posted.find((p) => p.body?.channel === 'WHATSAPP')?.body).toMatchObject({ action: 'MARKED_SENT', completeTouchpoint: false });
  expect(button('Mark Day 1 Complete').disabled).toBe(true);

  // Rajesh's profile turned out not to be his: he isn't on LinkedIn.
  act(() => button('This lead isn’t on LinkedIn').click());
  const reason = document.querySelector('input[placeholder^="e.g. Searched"]') as HTMLInputElement;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(reason, 'Wrong person'); reason.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button('Mark: not on linkedin').click());
  await settle();
  expect(posted.find((p) => p.body?.action === 'NOT_AVAILABLE')?.body).toEqual({ leadId: 'rajesh', channel: 'LINKEDIN', action: 'NOT_AVAILABLE', reason: 'Wrong person' });
  expect(document.body.textContent).toContain('Day 1 doesn’t wait for a LinkedIn message. Reason: Wrong person');

  expect(button('Mark Day 1 Complete').disabled).toBe(false);
  expect(document.getElementById('day-complete-blocked')).toBeNull();
  await act(async () => button('Mark Day 1 Complete').click());
  await settle();
  expect(posted.filter((p) => p.url === '/api/v1/crm/cadence').map((p) => p.body.action)).toEqual(['COMPLETE_STEP']);
});

it('offers “no WhatsApp number” only for a lead without one', async () => {
  const board = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation(async (url, init) => {
    const response = await board(url, init);
    const json = await response.json();
    if (json?.data?.radar) json.data.radar.allActive = [{ ...LEAD, phone: null }];
    return new Response(JSON.stringify(json));
  });
  await act(async () => root.render(<SLeadCadenceCenter onSelectLead360={() => undefined} />));
  await act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
  act(() => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Execute')!.click());
  expect([...document.querySelectorAll('button')].some((b) => b.textContent?.includes('This lead has no WhatsApp number'))).toBe(true);
  expect([...document.querySelectorAll('a')].some((a) => a.textContent?.includes('Open WhatsApp'))).toBe(false);
});
