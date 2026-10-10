import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drip sequences through the real screens (API stubbed): live numbers only,
 * creating and activating a sequence (refused while incomplete), adding
 * leads with a preview of who can join, rules with a dry run, putting failed
 * emails right, the do-not-email list, and the recipient's unsubscribe page.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { DripSequencesView } = await import('./DripSequencesView');
const { EnrollDialog } = await import('./drip/EnrollDialog');
const { PublicUnsubscribeView } = await import('../public/PublicUnsubscribeView');
const { ComingSoon } = await import('./ComingSoon');

const READY = { organizationSender: { email: 'sales@acme.test', name: 'Acme Sales' }, organizationProblem: null, personalAccountsAllowed: true, unsubscribeAvailable: true };
const OVERVIEW = {
  sequences: { total: 1, active: 1, draft: 0, paused: 0, archived: 0 }, enrolled: 7, sent: 42, replied: 5, bounced: 1, unsubscribed: 2, scheduledToday: 3,
  needsAttention: { failed: 1, uncertain: 1, waitingForSender: 0, total: 2 }, timeZone: 'Asia/Kolkata', readiness: READY,
  placeholders: [{ key: 'First Name', description: 'The lead’s first name' }], conditionFields: [{ key: 'industry', label: 'Industry' }, { key: 'source', label: 'Lead source' }], conditionOperators: ['EQUALS', 'IN'],
};
const OPTIONS = {
  pipelines: [{ id: 'p1', name: 'Sales', stages: [{ id: 's1', name: 'New lead', isWon: false, isLost: false }, { id: 's2', name: 'Won', isWon: true, isLost: false }] }],
  sources: [{ id: 'src1', name: 'Website' }],
  templates: [{ id: 't1', name: 'Intro', subject: 'Hello {{First Name}}', body: 'Hi {{First Name}}, a quick idea.' }],
};
const detail = (extra: Record<string, unknown> = {}) => ({
  id: 'q1', name: 'Follow-up', description: null, status: 'DRAFT', senderMode: 'ORGANIZATION', weekdays: [1, 2, 3, 4, 5], windowStart: 600, windowEnd: 1020, skipHolidays: true, dailyLimit: 50,
  version: 1, activatedAt: null, pausedAt: null, archivedAt: null, createdAt: '', updatedAt: '',
  steps: [{ id: 'st1', order: 1, stepName: 'Introduction', delayAmount: 0, delayUnit: 'WORKING_DAYS', templateId: null, templateName: null, subject: 'Hello {{First Name}}', body: 'Hi there', enabled: true }],
  stopStageIds: [] as string[], rules: [] as unknown[], activationProblems: problems, readiness: READY,
  replyDetection: { available: false, note: 'Replies won’t stop the sequence by themselves.', mailboxProblems: [] },
  summary: '1 email sent from sales@acme.test, on Monday to Friday except holidays, between 10:00 and 17:00 workspace time, at most 50 a day per mailbox.',
  ...extra,
});

let calls: { url: string; method: string; body: unknown }[];
/** What the fake server says still stops activation. */
let problems: string[] = [];
let stored: ReturnType<typeof detail>;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json({ success: true, data });

