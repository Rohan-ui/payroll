import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lead Management through the real screen (API stubbed): the table shows the
 * server's page of leads, searches and filters go to the server, leads are
 * selected on a page, and bulk assignment asks for a specific confirmation,
 * reports refusals naming the leads, and reloads everything afterwards. Also
 * the CRM Masters Assignees tab showing the server's real lead counts.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));

const { LeadManagementView } = await import('./LeadManagementView');
const { default: CRMMastersManager } = await import('./CRMMastersManager');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const lead = (id: string, name: string, company: string, assignee: { id: string; name: string } | null) => ({
  id, leadCode: `LEAD-${id}`, name, companyName: company, email: `${id}@client.test`, phone: '+91 98200 00000', source: { id: 'src', name: 'Website' },
  pipeline: { id: 'p1', name: 'Sales' }, stage: { id: 's1', name: 'Qualified', color: '#2563eb' }, status: 'OPEN', assignee, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z',
});
const NEHA = { id: 'm-neha', name: 'Neha Mishra' };
const SAGAR = { id: 'm-sagar', name: 'Sagar Bhanushali' };
const PAGE = [lead('l1', 'Asha', 'Alpha Traders', null), lead('l2', 'Bala', 'Beta Foods', SAGAR), lead('l3', 'Chirag', 'Gamma Steel', NEHA)];
const ASSIGNEES = [
  { id: 'm-acc', name: 'Accountant', email: 'acc@rnd.test', eligible: false, leadsCount: 0 },
  { id: 'm-neha', name: 'Neha Mishra', email: 'neha@rnd.test', eligible: true, leadsCount: 4 },
  { id: 'm-sagar', name: 'Sagar Bhanushali', email: 'sagar@rnd.test', eligible: true, leadsCount: 7 },
];

let calls: { url: string; method: string; body: any }[] = [];
let assignResponse: () => Response;
let deleteResponse: () => Response;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['leads.view', 'leads.view_all', 'leads.update']);
  calls = [];
  assignResponse = () => json({ success: true, data: { updated: 2, unchanged: 0, replaced: 1, assignee: NEHA }, message: '2 leads assigned to Neha Mishra' });
  deleteResponse = () => json({ success: true, data: { count: 2 }, message: '2 leads deleted' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.startsWith('/api/v1/crm/lead-management')) {
        return json({ success: true, data: PAGE, pagination: { page: 1, limit: 25, total: 53, totalPages: 3 }, filters: { stages: [{ id: 's1', name: 'Qualified', pipeline_id: 'p1' }], pipelines: [{ id: 'p1', name: 'Sales' }], sources: [{ id: 'src', name: 'Website' }] } });
      }
      if (url === '/api/v1/crm/assignees') return json({ success: true, data: ASSIGNEES });
      if (url === '/api/v1/crm/leads/assign') return assignResponse();
      if (url === '/api/v1/crm/leads/bulk') return deleteResponse();
      if (url === '/api/v1/users') {
        return json({ success: true, data: { users: [
          { id: 'u1', member_id: 'm-neha', first_name: 'Neha', last_name: 'Mishra', email: 'neha@rnd.test', role_name: 'Sales', is_active: true, leads_count: 4 },
          { id: 'u2', member_id: 'm-new', first_name: 'Meet', last_name: 'Patel', email: 'meet@rnd.test', role_name: 'Sales', is_active: true, leads_count: 0 },
        ], roles: [] } });
      }
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
  vi.useRealTimers();
});

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
const listCalls = () => calls.filter((c) => c.url.startsWith('/api/v1/crm/lead-management'));
const render = async (onAssigned = vi.fn()) => {
  await act(async () => root.render(<LeadManagementView onOpenLead={() => undefined} onEditLead={() => undefined} onAssigned={onAssigned} />));
  await settle();
  return onAssigned;
};
const checkbox = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

