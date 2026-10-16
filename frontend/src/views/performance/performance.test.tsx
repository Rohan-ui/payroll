import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Performance setup through the real screens (API stubbed): tabs by
 * permission, building a department KRA with weighted KPIs, a refused stale
 * edit, KPI fields that follow the kind of measurement, publishing a rating
 * scale with the server's problems shown, and appointing a department head.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { PerformanceView } = await import('./PerformanceView');
const { weightTotal } = await import('./performance-format');

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, limit: 25, totalPages: 1, hasMore: false });
const KRA_ROW = {
  id: 'k1', kraCode: 'BUSINESS_RESULTS', kraName: 'Business results', status: 'ACTIVE', evidenceRequirement: 'OPTIONAL', defaultWeightPercent: '40', defaultMaxMarks: '100',
  ratingScaleName: 'Five-point', kpiCount: 2, appliesTo: { all: false, departments: ['Sales'], designationCount: 0, employeeCount: 1 }, effectiveFrom: '2026-01-01', effectiveTo: null,
};
const KRA = {
  id: 'k1', kraCode: 'BUSINESS_RESULTS', kraName: 'Business results', description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'OPTIONAL',
  defaultWeightPercent: '40', defaultMaxMarks: '100', defaultMinMarks: null, ratingScale: { id: 'sc1', name: 'Five-point', status: 'ACTIVE' }, appliesToAll: false,
  scopes: { departments: [{ id: 'd1', name: 'Sales' }], designations: [], employees: [{ id: 'e1', name: 'Priya Shah', code: 'E1' }] },
  kpis: [{ kpiId: 'p1', kpiCode: 'REVENUE', kpiName: 'Revenue', measurementType: 'CURRENCY', status: 'ACTIVE', defaultWeightPercent: '60' }],
  effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', revision: 3, createdBy: 'Asha', updatedBy: 'Asha', updatedAt: '',
};
const SCALE_ROW = { id: 'sc1', scaleCode: 'FIVE_POINT', scaleName: 'Five-point', description: null, status: 'ACTIVE', currentVersion: { number: 1, inputKind: 'LEVELS', minValue: '1', maxValue: '5', unitLabel: null, levelCount: 5, bandCount: 0 }, draft: null };
const SCALE = (versions: unknown[]) => ({ id: 'sc2', scaleCode: 'NEW_SCALE', scaleName: 'New scale', description: null, status: 'ACTIVE', usedBy: { kras: 0, kpis: 0 }, versions });
const draftVersion = (body: any, status = 'DRAFT') => ({ id: 'v1', number: 1, status, ...body, minValue: '1', maxValue: '5', conversion: [], changeNote: null, publishedAt: status === 'PUBLISHED' ? '2026-10-14T00:00:00Z' : null, publishedBy: null });

let calls: { path: string; method: string; body: any }[];
let kraUpdate: () => Response;
let kraQueries: string[];
let kraDelete: () => Response;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json({ success: true, data });

