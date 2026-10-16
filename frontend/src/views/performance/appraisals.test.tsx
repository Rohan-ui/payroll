import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Appraisals through the real screens (API stubbed): the tabs everyone gets,
 * a self-assessment with the server's missing answers shown, nominating
 * peers, a manager approving nominations, a reviewer who sees earlier
 * reviews only combined and declines, launching a cycle with a choice made
 * and someone left out, and cancelling an appraisal.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { PerformanceView } = await import('./PerformanceView');

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, limit: 25, totalPages: 1, hasMore: false });
const LINES = [
  {
    id: 'l-rev', kind: 'KPI', kraLibraryId: 'k1', kraName: 'Business', code: 'REVENUE', name: 'Revenue', description: null, instructions: null, evidence: 'REQUIRED', method: 'PERCENT_OF_TARGET',
    measurementType: 'CURRENCY', unitLabel: '₹', currencyCode: 'INR', direction: 'HIGHER_IS_BETTER', maxMarks: null, minMarks: null, allowsExemption: false, targetSource: 'PER_EMPLOYEE',
    target: '1000000', threshold: null, stretch: null, scale: null, field: null,
  },
  {
    id: 'l-team', kind: 'KRA', kraLibraryId: 'k2', kraName: 'Teamwork', code: 'TEAMWORK', name: 'Teamwork', description: 'Works well with others', instructions: null, evidence: 'NONE', method: 'RATING_SCALE',
    measurementType: null, unitLabel: null, currencyCode: null, direction: null, maxMarks: null, minMarks: null, allowsExemption: false, targetSource: null, target: null, threshold: null, stretch: null,
    scale: { kind: 'LEVELS', min: null, max: null, step: null, levels: [{ value: '1', label: 'Poor' }, { value: '3', label: 'Good' }, { value: '5', label: 'Superb' }] }, field: null,
  },
  {
    id: 'l-ach', kind: 'FIELD', kraLibraryId: null, kraName: null, code: 'achievements', name: 'Key achievements', description: null, instructions: null, evidence: 'NONE', method: null, measurementType: null,
    unitLabel: null, currencyCode: null, direction: null, maxMarks: null, minMarks: null, allowsExemption: false, targetSource: null, target: null, threshold: null, stretch: null, scale: null,
    field: { type: 'ACHIEVEMENTS', required: true, filledBy: 'SELF', config: { maxLength: 2000 } },
  },
];
const FORM = (extra: Record<string, unknown> = {}) => ({
  assignmentId: 'as-self', appraisalId: 'ap1', employee: { name: 'Priya', code: 'E1', department: 'Sales', designation: null }, cycle: { name: 'H2 2026 review', periodStart: '2026-07-01', periodEnd: '2026-12-31' },
  stage: { key: 'self', name: 'Self-assessment', action: 'RATE', isSelf: true, status: 'OPEN', dueDate: '2026-10-28', allowsDecline: false, returnTo: [] },
  assignment: { status: 'ASSIGNED', reason: null }, canEdit: true, lines: LINES, allLines: LINES,
  review: { status: 'DRAFT', overallComment: null, submittedAt: null, items: [{ lineId: 'l-team', actual: null, rating: '3', marks: null, scorePercent: null, yesNo: null, number: null, text: null, options: [], date: null, exempt: false, justification: null, comment: null }], files: [] },
  preview: { scorePercent: null, lines: [{ lineId: 'l-team', status: 'SCORED', scorePercent: '60', steps: [], problem: null }] }, earlier: [], ...extra,
});
const MY_APPRAISAL = {
  id: 'ap1', status: 'IN_PROGRESS', cycle: { name: 'H2 2026 review', periodStart: '2026-07-01', periodEnd: '2026-12-31' },
  stages: [
    { key: 'self', name: 'Self-assessment', step: 1, status: 'OPEN', dueDate: '2026-10-28', isSelf: true, nominate: null },
    { key: 'peers', name: 'Peer review', step: 2, status: 'WAITING', dueDate: null, isSelf: false, nominate: { min: 2, max: 3, needsApproval: true, nominations: [{ id: 'n0', nominee: 'Ravi', status: 'PROPOSED', note: null }] } },
  ],
  selfAssessment: { assignmentId: 'as-self', status: 'ASSIGNED' }, readable: [],
};
const CYCLE = {
  id: 'c1', cycleCode: 'H2_2026', cycleName: 'H2 2026 review', cycleKind: 'HALF_YEARLY', status: 'DRAFT', periodStart: '2026-07-01', periodEnd: '2026-12-31', launchedAt: null, progress: null,
  description: null, appliesToAll: true, scopes: { departments: [], designations: [] }, joinedOnOrBefore: null, allowsOverlap: false,
  templates: [{ id: 't1', code: 'SALES', name: 'Sales', status: 'ACTIVE' }, { id: 't2', code: 'GENERAL', name: 'General', status: 'ACTIVE' }], workflows: [{ id: 'w1', code: 'STANDARD', name: 'Standard', status: 'ACTIVE' }], launchedBy: null,
};
const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  employee: { id, name, code: id.toUpperCase() }, department: 'Sales', designation: null, alreadyIn: false, template: { id: 't1', code: 'SALES', name: 'Sales', versionNumber: 1 }, templateReason: 'Meant for their department or designation',
  workflow: { id: 'w1', code: 'STANDARD', name: 'Standard', versionNumber: 2 }, workflowReason: 'For everyone', problems: [], reviewers: [{ stage: 'Manager review', status: 'RESOLVED', message: '1 reviewer.' }], ...extra,
});
const DETAIL = {
  id: 'ap1', status: 'IN_PROGRESS', currentStep: 2, employee: { id: 'e1', name: 'Priya', code: 'E1', hasSignIn: true }, cycle: { id: 'c1', name: 'H2 2026 review', periodStart: '2026-07-01', periodEnd: '2026-12-31' },
  template: { code: 'SALES', name: 'Sales', version: 1 }, workflow: { version: 'wv1', resolution: 'AT_LAUNCH' },
  stages: [{
    key: 'manager', name: 'Manager review', step: 2, source: 'REPORTING_MANAGER', action: 'RATE', mode: 'EACH', minReviewers: 1, maxReviewers: 1, allowsReplacement: true, status: 'OPEN', dueDate: '2026-11-01', overdue: false, note: null,
    assignments: [{ id: 'as-m', reviewer: { id: 'm-mira', name: 'Mira' }, status: 'ASSIGNED', via: 'Reporting manager', isLead: true, reason: null, assignedAt: '', submittedAt: null, replaces: null }], nominations: [],
  }],
  targets: [], cancelledAt: null, cancellationReason: null,
};

