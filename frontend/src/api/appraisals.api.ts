import { apiClient, apiFetch } from './client';
import { fetchFile } from './onboarding.api';
import type { EmployeeOption, LibraryStatus, ListQuery, Named, Page } from './performance.api';

/**
 * Appraisal cycles, appraisals and reviews. Ratings, actuals and targets
 * travel as decimal strings; the server works out every score.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}
const data = async <T>(promise: Promise<Envelope<T>>) => (await promise).data;
const queryOf = (q: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
};

/* ── Cycles ───────────────────────────────────────────────── */

export type CycleKind = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'PROBATION' | 'PROJECT' | 'CUSTOM';
export type CycleStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type AppraisalStatus = 'IN_PROGRESS' | 'REVIEWS_COMPLETE' | 'CANCELLED';
export type StageStatus = 'WAITING' | 'OPEN' | 'NEEDS_REVIEWERS' | 'COMPLETE';
export type AssignmentStatus = 'ASSIGNED' | 'SUBMITTED' | 'DECLINED' | 'REPLACED' | 'CANCELLED' | 'RETURNED';
export type StageAction = 'RATE' | 'REVIEW' | 'APPROVE' | 'ACKNOWLEDGE';

export interface CycleProgress { total: number; inProgress: number; reviewsComplete: number; cancelled: number; needingReviewers: number; overdue: number }

export interface CycleSummary {
  id: string;
  cycleCode: string;
  cycleName: string;
  cycleKind: CycleKind;
  status: CycleStatus;
  periodStart: string;
  periodEnd: string;
  launchedAt: string | null;
  progress: CycleProgress | null;
}

export interface Cycle extends CycleSummary {
  description: string | null;
  appliesToAll: boolean;
  scopes: { departments: Named[]; designations: Named[] };
  joinedOnOrBefore: string | null;
  allowsOverlap: boolean;
  templates: { id: string; code: string; name: string; status: LibraryStatus }[];
  workflows: { id: string; code: string; name: string; status: LibraryStatus }[];
  launchedBy: string | null;
}

export interface CycleInput {
  cycleName: string;
  description: string | null;
  cycleKind: CycleKind;
  periodStart: string;
  periodEnd: string;
  appliesToAll: boolean;
  scopes: { departmentIds: string[]; designationIds: string[] };
  joinedOnOrBefore: string | null;
  allowsOverlap: boolean;
  templateIds: string[];
  workflowIds: string[];
}

export interface Choice { id: string; code: string; name: string; versionNumber: number }

export interface PreviewRow {
  employee: { id: string; name: string; code: string };
  department: string | null;
  designation: string | null;
  alreadyIn: boolean;
  template: Choice | null;
  templateReason: string | null;
  workflow: Choice | null;
  workflowReason: string | null;
  problems: { kind: 'TEMPLATE' | 'WORKFLOW' | 'OVERLAP'; message: string }[];
  reviewers: { stage: string; status: string; message: string }[];
}

export interface LaunchPreview {
  templates: Choice[];
  workflows: Choice[];
  rows: PreviewRow[];
  summary: { eligible: number; ready: number; needChoice: number; alreadyIn: number; needingReviewers: number };
}

export interface LaunchInput {
  confirm: true;
  excludeEmployeeIds: string[];
  choices: { employeeId: string; templateId: string; workflowId: string }[];
  onlyEmployeeIds?: string[];
}

export interface AppraisalRow {
  id: string;
  employee: { id: string; name: string; code: string };
  department: string | null;
  designation: string | null;
  status: AppraisalStatus;
  template: string;
  currentStages: { name: string; status: StageStatus; dueDate: string | null; overdue: boolean }[];
}

export type AppraisalFilter = AppraisalStatus | 'NEEDS_REVIEWERS';
export interface AppraisalQuery { search?: string; status?: AppraisalFilter; page?: number; limit?: number }

export const cyclesApi = {
  list: (q: ListQuery) => data(apiClient.get<Envelope<Page<CycleSummary>>>(`/performance/cycles${queryOf({ ...q })}`)),
  get: (id: string) => data(apiClient.get<Envelope<Cycle>>(`/performance/cycles/${id}`)),
  create: (input: CycleInput & { cycleCode: string }) => data(apiClient.post<Envelope<Cycle>>('/performance/cycles', input)),
  update: (id: string, input: CycleInput) => data(apiClient.put<Envelope<Cycle>>(`/performance/cycles/${id}`, input)),
  preview: (id: string) => data(apiClient.post<Envelope<LaunchPreview>>(`/performance/cycles/${id}/preview`, {})),
  launch: (id: string, input: LaunchInput) => data(apiClient.post<Envelope<{ started: number; skipped: { employeeId: string; name: string; reason: string }[]; cycle: Cycle }>>(`/performance/cycles/${id}/launch`, input)),
  archive: (id: string) => data(apiClient.post<Envelope<Cycle>>(`/performance/cycles/${id}/archive`, {})),
  restore: (id: string) => data(apiClient.post<Envelope<Cycle>>(`/performance/cycles/${id}/restore`, {})),
  remove: (id: string) => data(apiClient.delete<Envelope<{ deleted: true }>>(`/performance/cycles/${id}`)),
  appraisals: (id: string, q: AppraisalQuery) => data(apiClient.get<Envelope<Page<AppraisalRow>>>(`/performance/cycles/${id}/appraisals${queryOf({ ...q })}`)),
};

