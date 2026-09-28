import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dealWonMessage, isInOutreach, resolveBoardPipeline } from './pipelineBoard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ activeTenant: { tenantId: 'tenant-1' } }) }));

const { default: PipelineKanban } = await import('./PipelineKanban');
const { default: WonDealsView } = await import('./WonDealsView');

const MAIN = { id: 'p-main', name: 'Main', is_default: false, sort_order: 0 };
const SALES = { id: 'p-sales', name: 'Sales', is_default: true, sort_order: 1 };
const PIPELINES = [MAIN, SALES];
const STAGES = [
  { id: 's-main', pipeline_id: 'p-main', name: 'Main new', sort_order: 0, color: '#2563eb', stage_probability: 10, sla_duration_hours: 48 },
  { id: 's-sales', pipeline_id: 'p-sales', name: 'Sales new', sort_order: 0, color: '#2563eb', stage_probability: 10, sla_duration_hours: 48 },
];
const lead = (id: string, company: string, pipelineId: string, stageId: string, extra: Record<string, unknown> = {}) => ({
  id, lead_code: `LD-${id}`, company_name: company, first_name: 'Asha', pipeline_id: pipelineId, stage_id: stageId,
  temperature: 'WARM', budget_amount: 0, custom_attributes: null, ...extra,
});
const IN_SALES = lead('l1', 'Sales Lead Co', 'p-sales', 's-sales');
const IN_MAIN = lead('l2', 'Main Lead Co', 'p-main', 's-main');
const COLD = lead('l3', 'Cold Lead Co', 'p-sales', 's-sales', { temperature: 'COLD', custom_attributes: { cadence: { status: 'ACTIVE' } } });

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const board = (props: Record<string, unknown>) =>
  act(() => root?.render(<PipelineKanban leads={[]} stages={[]} pipelines={[]} onRefresh={() => undefined} {...props} />));
