import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, finalizedThrough, isoDate } from '../payroll-lock';
import { monthRange } from '../calculation/dto/calculation.dto';
import { OvertimeDecisionDto } from './overtime.dto';

/**
 * Overtime approval: each day attendance records overtime, someone decides
 * how much of it is paid. A decision is against the minutes recorded at the
 * time; if attendance changes afterwards, the day needs a new decision.
 */
@Injectable()
export class OvertimeService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string, month: string) {
    const { start, end } = monthRange(month);
    const [records, decisions] = await Promise.all([
      this.prisma.rndtechnosoft_attendance_records.findMany({
        where: { tenant_id: tenantId, overtime_minutes: { gt: 0 }, attendance_date: { gte: dateOnly(start), lte: dateOnly(end) } },
        orderBy: [{ attendance_date: 'asc' }],
        take: 5000,
        select: {
          employee_id: true, attendance_date: true, attendance_status: true, overtime_minutes: true,
          rndtechnosoft_employees: { select: { employee_code: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.rndtechnosoft_overtime_approvals.findMany({
        where: { tenant_id: tenantId, work_date: { gte: dateOnly(start), lte: dateOnly(end) } },
        include: { decided_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } } },
      }),
    ]);
    const eligible = await this.prisma.rndtechnosoft_employee_salary_assignments.findMany({
      where: { tenant_id: tenantId, assignment_status: 'ACTIVE', employee_id: { in: [...new Set(records.map((r) => r.employee_id))] }, effective_from: { lte: dateOnly(end) }, OR: [{ effective_to: null }, { effective_to: { gte: dateOnly(start) } }] },
      select: { employee_id: true, is_overtime_eligible: true },
    });
    const eligibleIds = new Set(eligible.filter((e) => e.is_overtime_eligible).map((e) => e.employee_id));
    const byKey = new Map(decisions.map((d) => [`${d.employee_id} ${isoDate(d.work_date)}`, d]));
    return records.map((r) => {
      const date = isoDate(r.attendance_date);
      const d = byKey.get(`${r.employee_id} ${date}`);
      const state = !d ? 'PENDING' : d.recorded_minutes !== r.overtime_minutes ? 'CHANGED' : d.decision;
      return {
        employee: { id: r.employee_id, code: r.rndtechnosoft_employees.employee_code, name: [r.rndtechnosoft_employees.first_name, r.rndtechnosoft_employees.last_name].filter(Boolean).join(' ') },
        date,
        attendanceStatus: r.attendance_status,
        recordedMinutes: r.overtime_minutes,
        eligible: eligibleIds.has(r.employee_id),
        state,
        approvedMinutes: d && state !== 'CHANGED' ? d.approved_minutes : null,
        note: d?.note ?? null,
        decidedBy: d?.decided_by?.rndtechnosoft_users.display_name ?? null,
        decidedAt: d?.decided_at ?? null,
      };
    });
  }

  /** Records decisions, all or none: each against the minutes attendance records now. */
  async decide(tenantId: string, decisions: OvertimeDecisionDto[], actor: AuthenticatedTenantUser) {
    const keys = decisions.map((d) => `${d.employeeId} ${d.date}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('A day is decided more than once.');
    const records = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: { tenant_id: tenantId, OR: decisions.map((d) => ({ employee_id: d.employeeId, attendance_date: dateOnly(d.date) })) },
      select: { employee_id: true, attendance_date: true, overtime_minutes: true },
    });
    const recorded = new Map(records.map((r) => [`${r.employee_id} ${isoDate(r.attendance_date)}`, r.overtime_minutes]));
    const locks = new Map<string, Date | null>();
    for (const d of decisions) {
      const minutes = recorded.get(`${d.employeeId} ${d.date}`);
      if (!minutes) throw new BadRequestException(`No overtime is recorded for that employee on ${d.date}.`);
      if (d.decision === 'APPROVED' && d.approvedMinutes !== undefined && d.approvedMinutes > minutes) throw new BadRequestException(`On ${d.date} only ${minutes} minutes are recorded; no more can be approved.`);
      if (!locks.has(d.employeeId)) locks.set(d.employeeId, await finalizedThrough(this.prisma, tenantId, d.employeeId));
      const locked = locks.get(d.employeeId);
      if (locked && dateOnly(d.date) <= locked) throw new BadRequestException(`Payroll is finalized up to ${isoDate(locked)} for that employee, so overtime on ${d.date} can’t change.`);
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const d of decisions) {
        const minutes = recorded.get(`${d.employeeId} ${d.date}`) as number;
        const approved = d.decision === 'APPROVED' ? (d.approvedMinutes ?? minutes) : 0;
        const data = { recorded_minutes: minutes, approved_minutes: approved, decision: d.decision, note: d.note?.trim() || null, decided_by_tenant_member_id: actor.tenantMemberId, decided_at: now, updated_at: now };
        await tx.rndtechnosoft_overtime_approvals.upsert({
          where: { tenant_id_employee_id_work_date: { tenant_id: tenantId, employee_id: d.employeeId, work_date: dateOnly(d.date) } },
          create: { id: randomUUID(), tenant_id: tenantId, employee_id: d.employeeId, work_date: dateOnly(d.date), ...data },
          update: data,
        });
      }
    });
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'OVERTIME_DECIDED', entityType: 'OVERTIME',
      metadata: { decisions: decisions.map((d) => ({ employee_id: d.employeeId, date: d.date, decision: d.decision, approved_minutes: d.decision === 'APPROVED' ? (d.approvedMinutes ?? recorded.get(`${d.employeeId} ${d.date}`)) : 0 })) },
    });
    return { decided: decisions.length };
  }
}
