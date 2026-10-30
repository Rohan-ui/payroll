import { CandidateStatus } from './onboarding-workflow';

/**
 * Documents asked of a candidate: the kinds, dynamic upload rules,
 * front/back and custom slot management, format validation, and how
 * document verification drives the candidate workflow.
 */

export const DOCUMENT_TYPES = [
  'PHOTO',
  'PAN_CARD',
  'AADHAAR_CARD',
  'PASSPORT',
  'DRIVING_LICENCE',
  'ADDRESS_PROOF',
  'EDUCATION_CERTIFICATE',
  'EXPERIENCE_LETTER',
  'RELIEVING_LETTER',
  'PAYSLIP',
  'BANK_PROOF',
  'RESUME',
  'OTHER',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number] | string;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PHOTO: 'Passport-size photo',
  PAN_CARD: 'PAN card',
  AADHAAR_CARD: 'Aadhaar card',
  PASSPORT: 'Passport',
  DRIVING_LICENCE: 'Driving licence',
  ADDRESS_PROOF: 'Address proof',
  EDUCATION_CERTIFICATE: 'Education certificate',
  EXPERIENCE_LETTER: 'Experience letter',
  RELIEVING_LETTER: 'Relieving letter',
  PAYSLIP: 'Last payslips',
  BANK_PROOF: 'Cancelled cheque or bank statement',
  RESUME: 'Resume',
  OTHER: 'Other document',
};

export interface DocumentTypeDefinition {
  code: string;
  name: string;
  description?: string | null;
  isRequired: boolean;
  minFiles: number;
  maxFiles: number;
  allowedFormats?: string[] | null;
  maxFileSizeBytes: number;
  allowImages: boolean;
  allowPdf: boolean;
  requiresFrontBack: boolean;
  allowMultiplePages: boolean;
  requiresVerification: boolean;
  canReuploadRejected: boolean;
  slots?: string[] | null;
  isActive: boolean;
}

