import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { Db, EMAIL_PATTERN, normalizeEmail } from './sequence-context';
import { SequenceEnrollmentService } from './sequence-enrollment.service';

export type SuppressionReason = 'UNSUBSCRIBED' | 'BOUNCED' | 'MANUAL';
const STRENGTH: Record<SuppressionReason, number> = { MANUAL: 1, BOUNCED: 2, UNSUBSCRIBED: 3 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Shows an address without giving it away: p****@client.test. */
const masked = (email: string) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(6, name.length - 1)))}@${domain}`;
};

/**
 * The workspace's do-not-email list. An address on it gets no sequence email
 * (and no Client Outreach email): checked just before every send, not only at
 * enrollment. Recipients unsubscribe through the link in each email, without
 * signing in; hard bounces are added automatically; administrators add and
 * remove addresses by hand. An unsubscribe can't be removed by a team member:
 * only the recipient asked for it.
 */
@Injectable()
export class EmailSuppressionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly domains: TenantDomainsService,
    private readonly enrollments: SequenceEnrollmentService,
  ) {}

  async isSuppressed(tenantId: string, email: string, db: Db | PrismaService = this.prisma) {
    return Boolean(await db.rndtechnosoft_email_suppressions.findFirst({ where: { tenant_id: tenantId, email: normalizeEmail(email) }, select: { id: true } }));
  }

  async list(tenantId: string, query: { search?: string; reason?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where: Prisma.rndtechnosoft_email_suppressionsWhereInput = {
      tenant_id: tenantId,
      ...(query.search?.trim() ? { email: { contains: query.search.trim().toLowerCase() } } : {}),
      ...(query.reason && ['UNSUBSCRIBED', 'BOUNCED', 'MANUAL'].includes(query.reason) ? { suppression_reason: query.reason } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_email_suppressions.findMany({
        where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { created_by: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } },
      }),
      this.prisma.rndtechnosoft_email_suppressions.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id, email: r.email, reason: r.suppression_reason, source: r.suppression_source, note: r.note, createdAt: r.created_at,
        addedBy: r.created_by ? r.created_by.rndtechnosoft_users.display_name || r.created_by.rndtechnosoft_users.email : null,
        removable: r.suppression_reason !== 'UNSUBSCRIBED',
      })),
      page, limit, total,
    };
  }

  /** Adds addresses by hand; ones already on the list stay as they are. Their enrollments stop. */
  async addManual(tenantId: string, emails: string[], note: string | undefined, actor: AuthenticatedTenantUser) {
    const clean = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
    const invalid = clean.filter((e) => !EMAIL_PATTERN.test(e));
    if (invalid.length) throw new BadRequestException(`These aren’t valid email addresses: ${invalid.slice(0, 5).join(', ')}.`);
    if (!clean.length) throw new BadRequestException('Enter at least one email address.');
    let added = 0;
    for (const email of clean) {
      const created = await this.prisma.$transaction((tx) => this.suppress(tx, tenantId, email, 'MANUAL', 'MANUAL', { note: note?.trim() || null, memberId: actor.tenantMemberId }));
      if (created) added += 1;
    }
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'EMAIL_SUPPRESSION_ADDED', entityType: 'EMAIL_SUPPRESSION', entityId: tenantId, metadata: { count: added, emails: clean.slice(0, 50).map(masked) } });
    return { added, alreadyListed: clean.length - added };
  }

  async remove(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    if (!UUID.test(id)) throw new NotFoundException('Address not found.');
    const row = await this.prisma.rndtechnosoft_email_suppressions.findFirst({ where: { tenant_id: tenantId, id } });
    if (!row) throw new NotFoundException('Address not found.');
    if (row.suppression_reason === 'UNSUBSCRIBED') throw new ConflictException('This person unsubscribed. Only they can choose to hear from you again; the address stays on the list.');
    await this.prisma.rndtechnosoft_email_suppressions.delete({ where: { id: row.id } });
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'EMAIL_SUPPRESSION_REMOVED', entityType: 'EMAIL_SUPPRESSION', entityId: row.id,
      metadata: { email: masked(row.email), reason: row.suppression_reason },
    });
    return { removed: true };
  }

  /**
   * Puts an address on the list (a stronger reason replaces a weaker one) and
   * stops every active enrollment sending to it. True when that changed the list.
   */
  async suppress(tx: Db, tenantId: string, email: string, reason: SuppressionReason, source: 'LINK' | 'ONE_CLICK' | 'BOUNCE' | 'MANUAL', extra: { note?: string | null; sendId?: string | null; memberId?: string | null } = {}) {
    const address = normalizeEmail(email);
    const existing = await tx.rndtechnosoft_email_suppressions.findFirst({ where: { tenant_id: tenantId, email: address } });
    const upgraded = existing !== null && STRENGTH[existing.suppression_reason as SuppressionReason] < STRENGTH[reason];
    if (existing && upgraded) {
      await tx.rndtechnosoft_email_suppressions.update({ where: { id: existing.id }, data: { suppression_reason: reason, suppression_source: source, send_id: extra.sendId ?? existing.send_id } });
    }
    if (!existing) {
      await tx.rndtechnosoft_email_suppressions.create({
        data: { id: randomUUID(), tenant_id: tenantId, email: address, suppression_reason: reason, suppression_source: source, note: extra.note ?? null, send_id: extra.sendId ?? null, created_by_tenant_member_id: extra.memberId ?? null },
      });
    }
    await this.enrollments.stopByEmail(tx, tenantId, address, reason === 'MANUAL' ? 'SUPPRESSED' : reason);
    return !existing || upgraded;
  }

  // ── The recipient's unsubscribe link ─────────────────────────

  /** What the unsubscribe page shows: whose emails, to which (masked) address, and whether it is already done. */
  async unsubscribeView(token: string, host: string | undefined) {
    const send = await this.sendForToken(token, host);
    const [listed, company] = await Promise.all([this.isSuppressed(send.tenant_id, send.recipient_email), this.companyName(send.tenant_id)]);
    const unsubscribed = listed && (await this.prisma.rndtechnosoft_email_suppressions.findFirst({ where: { tenant_id: send.tenant_id, email: normalizeEmail(send.recipient_email), suppression_reason: 'UNSUBSCRIBED' }, select: { id: true } }));
    return { company, email: masked(normalizeEmail(send.recipient_email)), unsubscribed: Boolean(unsubscribed) };
  }

  /** Unsubscribes the email's recipient from all of the workspace's marketing email, at once. Asking twice is fine. */
  async unsubscribe(token: string, host: string | undefined, source: 'LINK' | 'ONE_CLICK') {
    const send = await this.sendForToken(token, host);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.suppress(tx, send.tenant_id, send.recipient_email, 'UNSUBSCRIBED', source, { sendId: send.id });
      if (changed) {
        await tx.rndtechnosoft_crm_lead_activities.create({
          data: {
            id: randomUUID(), tenant_id: send.tenant_id, lead_id: send.lead_id, activity_type: 'EMAIL_UNSUBSCRIBED',
            title: 'Unsubscribed from marketing email', description: `${send.recipient_email} unsubscribed using the link in a drip sequence email. They will get no more marketing email from this workspace.`, created_at: new Date(),
          },
        });
      }
    });
    return { company: await this.companyName(send.tenant_id), email: masked(normalizeEmail(send.recipient_email)), unsubscribed: true };
  }

  /** The email a token belongs to, answered only on its own workspace's address (as offer links are). */
  private async sendForToken(token: string, host: string | undefined) {
    const invalid = new NotFoundException('This unsubscribe link is not valid.');
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw invalid;
    const send = await this.prisma.rndtechnosoft_email_sequence_sends.findFirst({
      where: { unsubscribe_token_hash: hashToken(token) },
      select: { id: true, tenant_id: true, lead_id: true, recipient_email: true },
    });
    if (!send) throw invalid;
    const where = await this.domains.resolveHost(host);
    if (where.kind === 'foreign' || where.kind === 'unknown' || (where.kind === 'tenant' && where.tenantId !== send.tenant_id)) throw invalid;
    return send;
  }

  private async companyName(tenantId: string) {
    return (await this.prisma.rndtechnosoft_tenants.findUnique({ where: { id: tenantId }, select: { legal_name: true } }))?.legal_name ?? 'this company';
  }
}
