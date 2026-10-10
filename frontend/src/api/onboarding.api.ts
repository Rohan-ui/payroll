import { apiClient, apiFetch } from './client';

/** HRMS onboarding: candidates, their workflow and interviews. */

export type CandidateStatus =
  | 'NEW'
  | 'SCREENING'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'SELECTED'
  | 'REJECTED'
  | 'OFFER_SENT'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'DOCUMENT_COLLECTION'
  | 'VERIFICATION'
  | 'READY_TO_JOIN'
  | 'JOINED'
  | 'WITHDRAWN';

export const CANDIDATE_STATUSES: CandidateStatus[] = [
  'NEW', 'SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'SELECTED', 'REJECTED', 'OFFER_SENT',
  'OFFER_ACCEPTED', 'OFFER_DECLINED', 'DOCUMENT_COLLECTION', 'VERIFICATION', 'READY_TO_JOIN', 'JOINED', 'WITHDRAWN',
];

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  NEW: 'New',
  SCREENING: 'Screening',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  INTERVIEW_COMPLETED: 'Interview completed',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
  OFFER_SENT: 'Offer sent',
  OFFER_ACCEPTED: 'Offer accepted',
  OFFER_DECLINED: 'Offer declined',
  DOCUMENT_COLLECTION: 'Document collection',
  VERIFICATION: 'Verification',
  READY_TO_JOIN: 'Ready to join',
  JOINED: 'Joined',
  WITHDRAWN: 'Withdrawn',
};

export interface CandidateSummary {
  id: string;
  candidateCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  appliedPosition: string;
  departmentId: string | null;
  departmentName: string | null;
  hiringSource: string | null;
  expectedSalary: string | null;
  experienceYears: string | null;
  expectedJoiningDate: string | null;
  recruiterMemberId: string | null;
  recruiterName: string | null;
  status: CandidateStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextInterview?: { id: string; scheduled_start: string; round_number: number; timezone: string } | null;
}

export interface InterviewPanelist {
  memberId: string;
  name: string | null;
  rating: number | null;
  recommendation: 'STRONG_YES' | 'YES' | 'NO' | 'STRONG_NO' | null;
  notes: string | null;
  submittedAt: string | null;
}

export interface CandidateInterview {
  id: string;
  roundNumber: number;
  roundName: string | null;
  interviewType: 'IN_PERSON' | 'PHONE' | 'ONLINE';
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  location: string | null;
  meetingLink: string | null;
  instructions: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  cancelReason: string | null;
  decision: 'ADVANCE' | 'SELECT' | 'REJECT' | null;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  /** The viewer is on this interview's panel. */
  isMine: boolean;
  panel: InterviewPanelist[];
}

export interface TimelineEvent {
  id: string;
  type: string;
  summary: string;
  notes: string | null;
  fromStatus: CandidateStatus | null;
  toStatus: CandidateStatus | null;
  isOverride: boolean;
  actorName: string | null;
  createdAt: string;
}

export interface CandidateDetail extends CandidateSummary {
  designationId: string | null;
  designationName: string | null;
  employmentTypeId: string | null;
  employmentTypeName: string | null;
  address: string | null;
  notes: string | null;
  employeeId: string | null;
  manualMoves: CandidateStatus[];
  timeline: TimelineEvent[];
  interviews: CandidateInterview[];
  offers: { id: string; offerCode: string; status: OfferStatus; jobTitle: string; annualCtc: string; joiningDate: string; updatedAt: string }[];
}

export type OfferStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
};

export interface OfferInput {
  templateVersionId: string;
  jobTitle: string;
  departmentId?: string;
  designationId?: string;
  employmentTypeId?: string;
  reportingManagerEmployeeId?: string;
  workLocation?: string;
  components: { label: string; annualAmount: string }[];
  probationMonths?: number;
  joiningDate: string;
  expiresOn: string;
  specialTerms?: string;
}

