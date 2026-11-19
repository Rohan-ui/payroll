import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { TeamChecklistUpdateDto, TeamCommentDto } from './dto/offboarding.dto';

type Actor = AuthenticatedTenantUser;

/** How long a finished exit stays on the manager's list. */
const RECENT_DAYS = 30;

const ROW = {
  id: true, separation_type: true, separation_status: true, notice_date: true, last_working_date: true, completed_at: true,
  rndtechnosoft_employees: {
    select: {
      employee_code: true, first_name: true, last_name: true, preferred_name: true,
      rndtechnosoft_employee_employments: {
        where: { effective_to: null }, orderBy: { effective_from: 'desc' as const }, take: 1,
        select: { rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } },
      },
    },
  },
  rndtechnosoft_separation_clearance_items: { orderBy: { display_order: 'asc' as const }, select: { id: true, clearance_team: true, item_title: true, item_description: true, is_required: true, due_date: true, item_status: true, clearance_note: true, cleared_at: true } },
} as const;

/**
 * Managers and their direct reports' exits. A member sees an exit only when
 * the employee linked to their sign-in is the person's primary manager on the
 * last working day (or today, if that comes first), from the reporting lines;
 * any other exit is "not found", so its existence is never revealed. Managers
 * see the dates, the checklist's progress and the comments; never the
 * reason, the exit interview, the settlement or Finance's notes. They comment,
 * add handover notes and clear manager-owned checklist items, and nothing more.
 */
