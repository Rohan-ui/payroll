import type { LetterDocument, TemplateSummary } from './documents.api';
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
export function postForPdf(path: string, body: unknown): Promise<ArrayBuffer> {
  return fetchFile(`/api/v1${path}`, { method: 'POST', body: JSON.stringify(body) });
}

export async function uploadForm<T>(path: string, file: File, tooLarge = 'The file is larger than 10 MB. Upload a smaller copy.'): Promise<T> {
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

  /** Offer letter templates, to choose one for an offer (they are managed in Documents & letterheads). */
  listTemplates: () => apiClient.get<Envelope<TemplateSummary[]>>(`${BASE}/templates`).then((r) => r.data),
  /** Without wording, a template starts from the standard letter. */

  /** The offer's letter: the sent PDF, or a marked preview before that. Shown in the app; nothing changes. */
  offerPdf: (id: string) => fetchFile(`/api/v1${BASE}/offers/${id}/pdf`),
  previewOfferPdf: (candidateId: string, input: OfferInput) => postForPdf(`${BASE}/offers/preview-pdf`, { candidateId, ...input }),


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

  // ── Candidate Generated & Editable Letter Documents ───────────
  listAvailableTemplates: (kind?: string) =>
    apiClient.get<Envelope<AvailableTemplateSummary[]>>(`${BASE}/templates${qs({ kind })}`).then((r) => r.data),
  getCandidatePlaceholders: (candidateId: string) =>
    apiClient.get<Envelope<CandidatePlaceholderInfo>>(`${BASE}/candidates/${candidateId}/letter-placeholders`).then((r) => r.data),
  generateLetterDocument: (candidateId: string, payload: GenerateCandidateDocumentPayload) =>
    apiClient.post<Envelope<GeneratedDocumentResponse>>(`${BASE}/candidates/${candidateId}/letter-documents/generate`, payload).then((r) => r.data),
  listCandidateLetterDocuments: (candidateId: string) =>
    apiClient.get<Envelope<CandidateLetterDocumentSummary[]>>(`${BASE}/candidates/${candidateId}/letter-documents`).then((r) => r.data),
  getCandidateLetterDocument: (candidateId: string, docId: string) =>
    apiClient.get<Envelope<CandidateLetterDocumentDetail>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}`).then((r) => r.data),
  saveCandidateLetterDocument: (candidateId: string, payload: SaveCandidateDocumentPayload) =>
    apiClient.post<Envelope<CandidateLetterDocumentSummary>>(`${BASE}/candidates/${candidateId}/letter-documents`, payload).then((r) => r.data),
  updateCandidateLetterDocument: (candidateId: string, docId: string, payload: Partial<SaveCandidateDocumentPayload>) =>
    apiClient.put<Envelope<CandidateLetterDocumentSummary>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}`, payload).then((r) => r.data),
  downloadLetterPdf: (candidateId: string, docId: string) =>
    fetchFile(`/api/v1${BASE}/candidates/${candidateId}/letter-documents/${docId}/pdf?download=1`),
  downloadLetterDocx: (candidateId: string, docId: string) =>
    fetchFile(`/api/v1${BASE}/candidates/${candidateId}/letter-documents/${docId}/docx`),

  // Status transitions & history
  changeDocumentStatus: (candidateId: string, docId: string, payload: { newStatus: string; reason?: string }) =>
    apiClient.post<Envelope<{ id: string; documentStatus: string; updatedAt: string }>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/status`, payload).then((r) => r.data),
  getDocumentStatusHistory: (candidateId: string, docId: string) =>
    apiClient.get<Envelope<DocumentStatusHistoryItem[]>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/status-history`).then((r) => r.data),

  // Version management
  listDocumentVersions: (candidateId: string, docId: string) =>
    apiClient.get<Envelope<DocumentVersionItem[]>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/versions`).then((r) => r.data),
  getDocumentVersion: (candidateId: string, docId: string, versionId: string) =>
    apiClient.get<Envelope<CandidateLetterDocumentDetail>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/versions/${versionId}`).then((r) => r.data),
  restoreDocumentVersion: (candidateId: string, docId: string, versionId: string, note?: string) =>
    apiClient.post<Envelope<CandidateLetterDocumentSummary>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/versions/${versionId}/restore`, { changelogNote: note }).then((r) => r.data),
  downloadVersionPdf: (candidateId: string, docId: string, versionId: string) =>
    fetchFile(`/api/v1${BASE}/candidates/${candidateId}/letter-documents/${docId}/versions/${versionId}/pdf`),
  downloadVersionDocx: (candidateId: string, docId: string, versionId: string) =>
    fetchFile(`/api/v1${BASE}/candidates/${candidateId}/letter-documents/${docId}/versions/${versionId}/docx`),

  // Email delivery & preview
  previewDocumentEmail: (candidateId: string, docId: string, options?: { templateId?: string; versionId?: string }) =>
    apiClient.get<Envelope<DocumentEmailPreview>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/email/preview${qs({ templateId: options?.templateId, versionId: options?.versionId })}`).then((r) => r.data),
  sendDocumentEmail: (candidateId: string, docId: string, payload: { emailTemplateId?: string; recipientEmail: string; ccEmails?: string; bccEmails?: string; subject: string; bodyHtml: string; versionId?: string; idempotencyKey?: string }) =>
    apiClient.post<Envelope<{ success: boolean; emailId: string; deliveryStatus: string; documentStatus: string; attachmentFilename: string }>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/email/send`, payload).then((r) => r.data),
  listDocumentEmails: (candidateId: string, docId: string) =>
    apiClient.get<Envelope<DocumentEmailItem[]>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/emails`).then((r) => r.data),
  retryDocumentEmail: (candidateId: string, docId: string, emailId: string) =>
    apiClient.post<Envelope<{ success: boolean; deliveryStatus: string }>>(`${BASE}/candidates/${candidateId}/letter-documents/${docId}/emails/${emailId}/retry`).then((r) => r.data),

  // Reusable email templates CRUD
  listEmailTemplates: (category?: string, documentKind?: string) =>
    apiClient.get<Envelope<EmailTemplateItem[]>>(`${BASE}/email-templates${qs({ category, documentKind })}`).then((r) => r.data),
  getEmailTemplate: (id: string) =>
    apiClient.get<Envelope<EmailTemplateItem>>(`${BASE}/email-templates/${id}`).then((r) => r.data),
  createEmailTemplate: (payload: { templateName: string; category?: string; documentKind?: string; subject: string; bodyText: string; description?: string }) =>
    apiClient.post<Envelope<EmailTemplateItem>>(`${BASE}/email-templates`, payload).then((r) => r.data),
  updateEmailTemplate: (id: string, payload: { templateName?: string; category?: string; documentKind?: string; subject?: string; bodyText?: string; description?: string; isActive?: boolean }) =>
    apiClient.put<Envelope<EmailTemplateItem>>(`${BASE}/email-templates/${id}`, payload).then((r) => r.data),
  duplicateEmailTemplate: (id: string) =>
    apiClient.post<Envelope<EmailTemplateItem>>(`${BASE}/email-templates/${id}/duplicate`).then((r) => r.data),
  deleteEmailTemplate: (id: string) =>
    apiClient.delete<Envelope<{ deleted: boolean }>>(`${BASE}/email-templates/${id}`).then((r) => r.data),
  updateDocumentTemplateEmailAssociation: (templateId: string, emailTemplateId: string | null) =>
    apiClient.put<Envelope<{ id: string; templateName: string; defaultEmailTemplateId: string | null }>>(`${BASE}/document-templates/${templateId}/email-template`, { emailTemplateId }).then((r) => r.data),
};