export interface OfferDetail extends Omit<OfferInput, 'probationMonths'> {
  id: string;
  offerCode: string;
  status: OfferStatus;
  candidate: { id: string; name: string; code: string; email: string; status: CandidateStatus };
  templateName: string;
  templateVersion: number;
  reportingManagerName: string | null;
  annualCtc: string;
  probationMonths: number | null;
  letter: { title: string; body: string };
  letterIsFinal: boolean;
  approvals: { submission: number; step: number; approverMemberId: string; approverName: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; comment: string | null; decidedAt: string | null }[];
  submissionNumber: number;
  awaitingMe: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  sentBy: string | null;
  respondedAt: string | null;
  acceptedName: string | null;
  declineReason: string | null;
  withdrawnReason: string | null;
  hasPdf: boolean;
}

export interface OfferListItem {
  id: string;
  offerCode: string;
  status: OfferStatus;
  candidate: { id: string; name: string; code: string };
  jobTitle: string;
  annualCtc: string;
  joiningDate: string;
  expiresOn: string;
  awaitingApprovalFrom: string | null;
  awaitingMe: boolean;
  updatedAt: string;
}

export interface OfferActionResult {
  offer: OfferDetail;
  notifications: EmailOutcome[];
}

export interface TemplateSummary {
  id: string;
  kind: string;
  name: string;
  isArchived: boolean;
  approvedVersion: { id: string; number: number; title: string } | null;
  draftVersion: { id: string; number: number } | null;
}

/**
 * A formatted letter: the document editor's (Tiptap / ProseMirror) JSON, the one
 * source of truth that the editor shows and the PDF prints.
 */
