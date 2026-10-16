import type {
  Aggregation, EmployeeSees, EscalateTo, LaterStagesSee, Nominator, RatedScope, ResolutionTiming, ReturnRule, ReviewerIdentity, ReviewerSource, StageAction,
  WorkflowDraft, WorkflowStageInput, WorkflowVersion,
} from '../../api/performance.api';

/**
 * The workflow builder's form: stages as people edit them, with the labels
 * and starting points it offers. The server checks every rule again.
 */

export const SOURCE: Record<ReviewerSource, { label: string; hint: string }> = {
  SELF: { label: 'The employee (self-assessment)', hint: 'Needs the employee linked to a sign-in.' },
  REPORTING_MANAGER: { label: 'Reporting manager', hint: 'From the employee’s reporting line on the date.' },
  SKIP_LEVEL_MANAGER: { label: 'Manager’s manager', hint: 'The reporting manager’s own manager.' },
  DEPARTMENT_HEAD: { label: 'Department head', hint: 'The head of the employee’s department on the date.' },
  DIRECT_REPORTS: { label: 'People who report to the employee', hint: 'For upward (360°) feedback.' },
  SPECIFIC_MEMBERS: { label: 'Chosen people', hint: 'Workspace members you name here.' },
  ROLE_MEMBERS: { label: 'Members of a role', hint: 'Everyone active with the role, such as HR.' },
  NOMINATED: { label: 'Nominated reviewers', hint: 'Named for each appraisal, such as peers.' },
  MANUAL: { label: 'Assigned by an administrator', hint: 'Chosen for each appraisal.' },
};
export const SINGLE_PERSON: ReviewerSource[] = ['SELF', 'REPORTING_MANAGER', 'SKIP_LEVEL_MANAGER', 'DEPARTMENT_HEAD'];

export const ACTION: Record<StageAction, { label: string; hint: string }> = {
  RATE: { label: 'Rate', hint: 'Rates and comments.' },
  REVIEW: { label: 'Review only', hint: 'Sees and comments, may send back; can’t change scores.' },
  APPROVE: { label: 'Final approval', hint: 'Approves the appraisal, in its own last step.' },
};
export const AGGREGATION: Record<Aggregation, string> = { AVERAGE: 'Average', MEDIAN: 'Median', LEAD_REVIEWER: 'The lead reviewer’s rating' };
export const SCOPE: Record<RatedScope, string> = { ALL: 'Everything', SELECTED_KRAS: 'Chosen KRAs only', QUESTIONS_ONLY: 'The questions only' };
export const NOMINATOR: Record<Nominator, string> = { EMPLOYEE: 'The employee', MANAGER: 'The manager', ADMIN: 'An administrator' };
export const RETURN: Record<ReturnRule, string> = {
  NONE: 'Can’t send back', PREVIOUS_STEP: 'To the step before', SELF_ASSESSMENT: 'To the self-assessment', ANY_EARLIER: 'To any earlier step',
};
export const ESCALATE: Record<EscalateTo, string> = { NONE: 'Don’t escalate', DEPARTMENT_HEAD: 'The department head', ROLE: 'Members of a role' };
export const EMPLOYEE_SEES: Record<EmployeeSees, string> = {
  NOTHING: 'Nothing',
  AGGREGATE_AFTER_FINALIZATION: 'Only combined, once finalized',
  INDIVIDUAL_AFTER_FINALIZATION: 'Each rating, once finalized',
  INDIVIDUAL_AFTER_STAGE: 'Each rating, as soon as the stage is done',
};
export const IDENTITY: Record<ReviewerIdentity, string> = { VISIBLE: 'Shown to the employee', HIDDEN_FROM_EMPLOYEE: 'Hidden from the employee (anonymous)' };
export const LATER: Record<LaterStagesSee, string> = { INDIVIDUAL: 'Each rating', AGGREGATE: 'Only combined', NOTHING: 'Nothing' };
export const RESOLUTION: Record<ResolutionTiming, { label: string; hint: string }> = {
  AT_LAUNCH: { label: 'When the appraisal starts', hint: 'Every stage’s reviewers are fixed at launch. A later change of manager doesn’t change them.' },
  AT_STAGE_START: { label: 'As each stage opens', hint: 'Each stage finds its reviewers when it opens, so a new manager reviews.' },
};

export type StageForm = WorkflowStageInput & {
  /** Names of chosen members and KRAs, for showing them. */
  memberNames: Record<string, string>;
  kraNames: Record<string, string>;
};

export interface WorkflowForm { reviewerResolution: ResolutionTiming; allowsRepeatReviewers: boolean; stages: StageForm[]; changeNote: string }

export const EMPTY_WORKFLOW: WorkflowForm = { reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false, stages: [], changeNote: '' };

const BASE: Omit<StageForm, 'key' | 'name' | 'step' | 'source'> = {
  mode: 'EACH', action: 'RATE', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null, aggregation: 'AVERAGE', scoreWeightPercent: null,
  ratedScope: 'ALL', kraIds: [], memberIds: [], roleId: null, nominatedBy: null, nominationNeedsApproval: false, allowsDecline: false, allowsReplacement: true,
  returnRule: 'NONE', dueDays: 14, reminderDays: [3, 1], escalateAfterDays: null, escalateTo: 'NONE', escalationRoleId: null,
  employeeSees: 'INDIVIDUAL_AFTER_FINALIZATION', identity: 'VISIBLE', laterStagesSee: 'INDIVIDUAL', memberNames: {}, kraNames: {},
};

