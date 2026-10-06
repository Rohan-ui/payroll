import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../api/client';
import { generateWhatsAppUrl } from '../../lib/coldMarketingCadence';
import { COPY_FAILED, copyText, normalizeLinkedInUrl, whatsAppChatUrl } from '../../lib/outreachChannels';
import { OutreachLinkedInPanel, OutreachWhatsAppPanel, type ManualChannelAction } from './OutreachManualChannels';

/**
 * Client Outreach WhatsApp and LinkedIn: the message reaches WhatsApp exactly
 * as written (emoji, Indian scripts, ₹, line breaks), the preview and the copy
 * are the same text, LinkedIn opens the lead's own conversation or profile, and
 * what is recorded is that a chat was opened or a message copied, never sent.
 */

vi.mock('../../api/client', () => ({ apiFetch: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MIXED = "Hi Rajesh 👋,\n\nWe'd love to explore how Voogyo can help your team 🚀.\n\nLooking forward to connecting with you 😊\n\n₹12,50,000";
const MESSAGES = [
  'Hello 👋', "Let's connect 🚀", 'Thank you 😊🙏', '₹12,50,000', 'नमस्ते 👋', 'ગુજરાતી 🚀', 'Hello 👋\nLet\'s connect 🚀\n\n₹12,50,000',
  '😀😂😊👍👋❤️🔥🚀', '❤️ ♥️ ☑️ ™️ ©️ ®️', '👍🏻 👍🏽 👍🏿', '👨‍💻 👩‍💼 🤝', '🇮🇳 🇺🇸', 'नमस्ते ગુજરાતી हिंदी 中文 日本語',
  'Q&A? 100% + #1 "quotes" — it\'s “fine” – a=b&c=d', MIXED, 'Long 🚀 '.repeat(400),
];

let container: HTMLDivElement;
let root: Root;
let calls: { url: string; method: string; body: unknown }[];
let clipboard: string[];

beforeEach(() => {
  calls = [];
  clipboard = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async (t: string) => { clipboard.push(t); }) }, configurable: true });
  vi.mocked(apiFetch).mockImplementation(async (url: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method ?? 'GET', body });
    if (url.startsWith('/api/v1/crm/leads/')) return new Response(JSON.stringify({ success: true, data: { linkedin_url: 'https://www.linkedin.com/in/rajesh-sharma/' } }));
    const state = body.action === 'MARKED_SENT'
      ? { status: 'SENT', confirmation: 'USER', sentAt: '2026-10-06T10:30:00Z', executedBy: { name: 'Ravi Shah' }, to: '+919825012345', attempt: body.resend ? 2 : 1, message: body.message }
      : { status: 'OPENED' };
    return new Response(JSON.stringify({ success: true, data: { channel: body.channel, action: body.action, channelActions: { [body.channel]: state }, state, touchpointCompleted: Boolean(body.completeTouchpoint), message: 'recorded' } }));
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

const flush = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
const link = (text: string) => [...container.querySelectorAll('a')].find((a) => a.textContent?.includes(text)) as HTMLAnchorElement | undefined;
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
/** Follows a link the way a click does, minus jsdom's navigation. */
const follow = async (a: HTMLAnchorElement) => {
  a.addEventListener('click', (e) => e.preventDefault(), { once: true });
  await act(async () => a.click());
  await flush();
};
const sentText = (href: string) => new URL(href).searchParams.get('text');

describe('WhatsApp links', () => {
  it.each(MESSAGES.map((m) => [m.slice(0, 24), m]))('carry "%s" exactly, encoded once', (_l, message) => {
    const url = whatsAppChatUrl('919825012345', message);
    expect(sentText(url)).toBe(message);
    expect(url).not.toMatch(/[\s\u0080-￿]/);
    expect(url).not.toContain('%EF%BF%BD');
    expect(url.startsWith('https://api.whatsapp.com/send?phone=919825012345&text=')).toBe(true);
  });

  it('keep the phone rule, and never go through wa.me (whose redirect turns emoji into "?")', () => {
    expect(new URL(generateWhatsAppUrl('+91 98250 12345', 'Hi 👋')).searchParams.get('phone')).toBe('919825012345');
    expect(generateWhatsAppUrl('98250 12345', '')).toBe('https://api.whatsapp.com/send?phone=919825012345');
    expect(generateWhatsAppUrl('98250 12345', 'Hi')).not.toContain('wa.me');
    expect(generateWhatsAppUrl('123', 'Hi')).toBe('');
  });
});

describe('the WhatsApp touchpoint', () => {
  const render = (phone: string | null, message = MIXED, saved: ManualChannelAction | null = null) =>
    act(async () => root.render(<OutreachWhatsAppPanel leadId="lead-1" day={3} phone={phone} message={message} saved={saved} onRecorded={recorded} />));
  const recorded = vi.fn();

  it('opens WhatsApp with exactly the message shown, and records it as opened, not sent', async () => {
    await render('+91 98250 12345');
    const open = link('Open WhatsApp')!;
    expect(open.target).toBe('_blank');
    expect(open.rel).toContain('noopener');
    expect(sentText(open.href)).toBe(MIXED);
    expect(container.querySelector('section div[aria-labelledby]')?.textContent).toBe(MIXED);
    await follow(open);
    expect(calls).toEqual([{ url: '/api/v1/crm/cadence/channel-action', method: 'POST', body: { leadId: 'lead-1', channel: 'WHATSAPP', action: 'OPENED' } }]);
    expect(recorded).toHaveBeenCalled();
    expect(container.textContent).toContain('WhatsApp opened with this message. Send it there');
    expect(container.textContent).not.toMatch(/message sent|sent to/i);
  });

  it('copies exactly the message shown, and says so only when the clipboard took it', async () => {
    await render('+91 98250 12345');
    await act(async () => button('Copy message')!.click());
    expect(clipboard).toEqual([MIXED]);
    expect(container.querySelector('[role=status]')?.textContent).toBe('Message copied.');
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
    await act(async () => button('Copy message')!.click());
    expect(container.querySelector('[role=alert]')?.textContent).toBe(COPY_FAILED);
    expect(container.querySelector('[role=status]')).toBeNull();
  });

  it('records the message as sent when the member confirms it, tracked like an email', async () => {
    await render('+91 98250 12345');
    await act(async () => button('I’ve sent it')!.click());
    await flush();
    expect(calls.at(-1)?.body).toEqual({ leadId: 'lead-1', channel: 'WHATSAPP', action: 'MARKED_SENT', message: MIXED, completeTouchpoint: false });
    const box = container.querySelector('[role=status]')!;
    expect(box.textContent).toContain('WhatsApp message sent');
    expect(box.textContent).toContain('Marked sent byRavi Shah');
    expect(box.textContent).toContain('+919825012345');
    expect(box.textContent).toContain('the CRM did not send it');
    expect(button('I’ve sent it')).toBeUndefined();

    // Recording another send is a deliberate step, and can complete the day.
    act(() => button('Mark sent again')!.click());
    act(() => (container.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    expect(container.textContent).toContain('Mark Day 3 complete too');
    await act(async () => button('Record another send')!.click());
    await flush();
    expect(calls.at(-1)?.body).toEqual({ leadId: 'lead-1', channel: 'WHATSAPP', action: 'MARKED_SENT', message: MIXED, completeTouchpoint: true, resend: true });
    expect(recorded).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'MARKED_SENT', touchpointCompleted: true }));
    expect(container.textContent).toContain('Attempt2');
  });

  it('shows a send recorded earlier when the touchpoint is opened again', async () => {
    await render('+91 98250 12345', MIXED, { status: 'SENT', confirmation: 'USER', sentAt: '2026-10-05T09:00:00Z', executedBy: { name: 'Neha Mishra' }, to: '+919825012345', attempt: 1 });
    expect(container.querySelector('[role=status]')?.textContent).toContain('Marked sent byNeha Mishra');
    expect(button('Mark sent again')).toBeDefined();
  });

  it('says when there is no usable number, and offers no link', async () => {
    await render(null);
    expect(container.querySelector('[role=alert]')?.textContent).toBe('WhatsApp number is not available for this lead.');
    expect(link('Open WhatsApp')).toBeUndefined();
    await render('12345');
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Invalid WhatsApp number.');
  });
});

