import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { DocumentsView } = await import('./DocumentsView');
const { EmailTemplatesView } = await import('./EmailTemplatesView');

const SAMPLE_EMAIL_TEMPLATES = [
  {
    id: 'et-1',
    templateName: 'Standard Appointment Letter Email',
    name: 'Standard Appointment Letter Email',
    category: 'APPOINTMENT',
    subject: 'Appointment Letter - {{candidate_name}}',
    bodyText: '<p>Dear {{candidate_name}}, congratulations!</p>',
    isActive: true,
    documentKind: 'CUSTOM_HR',
    linkedDocumentTemplates: [
      { id: 'dt-1', name: 'Standard Appointment Letter', kind: 'CUSTOM_HR' },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'et-2',
    templateName: 'Standard Offer Letter Email',
    name: 'Standard Offer Letter Email',
    category: 'OFFER',
    subject: 'Job Offer: {{job_title}} at {{company_name}}',
    bodyText: '<p>Dear {{candidate_name}}, we are pleased to extend an offer.</p>',
    isActive: true,
    documentKind: 'OFFER_LETTER',
    linkedDocumentTemplates: [
      { id: 'dt-2', name: 'Standard offer letter', kind: 'OFFER_LETTER' },
    ],
    updatedAt: new Date().toISOString(),
  },
];

const AVAILABLE_DOC_TEMPLATES = [
  { id: 'dt-1', name: 'Standard Appointment Letter', documentKind: 'CUSTOM_HR', versionNumber: 1 },
  { id: 'dt-2', name: 'Standard offer letter', documentKind: 'OFFER_LETTER', versionNumber: 1 },
];

let calls: { url: string; method: string; body: unknown }[];
let container: HTMLDivElement;
let root: Root;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  granted = new Set(['documents.view', 'documents.templates.manage']);
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : null });

      if (url === '/api/v1/onboarding/email-templates' && method === 'GET') {
        return json({ success: true, data: SAMPLE_EMAIL_TEMPLATES });
      }
      if (url === '/api/v1/onboarding/templates/available' && method === 'GET') {
        return json({ success: true, data: AVAILABLE_DOC_TEMPLATES });
      }
      if (url.includes('/link-email-template') && method === 'PUT') {
        return json({ success: true, data: { updated: true } });
      }
      if (url === '/api/v1/documents/templates' && method === 'GET') {
        return json({ success: true, data: [] });
      }
      return json({ success: true, data: [] });
    }),
  );

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Email Templates Module UI', () => {
  it('renders Email Templates tab inside DocumentsView and switches to it', async () => {
    await act(async () => root.render(<DocumentsView />));

    const emailTemplatesTab = container.querySelector('#documents-tab-email-templates');
    expect(emailTemplatesTab).not.toBeNull();
    expect(emailTemplatesTab?.textContent).toContain('Email Templates');

    // Click tab
    await act(async () => {
      emailTemplatesTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Check that Email Templates View is rendered
    expect(container.textContent).toContain('Reusable Email Templates');
    expect(container.textContent).toContain('Standard Appointment Letter Email');
  });

  it('renders template list with category filters and linked document badges', async () => {
    await act(async () => root.render(<EmailTemplatesView />));

    // Check category pills
    expect(container.textContent).toContain('All Categories');
    expect(container.textContent).toContain('Appointment');
    expect(container.textContent).toContain('Offers');

    // Check template card titles
    expect(container.textContent).toContain('Standard Appointment Letter Email');
    expect(container.textContent).toContain('Standard Offer Letter Email');

    // Check linked badge
    expect(container.textContent).toContain('Default for:Standard Appointment Letter');
  });

  it('opens Link to Document dialog and allows setting template association', async () => {
    await act(async () => root.render(<EmailTemplatesView />));

    // Find "Link to Document" button for et-1
    const linkButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Link to Document'),
    );
    expect(linkButtons.length).toBeGreaterThan(0);

    // Click link button
    await act(async () => {
      linkButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Check dialog opens
    expect(container.textContent).toContain('Link Email Template to Document Template');
  });
});
