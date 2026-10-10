import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The salary import screen: review matches and structures, import, see each row's outcome. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/salaryImportSheet', () => ({
  readSalaryFiles: async () => ({
    found: { salaries: true, structures: true },
    bases: { Staff: 'MONTHLY', 'HOURLY BASE': 'HOURLY' },
    problems: [],
    rows: [
      { rowNumber: 2, employeeName: 'Imran Khan', structureName: 'Staff', startDate: '2025-04-01', amount: '20000.00' },
      { rowNumber: 3, employeeName: 'Charmi Solanki', structureName: 'Staff', startDate: '2025-04-01', amount: '18000.00' },
      { rowNumber: 4, employeeName: 'Hema Rao', structureName: 'HOURLY BASE', startDate: '2025-11-07', amount: '125' },
    ],
  }),
}));
const { SalaryImportTab } = await import('./SalaryImportTab');

const person = (id: string, name: string) => ({ id, code: id.toUpperCase(), name, status: 'ACTIVE' });
const EMPLOYEES = [person('e1', 'Imran Khan'), person('e2', 'Charmi Solanki'), person('e3', 'Charmi Solanki'), person('e4', 'Hema Rao')];
let calls: { path: string; body: any }[];
let container: HTMLDivElement;
let root: Root;
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^.*\/api\/v1/, '');
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ path, body });
    if (path === '/salary/imports/preview') {
      return ok({
        structures: [
          { sourceName: 'Staff', basis: 'MONTHLY', code: 'STAFF', existing: null, effectiveFrom: '2025-04-01' },
          { sourceName: 'HOURLY BASE', basis: 'HOURLY', code: 'HOURLY_BASE', existing: null, effectiveFrom: '2025-11-07' },
        ],
        rows: [
          { ...body.rows[0], basis: 'MONTHLY', suggestedEmployeeId: 'e1', candidates: [EMPLOYEES[0]], notes: [] },
          { ...body.rows[1], basis: 'MONTHLY', suggestedEmployeeId: null, candidates: [EMPLOYEES[1], EMPLOYEES[2]], notes: ['2 employees have this name: choose the right one.'] },
          { ...body.rows[2], basis: 'HOURLY', suggestedEmployeeId: 'e4', candidates: [EMPLOYEES[3]], notes: [] },
        ],
        employees: EMPLOYEES,
        lockedThrough: null,
      });
    }
    if (path === '/salary/imports/commit') return ok({ imported: 2, skipped: 1, results: [{ rowNumber: 2, outcome: 'IMPORTED', reason: null }, { rowNumber: 3, outcome: 'SKIPPED', reason: 'A salary from 2025-04-01 is already recorded.' }, { rowNumber: 4, outcome: 'IMPORTED', reason: null }] });
    return new Response('{}', { status: 404 });
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
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const setValue = (el: HTMLSelectElement, value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
const checkbox = (label: string) => document.querySelector(`input[aria-label^="${label}"]`) as HTMLInputElement;

describe('salary import', () => {
  it('imports only rows a person has matched, and shows each row’s outcome', async () => {
    await act(async () => root.render(<SalaryImportTab />));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'Employee Salary Structure.xls')] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();

    expect(calls[0].body.structures).toEqual([{ sourceName: 'Staff', basis: 'MONTHLY' }, { sourceName: 'HOURLY BASE', basis: 'HOURLY' }]);
    expect(document.body.textContent).toContain('Gross salary = MONTHLY_SALARY');
    expect(document.body.textContent).toContain('Hourly pay = HOURLY_RATE × PAYABLE_HOURS');
    expect(checkbox('Import row 2').checked).toBe(true);
    expect(checkbox('Import row 3').checked).toBe(false);
    expect(checkbox('Import row 3').disabled).toBe(true);
    expect(button('Import 2 salaries')).toBeTruthy();

    // The person resolves the ambiguous name.
    setValue(document.getElementById(document.querySelector('label[for$="emp-3"]')?.getAttribute('for') ?? '') as HTMLSelectElement, 'e3');
    expect(checkbox('Import row 3').checked).toBe(true);
    await click(button('Import 3 salaries'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('2 structures are created and published: Staff, HOURLY BASE');
    await click(button('Import salaries'));

    const commit = calls.find((c) => c.path === '/salary/imports/commit');
    expect(commit?.body.rows.map((r: { rowNumber: number; employeeId: string }) => [r.rowNumber, r.employeeId])).toEqual([[2, 'e1'], [3, 'e3'], [4, 'e4']]);
    expect(commit?.body.rows[0]).toMatchObject({ employeeName: 'Imran Khan', startDate: '2025-04-01', amount: '20000.00' });
    expect(document.body.textContent).toContain('2 imported, 1 skipped');
    expect(document.body.textContent).toContain('A salary from 2025-04-01 is already recorded.');
    expect(button('Import 3 salaries')).toBeUndefined();
  });
});
