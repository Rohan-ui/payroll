import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import('../../test-support/fakePdfjs').fakePdfjs> | null }));
vi.mock('../../lib/pdfjs', () => ({ loadPdfjs: async () => fake.current!.module }));

const { CandidateDocuments } = await import('./CandidateDocuments');
const { PublicDocumentsView } = await import('../public/PublicDocumentsView');
const { DocumentTypesMaster } = await import('../settings/DocumentTypesMaster');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const file = (id: string, version: number, reviewStatus: string, slotName?: string, extra: Record<string, unknown> = {}) => ({
  id,
  version,
  filename: `${slotName ? slotName.toLowerCase().replace(/\s+/g, '_') : 'file'}-v${version}.jpg`,
  contentType: 'image/jpeg',
  sizeBytes: 300_000,
  uploadedVia: 'CANDIDATE',
  uploadedBy: 'The candidate',
  uploadedAt: '2026-09-30T08:00:00Z',
  reviewStatus,
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null,
  slotName: slotName ?? null,
  ...extra,
});

const SLOTTED_DOCUMENTS = {
  candidateStatus: 'VERIFICATION',
  canChange: true,
  canSendLink: true,
  link: { sentAt: '2026-09-29T10:00:00Z', expiresAt: '2026-10-29T10:00:00Z' },
  counts: { required: 2, verified: 0, toReview: 2 },
  types: [
    { type: 'AADHAAR_CARD', label: 'Aadhaar Card', minFiles: 2, maxFiles: 2, slots: ['Front Side', 'Back Side'] },
    { type: 'EDUCATION_CERTIFICATE', label: 'Education Certificate', minFiles: 1, maxFiles: 5, slots: null },
  ],
  requests: [
    {
      id: 'req_aadhaar',
      type: 'AADHAAR_CARD',
      label: 'Aadhaar Card',
      isRequired: true,
      minFiles: 2,
      maxFiles: 2,
      slots: ['Front Side', 'Back Side'],
      state: 'PENDING_REVIEW',
      status: 'PENDING_REVIEW',
      createdAt: '2026-09-30T00:00:00Z',
      activeFilesCount: 2,
      historicalCount: 0,
      slotsStatus: [
        { slotName: 'Front Side', isUploaded: true, file: file('file_front', 1, 'PENDING_REVIEW', 'Front Side') },
        { slotName: 'Back Side', isUploaded: true, file: file('file_back', 1, 'PENDING_REVIEW', 'Back Side') },
      ],
      files: [file('file_front', 1, 'PENDING_REVIEW', 'Front Side'), file('file_back', 1, 'PENDING_REVIEW', 'Back Side')],
    },
    {
      id: 'req_edu',
      type: 'EDUCATION_CERTIFICATE',
      label: 'Education Certificate',
      isRequired: true,
      minFiles: 1,
      maxFiles: 5,
      slots: null,
      state: 'PENDING_REVIEW',
      status: 'PENDING_REVIEW',
      createdAt: '2026-09-30T00:00:00Z',
      activeFilesCount: 2,
      historicalCount: 0,
      slotsStatus: null,
      files: [file('file_deg', 1, 'PENDING_REVIEW', undefined, { filename: 'degree.pdf' }), file('file_marks', 1, 'PENDING_REVIEW', undefined, { filename: 'marksheet.pdf' })],
    },
  ],
};

const PUBLIC_SLOTTED = {
  companyName: 'Acme Pvt Ltd',
  candidateName: 'Harshit Dhodi',
  linkExpiresAt: '2026-10-29T10:00:00Z',
  maxFileBytes: 10 * 1024 * 1024,
  requests: [
    {
      id: 'req_aadhaar',
      label: 'Aadhaar Card',
      isRequired: true,
      state: 'INCOMPLETE',
      canUpload: true,
      minFiles: 2,
      maxFiles: 2,
      slots: ['Front Side', 'Back Side'],
      slotsStatus: [
        {
          slotName: 'Front Side',
          isUploaded: true,
          file: {
            id: 'file_front',
            version: 1,
            filename: 'aadhaar_front.jpg',
            sizeBytes: 400000,
            reviewStatus: 'PENDING_REVIEW',
            uploadedAt: '2026-09-30T08:00:00Z',
            rejectionReason: null,
          },
        },
        {
          slotName: 'Back Side',
          isUploaded: false,
          file: null,
        },
      ],
      missingSlots: ['Back Side'],
      activeFilesCount: 1,
      allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileSizeBytes: 10485760,
      status: 'INCOMPLETE',
      lastFilename: 'aadhaar_front.jpg',
      lastUploadedAt: '2026-09-30T08:00:00Z',
      rejectionReason: null,
      activeFiles: [
        {
          id: 'file_front',
          version: 1,
          filename: 'aadhaar_front.jpg',
          sizeBytes: 400000,
          reviewStatus: 'PENDING_REVIEW',
          uploadedAt: '2026-09-30T08:00:00Z',
          rejectionReason: null,
          slotName: 'Front Side',
        },
      ],
    },
  ],
};

