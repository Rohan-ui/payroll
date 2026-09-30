import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Candidates' documents through the real screens (API stubbed): HR asks for
 * documents, uploads, views, verifies and rejects them, each action shown only
 * to those allowed; the candidate uploads through their own link.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import('../../test-support/fakePdfjs').fakePdfjs> | null }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: async () => fake.current!.module }));
const { fakePdfjs } = await import('../../test-support/fakePdfjs');

const { CandidateDocuments, fileProblem } = await import('./CandidateDocuments');
const { CandidateDetailView } = await import('./CandidateDetailView');
const { PublicDocumentsView } = await import('../public/PublicDocumentsView');
const { OnboardingView } = await import('./OnboardingView');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const file = (id: string, version: number, reviewStatus: string, extra: Record<string, unknown> = {}) => ({
  id, version, filename: `pan-v${version}.pdf`, contentType: 'application/pdf', sizeBytes: 250_000, uploadedVia: 'CANDIDATE', uploadedBy: 'The candidate',
  uploadedAt: '2026-09-30T08:00:00Z', reviewStatus, reviewedBy: null, reviewedAt: null, rejectionReason: null, ...extra,
});
const DOCUMENTS = {
  candidateStatus: 'VERIFICATION', canChange: true, canSendLink: true, link: { sentAt: '2026-09-29T10:00:00Z', expiresAt: '2026-10-29T10:00:00Z' },
  counts: { required: 2, verified: 0, toReview: 1 },
  types: [{ type: 'PAN_CARD', label: 'PAN card' }, { type: 'AADHAAR_CARD', label: 'Aadhaar card' }, { type: 'OTHER', label: 'Other document' }],
  requests: [
    { id: 'r1', type: 'PAN_CARD', label: 'PAN card', isRequired: true, state: 'PENDING_REVIEW', createdAt: '', files: [file('f2', 2, 'PENDING_REVIEW'), file('f1', 1, 'REJECTED', { rejectionReason: 'Blurred' })] },
    { id: 'r2', type: 'AADHAAR_CARD', label: 'Aadhaar card', isRequired: true, state: 'MISSING', createdAt: '', files: [] },
  ],
};
const CANDIDATE = {
  id: 'c1', candidateCode: 'CAN-2026-100001', fullName: 'Arjun Mehta', email: 'arjun@candidate.test', phone: null, appliedPosition: 'Accountant', departmentId: null, departmentName: null,
  hiringSource: null, expectedSalary: null, experienceYears: null, expectedJoiningDate: null, recruiterMemberId: null, recruiterName: null, status: 'VERIFICATION', archivedAt: null,
  createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', designationId: null, designationName: null, employmentTypeId: null, employmentTypeName: null, address: null, notes: null,
  employeeId: null, manualMoves: ['WITHDRAWN'], timeline: [], interviews: [], offers: [],
};
const PUBLIC = {
  companyName: 'Acme Pvt Ltd', candidateName: 'Arjun Mehta', linkExpiresAt: '2026-10-29T10:00:00Z', maxFileBytes: 10 * 1024 * 1024,
  requests: [
    { id: 'r1', label: 'PAN card', isRequired: true, state: 'REJECTED', canUpload: true, lastFilename: 'pan.jpg', lastUploadedAt: '2026-09-30T08:00:00Z', rejectionReason: 'The number is unreadable.' },
    { id: 'r2', label: 'Aadhaar card', isRequired: true, state: 'VERIFIED', canUpload: false, lastFilename: 'aadhaar.pdf', lastUploadedAt: '2026-09-30T08:00:00Z', rejectionReason: null },
  ],
};
const TOKEN = 'a'.repeat(43);
const SUMMARY = {
  timezone: 'UTC', today: '2026-09-30', totalCandidates: 1,
  byStatus: { NEW: 0, SCREENING: 0, INTERVIEW_SCHEDULED: 0, INTERVIEW_COMPLETED: 0, SELECTED: 0, REJECTED: 0, OFFER_SENT: 0, OFFER_ACCEPTED: 0, OFFER_DECLINED: 0, DOCUMENT_COLLECTION: 0, VERIFICATION: 1, READY_TO_JOIN: 0, JOINED: 0, WITHDRAWN: 0 },
  interviewsToday: 0, interviewsAwaitingDecision: 0, myFeedbackDue: 0, joiningSoon: { count: 0, from: '2026-09-30', to: '2026-10-30' },
  offersAwaitingApproval: 0, myApprovalsDue: 0, offersAwaitingResponse: 0, candidatesWithDocumentsToVerify: 1,
};