const shows = (company: string) => container.textContent?.includes(company) ?? false;
const pipelineSelect = () => container.querySelector('select') as HTMLSelectElement;
const choose = (pipelineId: string) =>
  act(() => {
    const select = pipelineSelect();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, pipelineId);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

describe('pipeline rules', () => {
  it('picks the chosen pipeline while it exists, else the default one, else the first by order', () => {
    expect(resolveBoardPipeline([], null)).toBe('');
    expect(resolveBoardPipeline(PIPELINES, null)).toBe('p-sales');
    expect(resolveBoardPipeline(PIPELINES, 'p-main')).toBe('p-main');
    expect(resolveBoardPipeline(PIPELINES, 'deleted')).toBe('p-sales');
    expect(resolveBoardPipeline([{ id: 'b', sort_order: 2 }, { id: 'a', sort_order: 1 }], null)).toBe('a');
  });

  it('knows which leads are in outreach, whether attributes are an object or a string', () => {
    expect(isInOutreach(COLD)).toBe(true);
    expect(isInOutreach({ custom_attributes: JSON.stringify({ cadence: { status: 'ACTIVE' } }) })).toBe(true);
    expect(isInOutreach({ custom_attributes: { cadence: { status: 'CONVERTED' } } })).toBe(false);
    expect(isInOutreach({ custom_attributes: { cadence: { status: 'ACTIVE', convertedToOpportunity: true } } })).toBe(false);
    expect(isInOutreach({ custom_attributes: 'not json' })).toBe(false);
    expect(isInOutreach(IN_SALES)).toBe(false);
  });

  it('describes Deal Won by what happened, never with a project or invoice', () => {
    expect(dealWonMessage({ clientCode: 'CL-2026-123456', clientCreated: true })).toBe('Deal won — client CL-2026-123456 created');
    expect(dealWonMessage({ clientCode: 'CL-2026-123456', clientCreated: false })).toBe('Deal won — client CL-2026-123456 linked');
    expect(dealWonMessage(undefined)).toBe('Deal won');
  });
});

describe('Sales Pipelines board', () => {
  it('shows the default pipeline and its leads when the data arrives after the board opened', () => {
    board({});
    expect(shows('Sales Lead Co')).toBe(false);
    board({ leads: [IN_SALES, IN_MAIN], pipelines: PIPELINES, stages: STAGES });
    expect(pipelineSelect().value).toBe('p-sales');
    expect(shows('Sales Lead Co')).toBe(true);
    expect(shows('Main Lead Co')).toBe(false);
  });

  it("keeps the user's choice when data reloads, remembers it per workspace, and falls back if it disappears", () => {
    board({ leads: [IN_SALES, IN_MAIN], pipelines: PIPELINES, stages: STAGES });
    choose('p-main');
    expect(shows('Main Lead Co')).toBe(true);
    expect(localStorage.getItem('voogyo.crm.pipeline.tenant-1')).toBe('p-main');

    board({ leads: [IN_MAIN, IN_SALES], pipelines: [...PIPELINES], stages: STAGES });
    expect(pipelineSelect().value).toBe('p-main');

    board({ leads: [IN_SALES], pipelines: [SALES], stages: STAGES });
    expect(pipelineSelect().value).toBe('p-sales');
    expect(shows('Sales Lead Co')).toBe(true);
  });

  it('opens on the pipeline remembered for this workspace', () => {
    localStorage.setItem('voogyo.crm.pipeline.tenant-1', 'p-main');
    board({ leads: [IN_SALES, IN_MAIN], pipelines: PIPELINES, stages: STAGES });
    expect(pipelineSelect().value).toBe('p-main');
  });

  it('still works when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    board({ leads: [IN_SALES, IN_MAIN], pipelines: PIPELINES, stages: STAGES });
    expect(shows('Sales Lead Co')).toBe(true);
    choose('p-main');
    expect(shows('Main Lead Co')).toBe(true);
  });

  it('keeps outreach leads off the board and links to them instead', () => {
    const onOpenOutreach = vi.fn();
    board({ leads: [IN_SALES, COLD], pipelines: PIPELINES, stages: STAGES, onOpenOutreach });
    expect(shows('Cold Lead Co')).toBe(false);
    const link = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('1 lead in outreach'));
    expect(link?.textContent).toContain('Client Outreach');
    act(() => link?.click());
    expect(onOpenOutreach).toHaveBeenCalled();
  });

  it('"Show on board" selects the lead\'s pipeline, highlights its card once, and clears filters', () => {
    const onFocusHandled = vi.fn();
    board({ leads: [IN_SALES, IN_MAIN], pipelines: PIPELINES, stages: STAGES, onFocusHandled, focusRequest: { leadId: 'l2', pipelineId: 'p-main', nonce: 1 } });
    expect(pipelineSelect().value).toBe('p-main');
    const card = container.querySelector('[data-lead-card="l2"]');
    expect(card?.className).toContain('ring-2');
    expect(onFocusHandled).toHaveBeenCalledTimes(1);
  });
});

describe('Won deals', () => {
  it('lists won deals from the server, most recent win first, with the converted client', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            leads: [
              lead('w1', 'Older Win', 'p-sales', 's-sales', { closed_at: '2026-08-01T10:00:00Z', converted_client_id: 'c1', assigned_user_name: 'Ravi', budget_amount: '250000' }),
              lead('w2', 'Newer Win', 'p-sales', 's-sales', { closed_at: '2026-09-20T10:00:00Z', converted_client_id: null, assigned_user_name: 'Asha' }),
            ],
            clients: [{ id: 'c1', company_name: 'Older Win Pvt Ltd', client_code: 'CL-2026-111111' }],
            pagination: { total: 2 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await act(async () => root?.render(<WonDealsView onBack={() => undefined} onSelectLead360={() => undefined} />));
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

    expect((fetch.mock.calls[0] as unknown[] | undefined)?.[0]).toBe('/api/v1/crm/leads?isWon=true&page=1&limit=100');
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('Newer Win');
    expect(rows[0]).toContain('Not converted to a client');
    expect(rows[1]).toContain('Older Win Pvt Ltd (CL-2026-111111)');
    expect(rows[1]).toContain('₹2,50,000');
    expect(container.textContent).toContain('Won deals(2)');
  });
});
