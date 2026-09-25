import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, ToastItem } from '../../lib/toast';
import { PlatformToaster } from '../components/PlatformToaster';
import { RoleTemplatesView } from './RoleTemplatesView';
import { MembershipDialog } from './MembershipDialogs';
import type { UserDetail } from '../api/platform-directory.api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
let shown: ToastItem[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  toast.reset();
  unsubscribe = toast.subscribe((items) => (shown = items));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  unsubscribe();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});

const render = async (element: React.ReactElement) => {
  act(() => root?.render(element));
  await flush();
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Sets a field's value the way React notices it. */
const fill = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const button = (text: string) => {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text));
  if (!found) throw new Error(`No button "${text}"`);
  return found;
};

const toasts = () => shown.map((t) => [t.kind, t.message]);

describe('portal toaster', () => {
  it('shows success as a status and failure as an alert', async () => {
    await render(<PlatformToaster />);
    act(() => {
      toast.success('Tenant updated successfully');
      toast.error('That plan does not exist or is not active.');
    });
    expect(container.querySelector('[role=status]')?.textContent).toContain('Tenant updated successfully');
    expect(container.querySelector('[role=alert]')?.textContent).toContain('That plan does not exist or is not active.');
    act(() => (container.querySelector('button[aria-label="Dismiss notification"]') as HTMLButtonElement).click());
    expect(shown.map((t) => t.message)).toEqual(['That plan does not exist or is not active.']);
  });
});

const CATALOG = [
  {
    section: 'CRM & Sales',
    module: 'CRM',
    groups: [{ group: 'Leads', permissions: [{ key: 'leads.view', name: 'View leads' }, { key: 'leads.create', name: 'Create leads' }] }],
  },
];

describe('role templates', () => {
  it('creates a template with granular permission keys and confirms only what the server saved', async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : null });
        if ((init.method ?? 'GET') === 'POST') {
          return json(201, { success: true, data: { code: 'SALES_REP', name: 'Sales rep', description: null, kind: 'CUSTOM', editable: true, deletable: true, permissions: ['leads.view'], workspaces: 0, activeMembers: 0, updatedAt: null } });
        }
        return json(200, { success: true, data: { catalog: CATALOG, templates: [] } });
      }),
    );

    await render(<RoleTemplatesView />);
    act(() => button('New template').click());
    const [code, name] = [...container.querySelectorAll('input:not([type=checkbox])')] as HTMLInputElement[];
    act(() => {
      fill(code, 'sales_rep');
      fill(name, 'Sales rep');
    });
    act(() => (container.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    act(() => button('Create template').click());
    await flush();

    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toBe('/api/v1/super-admin/roles-templates');
    expect(post?.body).toEqual({ code: 'SALES_REP', name: 'Sales rep', description: '', permissions: ['leads.view'] });
    expect(toasts()).toEqual([['success', 'Role template created successfully']]);
  });

  it('shows the server refusal in place and as an error toast, never as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) =>
        (init.method ?? 'GET') === 'POST'
          ? json(409, { statusCode: 409, message: 'A role template with the code SALES_REP already exists.' })
          : json(200, { success: true, data: { catalog: CATALOG, templates: [] } }),
      ),
    );
    await render(<RoleTemplatesView />);
    act(() => button('New template').click());
    const [code, name] = [...container.querySelectorAll('input:not([type=checkbox])')] as HTMLInputElement[];
    act(() => {
      fill(code, 'SALES_REP');
      fill(name, 'Sales rep');
    });
    act(() => button('Create template').click());
    await flush();

    expect(container.querySelector('[role=alert]')?.textContent).toBe('A role template with the code SALES_REP already exists.');
    expect(toasts()).toEqual([['error', 'A role template with the code SALES_REP already exists.']]);
  });

  it('refuses an invalid code before asking the server', async () => {
    const fetch = vi.fn(async () => json(200, { success: true, data: { catalog: CATALOG, templates: [] } }));
    vi.stubGlobal('fetch', fetch);
    await render(<RoleTemplatesView />);
    act(() => button('New template').click());
    const [code, name] = [...container.querySelectorAll('input:not([type=checkbox])')] as HTMLInputElement[];
    act(() => {
      fill(code, '9 lives');
      fill(name, 'Bad');
    });
    act(() => button('Create template').click());
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1); // the initial list only
    expect(container.textContent).toContain('starting with a letter');
    expect(shown).toEqual([]);
  });
});

describe('membership removal', () => {
  const membership: UserDetail['memberships'][number] = {
    memberId: 'm1',
    tenantId: 't1',
    tenantCode: 'ACME',
    tenantName: 'Acme',
    tenantStatus: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    joinedAt: null,
    removedAt: null,
    roles: [{ code: 'EMPLOYEE', name: 'Employee', kind: 'BUILT_IN' }],
  };

  it('removes the membership through its own route and says the account is kept', async () => {
    const fetch = vi.fn(async () => json(200, { success: true, data: { memberId: 'm1', tenantId: 't1', status: 'ARCHIVED' } }));
    vi.stubGlobal('fetch', fetch);
    const onDone = vi.fn(async () => undefined);
    await render(<MembershipDialog userId="u1" userLabel="Priya" action={{ kind: 'remove', membership }} onDone={onDone} onCancel={() => undefined} />);
    expect(container.textContent).toContain('the account is never deleted');
    act(() => button('Remove from workspace').click());
    await flush();

    expect(fetch).toHaveBeenCalledWith('/api/v1/super-admin/users/u1/memberships/m1', expect.objectContaining({ method: 'DELETE' }));
    expect(onDone).toHaveBeenCalled();
    expect(toasts()).toEqual([['success', 'User removed from workspace successfully']]);
  });

  it('keeps the dialog open with the reason when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { statusCode: 400, message: 'This is the only active administrator of the workspace. Make someone else an administrator first.' })));
    const onDone = vi.fn();
    await render(<MembershipDialog userId="u1" userLabel="Priya" action={{ kind: 'remove', membership }} onDone={onDone} onCancel={() => undefined} />);
    act(() => button('Remove from workspace').click());
    await flush();

    expect(onDone).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('only active administrator');
    expect(toasts()).toEqual([['error', 'This is the only active administrator of the workspace. Make someone else an administrator first.']]);
  });
});
