import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { PermissionKey } from '@/common/access/access-catalog';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { escapeHtml, OnboardingEmail, OnboardingMailerService, OnboardingSendOutcome } from '@/modules/onboarding/onboarding-mailer.service';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { CLEARANCE_OVERRIDE, TEAM_PERMISSION } from './exit-checklist.service';
import { ClearanceTeam } from './dto/offboarding.dto';

type Actor = AuthenticatedTenantUser;

export const OFFBOARDING_EVENTS = [
  'RESIGNATION_SUBMITTED', 'RESIGNATION_ACCEPTED', 'RESIGNATION_WITHDRAWN', 'EXIT_STARTED', 'CHECKLIST_ASSIGNED', 'CHECKLIST_REMINDER',
  'LAST_DAY_REMINDER', 'SETTLEMENT_PENDING_REVIEW', 'SETTLEMENT_APPROVED', 'SETTLEMENT_PAID', 'EXIT_COMPLETED', 'LETTER_ISSUED',
  'INTERVIEW_SCHEDULED', 'INTERVIEW_CANCELLED',
] as const;
export type OffboardingEvent = (typeof OFFBOARDING_EVENTS)[number];
export type NotificationSettings = Record<OffboardingEvent, boolean>;

/**
 * Who an email goes to: the person leaving, their manager, the members
 * holding a permission, or the owners of the open checklist items (whoever
 * has an item, else the team; HR's override only when a team has nobody).
 */
type Audience = 'EMPLOYEE' | 'MANAGER' | 'CHECKLIST_OWNERS' | 'MEMBERS' | PermissionKey;

interface Context { name: string; code: string; lastDay: string; type: string; company: string; detail: string }

const TYPE_LABEL: Record<string, string> = { RESIGNATION: 'resignation', TERMINATION: 'termination', RETIREMENT: 'retirement', CONTRACT_END: 'contract end' };

/** Days before the last working day when reminders start. */
const REMINDER_DAYS = 3;

