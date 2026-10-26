import { apiClient } from './client';

/**
 * Performance setup: the KRA and KPI libraries, rating scales and department
 * heads. Numbers travel as decimal strings and are never used for arithmetic
 * in the browser; the server works out every score.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}
const data = async <T>(promise: Promise<Envelope<T>>) => (await promise).data;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  /** For libraries: how many items are active and archived, whatever the filters. */
  counts?: { active: number; archived: number };
}

export type LibraryStatus = 'ACTIVE' | 'ARCHIVED';
export type EvidenceRequirement = 'NONE' | 'OPTIONAL' | 'REQUIRED';
export type MeasurementType = 'NUMERIC' | 'PERCENTAGE' | 'CURRENCY' | 'COUNT' | 'DURATION' | 'QUALITY_SCORE' | 'MILESTONE' | 'YES_NO' | 'RATING' | 'QUALITATIVE';
export type Direction = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NOT_APPLICABLE';
export type InputKind = 'LEVELS' | 'RANGE' | 'MARKS';
export type ConversionMethod = 'PROPORTION_OF_MAX' | 'MIN_TO_MAX' | 'LEVEL_PERCENT';

export interface ListQuery {
  search?: string;
  status?: LibraryStatus | 'ALL';
  departmentId?: string;
  designationId?: string;
  page?: number;
  limit?: number;
}

const queryOf = (q: ListQuery) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
};

export interface Named { id: string; name: string }
export interface EmployeeOption { id: string; name: string; code: string }

export const performanceOptionsApi = {
  options: () => data(apiClient.get<Envelope<{ departments: Named[]; designations: Named[] }>>('/performance/options')),
  createDesignation: (name: string) => data(apiClient.post<Envelope<Named>>('/performance/options/designations', { name })),
  employees: (search: string) => data(apiClient.get<Envelope<EmployeeOption[]>>(`/performance/options/employees${queryOf({ search } as ListQuery)}`)),
  /** Workspace members (sign-ins); `code` is their sign-in email. */
  members: (search: string) => data(apiClient.get<Envelope<EmployeeOption[]>>(`/performance/options/members${queryOf({ search } as ListQuery)}`)),
  roles: () => data(apiClient.get<Envelope<Named[]>>('/performance/options/roles')),
};

/* ── KPIs ─────────────────────────────────────────────────── */

export interface KpiSummary {
  id: string;
  kpiCode: string;
  kpiName: string;
  status: LibraryStatus;
  measurementType: MeasurementType;
  unitLabel: string | null;
  currencyCode: string | null;
  direction: Direction;
  defaultTarget: string | null;
  defaultMaxMarks: string | null;
  ratingScaleName: string | null;
  evidenceRequirement: EvidenceRequirement;
  kraCount: number;
}

export interface KpiSettings {
  kpiName: string;
  description: string | null;
  measurementType: MeasurementType;
  unitLabel: string | null;
  currencyCode: string | null;
  direction: Direction;
  defaultTarget: string | null;
  minimumExpected: string | null;
  stretchTarget: string | null;
  defaultMaxMarks: string | null;
  ratingScaleId: string | null;
  evidenceRequirement: EvidenceRequirement;
  evaluationInstructions: string | null;
}

