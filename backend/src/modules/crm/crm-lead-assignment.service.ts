import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { LeadManagementQueryDto } from './dto/lead-management.dto';

type Tx = Prisma.TransactionClient;

/** Who may be given leads: an active member, signed in with an active account, whose role lets them see leads. */
const ELIGIBLE_PERMISSION = 'leads.view';

const nameOf = (user: { display_name: string | null; email: string }) => user.display_name || user.email;

/**
 * Who owns which leads. Ownership is the lead's own assigned member
 * (`assigned_tenant_member_id`), the one source of truth: the board, the
 * lead's details, the Lead Management table and the assignee counts all read
 * it. Everything is scoped to the session's workspace, and a lead can only be
 * given to an eligible member of that same workspace.
 */
@Injectable()
export class CrmLeadAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reading ──────────────────────────────────────────────────

  /** The Lead Management table: one page of the workspace's leads, filtered and sorted by the server. */
  async list(tenantId: string, query: LeadManagementQueryDto) {
    const where: Prisma.rndtechnosoft_crm_leadsWhereInput = { tenant_id: tenantId };
    if (query.assigneeId === 'unassigned') where.assigned_tenant_member_id = null;
    else if (query.assigneeId) where.assigned_tenant_member_id = query.assigneeId;
    if (query.pipelineId) where.pipeline_id = query.pipelineId;
    if (query.stageId) where.stage_id = query.stageId;
    if (query.sourceId) where.source_id = query.sourceId;
    if (query.status === 'WON') where.is_won = true;
    if (query.status === 'LOST') where.is_lost = true;
    if (query.status === 'OPEN') Object.assign(where, { is_won: false, is_lost: false });
    const search = query.search?.trim();
    if (search) {
      const words = search.split(/\s+/).slice(0, 4);
      where.AND = words.map((word) => ({
        OR: [
          { company_name: { contains: word, mode: 'insensitive' } },
          { first_name: { contains: word, mode: 'insensitive' } },
          { last_name: { contains: word, mode: 'insensitive' } },
          { email: { contains: word, mode: 'insensitive' } },
          { phone: { contains: word } },
          { lead_code: { contains: word, mode: 'insensitive' } },
        ],
      }));
    }

    const dir = query.direction;
    const orderBy: Prisma.rndtechnosoft_crm_leadsOrderByWithRelationInput[] =
      query.sort === 'company_name'
        ? [{ company_name: dir }]
        : query.sort === 'lead_name'
          ? [{ first_name: dir }, { last_name: dir }]
          : query.sort === 'stage'
            ? [{ rndtechnosoft_crm_stages: { sort_order: dir } }]
            : query.sort === 'updated_at'
              ? [{ updated_at: dir }]
              : [{ created_at: dir }];

    const [rows, total, stages, pipelines, sources] = await Promise.all([
      this.prisma.rndtechnosoft_crm_leads.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          lead_code: true,
          first_name: true,
          last_name: true,
          company_name: true,
          email: true,
          phone: true,
          is_won: true,
          is_lost: true,
          created_at: true,
          updated_at: true,
          assigned_tenant_member_id: true,
          rndtechnosoft_crm_stages: { select: { id: true, name: true, color: true } },
          rndtechnosoft_crm_pipelines: { select: { id: true, name: true } },
          rndtechnosoft_crm_lead_sources: { select: { id: true, name: true } },
          rndtechnosoft_tenant_members: { select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } },
        },
      }),
      this.prisma.rndtechnosoft_crm_leads.count({ where }),
      this.prisma.rndtechnosoft_crm_stages.findMany({ where: { tenant_id: tenantId }, orderBy: [{ sort_order: 'asc' }], select: { id: true, name: true, pipeline_id: true } }),
      this.prisma.rndtechnosoft_crm_pipelines.findMany({ where: { tenant_id: tenantId }, orderBy: [{ sort_order: 'asc' }], select: { id: true, name: true } }),
      this.prisma.rndtechnosoft_crm_lead_sources.findMany({ where: { tenant_id: tenantId }, orderBy: [{ name: 'asc' }], select: { id: true, name: true } }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        leadCode: row.lead_code,
        name: [row.first_name, row.last_name].filter(Boolean).join(' '),
        companyName: row.company_name,
        email: row.email,
        phone: row.phone,
        source: row.rndtechnosoft_crm_lead_sources ? { id: row.rndtechnosoft_crm_lead_sources.id, name: row.rndtechnosoft_crm_lead_sources.name } : null,
        pipeline: row.rndtechnosoft_crm_pipelines ? { id: row.rndtechnosoft_crm_pipelines.id, name: row.rndtechnosoft_crm_pipelines.name } : null,
        stage: row.rndtechnosoft_crm_stages ? { id: row.rndtechnosoft_crm_stages.id, name: row.rndtechnosoft_crm_stages.name, color: row.rndtechnosoft_crm_stages.color } : null,
        status: row.is_won ? 'WON' : row.is_lost ? 'LOST' : 'OPEN',
        assignee: row.rndtechnosoft_tenant_members
          ? { id: row.rndtechnosoft_tenant_members.id, name: nameOf(row.rndtechnosoft_tenant_members.rndtechnosoft_users) }
          : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
      filters: { stages, pipelines, sources },
    };
  }

  /**
   * The workspace's active members with the number of leads each owns now,
   * and whether they can be given leads. One grouped count for all members.
   */
  async assignees(tenantId: string) {
    const [members, counts, eligible] = await Promise.all([
      this.prisma.rndtechnosoft_tenant_members.findMany({
        where: { tenant_id: tenantId, membership_status: 'ACTIVE', archived_at: null },
        select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true, user_status: true } } },
      }),
      this.leadCounts(tenantId),
      this.eligibleMemberIds(tenantId),
    ]);
    return members
      .map((m) => ({
        id: m.id,
        name: nameOf(m.rndtechnosoft_users),
        email: m.rndtechnosoft_users.email,
        eligible: m.rndtechnosoft_users.user_status === 'ACTIVE' && eligible.has(m.id),
        leadsCount: counts.get(m.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Leads owned by each member of the workspace, from one grouped query. */
  async leadCounts(tenantId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.rndtechnosoft_crm_leads.groupBy({
      by: ['assigned_tenant_member_id'],
      where: { tenant_id: tenantId, assigned_tenant_member_id: { not: null } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.assigned_tenant_member_id as string, row._count._all]));
  }

  // ── Assigning ────────────────────────────────────────────────

  /**
   * Gives every selected lead to one member, or unassigns them. All or
   * nothing: if any lead is not in this workspace, or the member can't be
   * given leads, nothing changes and the reason names what failed. Leads
   * already with that member are left as they are, so nothing is recorded
   * twice. Each change goes on the lead's activity and the CRM audit trail.
   */
  async assign(tenantId: string, leadIds: string[], assigneeMemberId: string | null, actorMemberId: string) {
    const ids = [...new Set(leadIds)];
    return this.prisma.$transaction(async (tx) => {
      const assignee = assigneeMemberId ? await this.eligibleAssignee(tx, tenantId, assigneeMemberId) : null;
      // Locked, so two assignments of the same leads apply one after the other.
      const found = await tx.$queryRaw<{ id: string; lead_code: string; assigned_tenant_member_id: string | null }[]>`
        SELECT id, lead_code, assigned_tenant_member_id FROM rndtechnosoft_crm_leads
        WHERE tenant_id = ${tenantId}::uuid AND id = ANY(${ids}::uuid[])
        ORDER BY id
        FOR UPDATE`;
      if (found.length !== ids.length) {
        const missing = ids.filter((id) => !found.some((row) => row.id === id));
        throw new BadRequestException({
          message: `${missing.length} of the selected leads ${missing.length === 1 ? 'is' : 'are'} not in this workspace or no longer exist${missing.length === 1 ? 's' : ''}. Nothing was changed; refresh the list and try again.`,
          code: 'LEADS_NOT_FOUND',
          errors: { failedLeadIds: missing },
        });
      }

      const changing = found.filter((row) => row.assigned_tenant_member_id !== (assignee?.id ?? null));
      const replaced = changing.filter((row) => row.assigned_tenant_member_id !== null).length;
      if (changing.length > 0) {
        await tx.rndtechnosoft_crm_leads.updateMany({
          where: { tenant_id: tenantId, id: { in: changing.map((row) => row.id) } },
          data: { assigned_tenant_member_id: assignee?.id ?? null, updated_at: new Date() },
        });
        const previous = await this.memberNames(tx, tenantId, changing.map((row) => row.assigned_tenant_member_id));
        await tx.rndtechnosoft_crm_lead_activities.createMany({
          data: changing.map((row) => ({
            id: randomUUID(),
            tenant_id: tenantId,
            lead_id: row.id,
            performed_by_tenant_member_id: actorMemberId,
            activity_type: 'ASSIGNMENT',
            title: assignee ? `Assigned to ${assignee.name}` : 'Unassigned',
            description: row.assigned_tenant_member_id ? `Previously assigned to ${previous.get(row.assigned_tenant_member_id) ?? 'a former member'}` : 'Previously unassigned',
          })),
        });
        await tx.rndtechnosoft_crm_audit_logs.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            action_type: assignee ? 'BULK_ASSIGN' : 'BULK_UNASSIGN',
            entity_type: 'LEAD',
            entity_id: changing[0].id,
            actor_id: actorMemberId,
            changes_diff: { leadIds: changing.map((row) => row.id), assigneeMemberId: assignee?.id ?? null, replaced } as Prisma.InputJsonObject,
          },
        });
      }
      return {
        updated: changing.length,
        unchanged: found.length - changing.length,
        replaced,
        assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      };
    });
  }

  /** Refuses a member who can't be given leads; used for single-lead changes too. */
  async eligibleAssignee(db: Tx | PrismaService, tenantId: string, memberId: string) {
    const member = await db.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, id: memberId },
      select: { id: true, membership_status: true, archived_at: true, rndtechnosoft_users: { select: { display_name: true, email: true, user_status: true } } },
    });
    if (!member) throw new BadRequestException('That team member is not in this workspace.');
    const name = nameOf(member.rndtechnosoft_users);
    if (member.membership_status !== 'ACTIVE' || member.archived_at || member.rndtechnosoft_users.user_status !== 'ACTIVE') {
      throw new BadRequestException(`${name} is not an active member of this workspace, so leads can't be assigned to them.`);
    }
    if (!(await this.eligibleMemberIds(tenantId, db, memberId)).has(memberId)) {
      throw new BadRequestException(`${name}'s role can't view leads, so leads can't be assigned to them. Give their role the "View leads" permission first.`);
    }
    return { id: member.id, name };
  }

  // ── Internals ────────────────────────────────────────────────

  /** Members whose active roles let them view leads, in one query. */
  private async eligibleMemberIds(tenantId: string, db: Tx | PrismaService = this.prisma, memberId?: string) {
    const rows = await db.rndtechnosoft_tenant_member_roles.findMany({
      where: {
        tenant_id: tenantId,
        ...(memberId ? { tenant_member_id: memberId } : {}),
        rndtechnosoft_roles: {
          role_status: 'ACTIVE',
          rndtechnosoft_role_permissions: { some: { tenant_id: tenantId, rndtechnosoft_permissions: { permission_code: ELIGIBLE_PERMISSION } } },
        },
      },
      select: { tenant_member_id: true },
    });
    return new Set(rows.map((row) => row.tenant_member_id));
  }

  private async memberNames(tx: Tx, tenantId: string, ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (wanted.length === 0) return new Map<string, string>();
    const rows = await tx.rndtechnosoft_tenant_members.findMany({
      where: { tenant_id: tenantId, id: { in: wanted } },
      select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    return new Map(rows.map((row) => [row.id, nameOf(row.rndtechnosoft_users)]));
  }
}