const EVENTS: Record<OffboardingEvent, { audience: Audience[]; subject: (c: Context) => string; text: (c: Context) => string }> = {
  RESIGNATION_SUBMITTED: {
    audience: ['offboarding.manage', 'MANAGER'],
    subject: (c) => `Resignation submitted: ${c.name}`,
    text: (c) => `${c.name} (${c.code}) has resigned and asked for ${c.lastDay} as their last working day. It is waiting to be accepted in Offboarding.`,
  },
  RESIGNATION_ACCEPTED: {
    audience: ['EMPLOYEE', 'MANAGER'],
    subject: (c) => `Resignation accepted: ${c.name}`,
    text: (c) => `The resignation of ${c.name} (${c.code}) has been accepted. The last working day is ${c.lastDay}.`,
  },
  RESIGNATION_WITHDRAWN: {
    audience: ['offboarding.manage', 'MANAGER'],
    subject: (c) => `Resignation withdrawn: ${c.name}`,
    text: (c) => `${c.name} (${c.code}) has withdrawn their resignation. Nothing more is needed.`,
  },
  EXIT_STARTED: {
    audience: ['offboarding.manage', 'MANAGER'],
    subject: (c) => `Exit started: ${c.name}`,
    text: (c) => `An exit (${c.type}) has been started for ${c.name} (${c.code}). The last working day is ${c.lastDay}.`,
  },
  CHECKLIST_ASSIGNED: {
    audience: ['CHECKLIST_OWNERS'],
    subject: (c) => `Exit checklist for ${c.name}`,
    text: (c) => `The exit checklist for ${c.name} (${c.code}) is ready. Clear your team’s items in Offboarding before ${c.lastDay}, their last working day.`,
  },
  CHECKLIST_REMINDER: {
    audience: ['CHECKLIST_OWNERS'],
    subject: (c) => `Exit checklist still open: ${c.name}`,
    text: (c) => `${c.detail} on the exit checklist for ${c.name} (${c.code}) still need clearing. Their last working day is ${c.lastDay}.`,
  },
  LAST_DAY_REMINDER: {
    audience: ['EMPLOYEE', 'MANAGER', 'offboarding.manage'],
    subject: (c) => `Last working day on ${c.lastDay}: ${c.name}`,
    text: (c) => `The last working day of ${c.name} (${c.code}) is ${c.lastDay}. Make sure handover and the exit checklist are finished.`,
  },
  SETTLEMENT_PENDING_REVIEW: {
    audience: ['offboarding.settlement.review'],
    subject: (c) => `Full and final settlement to review: ${c.name}`,
    text: (c) => `The full and final settlement for ${c.name} (${c.code}) has been submitted and is waiting for Finance’s review in Offboarding.`,
  },
  SETTLEMENT_APPROVED: {
    audience: ['offboarding.settlement.pay', 'offboarding.manage'],
    subject: (c) => `Full and final settlement approved: ${c.name}`,
    text: (c) => `The full and final settlement for ${c.name} (${c.code}) has been approved and can now be paid.`,
  },
  SETTLEMENT_PAID: {
    audience: ['EMPLOYEE', 'offboarding.manage'],
    subject: (c) => `Full and final settlement paid: ${c.name}`,
    text: (c) => `The full and final settlement for ${c.name} (${c.code}) has been paid on ${c.detail}.`,
  },
  EXIT_COMPLETED: {
    audience: ['EMPLOYEE', 'MANAGER', 'offboarding.manage'],
    subject: (c) => `Exit completed: ${c.name}`,
    text: (c) => `The exit of ${c.name} (${c.code}) is complete. Their last working day was ${c.lastDay}.`,
  },
  INTERVIEW_SCHEDULED: {
    audience: ['EMPLOYEE', 'MEMBERS'],
    subject: (c) => `Exit interview: ${c.name}, ${c.detail}`,
    text: (c) => `The exit interview of ${c.name} (${c.code}) is booked for ${c.detail}.`,
  },
  INTERVIEW_CANCELLED: {
    audience: ['EMPLOYEE', 'MEMBERS'],
    subject: (c) => `Exit interview cancelled: ${c.name}`,
    text: (c) => `The exit interview of ${c.name} (${c.code}) booked for ${c.detail} is cancelled. HR will let you know if it is booked again.`,
  },
  LETTER_ISSUED: {
    audience: ['EMPLOYEE'],
    subject: (c) => `Your ${c.detail} from ${c.company}`,
    text: (c) => `Dear ${c.name}, your ${c.detail} is attached.`,
  },
};

const DEFAULT_SETTINGS = Object.fromEntries(OFFBOARDING_EVENTS.map((e) => [e, true])) as NotificationSettings;

export function notificationSettings(saved: unknown): NotificationSettings {
  const source = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  return Object.fromEntries(OFFBOARDING_EVENTS.map((e) => [e, typeof source[e] === 'boolean' ? source[e] : DEFAULT_SETTINGS[e]])) as NotificationSettings;
}

export interface NotifyOptions {
  actor?: Actor | null;
  /** Makes the event distinct, so the same event can happen again (a settlement version, a reminder day). */
  key?: string;
  detail?: string;
  /** For MEMBERS: these members (an interviewer, say), by their sign-in email. */
  memberIds?: string[];
  /** Builds the attachment only when the email can be sent. */
  attachment?: () => Promise<{ filename: string; content: Buffer; contentType: string }>;
}

/**
 * Offboarding's emails, through the workspace's existing mail accounts and
 * the onboarding delivery log (no second notification system). Each event
 * goes once to each recipient: the key is the exit, the event and the
 * address, so a repeated request sends nothing new and a failed one is tried
 * again. A failure never undoes the action that caused it; it is logged
 * against the exit for HR to see. Each event can be switched off.
 *
 * shortcut: email only. WhatsApp needs an approved WhatsApp template mapped per event; add it through OnboardingWhatsAppService when a workspace asks.
 */