export interface Kpi extends Omit<KpiSettings, 'ratingScaleId'> {
  id: string;
  kpiCode: string;
  ratingScale: { id: string; name: string; status: LibraryStatus } | null;
  usedBy: { kraId: string; kraCode: string; kraName: string; status: LibraryStatus }[];
  status: LibraryStatus;
  revision: number;
  createdBy: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export const kpisApi = {
  list: (q: ListQuery) => data(apiClient.get<Envelope<Page<KpiSummary>>>(`/performance/kpis${queryOf(q)}`)),
  get: (id: string) => data(apiClient.get<Envelope<Kpi>>(`/performance/kpis/${id}`)),
  create: (input: KpiSettings & { kpiCode: string }) => data(apiClient.post<Envelope<Kpi>>('/performance/kpis', input)),
  update: (id: string, input: KpiSettings & { expectedRevision: number }) => data(apiClient.put<Envelope<Kpi>>(`/performance/kpis/${id}`, input)),
  duplicate: (id: string, code: string, name: string) => data(apiClient.post<Envelope<Kpi>>(`/performance/kpis/${id}/duplicate`, { code, name })),
  /** Deletes it for good; refused while anything uses it. */
  remove: (id: string) => data(apiClient.delete<Envelope<{ deleted: true }>>(`/performance/kpis/${id}`)),
  archive: (id: string) => data(apiClient.post<Envelope<Kpi>>(`/performance/kpis/${id}/archive`)),
  restore: (id: string) => data(apiClient.post<Envelope<Kpi>>(`/performance/kpis/${id}/restore`)),
};

/* ── KRAs ─────────────────────────────────────────────────── */

export interface KraSummary {
  id: string;
  kraCode: string;
  kraName: string;
  status: LibraryStatus;
  evidenceRequirement: EvidenceRequirement;
  defaultWeightPercent: string | null;
  defaultMaxMarks: string | null;
  ratingScaleName: string | null;
  kpiCount: number;
  appliesTo: { all: boolean; departments: string[]; designations?: string[]; designationCount: number; employeeCount: number };
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface KraSettings {
  kraName: string;
  description: string | null;
  measurementMethod: string | null;
  evaluationInstructions: string | null;
  evidenceRequirement: EvidenceRequirement;
  defaultWeightPercent: string | null;
  defaultMaxMarks: string | null;
  defaultMinMarks: string | null;
  ratingScaleId: string | null;
  appliesToAll: boolean;
  scopes: { departmentIds: string[]; designationIds: string[]; employeeIds: string[] };
  kpis: { kpiId: string; defaultWeightPercent: string | null }[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface KraKpi {
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  measurementType: MeasurementType;
  status: LibraryStatus;
  defaultWeightPercent: string | null;
  direction: Direction;
  unitLabel: string | null;
  defaultTarget: string | null;
  minimumExpected: string | null;
  stretchTarget: string | null;
  defaultMaxMarks: string | null;
  ratingScaleId: string | null;
}

export interface Kra extends Omit<KraSettings, 'ratingScaleId' | 'scopes' | 'kpis'> {
  id: string;
  kraCode: string;
  ratingScale: { id: string; name: string; status: LibraryStatus } | null;
  scopes: { departments: Named[]; designations: Named[]; employees: EmployeeOption[] };
  kpis: KraKpi[];
  status: LibraryStatus;
  revision: number;
  createdBy: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface StarterResult { kpisCreated: number; krasCreated: number; alreadyThere: number; departmentsNotFound: string[] }

export const krasApi = {
  /** Loads the starter KRA and KPI library (and its 1–5 rating scale); what already exists is left alone. */
  loadStarter: () => data(apiClient.post<Envelope<StarterResult>>('/performance/starter-library', {})),
  list: (q: ListQuery) => data(apiClient.get<Envelope<Page<KraSummary>>>(`/performance/kras${queryOf(q)}`)),
  get: (id: string) => data(apiClient.get<Envelope<Kra>>(`/performance/kras/${id}`)),
  create: (input: KraSettings & { kraCode: string }) => data(apiClient.post<Envelope<Kra>>('/performance/kras', input)),
  update: (id: string, input: KraSettings & { expectedRevision: number }) => data(apiClient.put<Envelope<Kra>>(`/performance/kras/${id}`, input)),
  duplicate: (id: string, code: string, name: string) => data(apiClient.post<Envelope<Kra>>(`/performance/kras/${id}/duplicate`, { code, name })),
  /** Deletes it for good; refused while anything uses it. */
  remove: (id: string) => data(apiClient.delete<Envelope<{ deleted: true }>>(`/performance/kras/${id}`)),
  archive: (id: string) => data(apiClient.post<Envelope<Kra>>(`/performance/kras/${id}/archive`)),
  restore: (id: string) => data(apiClient.post<Envelope<Kra>>(`/performance/kras/${id}/restore`)),
};

/* ── Rating scales ────────────────────────────────────────── */

export interface ScaleLevel { value: string; label: string; description: string | null; scorePercent: string | null }
export interface ScaleBand { label: string; description: string | null; minPercent: string; maxPercent: string }

export interface ScaleDraft {
  inputKind: InputKind;
  conversionMethod: ConversionMethod;
  minValue: string | null;
  maxValue: string | null;
  stepValue: string | null;
  unitLabel: string | null;
  levels: ScaleLevel[];
  bands: ScaleBand[];
  changeNote?: string;
}

export interface ScaleVersion extends Omit<ScaleDraft, 'changeNote'> {
  id: string;
  number: number;
  status: 'DRAFT' | 'PUBLISHED';
  conversion: { value: string; label: string; percent: string | null }[];
  changeNote: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface RatingScaleSummary {
  id: string;
  scaleCode: string;
  scaleName: string;
  description: string | null;
  status: LibraryStatus;
  currentVersion: { number: number; inputKind: InputKind; minValue: string | null; maxValue: string | null; unitLabel: string | null; levelCount: number; bandCount: number } | null;
  draft: { number: number } | null;
}

export interface RatingScale {
  id: string;
  scaleCode: string;
  scaleName: string;
  description: string | null;
  status: LibraryStatus;
  usedBy: { kras: number; kpis: number };
  versions: ScaleVersion[];
}

export const ratingScalesApi = {
  list: (q: ListQuery) => data(apiClient.get<Envelope<Page<RatingScaleSummary>>>(`/performance/rating-scales${queryOf(q)}`)),
  get: (id: string) => data(apiClient.get<Envelope<RatingScale>>(`/performance/rating-scales/${id}`)),
  create: (input: { scaleCode: string; scaleName: string; description: string | null; draft: ScaleDraft }) => data(apiClient.post<Envelope<RatingScale>>('/performance/rating-scales', input)),
  update: (id: string, input: { scaleName: string; description: string | null }) => data(apiClient.put<Envelope<RatingScale>>(`/performance/rating-scales/${id}`, input)),
  saveDraft: (id: string, draft: ScaleDraft) => data(apiClient.put<Envelope<RatingScale>>(`/performance/rating-scales/${id}/draft`, draft)),
  discardDraft: (id: string) => data(apiClient.delete<Envelope<RatingScale>>(`/performance/rating-scales/${id}/draft`)),
  publish: (id: string) => data(apiClient.post<Envelope<RatingScale>>(`/performance/rating-scales/${id}/draft/publish`)),
  /** Deletes it for good; refused while anything uses it. */
  remove: (id: string) => data(apiClient.delete<Envelope<{ deleted: true }>>(`/performance/rating-scales/${id}`)),
  archive: (id: string) => data(apiClient.post<Envelope<RatingScale>>(`/performance/rating-scales/${id}/archive`)),
  restore: (id: string) => data(apiClient.post<Envelope<RatingScale>>(`/performance/rating-scales/${id}/restore`)),
};

/* ── Department heads ─────────────────────────────────────── */

export interface Appointment {
  appointmentId: string;
  employee: EmployeeOption;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'CANCELLED';
}

export interface DepartmentHeads {
  id: string;
  code: string;
  name: string;
  current: Appointment | null;
  upcoming: Appointment | null;
}

export interface AppointmentHistory extends Appointment {
  reason: string | null;
  appointedBy: string | null;
  appointedAt: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export const departmentHeadsApi = {
  list: () => data(apiClient.get<Envelope<DepartmentHeads[]>>('/performance/department-heads')),
  history: (departmentId: string) => data(apiClient.get<Envelope<{ department: Named; appointments: AppointmentHistory[] }>>(`/performance/department-heads/departments/${departmentId}`)),
  appoint: (input: { departmentId: string; employeeId: string; effectiveFrom: string; reason?: string }) => data(apiClient.post<Envelope<DepartmentHeads[]>>('/performance/department-heads', input)),
  end: (id: string, effectiveTo: string) => data(apiClient.post<Envelope<DepartmentHeads[]>>(`/performance/department-heads/${id}/end`, { effectiveTo })),
  cancel: (id: string, reason: string) => data(apiClient.post<Envelope<DepartmentHeads[]>>(`/performance/department-heads/${id}/cancel`, { reason })),
};

/* ── Appraisal templates ──────────────────────────────────── */

export type ScoringModel = 'WEIGHTED' | 'MARKS';
export type WeightRule = 'MUST_TOTAL' | 'NORMALIZE';
export type MissingRule = 'BLOCK' | 'EXCLUDE' | 'ZERO';
export type ScoringMethod = 'PERCENT_OF_TARGET' | 'LINEAR_BETWEEN' | 'SLABS' | 'COMPLETION_PERCENT' | 'YES_NO' | 'RATING_SCALE' | 'DIRECT_MARKS' | 'MANUAL';
export type TargetSource = 'TEMPLATE' | 'PER_EMPLOYEE';
export type FieldType = 'RATING' | 'NUMBER' | 'SHORT_TEXT' | 'LONG_TEXT' | 'YES_NO' | 'DROPDOWN' | 'MULTI_SELECT' | 'DATE' | 'ATTACHMENT' | 'ACHIEVEMENTS' | 'DEVELOPMENT_GOAL';
export type FilledBy = 'SELF' | 'REVIEWERS' | 'BOTH';
export type EmployeeVisibility = 'ALWAYS' | 'AFTER_FINALIZATION' | 'NEVER';

/** A rating scale version pinned by a template line. */
export interface PinnedScale {
  scaleId: string;
  scaleName: string;
  versionId: string;
  versionNumber: number;
  inputKind: InputKind;
  minValue: string | null;
  maxValue: string | null;
  stepValue: string | null;
  levels: { value: string; label: string }[];
  bands: { label: string; minPercent: string; maxPercent: string }[];
}

export interface TemplateKpiLine {
  id: string;
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  description: string | null;
  measurementType: MeasurementType;
  unitLabel: string | null;
  currencyCode: string | null;
  direction: Direction;
  evidenceRequirement: EvidenceRequirement;
  evaluationInstructions: string | null;
  weightPercent: string | null;
  maxMarks: string | null;
  scoringMethod: ScoringMethod;
  scoringConfig: Record<string, unknown>;
  targetSource: TargetSource;
  target: string | null;
  threshold: string | null;
  stretch: string | null;
  ratingScale: PinnedScale | null;
  allowsExemption: boolean;
}

export interface TemplateKraLine {
  id: string;
  kraId: string;
  kraCode: string;
  kraName: string;
  description: string | null;
  measurementMethod: string | null;
  evaluationInstructions: string | null;
  evidenceRequirement: EvidenceRequirement;
  weightPercent: string | null;
  maxMarks: string | null;
  minMarks: string | null;
  scoringMethod: ScoringMethod | null;
  ratingScale: PinnedScale | null;
  allowsExemption: boolean;
  kpis: TemplateKpiLine[];
}

export interface TemplateField {
  id: string;
  key: string;
  type: FieldType;
  label: string;
  description: string | null;
  required: boolean;
  filledBy: FilledBy;
  visibility: EmployeeVisibility;
  config: Record<string, unknown>;
  ratingScale: PinnedScale | null;
  scored: boolean;
  weightPercent: string | null;
  maxMarks: string | null;
}

export interface TemplateProblem { path: string; message: string }

export interface TemplateVersion {
  id: string;
  number: number;
  status: 'DRAFT' | 'PUBLISHED';
  policy: { scoringModel: ScoringModel; weightRule: WeightRule; totalMarks: string | null; missingRatingRule: MissingRule; scoreDecimals: number; finalScale: PinnedScale | null };
  kras: TemplateKraLine[];
  fields: TemplateField[];
  problems: TemplateProblem[];
  changeNote: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface TemplateSummary {
  id: string;
  templateCode: string;
  templateName: string;
  status: LibraryStatus;
  appliesTo: { all: boolean; departments: string[]; designations: string[] };
  currentVersion: { number: number; scoringModel: ScoringModel; kraCount: number; questionCount: number } | null;
  draft: { number: number } | null;
}

export interface Template {
  id: string;
  templateCode: string;
  templateName: string;
  description: string | null;
  status: LibraryStatus;
  appliesToAll: boolean;
  scopes: { departments: Named[]; designations: Named[] };
  versions: TemplateVersion[];
}

export interface TemplateSettings {
  templateName: string;
  description: string | null;
  appliesToAll: boolean;
  scopes: { departmentIds: string[]; designationIds: string[] };
}

export interface TemplateDraft {
  scoringModel: ScoringModel;
  weightRule: WeightRule;
  totalMarks: string | null;
  missingRatingRule: MissingRule;
  scoreDecimals: number;
  finalScaleId: string | null;
  kras: {
    kraId: string; weightPercent: string | null; maxMarks: string | null; minMarks: string | null; scoringMethod: ScoringMethod | null; ratingScaleId: string | null; allowsExemption: boolean;
    kpis: {
      kpiId: string; weightPercent: string | null; maxMarks: string | null; scoringMethod: ScoringMethod; scoringConfig: Record<string, unknown>; targetSource: TargetSource;
      target: string | null; threshold: string | null; stretch: string | null; ratingScaleId: string | null; allowsExemption: boolean;
    }[];
  }[];
  fields: {
    key: string; type: FieldType; label: string; description: string | null; required: boolean; filledBy: FilledBy; visibility: EmployeeVisibility;
    config: Record<string, unknown>; ratingScaleId: string | null; scored: boolean; weightPercent: string | null; maxMarks: string | null;
  }[];
  changeNote?: string;
}

/** What is entered for one line when trying the scoring. */
export interface PreviewInput {
  actual?: string; target?: string; threshold?: string; stretch?: string; rating?: string; marks?: string; value?: string;
  answer?: 'YES' | 'NO'; scorePercent?: string; justification?: string; exempt?: boolean;
}

export interface ScoreLine {
  key: string;
  name: string;
  status: 'SCORED' | 'EXEMPT' | 'MISSING' | 'INVALID';
  scorePercent: string | null;
  weight: string | null;
  sharePercent: string | null;
  marks: string | null;
  maxMarks: string | null;
  contributionPercent: string | null;
  steps: string[];
  problem: string | null;
}

export interface AppraisalScore {
  status: 'COMPLETE' | 'INCOMPLETE' | 'INVALID';
  scorePercent: string | null;
  marks: string | null;
  totalMarks: string | null;
  band: { label: string; description: string | null } | null;
  kras: (ScoreLine & { code: string; kpis: (ScoreLine & { code: string })[] })[];
  fields: ScoreLine[];
  steps: string[];
  problems: string[];
}

export const templatesApi = {
  list: (q: ListQuery) => data(apiClient.get<Envelope<Page<TemplateSummary>>>(`/performance/templates${queryOf(q)}`)),
  get: (id: string) => data(apiClient.get<Envelope<Template>>(`/performance/templates/${id}`)),
  create: (input: TemplateSettings & { templateCode: string }) => data(apiClient.post<Envelope<Template>>('/performance/templates', input)),
  update: (id: string, input: TemplateSettings) => data(apiClient.put<Envelope<Template>>(`/performance/templates/${id}`, input)),
  saveDraft: (id: string, draft: TemplateDraft) => data(apiClient.put<Envelope<Template>>(`/performance/templates/${id}/draft`, draft)),
  discardDraft: (id: string) => data(apiClient.delete<Envelope<Template>>(`/performance/templates/${id}/draft`)),
  publish: (id: string) => data(apiClient.post<Envelope<Template>>(`/performance/templates/${id}/draft/publish`)),
  preview: (id: string, versionId: string, inputs: Record<string, PreviewInput>) =>
    data(apiClient.post<Envelope<AppraisalScore>>(`/performance/templates/${id}/versions/${versionId}/preview`, { inputs })),
  duplicate: (id: string, code: string, name: string) => data(apiClient.post<Envelope<Template>>(`/performance/templates/${id}/duplicate`, { code, name })),
  /** Deletes it for good; refused while anything uses it. */
  remove: (id: string) => data(apiClient.delete<Envelope<{ deleted: true }>>(`/performance/templates/${id}`)),
  archive: (id: string) => data(apiClient.post<Envelope<Template>>(`/performance/templates/${id}/archive`)),
  restore: (id: string) => data(apiClient.post<Envelope<Template>>(`/performance/templates/${id}/restore`)),
};

/* ── Review workflows ─────────────────────────────────────── */

export type ReviewerSource = 'SELF' | 'REPORTING_MANAGER' | 'SKIP_LEVEL_MANAGER' | 'DEPARTMENT_HEAD' | 'DIRECT_REPORTS' | 'SPECIFIC_MEMBERS' | 'ROLE_MEMBERS' | 'NOMINATED' | 'MANUAL';
export type StageAction = 'RATE' | 'REVIEW' | 'APPROVE';
export type AssignmentMode = 'EACH' | 'POOL';
export type CompletionRule = 'ALL' | 'AT_LEAST';
export type Aggregation = 'AVERAGE' | 'MEDIAN' | 'LEAD_REVIEWER';
export type RatedScope = 'ALL' | 'SELECTED_KRAS' | 'QUESTIONS_ONLY';
export type Nominator = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
export type ReturnRule = 'NONE' | 'PREVIOUS_STEP' | 'SELF_ASSESSMENT' | 'ANY_EARLIER';
export type EscalateTo = 'NONE' | 'DEPARTMENT_HEAD' | 'ROLE';
export type EmployeeSees = 'NOTHING' | 'AGGREGATE_AFTER_FINALIZATION' | 'INDIVIDUAL_AFTER_FINALIZATION' | 'INDIVIDUAL_AFTER_STAGE';
export type ReviewerIdentity = 'VISIBLE' | 'HIDDEN_FROM_EMPLOYEE';
export type LaterStagesSee = 'INDIVIDUAL' | 'AGGREGATE' | 'NOTHING';
export type ResolutionTiming = 'AT_LAUNCH' | 'AT_STAGE_START';

export interface WorkflowStageInput {
  key: string;
  name: string;
  step: number;
  source: ReviewerSource;
  mode: AssignmentMode;
  action: StageAction;
  minReviewers: number;
  maxReviewers: number;
  completion: CompletionRule;
  minCompleted: number | null;
  aggregation: Aggregation;
  scoreWeightPercent: string | null;
  ratedScope: RatedScope;
  kraIds: string[];
  memberIds: string[];
  roleId: string | null;
  nominatedBy: Nominator | null;
  nominationNeedsApproval: boolean;
  allowsDecline: boolean;
  allowsReplacement: boolean;
  returnRule: ReturnRule;
  dueDays: number;
  reminderDays: number[];
  escalateAfterDays: number | null;
  escalateTo: EscalateTo;
  escalationRoleId: string | null;
  employeeSees: EmployeeSees;
  identity: ReviewerIdentity;
  laterStagesSee: LaterStagesSee;
}

export interface WorkflowStage extends WorkflowStageInput {
  role: Named | null;
  escalationRole: Named | null;
  members: (Named & { active: boolean })[];
  kras: (Named & { code: string })[];
}

export interface WorkflowVersion {
  id: string;
  number: number;
  status: 'DRAFT' | 'PUBLISHED';
  reviewerResolution: ResolutionTiming;
  allowsRepeatReviewers: boolean;
  stages: WorkflowStage[];
  problems: TemplateProblem[];
  changeNote: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface WorkflowSummary {
  id: string;
  workflowCode: string;
  workflowName: string;
  status: LibraryStatus;
  appliesTo: { all: boolean; departments: string[]; designations: string[] };
  currentVersion: { number: number; stages: { name: string; step: number }[] } | null;
  draft: { number: number } | null;
}

export interface Workflow {
  id: string;
  workflowCode: string;
  workflowName: string;
  description: string | null;
  status: LibraryStatus;
  appliesToAll: boolean;
  scopes: { departments: Named[]; designations: Named[] };
  versions: WorkflowVersion[];
}

export interface WorkflowSettings {
  workflowName: string;
  description: string | null;
  appliesToAll: boolean;
  scopes: { departmentIds: string[]; designationIds: string[] };
}

export interface WorkflowDraft {
  reviewerResolution: ResolutionTiming;
  allowsRepeatReviewers: boolean;
  stages: WorkflowStageInput[];
  changeNote?: string;
}

export interface StageResolution {
  stageKey: string;
  stageName: string;
  step: number;
  status: 'RESOLVED' | 'NEEDS_ASSIGNMENT' | 'NEEDS_NOMINATION' | 'NEEDS_CHOICE';
  reviewers: { tenantMemberId: string; name: string; via: string }[];
  leftOut: { name: string; reason: string }[];
  message: string;
}

export interface Resolution {
  employee: { id: string; name: string };
  onDate: string;
  resolvedAt: ResolutionTiming;
  stages: StageResolution[];
}

export const workflowsApi = {
  list: (q: ListQuery) => data(apiClient.get<Envelope<Page<WorkflowSummary>>>(`/performance/workflows${queryOf(q)}`)),
  get: (id: string) => data(apiClient.get<Envelope<Workflow>>(`/performance/workflows/${id}`)),
  create: (input: WorkflowSettings & { workflowCode: string }) => data(apiClient.post<Envelope<Workflow>>('/performance/workflows', input)),
  update: (id: string, input: WorkflowSettings) => data(apiClient.put<Envelope<Workflow>>(`/performance/workflows/${id}`, input)),
  saveDraft: (id: string, draft: WorkflowDraft) => data(apiClient.put<Envelope<Workflow>>(`/performance/workflows/${id}/draft`, draft)),
  discardDraft: (id: string) => data(apiClient.delete<Envelope<Workflow>>(`/performance/workflows/${id}/draft`)),
  publish: (id: string) => data(apiClient.post<Envelope<Workflow>>(`/performance/workflows/${id}/draft/publish`)),
  resolve: (id: string, versionId: string, employeeId: string, onDate: string) =>
    data(apiClient.post<Envelope<Resolution>>(`/performance/workflows/${id}/versions/${versionId}/resolve`, { employeeId, onDate })),
  duplicate: (id: string, code: string, name: string) => data(apiClient.post<Envelope<Workflow>>(`/performance/workflows/${id}/duplicate`, { code, name })),
  /** Deletes it for good; refused while anything uses it. */
  remove: (id: string) => data(apiClient.delete<Envelope<{ deleted: true }>>(`/performance/workflows/${id}`)),
  archive: (id: string) => data(apiClient.post<Envelope<Workflow>>(`/performance/workflows/${id}/archive`)),
  restore: (id: string) => data(apiClient.post<Envelope<Workflow>>(`/performance/workflows/${id}/restore`)),
};
