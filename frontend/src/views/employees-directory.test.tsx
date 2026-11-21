import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The People directory (API stubbed): the server is asked for every filter,
 * sort and page; filters combine and clear one at a time or all at once; the
 * summary shows only what the server counted; actions follow permissions; and
 * the list comes back as it was left after visiting an employee.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
const navigation = { setCurrentView: vi.fn(), setSelectedEmployeeId: vi.fn(), rememberEmployee: vi.fn() };
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p), activeTenant: { tenantId: 't1' } }) }));
vi.mock('../context/PayrollContext', () => ({ usePayroll: () => navigation }));
const { EmployeesView } = await import('./EmployeesView');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ASHA = {
  id: 'e1', employeeCode: 'EMP-1', firstName: 'Asha', middleName: null, lastName: 'Rao', workEmail: 'asha@acme.test', workMobile: null,
  employeeStatus: 'ACTIVE', hireDate: null,
  currentEmployment: { department: 'Engineering', departmentId: 'd1', designation: 'Developer', designationId: 'g1', branch: null, branchId: null, employmentType: null, employmentTypeId: null, joiningDate: '2026-11-01T00:00:00.000Z', probationEndDate: '2099-01-01T00:00:00.000Z' },
  manager: { id: 'm1', employeeCode: 'EMP-9', name: 'Mira Shah' },
};

