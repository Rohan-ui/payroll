/**
 * Dummy onboarding data for checking the screens by eye: candidates at every stage, their timelines,
 * and interviews today, upcoming, awaiting a decision and decided.
 *
 *   npx ts-node prisma/seed-onboarding-demo.ts <TENANT_CODE>            add it
 *   npx ts-node prisma/seed-onboarding-demo.ts <TENANT_CODE> --remove   take it out again
 *
 * Everything it writes has a candidate code starting "CAN-DEMO-" and an @example.test email, so it is
 * easy to tell apart and to remove. It never touches other candidates, and refuses to run in production.
 * Offers and documents are not seeded: create those from the screens on a demo candidate if needed
 * (remove them before running --remove, or the delete stops on their references).
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const CODE_PREFIX = 'CAN-DEMO-';
const TIMEZONE = 'Asia/Kolkata';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface DemoCandidate {
  name: string;
  position: string;
  status: string;
  source: string;
  salary?: string;
  years?: string;
  /** Days from today; negative is in the past. */
  joiningInDays?: number;
  archived?: boolean;
  interview?: { inHours: number; round: number; type: 'IN_PERSON' | 'PHONE' | 'ONLINE'; decision?: 'SELECT' | 'REJECT' | 'ADVANCE'; feedback?: boolean };
}

const CANDIDATES: DemoCandidate[] = [
  { name: 'Aarav Demo Sharma', position: 'Backend Engineer', status: 'NEW', source: 'LinkedIn', years: '3' },
  { name: 'Diya Demo Patel', position: 'Product Designer', status: 'FORM_SENT', source: 'Referral', years: '2' },
  { name: 'Kabir Demo Nair', position: 'QA Analyst', status: 'FORM_SUBMITTED', source: 'Naukri', salary: '650000.00', years: '4' },
  { name: 'Meera Demo Iyer', position: 'Frontend Engineer', status: 'SCREENING', source: 'Careers page', salary: '900000.00', years: '3.5' },
  { name: 'Rohan Demo Gupta', position: 'Data Analyst', status: 'ELIGIBLE', source: 'LinkedIn', salary: '780000.00', years: '2' },
  { name: 'Sana Demo Khan', position: 'HR Executive', status: 'NOT_ELIGIBLE', source: 'Walk-in', years: '0.5' },
  { name: 'Vihaan Demo Reddy', position: 'DevOps Engineer', status: 'INTERVIEW_SCHEDULED', source: 'Referral', salary: '1400000.00', years: '5',
    interview: { inHours: 2, round: 1, type: 'ONLINE' } },
  { name: 'Anaya Demo Joshi', position: 'Backend Engineer', status: 'INTERVIEW_SCHEDULED', source: 'LinkedIn', salary: '1100000.00', years: '4',
    interview: { inHours: 72, round: 2, type: 'IN_PERSON' } },
  { name: 'Ishaan Demo Verma', position: 'Mobile Developer', status: 'INTERVIEW_COMPLETED', source: 'Naukri', salary: '1000000.00', years: '3',
    interview: { inHours: -26, round: 1, type: 'ONLINE' } },
  { name: 'Tara Demo Menon', position: 'Content Writer', status: 'INTERVIEW_COMPLETED', source: 'Careers page', salary: '500000.00', years: '2',
    interview: { inHours: -5, round: 1, type: 'PHONE', feedback: true } },
  { name: 'Arjun Demo Rao', position: 'Sales Manager', status: 'SELECTED', source: 'Referral', salary: '1600000.00', years: '7',
    interview: { inHours: -72, round: 2, type: 'IN_PERSON', decision: 'SELECT', feedback: true } },
  { name: 'Nisha Demo Das', position: 'Support Engineer', status: 'REJECTED', source: 'Walk-in', years: '1',
    interview: { inHours: -96, round: 1, type: 'IN_PERSON', decision: 'REJECT', feedback: true } },
  { name: 'Kiran Demo Pillai', position: 'Accountant', status: 'OFFER_SENT', source: 'LinkedIn', salary: '720000.00', years: '4', joiningInDays: 21 },
  { name: 'Riya Demo Sen', position: 'UI Engineer', status: 'OFFER_ACCEPTED', source: 'Referral', salary: '950000.00', years: '3', joiningInDays: 14 },
  { name: 'Dev Demo Malhotra', position: 'Business Analyst', status: 'OFFER_DECLINED', source: 'Naukri', salary: '880000.00', years: '3' },
  { name: 'Pooja Demo Kulkarni', position: 'Backend Engineer', status: 'DOCUMENT_COLLECTION', source: 'Careers page', salary: '1050000.00', years: '4', joiningInDays: 10 },
  { name: 'Yash Demo Agarwal', position: 'Data Engineer', status: 'VERIFICATION', source: 'LinkedIn', salary: '1250000.00', years: '5', joiningInDays: 7 },
  { name: 'Zoya Demo Mirza', position: 'Product Manager', status: 'READY_TO_JOIN', source: 'Referral', salary: '2000000.00', years: '8', joiningInDays: 3 },
  { name: 'Manav Demo Bhatt', position: 'Intern', status: 'WITHDRAWN', source: 'Campus', years: '0' },
  { name: 'Lata Demo Shetty', position: 'Office Administrator', status: 'REJECTED', source: 'Walk-in', years: '6', archived: true },
  { name: 'Omkar Demo Jain', position: 'Backend Engineer', status: 'SCREENING', source: 'LinkedIn', years: '2', archived: true },
];

