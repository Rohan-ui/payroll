import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { WORKFLOW_VERSION, workflowDefinition } from '../workflows.service';
import { StageDef, WorkflowDef } from '../workflow/workflow-definition';
import { Assignment, AssignmentStatus, currentStep, returnTarget, stageProgress } from '../workflow/workflow-engine';
import { ReviewerResolutionService } from '../workflow/reviewer-resolution.service';

type Tx = Prisma.TransactionClient;
const DAY = 24 * 60 * 60 * 1000;
/** Assignments that count: the reviewer is still on the stage, or has submitted. */
export const LIVE: AssignmentStatus[] = ['ASSIGNED', 'SUBMITTED'];
const NOT_NEEDED = 'Not needed: the stage had the reviews it needed.';

export const today = () => dateOnly(isoDate(new Date()));

/** An appraisal with its workflow, stages and every assignment, oldest first. */
export async function loadRun(tx: Tx, tenantId: string, appraisalId: string) {
  const appraisal = await tx.rndtechnosoft_performance_appraisals.findFirst({
    where: { tenant_id: tenantId, id: appraisalId },
    include: {
      rndtechnosoft_performance_workflow_versions: { include: WORKFLOW_VERSION },
      rndtechnosoft_performance_appraisal_stages: true,
      rndtechnosoft_performance_reviewer_assignments: { orderBy: { created_at: 'asc' } },
    },
  });
  if (!appraisal) throw new NotFoundException('Appraisal not found.');
  const def = workflowDefinition(appraisal.rndtechnosoft_performance_workflow_versions);
  const stages = new Map(appraisal.rndtechnosoft_performance_appraisal_stages.map((s) => [s.stage_key, s]));
  return { appraisal, def, stages, assignments: appraisal.rndtechnosoft_performance_reviewer_assignments };
}

export type Run = Awaited<ReturnType<typeof loadRun>>;

/** Who already reviews in an appraisal (live), by member, with the stage's name. */
export function usedReviewers(run: Run, exceptStageKey?: string) {
  const used = new Map<string, string>();
  for (const a of run.assignments) {
    const stage = [...run.stages.values()].find((s) => s.id === a.appraisal_stage_id);
    if (!stage || stage.stage_key === exceptStageKey || !LIVE.includes(a.assignment_status as AssignmentStatus)) continue;
    const name = run.def.stages.find((s) => s.key === stage.stage_key)?.name ?? stage.stage_key;
    if (!used.has(a.reviewer_tenant_member_id)) used.set(a.reviewer_tenant_member_id, name);
  }
  return used;
}

/**
 * Runs appraisals through their workflow: opening steps with their
 * deadlines, finding and assigning reviewers, and moving on when a step has
 * the reviews it needs. Every change happens inside the caller's transaction
 * with the appraisal locked, and leaves history in place: a reviewer is
 * never edited away, only closed with a reason.
 */
@Injectable()
export class AppraisalRuntimeService {
  constructor(private readonly resolver: ReviewerResolutionService) {}

