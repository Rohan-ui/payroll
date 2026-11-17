import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exit documents (API stubbed): what each document is and whether it is
 * issued, what the records lack, and only the steps a permission allows;
 * letters wait for the exit to be complete.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { ExitDocumentsPanel } = await import('./ExitDocumentsPanel');

const TYPES = [{ type: 'EXPERIENCE_LETTER', label: 'Experience letter' }, { type: 'RELIEVING_LETTER', label: 'Relieving letter' }, { type: 'FULL_AND_FINAL_STATEMENT', label: 'Full and final statement' }];
const experience = (extra: Record<string, unknown> = {}) => ({ id: 'd1', type: 'EXPERIENCE_LETTER', label: 'Experience letter', title: 'Sneha - Experience letter', status: 'DRAFT', version: 2, generatedBy: 'Priya', generatedAt: '2025-09-01T05:00:00.000Z', missing: [], ...extra });

let documents: Record<string, unknown>[];
let calls: { method: string; path: string; body: unknown }[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  documents = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'POST' && path.endsWith('/documents')) documents = [experience({ version: 1 })];
    return json({ success: true, data: { documents, templates: [{ id: 't1', name: 'Formal experience letter', kind: 'EXPERIENCE_LETTER' }], types: TYPES } });
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
const render = async (isCompleted = false) => { await act(async () => root.render(<ExitDocumentsPanel separationId="s1" employeeName="Sneha Patil" isCompleted={isCompleted} />)); await settle(); };
const buttons = (text: RegExp) => [...document.querySelectorAll('button')].filter((b) => text.test(b.textContent ?? '')) as HTMLButtonElement[];
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };

describe('exit documents', () => {
  it('generates a draft with the chosen template', async () => {
    granted = new Set(['offboarding.view', 'offboarding.documents.manage']);
    await render();
    expect(container.textContent).toContain('Not generated yet.');
    const select = document.getElementById('exit-doc-template-EXPERIENCE_LETTER') as HTMLSelectElement;
    await act(async () => { select.value = 't1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(buttons(/^Generate$/)[0]);
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/offboarding/separations/s1/documents', body: { documentType: 'EXPERIENCE_LETTER', templateId: 't1' } });
    expect(container.textContent).toContain('Version 1');
  });

  it('says what the records lack and holds back issuing until it is fixed', async () => {
    granted = new Set(['offboarding.view', 'offboarding.documents.manage', 'offboarding.documents.issue']);
    documents = [experience({ missing: ['department'] })];
    await render(true);
    expect(container.textContent).toContain('Missing from the records: department');
    expect(buttons(/Issue…/)[0].disabled).toBe(true);
  });

  it('issues letters only once the exit is complete, with a specific confirmation', async () => {
    granted = new Set(['offboarding.view', 'offboarding.documents.issue']);
    documents = [experience()];
    await render(false);
    expect(buttons(/^Regenerate$/)).toHaveLength(0);
    expect(buttons(/Issue…/)[0].disabled).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(true);
    await click(buttons(/Issue…/)[0]);
    expect(document.body.textContent).toContain('Issue Sneha Patil’s experience letter?');
  });

  it('shows an issued document without ways to change it', async () => {
    granted = new Set(['offboarding.view', 'offboarding.documents.manage', 'offboarding.documents.issue']);
    documents = [experience({ status: 'ISSUED' })];
    await render(true);
    expect(container.textContent).toContain('Issued');
    expect(buttons(/^Regenerate$/)).toHaveLength(0);
    expect(buttons(/Issue…/)).toHaveLength(0);
    expect(buttons(/^Preview$/)).toHaveLength(1);
  });
});
