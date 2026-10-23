import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Client Outreach email composer and a lead's History, through the real
 * components (API stubbed): the sender shown is the organization's and can't
 * be changed, the member is shown as the one executing, only content is sent,
 * failures are shown in place, and the history lists who did what with the
 * server applying every filter.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-ravi', email: 'ravi@rnd.test', displayName: 'Ravi Shah' }, can: () => true }) }));

const { OutreachEmailComposer } = await import('./OutreachEmailComposer');
const { LeadHistory } = await import('./LeadHistory');

const SENT = {
  status: 'SENT', attempt: 1, executedBy: { memberId: 'm-ravi', name: 'Ravi Shah' }, startedAt: '2026-10-05T05:36:58.000Z', sentAt: '2026-10-05T05:37:00.000Z',
  from: { name: 'Ravi Shah', email: 'sales@rnd.test' }, to: 'raj@apex.test', subject: 'Hello Apex Polymer',
} as const;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let calls: { url: string; method: string; body: any }[] = [];
let sender: unknown;
let sendResponse: () => Response;
let historyRows: unknown[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  sender = { configured: true, name: 'RND Technosoft', email: 'sales@rnd.test', replyTo: 'replies@rnd.test' };
  sendResponse = () => json({ success: true, data: {
    sent: true,
    email: { ...SENT, sentAt: '2026-10-05T05:37:00.000Z' },
    channelActions: { EMAIL: SENT },
    from: { name: 'Ravi Shah', email: 'sales@rnd.test' }, to: 'raj@apex.test', touchpoint: { day: 1, title: 'Introduction', status: 'IN_PROGRESS' }, attempt: 1, touchpointCompleted: false, message: 'Email sent',
  } });
  historyRows = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
    if (url === '/api/v1/crm/cadence/email-sender') return json({ success: true, data: sender });
    if (url === '/api/v1/crm/cadence/email') return sendResponse();
    if (url.startsWith('/api/v1/crm/leads/lead-1/history')) {
      return json({ success: true, data: historyRows, pagination: { page: 1, limit: 50, total: historyRows.length, totalPages: 1 }, actors: [{ id: 'm-ravi', name: 'Ravi Shah' }, { id: 'm-neha', name: 'Neha Mishra' }] });
    }
    return json({ success: true, data: [] });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const setValue = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });

async function renderComposer(channels = ['LINKEDIN', 'EMAIL', 'WHATSAPP'], onSent = vi.fn(), saved: any = null) {
  await act(async () => root.render(
    <OutreachEmailComposer leadId="lead-1" recipient="raj@apex.test" touchpoint={{ day: 1, title: 'Introduction', channels }} subject="Hello Apex" body="Dear Raj," saved={saved} onSent={onSent} />,
  ));
  await settle();
  return onSent;
}

describe('outreach email composer', () => {
  it('shows the organization’s address as the sender, under the member’s name, read-only, and the member as the one executing', async () => {
    await renderComposer();
    expect(container.querySelector('[data-testid="outreach-email-from"]')?.textContent).toBe('Ravi Shah <sales@rnd.test>');
    expect(container.textContent).toContain('replies@rnd.test');
    expect(container.textContent).toContain('Ravi Shah');
    // Only the subject and message can be edited; there is no field for the sender or recipient.
    expect([...container.querySelectorAll('input:not([type=checkbox]), textarea')].map((el) => (el as HTMLInputElement).value)).toEqual(['Hello Apex', 'Dear Raj,']);
  });

  it('sends only the content, with the day left open on a multi-channel day unless ticked', async () => {
    const onSent = await renderComposer();
    const checkbox = container.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    setValue(container.querySelector('input:not([type=checkbox])') as HTMLInputElement, 'Hello Apex Polymer');
    await act(async () => button('Send email')!.click());
    await settle();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ leadId: 'lead-1', subject: 'Hello Apex Polymer', body: 'Dear Raj,', completeTouchpoint: false });
    expect(onSent).toHaveBeenCalledTimes(1);
    const status = container.querySelector('[role="status"]')?.textContent ?? '';
    expect(status).toContain('Email sent');
    expect(status).toContain('Executed by');
    expect(status).toContain('Ravi Shah');
    expect(status).toContain('Ravi Shah <sales@rnd.test>');
    expect(button('Send email')).toBeUndefined();
    expect(button('Resend email')).toBeDefined();
  });

  it('shows a saved send as sent when the window is opened again, with no Send button, and resends only on purpose', async () => {
    await renderComposer(undefined, vi.fn(), { ...SENT, executedBy: { memberId: 'm-neha', name: 'Neha Mishra' } });
    expect(container.textContent).toContain('Sent');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Neha Mishra');
    expect(button('Send email')).toBeUndefined();
    expect(container.querySelector('textarea')).toBeNull();
    await act(async () => button('Resend email')!.click());
    expect(container.textContent).toContain('This sends the email to raj@apex.test again.');
    await act(async () => button('Send again')!.click());
    await settle();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ leadId: 'lead-1', resend: true });
  });

  it('shows a failed last attempt and keeps sending available', async () => {
    await renderComposer(undefined, vi.fn(), { status: 'FAILED', attempt: 1, executedBy: { memberId: 'm-ravi', name: 'Ravi Shah' }, startedAt: SENT.startedAt, failedAt: SENT.startedAt });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('failed. The email has not been marked as sent.');
    expect(button('Send email')?.disabled).toBe(false);
  });

  it('shows a send in progress by someone else without offering to send', async () => {
    await renderComposer(undefined, vi.fn(), { status: 'SENDING', attempt: 1, executedBy: { memberId: 'm-neha', name: 'Neha Mishra' }, startedAt: new Date().toISOString() });
    expect(container.textContent).toContain('Being sent by Neha Mishra');
    expect(button('Send email')).toBeUndefined();
  });

  it('ticks "mark complete" when email is the day’s only channel', async () => {
    await renderComposer(['EMAIL']);
    expect((container.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true);
  });

  it('shows a failed send in place and does not report it as sent', async () => {
    sendResponse = () => json({ statusCode: 503, message: "The organization's email service could not send this message. Please check the organization email configuration." }, 503);
    const onSent = await renderComposer();
    await act(async () => button('Send email')!.click());
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Email failed to send. The email has not been marked as sent.');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("The organization's email service could not send this message.");
    expect(onSent).not.toHaveBeenCalled();
    expect(button('Send email')?.disabled).toBe(false);
  });

  it('says the organization email is not set up, and cannot send', async () => {
    sender = { configured: false, name: null, email: null, replyTo: null };
    await renderComposer();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Organization email is not configured.');
    expect(button('Send email')?.disabled).toBe(true);
  });
});