describe('Lead Management table', () => {
  it('shows the server’s leads, total and owners', async () => {
    await render();
    expect(container.textContent).toContain('53 leads in this workspace');
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Alpha Traders');
    expect(rows[0]).toContain('Unassigned');
    expect(rows[1]).toContain('Sagar Bhanushali');
    expect(rows[1]).toContain('Website');
    expect(rows[1]).toContain('Qualified');
    expect(container.textContent).toContain('Page 1 of 3');
  });

  it('sends search, filters, sort and page to the server', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await render();
    setValue(container.querySelector('input[placeholder^="Search"]') as HTMLInputElement, 'gamma');
    await act(async () => { vi.advanceTimersByTime(350); });
    await settle();
    expect(listCalls().at(-1)?.url).toContain('search=gamma');
    setValue(container.querySelector('select') as HTMLSelectElement, 'unassigned');
    await settle();
    expect(listCalls().at(-1)?.url).toContain('assigneeId=unassigned');
    const status = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'WON')) as HTMLSelectElement;
    setValue(status, 'WON');
    await settle();
    expect(listCalls().at(-1)?.url).toContain('status=WON');
    act(() => button('Company')?.click());
    await settle();
    expect(listCalls().at(-1)?.url).toMatch(/sort=company_name&direction=asc/);
    act(() => button('Next')?.click());
    await settle();
    expect(listCalls().at(-1)?.url).toContain('page=2');
  });

  it('selects single leads and a whole page, and clears the selection when the filters change', async () => {
    await render();
    expect(container.querySelector('[aria-label="Selected leads"]')).toBeNull();
    act(() => checkbox('Select Asha, Alpha Traders').click());
    expect(container.querySelector('[aria-label="Selected leads"]')?.textContent).toContain('1 lead selected');
    act(() => checkbox('Select all leads on this page').click());
    expect(container.querySelector('[aria-label="Selected leads"]')?.textContent).toContain('3 leads selected');
    act(() => checkbox('Select all leads on this page').click());
    expect(container.querySelector('[aria-label="Selected leads"]')).toBeNull();
    act(() => checkbox('Select Bala, Beta Foods').click());
    setValue(container.querySelector('select') as HTMLSelectElement, 'm-neha');
    await settle();
    expect(container.querySelector('[aria-label="Selected leads"]')).toBeNull();
  });

  it('shows a member without "see every lead" only their own leads, with no assignee filter or unassigning', async () => {
    granted = new Set(['leads.view', 'leads.update']);
    await render();
    expect(container.textContent).toContain('53 leads assigned to you');
    expect([...container.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === 'unassigned'))).toBe(false);
    act(() => checkbox('Select Asha, Alpha Traders').click());
    expect(button('Unassign')).toBeUndefined();
    expect(button('Assign')).toBeDefined();
  });

  it('hides selection and assignment from members who can’t edit leads', async () => {
    granted = new Set(['leads.view']);
    await render();
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
    expect(button('Edit')).toBeUndefined();
    expect(button('View')).toBeDefined();
  });
});

describe('bulk assignment', () => {
  it('assigns the selected leads to a searched member after a specific confirmation, then reloads', async () => {
    const onAssigned = await render();
    act(() => checkbox('Select Asha, Alpha Traders').click());
    act(() => checkbox('Select Bala, Beta Foods').click());
    act(() => button('Assign Leads')?.click());
    let dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.textContent).toContain('2 leads selected.');
    expect((dialog.querySelector('input[value="m-acc"]') as HTMLInputElement).disabled).toBe(true);
    expect(dialog.textContent).toContain('Can’t view leads');
    expect(button('Continue', dialog)?.disabled).toBe(true);
    setValue(dialog.querySelector('input[placeholder^="Search"]') as HTMLInputElement, 'neha');
    expect(dialog.querySelectorAll('input[type=radio]')).toHaveLength(1);
    act(() => (dialog.querySelector('input[value="m-neha"]') as HTMLInputElement).click());
    act(() => button('Continue', dialog)?.click());

    dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.textContent).toContain('You’re assigning 2 leads to Neha Mishra. 1 lead already assigned to someone else will be reassigned.');
    const before = listCalls().length;
    await act(async () => button('Confirm Assignment', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.url === '/api/v1/crm/leads/assign')?.body).toEqual({ leadIds: ['l1', 'l2'], assigneeMemberId: 'm-neha' });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(listCalls().length).toBe(before + 1);
    expect(calls.filter((c) => c.url === '/api/v1/crm/assignees')).toHaveLength(2);
    expect(onAssigned).toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Selected leads"]')).toBeNull();
  });

  it('says every existing assignment is replaced only when that is so, and can go back', async () => {
    await render();
    act(() => checkbox('Select Bala, Beta Foods').click());
    act(() => button('Assign Leads')?.click());
    act(() => ((document.querySelector('[role=dialog]') as HTMLElement).querySelector('input[value="m-neha"]') as HTMLInputElement).click());
    act(() => button('Continue')?.click());
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Their existing assignments will be replaced.');
    act(() => button('Back')?.click());
    act(() => ((document.querySelector('[role=dialog]') as HTMLElement).querySelector('input[value="m-sagar"]') as HTMLInputElement).click());
    act(() => button('Continue')?.click());
    const text = document.querySelector('[role=dialog]')?.textContent ?? '';
    expect(text).not.toContain('replaced');
    expect(text).toContain('1 lead is already assigned to Sagar Bhanushali and stays as it is.');
    act(() => button('Cancel')?.click());
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(calls.some((c) => c.url === '/api/v1/crm/leads/assign')).toBe(false);
  });

  it('shows a refusal in the dialog, naming the leads that failed, and changes nothing', async () => {
    assignResponse = () => json({ statusCode: 400, message: '1 of the selected leads is not in this workspace or no longer exists. Nothing was changed; refresh the list and try again.', errors: { failedLeadIds: ['l3'] } }, 400);
    const onAssigned = await render();
    act(() => checkbox('Select Chirag, Gamma Steel').click());
    act(() => button('Assign Leads')?.click());
    act(() => ((document.querySelector('[role=dialog]') as HTMLElement).querySelector('input[value="m-sagar"]') as HTMLInputElement).click());
    act(() => button('Continue')?.click());
    await act(async () => button('Confirm Assignment')?.click());
    await settle();
    const alert = document.querySelector('[role=dialog] [role=alert]');
    expect(alert?.textContent).toContain('Nothing was changed');
    expect(alert?.textContent).toContain('Not available: Chirag (Gamma Steel).');
    expect(onAssigned).not.toHaveBeenCalled();
  });

  it('unassigns after a confirmation', async () => {
    await render();
    act(() => checkbox('Select Chirag, Gamma Steel').click());
    act(() => button('Unassign')?.click());
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toBe('Unassign 1 lead?');
    await act(async () => button('Unassign leads', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.url === '/api/v1/crm/leads/assign')?.body).toEqual({ leadIds: ['l3'], assigneeMemberId: null });
  });
});