export interface CandidateLetterDocumentSummary {
  id: string;
  documentTitle: string;
  documentType: string;
  typeLabel: string;
  documentStatus: string;
  versionNumber: number;
  versionCount: number;
  templateId: string | null;
  templateName: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  lastSentAt: string | null;
  lastSentByName: string | null;
  emailStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateLetterDocumentDetail {
  id: string;
  candidateId: string;
  templateId: string | null;
  templateVersionId: string | null;
  templateName: string | null;
  documentTitle: string;
  documentType: string;
  typeLabel: string;
  documentStatus: string;
  versionNumber: number;
  document: LetterDocument;
  renderedTitle: string | null;
  renderedBody: string | null;
  layout: {
    letterheadId: string | null;
    letterheadName: string | null;
    pageSize: 'A4' | 'LETTER';
    marginsMm: { top: number; right: number; bottom: number; left: number };
    showPageNumbers: boolean;
  };
  lastSentAt: string | null;
  lastSentByName: string | null;
  emailStatus: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  versions: {
    id: string;
    versionNumber: number;
    title: string;
    changelogNote: string | null;
    documentStatus: string;
    createdAt: string;
    createdByName: string | null;
  }[];
}

export interface DocumentStatusHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedAt: string;
  changedByName: string | null;
}

