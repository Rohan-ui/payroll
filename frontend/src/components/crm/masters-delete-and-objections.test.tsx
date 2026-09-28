import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CRMMastersManager from './CRMMastersManager';

/**
 * CRM Masters (API stubbed; the screen is the real one): a refused delete says
 * why inside the dialog, and SOP Objection Strategies can be added.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PIPELINES = [{ id: 'p-sales', name: 'Sales', code: 'SALES', sort_order: 0 }];
const STAGES = [{ id: 's-new', pipeline_id: 'p-sales', name: 'Qualified', color: '#2563eb', stage_probability: 10, sla_duration_hours: 48, sort_order: 1 }];
const BRANCHES = [{
  id: 'default-branch-send_details', branch_key: 'send_details', label: 'Send me details', next_lead_temperature: 'WARM',
  trigger_condition: 'Prospect says: "Send details"', suggested_action: 'Share the capability deck',
  whatsapp_message: 'Sure {{First Name}}!\n\nHere is our deck with three case studies.', recommended_response_script: 'Sure {{First Name}}!\n\nHere is our deck with three case studies.',
  email_subject: 'Our capability deck', email_body: '', is_active: true,
}];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let calls: { url: string; method: string; body: any }[] = [];
let deleteReply: () => Response;
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (method === 'DELETE') return deleteReply();
      if (method === 'PUT') return json({ success: true, data: {}, message: 'Updated' });
      if (method === 'POST') return json({ success: true, data: { label: 'Pricing too high' }, message: 'Objection strategy "Pricing too high" added' }, 201);
      if (url.endsWith('/masters/pipelines')) return json({ success: true, data: PIPELINES });
      if (url.endsWith('/masters/stages')) return json({ success: true, data: STAGES });
      if (url.endsWith('/masters/sop-branches')) return json({ success: true, data: BRANCHES });
      if (url.endsWith('/masters/lost-reasons')) return json({ success: true, data: [{ id: 'lr-1', reason_name: 'Budget too low', is_active: true }] });
      if (url.endsWith('/masters/sources')) return json({ success: true, data: [{ id: 'src-1', name: 'Google Ads', channel: 'Paid Search', is_active: true }] });
      return json({ success: true, data: [] });
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<CRMMastersManager onRefreshParent={() => undefined} />));
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(text)) as HTMLButtonElement | undefined;

it('shows why a stage cannot be deleted inside the dialog, and deletes nothing', async () => {
  deleteReply = () => json({ statusCode: 409, message: '12 leads are in "Qualified". Move them to another stage on the Sales Pipeline board, then delete it.' }, 409);
  act(() => button('Pipeline Stages')?.click());
  act(() => (container.querySelector('button[title="Delete"]') as HTMLButtonElement).click());
  await act(async () => button('Delete Record')?.click());
  await flush();

  expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['/api/v1/crm/masters/stages?id=s-new']);
  expect(container.querySelector('[role=alert]')?.textContent).toBe('12 leads are in "Qualified". Move them to another stage on the Sales Pipeline board, then delete it.');
  // Only a way out is offered; the record is still listed.
  expect(button('Delete Record')).toBeUndefined();
  act(() => button('Close')?.click());
  expect(container.querySelector('[role=alert]')).toBeNull();
  expect(container.textContent).toContain('Qualified');
});

it('adds an objection strategy with its scripts', async () => {
  act(() => button('SOP Objection Strategies')?.click());
  act(() => button('Add to Master')?.click());
  const type = (selector: string, value: string) =>
    act(() => {
      const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  type('input[placeholder="e.g. Already have website"]', 'Pricing too high');
  type('textarea[placeholder^="Understood {{First Name}}"]', 'Understood {{First Name}}! We can phase it.');
  await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
  await flush();

  const posts = calls.filter((c) => c.method === 'POST');
  expect(posts.map((c) => c.url)).toEqual(['/api/v1/crm/masters/sop-branches']);
  expect(posts[0].body).toMatchObject({ label: 'Pricing too high', next_lead_temperature: 'WARM', whatsapp_message: 'Understood {{First Name}}! We can phase it.' });
  expect(container.querySelector('form')).toBeNull();
});

it('shows an objection strategy in full from its eye button, and closes with Escape', async () => {
  act(() => button('SOP Objection Strategies')?.click());
  const eye = container.querySelector('button[aria-label="View details of Send me details"]') as HTMLButtonElement;
  act(() => eye.click());

  const dialog = container.querySelector('[role=dialog]') as HTMLElement;
  expect(dialog.getAttribute('aria-labelledby')).toBe('view-branch-title');
  expect(dialog.querySelector('#view-branch-title')?.textContent).toBe('Send me details');
  const details = Object.fromEntries([...dialog.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));
  expect(details).toEqual({
    'Next lead temperature': 'WARM — Nurture/Audit',
    'Trigger condition (prospect words)': 'Prospect says: "Send details"',
    'Suggested SDR action': 'Share the capability deck',
    // In full, with its line breaks, where the table cuts it short.
    'WhatsApp response script': 'Sure {{First Name}}!\n\nHere is our deck with three case studies.',
    'Email subject': 'Our capability deck',
    'Email body': 'Not set',
  });
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(container.querySelector('[role=dialog]')).toBeNull();
  expect(document.activeElement).toBe(eye);
});

it('edits a lead source from its Edit button', async () => {
  act(() => button('Lead Sources')?.click());
  const row = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Google Ads'))!;
  act(() => (row.querySelector('button[title="Edit"]') as HTMLButtonElement).click());
  const type = (selector: string, value: string) =>
    act(() => {
      const el = container.querySelector(selector) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  expect((container.querySelector('input[placeholder="e.g. Google Ads, LinkedIn Campaign"]') as HTMLInputElement).value).toBe('Google Ads');
  type('input[placeholder="e.g. Google Ads, LinkedIn Campaign"]', 'Google Ads (Search)');
  type('input[placeholder="e.g. Paid Search, Social Media"]', 'Paid');
  await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
  await flush();

  const puts = calls.filter((c) => c.method === 'PUT');
  expect(puts.map((c) => c.url)).toEqual(['/api/v1/crm/masters/sources']);
  expect(puts[0].body).toMatchObject({ id: 'src-1', name: 'Google Ads (Search)', channel: 'Paid' });
  expect(container.querySelector('form')).toBeNull();
});

it('edits a lost reason from its Edit button', async () => {
  act(() => button('Lost Reasons')?.click());
  const row = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Budget too low'))!;
  act(() => (row.querySelector('button[title="Edit"]') as HTMLButtonElement).click());
  const input = container.querySelector('input[placeholder="e.g. Competitor provided cheaper rate"]') as HTMLInputElement;
  expect(input.value).toBe('Budget too low');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Budget cut this quarter');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
  await flush();

  const puts = calls.filter((c) => c.method === 'PUT');
  expect(puts.map((c) => c.url)).toEqual(['/api/v1/crm/masters/lost-reasons']);
  expect(puts[0].body).toMatchObject({ id: 'lr-1', reason_name: 'Budget cut this quarter' });
  expect(container.querySelector('form')).toBeNull();
});

it('adds a lost reason from Add to Master', async () => {
  act(() => button('Lost Reasons')?.click());
  act(() => button('Add to Master')?.click());
  const input = container.querySelector('input[placeholder="e.g. Competitor provided cheaper rate"]') as HTMLInputElement;
  expect(input.value).toBe('');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'No budget this year');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
  await flush();

  const posts = calls.filter((c) => c.method === 'POST');
  expect(posts.map((c) => c.url)).toEqual(['/api/v1/crm/masters/lost-reasons']);
  expect(posts[0].body).toMatchObject({ reason_name: 'No budget this year', is_active: 1 });
  expect(container.querySelector('form')).toBeNull();
});
