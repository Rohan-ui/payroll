import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { MailSenderService, MailSendError } from '@/modules/mail/mail-sender.service';
import { GmailService } from '@/modules/gmail/gmail.service';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';
import { LeadVisibility, visibleLeads } from '@/modules/crm/lead-visibility';
import { SequenceEnrollmentService } from './sequence-enrollment.service';
import { SequenceSenderService } from './sequence-sender.service';
import { SequenceAutomationService } from './sequence-automation.service';
import { leadValues, renderPlaceholders, SAMPLE_VALUES, SEQUENCE_PLACEHOLDERS, unknownPlaceholders } from './sequence-placeholders';
import { CONDITION_FIELDS, CONDITION_OPERATORS, ConditionProblem, matchesConditions, parseConditions } from './sequence-rules';
import { todayRange } from './sequence-schedule';
import { PreviewEmailDto, SequenceInputDto, SequenceRuleDto } from './dto/email-sequences.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEPS = { where: { removed_at: null }, orderBy: { step_order: 'asc' } } satisfies Prisma.rndtechnosoft_email_sequences$rndtechnosoft_email_sequence_stepsArgs;
type Sequence = Prisma.rndtechnosoft_email_sequencesGetPayload<object>;
type Step = Prisma.rndtechnosoft_email_sequence_stepsGetPayload<object>;
const minutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Drip sequences as people manage them: the sequences and their emails,
 * activation (only a complete sequence goes live), the dashboard and report
 * numbers (counted from what was actually sent and came back, never made up),
 * previews and test emails, and automatic enrollment rules.
 */
