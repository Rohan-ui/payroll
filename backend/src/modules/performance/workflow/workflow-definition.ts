import { Prisma } from '@prisma/client';

/**
 * A review workflow version as checking and running see it: stages in
 * steps (stages sharing a step run side by side), who reviews in each, how
 * many, what they may do, how their ratings combine, deadlines and who sees
 * what. The rules here decide whether a version may be published; nothing is
 * adjusted to make it fit.
 */

type Decimal = Prisma.Decimal;
const HUNDRED = new Prisma.Decimal(100);

export const REVIEWER_SOURCES = [
  'SELF', 'REPORTING_MANAGER', 'SKIP_LEVEL_MANAGER', 'DEPARTMENT_HEAD', 'DIRECT_REPORTS', 'SPECIFIC_MEMBERS', 'ROLE_MEMBERS', 'NOMINATED', 'MANUAL',
] as const;
export type ReviewerSource = (typeof REVIEWER_SOURCES)[number];
/** Sources that always name one person. */
export const SINGLE_PERSON_SOURCES: ReviewerSource[] = ['SELF', 'REPORTING_MANAGER', 'SKIP_LEVEL_MANAGER', 'DEPARTMENT_HEAD'];

export const ASSIGNMENT_MODES = ['EACH', 'POOL'] as const;
export const STAGE_ACTIONS = ['RATE', 'REVIEW', 'APPROVE'] as const;
export const COMPLETION_RULES = ['ALL', 'AT_LEAST'] as const;
export const AGGREGATIONS = ['AVERAGE', 'MEDIAN', 'LEAD_REVIEWER'] as const;
export const RATED_SCOPES = ['ALL', 'SELECTED_KRAS', 'QUESTIONS_ONLY'] as const;
export const NOMINATORS = ['EMPLOYEE', 'MANAGER', 'ADMIN'] as const;
export const RETURN_RULES = ['NONE', 'PREVIOUS_STEP', 'SELF_ASSESSMENT', 'ANY_EARLIER'] as const;
export const ESCALATE_TO = ['NONE', 'DEPARTMENT_HEAD', 'ROLE'] as const;
export const EMPLOYEE_SEES = ['NOTHING', 'AGGREGATE_AFTER_FINALIZATION', 'INDIVIDUAL_AFTER_FINALIZATION', 'INDIVIDUAL_AFTER_STAGE'] as const;
export const REVIEWER_IDENTITY = ['VISIBLE', 'HIDDEN_FROM_EMPLOYEE'] as const;
export const LATER_STAGES_SEE = ['INDIVIDUAL', 'AGGREGATE', 'NOTHING'] as const;
export const RESOLUTION_TIMINGS = ['AT_LAUNCH', 'AT_STAGE_START'] as const;

export const MAX_STAGES = 15;
export const MAX_REMINDERS = 5;
export const STAGE_KEY = /^[a-z][a-z0-9_]{1,39}$/;

export interface StageDef {
  key: string;
  name: string;
  step: number;
  source: ReviewerSource;
  mode: (typeof ASSIGNMENT_MODES)[number];
  action: (typeof STAGE_ACTIONS)[number];
  minReviewers: number;
  maxReviewers: number;
  completion: (typeof COMPLETION_RULES)[number];
  minCompleted: number | null;
  aggregation: (typeof AGGREGATIONS)[number];
  /** This stage's share of the final score; null for a stage whose ratings don't count. */
  scoreWeight: Decimal | null;
  ratedScope: (typeof RATED_SCOPES)[number];
  kraIds: string[];
  memberIds: string[];
  roleId: string | null;
  nominatedBy: (typeof NOMINATORS)[number] | null;
  nominationNeedsApproval: boolean;
  allowsDecline: boolean;
  allowsReplacement: boolean;
  returnRule: (typeof RETURN_RULES)[number];
  dueDays: number;
  /** Days before the deadline to remind reviewers. */
  reminderDays: number[];
  escalateAfterDays: number | null;
  escalateTo: (typeof ESCALATE_TO)[number];
  escalationRoleId: string | null;
  employeeSees: (typeof EMPLOYEE_SEES)[number];
  identity: (typeof REVIEWER_IDENTITY)[number];
  laterStagesSee: (typeof LATER_STAGES_SEE)[number];
}

export interface WorkflowDef {
  resolution: (typeof RESOLUTION_TIMINGS)[number];
  allowRepeatReviewers: boolean;
  stages: StageDef[];
}

export interface WorkflowProblem {
  path: string;
  message: string;
}

