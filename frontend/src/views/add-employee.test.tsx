import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The add-employee form: every field is named by its label (so screen
 * readers announce it), and the page uses the shared header.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/PayrollContext', () => ({
  usePayroll: () => ({ setCurrentView: vi.fn(), addEmployee: vi.fn(), refreshData: vi.fn(), employees: [], departments: [], designations: [] }),
}));
const { AddEmployeeView } = await import('./AddEmployeeView');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Add employee', () => {
  it('names every field by its label', async () => {
    await act(async () => root.render(<AddEmployeeView />));
    expect(container.querySelector('h1')?.textContent).toBe('Add employee');
    const fields = [...container.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')];
    expect(fields.length).toBeGreaterThan(5);
    const labelled = new Set([...container.querySelectorAll('label')].map((l) => (l as HTMLLabelElement).htmlFor).filter(Boolean));
    const unnamed = fields.filter((f) => !(f.id && labelled.has(f.id)) && !f.getAttribute('aria-label'));
    expect(unnamed.map((f) => f.outerHTML.slice(0, 80))).toEqual([]);
    expect([...container.querySelectorAll('label')].find((l) => (l as HTMLLabelElement).htmlFor.endsWith('-f2'))?.textContent).toContain('Full Name');
  });
});
