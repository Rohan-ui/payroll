import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { PermissionKey } from '@/common/access/access-catalog';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { isoDate } from '@/modules/payroll/payroll-lock';
import { CLEARANCE_TEAMS, ChecklistTemplateDto, ClearanceTeam } from './dto/offboarding.dto';

type Actor = AuthenticatedTenantUser;

/** HR's override: any team's items. */
export const CLEARANCE_OVERRIDE: PermissionKey = 'offboarding.clearance.update';

/** The permission that lets a team clear its own items. Managers clear theirs through My team, by who reports to them. */
export const TEAM_PERMISSION: Record<Exclude<ClearanceTeam, 'MANAGER'>, PermissionKey> = {
  IT: 'offboarding.clearance.it',
  ADMIN: 'offboarding.clearance.admin',
  FINANCE: 'offboarding.clearance.finance',
  HR: 'offboarding.clearance.hr',
};

export type ChecklistTemplateItem = { team: ClearanceTeam; title: string; description: string | null; isRequired: boolean };

/** Whether these permissions clear (and waive) a team's items: the team's own permission, or HR's override. */
export function canClearTeam(permissions: ReadonlySet<string>, team: ClearanceTeam) {
  if (permissions.has(CLEARANCE_OVERRIDE)) return true;
  return team !== 'MANAGER' && permissions.has(TEAM_PERMISSION[team]);
}

export function checklistTemplate(saved: unknown): ChecklistTemplateItem[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((raw): ChecklistTemplateItem[] => {
    const i = raw as Record<string, unknown>;
    if (!CLEARANCE_TEAMS.includes(i?.team as ClearanceTeam) || typeof i.title !== 'string' || !i.title.trim()) return [];
    return [{ team: i.team as ClearanceTeam, title: i.title.trim().slice(0, 200), description: typeof i.description === 'string' && i.description.trim() ? i.description.trim().slice(0, 1000) : null, isRequired: i.isRequired !== false }];
  });
}

/**
 * Who owns which exit-checklist items. Each team clears and waives its own
 * items with its own permission (IT, Admin, Finance, HR); managers clear
 * theirs from My team; HR's override covers every team. An item can be given
 * to one person who can clear that team's items. Team members work from their
 * own list of open items, without needing to see HR's side of the exit.
 */
@Injectable()
export class ExitChecklistService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService, private readonly audit: AuditService) {}

  async permissions(tenantId: string, actor: Actor) {
    return new Set<string>(await this.access.getMemberPermissions(tenantId, actor.tenantMemberId));
  }

  /** The extra items every new exit gets, after the standard six. */
  async template(tenantId: string): Promise<ChecklistTemplateItem[]> {
    const rows = await this.prisma.$queryRaw<{ value: unknown }[]>`
      SELECT settings->'offboardingChecklist' AS value FROM rndtechnosoft_tenant_settings WHERE tenant_id = ${tenantId}::uuid
    `;
    return checklistTemplate(rows[0]?.value ?? null);
  }

  async setTemplate(tenantId: string, input: ChecklistTemplateDto, actor: Actor) {
    const before = await this.template(tenantId);
    const next = checklistTemplate(input.items);
    // Merged into the settings JSON, so other settings stay as they are.
    await this.prisma.$executeRaw`
      INSERT INTO rndtechnosoft_tenant_settings (id, tenant_id, settings, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, jsonb_build_object('offboardingChecklist', ${JSON.stringify(next)}::jsonb), NOW(), NOW())
      ON CONFLICT (tenant_id) DO UPDATE
      SET settings = rndtechnosoft_tenant_settings.settings || jsonb_build_object('offboardingChecklist', ${JSON.stringify(next)}::jsonb), updated_at = NOW()
    `;
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'OFFBOARDING_CHECKLIST_TEMPLATE_UPDATED', entityType: 'OFFBOARDING_CHECKLIST', entityId: tenantId, oldValues: { items: before } as never, newValues: { items: next } as never });
    return next;
  }

  /** Active members who can clear a team's items, to give an item to. */
  async owners(tenantId: string, team: ClearanceTeam) {
    const keys = team === 'MANAGER' ? [CLEARANCE_OVERRIDE] : [TEAM_PERMISSION[team], CLEARANCE_OVERRIDE];
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: {
        tenant_id: tenantId, membership_status: 'ACTIVE',
        rndtechnosoft_tenant_member_roles: { some: { rndtechnosoft_roles: { role_status: 'ACTIVE', rndtechnosoft_role_permissions: { some: { rndtechnosoft_permissions: { permission_code: { in: keys } } } } } } },
      },
      select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
      take: 100,
    });
    return members
      .map((m) => ({ id: m.id, name: m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email, email: m.rndtechnosoft_users.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Refuses someone who can't clear the team's items. */
  async assertOwner(tenantId: string, team: ClearanceTeam, memberId: string) {
    if (!(await this.owners(tenantId, team)).some((m) => m.id === memberId)) {
      throw new BadRequestException('Give the item to someone who can clear this team’s items.');
    }
  }

  /** Open items of exits under way that this member can clear, soonest due first. Never their own exit. */
  async mine(tenantId: string, actor: Actor) {
    const permissions = await this.permissions(tenantId, actor);
    const teams = CLEARANCE_TEAMS.filter((t) => canClearTeam(permissions, t));
    if (!teams.length) return [];
    const rows = await this.prisma.rndtechnosoft_separation_clearance_items.findMany({
      where: {
        tenant_id: tenantId, item_status: 'PENDING', clearance_team: { in: teams },
        rndtechnosoft_employee_separations: { separation_status: 'IN_PROGRESS', rndtechnosoft_employees: { OR: [{ user_id: null }, { user_id: { not: actor.userId } }] } },
      },
      orderBy: [{ rndtechnosoft_employee_separations: { last_working_date: 'asc' } }, { display_order: 'asc' }],
      take: 200,
      select: {
        id: true, separation_id: true, clearance_team: true, item_title: true, item_description: true, is_required: true, due_date: true, assigned_tenant_member_id: true,
        assigned_to: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } },
        rndtechnosoft_employee_separations: { select: { last_working_date: true, rndtechnosoft_employees: { select: { employee_code: true, first_name: true, last_name: true, preferred_name: true } } } },
      },
    });
    return rows
      .map((r) => {
        const s = r.rndtechnosoft_employee_separations;
        const e = s.rndtechnosoft_employees;
        return {
          id: r.id, separationId: r.separation_id, team: r.clearance_team as ClearanceTeam, title: r.item_title, description: r.item_description, isRequired: r.is_required,
          dueDate: isoDate(r.due_date ?? s.last_working_date), lastWorkingDate: isoDate(s.last_working_date),
          assignedTo: r.assigned_to ? r.assigned_to.rndtechnosoft_users.display_name || r.assigned_to.rndtechnosoft_users.email : null,
          isMine: r.assigned_tenant_member_id === actor.tenantMemberId,
          employee: { name: `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim(), code: e.employee_code },
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }
}