describe('lead history', () => {
  it('lists who did what, newest first, with before and after values, and filters on the server', async () => {
    historyRows = [
      { id: 'h2', action_type: 'OUTREACH_EMAIL_SENT', entity_type: 'LEAD', entity_id: 'lead-1', actor_id: 'm-ravi', actor_name: 'Ravi Shah', actor_email: 'ravi@rnd.test', created_at: new Date().toISOString(),
        changes_diff: { touchpoint: { day: 1, title: 'Introduction' }, sender_email: 'sales@rnd.test', sender_name: 'RND Technosoft', recipient: 'raj@apex.test', attempt: 2, edited: { subject: { before: 'Hello', after: 'Hello Apex' } } } },
      { id: 'h1', action_type: 'UPDATE', entity_type: 'LEAD', entity_id: 'lead-1', actor_id: 'm-neha', actor_name: 'Neha Mishra', actor_email: 'neha@rnd.test', created_at: new Date().toISOString(),
        changes_diff: { changes: { designation: { before: 'Manager', after: 'General Manager' }, stage_id: { before: 's-new', after: 's-qual' } } } },
    ];
    await act(async () => root.render(<LeadHistory leadId="lead-1" stages={[{ id: 's-new', name: 'New' }, { id: 's-qual', name: 'Qualified' }]} />));
    await settle();
    const items = [...container.querySelectorAll('ol[aria-label="Lead history"] > li')].map((li) => li.textContent ?? '');
    expect(items[0]).toContain('Today');
    expect(items[0]).toContain('Ravi Shah');
    expect(items[0]).toContain('Sent email');
    expect(items[0]).toContain('From: RND Technosoft <sales@rnd.test>');
    expect(items[0]).toContain('Attempt 2');
    expect(items[0]).toContain('Subject edited: "Hello" → "Hello Apex"');
    expect(items[1]).toContain('Neha Mishra');
    expect(items[1]).toContain('Designation: Manager → General Manager');
    expect(items[1]).toContain('Stage: New → Qualified');

    const [member, action, channel, period] = [...container.querySelectorAll('select')] as HTMLSelectElement[];
    setValue(member, 'm-neha');
    await settle();
    setValue(action, 'OUTREACH_EMAIL_SENT');
    await settle();
    setValue(channel, 'EMAIL');
    await settle();
    setValue(period, '7D');
    await settle();
    const last = new URL(calls.filter((c) => c.url.includes('/history')).at(-1)!.url, 'http://x');
    expect(Object.fromEntries(last.searchParams)).toMatchObject({ actorId: 'm-neha', actionType: 'OUTREACH_EMAIL_SENT', channel: 'EMAIL', page: '1' });
    expect(last.searchParams.get('from')).toBeTruthy();
  });

  it('says when nothing matches', async () => {
    await act(async () => root.render(<LeadHistory leadId="lead-1" />));
    await settle();
    expect(container.textContent).toContain('No recorded actions match these filters.');
  });
});
