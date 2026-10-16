import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The employee page's reporting manager and sign-in cards (API stubbed):
 * setting a manager from a date, cancelling a mistaken line, linking a
 * suggested sign-in, and what people without the permission see.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { ReportingManagerCard } = await import('./ReportingManagerCard');
const { SignInCard } = await import('./SignInCard');

const line = (extra: Record<string, unknown> = {}) => ({
  lineId: 'l1', manager: { id: 'm1', name: 'Mira Rao', code: 'M1' }, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', reason: null,
  setBy: 'Asha', setAt: '', cancelledBy: null, cancellationReason: null, ...extra,
});
let reporting: unknown;
let login: unknown;
let calls: { path: string; method: string; body: any }[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json({ success: true, data });

beforeEach(() => {
  granted = new Set(['people.view', 'people.update', 'people.login.manage']);
  calls = [];
  reporting = { current: null, upcoming: null, history: [] };
  login = { linked: null, linkedOutsideWorkspace: false, suggestions: [{ tenantMemberId: 'tm1', name: 'Priya Shah', email: 'priya@acme.test' }] };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    calls.push({ path, method, body });
    if (path === '/employees' && method === 'GET') return json({ items: [{ id: 'm1', employee_code: 'M1', first_name: 'Mira', last_name: 'Rao', employee_status: 'ACTIVE' }, { id: 'x', employee_code: 'X', first_name: 'Gone', last_name: null, employee_status: 'TERMINATED' }], total: 2, page: 1, limit: 20, totalPages: 1, hasMore: false });
    if (path === '/employees/e1/reporting' && method === 'GET') return ok(reporting);
    if (path === '/employees/e1/reporting' && method === 'POST') { reporting = { current: line({ effectiveFrom: body.effectiveFrom }), upcoming: null, history: [line({ effectiveFrom: body.effectiveFrom })] }; return json({ success: true, data: reporting }, 201); }
    if (path === '/employees/e1/reporting/l1/cancel') return ok({ current: null, upcoming: null, history: [line({ status: 'CANCELLED', cancellationReason: body.reason })] });
    if (path === '/employees/e1/login' && method === 'GET') return ok(login);
    if (path === '/employees/e1/login' && method === 'PUT') return ok({ linked: { tenantMemberId: body.tenantMemberId, name: 'Priya Shah', email: 'priya@acme.test', active: true }, linkedOutsideWorkspace: false, suggestions: [] });
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
  return (document.getElementById(label?.getAttribute('for') ?? '') ?? label?.querySelector('input,select,textarea')) as HTMLInputElement;
};
const setValue = (el: HTMLInputElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };

describe('reporting manager', () => {
  it('sets a manager from a date, finding only active employees', async () => {
    await render(<ReportingManagerCard employeeId="e1" />);
    expect(document.body.textContent).toContain('No reporting manager on record');
    await click(button('Set manager'));
    await setValue(byLabel('Manager'), 'mi');
    await wait(300);
    await settle();
    expect(button('Gone')).toBeUndefined();
    await click(button('Mira Rao'));
    await setValue(byLabel('Reports to them from'), '2026-11-01');
    await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Set manager') as HTMLButtonElement);
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ managerEmployeeId: 'm1', effectiveFrom: '2026-11-01' });
    expect(document.body.textContent).toContain('Mira Rao');
  });

  it('cancels a mistaken line with a reason, keeping it in the history', async () => {
    reporting = { current: line(), upcoming: null, history: [line()] };
    await render(<ReportingManagerCard employeeId="e1" />);
    await click(button('History'));
    await click(button('Cancel the latest line'));
    await setValue(byLabel('Why it is cancelled'), 'Wrong person');
    await click(button('Cancel line'));
    expect(calls.find((c) => c.path.endsWith('/cancel'))?.body).toEqual({ reason: 'Wrong person' });
    expect(document.body.textContent).toContain('Cancelled');
  });

  it('shows the manager without change controls to people who may only view', async () => {
    granted = new Set(['people.view']);
    reporting = { current: line(), upcoming: null, history: [line()] };
    await render(<ReportingManagerCard employeeId="e1" />);
    expect(document.body.textContent).toContain('Mira Rao');
    expect(button('Change manager')).toBeUndefined();
  });
});

describe('sign-in account', () => {
  it('suggests the member with the same work email and links only when asked', async () => {
    await render(<SignInCard employeeId="e1" name="Priya" />);
    expect(document.body.textContent).toContain('Same work email: Priya Shah (priya@acme.test)');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await click(button('Link'));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ tenantMemberId: 'tm1' });
    expect(document.body.textContent).toContain('Linked to Priya Shah (priya@acme.test)');
  });

  it('explains what an unlinked employee can’t do, without link controls for viewers', async () => {
    granted = new Set(['people.view']);
    login = { linked: null, linkedOutsideWorkspace: false, suggestions: [] };
    await render(<SignInCard employeeId="e1" name="Priya" />);
    expect(document.body.textContent).toContain('Without a sign-in, Priya can’t self-assess or be found as a reviewer.');
    expect(button('Link')).toBeUndefined();
  });
});
