import { CandidateStatus } from './onboarding-workflow';

/**
 * Documents asked of a candidate: the kinds, what a file may be, and how the
 * state of the documents moves the candidate along the workflow. Pure rules,
 * so they can be tested on their own.
 */

export const DOCUMENT_TYPES = [
  'PHOTO',
  'PAN_CARD',
  'AADHAAR_CARD',
  'PASSPORT',
  'ADDRESS_PROOF',
  'EDUCATION_CERTIFICATE',
  'EXPERIENCE_LETTER',
  'RELIEVING_LETTER',
  'PAYSLIP',
  'BANK_PROOF',
  'RESUME',
  'OTHER',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PHOTO: 'Passport-size photo',
  PAN_CARD: 'PAN card',
  AADHAAR_CARD: 'Aadhaar card',
  PASSPORT: 'Passport',
  ADDRESS_PROOF: 'Address proof',
  EDUCATION_CERTIFICATE: 'Education certificate',
  EXPERIENCE_LETTER: 'Experience letter',
  RELIEVING_LETTER: 'Relieving letter',
  PAYSLIP: 'Last payslips',
  BANK_PROOF: 'Cancelled cheque or bank statement',
  RESUME: 'Resume',
  OTHER: 'Other document',
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Uploads kept per requested document, so a link can't be used to fill the disk. */
export const MAX_VERSIONS_PER_REQUEST = 20;
export const MAX_REQUESTS_PER_CANDIDATE = 40;
/** How long a candidate's upload link works after it is sent. */
export const LINK_DAYS = 30;

/** Statuses in which documents are being collected; their state moves the candidate between them. */
export const COLLECTING_STATUSES: readonly CandidateStatus[] = ['OFFER_ACCEPTED', 'DOCUMENT_COLLECTION', 'VERIFICATION', 'READY_TO_JOIN'];
/** Statuses in which nothing more is collected: the process has ended for the candidate. */
export const DOCUMENTS_CLOSED: readonly CandidateStatus[] = ['REJECTED', 'OFFER_DECLINED', 'JOINED', 'WITHDRAWN'];

const FILE_KINDS = [
  { contentType: 'application/pdf', extension: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { contentType: 'image/jpeg', extension: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { contentType: 'image/png', extension: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
] as const;

/** The file's real kind from its first bytes (never from its name or the browser's claim), or null when it is not allowed. */
export function sniffFileKind(bytes: Buffer): { contentType: string; extension: string } | null {
  const kind = FILE_KINDS.find((k) => bytes.length >= k.magic.length && k.magic.every((b, i) => bytes[i] === b));
  return kind ? { contentType: kind.contentType, extension: kind.extension } : null;
}

/** A file name safe to store and to send back in a download header, ending in the file's real extension. */
export function safeFilename(original: string | undefined, extension: string, fallback: string): string {
  const base = (original ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .trim()
    .slice(0, 150);
  return `${base || fallback}.${extension}`;
}

export type RequestState = 'MISSING' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';

/** A requested document's state from its uploads: the live one if any, else whether the last was rejected. */
export function requestState(files: { version_number: number; review_status: string }[]): RequestState {
  const live = files.find((f) => f.review_status === 'PENDING_REVIEW' || f.review_status === 'VERIFIED');
  if (live) return live.review_status as RequestState;
  const latest = [...files].sort((a, b) => b.version_number - a.version_number)[0];
  return latest?.review_status === 'REJECTED' ? 'REJECTED' : 'MISSING';
}

/**
 * Where the candidate stands from their required documents: still collecting
 * while one is missing or rejected, in verification while one awaits review,
 * ready to join once all are verified. Null when nothing is requested.
 */
export function documentStage(requests: { isRequired: boolean; state: RequestState }[]): 'DOCUMENT_COLLECTION' | 'VERIFICATION' | 'READY_TO_JOIN' | null {
  if (requests.length === 0) return null;
  const required = requests.filter((r) => r.isRequired);
  if (required.some((r) => r.state === 'MISSING' || r.state === 'REJECTED')) return 'DOCUMENT_COLLECTION';
  if (required.some((r) => r.state === 'PENDING_REVIEW')) return 'VERIFICATION';
  return 'READY_TO_JOIN';
}