export interface LetterDocument {
  type: string;
  attrs?: Record<string, unknown>;
  content?: LetterDocument[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** How documents print, from the server: the fonts the PDF can show, and how unformatted text looks. */
export interface DocumentFormat {
  style: {
    fontFamily: string;
    fontSize: number;
    color: string;
    lineHeight: number;
    paragraph: { spaceBefore: number; spaceAfter: number };
    listParagraph: { spaceBefore: number; spaceAfter: number };
    headings: Record<'1' | '2' | '3' | '4', { fontSize: number; bold: boolean; italic: boolean; color: string; spaceBefore: number; spaceAfter: number }>;
    headingLineHeight: number;
    listIndentMm: number;
    rule: { spaceBefore: number; spaceAfter: number; thickness: number; color: string };
    table: { spaceBefore: number; spaceAfter: number };
    script: { scale: number; raise: number; drop: number };
  };
  fonts: { key: string; label: string; css: string }[];
  fontSizes: { min: number; max: number; presets: number[] };
}

export interface TemplateDetail {
  id: string;
  kind: string;
  name: string;
  isArchived: boolean;
  placeholders: { key: string; description: string }[];
  format: DocumentFormat;
  versions: {
    id: string;
    number: number;
    status: 'DRAFT' | 'APPROVED' | 'RETIRED';
    title: string;
    body: string;
    /** PLAIN: plain text from before formatting, shown converted; saving it makes it FORMATTED. */
    format: 'FORMATTED' | 'PLAIN';
    document: LetterDocument;
    layout: TemplateLayout & { letterheadName: string | null };
    createdBy: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    updatedAt: string;
  }[];
}

/** How a template's documents are laid out; fixed with the wording when a version is approved. */
export interface TemplateLayout {
  letterheadId: string | null;
  pageSize: 'A4' | 'LETTER';
  marginsMm: PageMargins;
  showPageNumbers: boolean;
}

/** A page's margins in whole millimetres (0 to 60): the letter text stays inside them. */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Where a letterhead sits, in whole millimetres (0 to 60): its header from the
 * page's top edge, its footer from the bottom edge, and both from the side
 * edges. 0 is the edge of the paper.
 */
export interface LetterheadPlacement {
  headerOffsetMm: number;
  footerOffsetMm: number;
  sideOffsetMm: number;
}

export interface Letterhead {
  id: string;
  name: string;
  companyName: string;
  addressText: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationText: string | null;
  footerText: string | null;
  logoPosition: 'LEFT' | 'CENTER' | 'RIGHT';
  headerHeightMm: number;
  footerHeightMm: number;
  /** Null: at each template's margins. */
  placement: LetterheadPlacement | null;
  logoBox: LetterheadBox | null;
  headerArtBox: LetterheadBox | null;
  footerArtBox: LetterheadBox | null;
  /** Images kept but not printed, and images that can't be moved until unlocked. */
  hiddenImages: LetterheadImageSlot[];
  lockedImages: LetterheadImageSlot[];
  /** Page elements such as watermarks, in paint order (first is drawn first). */
  elements: LetterheadElement[];
  isDefault: boolean;
  isArchived: boolean;
  images: Record<LetterheadImageSlot, boolean>;
  updatedAt: string;
}

export type LetterheadImageSlot = 'logo' | 'header' | 'footer';

/**
 * Where an image sits, in millimetres from the top-left of the header or footer
 * area. Stretch fills the box exactly;
 * otherwise the image keeps its proportions inside it.
 */
export interface LetterheadBox {
  x: number;
  y: number;
  width: number;
  height: number;
  stretch: boolean;
  /** Degrees clockwise about the box's centre; left out: upright. */
  rotation?: number;
}

export type ElementAlign = 'left' | 'center' | 'right';
export type ElementFont = 'helvetica' | 'times' | 'courier';

/**
 * A design element on every page, such as a text or image watermark: a box in
 * millimetres from the page's top-left, turned clockwise about its centre, at
 * an opacity from 0 to 1, drawn behind the letter text unless `aboveText`.
 * An IMAGE shows an image uploaded for the letterhead, in proportion inside
 * its box; a TEXT shows its text, broken into lines only where it has line breaks.
 */
export interface LetterheadElement {
  /** The server's id once saved; a temporary one before. Not sent. */
  id: string;
  kind: 'IMAGE' | 'TEXT';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  aboveText: boolean;
  hidden: boolean;
  locked: boolean;
  imageId: string | null;
  text: string | null;
  fontFamily: ElementFont | null;
  fontSizePt: number | null;
  bold: boolean;
  italic: boolean;
  color: string | null;
  align: ElementAlign | null;
}

/** An image uploaded for a letterhead's elements. */
export interface LetterheadAsset {
  id: string;
  widthPx: number;
  heightPx: number;
}

export interface LetterheadInput {
  name: string;
  companyName: string;
  addressText?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationText?: string;
  footerText?: string;
  logoPosition: 'LEFT' | 'CENTER' | 'RIGHT';
  headerHeightMm: number;
  footerHeightMm: number;
  /** Null: at each template's margins. */
  placement: LetterheadPlacement | null;
  /** Null: placed automatically. */
  logoBox: LetterheadBox | null;
  headerArtBox: LetterheadBox | null;
  footerArtBox: LetterheadBox | null;
  hiddenImages: LetterheadImageSlot[];
  lockedImages: LetterheadImageSlot[];
  /** Every element, in paint order, without ids; replaces those saved. */
  elements: Omit<LetterheadElement, 'id'>[];
  isDefault: boolean;
}

/** Letterhead images larger than this are refused by the server. */
export const MAX_LETTERHEAD_IMAGE_BYTES = 2 * 1024 * 1024;

export interface CandidateInput {
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  appliedPosition: string;
  departmentId?: string;
  designationId?: string;
  employmentTypeId?: string;
  hiringSource?: string;
  expectedSalary?: string;
  experienceYears?: string;
  expectedJoiningDate?: string;
  recruiterMemberId?: string;
  notes?: string;
}

export interface OnboardingMeta {
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  employmentTypes: { id: string; name: string }[];
  members: { id: string; name: string; email: string }[];
}

export interface EmailOutcome {
  recipient: string;
  status: 'SENT' | 'FAILED' | 'NOT_SENT' | 'SENDING';
  duplicate: boolean;
  error: string | null;
}

export interface InterviewActionResult {
  candidate: CandidateDetail;
  interviewId: string;
  notifications?: EmailOutcome[];
}

export interface InterviewListItem {
  id: string;
  candidate: { id: string; name: string; code: string; position: string; status: CandidateStatus };
  roundNumber: number;
  roundName: string | null;
  interviewType: 'IN_PERSON' | 'PHONE' | 'ONLINE';
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  location: string | null;
  meetingLink: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  decision: 'ADVANCE' | 'SELECT' | 'REJECT' | null;
  panel: { memberId: string; name: string; feedbackSubmitted: boolean }[];
  isMine: boolean;
}

export interface OnboardingSummary {
  timezone: string;
  today: string;
  totalCandidates: number;
  byStatus: Record<CandidateStatus, number>;
  interviewsToday: number;
  interviewsAwaitingDecision: number;
  myFeedbackDue: number;
  joiningSoon: { count: number; from: string; to: string };
  offersAwaitingApproval: number;
  myApprovalsDue: number;
  offersAwaitingResponse: number;
  candidatesWithDocumentsToVerify: number;
}

export interface ScheduleInterviewInput {
  roundName?: string;
  interviewType: 'IN_PERSON' | 'PHONE' | 'ONLINE';
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  location?: string;
  meetingLink?: string;
  instructions?: string;
  interviewerMemberIds: string[];
  notifyCandidate?: boolean;
  notifyInterviewers?: boolean;
}

export interface CandidateListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: CandidateStatus | '';
  departmentId?: string;
  recruiterMemberId?: string;
  joiningFrom?: string;
  joiningTo?: string;
  archived?: 'active' | 'archived' | 'all';
  /** Only candidates with an upload waiting to be verified. */
  documents?: 'to_verify';
}

export type DocumentState = 'MISSING' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export type FileReviewStatus = 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'SUPERSEDED';

export const DOCUMENT_STATE_LABELS: Record<DocumentState, string> = {
  MISSING: 'Not uploaded',
  PENDING_REVIEW: 'To verify',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const FILE_REVIEW_LABELS: Record<FileReviewStatus, string> = {
  PENDING_REVIEW: 'To verify',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Replaced',
};

export interface DocumentFile {
  id: string;
  version: number;
  filename: string;
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
  uploadedVia: 'STAFF' | 'CANDIDATE';
  uploadedBy: string | null;
  uploadedAt: string;
  reviewStatus: FileReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface DocumentRequest {
  id: string;
  type: string;
  label: string;
  isRequired: boolean;
  state: DocumentState;
  createdAt: string;
  /** Newest first. */
  files: DocumentFile[];
}

export interface CandidateDocuments {
  candidateStatus: CandidateStatus;
  canChange: boolean;
  canSendLink: boolean;
  link: { sentAt: string | null; expiresAt: string | null };
  counts: { required: number; verified: number; toReview: number };
  types: { type: string; label: string }[];
  requests: DocumentRequest[];
}

export interface DocumentActionResult {
  documents: CandidateDocuments;
  notifications: EmailOutcome[];
}

/** Files larger than this are refused by the server. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

/**
 * A file the signed-in member may see, as bytes, through the authenticated API
 * (never a public address). `path` includes /api/v1.
 */
export async function fetchFile(path: string, init?: RequestInit): Promise<ArrayBuffer> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || 'The file could not be loaded. Try again.');
  }
  return response.arrayBuffer();
}

