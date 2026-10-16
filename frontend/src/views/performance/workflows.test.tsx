import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Review workflows through the real screens (API stubbed): stages shown
 * step by step, adding a preset stage and running it side by side, settings
 * kept consistent as the source changes, publishing with the server's
 * refusal shown, and looking up who would review an employee.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { WorkflowsTab } = await import('./WorkflowsTab');
const { tidy, stageKey, workflowDraftOf, PRESETS } = await import('./workflow-form');

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, limit: 25, totalPages: 1, hasMore: false });
const stage = (key: string, extra: Record<string, unknown> = {}) => ({
  key, name: key, step: 1, source: 'REPORTING_MANAGER', mode: 'EACH', action: 'RATE', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null,
  aggregation: 'AVERAGE', scoreWeightPercent: null, ratedScope: 'ALL', kraIds: [], memberIds: [], roleId: null, nominatedBy: null, nominationNeedsApproval: false,
  allowsDecline: false, allowsReplacement: true, returnRule: 'NONE', dueDays: 14, reminderDays: [3, 1], escalateAfterDays: null, escalateTo: 'NONE', escalationRoleId: null,
  employeeSees: 'INDIVIDUAL_AFTER_FINALIZATION', identity: 'VISIBLE', laterStagesSee: 'INDIVIDUAL', role: null, escalationRole: null, members: [], kras: [], ...extra,
});
const version = (status: 'DRAFT' | 'PUBLISHED', extra: Record<string, unknown> = {}) => ({
  id: status === 'DRAFT' ? 'wv2' : 'wv1', number: status === 'DRAFT' ? 2 : 1, status, reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false,
  stages: [
    stage('self', { name: 'Self-assessment', source: 'SELF', scoreWeightPercent: '20' }),
    stage('manager', { name: 'Manager review', step: 2, scoreWeightPercent: '80', returnRule: 'SELF_ASSESSMENT' }),
  ],
  problems: [], changeNote: null, publishedAt: status === 'PUBLISHED' ? '2026-10-14T09:00:00Z' : null, publishedBy: status === 'PUBLISHED' ? 'Asha' : null, ...extra,
});
const WORKFLOW = (versions: unknown[]) => ({ id: 'w1', workflowCode: 'STANDARD', workflowName: 'Standard review', description: null, status: 'ACTIVE', appliesToAll: true, scopes: { departments: [], designations: [] }, versions });

let calls: { path: string; method: string; body: any }[];
let publishRefusal: unknown = null;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json({ success: true, data });