let calls: { path: string; query: string; method: string; body: any }[];
let submitResponse: () => Response;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json({ success: true, data });

beforeEach(() => {
  granted = new Set(['performance.my.view']);
  calls = [];
  submitResponse = () => json({ statusCode: 400, message: 'Some answers are needed before submitting.', errors: [{ message: 'Business → Revenue: attach the evidence it asks for.' }] }, 400);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const [path, query = ''] = url.replace(/^.*\/api\/v1/, '').split('?');
    calls.push({ path, query, method, body });
    if (path === '/performance/my/appraisals') return ok({ linked: true, appraisals: [{ id: 'ap1', status: 'IN_PROGRESS', cycle: 'H2 2026 review', periodStart: '2026-07-01', periodEnd: '2026-12-31' }] });
    if (path === '/performance/my/appraisals/ap1') return ok(MY_APPRAISAL);
    if (path === '/performance/my/appraisals/ap1/stages/peers/nominations') return json({ success: true, data: { nominated: body.tenantMemberIds.length } }, 201);
    if (path === '/performance/my/colleagues') return ok([{ id: 'm-pia', name: 'Pia', code: 'E4' }, { id: 'm-quinn', name: 'Quinn', code: 'E5' }]);
    if (path === '/performance/my/reviews/as-self' && method === 'GET') return ok(FORM());
    if (path === '/performance/my/reviews/as-self' && method === 'PUT') return ok(FORM({ review: { ...FORM().review, items: body.items.map((i: any) => ({ ...FORM().review.items[0], ...i })) } }));
    if (path === '/performance/my/reviews/as-self/submit') return submitResponse();
    if (path === '/performance/my/inbox') {
      return ok({
        toDo: [{ assignmentId: 'as-peer', appraisalId: 'ap2', employee: { name: 'Noel', code: 'E7' }, cycle: 'H2 2026 review', stage: 'Peer review', action: 'RATE', isSelf: false, dueDate: '2026-10-20', overdue: true, draftSaved: false, submittedAt: null, reason: null }],
        done: [], nominationsToDecide: [{ id: 'n1', employee: 'Priya', nominee: 'Ravi', nominatedBy: 'Priya' }, { id: 'n2', employee: 'Priya', nominee: 'Hana', nominatedBy: 'Priya' }],
      });
    }
    if (path.startsWith('/performance/my/nominations/')) return ok({ decided: true });
    if (path === '/performance/my/reviews/as-peer' && method === 'GET') {
      return ok(FORM({
        assignmentId: 'as-peer', employee: { name: 'Noel', code: 'E7', department: null, designation: null }, lines: [LINES[1]],
        stage: { key: 'peers', name: 'Peer review', action: 'RATE', isSelf: false, status: 'OPEN', dueDate: '2026-10-20', allowsDecline: true, returnTo: [] },
        review: { status: 'DRAFT', overallComment: null, submittedAt: null, items: [], files: [] }, preview: null,
        earlier: [
          { stage: 'Self-assessment', mode: 'INDIVIDUAL', combined: [], reviews: [{ reviewer: 'Noel', submittedAt: '2026-10-10T00:00:00Z', overallComment: 'A good half', items: [{ ...FORM().review.items[0], lineId: 'l-rev', rating: null, actual: '850000' }], files: [] }] },
          { stage: 'Other peers', mode: 'AGGREGATE', reviews: [], combined: [{ lineId: 'l-team', name: 'Teamwork', scorePercent: '80', reviews: 2 }] },
        ],
      }));
    }
    if (path === '/performance/my/reviews/as-peer/decline') return ok({ declined: true });
    if (path === '/performance/cycles' && method === 'GET') return ok({ ...page([CYCLE]), counts: { active: 1, archived: 0 } });
    if (path === '/performance/cycles/c1' && method === 'GET') return ok(CYCLE);
    if (path === '/performance/cycles/c1/appraisals') return ok(page([]));
    if (path === '/performance/cycles/c1/preview') {
      return ok({
        templates: [{ id: 't1', code: 'SALES', name: 'Sales', versionNumber: 1 }, { id: 't2', code: 'GENERAL', name: 'General', versionNumber: 3 }], workflows: [{ id: 'w1', code: 'STANDARD', name: 'Standard', versionNumber: 2 }],
        rows: [
          row('e1', 'Asha'),
          row('e2', 'Bina', { template: null, templateReason: null, problems: [{ kind: 'TEMPLATE', message: '2 templates fit them (SALES, GENERAL). Choose one.' }] }),
          row('e3', 'Chetan'),
          row('e4', 'Dev', { problems: [{ kind: 'OVERLAP', message: 'Already in the overlapping cycle H1_2026.' }] }),
        ],
        summary: { eligible: 4, ready: 2, needChoice: 1, alreadyIn: 0, needingReviewers: 0 },
      });
    }
    if (path === '/performance/cycles/c1/launch') return ok({ started: 2, skipped: [{ employeeId: 'e9', name: 'Esha', reason: 'The workflow has no published version.' }], cycle: { ...CYCLE, status: 'ACTIVE' } });
    if (path === '/performance/appraisals/ap1' && method === 'GET') return ok(DETAIL);
    if (path === '/performance/appraisals/ap1/cancel') return ok({ ...DETAIL, status: 'CANCELLED', cancelledAt: '2026-10-14T00:00:00Z', cancellationReason: body.reason, stages: DETAIL.stages.map((s) => ({ ...s, assignments: s.assignments.map((a) => ({ ...a, status: 'CANCELLED' })) })) });
    if (path === '/performance/appraisals/ap1/stages/manager/assignments') return ok(DETAIL);
    return json({ message: `Unexpected ${method} ${path}` }, 404);
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
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text) as HTMLButtonElement;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return (document.getElementById(label?.getAttribute('for') ?? '') ?? label?.querySelector('input,select,textarea')) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const tab = (name: string) => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === name) as HTMLButtonElement;
const dialog = () => document.querySelector('[role=dialog]') as HTMLElement;
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };
const sent = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