export const DEFAULT_DOCUMENT_DEFINITIONS: DocumentTypeDefinition[] = [
  {
    code: 'PAN_CARD',
    name: 'PAN card',
    description: 'Permanent Account Number card (maximum 1 file)',
    isRequired: true,
    minFiles: 1,
    maxFiles: 1,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'AADHAAR_CARD',
    name: 'Aadhaar card',
    description: 'Aadhaar card with Front Side and Back Side (maximum 2 files)',
    isRequired: true,
    minFiles: 2,
    maxFiles: 2,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: true,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: ['Front Side', 'Back Side'],
    isActive: true,
  },
  {
    code: 'EDUCATION_CERTIFICATE',
    name: 'Education certificate',
    description: 'Degree, diploma or marksheet certificates (1 to 5 files)',
    isRequired: true,
    minFiles: 1,
    maxFiles: 5,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: true,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'EXPERIENCE_LETTER',
    name: 'Experience letter',
    description: 'Prior employment experience or service letters (1 to 5 files)',
    isRequired: true,
    minFiles: 1,
    maxFiles: 5,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: true,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'RELIEVING_LETTER',
    name: 'Relieving letter',
    description: 'Official relieving confirmation from previous employer (1 to 3 files)',
    isRequired: true,
    minFiles: 1,
    maxFiles: 3,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: true,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'PASSPORT',
    name: 'Passport',
    description: 'Passport personal details and address pages (1 to 2 files)',
    isRequired: false,
    minFiles: 1,
    maxFiles: 2,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: true,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: ['Personal Details Page', 'Address / Emigration Page'],
    isActive: true,
  },
  {
    code: 'DRIVING_LICENCE',
    name: 'Driving licence',
    description: 'Driving licence front and back sides (1 to 2 files)',
    isRequired: false,
    minFiles: 2,
    maxFiles: 2,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: true,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: ['Front Side', 'Back Side'],
    isActive: true,
  },
  {
    code: 'BANK_PROOF',
    name: 'Cancelled cheque or bank statement',
    description: 'Cancelled cheque or bank account statement (maximum 1 file)',
    isRequired: false,
    minFiles: 1,
    maxFiles: 1,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'PHOTO',
    name: 'Passport-size Photo',
    description: 'Recent passport size photo (image only)',
    isRequired: false,
    minFiles: 1,
    maxFiles: 1,
    allowedFormats: ['image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: false,
    requiresFrontBack: false,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'RESUME',
    name: 'Resume',
    description: 'Curriculum Vitae / Resume (PDF only)',
    isRequired: false,
    minFiles: 1,
    maxFiles: 1,
    allowedFormats: ['application/pdf'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: false,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: false,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'PAYSLIP',
    name: 'Last Payslips',
    description: 'Recent salary payslips from previous employer (1 to 3 files)',
    isRequired: false,
    minFiles: 1,
    maxFiles: 3,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: true,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
  {
    code: 'OTHER',
    name: 'Other Document',
    description: 'Additional onboarding document (1 to 5 files)',
    isRequired: false,
    minFiles: 1,
    maxFiles: 5,
    allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowImages: true,
    allowPdf: true,
    requiresFrontBack: false,
    allowMultiplePages: true,
    requiresVerification: true,
    canReuploadRejected: true,
    slots: null,
    isActive: true,
  },
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Uploads kept per requested document across all versions and slots. */
export const MAX_VERSIONS_PER_REQUEST = 30;
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

export type RequestState =
  | 'MISSING'
  | 'INCOMPLETE'
  | 'PENDING_REVIEW'
  | 'PARTIALLY_VERIFIED'
  | 'VERIFIED'
  | 'REJECTED';

export interface FileRecordSummary {
  id?: string;
  version_number: number;
  review_status: string;
  slot_name?: string | null;
  replaced_file_id?: string | null;
  created_at?: Date | string;
}

export interface RequestStateOptions {
  minFiles?: number;
  maxFiles?: number;
  slots?: string[] | null;
  requiresFrontBack?: boolean;
}

/**
 * Calculates a document requirement's overall state from its configured limits,
 * named slots, and uploaded files.
 */
export function requestState(
  files: FileRecordSummary[],
  options?: RequestStateOptions,
): RequestState {
  if (!files || files.length === 0) {
    return 'MISSING';
  }

  const maxFiles = options?.maxFiles ?? 1;
  const minFiles = Math.max(1, options?.minFiles ?? 1);
  const rawSlots = options?.slots;
  const configuredSlots = Array.isArray(rawSlots) && rawSlots.length > 0
    ? rawSlots.map((s) => String(s).trim()).filter(Boolean)
    : null;

  // Single-file mode backward compatibility: takes live upload, else newest
  if (!configuredSlots && maxFiles === 1) {
    const live = files.find((f) => f.review_status === 'PENDING_REVIEW' || f.review_status === 'VERIFIED');
    if (live) return live.review_status as RequestState;
    const last = [...files].sort((a, b) => b.version_number - a.version_number)[0];
    return last ? (last.review_status as RequestState) : 'MISSING';
  }

  // Identify replaced historical file IDs
  const replacedIds = new Set(files.filter((f) => f.replaced_file_id).map((f) => f.replaced_file_id!));
  const unreplaced = files.filter((f) => (!f.id || !replacedIds.has(f.id)) && f.review_status !== 'SUPERSEDED');

  if (unreplaced.length === 0) {
    // If every upload has been superseded or all rejected
    const latest = [...files].sort((a, b) => b.version_number - a.version_number)[0];
    return latest?.review_status === 'REJECTED' ? 'REJECTED' : 'MISSING';
  }

  // Slotted document (e.g. Front Side, Back Side)
  if (configuredSlots && configuredSlots.length > 0) {
    // For each slot, find the newest active file
    const activeSlotFiles: FileRecordSummary[] = [];
    const missingSlots: string[] = [];

    for (const slot of configuredSlots) {
      const slotFiles = unreplaced
        .filter((f) => (f.slot_name || '').toLowerCase() === slot.toLowerCase())
        .sort((a, b) => b.version_number - a.version_number);
      if (slotFiles.length > 0) {
        activeSlotFiles.push(slotFiles[0]);
      } else {
        missingSlots.push(slot);
      }
    }

    if (activeSlotFiles.length === 0) {
      return 'MISSING';
    }

    const hasRejected = activeSlotFiles.some((f) => f.review_status === 'REJECTED');
    const hasPending = activeSlotFiles.some((f) => f.review_status === 'PENDING_REVIEW');
    const hasVerified = activeSlotFiles.some((f) => f.review_status === 'VERIFIED');
    const allVerified = activeSlotFiles.length === configuredSlots.length && activeSlotFiles.every((f) => f.review_status === 'VERIFIED');

    if (allVerified) return 'VERIFIED';

    if (hasRejected) {
      return 'REJECTED';
    }

    if (missingSlots.length > 0) {
      return hasVerified ? 'PARTIALLY_VERIFIED' : 'INCOMPLETE';
    }

    if (hasVerified && hasPending) {
      return 'PARTIALLY_VERIFIED';
    }

    return 'PENDING_REVIEW';
  }

  // Generic document (e.g. 1-5 certificates)
  const activeFiles = unreplaced;
  if (activeFiles.length === 0) return 'MISSING';

  const hasRejected = activeFiles.some((f) => f.review_status === 'REJECTED');
  const hasVerified = activeFiles.some((f) => f.review_status === 'VERIFIED');
  const hasPending = activeFiles.some((f) => f.review_status === 'PENDING_REVIEW');
  const countMet = activeFiles.length >= minFiles;

  if (hasRejected) {
    return 'REJECTED';
  }

  if (!countMet) {
    return hasVerified ? 'PARTIALLY_VERIFIED' : 'INCOMPLETE';
  }

  // Count requirement met and no rejected files
  const allVerified = activeFiles.every((f) => f.review_status === 'VERIFIED');
  if (allVerified) return 'VERIFIED';

  if (hasVerified && hasPending) return 'PARTIALLY_VERIFIED';

  return 'PENDING_REVIEW';
}

/**
 * Where the candidate stands from their required documents:
 * - Still collecting while one is missing, incomplete or rejected
 * - In verification while one awaits review or is partially verified
 * - Ready to join once all required documents are verified
 */
export function documentStage(
  requests: { isRequired: boolean; state: RequestState }[],
): 'DOCUMENT_COLLECTION' | 'VERIFICATION' | 'READY_TO_JOIN' | null {
  if (requests.length === 0) return null;
  const required = requests.filter((r) => r.isRequired);
  if (required.some((r) => r.state === 'MISSING' || r.state === 'INCOMPLETE' || r.state === 'REJECTED')) {
    return 'DOCUMENT_COLLECTION';
  }
  if (required.some((r) => r.state === 'PENDING_REVIEW' || r.state === 'PARTIALLY_VERIFIED')) {
    return 'VERIFICATION';
  }
  return 'READY_TO_JOIN';
}
