import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Editing a lead from the Lead 360 drawer (API stubbed): saving sends only the
 * fields the user changed, so a stored value the server would now refuse (an
 * old LinkedIn entry) does not block changing the phone number.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }));

const { default: Lead360Drawer } = await import('./Lead360Drawer');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const LEAD = {
  id: 'l1', company_name: 'Alpha Traders', first_name: 'Asha', last_name: 'Rao', email: 'asha@alpha.test',
  phone: '+91 98200 00000', whatsapp_number: '+91 98200 00000', linkedin_url: 'N/A', budget_amount: '0',
  activities: [], followups: [], meetings: [], quotations: [],
};

let calls: { url: string; method: string; body: any }[] = [];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url === '/api/v1/crm/leads/l1') return json({ success: true, data: LEAD });
      return json({ success: true, data: [] });
    }),
  );
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
const setValue = (el: HTMLInputElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const editForm = () => [...document.querySelectorAll('form')].find((f) => f.textContent?.includes('Save Dossier Changes')) as HTMLFormElement;
const submit = (form: HTMLFormElement) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const updates = () => calls.filter((c) => c.method === 'PUT');

describe('Lead 360 edit', () => {
  it('sends only the changed phone number, not the untouched stored fields', async () => {
    await act(async () => root.render(<Lead360Drawer leadId="l1" onClose={() => undefined} onRefreshParent={() => undefined} startEditing />));
    await settle();
    const phone = editForm().querySelector('input[placeholder="+91 98201 44892"]') as HTMLInputElement;
    expect(phone.value).toBe('+91 98200 00000');
    expect(phone.maxLength).toBe(32);

    await setValue(phone, '+91 99999 11111');
    await submit(editForm());
    await settle();

    expect(updates()).toEqual([{ url: '/api/v1/crm/leads/l1', method: 'PUT', body: { phone: '+91 99999 11111' } }]);
  });

  it('closes without a request when nothing changed', async () => {
    await act(async () => root.render(<Lead360Drawer leadId="l1" onClose={() => undefined} onRefreshParent={() => undefined} startEditing />));
    await settle();
    await submit(editForm());
    await settle();

    expect(updates()).toEqual([]);
    expect(editForm()).toBeUndefined();
  });
});
