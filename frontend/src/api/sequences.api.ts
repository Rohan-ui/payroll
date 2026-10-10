import { apiClient } from './client';

/** Drip sequences (CRM → Email & Marketing): automatic email sequences for CRM leads. */

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type SequenceStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type SenderMode = 'ORGANIZATION' | 'LEAD_OWNER';
export type DelayUnit = 'WORKING_DAYS' | 'CALENDAR_DAYS';
export type SendStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'UNCERTAIN' | 'CANCELLED' | 'BOUNCED';

export interface Readiness {
  organizationSender: { email: string; name: string | null } | null;
  organizationProblem: string | null;
  personalAccountsAllowed: boolean;
  unsubscribeAvailable: boolean;
}

export interface SequenceOverview {
  sequences: { total: number; active: number; draft: number; paused: number; archived: number };
  enrolled: number;
  sent: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  scheduledToday: number;
  needsAttention: { failed: number; uncertain: number; waitingForSender: number; total: number };
  timeZone: string;
  readiness: Readiness;
  placeholders: { key: string; description: string }[];
  conditionFields: { key: string; label: string }[];
  conditionOperators: string[];
}

export interface SequenceSummary {
  id: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  senderMode: SenderMode;
  steps: number;
  enrolled: number;
  sent: number;
  replied: number;
  updatedAt: string;
}

export interface SequenceStep {
  /** Absent for a step not saved yet. */
  id?: string;
  order?: number;
  stepName: string;
  delayAmount: number;
  delayUnit: DelayUnit;
  templateId: string | null;
  templateName?: string | null;
  subject: string;
  body: string;
  enabled: boolean;
}

export type ConditionOperator = 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'IN' | 'IS_EMPTY' | 'IS_NOT_EMPTY';
export interface RuleCondition { field: string; operator: ConditionOperator; value?: string | string[] }
export interface RuleConditions { match: 'ALL' | 'ANY'; conditions: RuleCondition[] }

export interface SequenceRule {
  id: string;
  name: string;
  triggerKind: 'LEAD_CREATED' | 'STAGE_ENTERED';
  pipelineId: string | null;
  stageId: string | null;
  sourceId: string | null;
  pipelineName: string | null;
  stageName: string | null;
  sourceName: string | null;
  conditions: RuleConditions;
  enabled: boolean;
  enabledAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  enrolled: number;
}

export interface SequenceRuleInput {
  name: string;
  triggerKind: 'LEAD_CREATED' | 'STAGE_ENTERED';
  pipelineId?: string | null;
  stageId?: string | null;
  sourceId?: string | null;
  conditions: RuleConditions;
}

export interface SequenceDetail {
  id: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  senderMode: SenderMode;
  weekdays: number[];
  windowStart: number;
  windowEnd: number;
  skipHolidays: boolean;
  dailyLimit: number;
  version: number;
  activatedAt: string | null;
  pausedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: SequenceStep[];
  stopStageIds: string[];
  rules: SequenceRule[];
  activationProblems: string[];
  replyDetection: { available: boolean; note: string; mailboxProblems: { mailbox: string; problem: string | null; checkedAt: string | null }[] };
  readiness: Readiness;
  summary: string;
}

export interface SequenceInput {
  name: string;
  description?: string;
  senderMode: SenderMode;
  weekdays: number[];
  windowStart: number;
  windowEnd: number;
  skipHolidays: boolean;
  dailyLimit: number;
  stopStageIds: string[];
  steps: SequenceStep[];
}

export interface EnrollmentRow {
  id: string;
  status: 'ACTIVE' | 'COMPLETED' | 'STOPPED';
  enrolledVia: 'MANUAL' | 'BULK' | 'RULE';
  enrolledAt: string;
  stopReason: string | null;
  stopReasonText: string | null;
  stopDetail: string | null;
  stoppedAt: string | null;
  completedAt: string | null;
  lead: { id: string; company: string; name: string; email: string };
  sent: number;
  replied: boolean;
  next: { sendId: string; status: SendStatus; at: string; step: string; problem: string | null; problemCode: string | null } | null;
}

export interface Page<T> { items: T[]; page: number; limit: number; total: number }

