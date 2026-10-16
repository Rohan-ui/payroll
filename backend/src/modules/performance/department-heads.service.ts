import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, dayBefore, isOverlapViolation, isoDate } from '@/modules/payroll/payroll-lock';
import { AppointHeadDto, CancelHeadDto, EndHeadDto } from './dto/performance-library.dto';
import { personName } from './performance-common';

type Tx = Prisma.TransactionClient;
const EMPLOYEE = { select: { id: true, first_name: true, last_name: true, preferred_name: true, employee_code: true } } as const;

/**
 * Department heads, effective-dated. A new head closes the current
 * appointment the day before they start; history is never rewritten, and the
 * database refuses two active appointments of one department that overlap.
 */
@Injectable()
export class DepartmentHeadsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Every department with its head today and the next one already appointed. */
  async list(tenantId: string, today: Date = dateOnly(isoDate(new Date()))) {
    const departments = await this.prisma.rndtechnosoft_departments.findMany({
      where: { tenant_id: tenantId, archived_at: null },
      orderBy: { department_name: 'asc' },
      take: 500,
      select: {
        id: true,
        department_code: true,
        department_name: true,
        rndtechnosoft_department_heads: {
          where: { appointment_status: 'ACTIVE', OR: [{ effective_to: null }, { effective_to: { gte: today } }] },
          orderBy: { effective_from: 'asc' },
          include: { head_employee: EMPLOYEE },
        },
      },
    });
    return departments.map((d) => {
      const rows = d.rndtechnosoft_department_heads;
      const current = rows.find((r) => r.effective_from <= today) ?? null;
      const upcoming = rows.find((r) => r.effective_from > today) ?? null;
      return { id: d.id, code: d.department_code, name: d.department_name, current: current && this.present(current), upcoming: upcoming && this.present(upcoming) };
    });
  }

  /** Every appointment of one department, newest first, cancelled ones included. */
  async history(tenantId: string, departmentId: string) {
    const department = await this.prisma.rndtechnosoft_departments.findFirst({ where: { tenant_id: tenantId, id: departmentId }, select: { id: true, department_name: true } });
    if (!department) throw new NotFoundException('Department not found.');
    const rows = await this.prisma.rndtechnosoft_department_heads.findMany({
      where: { tenant_id: tenantId, department_id: departmentId },
      orderBy: [{ effective_from: 'desc' }, { created_at: 'desc' }],
      take: 100,
      include: {
        head_employee: EMPLOYEE,
        created_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
        cancelled_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
      },
    });
    return {
      department: { id: department.id, name: department.department_name },
      appointments: rows.map((r) => ({
        ...this.present(r),
        reason: r.change_reason,
        appointedBy: r.created_by?.rndtechnosoft_users.display_name ?? null,
        appointedAt: r.created_at,
        cancelledBy: r.cancelled_by?.rndtechnosoft_users.display_name ?? null,
        cancelledAt: r.cancelled_at,
        cancellationReason: r.cancellation_reason,
      })),
    };
  }

  async appoint(tenantId: string, input: AppointHeadDto, actor: AuthenticatedTenantUser) {
    const department = await this.prisma.rndtechnosoft_departments.findFirst({ where: { tenant_id: tenantId, id: input.departmentId, archived_at: null }, select: { id: true } });
    if (!department) throw new BadRequestException('The department was not found in this workspace.');
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: input.employeeId }, select: { employee_status: true, archived_at: true } });
    if (!employee) throw new BadRequestException('The employee was not found in this workspace.');
    if (employee.employee_status !== 'ACTIVE' || employee.archived_at) throw new BadRequestException('Only an active employee can head a department.');
    const from = dateOnly(input.effectiveFrom);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockDepartment(tx, tenantId, input.departmentId);
      const latest = await this.latest(tx, tenantId, input.departmentId);
      let closed: string | null = null;
      if (latest) {
        if (from <= latest.effective_from) {
          throw new BadRequestException(`The latest appointment starts on ${isoDate(latest.effective_from)}. A new head must start after that; to correct a mistake, cancel that appointment first.`);
        }
        if (latest.head_employee_id === input.employeeId && (!latest.effective_to || latest.effective_to >= dayBefore(from))) {
          throw new BadRequestException('This employee already heads the department on that date.');
        }
        if (!latest.effective_to || latest.effective_to >= from) {
          await tx.rndtechnosoft_department_heads.update({ where: { tenant_id_id: { tenant_id: tenantId, id: latest.id } }, data: { effective_to: dayBefore(from), updated_at: new Date() } });
          closed = latest.id;
        }
      }
      const id = randomUUID();
      await tx.rndtechnosoft_department_heads.create({
        data: {
          id, tenant_id: tenantId, department_id: input.departmentId, head_employee_id: input.employeeId, effective_from: from,
          change_reason: input.reason?.trim() || null, created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      return { id, closed };
    }).catch((e) => {
      if (isOverlapViolation(e)) throw new ConflictException('These dates overlap another appointment for this department. Reload and try again.');
      throw e;
    });
    await this.log(tenantId, actor, 'DEPARTMENT_HEAD_APPOINTED', result.id, {
      new: { department_id: input.departmentId, head_employee_id: input.employeeId, effective_from: input.effectiveFrom },
      closed_appointment_id: result.closed,
    });
    return this.list(tenantId);
  }

  /** Ends an open appointment on a given last day, leaving the department without a head after it. */
  async end(tenantId: string, id: string, input: EndHeadDto, actor: AuthenticatedTenantUser) {
    const to = dateOnly(input.effectiveTo);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockDepartment(tx, tenantId, (await this.find(tx, tenantId, id)).department_id);
      const fresh = await this.find(tx, tenantId, id);
      if (fresh.appointment_status !== 'ACTIVE') throw new BadRequestException('This appointment was cancelled.');
      if (fresh.effective_to) throw new BadRequestException(`This appointment already ends on ${isoDate(fresh.effective_to)}.`);
      if (to < fresh.effective_from) throw new BadRequestException(`The appointment starts on ${isoDate(fresh.effective_from)}, so it can’t end before that.`);
      await tx.rndtechnosoft_department_heads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { effective_to: to, updated_at: new Date() } });
      return fresh;
    });
    await this.log(tenantId, actor, 'DEPARTMENT_HEAD_ENDED', id, { old: { effective_to: null }, new: { effective_to: input.effectiveTo }, department_id: row.department_id });
    return this.list(tenantId);
  }

  /**
   * Cancels the department's latest appointment, made by mistake. The one
   * before it, if this appointment closed it, runs on again as it did.
   */
  async cancel(tenantId: string, id: string, input: CancelHeadDto, actor: AuthenticatedTenantUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockDepartment(tx, tenantId, (await this.find(tx, tenantId, id)).department_id);
      const appointment = await this.find(tx, tenantId, id);
      const latest = await this.latest(tx, tenantId, appointment.department_id);
      if (appointment.appointment_status !== 'ACTIVE') throw new BadRequestException('This appointment is already cancelled.');
      if (!latest || latest.id !== id) throw new BadRequestException('Only the latest appointment can be cancelled. Cancel the later ones first.');
      await tx.rndtechnosoft_department_heads.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: { appointment_status: 'CANCELLED', cancelled_at: new Date(), cancelled_by_tenant_member_id: actor.tenantMemberId, cancellation_reason: input.reason.trim(), updated_at: new Date() },
      });
      const previous = await this.latest(tx, tenantId, appointment.department_id);
      let reopened: string | null = null;
      if (previous?.effective_to && isoDate(previous.effective_to) === isoDate(dayBefore(appointment.effective_from))) {
        await tx.rndtechnosoft_department_heads.update({ where: { tenant_id_id: { tenant_id: tenantId, id: previous.id } }, data: { effective_to: appointment.effective_to, updated_at: new Date() } });
        reopened = previous.id;
      }
      return { departmentId: appointment.department_id, reopened };
    });
    await this.log(tenantId, actor, 'DEPARTMENT_HEAD_CANCELLED', id, { reason: input.reason.trim(), department_id: result.departmentId, reopened_appointment_id: result.reopened });
    return this.list(tenantId);
  }

  private latest(tx: Tx, tenantId: string, departmentId: string) {
    return tx.rndtechnosoft_department_heads.findFirst({
      where: { tenant_id: tenantId, department_id: departmentId, appointment_status: 'ACTIVE' },
      orderBy: { effective_from: 'desc' },
    });
  }

  private async find(tx: Tx, tenantId: string, id: string) {
    const row = await tx.rndtechnosoft_department_heads.findFirst({ where: { tenant_id: tenantId, id } });
    if (!row) throw new NotFoundException('Appointment not found.');
    return row;
  }

  /** Appointments of one department change one at a time. */
  private async lockDepartment(tx: Tx, tenantId: string, departmentId: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_departments WHERE tenant_id = ${tenantId}::uuid AND id = ${departmentId}::uuid FOR UPDATE`;
  }

  private present(row: { id: string; effective_from: Date; effective_to: Date | null; appointment_status: string; head_employee: { id: string; first_name: string; last_name: string | null; preferred_name: string | null; employee_code: string } }) {
    return {
      appointmentId: row.id,
      employee: { id: row.head_employee.id, name: personName(row.head_employee), code: row.head_employee.employee_code },
      effectiveFrom: isoDate(row.effective_from),
      effectiveTo: row.effective_to ? isoDate(row.effective_to) : null,
      status: row.appointment_status,
    };
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'DEPARTMENT_HEAD', entityId: id, oldValues, newValues, metadata });
  }
}
