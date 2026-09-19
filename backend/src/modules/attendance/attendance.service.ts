import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface SaveAttendanceRecordDto {
  employeeId: string;
  attendanceDate: string; // YYYY-MM-DD
  attendanceStatus: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'PAID_LEAVE' | 'UNPAID_LEAVE' | 'HOLIDAY' | 'WEEKEND';
  firstCheckInAt?: string;
  lastCheckOutAt?: string;
  workedMinutes?: number;
  payableMinutes?: number;
  lateMinutes?: number;
  earlyDepartureMinutes?: number;
  overtimeMinutes?: number;
  shiftId?: string;
  source?: string;
}

export interface UpdateAttendanceRecordDto {
  attendanceStatus?: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'PAID_LEAVE' | 'UNPAID_LEAVE' | 'HOLIDAY' | 'WEEKEND';
  firstCheckInAt?: string;
  lastCheckOutAt?: string;
  workedMinutes?: number;
  payableMinutes?: number;
  lateMinutes?: number;
  earlyDepartureMinutes?: number;
  overtimeMinutes?: number;
  shiftId?: string;
  source?: string;
}

export interface RecordPunchInput {
  employeeId: string;
  punchAt?: string;
  punchType: 'IN' | 'OUT';
  source?: string;
  deviceReference?: string;
  latitude?: number;
  longitude?: number;
}

export interface BulkMarkMonthDto {
  month: string; // e.g. "2026-10"
  employeeIds?: string[];
  defaultStatus?: 'PRESENT' | 'ABSENT';
  standardWorkMinutes?: number;
}

export interface RequestAdjustmentDto {
  attendanceRecordId: string;
  requestedByTenantMemberId: string;
  adjustmentReason: string;
  requestedValues: Record<string, any>;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private isUuid(val?: string | null): boolean {
    if (!val) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  }

