import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { CANDIDATE_STATUSES, CandidateStatus } from './onboarding-workflow';
import { isTimeZone } from './interviews.service';
import { OffersService } from './offers.service';

/** Statuses of candidates who have been selected and have not yet joined or dropped out. */
const JOINING_PIPELINE: CandidateStatus[] = ['SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED', 'DOCUMENT_COLLECTION', 'VERIFICATION', 'READY_TO_JOIN'];

/** Midnight today and the calendar date, in a time zone. */
export function todayIn(timezone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const wallClockAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = wallClockAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const start = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000), date: `${parts.year}-${parts.month}-${parts.day}` };
}

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

@Injectable()
export class OnboardingDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: OffersService,
  ) {}

  /** Counts from this workspace's records only; each comes with the filter that lists them. */
  async summary(tenantId: string, actor: AuthenticatedTenantUser, requestedTimezone?: string) {
    const timezone = requestedTimezone && isTimeZone(requestedTimezone) ? requestedTimezone : 'UTC';
    const today = todayIn(timezone);
    const soon = addDays(today.date, 30);
    const now = new Date();
    const active = { tenant_id: tenantId, archived_at: null };
    const undecided = { tenant_id: tenantId, interview_status: { not: 'CANCELLED' }, decision: null, scheduled_start: { lt: now } };

    await this.offers.expireDue(tenantId);
    const [byStatus, interviewsToday, awaitingDecision, myFeedbackDue, joiningSoon, offersAwaitingApproval, myApprovals, offersAwaitingResponse, documentsToVerify] = await Promise.all([
      this.prisma.rndtechnosoft_candidates.groupBy({ by: ['candidate_status'], where: active, _count: { _all: true } }),
      this.prisma.rndtechnosoft_interviews.count({
        where: { tenant_id: tenantId, interview_status: { not: 'CANCELLED' }, scheduled_start: { gte: today.start, lt: today.end } },
      }),
      this.prisma.rndtechnosoft_interviews.count({ where: undecided }),
      this.prisma.rndtechnosoft_interviews.count({
        where: { ...undecided, rndtechnosoft_interview_panelists: { some: { tenant_member_id: actor.tenantMemberId, feedback_submitted_at: null } } },
      }),
      this.prisma.rndtechnosoft_candidates.count({
        where: { ...active, candidate_status: { in: JOINING_PIPELINE }, expected_joining_date: { gte: new Date(today.date), lte: new Date(soon) } },
      }),
      this.prisma.rndtechnosoft_offers.count({ where: { tenant_id: tenantId, offer_status: 'PENDING_APPROVAL' } }),
      this.offers.offersAwaitingApprovalBy(tenantId, actor.tenantMemberId),
      this.prisma.rndtechnosoft_offers.count({ where: { tenant_id: tenantId, offer_status: 'SENT' } }),
      this.prisma.rndtechnosoft_candidates.count({
        where: { ...active, rndtechnosoft_candidate_document_requests: { some: { rndtechnosoft_candidate_document_files: { some: { review_status: 'PENDING_REVIEW' } } } } },
      }),
    ]);

    const counts = Object.fromEntries(CANDIDATE_STATUSES.map((status) => [status, 0])) as Record<CandidateStatus, number>;
    for (const row of byStatus) counts[row.candidate_status as CandidateStatus] = row._count._all;

    return {
      timezone,
      today: today.date,
      totalCandidates: Object.values(counts).reduce((sum, n) => sum + n, 0),
      byStatus: counts,
      interviewsToday,
      interviewsAwaitingDecision: awaitingDecision,
      myFeedbackDue,
      joiningSoon: { count: joiningSoon, from: today.date, to: soon },
      offersAwaitingApproval,
      myApprovalsDue: myApprovals.length,
      offersAwaitingResponse,
      candidatesWithDocumentsToVerify: documentsToVerify,
    };
  }
}