/* ── Appraisals (for people who run cycles) ──────────────── */

export interface AssignmentView {
  id: string;
  reviewer: { id: string; name: string | null };
  status: AssignmentStatus;
  via: string;
  isLead: boolean;
  reason: string | null;
  assignedAt: string;
  submittedAt: string | null;
  replaces: string | null;
}

export interface NominationView { id: string; nominee: string | null; nominatedBy?: string | null; status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'; decidedBy?: string | null; note: string | null }

export interface AppraisalDetail {
  id: string;
  status: AppraisalStatus;
  currentStep: number | null;
  employee: { id: string; name: string; code: string; hasSignIn: boolean };
  cycle: { id: string; name: string; periodStart: string; periodEnd: string };
  template: { code: string; name: string; version: number };
  stages: {
    key: string; name: string; step: number; source: string; action: StageAction; mode: 'EACH' | 'POOL';
    minReviewers: number; maxReviewers: number; allowsReplacement: boolean; status: StageStatus; dueDate: string | null; overdue: boolean; note: string | null;
    assignments: AssignmentView[];
    nominations: NominationView[];
  }[];
  targets: { templateKpiId: string; kpi: string; method: string | null; unitLabel: string | null; target: string | null; threshold: string | null; stretch: string | null; set: boolean }[];
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface TargetInput { templateKpiId: string; target: string | null; threshold: string | null; stretch: string | null }

export const appraisalsApi = {
  get: (id: string) => data(apiClient.get<Envelope<AppraisalDetail>>(`/performance/appraisals/${id}`)),
  setTargets: (id: string, targets: TargetInput[]) => data(apiClient.put<Envelope<AppraisalDetail>>(`/performance/appraisals/${id}/targets`, { targets })),
  assign: (id: string, stageKey: string, input: { tenantMemberId: string; replacesAssignmentId: string | null; reason: string }) =>
    data(apiClient.post<Envelope<AppraisalDetail>>(`/performance/appraisals/${id}/stages/${stageKey}/assignments`, input)),
  cancel: (id: string, reason: string) => data(apiClient.post<Envelope<AppraisalDetail>>(`/performance/appraisals/${id}/cancel`, { reason })),
  /** Any review on the appraisal, read-only, for people who may read every review. */
  review: (assignmentId: string) => data(apiClient.get<Envelope<ReviewForm>>(`/performance/appraisals/reviews/${assignmentId}`)),
};

/* ── Reviews and my appraisals ────────────────────────────── */

export interface FormLine {
  id: string;
  kind: 'KRA' | 'KPI' | 'FIELD';
  kraLibraryId: string | null;
  kraName: string | null;
  code: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  evidence: 'NONE' | 'OPTIONAL' | 'REQUIRED';
  method: string | null;
  measurementType: string | null;
  unitLabel: string | null;
  currencyCode: string | null;
  direction: string | null;
  maxMarks: string | null;
  minMarks: string | null;
  allowsExemption: boolean;
  targetSource: 'TEMPLATE' | 'PER_EMPLOYEE' | null;
  target: string | null;
  threshold: string | null;
  stretch: string | null;
  scale: { kind: 'LEVELS' | 'RANGE' | 'MARKS'; min: string | null; max: string | null; step: string | null; levels: { value: string; label: string }[] } | null;
  field: { type: string; required: boolean; filledBy: string; config: unknown } | null;
}

export interface Answer {
  lineId: string;
  actual: string | null;
  rating: string | null;
  marks: string | null;
  scorePercent: string | null;
  yesNo: boolean | null;
  number: string | null;
  text: string | null;
  options: string[];
  date: string | null;
  exempt: boolean;
  justification: string | null;
  comment: string | null;
}

export interface EvidenceFile { id: string; lineId: string | null; name: string; size?: number }

export interface WrittenReview {
  reviewer: string | null;
  submittedAt: string | null;
  overallComment: string | null;
  items: Answer[];
  files: EvidenceFile[];
}

export interface EarlierStage {
  stage: string;
  mode: 'INDIVIDUAL' | 'AGGREGATE';
  reviews: WrittenReview[];
  combined: { lineId: string; name: string; scorePercent: string | null; reviews: number }[];
}

export interface ReviewForm {
  assignmentId: string;
  appraisalId: string;
  employee: { name: string; code: string; department: string | null; designation: string | null };
  cycle: { name: string; periodStart: string; periodEnd: string };
  stage: { key: string; name: string; action: StageAction; isSelf: boolean; status: StageStatus; dueDate: string | null; allowsDecline: boolean; returnTo: { key: string; name: string }[] };
  assignment: { status: AssignmentStatus; reason: string | null };
  canEdit: boolean;
  /** The lines this stage answers. */
  lines: FormLine[];
  /** Every line of the form, to read earlier reviews against. */
  allLines: FormLine[];
  review: { status: 'DRAFT' | 'SUBMITTED'; overallComment: string | null; submittedAt: string | null; items: Answer[]; files: EvidenceFile[] };
  preview: { scorePercent: string | null; lines: { lineId: string; status: 'SCORED' | 'EXEMPT' | 'MISSING' | 'INVALID'; scorePercent: string | null; steps: string[]; problem: string | null }[] } | null;
  earlier: EarlierStage[];
}

export interface ReadReview extends WrittenReview { stage: string; lines: FormLine[] }

export interface ReviewTask {
  assignmentId: string;
  appraisalId: string;
  employee: { name: string; code: string };
  cycle: string;
  stage: string;
  action: StageAction;
  isSelf: boolean;
  dueDate: string | null;
  overdue: boolean;
  draftSaved: boolean;
  submittedAt: string | null;
  reason: string | null;
}

export interface Inbox {
  toDo: ReviewTask[];
  done: ReviewTask[];
  nominationsToDecide: { id: string; employee: string; nominee: string | null; nominatedBy: string | null }[];
}

export interface MyAppraisalSummary { id: string; status: AppraisalStatus; cycle: string; periodStart: string; periodEnd: string }

export interface MyAppraisal {
  id: string;
  status: AppraisalStatus;
  cycle: { name: string; periodStart: string; periodEnd: string };
  stages: {
    key: string; name: string; step: number; status: StageStatus; dueDate: string | null; isSelf: boolean;
    nominate: { min: number; max: number; needsApproval: boolean; nominations: NominationView[] } | null;
  }[];
  selfAssessment: { assignmentId: string; status: AssignmentStatus } | null;
  readable: { assignmentId: string; stage: string }[];
}

/** One answer as it is sent: only the values its line takes. */
export type AnswerInput = Partial<Omit<Answer, 'lineId'>> & { lineId: string; kind: FormLine['kind'] };

/** Problems the server lists when a review can't be submitted yet. */
export interface SubmitProblem { message: string }

async function upload(path: string, file: File): Promise<ReviewForm> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiFetch(`/api/v1${path}`, { method: 'POST', body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 413 ? 'The file is larger than 10 MB. Upload a smaller copy.' : body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || 'The file could not be uploaded. Try again.');
  }
  return body.data as ReviewForm;
}

export const myPerformanceApi = {
  appraisals: () => data(apiClient.get<Envelope<{ linked: boolean; appraisals: MyAppraisalSummary[] }>>('/performance/my/appraisals')),
  appraisal: (id: string) => data(apiClient.get<Envelope<MyAppraisal>>(`/performance/my/appraisals/${id}`)),
  nominate: (id: string, stageKey: string, tenantMemberIds: string[]) => data(apiClient.post<Envelope<{ nominated: number }>>(`/performance/my/appraisals/${id}/stages/${stageKey}/nominations`, { tenantMemberIds })),
  inbox: () => data(apiClient.get<Envelope<Inbox>>('/performance/my/inbox')),
  decide: (nominationId: string, approve: boolean, note?: string) => data(apiClient.post<Envelope<{ decided: true }>>(`/performance/my/nominations/${nominationId}/decision`, { approve, note })),
  colleagues: (search: string) => data(apiClient.get<Envelope<EmployeeOption[]>>(`/performance/my/colleagues${queryOf({ search })}`)),
  form: (assignmentId: string) => data(apiClient.get<Envelope<ReviewForm>>(`/performance/my/reviews/${assignmentId}`)),
  read: (assignmentId: string) => data(apiClient.get<Envelope<ReadReview>>(`/performance/my/reviews/${assignmentId}/read`)),
  save: (assignmentId: string, overallComment: string | null, items: AnswerInput[]) => data(apiClient.put<Envelope<ReviewForm>>(`/performance/my/reviews/${assignmentId}`, { overallComment, items })),
  submit: (assignmentId: string) => data(apiClient.post<Envelope<ReviewForm>>(`/performance/my/reviews/${assignmentId}/submit`, {})),
  decline: (assignmentId: string, reason: string) => data(apiClient.post<Envelope<{ declined: true }>>(`/performance/my/reviews/${assignmentId}/decline`, { reason })),
  sendBack: (assignmentId: string, toStageKey: string, reason: string) => data(apiClient.post<Envelope<ReviewForm>>(`/performance/my/reviews/${assignmentId}/send-back`, { toStageKey, reason })),
  upload: (assignmentId: string, file: File, line: { lineId: string; kind: FormLine['kind'] } | null) =>
    upload(`/performance/my/reviews/${assignmentId}/files${line ? queryOf({ lineId: line.lineId, kind: line.kind }) : ''}`, file),
  removeFile: (assignmentId: string, fileId: string) => data(apiClient.delete<Envelope<ReviewForm>>(`/performance/my/reviews/${assignmentId}/files/${fileId}`)),
  /** An evidence file's bytes, for whoever may see the review it belongs to. */
  file: (fileId: string) => fetchFile(`/api/v1/performance/my/files/${fileId}?download=1`),
};
