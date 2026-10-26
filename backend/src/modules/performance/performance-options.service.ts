import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { personName } from './performance-common';

/** The departments, designations and employees performance setup can point at; names and codes only. */
@Injectable()
export class PerformanceOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async options(tenantId: string) {
    const [departments, designations] = await Promise.all([
      this.prisma.rndtechnosoft_departments.findMany({ where: { tenant_id: tenantId, archived_at: null }, select: { id: true, department_name: true }, orderBy: { department_name: 'asc' }, take: 500 }),
      this.prisma.rndtechnosoft_designations.findMany({ where: { tenant_id: tenantId, archived_at: null }, select: { id: true, designation_name: true }, orderBy: { designation_name: 'asc' }, take: 500 }),
    ]);
    return {
      departments: departments.map((d) => ({ id: d.id, name: d.department_name })),
      designations: designations.map((d) => ({ id: d.id, name: d.designation_name })),
    };
  }

  /** Creates or returns an active designation / role in this workspace. */
  async createDesignation(tenantId: string, name: string) {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Role or designation name is required.');
    let existing = await this.prisma.rndtechnosoft_designations.findFirst({
      where: { tenant_id: tenantId, designation_name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (!existing) {
      const codeBase = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 40) || 'ROLE';
      const designationCode = `${codeBase}_${randomUUID().substring(0, 8).toUpperCase()}`;
      existing = await this.prisma.rndtechnosoft_designations.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          designation_code: designationCode,
          designation_name: trimmed,
          designation_status: 'ACTIVE',
        },
      });
    }
    return { id: existing.id, name: existing.designation_name };
  }

  /** Up to 20 active workspace members whose name or sign-in email matches, to choose as reviewers. */
  async members(tenantId: string, search: string | undefined) {
    const term = search?.trim();
    const rows = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: {
        tenant_id: tenantId,
        membership_status: 'ACTIVE',
        archived_at: null,
        ...(term ? { rndtechnosoft_users: { OR: [{ display_name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] } } : {}),
      },
      orderBy: { rndtechnosoft_users: { display_name: 'asc' } },
      take: 20,
      select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    return rows.map((m) => ({ id: m.id, name: m.rndtechnosoft_users.display_name ?? m.rndtechnosoft_users.email, code: m.rndtechnosoft_users.email }));
  }

  /**
   * Colleagues to nominate or assign as reviewers, for anyone taking part in
   * appraisals: only on a search of at least two letters, up to 20, and only
   * names and employee codes (no emails), active members only.
   */
  async colleagues(tenantId: string, search: string | undefined) {
    const term = search?.trim() ?? '';
    if (term.length < 2) return [];
    const rows = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: {
        tenant_id: tenantId, membership_status: 'ACTIVE', archived_at: null,
        rndtechnosoft_users: { OR: [
          { display_name: { contains: term, mode: 'insensitive' } },
          { rndtechnosoft_employees: { some: { tenant_id: tenantId, OR: [{ first_name: { contains: term, mode: 'insensitive' } }, { last_name: { contains: term, mode: 'insensitive' } }, { employee_code: { contains: term, mode: 'insensitive' } }] } } },
        ] },
      },
      orderBy: { rndtechnosoft_users: { display_name: 'asc' } },
      take: 20,
      select: { id: true, rndtechnosoft_users: { select: { display_name: true, rndtechnosoft_employees: { where: { tenant_id: tenantId }, take: 1, select: { first_name: true, last_name: true, preferred_name: true, employee_code: true } } } } },
    });
    return rows.map((m) => {
      const employee = m.rndtechnosoft_users.rndtechnosoft_employees[0];
      return { id: m.id, name: employee ? personName(employee) : m.rndtechnosoft_users.display_name ?? 'Unnamed member', code: employee?.employee_code ?? '' };
    });
  }

  /** The workspace's active roles, for stages reviewed by a role's members. */
  async roles(tenantId: string) {
    const rows = await this.prisma.rndtechnosoft_roles.findMany({ where: { tenant_id: tenantId, role_status: 'ACTIVE', archived_at: null }, orderBy: { role_name: 'asc' }, take: 200, select: { id: true, role_name: true } });
    return rows.map((r) => ({ id: r.id, name: r.role_name }));
  }

  /** Up to 20 active employees whose name or code matches. */
  async employees(tenantId: string, search: string | undefined) {
    const term = search?.trim();
    const rows = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        employee_status: 'ACTIVE',
        archived_at: null,
        ...(term ? { OR: [
          { first_name: { contains: term, mode: 'insensitive' } },
          { last_name: { contains: term, mode: 'insensitive' } },
          { preferred_name: { contains: term, mode: 'insensitive' } },
          { employee_code: { contains: term, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
      take: 20,
      select: { id: true, first_name: true, last_name: true, preferred_name: true, employee_code: true },
    });
    return rows.map((e) => ({ id: e.id, name: personName(e), code: e.employee_code }));
  }
}