export interface EnrollPreview {
  sequence: { id: string; name: string; status: SequenceStatus };
  eligible: number;
  leads: { leadId: string; company: string; name: string; email: string; eligible: boolean; reason: string | null; code: string | null; firstSendAt: string | null }[];
  firstEmail: { subject: string; body: string; missing: string[] } | null;
  firstStep: string | null;
  timeZone: string;
}

export interface EnrollResult { enrolled: number; skipped: { leadId: string; company: string; reason: string }[]; firstSendAt: string | null }

export interface SendRow {
  id: string;
  status: SendStatus;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  attempts: number;
  problemCode: string | null;
  problem: string | null;
  cancelReason: string | null;
  bounceKind: string | null;
  sequence: { id: string; name: string };
  step: string;
  lead: { id: string; company: string; name: string };
  recipient: string;
  sender: string | null;
  senderKind: string | null;
  subject: string | null;
  messageId: string | null;
  /** Only with permission to read sent emails. */
  body: string | null;
  events: { kind: 'REPLY' | 'AUTO_REPLY' | 'BOUNCE'; from: string | null; subject: string | null; at: string; bounceKind: string | null; detail: string | null }[];
}

export interface StepReport {
  stepId: string;
  order: number;
  name: string;
  removed: boolean;
  enabled: boolean;
  scheduled: number;
  sent: number;
  failed: number;
  uncertain: number;
  bounced: number;
  replied: number;
  cancelled: number;
  replyRate: number | null;
}

export interface SequenceReport {
  range: { from: string | null; to: string | null };
  enrollments: { enrolled: number; inProgress: number; completed: number; stopped: number; stoppedBy: Record<string, number> };
  totals: { sent: number; replied: number; bounced: number; failed: number; scheduled: number; unsubscribed: number; replyRate: number | null };
  steps: StepReport[];
}

export interface Suppression {
  id: string;
  email: string;
  reason: 'UNSUBSCRIBED' | 'BOUNCED' | 'MANUAL';
  source: string;
  note: string | null;
  createdAt: string;
  addedBy: string | null;
  removable: boolean;
}

export interface LeadSequences {
  enrollments: {
    id: string;
    status: 'ACTIVE' | 'COMPLETED' | 'STOPPED';
    sequence: { id: string; name: string; status: SequenceStatus };
    enrolledAt: string;
    stopReason: string | null;
    stoppedAt: string | null;
    completedAt: string | null;
    emails: { id: string; status: SendStatus; step: string; scheduledAt: string; sentAt: string | null; subject: string | null; problem: string | null }[];
  }[];
  available: { id: string; name: string; status: SequenceStatus }[];
}

export interface SequenceOptions {
  pipelines: { id: string; name: string; stages: { id: string; name: string; isWon: boolean; isLost: boolean }[] }[];
  sources: { id: string; name: string }[];
  templates: { id: string; name: string; subject: string; body: string }[];
}

export interface RuleDryRun {
  windowDays: number;
  leads: { leadId: string; company: string; name: string; email: string; eventAt: string; wouldEnroll: boolean; reason: string | null }[];
  note: string;
}

const query = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  const text = q.toString();
  return text ? `?${text}` : '';
};
const data = <T>(p: Promise<Envelope<T>>) => p.then((r) => r.data);
const BASE = '/email-sequences';