  private async resolveEmployeeId(tenantId: string, employeeIdOrCode?: string): Promise<string | null> {
    if (!employeeIdOrCode) return null;
    if (this.isUuid(employeeIdOrCode)) {
      return employeeIdOrCode;
    }

    // Try matching employee_code directly, or by normalizing e.g. "emp-001" -> "EMP001"
    const cleanedCode = employeeIdOrCode.replace(/^emp[-_]?/i, 'EMP').toUpperCase();
    const candidateCodes = Array.from(new Set([
      employeeIdOrCode,
      employeeIdOrCode.toUpperCase(),
      cleanedCode,
    ]));

    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: {
        tenant_id: tenantId,
        employee_code: { in: candidateCodes },
      },
      select: { id: true },
    });

    return employee ? employee.id : null;
  }

  /**
   * CREATE or UPSERT daily attendance record
   */
  async saveRecord(tenantId: string, input: SaveAttendanceRecordDto) {
    const resolvedEmployeeId = await this.resolveEmployeeId(tenantId, input.employeeId);
    if (!resolvedEmployeeId) {
      throw new NotFoundException(`Employee ${input.employeeId} not found in tenant`);
    }

    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { id: resolvedEmployeeId, tenant_id: tenantId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${input.employeeId} not found in tenant`);
    }

    const dateOnlyStr = input.attendanceDate.split('T')[0];
    const attendanceDate = new Date(`${dateOnlyStr}T00:00:00.000Z`);

    // Check if record exists
    const existing = await this.prisma.rndtechnosoft_attendance_records.findUnique({
      where: {
        tenant_id_employee_id_attendance_date: {
          tenant_id: tenantId,
          employee_id: resolvedEmployeeId,
          attendance_date: attendanceDate,
        },
      },
    });

    if (existing && existing.finalized_at) {
      throw new ForbiddenException(
        'Cannot update attendance record: It has been locked by finalized payroll.',
      );
    }

    const standardDayMinutes = 480;
    let payableMinutes = input.payableMinutes;
    if (payableMinutes === undefined) {
      switch (input.attendanceStatus) {
        case 'PRESENT':
        case 'PAID_LEAVE':
        case 'HOLIDAY':
        case 'WEEKEND':
          payableMinutes = standardDayMinutes;
          break;
        case 'HALF_DAY':
          payableMinutes = standardDayMinutes / 2;
          break;
        case 'ABSENT':
        case 'UNPAID_LEAVE':
        default:
          payableMinutes = 0;
          break;
      }
    }

    const firstIn = input.firstCheckInAt ? new Date(input.firstCheckInAt) : existing?.first_check_in_at;
    const lastOut = input.lastCheckOutAt ? new Date(input.lastCheckOutAt) : existing?.last_check_out_at;

    let workedMinutes = input.workedMinutes;
    if (workedMinutes === undefined) {
      if (firstIn && lastOut && lastOut > firstIn) {
        workedMinutes = Math.round((lastOut.getTime() - firstIn.getTime()) / (1000 * 60));
      } else {
        workedMinutes = input.attendanceStatus === 'PRESENT' ? standardDayMinutes : 0;
      }
    }

    if (existing) {
      return this.prisma.rndtechnosoft_attendance_records.update({
        where: { id: existing.id },
        data: {
          attendance_status: input.attendanceStatus,
          first_check_in_at: firstIn,
          last_check_out_at: lastOut,
          worked_minutes: workedMinutes,
          payable_minutes: payableMinutes,
          late_minutes: input.lateMinutes ?? existing.late_minutes,
          early_departure_minutes: input.earlyDepartureMinutes ?? existing.early_departure_minutes,
          overtime_minutes: input.overtimeMinutes ?? existing.overtime_minutes,
          shift_id: input.shiftId ?? existing.shift_id,
          source: input.source ?? 'MANUAL',
        },
        include: {
          rndtechnosoft_employees: {
            select: {
              employee_code: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });
    }

    return this.prisma.rndtechnosoft_attendance_records.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        employee_id: resolvedEmployeeId,
        attendance_date: attendanceDate,
        attendance_status: input.attendanceStatus,
        first_check_in_at: firstIn,
        last_check_out_at: lastOut,
        worked_minutes: workedMinutes,
        payable_minutes: payableMinutes,
        late_minutes: input.lateMinutes ?? 0,
        early_departure_minutes: input.earlyDepartureMinutes ?? 0,
        overtime_minutes: input.overtimeMinutes ?? 0,
        shift_id: input.shiftId ?? null,
        source: input.source ?? 'MANUAL',
      },
      include: {
        rndtechnosoft_employees: {
          select: {
            employee_code: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
  }

  /**
   * READ: Daily records with filters
   */
  async getDailyRecords(
    tenantId: string,
    employeeId?: string,
    startDate?: string,
    endDate?: string,
    status?: string,
    page = 1,
    limit = 100,
  ) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (employeeId) {
      const resolvedId = await this.resolveEmployeeId(tenantId, employeeId);
      if (!resolvedId) {
        // Employee not found - return graceful empty list instead of 500
        return { total: 0, page, limit, items: [] };
      }
      where.employee_id = resolvedId;
    }

    if (status) {
      where.attendance_status = status;
    }

    if (startDate || endDate) {
      where.attendance_date = {
        ...(startDate ? { gte: new Date(startDate.split('T')[0] + 'T00:00:00.000Z') } : {}),
        ...(endDate ? { lte: new Date(endDate.split('T')[0] + 'T23:59:59.999Z') } : {}),
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.rndtechnosoft_attendance_records.count({ where }),
      this.prisma.rndtechnosoft_attendance_records.findMany({
        where,
        orderBy: [{ attendance_date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          rndtechnosoft_employees: {
            select: {
              id: true,
              employee_code: true,
              first_name: true,
              last_name: true,
              work_email: true,
            },
          },
          rndtechnosoft_shifts: {
            select: {
              shift_code: true,
              shift_name: true,
            },
          },
          rndtechnosoft_attendance_punches: {
            select: {
              id: true,
              punch_at: true,
              punch_type: true,
              source: true,
            },
            orderBy: { punch_at: 'asc' },
          },
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  /**
   * READ: Single record by ID
   */
  async getRecordById(tenantId: string, id: string) {
    if (!this.isUuid(id)) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }

    const record = await this.prisma.rndtechnosoft_attendance_records.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        rndtechnosoft_employees: true,
        rndtechnosoft_shifts: true,
        rndtechnosoft_attendance_punches: {
          orderBy: { punch_at: 'asc' },
        },
        rndtechnosoft_attendance_adjustments: true,
      },
    });

    if (!record) {
      throw new NotFoundException(`Attendance record ${id} not found in tenant`);
    }

    return record;
  }

  /**
   * UPDATE: Specific record by ID
   */
  async updateRecord(tenantId: string, id: string, input: UpdateAttendanceRecordDto) {
    if (!this.isUuid(id)) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }

    const existing = await this.prisma.rndtechnosoft_attendance_records.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }

    if (existing.finalized_at) {
      throw new ForbiddenException(
        'Cannot update attendance record: It has been locked by finalized payroll.',
      );
    }

    const data: Record<string, any> = {};

    if (input.attendanceStatus) {
      data.attendance_status = input.attendanceStatus;
      if (input.payableMinutes === undefined) {
        switch (input.attendanceStatus) {
          case 'PRESENT':
          case 'PAID_LEAVE':
          case 'HOLIDAY':
          case 'WEEKEND':
            data.payable_minutes = 480;
            break;
          case 'HALF_DAY':
            data.payable_minutes = 240;
            break;
          case 'ABSENT':
          case 'UNPAID_LEAVE':
          default:
            data.payable_minutes = 0;
            break;
        }
      }
    }

    if (input.firstCheckInAt !== undefined) {
      data.first_check_in_at = input.firstCheckInAt ? new Date(input.firstCheckInAt) : null;
    }
    if (input.lastCheckOutAt !== undefined) {
      data.last_check_out_at = input.lastCheckOutAt ? new Date(input.lastCheckOutAt) : null;
    }
    if (input.workedMinutes !== undefined) data.worked_minutes = input.workedMinutes;
    if (input.payableMinutes !== undefined) data.payable_minutes = input.payableMinutes;
    if (input.lateMinutes !== undefined) data.late_minutes = input.lateMinutes;
    if (input.earlyDepartureMinutes !== undefined) data.early_departure_minutes = input.earlyDepartureMinutes;
    if (input.overtimeMinutes !== undefined) data.overtime_minutes = input.overtimeMinutes;
    if (input.shiftId !== undefined) data.shift_id = input.shiftId;
    if (input.source !== undefined) data.source = input.source;

    return this.prisma.rndtechnosoft_attendance_records.update({
      where: { id },
      data,
      include: {
        rndtechnosoft_employees: {
          select: {
            employee_code: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
  }

  /**
   * DELETE: Delete unfinalized attendance record
   */
  async deleteRecord(tenantId: string, id: string) {
    if (!this.isUuid(id)) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }

    const existing = await this.prisma.rndtechnosoft_attendance_records.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }

    if (existing.finalized_at) {
      throw new ForbiddenException(
        'Cannot delete attendance record: It has been locked by finalized payroll.',
      );
    }

    // Delete associated adjustments & unlink punches in transaction
    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_attendance_adjustments.deleteMany({
        where: { tenant_id: tenantId, attendance_record_id: id },
      }),
      this.prisma.rndtechnosoft_attendance_punches.updateMany({
        where: { tenant_id: tenantId, attendance_record_id: id },
        data: { attendance_record_id: null },
      }),
      this.prisma.rndtechnosoft_attendance_records.delete({
        where: { id },
      }),
    ]);

    return { message: 'Attendance record deleted successfully' };
  }

  /**
   * SUMMARY: Monthly aggregated attendance per employee
   * Directly feeds Attendance View and Payroll Run Step 1
   */
  async getAttendanceSummary(tenantId: string, month: string, employeeId?: string) {
    // month format YYYY-MM
    const parts = month.split('-');
    const year = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);

    const startDate = new Date(Date.UTC(year, m - 1, 1));
    const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
    const totalMonthDays = new Date(year, m, 0).getDate();

    // 1. Fetch active employees
    const empWhere: Record<string, any> = {
      tenant_id: tenantId,
      employee_status: 'ACTIVE',
    };

    let resolvedEmpId: string | null = null;
    if (employeeId) {
      resolvedEmpId = await this.resolveEmployeeId(tenantId, employeeId);
      if (!resolvedEmpId) {
        return {
          month,
          totalEmployees: 0,
          totalMonthDays,
          summaries: [],
        };
      }
      empWhere.id = resolvedEmpId;
    }

    const employees = await this.prisma.rndtechnosoft_employees.findMany({
      where: empWhere,
      select: {
        id: true,
        employee_code: true,
        first_name: true,
        last_name: true,
      },
      orderBy: { employee_code: 'asc' },
    });

    // 2. Fetch all records for this month
    const records = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: {
        tenant_id: tenantId,
        attendance_date: {
          gte: startDate,
          lte: endDate,
        },
        ...(resolvedEmpId ? { employee_id: resolvedEmpId } : {}),
      },
    });

    // Group records by employeeId
    const recordsByEmp: Record<string, typeof records> = {};
    for (const r of records) {
      if (!recordsByEmp[r.employee_id]) {
        recordsByEmp[r.employee_id] = [];
      }
      recordsByEmp[r.employee_id].push(r);
    }

    // 3. Aggregate stats
    const summaries = employees.map((emp) => {
      const empRecords = recordsByEmp[emp.id] || [];

      let presentDays = 0;
      let absentDays = 0;
      let halfDays = 0;
      let paidLeaveDays = 0;
      let unpaidLeaveDays = 0;
      let holidayDays = 0;
      let weekendDays = 0;
      let totalWorkedMinutes = 0;
      let totalOvertimeMinutes = 0;
      let totalLateMinutes = 0;

      for (const r of empRecords) {
        totalWorkedMinutes += r.worked_minutes;
        totalOvertimeMinutes += r.overtime_minutes;
        totalLateMinutes += r.late_minutes;

        switch (r.attendance_status) {
          case 'PRESENT':
            presentDays++;
            break;
          case 'ABSENT':
            absentDays++;
            break;
          case 'HALF_DAY':
            halfDays++;
            break;
          case 'PAID_LEAVE':
            paidLeaveDays++;
            break;
          case 'UNPAID_LEAVE':
            unpaidLeaveDays++;
            break;
          case 'HOLIDAY':
            holidayDays++;
            break;
          case 'WEEKEND':
            weekendDays++;
            break;
        }
      }

      // Calculate Loss of Pay (unpaid leave + half day loss)
      const lossOfPayDays = unpaidLeaveDays + halfDays * 0.5;
      const payableDays = Math.max(0, totalMonthDays - lossOfPayDays - absentDays);

      return {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        employeeName: `${emp.first_name} ${emp.last_name || ''}`.trim(),
        month,
        monthDays: totalMonthDays,
        recordedDays: empRecords.length,
        presentDays,
        absentDays,
        halfDays,
        paidLeaveDays,
        unpaidLeaveDays,
        lossOfPayDays,
        holidayDays,
        weekendDays,
        payableDays,
        totalWorkedMinutes,
        totalWorkedHours: +(totalWorkedMinutes / 60).toFixed(1),
        totalOvertimeMinutes,
        totalLateMinutes,
      };
    });

    return {
      month,
      totalEmployees: employees.length,
      totalMonthDays,
      summaries,
    };
  }

  /**
   * BULK MARK / INITIALIZE: Populate month attendance for all or selected employees
   */
  async bulkMarkMonth(tenantId: string, input: BulkMarkMonthDto) {
    const parts = input.month.split('-');
    const year = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);

    if (isNaN(year) || isNaN(m)) {
      throw new BadRequestException('Invalid month format. Expected YYYY-MM');
    }

    const totalDays = new Date(year, m, 0).getDate();

    // 1. Get target employees
    const empWhere: Record<string, any> = {
      tenant_id: tenantId,
      employee_status: 'ACTIVE',
    };
    if (input.employeeIds && input.employeeIds.length > 0) {
      const resolvedList: string[] = [];
      for (const eid of input.employeeIds) {
        const rid = await this.resolveEmployeeId(tenantId, eid);
        if (rid) resolvedList.push(rid);
      }
      empWhere.id = { in: resolvedList };
    }

    const employees = await this.prisma.rndtechnosoft_employees.findMany({
      where: empWhere,
      select: { id: true },
    });

    if (employees.length === 0) {
      throw new NotFoundException('No active employees found to mark attendance');
    }

    const defaultStatus = input.defaultStatus || 'PRESENT';
    const standardWorkMinutes = input.standardWorkMinutes || 480;

    // 2. Upsert records for each day of the month
    let createdOrUpdatedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const emp of employees) {
        for (let day = 1; day <= totalDays; day++) {
          const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
          const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday

          // Sundays default to WEEKEND
          const isSunday = dayOfWeek === 0;
          const status = isSunday ? 'WEEKEND' : defaultStatus;
          const payableMinutes = isSunday ? standardWorkMinutes : (status === 'PRESENT' ? standardWorkMinutes : 0);
          const workedMinutes = status === 'PRESENT' ? standardWorkMinutes : 0;

          await tx.rndtechnosoft_attendance_records.upsert({
            where: {
              tenant_id_employee_id_attendance_date: {
                tenant_id: tenantId,
                employee_id: emp.id,
                attendance_date: dateObj,
              },
            },
            create: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: emp.id,
              attendance_date: dateObj,
              attendance_status: status,
              worked_minutes: workedMinutes,
              payable_minutes: payableMinutes,
              source: 'MANUAL',
            },
            update: {
              attendance_status: status,
              worked_minutes: workedMinutes,
              payable_minutes: payableMinutes,
            },
          });

          createdOrUpdatedCount++;
        }
      }
    });

    return {
      message: `Successfully populated attendance for ${employees.length} employees across ${totalDays} days (${input.month}).`,
      employeesCount: employees.length,
      totalDays,
      recordsProcessed: createdOrUpdatedCount,
    };
  }

  /**
   * PUNCH: Clock In / Clock Out
   */
  async recordPunch(tenantId: string, input: RecordPunchInput) {
    const resolvedEmployeeId = await this.resolveEmployeeId(tenantId, input.employeeId);
    if (!resolvedEmployeeId) {
      throw new NotFoundException(`Employee ${input.employeeId} not found in tenant`);
    }

    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { id: resolvedEmployeeId, tenant_id: tenantId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${input.employeeId} not found in tenant`);
    }

    const punchAt = input.punchAt ? new Date(input.punchAt) : new Date();
    const dateStr = punchAt.toISOString().split('T')[0];
    const attendanceDate = new Date(`${dateStr}T00:00:00.000Z`);

    return this.prisma.$transaction(async (tx) => {
      // 1. Get or create daily attendance record
      let record = await tx.rndtechnosoft_attendance_records.findUnique({
        where: {
          tenant_id_employee_id_attendance_date: {
            tenant_id: tenantId,
            employee_id: resolvedEmployeeId,
            attendance_date: attendanceDate,
          },
        },
      });

      if (!record) {
        record = await tx.rndtechnosoft_attendance_records.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: resolvedEmployeeId,
            attendance_date: attendanceDate,
            attendance_status: 'PRESENT',
            first_check_in_at: input.punchType === 'IN' ? punchAt : null,
            last_check_out_at: input.punchType === 'OUT' ? punchAt : null,
            worked_minutes: 0,
            payable_minutes: 480,
            source: 'WEB',
          },
        });
      } else {
        const firstIn =
          input.punchType === 'IN'
            ? record.first_check_in_at && record.first_check_in_at < punchAt
              ? record.first_check_in_at
              : punchAt
            : record.first_check_in_at;

        const lastOut =
          input.punchType === 'OUT'
            ? record.last_check_out_at && record.last_check_out_at > punchAt
              ? record.last_check_out_at
              : punchAt
            : record.last_check_out_at;

        let workedMinutes = record.worked_minutes;
        if (firstIn && lastOut && lastOut > firstIn) {
          workedMinutes = Math.round((lastOut.getTime() - firstIn.getTime()) / (1000 * 60));
        }

        record = await tx.rndtechnosoft_attendance_records.update({
          where: { id: record.id },
          data: {
            first_check_in_at: firstIn,
            last_check_out_at: lastOut,
            worked_minutes: workedMinutes,
            attendance_status: 'PRESENT',
          },
        });
      }

      // 2. Insert immutable punch log
      const punch = await tx.rndtechnosoft_attendance_punches.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: resolvedEmployeeId,
          attendance_record_id: record.id,
          punch_at: punchAt,
          punch_type: input.punchType,
          source: input.source || 'WEB',
          device_reference: input.deviceReference || null,
          latitude: input.latitude !== undefined ? input.latitude : null,
          longitude: input.longitude !== undefined ? input.longitude : null,
        },
      });

      return { punch, record };
    });
  }

  /**
   * PUNCH HISTORY
   */
  async getPunches(tenantId: string, employeeId?: string, date?: string) {
    const where: Record<string, any> = { tenant_id: tenantId };
    if (employeeId) {
      const resolvedId = await this.resolveEmployeeId(tenantId, employeeId);
      if (!resolvedId) {
        return [];
      }
      where.employee_id = resolvedId;
    }
    if (date) {
      const d = date.split('T')[0];
      where.punch_at = {
        gte: new Date(`${d}T00:00:00.000Z`),
        lte: new Date(`${d}T23:59:59.999Z`),
      };
    }

    return this.prisma.rndtechnosoft_attendance_punches.findMany({
      where,
      orderBy: { punch_at: 'desc' },
      take: 50,
      include: {
        rndtechnosoft_employees: {
          select: {
            employee_code: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
  }

  /**
   * ADJUSTMENT: Request Regularization
   */
  async requestAdjustment(tenantId: string, input: RequestAdjustmentDto) {
    const record = await this.prisma.rndtechnosoft_attendance_records.findFirst({
      where: { id: input.attendanceRecordId, tenant_id: tenantId },
    });

    if (!record) {
      throw new NotFoundException(`Attendance record ${input.attendanceRecordId} not found`);
    }

    if (record.finalized_at) {
      throw new ForbiddenException('Cannot regularize attendance locked by finalized payroll');
    }

    return this.prisma.rndtechnosoft_attendance_adjustments.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        attendance_record_id: input.attendanceRecordId,
        requested_by_tenant_member_id: input.requestedByTenantMemberId,
        adjustment_reason: input.adjustmentReason,
        requested_values: input.requestedValues,
        adjustment_status: 'PENDING',
      },
    });
  }

  /**
   * ADJUSTMENT: Approve Regularization
   */
  async approveAdjustment(tenantId: string, adjustmentId: string, approverTenantMemberId: string) {
    const adj = await this.prisma.rndtechnosoft_attendance_adjustments.findFirst({
      where: { id: adjustmentId, tenant_id: tenantId },
      include: { rndtechnosoft_attendance_records: true },
    });

    if (!adj) {
      throw new NotFoundException(`Adjustment ${adjustmentId} not found`);
    }

    if (adj.adjustment_status !== 'PENDING') {
      throw new BadRequestException(`Adjustment is already ${adj.adjustment_status}`);
    }

    const requested = adj.requested_values as Record<string, any>;

    return this.prisma.$transaction(async (tx) => {
      // 1. Update the record
      const updateData: Record<string, any> = {};
      if (requested.attendanceStatus) updateData.attendance_status = requested.attendanceStatus;
      if (requested.firstCheckInAt) updateData.first_check_in_at = new Date(requested.firstCheckInAt);
      if (requested.lastCheckOutAt) updateData.last_check_out_at = new Date(requested.lastCheckOutAt);
      if (requested.workedMinutes !== undefined) updateData.worked_minutes = requested.workedMinutes;
      if (requested.payableMinutes !== undefined) updateData.payable_minutes = requested.payableMinutes;

      if (Object.keys(updateData).length > 0) {
        await tx.rndtechnosoft_attendance_records.update({
          where: { id: adj.attendance_record_id },
          data: updateData,
        });
      }

      // 2. Mark adjustment approved
      return tx.rndtechnosoft_attendance_adjustments.update({
        where: { id: adjustmentId },
        data: {
          adjustment_status: 'APPROVED',
          approved_by_tenant_member_id: approverTenantMemberId,
          approved_at: new Date(),
        },
      });
    });
  }

  /**
   * SEED: Seed realistic attendance for active employees for a given month
   */
  async seedTenantAttendance(tenantId: string, month = '2026-10') {
    const parts = month.split('-');
    const year = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);

    const totalDays = new Date(year, m, 0).getDate();

    const employees = await this.prisma.rndtechnosoft_employees.findMany({
      where: { tenant_id: tenantId, employee_status: 'ACTIVE' },
      select: { id: true, employee_code: true, first_name: true, last_name: true },
    });

    if (employees.length === 0) {
      throw new NotFoundException('No active employees found in tenant to seed attendance');
    }

    let recordsCreated = 0;
    let punchesCreated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const [idx, emp] of employees.entries()) {
        for (let day = 1; day <= totalDays; day++) {
          const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
          const dow = dateObj.getUTCDay(); // 0 = Sun, 6 = Sat

          let status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'PAID_LEAVE' | 'UNPAID_LEAVE' | 'HOLIDAY' | 'WEEKEND';
          let firstIn: Date | null = null;
          let lastOut: Date | null = null;
          let workedMinutes = 0;
          let payableMinutes = 0;

          if (dow === 0) {
            status = 'WEEKEND';
            payableMinutes = 480;
          } else if (day === 2) {
            // Gandhi Jayanti
            status = 'HOLIDAY';
            payableMinutes = 480;
          } else if ((idx === 0 && day === 12) || (idx === 1 && day === 15)) {
            // Paid leave for employee 0 on 12th, employee 1 on 15th
            status = 'PAID_LEAVE';
            payableMinutes = 480;
          } else if (idx === 2 && (day === 8 || day === 9)) {
            // Loss of Pay (LOP) for employee 2 on 8th and 9th
            status = 'UNPAID_LEAVE';
            payableMinutes = 0;
          } else if (idx === 3 && day === 14) {
            // Half day for employee 3 on 14th
            status = 'HALF_DAY';
            payableMinutes = 240;
            firstIn = new Date(`${dateStr}T09:30:00.000Z`);
            lastOut = new Date(`${dateStr}T13:30:00.000Z`);
            workedMinutes = 240;
          } else {
            // Standard Present day
            status = 'PRESENT';
            payableMinutes = 480;
            const checkInHour = 9;
            const checkInMin = (day * 3) % 20; // 09:00 to 09:18
            const checkOutHour = 18;
            const checkOutMin = (day * 4) % 30; // 18:00 to 18:28

            firstIn = new Date(
              `${dateStr}T${String(checkInHour).padStart(2, '0')}:${String(checkInMin).padStart(2, '0')}:00.000Z`,
            );
            lastOut = new Date(
              `${dateStr}T${String(checkOutHour).padStart(2, '0')}:${String(checkOutMin).padStart(2, '0')}:00.000Z`,
            );
            workedMinutes = Math.round((lastOut.getTime() - firstIn.getTime()) / (1000 * 60));
          }

          const record = await tx.rndtechnosoft_attendance_records.upsert({
            where: {
              tenant_id_employee_id_attendance_date: {
                tenant_id: tenantId,
                employee_id: emp.id,
                attendance_date: dateObj,
              },
            },
            create: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: emp.id,
              attendance_date: dateObj,
              attendance_status: status,
              first_check_in_at: firstIn,
              last_check_out_at: lastOut,
              worked_minutes: workedMinutes,
              payable_minutes: payableMinutes,
              source: 'SYSTEM',
            },
            update: {
              attendance_status: status,
              first_check_in_at: firstIn,
              last_check_out_at: lastOut,
              worked_minutes: workedMinutes,
              payable_minutes: payableMinutes,
            },
          });

          recordsCreated++;

          // Create IN and OUT punches if check-in occurred
          if (firstIn && lastOut) {
            await tx.rndtechnosoft_attendance_punches.createMany({
              data: [
                {
                  id: randomUUID(),
                  tenant_id: tenantId,
                  employee_id: emp.id,
                  attendance_record_id: record.id,
                  punch_at: firstIn,
                  punch_type: 'IN',
                  source: 'BIOMETRIC',
                  device_reference: 'FRONT_OFFICE_BIO_01',
                },
                {
                  id: randomUUID(),
                  tenant_id: tenantId,
                  employee_id: emp.id,
                  attendance_record_id: record.id,
                  punch_at: lastOut,
                  punch_type: 'OUT',
                  source: 'BIOMETRIC',
                  device_reference: 'FRONT_OFFICE_BIO_01',
                },
              ],
            });
            punchesCreated += 2;
          }
        }
      }
    });

    return {
      message: `Seeded attendance for ${employees.length} employees (${month}).`,
      employeesCount: employees.length,
      recordsCreated,
      punchesCreated,
    };
  }
}