  async lock(tx: Tx, tenantId: string, appraisalId: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_performance_appraisals WHERE tenant_id = ${tenantId}::uuid AND id = ${appraisalId}::uuid FOR UPDATE`;
  }

  /** Creates an appraisal, its stages and (when the workflow fixes them at launch) every stage's reviewers, and opens its first step. */
  async start(tx: Tx, tenantId: string, input: {
    cycleId: string; employeeId: string; templateVersionId: string; workflowVersionId: string; departmentId: string | null; designationId: string | null; actorMemberId: string;
  }, def: WorkflowDef) {
    const id = randomUUID();
    await tx.rndtechnosoft_performance_appraisals.create({
      data: {
        id, tenant_id: tenantId, cycle_id: input.cycleId, employee_id: input.employeeId, template_version_id: input.templateVersionId,
        workflow_version_id: input.workflowVersionId, department_id: input.departmentId, designation_id: input.designationId,
        current_step: 1, launched_by_tenant_member_id: input.actorMemberId,
      },
    });
    await tx.rndtechnosoft_performance_appraisal_stages.createMany({
      data: def.stages.map((s) => ({ id: randomUUID(), tenant_id: tenantId, appraisal_id: id, stage_key: s.key, step_number: s.step })),
    });
    let run = await loadRun(tx, tenantId, id);
    if (def.resolution === 'AT_LAUNCH') {
      const found = await this.resolver.resolve(tenantId, def, input.employeeId, today());
      for (const res of found.stages) {
        const stage = def.stages.find((s) => s.key === res.stageKey) as StageDef;
        if (res.status === 'RESOLVED') {
          for (const r of res.reviewers) await this.addAssignment(tx, tenantId, run, stage, r.tenantMemberId, r.via, null, null);
        }
        await this.note(tx, tenantId, run, stage.key, res.status === 'RESOLVED' ? null : this.describe(res));
      }
      run = await loadRun(tx, tenantId, id);
    }
    await this.openStep(tx, tenantId, run, 1);
    await this.refresh(tx, tenantId, id);
    return id;
  }

  /** Opens a step: its stages get deadlines and, when found as each opens, their reviewers. */
  async openStep(tx: Tx, tenantId: string, run: Run, step: number) {
    const now = new Date();
    const due = (days: number) => new Date(today().getTime() + days * DAY);
    for (const stage of run.def.stages.filter((s) => s.step === step)) {
      const row = run.stages.get(stage.key);
      if (!row) continue;
      let note: string | null | undefined;
      const live = run.assignments.filter((a) => a.appraisal_stage_id === row.id && LIVE.includes(a.assignment_status as AssignmentStatus));
      if (run.def.resolution === 'AT_STAGE_START' && !live.length && stage.source !== 'NOMINATED' && stage.source !== 'MANUAL') {
        const found = await this.resolver.resolve(tenantId, run.def, run.appraisal.employee_id, today(), { stageKeys: [stage.key], used: usedReviewers(run, stage.key) });
        const res = found.stages[0];
        if (res?.status === 'RESOLVED') {
          for (const r of res.reviewers) await this.addAssignment(tx, tenantId, run, stage, r.tenantMemberId, r.via, null, null);
        }
        note = res && res.status !== 'RESOLVED' ? this.describe(res) : null;
      }
      await tx.rndtechnosoft_performance_appraisal_stages.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: row.id } },
        data: { stage_status: 'OPEN', opened_at: now, due_date: due(stage.dueDays), completed_at: null, ...(note !== undefined ? { resolution_note: note } : {}), updated_at: now },
      });
    }
    await tx.rndtechnosoft_performance_appraisals.update({ where: { tenant_id_id: { tenant_id: tenantId, id: run.appraisal.id } }, data: { current_step: step, updated_at: now } });
  }

  /**
   * Brings an appraisal up to date after anything changed: each open stage's
   * status, and, when the current step has every review it needs, closing it
   * and opening the next, or marking the reviews complete.
   */
  async refresh(tx: Tx, tenantId: string, appraisalId: string) {
    for (let guard = 0; guard < 25; guard += 1) {
      const run = await loadRun(tx, tenantId, appraisalId);
      if (run.appraisal.appraisal_status !== 'IN_PROGRESS') return;
      const byKey: Record<string, Assignment[]> = {};
      for (const [key, row] of run.stages) {
        byKey[key] = run.assignments.filter((a) => a.appraisal_stage_id === row.id).map((a) => ({ reviewerId: a.reviewer_tenant_member_id, status: a.assignment_status as AssignmentStatus }));
      }
      const current = currentStep(run.def, byKey);
      const openStep = run.appraisal.current_step as number;
      const now = new Date();
      if (!current || current.step > openStep) {
        // Every stage of the open step (and any before it) is done: close them.
        for (const stage of run.def.stages.filter((s) => s.step <= (current ? current.step - 1 : Infinity))) {
          const row = run.stages.get(stage.key);
          if (!row || row.stage_status === 'COMPLETE') continue;
          await tx.rndtechnosoft_performance_appraisal_stages.update({ where: { tenant_id_id: { tenant_id: tenantId, id: row.id } }, data: { stage_status: 'COMPLETE', completed_at: now, updated_at: now } });
          await tx.rndtechnosoft_performance_reviewer_assignments.updateMany({
            where: { tenant_id: tenantId, appraisal_stage_id: row.id, assignment_status: 'ASSIGNED' },
            data: { assignment_status: 'CANCELLED', status_reason: NOT_NEEDED, closed_at: now, updated_at: now },
          });
        }
        if (!current) {
          await tx.rndtechnosoft_performance_appraisals.update({
            where: { tenant_id_id: { tenant_id: tenantId, id: appraisalId } },
            data: { appraisal_status: 'REVIEWS_COMPLETE', current_step: null, reviews_completed_at: now, updated_at: now },
          });
          return;
        }
        await this.openStep(tx, tenantId, await loadRun(tx, tenantId, appraisalId), current.step);
        continue;
      }
      for (const { stage, progress } of current.stages) {
        const row = run.stages.get(stage.key);
        if (!row) continue;
        const status = progress.status === 'COMPLETE' ? 'COMPLETE' : progress.status === 'IN_PROGRESS' ? 'OPEN' : 'NEEDS_REVIEWERS';
        if (row.stage_status !== status && row.stage_status !== 'WAITING') {
          await tx.rndtechnosoft_performance_appraisal_stages.update({
            where: { tenant_id_id: { tenant_id: tenantId, id: row.id } },
            data: { stage_status: status, completed_at: status === 'COMPLETE' ? now : null, updated_at: now },
          });
        }
      }
      return;
    }
    throw new ConflictException('The appraisal could not be brought up to date. Try again.');
  }

  /**
   * Adds a reviewer to a stage. Nobody is counted twice in a stage, nor (unless
   * the workflow allows it) in two stages; the database refuses the employee
   * outside their own self-assessment.
   */
  async addAssignment(tx: Tx, tenantId: string, run: Run, stage: StageDef, memberId: string, via: string, assignedBy: string | null, replaces: string | null) {
    const row = run.stages.get(stage.key);
    if (!row) throw new NotFoundException('Stage not found.');
    const live = await tx.rndtechnosoft_performance_reviewer_assignments.findMany({
      where: { tenant_id: tenantId, appraisal_id: run.appraisal.id, assignment_status: { in: LIVE } },
      select: { appraisal_stage_id: true, reviewer_tenant_member_id: true, is_lead: true },
    });
    if (live.some((a) => a.appraisal_stage_id === row.id && a.reviewer_tenant_member_id === memberId)) throw new ConflictException('That person already reviews in this stage.');
    if (stage.source !== 'SELF') {
      const employee = await tx.rndtechnosoft_tenant_members.findFirst({
        where: { tenant_id: tenantId, id: memberId, rndtechnosoft_users: { rndtechnosoft_employees: { some: { tenant_id: tenantId, id: run.appraisal.employee_id } } } }, select: { id: true },
      });
      if (employee) throw new BadRequestException('The employee can’t review their own appraisal outside the self-assessment.');
    }
    if (!run.def.allowRepeatReviewers) {
      const elsewhere = live.find((a) => a.appraisal_stage_id !== row.id && a.reviewer_tenant_member_id === memberId);
      if (elsewhere) {
        const other = [...run.stages.values()].find((s) => s.id === elsewhere.appraisal_stage_id);
        throw new ConflictException(`That person already reviews in ${run.def.stages.find((s) => s.key === other?.stage_key)?.name ?? 'another stage'}, and this workflow doesn’t let one person review twice.`);
      }
    }
    const inStage = live.filter((a) => a.appraisal_stage_id === row.id);
    if (stage.mode === 'EACH' && inStage.length >= stage.maxReviewers) throw new ConflictException(`${stage.name} already has its most reviewers (${stage.maxReviewers}).`);
    const id = randomUUID();
    await tx.rndtechnosoft_performance_reviewer_assignments.create({
      data: {
        id, tenant_id: tenantId, appraisal_id: run.appraisal.id, appraisal_stage_id: row.id, reviewer_tenant_member_id: memberId, found_via: via.slice(0, 160),
        is_lead: stage.mode === 'EACH' && !inStage.some((a) => a.is_lead), assigned_by_tenant_member_id: assignedBy, replaces_assignment_id: replaces,
      },
    }).catch((e) => {
      if (e instanceof Error && e.message.includes('only theirs')) throw new BadRequestException('The employee can only review their own self-assessment, and a self-assessment is only theirs.');
      throw e;
    });
    run.assignments.push({
      id, tenant_id: tenantId, appraisal_id: run.appraisal.id, appraisal_stage_id: row.id, reviewer_tenant_member_id: memberId, assignment_status: 'ASSIGNED', found_via: via,
      is_lead: false, assigned_by_tenant_member_id: assignedBy, replaces_assignment_id: replaces, status_reason: null, assigned_at: new Date(), submitted_at: null, closed_at: null,
      created_at: new Date(), updated_at: new Date(),
    });
    return id;
  }

  /**
   * Sends the appraisal back from a stage to an earlier one. Submitted
   * reviews of the steps it reopens are kept as history (RETURNED) and their
   * reviewers get a fresh draft, prefilled with what they had submitted.
   */
  async sendBack(tx: Tx, tenantId: string, run: Run, fromStageKey: string, toStageKey: string, reason: string) {
    const target = returnTarget(run.def, fromStageKey, toStageKey);
    if ('problem' in target) throw new BadRequestException(target.problem);
    const current = run.appraisal.current_step as number;
    const now = new Date();
    for (const stage of run.def.stages.filter((s) => s.step >= target.step && s.step <= current)) {
      const row = run.stages.get(stage.key);
      if (!row) continue;
      const submitted = run.assignments.filter((a) => a.appraisal_stage_id === row.id && a.assignment_status === 'SUBMITTED');
      for (const old of submitted) {
        await tx.rndtechnosoft_performance_reviewer_assignments.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: old.id } },
          data: { assignment_status: 'RETURNED', status_reason: `Sent back: ${reason}`.slice(0, 500), closed_at: now, updated_at: now },
        });
        const fresh = randomUUID();
        await tx.rndtechnosoft_performance_reviewer_assignments.create({
          data: {
            id: fresh, tenant_id: tenantId, appraisal_id: run.appraisal.id, appraisal_stage_id: row.id, reviewer_tenant_member_id: old.reviewer_tenant_member_id,
            found_via: old.found_via, is_lead: old.is_lead, assigned_by_tenant_member_id: old.assigned_by_tenant_member_id, replaces_assignment_id: old.id,
            status_reason: `Sent back for correction: ${reason}`.slice(0, 500),
          },
        });
        await this.copyReview(tx, tenantId, old.id, fresh);
      }
      await tx.rndtechnosoft_performance_appraisal_stages.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: row.id } },
        data: stage.step === target.step ? { stage_status: 'OPEN', completed_at: null, updated_at: now } : { stage_status: 'WAITING', completed_at: null, updated_at: now },
      });
    }
    const due = new Date(today().getTime());
    for (const stage of run.def.stages.filter((s) => s.step === target.step)) {
      const row = run.stages.get(stage.key);
      if (row) await tx.rndtechnosoft_performance_appraisal_stages.update({ where: { tenant_id_id: { tenant_id: tenantId, id: row.id } }, data: { opened_at: now, due_date: new Date(due.getTime() + stage.dueDays * DAY) } });
    }
    await tx.rndtechnosoft_performance_appraisals.update({ where: { tenant_id_id: { tenant_id: tenantId, id: run.appraisal.id } }, data: { current_step: target.step, updated_at: now } });
    return target.step;
  }

  /** A submitted review copied into a new draft, answers and evidence included. */
  private async copyReview(tx: Tx, tenantId: string, fromAssignmentId: string, toAssignmentId: string) {
    const review = await tx.rndtechnosoft_performance_reviews.findFirst({
      where: { tenant_id: tenantId, assignment_id: fromAssignmentId },
      include: { rndtechnosoft_performance_review_items: true, rndtechnosoft_performance_review_files: true },
    });
    if (!review) return;
    const id = randomUUID();
    await tx.rndtechnosoft_performance_reviews.create({ data: { id, tenant_id: tenantId, assignment_id: toAssignmentId, overall_comment: review.overall_comment } });
    if (review.rndtechnosoft_performance_review_items.length) {
      await tx.rndtechnosoft_performance_review_items.createMany({
        data: review.rndtechnosoft_performance_review_items.map(({ id: _id, review_id: _r, created_at: _c, updated_at: _u, ...item }) => ({ ...item, id: randomUUID(), review_id: id })),
      });
    }
    if (review.rndtechnosoft_performance_review_files.length) {
      await tx.rndtechnosoft_performance_review_files.createMany({
        data: review.rndtechnosoft_performance_review_files.map(({ id: _id, review_id: _r, created_at: _c, ...file }) => ({ ...file, id: randomUUID(), review_id: id })),
      });
    }
  }

  private async note(tx: Tx, tenantId: string, run: Run, stageKey: string, note: string | null) {
    const row = run.stages.get(stageKey);
    if (row) await tx.rndtechnosoft_performance_appraisal_stages.update({ where: { tenant_id_id: { tenant_id: tenantId, id: row.id } }, data: { resolution_note: note } });
  }

  /** Why a stage couldn't be filled, in a line: what finding reviewers said and who was left out. */
  private describe(res: { message: string; leftOut: { name: string; reason: string }[] }) {
    const left = res.leftOut.map((l) => (l.name === '—' ? l.reason : `${l.name} ${l.reason}`));
    return [res.message, ...left].join(' ').slice(0, 500);
  }
}
