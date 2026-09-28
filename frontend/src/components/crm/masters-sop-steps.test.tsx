import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import CRMMastersManager from './CRMMastersManager';

/**
 * CRM Masters → 30-Day SOP Funnel → Add SOP Step saves the step to the
 * workspace's outreach playbook (API stubbed; the screen is the real one).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STEPS = [1, 5, 10].map((day) => ({
  id: `default-day-${day}`, day_number: day, day_offset: day - 1, title: `Day ${day} step`, goal: 'Goal', channels: ['WHATSAPP'],
  timing_guide: '', role_note: '', templates: { whatsapp: { message: 'Hi {{First Name}}' } }, is_active: true,
}));

it('adds a step with its day, channels and messages', async () => {
  const posts: { url: string; body: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ success: true, data: {}, message: 'Day 15 step added to the outreach playbook' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      const data = url.endsWith('/masters/sop-steps') ? STEPS : [];
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
  const type = (el: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

  act(() => button('30-Day SOP Funnel').click());
  expect(button('Add SOP Step')).toBeDefined();
  act(() => button('Add SOP Step').click());

  const day = container.querySelector('input[type=number][min="1"]') as HTMLInputElement;
  type(day, '12');
  // The offset follows the day; it is not a separate setting.
  expect((container.querySelector('#sop-day-offset') as HTMLInputElement).value).toBe('11');
  expect((container.querySelector('#sop-day-offset') as HTMLInputElement).readOnly).toBe(true);
  // Every playbook step runs, so the dropdown on/off switch is not offered.
  expect(container.textContent).not.toContain('Active in CRM Dropdowns');

  type(container.querySelector('input[placeholder="e.g. Triple Platform Launch, Free Audit Offer"]') as HTMLInputElement, 'Pricing follow-up');
  type(container.querySelector('input[placeholder="e.g. Build Trust, Deliver Value, Discovery Qualification"]') as HTMLInputElement, 'Share pricing');
  await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

  expect(posts).toHaveLength(1);
  expect(posts[0].url).toBe('/api/v1/crm/masters/sop-steps');
  expect(posts[0].body).toMatchObject({
    day_number: 12,
    title: 'Pricing follow-up',
    goal: 'Share pricing',
    channels: ['WHATSAPP', 'EMAIL'],
    templates: { whatsapp: { message: expect.stringContaining('{{First Name}}') } },
  });
  // The dialog closes once the server has saved it.
  expect(container.querySelector('form')).toBeNull();

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
