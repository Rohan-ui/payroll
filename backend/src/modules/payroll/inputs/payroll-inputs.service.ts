import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PayrollService } from '../payroll.service';
import { monthRange } from '../calculation/dto/calculation.dto';
import { CreateInputDto, UpdateInputDto } from './payroll-inputs.dto';

const memberName = { select: { rndtechnosoft_users: { select: { display_name: true } } } } as const;

/**
 * Monthly entries: one-off amounts for a month, such as a bonus, incentive,
 * commission or manual deduction, on components entered each month. An
 * entry is paid only once someone other than the person who entered it has
 * approved it, and nothing changes once that month's payroll is finalized.
 */
@Injectable()
export class PayrollInputsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly payroll: PayrollService) {}

  /** Components entries can be made on: active, entered each month. */
  async components(tenantId: string) {
    const rows = await this.prisma.rndtechnosoft_salary_components.findMany({
      where: { tenant_id: tenantId, component_status: 'ACTIVE', calculation_type: 'MANUAL' },
      orderBy: [{ display_order: 'asc' }, { component_code: 'asc' }],
      select: { id: true, component_code: true, component_name: true, component_category: true },
    });
    return rows.map((c) => ({ id: c.id, code: c.component_code, name: c.component_name, category: c.component_category }));
  }

  async list(tenantId: string, month: string) {
    const period = await this.period(tenantId, month, false);
    if (!period) return { month, finalized: false, entries: [] };
    const rows = await this.prisma.rndtechnosoft_payroll_inputs.findMany({
      where: { tenant_id: tenantId, payroll_period_id: period.id, reference_type: null },
      orderBy: { created_at: 'desc' },
      take: 2000,
      include: {
        rndtechnosoft_employees: { select: { id: true, employee_code: true, first_name: true, last_name: true } },
        rndtechnosoft_salary_components: { select: { component_code: true, component_name: true, component_category: true } },
        created_by: memberName,
        rndtechnosoft_tenant_members: memberName,
      },
    });
    return {
      month,
      finalized: await this.finalized(tenantId, period.id),
      entries: rows.map((r) => ({
        id: r.id,
        employee: { id: r.rndtechnosoft_employees.id, code: r.rndtechnosoft_employees.employee_code, name: [r.rndtechnosoft_employees.first_name, r.rndtechnosoft_employees.last_name].filter(Boolean).join(' ') },
        component: { code: r.rndtechnosoft_salary_components.component_code, name: r.rndtechnosoft_salary_components.component_name, category: r.rndtechnosoft_salary_components.component_category },
        amount: r.amount.toFixed(2),
        status: r.input_status,
        note: r.notes,
        rejectionReason: r.rejection_reason,
        createdBy: r.created_by?.rndtechnosoft_users.display_name ?? null,
        createdByMemberId: r.created_by_tenant_member_id,
        approvedBy: r.rndtechnosoft_tenant_members?.rndtechnosoft_users.display_name ?? null,
        approvedAt: r.approved_at,
        createdAt: r.created_at,
      })),
    };
  }

  async create(tenantId: string, input: CreateInputDto, actor: AuthenticatedTenantUser) {
    if (new Prisma.Decimal(input.amount).lte(0)) throw new BadRequestException('The amount must be more than zero.');
    const [employee, component] = await Promise.all([
      this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: input.employeeId }, select: { id: true } }),
      this.prisma.rndtechnosoft_salary_components.findFirst({ where: { tenant_id: tenantId, id: input.salaryComponentId } }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found.');
    if (!component) throw new NotFoundException('Salary component not found.');
    if (component.calculation_type !== 'MANUAL' || component.component_status !== 'ACTIVE') {
      throw new BadRequestException(`${component.component_code} isn’t an active component entered each month.`);
    }
    const period = await this.period(tenantId, input.month, true);
    await this.refuseIfFinalized(tenantId, period.id, input.month);
    const id = randomUUID();
    try {
      await this.prisma.rndtechnosoft_payroll_inputs.create({
        data: {
          id, tenant_id: tenantId, payroll_period_id: period.id, employee_id: input.employeeId, salary_component_id: input.salaryComponentId,
          amount: new Prisma.Decimal(input.amount), input_source: 'MANUAL', input_status: 'PENDING', notes: input.note?.trim() || null, created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`This employee already has a ${component.component_name} entry for ${input.month}. Change that entry instead.`);
      }
      throw e;
    }
    await this.log(tenantId, actor, 'PAYROLL_INPUT_CREATED', id, { month: input.month, employee_id: input.employeeId, component: component.component_code });
    return this.list(tenantId, input.month);
  }

  async update(tenantId: string, id: string, input: UpdateInputDto, actor: AuthenticatedTenantUser) {
    if (new Prisma.Decimal(input.amount).lte(0)) throw new BadRequestException('The amount must be more than zero.');
    const entry = await this.find(tenantId, id);
    if (entry.input_status !== 'PENDING') throw new BadRequestException('Only an entry waiting for approval can be changed. Cancel it and enter a new one.');
    await this.prisma.rndtechnosoft_payroll_inputs.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { amount: new Prisma.Decimal(input.amount), notes: input.note?.trim() || null, updated_at: new Date() } });
    await this.log(tenantId, actor, 'PAYROLL_INPUT_UPDATED', id, { month: entry.month });
    return this.list(tenantId, entry.month);
  }

  async approve(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const entry = await this.find(tenantId, id);
    if (entry.input_status !== 'PENDING') throw new BadRequestException('This entry isn’t waiting for approval.');
    if (entry.created_by_tenant_member_id === actor.tenantMemberId) throw new ForbiddenException('Someone else must approve an entry you made.');
    await this.prisma.rndtechnosoft_payroll_inputs.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { input_status: 'APPROVED', approved_by_tenant_member_id: actor.tenantMemberId, approved_at: new Date(), updated_at: new Date() },
    });
    await this.log(tenantId, actor, 'PAYROLL_INPUT_APPROVED', id, { month: entry.month });
    return this.list(tenantId, entry.month);
  }

  async reject(tenantId: string, id: string, reason: string, actor: AuthenticatedTenantUser) {
    const entry = await this.find(tenantId, id);
    if (entry.input_status !== 'PENDING') throw new BadRequestException('This entry isn’t waiting for approval.');
    await this.prisma.rndtechnosoft_payroll_inputs.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { input_status: 'REJECTED', rejection_reason: reason.trim(), updated_at: new Date() } });
    await this.log(tenantId, actor, 'PAYROLL_INPUT_REJECTED', id, { month: entry.month, reason: reason.trim() });
    return this.list(tenantId, entry.month);
  }

  async cancel(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const entry = await this.find(tenantId, id);
    if (!['PENDING', 'APPROVED'].includes(entry.input_status)) throw new BadRequestException('This entry is already closed.');
    await this.prisma.rndtechnosoft_payroll_inputs.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { input_status: 'CANCELLED', updated_at: new Date() } });
    await this.log(tenantId, actor, 'PAYROLL_INPUT_CANCELLED', id, { month: entry.month, was: entry.input_status });
    return this.list(tenantId, entry.month);
  }

  /** The month's pay period; created when an entry is first made for the month. */
  private async period(tenantId: string, month: string, create: true): Promise<{ id: string }>;
  private async period(tenantId: string, month: string, create: false): Promise<{ id: string } | null>;
  private async period(tenantId: string, month: string, create: boolean) {
    const { start, end } = monthRange(month);
    const where = { tenant_id: tenantId, period_start: new Date(`${start}T00:00:00Z`), period_end: new Date(`${end}T00:00:00Z`) };
    const existing = await this.prisma.rndtechnosoft_payroll_periods.findFirst({ where, select: { id: true } });
    if (existing || !create) return existing;
    try {
      const created = await this.payroll.createPeriod(tenantId, { periodCode: month, periodStart: start, periodEnd: end });
      return { id: created.id };
    } catch (e) {
      // Created at the same moment by someone else.
      const again = await this.prisma.rndtechnosoft_payroll_periods.findFirst({ where, select: { id: true } });
      if (again) return again;
      throw e;
    }
  }

  private async finalized(tenantId: string, periodId: string) {
    return (await this.prisma.rndtechnosoft_payroll_runs.count({ where: { tenant_id: tenantId, payroll_period_id: periodId, run_status: 'FINALIZED' } })) > 0;
  }

  private async refuseIfFinalized(tenantId: string, periodId: string, month: string) {
    if (await this.finalized(tenantId, periodId)) throw new BadRequestException(`Payroll for ${month} is finalized, so its entries can’t change. Enter the amount in a later month.`);
  }

  private async find(tenantId: string, id: string) {
    const entry = await this.prisma.rndtechnosoft_payroll_inputs.findFirst({
      where: { tenant_id: tenantId, id, reference_type: null },
      include: { rndtechnosoft_payroll_periods: { select: { period_start: true } } },
    });
    if (!entry) throw new NotFoundException('Entry not found.');
    const month = entry.rndtechnosoft_payroll_periods.period_start.toISOString().slice(0, 7);
    await this.refuseIfFinalized(tenantId, entry.payroll_period_id, month);
    return { ...entry, month };
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PAYROLL_INPUT', entityId: id, metadata });
  }
}