beforeEach(() => {
  granted = new Set(['sequences.view', 'sequences.manage', 'sequences.enroll', 'sequences.enroll_bulk', 'sequences.logs.view', 'sequences.suppression.manage']);
  calls = [];
  problems = [];
  stored = detail();
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    const path = url.replace('/api/v1', '').split('?')[0];
    if (path === '/email-sequences/overview') return ok(OVERVIEW);
    if (path === '/email-sequences/options') return ok(OPTIONS);
    if (path === '/email-sequences' && method === 'GET') return ok([{ id: 'q1', name: stored.name, description: null, status: stored.status, senderMode: 'ORGANIZATION', steps: 1, enrolled: 7, sent: 42, replied: 5, updatedAt: '' }]);
    if (path === '/email-sequences' && method === 'POST') { stored = detail({ ...body, id: 'q1', steps: body.steps.map((s: object, i: number) => ({ ...s, id: `st${i + 1}`, order: i + 1 })) }); return ok(stored); }
    if (path === '/email-sequences/q1' && method === 'GET') return ok(stored);
    if (path === '/email-sequences/q1' && method === 'PUT') { stored = detail({ ...stored, ...body, activationProblems: problems, steps: body.steps.map((s: object, i: number) => ({ ...s, id: `st${i + 1}`, order: i + 1 })) }); return ok(stored); }
    if (path === '/email-sequences/q1/activate') { stored = { ...stored, status: 'ACTIVE' }; return ok(stored); }
    if (path === '/email-sequences/q1/rules' && method === 'POST') return ok([{ id: 'r1', name: body.name, triggerKind: body.triggerKind, pipelineId: body.pipelineId, stageId: body.stageId, sourceId: null, pipelineName: 'Sales', stageName: 'New lead', sourceName: null, conditions: body.conditions, enabled: false, enabledAt: null, lastRunAt: null, lastError: null, enrolled: 0 }]);
    if (path === '/email-sequences/q1/rules/r1/dry-run') return ok({ windowDays: 30, note: 'A preview of the last 30 days.', leads: [{ leadId: 'l1', company: 'Acme', name: 'Priya', email: 'p@acme.test', eventAt: '2026-10-01T05:00:00Z', wouldEnroll: true, reason: null }, { leadId: 'l2', company: 'Beta', name: 'Ravi', email: 'r@beta.test', eventAt: '2026-10-02T05:00:00Z', wouldEnroll: false, reason: 'Doesn’t meet the rule’s conditions' }] });
    if (path === '/email-sequences/q1/enrollments/preview') {
      return ok({
        sequence: { id: 'q1', name: 'Follow-up', status: 'ACTIVE' }, eligible: body.moveFromOutreach ? 2 : 1, timeZone: 'Asia/Kolkata', firstStep: 'Introduction',
        firstEmail: { subject: 'Hello Priya', body: 'Hi there', missing: [] },
        leads: [
          { leadId: 'l1', company: 'Acme', name: 'Priya', email: 'p@acme.test', eligible: true, reason: null, code: null, firstSendAt: '2026-10-09T05:00:00Z' },
          body.moveFromOutreach
            ? { leadId: 'l2', company: 'Beta', name: 'Ravi', email: 'r@beta.test', eligible: true, reason: null, code: null, firstSendAt: '2026-10-09T05:00:00Z' }
            : { leadId: 'l2', company: 'Beta', name: 'Ravi', email: 'r@beta.test', eligible: false, reason: 'Beta is in Client Outreach.', code: 'IN_CLIENT_OUTREACH', firstSendAt: null },
          { leadId: 'l3', company: 'Gamma', name: 'Sam', email: 's@gamma.test', eligible: false, reason: 's@gamma.test is on the do-not-email list.', code: 'SUPPRESSED', firstSendAt: null },
        ],
      });
    }
    if (path === '/email-sequences/q1/enrollments/bulk') return ok({ enrolled: 2, skipped: [{ leadId: 'l3', company: 'Gamma', reason: 'suppressed' }], firstSendAt: null });
    if (path === '/email-sequences/sends' && method === 'GET') {
      return ok({ page: 1, limit: 25, total: 1, items: [{ id: 'm1', status: 'UNCERTAIN', scheduledAt: '2026-10-08T05:00:00Z', sentAt: null, failedAt: null, cancelledAt: null, repliedAt: null, bouncedAt: null, attempts: 1, problemCode: 'CONNECTION_LOST', problem: 'The connection broke.', cancelReason: null, bounceKind: null, sequence: { id: 'q1', name: 'Follow-up' }, step: 'Introduction', lead: { id: 'l1', company: 'Acme', name: 'Priya' }, recipient: 'p@acme.test', sender: 'sales@acme.test', senderKind: 'ORGANIZATION', subject: 'Hello Priya', messageId: '<x>', body: 'Hi there', events: [] }] });
    }
    if (path === '/email-sequences/sends/m1/mark-sent') return ok({ marked: true });
    if (path === '/email-sequences/suppressions' && method === 'GET') {
      return ok({ page: 1, limit: 25, total: 2, items: [
        { id: 'x1', email: 'gone@client.test', reason: 'UNSUBSCRIBED', source: 'ONE_CLICK', note: null, createdAt: '2026-10-01T00:00:00Z', addedBy: null, removable: false },
        { id: 'x2', email: 'bounce@client.test', reason: 'BOUNCED', source: 'BOUNCE', note: null, createdAt: '2026-10-01T00:00:00Z', addedBy: null, removable: true },
      ] });
    }
    if (path === '/email-sequences/suppressions' && method === 'POST') return ok({ added: 2, alreadyListed: 0 });
    if (path.startsWith('/public/email/unsubscribe/')) return ok({ company: 'Acme', email: 'p****@client.test', unsubscribed: method === 'POST' });
    return ok([]);
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
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return (document.getElementById(label?.getAttribute('for') ?? '') ?? label?.querySelector('input,select,textarea')) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
/** Lets debounced searches run. */
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const tab = (name: string) => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === name) as HTMLButtonElement;

describe('drip sequences', () => {
  it('shows the workspace’s real numbers and sequences, and nothing to people without access', async () => {
    await act(async () => root.render(<DripSequencesView />));
    await settle();
    const numbers = container.querySelector('[aria-label="Drip sequence numbers"]')!.textContent!;
    for (const fact of ['Active sequences1', 'Leads in a sequence7', 'Scheduled today3', 'Emails sent42', 'Replies5', 'Bounced1', 'Unsubscribed2', 'Need attention2']) expect(numbers).toContain(fact);
    expect(container.textContent).toContain('Follow-up');
    // No made-up rates anywhere.
    expect(container.textContent).not.toMatch(/open rate|click rate/i);

    granted = new Set();
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<DripSequencesView />));
    expect(container.textContent).toContain('You don’t have access to drip sequences');
    expect(calls.filter((c) => c.url.includes('/overview'))).toHaveLength(1);
  });

  it('creates a draft from a template, and activates it only after showing what it will do', async () => {
    await act(async () => root.render(<DripSequencesView />));
    await settle();
    await click(button('Create sequence'));
    await click(tab('Sender & schedule'));
    setValue(byLabel('Name *'), 'Follow-up');
    await click(tab('Emails'));
    setValue(byLabel('Start from a template'), 't1');
    expect(byLabel('Subject').value).toBe('Hello {{First Name}}');
    await click(button('Add email'));
    setValue(document.getElementById(byLabel('Subject').id.replace('-0-', '-1-')) as HTMLInputElement, 'Following up');
    const bodies = [...container.querySelectorAll('textarea')];
    setValue(bodies[1], 'Just checking in, {{First Name|there}}.');
    await click(button('Save draft'));
    const created = calls.find((c) => c.url === '/api/v1/email-sequences' && c.method === 'POST')!.body as { name: string; steps: { templateId: string | null; delayAmount: number; subject: string }[] };
    expect(created.name).toBe('Follow-up');
    expect(created.steps).toEqual([
      expect.objectContaining({ templateId: 't1', delayAmount: 0, subject: 'Hello {{First Name}}' }),
      expect.objectContaining({ templateId: null, delayAmount: 2, subject: 'Following up' }),
    ]);
    expect(created.steps.every((s) => !('id' in s))).toBe(true);
    expect(container.textContent).toContain('Draft');

    // Incomplete: the dialog says why and won't activate.
    await click(tab('Sender & schedule'));
    setValue(byLabel('Description'), 'For new leads');
    problems = ['Set up the organization’s email account in Organization Settings.'];
    await click(button('Save changes'));
    await click(button('Activate'));
    expect(document.body.textContent).toContain('Set up the organization’s email account');
    expect(button('Activate and start sending').disabled).toBe(true);
    await click(button('Not yet'));

    problems = [];
    stored = { ...stored, activationProblems: [] };
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<DripSequencesView />));
    await settle();
    await click(button('Follow-up'));
    await click(button('Activate'));
    expect(document.body.textContent).toContain('between 10:00 and 17:00');
    expect(document.body.textContent).toContain('Replies won’t stop the sequence by themselves.');
    await click(button('Activate and start sending'));
    expect(calls.some((c) => c.url.endsWith('/q1/activate'))).toBe(true);
    expect(container.textContent).toContain('Active');
  });

  it('adds rules switched off, and shows who a rule would enroll without enrolling anyone', async () => {
    stored = detail({ status: 'ACTIVE' });
    await act(async () => root.render(<DripSequencesView />));
    await settle();
    await click(button('Follow-up'));
    await click(tab('Enrollment rules'));
    await click(button('Add rule'));
    setValue(byLabel('Rule name *'), 'New website leads');
    setValue(byLabel('Pipeline *'), 'p1');
    expect([...byLabel('Stage *').options].map((o) => o.textContent)).toEqual(['Choose a stage', 'New lead']);
    setValue(byLabel('Stage *'), 's1');
    await click(button('Add condition'));
    setValue(container.ownerDocument.querySelector('[aria-label="Condition 1 value"]') as HTMLInputElement, 'Retail');
    await click(button('Save rule'));
    expect(calls.find((c) => c.url.endsWith('/q1/rules'))!.body).toEqual({
      name: 'New website leads', triggerKind: 'STAGE_ENTERED', pipelineId: 'p1', stageId: 's1', sourceId: null,
      conditions: { match: 'ALL', conditions: [{ field: 'industry', operator: 'EQUALS', value: 'Retail' }] },
    });
    expect(container.textContent).toContain('Off');
    await click(button('Dry run'));
    expect(document.body.textContent).toContain('No: Doesn’t meet the rule’s conditions');
    expect(calls.some((c) => c.url.includes('/enrollments') && c.method === 'POST')).toBe(false);
  });

  it('puts right an email that may not have gone, and keeps people who unsubscribed on the list', async () => {
    await act(async () => root.render(<DripSequencesView />));
    await settle();
    await click(tab('Sending activity'));
    expect(calls.some((c) => c.url.includes('/email-sequences/sends?status=ATTENTION'))).toBe(true);
    expect(container.textContent).toContain('May not have sent');
    await click(button('Details'));
    expect(document.body.textContent).toContain('It is never sent again by itself');
    await click(button('It was sent'));
    expect(calls.some((c) => c.url.endsWith('/sends/m1/mark-sent') && c.method === 'POST')).toBe(true);

    await click(tab('Do-not-email list'));
    await wait(300);
    await settle();
    const rows = [...container.querySelectorAll('li')];
    expect(rows.find((r) => r.textContent!.includes('gone@client.test'))!.querySelector('button')).toBeNull();
    expect(rows.find((r) => r.textContent!.includes('bounce@client.test'))!.textContent).toContain('Remove');
    await click(button('Add addresses'));
    setValue(byLabel('Email addresses *'), 'a@x.test, b@x.test');
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent?.trim() === 'Add') as HTMLButtonElement);
    expect(calls.find((c) => c.url.endsWith('/email-sequences/suppressions') && c.method === 'POST')!.body).toEqual({ emails: ['a@x.test', 'b@x.test'] });
  });
});

