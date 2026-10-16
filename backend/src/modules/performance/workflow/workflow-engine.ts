import { Prisma } from '@prisma/client';
import { show } from '../scoring/scoring-methods';
import { requiredCompletions, StageDef, WorkflowDef } from './workflow-definition';

/**
 * How an appraisal moves through a workflow, and how reviewers' ratings
 * combine. Pure functions over the stage definitions and the state of each
 * stage's assignments, so the same rules decide progress wherever they are
 * applied. Ratings stay unrounded decimals; explanations come in words.
 */

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/** Only ASSIGNED and SUBMITTED count; the rest are history (sent back, declined, replaced, not needed). */
export type AssignmentStatus = 'ASSIGNED' | 'SUBMITTED' | 'DECLINED' | 'REPLACED' | 'RETURNED' | 'CANCELLED';
export interface Assignment { reviewerId: string; status: AssignmentStatus }

export type StageStatus = 'NEEDS_REVIEWERS' | 'IN_PROGRESS' | 'COMPLETE' | 'STUCK';
export interface StageProgress {
  status: StageStatus;
  /** Reviewers still on the stage (assigned or done). */
  active: number;
  submitted: number;
  required: number;
  reason: string;
}

/** Where one stage stands, from its assignments. Each reviewer counts once however often they appear. */
export function stageProgress(stage: StageDef, assignments: Assignment[]): StageProgress {
  const latest = new Map<string, AssignmentStatus>();
  for (const a of assignments) {
    // A reviewer who submitted stays submitted; otherwise their latest state counts.
    if (latest.get(a.reviewerId) !== 'SUBMITTED') latest.set(a.reviewerId, a.status);
  }
  const states = [...latest.values()];
  const submitted = states.filter((s) => s === 'SUBMITTED').length;
  const pending = states.filter((s) => s === 'ASSIGNED').length;
  const active = submitted + pending;
  const required = Math.max(requiredCompletions(stage, active), stage.completion === 'ALL' ? stage.minReviewers : 0);

  if (submitted >= required && active >= stage.minReviewers) {
    return { status: 'COMPLETE', active, submitted, required, reason: `${submitted} of ${required} review${required === 1 ? '' : 's'} done` };
  }
  if (submitted + pending < required || active < stage.minReviewers) {
    const short = Math.max(required - (submitted + pending), stage.minReviewers - active);
    return stage.allowsReplacement
      ? { status: 'NEEDS_REVIEWERS', active, submitted, required, reason: `${short} more reviewer${short === 1 ? '' : 's'} needed` }
      : { status: 'STUCK', active, submitted, required, reason: `Can’t be completed: ${short} reviewer${short === 1 ? ' is' : 's are'} missing and replacements aren’t allowed` };
  }
  return { status: 'IN_PROGRESS', active, submitted, required, reason: `${submitted} of ${required} review${required === 1 ? '' : 's'} done` };
}

/** The workflow's steps in order, each with its stages (run side by side). */
export function stepsOf(def: WorkflowDef): StageDef[][] {
  const steps = new Map<number, StageDef[]>();
  for (const stage of def.stages) steps.set(stage.step, [...(steps.get(stage.step) ?? []), stage]);
  return [...steps.entries()].sort(([a], [b]) => a - b).map(([, stages]) => stages);
}

/** The first step not yet complete, or null when every stage is. */
export function currentStep(def: WorkflowDef, assignments: Record<string, Assignment[]>) {
  for (const stages of stepsOf(def)) {
    const progress = stages.map((stage) => ({ stage, progress: stageProgress(stage, assignments[stage.key] ?? []) }));
    if (progress.some((p) => p.progress.status !== 'COMPLETE')) return { step: stages[0].step, stages: progress };
  }
  return null;
}

/**
 * The step a stage may send the appraisal back to, or why it can't. Stages
 * of that step and after it open again; their completed reviews are kept.
 */