@Injectable()
export class OffboardingNotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(OffboardingNotificationsService.name);
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(private readonly prisma: PrismaService, private readonly mailer: OnboardingMailerService, private readonly audit: AuditService) {}

  async settings(tenantId: string): Promise<NotificationSettings> {
    const rows = await this.prisma.$queryRaw<{ value: unknown }[]>`
      SELECT settings->'offboardingNotifications' AS value FROM rndtechnosoft_tenant_settings WHERE tenant_id = ${tenantId}::uuid
    `;
    return notificationSettings(rows[0]?.value ?? null);
  }

  async setSettings(tenantId: string, input: Partial<NotificationSettings>, actor: Actor) {
    const before = await this.settings(tenantId);
    const next = notificationSettings({ ...before, ...input });
    // Merged into the settings JSON, so other settings stay as they are.
    await this.prisma.$executeRaw`
      INSERT INTO rndtechnosoft_tenant_settings (id, tenant_id, settings, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, jsonb_build_object('offboardingNotifications', ${JSON.stringify(next)}::jsonb), NOW(), NOW())
      ON CONFLICT (tenant_id) DO UPDATE
      SET settings = rndtechnosoft_tenant_settings.settings || jsonb_build_object('offboardingNotifications', ${JSON.stringify(next)}::jsonb), updated_at = NOW()
    `;
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'OFFBOARDING_NOTIFICATIONS_UPDATED', entityType: 'OFFBOARDING_NOTIFICATIONS', entityId: tenantId, oldValues: before as never, newValues: next as never });
    return next;
  }

  /** The emails sent (or not) for one exit, newest first. */
  async list(tenantId: string, separationId: string) {
    const rows = await this.prisma.rndtechnosoft_onboarding_notifications.findMany({
      where: { tenant_id: tenantId, separation_id: separationId },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: { id: true, template_code: true, recipient_email: true, delivery_status: true, error_message: true, attempt_count: true, sent_at: true, created_at: true, updated_at: true },
    });
    return rows.map((r) => ({
      id: r.id, event: r.template_code.replace(/^OFFBOARDING_/, ''), channel: 'EMAIL', recipient: r.recipient_email, status: r.delivery_status, error: r.error_message,
      attempts: r.attempt_count, sentAt: r.sent_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
    }));
  }

  /**
   * Sends one event's emails in the background, once the action is saved: HR
   * doesn't wait on the mail server, and the action stands whether or not the
   * email goes. Each outcome is in the exit's email log.
   */
  notify(tenantId: string, event: OffboardingEvent, separationId: string, options: NotifyOptions = {}): void {
    const sending: Promise<unknown> = this.deliver(tenantId, event, separationId, options).finally(() => this.inFlight.delete(sending));
    this.inFlight.add(sending);
  }

  /** Waits for emails still being sent. */
  async flush() {
    while (this.inFlight.size) await Promise.all([...this.inFlight]);
  }

  /** A restart finishes the emails already on their way. */
  async onModuleDestroy() {
    await this.flush();
  }

  /** Sends one event's emails and returns the outcomes. Never throws. */
  async deliver(tenantId: string, event: OffboardingEvent, separationId: string, options: NotifyOptions = {}): Promise<OnboardingSendOutcome[]> {
    try {
      // Independent reads at once: each round trip to the database adds to the action HR is waiting on.
      const [settings, s, company, actor] = await Promise.all([
        this.settings(tenantId),
        this.prisma.rndtechnosoft_employee_separations.findFirst({
          where: { tenant_id: tenantId, id: separationId },
          select: {
            separation_type: true, separation_status: true, last_working_date: true, employee_id: true,
            rndtechnosoft_employees: { select: { first_name: true, last_name: true, preferred_name: true, employee_code: true, user_id: true, work_email: true, personal_email: true, rndtechnosoft_users: { select: { email: true } } } },
          },
        }),
        this.company(tenantId),
        options.actor ? this.prisma.rndtechnosoft_users.findFirst({ where: { id: options.actor.userId }, select: { email: true } }) : null,
      ]);
      if (!settings[event] || !s) return [];
      const e = s.rndtechnosoft_employees;
      const context: Context = {
        name: `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim(), code: e.employee_code, lastDay: isoDate(s.last_working_date),
        type: TYPE_LABEL[s.separation_type] ?? s.separation_type.toLowerCase(), company, detail: options.detail ?? '',
      };
      // Once the exit is complete their work address is closed, so they hear at their personal one.
      const employeeEmail = s.separation_status === 'COMPLETED'
        ? e.personal_email || e.work_email || e.rndtechnosoft_users?.email
        : e.work_email || e.rndtechnosoft_users?.email || e.personal_email;
      const actorEmail = actor?.email;

      const groups = await Promise.all(EVENTS[event].audience.map(async (audience): Promise<Iterable<string>> => {
        if (audience === 'EMPLOYEE') return employeeEmail ? [employeeEmail.trim().toLowerCase()] : [];
        if (audience === 'MANAGER') { const m = await this.managerEmail(tenantId, s.employee_id, s.last_working_date); return m ? [m] : []; }
        if (audience === 'CHECKLIST_OWNERS') return this.checklistOwners(tenantId, separationId, s.employee_id, s.last_working_date, e.user_id);
        if (audience === 'MEMBERS') return this.memberEmails(tenantId, options.memberIds ?? []);
        // The person leaving never gets HR's or Finance's copy about themselves.
        return this.holders(tenantId, audience, e.user_id);
      }));
      const recipients = new Set<string>(groups.flatMap((g) => [...g]));
      // Whoever did it already knows.
      if (actorEmail) recipients.delete(actorEmail.trim().toLowerCase());

      const template = EVENTS[event];
      const text = `${template.text(context)}\n\n${company}`;
      const html = `<p>${escapeHtml(template.text(context))}</p><p>${escapeHtml(company)}</p>`;
      const attach = options.attachment;
      // Each recipient has its own key, so they can go at once without stepping on each other.
      return Promise.all([...recipients].map((to) => {
        const email: OnboardingEmail = {
          tenantId, idempotencyKey: `offboarding:${separationId}:${event}:${options.key ?? ''}:${to}`, templateCode: `OFFBOARDING_${event}`,
          initiatedBy: options.actor ?? null, to, subject: template.subject(context), text, html, separationId,
          build: attach ? async () => ({ subject: template.subject(context), text, html, attachments: [await attach()] }) : undefined,
        };
        return this.mailer.send(email);
      }));
    } catch (error) {
      this.logger.warn(`Offboarding notification failed tenant=${tenantId} separation=${separationId} event=${event} error=${error instanceof Error ? error.name : 'unknown'}`);
      return [];
    }
  }

  /**
   * Daily reminders, run by the background worker: the last working day
   * coming up, and checklist items still open near or after it. Keys carry the
   * day, so each goes once a day however many workers run.
   *
   * shortcut: "today" is the UTC date, not each workspace's time zone; fine for reminders a few days ahead, use the workspace zone if exact-day timing matters.
   */
  async sendReminders(today = isoDate(new Date())) {
    const soon = dateOnly(isoDate(new Date(dateOnly(today).getTime() + REMINDER_DAYS * 24 * 3600 * 1000)));
    const due = await this.prisma.rndtechnosoft_employee_separations.findMany({
      where: { separation_status: 'IN_PROGRESS', last_working_date: { lte: soon } },
      select: { id: true, tenant_id: true, last_working_date: true, rndtechnosoft_separation_clearance_items: { where: { item_status: 'PENDING' }, select: { id: true } } },
      take: 500,
    });
    let sent = 0;
    for (const s of due) {
      if (s.last_working_date >= dateOnly(today)) {
        sent += (await this.deliver(s.tenant_id, 'LAST_DAY_REMINDER', s.id, { key: isoDate(s.last_working_date) })).filter((o) => o.status === 'SENT' && !o.duplicate).length;
      }
      const open = s.rndtechnosoft_separation_clearance_items.length;
      if (open) {
        const detail = open === 1 ? '1 item' : `${open} items`;
        sent += (await this.deliver(s.tenant_id, 'CHECKLIST_REMINDER', s.id, { key: today, detail })).filter((o) => o.status === 'SENT' && !o.duplicate).length;
      }
    }
    return sent;
  }

  /** The primary manager on the last working day, or today if that is earlier. */
  private async managerEmail(tenantId: string, employeeId: string, lastDay: Date) {
    const on = new Date(Math.min(lastDay.getTime(), dateOnly(isoDate(new Date())).getTime()));
    const line = await this.prisma.rndtechnosoft_employee_reporting_lines.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, relationship_type: 'PRIMARY', line_status: 'ACTIVE', effective_from: { lte: on }, OR: [{ effective_to: null }, { effective_to: { gte: on } }] },
      orderBy: { effective_from: 'desc' },
      select: { rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees: { select: { work_email: true, rndtechnosoft_users: { select: { email: true } } } } },
    });
    const manager = line?.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees;
    const email = manager?.work_email || manager?.rndtechnosoft_users?.email;
    return email ? email.trim().toLowerCase() : null;
  }

  private async checklistOwners(tenantId: string, separationId: string, employeeId: string, lastDay: Date, leaverUserId: string | null) {
    const open = await this.prisma.rndtechnosoft_separation_clearance_items.findMany({
      where: { tenant_id: tenantId, separation_id: separationId, item_status: 'PENDING' },
      select: { clearance_team: true, assigned_to: { select: { membership_status: true, user_id: true, rndtechnosoft_users: { select: { email: true } } } } },
    });
    const emails = new Set<string>();
    const unassignedTeams = new Set<ClearanceTeam>();
    for (const item of open) {
      const a = item.assigned_to;
      if (a && a.membership_status === 'ACTIVE' && a.user_id !== leaverUserId) emails.add(a.rndtechnosoft_users.email.trim().toLowerCase());
      else unassignedTeams.add(item.clearance_team as ClearanceTeam);
    }
    const teams = await Promise.all([...unassignedTeams].map(async (team) => {
      if (team === 'MANAGER') {
        const m = await this.managerEmail(tenantId, employeeId, lastDay);
        if (m) return [m];
      }
      const owners = team === 'MANAGER' ? [] : await this.holders(tenantId, TEAM_PERMISSION[team], leaverUserId);
      return owners.length ? owners : this.holders(tenantId, CLEARANCE_OVERRIDE, leaverUserId);
    }));
    for (const email of teams.flat()) emails.add(email);
    return emails;
  }

  private async memberEmails(tenantId: string, memberIds: string[]) {
    if (!memberIds.length) return [];
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { tenant_id: tenantId, id: { in: memberIds }, membership_status: 'ACTIVE' }, select: { rndtechnosoft_users: { select: { email: true } } },
    });
    return members.map((m) => m.rndtechnosoft_users.email.trim().toLowerCase());
  }

  /** Active members whose active roles grant the permission. */
  private async holders(tenantId: string, permission: PermissionKey, excludingUserId: string | null) {
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: {
        tenant_id: tenantId, membership_status: 'ACTIVE', ...(excludingUserId ? { user_id: { not: excludingUserId } } : {}),
        rndtechnosoft_tenant_member_roles: { some: { rndtechnosoft_roles: { role_status: 'ACTIVE', rndtechnosoft_role_permissions: { some: { rndtechnosoft_permissions: { permission_code: permission } } } } } },
      },
      select: { rndtechnosoft_users: { select: { email: true } } },
      take: 25,
    });
    return members.map((m) => m.rndtechnosoft_users.email.trim().toLowerCase());
  }

  private async company(tenantId: string) {
    const t = await this.prisma.rndtechnosoft_tenants.findFirst({ where: { id: tenantId }, select: { display_name: true, legal_name: true } });
    return t?.display_name || t?.legal_name || 'HR';
  }
}
