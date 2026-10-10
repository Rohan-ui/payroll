import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Payroll setup through the real screens (API stubbed): tabs by permission,
 * creating components and the lock on used ones, editing a structure with
 * its explained preview and refused publish, policy rules with problems
 * shown where they are, and an employee's salary with revisions.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../RunPayrollWizardView', () => ({ RunPayrollWizardView: () => <p>Payroll run wizard</p> }));
const { PayrollView } = await import('./PayrollView');
const { SalaryPanel } = await import('./SalaryPanel');

const component = (code: string, extra: Record<string, unknown> = {}) => ({
  id: `c-${code}`, componentCode: code, componentName: code, description: null, category: 'EARNING', calculationType: 'FIXED', systemRule: null, isStatutory: false, isTaxable: true,
  isProrated: true, includeInGross: true, includeInCtc: true, showOnPayslip: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', displayOrder: 100,
  status: 'ACTIVE', usedInPublished: false, ...extra,
});
const COMPONENTS = [
  component('BASIC', { calculationType: 'PERCENTAGE', usedInPublished: true }),
  component('TRAVEL'),
  component('PF', { category: 'DEDUCTION', calculationType: 'FORMULA', includeInGross: false, isProrated: false }),
];
const line = (code: string, extra: Record<string, unknown> = {}) => ({
  salaryComponentId: `c-${code}`, component: COMPONENTS.find((c) => c.componentCode === code), defaultAmount: null, defaultPercentage: null, percentageBase: null, formula: null, isMandatory: true, ...extra,
});
const STRUCTURE = {
  id: 's1', structureCode: 'STD', structureName: 'Standard', payFrequency: 'MONTHLY', status: 'ACTIVE', lockedThrough: '2026-07-31',
  versions: [
    { id: 'v2', number: 2, status: 'DRAFT', effectiveFrom: '2026-11-01', effectiveTo: null, changeNote: null, publishedAt: null, publishedBy: null,
      lines: [line('BASIC', { defaultPercentage: '50', percentageBase: 'MONTHLY_SALARY' }), line('TRAVEL'), line('PF', { formula: 'min(BASIC, 15000) * 12%' })] },
    { id: 'v1', number: 1, status: 'PUBLISHED', effectiveFrom: '2026-01-01', effectiveTo: null, changeNote: null, publishedAt: '2026-01-01T00:00:00Z', publishedBy: 'Asha',
      lines: [line('BASIC', { defaultPercentage: '50', percentageBase: 'MONTHLY_SALARY' }), line('TRAVEL', { defaultAmount: '1600' })] },
  ],
};
const PREVIEW = {
  problems: [],
  lines: [
    { code: 'BASIC', name: 'BASIC', category: 'EARNING', fullAmount: '25000', amount: '25000', steps: ['50% of MONTHLY_SALARY (50000) = 25000'] },
    { code: 'PF', name: 'PF', category: 'DEDUCTION', fullAmount: '1800', amount: '1800', steps: ['min(BASIC (25000), 15000) × 12% = 1800'] },
  ],
  totals: { gross: '25000.00', earnings: '25000.00', deductions: '1800.00', employerContributions: '0.00', net: '23200.00' },
  variables: {},
};
const config = () => ({
  schemaVersion: 1, payFrequency: 'MONTHLY', weeklyOffDays: [0], divisor: { method: 'CALENDAR_DAYS', fixedDays: null }, hoursPerDay: '8',
  attendance: { halfDayValue: '0.5', weeklyOffsPaidForDaily: false, holidaysPaidForDaily: true, missingAttendance: 'EXCEPTION', requireApprovedAttendance: false },
  overtime: { enabled: false, requiresApproval: true, minimumMinutes: 30, roundToMinutes: 15, roundingMode: 'DOWN', dailyCapMinutes: null, monthlyCapMinutes: null, multipliers: { workingDay: '1.5', weeklyOff: '2', holiday: '2' } },
  lateArrival: { enabled: false, graceMinutes: 0, freeOccurrences: 0, bands: [], repeated: null, monthlyCapAmount: null },
  earlyDeparture: { enabled: false, graceMinutes: 0, freeOccurrences: 0, bands: [], repeated: null, monthlyCapAmount: null },
  rounding: { netPayScale: 0, netPayMode: 'HALF_UP' },
});
const POLICY = {
  id: 'p1', policyCode: 'STANDARD', policyName: 'Standard', description: null, isDefault: true, status: 'ACTIVE', lockedThrough: null,
  scopes: { departmentIds: [], branchIds: [], employmentTypeIds: [], designationIds: [] },
  versions: [{ id: 'pv1', number: 1, status: 'DRAFT', effectiveFrom: '2026-11-01', effectiveTo: null, config: config(), changeNote: null, publishedAt: null, publishedBy: null }],
};
const revision = (extra: Record<string, unknown> = {}) => ({
  id: 'a1', status: 'ACTIVE', effectiveFrom: '2026-01-01', effectiveTo: null, structure: { id: 's1', code: 'STD', name: 'Standard' }, policy: null, payBasis: 'MONTHLY', monthlySalary: '50000',
  annualCtc: '600000', baseRate: null, currencyCode: 'INR', isOvertimeEligible: true, paymentMethod: 'BANK_TRANSFER', changeReason: 'Joining salary', createdAt: '', createdBy: 'Asha',
  cancelledAt: null, cancelledBy: null, cancellationReason: null, componentValues: [{ salaryComponentId: 'c-TRAVEL', code: 'TRAVEL', name: 'TRAVEL', amount: '1600', percentage: null }], ...extra,
});
const SALARY = {
  employee: { id: 'e1', employeeCode: 'E1', name: 'Priya Shah' }, lockedThrough: null, currentId: 'a1', upcomingId: null,
  policy: { policy: { id: 'p1', policyCode: 'STANDARD', policyName: 'Standard' }, version: { id: 'pv1', number: 1, effectiveFrom: '2026-01-01' }, reason: 'The workspace’s default policy', problem: null },
  estimate: { month: '2026-10', version: 1, problems: [], lines: PREVIEW.lines, totals: PREVIEW.totals },
  history: [revision()],
  arrears: [] as unknown[],
};

