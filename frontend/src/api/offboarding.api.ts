import { apiClient } from './client';
import { fetchFile } from './onboarding.api';

/** Offboarding: resignations and other exits, their checklist and exit interview, and completing them. */

interface Envelope<T> { success: boolean; data: T; message?: string }
const data = async <T>(promise: Promise<Envelope<T>>) => (await promise).data;

export type SeparationType = 'RESIGNATION' | 'TERMINATION' | 'RETIREMENT' | 'CONTRACT_END';
export type SeparationStatus = 'PENDING_APPROVAL' | 'IN_PROGRESS' | 'COMPLETED' | 'WITHDRAWN' | 'CANCELLED';
export type ClearanceTeam = 'MANAGER' | 'IT' | 'ADMIN' | 'FINANCE' | 'HR';
export type ClearanceStatus = 'PENDING' | 'CLEARED' | 'WAIVED';

export interface ExitPerson { id: string; code: string; name: string; department: string | null; designation: string | null }

/** What the employee sees of their own exit. */
export interface OwnExit {
  id: string;
  employee: ExitPerson;
  type: SeparationType;
  status: SeparationStatus;
  isSelfService: boolean;
  reason: string | null;
  noticeDate: string;
  noticePeriodDays: number | null;
  requestedLastWorkingDate: string;
  lastWorkingDate: string;
  approvedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  exitInterviewDate: string | null;
  /** A booked interview not yet held: when, where and with whom. */
  exitInterviewBooking: { at: string; location: string | null; interviewer: string | null } | null;
  checklist: { id: string; team: ClearanceTeam; title: string; status: ClearanceStatus; clearedAt: string | null }[];
}

export type MyExit =
  | { linked: false }
  | { linked: true; employee: ExitPerson & { status: string; noticePeriodDays: number | null }; today: string; current: OwnExit | null; past: OwnExit[] };

export interface ExitDetail extends Omit<OwnExit, 'checklist' | 'reason'> {
  reason: string;
  requestedBy: string | null;
  approvedBy: string | null;
  completedBy: string | null;
  closedBy: string | null;
  closeReason: string | null;
  exitInterview: ExitInterview | null;
  interviewBooking: { at: string; location: string | null; interviewer: { id: string; name: string | null } | null } | null;
  /** The manager's feedback for the exit interview, from My team. */
  managerFeedback: { text: string; by: string | null; at: string | null } | null;
  /** Whether the signed-in member may see and write the confidential notes. */
  canSeeConfidential: boolean;
  checklist: ExitChecklistItem[];
  hasSignIn: boolean;
  /** Days counted after the notice date; a shortfall needs a recover-or-waive decision before completion. */
  notice: {
    requiredDays: number | null; servedDays: number; requestedLastDay: string; contractualLastDay: string | null; lastDay: string; shortfallDays: number;
    decision: 'RECOVER' | 'WAIVE' | null; decisionReason: string | null; decidedBy: string | null; decidedAt: string | null;
  };
  dateChanges: { from: string; to: string; reason: string | null; changedBy: string | null; changedAt: string }[];
  /** People who would still report to the leaver after their last day. */
  directReports: { id: string; code: string; name: string }[];
  managerComments: { id: string; kind: CommentKind; body: string; author: string | null; createdAt: string }[];
  /** Active loans and advances; amounts are decimal strings in rupees. */
  obligations: {
    outstanding: string;
    loans: { id: string; number: string; type: 'LOAN' | 'ADVANCE'; principal: string; installment: string; outstanding: string; installmentsLeft: number; dueAfterLastDay: string; installmentsAfterLastDay: number }[];
  };
  today: string;
  /** Why it can't be completed yet. */
  blockers: string[];
  warnings: string[];
}

export interface ExitRow {
  id: string;
  employee: ExitPerson;
  type: SeparationType;
  status: SeparationStatus;
  isSelfService: boolean;
  noticeDate: string;
  lastWorkingDate: string;
  checklist: { done: number; total: number };
}

export interface ExitSummary { pendingApproval: number; inProgress: number; leavingIn30Days: number; pastLastDay: number }
export interface Pagination { page: number; limit: number; total: number; totalPages: number }

const query = (q: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  const text = params.toString();
  return text ? `?${text}` : '';
};

