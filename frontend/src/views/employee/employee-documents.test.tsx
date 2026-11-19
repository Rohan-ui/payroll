import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The employee Documents tab (API stubbed): statuses read clearly (expired
 * wins), upload sends the file with its details, review and removal need a
 * reason where it matters, and controls follow the permissions.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { DocumentsTab } = await import('./DocumentsTab');

const doc = (extra: Record<string, unknown>) => ({
  id: 'd1', category: 'IDENTITY', title: 'Passport', description: null, issuedOn: null, expiresOn: null, status: 'PENDING_VERIFICATION', isExpired: false,
  rejectionReason: null, reviewedAt: null, reviewedBy: null, uploadedAt: '2026-11-01T10:00:00.000Z', uploadedBy: 'Priya', filename: 'passport.pdf',
  contentType: 'application/pdf', sizeBytes: 204800, ...extra,
});

let documents: ReturnType<typeof doc>[];
let calls: { path: string; method: string; body: unknown }[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  granted = new Set(['people.view', 'people.documents.manage', 'people.documents.verify']);
  documents = [doc({}), doc({ id: 'd2', title: 'Visa', expiresOn: '2025-01-01', isExpired: true, status: 'VERIFIED', reviewedAt: '2025-01-02T00:00:00.000Z', reviewedBy: 'Ravi' })];
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    const body = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, v instanceof File ? `file:${v.name}` : v])) : typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ path, method, body });
    if (path === '/employees/e1/documents' && method === 'GET') return json({ success: true, data: documents });
    if (path === '/employees/e1/documents' && method === 'POST') {
      documents = [doc({ id: 'd3', title: 'Degree', category: 'EDUCATION' }), ...documents];
      return json({ success: true, data: documents }, 201);
    }
    if (path === '/employees/e1/documents/d1/verify') {
      documents = documents.map((d) => (d.id === 'd1' ? { ...d, status: 'VERIFIED', reviewedAt: '2026-11-16T00:00:00.000Z', reviewedBy: 'You' } : d));
      return json({ success: true, data: documents });
    }
    if (path === '/employees/e1/documents/d1/remove') {
      documents = documents.filter((d) => d.id !== 'd1');
      return json({ success: true, data: documents });
    }
    return json({ message: `Unexpected ${method} ${path}` }, 404);
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

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const render = async () => { await act(async () => root.render(<DocumentsTab employeeId="e1" employeeName="Asha Rao" onChanged={() => undefined} />)); await settle(); };
const buttons = () => [...document.querySelectorAll('button')];
const button = (text: string) => buttons().find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement | undefined) => { await act(async () => el!.click()); await settle(); };
const row = (title: string) => [...document.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes(title)) as HTMLElement;
const inDialog = (label: string) => {
  const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => x.textContent?.trim().startsWith(label));
  return document.getElementById(l?.getAttribute('for') ?? '') as HTMLInputElement;
};
const setValue = async (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
});
const submit = async (text: string) => click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === text) as HTMLButtonElement);

describe('employee documents', () => {
  it('lists documents with clear statuses, an expired one marked expired', async () => {
    await render();
    expect(row('Passport').textContent).toContain('Pending verification');
    expect(row('Passport').textContent).toContain('Identity document');
    expect(row('Passport').textContent).toContain('200 KB');
    expect(row('Visa').textContent).toContain('Expired');
    expect(row('Visa').textContent).toContain('by Ravi');
    expect(document.body.textContent).toContain('1 waiting for verification · 1 expired');
  });

  it('uploads a file with its category and title', async () => {
    await render();
    await click(button('Upload document'));
    await submit('Upload');
    expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toBe('Choose a file to upload.');

    const input = inDialog('File');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [new File(['%PDF-1.4'], 'degree.pdf', { type: 'application/pdf' })], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await setValue(inDialog('Category') as unknown as HTMLSelectElement, 'EDUCATION');
    expect(inDialog('Title').value).toBe('degree');
    await setValue(inDialog('Title'), 'Degree');
    await submit('Upload');
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ file: 'file:degree.pdf', category: 'EDUCATION', title: 'Degree' });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(row('Degree')).toBeDefined();
  });

  it('refuses a file of the wrong type before sending it', async () => {
    await render();
    await click(button('Upload document'));
    const input = inDialog('File');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toBe('Upload a PDF, JPG or PNG file.');
  });

  it('verifies, and removes only with a reason after confirming', async () => {
    await render();
    await click(row('Passport').querySelector('button:not([aria-label])') as HTMLButtonElement);
    expect(calls.some((c) => c.path.endsWith('/d1/verify'))).toBe(true);
    expect(row('Passport').textContent).toContain('Verified');

    await click([...row('Passport').querySelectorAll('button')].find((b) => b.textContent === 'Remove'));
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Remove Passport from Asha Rao’s documents?');
    await submit('Remove document');
    expect(calls.some((c) => c.path.endsWith('/remove'))).toBe(false);
    await setValue(inDialog('Reason'), 'Wrong employee');
    await submit('Remove document');
    expect(calls.find((c) => c.path.endsWith('/remove'))?.body).toEqual({ reason: 'Wrong employee' });
    expect(row('Passport')).toBeUndefined();
  });

  it('shows only viewing to people who may not manage or review', async () => {
    granted = new Set(['people.view']);
    await render();
    expect(button('Upload document')).toBeUndefined();
    expect(button('Verify')).toBeUndefined();
    expect(button('Remove')).toBeUndefined();
    expect(button('View Passport')).toBeDefined();
    expect(button('Download Passport')).toBeDefined();
  });

  it('says when nothing is on file yet', async () => {
    documents = [];
    await render();
    expect(document.body.textContent).toContain('No documents on file');
  });
});
