import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';

export interface ExitReason { code: string; label: string; active: boolean }

/** The standard reasons; a workspace can rename or switch them off, and add its own. */
export const DEFAULT_EXIT_REASONS: ExitReason[] = [
  { code: 'BETTER_OPPORTUNITY', label: 'Better opportunity', active: true },
  { code: 'COMPENSATION', label: 'Compensation', active: true },
  { code: 'CAREER_GROWTH', label: 'Career growth', active: true },
  { code: 'RELOCATION', label: 'Relocation', active: true },
  { code: 'PERSONAL', label: 'Personal reasons', active: true },
  { code: 'WORK_ENVIRONMENT', label: 'Work environment', active: true },
  { code: 'MANAGEMENT', label: 'Management concerns', active: true },
  { code: 'HEALTH_FAMILY', label: 'Health or family reasons', active: true },
  { code: 'RETIREMENT', label: 'Retirement', active: true },
  { code: 'TERMINATION', label: 'Termination', active: true },
  { code: 'CONTRACT_COMPLETION', label: 'Contract completion', active: true },
  { code: 'OTHER', label: 'Other', active: true },
];

const CODE = /^[A-Z][A-Z0-9_]{1,47}$/;

/**
 * The workspace's list: every standard reason (as renamed or switched off),
 * then its own. A reason is never removed, only switched off, so interviews
 * that used it keep their meaning and reports can still count it.
 */
export function exitReasons(saved: unknown): ExitReason[] {
  const rows = Array.isArray(saved) ? (saved as Record<string, unknown>[]) : [];
  const valid = rows.flatMap((r): ExitReason[] => (
    r && typeof r.code === 'string' && CODE.test(r.code) && typeof r.label === 'string' && r.label.trim()
      ? [{ code: r.code, label: r.label.trim().slice(0, 80), active: r.active !== false }]
      : []
  ));
  const byCode = new Map(valid.map((r) => [r.code, r]));
  const standard = DEFAULT_EXIT_REASONS.map((d) => byCode.get(d.code) ?? d);
  const custom = valid.filter((r) => !DEFAULT_EXIT_REASONS.some((d) => d.code === r.code));
  return [...standard, ...custom];
}

@Injectable()
export class ExitReasonsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string): Promise<ExitReason[]> {
    const rows = await this.prisma.$queryRaw<{ value: unknown }[]>`
      SELECT settings->'offboardingExitReasons' AS value FROM rndtechnosoft_tenant_settings WHERE tenant_id = ${tenantId}::uuid
    `;
    return exitReasons(rows[0]?.value ?? null);
  }

  /** Saves the list. A new reason without a code gets one; one already in the list can't be dropped, only switched off. */
  async save(tenantId: string, input: { code?: string; label: string; active: boolean }[], actor: AuthenticatedTenantUser) {
    const before = await this.list(tenantId);
    const given = input.map((r) => ({ code: r.code || `CUSTOM_${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`, label: r.label.trim(), active: r.active }));
    const missing = before.filter((b) => !given.some((g) => g.code === b.code));
    if (missing.length) throw new BadRequestException(`Reasons can’t be removed, only switched off: ${missing.map((m) => m.label).join(', ')}.`);
    const next = exitReasons(given);
    if (!next.some((r) => r.active)) throw new BadRequestException('Keep at least one reason switched on.');
    await this.prisma.$executeRaw`
      INSERT INTO rndtechnosoft_tenant_settings (id, tenant_id, settings, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, jsonb_build_object('offboardingExitReasons', ${JSON.stringify(next)}::jsonb), NOW(), NOW())
      ON CONFLICT (tenant_id) DO UPDATE
      SET settings = rndtechnosoft_tenant_settings.settings || jsonb_build_object('offboardingExitReasons', ${JSON.stringify(next)}::jsonb), updated_at = NOW()
    `;
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'OFFBOARDING_EXIT_REASONS_UPDATED', entityType: 'OFFBOARDING_EXIT_REASONS', entityId: tenantId, oldValues: { reasons: before } as never, newValues: { reasons: next } as never });
    return next;
  }
}
