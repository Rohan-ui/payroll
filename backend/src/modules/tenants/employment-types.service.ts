import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import {
  CreateEmploymentTypeDto,
  ListEmploymentTypesQueryDto,
  UpdateEmploymentTypeDto,
} from './dto/employment-type.dto';

@Injectable()
export class EmploymentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private auditActor(tenantId: string, actor: AuthenticatedTenantUser) {
    return {
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
    };
  }

  private mapRow(row: any) {
    const candidatesCount = row._count?.rndtechnosoft_candidates ?? 0;
    const offersCount = row._count?.rndtechnosoft_offers ?? 0;
    const employeesCount = row._count?.rndtechnosoft_employee_employments ?? 0;
    const policyScopesCount = row._count?.rndtechnosoft_payroll_policy_scopes ?? 0;
    const isReferenced = candidatesCount + offersCount + employeesCount + policyScopesCount > 0;

    return {
      id: row.id,
      code: row.employment_type_code,
      name: row.employment_type_name,
      description: row.description,
      status: row.employment_type_status,
      isActive: row.employment_type_status === 'ACTIVE',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      candidatesCount,
      offersCount,
      employeesCount,
      policyScopesCount,
      isReferenced,
    };
  }

  async list(tenantId: string, query?: ListEmploymentTypesQueryDto) {
    const term = query?.search?.trim();
    const status = query?.status;

    const where: any = {
      tenant_id: tenantId,
      ...(status && status !== 'ALL' ? { employment_type_status: status } : {}),
      ...(term
        ? {
            OR: [
              { employment_type_name: { contains: term, mode: 'insensitive' } },
              { employment_type_code: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.rndtechnosoft_employment_types.findMany({
      where,
      orderBy: { employment_type_name: 'asc' },
      include: {
        _count: {
          select: {
            rndtechnosoft_candidates: true,
            rndtechnosoft_offers: true,
            rndtechnosoft_employee_employments: true,
            rndtechnosoft_payroll_policy_scopes: true,
          },
        },
      },
    });

    return rows.map((r) => this.mapRow(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.rndtechnosoft_employment_types.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        _count: {
          select: {
            rndtechnosoft_candidates: true,
            rndtechnosoft_offers: true,
            rndtechnosoft_employee_employments: true,
            rndtechnosoft_payroll_policy_scopes: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Employment type not found.');
    }

    return this.mapRow(row);
  }

  private async generateUniqueCode(tenantId: string, candidateName: string, userCode?: string): Promise<string> {
    if (userCode && userCode.trim()) {
      const sanitized = userCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64);
      const existing = await this.prisma.rndtechnosoft_employment_types.findFirst({
        where: { tenant_id: tenantId, employment_type_code: sanitized },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(`An employment type with the code "${sanitized}" already exists.`);
      }
      return sanitized;
    }

    const base = candidateName
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'EMP_TYPE';

    let code = base;
    let counter = 1;
    while (true) {
      const existing = await this.prisma.rndtechnosoft_employment_types.findFirst({
        where: { tenant_id: tenantId, employment_type_code: code },
        select: { id: true },
      });
      if (!existing) return code;
      counter += 1;
      code = `${base.slice(0, 45)}_${counter}`;
    }
  }

  async create(tenantId: string, input: CreateEmploymentTypeDto, actor: AuthenticatedTenantUser) {
    const name = input.name.trim();

    // Check duplicate name within tenant (case-insensitive)
    const existingName = await this.prisma.rndtechnosoft_employment_types.findFirst({
      where: {
        tenant_id: tenantId,
        employment_type_name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existingName) {
      throw new ConflictException(`An employment type with the name "${name}" already exists in this workspace.`);
    }

    const code = await this.generateUniqueCode(tenantId, name, input.code);

    const created = await this.prisma.rndtechnosoft_employment_types.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        employment_type_code: code,
        employment_type_name: name,
        description: input.description?.trim() || null,
        employment_type_status: input.status || 'ACTIVE',
      },
      include: {
        _count: {
          select: {
            rndtechnosoft_candidates: true,
            rndtechnosoft_offers: true,
            rndtechnosoft_employee_employments: true,
            rndtechnosoft_payroll_policy_scopes: true,
          },
        },
      },
    });

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'EMPLOYMENT_TYPE_CREATED',
      entityType: 'EMPLOYMENT_TYPE',
      entityId: created.id,
      newValues: {
        code: created.employment_type_code,
        name: created.employment_type_name,
        status: created.employment_type_status,
        description: created.description,
      },
    });

    return this.mapRow(created);
  }

  async update(tenantId: string, id: string, input: UpdateEmploymentTypeDto, actor: AuthenticatedTenantUser) {
    const current = await this.prisma.rndtechnosoft_employment_types.findFirst({
      where: { tenant_id: tenantId, id },
    });

    if (!current) {
      throw new NotFoundException('Employment type not found.');
    }

    const name = input.name?.trim();
    if (name && name.toLowerCase() !== current.employment_type_name.toLowerCase()) {
      const clash = await this.prisma.rndtechnosoft_employment_types.findFirst({
        where: {
          tenant_id: tenantId,
          id: { not: id },
          employment_type_name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(`An employment type with the name "${name}" already exists in this workspace.`);
      }
    }

    const updated = await this.prisma.rndtechnosoft_employment_types.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: {
        ...(name ? { employment_type_name: name } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.status ? { employment_type_status: input.status } : {}),
        updated_at: new Date(),
      },
      include: {
        _count: {
          select: {
            rndtechnosoft_candidates: true,
            rndtechnosoft_offers: true,
            rndtechnosoft_employee_employments: true,
            rndtechnosoft_payroll_policy_scopes: true,
          },
        },
      },
    });

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'EMPLOYMENT_TYPE_UPDATED',
      entityType: 'EMPLOYMENT_TYPE',
      entityId: updated.id,
      oldValues: {
        name: current.employment_type_name,
        status: current.employment_type_status,
        description: current.description,
      },
      newValues: {
        name: updated.employment_type_name,
        status: updated.employment_type_status,
        description: updated.description,
      },
    });

    return this.mapRow(updated);
  }

  async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'INACTIVE', actor: AuthenticatedTenantUser) {
    return this.update(tenantId, id, { status }, actor);
  }

  async delete(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const current = await this.prisma.rndtechnosoft_employment_types.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        _count: {
          select: {
            rndtechnosoft_candidates: true,
            rndtechnosoft_offers: true,
            rndtechnosoft_employee_employments: true,
            rndtechnosoft_payroll_policy_scopes: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('Employment type not found.');
    }

    const totalRefs =
      current._count.rndtechnosoft_candidates +
      current._count.rndtechnosoft_offers +
      current._count.rndtechnosoft_employee_employments +
      current._count.rndtechnosoft_payroll_policy_scopes;

    if (totalRefs > 0) {
      throw new ConflictException(
        'Cannot delete this employment type because it is referenced by existing candidates, employees, offers, or payroll policies. Deactivate it instead.',
      );
    }

    await this.prisma.rndtechnosoft_employment_types.delete({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
    });

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'EMPLOYMENT_TYPE_DELETED',
      entityType: 'EMPLOYMENT_TYPE',
      entityId: current.id,
      oldValues: {
        code: current.employment_type_code,
        name: current.employment_type_name,
        status: current.employment_type_status,
      },
    });

    return { success: true, message: `Employment type "${current.employment_type_name}" deleted.` };
  }
}