/** A generated PDF from a POST (a preview of unsaved changes), as bytes. */
function postForPdf(path: string, body: unknown): Promise<ArrayBuffer> {
  return fetchFile(`/api/v1${path}`, { method: 'POST', body: JSON.stringify(body) });
}

async function uploadForm<T>(path: string, file: File, tooLarge = 'The file is larger than 10 MB. Upload a smaller copy.'): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiFetch(`/api/v1${path}`, { method: 'POST', body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 413 ? tooLarge : body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || 'The file could not be uploaded. Try again.');
  }
  return body.data as T;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

const BASE = '/onboarding';
const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const onboardingApi = {
  summary: (timezone: string) => apiClient.get<Envelope<OnboardingSummary>>(`${BASE}/dashboard${qs({ timezone })}`).then((r) => r.data),
  meta: () => apiClient.get<Envelope<OnboardingMeta>>(`${BASE}/meta`).then((r) => r.data),

  listCandidates: (query: CandidateListQuery) =>
    apiClient.get<Envelope<CandidateSummary[]>>(`${BASE}/candidates${qs({ ...query })}`).then((r) => ({ items: r.data, pagination: r.pagination! })),
  getCandidate: (id: string) => apiClient.get<Envelope<CandidateDetail>>(`${BASE}/candidates/${id}`).then((r) => r.data),
  createCandidate: (input: CandidateInput) => apiClient.post<Envelope<CandidateDetail>>(`${BASE}/candidates`, input).then((r) => r.data),
  updateCandidate: (id: string, input: CandidateInput) => apiClient.put<Envelope<CandidateDetail>>(`${BASE}/candidates/${id}`, input).then((r) => r.data),
  move: (id: string, status: CandidateStatus, notes?: string) =>
    apiClient.post<Envelope<CandidateDetail>>(`${BASE}/candidates/${id}/move`, { status, ...(notes ? { notes } : {}) }).then((r) => r.data),
  override: (id: string, status: CandidateStatus, reason: string) =>
    apiClient.post<Envelope<CandidateDetail>>(`${BASE}/candidates/${id}/override`, { status, reason }).then((r) => r.data),
  addNote: (id: string, note: string) => apiClient.post<Envelope<CandidateDetail>>(`${BASE}/candidates/${id}/notes`, { note }).then((r) => r.data),
  archive: (id: string) => apiClient.post<Envelope<CandidateDetail>>(`${BASE}/candidates/${id}/archive`).then((r) => r.data),
  restore: (id: string) => apiClient.post<Envelope<CandidateDetail>>(`${BASE}/candidates/${id}/restore`).then((r) => r.data),

  listInterviews: (from: string, to: string, options: { mine?: boolean; status?: string } = {}) =>
    apiClient
      .get<Envelope<InterviewListItem[]>>(`${BASE}/interviews${qs({ from, to, mine: options.mine ? 'true' : undefined, status: options.status })}`)
      .then((r) => r.data),
  schedule: (candidateId: string, input: ScheduleInterviewInput) =>
    apiClient.post<Envelope<InterviewActionResult>>(`${BASE}/candidates/${candidateId}/interviews`, input).then((r) => r.data),
  reschedule: (id: string, input: { startsAt: string; durationMinutes: number; timezone: string; location?: string; meetingLink?: string; reason: string; notify?: boolean }) =>
    apiClient.post<Envelope<InterviewActionResult>>(`${BASE}/interviews/${id}/reschedule`, input).then((r) => r.data),
  cancel: (id: string, reason: string, notify = true) =>
    apiClient.post<Envelope<InterviewActionResult>>(`${BASE}/interviews/${id}/cancel`, { reason, notify }).then((r) => r.data),
  complete: (id: string) => apiClient.post<Envelope<InterviewActionResult>>(`${BASE}/interviews/${id}/complete`).then((r) => r.data),
  feedback: (id: string, input: { rating: number; recommendation: string; notes?: string }) =>
    apiClient.post<Envelope<InterviewActionResult>>(`${BASE}/interviews/${id}/feedback`, input).then((r) => r.data),
  decide: (id: string, decision: 'ADVANCE' | 'SELECT' | 'REJECT', notes?: string) =>
    apiClient.post<Envelope<InterviewActionResult>>(`${BASE}/interviews/${id}/decision`, { decision, ...(notes ? { notes } : {}) }).then((r) => r.data),

  searchEmployees: (search: string) => apiClient.get<Envelope<{ id: string; code: string; name: string }[]>>(`${BASE}/employees${qs({ search })}`).then((r) => r.data),

  listOffers: (query: { page: number; limit: number; status?: OfferStatus | ''; awaitingMyApproval?: boolean }) =>
    apiClient
      .get<Envelope<OfferListItem[]>>(`${BASE}/offers${qs({ page: query.page, limit: query.limit, status: query.status, awaitingMyApproval: query.awaitingMyApproval ? 'true' : undefined })}`)
      .then((r) => ({ items: r.data, pagination: r.pagination! })),
  getOffer: (id: string) => apiClient.get<Envelope<OfferDetail>>(`${BASE}/offers/${id}`).then((r) => r.data),
  createOffer: (candidateId: string, input: OfferInput) => apiClient.post<Envelope<OfferDetail>>(`${BASE}/candidates/${candidateId}/offers`, input).then((r) => r.data),
  updateOffer: (id: string, input: OfferInput) => apiClient.put<Envelope<OfferDetail>>(`${BASE}/offers/${id}`, input).then((r) => r.data),
  submitOffer: (id: string, approverMemberIds: string[]) => apiClient.post<Envelope<OfferActionResult>>(`${BASE}/offers/${id}/submit`, { approverMemberIds }).then((r) => r.data),
  approveOffer: (id: string, comment?: string) => apiClient.post<Envelope<OfferActionResult>>(`${BASE}/offers/${id}/approve`, comment ? { comment } : {}).then((r) => r.data),
  rejectOffer: (id: string, comment: string) => apiClient.post<Envelope<OfferActionResult>>(`${BASE}/offers/${id}/reject`, { comment }).then((r) => r.data),
  sendOffer: (id: string) => apiClient.post<Envelope<OfferActionResult>>(`${BASE}/offers/${id}/send`).then((r) => r.data),
  withdrawOffer: (id: string, reason: string) => apiClient.post<Envelope<OfferActionResult>>(`${BASE}/offers/${id}/withdraw`, { reason }).then((r) => r.data),

  listTemplates: (kind?: string) => apiClient.get<Envelope<TemplateSummary[]>>(`${BASE}/templates${qs({ kind })}`).then((r) => r.data),
  getTemplate: (id: string) => apiClient.get<Envelope<TemplateDetail>>(`${BASE}/templates/${id}`).then((r) => r.data),
  placeholders: () =>
    apiClient.get<Envelope<{ kind: string; available: boolean; placeholders: { key: string; description: string }[] }[]>>(`${BASE}/templates/placeholders`).then((r) => r.data),
  /** Without wording, a template starts from the standard letter. */
  createTemplate: (input: { kind: string; name: string; document?: LetterDocument } & Partial<TemplateLayout>) => apiClient.post<Envelope<TemplateDetail>>(`${BASE}/templates`, input).then((r) => r.data),
  saveTemplateDraft: (id: string, input: { document: LetterDocument } & Partial<TemplateLayout>) => apiClient.put<Envelope<TemplateDetail>>(`${BASE}/templates/${id}/draft`, input).then((r) => r.data),
  approveTemplate: (id: string) => apiClient.post<Envelope<TemplateDetail>>(`${BASE}/templates/${id}/approve`).then((r) => r.data),
  archiveTemplate: (id: string, archived: boolean) => apiClient.post<Envelope<TemplateDetail>>(`${BASE}/templates/${id}/${archived ? 'archive' : 'restore'}`).then((r) => r.data),

  /** The offer's letter: the sent PDF, or a marked preview before that. Shown in the app; nothing changes. */
  offerPdf: (id: string) => fetchFile(`/api/v1${BASE}/offers/${id}/pdf`),
  previewOfferPdf: (candidateId: string, input: OfferInput) => postForPdf(`${BASE}/offers/preview-pdf`, { candidateId, ...input }),
  previewTemplatePdf: (input: { kind: string; document: LetterDocument } & TemplateLayout) => postForPdf(`${BASE}/templates/preview-pdf`, input),

  listLetterheads: () => apiClient.get<Envelope<Letterhead[]>>(`${BASE}/letterheads`).then((r) => r.data),
  getLetterhead: (id: string) => apiClient.get<Envelope<Letterhead>>(`${BASE}/letterheads/${id}`).then((r) => r.data),
  createLetterhead: (input: LetterheadInput) => apiClient.post<Envelope<Letterhead>>(`${BASE}/letterheads`, input).then((r) => r.data),
  updateLetterhead: (id: string, input: LetterheadInput) => apiClient.put<Envelope<Letterhead>>(`${BASE}/letterheads/${id}`, input).then((r) => r.data),
  archiveLetterhead: (id: string, archived: boolean) => apiClient.post<Envelope<Letterhead>>(`${BASE}/letterheads/${id}/${archived ? 'archive' : 'restore'}`).then((r) => r.data),
  letterheadImage: (id: string, slot: LetterheadImageSlot) => fetchFile(`/api/v1${BASE}/letterheads/${id}/images/${slot}`),
  uploadLetterheadImage: (id: string, slot: LetterheadImageSlot, file: File) => uploadForm<Letterhead>(`${BASE}/letterheads/${id}/images/${slot}`, file, 'The image is larger than 2 MB. Upload a smaller copy.'),
  letterheadAsset: (id: string, assetId: string) => fetchFile(`/api/v1${BASE}/letterheads/${id}/assets/${assetId}`),
  uploadLetterheadAsset: (id: string, file: File) => uploadForm<LetterheadAsset>(`${BASE}/letterheads/${id}/assets`, file, 'The image is larger than 2 MB. Upload a smaller copy.'),
  removeLetterheadImage: (id: string, slot: LetterheadImageSlot) => apiClient.delete<Envelope<Letterhead>>(`${BASE}/letterheads/${id}/images/${slot}`).then((r) => r.data),
  previewLetterheadPdf: (input: LetterheadInput, letterheadId?: string) => postForPdf(`${BASE}/letterheads/preview-pdf`, { ...input, ...(letterheadId ? { letterheadId } : {}) }),

  documents: (candidateId: string) => apiClient.get<Envelope<CandidateDocuments>>(`${BASE}/candidates/${candidateId}/documents`).then((r) => r.data),
  requestDocuments: (candidateId: string, items: { type: string; label?: string; isRequired: boolean }[]) =>
    apiClient.post<Envelope<CandidateDocuments>>(`${BASE}/candidates/${candidateId}/documents`, { items }).then((r) => r.data),
  removeDocumentRequest: (candidateId: string, requestId: string) =>
    apiClient.delete<Envelope<CandidateDocuments>>(`${BASE}/candidates/${candidateId}/documents/${requestId}`).then((r) => r.data),
  uploadDocument: (candidateId: string, requestId: string, file: File) => uploadForm<CandidateDocuments>(`${BASE}/candidates/${candidateId}/documents/${requestId}/files`, file),
  documentFileUrl: (candidateId: string, fileId: string) => `/api/v1${BASE}/candidates/${candidateId}/documents/files/${fileId}`,
  verifyDocument: (candidateId: string, fileId: string) =>
    apiClient.post<Envelope<DocumentActionResult>>(`${BASE}/candidates/${candidateId}/documents/files/${fileId}/verify`).then((r) => r.data),
  rejectDocument: (candidateId: string, fileId: string, reason: string) =>
    apiClient.post<Envelope<DocumentActionResult>>(`${BASE}/candidates/${candidateId}/documents/files/${fileId}/reject`, { reason }).then((r) => r.data),
  sendDocumentLink: (candidateId: string) => apiClient.post<Envelope<DocumentActionResult>>(`${BASE}/candidates/${candidateId}/documents/link`).then((r) => r.data),
};