describe('the LinkedIn touchpoint', () => {
  const recorded = vi.fn();
  const saved = vi.fn();
  const message = 'Hi Rajesh 👋,\n\nI wanted to reach out regarding how Voogyo can help.\n\nWould you be open to a quick conversation this week? 🚀';
  const render = (linkedinUrl: string | null, canEditLead = true) =>
    act(async () => root.render(
      <OutreachLinkedInPanel leadId="lead-1" day={3} leadName="Rajesh Sharma" linkedinUrl={linkedinUrl} actionType="CONNECT" message={message} saved={null} canEditLead={canEditLead} onLinkedInSaved={saved} onRecorded={recorded} />,
    ));

  it('opens the lead’s own profile, without tracking, and records it as opened', async () => {
    await render('linkedin.com/in/rajesh-sharma?trk=public_profile&utm_source=share');
    const open = link('Open LinkedIn profile')!;
    expect(open.href).toBe('https://www.linkedin.com/in/rajesh-sharma/');
    expect(open.target).toBe('_blank');
    expect(container.textContent).toContain('Rajesh Sharma');
    expect(container.textContent).toContain('linkedin.com/in/rajesh-sharma/');
    await follow(open);
    expect(calls.at(-1)?.body).toEqual({ leadId: 'lead-1', channel: 'LINKEDIN', action: 'OPENED' });
    expect(container.textContent).toContain('LinkedIn opened. Paste the message into the');
    expect(container.textContent).not.toMatch(/message sent/i);
  });

  it('records the LinkedIn message as sent when the member confirms it', async () => {
    await render('https://www.linkedin.com/in/rajesh-sharma/');
    await act(async () => button('I’ve sent it')!.click());
    await flush();
    expect(calls.at(-1)?.body).toEqual({ leadId: 'lead-1', channel: 'LINKEDIN', action: 'MARKED_SENT', message, completeTouchpoint: false });
    expect(container.querySelector('[role=status]')?.textContent).toContain('LinkedIn message sent');
  });

  it('opens a stored conversation as the conversation', async () => {
    await render('https://www.linkedin.com/messaging/thread/2-ZjQ5MzE1/');
    expect(link('Open LinkedIn conversation')!.href).toBe('https://www.linkedin.com/messaging/thread/2-ZjQ5MzE1/');
  });

  it('copies the message exactly, emoji and line breaks, and records the copy', async () => {
    await render('https://www.linkedin.com/in/rajesh-sharma/');
    await act(async () => button('Copy message')!.click());
    await flush();
    expect(clipboard).toEqual([message]);
    expect(calls.at(-1)?.body).toEqual({ leadId: 'lead-1', channel: 'LINKEDIN', action: 'MESSAGE_COPIED' });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
    const before = calls.length;
    await act(async () => button('Copy message')!.click());
    await flush();
    expect(container.querySelector('[role=alert]')?.textContent).toBe(COPY_FAILED);
    expect(calls.length).toBe(before);
  });

  it('never opens LinkedIn home or a search: without an address it asks for one', async () => {
    await render(null);
    expect(container.querySelector('[role=alert]')?.textContent).toContain('LinkedIn profile not available for this lead.');
    expect(container.querySelectorAll('a')).toHaveLength(0);
    act(() => button('Add LinkedIn URL')!.click());
    const input = container.querySelector('input[type=url]') as HTMLInputElement;
    const type = (value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
    type('Rajesh Sharma');
    await act(async () => button('Save')!.click());
    expect(container.textContent).toContain('Invalid LinkedIn profile URL.');
    expect(calls).toHaveLength(0);
    type('www.linkedin.com/in/rajesh-sharma');
    await act(async () => button('Save')!.click());
    await flush();
    expect(calls[0]).toEqual({ url: '/api/v1/crm/leads/lead-1', method: 'PUT', body: { linkedinUrl: 'https://www.linkedin.com/in/rajesh-sharma/' } });
    expect(saved).toHaveBeenCalledWith('https://www.linkedin.com/in/rajesh-sharma/');
  });

  it('refuses a stored address that is not LinkedIn, and offers no fix to members who can’t edit leads', async () => {
    await render('https://evil.example/in/rajesh', false);
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Invalid LinkedIn profile URL.');
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(button('Fix LinkedIn URL')).toBeUndefined();
  });
});

describe('LinkedIn addresses and the clipboard', () => {
  it('normalize LinkedIn addresses and refuse anything else', () => {
    expect(normalizeLinkedInUrl('https://linkedin.com/in/rajesh-sharma/')).toEqual({ url: 'https://www.linkedin.com/in/rajesh-sharma/', kind: 'PROFILE' });
    expect(normalizeLinkedInUrl('https://linkedin.com.evil.example/in/x')).toBeNull();
    expect(normalizeLinkedInUrl('https://www.linkedin.com/')).toBeNull();
    expect(normalizeLinkedInUrl('javascript:alert(1)')).toBeNull();
  });

  it('report a refused copy as not copied', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    expect(await copyText('x')).toBe(false);
  });
});