describe('CRM Masters → Assignees', () => {
  it('shows each member’s real assigned lead count from the server, including 0', async () => {
    await act(async () => root.render(<CRMMastersManager onRefreshParent={() => undefined} />));
    await settle();
    act(() => button('Assignees')?.click());
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(rows.find((r) => r.includes('Neha'))).toContain('4 leads');
    expect(rows.find((r) => r.includes('Meet'))).toContain('0 leads');
  });
});

describe('page size and bulk delete', () => {
  it('lets the member choose how many leads a page shows, asked of the server from page one', async () => {
    await render();
    act(() => button('Next')?.click());
    await settle();
    const pageSize = container.querySelector('nav[aria-label="Pages"] select') as HTMLSelectElement;
    expect([...pageSize.options].map((o) => o.value)).toEqual(['25', '50', '100']);
    setValue(pageSize, '100');
    await settle();
    const last = listCalls().at(-1)!.url;
    expect(last).toContain('limit=100');
    expect(last).toContain('page=1');
  });

  it('deletes the selected leads after a specific confirmation, then reloads', async () => {
    granted = new Set(['leads.view', 'leads.view_all', 'leads.update', 'leads.delete']);
    const onChanged = await render();
    act(() => checkbox('Select Asha, Alpha Traders').click());
    act(() => checkbox('Select Bala, Beta Foods').click());
    act(() => button('Delete leads')!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Delete 2 leads?');
    expect(dialog.textContent).toContain('Alpha Traders — Asha');
    expect(dialog.textContent).toContain('Beta Foods — Bala');
    const listsBefore = listCalls().length;
    await act(async () => [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete 2 leads')!.click());
    await settle();
    expect(calls.find((c) => c.url === '/api/v1/crm/leads/bulk')?.body).toEqual({ action: 'delete', leadIds: ['l1', 'l2'] });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(listCalls().length).toBeGreaterThan(listsBefore);
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows a refusal in the dialog, naming the leads, and claims nothing was deleted', async () => {
    granted = new Set(['leads.view', 'leads.view_all', 'leads.delete']);
    deleteResponse = () => json({ statusCode: 409, message: '1 of the selected leads has quotations, so nothing was deleted: Alpha Traders. Unselect it and try again.', code: 'LEADS_HAVE_QUOTATIONS', errors: { failedLeadIds: ['l1'] } }, 409);
    await render();
    // Allowed to delete but not to edit: leads can be selected and deleted, not assigned.
    expect(button('Assign Leads')).toBeUndefined();
    act(() => checkbox('Select Asha, Alpha Traders').click());
    expect(button('Assign Leads')).toBeUndefined();
    act(() => button('Delete leads')!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    await act(async () => [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete 1 lead')!.click());
    await settle();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('nothing was deleted');
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Not available: Asha (Alpha Traders).');
  });

  it('offers no delete to members who may not delete leads', async () => {
    await render();
    act(() => checkbox('Select Asha, Alpha Traders').click());
    expect(button('Delete leads')).toBeUndefined();
  });
});
