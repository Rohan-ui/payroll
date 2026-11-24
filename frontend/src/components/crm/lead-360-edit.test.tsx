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
const editForm = () => [...document.querySelectorAll('form')].find((f) => f.textContent?.includes('Save changes')) as HTMLFormElement;
const submit = (form: HTMLFormElement) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const updates = () => calls.filter((c) => c.method === 'PUT');

describe('Lead 360 edit', () => {
  it('sends only the changed phone number, not the untouched stored fields', async () => {
    await act(async () => root.render(<Lead360Drawer leadId="l1" onClose={() => undefined} onRefreshParent={() => undefined} startEditing />));
    await settle();
    const phone = editForm().querySelector('#lead-edit-phone') as HTMLInputElement;
    expect(phone.value).toBe('+91 98200 00000');
    expect(phone.maxLength).toBe(32);

    await setValue(phone, '+91 99999 11111');
    await submit(editForm());
    await settle();

    expect(updates()).toEqual([{ url: '/api/v1/crm/leads/l1', method: 'PUT', body: { phone: '+91 99999 11111' } }]);
  });

  it('opens only the edit drawer from Edit, and closes everything without a request when nothing changed', async () => {
    const onClose = vi.fn();
    await act(async () => root.render(<Lead360Drawer leadId="l1" onClose={onClose} onRefreshParent={() => undefined} startEditing />));
    await settle();
    // The class, not only the attribute: a display class would override [hidden].
    expect((document.querySelector('[aria-label^="Lead:"]') as HTMLElement).classList).toContain('hidden');
    expect((document.querySelector('[aria-label^="Lead:"]') as HTMLElement).classList).not.toContain('flex');
    expect(onClose).not.toHaveBeenCalled();
    await submit(editForm());
    await settle();

    expect(updates()).toEqual([]);
    expect(editForm()).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });

  it('never fills a missing title or brief with an invented person', async () => {
    await act(async () => root.render(<Lead360Drawer leadId="l1" onClose={() => undefined} onRefreshParent={() => undefined} />));
    await settle();
    const drawer = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(drawer.getAttribute('aria-label')).toContain('Lead:');
    expect(document.body.textContent).not.toMatch(/Founder|Nexus Quantum|Aditya|Embassy Tech|Bengaluru|Inbound \/ Outbound|Voogyo AI|Voogyo RND/);
    expect([...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Overview', 'Outreach', 'Activity', 'History', 'Follow-ups', 'Meetings', 'Quotations']);
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Overview');
    expect(document.body.textContent).toContain('No requirements recorded yet');
    expect(document.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });
});