const DOCUMENT_TYPES_DATA = [
  {
    id: 'dt_aadhaar',
    code: 'AADHAAR_CARD',
    name: 'Aadhaar Card',
    description: 'Government photo identification with front and back sides',
    isRequired: true,
    minFiles: 2,
    maxFiles: 2,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10485760,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: true,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: ['Front Side', 'Back Side'],
    isActive: true,
    createdAt: '2026-10-30T00:00:00Z',
    updatedAt: '2026-10-30T00:00:00Z',
  },
  {
    id: 'dt_pan',
    code: 'PAN_CARD',
    name: 'PAN Card',
    description: 'Permanent Account Number card',
    isRequired: true,
    minFiles: 1,
    maxFiles: 1,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10485760,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: [],
    isActive: true,
    createdAt: '2026-10-30T00:00:00Z',
    updatedAt: '2026-10-30T00:00:00Z',
  },
];

let calls: { url: string; method: string; body: unknown }[] = [];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['onboarding.view', 'onboarding.documents.view', 'onboarding.documents.manage', 'onboarding.documents.verify']);
  calls = [];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:document'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null;
      calls.push({ url, method, body });

      if (url.includes('/document-types')) {
        if (method === 'POST') return json({ success: true, data: { id: 'dt_new', ...body } }, 201);
        if (method === 'PUT') return json({ success: true, data: { id: 'dt_aadhaar', ...body } });
        if (method === 'DELETE') return json({ success: true, data: { message: 'Document type removed' } });
        return json({ success: true, data: DOCUMENT_TYPES_DATA });
      }

      if (url.startsWith('/api/v1/public/candidate-documents/')) {
        if (method === 'POST') return json({ success: true, data: PUBLIC_SLOTTED }, 201);
        return json({ success: true, data: PUBLIC_SLOTTED });
      }

      if (url.endsWith('/verify')) return json({ success: true, data: { documents: SLOTTED_DOCUMENTS, notifications: [] } });
      if (url.endsWith('/reject')) return json({ success: true, data: { documents: SLOTTED_DOCUMENTS, notifications: [] } });
      if (url.includes('/files/') && method === 'DELETE') return json({ success: true, data: SLOTTED_DOCUMENTS });
      if (url.includes('/documents')) return json({ success: true, data: SLOTTED_DOCUMENTS }, method === 'POST' ? 201 : 200);

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