export const sequencesApi = {
  overview: () => data(apiClient.get<Envelope<SequenceOverview>>(`${BASE}/overview`)),
  options: () => data(apiClient.get<Envelope<SequenceOptions>>(`${BASE}/options`)),
  list: (status?: SequenceStatus) => data(apiClient.get<Envelope<SequenceSummary[]>>(`${BASE}${query({ status })}`)),
  get: (id: string) => data(apiClient.get<Envelope<SequenceDetail>>(`${BASE}/${id}`)),
  create: (input: SequenceInput) => data(apiClient.post<Envelope<SequenceDetail>>(BASE, input)),
  update: (id: string, input: SequenceInput) => data(apiClient.put<Envelope<SequenceDetail>>(`${BASE}/${id}`, input)),
  activate: (id: string) => data(apiClient.post<Envelope<SequenceDetail>>(`${BASE}/${id}/activate`)),
  pause: (id: string) => data(apiClient.post<Envelope<SequenceDetail>>(`${BASE}/${id}/pause`)),
  archive: (id: string) => data(apiClient.post<Envelope<SequenceDetail>>(`${BASE}/${id}/archive`)),
  preview: (subject: string, body: string, leadId?: string) => data(apiClient.post<Envelope<{ subject: string; body: string; sample: boolean; missing: string[]; unknown: string[] }>>(`${BASE}/preview`, { subject, body, ...(leadId ? { leadId } : {}) })),
  testEmail: (id: string, stepId: string) => data(apiClient.post<Envelope<{ sentTo: string; from: string }>>(`${BASE}/${id}/test-email`, { stepId })),
  report: (id: string, from?: string, to?: string) => data(apiClient.get<Envelope<SequenceReport>>(`${BASE}/${id}/report${query({ from, to })}`)),
  retryFailed: (id: string) => data(apiClient.post<Envelope<{ retried: number }>>(`${BASE}/${id}/retry-failed`)),
  enrollments: (id: string, params: { status?: string; search?: string; page?: number; limit?: number } = {}) => data(apiClient.get<Envelope<Page<EnrollmentRow>>>(`${BASE}/${id}/enrollments${query(params)}`)),
  enrollPreview: (id: string, leadIds: string[], moveFromOutreach = false) => data(apiClient.post<Envelope<EnrollPreview>>(`${BASE}/${id}/enrollments/preview`, { leadIds, moveFromOutreach })),
  enroll: (id: string, leadIds: string[], moveFromOutreach = false) =>
    data(apiClient.post<Envelope<EnrollResult>>(`${BASE}/${id}/enrollments${leadIds.length > 1 ? '/bulk' : ''}`, { leadIds, moveFromOutreach })),
  stopEnrollment: (enrollmentId: string, moveToOutreach = false, note?: string) => data(apiClient.post<Envelope<{ stopped: true; movedToOutreach: boolean }>>(`${BASE}/enrollments/${enrollmentId}/stop`, { moveToOutreach, ...(note ? { note } : {}) })),
  forLead: (leadId: string) => data(apiClient.get<Envelope<LeadSequences>>(`${BASE}/leads/${leadId}`)),
  sends: (params: { sequenceId?: string; status?: string; from?: string; to?: string; page?: number; limit?: number } = {}) => data(apiClient.get<Envelope<Page<SendRow>>>(`${BASE}/sends${query(params)}`)),
  retrySend: (sendId: string) => data(apiClient.post<Envelope<{ scheduledAt: string }>>(`${BASE}/sends/${sendId}/retry`)),
  markSent: (sendId: string) => data(apiClient.post<Envelope<{ marked: true }>>(`${BASE}/sends/${sendId}/mark-sent`)),
  createRule: (id: string, input: SequenceRuleInput) => data(apiClient.post<Envelope<SequenceRule[]>>(`${BASE}/${id}/rules`, input)),
  updateRule: (id: string, ruleId: string, input: SequenceRuleInput) => data(apiClient.put<Envelope<SequenceRule[]>>(`${BASE}/${id}/rules/${ruleId}`, input)),
  setRuleEnabled: (id: string, ruleId: string, enabled: boolean) => data(apiClient.post<Envelope<SequenceRule[]>>(`${BASE}/${id}/rules/${ruleId}/${enabled ? 'enable' : 'disable'}`)),
  deleteRule: (id: string, ruleId: string) => data(apiClient.delete<Envelope<SequenceRule[]>>(`${BASE}/${id}/rules/${ruleId}`)),
  dryRunRule: (id: string, ruleId: string) => data(apiClient.post<Envelope<RuleDryRun>>(`${BASE}/${id}/rules/${ruleId}/dry-run`)),
  suppressions: (params: { search?: string; reason?: string; page?: number; limit?: number } = {}) => data(apiClient.get<Envelope<Page<Suppression>>>(`${BASE}/suppressions${query(params)}`)),
  addSuppressions: (emails: string[], note?: string) => data(apiClient.post<Envelope<{ added: number; alreadyListed: number }>>(`${BASE}/suppressions`, { emails, ...(note ? { note } : {}) })),
  removeSuppression: (id: string) => data(apiClient.delete<Envelope<{ removed: true }>>(`${BASE}/suppressions/${id}`)),
};