export interface ExitChecklistItem {
  id: string;
  team: ClearanceTeam;
  title: string;
  description: string | null;
  /** Only required items hold back completing the exit. */
  isRequired: boolean;
  /** The item's own due date, or the last working day. */
  dueDate: string;
  hasOwnDueDate: boolean;
  assignedTo: { id: string; name: string | null } | null;
  status: ClearanceStatus;
  /** Remarks on clearing it. */
  note: string | null;
  waiverReason: string | null;
  clearedBy: string | null;
  clearedAt: string | null;
  /** Whether the signed-in member's team (or HR's override) owns it. */
  canClear: boolean;
  canWaive: boolean;
}

export interface ChecklistItemInput { team: ClearanceTeam; title: string; description?: string; isRequired?: boolean; dueDate?: string; assignedMemberId?: string }
export interface ChecklistDetailsInput { description?: string; isRequired?: boolean; dueDate?: string | null; assignedMemberId?: string | null }
export interface ChecklistTemplateItem { team: ClearanceTeam; title: string; description: string | null; isRequired: boolean }
export interface ChecklistOwner { id: string; name: string; email: string }

/** An open item of someone else's exit that the member's team owns. */
export interface MyChecklistItem {
  id: string;
  separationId: string;
  team: ClearanceTeam;
  title: string;
  description: string | null;
  isRequired: boolean;
  dueDate: string;
  lastWorkingDate: string;
  assignedTo: string | null;
  isMine: boolean;
  employee: { name: string; code: string };
}

export interface ExitInterview {
  date: string;
  conductedBy: { id: string; name: string | null } | null;
  primaryReason: string | null;
  secondaryReason: string | null;
  employeeFeedback: string | null;
  /** Out of 5. */
  ratings: { workplace: number | null; compensation: number | null; growth: number | null };
  rehireEligible: boolean | null;
  rehireRemarks: string | null;
  recordedBy: string | null;
  /** Only sent to HR who may see them. */
  confidentialNotes?: string | null;
}

export interface ExitInterviewInput {
  interviewDate: string;
  conductedByMemberId?: string;
  primaryReason: string;
  secondaryReason?: string;
  employeeFeedback: string;
  workplaceRating?: number;
  compensationRating?: number;
  growthRating?: number;
  rehireEligible?: boolean;
  rehireRemarks?: string;
  /** Left out, the saved notes stay as they are. */
  confidentialNotes?: string;
}

export interface ExitReason { code: string; label: string; active: boolean }

export type CommentKind = 'COMMENT' | 'HANDOVER';

/** A direct report's exit, as their manager sees it: no reason, interview or settlement. */
export interface TeamExitRow {
  id: string;
  type: SeparationType;
  status: SeparationStatus;
  lastWorkingDate: string;
  employee: { name: string; code: string; department: string | null; designation: string | null };
  checklistProgress: { done: number; total: number };
  pendingManagerItems: number;
}

export interface TeamExitDetail extends Omit<TeamExitRow, 'pendingManagerItems'> {
  noticeDate: string;
  checklist: { id: string; team: ClearanceTeam; title: string; status: ClearanceStatus; note: string | null; clearedAt: string | null; canUpdate: boolean }[];
  comments: { id: string; kind: CommentKind; body: string; author: string; createdAt: string; isMine: boolean }[];
  canComment: boolean;
  managerFeedback: { text: string; at: string | null } | null;
  canGiveFeedback: boolean;
}

export const NOTIFICATION_EVENTS = {
  RESIGNATION_SUBMITTED: 'Resignation submitted',
  RESIGNATION_ACCEPTED: 'Resignation accepted',
  RESIGNATION_WITHDRAWN: 'Resignation withdrawn',
  EXIT_STARTED: 'Exit started by HR',
  CHECKLIST_ASSIGNED: 'Exit checklist ready',
  CHECKLIST_REMINDER: 'Checklist reminder (daily, near the last day)',
  LAST_DAY_REMINDER: 'Last working day reminder',
  SETTLEMENT_PENDING_REVIEW: 'Settlement waiting for review',
  SETTLEMENT_APPROVED: 'Settlement approved',
  SETTLEMENT_PAID: 'Settlement paid',
  EXIT_COMPLETED: 'Exit completed',
  LETTER_ISSUED: 'Letter issued (sent with the PDF)',
  INTERVIEW_SCHEDULED: 'Exit interview booked or moved',
  INTERVIEW_CANCELLED: 'Exit interview booking cancelled',
} as const;
export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;
export type NotificationSettings = Record<NotificationEvent, boolean>;