let listQueries: URLSearchParams[];
let exportQuery: URLSearchParams | null;
let listFails: boolean;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['people.view', 'people.create', 'people.update']);
  listQueries = [];
  exportQuery = null;
  listFails = false;
  Object.values(navigation).forEach((fn) => fn.mockReset());
  window.sessionStorage.clear();
  // This jsdom may offer no localStorage; the view copes without it.
  window.localStorage?.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const [path, search = ''] = url.replace(/^.*\/api\/v1/, '').split('?');
    if (path === '/employees/meta/summary') return json({ total: 12, active: 10, onNotice: 2, inactive: 2, onProbation: 3, recentlyJoined: 1, recentJoinerDays: 30 });
    if (path === '/employees/meta/filters') {
      return json({ departments: [{ id: 'd1', department_code: 'ENG', department_name: 'Engineering' }], designations: [], employmentTypes: [], branches: [], statuses: ['ACTIVE', 'EXITED'] });
    }
    if (path === '/employees/export') {
      exportQuery = new URLSearchParams(search);
      return new Response('xlsx', { status: 200, headers: { 'Content-Disposition': "attachment; filename*=UTF-8''employees-2026-11-16.xlsx" } });
    }
    if (path === '/employees') {
      listQueries.push(new URLSearchParams(search));
      if (listFails) return json({ message: 'Database unavailable' }, 500);
      return json({ items: [ASHA], total: 41, page: 1, limit: 20, totalPages: 3, hasMore: true });
    }
    return json({ message: `Unexpected ${path}` }, 404);
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
const render = async () => { await act(async () => root.render(<EmployeesView />)); await settle(); };
const buttons = () => [...document.querySelectorAll('button')];
const button = (text: string) => buttons().find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const field = (label: string) => document.getElementById([...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === label)?.getAttribute('for') ?? '') as HTMLSelectElement;
const choose = async (label: string, value: string) => {
  const el = field(label);
  await act(async () => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
};
const last = () => listQueries[listQueries.length - 1];

describe('People directory', () => {
  it('shows the server’s rows, range and counts', async () => {
    await render();
    expect(last().get('page')).toBe('1');
    expect(last().get('sortBy')).toBe('code');
    const row = document.querySelector('tbody tr')!;
    expect(row.textContent).toContain('Asha Rao');
    expect(row.textContent).toContain('Engineering');
    expect(row.textContent).toContain('Mira Shah');
    expect(row.textContent).toContain('01 Nov 2026');
    expect(row.textContent).toContain('Probation');
    expect(document.body.textContent).toContain('1–20 of 41 employees');
    expect(document.body.textContent).toContain('Includes 2 on notice');
  });

  it('asks the server for combined filters and clears them one at a time or all at once', async () => {
    await render();
    await choose('Department', 'd1');
    await choose('Employment status', 'ACTIVE');
    expect(last().get('departmentId')).toBe('d1');
    expect(last().get('status')).toBe('ACTIVE');
    expect(document.body.textContent).toContain('Department: Engineering');

    await click(button('Remove filter Department: Engineering'));
    expect(last().get('departmentId')).toBeNull();
    expect(last().get('status')).toBe('ACTIVE');

    await click(button('Clear all'));
    expect(last().get('status')).toBeNull();
    expect(document.body.textContent).not.toContain('Filtered by');
  });

  it('keeps the less used filters behind More filters', async () => {
    await render();
    const labelTexts = () => [...container.querySelectorAll('section[aria-label="Search and filters"] label')].map((l) => l.textContent?.trim());
    expect(labelTexts()).toEqual(expect.arrayContaining(['Search', 'Department', 'Employment status']));
    expect(labelTexts()).not.toContain('Designation');
    const more = [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('More filters')) as HTMLButtonElement;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await act(async () => more.click());
    expect(labelTexts()).toEqual(expect.arrayContaining(['Designation', 'Employment type', 'Work location', 'Joined from', 'Joined to']));
    const fewer = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Fewer filters') as HTMLButtonElement;
    await act(async () => fewer.click());
    expect(labelTexts()).not.toContain('Designation');
  });

  it('sorts on the server and flips direction on a second click', async () => {
    await render();
    await click(button('Joining date'));
    expect(last().get('sortBy')).toBe('joiningDate');
    expect(last().get('sortOrder')).toBe('asc');
    await click(button('Joining date'));
    expect(last().get('sortOrder')).toBe('desc');
    expect(document.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Joining date');
  });

  it('pages and resizes on the server', async () => {
    await render();
    await click(button('Next'));
    expect(last().get('page')).toBe('2');
    await choose('Rows per page', '50');
    expect(last().get('limit')).toBe('50');
    expect(last().get('page')).toBe('1');
  });

  it('opens an employee and returns to the same filtered page', async () => {
    await render();
    await choose('Department', 'd1');
    await click(button('Next'));
    await click(button('Asha Rao'));
    expect(navigation.setSelectedEmployeeId).toHaveBeenCalledWith('e1');
    expect(navigation.setCurrentView).toHaveBeenCalledWith('employee-detail');

    act(() => root.unmount());
    root = createRoot(container);
    listQueries = [];
    await render();
    expect(listQueries[0].get('departmentId')).toBe('d1');
    expect(listQueries[0].get('page')).toBe('2');
  });

  it('exports the current filters and saves the file', async () => {
    granted.add('people.export');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() }));
    await render();
    await choose('Department', 'd1');
    await click(button('Export'));
    expect(exportQuery?.get('departmentId')).toBe('d1');
    expect(exportQuery?.has('page')).toBe(false);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('opens Edit on the employee’s Personal tab with the form ready', async () => {
    await render();
    await click(button('Edit Asha Rao'));
    expect(navigation.setCurrentView).toHaveBeenCalledWith('employee-detail');
    expect(new URLSearchParams(window.location.search).get('profile')).toBe('edit-personal');
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('offers add and edit only with the permissions for them', async () => {
    granted = new Set(['people.view']);
    await render();
    expect(button('Add employee')).toBeUndefined();
    expect(button('Export')).toBeUndefined();
    expect(button('Edit Asha Rao')).toBeUndefined();
    expect(button('View Asha Rao')).toBeDefined();
  });

  it('says when the list fails and retries', async () => {
    listFails = true;
    await render();
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Database unavailable');
    listFails = false;
    await click(button('Try again'));
    expect(document.querySelector('tbody tr')?.textContent).toContain('Asha Rao');
  });
});
