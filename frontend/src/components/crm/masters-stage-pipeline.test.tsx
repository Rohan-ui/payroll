import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import CRMMastersManager from './CRMMastersManager';

/**
 * A stage added in CRM Masters goes to the pipeline the user picks. It used to
 * go silently to the first pipeline, and the list labelled every stage "Main
 * Pipeline", so stages meant for the Cold Funnel ended up elsewhere unnoticed.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PIPELINES = [
  { id: 'p-sales', name: 'Sales', code: 'SALES', sort_order: 0 },
  { id: 'p-cold', name: 'Cold Funnel', code: 'COLD_FUNNEL', sort_order: 1 },
];
const STAGES = [{ id: 's-new', pipeline_id: 'p-sales', name: 'New', color: '#2563eb', stage_probability: 10, sla_duration_hours: 48, sort_order: 1 }];

it('adds a stage to the chosen pipeline and lists each stage under its real pipeline', async () => {
  const posts: { url: string; body: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      const data = url.endsWith('/masters/pipelines') ? PIPELINES : url.endsWith('/masters/stages') ? STAGES : [];
      return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<CRMMastersManager onRefreshParent={() => undefined} />));
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

  act(() => button('Pipeline Stages').click());
  const row = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('New'));
  expect(row?.textContent).toContain('Sales');
  expect(row?.textContent).not.toContain('Main Pipeline');

  act(() => button('Add to Master').click());
  const pipeline = container.querySelector('#stage-pipeline') as HTMLSelectElement;
  expect([...pipeline.options].map((o) => o.textContent)).toEqual(['Choose a pipeline', 'Sales (SALES)', 'Cold Funnel (COLD_FUNNEL)']);
  const set = (el: HTMLInputElement | HTMLSelectElement, value: string, event: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event(event, { bubbles: true }));
    });
  set(pipeline, 'p-cold', 'change');
  set(container.querySelector('input[placeholder="e.g. Technical Proposal Shared"]') as HTMLInputElement, 'First touch', 'input');
  await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());

  expect(posts).toHaveLength(1);
  expect(posts[0].url).toBe('/api/v1/crm/masters/stages');
  expect(posts[0].body).toMatchObject({ pipeline_id: 'p-cold', name: 'First touch' });

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('edits a pipeline (name, code, default) and moves a stage to another pipeline', async () => {
  const saves: { method: string; url: string; body: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (method !== 'GET') {
        saves.push({ method, url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const data = url.endsWith('/masters/pipelines') ? PIPELINES : url.endsWith('/masters/stages') ? STAGES : [];
      return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<CRMMastersManager onRefreshParent={() => undefined} />));
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string, event: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event(event, { bubbles: true }));
    });
  const submit = () => act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());

  // Pipelines: the Edit button is offered, and the form saves name, code and the default flag.
  act(() => button('Pipelines (')?.click());
  const salesRow = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Sales'))!;
  act(() => (salesRow.querySelector('button[title="Edit"]') as HTMLButtonElement).click());
  setValue(container.querySelector('input[placeholder="e.g. Enterprise Software Retainers"]') as HTMLInputElement, 'Enterprise sales', 'input');
  setValue(container.querySelector('#pipeline-code') as HTMLInputElement, 'ENTERPRISE', 'input');
  act(() => (container.querySelector('input[type=checkbox]') as HTMLInputElement).click());
  await submit();
  expect(saves[0]).toMatchObject({ method: 'PUT', url: '/api/v1/crm/masters/pipelines', body: { id: 'p-sales', name: 'Enterprise sales', code: 'ENTERPRISE', is_default: 1 } });

  // Stages: the pipeline can be changed while editing.
  act(() => button('Pipeline Stages')?.click());
  const stageRow = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('New'))!;
  act(() => (stageRow.querySelector('button[title="Edit"]') as HTMLButtonElement).click());
  const select = container.querySelector('#stage-pipeline') as HTMLSelectElement;
  expect(select.disabled).toBe(false);
  expect(container.querySelector('#stage-pipeline-hint')?.textContent).toContain('only while no leads are in it');
  setValue(select, 'p-cold', 'change');
  await submit();
  expect(saves[1]).toMatchObject({ method: 'PUT', url: '/api/v1/crm/masters/stages', body: { id: 's-new', pipeline_id: 'p-cold' } });

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
