import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { cosecToday, ExternalApiService } from './external-api.service';

/** How long one workspace's sync may hold its claim; a worker that dies frees it after this. */
const CLAIM_MINUTES = 5;
/** Opening an employee's attendance again within this long reuses the last refresh. */
const REFRESH_REUSE_MS = 30_000;
/** A sync not finished for this long (while switched on) means the worker isn't running. */
export const WORKER_SILENT_AFTER_MS = 5 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const safeError = (error: unknown) => (error instanceof Error ? error.message : 'The COSEC sync failed.').slice(0, 500);

/**
 * COSEC attendance kept current, two ways:
 *
 * - Every minute (the cosec-sync worker process): each active workspace with
 *   COSEC set up, unless switched off, gets yesterday and today synced (a night
 *   shift's day closes after midnight). Only days that changed are written. A
 *   workspace is claimed for the run, so several workers never sync it twice.
 * - On demand: opening an employee's attendance refreshes that employee's month
 *   from COSEC first.
 *
 * Both use ExternalApiService.syncDailyAttendance, the same sync as the
 * "Sync" buttons in settings.
 */
@Injectable()
export class CosecSyncService {
  private readonly logger = new Logger(CosecSyncService.name);
  /** When each employee's month was last refreshed on demand, per API process. */
  private readonly refreshedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalApi: ExternalApiService,
    private readonly audit: AuditService,
  ) {}

  /** Workspaces to sync now: active, COSEC set up, automatic sync not switched off. */
  async dueTenants(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string }[]>`
      SELECT s.tenant_id
      FROM rndtechnosoft_tenant_settings s
      JOIN rndtechnosoft_tenants t ON t.id = s.tenant_id AND t.tenant_status = 'ACTIVE'
      LEFT JOIN rndtechnosoft_cosec_sync_states st ON st.tenant_id = s.tenant_id
      WHERE s.settings -> 'cosecApi' ->> 'baseUrl' IS NOT NULL
        AND COALESCE(st.is_auto_sync_enabled, true)
      ORDER BY st.last_finished_at ASC NULLS FIRST`;
    return rows.map((r) => r.tenant_id);
  }

  /** Every due workspace, one after another. Returns how many were synced. */
  async runAll(): Promise<number> {
    let synced = 0;
    for (const tenantId of await this.dueTenants()) {
      if (await this.runTenant(tenantId)) synced += 1;
    }
    return synced;
  }

  /**
   * One workspace's scheduled sync: yesterday and today. False when another
   * worker holds it, or it was switched off meanwhile. A failure is recorded
   * (for the settings page) and does not stop other workspaces.
   */
  async runTenant(tenantId: string, now = new Date()): Promise<boolean> {
    if (!(await this.claim(tenantId))) return false;
    const today = cosecToday(now);
    try {
      const result = await this.externalApi.syncDailyAttendance(tenantId, addDays(today, -1), today);
      await this.finish(tenantId, { last_sync_status: 'SUCCEEDED', last_sync_error: null, last_changed_records: result.changedRecords, last_unmatched_users: result.unmatchedUsers.length });
      if (result.changedRecords) this.logger.log(`COSEC sync: tenant=${tenantId} changedDays=${result.changedRecords} punches=${result.syncedPunches}`);
    } catch (error) {
      this.logger.warn(`COSEC sync failed: tenant=${tenantId} error=${error instanceof Error ? error.name : 'unknown'}`);
      await this.finish(tenantId, { last_sync_status: 'FAILED', last_sync_error: safeError(error), last_changed_records: 0 });
    }
    return true;
  }

  /** Takes the workspace for one run, unless a live claim or the switch says otherwise. */
  private async claim(tenantId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO rndtechnosoft_cosec_sync_states (id, tenant_id, claimed_until, last_started_at)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, now() + make_interval(mins => ${CLAIM_MINUTES}::int), now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET claimed_until = EXCLUDED.claimed_until, last_started_at = now(), updated_at = now()
        WHERE rndtechnosoft_cosec_sync_states.is_auto_sync_enabled
          AND (rndtechnosoft_cosec_sync_states.claimed_until IS NULL OR rndtechnosoft_cosec_sync_states.claimed_until < now())
      RETURNING id`;
    return rows.length > 0;
  }

  private async finish(tenantId: string, outcome: Prisma.rndtechnosoft_cosec_sync_statesUpdateManyMutationInput) {
    await this.prisma.rndtechnosoft_cosec_sync_states.update({
      where: { tenant_id: tenantId },
      data: { ...outcome, claimed_until: null, last_finished_at: new Date(), updated_at: new Date() },
    });
  }

  /** What the settings page shows: whether sync is on, how the last run went, and whether the worker is running. */
  async status(tenantId: string, now = new Date()) {
    const [configured, state] = await Promise.all([
      this.externalApi.isCosecConfigured(tenantId),
      this.prisma.rndtechnosoft_cosec_sync_states.findUnique({ where: { tenant_id: tenantId } }),
    ]);
    const enabled = state?.is_auto_sync_enabled ?? true;
    const lastActivity = state?.last_finished_at ?? state?.last_started_at ?? null;
    return {
      configured,
      autoSyncEnabled: enabled,
      lastStartedAt: state?.last_started_at ?? null,
      lastFinishedAt: state?.last_finished_at ?? null,
      lastStatus: (state?.last_sync_status ?? null) as 'SUCCEEDED' | 'FAILED' | null,
      lastError: state?.last_sync_error ?? null,
      lastChangedRecords: state?.last_changed_records ?? 0,
      lastUnmatchedUsers: state?.last_unmatched_users ?? 0,
      // Switched on and set up, but nothing for a while: the worker process is not running.
      workerSilent: configured && enabled && (!lastActivity || now.getTime() - lastActivity.getTime() > WORKER_SILENT_AFTER_MS),
    };
  }

  async setAutoSync(tenantId: string, enabled: boolean, actor: { userId: string; tenantMemberId: string }) {
    const before = await this.prisma.rndtechnosoft_cosec_sync_states.findUnique({ where: { tenant_id: tenantId }, select: { is_auto_sync_enabled: true } });
    await this.prisma.rndtechnosoft_cosec_sync_states.upsert({
      where: { tenant_id: tenantId },
      update: { is_auto_sync_enabled: enabled, updated_at: new Date() },
      create: { id: randomUUID(), tenant_id: tenantId, is_auto_sync_enabled: enabled },
    });
    if ((before?.is_auto_sync_enabled ?? true) !== enabled) {
      await this.audit.log({
        tenantId,
        actorUserId: actor.userId,
        actorTenantMemberId: actor.tenantMemberId,
        actionCode: enabled ? 'COSEC_AUTO_SYNC_ENABLED' : 'COSEC_AUTO_SYNC_DISABLED',
        entityType: 'COSEC_SYNC',
        oldValues: { autoSyncEnabled: before?.is_auto_sync_enabled ?? true },
        newValues: { autoSyncEnabled: enabled },
      });
    }
    return this.status(tenantId);
  }

  /**
   * One employee's month from COSEC, for when their attendance is opened: the
   * month so far (up to today). Without COSEC set up there is nothing to do; a
   * second request within 30 seconds reuses the first.
   */
  async refreshEmployee(tenantId: string, employeeIdOrCode: string, month: string, now = new Date()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Choose a month as YYYY-MM.');
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { tenant_id: tenantId, OR: [...(UUID.test(employeeIdOrCode) ? [{ id: employeeIdOrCode }] : []), { employee_code: employeeIdOrCode }] },
      select: { id: true, employee_code: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (!(await this.externalApi.isCosecConfigured(tenantId))) return { status: 'NOT_CONFIGURED' as const };

    const key = `${tenantId}|${employee.id}|${month}`;
    const last = this.refreshedAt.get(key);
    if (last && now.getTime() - last < REFRESH_REUSE_MS) return { status: 'RECENT' as const, syncedAt: new Date(last).toISOString(), changedRecords: 0 };

    const today = cosecToday(now);
    const [y, m] = month.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const start = `${month}-01`;
    const end = monthEnd < today ? monthEnd : today;
    if (start > today) return { status: 'SYNCED' as const, syncedAt: now.toISOString(), changedRecords: 0, matched: true };

    let result;
    try {
      result = await this.externalApi.syncDailyAttendance(tenantId, start, end, { employeeCode: employee.employee_code });
    } catch (error) {
      this.logger.warn(`COSEC refresh failed: tenant=${tenantId} employee=${employee.id} error=${error instanceof Error ? error.name : 'unknown'}`);
      throw new ServiceUnavailableException(`The latest punches could not be fetched from COSEC: ${safeError(error)}`);
    }
    for (const [k, at] of this.refreshedAt) if (now.getTime() - at > REFRESH_REUSE_MS) this.refreshedAt.delete(k);
    this.refreshedAt.set(key, now.getTime());
    return {
      status: 'SYNCED' as const,
      syncedAt: now.toISOString(),
      changedRecords: result.changedRecords,
      skippedLocked: result.skippedLocked,
      // COSEC returns a row for every day of a user it knows; none means no COSEC user has this Employee Code.
      matched: result.syncedRecords > 0,
    };
  }
}
