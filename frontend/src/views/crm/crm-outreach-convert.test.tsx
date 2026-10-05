import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, ToastItem } from '../../lib/toast';

/**
 * Converting a lead from Client Outreach into a Sales Pipeline opportunity,
 * through the real workspace, Outreach screen and board (API stubbed): the
 * destination is the pipeline and stage chosen (by default the Cold Funnel and its first open stage), success is claimed only after the server
 * confirms, and the board shows the lead in the Cold Funnel straight away.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payroll = { crmTab: 'cold-funnel', setCrmTab: vi.fn(), navigateTo: vi.fn() };
vi.mock('../../context/PayrollContext', () => ({ usePayroll: () => payroll }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ canOpen: () => true, activeTenant: { tenantId: 'tenant-1' } }) }));

const { CrmWorkspaceView } = await import('./CrmWorkspaceView');

const SALES = { id: 'p-sales', name: 'Sales', code: 'SALES', is_default: true, is_active: true, sort_order: 0 };
const FUNNEL = { id: 'p-cold', name: 'Cold Funnel', code: 'COLD_FUNNEL', is_default: false, is_active: true, sort_order: 1 };
const STAGES = [
  { id: 's-sales', pipeline_id: 'p-sales', name: 'New', sort_order: 0, color: '#2563eb', stage_probability: 10, sla_duration_hours: 48 },
  { id: 's-won', pipeline_id: 'p-cold', name: 'Won', sort_order: 0, is_won: true, color: '#10b981', stage_probability: 100, sla_duration_hours: 48 },
  { id: 's-first', pipeline_id: 'p-cold', name: 'First touch', sort_order: 1, color: '#2563eb', stage_probability: 10, sla_duration_hours: 48 },
  { id: 's-qual', pipeline_id: 'p-cold', name: 'Qualified', sort_order: 2, color: '#2563eb', stage_probability: 30, sla_duration_hours: 48 },
];
const OUTREACH_LEAD = {
  id: 'lead-1', lead_code: 'LD-2026-500001', company_name: 'Outreach Co', first_name: 'Omar', last_name: 'Khan', email: 'omar@outreach.test',
  pipeline_id: 'p-sales', stage_id: 's-sales', temperature: 'COLD', budget_amount: '0', industry: 'general',
  custom_attributes: { cadence: { status: 'ACTIVE', currentStepIndex: 0 } },
  cadence: { status: 'ACTIVE', currentStepIndex: 0, completedSteps: [], industry: 'general' },
  currentStep: { id: 'step-1', dayNumber: 1, title: 'Intro', channels: ['WHATSAPP'] },
  dueStatus: 'DUE_TODAY',
};
const CONVERTED = { ...OUTREACH_LEAD, pipeline_id: 'p-cold', stage_id: 's-first', pipeline_name: 'Cold Funnel', stage_name: 'First touch', temperature: 'HOT', custom_attributes: { cadence: { status: 'CONVERTED', convertedToOpportunity: true } } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let pipelines = [SALES, FUNNEL];
let convertReply: () => Response;
let calls: { url: string; method: string; body: any }[] = [];
let container: HTMLDivElement;
let root: Root | null = null;
let shown: ToastItem[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  pipelines = [SALES, FUNNEL];
  calls = [];
  localStorage.clear();
  toast.reset();
  unsubscribe = toast.subscribe((items) => (shown = items));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url === '/api/v1/crm/cadence' && method === 'POST') return convertReply();
      if (url.startsWith('/api/v1/crm/cadence')) {
        const radar = { overdue: [], dueToday: [OUTREACH_LEAD], upcoming: [], allActive: [OUTREACH_LEAD], completed: [], branched: [], converted: [] };
        return json({ success: true, data: { stats: { totalEnrolled: 1 }, radar, masterSteps: [{ id: 'step-1', dayNumber: 1, title: 'Intro', goal: 'First contact', channels: ['WHATSAPP'], templates: {} }], replyBranches: {}, industries: {}, demoSeedAllowed: false } });
      }
      if (url.startsWith('/api/v1/crm/leads?')) {
        // The lead is older than the first page of leads, so the list does not include it.
        return json({ success: true, data: { leads: [], stages: STAGES, pipelines, sources: [], salesPersons: [], clients: [] } });
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
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(text)) as HTMLButtonElement | undefined;

async function openConvertDialog() {
  await act(async () => root?.render(<CrmWorkspaceView />));
  await flush();
  const convert = button('Convert Opp');
  expect(convert).toBeDefined();
  act(() => convert?.click());
}

const select = (selector: string) => container.querySelector(selector) as HTMLSelectElement;
const options = (selector: string) => [...select(selector).options].map((o) => o.textContent);
const choose = (selector: string, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select(selector), value);
    select(selector).dispatchEvent(new Event('change', { bubbles: true }));
  });
const confirmButton = () => button('Confirm Conversion to Opportunity') as HTMLButtonElement;
const convertPosts = () => calls.filter((c) => c.url === '/api/v1/crm/cadence' && c.method === 'POST');

describe('Convert to Opportunity from Client Outreach', () => {
  it('goes to the Cold Funnel first open stage, and the board shows it there after the server confirms', async () => {
    convertReply = () =>
      json({ success: true, message: 'Outreach Co is now in Cold Funnel › First touch', data: { success: true, message: 'Outreach Co is now in Cold Funnel › First touch', lead: CONVERTED, pipeline: { id: 'p-cold', name: 'Cold Funnel' }, stage: { id: 's-first', name: 'First touch' } } }, 201);
    await openConvertDialog();

    expect(container.textContent).toContain('Cold Funnel');
    expect(container.textContent).toContain('First touch');
    // No invented deal value, and the server decides the destination.
    expect((container.querySelector('input[type=number]') as HTMLInputElement).value).toBe('');
    const leadLoadsBefore = calls.filter((c) => c.url.startsWith('/api/v1/crm/leads?')).length;

    await act(async () => confirmButton().click());
    await flush();

    expect(convertPosts()).toHaveLength(1);
    expect(convertPosts()[0].body).toEqual({ action: 'CONVERT_OPPORTUNITY', leadId: 'lead-1', pipelineId: 'p-cold', stageId: 's-first', temperature: 'HOT', notes: expect.any(String) });
    expect(shown.map((t) => [t.kind, t.message])).toEqual([['success', 'Outreach Co is now in Cold Funnel › First touch']]);
    expect(shown[0].actions?.map((a) => a.label)).toEqual(['Open lead', 'Show in pipeline']);
    // The pipeline data is reloaded.
    expect(calls.filter((c) => c.url.startsWith('/api/v1/crm/leads?')).length).toBeGreaterThan(leadLoadsBefore);

    act(() => shown[0].actions?.[1].onClick());
    await flush();
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('p-cold');
    const card = container.querySelector('[data-lead-card="lead-1"]');
    expect(card?.className).toContain('ring-2');
    expect(card?.closest('.w-72')?.textContent).toContain('First touch');
  });

  it('defaults to the Cold Funnel and its first open stage, and sends the stage chosen', async () => {
    convertReply = () => json({ statusCode: 400, message: 'x' }, 400);
    await openConvertDialog();
    expect(container.querySelector('label[for="convert-pipeline"]')?.textContent).toBe('Target Sales Pipeline');
    expect(container.querySelector('label[for="convert-stage"]')?.textContent).toBe('Initial Pipeline Stage');
    expect(options('#convert-pipeline')).toEqual(['Sales', 'Cold Funnel (default)']);
    expect(select('#convert-pipeline').value).toBe('p-cold');
    // Only open stages: a deal does not start in Won.
    expect(options('#convert-stage')).toEqual(['First touch', 'Qualified']);
    expect(select('#convert-stage').value).toBe('s-first');
    choose('#convert-stage', 's-qual');
    await act(async () => confirmButton().click());
    await flush();
    expect(convertPosts()[0].body).toMatchObject({ leadId: 'lead-1', pipelineId: 'p-cold', stageId: 's-qual' });
  });

  it('can send the lead to another pipeline, starting in one of its stages', async () => {
    convertReply = () => json({ statusCode: 400, message: 'x' }, 400);
    await openConvertDialog();
    choose('#convert-stage', 's-qual');
    choose('#convert-pipeline', 'p-sales');
    expect(options('#convert-stage')).toEqual(['New']);
    expect(select('#convert-stage').value).toBe('s-sales');
    await act(async () => confirmButton().click());
    await flush();
    expect(convertPosts()[0].body).toMatchObject({ pipelineId: 'p-sales', stageId: 's-sales' });
  });

  it('keeps the dialog open with the server error, claims no success, and allows a retry', async () => {
    convertReply = () => json({ statusCode: 409, message: 'Outreach Co was already converted and is in the Sales Pipeline.' }, 409);
    await openConvertDialog();
    await act(async () => confirmButton().click());
    await flush();

    expect(shown.map((t) => [t.kind, t.message])).toEqual([['error', 'Outreach Co was already converted and is in the Sales Pipeline.']]);
    expect(confirmButton()).toBeDefined();
    expect(confirmButton().disabled).toBe(false);
  });

  it('sends one request however often the button is pressed while converting', async () => {
    let release: (r: Response) => void = () => undefined;
    convertReply = () => new Promise<Response>((resolve) => (release = resolve)) as unknown as Response;
    await openConvertDialog();
    await act(async () => {
      confirmButton().click();
      confirmButton().click();
    });
    expect(convertPosts()).toHaveLength(1);
    expect(button('Converting')?.disabled).toBe(true);
    await act(async () => release(json({ statusCode: 400, message: 'x' }, 400)));
    await flush();
  });

  it('without a Cold Funnel, explains it and waits for a pipeline to be chosen', async () => {
    pipelines = [SALES];
    convertReply = () => json({ statusCode: 400, message: 'x' }, 400);
    await openConvertDialog();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('The Cold Funnel, where converted leads go by default, is not set up');
    expect(select('#convert-pipeline').value).toBe('');
    expect(confirmButton().disabled).toBe(true);
    act(() => confirmButton().click());
    expect(convertPosts()).toHaveLength(0);

    choose('#convert-pipeline', 'p-sales');
    expect(confirmButton().disabled).toBe(false);
    await act(async () => confirmButton().click());
    await flush();
    expect(convertPosts()[0].body).toMatchObject({ pipelineId: 'p-sales', stageId: 's-sales' });
  });
});