export interface ExitNotification {
  id: string;
  event: NotificationEvent;
  channel: 'EMAIL';
  recipient: string;
  status: 'SENT' | 'FAILED' | 'NOT_SENT' | 'SENDING';
  error: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportQuery {
  from?: string;
  to?: string;
  groupBy?: 'month' | 'quarter' | 'year';
  departmentId?: string;
  locationId?: string;
  type?: SeparationType;
  status?: SeparationStatus;
  managerId?: string;
}

export interface Breakdown { label: string; value: number }

export interface OffboardingReport {
  range: { from: string; to: string; groupBy: 'month' | 'quarter' | 'year' };
  today: string;
  summary: { total: number; pendingResignations: number; accepted: number; upcomingLastDays: number; pastLastDay: number; completed: number; cancelled: number; pendingChecklistItems: number };
  /** Exits by last working day, one entry per period in the range. */
  trend: { period: string; value: number }[];
  byDepartment: Breakdown[];
  byDesignation: Breakdown[];
  byType: Breakdown[];
  byReason: Breakdown[];
  /** Null for people who may not see settlements. Amounts are rupee decimal strings. */
  settlements: { pending: number; notStarted: number; inReview: number; approvedUnpaid: number; approvedUnpaidAmount: string; paid: number; totalPaid: string; totalRecoveries: string } | null;
  upcoming: { id: string; lastWorkingDate: string; type: SeparationType; employee: { name: string; code: string }; department: string | null; location: string | null; manager: string | null }[];
  options: { departments: { id: string; name: string }[]; locations: { id: string; name: string }[]; managers: { id: string; name: string }[] };
}

export const offboardingApi = {
  report: (q: ReportQuery) => data(apiClient.get<Envelope<OffboardingReport>>(`/offboarding/reports${query({ ...q })}`)),
  mine: () => data(apiClient.get<Envelope<MyExit>>('/offboarding/my')),
  resign: (input: { reason: string; lastWorkingDate: string }) => data(apiClient.post<Envelope<MyExit>>('/offboarding/my/resignation', input)),
  withdraw: (reason?: string) => data(apiClient.post<Envelope<MyExit>>('/offboarding/my/resignation/withdraw', { reason })),

  summary: () => data(apiClient.get<Envelope<ExitSummary>>('/offboarding/summary')),
  list: (q: { status?: SeparationStatus; search?: string; page?: number; limit?: number }) =>
    apiClient.get<Envelope<ExitRow[]> & { pagination: Pagination }>(`/offboarding/separations${query(q)}`),
  detail: (id: string) => data(apiClient.get<Envelope<ExitDetail>>(`/offboarding/separations/${id}`)),
  /** Active employees without an exit in progress; `code` is the employee code. */
  employees: (search: string) =>
    data(apiClient.get<Envelope<(ExitPerson & { noticePeriodDays: number | null })[]>>(`/offboarding/employees${query({ search })}`)),
  start: (input: { employeeId: string; type: SeparationType; reason: string; noticeDate: string; lastWorkingDate: string }) =>
    data(apiClient.post<Envelope<ExitDetail>>('/offboarding/separations', input)),
  approve: (id: string, lastWorkingDate: string, reason?: string) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/approve`, { lastWorkingDate, reason })),
  changeLastDay: (id: string, lastWorkingDate: string, reason?: string) => data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/last-working-date`, { lastWorkingDate, reason })),
  decideNotice: (id: string, decision: 'RECOVER' | 'WAIVE', reason?: string) =>
    data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/notice-decision`, { decision, reason })),
  reassignReports: (id: string, managerEmployeeId: string) =>
    apiClient.post<Envelope<ExitDetail> & { failed: { employeeId: string; name: string; reason: string }[] }>(`/offboarding/separations/${id}/reassign-reports`, { managerEmployeeId }),
  scheduleInterview: (id: string, input: { scheduledAt: string; interviewerMemberId?: string; location?: string }) =>
    data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/exit-interview/schedule`, input)),
  cancelInterviewBooking: (id: string) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/exit-interview/cancel-booking`)),
  saveInterview: (id: string, input: ExitInterviewInput) =>
    data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/exit-interview`, input)),
  addItem: (id: string, input: ChecklistItemInput) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/checklist`, input)),
  updateItem: (id: string, itemId: string, input: { status: ClearanceStatus; note?: string; waiverReason?: string }) =>
    data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/checklist/${itemId}`, input)),
  itemDetails: (id: string, itemId: string, input: ChecklistDetailsInput) =>
    data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/checklist/${itemId}/details`, input)),
  checklistOwners: (team: ClearanceTeam) => data(apiClient.get<Envelope<ChecklistOwner[]>>(`/offboarding/checklist/owners${query({ team })}`)),
  checklistTemplate: () => data(apiClient.get<Envelope<ChecklistTemplateItem[]>>('/offboarding/checklist-template')),
  saveChecklistTemplate: (items: ChecklistTemplateItem[]) => data(apiClient.put<Envelope<ChecklistTemplateItem[]>>('/offboarding/checklist-template', { items })),
  myChecklist: () => data(apiClient.get<Envelope<MyChecklistItem[]>>('/offboarding/checklist/mine')),
  updateMyItem: (itemId: string, input: { status: ClearanceStatus; note?: string; waiverReason?: string }) =>
    data(apiClient.put<Envelope<MyChecklistItem[]>>(`/offboarding/checklist/items/${itemId}`, input)),
  cancel: (id: string, reason: string) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/cancel`, { reason })),
  complete: (id: string) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/complete`)),
  exitReasons: () => data(apiClient.get<Envelope<ExitReason[]>>('/offboarding/exit-reasons')),
  saveExitReasons: (reasons: { code?: string; label: string; active: boolean }[]) => data(apiClient.put<Envelope<ExitReason[]>>('/offboarding/exit-reasons', { reasons })),
  interviewers: () => data(apiClient.get<Envelope<{ id: string; name: string }[]>>('/offboarding/interviewers')),
  teamFeedback: (id: string, feedback: string) => data(apiClient.put<Envelope<TeamExitDetail>>(`/offboarding/team/${id}/feedback`, { feedback })),
  notifications: (id: string) => data(apiClient.get<Envelope<ExitNotification[]>>(`/offboarding/separations/${id}/notifications`)),
  notificationSettings: () => data(apiClient.get<Envelope<NotificationSettings>>('/offboarding/notification-settings')),
  saveNotificationSettings: (input: Partial<NotificationSettings>) => data(apiClient.put<Envelope<NotificationSettings>>('/offboarding/notification-settings', input)),

  team: () => data(apiClient.get<Envelope<TeamExitRow[]>>('/offboarding/team')),
  teamDetail: (id: string) => data(apiClient.get<Envelope<TeamExitDetail>>(`/offboarding/team/${id}`)),
  teamComment: (id: string, input: { kind: CommentKind; body: string }) => data(apiClient.post<Envelope<TeamExitDetail>>(`/offboarding/team/${id}/comments`, input)),
  teamItem: (id: string, itemId: string, input: { status: 'PENDING' | 'CLEARED'; note?: string }) =>
    data(apiClient.put<Envelope<TeamExitDetail>>(`/offboarding/team/${id}/checklist/${itemId}`, input)),
};

// ── Full and final settlement ───────────────────────────────────

export type SettlementStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'REVISED';
export type SettlementBasis = 'BASIC' | 'GROSS';

export interface SettlementLine {
  id: string;
  kind: 'EARNING' | 'RECOVERY';
  code: string;
  label: string;
  /** What the rules worked out; null for a line added by hand. */
  calculatedAmount: string | null;
  amount: string;
  /** False for information only (the final salary, paid through payroll). */
  countsInTotal: boolean;
  isManual: boolean;
  adjustmentReason: string | null;
  basis: { rule?: string; [key: string]: unknown };
}

export interface Settlement {
  id: string;
  version: number;
  status: SettlementStatus;
  currency: string;
  totals: { earnings: string; recoveries: string; net: string };
  lines: SettlementLine[];
  /** What must be resolved before it can be submitted. */
  problems: string[];
  finalPayslip: { periodCode: string; gross: string; net: string } | null;
  calculatedAt: string;
  preparedBy: string | null;
  submittedBy: string | null; submittedAt: string | null;
  reviewedBy: string | null; reviewedAt: string | null; reviewNotes: string | null;
  approvedBy: string | null; approvedAt: string | null;
  rejectedBy: string | null; rejectionReason: string | null;
  paidBy: string | null; paidAt: string | null;
  payment: { date: string; mode: string; reference: string | null; remarks: string | null } | null;
  closedBy: string | null; closeReason: string | null;
}

export interface ExitSettlement {
  current: Settlement | null;
  history: { id: string; version: number; status: SettlementStatus; net: string; createdAt: string }[];
  canPrepare: boolean;
}

export interface SettlementPolicy {
  leaveEncashment: { enabled: boolean; basis: SettlementBasis; dayDivisor: number };
  notice: { basis: SettlementBasis; dayDivisor: number };
  gratuity: { enabled: boolean; minimumYears: number; roundUpMonths: number; daysPerYear: number; dayDivisor: number; componentCodes: string[]; cap: string | null };
}

export const MANUAL_SETTLEMENT_CODES = { BONUS: 'Bonus', INCENTIVE: 'Incentive', REIMBURSEMENT: 'Reimbursement', COMMISSION: 'Pending commission', OTHER_PAYMENT: 'Other payment', OTHER_RECOVERY: 'Other recovery' } as const;

const S = '/offboarding/settlements';
export const settlementApi = {
  forExit: (separationId: string) => data(apiClient.get<Envelope<ExitSettlement>>(`/offboarding/separations/${separationId}/settlement`)),
  prepare: (separationId: string) => data(apiClient.post<Envelope<ExitSettlement>>(`/offboarding/separations/${separationId}/settlement`)),
  recalculate: (id: string) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/recalculate`)),
  addLine: (id: string, input: { code: keyof typeof MANUAL_SETTLEMENT_CODES; label: string; amount: string; reason: string }) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/lines`, input)),
  adjustLine: (id: string, lineId: string, input: { amount: string; reason?: string }) => data(apiClient.put<Envelope<ExitSettlement>>(`${S}/${id}/lines/${lineId}`, input)),
  submit: (id: string) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/submit`)),
  review: (id: string, notes?: string) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/review`, { notes })),
  approve: (id: string) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/approve`)),
  reject: (id: string, reason: string) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/reject`, { reason })),
  pay: (id: string, input: { paymentDate: string; mode: string; reference?: string; remarks?: string }) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/pay`, input)),
  revise: (id: string, reason: string) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/revise`, { reason })),
  cancel: (id: string, reason: string) => data(apiClient.post<Envelope<ExitSettlement>>(`${S}/${id}/cancel`, { reason })),
  policy: () => data(apiClient.get<Envelope<SettlementPolicy>>('/offboarding/settlement-policy')),
  setPolicy: (policy: SettlementPolicy) => data(apiClient.put<Envelope<SettlementPolicy>>('/offboarding/settlement-policy', policy)),
};

// ── Exit letters and the settlement statement ───────────────────

export type ExitDocumentType = 'EXPERIENCE_LETTER' | 'RELIEVING_LETTER' | 'FULL_AND_FINAL_STATEMENT';
export interface ExitDocument {
  id: string;
  type: ExitDocumentType;
  label: string;
  title: string;
  status: 'DRAFT' | 'ISSUED';
  version: number;
  generatedBy: string | null;
  generatedAt: string;
  /** Details the records lacked; the draft shows them as {{key}} and can't be issued until regenerated with them. */
  missing: string[];
}
export interface ExitDocuments {
  documents: ExitDocument[];
  templates: { id: string; name: string; kind: string }[];
  types: { type: ExitDocumentType; label: string }[];
}

const docsBase = (separationId: string) => `/offboarding/separations/${separationId}/documents`;
export const exitDocumentsApi = {
  list: (separationId: string) => data(apiClient.get<Envelope<ExitDocuments>>(docsBase(separationId))),
  generate: (separationId: string, input: { documentType: ExitDocumentType; templateId?: string }) => data(apiClient.post<Envelope<ExitDocuments>>(docsBase(separationId), input)),
  issue: (separationId: string, documentId: string) => data(apiClient.post<Envelope<ExitDocuments>>(`${docsBase(separationId)}/${documentId}/issue`)),
  versions: (separationId: string, documentId: string) =>
    data(apiClient.get<Envelope<{ version: number; note: string | null; createdBy: string | null; createdAt: string }[]>>(`${docsBase(separationId)}/${documentId}/versions`)),
  /** Fetched with the session; there is no public address for these files. */
  pdf: (separationId: string, documentId: string) => fetchFile(`/api/v1${docsBase(separationId)}/${documentId}/pdf`),
};