let calls: { url: string; method: string; body: unknown; credentials?: RequestCredentials }[] = [];
let publicFails = false;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['onboarding.view', 'onboarding.documents.view', 'onboarding.documents.manage', 'onboarding.documents.verify']);
  calls = [];
  publicFails = false;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:document'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null;
      calls.push({ url, method, body, credentials: init.credentials });
      if (url.startsWith('/api/v1/public/candidate-documents/')) {
        if (publicFails) return json({ success: false, message: 'This upload link has expired. Ask the company to send you a new one.' }, 404);
        if (method === 'POST') return json({ success: true, data: { ...PUBLIC, requests: [{ ...PUBLIC.requests[0], state: 'PENDING_REVIEW', rejectionReason: null }, PUBLIC.requests[1]] } }, 201);
        return json({ success: true, data: PUBLIC });
      }
      if (url === '/api/v1/onboarding/candidates/c1') return json({ success: true, data: CANDIDATE });
      if (url.startsWith('/api/v1/onboarding/dashboard')) return json({ success: true, data: SUMMARY });
      if (url === '/api/v1/onboarding/meta') return json({ success: true, data: { departments: [], designations: [], employmentTypes: [], members: [] } });
      if (url.startsWith('/api/v1/onboarding/candidates?')) return json({ success: true, data: [CANDIDATE], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
      if (url === '/api/v1/onboarding/candidates/c1/documents/files/f2') return new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
      if (url.endsWith('/verify')) return json({ success: true, data: { documents: DOCUMENTS, notifications: [] } });
      if (url.endsWith('/reject')) return json({ success: true, data: { documents: DOCUMENTS, notifications: [{ recipient: 'arjun@candidate.test', status: 'SENT', duplicate: false, error: null }] } });
      if (url.endsWith('/documents/link')) return json({ success: true, data: { documents: DOCUMENTS, notifications: [{ recipient: 'arjun@candidate.test', status: 'SENT', duplicate: false, error: null }] } });
      if (url.includes('/documents')) return json({ success: true, data: DOCUMENTS }, method === 'POST' ? 201 : 200);
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

const settle = (ms = 0) => act(async () => { if (ms) await new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const byAria = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const choose = (input: HTMLInputElement, chosen: File) =>
  act(async () => {
    Object.defineProperty(input, 'files', { value: [chosen], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
const pdf = (name = 'pan.pdf', size = 1000) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

describe('choosing a file', () => {
  it('refuses the wrong kind of file, an empty one and one over 10 MB before sending it', () => {
    expect(fileProblem(pdf())).toBeNull();
    expect(fileProblem(new File(['x'], 'photo.JPG', { type: '' }))).toBeNull();
    expect(fileProblem(new File(['x'], 'notes.docx', { type: 'application/msword' }))).toBe('Choose a PDF, JPG or PNG file.');
    expect(fileProblem(pdf('empty.pdf', 0))).toBe('That file is empty.');
    expect(fileProblem(pdf('big.pdf', 10 * 1024 * 1024 + 1))).toBe('That file is 10.0 MB. Files can be up to 10 MB.');
  });
});

describe('documents on the candidate page', () => {
  it('opens the candidates with documents to verify from the dashboard', async () => {
    await act(async () => root.render(<OnboardingView />));
    await settle();
    act(() => button('Documents to verify')?.click());
    await settle();
    expect(calls.some((c) => c.url.startsWith('/api/v1/onboarding/candidates?') && c.url.includes('documents=to_verify'))).toBe(true);
    expect(container.textContent).toContain('With documents to verify.');
  });

  it('appears only for members who may see documents', async () => {
    granted = new Set(['onboarding.view']);
    await act(async () => root.render(<CandidateDetailView candidateId="c1" meta={null} onBack={() => undefined} onEdit={() => undefined} onOpenOffer={() => undefined} onCreateOffer={() => undefined} />));
    await settle();
    expect(container.textContent).toContain('Arjun Mehta');
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).not.toContain('Documents');
    expect(calls.some((c) => c.url.includes('/documents'))).toBe(false);
  });

  it('shows each document with its state, the link and earlier uploads', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Arjun Mehta" onChanged={() => undefined} />));
    await settle();
    expect(container.textContent).toContain('0 of 2 required verified · 1 to verify');
    expect(container.textContent).toContain('Upload link sent');
    expect(container.textContent).toContain('pan-v2.pdf · 244 KB · uploaded by The candidate');
    expect(container.textContent).toContain('Earlier uploads (1)');
    expect(container.textContent).toContain('(Rejected: Blurred)');
    expect(byAria('Verify PAN card')).not.toBeNull();
    expect(byAria('Remove Aadhaar card from the list')).not.toBeNull();
    expect(byAria('Remove PAN card from the list')).toBeNull();
    expect(button('Send a new upload link')).toBeDefined();
  });

  it('hides actions the member may not take', async () => {
    granted = new Set(['onboarding.view', 'onboarding.documents.view']);
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Arjun Mehta" onChanged={() => undefined} />));
    await settle();
    expect(byAria('View PAN card')).not.toBeNull();
    expect(byAria('Verify PAN card')).toBeNull();
    expect(byAria('Reject PAN card')).toBeNull();
    expect(container.querySelector('input[type=file]')).toBeNull();
    expect(button('Ask for documents')).toBeUndefined();
    expect(button('Send a new upload link')).toBeUndefined();
  });

  it('uploads a chosen file, and refuses one that is too large without sending it', async () => {
    const onChanged = vi.fn();
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Arjun Mehta" onChanged={onChanged} />));
    await settle();
    const input = container.querySelector('input[aria-label="Upload: Aadhaar card"]') as HTMLInputElement;
    await choose(input, pdf('big.pdf', 10 * 1024 * 1024 + 1));
    expect(container.querySelector('[role=alert]')?.textContent).toBe('That file is 10.0 MB. Files can be up to 10 MB.');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await choose(input, pdf('aadhaar.pdf'));
    await settle();
    const sent = calls.find((c) => c.url === '/api/v1/onboarding/candidates/c1/documents/r2/files');
    expect(sent?.method).toBe('POST');
    expect((sent?.body as FormData).get('file')).toBeInstanceOf(File);
    expect(onChanged).toHaveBeenCalled();
  });

  it('opens a file inside the app with the session, not from a public address', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Arjun Mehta" onChanged={() => undefined} />));
    await settle();
    fake.current = fakePdfjs(2);
    act(() => byAria('View PAN card')?.click());
    await settle(20);
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toBe('PAN card');
    expect(dialog.textContent).toContain('pan-v2.pdf · version 2 · To verify');
    // The full PDF viewer, drawn by pdf.js from the fetched bytes: no frame, which the security policy forbids.
    expect(dialog.querySelector('iframe')).toBeNull();
    expect(dialog.querySelector('[aria-label="Zoom in"]')).not.toBeNull();
    expect(dialog.querySelectorAll('[data-page]')).toHaveLength(2);
    expect(fake.current.getDocument.mock.calls[0][0].data).toHaveLength(8);
    expect([...dialog.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Download')).toBe(true);
    expect(calls.some((c) => c.url === '/api/v1/onboarding/candidates/c1/documents/files/f2')).toBe(true);
  });

  it('verifies, and rejects only with a reason in a specific confirmation', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Arjun Mehta" onChanged={() => undefined} />));
    await settle();
    await act(async () => byAria('Verify PAN card')?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/files/f2/verify'))?.method).toBe('POST');

    act(() => byAria('Reject PAN card')?.click());
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toBe('Reject Arjun Mehta’s PAN card?');
    expect(dialog.textContent).toContain('The candidate is emailed the reason');
    await act(async () => button('Reject PAN card', dialog)?.click());
    expect(dialog.querySelector('[role=alert]')?.textContent).toBe('Say why the document is not accepted, so the candidate can fix it.');
    const reason = dialog.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(reason, 'The number is unreadable.');
      reason.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Reject PAN card', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/files/f2/reject'))?.body).toEqual({ reason: 'The number is unreadable.' });
    expect(container.querySelector('[role=status]')?.textContent).toContain('Email sent to 1 recipient.');
  });

  it('asks for new documents, skipping ones already asked for', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Arjun Mehta" onChanged={() => undefined} />));
    await settle();
    act(() => button('Ask for documents')?.click());
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    const boxes = [...dialog.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.every((b) => b.disabled)).toBe(true);
    expect(dialog.textContent).toContain('PAN card (already asked for)');
    const other = dialog.querySelector('input:not([type])') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(other, 'Class 12 marksheet');
      other.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Ask for these', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.url === '/api/v1/onboarding/candidates/c1/documents' && c.method === 'POST')?.body).toEqual({ items: [{ type: 'OTHER', label: 'Class 12 marksheet', isRequired: true }] });
  });

  it('sends a new upload link after saying the old one stops working', async () => {
    const onChanged = vi.fn();
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Arjun Mehta" onChanged={onChanged} />));
    await settle();
    act(() => button('Send a new upload link')?.click());
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toBe('Send Arjun Mehta a new upload link?');
    expect(dialog.textContent).toContain('The link sent earlier will stop working');
    await act(async () => button('Send new link', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/c1/documents/link'))?.method).toBe('POST');
    expect(onChanged).toHaveBeenCalled();
  });
});

describe("the candidate's upload page", () => {
  it('shows what is asked, why a document was not accepted, and uploads without a session', async () => {
    await act(async () => root.render(<PublicDocumentsView token={TOKEN} />));
    await settle();
    expect(container.textContent).toContain('Acme Pvt Ltd');
    expect(container.textContent).toContain('1 required document is still needed.');
    expect(container.textContent).toContain('Why it was not accepted: The number is unreadable.');
    expect(container.querySelectorAll('input[type=file]')).toHaveLength(1);
    expect(document.querySelector('meta[name=referrer]')?.getAttribute('content')).toBe('no-referrer');

    await choose(container.querySelector('input[type=file]') as HTMLInputElement, new File([new Uint8Array(10)], 'pan.jpg', { type: 'image/jpeg' }));
    await settle();
    const sent = calls.find((c) => c.method === 'POST');
    expect(sent?.url).toBe(`/api/v1/public/candidate-documents/${TOKEN}/requests/r1/file`);
    expect(sent?.credentials).toBe('omit');
    expect(container.textContent).toContain('PAN card uploaded. We will check it');
    expect(container.textContent).toContain('every required document is uploaded');
  });

  it('explains a link that no longer works', async () => {
    publicFails = true;
    await act(async () => root.render(<PublicDocumentsView token={TOKEN} />));
    await settle();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('This upload link has expired. Ask the company to send you a new one.');
  });
});