export function returnTarget(def: WorkflowDef, fromKey: string, toKey: string): { step: number } | { problem: string } {
  const from = def.stages.find((s) => s.key === fromKey);
  const to = def.stages.find((s) => s.key === toKey);
  if (!from || !to) return { problem: 'That stage is not in this workflow.' };
  if (to.step >= from.step) return { problem: 'An appraisal can only be sent back to an earlier step.' };
  switch (from.returnRule) {
    case 'NONE': return { problem: `${from.name} can’t send the appraisal back.` };
    case 'PREVIOUS_STEP': return to.step === from.step - 1 ? { step: to.step } : { problem: `${from.name} can only send it back one step.` };
    case 'SELF_ASSESSMENT': return to.source === 'SELF' ? { step: to.step } : { problem: `${from.name} can only send it back to the self-assessment.` };
    case 'ANY_EARLIER': return { step: to.step };
  }
}

export interface ReviewerScore { reviewerId: string; percent: Decimal; lead?: boolean }

/** One stage's reviewers combined, by the stage's rule. */
export function combineReviewers(stage: Pick<StageDef, 'name' | 'aggregation'>, scores: ReviewerScore[]): { percent: Decimal; step: string } | null {
  if (!scores.length) return null;
  const values = scores.map((s) => s.percent);
  const list = values.map((v) => `${show(v)}%`).join(', ');
  if (stage.aggregation === 'LEAD_REVIEWER') {
    const lead = scores.find((s) => s.lead) ?? scores[0];
    return { percent: lead.percent, step: `${stage.name}: the lead reviewer’s ${show(lead.percent)}% counts (of ${list})` };
  }
  if (stage.aggregation === 'MEDIAN') {
    const sorted = [...values].sort((a, b) => a.comparedTo(b));
    const mid = Math.floor(sorted.length / 2);
    const percent = sorted.length % 2 ? sorted[mid] : sorted[mid - 1].plus(sorted[mid]).div(2);
    return { percent, step: `${stage.name}: median of ${list} = ${show(percent)}%` };
  }
  const percent = values.reduce((t, v) => t.plus(v), ZERO).div(values.length);
  return { percent, step: `${stage.name}: average of ${list} = ${show(percent)}%` };
}

/**
 * One line's score from the stages that rated it, each weighted by its share
 * of the final score. Stages that didn't rate this line (a peer stage rating
 * only teamwork, say) give their share to those that did, and the
 * explanation says so; stages whose ratings don't count are left out.
 */
export function combineStages(def: WorkflowDef, lineName: string, byStage: Record<string, Decimal | null>): { percent: Decimal | null; steps: string[] } {
  const counted = def.stages.filter((s) => s.action === 'RATE' && s.scoreWeight);
  const rated = counted.filter((s) => byStage[s.key] !== null && byStage[s.key] !== undefined);
  if (!rated.length) return { percent: null, steps: [`No counted stage rated ${lineName}`] };
  const total = rated.reduce((t, s) => t.plus(s.scoreWeight as Decimal), ZERO);
  const percent = rated.reduce((t, s) => t.plus((s.scoreWeight as Decimal).times(byStage[s.key] as Decimal)), ZERO).div(total);
  const steps = [`${lineName} = (${rated.map((s) => `${show(s.scoreWeight as Decimal)} × ${show(byStage[s.key] as Decimal)}% (${s.name})`).join(' + ')}) ÷ ${show(total)} = ${show(percent)}%`];
  const missing = counted.filter((s) => !rated.includes(s));
  if (missing.length) steps.push(`${missing.map((s) => s.name).join(', ')} didn’t rate this, so the others share its weight.`);
  if (!total.eq(HUNDRED) && !missing.length) steps.push('Shares are each stage’s weight of the total counted.');
  return { percent, steps };
}

/** Whether a stage rates a line: everything, its chosen KRAs, or only the questions. */
export function stageRates(stage: Pick<StageDef, 'action' | 'ratedScope' | 'kraIds'>, line: { kind: 'KRA_ITEM'; kraId: string } | { kind: 'QUESTION' }): boolean {
  if (stage.action !== 'RATE') return false;
  if (stage.ratedScope === 'ALL') return true;
  if (stage.ratedScope === 'QUESTIONS_ONLY') return line.kind === 'QUESTION';
  return line.kind === 'KRA_ITEM' && stage.kraIds.includes(line.kraId);
}
