import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import {
  CANDIDATE_STATUS_LABELS,
  CandidateStatus,
  isCandidateStatus,
  manualMoves,
  refuseManualMove,
  refuseOverride,
} from './onboarding-workflow';
import {
  CandidateInputDto,
  ConvertToEmployeeDto,
  ListCandidatesQueryDto,
  MoveCandidateDto,
  OverrideCandidateStatusDto,
} from './dto/onboarding.dto';

type Tx = Prisma.TransactionClient;

export interface CandidateEventInput {
  type: string;
  summary: string;
  from?: CandidateStatus | null;
  to?: CandidateStatus | null;
  notes?: string | null;
  isOverride?: boolean;
  actorMemberId?: string | null;
  metadata?: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const memberName = (member: { rndtechnosoft_users?: { display_name: string | null; email: string } | null } | null | undefined) =>
  member?.rndtechnosoft_users ? member.rndtechnosoft_users.display_name || member.rndtechnosoft_users.email : null;

const MEMBER_WITH_USER = { select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Reading ──────────────────────────────────────────────────

  async list(tenantId: string, query: ListCandidatesQueryDto) {
    const where: Prisma.rndtechnosoft_candidatesWhereInput = { tenant_id: tenantId };
    if (query.archived === 'active') where.archived_at = null;
    if (query.archived === 'archived') where.archived_at = { not: null };
    if (query.status) where.candidate_status = query.status;
    if (query.departmentId) where.department_id = query.departmentId;
    if (query.recruiterMemberId) where.recruiter_tenant_member_id = query.recruiterMemberId;
    if (query.documents === 'to_verify') {
      where.rndtechnosoft_candidate_document_requests = { some: { rndtechnosoft_candidate_document_files: { some: { review_status: 'PENDING_REVIEW' } } } };
    }
    if (query.joiningFrom || query.joiningTo) {
      where.expected_joining_date = {
        ...(query.joiningFrom ? { gte: new Date(query.joiningFrom) } : {}),
        ...(query.joiningTo ? { lte: new Date(query.joiningTo) } : {}),
      };
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { full_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { candidate_code: { contains: search, mode: 'insensitive' } },
        { applied_position: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_candidates.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          rndtechnosoft_departments: { select: { department_name: true } },
          recruiter: MEMBER_WITH_USER,
          rndtechnosoft_interviews: {
            where: { interview_status: 'SCHEDULED' },
            orderBy: { scheduled_start: 'asc' },
            take: 1,
            select: { id: true, scheduled_start: true, round_number: true, timezone: true },
          },
        },
      }),
      this.prisma.rndtechnosoft_candidates.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.toSummary(row),
        nextInterview: row.rndtechnosoft_interviews[0] ?? null,
      })),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  /** One candidate with timeline and interviews; `isMine` marks interviews the viewer is on. */
  async get(tenantId: string, id: string, viewerMemberId?: string) {
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: this.idOr404(id) },
      include: {
        rndtechnosoft_departments: { select: { department_name: true } },
        rndtechnosoft_designations: { select: { designation_name: true } },
        rndtechnosoft_employment_types: { select: { employment_type_name: true } },
        recruiter: MEMBER_WITH_USER,
        rndtechnosoft_candidate_events: {
          orderBy: { created_at: 'desc' },
          take: 200,
          include: { rndtechnosoft_tenant_members: MEMBER_WITH_USER },
        },
        rndtechnosoft_interviews: {
          orderBy: [{ round_number: 'asc' }, { created_at: 'asc' }],
          include: {
            decided_by: MEMBER_WITH_USER,
            rndtechnosoft_interview_panelists: { include: { rndtechnosoft_tenant_members: MEMBER_WITH_USER } },
          },
        },
        rndtechnosoft_offers: {
          orderBy: { created_at: 'desc' },
          select: { id: true, offer_code: true, offer_status: true, job_title: true, annual_ctc: true, joining_date: true, updated_at: true },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    const status = candidate.candidate_status as CandidateStatus;

    let linkedEmployee: {
      id: string;
      employeeCode: string;
      firstName: string;
      lastName: string | null;
      name: string;
      workEmail: string | null;
      employeeStatus: string;
      hireDate: Date | null;
      cosecMapping: {
        cosecEmployeeId: string | null;
        mappingStatus: string;
        mappingSource: string;
        verificationStatus: string;
        lastSyncedAt: Date | null;
        lastSyncResult: string | null;
      } | null;
    } | null = null;

    if (candidate.employee_id) {
      const emp = await this.prisma.rndtechnosoft_employees.findFirst({
        where: { id: candidate.employee_id, tenant_id: tenantId },
        select: {
          id: true,
          employee_code: true,
          first_name: true,
          last_name: true,
          employee_status: true,
          work_email: true,
          hire_date: true,
        },
      });
      if (emp) {
        const mapping = await this.prisma.rndtechnosoft_employee_cosec_mappings.findUnique({
          where: {
            tenant_id_employee_id: {
              tenant_id: tenantId,
              employee_id: emp.id,
            },
          },
        });
        linkedEmployee = {
          id: emp.id,
          employeeCode: emp.employee_code,
          firstName: emp.first_name,
          lastName: emp.last_name,
          name: `${emp.first_name} ${emp.last_name || ''}`.trim(),
          workEmail: emp.work_email,
          employeeStatus: emp.employee_status,
          hireDate: emp.hire_date,
          cosecMapping: mapping
            ? {
                cosecEmployeeId: mapping.cosec_employee_id,
                mappingStatus: mapping.mapping_status,
                mappingSource: mapping.mapping_source,
                verificationStatus: mapping.verification_status,
                lastSyncedAt: mapping.last_synced_at,
                lastSyncResult: mapping.last_sync_result,
              }
            : null,
        };
      }
    }

    return {
      ...this.toSummary(candidate),
      designationName: candidate.rndtechnosoft_designations?.designation_name ?? null,
      employmentTypeName: candidate.rndtechnosoft_employment_types?.employment_type_name ?? null,
      address: candidate.address,
      notes: candidate.notes,
      designationId: candidate.designation_id,
      employmentTypeId: candidate.employment_type_id,
      employeeId: candidate.employee_id,
      linkedEmployee,
      manualMoves: candidate.archived_at ? [] : manualMoves(status),
      timeline: candidate.rndtechnosoft_candidate_events.map((event) => ({
        id: event.id,
        type: event.event_type,
        summary: event.summary,
        notes: event.notes,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        isOverride: event.is_override,
        actorName: memberName(event.rndtechnosoft_tenant_members),
        metadata: event.metadata,
        createdAt: event.created_at,
      })),
      offers: candidate.rndtechnosoft_offers.map((offer) => ({
        id: offer.id,
        offerCode: offer.offer_code,
        status: offer.offer_status,
        jobTitle: offer.job_title,
        annualCtc: offer.annual_ctc.toFixed(2),
        joiningDate: offer.joining_date.toISOString().slice(0, 10),
        updatedAt: offer.updated_at,
      })),
      interviews: candidate.rndtechnosoft_interviews.map((interview) => ({
        id: interview.id,
        roundNumber: interview.round_number,
        roundName: interview.round_name,
        interviewType: interview.interview_type,
        startsAt: interview.scheduled_start,
        durationMinutes: interview.duration_minutes,
        timezone: interview.timezone,
        location: interview.location,
        meetingLink: interview.meeting_link,
        instructions: interview.instructions,
        status: interview.interview_status,
        cancelReason: interview.cancel_reason,
        decision: interview.decision,
        decisionNotes: interview.decision_notes,
        decidedBy: memberName(interview.decided_by),
        decidedAt: interview.decided_at,
        isMine: Boolean(viewerMemberId) && interview.rndtechnosoft_interview_panelists.some((panelist) => panelist.tenant_member_id === viewerMemberId),
        panel: interview.rndtechnosoft_interview_panelists.map((panelist) => ({
          memberId: panelist.tenant_member_id,
          name: memberName(panelist.rndtechnosoft_tenant_members),
          rating: panelist.feedback_rating,
          recommendation: panelist.feedback_recommendation,
          notes: panelist.feedback_notes,
          submittedAt: panelist.feedback_submitted_at,
        })),
      })),
    };
  }

  /** Choices for the candidate and interview forms, all from this workspace. */
  async meta(tenantId: string) {
    const [departments, designations, employmentTypes, members] = await Promise.all([
      this.prisma.rndtechnosoft_departments.findMany({
        where: { tenant_id: tenantId, archived_at: null },
        orderBy: { department_name: 'asc' },
        select: { id: true, department_name: true },
      }),
      this.prisma.rndtechnosoft_designations.findMany({
        where: { tenant_id: tenantId, archived_at: null },
        orderBy: { designation_name: 'asc' },
        select: { id: true, designation_name: true },
      }),
      this.prisma.rndtechnosoft_employment_types.findMany({
        where: { tenant_id: tenantId, employment_type_status: 'ACTIVE' },
        orderBy: { employment_type_name: 'asc' },
        select: { id: true, employment_type_name: true, description: true },
      }),
      this.prisma.rndtechnosoft_tenant_members.findMany({
        where: { tenant_id: tenantId, membership_status: 'ACTIVE', archived_at: null },
        select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
      }),
    ]);
    return {
      departments: departments.map((d) => ({ id: d.id, name: d.department_name })),
      designations: designations.map((d) => ({ id: d.id, name: d.designation_name })),
      employmentTypes: employmentTypes.map((t) => ({ id: t.id, name: t.employment_type_name, description: t.description })),
      members: members
        .map((m) => ({ id: m.id, name: m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email, email: m.rndtechnosoft_users.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Active employees matching a search, for choosing a reporting manager: at most 20. */
  async searchEmployees(tenantId: string, search: string) {
    const term = search.trim();
    const rows = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        employee_status: 'ACTIVE',
        archived_at: null,
        ...(term
          ? { OR: [{ first_name: { contains: term, mode: 'insensitive' } }, { last_name: { contains: term, mode: 'insensitive' } }, { employee_code: { contains: term, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
      take: 20,
      select: { id: true, employee_code: true, first_name: true, last_name: true },
    });
    return rows.map((e) => ({ id: e.id, code: e.employee_code, name: [e.first_name, e.last_name].filter(Boolean).join(' ') }));
  }

  // ── Changing ─────────────────────────────────────────────────

  async create(tenantId: string, input: CandidateInputDto, actor: AuthenticatedTenantUser) {
    const data = await this.candidateData(tenantId, input);
    await this.assertEmailFree(tenantId, data.email);

    const id = randomUUID();
    const candidate = await this.withCandidateCode((code) =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.rndtechnosoft_candidates.create({
          data: { id, tenant_id: tenantId, candidate_code: code, candidate_status: 'NEW', created_by_tenant_member_id: actor.tenantMemberId, ...data },
        });
        await this.recordEvent(tx, tenantId, id, {
          type: 'CREATED',
          summary: `Candidate added for ${data.applied_position}`,
          to: 'NEW',
          actorMemberId: actor.tenantMemberId,
        });
        return created;
      }),
    );
    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_CANDIDATE_CREATED',
      entityType: 'CANDIDATE',
      entityId: candidate.id,
      newValues: { candidateCode: candidate.candidate_code, appliedPosition: candidate.applied_position },
    });
    return this.get(tenantId, candidate.id, actor.tenantMemberId);
  }

  async update(tenantId: string, id: string, input: CandidateInputDto, actor: AuthenticatedTenantUser) {
    const candidateId = this.idOr404(id);
    const data = await this.candidateData(tenantId, input, candidateId);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockCandidate(tx, tenantId, candidateId);
      if (current.archived_at) throw new ConflictException('Restore the candidate before editing.');
      if (data.email !== current.email.toLowerCase()) await this.assertEmailFree(tenantId, data.email, candidateId);
      const changed = (Object.keys(data) as (keyof typeof data)[]).filter((key) => String(data[key] ?? '') !== String((current as Record<string, unknown>)[key] ?? ''));
      await tx.rndtechnosoft_candidates.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: candidateId } },
        data: { ...data, updated_at: new Date() },
      });
      if (changed.length > 0) {
        await this.recordEvent(tx, tenantId, candidateId, {
          type: 'UPDATED',
          summary: 'Details updated',
          actorMemberId: actor.tenantMemberId,
          // Field names only: values such as salary stay out of the timeline.
          metadata: { fields: changed },
        });
      }
    }).catch((error) => this.rethrowEmailClash(error));
    return this.get(tenantId, candidateId, actor.tenantMemberId);
  }

  /** A move by hand, only along the workflow's allowed steps. */
  async move(tenantId: string, id: string, input: MoveCandidateDto, actor: AuthenticatedTenantUser) {
    const candidateId = this.idOr404(id);
    if (!isCandidateStatus(input.status)) throw new BadRequestException('Choose a valid status.');
    const to = input.status;
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockCandidate(tx, tenantId, candidateId);
      if (current.archived_at) throw new ConflictException('Restore the candidate before changing their status.');
      const from = current.candidate_status as CandidateStatus;
      const refusal = refuseManualMove(from, to);
      if (refusal) throw new ConflictException(refusal);
      await this.setStatus(tx, tenantId, candidateId, from, to, {
        type: 'STATUS_CHANGED',
        summary: `Moved to ${CANDIDATE_STATUS_LABELS[to]}`,
        notes: input.notes?.trim() || null,
        actorMemberId: actor.tenantMemberId,
      });
    });
    return this.get(tenantId, candidateId, actor.tenantMemberId);
  }

  /** Any move except into or out of Joined, with a reason, recorded as an override. */
  async override(tenantId: string, id: string, input: OverrideCandidateStatusDto, actor: AuthenticatedTenantUser) {
    const candidateId = this.idOr404(id);
    if (!isCandidateStatus(input.status)) throw new BadRequestException('Choose a valid status.');
    const to = input.status;
    let from: CandidateStatus = to;
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockCandidate(tx, tenantId, candidateId);
      if (current.archived_at) throw new ConflictException('Restore the candidate before changing their status.');
      from = current.candidate_status as CandidateStatus;
      const refusal = refuseOverride(from, to);
      if (refusal) throw new ConflictException(refusal);
      await this.setStatus(tx, tenantId, candidateId, from, to, {
        type: 'STATUS_OVERRIDDEN',
        summary: `Status overridden to ${CANDIDATE_STATUS_LABELS[to]}`,
        notes: input.reason.trim(),
        isOverride: true,
        actorMemberId: actor.tenantMemberId,
      });
    });
    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_STATUS_OVERRIDDEN',
      entityType: 'CANDIDATE',
      entityId: candidateId,
      oldValues: { status: from },
      newValues: { status: to },
      metadata: { reason: input.reason.trim() },
    });
    return this.get(tenantId, candidateId, actor.tenantMemberId);
  }

  async addNote(tenantId: string, id: string, note: string, actor: AuthenticatedTenantUser) {
    const candidateId = this.idOr404(id);
    await this.prisma.$transaction(async (tx) => {
      await this.lockCandidate(tx, tenantId, candidateId);
      await this.recordEvent(tx, tenantId, candidateId, { type: 'NOTE', summary: 'Note added', notes: note.trim(), actorMemberId: actor.tenantMemberId });
    });
    return this.get(tenantId, candidateId, actor.tenantMemberId);
  }

  /** Hides the candidate from active lists. Nothing is deleted; restoring brings them back as they were. */
  async setArchived(tenantId: string, id: string, archived: boolean, actor: AuthenticatedTenantUser) {
    const candidateId = this.idOr404(id);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockCandidate(tx, tenantId, candidateId);
      if (archived === Boolean(current.archived_at)) return;
      if (archived) {
        const live = await tx.rndtechnosoft_interviews.count({ where: { tenant_id: tenantId, candidate_id: candidateId, interview_status: 'SCHEDULED' } });
        if (live > 0) throw new ConflictException('Cancel the scheduled interview before archiving the candidate.');
      } else {
        await this.assertEmailFree(tenantId, current.email, candidateId);
      }
      await tx.rndtechnosoft_candidates.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: candidateId } },
        data: { archived_at: archived ? new Date() : null, updated_at: new Date() },
      });
      await this.recordEvent(tx, tenantId, candidateId, {
        type: archived ? 'ARCHIVED' : 'RESTORED',
        summary: archived ? 'Archived' : 'Restored',
        actorMemberId: actor.tenantMemberId,
      });
    }).catch((error) => this.rethrowEmailClash(error));
    return this.get(tenantId, candidateId, actor.tenantMemberId);
  }

  // ── Candidate to Employee Conversion ────────────────────────

  /**
   * Pre-fills defaults for candidate-to-employee conversion wizard,
   * including next sequential employee code, candidate details, accepted offer details,
   * dynamic masters (departments, designations, employment types, branches, structures, managers).
   */
  async getConversionDefaults(tenantId: string, candidateId: string) {
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { id: this.idOr404(candidateId), tenant_id: tenantId },
      include: {
        rndtechnosoft_departments: { select: { id: true, department_name: true } },
        rndtechnosoft_designations: { select: { id: true, designation_name: true } },
        rndtechnosoft_employment_types: { select: { id: true, employment_type_name: true } },
        rndtechnosoft_offers: {
          where: { offer_status: 'ACCEPTED' },
          orderBy: { updated_at: 'desc' },
          take: 1,
        },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    if (candidate.employee_id) {
      throw new ConflictException('This candidate has already been converted to an employee.');
    }

    // Split candidate full name into first and last
    const nameParts = (candidate.full_name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Accepted offer details
    const acceptedOffer = candidate.rndtechnosoft_offers[0] ?? null;

    // Next sequential employee code
    const latestEmp = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      select: { employee_code: true },
    });

    let suggestedEmployeeCode = 'EMP001';
    if (latestEmp?.employee_code) {
      const match = latestEmp.employee_code.match(/^(.*?)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const numStr = match[2];
        const nextNum = parseInt(numStr, 10) + 1;
        suggestedEmployeeCode = `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
      } else {
        const total = await this.prisma.rndtechnosoft_employees.count({ where: { tenant_id: tenantId } });
        suggestedEmployeeCode = `EMP${String(total + 1).padStart(3, '0')}`;
      }
    }

    // Dynamic masters
    const [departments, designations, employmentTypes, branches, salaryStructures, activeEmployees] = await Promise.all([
      this.prisma.rndtechnosoft_departments.findMany({
        where: { tenant_id: tenantId, archived_at: null },
        orderBy: { department_name: 'asc' },
        select: { id: true, department_name: true },
      }),
      this.prisma.rndtechnosoft_designations.findMany({
        where: { tenant_id: tenantId, archived_at: null },
        orderBy: { designation_name: 'asc' },
        select: { id: true, designation_name: true },
      }),
      this.prisma.rndtechnosoft_employment_types.findMany({
        where: { tenant_id: tenantId, employment_type_status: 'ACTIVE' },
        orderBy: { employment_type_name: 'asc' },
        select: { id: true, employment_type_name: true, employment_type_code: true },
      }),
      this.prisma.rndtechnosoft_branches.findMany({
        where: { tenant_id: tenantId },
        orderBy: { branch_name: 'asc' },
        select: { id: true, branch_name: true, branch_code: true },
      }),
      this.prisma.rndtechnosoft_salary_structures.findMany({
        where: { tenant_id: tenantId, structure_status: 'ACTIVE' },
        orderBy: { salary_structure_name: 'asc' },
        select: { id: true, salary_structure_name: true, salary_structure_code: true },
      }),
      this.prisma.rndtechnosoft_employees.findMany({
        where: { tenant_id: tenantId, employee_status: 'ACTIVE' },
        orderBy: { employee_code: 'asc' },
        select: { id: true, employee_code: true, first_name: true, last_name: true },
      }),
    ]);

    const joiningDate = acceptedOffer?.joining_date
      ? acceptedOffer.joining_date.toISOString().slice(0, 10)
      : candidate.expected_joining_date
      ? candidate.expected_joining_date.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const annualCtc = acceptedOffer?.annual_ctc
      ? acceptedOffer.annual_ctc.toString()
      : candidate.expected_salary
      ? candidate.expected_salary.toString()
      : null;

    let monthlyGrossTarget: string | null = null;
    if (annualCtc) {
      const num = parseFloat(annualCtc);
      if (!isNaN(num) && num > 0) {
        monthlyGrossTarget = (num / 12).toFixed(2);
      }
    }

    return {
      candidateId: candidate.id,
      candidateCode: candidate.candidate_code,
      defaults: {
        employeeCode: suggestedEmployeeCode,
        firstName,
        lastName,
        workEmail: candidate.email,
        personalEmail: candidate.email,
        workMobile: candidate.phone,
        dateOfBirth: null,
        genderCode: null,
        joiningDate,
        departmentId: candidate.department_id,
        designationId: candidate.designation_id,
        employmentTypeId: candidate.employment_type_id,
        currentAddressLine1: candidate.address,
        annualCtc,
        monthlyGrossTarget,
        salaryEffectiveFrom: joiningDate,
        cosecEmployeeId: suggestedEmployeeCode,
      },
      masters: {
        departments,
        designations,
        employmentTypes,
        branches,
        salaryStructures,
        managers: activeEmployees.map((e) => ({
          id: e.id,
          employeeCode: e.employee_code,
          name: `${e.first_name} ${e.last_name || ''}`.trim(),
        })),
      },
    };
  }

  /**
   * Complete candidate to employee conversion with atomic transaction,
   * audit trail, candidate status transition to JOINED, and COSEC mapping creation.
   */
  async convertToEmployee(
    tenantId: string,
    candidateId: string,
    dto: ConvertToEmployeeDto,
    actor: AuthenticatedTenantUser,
  ) {
    const cId = this.idOr404(candidateId);

    // Validate employee code uniqueness in tenant
    const existingEmp = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { tenant_id: tenantId, employee_code: dto.employeeCode.trim() },
    });
    if (existingEmp) {
      throw new ConflictException(`Employee code "${dto.employeeCode}" already exists in this workspace.`);
    }

    // If cosecEmployeeId is provided, check uniqueness in employee_cosec_mappings
    const trimmedCosecId = dto.cosecEmployeeId?.trim();
    if (trimmedCosecId) {
      const conflictCosec = await this.prisma.rndtechnosoft_employee_cosec_mappings.findFirst({
        where: { tenant_id: tenantId, cosec_employee_id: trimmedCosecId },
        include: { rndtechnosoft_employees: { select: { employee_code: true, first_name: true, last_name: true } } },
      });
      if (conflictCosec) {
        const other = conflictCosec.rndtechnosoft_employees;
        throw new ConflictException(
          `COSEC Employee ID "${trimmedCosecId}" is already mapped to ${other.first_name} ${other.last_name} (${other.employee_code}).`,
        );
      }
    }

    const employeeId = randomUUID();
    const employmentId = randomUUID();
    const joiningDate = new Date(dto.joiningDate);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Lock and verify candidate
      const candidate = await this.lockCandidate(tx, tenantId, cId);
      if (candidate.employee_id) {
        throw new ConflictException('This candidate has already been converted to an employee.');
      }

      // 2. Create Employee
      const employee = await tx.rndtechnosoft_employees.create({
        data: {
          id: employeeId,
          tenant_id: tenantId,
          employee_code: dto.employeeCode.trim(),
          first_name: dto.firstName.trim(),
          middle_name: dto.middleName?.trim() || null,
          last_name: dto.lastName?.trim() || null,
          work_email: dto.workEmail?.trim() || null,
          personal_email: dto.personalEmail?.trim() || null,
          work_mobile: dto.workMobile?.trim() || null,
          date_of_birth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender_code: dto.genderCode || null,
          employee_status: 'ACTIVE',
          hire_date: joiningDate,
        },
      });

      // 3. Create Employment record
      await tx.rndtechnosoft_employee_employments.create({
        data: {
          id: employmentId,
          tenant_id: tenantId,
          employee_id: employeeId,
          branch_id: dto.branchId || null,
          department_id: dto.departmentId || null,
          designation_id: dto.designationId || null,
          employment_type_id: dto.employmentTypeId || null,
          joining_date: joiningDate,
          effective_from: joiningDate,
          effective_to: dto.employmentEndDate ? new Date(dto.employmentEndDate) : null,
          employment_status: dto.employmentStatus || 'CONFIRMED',
          probation_end_date: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
          confirmation_date: dto.confirmationDate ? new Date(dto.confirmationDate) : null,
        },
      });

      // 4. Create Reporting Line (if manager provided)
      if (dto.reportingManagerEmployeeId) {
        await tx.rndtechnosoft_employee_reporting_lines.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employeeId,
            manager_employee_id: dto.reportingManagerEmployeeId,
            relationship_type: 'PRIMARY',
            effective_from: joiningDate,
            line_status: 'ACTIVE',
            created_by_tenant_member_id: actor.tenantMemberId || null,
          },
        });
      }

      // 5. Create Addresses (if provided)
      if (dto.currentAddressLine1) {
        await tx.rndtechnosoft_employee_addresses.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employeeId,
            address_type: 'CURRENT',
            address_line_1: dto.currentAddressLine1.trim(),
            address_line_2: dto.currentAddressLine2?.trim() || null,
            city: dto.currentCity?.trim() || 'Default',
            state_region: dto.currentState?.trim() || null,
            postal_code: dto.currentPostalCode?.trim() || null,
            country_code: (dto.currentCountryCode?.trim() || 'IN').slice(0, 2),
            is_primary: true,
            valid_from: joiningDate,
          },
        });
      }

      if (dto.permanentAddressLine1) {
        await tx.rndtechnosoft_employee_addresses.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employeeId,
            address_type: 'PERMANENT',
            address_line_1: dto.permanentAddressLine1.trim(),
            address_line_2: dto.permanentAddressLine2?.trim() || null,
            city: dto.permanentCity?.trim() || 'Default',
            state_region: dto.permanentState?.trim() || null,
            postal_code: dto.permanentPostalCode?.trim() || null,
            country_code: (dto.permanentCountryCode?.trim() || 'IN').slice(0, 2),
            is_primary: false,
            valid_from: joiningDate,
          },
        });
      }

      // 6. Emergency Contact (if provided)
      if (dto.emergencyContactName && dto.emergencyContactPhone) {
        await tx.rndtechnosoft_employee_emergency_contacts.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employeeId,
            contact_name: dto.emergencyContactName.trim(),
            relationship: dto.emergencyContactRelationship?.trim() || null,
            mobile_number: dto.emergencyContactPhone.trim(),
            is_primary: true,
          },
        });
      }

      // 7. Bank Account (if provided)
      if (dto.accountNumber && dto.ifsc) {
        const last4 = dto.accountNumber.slice(-4);
        await tx.rndtechnosoft_employee_bank_accounts.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employeeId,
            account_holder_name: dto.accountHolderName?.trim() || `${dto.firstName} ${dto.lastName || ''}`.trim(),
            bank_name: dto.bankName?.trim() || 'Primary Bank',
            branch_name: dto.branchName?.trim() || null,
            account_number_encrypted: `ENC[${dto.accountNumber.trim()}]`,
            account_number_last4: last4,
            bank_code_type: 'IFSC',
            bank_code: dto.ifsc.trim().toUpperCase(),
            account_type: 'SAVINGS',
            effective_from: joiningDate,
            bank_account_status: 'ACTIVE',
          },
        });
      }

      // 8. Compensation & Salary Assignment (if structure provided)
      if (dto.salaryStructureId) {
        const annualCtcNum = dto.annualCtc ? new Prisma.Decimal(dto.annualCtc) : null;
        const monthlyGrossNum = dto.monthlyGrossTarget ? new Prisma.Decimal(dto.monthlyGrossTarget) : null;
        const salaryEffective = dto.salaryEffectiveFrom ? new Date(dto.salaryEffectiveFrom) : joiningDate;

        await tx.rndtechnosoft_employee_salary_assignments.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employeeId,
            salary_structure_id: dto.salaryStructureId,
            annual_ctc: annualCtcNum,
            monthly_gross_target: monthlyGrossNum,
            currency_code: 'INR',
            effective_from: salaryEffective,
            assignment_status: 'ACTIVE',
            pay_basis: 'MONTHLY',
            payment_method: 'BANK_TRANSFER',
            created_by_tenant_member_id: actor.tenantMemberId || null,
          },
        });
      }

      // 9. COSEC Attendance Mapping
      const mappingStatus = trimmedCosecId ? 'MAPPED' : 'MAPPING_PENDING';
      const mappingRow = await tx.rndtechnosoft_employee_cosec_mappings.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: employeeId,
          cosec_employee_id: trimmedCosecId || null,
          mapping_status: mappingStatus,
          mapping_source: 'CANDIDATE_CONVERSION',
          verification_status: 'UNVERIFIED',
          review_notes: trimmedCosecId ? 'Mapped during candidate conversion' : 'Candidate converted; COSEC mapping pending',
          created_by_tenant_member_id: actor.tenantMemberId || null,
          updated_by_tenant_member_id: actor.tenantMemberId || null,
        },
      });

      // 10. Link candidate to employee and transition to JOINED
      const fromStatus = candidate.candidate_status as CandidateStatus;
      await tx.rndtechnosoft_candidates.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: cId } },
        data: {
          employee_id: employeeId,
          candidate_status: 'JOINED',
          updated_at: new Date(),
        },
      });

      // 11. Record event on candidate timeline
      await this.recordEvent(tx, tenantId, cId, {
        type: 'CONVERTED_TO_EMPLOYEE',
        summary: `Converted to employee ${dto.employeeCode} (${dto.firstName} ${dto.lastName || ''})`.trim(),
        from: fromStatus,
        to: 'JOINED',
        notes: trimmedCosecId ? `COSEC ID mapped: ${trimmedCosecId}` : 'COSEC mapping pending',
        actorMemberId: actor.tenantMemberId,
        metadata: {
          employeeId,
          employeeCode: dto.employeeCode,
          cosecEmployeeId: trimmedCosecId || null,
          mappingStatus,
        },
      });

      return {
        employee,
        mapping: mappingRow,
      };
    });

    // 12. Write audit log
    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_CANDIDATE_CONVERTED_TO_EMPLOYEE',
      entityType: 'CANDIDATE',
      entityId: cId,
      oldValues: {
        employeeId: null,
      },
      newValues: {
        employeeId: result.employee.id,
        employeeCode: result.employee.employee_code,
        candidateStatus: 'JOINED',
        cosecEmployeeId: result.mapping.cosec_employee_id,
        mappingStatus: result.mapping.mapping_status,
      },
    });

    return {
      success: true,
      employeeId: result.employee.id,
      employeeCode: result.employee.employee_code,
      name: `${result.employee.first_name} ${result.employee.last_name || ''}`.trim(),
      cosecMapping: {
        cosecEmployeeId: result.mapping.cosec_employee_id,
        mappingStatus: result.mapping.mapping_status,
      },
    };
  }

  // ── Used by the other onboarding services ────────────────────

  /** The candidate row, locked for this transaction, or 404. */
  async lockCandidate(tx: Tx, tenantId: string, candidateId: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM rndtechnosoft_candidates WHERE tenant_id = ${tenantId}::uuid AND id = ${candidateId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Candidate not found.');
    return tx.rndtechnosoft_candidates.findFirstOrThrow({ where: { tenant_id: tenantId, id: candidateId } });
  }

  /** Changes the status and records the change on the timeline, in the caller's transaction. */
  async setStatus(tx: Tx, tenantId: string, candidateId: string, from: CandidateStatus, to: CandidateStatus, event: Omit<CandidateEventInput, 'from' | 'to'>) {
    if (from !== to) {
      await tx.rndtechnosoft_candidates.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: candidateId } },
        data: { candidate_status: to, updated_at: new Date() },
      });
    }
    await this.recordEvent(tx, tenantId, candidateId, { ...event, from, to: from === to ? null : to });
  }

  async recordEvent(tx: Tx, tenantId: string, candidateId: string, event: CandidateEventInput) {
    await tx.rndtechnosoft_candidate_events.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        candidate_id: candidateId,
        event_type: event.type,
        from_status: event.from ?? null,
        to_status: event.to ?? null,
        is_override: event.isOverride ?? false,
        summary: event.summary.slice(0, 300),
        notes: event.notes ?? null,
        actor_tenant_member_id: event.actorMemberId ?? null,
        metadata: event.metadata ? (event.metadata as Prisma.InputJsonObject) : undefined,
      },
    });
  }

  idOr404(id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Candidate not found.');
    return id;
  }

  // ── Internals ────────────────────────────────────────────────

  private toSummary(row: {
    id: string;
    candidate_code: string;
    full_name: string;
    email: string;
    phone: string | null;
    applied_position: string;
    department_id: string | null;
    hiring_source: string | null;
    expected_salary: Prisma.Decimal | null;
    experience_years: Prisma.Decimal | null;
    expected_joining_date: Date | null;
    recruiter_tenant_member_id: string | null;
    candidate_status: string;
    archived_at: Date | null;
    created_at: Date;
    updated_at: Date;
    rndtechnosoft_departments?: { department_name: string } | null;
    recruiter?: { rndtechnosoft_users: { display_name: string | null; email: string } } | null;
  }) {
    return {
      id: row.id,
      candidateCode: row.candidate_code,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      appliedPosition: row.applied_position,
      departmentId: row.department_id,
      departmentName: row.rndtechnosoft_departments?.department_name ?? null,
      hiringSource: row.hiring_source,
      expectedSalary: row.expected_salary?.toFixed(2) ?? null,
      experienceYears: row.experience_years?.toFixed(1) ?? null,
      expectedJoiningDate: row.expected_joining_date ? row.expected_joining_date.toISOString().slice(0, 10) : null,
      recruiterMemberId: row.recruiter_tenant_member_id,
      recruiterName: memberName(row.recruiter),
      status: row.candidate_status,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Validated column values, with every referenced record checked to be in this workspace. */
  private async candidateData(tenantId: string, input: CandidateInputDto, currentCandidateId?: string) {
    const trimmed = (value?: string) => (value && value.trim() ? value.trim() : null);
    const fullName = trimmed(input.fullName);
    const appliedPosition = trimmed(input.appliedPosition);
    if (!fullName) throw new BadRequestException('Enter the candidate’s full name.');
    if (!appliedPosition) throw new BadRequestException('Enter the position applied for.');

    const [department, designation, employmentType, recruiter] = await Promise.all([
      input.departmentId ? this.prisma.rndtechnosoft_departments.findFirst({ where: { tenant_id: tenantId, id: input.departmentId }, select: { id: true } }) : null,
      input.designationId ? this.prisma.rndtechnosoft_designations.findFirst({ where: { tenant_id: tenantId, id: input.designationId }, select: { id: true } }) : null,
      input.employmentTypeId
        ? this.prisma.rndtechnosoft_employment_types.findFirst({
            where: { tenant_id: tenantId, id: input.employmentTypeId },
            select: { id: true, employment_type_status: true },
          })
        : null,
      input.recruiterMemberId
        ? this.prisma.rndtechnosoft_tenant_members.findFirst({ where: { tenant_id: tenantId, id: input.recruiterMemberId, membership_status: 'ACTIVE', archived_at: null }, select: { id: true } })
        : null,
    ]);
    if (input.departmentId && !department) throw new BadRequestException('That department is not in this workspace.');
    if (input.designationId && !designation) throw new BadRequestException('That designation is not in this workspace.');
    if (input.employmentTypeId && !employmentType) throw new BadRequestException('That employment type is not in this workspace.');
    if (employmentType && employmentType.employment_type_status !== 'ACTIVE') {
      let isExistingAssignment = false;
      if (currentCandidateId) {
        const existing = await this.prisma.rndtechnosoft_candidates.findFirst({
          where: { tenant_id: tenantId, id: currentCandidateId },
          select: { employment_type_id: true },
        });
        if (existing?.employment_type_id === input.employmentTypeId) {
          isExistingAssignment = true;
        }
      }
      if (!isExistingAssignment) {
        throw new BadRequestException('The selected employment type is inactive. Please choose an active employment type.');
      }
    }
    if (input.recruiterMemberId && !recruiter) throw new BadRequestException('The recruiter must be an active member of this workspace.');

    return {
      full_name: fullName,
      email: input.email.trim().toLowerCase(),
      phone: trimmed(input.phone),
      address: trimmed(input.address),
      applied_position: appliedPosition,
      department_id: input.departmentId ?? null,
      designation_id: input.designationId ?? null,
      employment_type_id: input.employmentTypeId ?? null,
      hiring_source: trimmed(input.hiringSource),
      expected_salary: input.expectedSalary ? new Prisma.Decimal(input.expectedSalary) : null,
      experience_years: input.experienceYears ? new Prisma.Decimal(input.experienceYears) : null,
      expected_joining_date: input.expectedJoiningDate ? new Date(input.expectedJoiningDate) : null,
      recruiter_tenant_member_id: input.recruiterMemberId ?? null,
      notes: trimmed(input.notes),
    };
  }

  private async assertEmailFree(tenantId: string, email: string, exceptId?: string) {
    const other = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, email: { equals: email, mode: 'insensitive' }, archived_at: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { candidate_code: true },
    });
    if (other) throw new ConflictException(`An active candidate already has this email (${other.candidate_code}). Open that candidate instead.`);
  }

  private rethrowEmailClash(error: unknown): never {
    // The database's own guard, for two requests at the same moment.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('An active candidate already has this email. Open that candidate instead.');
    }
    throw error;
  }

  private async withCandidateCode<T>(create: (code: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const code = `CAN-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
      try {
        return await create(code);
      } catch (error) {
        const target = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' ? JSON.stringify(error.meta?.target ?? '') : '';
        if (/candidate_code|uq_candidates_code/.test(target) && attempt < 4) continue;
        this.rethrowEmailClash(error);
      }
    }
  }
}