/** Starting points for a new stage; everything can be changed afterwards. */
export const PRESETS: { id: string; label: string; stage: (step: number) => Omit<StageForm, 'key'> }[] = [
  { id: 'self', label: 'Self-assessment', stage: (step) => ({ ...BASE, name: 'Self-assessment', step, source: 'SELF', dueDays: 7, reminderDays: [2] }) },
  { id: 'manager', label: 'Reporting manager review', stage: (step) => ({ ...BASE, name: 'Manager review', step, source: 'REPORTING_MANAGER', returnRule: step > 1 ? 'PREVIOUS_STEP' : 'NONE' }) },
  { id: 'head', label: 'Department head review', stage: (step) => ({ ...BASE, name: 'Department head review', step, source: 'DEPARTMENT_HEAD' }) },
  {
    id: 'peers', label: 'Peer review (nominated, anonymous)',
    stage: (step) => ({
      ...BASE, name: 'Peer review', step, source: 'NOMINATED', nominatedBy: 'EMPLOYEE', nominationNeedsApproval: true, minReviewers: 2, maxReviewers: 5,
      completion: 'AT_LEAST', minCompleted: 2, allowsDecline: true, identity: 'HIDDEN_FROM_EMPLOYEE', employeeSees: 'AGGREGATE_AFTER_FINALIZATION', laterStagesSee: 'AGGREGATE',
    }),
  },
  {
    id: 'hr', label: 'HR approval (any of a role)',
    stage: (step) => ({ ...BASE, name: 'HR approval', step, source: 'ROLE_MEMBERS', mode: 'POOL', maxReviewers: 3, completion: 'AT_LEAST', minCompleted: 1, action: 'APPROVE', returnRule: step > 1 ? 'ANY_EARLIER' : 'NONE' }),
  },
  { id: 'custom', label: 'Another stage', stage: (step) => ({ ...BASE, name: 'Review', step, source: 'MANUAL' }) },
];

/** A stage key from its name, such as “Manager review” → manager_review. */
export function stageKey(name: string, taken: string[]) {
  const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '') || 'stage').slice(0, 36).padEnd(2, '_');
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}_${n}`;
  return key;
}

/**
 * A stage changed, with what no longer fits put right: one person for a
 * single-person source, no number of reviews when everyone must finish, no
 * score share unless it rates, and no names for a source that has none.
 */
export function tidy(stage: StageForm): StageForm {
  const s = { ...stage };
  if (SINGLE_PERSON.includes(s.source)) Object.assign(s, { mode: 'EACH', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null });
  if (s.source === 'SELF') Object.assign(s, { action: 'RATE', allowsDecline: false, identity: 'VISIBLE' });
  if (s.mode === 'POOL' && s.completion === 'ALL') Object.assign(s, { completion: 'AT_LEAST', minCompleted: 1 });
  if (s.mode === 'POOL' && s.aggregation === 'LEAD_REVIEWER') s.aggregation = 'AVERAGE';
  if (s.maxReviewers < s.minReviewers) s.maxReviewers = s.minReviewers;
  if (s.completion === 'ALL') s.minCompleted = null;
  else if (s.minCompleted === null) s.minCompleted = 1;
  if (s.action !== 'RATE') Object.assign(s, { scoreWeightPercent: null, ratedScope: 'ALL', kraIds: [] });
  if (s.ratedScope !== 'SELECTED_KRAS') s.kraIds = [];
  if (s.source !== 'SPECIFIC_MEMBERS') s.memberIds = [];
  if (s.source !== 'ROLE_MEMBERS') s.roleId = null;
  if (s.source !== 'NOMINATED') Object.assign(s, { nominatedBy: null, nominationNeedsApproval: false });
  else if (!s.nominatedBy) s.nominatedBy = 'EMPLOYEE';
  if (s.nominatedBy !== 'EMPLOYEE') s.nominationNeedsApproval = false;
  if (s.escalateTo === 'NONE') Object.assign(s, { escalateAfterDays: null, escalationRoleId: null });
  else if (s.escalateAfterDays === null) s.escalateAfterDays = 2;
  if (s.escalateTo !== 'ROLE') s.escalationRoleId = null;
  return s;
}

export function workflowFormOf(v: WorkflowVersion): WorkflowForm {
  return {
    reviewerResolution: v.reviewerResolution,
    allowsRepeatReviewers: v.allowsRepeatReviewers,
    changeNote: v.status === 'DRAFT' ? v.changeNote ?? '' : '',
    stages: v.stages.map(({ role: _r, escalationRole: _e, members, kras, ...s }) => ({
      ...s,
      memberNames: Object.fromEntries(members.map((m) => [m.id, m.name])),
      kraNames: Object.fromEntries(kras.map((k) => [k.id, `${k.code} · ${k.name}`])),
    })),
  };
}

export function workflowDraftOf(form: WorkflowForm): WorkflowDraft {
  return {
    reviewerResolution: form.reviewerResolution,
    allowsRepeatReviewers: form.allowsRepeatReviewers,
    changeNote: form.changeNote.trim() || undefined,
    stages: form.stages.map(({ memberNames: _m, kraNames: _k, ...s }) => ({ ...s, name: s.name.trim(), scoreWeightPercent: s.scoreWeightPercent?.trim() || null })),
  };
}
