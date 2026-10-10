import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { SYSTEM_VARIABLE_NAMES } from './formula/variables';
import { ComponentSettingsDto, CreateComponentDto } from './dto/salary.dto';

type ComponentRow = Prisma.rndtechnosoft_salary_componentsGetPayload<object>;

/** The settings that decide how a component is calculated: fixed once a published structure uses it. */
const CALCULATION_SETTINGS = [
  'component_category', 'calculation_type', 'system_rule', 'is_statutory', 'is_taxable', 'is_prorated', 'include_in_gross', 'include_in_ctc', 'min_amount', 'max_amount', 'rounding_scale', 'rounding_mode',
] as const;

export function componentView(c: ComponentRow, usedInPublished = false) {
  return {
    id: c.id,
    componentCode: c.component_code,
    componentName: c.component_name,
    description: c.component_description,
    category: c.component_category,
    calculationType: c.calculation_type,
    systemRule: c.system_rule,
    isStatutory: c.is_statutory,
    isTaxable: c.is_taxable,
    isProrated: c.is_prorated,
    includeInGross: c.include_in_gross,
    includeInCtc: c.include_in_ctc,
    showOnPayslip: c.show_on_payslip,
    minAmount: c.min_amount?.toFixed() ?? null,
    maxAmount: c.max_amount?.toFixed() ?? null,
    roundingScale: c.rounding_scale,
    roundingMode: c.rounding_mode,
    displayOrder: c.display_order,
    status: c.component_status,
    usedInPublished,
  };
}

/** Salary components: the earnings, deductions and employer contributions structures are built from. */
@Injectable()
export class SalaryComponentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string, includeArchived = false) {
    const [components, used] = await Promise.all([
      this.prisma.rndtechnosoft_salary_components.findMany({
        where: { tenant_id: tenantId, ...(includeArchived ? {} : { component_status: 'ACTIVE' }) },
        orderBy: [{ display_order: 'asc' }, { component_code: 'asc' }],
        take: 500,
      }),
      this.usedInPublished(tenantId),
    ]);
    return components.map((c) => componentView(c, used.has(c.id)));
  }

  async create(tenantId: string, input: CreateComponentDto, actor: AuthenticatedTenantUser) {
    if (SYSTEM_VARIABLE_NAMES.has(input.componentCode)) {
      throw new BadRequestException(`${input.componentCode} is the name of a system value used in formulas. Choose another code.`);
    }
    const existing = await this.prisma.rndtechnosoft_salary_components.findFirst({ where: { tenant_id: tenantId, component_code: input.componentCode }, select: { id: true } });
    if (existing) throw new ConflictException(`A salary component with code ${input.componentCode} already exists.`);
    const id = randomUUID();
    const created = await this.prisma.rndtechnosoft_salary_components.create({
      data: { id, tenant_id: tenantId, component_code: input.componentCode, ...this.columns(input) },
    });
    await this.log(tenantId, actor, 'SALARY_COMPONENT_CREATED', id, { code: input.componentCode, category: input.category, calculation_type: input.calculationType });
    return componentView(created);
  }

  async update(tenantId: string, id: string, input: ComponentSettingsDto, actor: AuthenticatedTenantUser) {
    const current = await this.find(tenantId, id);
    const next = this.columns(input);
    const changed = CALCULATION_SETTINGS.filter((k) => String(current[k] ?? '') !== String(next[k] ?? ''));
    const used = (await this.usedInPublished(tenantId, id)).has(id);
    if (used && changed.length) {
      throw new BadRequestException(
        `${current.component_code} is used by a published salary structure, so how it is calculated can’t change (${changed.map((k) => k.replace(/_/g, ' ')).join(', ')}). Create a new component and use it in a new structure version instead.`,
      );
    }
    const updated = await this.prisma.rndtechnosoft_salary_components.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { ...next, updated_at: new Date() } });
    await this.log(tenantId, actor, 'SALARY_COMPONENT_UPDATED', id, { code: current.component_code, changed_calculation: changed, name: input.componentName.trim() });
    return componentView(updated, used);
  }

  async setArchived(tenantId: string, id: string, archived: boolean, actor: AuthenticatedTenantUser) {
    const current = await this.find(tenantId, id);
    const updated = await this.prisma.rndtechnosoft_salary_components.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { component_status: archived ? 'ARCHIVED' : 'ACTIVE', archived_at: archived ? new Date() : null, updated_at: new Date() },
    });
    await this.log(tenantId, actor, archived ? 'SALARY_COMPONENT_ARCHIVED' : 'SALARY_COMPONENT_RESTORED', id, { code: current.component_code });
    return componentView(updated, (await this.usedInPublished(tenantId, id)).has(id));
  }

  private columns(input: ComponentSettingsDto) {
    if (input.category !== 'EARNING' && input.includeInGross) throw new BadRequestException('Only earnings can be counted in gross pay.');
    if (input.minAmount && input.maxAmount && new Prisma.Decimal(input.minAmount).gt(input.maxAmount)) throw new BadRequestException('The minimum is more than the maximum.');
    return {
      component_name: input.componentName.trim(),
      component_description: input.description?.trim() || null,
      component_category: input.category,
      calculation_type: input.calculationType,
      system_rule: input.calculationType === 'SYSTEM_CALCULATED' ? (input.systemRule ?? null) : null,
      is_statutory: input.isStatutory,
      is_taxable: input.isTaxable,
      is_prorated: input.isProrated,
      include_in_gross: input.includeInGross,
      include_in_ctc: input.includeInCtc,
      show_on_payslip: input.showOnPayslip,
      min_amount: input.minAmount ? new Prisma.Decimal(input.minAmount) : null,
      max_amount: input.maxAmount ? new Prisma.Decimal(input.maxAmount) : null,
      rounding_scale: input.roundingScale,
      rounding_mode: input.roundingMode,
      display_order: input.displayOrder,
      // Kept in step with the type: the old column the previous calculation read.
      is_variable: input.calculationType === 'MANUAL',
    };
  }

  /** Ids of components a published structure version uses. */
  private async usedInPublished(tenantId: string, componentId?: string) {
    const rows = await this.prisma.rndtechnosoft_salary_structure_components.findMany({
      where: { tenant_id: tenantId, ...(componentId ? { salary_component_id: componentId } : {}), rndtechnosoft_salary_structure_versions: { version_status: 'PUBLISHED' } },
      select: { salary_component_id: true },
      distinct: ['salary_component_id'],
    });
    return new Set(rows.map((r) => r.salary_component_id));
  }

  private async find(tenantId: string, id: string) {
    const component = await this.prisma.rndtechnosoft_salary_components.findFirst({ where: { tenant_id: tenantId, id } });
    if (!component) throw new NotFoundException('Salary component not found.');
    return component;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'SALARY_COMPONENT', entityId: id, metadata });
  }
}
