import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { CandidatesService } from './candidates.service';
import { OnboardingMailerService, OnboardingSendOutcome, escapeHtml } from './onboarding-mailer.service';
import { CANDIDATE_STATUS_LABELS, CandidateStatus, SCHEDULABLE_FROM } from './onboarding-workflow';
import {
  CancelInterviewDto,
  InterviewDecisionDto,
  InterviewFeedbackDto,
  ListInterviewsQueryDto,
  RescheduleInterviewDto,
  ScheduleInterviewDto,
} from './dto/onboarding.dto';

type Tx = Prisma.TransactionClient;
type InterviewRow = Awaited<ReturnType<Tx['rndtechnosoft_interviews']['findFirstOrThrow']>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_LABELS: Record<string, string> = { IN_PERSON: 'In person', PHONE: 'Phone', ONLINE: 'Online' };
const RECOMMENDATION_LABELS: Record<string, string> = { STRONG_YES: 'Strong yes', YES: 'Yes', NO: 'No', STRONG_NO: 'Strong no' };
const MEMBER_WITH_USER = { select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;

/** Whether the runtime knows this IANA time zone. */
export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A start time as people read it, in the interview's own time zone. */
export function formatInterviewTime(start: Date, timezone: string) {
  const when = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(start);
  return `${when} (${timezone})`;
}

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidatesService,
    private readonly mailer: OnboardingMailerService,
  ) {}

  async list(tenantId: string, query: ListInterviewsQueryDto, actor: AuthenticatedTenantUser) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(from < to)) throw new BadRequestException('The end of the range must be after its start.');
    if (to.getTime() - from.getTime() > 93 * 24 * 3600 * 1000) throw new BadRequestException('Show at most three months of interviews at a time.');

    const rows = await this.prisma.rndtechnosoft_interviews.findMany({
      where: {
        tenant_id: tenantId,
        scheduled_start: { gte: from, lt: to },
        ...(query.status ? { interview_status: query.status } : {}),
        ...(query.mine === 'true' ? { rndtechnosoft_interview_panelists: { some: { tenant_member_id: actor.tenantMemberId } } } : {}),
      },
      orderBy: { scheduled_start: 'asc' },
      take: 500,
      include: {
        rndtechnosoft_candidates: { select: { id: true, full_name: true, candidate_code: true, applied_position: true, candidate_status: true } },
        rndtechnosoft_interview_panelists: { include: { rndtechnosoft_tenant_members: MEMBER_WITH_USER } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      candidate: {
        id: row.rndtechnosoft_candidates.id,
        name: row.rndtechnosoft_candidates.full_name,
        code: row.rndtechnosoft_candidates.candidate_code,
        position: row.rndtechnosoft_candidates.applied_position,
        status: row.rndtechnosoft_candidates.candidate_status,
      },
      roundNumber: row.round_number,
      roundName: row.round_name,
      interviewType: row.interview_type,
      startsAt: row.scheduled_start,
      durationMinutes: row.duration_minutes,
      timezone: row.timezone,
      location: row.location,
      meetingLink: row.meeting_link,
      status: row.interview_status,
      decision: row.decision,
      panel: row.rndtechnosoft_interview_panelists.map((panelist) => ({
        memberId: panelist.tenant_member_id,
        name: panelist.rndtechnosoft_tenant_members.rndtechnosoft_users.display_name || panelist.rndtechnosoft_tenant_members.rndtechnosoft_users.email,
        feedbackSubmitted: Boolean(panelist.feedback_submitted_at),
      })),
      isMine: row.rndtechnosoft_interview_panelists.some((panelist) => panelist.tenant_member_id === actor.tenantMemberId),
    }));
  }

  async schedule(tenantId: string, candidateId: string, input: ScheduleInterviewDto, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    // Another workspace's candidate is simply not found, before anything else is checked.
    if (!(await this.prisma.rndtechnosoft_candidates.findFirst({ where: { tenant_id: tenantId, id }, select: { id: true } }))) {
      throw new NotFoundException('Candidate not found.');
    }
    const timing = this.timing(input.startsAt, input.durationMinutes, input.timezone);
    const place = this.place(input.interviewType, input.location, input.meetingLink);
    const panel = await this.activeMembers(tenantId, input.interviewerMemberIds);

    const interviewId = randomUUID();
    const interview = await this.prisma.$transaction(async (tx) => {
      const candidate = await this.candidates.lockCandidate(tx, tenantId, id);
      if (candidate.archived_at) throw new ConflictException('Restore the candidate before scheduling an interview.');
      const status = candidate.candidate_status as CandidateStatus;
      if (!SCHEDULABLE_FROM.includes(status)) {
        throw new ConflictException(
          status === 'NEW'
            ? 'Move the candidate to screening before scheduling an interview.'
            : `A candidate who is ${CANDIDATE_STATUS_LABELS[status].toLowerCase()} can't be scheduled for an interview.`,
        );
      }
      const live = await tx.rndtechnosoft_interviews.findFirst({ where: { tenant_id: tenantId, candidate_id: id, interview_status: 'SCHEDULED' } });
      if (live) throw new ConflictException(`Round ${live.round_number} is already scheduled. Reschedule or cancel it instead of adding another.`);
      const lastRound = await tx.rndtechnosoft_interviews.aggregate({
        where: { tenant_id: tenantId, candidate_id: id, interview_status: 'COMPLETED' },
        _max: { round_number: true },
      });
      const roundNumber = (lastRound._max.round_number ?? 0) + 1;

      const created = await tx.rndtechnosoft_interviews.create({
        data: {
          id: interviewId,
          tenant_id: tenantId,
          candidate_id: id,
          round_number: roundNumber,
          round_name: input.roundName?.trim() || null,
          interview_type: input.interviewType,
          scheduled_start: timing.start,
          duration_minutes: input.durationMinutes,
          timezone: input.timezone,
          ...place,
          instructions: input.instructions?.trim() || null,
          interview_status: 'SCHEDULED',
          created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      await tx.rndtechnosoft_interview_panelists.createMany({
        data: panel.map((member) => ({ id: randomUUID(), tenant_id: tenantId, interview_id: interviewId, tenant_member_id: member.id })),
      });
      await this.candidates.setStatus(tx, tenantId, id, status, 'INTERVIEW_SCHEDULED', {
        type: 'INTERVIEW_SCHEDULED',
        summary: `Round ${roundNumber} interview scheduled for ${formatInterviewTime(timing.start, input.timezone)}`,
        actorMemberId: actor.tenantMemberId,
        metadata: { interviewId, interviewers: panel.map((member) => member.name) },
      });
      return created;
    });

    const notifications = await this.notify(tenantId, actor, interview, 'SCHEDULED', {
      candidate: input.notifyCandidate !== false,
      panel: input.notifyInterviewers !== false,
    });
    return { candidate: await this.candidates.get(tenantId, id, actor.tenantMemberId), interviewId: interview.id, notifications };
  }

  async reschedule(tenantId: string, interviewId: string, input: RescheduleInterviewDto, actor: AuthenticatedTenantUser) {
    const timing = this.timing(input.startsAt, input.durationMinutes, input.timezone);
    const updated = await this.prisma.$transaction(async (tx) => {
      const interview = await this.lockInterview(tx, tenantId, interviewId);
      if (interview.interview_status !== 'SCHEDULED') throw new ConflictException('Only a scheduled interview can be rescheduled.');
      const place = this.place(interview.interview_type, input.location ?? interview.location ?? undefined, input.meetingLink ?? interview.meeting_link ?? undefined);
      const saved = await tx.rndtechnosoft_interviews.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: interview.id } },
        data: { scheduled_start: timing.start, duration_minutes: input.durationMinutes, timezone: input.timezone, ...place, updated_at: new Date() },
      });
      await this.candidates.recordEvent(tx, tenantId, interview.candidate_id, {
        type: 'INTERVIEW_RESCHEDULED',
        summary: `Round ${interview.round_number} interview moved to ${formatInterviewTime(timing.start, input.timezone)}`,
        notes: input.reason.trim(),
        actorMemberId: actor.tenantMemberId,
        metadata: { interviewId: interview.id, previousStart: interview.scheduled_start.toISOString() },
      });
      return saved;
    });
    const notifications = input.notify === false ? [] : await this.notify(tenantId, actor, updated, 'RESCHEDULED', { candidate: true, panel: true }, input.reason.trim());
    return { candidate: await this.candidates.get(tenantId, updated.candidate_id, actor.tenantMemberId), interviewId: updated.id, notifications };
  }

  async cancel(tenantId: string, interviewId: string, input: CancelInterviewDto, actor: AuthenticatedTenantUser) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const interview = await this.lockInterview(tx, tenantId, interviewId);
      if (interview.interview_status !== 'SCHEDULED') throw new ConflictException('Only a scheduled interview can be cancelled.');
      const saved = await tx.rndtechnosoft_interviews.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: interview.id } },
        data: { interview_status: 'CANCELLED', cancel_reason: input.reason.trim(), updated_at: new Date() },
      });
      // Back to where the candidate was before this round: completed rounds, or screening.
      const candidate = await tx.rndtechnosoft_candidates.findFirstOrThrow({ where: { tenant_id: tenantId, id: interview.candidate_id } });
      const from = candidate.candidate_status as CandidateStatus;
      const completed = await tx.rndtechnosoft_interviews.count({ where: { tenant_id: tenantId, candidate_id: interview.candidate_id, interview_status: 'COMPLETED' } });
      const to: CandidateStatus = from === 'INTERVIEW_SCHEDULED' ? (completed > 0 ? 'INTERVIEW_COMPLETED' : 'SCREENING') : from;
      await this.candidates.setStatus(tx, tenantId, interview.candidate_id, from, to, {
        type: 'INTERVIEW_CANCELLED',
        summary: `Round ${interview.round_number} interview cancelled`,
        notes: input.reason.trim(),
        actorMemberId: actor.tenantMemberId,
        metadata: { interviewId: interview.id },
      });
      return saved;
    });
    const notifications = input.notify === false ? [] : await this.notify(tenantId, actor, cancelled, 'CANCELLED', { candidate: true, panel: true }, input.reason.trim());
    return { candidate: await this.candidates.get(tenantId, cancelled.candidate_id, actor.tenantMemberId), interviewId: cancelled.id, notifications };
  }

  /** Marks a started interview as held, and the candidate's interview stage as complete when no round is still pending. */
  async complete(tenantId: string, interviewId: string, actor: AuthenticatedTenantUser) {
    const interview = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockInterview(tx, tenantId, interviewId);
      if (current.interview_status !== 'SCHEDULED') throw new ConflictException('Only a scheduled interview can be marked completed.');
      await this.markCompleted(tx, tenantId, current, actor);
      return current;
    });
    return { candidate: await this.candidates.get(tenantId, interview.candidate_id, actor.tenantMemberId), interviewId: interview.id };
  }

  /** An interviewer's own feedback. Recording it marks a started interview as held. */
  async feedback(tenantId: string, interviewId: string, input: InterviewFeedbackDto, actor: AuthenticatedTenantUser) {
    const interview = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockInterview(tx, tenantId, interviewId);
      const panelist = await tx.rndtechnosoft_interview_panelists.findFirst({
        where: { tenant_id: tenantId, interview_id: current.id, tenant_member_id: actor.tenantMemberId },
      });
      if (!panelist) throw new ForbiddenException('Only the interviewers on this interview can record feedback on it.');
      if (current.interview_status === 'CANCELLED') throw new ConflictException('This interview was cancelled.');
      if (current.decision) throw new ConflictException('A decision has already been made on this interview, so its feedback is final.');
      if (current.interview_status === 'SCHEDULED') await this.markCompleted(tx, tenantId, current, actor);

      await tx.rndtechnosoft_interview_panelists.update({
        where: { id: panelist.id },
        data: {
          feedback_rating: input.rating,
          feedback_recommendation: input.recommendation,
          feedback_notes: input.notes?.trim() || null,
          feedback_submitted_at: new Date(),
        },
      });
      await this.candidates.recordEvent(tx, tenantId, current.candidate_id, {
        type: 'FEEDBACK_RECORDED',
        summary: `Round ${current.round_number} feedback: ${RECOMMENDATION_LABELS[input.recommendation]} (${input.rating}/5)`,
        actorMemberId: actor.tenantMemberId,
        metadata: { interviewId: current.id, updated: Boolean(panelist.feedback_submitted_at) },
      });
      return current;
    });
    return { candidate: await this.candidates.get(tenantId, interview.candidate_id, actor.tenantMemberId), interviewId: interview.id };
  }

  /** Select, reject, or ask for another round, on a held interview. */
  async decide(tenantId: string, interviewId: string, input: InterviewDecisionDto, actor: AuthenticatedTenantUser) {
    const interview = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockInterview(tx, tenantId, interviewId);
      if (current.interview_status !== 'COMPLETED') throw new ConflictException('Decide once the interview has been held (mark it completed or record feedback first).');
      if (current.decision) throw new ConflictException('A decision has already been recorded for this interview.');
      const candidate = await this.candidates.lockCandidate(tx, tenantId, current.candidate_id);
      if (candidate.archived_at) throw new ConflictException('Restore the candidate before deciding.');
      const from = candidate.candidate_status as CandidateStatus;
      if (from !== 'INTERVIEW_COMPLETED') {
        throw new ConflictException(`A decision is made after the interview stage. The candidate is ${CANDIDATE_STATUS_LABELS[from].toLowerCase()}.`);
      }

      await tx.rndtechnosoft_interviews.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: current.id } },
        data: { decision: input.decision, decision_notes: input.notes?.trim() || null, decided_by_tenant_member_id: actor.tenantMemberId, decided_at: new Date(), updated_at: new Date() },
      });
      const to: CandidateStatus = input.decision === 'SELECT' ? 'SELECTED' : input.decision === 'REJECT' ? 'REJECTED' : from;
      await this.candidates.setStatus(tx, tenantId, current.candidate_id, from, to, {
        type: 'INTERVIEW_DECISION',
        summary:
          input.decision === 'ADVANCE'
            ? `Round ${current.round_number}: moved on to another round`
            : `Round ${current.round_number}: ${input.decision === 'SELECT' ? 'selected' : 'rejected'}`,
        notes: input.notes?.trim() || null,
        actorMemberId: actor.tenantMemberId,
        metadata: { interviewId: current.id, decision: input.decision },
      });
      return current;
    });
    return { candidate: await this.candidates.get(tenantId, interview.candidate_id, actor.tenantMemberId), interviewId: interview.id };
  }

  // ── Internals ────────────────────────────────────────────────

  private async markCompleted(tx: Tx, tenantId: string, interview: InterviewRow, actor: AuthenticatedTenantUser) {
    if (interview.scheduled_start.getTime() > Date.now()) throw new ConflictException('This interview has not started yet.');
    await tx.rndtechnosoft_interviews.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: interview.id } },
      data: { interview_status: 'COMPLETED', updated_at: new Date() },
    });
    interview.interview_status = 'COMPLETED';
    const candidate = await this.candidates.lockCandidate(tx, tenantId, interview.candidate_id);
    const from = candidate.candidate_status as CandidateStatus;
    const pending = await tx.rndtechnosoft_interviews.count({ where: { tenant_id: tenantId, candidate_id: interview.candidate_id, interview_status: 'SCHEDULED' } });
    const to: CandidateStatus = from === 'INTERVIEW_SCHEDULED' && pending === 0 ? 'INTERVIEW_COMPLETED' : from;
    await this.candidates.setStatus(tx, tenantId, interview.candidate_id, from, to, {
      type: 'INTERVIEW_COMPLETED',
      summary: `Round ${interview.round_number} interview held`,
      actorMemberId: actor.tenantMemberId,
      metadata: { interviewId: interview.id },
    });
  }

  private async lockInterview(tx: Tx, tenantId: string, interviewId: string) {
    if (!UUID.test(interviewId)) throw new NotFoundException('Interview not found.');
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM rndtechnosoft_interviews WHERE tenant_id = ${tenantId}::uuid AND id = ${interviewId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Interview not found.');
    return tx.rndtechnosoft_interviews.findFirstOrThrow({ where: { tenant_id: tenantId, id: interviewId } });
  }

  private timing(startsAt: string, durationMinutes: number, timezone: string) {
    if (!isTimeZone(timezone)) throw new BadRequestException('Choose a valid time zone, such as Asia/Kolkata.');
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Enter the start as a date and time.');
    if (start.getTime() < Date.now() - 5 * 60 * 1000) throw new BadRequestException('The interview must start in the future.');
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 600) throw new BadRequestException('The duration must be 5 to 600 minutes.');
    return { start };
  }

  /** Where the interview happens: a location in person, a link online, neither by phone. */
  private place(type: string, location?: string, meetingLink?: string) {
    const loc = location?.trim() || null;
    const link = meetingLink?.trim() || null;
    if (type === 'IN_PERSON' && !loc) throw new BadRequestException('Enter where the in-person interview takes place.');
    if (type === 'ONLINE' && !link) throw new BadRequestException('Enter the meeting link for the online interview.');
    return { location: type === 'ONLINE' ? null : loc, meeting_link: type === 'ONLINE' ? link : null };
  }

  private async activeMembers(tenantId: string, ids: string[]) {
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { tenant_id: tenantId, id: { in: ids }, membership_status: 'ACTIVE', archived_at: null },
      select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    if (members.length !== new Set(ids).size) throw new BadRequestException('Every interviewer must be an active member of this workspace.');
    return members.map((member) => ({ id: member.id, name: member.rndtechnosoft_users.display_name || member.rndtechnosoft_users.email, email: member.rndtechnosoft_users.email }));
  }

  /** Emails the candidate and interviewers. The key makes a retried request send nothing again. */
  private async notify(
    tenantId: string,
    initiatedBy: AuthenticatedTenantUser,
    interview: InterviewRow,
    kind: 'SCHEDULED' | 'RESCHEDULED' | 'CANCELLED',
    to: { candidate: boolean; panel: boolean },
    reason?: string,
  ): Promise<OnboardingSendOutcome[]> {
    const [tenant, candidate, panel] = await Promise.all([
      this.prisma.rndtechnosoft_tenants.findUniqueOrThrow({ where: { id: tenantId }, select: { legal_name: true } }),
      this.prisma.rndtechnosoft_candidates.findFirstOrThrow({ where: { tenant_id: tenantId, id: interview.candidate_id }, select: { full_name: true, applied_position: true, email: true } }),
      this.prisma.rndtechnosoft_interview_panelists.findMany({
        where: { tenant_id: tenantId, interview_id: interview.id },
        include: { rndtechnosoft_tenant_members: MEMBER_WITH_USER },
      }),
    ]);
    const company = tenant.legal_name;
    const when = formatInterviewTime(interview.scheduled_start, interview.timezone);
    const round = interview.round_name ? `${interview.round_name} (round ${interview.round_number})` : `Round ${interview.round_number}`;
    const where = interview.interview_type === 'ONLINE' ? `Online: ${interview.meeting_link}` : interview.interview_type === 'PHONE' ? 'By phone' : `In person: ${interview.location}`;
    const heading = { SCHEDULED: 'Interview scheduled', RESCHEDULED: 'Interview rescheduled', CANCELLED: 'Interview cancelled' }[kind];
    const templateCode = { SCHEDULED: 'INTERVIEW_INVITATION', RESCHEDULED: 'INTERVIEW_RESCHEDULED', CANCELLED: 'INTERVIEW_CANCELLED' }[kind];
    // One key per interview, change and time, so the same change never emails anyone twice.
    const version = `${kind}:${interview.scheduled_start.toISOString()}`;

    const lines = (intro: string) => {
      const details: [string, string][] = kind === 'CANCELLED'
        ? [['Was scheduled for', when], ...(reason ? [['Reason', reason] as [string, string]] : [])]
        : [['When', when], ['Duration', `${interview.duration_minutes} minutes`], ['Format', TYPE_LABELS[interview.interview_type]], ['Where', where], ...(kind === 'RESCHEDULED' && reason ? [['Reason for the change', reason] as [string, string]] : [])];
      const instructions = kind !== 'CANCELLED' && interview.instructions ? interview.instructions : null;
      const text = [intro, '', ...details.map(([label, value]) => `${label}: ${value}`), ...(instructions ? ['', instructions] : []), '', company].join('\n');
      const html = [
        `<p>${escapeHtml(intro)}</p>`,
        `<table cellpadding="4">${details.map(([label, value]) => `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>`,
        instructions ? `<p style="white-space:pre-wrap">${escapeHtml(instructions)}</p>` : '',
        `<p>${escapeHtml(company)}</p>`,
      ].join('');
      return { text, html };
    };

    const outcomes: OnboardingSendOutcome[] = [];
    if (to.candidate) {
      const intro = {
        SCHEDULED: `Dear ${candidate.full_name}, thank you for applying for ${candidate.applied_position} at ${company}. Your ${round.toLowerCase()} interview is scheduled.`,
        RESCHEDULED: `Dear ${candidate.full_name}, your ${round.toLowerCase()} interview for ${candidate.applied_position} at ${company} has a new time.`,
        CANCELLED: `Dear ${candidate.full_name}, your ${round.toLowerCase()} interview for ${candidate.applied_position} at ${company} has been cancelled. We will be in touch about next steps.`,
      }[kind];
      outcomes.push(
        await this.mailer.send({
          tenantId,
          idempotencyKey: `interview:${interview.id}:${version}:candidate`,
          templateCode,
          to: candidate.email,
          subject: `${heading}: ${candidate.applied_position} at ${company}`,
          ...lines(intro),
          candidateId: interview.candidate_id,
          interviewId: interview.id,
          initiatedBy,
        }),
      );
    }
    if (to.panel) {
      for (const panelist of panel) {
        const user = panelist.rndtechnosoft_tenant_members.rndtechnosoft_users;
        const intro = {
          SCHEDULED: `You are on the interview panel for ${candidate.full_name} (${candidate.applied_position}), ${round.toLowerCase()}.`,
          RESCHEDULED: `The ${round.toLowerCase()} interview with ${candidate.full_name} (${candidate.applied_position}) has a new time.`,
          CANCELLED: `The ${round.toLowerCase()} interview with ${candidate.full_name} (${candidate.applied_position}) has been cancelled.`,
        }[kind];
        outcomes.push(
          await this.mailer.send({
            tenantId,
            idempotencyKey: `interview:${interview.id}:${version}:member:${panelist.tenant_member_id}`,
            templateCode,
            to: user.email,
            subject: `${heading}: ${candidate.full_name}, ${candidate.applied_position}`,
            ...lines(intro),
            candidateId: interview.candidate_id,
            interviewId: interview.id,
            initiatedBy,
          }),
        );
      }
    }
    return outcomes;
  }
}
