import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, ToastItem } from '../../lib/toast';

/**
 * Adding a lead from the CRM workspace: the message names where it went, and
 * its actions open it or show it there. The API is stubbed; the workspace,
 * form, board and list are the real components.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payroll = { crmTab: 'cold-funnel', setCrmTab: vi.fn(), navigateTo: vi.fn() };
vi.mock('../../context/PayrollContext', () => ({ usePayroll: () => payroll }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ canOpen: () => true, activeTenant: { tenantId: 'tenant-1' } }) }));

const { CrmWorkspaceView } = await import('./CrmWorkspaceView');

const PIPELINES = [
  { id: 'p-main', name: 'Main', is_default: false, sort_order: 0 },
  { id: 'p-sales', name: 'Sales', is_default: true, sort_order: 1 },
];
const STAGES = [
  { id: 's-main', pipeline_id: 'p-main', name: 'Intro', sort_order: 0, color: '#2563eb', stage_probability: 10, sla_duration_hours: 48 },
  { id: 's-sales', pipeline_id: 'p-sales', name: 'New', sort_order: 0, color: '#2563eb', stage_probability: 10, sla_duration_hours: 48 },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let leads: any[] = [];
let created: any = null;
let container: HTMLDivElement;
let root: Root | null = null;
let shown: ToastItem[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  leads = [];
  localStorage.clear();
  toast.reset();
  unsubscribe = toast.subscribe((items) => (shown = items));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url === '/api/v1/crm/leads' && init.method === 'POST') {
        leads = [created, ...leads];
        return json({ success: true, data: created, message: 'Lead created successfully' }, 201);
      }
      if (url.startsWith('/api/v1/crm/leads?')) {
        return json({ success: true, data: { leads, stages: STAGES, pipelines: PIPELINES, sources: [], salesPersons: [], clients: [] } });
      }
      if (url.startsWith('/api/v1/crm/cadence')) {
        const radar = { overdue: [], dueToday: [], upcoming: [], allActive: [], completed: [], branched: [], converted: [] };
        return json({ success: true, data: { stats: {}, radar, masterSteps: [], replyBranches: {}, industries: {}, demoSeedAllowed: false } });
      }
      return json({ success: true, data: [] });
    }),
  );
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

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
const fillPlaceholder = (placeholder: string, value: string) =>
  act(() => {
    const input = container.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

async function addLeadFromTopButton() {
  await act(async () => root?.render(<CrmWorkspaceView />));
  await flush();
  // The server says demo seeding is not allowed here, so the button is not offered.
  expect(container.textContent).not.toContain('Seed Demo');
  const add = container.querySelector('button[aria-label="Add Lead"], button[aria-label="Add Cold Lead"]') as HTMLButtonElement;
  act(() => add.click());
  fillPlaceholder('e.g. Acme FinTech Technologies Ltd.', created.company_name);
  fillPlaceholder('e.g. Rahul', 'Rahul');
  fillPlaceholder('rahul@acmefintech.com', 'rahul@acme.example');
  await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
  await flush();
}

describe('adding a lead', () => {
  it('names the pipeline and stage, and "Show on board" opens the board on that pipeline with the card highlighted', async () => {
    payroll.crmTab = 'cold-funnel';
    created = { id: 'new-1', lead_code: 'LD-2026-100001', company_name: 'Fresh Warm Co', first_name: 'Rahul', pipeline_id: 'p-sales', stage_id: 's-sales', temperature: 'WARM', budget_amount: 0, custom_attributes: null };
    await addLeadFromTopButton();

    // One specific message (no generic "Lead created successfully" as well).
    expect(shown.map((t) => t.message)).toEqual(['Lead LD-2026-100001 created in Sales › New']);
    expect(shown[0].actions?.map((a) => a.label)).toEqual(['Open lead', 'Show on board']);

    act(() => shown[0].actions?.[1].onClick());
    await flush();
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('p-sales');
    expect(container.querySelector('[data-lead-card="new-1"]')?.className).toContain('ring-2');
  });

  it('says a cold lead went to Client Outreach; the board links there and the list shows it with a badge', async () => {
    payroll.crmTab = 'pipeline';
    created = { id: 'new-2', lead_code: 'LD-2026-100002', company_name: 'Fresh Cold Co', first_name: 'Rahul', pipeline_id: 'p-sales', stage_id: 's-sales', temperature: 'COLD', budget_amount: 0, custom_attributes: { cadence: { status: 'ACTIVE' } } };
    await addLeadFromTopButton();

    expect(shown.map((t) => t.message)).toEqual(['Lead LD-2026-100002 created and enrolled in Client Outreach']);
    expect(shown[0].actions?.map((a) => a.label)).toEqual(['Open lead', 'Show in Outreach']);
    expect(container.textContent).toContain('1 lead in outreach');
    expect(container.querySelector('[data-lead-card="new-2"]')).toBeNull();

    const listButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'List') as HTMLButtonElement;
    act(() => listButton.click());
    await flush();
    const row = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Fresh Cold Co'));
    expect(row?.textContent).toContain('In outreach');
  });
});