beforeEach(() => {
  granted = new Set(['performance.library.view', 'performance.workflows.manage', 'people.view']);
  calls = [];
  publishRefusal = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    calls.push({ path, method, body });
    if (path === '/performance/options') return ok({ departments: [], designations: [] });
    if (path === '/performance/options/roles') return ok([{ id: 'r1', name: 'HR' }]);
    if (path === '/performance/options/employees') return ok([{ id: 'e1', name: 'Priya Shah', code: 'E1' }]);
    if (path === '/performance/workflows' && method === 'GET') return ok(page([{ id: 'w1', workflowCode: 'STANDARD', workflowName: 'Standard review', status: 'ACTIVE', appliesTo: { all: true, departments: [], designations: [] }, currentVersion: { number: 1, stages: [{ name: 'Self-assessment', step: 1 }, { name: 'Manager review', step: 2 }, { name: 'Peer review', step: 2 }] }, draft: { number: 2 } }]));
    if (path === '/performance/workflows/w1' && method === 'GET') return ok(WORKFLOW([version('DRAFT'), version('PUBLISHED')]));
    if (path === '/performance/workflows/w1/draft' && method === 'PUT') return ok(WORKFLOW([version('DRAFT', { stages: body.stages.map((s: Record<string, unknown>) => ({ ...s, role: null, escalationRole: null, members: [], kras: [] })) }), version('PUBLISHED')]));
    if (path === '/performance/workflows/w1/draft/publish') return publishRefusal ? json(publishRefusal, 400) : ok(WORKFLOW([version('PUBLISHED', { id: 'wv2', number: 2 }), version('PUBLISHED')]));
    if (path === '/performance/workflows/w1/versions/wv1/resolve') {
      return ok({
        employee: { id: 'e1', name: 'Priya Shah' }, onDate: body.onDate, resolvedAt: 'AT_LAUNCH',
        stages: [
          { stageKey: 'self', stageName: 'Self-assessment', step: 1, status: 'NEEDS_ASSIGNMENT', reviewers: [], leftOut: [{ name: 'Priya Shah', reason: 'has no linked sign-in account, so can’t self-assess' }], message: 'Nobody was found. Assign a reviewer.' },
          { stageKey: 'manager', stageName: 'Manager review', step: 2, status: 'RESOLVED', reviewers: [{ tenantMemberId: 'm1', name: 'Mira Rao', via: 'Reporting manager' }], leftOut: [], message: '1 reviewer.' },
        ],
      });
    }
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
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement;
const byAria = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement & HTMLSelectElement;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return (document.getElementById(label?.getAttribute('for') ?? '') ?? label?.querySelector('input,select,textarea')) as HTMLInputElement & HTMLSelectElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const open = async () => { await act(async () => root.render(<WorkflowsTab />)); await settle(); await click(button('Edit STANDARD')); };
const lastDraft = () => [...calls].reverse().find((c) => c.path === '/performance/workflows/w1/draft' && c.method === 'PUT')?.body;

describe('review workflows', () => {
  it('lists each workflow’s path, steps in order and side-by-side stages joined', async () => {
    await act(async () => root.render(<WorkflowsTab />));
    await settle();
    expect(document.body.textContent).toContain('Self-assessment → Manager review + Peer review');
  });

  it('adds a preset stage, runs it side by side with the manager, and saves it', async () => {
    await open();
    expect(document.querySelector('[role=status]')?.textContent).toBe('Stages counting toward the final score total 100%');
    await setValue(byAria('Add a stage'), 'peers');
    expect(document.body.textContent).toContain('Step 3');
    await setValue(byAria('Peer review: step'), '2');
    expect(document.body.textContent).toContain('Step 2 · side by side');
    expect(document.body.textContent).not.toContain('Step 3');
    await setValue(byAria('Manager review: share of the final score (%)'), '60');
    await setValue(byAria('Peer review: share of the final score (%)'), '20');
    await click(button('Save draft'));
    const peers = lastDraft().stages.find((s: { key: string }) => s.key === 'peer_review');
    expect(peers).toMatchObject({
      step: 2, source: 'NOMINATED', nominatedBy: 'EMPLOYEE', nominationNeedsApproval: true, minReviewers: 2, maxReviewers: 5, completion: 'AT_LEAST', minCompleted: 2,
      identity: 'HIDDEN_FROM_EMPLOYEE', employeeSees: 'AGGREGATE_AFTER_FINALIZATION', scoreWeightPercent: '20',
    });
    expect(peers).not.toHaveProperty('memberNames');
  });

  it('keeps a stage’s settings consistent when its reviewers change', async () => {
    await open();
    await setValue(byAria('Add a stage'), 'hr');
    expect(byAria('HR approval: role')).toBeTruthy();
    await setValue(byAria('HR approval: role'), 'r1');
    await setValue(byAria('HR approval: reviewers'), 'DEPARTMENT_HEAD');
    await click(button('Save draft'));
    expect(lastDraft().stages.find((s: { key: string }) => s.key === 'hr_approval')).toMatchObject({
      source: 'DEPARTMENT_HEAD', roleId: null, mode: 'EACH', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null, action: 'APPROVE', scoreWeightPercent: null,
    });
  });

  it('publishes after confirming, and shows why the server refused', async () => {
    publishRefusal = { statusCode: 400, message: 'The workflow can’t be published yet.', errors: [{ path: 'stages', message: 'The stages that count toward the final score add up to 90%, not 100%.' }] };
    await open();
    await click(button('Publish version 2'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('A published version can never be changed');
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Publish version 2') as HTMLButtonElement);
    expect(document.querySelector('[role=alert]')?.textContent).toContain('add up to 90%, not 100%');
    publishRefusal = null;
    await click(button('Publish version 2'));
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Publish version 2') as HTMLButtonElement);
    expect(document.body.textContent).toContain('Version 2 (published)');
  });

  it('shows a published version read-only and finds who would review an employee', async () => {
    await open();
    await click(button('Version 1 (published)'));
    expect(byAria('Stage 1: name').matches(':disabled')).toBe(true);
    await setValue(byLabel('Employee'), 'pri');
    await wait(300);
    await settle();
    await click(button('Priya Shah'));
    await setValue(document.getElementById('resolve-date') as HTMLInputElement, '2026-10-14');
    await click(button('Find reviewers'));
    expect(calls.find((c) => c.path.endsWith('/resolve'))?.body).toEqual({ employeeId: 'e1', onDate: '2026-10-14' });
    expect(document.body.textContent).toContain('Needs assigning');
    expect(document.body.textContent).toContain('Priya Shah left out: has no linked sign-in account, so can’t self-assess');
    expect(document.body.textContent).toContain('Mira Rao · Reporting manager');
  });

  it('puts right what no longer fits a stage', () => {
    const peers = { ...PRESETS.find((p) => p.id === 'peers')!.stage(2), key: 'peers' };
    expect(tidy({ ...peers, source: 'SELF' })).toMatchObject({ mode: 'EACH', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null, nominatedBy: null, identity: 'VISIBLE', allowsDecline: false });
    expect(tidy({ ...peers, action: 'REVIEW', scoreWeightPercent: '20' }).scoreWeightPercent).toBeNull();
    expect(tidy({ ...peers, mode: 'POOL', aggregation: 'LEAD_REVIEWER' }).aggregation).toBe('AVERAGE');
    expect(stageKey('Manager review', ['manager_review'])).toBe('manager_review_2');
    expect(workflowDraftOf({ reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false, changeNote: ' ', stages: [{ ...peers, scoreWeightPercent: ' ' }] }).stages[0]).toMatchObject({ scoreWeightPercent: null });
  });
});
