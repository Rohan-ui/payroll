import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { OutreachCalendar } from '@/modules/crm/crm-outreach-schedule';
import { SequenceEnrollmentService } from './sequence-enrollment.service';
import { ConditionLead, matchesConditions, parseConditions } from './sequence-rules';

/** Leads one rule looks at in one round; the rest wait for the next minute. */
const PER_RULE_ROUND = 100;

/**
 * The worker's automatic part: enrollment rules, and ending enrollments of
 * leads that closed or entered a stop stage. Rules watch the leads themselves
 * (created after the rule was switched on, or entering its stage after that),
 * so every way a lead is created or moved counts: by hand, in bulk, by import
 * or by webhook. Each lead and event is looked at once (a unique row), so
 * repeated rounds, retries and several workers never enroll a lead twice.
 */
@Injectable()
export class SequenceAutomationService {
  private readonly logger = new Logger('SequenceAutomation');

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: SequenceEnrollmentService,
  ) {}

  /** Leads a rule would look at next: id and the event's time. */
  candidates(rule: { id: string; tenant_id: string; trigger_kind: string; pipeline_id: string | null; stage_id: string | null; source_id: string | null; enabled_at: Date | null }, limit = PER_RULE_ROUND, since = rule.enabled_at) {
    if (!since) return Promise.resolve([] as { id: string; event_at: Date }[]);
    if (rule.trigger_kind === 'STAGE_ENTERED') {
      return this.prisma.$queryRaw<{ id: string; event_at: Date }[]>`
        SELECT l.id, l.stage_entered_at AS event_at FROM rndtechnosoft_crm_leads l
        WHERE l.tenant_id = ${rule.tenant_id}::uuid AND l.pipeline_id = ${rule.pipeline_id}::uuid AND l.stage_id = ${rule.stage_id}::uuid
          AND l.stage_entered_at >= ${since}
          AND NOT EXISTS (SELECT 1 FROM rndtechnosoft_email_sequence_rule_events e WHERE e.rule_id = ${rule.id}::uuid AND e.lead_id = l.id AND e.event_at = l.stage_entered_at)
        ORDER BY l.stage_entered_at LIMIT ${limit}`;
    }
    return this.prisma.$queryRaw<{ id: string; event_at: Date }[]>`
      SELECT l.id, l.created_at AS event_at FROM rndtechnosoft_crm_leads l
      WHERE l.tenant_id = ${rule.tenant_id}::uuid AND l.created_at >= ${since}
        AND (${rule.source_id}::uuid IS NULL OR l.source_id = ${rule.source_id}::uuid)
        AND NOT EXISTS (SELECT 1 FROM rndtechnosoft_email_sequence_rule_events e WHERE e.rule_id = ${rule.id}::uuid AND e.lead_id = l.id AND e.event_at = l.created_at)
      ORDER BY l.created_at LIMIT ${limit}`;
  }

  /** A lead's fields as rule conditions read them. */
  async conditionLead(tenantId: string, leadId: string): Promise<ConditionLead | null> {
    return this.prisma.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, id: leadId },
      select: { industry: true, city: true, state: true, country_code: true, designation: true, temperature: true, source_id: true, assigned_tenant_member_id: true, pipeline_id: true, stage_id: true },
    });
  }

  async runRules(now = new Date()) {
    const rules = await this.prisma.rndtechnosoft_email_sequence_rules.findMany({
      where: { is_enabled: true, rndtechnosoft_email_sequences: { sequence_status: 'ACTIVE' } },
    });
    const calendars = new Map<string, OutreachCalendar>();
    let enrolled = 0;
    for (const rule of rules) {
      try {
        const conditions = parseConditions(rule.conditions);
        if (!calendars.has(rule.tenant_id)) calendars.set(rule.tenant_id, await this.enrollments.calendar(rule.tenant_id));
        for (const candidate of await this.candidates(rule)) {
          // The event, claimed first: a second worker or round finds it taken.
          const eventId = randomUUID();
          const claimed = await this.prisma.rndtechnosoft_email_sequence_rule_events.createMany({
            data: [{ id: eventId, tenant_id: rule.tenant_id, rule_id: rule.id, lead_id: candidate.id, event_at: candidate.event_at, outcome: 'SKIPPED', skip_reason: 'Being checked' }],
            skipDuplicates: true,
          });
          if (!claimed.count) continue;
          const lead = await this.conditionLead(rule.tenant_id, candidate.id);
          if (!lead || !matchesConditions(lead, conditions)) {
            await this.prisma.rndtechnosoft_email_sequence_rule_events.update({ where: { id: eventId }, data: { skip_reason: 'Doesn’t meet the rule’s conditions' } });
            continue;
          }
          const result = await this.enrollments.enroll(rule.tenant_id, rule.sequence_id, candidate.id, 'RULE', { memberId: null, ruleId: rule.id, calendar: calendars.get(rule.tenant_id) });
          await this.prisma.rndtechnosoft_email_sequence_rule_events.update({
            where: { id: eventId },
            data: result.ok ? { outcome: 'ENROLLED', skip_reason: null, enrollment_id: result.enrollmentId } : { skip_reason: result.reason.slice(0, 200) },
          });
          if (result.ok) enrolled += 1;
        }
        await this.prisma.rndtechnosoft_email_sequence_rules.update({ where: { id: rule.id }, data: { last_run_at: now, last_error: null } });
      } catch (error) {
        this.logger.warn(`Enrollment rule ${rule.id} failed: ${error instanceof Error ? error.name : 'unknown'}`);
        await this.prisma.rndtechnosoft_email_sequence_rules.update({
          where: { id: rule.id },
          data: { last_run_at: now, last_error: error instanceof Error && error.name === 'ConditionProblem' ? error.message.slice(0, 500) : 'The rule could not run this time; it will try again in a minute.' },
        });
      }
    }
    return enrolled;
  }

  /** Ends enrollments whose lead was won, lost, or moved into one of the sequence's stop stages. */
  async sweepStops() {
    const ended = await this.prisma.$queryRaw<{ id: string; tenant_id: string; is_won: boolean; is_lost: boolean; stage_name: string | null }[]>`
      SELECT e.id, e.tenant_id, l.is_won, l.is_lost, st.name AS stage_name
      FROM rndtechnosoft_email_sequence_enrollments e
      JOIN rndtechnosoft_crm_leads l ON l.tenant_id = e.tenant_id AND l.id = e.lead_id
      LEFT JOIN rndtechnosoft_email_sequence_stop_stages ss ON ss.tenant_id = e.tenant_id AND ss.sequence_id = e.sequence_id AND ss.stage_id = l.stage_id
      LEFT JOIN rndtechnosoft_crm_stages st ON st.tenant_id = l.tenant_id AND st.id = l.stage_id
      WHERE e.enrollment_status = 'ACTIVE' AND (l.is_won OR l.is_lost OR ss.stage_id IS NOT NULL)
      LIMIT 200`;
    for (const e of ended) {
      const reason = e.is_won ? 'WON' : e.is_lost ? 'LOST' : 'STOP_STAGE';
      await this.prisma.$transaction((tx) => this.enrollments.stop(tx, e.tenant_id, e.id, reason, reason === 'STOP_STAGE' && e.stage_name ? `Stage: ${e.stage_name}` : null, null));
    }
    return ended.length;
  }
}