export interface DocumentVersionItem {
  id: string;
  versionNumber: number;
  title: string;
  changelogNote: string | null;
  documentStatus: string;
  isCurrent: boolean;
  createdAt: string;
  createdByName: string | null;
}

export interface DocumentEmailItem {
  id: string;
  deliveryStatus: string;
  sentAt: string;
  senderName: string | null;
  senderEmail: string | null;
  recipientEmail: string;
  ccEmails: string | null;
  bccEmails: string | null;
  subject: string;
  bodyHtml: string;
  versionNumber: number;
  attachmentFilename: string;
  errorMessage: string | null;
}

export interface DocumentEmailPreview {
  templateId: string | null;
  templateName: string | null;
  associatedTemplateId?: string | null;
  documentTemplateId?: string | null;
  recipientEmail: string;
  candidateName: string;
  subject: string;
  bodyHtml: string;
  attachmentFilename: string;
  versionNumber: number;
  versionId: string;
  unresolvedPlaceholders: string[];
  hasUnresolvedPlaceholders: boolean;
  availableTemplates: { id: string; name: string; category: string; documentKind: string }[];
  supportedPlaceholders: string[];
}

export interface EmailTemplateItem {
  id: string;
  templateKey?: string | null;
  templateName?: string;
  template_name?: string;
  name?: string;
  category: string;
  documentKind?: string | null;
  document_kind?: string | null;
  subject: string;
  bodyText?: string;
  body_text?: string;
  description?: string | null;
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  linkedDocumentTemplates?: { id: string; name: string; kind: string }[];
}

export interface AvailableTemplateSummary {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  category: string;
  description: string;
  versionNumber: number;
  updatedAt: string;
  hasWording: boolean;
  letterheadId: string | null;
  pageSize: string;
  marginsMm: { top: number; right: number; bottom: number; left: number };
  showPageNumbers: boolean;
}

export interface CandidatePlaceholderInfo {
  placeholders: Record<string, string>;
  missingFields: { key: string; label: string; description: string }[];
}

export interface GenerateCandidateDocumentPayload {
  templateId: string;
  templateVersionId?: string;
  customValues?: Record<string, string>;
}

export interface GeneratedDocumentResponse {
  templateId: string;
  templateVersionId: string;
  templateName: string;
  templateKind: string;
  documentTitle: string;
  documentType: string;
  document: LetterDocument;
  layout: {
    letterheadId: string | null;
    letterheadName: string | null;
    pageSize: 'A4' | 'LETTER';
    marginsMm: { top: number; right: number; bottom: number; left: number };
    showPageNumbers: boolean;
  };
  missingPlaceholders: { key: string; label: string; description: string }[];
}

export interface SaveCandidateDocumentPayload {
  documentId?: string;
  templateId?: string;
  templateVersionId?: string;
  documentTitle: string;
  documentType: string;
  document: LetterDocument | Record<string, unknown>;
  documentStatus?: string;
  layout?: {
    letterheadId?: string | null;
    pageSize?: 'A4' | 'LETTER';
    marginsMm?: { top: number; right: number; bottom: number; left: number };
    showPageNumbers?: boolean;
  };
  changelogNote?: string;
}