describe('my appraisals and reviews', () => {
  it('gives everyone their own appraisals and inbox first, and the setup only to those allowed', async () => {
    await render(<PerformanceView />);
    expect([...document.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual(['My appraisals', 'Review inbox']);
    expect(tab('My appraisals').getAttribute('aria-selected')).toBe('true');
    expect(document.body.textContent).toContain('H2 2026 review');
    expect(calls.some((c) => c.path.startsWith('/performance/cycles') || c.path.startsWith('/performance/kras'))).toBe(false);
  });

  it('saves a self-assessment with only each line’s own values, then lists what the server still needs', async () => {
    await render(<PerformanceView />);
    await click(button('Open H2 2026 review'));
    await click(button('Open self-assessment'));
    expect(document.body.textContent).toContain('target ₹10,00,000');
    const revenue = byLabel('Actual result');
    await setValue(revenue, '850000');
    expect((document.querySelector('input[type=radio][value="3"]') as HTMLInputElement).checked).toBe(true);
    await click(document.querySelector('input[type=radio][value="5"]') as HTMLInputElement);
    await setValue(document.querySelector('textarea[maxlength="2000"]') as HTMLTextAreaElement, 'Closed three new accounts');
    expect(document.body.textContent).toContain('Unsaved changes');

    await click(button('Submit'));
    expect(dialog().textContent).toContain('Submit your self-assessment?');
    await click([...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Submit') as HTMLButtonElement);
    const [save] = sent('PUT', '/performance/my/reviews/as-self');
    expect(save.body.items).toEqual([
      { lineId: 'l-rev', kind: 'KPI', comment: null, actual: '850000' },
      { lineId: 'l-team', kind: 'KRA', comment: null, rating: '5' },
      { lineId: 'l-ach', kind: 'FIELD', comment: null, text: 'Closed three new accounts' },
    ]);
    expect(sent('POST', '/performance/my/reviews/as-self/submit')).toHaveLength(1);
    const alert = document.querySelector('[role=alert]') as HTMLElement;
    expect(alert.textContent).toContain('Business → Revenue: attach the evidence it asks for.');
    expect(document.activeElement).toBe(alert);
    // Still on the form, so the evidence can be attached.
    expect(document.body.textContent).toContain('Attach file');
  });

  it('nominates peers, up to the stage’s limit, for the manager to approve', async () => {
    await render(<PerformanceView />);
    await click(button('Open H2 2026 review'));
    expect(document.body.textContent).toContain('Choose 2 to 3 colleagues');
    expect(document.body.textContent).toContain('Waiting for approval');
    await setValue(byLabel('Find a colleague'), 'pi');
    await wait(300);
    await settle();
    expect(calls.find((c) => c.path === '/performance/my/colleagues')?.query).toBe('search=pi');
    await click([...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Pia')) as HTMLButtonElement);
    await click(button('Send 1 nomination'));
    expect(sent('POST', '/performance/my/appraisals/ap1/stages/peers/nominations')[0].body).toEqual({ tenantMemberIds: ['m-pia'] });
  });

  it('lets a manager approve one nomination and reject another with a note', async () => {
    await render(<PerformanceView />);
    await click(tab('Review inbox'));
    expect(document.body.textContent).toContain('Peer review: Noel');
    expect(document.body.textContent).toContain('Overdue');
    await click(button('Approve Ravi for Priya'));
    expect(sent('POST', '/performance/my/nominations/n1/decision')[0].body).toEqual({ approve: true });
    await click(button('Reject Hana for Priya'));
    await setValue(byLabel('Note for them'), 'Already reviewing as HR');
    await click([...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Reject') as HTMLButtonElement);
    expect(sent('POST', '/performance/my/nominations/n2/decision')[0].body).toEqual({ approve: false, note: 'Already reviewing as HR' });
  });

  it('shows a reviewer earlier reviews as allowed, combined without names where so, and declines with a reason', async () => {
    await render(<PerformanceView />);
    await click(tab('Review inbox'));
    await click(button('Open Peer review of Noel'));
    expect(document.body.textContent).toContain('Other peers · combined scores only');
    const combined = [...document.querySelectorAll('caption')].find((c) => c.textContent?.includes('Other peers'))?.closest('table') as HTMLTableElement;
    expect(combined.textContent).toContain('80%');
    expect(combined.textContent).not.toContain('Noel');
    // The self-assessment is read against every line, not only the one this stage rates.
    expect(document.body.textContent).toContain('Business → Revenue');
    expect(document.body.textContent).toContain('₹8,50,000');

    await click(button('Decline'));
    const confirm = [...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Decline') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await setValue(byLabel('Why you can’t review them'), 'Never worked with Noel');
    await click(confirm);
    expect(sent('POST', '/performance/my/reviews/as-peer/decline')[0].body).toEqual({ reason: 'Never worked with Noel' });
    expect(document.body.textContent).toContain('To review');
  });
});

describe('appraisal cycles', () => {
  beforeEach(() => { granted = new Set(['performance.my.view', 'performance.cycles.view', 'performance.cycles.manage', 'people.view', 'performance.reviews.view_all']); });

  it('launches with a choice made where two templates fit, without the person left out or the one in another cycle', async () => {
    await render(<PerformanceView />);
    await click(tab('Appraisal cycles'));
    await click(button('Open H2_2026'));
    expect(document.body.textContent).toContain('Not launched yet');
    await click(button('Preview and launch'));
    expect(document.body.textContent).toContain('2 templates fit them (SALES, GENERAL). Choose one.');
    expect((document.querySelector('input[aria-label="Include Dev"]') as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('2 of 4 will start');

    await setValue(byLabel('Template for Bina'), 't2');
    await click(document.querySelector('input[aria-label="Include Chetan"]') as HTMLInputElement);
    expect(document.body.textContent).toContain('2 of 4 will start');
    await click(button('Launch for 2'));
    expect(dialog().textContent).toContain('Launch H2 2026 review for 2 people?');
    await click([...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Launch') as HTMLButtonElement);
    expect(sent('POST', '/performance/cycles/c1/launch')[0].body).toEqual({
      confirm: true, excludeEmployeeIds: ['e3', 'e4'], choices: [{ employeeId: 'e2', templateId: 't2', workflowId: 'w1' }],
    });
    expect(document.body.textContent).toContain('Started, with 1 left out');
    expect(document.body.textContent).toContain('Esha: The workflow has no published version.');
  });

  it('keeps cycles read-only for viewers', async () => {
    granted = new Set(['performance.my.view', 'performance.cycles.view']);
    await render(<PerformanceView />);
    await click(tab('Appraisal cycles'));
    expect(button('New cycle')).toBeUndefined();
    expect(button('Archive H2_2026')).toBeUndefined();
    await click(button('Open H2_2026'));
    expect(button('Preview and launch')).toBeUndefined();
    expect(button('Edit')).toBeUndefined();
  });
});

describe('an appraisal for HR', () => {
  beforeEach(() => { granted = new Set(['performance.cycles.view', 'performance.cycles.manage', 'performance.reviews.view_all', 'performance.my.view']); });

  it('replaces a reviewer with a reason, and cancels only with a reason, saying what happens', async () => {
    const { AppraisalAdminView } = await import('./AppraisalAdminView');
    await render(<AppraisalAdminView appraisalId="ap1" onClose={() => undefined} />);
    expect(document.body.textContent).toContain('Reporting manager');

    await click(button('Replace Mira in Manager review'));
    expect(dialog().textContent).toContain('Replace Mira in Manager review');
    await setValue(byLabel('Reviewer'), 'qu');
    await wait(300);
    await settle();
    await click([...dialog().querySelectorAll('button')].find((b) => b.textContent?.startsWith('Quinn')) as HTMLButtonElement);
    await setValue(byLabel('Why'), 'Mira is on leave');
    await click([...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Replace') as HTMLButtonElement);
    expect(sent('POST', '/performance/appraisals/ap1/stages/manager/assignments')[0].body).toEqual({ tenantMemberId: 'm-quinn', replacesAssignmentId: 'as-m', reason: 'Mira is on leave' });

    await click(button('Cancel appraisal'));
    expect(dialog().textContent).toContain('Cancel Priya’s appraisal in H2 2026 review?');
    expect(dialog().textContent).toContain('Submitted reviews are kept');
    const confirm = [...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Cancel appraisal') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await setValue(byLabel('Reason'), 'Left the company');
    await click(confirm);
    expect(sent('POST', '/performance/appraisals/ap1/cancel')[0].body).toEqual({ reason: 'Left the company' });
    expect(document.body.textContent).toContain('Cancelled on');
    expect(button('Cancel appraisal')).toBeUndefined();
  });
});