@Injectable()
export class EmailSequencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailSender: MailSenderService,
    private readonly gmail: GmailService,
    private readonly settings: OrganizationSettingsService,
    private readonly enrollments: SequenceEnrollmentService,
    private readonly sender: SequenceSenderService,
    private readonly automation: SequenceAutomationService,
  ) {}

  // ── Dashboard ───────────────────────────────────────────────

  async overview(tenantId: string) {
    const calendar = await this.enrollments.calendar(tenantId);
    const today = todayRange(new Date(), calendar.timeZone);
    const [byStatus, enrolled, sent, replied, bounced, unsubscribed, scheduledToday, failed, uncertain, waiting, readiness] = await Promise.all([
      this.prisma.rndtechnosoft_email_sequences.groupBy({ by: ['sequence_status'], where: { tenant_id: tenantId }, _count: { _all: true } }),
      this.prisma.rndtechnosoft_email_sequence_enrollments.count({ where: { tenant_id: tenantId, enrollment_status: 'ACTIVE' } }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: tenantId, send_status: { in: ['SENT', 'BOUNCED'] } } }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: tenantId, replied_at: { not: null } } }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: tenantId, send_status: 'BOUNCED' } }),
      this.prisma.rndtechnosoft_email_suppressions.count({ where: { tenant_id: tenantId, suppression_reason: 'UNSUBSCRIBED' } }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: tenantId, send_status: 'SCHEDULED', scheduled_at: { gte: today.start, lt: today.end }, rndtechnosoft_email_sequences: { sequence_status: 'ACTIVE' } } }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: tenantId, send_status: 'FAILED', rndtechnosoft_email_sequence_enrollments: { enrollment_status: 'ACTIVE' } } }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: tenantId, send_status: 'UNCERTAIN', rndtechnosoft_email_sequence_enrollments: { enrollment_status: 'ACTIVE' } } }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: tenantId, send_status: 'SCHEDULED', failure_code: 'SENDER_UNAVAILABLE' } }),
      this.readiness(tenantId),
    ]);
    const count = (status: string) => byStatus.find((s) => s.sequence_status === status)?._count._all ?? 0;
    return {
      sequences: { total: byStatus.reduce((sum, s) => sum + (s.sequence_status === 'ARCHIVED' ? 0 : s._count._all), 0), active: count('ACTIVE'), draft: count('DRAFT'), paused: count('PAUSED'), archived: count('ARCHIVED') },
      enrolled, sent, replied, bounced, unsubscribed, scheduledToday,
      needsAttention: { failed, uncertain, waitingForSender: waiting, total: failed + uncertain + waiting },
      timeZone: calendar.timeZone,
      readiness,
      placeholders: SEQUENCE_PLACEHOLDERS,
      conditionFields: Object.entries(CONDITION_FIELDS).map(([key, f]) => ({ key, label: f.label })),
      conditionOperators: CONDITION_OPERATORS,
    };
  }

  /** What the workspace has for sending: the organization account, personal accounts, and an unsubscribe address. */
  async readiness(tenantId: string) {
    const [organization, policy, links] = await Promise.all([this.mailSender.organization(tenantId), this.settings.emailPolicy(tenantId), this.sender.unsubscribeLinksFor(tenantId)]);
    return {
      organizationSender: organization.kind === 'ORGANIZATION' ? { email: organization.email, name: organization.name } : null,
      organizationProblem: organization.kind === 'NONE' ? organization.reason : null,
      personalAccountsAllowed: policy === 'ALLOWED',
      unsubscribeAvailable: Boolean(links),
    };
  }

  /** What the editor offers to choose from: pipelines with their stages, lead sources, and library templates (names, ids and text only). */
  async options(tenantId: string) {
    const [pipelines, sources, templates] = await Promise.all([
      this.prisma.rndtechnosoft_crm_pipelines.findMany({
        where: { tenant_id: tenantId, is_active: true }, orderBy: { sort_order: 'asc' },
        select: { id: true, name: true, rndtechnosoft_crm_stages: { orderBy: { sort_order: 'asc' }, select: { id: true, name: true, is_won: true, is_lost: true } } },
      }),
      this.prisma.rndtechnosoft_crm_lead_sources.findMany({ where: { tenant_id: tenantId, is_active: true }, orderBy: { sort_order: 'asc' }, select: { id: true, name: true } }),
      this.prisma.rndtechnosoft_email_templates.findMany({ where: { tenant_id: tenantId }, orderBy: { template_name: 'asc' }, take: 200, select: { id: true, template_name: true, subject: true, body_text: true } }),
    ]);
    return {
      pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, stages: p.rndtechnosoft_crm_stages.map((s) => ({ id: s.id, name: s.name, isWon: s.is_won, isLost: s.is_lost })) })),
      sources,
      templates: templates.map((t) => ({ id: t.id, name: t.template_name, subject: t.subject, body: t.body_text })),
    };
  }

  // ── Sequences ───────────────────────────────────────────────

  async list(tenantId: string, status?: string) {
    const rows = await this.prisma.rndtechnosoft_email_sequences.findMany({
      where: { tenant_id: tenantId, ...(status && ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status) ? { sequence_status: status } : { sequence_status: { not: 'ARCHIVED' } }) },
      orderBy: [{ sequence_status: 'asc' }, { updated_at: 'desc' }],
      take: 200,
      include: { _count: { select: { rndtechnosoft_email_sequence_steps: { where: { removed_at: null } } } } },
    });
    const ids = rows.map((r) => r.id);
    const [active, sent, replied] = await Promise.all([
      this.prisma.rndtechnosoft_email_sequence_enrollments.groupBy({ by: ['sequence_id'], where: { tenant_id: tenantId, sequence_id: { in: ids }, enrollment_status: 'ACTIVE' }, _count: { _all: true } }),
      this.prisma.rndtechnosoft_email_sequence_sends.groupBy({ by: ['sequence_id'], where: { tenant_id: tenantId, sequence_id: { in: ids }, send_status: { in: ['SENT', 'BOUNCED'] } }, _count: { _all: true } }),
      this.prisma.rndtechnosoft_email_sequence_sends.groupBy({ by: ['sequence_id'], where: { tenant_id: tenantId, sequence_id: { in: ids }, replied_at: { not: null } }, _count: { _all: true } }),
    ]);
    const of = (list: { sequence_id: string; _count: { _all: number } }[], id: string) => list.find((x) => x.sequence_id === id)?._count._all ?? 0;
    return rows.map((r) => ({
      id: r.id, name: r.sequence_name, description: r.description, status: r.sequence_status, senderMode: r.sender_mode,
      steps: r._count.rndtechnosoft_email_sequence_steps, enrolled: of(active, r.id), sent: of(sent, r.id), replied: of(replied, r.id), updatedAt: r.updated_at,
    }));
  }

  async get(tenantId: string, id: string) {
    const sequence = await this.sequence(tenantId, id);
    const [steps, stopStages, rules, problems, scans, readiness] = await Promise.all([
      this.prisma.rndtechnosoft_email_sequence_steps.findMany({ where: { tenant_id: tenantId, sequence_id: id, ...STEPS.where }, orderBy: STEPS.orderBy }),
      this.prisma.rndtechnosoft_email_sequence_stop_stages.findMany({ where: { tenant_id: tenantId, sequence_id: id }, select: { stage_id: true } }),
      this.rules(tenantId, id),
      this.activationProblems(tenantId, id),
      this.mailboxProblems(tenantId, id),
      this.readiness(tenantId),
    ]);
    return {
      ...this.shape(sequence),
      steps: steps.map((s) => this.stepShape(s)),
      stopStageIds: stopStages.map((s) => s.stage_id),
      rules,
      activationProblems: problems,
      // Replies can only be found in inboxes the app can read: members' own accounts.
      replyDetection: sequence.sender_mode === 'LEAD_OWNER'
        ? { available: true, note: 'Replies and bounces are found in the lead owner’s connected inbox, checked every few minutes.', mailboxProblems: scans }
        : { available: false, note: 'Emails go from the organization account, whose inbox this app can’t read. Replies won’t stop the sequence by themselves: stop a lead’s enrollment when they reply. Bounces aren’t detected either.', mailboxProblems: [] },
      readiness,
      summary: this.summary(sequence, steps, readiness),
    };
  }

  async create(tenantId: string, input: SequenceInputDto, actor: AuthenticatedTenantUser) {
    const id = randomUUID();
    const steps = await this.checkInput(tenantId, input);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.rndtechnosoft_email_sequences.create({ data: { id, tenant_id: tenantId, created_by_tenant_member_id: actor.tenantMemberId, ...this.columns(input) } });
        await this.saveStops(tx, tenantId, id, input.stopStageIds);
        await this.saveSteps(tx, tenantId, id, steps, new Set());
      });
    } catch (error) {
      throw this.nameTaken(error);
    }
    await this.log(tenantId, actor, 'EMAIL_SEQUENCE_CREATED', id, { name: input.name.trim(), steps: input.steps.length, sender_mode: input.senderMode });
    return this.get(tenantId, id);
  }

  /**
   * Saves a sequence's settings and emails. Emails already sent stay as sent.
   * Emails waiting to go use the step's text at the moment they are sent; a
   * changed delay or schedule applies to emails scheduled from now on, and the
   * window and daily limit apply at sending. A removed step is skipped.
   */
  async update(tenantId: string, id: string, input: SequenceInputDto, actor: AuthenticatedTenantUser) {
    const before = await this.sequence(tenantId, id);
    if (before.sequence_status === 'ARCHIVED') throw new ConflictException('An archived sequence can’t be changed.');
    const steps = await this.checkInput(tenantId, input);
    const existing = await this.prisma.rndtechnosoft_email_sequence_steps.findMany({ where: { tenant_id: tenantId, sequence_id: id, removed_at: null }, select: { id: true } });
    const known = new Set(existing.map((s) => s.id));
    const foreign = steps.find((s) => s.id && !known.has(s.id));
    if (foreign) throw new BadRequestException('An email in the list isn’t part of this sequence. Reload and try again.');
    if (before.sequence_status !== 'DRAFT' && !steps.some((s) => s.enabled)) throw new BadRequestException('A live sequence needs at least one email switched on. Pause it first to change that.');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.rndtechnosoft_email_sequences.update({ where: { id }, data: { ...this.columns(input), definition_version: { increment: 1 }, updated_at: new Date() } });
        await tx.rndtechnosoft_email_sequence_stop_stages.deleteMany({ where: { tenant_id: tenantId, sequence_id: id } });
        await this.saveStops(tx, tenantId, id, input.stopStageIds);
        await this.saveSteps(tx, tenantId, id, steps, known);
      });
    } catch (error) {
      throw this.nameTaken(error);
    }
    await this.log(tenantId, actor, 'EMAIL_SEQUENCE_UPDATED', id, {
      before: { name: before.sequence_name, sender_mode: before.sender_mode, weekdays: before.send_weekdays, window: [before.window_start_minute, before.window_end_minute], daily_limit: before.daily_limit },
      after: { name: input.name.trim(), sender_mode: input.senderMode, weekdays: input.weekdays, window: [input.windowStart, input.windowEnd], daily_limit: input.dailyLimit },
      steps: input.steps.length,
    });
    return this.get(tenantId, id);
  }

  /** Makes a sequence live, after checking it can actually send. */
  async activate(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const sequence = await this.sequence(tenantId, id);
    if (sequence.sequence_status === 'ACTIVE') return this.get(tenantId, id);
    if (sequence.sequence_status === 'ARCHIVED') throw new ConflictException('An archived sequence can’t be activated.');
    const problems = await this.activationProblems(tenantId, id);
    if (problems.length) throw new BadRequestException({ message: `The sequence can’t be activated yet: ${problems.join(' ')}`, errors: { problems } });
    const resumed = sequence.sequence_status === 'PAUSED';
    await this.prisma.rndtechnosoft_email_sequences.updateMany({ where: { tenant_id: tenantId, id, sequence_status: sequence.sequence_status }, data: { sequence_status: 'ACTIVE', activated_at: new Date(), paused_at: null, updated_at: new Date() } });
    await this.log(tenantId, actor, resumed ? 'EMAIL_SEQUENCE_RESUMED' : 'EMAIL_SEQUENCE_ACTIVATED', id, { before: sequence.sequence_status, after: 'ACTIVE' });
    return this.get(tenantId, id);
  }

  /** Stops sending; enrollments, scheduled emails and history stay, and resuming carries on gradually. */
  async pause(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const sequence = await this.sequence(tenantId, id);
    if (sequence.sequence_status !== 'ACTIVE') throw new ConflictException('Only an active sequence can be paused.');
    await this.prisma.rndtechnosoft_email_sequences.update({ where: { id }, data: { sequence_status: 'PAUSED', paused_at: new Date(), updated_at: new Date() } });
    await this.log(tenantId, actor, 'EMAIL_SEQUENCE_PAUSED', id, { before: 'ACTIVE', after: 'PAUSED' });
    return this.get(tenantId, id);
  }

  /** Ends the sequence: every active enrollment stops and its rules switch off. Its history stays. */
  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const sequence = await this.sequence(tenantId, id);
    if (sequence.sequence_status === 'ARCHIVED') return this.get(tenantId, id);
    const stopped = await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_email_sequences.update({ where: { id }, data: { sequence_status: 'ARCHIVED', archived_at: new Date(), updated_at: new Date() } });
      await tx.rndtechnosoft_email_sequence_rules.updateMany({ where: { tenant_id: tenantId, sequence_id: id }, data: { is_enabled: false, updated_at: new Date() } });
      const active = await tx.rndtechnosoft_email_sequence_enrollments.findMany({ where: { tenant_id: tenantId, sequence_id: id, enrollment_status: 'ACTIVE' }, select: { id: true } });
      for (const e of active) await this.enrollments.stop(tx, tenantId, e.id, 'SEQUENCE_ARCHIVED', null, actor.tenantMemberId);
      return active.length;
    }, { timeout: 60_000 });
    await this.log(tenantId, actor, 'EMAIL_SEQUENCE_ARCHIVED', id, { before: sequence.sequence_status, after: 'ARCHIVED', enrollments_stopped: stopped });
    return this.get(tenantId, id);
  }

  /** Why a sequence can't go live yet, in words; none when it can. */
  async activationProblems(tenantId: string, id: string): Promise<string[]> {
    const sequence = await this.sequence(tenantId, id);
    const steps = await this.prisma.rndtechnosoft_email_sequence_steps.findMany({ where: { tenant_id: tenantId, sequence_id: id, removed_at: null, is_enabled: true } });
    const problems: string[] = [];
    if (!steps.length) problems.push('Add at least one email and switch it on.');
    for (const step of steps) {
      const unknown = unknownPlaceholders(`${step.subject}\n${step.body_text}`);
      if (unknown.length) problems.push(`“${step.step_name}” uses placeholders that don’t exist: ${unknown.map((u) => `{{${u}}}`).join(', ')}.`);
    }
    if (!sequence.send_weekdays.length || sequence.window_end_minute <= sequence.window_start_minute) problems.push('Choose the days and hours emails may go out.');
    const readiness = await this.readiness(tenantId);
    if (sequence.sender_mode === 'ORGANIZATION' && !readiness.organizationSender) problems.push(readiness.organizationProblem ?? 'Set up the organization’s email account in Organization Settings.');
    if (sequence.sender_mode === 'LEAD_OWNER' && !readiness.personalAccountsAllowed) problems.push('The workspace sends from the organization account only. Allow personal accounts in Organization Settings, or send from the organization account.');
    if (!readiness.unsubscribeAvailable) problems.push('This workspace has no web address for unsubscribe links, and every sequence email must carry one. Ask your platform administrator to set one up.');
    return problems;
  }

  // ── Previews and tests ──────────────────────────────────────

  /** An email with its placeholders filled, from a visible lead or sample values. */
  async preview(tenantId: string, visibility: LeadVisibility, input: PreviewEmailDto) {
    let values = SAMPLE_VALUES;
    let sample = true;
    if (input.leadId) {
      const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({
        where: { tenant_id: tenantId, id: input.leadId, ...visibleLeads(visibility) },
        include: { rndtechnosoft_tenant_members: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } },
      });
      if (!lead) throw new NotFoundException('Lead not found.');
      const owner = lead.rndtechnosoft_tenant_members?.rndtechnosoft_users;
      values = leadValues(lead, { owner: owner ? owner.display_name || owner.email : null, sender: null, workspace: await this.sender.workspaceName(tenantId) });
      sample = false;
    }
    const workspace = await this.sender.workspaceName(tenantId);
    values = { 'Workspace Name': workspace, 'Sender Name': 'Your name', 'Lead Owner': 'Lead owner', ...values };
    const subject = renderPlaceholders(input.subject, values);
    const body = renderPlaceholders(input.body, values);
    return {
      subject: subject.text, body: body.text, sample,
      missing: [...new Set([...subject.missing, ...body.missing])],
      unknown: unknownPlaceholders(`${input.subject}\n${input.body}`),
    };
  }

  /**
   * Sends one step, filled with sample values, to the person asking: from the
   * organization account, or (for a sequence sending from lead owners) their
   * own. Never to a lead.
   */
  async testEmail(tenantId: string, id: string, stepId: string, actor: AuthenticatedTenantUser) {
    const sequence = await this.sequence(tenantId, id);
    const step = await this.prisma.rndtechnosoft_email_sequence_steps.findFirst({ where: { tenant_id: tenantId, sequence_id: id, id: stepId, removed_at: null } });
    if (!step) throw new NotFoundException('Email not found.');
    const me = await this.prisma.rndtechnosoft_tenant_members.findFirstOrThrow({
      where: { tenant_id: tenantId, id: actor.tenantMemberId }, select: { id: true, user_id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    const sender = await this.sender.resolveSender(tenantId, sequence.sender_mode, me);
    if (!sender.ok) throw new ConflictException(sender.reason);
    const workspace = await this.sender.workspaceName(tenantId);
    const values = { ...SAMPLE_VALUES, 'Workspace Name': workspace, 'Sender Name': sender.name ?? sender.email, 'Lead Owner': me.rndtechnosoft_users.display_name || me.rndtechnosoft_users.email };
    const message = {
      to: me.rndtechnosoft_users.email,
      subject: `[Test] ${renderPlaceholders(step.subject, values).text}`.slice(0, 300),
      text: `${renderPlaceholders(step.body_text, values).text.replace(/\s+$/, '')}\n\n--\n${workspace}\nTo stop receiving these emails, unsubscribe here: (each real email has its own unsubscribe link here)\n\n(A test of “${step.step_name}” from the drip sequence “${sequence.sequence_name}”, with sample lead details.)`,
    };
    try {
      if (sender.kind === 'GMAIL') await this.gmail.sendAsGmail(tenantId, sender.userId, message);
      else await this.mailSender.sendSmtp(sender.account, message);
    } catch (error) {
      if (error instanceof MailSendError) throw new ServiceUnavailableException(`The test email was not sent from ${sender.email}. ${error.safeReason}`);
      throw error;
    }
    await this.log(tenantId, actor, 'EMAIL_SEQUENCE_TEST_SENT', id, { step_id: stepId, sender: sender.email });
    return { sentTo: me.rndtechnosoft_users.email, from: sender.email };
  }

  // ── Report ──────────────────────────────────────────────────

  /**
   * What a sequence did, step by step, from its records. Emails sent and
   * failed count by when they were sent (or failed) within the range; replies
   * by when they came; enrollments by when they started. The reply rate is
   * replies over emails sent.
   */
  async report(tenantId: string, id: string, range: { from?: string; to?: string }) {
    await this.sequence(tenantId, id);
    const from = range.from ? new Date(range.from) : new Date(0);
    // No end given: the last day the database can hold.
    const to = range.to ? new Date(range.to) : new Date('9999-12-31T00:00:00Z');
    const steps = await this.prisma.rndtechnosoft_email_sequence_steps.findMany({ where: { tenant_id: tenantId, sequence_id: id }, orderBy: { step_order: 'asc' } });
    const counts = await this.prisma.$queryRaw<{ step_id: string; scheduled: bigint; sent: bigint; failed: bigint; uncertain: bigint; bounced: bigint; replied: bigint; cancelled: bigint }[]>`
      SELECT step_id,
        COUNT(*) FILTER (WHERE send_status = 'SCHEDULED') AS scheduled,
        COUNT(*) FILTER (WHERE send_status IN ('SENT', 'BOUNCED') AND sent_at >= ${from} AND sent_at < ${to}) AS sent,
        COUNT(*) FILTER (WHERE send_status = 'FAILED' AND failed_at >= ${from} AND failed_at < ${to}) AS failed,
        COUNT(*) FILTER (WHERE send_status = 'UNCERTAIN') AS uncertain,
        COUNT(*) FILTER (WHERE send_status = 'BOUNCED' AND bounced_at >= ${from} AND bounced_at < ${to}) AS bounced,
        COUNT(*) FILTER (WHERE replied_at >= ${from} AND replied_at < ${to}) AS replied,
        COUNT(*) FILTER (WHERE send_status = 'CANCELLED' AND cancelled_at >= ${from} AND cancelled_at < ${to}) AS cancelled
      FROM rndtechnosoft_email_sequence_sends WHERE tenant_id = ${tenantId}::uuid AND sequence_id = ${id}::uuid
      GROUP BY step_id`;
    const enrollmentRows = await this.prisma.rndtechnosoft_email_sequence_enrollments.groupBy({
      by: ['enrollment_status', 'stop_reason'], where: { tenant_id: tenantId, sequence_id: id, created_at: { gte: from, lt: to } }, _count: { _all: true },
    });
    const unsubscribed = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM rndtechnosoft_email_suppressions x JOIN rndtechnosoft_email_sequence_sends s ON s.id = x.send_id
      WHERE x.tenant_id = ${tenantId}::uuid AND s.sequence_id = ${id}::uuid AND x.suppression_reason = 'UNSUBSCRIBED' AND x.created_at >= ${from} AND x.created_at < ${to}`;
    const n = (v: bigint | undefined) => Number(v ?? 0);
    const perStep = steps.filter((s) => !s.removed_at || counts.some((c) => c.step_id === s.id)).map((s) => {
      const c = counts.find((x) => x.step_id === s.id);
      const sent = n(c?.sent);
      const replied = n(c?.replied);
      return {
        stepId: s.id, order: s.step_order, name: s.step_name, removed: Boolean(s.removed_at), enabled: s.is_enabled,
        scheduled: n(c?.scheduled), sent, failed: n(c?.failed), uncertain: n(c?.uncertain), bounced: n(c?.bounced), replied, cancelled: n(c?.cancelled),
        replyRate: sent ? Math.round((replied / sent) * 1000) / 10 : null,
      };
    });
    const enrollmentCount = (status?: string, reason?: string) => enrollmentRows.filter((r) => (!status || r.enrollment_status === status) && (!reason || r.stop_reason === reason)).reduce((sum, r) => sum + r._count._all, 0);
    const totals = perStep.reduce((t, s) => ({ sent: t.sent + s.sent, replied: t.replied + s.replied, bounced: t.bounced + s.bounced, failed: t.failed + s.failed, scheduled: t.scheduled + s.scheduled }), { sent: 0, replied: 0, bounced: 0, failed: 0, scheduled: 0 });
    return {
      range: { from: range.from ?? null, to: range.to ?? null },
      enrollments: {
        enrolled: enrollmentCount(), inProgress: enrollmentCount('ACTIVE'), completed: enrollmentCount('COMPLETED'), stopped: enrollmentCount('STOPPED'),
        stoppedBy: Object.fromEntries(enrollmentRows.filter((r) => r.stop_reason).map((r) => [r.stop_reason!, r._count._all])),
      },
      totals: { ...totals, unsubscribed: n(unsubscribed[0]?.n), replyRate: totals.sent ? Math.round((totals.replied / totals.sent) * 1000) / 10 : null },
      steps: perStep,
    };
  }

  // ── Automatic enrollment rules ──────────────────────────────

  async rules(tenantId: string, sequenceId: string) {
    const rows = await this.prisma.rndtechnosoft_email_sequence_rules.findMany({
      where: { tenant_id: tenantId, sequence_id: sequenceId }, orderBy: { created_at: 'asc' },
      include: {
        rndtechnosoft_crm_pipelines: { select: { name: true } }, rndtechnosoft_crm_stages: { select: { name: true } }, rndtechnosoft_crm_lead_sources: { select: { name: true } },
      },
    });
    const enrolled = await this.prisma.rndtechnosoft_email_sequence_rule_events.groupBy({ by: ['rule_id'], where: { tenant_id: tenantId, rule_id: { in: rows.map((r) => r.id) }, outcome: 'ENROLLED' }, _count: { _all: true } });
    return rows.map((r) => ({
      id: r.id, name: r.rule_name, triggerKind: r.trigger_kind, pipelineId: r.pipeline_id, stageId: r.stage_id, sourceId: r.source_id,
      pipelineName: r.rndtechnosoft_crm_pipelines?.name ?? null, stageName: r.rndtechnosoft_crm_stages?.name ?? null, sourceName: r.rndtechnosoft_crm_lead_sources?.name ?? null,
      conditions: parseConditions(r.conditions), enabled: r.is_enabled, enabledAt: r.enabled_at, lastRunAt: r.last_run_at, lastError: r.last_error,
      enrolled: enrolled.find((e) => e.rule_id === r.id)?._count._all ?? 0,
    }));
  }

  async saveRule(tenantId: string, sequenceId: string, ruleId: string | null, input: SequenceRuleDto, actor: AuthenticatedTenantUser) {
    const sequence = await this.sequence(tenantId, sequenceId);
    if (sequence.sequence_status === 'ARCHIVED') throw new ConflictException('An archived sequence can’t have rules.');
    let conditions;
    try {
      conditions = parseConditions(input.conditions ?? {});
    } catch (error) {
      if (error instanceof ConditionProblem) throw new BadRequestException(error.message);
      throw error;
    }
    const data = {
      rule_name: input.name.trim(), trigger_kind: input.triggerKind,
      pipeline_id: input.triggerKind === 'STAGE_ENTERED' ? input.pipelineId ?? null : null,
      stage_id: input.triggerKind === 'STAGE_ENTERED' ? input.stageId ?? null : null,
      source_id: input.triggerKind === 'LEAD_CREATED' ? input.sourceId ?? null : null,
      conditions: conditions as unknown as Prisma.InputJsonObject,
    };
    if (!data.rule_name) throw new BadRequestException('Enter a name for the rule.');
    if (data.trigger_kind === 'STAGE_ENTERED') {
      if (!data.pipeline_id || !data.stage_id) throw new BadRequestException('Choose the pipeline and stage that enroll leads.');
      const stage = await this.prisma.rndtechnosoft_crm_stages.findFirst({ where: { tenant_id: tenantId, id: data.stage_id, pipeline_id: data.pipeline_id }, select: { is_won: true, is_lost: true } });
      if (!stage) throw new BadRequestException('Choose a stage of the chosen pipeline.');
      if (stage.is_won || stage.is_lost) throw new BadRequestException('Leads entering a won or lost stage can’t be enrolled.');
    }
    if (data.source_id && !(await this.prisma.rndtechnosoft_crm_lead_sources.findFirst({ where: { tenant_id: tenantId, id: data.source_id }, select: { id: true } }))) {
      throw new BadRequestException('Choose a lead source of this workspace.');
    }
    const id = ruleId ?? randomUUID();
    if (ruleId) {
      const existing = await this.rule(tenantId, sequenceId, ruleId);
      await this.prisma.rndtechnosoft_email_sequence_rules.update({ where: { id: existing.id }, data: { ...data, updated_at: new Date() } });
    } else {
      await this.prisma.rndtechnosoft_email_sequence_rules.create({ data: { id, tenant_id: tenantId, sequence_id: sequenceId, created_by_tenant_member_id: actor.tenantMemberId, ...data } });
    }
    await this.log(tenantId, actor, ruleId ? 'EMAIL_SEQUENCE_RULE_UPDATED' : 'EMAIL_SEQUENCE_RULE_CREATED', sequenceId, { rule_id: id, ...data });
    return this.rules(tenantId, sequenceId);
  }

  /** Switches a rule on (for leads from now on: never the ones already there) or off. */
  async setRuleEnabled(tenantId: string, sequenceId: string, ruleId: string, enabled: boolean, actor: AuthenticatedTenantUser) {
    const rule = await this.rule(tenantId, sequenceId, ruleId);
    await this.prisma.rndtechnosoft_email_sequence_rules.update({
      where: { id: rule.id }, data: enabled ? { is_enabled: true, enabled_at: rule.is_enabled ? rule.enabled_at : new Date(), last_error: null, updated_at: new Date() } : { is_enabled: false, updated_at: new Date() },
    });
    await this.log(tenantId, actor, enabled ? 'EMAIL_SEQUENCE_RULE_ENABLED' : 'EMAIL_SEQUENCE_RULE_DISABLED', sequenceId, { rule_id: ruleId });
    return this.rules(tenantId, sequenceId);
  }

  async deleteRule(tenantId: string, sequenceId: string, ruleId: string, actor: AuthenticatedTenantUser) {
    const rule = await this.rule(tenantId, sequenceId, ruleId);
    await this.prisma.rndtechnosoft_email_sequence_rules.delete({ where: { id: rule.id } });
    await this.log(tenantId, actor, 'EMAIL_SEQUENCE_RULE_DELETED', sequenceId, { rule_id: ruleId, name: rule.rule_name });
    return this.rules(tenantId, sequenceId);
  }

  /**
   * Which leads a rule would have enrolled over the last 30 days, and why the
   * others wouldn't: every check of a real enrollment, nothing enrolled.
   */
  async dryRunRule(tenantId: string, sequenceId: string, ruleId: string, visibility: LeadVisibility) {
    const rule = await this.rule(tenantId, sequenceId, ruleId);
    const conditions = parseConditions(rule.conditions);
    const candidates = await this.automation.candidates({ ...rule, enabled_at: rule.enabled_at }, 50, new Date(Date.now() - 30 * 86_400_000));
    const calendar = await this.enrollments.calendar(tenantId);
    const visible = new Set((await this.prisma.rndtechnosoft_crm_leads.findMany({ where: { tenant_id: tenantId, id: { in: candidates.map((c) => c.id) }, ...visibleLeads(visibility) }, select: { id: true } })).map((l) => l.id));
    const leads = await this.prisma.rndtechnosoft_crm_leads.findMany({ where: { tenant_id: tenantId, id: { in: [...visible] } }, select: { id: true, company_name: true, first_name: true, last_name: true, email: true } });
    const results = [];
    for (const candidate of candidates) {
      const lead = leads.find((l) => l.id === candidate.id);
      if (!lead) continue;
      const fields = await this.automation.conditionLead(tenantId, candidate.id);
      const matches = Boolean(fields && matchesConditions(fields, conditions));
      const result = matches ? await this.enrollments.enroll(tenantId, sequenceId, candidate.id, 'RULE', { memberId: null, ruleId, calendar, dryRun: true }) : null;
      results.push({
        leadId: lead.id, company: lead.company_name, name: [lead.first_name, lead.last_name].filter(Boolean).join(' '), email: lead.email, eventAt: candidate.event_at,
        wouldEnroll: Boolean(result?.ok), reason: !matches ? 'Doesn’t meet the rule’s conditions' : result && !result.ok ? result.reason : null,
      });
    }
    return { windowDays: 30, leads: results, note: 'A preview of the last 30 days. Once switched on, the rule only enrolls leads from that moment on.' };
  }

  // ── Internals ───────────────────────────────────────────────

  async sequence(tenantId: string, id: string): Promise<Sequence> {
    if (!UUID.test(id)) throw new NotFoundException('Sequence not found.');
    const row = await this.prisma.rndtechnosoft_email_sequences.findFirst({ where: { tenant_id: tenantId, id } });
    if (!row) throw new NotFoundException('Sequence not found.');
    return row;
  }

  private async rule(tenantId: string, sequenceId: string, ruleId: string) {
    if (!UUID.test(ruleId)) throw new NotFoundException('Rule not found.');
    const rule = await this.prisma.rndtechnosoft_email_sequence_rules.findFirst({ where: { tenant_id: tenantId, sequence_id: sequenceId, id: ruleId } });
    if (!rule) throw new NotFoundException('Rule not found.');
    return rule;
  }

  /** Checks what can't be checked by the DTO: the window, stages and templates of this workspace, and placeholders. */
  private async checkInput(tenantId: string, input: SequenceInputDto) {
    if (input.windowEnd <= input.windowStart) throw new BadRequestException('The sending window must end after it starts.');
    if (!input.name.trim()) throw new BadRequestException('Enter a name for the sequence.');
    if (input.stopStageIds.length) {
      const stages = await this.prisma.rndtechnosoft_crm_stages.count({ where: { tenant_id: tenantId, id: { in: input.stopStageIds } } });
      if (stages !== new Set(input.stopStageIds).size) throw new BadRequestException('Choose stop stages of this workspace.');
    }
    const templateIds = [...new Set(input.steps.map((s) => s.templateId).filter((t): t is string => Boolean(t)))];
    const templates = templateIds.length ? await this.prisma.rndtechnosoft_email_templates.findMany({ where: { tenant_id: tenantId, id: { in: templateIds } }, select: { id: true, template_name: true } }) : [];
    return input.steps.map((step, index) => {
      if (!step.subject.trim() || !step.body.trim() || !step.stepName.trim()) throw new BadRequestException(`Email ${index + 1} needs a name, a subject and a body.`);
      const unknown = unknownPlaceholders(`${step.subject}\n${step.body}`);
      if (unknown.length) throw new BadRequestException(`Email ${index + 1} uses placeholders that don’t exist: ${unknown.map((u) => `{{${u}}}`).join(', ')}. Use only the listed ones.`);
      const template = step.templateId ? templates.find((t) => t.id === step.templateId) : null;
      return { ...step, templateName: template?.template_name ?? null, templateId: template?.id ?? null, enabled: step.enabled };
    });
  }

  private columns(input: SequenceInputDto) {
    return {
      sequence_name: input.name.trim(), description: input.description?.trim() || null, sender_mode: input.senderMode,
      send_weekdays: [...new Set(input.weekdays)].sort(), window_start_minute: input.windowStart, window_end_minute: input.windowEnd,
      skip_holidays: input.skipHolidays, daily_limit: input.dailyLimit,
    };
  }

  private async saveStops(tx: Prisma.TransactionClient, tenantId: string, sequenceId: string, stageIds: string[]) {
    if (stageIds.length) await tx.rndtechnosoft_email_sequence_stop_stages.createMany({ data: [...new Set(stageIds)].map((stage_id) => ({ tenant_id: tenantId, sequence_id: sequenceId, stage_id })) });
  }

  /** The emails in the given order. A removed email that has sends is kept (marked removed) so history stays whole. */
  private async saveSteps(tx: Prisma.TransactionClient, tenantId: string, sequenceId: string, steps: (SequenceInputDto['steps'][number] & { templateName: string | null })[], known: Set<string>) {
    const kept = new Set(steps.map((s) => s.id).filter(Boolean));
    const gone = [...known].filter((id) => !kept.has(id));
    if (gone.length) {
      const used = new Set((await tx.rndtechnosoft_email_sequence_sends.findMany({ where: { tenant_id: tenantId, step_id: { in: gone } }, select: { step_id: true }, distinct: ['step_id'] })).map((s) => s.step_id));
      await tx.rndtechnosoft_email_sequence_steps.updateMany({ where: { tenant_id: tenantId, id: { in: gone.filter((id) => used.has(id)) } }, data: { removed_at: new Date(), updated_at: new Date() } });
      await tx.rndtechnosoft_email_sequence_steps.deleteMany({ where: { tenant_id: tenantId, id: { in: gone.filter((id) => !used.has(id)) } } });
    }
    for (const [index, step] of steps.entries()) {
      const data = {
        step_order: index + 1, step_name: step.stepName.trim(), delay_amount: step.delayAmount, delay_unit: step.delayUnit,
        template_id: step.templateId ?? null, template_name: step.templateName, subject: step.subject.trim(), body_text: step.body.replace(/\s+$/, ''), is_enabled: step.enabled, updated_at: new Date(),
      };
      if (step.id) await tx.rndtechnosoft_email_sequence_steps.update({ where: { id: step.id }, data });
      else await tx.rndtechnosoft_email_sequence_steps.create({ data: { id: randomUUID(), tenant_id: tenantId, sequence_id: sequenceId, ...data } });
    }
  }

  /** Mailboxes this sequence's emails went from that couldn't be read lately. */
  private async mailboxProblems(tenantId: string, sequenceId: string) {
    const members = await this.prisma.rndtechnosoft_email_sequence_sends.findMany({ where: { tenant_id: tenantId, sequence_id: sequenceId, sender_member_id: { not: null } }, select: { sender_member_id: true }, distinct: ['sender_member_id'], take: 50 });
    const scans = await this.prisma.rndtechnosoft_email_mailbox_scans.findMany({ where: { tenant_id: tenantId, member_id: { in: members.map((m) => m.sender_member_id!) }, last_error: { not: null } } });
    return scans.map((s) => ({ mailbox: s.mailbox_email || 'A team member’s inbox', problem: s.last_error, checkedAt: s.last_scanned_at }));
  }

  /** What the sequence will do, in words, from its actual settings only. */
  private summary(sequence: Sequence, steps: Step[], readiness: Awaited<ReturnType<EmailSequencesService['readiness']>>) {
    const live = steps.filter((s) => s.is_enabled);
    const days = sequence.send_weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => sequence.send_weekdays.includes(d)) ? 'Monday to Friday' : sequence.send_weekdays.map((d) => DAY_NAMES[d]).join(', ');
    const from = sequence.sender_mode === 'ORGANIZATION' ? (readiness.organizationSender?.email ?? 'the organization account (not set up yet)') : 'each lead owner’s own connected account';
    return [
      `${live.length} email${live.length === 1 ? '' : 's'} sent from ${from}, on ${days}${sequence.skip_holidays ? ' except holidays' : ''}, between ${minutes(sequence.window_start_minute)} and ${minutes(sequence.window_end_minute)} workspace time, at most ${sequence.daily_limit} a day per mailbox.`,
      `A lead stops getting emails when ${sequence.sender_mode === 'LEAD_OWNER' ? 'they reply, the email bounces, ' : ''}they unsubscribe, the lead is won or lost, or it moves to a stop stage.`,
    ].join(' ');
  }

  shape(s: Sequence) {
    return {
      id: s.id, name: s.sequence_name, description: s.description, status: s.sequence_status, senderMode: s.sender_mode,
      weekdays: s.send_weekdays, windowStart: s.window_start_minute, windowEnd: s.window_end_minute, skipHolidays: s.skip_holidays, dailyLimit: s.daily_limit,
      version: s.definition_version, activatedAt: s.activated_at, pausedAt: s.paused_at, archivedAt: s.archived_at, createdAt: s.created_at, updatedAt: s.updated_at,
    };
  }

  private stepShape(s: Step) {
    return { id: s.id, order: s.step_order, stepName: s.step_name, delayAmount: s.delay_amount, delayUnit: s.delay_unit, templateId: s.template_id, templateName: s.template_name, subject: s.subject, body: s.body_text, enabled: s.is_enabled };
  }

  private nameTaken(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return new ConflictException('Another sequence already has that name.');
    return error;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMAIL_SEQUENCE', entityId: id, metadata });
  }
}

