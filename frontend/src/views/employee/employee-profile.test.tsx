import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The employee page (API stubbed): it shows what the server holds, sends only
 * the fields that changed, shows the saved record afterwards, keeps refusals
 * in the dialog, and offers tabs and actions by permission.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
const navigation = { selectedEmployeeId: 'e1', setSelectedEmployeeId: vi.fn(), setCurrentView: vi.fn() };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../context/PayrollContext', () => ({ usePayroll: () => navigation }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Cards with their own tests and API calls stay out of these.
vi.mock('./SignInCard', () => ({ SignInCard: () => null }));
vi.mock('./CosecMappingCard', () => ({ CosecMappingCard: () => null }));
vi.mock('./ReportingManagerCard', () => ({ ReportingManagerCard: () => <p>Reporting manager card</p> }));
const { EmployeeDetailView } = await import('../EmployeeDetailView');

const job = { id: 'j1', effectiveFrom: '2024-01-10', effectiveTo: null, joiningDate: '2024-01-10', confirmationDate: null, probationEndDate: null, noticePeriodDays: 30, employmentStatus: 'CONFIRMED', department: { id: 'd1', name: 'Engineering' }, designation: { id: 'g1', name: 'Developer' }, branch: null, employmentType: null };
const baseProfile = () => ({
  id: 'e1', employeeCode: 'EMP-1', employeeStatus: 'ACTIVE', hireDate: '2024-01-10', exitDate: null, hasSignIn: true,
  personal: { firstName: 'Asha', middleName: null, lastName: 'Rao', preferredName: null, fullName: 'Asha Rao', dateOfBirth: null, genderCode: null, maritalStatus: null, bloodGroup: null, nationalityCountryCode: 'IN', workEmail: 'asha@acme.test', personalEmail: null, workMobile: '+91 98000 00000', personalMobile: null, alternateMobile: null },
  addresses: [{ type: 'CURRENT', addressLine1: null }, { type: 'PERMANENT', addressLine1: null }],
  emergencyContacts: [],
  employment: job, upcomingEmployment: null, employmentHistory: [job],
  manager: { id: 'm1', employeeCode: 'EMP-9', name: 'Mira Shah' }, directReports: [],
  bankAccount: null, canSeeBankAccount: false,
});

let profile: ReturnType<typeof baseProfile>;
let calls: { path: string; method: string; body: any }[];
let refuse: string | null;
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  granted = new Set(['people.view', 'people.update']);
  profile = baseProfile();
  calls = [];
  refuse = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    calls.push({ path, method, body });
    if (refuse && method !== 'GET') return json({ message: refuse }, 400);
    if (path === '/employees/e1' && method === 'GET') return json({ success: true, data: profile });
    if (path === '/employees/e1/personal') {
      profile = { ...profile, personal: { ...profile.personal, ...body, fullName: 'Asha Rao' } };
      return json({ success: true, data: profile });
    }
    if (path === '/employees/e1/status') {
      profile = { ...profile, employeeStatus: body.status };
      return json({ success: true, data: profile });
    }
    if (path === '/employees/e1/activity') return json({ success: true, data: { items: [{ id: 'a1', at: '2026-11-10T05:00:00.000Z', action: 'EMPLOYEE_STATUS_CHANGED', label: 'Employment status changed', detail: 'Active → On notice', actor: 'Priya' }], next: null } });
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
const render = async (node: React.ReactNode = <EmployeeDetailView />) => { await act(async () => root.render(node)); await settle(); };
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text) as HTMLButtonElement | undefined;
const tab = (name: string) => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === name) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement | undefined) => { await act(async () => el!.click()); await settle(); };
const field = (label: string) => {
  const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => x.textContent?.trim().startsWith(label));
  return document.getElementById(l?.getAttribute('for') ?? '') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
};
const type = async (label: string, value: string) => {
  const el = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
const submit = async (label: string) => click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === label) as HTMLButtonElement);

describe('employee page', () => {
  it('loads the employee from the server and shows the summary', async () => {
    await render();
    expect(calls[0]).toMatchObject({ path: '/employees/e1', method: 'GET' });
    expect(document.querySelector('h1')?.textContent).toBe('Asha Rao');
    expect(document.body.textContent).toContain('EMP-1 · Developer · Engineering');
    expect(document.body.textContent).toContain('Mira Shah');
    expect(document.body.textContent).toContain('No emergency contact is recorded');
  });

  it('sends only the changed personal fields and shows what the server saved', async () => {
    await render(<EmployeeDetailView initialTab="personal" />);
    await click(button('Edit'));
    await type('Blood group', 'O+');
    await type('Middle name', 'Kiran');
    await submit('Save');
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ middleName: 'Kiran', bloodGroup: 'O+' });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.body.textContent).toContain('O+');
    expect(document.body.textContent).toContain('Kiran');
  });

  it('keeps a refusal in the dialog with the server’s reason', async () => {
    refuse = 'Enter a valid personal email.';
    await render(<EmployeeDetailView initialTab="personal" />);
    await click([...document.querySelectorAll('button')].filter((b) => b.textContent === 'Edit')[1]);
    await type('Personal email', 'nope');
    await submit('Save');
    expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toBe('Enter a valid personal email.');
  });

  it('changes status with a reason and updates the header from the response', async () => {
    await render();
    await click(button('Change status'));
    await type('New status', 'ON_NOTICE');
    await submit('Change status');
    expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toMatch(/Say why/);
    await type('Reason', 'Serving notice');
    await submit('Change status');
    expect(calls.find((c) => c.path === '/employees/e1/status')?.body).toEqual({ status: 'ON_NOTICE', reason: 'Serving notice' });
    expect(document.querySelector('header')?.textContent).toContain('On notice');
  });

  it('offers tabs and edits by permission', async () => {
    granted = new Set(['people.view']);
    await render();
    expect(tab('Pay')).toBeUndefined();
    expect(tab('Attendance')).toBeUndefined();
    expect(tab('Leave')).toBeUndefined();
    expect(button('Change status')).toBeUndefined();
    await click(tab('Personal'));
    expect(button('Edit')).toBeUndefined();

    act(() => root.unmount());
    root = createRoot(container);
    granted = new Set(['people.view', 'salary.view', 'attendance.view', 'leave.view']);
    await render();
    expect(tab('Pay')).toBeDefined();
    expect(tab('Attendance')).toBeDefined();
    expect(tab('Leave')).toBeDefined();
  });

  it('moves between tabs with the arrow keys and shows the activity timeline', async () => {
    await render();
    const list = document.querySelector('[role=tablist]') as HTMLElement;
    await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    await settle();
    expect(tab('Activity')?.getAttribute('aria-selected')).toBe('true');
    expect(document.body.textContent).toContain('Employment status changed');
    expect(document.body.textContent).toContain('Active → On notice');
    expect(document.body.textContent).toContain('Priya');
  });

  it('opens on Personal with the form ready when Edit was chosen in the list, once', async () => {
    window.history.replaceState(null, '', '/employee-detail?profile=edit-personal');
    await render();
    expect(tab('Personal')?.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[role=dialog] h2')?.textContent).toBe('Edit personal details');
    expect(window.location.search).toBe('');
  });

  it('says when the employee cannot be loaded', async () => {
    navigation.selectedEmployeeId = 'missing';
    await render();
    expect(document.querySelector('[role=alert]')?.textContent).toContain('could not be loaded');
    navigation.selectedEmployeeId = 'e1';
  });
});