let calls: { path: string; method: string; body: any }[];
let publishRefusal: unknown = null;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json({ success: true, data });

beforeEach(() => {
  granted = new Set(['payroll.view', 'payroll.policies.view', 'payroll.policies.manage', 'salary.view', 'salary.configure', 'salary.assign']);
  calls = [];
  publishRefusal = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    calls.push({ path, method, body });
    if (path === '/salary/components' && method === 'GET') return ok(COMPONENTS);
    if (path === '/salary/components' && method === 'POST') return json({ success: true, data: { ...component(body.componentCode), ...body } }, 201);
    if (path === '/salary/formula-reference') return ok({ variables: [{ name: 'MONTHLY_SALARY', label: 'Monthly salary', description: 'The monthly salary.', group: 'Salary', sample: '50000' }], functions: ['min', 'max', 'if'] });
    if (path === '/salary/structures' && method === 'GET') return ok([{ id: 's1', structureCode: 'STD', structureName: 'Standard', payFrequency: 'MONTHLY', status: 'ACTIVE', currentVersion: { number: 1, effectiveFrom: '2026-01-01', components: 2 }, upcomingVersion: null, draft: { number: 2, effectiveFrom: '2026-11-01', components: 3 } }]);
    if (path === '/salary/structures/s1') return ok(STRUCTURE);
    if (path === '/salary/structures/preview') return ok(PREVIEW);
    if (path === '/salary/structures/s1/draft/publish') return publishRefusal ? json(publishRefusal, 400) : ok(STRUCTURE);
    if (path === '/payroll/policies' && method === 'GET') return ok([{ id: 'p1', policyCode: 'STANDARD', policyName: 'Standard', description: null, isDefault: true, status: 'ACTIVE', currentVersion: null, upcomingVersion: null, draft: { number: 1, effectiveFrom: '2026-11-01' }, scopeCount: 0 }]);
    if (path === '/payroll/policies/p1') return ok(POLICY);
    if (path === '/payroll/policies/scope-options') return ok({ departments: [{ id: 'd1', name: 'Sales' }], branches: [], employmentTypes: [], designations: [] });
    if (path === '/payroll/policies/p1/draft' && method === 'PUT') return json({ statusCode: 400, message: 'Some policy settings need fixing.', errors: [{ path: 'policy.lateArrival.bands[0].fromMinute', message: 'Must be after the 10-minute grace period.' }] }, 400);
    if (path === '/salary/employees/e1') return ok(SALARY);
    if (path === '/salary/employees/e1/revisions') return json({ success: true, data: { ...SALARY, history: [revision({ id: 'a2', effectiveFrom: body.effectiveFrom, monthlySalary: body.monthlySalary }), revision({ effectiveTo: '2026-10-31' })] } }, 201);
    if (path === '/salary/assignments/a1/cancel') return ok({ ...SALARY, history: [revision({ status: 'CANCELLED', cancellationReason: body.reason })] });
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

describe('payroll setup', () => {
  it('shows only the tabs a member may use', async () => {
    granted = new Set(['salary.view']);
    await render(<PayrollView />);
    expect([...document.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual(['Salary structures', 'Components']);
    expect(document.body.textContent).toContain('Standard');
    expect(button('New structure')).toBeUndefined();

    act(() => root.unmount());
    root = createRoot(container);
    granted = new Set();
    await render(<PayrollView />);
    expect(document.body.textContent).toContain('You don’t have access to payroll');
  });

  it('creates components with amounts as text, and explains why a used one is locked', async () => {
    await render(<PayrollView />);
    await click(tab('Setup'));
    await click(tab('Components'));
    expect(document.body.textContent).toContain('TRAVEL');
    await click(button('New component'));
    setValue(byLabel('Code'), 'conveyance');
    setValue(byLabel('Name on payslips'), 'Conveyance');
    setValue(byLabel('Maximum'), '1600');
    await click(button('Create component'));
    const created = calls.find((c) => c.path === '/salary/components' && c.method === 'POST');
    expect(created?.body).toMatchObject({ componentCode: 'CONVEYANCE', componentName: 'Conveyance', maxAmount: '1600', minAmount: null, category: 'EARNING' });

    await click(button('Edit BASIC'));
    expect(document.body.textContent).toContain('how it is calculated is fixed');
    expect(byLabel('Calculated as').disabled).toBe(true);
    expect(byLabel('Name on payslips').disabled).toBe(false);
  });

  it('edits a structure draft with an explained preview, and shows why publishing was refused', async () => {
    await render(<PayrollView />);
    await click(tab('Setup'));
    await click(tab('Salary structures'));
    await click(button('Standard'));
    expect(document.body.textContent).toContain('Version 2');
    expect(byLabel('Formula').value).toBe('min(BASIC, 15000) * 12%');
    await wait(450);
    await settle();
    const preview = calls.find((c) => c.path === '/salary/structures/preview');
    expect(preview?.body.variables).toEqual({ MONTHLY_SALARY: '50000', PRORATION: '1' });
    expect(preview?.body.lines.map((l: { salaryComponentId: string }) => l.salaryComponentId)).toEqual(['c-BASIC', 'c-TRAVEL', 'c-PF']);
    expect(document.body.textContent).toContain('min(BASIC (25000), 15000) × 12% = 1800');
    expect(document.body.textContent).toContain('Payroll is finalized up to');

    publishRefusal = { statusCode: 400, message: 'The structure can’t be published yet.', errors: [{ code: 'PF', message: 'PF’s formula uses NOPE, which is not in this structure or a system value.' }] };
    await click(button('Publish'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Version 1 will end on');
    await click(button('Publish from'));
    expect(document.body.textContent).toContain('Fix these before publishing:');
    expect(document.body.textContent).toContain('PF’s formula uses NOPE');

    // Editing makes the draft unsaved, which stops publishing until it is saved.
    setValue(byLabel('Formula'), 'BASIC * 12%');
    expect(button('Publish').disabled).toBe(true);
    expect(document.body.textContent).toContain('Unsaved changes');
  });

  it('shows a policy’s refused settings by where they are', async () => {
    await render(<PayrollView />);
    await click(tab('Setup'));
    await click(tab('Policies'));
    await click(button('Standard'));
    await click(byLabel('Deduct for arriving late'));
    await click(button('Add a band'));
    await click(button('Save draft'));
    const saved = calls.find((c) => c.path === '/payroll/policies/p1/draft');
    expect(saved?.body.config.lateArrival).toMatchObject({ enabled: true, bands: [{ fromMinute: 1, toMinute: null, action: 'WARNING' }] });
    expect(document.body.textContent).toContain('Late arrival · band 1 · fromMinute: Must be after the 10-minute grace period.');
  });

  it('shows an employee’s salary and records revisions as new history', async () => {
    await render(<SalaryPanel employeeId="e1" />);
    expect(document.body.textContent).toContain('Standard');
    expect(document.body.textContent).toContain('The workspace’s default policy');
    expect(document.body.textContent).toContain('min(BASIC (25000), 15000) × 12% = 1800');
    expect(document.body.textContent).toContain('Net pay');

    await click(button('Revise salary'));
    await settle();
    setValue(byLabel('Takes effect from'), '2026-11-01');
    await settle();
    expect(byLabel('TRAVEL (monthly amount)').value).toBe('1600');
    setValue(byLabel('Monthly salary'), '60000');
    setValue(byLabel('Reason for the change'), 'Annual increment 2026');
    await click(button('Record salary from'));
    const revised = calls.find((c) => c.path === '/salary/employees/e1/revisions');
    expect(revised?.body).toMatchObject({
      salaryStructureId: 's1', effectiveFrom: '2026-11-01', payBasis: 'MONTHLY', monthlySalary: '60000', baseRate: null, currencyCode: 'INR', payrollPolicyId: null,
      changeReason: 'Annual increment 2026', componentValues: [{ salaryComponentId: 'c-TRAVEL', amount: '1600', percentage: null }],
    });
    expect(document.querySelector('[role=dialog]')).toBeNull();

    await click(button('Cancel this revision'));
    setValue(byLabel('Why'), 'Entered by mistake');
    await click(button('Cancel revision'));
    expect(calls.find((c) => c.path === '/salary/assignments/a2/cancel')?.body).toEqual({ reason: 'Entered by mistake' });
  });

  it('shows nothing about salaries to people without salary access', async () => {
    granted = new Set(['people.view']);
    await render(<SalaryPanel employeeId="e1" />);
    expect(container.textContent).toBe('');
    expect(calls).toEqual([]);
  });
});
