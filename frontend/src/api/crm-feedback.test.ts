import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';
import { crmPath, errorMessage, successMessage } from './crm-feedback';
import { toast, ToastItem } from '../lib/toast';

let shown: ToastItem[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  toast.reset();
  unsubscribe = toast.subscribe((items) => (shown = items));
});

afterEach(() => {
  unsubscribe();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('CRM feedback rules', () => {
  it('recognises CRM requests only', () => {
    expect(crmPath('/api/v1/crm/leads/abc?x=1')).toBe('crm/leads/abc');
    expect(crmPath('http://localhost:3000/api/v1/crm/masters/stages')).toBe('crm/masters/stages');
    expect(crmPath('/api/v1/tenant/email/send')).toBeNull();
    expect(crmPath('/api/v1/users')).toBeNull();
  });

  it('names the record and the change', () => {
    expect(successMessage('crm/leads', 'POST', {})).toBe('Lead created successfully');
    expect(successMessage('crm/leads/0a6b2f7e-5c1d-4e8f-9a0b-1c2d3e4f5a6b', 'PUT', {})).toBe('Lead updated successfully');
    expect(successMessage('crm/leads/0a6b2f7e-5c1d-4e8f-9a0b-1c2d3e4f5a6b', 'DELETE', {})).toBe('Lead deleted successfully');
    expect(successMessage('crm/clients', 'POST', {})).toBe('Client created successfully');
    expect(successMessage('crm/quotations/0a6b2f7e-5c1d-4e8f-9a0b-1c2d3e4f5a6b', 'DELETE', {})).toBe('Quotation deleted successfully');
    expect(successMessage('crm/masters/industries/sub', 'PUT', {})).toBe('Sub-industry updated successfully');
    expect(successMessage('crm/masters/sources', 'DELETE', {})).toBe('Lead source deleted successfully');
    // Actions use what the server says it did; reads say nothing.
    expect(successMessage('crm/leads/import', 'POST', { message: 'Imported 3 leads; 1 rows skipped' })).toBe('Imported 3 leads; 1 rows skipped');
    expect(successMessage('crm/leads', 'GET', {})).toBeNull();
  });

  it("uses the server's message for failures", () => {
    expect(errorMessage(421, { message: 'This address does not serve Voogyo workspaces.' })).toBe('This address does not serve Voogyo workspaces.');
    expect(errorMessage(400, { message: ['a', 'b'] })).toBe('a, b');
    expect(errorMessage(403, {})).toBe('You do not have permission to do this.');
    expect(errorMessage(500, null)).toBe('The request failed (500). Try again.');
  });
});

describe('apiFetch reports CRM results as toasts', () => {
  it('shows a success toast when a lead is created', async () => {
    vi.stubGlobal('fetch', reply(201, { success: true, data: { id: 'l1' }, message: 'Lead created successfully' }));
    const response = await apiFetch('/api/v1/crm/leads', { method: 'POST', body: '{}' });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { id: 'l1' } }); // the caller can still read the body
    expect(shown.map((t) => [t.kind, t.message])).toEqual([['success', 'Lead created successfully']]);
  });

  it('shows the server error, such as the 421 that used to fail silently', async () => {
    vi.stubGlobal('fetch', reply(421, { statusCode: 421, message: 'This address does not serve Voogyo workspaces.' }));
    await apiFetch('/api/v1/crm/leads', { method: 'POST', body: '{}' });
    expect(shown.map((t) => [t.kind, t.message])).toEqual([['error', 'This address does not serve Voogyo workspaces.']]);
  });

  it('reports failed reads, but not successful ones', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: [] }));
    await apiFetch('/api/v1/crm/leads');
    expect(shown).toEqual([]);
    vi.stubGlobal('fetch', reply(403, { message: 'You do not have permission to view leads.' }));
    await apiFetch('/api/v1/crm/leads');
    expect(shown.map((t) => t.message)).toEqual(['You do not have permission to view leads.']);
  });

  it('leaves 401 to the session handling, and non-CRM requests alone', async () => {
    vi.stubGlobal('fetch', reply(401, { message: 'Session expired' }));
    await apiFetch('/api/v1/crm/leads');
    vi.stubGlobal('fetch', reply(500, { message: 'x' }));
    await apiFetch('/api/v1/tenant/email/send', { method: 'POST' });
    expect(shown).toEqual([]);
  });

  it('lets a screen replace or suppress the success text', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true }));
    await apiFetch('/api/v1/crm/leads/1', { method: 'PUT', feedback: { success: 'Lead moved to Won' } });
    await apiFetch('/api/v1/crm/leads/1/convert-won', { method: 'POST', feedback: { success: false } });
    expect(shown.map((t) => t.message)).toEqual(['Lead moved to Won']);
  });

  it('reports a network failure and still throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(apiFetch('/api/v1/crm/leads', { method: 'POST' })).rejects.toThrow('Failed to fetch');
    expect(shown.map((t) => t.message)).toEqual(['Could not reach the server. Check your connection and try again.']);
  });

  it('shows the same message once when several requests fail together', async () => {
    vi.stubGlobal('fetch', reply(503, { message: 'The server is unavailable.' }));
    await Promise.all([apiFetch('/api/v1/crm/leads'), apiFetch('/api/v1/crm/clients'), apiFetch('/api/v1/crm/meetings')]);
    expect(shown.map((t) => t.message)).toEqual(['The server is unavailable.']);
  });
});

describe('CRM screens use the one toast system', () => {
  const root = join(process.cwd(), 'src');
  const files = [
    ...readdirSync(join(root, 'components', 'crm')).map((f) => join(root, 'components', 'crm', f)),
    join(root, 'views', 'crm', 'CrmWorkspaceView.tsx'),
    join(root, 'views', 'emails', 'EmailMarketingView.tsx'),
  ].filter((f) => f.endsWith('.tsx'));

  it.each(files.map((f) => [f.slice(root.length + 1), f]))('%s keeps no toast state of its own', (_, file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/const \[toast[A-Za-z]*, setToast/);
    expect(source).not.toMatch(/tenant_rnd_001|pipe_rnd_main|'stage_2'/);
  });
});