beforeEach(() => {
  granted = new Set(['performance.library.view', 'performance.library.manage', 'performance.scales.manage', 'performance.department_heads.manage']);
  calls = [];
  kraUpdate = () => ok(KRA);
  kraQueries = [];
  kraDelete = () => ok({ deleted: true });
  let savedDraft: any = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const [path, query = ''] = url.replace(/^.*\/api\/v1/, '').split('?');
    calls.push({ path, method, body });
    if (path === '/performance/options') return ok({ departments: [{ id: 'd1', name: 'Sales' }, { id: 'd2', name: 'Engineering' }], designations: [{ id: 'g1', name: 'Manager' }] });
    if (path === '/performance/options/employees') return ok([{ id: 'e2', name: 'Ravi Kumar', code: 'E2' }]);
    if (path === '/performance/kras' && method === 'GET') { kraQueries.push(query); return ok({ ...page([KRA_ROW]), counts: { active: 1, archived: 2 } }); }
    if (path === '/performance/kras/k1' && method === 'DELETE') return kraDelete();
    if (path === '/performance/starter-library') return ok({ kpisCreated: 38, krasCreated: 9, alreadyThere: 0, departmentsNotFound: ['Operations', 'Human Resources'] });
    if (path === '/performance/kras' && method === 'POST') return json({ success: true, data: { ...KRA, kraCode: body.kraCode } }, 201);
    if (path === '/performance/kras/k1' && method === 'GET') return ok(KRA);
    if (path === '/performance/kras/k1' && method === 'PUT') return kraUpdate();
    if (path === '/performance/kpis' && method === 'GET') {
      return ok(page(new URLSearchParams(query).get('search')
        ? [{ id: 'p2', kpiCode: 'NEW_CLIENTS', kpiName: 'New clients', status: 'ACTIVE', measurementType: 'COUNT', unitLabel: null, currencyCode: null, direction: 'HIGHER_IS_BETTER', defaultTarget: '10', defaultMaxMarks: null, ratingScaleName: null, evidenceRequirement: 'NONE', kraCount: 0 }]
        : []));
    }
    if (path === '/performance/kpis' && method === 'POST') return json({ success: true, data: { id: 'p3', kpiCode: body.kpiCode } }, 201);
    if (path === '/performance/rating-scales' && method === 'GET') return ok(page([SCALE_ROW]));
    if (path === '/performance/rating-scales' && method === 'POST') { savedDraft = body.draft; return json({ success: true, data: SCALE([draftVersion(body.draft)]) }, 201); }
    if (path === '/performance/rating-scales/sc2/draft' && method === 'PUT') {
      if (!body.bands.length) return json({ statusCode: 400, message: 'Some rating scale settings need fixing.', errors: [{ path: 'levels', message: 'Add at least two levels.' }] }, 400);
      savedDraft = body;
      return ok(SCALE([draftVersion(body)]));
    }
    if (path === '/performance/rating-scales/sc2/draft/publish') return ok(SCALE([draftVersion(savedDraft, 'PUBLISHED')]));
    if (path === '/performance/department-heads' && method === 'GET') return ok([{ id: 'd1', code: 'SALES', name: 'Sales', current: { appointmentId: 'a1', employee: { id: 'e1', name: 'Priya Shah', code: 'E1' }, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE' }, upcoming: null }]);
    if (path === '/performance/department-heads' && method === 'POST') return json({ success: true, data: [] }, 201);
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
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return (document.getElementById(label?.getAttribute('for') ?? '') ?? label?.querySelector('input,select,textarea')) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const tab = (name: string) => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === name) as HTMLButtonElement;
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };
const submit = async (form: HTMLFormElement) => { await act(async () => form.requestSubmit()); await settle(); };

describe('performance setup', () => {
  it('shows the setup tabs to people who may view it, and nothing else to the rest', async () => {
    await render(<PerformanceView />);
    expect([...document.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual(['KRA library', 'KPI library', 'Rating scales', 'Appraisal templates', 'Review workflows', 'Department heads']);
    expect(document.body.textContent).toContain('Business results');
    expect(document.body.textContent).toContain('Sales · 1 employee');

    act(() => root.unmount());
    root = createRoot(container);
    granted = new Set();
    await render(<PerformanceView />);
    expect(document.querySelectorAll('[role=tab]')).toHaveLength(0);
    expect(document.body.textContent).toContain('You don’t have access to performance.');
  });

  it('loads the starter KRAs and KPIs after saying what they are, and reports departments not found', async () => {
    // It also creates a rating scale, so it needs that permission too.
    granted.delete('performance.scales.manage');
    await render(<PerformanceView />);
    expect(button('Load starter KRAs & KPIs')).toBeUndefined();
    act(() => root.unmount());
    root = createRoot(container);
    granted.add('performance.scales.manage');
    await render(<PerformanceView />);
    await click(button('Load starter KRAs & KPIs'));
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.textContent).toContain('Anything with the same code already in your library is left as it is.');
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Load them') as HTMLButtonElement);
    expect(calls.filter((c) => c.path === '/performance/starter-library' && c.method === 'POST')).toHaveLength(1);
    const result = document.querySelector('[role=dialog]') as HTMLElement;
    expect(result.textContent).toContain('Added 9 KRAs and 38 KPIs.');
    expect(result.textContent).toContain('No department matched Operations, Human Resources');
    // The list is loaded again to show them.
    expect(kraQueries.length).toBeGreaterThan(1);
  });

  it('lets a viewer open a KRA read-only, without new, duplicate or archive', async () => {
    granted = new Set(['performance.library.view']);
    await render(<PerformanceView />);
    expect(button('New KRA')).toBeUndefined();
    expect(button('Archive BUSINESS_RESULTS')).toBeUndefined();
    await click(button('View BUSINESS_RESULTS'));
    expect(byLabel('Name').matches(':disabled')).toBe(true);
    expect(button('Save KRA')).toBeUndefined();
  });

  it('creates a department KRA with a KPI found by search and its weight, sending decimals as text', async () => {
    await render(<PerformanceView />);
    await click(button('New KRA'));
    await setValue(byLabel('Code'), 'sales results');
    expect(byLabel('Code').value).toBe('SALESRESULTS');
    await setValue(byLabel('Name'), 'Sales results');
    await setValue(byLabel('Weight in the appraisal'), '40');
    await click([...document.querySelectorAll('label')].find((l) => l.textContent?.includes('Chosen departments'))!.querySelector('input')!);
    await click([...document.querySelectorAll('label')].find((l) => l.textContent === 'Sales')!.querySelector('input')!);
    await setValue(byLabel('Add a KPI'), 'new');
    await wait(300);
    await settle();
    await click(button('New clients'));
    await setValue(document.querySelector('[aria-label^="Suggested weight of NEW_CLIENTS"]') as HTMLInputElement, '60');
    expect(document.body.textContent).toContain('Suggested weights total 60% (templates need 100%)');

    await submit(button('Create KRA').closest('form')!);
    const post = calls.find((c) => c.path === '/performance/kras' && c.method === 'POST');
    expect(post?.body).toMatchObject({
      kraCode: 'SALESRESULTS', kraName: 'Sales results', defaultWeightPercent: '40', appliesToAll: false,
      scopes: { departmentIds: ['d1'], designationIds: [], employeeIds: [] }, kpis: [{ kpiId: 'p2', defaultWeightPercent: '60' }],
    });
  });

  it('explains a refused stale edit and offers to reload', async () => {
    kraUpdate = () => json({ statusCode: 409, message: 'Someone else changed this KRA after you opened it. Reload it to see their changes, then make yours again.' }, 409);
    await render(<PerformanceView />);
    await click(button('Edit BUSINESS_RESULTS'));
    await setValue(byLabel('Name'), 'Business results 2027');
    await submit(button('Save KRA').closest('form')!);
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ expectedRevision: 3, kraName: 'Business results 2027' });
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Someone else changed this KRA');
    await click(button('Reload the latest version'));
    expect(byLabel('Name').value).toBe('Business results');
  });

  it('shows the fields a KPI needs for its kind of measurement', async () => {
    await render(<PerformanceView />);
    await click(tab('KPI library'));
    await click(button('New KPI'));
    await setValue(byLabel('Code'), 'TEAMWORK');
    await setValue(byLabel('Name'), 'Teamwork');
    expect(byLabel('Target')).toBeTruthy();
    await setValue(byLabel('Measured as'), 'RATING');
    expect(byLabel('Target')).toBeUndefined();
    await setValue(byLabel('Rating scale'), 'sc1');
    await submit(button('Create KPI').closest('form')!);
    expect(calls.find((c) => c.path === '/performance/kpis' && c.method === 'POST')?.body).toMatchObject({
      kpiCode: 'TEAMWORK', measurementType: 'RATING', direction: 'NOT_APPLICABLE', ratingScaleId: 'sc1', defaultTarget: null, currencyCode: null,
    });
  });

  it('creates a rating scale from a preset, shows the server’s problems, and publishes after confirming', async () => {
    await render(<PerformanceView />);
    await click(tab('Rating scales'));
    await click(button('New rating scale'));
    await setValue(byLabel('Code'), 'NEW_SCALE');
    await setValue(byLabel('Name'), 'New scale');
    await click(button('Create as draft'));
    expect(calls.find((c) => c.path === '/performance/rating-scales' && c.method === 'POST')?.body.draft).toMatchObject({
      inputKind: 'LEVELS', conversionMethod: 'PROPORTION_OF_MAX', levels: [{ value: '1', label: 'Unsatisfactory' }, {}, {}, {}, { value: '5', label: 'Outstanding' }],
    });

    for (let i = 0; i < 4; i += 1) await click(button(`Remove band 1`));
    await click(button('Save draft'));
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Add at least two levels.');

    await click(button('Add band'));
    await setValue(document.querySelector('[aria-label="Final rating name of band 1"]') as HTMLInputElement, 'All');
    await click(button('Publish version 1'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('A published version can never be changed');
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Publish version 1') as HTMLButtonElement);
    expect(calls.filter((c) => c.path.startsWith('/performance/rating-scales/sc2')).map((c) => `${c.method} ${c.path}`).slice(-2))
      .toEqual(['PUT /performance/rating-scales/sc2/draft', 'POST /performance/rating-scales/sc2/draft/publish']);
    expect(document.body.textContent).toContain('Version 1');
  });

  it('appoints a department head found by search', async () => {
    await render(<PerformanceView />);
    await click(tab('Department heads'));
    expect(document.body.textContent).toContain('Priya Shah');
    await click(button('Appoint a head of Sales'));
    expect(document.body.textContent).toContain('Priya Shah’s appointment will end the day before the new head starts');
    await setValue(byLabel('New head'), 'Ra');
    await wait(300);
    await settle();
    await click(button('Ravi Kumar'));
    await setValue(byLabel('Heads the department from'), '2026-11-01');
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Appoint') as HTMLButtonElement);
    expect(calls.find((c) => c.path === '/performance/department-heads' && c.method === 'POST')?.body).toEqual({ departmentId: 'd1', employeeId: 'e2', effectiveFrom: '2026-11-01' });
  });

  it('shows active and archived KRAs on their own tabs, with counts', async () => {
    await render(<PerformanceView />);
    expect(button('Active (1)').getAttribute('aria-pressed')).toBe('true');
    await click(button('Archived (2)'));
    expect(button('Archived (2)').getAttribute('aria-pressed')).toBe('true');
    expect(new URLSearchParams(kraQueries[kraQueries.length - 1]).get('status')).toBe('ARCHIVED');
  });

  it('deletes after a specific confirmation, and shows why the server refused', async () => {
    kraDelete = () => json({ statusCode: 409, message: 'BUSINESS_RESULTS can’t be deleted because it is used by template SALES version 1. Archive it instead to keep it out of new work.' }, 409);
    await render(<PerformanceView />);
    await click(button('Delete BUSINESS_RESULTS'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('removed for good');
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Delete BUSINESS_RESULTS') as HTMLButtonElement);
    expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toContain('used by template SALES version 1');

    await click(button('Keep it'));
    kraDelete = () => ok({ deleted: true });
    await click(button('Delete BUSINESS_RESULTS'));
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Delete BUSINESS_RESULTS') as HTMLButtonElement);
    expect(calls.filter((c) => c.method === 'DELETE' && c.path === '/performance/kras/k1')).toHaveLength(2);
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });

  it('totals suggested weights without binary rounding', () => {
    expect(weightTotal(['33.3333', '33.3333', '33.3334'])).toBe('100');
    expect(weightTotal(['0.1', '0.2'])).toBe('0.3');
    expect(weightTotal(['60', ''])).toBeNull();
  });
});
