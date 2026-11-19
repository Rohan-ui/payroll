import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetList, EmployeeAsset } from '../../api/assets.api';

/**
 * Company assets (API stubbed): each team gives out only its own kinds, and a
 * return records what happened, with a recovery only for lost or damaged ones.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { AssetsPanel } = await import('./AssetsPanel');

const laptop: EmployeeAsset = {
  id: 'a1', category: 'LAPTOP', team: 'IT', name: 'Dell Latitude 5440', tag: 'LT-0042', assignedDate: '2025-02-01', returnDueDate: '2025-03-01', status: 'ISSUED',
  returnDate: null, condition: null, recoveryAmount: null, remarks: null, assignedBy: 'Ivan', returnRecordedBy: null, returnRecordedAt: null, canManage: true,
};
const card: EmployeeAsset = { ...laptop, id: 'a2', category: 'ID_CARD', team: 'ADMIN', name: 'Employee ID card', tag: null, returnDueDate: null, canManage: false, status: 'LOST', returnDate: '2025-04-01', recoveryAmount: '500.00', returnRecordedBy: 'Owner' };

let calls: { method: string; path: string; body: unknown }[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const list = (items: EmployeeAsset[]): AssetList => ({ items, canAssign: { IT: true, ADMIN: false }, employeeActive: true });

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/employees/e1/assets/a1/return') return json({ success: true, data: list([{ ...laptop, status: 'RETURNED', condition: 'DAMAGED', returnDate: '2025-04-02', recoveryAmount: '1200.50', returnRecordedBy: 'Ivan' }, card]) });
    if (path === '/employees/e1/assets' && method === 'POST') return json({ success: true, data: list([laptop, card]) }, 201);
    return json({ message: 'Not stubbed' }, 404);
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const settle = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const render = async (node: React.ReactNode) => { await act(async () => root.render(node)); await settle(); };
const button = (text: RegExp) => [...document.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLButtonElement;
const labelled = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };
const type = async (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  await act(async () => { setter?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('Company assets', () => {
  it('shows what each asset is and what happened to it, with actions only for the team that looks after it', async () => {
    await render(<AssetsPanel employeeId="e1" load={async () => list([laptop, card])} />);
    expect(container.textContent).toContain('1 with the employee');
    expect(container.textContent).toContain('Laptop · Dell Latitude 5440 · LT-0042');
    expect(container.textContent).toMatch(/Overdue · Due back/);
    expect(container.textContent).toMatch(/Reported lost .* to recover · by Owner/);
    expect(labelled('Record return: Dell Latitude 5440')).not.toBeNull();
    expect(labelled('Reopen: Employee ID card')).toBeNull();
  });

  it('offers only the kinds the member’s team gives out', async () => {
    await render(<AssetsPanel employeeId="e1" load={async () => list([])} />);
    expect(container.textContent).toContain('No company assets recorded');
    await click(button(/^Give an asset$/));
    const options = [...document.querySelectorAll('[role="dialog"] select option')].map((o) => o.textContent);
    expect(options).toEqual(['Laptop', 'Desktop', 'Monitor', 'Mobile phone', 'SIM card']);
    await type(document.querySelector('[role="dialog"] input[placeholder="Dell Latitude 5440"]') as HTMLInputElement, 'MacBook Air');
    await click(button(/^Record asset$/));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/employees/e1/assets', body: { category: 'LAPTOP', name: 'MacBook Air' } });
  });

  it('records a damaged return with what the employee pays, refusing an amount that isn’t rupees', async () => {
    await render(<AssetsPanel employeeId="e1" load={async () => list([laptop])} />);
    await click(labelled('Record return: Dell Latitude 5440') as HTMLButtonElement);
    const damaged = [...document.querySelectorAll('[role="dialog"] label')].find((l) => l.textContent === 'Returned damaged')?.querySelector('input') as HTMLInputElement;
    await click(damaged);
    const amount = document.querySelector('[role="dialog"] input[inputmode="decimal"]') as HTMLInputElement;
    await type(amount, '12.345');
    expect(button(/^Record$/).disabled).toBe(true);
    expect(document.body.textContent).toContain('Give an amount in rupees');
    await type(amount, '1200.50');
    await click(button(/^Record$/));
    expect(calls.find((c) => c.path === '/employees/e1/assets/a1/return')).toMatchObject({ method: 'PUT', body: { status: 'RETURNED', condition: 'DAMAGED', recoveryAmount: '1200.50' } });
    expect(container.textContent).toMatch(/Returned damaged .* to recover · by Ivan/);
  });
});
