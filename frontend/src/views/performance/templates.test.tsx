import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Appraisal templates through the real screens (API stubbed): building a
 * draft from library KRAs with weights that must total, scoring methods and
 * their settings, scoring in marks, questions, publishing with the server's
 * refusal shown, a published version read-only, and trying the scoring.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { TemplatesTab } = await import('./TemplatesTab');
const { draftOf, keyFrom, kpiLineOf, EMPTY_DRAFT } = await import('./template-form');

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, limit: 25, totalPages: 1, hasMore: false });
const SCALE = { scaleId: 'sc1', scaleName: 'Five-point', versionId: 'sv1', versionNumber: 1, inputKind: 'LEVELS', minValue: '1', maxValue: '5', stepValue: null,
  levels: ['Poor', 'Fair', 'Good', 'Great', 'Superb'].map((label, i) => ({ value: String(i + 1), label })), bands: [{ label: 'Meets', minPercent: '0', maxPercent: '100' }] };
const kpiLine = (extra: Record<string, unknown> = {}) => ({
  id: 'tk1', kpiId: 'p1', kpiCode: 'REVENUE', kpiName: 'Revenue', description: null, measurementType: 'CURRENCY', unitLabel: '₹', currencyCode: 'INR', direction: 'HIGHER_IS_BETTER',
  evidenceRequirement: 'NONE', evaluationInstructions: null, weightPercent: '100', maxMarks: null, scoringMethod: 'PERCENT_OF_TARGET', scoringConfig: {}, targetSource: 'TEMPLATE',
  target: '1000000', threshold: null, stretch: null, ratingScale: null, allowsExemption: false, ...extra,
});
const version = (status: 'DRAFT' | 'PUBLISHED', extra: Record<string, unknown> = {}) => ({
  id: status === 'DRAFT' ? 'v2' : 'v1', number: status === 'DRAFT' ? 2 : 1, status,
  policy: { scoringModel: 'WEIGHTED', weightRule: 'MUST_TOTAL', totalMarks: null, missingRatingRule: 'BLOCK', scoreDecimals: 2, finalScale: SCALE },
  kras: [
    { id: 'tr1', kraId: 'k1', kraCode: 'BUSINESS', kraName: 'Business results', description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'NONE',
      weightPercent: '60', maxMarks: null, minMarks: null, scoringMethod: null, ratingScale: null, allowsExemption: false, kpis: [kpiLine()] },
    { id: 'tr2', kraId: 'k2', kraCode: 'TEAMWORK', kraName: 'Teamwork', description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'NONE',
      weightPercent: '40', maxMarks: null, minMarks: null, scoringMethod: 'RATING_SCALE', ratingScale: SCALE, allowsExemption: false, kpis: [] },
  ],
  fields: [],
  problems: [],
  changeNote: null,
  publishedAt: status === 'PUBLISHED' ? '2026-10-14T09:00:00Z' : null,
  publishedBy: status === 'PUBLISHED' ? 'Asha' : null,
  ...extra,
});
const TEMPLATE = (versions: unknown[]) => ({ id: 't1', templateCode: 'SALES', templateName: 'Sales appraisal', description: null, status: 'ACTIVE', appliesToAll: true, scopes: { departments: [], designations: [] }, versions });
const LIBRARY_KRA = {
  id: 'k3', kraCode: 'QUALITY', kraName: 'Quality', description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'OPTIONAL',
  defaultWeightPercent: '20', defaultMaxMarks: '20', defaultMinMarks: null, ratingScale: null, appliesToAll: true, scopes: { departments: [], designations: [], employees: [] },
  kpis: [{ kpiId: 'p9', kpiCode: 'DEFECTS', kpiName: 'Defect rate', measurementType: 'PERCENTAGE', status: 'ACTIVE', defaultWeightPercent: '100', direction: 'LOWER_IS_BETTER',
    unitLabel: '%', defaultTarget: '2', minimumExpected: '5', stretchTarget: '1', defaultMaxMarks: null, ratingScaleId: null }],
  effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', revision: 1, createdBy: null, updatedBy: null, updatedAt: '',
};

