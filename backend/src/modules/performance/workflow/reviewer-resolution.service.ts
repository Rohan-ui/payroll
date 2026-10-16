import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { isoDate } from '@/modules/payroll/payroll-lock';
import { requiredCompletions, StageDef, WorkflowDef } from './workflow-definition';
import { stepsOf } from './workflow-engine';

/** A reviewer as found: a workspace member, and how they were found. */
export interface FoundReviewer { tenantMemberId: string; name: string; via: string }
export interface LeftOut { name: string; reason: string }

export type ResolutionStatus = 'RESOLVED' | 'NEEDS_ASSIGNMENT' | 'NEEDS_NOMINATION' | 'NEEDS_CHOICE';

export interface StageResolution {
  stageKey: string;
  stageName: string;
  step: number;
  status: ResolutionStatus;
  reviewers: FoundReviewer[];
  leftOut: LeftOut[];
  message: string;
}

const personName = (e: { first_name: string; last_name: string | null; preferred_name: string | null }) => `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim();
const PERSON = { id: true, first_name: true, last_name: true, preferred_name: true, user_id: true } as const;

/**
 * Who reviews an employee at each stage of a workflow on a date, worked out
 * on the server from the workspace's own records: reporting lines,
 * department heads, roles and chosen members. Reviewers are workspace
 * members; an employee without a linked sign-in can't review. Nobody
 * reviews their own appraisal outside a self-assessment, and nobody is left
 * out silently: each person not used and each stage that can't be filled
 * says why, so it can be flagged for assignment rather than skipped.
 */
@Injectable()
export class ReviewerResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `stageKeys` limits it to some stages (as each opens); `used` holds who
   * already reviews in this appraisal, by stage name, so nobody is counted twice.
   */
  async resolve(
    tenantId: string, def: WorkflowDef, employeeId: string, onDate: Date, opts: { stageKeys?: string[]; used?: Map<string, string> } = {},
  ): Promise<{ employee: { id: string; name: string }; onDate: string; stages: StageResolution[] }> {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: employeeId }, select: PERSON });
    if (!employee) throw new NotFoundException('Employee not found.');
    const ownMember = await this.memberOf(tenantId, employee.user_id);
    const used = new Map<string, string>(opts.used ?? []);
    const results: StageResolution[] = [];

    // Steps in order, and within a step the stages in their order: whoever is found first keeps the place,
    // so one person is never counted twice, even in stages running side by side.
    for (const stages of stepsOf(def)) {
      for (const stage of stages) {
        if (opts.stageKeys && !opts.stageKeys.includes(stage.key)) continue;
        const found = await this.candidates(tenantId, stage, employee, ownMember, onDate);
        const reviewers: FoundReviewer[] = [];
        const leftOut = [...found.leftOut];
        for (const candidate of found.reviewers) {
          if (stage.source !== 'SELF' && candidate.tenantMemberId === ownMember?.id) { leftOut.push({ name: candidate.name, reason: 'can’t review their own appraisal' }); continue; }
          if (reviewers.some((r) => r.tenantMemberId === candidate.tenantMemberId)) continue;
          const earlier = used.get(candidate.tenantMemberId);
          if (earlier && !def.allowRepeatReviewers) { leftOut.push({ name: candidate.name, reason: `already reviews in ${earlier}` }); continue; }
          reviewers.push(candidate);
        }
        reviewers.forEach((r) => { if (!used.has(r.tenantMemberId)) used.set(r.tenantMemberId, stage.name); });
        results.push({ stageKey: stage.key, stageName: stage.name, step: stage.step, ...this.judge(stage, reviewers, found.waitingFor), reviewers, leftOut });
      }
    }
    return { employee: { id: employee.id, name: personName(employee) }, onDate: isoDate(onDate), stages: results };
  }

  /** Whether a stage has the reviewers it needs. */
  private judge(stage: StageDef, reviewers: FoundReviewer[], waitingFor: 'NOMINATION' | 'ASSIGNMENT' | null): { status: ResolutionStatus; message: string } {
    if (waitingFor === 'NOMINATION') {
      const by = stage.nominatedBy === 'EMPLOYEE' ? 'the employee' : stage.nominatedBy === 'MANAGER' ? 'the manager' : 'an administrator';
      return { status: 'NEEDS_NOMINATION', message: `Reviewers are nominated by ${by}${stage.nominationNeedsApproval ? ', then approved' : ''}: ${stage.minReviewers} to ${stage.maxReviewers}.` };
    }
    if (waitingFor === 'ASSIGNMENT' && !reviewers.length) return { status: 'NEEDS_ASSIGNMENT', message: `An administrator assigns ${stage.minReviewers === stage.maxReviewers ? stage.minReviewers : `${stage.minReviewers} to ${stage.maxReviewers}`} reviewer${stage.maxReviewers === 1 ? '' : 's'}.` };
    const n = reviewers.length;
    if (stage.mode === 'POOL') {
      const needed = Math.max(stage.minReviewers, requiredCompletions(stage, n));
      return n < needed
        ? { status: 'NEEDS_ASSIGNMENT', message: `${n} found, but ${needed} ${needed === 1 ? 'is' : 'are'} needed. Assign more reviewers.` }
        : { status: 'RESOLVED', message: `Any of ${n} may take it; ${requiredCompletions(stage, n)} review${requiredCompletions(stage, n) === 1 ? '' : 's'} needed.` };
    }
    if (n < stage.minReviewers) return { status: 'NEEDS_ASSIGNMENT', message: n ? `${n} found, but at least ${stage.minReviewers} are needed. Assign more reviewers.` : 'Nobody was found. Assign a reviewer.' };
    if (n > stage.maxReviewers) return { status: 'NEEDS_CHOICE', message: `${n} found, but at most ${stage.maxReviewers} review. Choose which.` };
    return { status: 'RESOLVED', message: n === 1 ? '1 reviewer.' : `${n} reviewers.` };
  }

  /** The people a stage's source names, before the rules on who may review. */
  private async candidates(
    tenantId: string,
    stage: StageDef,
    employee: { id: string; first_name: string; last_name: string | null; preferred_name: string | null; user_id: string | null },
    ownMember: { id: string; name: string } | null,
    onDate: Date,
  ): Promise<{ reviewers: FoundReviewer[]; leftOut: LeftOut[]; waitingFor: 'NOMINATION' | 'ASSIGNMENT' | null }> {
    const leftOut: LeftOut[] = [];
    const asReviewer = async (person: { first_name: string; last_name: string | null; preferred_name: string | null; user_id: string | null }, via: string) => {
      const member = await this.memberOf(tenantId, person.user_id);
      if (!member) { leftOut.push({ name: personName(person), reason: 'has no linked sign-in account in this workspace' }); return null; }
      return { tenantMemberId: member.id, name: member.name, via };
    };
    const one = async (person: Parameters<typeof asReviewer>[0] | null, via: string, nobody: string) => {
      if (!person) { leftOut.push({ name: '—', reason: nobody }); return { reviewers: [], leftOut, waitingFor: null }; }
      const reviewer = await asReviewer(person, via);
      return { reviewers: reviewer ? [reviewer] : [], leftOut, waitingFor: null };
    };

    switch (stage.source) {
      case 'SELF':
        if (!ownMember) { leftOut.push({ name: personName(employee), reason: 'has no linked sign-in account, so can’t self-assess' }); return { reviewers: [], leftOut, waitingFor: null }; }
        return { reviewers: [{ tenantMemberId: ownMember.id, name: ownMember.name, via: 'The employee' }], leftOut, waitingFor: null };
      case 'REPORTING_MANAGER':
        return one(await this.managerOf(tenantId, employee.id, onDate), 'Reporting manager', 'no reporting manager on that date');
      case 'SKIP_LEVEL_MANAGER': {
        const manager = await this.managerOf(tenantId, employee.id, onDate);
        return one(manager && (await this.managerOf(tenantId, manager.id, onDate)), 'Manager’s manager', manager ? 'the manager has no manager of their own on that date' : 'no reporting manager on that date');
      }
      case 'DEPARTMENT_HEAD': {
        const employment = await this.prisma.rndtechnosoft_employee_employments.findFirst({
          where: { tenant_id: tenantId, employee_id: employee.id, effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }] },
          orderBy: { effective_from: 'desc' },
          select: { department_id: true },
        });
        if (!employment?.department_id) return one(null, 'Department head', 'no department on that date');
        const head = await this.prisma.rndtechnosoft_department_heads.findFirst({
          where: { tenant_id: tenantId, department_id: employment.department_id, appointment_status: 'ACTIVE', effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }] },
          select: { head_employee: { select: PERSON } },
        });
        return one(head?.head_employee ?? null, 'Department head', 'the department has no head on that date');
      }
      case 'DIRECT_REPORTS': {
        const lines = await this.prisma.rndtechnosoft_employee_reporting_lines.findMany({
          where: { tenant_id: tenantId, manager_employee_id: employee.id, relationship_type: 'PRIMARY', line_status: 'ACTIVE', effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }] },
          select: { rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees: { select: PERSON } },
          take: 200,
        });
        const reviewers: FoundReviewer[] = [];
        for (const line of lines) {
          const reviewer = await asReviewer(line.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees, 'Reports to the employee');
          if (reviewer) reviewers.push(reviewer);
        }
        if (!lines.length) leftOut.push({ name: '—', reason: 'nobody reports to the employee on that date' });
        return { reviewers, leftOut, waitingFor: null };
      }
      case 'SPECIFIC_MEMBERS': {
        const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
          where: { tenant_id: tenantId, id: { in: stage.memberIds } },
          select: { id: true, membership_status: true, archived_at: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
        });
        const reviewers: FoundReviewer[] = [];
        for (const id of stage.memberIds) {
          const m = members.find((x) => x.id === id);
          if (!m) continue;
          const memberName = m.rndtechnosoft_users.display_name ?? m.rndtechnosoft_users.email;
          if (m.membership_status !== 'ACTIVE' || m.archived_at) leftOut.push({ name: memberName, reason: 'is no longer an active member' });
          else reviewers.push({ tenantMemberId: m.id, name: memberName, via: 'Chosen for this stage' });
        }
        return { reviewers, leftOut, waitingFor: null };
      }
      case 'ROLE_MEMBERS': {
        const holders = await this.prisma.rndtechnosoft_tenant_member_roles.findMany({
          where: { tenant_id: tenantId, role_id: stage.roleId as string, rndtechnosoft_tenant_members: { membership_status: 'ACTIVE', archived_at: null } },
          select: { rndtechnosoft_tenant_members: { select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } }, rndtechnosoft_roles: { select: { role_name: true } } },
          take: 200,
        });
        const reviewers = holders.map((h) => ({
          tenantMemberId: h.rndtechnosoft_tenant_members.id,
          name: h.rndtechnosoft_tenant_members.rndtechnosoft_users.display_name ?? h.rndtechnosoft_tenant_members.rndtechnosoft_users.email,
          via: `Has the role ${h.rndtechnosoft_roles.role_name}`,
        }));
        if (!reviewers.length) leftOut.push({ name: '—', reason: 'nobody active holds the role' });
        return { reviewers, leftOut, waitingFor: null };
      }
      case 'NOMINATED':
        return { reviewers: [], leftOut, waitingFor: 'NOMINATION' };
      case 'MANUAL':
        return { reviewers: [], leftOut, waitingFor: 'ASSIGNMENT' };
    }
  }

  /** The employee's primary manager on a date. */
  private async managerOf(tenantId: string, employeeId: string, onDate: Date) {
    const line = await this.prisma.rndtechnosoft_employee_reporting_lines.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, relationship_type: 'PRIMARY', line_status: 'ACTIVE', effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }] },
      select: { rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees: { select: PERSON } },
    });
    return line?.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees ?? null;
  }

  /** The active workspace member signed in as this user, if any. */
  private async memberOf(tenantId: string, userId: string | null) {
    if (!userId) return null;
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', archived_at: null },
      select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    return member && { id: member.id, name: member.rndtechnosoft_users.display_name ?? member.rndtechnosoft_users.email };
  }
}