describe('adding leads', () => {
  it('previews who can join and why not, and moves Client Outreach leads only when asked', async () => {
    stored = detail({ status: 'ACTIVE' });
    const done = vi.fn();
    await act(async () => root.render(<EnrollDialog leadIds={['l1', 'l2', 'l3']} onClose={vi.fn()} onDone={done} />));
    await settle();
    setValue(byLabel('Sequence'), 'q1');
    await settle();
    expect(document.body.textContent).toContain('1 of 3 can join');
    expect(document.body.textContent).toContain('Gamma: s@gamma.test is on the do-not-email list.');
    expect(document.body.textContent).toContain('Hello Priya');
    await act(async () => byLabel('Move the lead in Client Outreach').click());
    await settle();
    expect(document.body.textContent).toContain('2 of 3 can join');
    await click(button('Add 2 leads'));
    expect(calls.find((c) => c.url.endsWith('/enrollments/bulk'))!.body).toEqual({ leadIds: ['l1', 'l2', 'l3'], moveFromOutreach: true });
    expect(done).toHaveBeenCalled();
  });
});

describe('the unsubscribe page and the tabs not built yet', () => {
  it('changes nothing on opening, unsubscribes on the button, and sends no session', async () => {
    await act(async () => root.render(<PublicUnsubscribeView token="tok_123" />));
    await settle();
    expect(container.textContent).toContain('Stop all marketing emails from Acme to p****@client.test?');
    expect(calls.map((c) => c.method)).toEqual(['GET']);
    await click(button('Unsubscribe'));
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(container.textContent).toContain('won’t get any more marketing emails from Acme');
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[1][1];
    expect(init.credentials).toBe('omit');
  });

  it('says plainly what isn’t built yet, with no sample data', async () => {
    await act(async () => root.render(<ComingSoon tab="campaigns" />));
    expect(container.textContent).toContain('Email campaigns are coming soon');
    expect(container.textContent).not.toMatch(/\d+(\.\d+)?%/);
  });
});