/** The completions a stage needs, given how many reviewers it has. */
export const requiredCompletions = (stage: Pick<StageDef, 'completion' | 'minCompleted'>, assigned: number) =>
  (stage.completion === 'ALL' ? assigned : stage.minCompleted ?? assigned);

/** Every reason this version can't be published yet; empty when it can. */
export function validateWorkflow(def: WorkflowDef): WorkflowProblem[] {
  const problems: WorkflowProblem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });
  const stages = def.stages;

  if (!stages.length) add('stages', 'Add at least one stage.');
  if (stages.length > MAX_STAGES) add('stages', `A workflow has at most ${MAX_STAGES} stages.`);

  // Steps run 1, 2, 3… with none skipped.
  const steps = [...new Set(stages.map((s) => s.step))].sort((a, b) => a - b);
  steps.forEach((step, i) => {
    if (step !== i + 1) add('stages', `Steps must run 1, 2, 3… without gaps; step ${i + 1} has no stage.`);
  });
  const lastStep = steps[steps.length - 1];

  const keys = new Set<string>();
  const selfStages = stages.filter((s) => s.source === 'SELF');
  if (selfStages.length > 1) add('stages', 'A workflow has at most one self-assessment stage.');
  const counted = stages.filter((s) => s.action === 'RATE' && s.scoreWeight);
  if (stages.length && !stages.some((s) => s.action === 'RATE' && s.source !== 'SELF')) add('stages', 'Add at least one stage where someone other than the employee rates.');
  if (stages.length && !counted.length) add('stages', 'At least one rating stage must count toward the final score.');
  const totalWeight = counted.reduce<Decimal>((t, s) => t.plus(s.scoreWeight as Decimal), new Prisma.Decimal(0));
  if (counted.length && !totalWeight.eq(HUNDRED)) add('stages', `The stages that count toward the final score add up to ${totalWeight.toString()}%, not 100%.`);

  stages.forEach((s, i) => {
    const path = `stages.${i}`;
    const name = s.name.trim() || `Stage ${i + 1}`;
    if (!s.name.trim()) add(`${path}.name`, `Stage ${i + 1} needs a name.`);
    if (!STAGE_KEY.test(s.key)) add(`${path}.key`, `${name}: its key is 2 to 40 lowercase letters, digits or underscores, starting with a letter.`);
    if (keys.has(s.key)) add(`${path}.key`, `${name}: another stage uses the key ${s.key}.`);
    keys.add(s.key);

    // Who and how many.
    if (SINGLE_PERSON_SOURCES.includes(s.source) && (s.mode !== 'EACH' || s.minReviewers !== 1 || s.maxReviewers !== 1)) {
      add(`${path}.maxReviewers`, `${name}: ${s.source === 'SELF' ? 'the employee' : 'this reviewer'} is one person, so the stage has exactly one reviewer.`);
    }
    if (s.minReviewers < 1) add(`${path}.minReviewers`, `${name}: at least one reviewer is needed.`);
    if (s.maxReviewers < s.minReviewers) add(`${path}.maxReviewers`, `${name}: the most reviewers can’t be fewer than the least.`);
    if (s.completion === 'AT_LEAST') {
      if (!s.minCompleted || s.minCompleted < 1) add(`${path}.minCompleted`, `${name}: say how many reviews must be done.`);
      else if (s.mode === 'EACH' && s.minCompleted > s.minReviewers) add(`${path}.minCompleted`, `${name}: it needs ${s.minCompleted} reviews but may have only ${s.minReviewers} reviewer${s.minReviewers === 1 ? '' : 's'}. Raise the least reviewers or lower the reviews needed.`);
      else if (s.minCompleted > s.maxReviewers) add(`${path}.minCompleted`, `${name}: it can’t need more reviews than its most reviewers.`);
    }
    if (s.mode === 'POOL' && s.completion !== 'AT_LEAST') add(`${path}.completion`, `${name}: when anyone found may take it, say how many reviews are needed.`);
    if (s.source === 'SPECIFIC_MEMBERS' && !s.memberIds.length) add(`${path}.memberIds`, `${name}: choose the people who review.`);
    if (s.source !== 'SPECIFIC_MEMBERS' && s.memberIds.length) add(`${path}.memberIds`, `${name}: only a stage with chosen people lists them.`);
    if (s.source === 'ROLE_MEMBERS' && !s.roleId) add(`${path}.roleId`, `${name}: choose the role whose members review.`);
    if (s.source === 'NOMINATED' && !s.nominatedBy) add(`${path}.nominatedBy`, `${name}: say who nominates the reviewers.`);
    if (s.nominationNeedsApproval && s.nominatedBy !== 'EMPLOYEE') add(`${path}.nominationNeedsApproval`, `${name}: only nominations by the employee need approving.`);

    // What the stage does.
    if (s.source === 'SELF' && s.action !== 'RATE') add(`${path}.action`, `${name}: a self-assessment is the employee rating themselves.`);
    if (s.action === 'APPROVE' && (s.step !== lastStep || stages.some((o) => o.step === s.step && o.action !== 'APPROVE'))) {
      add(`${path}.step`, `${name}: final approval comes in its own last step, after everyone else has reviewed.`);
    }
    if (s.action !== 'RATE' && s.scoreWeight) add(`${path}.scoreWeight`, `${name} doesn’t rate, so it doesn’t count toward the score.`);
    if (s.scoreWeight && (!s.scoreWeight.gt(0) || s.scoreWeight.gt(HUNDRED))) add(`${path}.scoreWeight`, `${name}: its share of the score is more than 0% and at most 100%.`);
    if (s.action === 'RATE' && s.ratedScope === 'SELECTED_KRAS' && !s.kraIds.length) add(`${path}.kraIds`, `${name}: choose the KRAs it rates.`);
    if (s.ratedScope !== 'SELECTED_KRAS' && s.kraIds.length) add(`${path}.kraIds`, `${name}: KRAs are only chosen when the stage rates selected KRAs.`);
    if (s.aggregation === 'LEAD_REVIEWER' && s.mode !== 'EACH') add(`${path}.aggregation`, `${name}: a lead reviewer needs assigned reviewers, not a pool.`);

    // Sending back.
    if (s.step === 1 && s.returnRule !== 'NONE') add(`${path}.returnRule`, `${name} is in the first step, so there is nothing earlier to send it back to.`);
    if (s.returnRule === 'SELF_ASSESSMENT' && !selfStages.some((self) => self.step < s.step)) add(`${path}.returnRule`, `${name}: there is no earlier self-assessment to send it back to.`);
    if (s.source === 'SELF' && s.allowsDecline) add(`${path}.allowsDecline`, `${name}: the employee can’t decline their own self-assessment.`);

    // Deadlines.
    if (!Number.isInteger(s.dueDays) || s.dueDays < 1 || s.dueDays > 365) add(`${path}.dueDays`, `${name}: the deadline is 1 to 365 days after the stage opens.`);
    if (s.reminderDays.length > MAX_REMINDERS) add(`${path}.reminderDays`, `${name}: at most ${MAX_REMINDERS} reminders.`);
    if (new Set(s.reminderDays).size !== s.reminderDays.length) add(`${path}.reminderDays`, `${name}: a reminder day is listed twice.`);
    if (s.reminderDays.some((d) => !Number.isInteger(d) || d < 1 || d >= s.dueDays)) add(`${path}.reminderDays`, `${name}: reminders are sent 1 day or more before the deadline, after the stage opens.`);
    if ((s.escalateTo === 'NONE') !== (s.escalateAfterDays === null)) add(`${path}.escalateAfterDays`, `${name}: say both whom to escalate to and after how many overdue days.`);
    if (s.escalateAfterDays !== null && (s.escalateAfterDays < 1 || s.escalateAfterDays > 90)) add(`${path}.escalateAfterDays`, `${name}: escalate 1 to 90 days after the deadline.`);
    if ((s.escalateTo === 'ROLE') !== (s.escalationRoleId !== null)) add(`${path}.escalationRoleId`, `${name}: choose the role to escalate to.`);

    // Who sees what. A hidden reviewer must be one of several whose ratings are only shown combined.
    if (s.identity === 'HIDDEN_FROM_EMPLOYEE') {
      if (SINGLE_PERSON_SOURCES.includes(s.source)) {
        add(`${path}.identity`, `${name}: the employee knows who this reviewer is, so the review can’t be anonymous.`);
      } else {
        if (s.employeeSees === 'INDIVIDUAL_AFTER_FINALIZATION' || s.employeeSees === 'INDIVIDUAL_AFTER_STAGE') {
          add(`${path}.employeeSees`, `${name}: an anonymous review can only be shown to the employee combined, or not at all.`);
        }
        if (requiredCompletions(s, s.minReviewers) < 2) add(`${path}.minCompleted`, `${name}: an anonymous review needs at least 2 completed reviews, or one person’s rating could be told apart.`);
      }
    }
  });
  return problems;
}