const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.test`;
const dateOnly = (ms: number) => new Date(new Date(ms).toISOString().slice(0, 10));

async function main() {
  const [tenantCode, flag] = process.argv.slice(2);
  if (!tenantCode) throw new Error('Pass the workspace code, e.g. npx ts-node prisma/seed-onboarding-demo.ts ACME_IN');
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to write demo data with NODE_ENV=production.');

  const tenant = await prisma.rndtechnosoft_tenants.findUnique({ where: { tenant_code: tenantCode }, select: { id: true, display_name: true } });
  if (!tenant) throw new Error(`No workspace with code ${tenantCode}.`);
  const tenantId = tenant.id;
  const demoWhere = { tenant_id: tenantId, candidate_code: { startsWith: CODE_PREFIX } };

  if (flag === '--remove') {
    const ids = (await prisma.rndtechnosoft_candidates.findMany({ where: demoWhere, select: { id: true } })).map((c) => c.id);
    await prisma.$transaction(async (tx) => {
      const interviews = { tenant_id: tenantId, candidate_id: { in: ids } };
      const interviewIds = (await tx.rndtechnosoft_interviews.findMany({ where: interviews, select: { id: true } })).map((i) => i.id);
      await tx.rndtechnosoft_interview_panelists.deleteMany({ where: { tenant_id: tenantId, interview_id: { in: interviewIds } } });
      await tx.rndtechnosoft_interviews.deleteMany({ where: interviews });
      await tx.rndtechnosoft_candidate_events.deleteMany({ where: { tenant_id: tenantId, candidate_id: { in: ids } } });
      await tx.rndtechnosoft_candidates.deleteMany({ where: { tenant_id: tenantId, id: { in: ids } } });
    });
    console.log(`Removed ${ids.length} demo candidates from ${tenant.display_name}.`);
    return;
  }

  if (await prisma.rndtechnosoft_candidates.count({ where: demoWhere })) {
    throw new Error(`${tenant.display_name} already has demo candidates. Run with --remove first to start over.`);
  }

  const members = await prisma.rndtechnosoft_tenant_members.findMany({
    where: { tenant_id: tenantId, membership_status: 'ACTIVE' },
    select: { id: true },
    orderBy: { created_at: 'asc' },
    take: 3,
  });
  if (!members.length) throw new Error(`${tenant.display_name} has no active team members to act as recruiters and interviewers.`);
  const departments = await prisma.rndtechnosoft_departments.findMany({ where: { tenant_id: tenantId }, select: { id: true }, take: 4 });

  const now = Date.now();
  // Interviews today are anchored to the top of the next hour, so "today" holds in most time zones.
  const nextHour = Math.ceil(now / HOUR) * HOUR;
  const member = (i: number) => members[i % members.length].id;

  await prisma.$transaction(async (tx) => {
    for (const [i, c] of CANDIDATES.entries()) {
      const id = randomUUID();
      const createdAt = new Date(now - (CANDIDATES.length - i + 3) * DAY);
      const recruiter = member(i);
      await tx.rndtechnosoft_candidates.create({
        data: {
          id,
          tenant_id: tenantId,
          candidate_code: `${CODE_PREFIX}${String(i + 1).padStart(2, '0')}`,
          full_name: c.name,
          email: emailFor(c.name),
          phone: `+91 90000 ${String(10000 + i).slice(-5)}`,
          applied_position: c.position,
          department_id: departments.length ? departments[i % departments.length].id : null,
          hiring_source: c.source,
          expected_salary: c.salary ? new Prisma.Decimal(c.salary) : null,
          experience_years: c.years ? new Prisma.Decimal(c.years) : null,
          expected_joining_date: c.joiningInDays !== undefined ? dateOnly(now + c.joiningInDays * DAY) : null,
          recruiter_tenant_member_id: recruiter,
          created_by_tenant_member_id: recruiter,
          candidate_status: c.status,
          notes: 'Demo candidate for checking the screens.',
          archived_at: c.archived ? new Date(now - DAY) : null,
          created_at: createdAt,
        },
      });

      await tx.rndtechnosoft_candidate_events.create({
        data: { id: randomUUID(), tenant_id: tenantId, candidate_id: id, event_type: 'CREATED', to_status: 'NEW', summary: 'Candidate added', actor_tenant_member_id: recruiter, created_at: createdAt },
      });
      if (c.status !== 'NEW') {
        await tx.rndtechnosoft_candidate_events.create({
          data: {
            id: randomUUID(), tenant_id: tenantId, candidate_id: id, event_type: 'STATUS_CHANGED', from_status: 'NEW', to_status: c.status,
            summary: `Moved to ${c.status.replace(/_/g, ' ').toLowerCase()}`, actor_tenant_member_id: recruiter, created_at: new Date(createdAt.getTime() + DAY),
          },
        });
      }

      if (c.interview) {
        const interviewId = randomUUID();
        const { inHours } = c.interview;
        const start = new Date(inHours > 0 && inHours < 24 ? nextHour + (inHours - 1) * HOUR : now + inHours * HOUR);
        const isPast = start.getTime() < now;
        await tx.rndtechnosoft_interviews.create({
          data: {
            id: interviewId,
            tenant_id: tenantId,
            candidate_id: id,
            round_number: c.interview.round,
            round_name: c.interview.round === 1 ? 'Technical screen' : 'Final round',
            interview_type: c.interview.type,
            scheduled_start: start,
            duration_minutes: 45,
            timezone: TIMEZONE,
            location: c.interview.type === 'IN_PERSON' ? 'Head office, meeting room 2' : null,
            meeting_link: c.interview.type === 'ONLINE' ? 'https://meet.example.test/demo' : null,
            interview_status: c.interview.decision ? (c.interview.decision === 'REJECT' ? 'FAILED' : 'PASSED') : isPast ? 'COMPLETED' : 'SCHEDULED',
            decision: c.interview.decision ?? null,
            decision_notes: c.interview.decision ? 'Demo decision.' : null,
            decided_by_tenant_member_id: c.interview.decision ? recruiter : null,
            decided_at: c.interview.decision ? new Date(start.getTime() + 2 * HOUR) : null,
            created_by_tenant_member_id: recruiter,
          },
        });
        // Every demo interview has the first team member on the panel, so their "feedback due" count shows.
        const panel = [...new Set([member(0), member(i + 1)])];
        for (const panelist of panel) {
          await tx.rndtechnosoft_interview_panelists.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              interview_id: interviewId,
              tenant_member_id: panelist,
              ...(c.interview.feedback && isPast
                ? { feedback_rating: 4, feedback_recommendation: c.interview.decision === 'REJECT' ? 'NO' : 'YES', feedback_notes: 'Demo feedback.', feedback_submitted_at: new Date(start.getTime() + HOUR) }
                : {}),
            },
          });
        }
        await tx.rndtechnosoft_candidate_events.create({
          data: { id: randomUUID(), tenant_id: tenantId, candidate_id: id, event_type: 'INTERVIEW_SCHEDULED', summary: `Round ${c.interview.round} interview scheduled`, actor_tenant_member_id: recruiter, created_at: new Date(createdAt.getTime() + 2 * DAY) },
        });
      }
    }
  });

  console.log(`Added ${CANDIDATES.length} demo candidates to ${tenant.display_name}. Remove them with: npx ts-node prisma/seed-onboarding-demo.ts ${tenantCode} --remove`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
