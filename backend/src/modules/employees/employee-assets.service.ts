import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { PermissionKey } from '@/common/access/access-catalog';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { ASSET_TEAM, AssetCategory, AssetTeam, AssignAssetDto, RecordAssetReturnDto } from './dto/employee-assets.dto';

type Actor = AuthenticatedTenantUser;

export const ASSET_MANAGE: Record<AssetTeam, PermissionKey> = { IT: 'assets.it.manage', ADMIN: 'assets.admin.manage' };
const OPEN_EXIT = ['PENDING_APPROVAL', 'IN_PROGRESS'];

const memberName = { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;
const ROW = { include: { assigned_by: memberName, return_recorded_by: memberName } } as const;
type AssetRow = Prisma.rndtechnosoft_employee_assetsGetPayload<typeof ROW>;
const who = (m: { rndtechnosoft_users: { display_name: string | null; email: string } } | null) => (m ? m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email : null);

/** Today in India time, as the rest of HR counts days. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * Company property given to employees: handed over, then returned (in good
 * shape or damaged), reported lost, waived (they keep it), or cancelled when
 * recorded by mistake. IT gives out and takes back equipment, Admin cards,
 * keys and the rest, each with its own permission; nobody records their own.
 * A lost or damaged asset can carry an amount the employee pays, which the
 * final settlement recovers. Rows are never deleted.
 */
@Injectable()
export class EmployeeAssetsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService, private readonly audit: AuditService) {}

  async list(tenantId: string, employeeId: string, actor: Actor) {
    const employee = await this.employee(tenantId, employeeId);
    const [rows, teams] = await Promise.all([
      this.prisma.rndtechnosoft_employee_assets.findMany({ where: { tenant_id: tenantId, employee_id: employeeId }, orderBy: [{ assigned_date: 'desc' }, { created_at: 'desc' }], take: 200, ...ROW }),
      this.teams(tenantId, actor),
    ]);
    const own = employee.user_id === actor.userId;
    return {
      items: rows.map((r) => this.view(r, !own && teams.has(r.owner_team as AssetTeam))),
      canAssign: { IT: !own && teams.has('IT'), ADMIN: !own && teams.has('ADMIN') },
      employeeActive: employee.employee_status === 'ACTIVE' && !employee.archived_at,
    };
  }

  /** The assets of the person an exit is for. */
  async forSeparation(tenantId: string, separationId: string, actor: Actor) {
    const s = await this.prisma.rndtechnosoft_employee_separations.findFirst({ where: { tenant_id: tenantId, id: separationId }, select: { employee_id: true } });
    if (!s) throw new NotFoundException('Exit not found.');
    return { employeeId: s.employee_id, ...(await this.list(tenantId, s.employee_id, actor)) };
  }

  /** Assets still out with people whose exit is under way, for the teams this member looks after. */
  async outstandingForLeavers(tenantId: string, actor: Actor) {
    const teams = [...(await this.teams(tenantId, actor))];
    if (!teams.length) return [];
    const rows = await this.prisma.rndtechnosoft_employee_assets.findMany({
      where: {
        tenant_id: tenantId, return_status: 'ISSUED', owner_team: { in: teams },
        rndtechnosoft_employees: {
          OR: [{ user_id: null }, { user_id: { not: actor.userId } }],
          rndtechnosoft_employee_separations: { some: { separation_status: 'IN_PROGRESS' } },
        },
      },
      orderBy: { assigned_date: 'asc' },
      take: 200,
      include: {
        ...ROW.include,
        rndtechnosoft_employees: {
          select: {
            employee_code: true, first_name: true, last_name: true, preferred_name: true,
            rndtechnosoft_employee_separations: { where: { separation_status: 'IN_PROGRESS' }, take: 1, select: { id: true, last_working_date: true } },
          },
        },
      },
    });
    return rows
      .map((r) => {
        const e = r.rndtechnosoft_employees;
        const exit = e.rndtechnosoft_employee_separations[0];
        return {
          ...this.view(r, true), employeeId: r.employee_id, separationId: exit?.id ?? null, lastWorkingDate: exit ? isoDate(exit.last_working_date) : null,
          employee: { name: `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim(), code: e.employee_code },
        };
      })
      .sort((a, b) => (a.lastWorkingDate ?? '').localeCompare(b.lastWorkingDate ?? ''));
  }

  async assign(tenantId: string, employeeId: string, input: AssignAssetDto, actor: Actor) {
    const employee = await this.employee(tenantId, employeeId);
    const team = ASSET_TEAM[input.category];
    await this.assertManages(tenantId, actor, team, employee.user_id);
    if (employee.employee_status !== 'ACTIVE' || employee.archived_at) throw new BadRequestException('Assets can only be given to an active employee.');
    if (input.assignedDate > today()) throw new BadRequestException('The hand-over date can’t be in the future.');
    if (input.returnDueDate && input.returnDueDate < input.assignedDate) throw new BadRequestException('The return date can’t be before the hand-over.');
    const id = randomUUID();
    try {
      await this.prisma.rndtechnosoft_employee_assets.create({
        data: {
          id, tenant_id: tenantId, employee_id: employeeId, asset_category: input.category, owner_team: team, asset_name: input.name, asset_tag: input.tag || null,
          assigned_date: dateOnly(input.assignedDate), return_due_date: input.returnDueDate ? dateOnly(input.returnDueDate) : null, remarks: input.remarks || null,
          assigned_by_tenant_member_id: actor.tenantMemberId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Asset ${input.tag} is already with someone. Record its return first.`);
      }
      throw error;
    }
    await this.log(tenantId, actor, 'ASSET_ASSIGNED', id, { employee_id: employeeId, new: { category: input.category, name: input.name, tag: input.tag || null, assigned_date: input.assignedDate } });
    return this.list(tenantId, employeeId, actor);
  }

  /** Records what happened to an asset still with the employee. */
  async recordReturn(tenantId: string, assetId: string, input: RecordAssetReturnDto, actor: Actor, employeeId?: string) {
    const asset = await this.find(tenantId, assetId, employeeId);
    const employee = await this.employee(tenantId, asset.employee_id);
    await this.assertManages(tenantId, actor, asset.owner_team as AssetTeam, employee.user_id);
    if (asset.return_status !== 'ISSUED') throw new ConflictException('This asset’s return is already recorded. Reopen it to change it.');
    const remarks = input.remarks?.trim() || null;
    if (input.returnDate > today()) throw new BadRequestException('The date can’t be in the future.');
    if (input.returnDate < isoDate(asset.assigned_date)) throw new BadRequestException('The date can’t be before the asset was handed over.');
    if (input.status === 'RETURNED' && !input.condition) throw new BadRequestException('Say what condition it came back in.');
    if (input.status !== 'RETURNED' && input.condition) throw new BadRequestException('A condition is recorded only for a returned asset.');
    if (input.status === 'WAIVED' && !remarks) throw new BadRequestException('Say why the employee keeps it.');
    const recovery = input.recoveryAmount ? new Prisma.Decimal(input.recoveryAmount) : null;
    const recoverable = input.status === 'LOST' || (input.status === 'RETURNED' && input.condition === 'DAMAGED');
    if (recovery && recovery.gt(0) && !recoverable) throw new BadRequestException('A recovery is charged only for a lost or damaged asset.');

    const exit = await this.prisma.rndtechnosoft_employee_separations.findFirst({
      where: { tenant_id: tenantId, employee_id: asset.employee_id, separation_status: { in: OPEN_EXIT } }, select: { id: true },
    });
    const changed = await this.prisma.rndtechnosoft_employee_assets.updateMany({
      where: { tenant_id: tenantId, id: assetId, return_status: 'ISSUED' },
      data: {
        return_status: input.status, return_date: dateOnly(input.returnDate), return_condition: input.condition ?? null,
        recovery_amount: recovery && recovery.gt(0) ? recovery : null, remarks: remarks ?? asset.remarks, separation_id: exit?.id ?? null,
        return_recorded_by_tenant_member_id: actor.tenantMemberId, return_recorded_at: new Date(), updated_at: new Date(),
      },
    });
    if (changed.count !== 1) throw new ConflictException('This asset changed while you were working. Reload and try again.');
    await this.log(tenantId, actor, 'ASSET_RETURN_RECORDED', assetId, {
      employee_id: asset.employee_id, separation_id: exit?.id ?? null,
      old: { status: 'ISSUED' }, new: { status: input.status, return_date: input.returnDate, condition: input.condition ?? null, recovery_amount: recovery?.toFixed(2) ?? null }, remarks,
    });
    return this.list(tenantId, asset.employee_id, actor);
  }

  /** Undoes a recorded return, while its recovery hasn't been paid in a settlement. */
  async reopen(tenantId: string, assetId: string, reason: string, actor: Actor, employeeId?: string) {
    const asset = await this.find(tenantId, assetId, employeeId);
    const employee = await this.employee(tenantId, asset.employee_id);
    await this.assertManages(tenantId, actor, asset.owner_team as AssetTeam, employee.user_id);
    if (!['RETURNED', 'LOST', 'WAIVED'].includes(asset.return_status)) throw new ConflictException('Only a recorded return can be reopened.');
    if (asset.separation_id) {
      const paid = await this.prisma.rndtechnosoft_final_settlements.count({ where: { tenant_id: tenantId, separation_id: asset.separation_id, settlement_status: 'PAID' } });
      if (paid) throw new ConflictException('The final settlement for this exit has been paid, so this return can no longer change.');
    }
    const changed = await this.prisma.rndtechnosoft_employee_assets.updateMany({
      where: { tenant_id: tenantId, id: assetId, return_status: asset.return_status },
      data: {
        return_status: 'ISSUED', return_date: null, return_condition: null, recovery_amount: null, separation_id: null,
        return_recorded_by_tenant_member_id: null, return_recorded_at: null, updated_at: new Date(),
      },
    });
    if (changed.count !== 1) throw new ConflictException('This asset changed while you were working. Reload and try again.');
    await this.log(tenantId, actor, 'ASSET_RETURN_REOPENED', assetId, {
      employee_id: asset.employee_id, reason,
      old: { status: asset.return_status, return_date: asset.return_date ? isoDate(asset.return_date) : null, recovery_amount: asset.recovery_amount?.toFixed(2) ?? null }, new: { status: 'ISSUED' },
    });
    return this.list(tenantId, asset.employee_id, actor);
  }

  /** An asset recorded by mistake: kept, marked cancelled, with the reason. */
  async cancel(tenantId: string, assetId: string, reason: string, actor: Actor, employeeId?: string) {
    const asset = await this.find(tenantId, assetId, employeeId);
    const employee = await this.employee(tenantId, asset.employee_id);
    await this.assertManages(tenantId, actor, asset.owner_team as AssetTeam, employee.user_id);
    const changed = await this.prisma.rndtechnosoft_employee_assets.updateMany({
      where: { tenant_id: tenantId, id: assetId, return_status: 'ISSUED' },
      data: { return_status: 'CANCELLED', remarks: reason, return_recorded_by_tenant_member_id: actor.tenantMemberId, return_recorded_at: new Date(), updated_at: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('Only an asset still with the employee can be cancelled.');
    await this.log(tenantId, actor, 'ASSET_CANCELLED', assetId, { employee_id: asset.employee_id, old: { status: 'ISSUED' }, new: { status: 'CANCELLED' }, reason });
    return this.list(tenantId, asset.employee_id, actor);
  }

  private view(r: AssetRow, canManage: boolean) {
    return {
      id: r.id, category: r.asset_category as AssetCategory, team: r.owner_team as AssetTeam, name: r.asset_name, tag: r.asset_tag,
      assignedDate: isoDate(r.assigned_date), returnDueDate: r.return_due_date ? isoDate(r.return_due_date) : null,
      status: r.return_status, returnDate: r.return_date ? isoDate(r.return_date) : null, condition: r.return_condition,
      // Decimal as text, never a float.
      recoveryAmount: r.recovery_amount?.toFixed(2) ?? null, remarks: r.remarks,
      assignedBy: who(r.assigned_by), returnRecordedBy: who(r.return_recorded_by), returnRecordedAt: r.return_recorded_at?.toISOString() ?? null,
      canManage,
    };
  }

  private async teams(tenantId: string, actor: Actor) {
    const held = new Set<string>(await this.access.getMemberPermissions(tenantId, actor.tenantMemberId));
    return new Set((Object.keys(ASSET_MANAGE) as AssetTeam[]).filter((t) => held.has(ASSET_MANAGE[t])));
  }

  private async assertManages(tenantId: string, actor: Actor, team: AssetTeam, employeeUserId: string | null) {
    if (employeeUserId === actor.userId) throw new ForbiddenException('You can’t record your own assets. Ask someone else in your team.');
    if (!(await this.teams(tenantId, actor)).has(team)) throw new ForbiddenException(team === 'IT' ? 'Only IT gives out and takes back this asset.' : 'Only Admin gives out and takes back this asset.');
  }

  private async employee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: employeeId }, select: { id: true, user_id: true, employee_status: true, archived_at: true } });
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  private async find(tenantId: string, assetId: string, employeeId?: string) {
    const asset = await this.prisma.rndtechnosoft_employee_assets.findFirst({ where: { tenant_id: tenantId, id: assetId, ...(employeeId ? { employee_id: employeeId } : {}) } });
    if (!asset) throw new NotFoundException('Asset not found.');
    return asset;
  }

  private log(tenantId: string, actor: Actor, actionCode: string, assetId: string, values: Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values as { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMPLOYEE_ASSET', entityId: assetId, oldValues, newValues, metadata });
  }
}