let calls: { path: string; method: string; body: any }[];
let current: ReturnType<typeof TEMPLATE>;
let publishRefusal: unknown = null;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json({ success: true, data });

beforeEach(() => {
  granted = new Set(['performance.library.view', 'performance.templates.manage']);
  calls = [];
  publishRefusal = null;
  current = TEMPLATE([version('DRAFT'), version('PUBLISHED')]);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    calls.push({ path, method, body });
    if (path === '/performance/options') return ok({ departments: [{ id: 'd1', name: 'Sales' }], designations: [] });
    if (path === '/performance/rating-scales') return ok(page([{ id: 'sc1', scaleCode: 'FIVE', scaleName: 'Five-point', description: null, status: 'ACTIVE', currentVersion: { number: 1, inputKind: 'LEVELS', minValue: '1', maxValue: '5', unitLabel: null, levelCount: 5, bandCount: 1 }, draft: null }]));
    if (path === '/performance/templates' && method === 'GET') return ok(page([{ id: 't1', templateCode: 'SALES', templateName: 'Sales appraisal', status: 'ACTIVE', appliesTo: { all: true, departments: [], designations: [] }, currentVersion: { number: 1, scoringModel: 'WEIGHTED', kraCount: 2, questionCount: 0 }, draft: { number: 2 } }]));
    if (path === '/performance/templates/t1' && method === 'GET') return ok(current);
    if (path === '/performance/templates/t1/draft' && method === 'PUT') return ok(current);
    if (path === '/performance/templates/t1/draft/publish') return publishRefusal ? json(publishRefusal, 400) : ok(TEMPLATE([version('PUBLISHED', { id: 'v2', number: 2 }), version('PUBLISHED')]));
    if (path === '/performance/templates/t1/versions/v1/preview') {
      return ok({
        status: 'COMPLETE', scorePercent: '90.00', marks: null, totalMarks: null, band: { label: 'Meets', description: null },
        kras: [
          { key: 'tr1', code: 'BUSINESS', name: 'Business results', status: 'SCORED', scorePercent: '85', weight: '60', sharePercent: '60', marks: null, maxMarks: null, contributionPercent: '51', steps: ['Business results = (100 × 85%) ÷ 100 = 85%'], problem: null,
            kpis: [{ key: 'tk1', code: 'REVENUE', name: 'Revenue', status: 'SCORED', scorePercent: '85', weight: '100', sharePercent: '100', marks: null, maxMarks: null, contributionPercent: '51', steps: ['Achievement = actual 850000 ₹ ÷ target 1000000 ₹ × 100 = 85%'], problem: null }] },
          { key: 'tr2', code: 'TEAMWORK', name: 'Teamwork', status: 'SCORED', scorePercent: '100', weight: '40', sharePercent: '40', marks: null, maxMarks: null, contributionPercent: '40', steps: ['Rated 5 (Superb), which scores 100% on the scale'], problem: null, kpis: [] },
        ],
        fields: [], steps: ['Overall score = (60 × 85% + 40 × 100%) ÷ 100 = 91%'], problems: [],
      });
    }
    if (path === '/performance/kras' && method === 'GET') return ok(page([{ id: 'k3', kraCode: 'QUALITY', kraName: 'Quality', status: 'ACTIVE', evidenceRequirement: 'OPTIONAL', defaultWeightPercent: '20', defaultMaxMarks: '20', ratingScaleName: null, kpiCount: 1, appliesTo: { all: true, departments: [], designationCount: 0, employeeCount: 0 }, effectiveFrom: '2026-01-01', effectiveTo: null }]));
    if (path === '/performance/kras/k3') return ok(LIBRARY_KRA);
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
  return (document.getElementById(label?.getAttribute('for') ?? '') ?? label?.querySelector('input,select,textarea')) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const render = async () => { await act(async () => root.render(<TemplatesTab />)); await settle(); };
const openTemplate = async () => { await render(); await click(button('Edit SALES')); };
const lastDraft = () => [...calls].reverse().find((c) => c.path === '/performance/templates/t1/draft' && c.method === 'PUT')?.body;

describe('appraisal templates', () => {
  it('opens the draft, showing each KRA’s weight and the total', async () => {
    await openTemplate();
    expect(document.body.textContent).toContain('Version 2 (draft)');
    expect(byAria('Business results: weight in the appraisal (%)').value).toBe('60');
    expect(document.querySelector('[role=status]')?.textContent).toBe('KRAs total 100%');
    await setValue(byAria('Business results: weight in the appraisal (%)'), '50');
    expect(document.querySelector('[role=status]')?.textContent).toBe('KRAs total 90% (needs 100%)');
  });

  it('adds a library KRA with its suggested KPIs and a scoring method that suits each, then saves', async () => {
    await openTemplate();
    await setValue(byLabel('Add a KRA'), 'qual');
    await wait(300);
    await settle();
    await click(button('Quality'));
    expect(document.body.textContent).toContain('Defect rate');
    await setValue(byAria('Quality: weight in the appraisal (%)'), '20');
    await setValue(byAria('Business results: weight in the appraisal (%)'), '40');
    await click(button('Save draft'));
    const body = lastDraft();
    expect(body.kras.map((k: { kraId: string; weightPercent: string }) => [k.kraId, k.weightPercent])).toEqual([['k1', '40'], ['k2', '40'], ['k3', '20']]);
    expect(body.kras[2].kpis[0]).toMatchObject({ kpiId: 'p9', weightPercent: '100', scoringMethod: 'PERCENT_OF_TARGET', targetSource: 'TEMPLATE', target: '2', threshold: '5', stretch: '1', maxMarks: null });
    expect(body.kras[1]).toMatchObject({ scoringMethod: 'RATING_SCALE', ratingScaleId: 'sc1', kpis: [] });
  });

  it('shows a method’s own settings and sends them', async () => {
    await openTemplate();
    await setValue(byAria('Business results → Revenue: scored by'), 'SLABS');
    expect(byAria('Business results → Revenue: slab 1 from').value).toBe('0');
    await setValue(byAria('Business results → Revenue: slab 4 score'), '110');
    await setValue(byAria('Business results → Revenue: scored by'), 'LINEAR_BETWEEN');
    expect(byAria('Business results → Revenue: threshold')).toBeTruthy();
    await setValue(byAria('Business results → Revenue: threshold'), '700000');
    await setValue(byAria('Business results → Revenue: At target'), '90');
    await click(button('Save draft'));
    expect(lastDraft().kras[0].kpis[0]).toMatchObject({
      scoringMethod: 'LINEAR_BETWEEN', threshold: '700000', target: '1000000', scoringConfig: { belowThresholdScore: '0', thresholdScore: '50', targetScore: '90', stretchScore: '100' },
    });
  });

  it('switches to marks, where marks are the weights', async () => {
    await openTemplate();
    await click([...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Marks'))!.querySelector('input')!);
    await setValue(byLabel('Total marks'), '100');
    await setValue(byAria('Business results: marks'), '60');
    await setValue(byAria('Business results → Revenue: marks'), '60');
    await setValue(byAria('Teamwork: marks'), '40');
    expect(document.querySelector('[role=status]')?.textContent).toBe('KRAs total 100 marks');
    await click(button('Save draft'));
    const body = lastDraft();
    expect(body).toMatchObject({ scoringModel: 'MARKS', totalMarks: '100' });
    expect(body.kras.map((k: { weightPercent: string | null; maxMarks: string | null }) => [k.weightPercent, k.maxMarks])).toEqual([[null, '60'], [null, '40']]);
  });

  it('adds questions with a key from their label; only rating and number questions can count', async () => {
    await openTemplate();
    await setValue(byAria('Add a question of this kind'), 'DROPDOWN');
    await setValue(byAria('Question 1: label'), 'Ready for promotion?');
    expect(byAria('Ready for promotion?: key').value).toBe('choose_one');
    await setValue(byAria('Ready for promotion?: choices'), 'Now\nIn a year');
    expect(document.body.textContent).not.toContain('Counts toward the score');
    await setValue(byAria('Add a question of this kind'), 'RATING');
    await setValue(byAria('Rating: answered by'), 'REVIEWERS');
    await click([...document.querySelectorAll('label')].find((l) => l.textContent === 'Counts toward the score')!.querySelector('input')!);
    await setValue(byAria('Rating: weight (%)'), '10');
    await click(button('Save draft'));
    expect(lastDraft().fields).toEqual([
      expect.objectContaining({ key: 'choose_one', type: 'DROPDOWN', label: 'Ready for promotion?', config: { options: ['Now', 'In a year'] }, scored: false, weightPercent: null }),
      expect.objectContaining({ key: 'rating', type: 'RATING', filledBy: 'REVIEWERS', scored: true, weightPercent: '10' }),
    ]);
  });

  it('publishes after a specific confirmation, and shows why the server refused', async () => {
    publishRefusal = { statusCode: 400, message: 'The template can’t be published yet.', errors: [{ path: 'kras', message: 'The KRAs weights add up to 90%, not 100%.' }] };
    await openTemplate();
    await click(button('Publish version 2'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('A published version can never be changed');
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Publish version 2') as HTMLButtonElement);
    expect(document.querySelector('[role=alert]')?.textContent).toContain('The KRAs weights add up to 90%, not 100%.');

    publishRefusal = null;
    await click(button('Publish version 2'));
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Publish version 2') as HTMLButtonElement);
    expect(calls.filter((c) => c.path === '/performance/templates/t1/draft/publish')).toHaveLength(2);
    expect(document.body.textContent).toContain('Version 2 (published)');
  });

  it('shows a published version read-only and tries its scoring with sample results', async () => {
    await openTemplate();
    await click(button('Version 1 (published)'));
    expect(byAria('Business results: weight in the appraisal (%)').matches(':disabled')).toBe(true);
    expect(document.body.textContent).toContain('Published');
    await setValue(byAria('Business results → Revenue (₹): actual'), '850000');
    await setValue(byAria('Teamwork: rating'), '5');
    await click(button('Work out the score'));
    expect(calls.find((c) => c.path.endsWith('/preview'))?.body).toEqual({ inputs: { tk1: { actual: '850000' }, tr2: { rating: '5' } } });
    expect(document.body.textContent).toContain('90.00% · Meets');
    expect(document.body.textContent).toContain('Achievement = actual 850000 ₹ ÷ target 1000000 ₹ × 100 = 85%');
  });

  it('makes form defaults that suit each KPI, and sends only the weight the model uses', () => {
    const rated = kpiLineOf({ kpiId: 'x', kpiCode: 'X', kpiName: 'X', measurementType: 'RATING', direction: 'NOT_APPLICABLE', unitLabel: null, defaultTarget: null, minimumExpected: null, stretchTarget: null, defaultMaxMarks: null, ratingScaleId: 's' }, '50');
    expect(rated).toMatchObject({ scoringMethod: 'RATING_SCALE', ratingScaleId: 's', weightPercent: '50' });
    const personal = kpiLineOf({ kpiId: 'y', kpiCode: 'Y', kpiName: 'Y', measurementType: 'COUNT', direction: 'HIGHER_IS_BETTER', unitLabel: null, defaultTarget: null, minimumExpected: null, stretchTarget: null, defaultMaxMarks: '10', ratingScaleId: null }, null);
    expect(personal).toMatchObject({ scoringMethod: 'PERCENT_OF_TARGET', targetSource: 'PER_EMPLOYEE' });
    const draft = draftOf({ ...EMPTY_DRAFT, totalMarks: '100', kras: [{ kraId: 'k', kraCode: 'K', kraName: 'K', weightPercent: '100', maxMarks: '20', minMarks: '', scoringMethod: null, ratingScaleId: null, allowsExemption: false, kpis: [personal] }] });
    expect(draft.totalMarks).toBeNull();
    expect(draft.kras[0]).toMatchObject({ weightPercent: '100', maxMarks: null });
    expect(keyFrom('Key achievements', ['key_achievements'])).toBe('key_achievements_2');
    expect(keyFrom('2026 goals!', [])).toBe('goals');
  });
});
