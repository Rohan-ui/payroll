import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OutreachCalendar } from '@/modules/crm/crm-outreach-schedule';
import { SendSchedule } from './sequence-schedule';

export type Db = Prisma.TransactionClient;

/** Client Outreach states in which a lead is still being worked through the playbook. */
export const OUTREACH_IN_PROGRESS = ['ACTIVE', 'PAUSED', 'BRANCHED'];

/** Whether a lead is in Client Outreach, from its stored cadence. */
export function outreachStatus(customAttributes: unknown): string | null {
  const cadence = (customAttributes as { cadence?: { status?: unknown } } | null)?.cadence;
  return typeof cadence?.status === 'string' ? cadence.status : null;
}
export const inClientOutreach = (customAttributes: unknown) => OUTREACH_IN_PROGRESS.includes(outreachStatus(customAttributes) ?? '');

/** A sequence's schedule in the workspace calendar. */
export function scheduleOf(
  sequence: { send_weekdays: number[]; window_start_minute: number; window_end_minute: number; skip_holidays: boolean },
  calendar: OutreachCalendar,
): SendSchedule {
  return {
    timeZone: calendar.timeZone,
    holidays: calendar.holidays,
    weekdays: sequence.send_weekdays,
    windowStart: sequence.window_start_minute,
    windowEnd: sequence.window_end_minute,
    skipHolidays: sequence.skip_holidays,
  };
}

/** Why an enrollment ended, in words for the lead's timeline and the enrollment history. */
export const STOP_REASONS: Record<string, string> = {
  REPLIED: 'The lead replied',
  BOUNCED: 'The email bounced',
  UNSUBSCRIBED: 'The lead unsubscribed',
  SUPPRESSED: 'The address is on the do-not-email list',
  WON: 'The lead was marked won',
  LOST: 'The lead was marked lost',
  STOP_STAGE: 'The lead entered a stage that ends the sequence',
  MANUAL: 'Stopped by a team member',
  SEQUENCE_ARCHIVED: 'The sequence was archived',
  MOVED_TO_OUTREACH: 'Moved to Client Outreach',
  NO_EMAIL: 'The lead has no valid email address',
};

/** An entry on the lead's CRM timeline. */
export function leadActivity(db: Db, tenantId: string, leadId: string, type: string, title: string, description: string | null, memberId: string | null = null, at = new Date()) {
  return db.rndtechnosoft_crm_lead_activities.create({
    data: { id: randomUUID(), tenant_id: tenantId, lead_id: leadId, activity_type: type, title: title.slice(0, 200), description, performed_by_tenant_member_id: memberId, created_at: at },
  });
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