const settle = (ms = 0) =>
  act(async () => {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

const button = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const byAria = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;

describe('Multi-File & Slotted Document Verification in CandidateDocuments', () => {
  it('renders slotted document requirements (Aadhaar Front Side + Back Side) with independent slot cards', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Harshit Dhodi" onChanged={() => undefined} />));
    await settle();

    expect(container.textContent).toContain('Aadhaar Card');
    expect(container.textContent).toContain('Front Side');
    expect(container.textContent).toContain('Back Side');
    expect(container.textContent).toContain('Upload Slots (2 of 2)');
    expect(byAria('Verify Aadhaar Card Front Side')).not.toBeNull();
    expect(byAria('Verify Aadhaar Card Back Side')).not.toBeNull();
    expect(button('Verify Document')).toBeDefined();
    expect(button('Reject Document')).toBeDefined();
  });

  it('allows verifying an individual slot independently', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Harshit Dhodi" onChanged={() => undefined} />));
    await settle();

    await act(async () => byAria('Verify Aadhaar Card Front Side')?.click());
    await settle();

    const verifyCall = calls.find((c) => c.url.includes('/files/file_front/verify'));
    expect(verifyCall).toBeDefined();
    expect(verifyCall?.method).toBe('POST');
  });

  it('allows rejecting an individual slot file with a specific reason', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Harshit Dhodi" onChanged={() => undefined} />));
    await settle();

    act(() => byAria('Reject Aadhaar Card Back Side')?.click());
    await settle();

    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('h2')?.textContent).toContain('Reject Harshit Dhodi’s Aadhaar Card');

    const textarea = dialog.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'Back side image is cropped.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => button('Reject Aadhaar Card', dialog)?.click());
    await settle();

    const rejectCall = calls.find((c) => c.url.includes('/files/file_back/reject'));
    expect(rejectCall).toBeDefined();
    expect(rejectCall?.body).toEqual({ reason: 'Back side image is cropped.' });
  });

  it('supports document-level verification of the complete document requirement', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Harshit Dhodi" onChanged={() => undefined} />));
    await settle();

    const verifyDocBtn = button('Verify Document');
    expect(verifyDocBtn).toBeDefined();

    await act(async () => verifyDocBtn?.click());
    await settle();

    const docVerifyCall = calls.find((c) => c.url.includes('/documents/req_aadhaar/verify'));
    expect(docVerifyCall).toBeDefined();
    expect(docVerifyCall?.method).toBe('POST');
  });

  it('supports document-level rejection with feedback reason', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Harshit Dhodi" onChanged={() => undefined} />));
    await settle();

    const rejectDocBtn = button('Reject Document');
    expect(rejectDocBtn).toBeDefined();

    act(() => rejectDocBtn?.click());
    await settle();

    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('h2')?.textContent).toContain('Reject Harshit Dhodi’s Aadhaar Card?');

    const textarea = dialog.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'Both sides are illegible.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => button('Reject Aadhaar Card', dialog)?.click());
    await settle();

    const docRejectCall = calls.find((c) => c.url.includes('/documents/req_aadhaar/reject'));
    expect(docRejectCall).toBeDefined();
    expect(docRejectCall?.body).toEqual({ reason: 'Both sides are illegible.' });
  });

  it('allows removing an unverified file from generic multi-file document', async () => {
    await act(async () => root.render(<CandidateDocuments candidateId="c1" candidateName="Harshit Dhodi" onChanged={() => undefined} />));
    await settle();

    const removeBtn = byAria('Remove degree.pdf');
    expect(removeBtn).not.toBeNull();

    await act(async () => removeBtn?.click());
    await settle();

    const removeCall = calls.find((c) => c.url.includes('/documents/req_edu/files/file_deg'));
    expect(removeCall).toBeDefined();
    expect(removeCall?.method).toBe('DELETE');
  });
});

describe('Candidate Public Upload Portal for Multi-File & Slotted Documents', () => {
  it('displays slotted document requirements, showing uploaded vs missing slots and individual upload buttons', async () => {
    await act(async () => root.render(<PublicDocumentsView token="test_token" />));
    await settle();

    expect(container.textContent).toContain('Harshit Dhodi');
    expect(container.textContent).toContain('Aadhaar Card');
    expect(container.textContent).toContain('Front Side');
    expect(container.textContent).toContain('Back Side');
    expect(container.textContent).toContain('Missing');
    expect(container.textContent).toContain('Upload Back Side');
    expect(container.textContent).toContain('1 of 2 uploaded');
  });
});

describe('DocumentTypesMaster Settings Management', () => {
  it('renders configured document types and allows creating a new document type with dynamic upload limits', async () => {
    await act(async () => root.render(<DocumentTypesMaster />));
    await settle();

    expect(container.textContent).toContain('Candidate Document Types');
    expect(container.textContent).toContain('Aadhaar Card');
    expect(container.textContent).toContain('PAN Card');

    // Click + Add Document Type
    act(() => button('+ Add Document Type')?.click());
    await settle();

    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('h2')?.textContent).toBe('New Document Type');

    // Click preset Aadhaar
    act(() => button('Aadhaar (Front + Back)', dialog)?.click());
    await settle();

    expect(dialog.textContent).toContain('Front Side');
    expect(dialog.textContent).toContain('Back Side');

    // Click Create
    await act(async () => button('Create Document Type', dialog)?.click());
    await settle();

    const createCall = calls.find((c) => c.url.endsWith('/document-types') && c.method === 'POST');
    expect(createCall).toBeDefined();
    expect((createCall?.body as Record<string, unknown>).code).toBe('AADHAAR_CARD');
    expect((createCall?.body as Record<string, unknown>).slots).toEqual(['Front Side', 'Back Side']);
  });
});