@Injectable()
export class TeamExitsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string, actor: Actor) {
    const me = await this.me(tenantId, actor);
    if (!me) return [];
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000);
    const rows = await this.prisma.rndtechnosoft_employee_separations.findMany({
      where: {
        tenant_id: tenantId,
        OR: [{ separation_status: { in: ['PENDING_APPROVAL', 'IN_PROGRESS'] } }, { separation_status: 'COMPLETED', completed_at: { gte: since } }],
        rndtechnosoft_employees: { rndtechnosoft_employee_reporting_lines_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees: { some: this.lineOf(tenantId, me) } },
      },
      orderBy: { last_working_date: 'asc' },
      take: 100,
      select: { ...ROW, employee_id: true },
    });
    const mine = [];
    for (const r of rows) if (await this.manages(tenantId, me, r.employee_id, r.last_working_date)) mine.push(r);
    return mine.map((r) => ({ ...this.view(r), pendingManagerItems: r.rndtechnosoft_separation_clearance_items.filter((i) => i.clearance_team === 'MANAGER' && i.item_status === 'PENDING').length }));
  }

  async detail(tenantId: string, id: string, actor: Actor) {
    const row = await this.find(tenantId, id, actor);
    const comments = await this.prisma.rndtechnosoft_separation_comments.findMany({
      where: { tenant_id: tenantId, separation_id: id }, orderBy: { created_at: 'asc' }, take: 200,
      select: { id: true, comment_kind: true, comment_body: true, created_at: true, author_tenant_member_id: true, author: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } },
    });
    return {
      ...this.view(row),
      noticeDate: isoDate(row.notice_date),
      checklist: row.rndtechnosoft_separation_clearance_items.map((i) => ({
        id: i.id, team: i.clearance_team, title: i.item_title, description: i.item_description, isRequired: i.is_required, dueDate: isoDate(i.due_date ?? row.last_working_date),
        status: i.item_status, clearedAt: i.cleared_at?.toISOString() ?? null,
        // Other teams' notes can be confidential (Finance's, say); a manager sees only their own.
        note: i.clearance_team === 'MANAGER' ? i.clearance_note : null,
        canUpdate: i.clearance_team === 'MANAGER' && row.separation_status === 'IN_PROGRESS',
      })),
      comments: comments.map((c) => ({
        id: c.id, kind: c.comment_kind, body: c.comment_body, createdAt: c.created_at.toISOString(),
        author: c.author.rndtechnosoft_users.display_name || c.author.rndtechnosoft_users.email, isMine: c.author_tenant_member_id === actor.tenantMemberId,
      })),
      canComment: ['PENDING_APPROVAL', 'IN_PROGRESS'].includes(row.separation_status),
    };
  }

  async addComment(tenantId: string, id: string, input: TeamCommentDto, actor: Actor) {
    const row = await this.find(tenantId, id, actor);
    if (!['PENDING_APPROVAL', 'IN_PROGRESS'].includes(row.separation_status)) throw new BadRequestException('Comments can be added only while the exit is open.');
    const commentId = randomUUID();
    await this.prisma.rndtechnosoft_separation_comments.create({
      data: { id: commentId, tenant_id: tenantId, separation_id: id, comment_kind: input.kind, comment_body: input.body, author_tenant_member_id: actor.tenantMemberId },
    });
    await this.log(tenantId, actor, 'SEPARATION_MANAGER_COMMENTED', id, { comment_id: commentId, kind: input.kind });
    return this.detail(tenantId, id, actor);
  }

  async updateItem(tenantId: string, id: string, itemId: string, input: TeamChecklistUpdateDto, actor: Actor) {
    const row = await this.find(tenantId, id, actor);
    if (row.separation_status !== 'IN_PROGRESS') throw new BadRequestException('The checklist can only change while the exit is under way.');
    const item = row.rndtechnosoft_separation_clearance_items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Checklist item not found.');
    if (item.clearance_team !== 'MANAGER') throw new ForbiddenException('Managers clear only the manager’s checklist items. The other teams clear theirs.');
    const done = input.status === 'CLEARED';
    const changed = await this.prisma.rndtechnosoft_separation_clearance_items.updateMany({
      where: { tenant_id: tenantId, id: itemId, separation_id: id, clearance_team: 'MANAGER', item_status: item.item_status },
      data: { item_status: input.status, clearance_note: input.note?.trim() || null, cleared_at: done ? new Date() : null, cleared_by_tenant_member_id: done ? actor.tenantMemberId : null, updated_at: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('This item changed while you were working. Reload and try again.');
    await this.log(tenantId, actor, 'SEPARATION_ITEM_UPDATED', id, { item_id: itemId, by: 'MANAGER', old: { status: item.item_status }, new: { status: input.status } });
    return this.detail(tenantId, id, actor);
  }

  private view(r: { id: string; separation_type: string; separation_status: string; last_working_date: Date; rndtechnosoft_employees: { employee_code: string; first_name: string; last_name: string | null; preferred_name: string | null; rndtechnosoft_employee_employments: { rndtechnosoft_departments: { department_name: string } | null; rndtechnosoft_designations: { designation_name: string } | null }[] }; rndtechnosoft_separation_clearance_items: { item_status: string }[] }) {
    const e = r.rndtechnosoft_employees;
    const job = e.rndtechnosoft_employee_employments[0];
    return {
      id: r.id, type: r.separation_type, status: r.separation_status, lastWorkingDate: isoDate(r.last_working_date),
      employee: { name: `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim(), code: e.employee_code, department: job?.rndtechnosoft_departments?.department_name ?? null, designation: job?.rndtechnosoft_designations?.designation_name ?? null },
      checklistProgress: { done: r.rndtechnosoft_separation_clearance_items.filter((i) => i.item_status !== 'PENDING').length, total: r.rndtechnosoft_separation_clearance_items.length },
    };
  }

  private async find(tenantId: string, id: string, actor: Actor) {
    const me = await this.me(tenantId, actor);
    const row = await this.prisma.rndtechnosoft_employee_separations.findFirst({ where: { tenant_id: tenantId, id }, select: { ...ROW, employee_id: true } });
    // Not their report, or not there at all: the same answer either way.
    if (!row || !me || !(await this.manages(tenantId, me, row.employee_id, row.last_working_date))) throw new NotFoundException('Exit not found.');
    return row;
  }

  private async me(tenantId: string, actor: Actor) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, user_id: actor.userId }, select: { id: true } });
    return employee?.id ?? null;
  }

  private lineOf(tenantId: string, managerId: string) {
    return { tenant_id: tenantId, manager_employee_id: managerId, relationship_type: 'PRIMARY', line_status: 'ACTIVE' };
  }

  /** Whether they are the primary manager on the last working day, or today if that is earlier. */
  private async manages(tenantId: string, managerId: string, employeeId: string, lastDay: Date) {
    const on = new Date(Math.min(lastDay.getTime(), dateOnly(isoDate(new Date())).getTime()));
    const line = await this.prisma.rndtechnosoft_employee_reporting_lines.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, relationship_type: 'PRIMARY', line_status: 'ACTIVE', effective_from: { lte: on }, OR: [{ effective_to: null }, { effective_to: { gte: on } }] },
      orderBy: { effective_from: 'desc' },
      select: { manager_employee_id: true },
    });
    return line?.manager_employee_id === managerId;
  }

  private log(tenantId: string, actor: Actor, actionCode: string, separationId: string, values: Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values as { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMPLOYEE_SEPARATION', entityId: separationId, oldValues, newValues, metadata });
  }
}
