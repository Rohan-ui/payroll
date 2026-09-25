import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface TimeSessionDto {
  clockIn: string; // HH:MM or ISO
  clockOut?: string; // HH:MM or ISO
}

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
  notes?: string;
  breakMinutes?: number;
  remoteMinutes?: number;
  sessions?: TimeSessionDto[];
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

    let firstIn = input.firstCheckInAt ? new Date(input.firstCheckInAt) : existing?.first_check_in_at;
    let lastOut = input.lastCheckOutAt ? new Date(input.lastCheckOutAt) : existing?.last_check_out_at;

    let parsedSessions: Array<{ inDate: Date; outDate: Date | null }> = [];
    let grossSessionMinutes = 0;

    if (input.sessions && input.sessions.length > 0) {
      const validSessions = input.sessions.filter((s) => s && s.clockIn);
      if (validSessions.length > 0) {
        parsedSessions = validSessions.map((s) => {
          const inDate = s.clockIn.includes('T')
            ? new Date(s.clockIn)
            : new Date(`${dateOnlyStr}T${s.clockIn}:00+05:30`);
          const outDate = s.clockOut
            ? s.clockOut.includes('T')
              ? new Date(s.clockOut)
              : new Date(`${dateOnlyStr}T${s.clockOut}:00+05:30`)
            : null;
          return { inDate, outDate };
        });

        parsedSessions.sort((a, b) => a.inDate.getTime() - b.inDate.getTime());
        firstIn = parsedSessions[0].inDate;

        const sessionsWithOut = parsedSessions.filter((s) => s.outDate);
        if (sessionsWithOut.length > 0) {
          lastOut = sessionsWithOut[sessionsWithOut.length - 1].outDate;
        }

        grossSessionMinutes = parsedSessions.reduce((sum, s) => {
          if (s.outDate && s.outDate > s.inDate) {
            return sum + Math.round((s.outDate.getTime() - s.inDate.getTime()) / (1000 * 60));
          }
          return sum;
        }, 0);
      }
    }

    let workedMinutes = input.workedMinutes;
    if (workedMinutes === undefined) {
      const breakDeduction = input.breakMinutes && input.breakMinutes > 0 ? input.breakMinutes : 0;
      const overtimeAddition = input.overtimeMinutes && input.overtimeMinutes > 0 ? input.overtimeMinutes : 0;

      if (parsedSessions.length > 0) {
        workedMinutes = Math.max(0, grossSessionMinutes - breakDeduction + overtimeAddition);
      } else if (firstIn && lastOut && lastOut > firstIn) {
        const grossElapsed = Math.round((lastOut.getTime() - firstIn.getTime()) / (1000 * 60));
        workedMinutes = Math.max(0, grossElapsed - breakDeduction + overtimeAddition);
      } else {
        workedMinutes = input.attendanceStatus === 'PRESENT' ? standardDayMinutes : 0;
      }
    }

    const effectiveSource = input.remoteMinutes && input.remoteMinutes > 0
      ? (input.source || 'REMOTE')
      : (input.source ?? 'MANUAL');

    let savedRecord;
    if (existing) {
      savedRecord = await this.prisma.rndtechnosoft_attendance_records.update({
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
          source: effectiveSource,
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
    } else {
      savedRecord = await this.prisma.rndtechnosoft_attendance_records.create({
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
          source: effectiveSource,
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

    // Sync punches for all sessions or fallback single punch
    if (parsedSessions.length > 0) {
      // Remove previous punches for this record to maintain clean synchronization
      await this.prisma.rndtechnosoft_attendance_punches.deleteMany({
        where: {
          tenant_id: tenantId,
          attendance_record_id: savedRecord.id,
        },
      });

      // Insert an IN punch and optional OUT punch for each session
      for (const s of parsedSessions) {
        await this.prisma.rndtechnosoft_attendance_punches.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: resolvedEmployeeId,
            attendance_record_id: savedRecord.id,
            punch_at: s.inDate,
            punch_type: 'IN',
            source: effectiveSource,
          },
        });

        if (s.outDate) {
          await this.prisma.rndtechnosoft_attendance_punches.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: resolvedEmployeeId,
              attendance_record_id: savedRecord.id,
              punch_at: s.outDate,
              punch_type: 'OUT',
              source: effectiveSource,
            },
          });
        }
      }
    } else {
      if (firstIn) {
        const existingInPunch = await this.prisma.rndtechnosoft_attendance_punches.findFirst({
          where: {
            tenant_id: tenantId,
            employee_id: resolvedEmployeeId,
            attendance_record_id: savedRecord.id,
            punch_type: 'IN',
          },
        });
        if (!existingInPunch) {
          await this.prisma.rndtechnosoft_attendance_punches.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: resolvedEmployeeId,
              attendance_record_id: savedRecord.id,
              punch_at: firstIn,
              punch_type: 'IN',
              source: effectiveSource,
            },
          });
        } else {
          await this.prisma.rndtechnosoft_attendance_punches.update({
            where: { id: existingInPunch.id },
            data: { punch_at: firstIn, source: effectiveSource },
          });
        }
      }

      if (lastOut) {
        const existingOutPunch = await this.prisma.rndtechnosoft_attendance_punches.findFirst({
          where: {
            tenant_id: tenantId,
            employee_id: resolvedEmployeeId,
            attendance_record_id: savedRecord.id,
            punch_type: 'OUT',
          },
        });
        if (!existingOutPunch) {
          await this.prisma.rndtechnosoft_attendance_punches.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: resolvedEmployeeId,
              attendance_record_id: savedRecord.id,
              punch_at: lastOut,
              punch_type: 'OUT',
              source: effectiveSource,
            },
          });
        } else {
          await this.prisma.rndtechnosoft_attendance_punches.update({
            where: { id: existingOutPunch.id },
            data: { punch_at: lastOut, source: effectiveSource },
          });
        }
      }
    }

    // Record adjustment audit if notes were entered
    if (input.notes) {
      const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
        where: { tenant_id: tenantId },
      });
      if (member) {
        await this.prisma.rndtechnosoft_attendance_adjustments.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            attendance_record_id: savedRecord.id,
            requested_by_tenant_member_id: member.id,
            approved_by_tenant_member_id: member.id,
            adjustment_reason: input.notes,
            adjustment_status: 'APPROVED',
            approved_at: new Date(),
            requested_values: {
              firstCheckInAt: input.firstCheckInAt,
              lastCheckOutAt: input.lastCheckOutAt,
              workedMinutes,
              breakMinutes: input.breakMinutes,
              overtimeMinutes: input.overtimeMinutes,
              remoteMinutes: input.remoteMinutes,
              source: effectiveSource,
              notes: input.notes,
            },
          },
        });
      }
    }

    return savedRecord;
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
        // Composite [tenant_id, id] key: the database refuses a write against
        // another tenant's record even if the id is guessed.
        where: { tenant_id_id: { tenant_id: tenantId, id: adjustmentId } },
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
      // 1. Clean existing records and punches for this month and tenant to avoid conflicts
      const startDate = new Date(`${year}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
      const endDate = new Date(`${year}-${String(m).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}T23:59:59.999Z`);

      const existingRecords = await tx.rndtechnosoft_attendance_records.findMany({
        where: {
          tenant_id: tenantId,
          attendance_date: { gte: startDate, lte: endDate },
        },
        select: { id: true },
      });

      if (existingRecords.length > 0) {
        const recordIds = existingRecords.map((r) => r.id);
        await tx.rndtechnosoft_attendance_punches.deleteMany({
          where: { tenant_id: tenantId, attendance_record_id: { in: recordIds } },
        });
        await tx.rndtechnosoft_attendance_adjustments.deleteMany({
          where: { tenant_id: tenantId, attendance_record_id: { in: recordIds } },
        });
        await tx.rndtechnosoft_attendance_records.deleteMany({
          where: { id: { in: recordIds } },
        });
      }

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
          let overtimeMinutes = 0;

          // 1. Sundays
          if (dow === 0) {
            status = 'WEEKEND';
            payableMinutes = 480;
          }
          // 2. Second and Fourth Saturdays
          else if (dow === 6 && ((day > 7 && day <= 14) || (day > 21 && day <= 28))) {
            status = 'WEEKEND';
            payableMinutes = 480;
          }
          // 3. Indian Holidays (Gandhi Jayanti Oct 2, Dussehra Oct 20)
          else if (day === 2 || day === 20) {
            status = 'HOLIDAY';
            payableMinutes = 480;
          }
          // 4. Paid Leave days (Casual & Earned Leave)
          else if (day === 6 || (idx % 2 === 1 && day === 15) || (idx % 2 === 0 && day === 26)) {
            status = 'PAID_LEAVE';
            payableMinutes = 480;
          }
          // 5. Half Day (Morning)
          else if (day === 7 || (idx % 2 === 1 && day === 21)) {
            status = 'HALF_DAY';
            payableMinutes = 240;
            workedMinutes = 240;
            firstIn = new Date(`${dateStr}T09:30:00.000Z`);
            lastOut = new Date(`${dateStr}T13:30:00.000Z`);
          }
          // 6. Half Day (Afternoon)
          else if (day === 14) {
            status = 'HALF_DAY';
            payableMinutes = 240;
            workedMinutes = 270;
            firstIn = new Date(`${dateStr}T14:00:00.000Z`);
            lastOut = new Date(`${dateStr}T18:30:00.000Z`);
          }
          // 7. Unpaid Leave (Loss of Pay)
          else if (day === 16) {
            status = 'UNPAID_LEAVE';
            payableMinutes = 0;
            workedMinutes = 0;
          }
          // 8. Absent (Unapproved Absence)
          else if (day === 22) {
            status = 'ABSENT';
            payableMinutes = 0;
            workedMinutes = 0;
          }
          // 9. Standard Present Days (with varied times, overtime, and punches)
          else {
            status = 'PRESENT';
            payableMinutes = 480;

            const checkInM = 10 + (day * 3) % 25; // 09:10 to 09:34
            const checkOutM = 25 + (day * 7) % 40; // 18:25 to 19:04

            if (day === 9 || day === 19) {
              overtimeMinutes = day === 9 ? 90 : 60;
            }

            const checkOutH = overtimeMinutes > 0 ? 19 + Math.floor(overtimeMinutes / 60) : 18;
            const checkOutActualM = (checkOutM + (overtimeMinutes % 60)) % 60;

            firstIn = new Date(`${dateStr}T09:${String(checkInM).padStart(2, '0')}:00.000Z`);
            lastOut = new Date(
              `${dateStr}T${String(checkOutH).padStart(2, '0')}:${String(checkOutActualM).padStart(2, '0')}:00.000Z`
            );
            const gross = Math.round((lastOut.getTime() - firstIn.getTime()) / (1000 * 60));
            workedMinutes = Math.max(0, gross - 60 + overtimeMinutes);
          }

          const record = await tx.rndtechnosoft_attendance_records.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: emp.id,
              attendance_date: dateObj,
              attendance_status: status,
              first_check_in_at: firstIn,
              last_check_out_at: lastOut,
              worked_minutes: workedMinutes,
              payable_minutes: payableMinutes,
              overtime_minutes: overtimeMinutes,
              source: 'BIOMETRIC',
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

  /**
   * READ: Active shifts configured for tenant
   */
  async getShifts(tenantId: string) {
    const shifts = await this.prisma.rndtechnosoft_shifts.findMany({
      where: { tenant_id: tenantId, shift_status: 'ACTIVE' },
      include: {
        rndtechnosoft_shift_breaks: true,
      },
      orderBy: { created_at: 'asc' },
    });

    if (shifts.length === 0) {
      return [
        {
          id: 'default-general-shift',
          tenant_id: tenantId,
          shift_code: 'GEN_0930_1830',
          shift_name: 'General Day Shift (09:30 AM - 06:30 PM)',
          start_time: '09:30:00',
          end_time: '18:30:00',
          standard_work_minutes: 480,
          grace_in_minutes: 15,
          grace_out_minutes: 15,
          shift_status: 'ACTIVE',
          rndtechnosoft_shift_breaks: [
            {
              id: 'default-break-lunch',
              break_name: 'Standard Lunch Break',
              break_duration_minutes: 60,
              is_paid_break: false,
            },
          ],
        },
      ];
    }

    return shifts;
  }

  /**
   * Helper: Check if date is a holiday or weekly off
   */
  async checkDateSpecial(tenantId: string, dateStr: string): Promise<{ isHoliday: boolean; holidayName?: string; isWeeklyOff: boolean }> {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dow = targetDate.getUTCDay();
    const isWeeklyOff = dow === 0;

    const KNOWN_HOLIDAYS_2026: Record<string, string> = {
      '2026-01-26': 'Republic Day',
      '2026-03-03': 'Holi',
      '2026-03-21': 'Eid-ul-Fitr',
      '2026-04-14': 'Ambedkar Jayanti',
      '2026-05-01': 'May Day',
      '2026-08-15': 'Independence Day',
      '2026-08-28': 'Raksha Bandhan',
      '2026-09-04': 'Janmashtami',
      '2026-10-02': 'Gandhi Jayanti',
      '2026-10-20': 'Dussehra (Vijayadashami)',
      '2026-11-08': 'Diwali (Deepavali)',
      '2026-11-09': 'Govardhan Puja',
      '2026-11-24': 'Guru Nanak Jayanti',
      '2026-12-25': 'Christmas Day',
    };

    const dbHoliday = await this.prisma.rndtechnosoft_holidays.findFirst({
      where: {
        tenant_id: tenantId,
        holiday_date: targetDate,
      },
    });

    if (dbHoliday) {
      return { isHoliday: true, holidayName: dbHoliday.holiday_name, isWeeklyOff };
    }

    if (KNOWN_HOLIDAYS_2026[dateStr]) {
      return { isHoliday: true, holidayName: KNOWN_HOLIDAYS_2026[dateStr], isWeeklyOff };
    }

    return { isHoliday: false, isWeeklyOff };
  }

  /**
   * 1. GET /attendance/department-summary?date=YYYY-MM-DD
   * Computes per-department + overall metrics, headcount, status counts, attendance %, and 7-day trend.
   */
  async getDepartmentSummary(tenantId: string, dateStr: string) {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
    }

    const { isHoliday, holidayName, isWeeklyOff } = await this.checkDateSpecial(tenantId, dateStr);

    // Fetch active employees with department info
    const employees = await this.prisma.rndtechnosoft_employees.findMany({
      where: { tenant_id: tenantId, employee_status: 'ACTIVE' },
      select: {
        id: true,
        employee_code: true,
        first_name: true,
        last_name: true,
        rndtechnosoft_employee_employments: {
          orderBy: { effective_from: 'desc' },
          take: 1,
          include: {
            rndtechnosoft_departments: true,
          },
        },
      },
    });

    // Fetch configured departments
    const allDepartments = await this.prisma.rndtechnosoft_departments.findMany({
      where: { tenant_id: tenantId, department_status: 'ACTIVE' },
      orderBy: { department_name: 'asc' },
    });

    // Determine 7-day trend date range (6 days before targetDate up to targetDate)
    const trendDates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(targetDate);
      d.setUTCDate(d.getUTCDate() - i);
      trendDates.push(d.toISOString().slice(0, 10));
    }

    const trendStartDate = new Date(`${trendDates[0]}T00:00:00.000Z`);
    const trendEndDate = new Date(`${trendDates[trendDates.length - 1]}T23:59:59.999Z`);

    // Fetch attendance records across 7-day trend window
    const trendRecords = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: {
        tenant_id: tenantId,
        attendance_date: { gte: trendStartDate, lte: trendEndDate },
      },
      select: {
        employee_id: true,
        attendance_date: true,
        attendance_status: true,
        late_minutes: true,
      },
    });

    // Fast lookup: `${employeeId}_${dateStr}` -> record
    const recordLookup = new Map<string, (typeof trendRecords)[0]>();
    for (const r of trendRecords) {
      const dStr = r.attendance_date.toISOString().slice(0, 10);
      recordLookup.set(`${r.employee_id}_${dStr}`, r);
    }

    // Helper to calculate attendance stats for a set of employee IDs on a given date
    const calcStatsForDate = (empIds: string[], dStr: string, isDateOff: boolean) => {
      let present = 0;
      let absent = 0;
      let halfDay = 0;
      let leave = 0;
      let late = 0;

      for (const empId of empIds) {
        const rec = recordLookup.get(`${empId}_${dStr}`);
        if (rec) {
          if (rec.attendance_status === 'PRESENT') present++;
          else if (rec.attendance_status === 'HALF_DAY') halfDay++;
          else if (rec.attendance_status === 'ABSENT') absent++;
          else if (rec.attendance_status === 'PAID_LEAVE' || rec.attendance_status === 'UNPAID_LEAVE') leave++;
          else if (rec.attendance_status === 'HOLIDAY' || rec.attendance_status === 'WEEKEND') {
            // non-working day record
          }

          if (rec.late_minutes > 0) late++;
        } else {
          // If no record exists
          if (!isDateOff) absent++;
        }
      }

      const total = empIds.length;
      let attendancePct: number | null = null;
      if (!isDateOff && total > 0) {
        attendancePct = Math.round(((present + 0.5 * halfDay) / total) * 100);
      }

      return { total, present, absent, halfDay, leave, late, attendancePct };
    };

    // Calculate 7-day trend for any employee subset
    const compute7DayTrend = async (empIds: string[]) => {
      const trend: Array<{ date: string; dayName: string; attendancePct: number | null; isOff: boolean }> = [];
      for (const dStr of trendDates) {
        const { isHoliday: h, isWeeklyOff: w } = await this.checkDateSpecial(tenantId, dStr);
        const isOff = h || w;
        const dObj = new Date(`${dStr}T00:00:00.000Z`);
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dObj.getUTCDay()];
        const stats = calcStatsForDate(empIds, dStr, isOff);
        trend.push({
          date: dStr,
          dayName,
          attendancePct: stats.attendancePct,
          isOff,
        });
      }
      return trend;
    };

    const allEmpIds = employees.map((e) => e.id);
    const overallIsOff = isHoliday || isWeeklyOff;
    const overallStats = calcStatsForDate(allEmpIds, dateStr, overallIsOff);
    const overallTrend = await compute7DayTrend(allEmpIds);

    // Group employees by department
    const empByDept = new Map<string, string[]>();
    for (const emp of employees) {
      const deptId = emp.rndtechnosoft_employee_employments[0]?.rndtechnosoft_departments?.id || 'unassigned';
      if (!empByDept.has(deptId)) empByDept.set(deptId, []);
      empByDept.get(deptId)!.push(emp.id);
    }

    // Build department card array
    const deptCards = [];
    // Ensure all active departments from DB are included (even if 0 headcount)
    for (const d of allDepartments) {
      const empIds = empByDept.get(d.id) || [];
      const stats = calcStatsForDate(empIds, dateStr, overallIsOff);
      const trend = await compute7DayTrend(empIds);

      // Stacked bar percentages
      const headcount = empIds.length;
      const presentPct = headcount > 0 ? Math.round((stats.present / headcount) * 100) : 0;
      const halfDayPct = headcount > 0 ? Math.round((stats.halfDay / headcount) * 100) : 0;
      const leavePct = headcount > 0 ? Math.round((stats.leave / headcount) * 100) : 0;
      const absentPct = headcount > 0 ? Math.max(0, 100 - presentPct - halfDayPct - leavePct) : 0;

      deptCards.push({
        departmentId: d.id,
        departmentName: d.department_name,
        departmentCode: d.department_code,
        headcount,
        presentCount: stats.present,
        absentCount: stats.absent,
        halfDayCount: stats.halfDay,
        leaveCount: stats.leave,
        lateCount: stats.late,
        attendancePct: stats.attendancePct,
        presentPct,
        halfDayPct,
        leavePct,
        absentPct,
        trend7Days: trend,
      });
    }

    // Include unassigned employees if any
    const unassignedEmpIds = empByDept.get('unassigned') || [];
    if (unassignedEmpIds.length > 0) {
      const stats = calcStatsForDate(unassignedEmpIds, dateStr, overallIsOff);
      const trend = await compute7DayTrend(unassignedEmpIds);
      const headcount = unassignedEmpIds.length;
      deptCards.push({
        departmentId: 'unassigned',
        departmentName: 'General / Operations',
        departmentCode: 'GEN',
        headcount,
        presentCount: stats.present,
        absentCount: stats.absent,
        halfDayCount: stats.halfDay,
        leaveCount: stats.leave,
        lateCount: stats.late,
        attendancePct: stats.attendancePct,
        presentPct: headcount > 0 ? Math.round((stats.present / headcount) * 100) : 0,
        halfDayPct: headcount > 0 ? Math.round((stats.halfDay / headcount) * 100) : 0,
        leavePct: headcount > 0 ? Math.round((stats.leave / headcount) * 100) : 0,
        absentPct: headcount > 0 ? Math.round((stats.absent / headcount) * 100) : 0,
        trend7Days: trend,
      });
    }

    return {
      date: dateStr,
      isHoliday,
      holidayName: holidayName || null,
      isWeeklyOff,
      overall: {
        headcount: allEmpIds.length,
        presentCount: overallStats.present,
        absentCount: overallStats.absent,
        halfDayCount: overallStats.halfDay,
        leaveCount: overallStats.leave,
        lateCount: overallStats.late,
        attendancePct: overallStats.attendancePct,
        trend7Days: overallTrend,
      },
      departments: deptCards,
    };
  }

  /**
   * 2. GET /attendance/employee-day-list
   * Returns employees with status on date, MonthStrip days, and 14-day MiniBars
   */
  async getEmployeeDayList(
    tenantId: string,
    dateStr: string,
    departmentId?: string,
    search?: string,
    page = 1,
    limit = 50,
  ) {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    const monthStr = dateStr.slice(0, 7);
    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthNumStr, 10);
    const totalMonthDays = new Date(year, monthNum, 0).getDate();

    const monthStartDate = new Date(`${monthStr}-01T00:00:00.000Z`);
    const monthEndDate = new Date(`${monthStr}-${String(totalMonthDays).padStart(2, '0')}T23:59:59.999Z`);

    // Fetch active employees with search & department filter
    const employees = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        employee_status: 'ACTIVE',
        ...(search
          ? {
              OR: [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { employee_code: { contains: search, mode: 'insensitive' } },
                { work_email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        employee_code: true,
        first_name: true,
        last_name: true,
        work_email: true,
        rndtechnosoft_employee_employments: {
          orderBy: { effective_from: 'desc' },
          take: 1,
          include: {
            rndtechnosoft_departments: true,
            rndtechnosoft_designations: true,
          },
        },
      },
      orderBy: { employee_code: 'asc' },
    });

    // Filter by department in memory if departmentId provided
    const filteredEmployees = departmentId
      ? employees.filter((e) => {
          const empDeptId = e.rndtechnosoft_employee_employments[0]?.rndtechnosoft_departments?.id;
          return empDeptId === departmentId || (departmentId === 'unassigned' && !empDeptId);
        })
      : employees;

    const total = filteredEmployees.length;
    const startIndex = (page - 1) * limit;
    const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + limit);
    const empIds = paginatedEmployees.map((e) => e.id);

    // Fetch all records for these employees for this month
    const monthRecords = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: {
        tenant_id: tenantId,
        employee_id: { in: empIds },
        attendance_date: { gte: monthStartDate, lte: monthEndDate },
      },
    });

    // Group records by employeeId -> dateStr
    const recordsMap = new Map<string, Map<string, (typeof monthRecords)[0]>>();
    for (const r of monthRecords) {
      if (!recordsMap.has(r.employee_id)) {
        recordsMap.set(r.employee_id, new Map());
      }
      const d = r.attendance_date.toISOString().slice(0, 10);
      recordsMap.get(r.employee_id)!.set(d, r);
    }

    // Determine 14 days up to dateStr
    const last14Dates: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(targetDate);
      d.setUTCDate(d.getUTCDate() - i);
      last14Dates.push(d.toISOString().slice(0, 10));
    }

    const items = paginatedEmployees.map((emp) => {
      const empRecords = recordsMap.get(emp.id) || new Map();
      const currentDayRec = empRecords.get(dateStr);

      const dept = emp.rndtechnosoft_employee_employments[0]?.rndtechnosoft_departments;
      const desig = emp.rndtechnosoft_employee_employments[0]?.rndtechnosoft_designations;

      // Month stats calculation
      let presentDays = 0;
      let halfDays = 0;
      let workingDays = 0;

      const monthDays = [];
      for (let day = 1; day <= totalMonthDays; day++) {
        const dStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        const dObj = new Date(`${dStr}T00:00:00.000Z`);
        const dow = dObj.getUTCDay();
        const isWeekend = dow === 0;
        const isHoliday = false; // standard

        if (!isWeekend && !isHoliday) workingDays++;

        const r = empRecords.get(dStr);
        let status = isWeekend ? 'WEEKEND' : 'ABSENT';
        let workedMinutes = 0;
        let isLate = false;

        if (r) {
          status = r.attendance_status;
          workedMinutes = r.worked_minutes;
          isLate = r.late_minutes > 0;
          if (status === 'PRESENT') presentDays++;
          else if (status === 'HALF_DAY') halfDays++;
        }

        monthDays.push({
          day,
          date: dStr,
          status,
          workedMinutes,
          isLate,
        });
      }

      const monthAttendancePct = workingDays > 0 ? Math.round(((presentDays + 0.5 * halfDays) / workingDays) * 100) : 0;

      // 14-day mini bars data
      const last14Days = last14Dates.map((dStr) => {
        const r = empRecords.get(dStr);
        const dayNum = parseInt(dStr.slice(8, 10), 10);
        return {
          date: dStr,
          day: dayNum,
          workedMinutes: r ? r.worked_minutes : 0,
          status: r ? r.attendance_status : 'ABSENT',
        };
      });

      const inTime = currentDayRec?.first_check_in_at
        ? new Date(currentDayRec.first_check_in_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : null;

      const outTime = currentDayRec?.last_check_out_at
        ? new Date(currentDayRec.last_check_out_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : null;

      return {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        fullName: `${emp.first_name} ${emp.last_name || ''}`.trim(),
        roleName: desig?.designation_name || 'Staff Member',
        departmentId: dept?.id || 'unassigned',
        departmentName: dept?.department_name || 'General / Operations',
        dayStatus: currentDayRec ? currentDayRec.attendance_status : 'ABSENT',
        inTime,
        outTime,
        workedMinutes: currentDayRec ? currentDayRec.worked_minutes : 0,
        lateMinutes: currentDayRec ? currentDayRec.late_minutes : 0,
        isLate: currentDayRec ? currentDayRec.late_minutes > 0 : false,
        monthAttendancePct,
        monthDays,
        last14Days,
      };
    });

    return {
      total,
      page,
      limit,
      items,
    };
  }

  /**
   * 3. GET /attendance/roster-matrix?month=YYYY-MM&departmentId=&search=&selectedDate=YYYY-MM-DD
   * Computes matrix grouped by department, status glyphs, top 4 KPIs, and department leaderboard
   */
  async getRosterMatrix(
    tenantId: string,
    monthStr: string,
    departmentId?: string,
    search?: string,
    selectedDateStr?: string,
  ) {
    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthNumStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const monthStartDate = new Date(`${monthStr}-01T00:00:00.000Z`);
    const monthEndDate = new Date(`${monthStr}-${String(daysInMonth).padStart(2, '0')}T23:59:59.999Z`);

    // Prepare days header
    const daysHeader = [];
    const weekdayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${monthStr}-${String(day).padStart(2, '0')}`;
      const dObj = new Date(`${dStr}T00:00:00.000Z`);
      const dow = dObj.getUTCDay();
      const { isHoliday, holidayName, isWeeklyOff } = await this.checkDateSpecial(tenantId, dStr);

      daysHeader.push({
        day,
        date: dStr,
        weekday: weekdayInitials[dow],
        isWeekend: isWeeklyOff,
        isHoliday,
        holidayName: holidayName || null,
      });
    }

    // Fetch active employees
    const employees = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        employee_status: 'ACTIVE',
        ...(search
          ? {
              OR: [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { employee_code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        employee_code: true,
        first_name: true,
        last_name: true,
        rndtechnosoft_employee_employments: {
          orderBy: { effective_from: 'desc' },
          take: 1,
          include: {
            rndtechnosoft_departments: true,
            rndtechnosoft_designations: true,
          },
        },
      },
      orderBy: { employee_code: 'asc' },
    });

    const filteredEmployees = departmentId
      ? employees.filter((e) => {
          const dId = e.rndtechnosoft_employee_employments[0]?.rndtechnosoft_departments?.id;
          return dId === departmentId || (departmentId === 'unassigned' && !dId);
        })
      : employees;

    const allEmpIds = filteredEmployees.map((e) => e.id);

    // Fetch all records for month
    const records = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: {
        tenant_id: tenantId,
        employee_id: { in: allEmpIds },
        attendance_date: { gte: monthStartDate, lte: monthEndDate },
      },
    });

    // Lookup: employeeId -> dateStr -> record
    const recordMap = new Map<string, Map<string, (typeof records)[0]>>();
    for (const r of records) {
      if (!recordMap.has(r.employee_id)) recordMap.set(r.employee_id, new Map());
      const dStr = r.attendance_date.toISOString().slice(0, 10);
      recordMap.get(r.employee_id)!.set(dStr, r);
    }

    // Top 4 KPIs for selectedDateStr (or monthStr-01)
    const kpiTargetDate = selectedDateStr || `${monthStr}-01`;
    let kpiPresent = 0;
    let kpiAbsent = 0;
    let kpiLeave = 0;
    let kpiLate = 0;

    for (const emp of filteredEmployees) {
      const rec = recordMap.get(emp.id)?.get(kpiTargetDate);
      if (rec) {
        if (rec.attendance_status === 'PRESENT') kpiPresent++;
        else if (rec.attendance_status === 'HALF_DAY') {
          kpiPresent++;
        } else if (rec.attendance_status === 'ABSENT') kpiAbsent++;
        else if (rec.attendance_status === 'PAID_LEAVE' || rec.attendance_status === 'UNPAID_LEAVE') kpiLeave++;

        if (rec.late_minutes > 0) kpiLate++;
      } else {
        kpiAbsent++;
      }
    }

    // Group employees by department
    const deptGroups = new Map<string, { departmentId: string; departmentName: string; employees: any[] }>();

    for (const emp of filteredEmployees) {
      const dept = emp.rndtechnosoft_employee_employments[0]?.rndtechnosoft_departments;
      const desig = emp.rndtechnosoft_employee_employments[0]?.rndtechnosoft_designations;
      const deptId = dept?.id || 'unassigned';
      const deptName = dept?.department_name || 'General / Operations';

      if (!deptGroups.has(deptId)) {
        deptGroups.set(deptId, {
          departmentId: deptId,
          departmentName: deptName,
          employees: [],
        });
      }

      const empRecs = recordMap.get(emp.id) || new Map();
      let presentDays = 0;
      let halfDays = 0;
      let workingDays = 0;

      const days = daysHeader.map((hdr) => {
        if (!hdr.isWeekend && !hdr.isHoliday) workingDays++;
        const r = empRecs.get(hdr.date);

        let status = hdr.isHoliday ? 'HOLIDAY' : hdr.isWeekend ? 'WEEKEND' : 'ABSENT';
        let glyph = hdr.isHoliday ? 'H' : hdr.isWeekend ? 'W' : '×';
        let workedHours = 0;
        let isLate = false;
        let inTime: string | null = null;
        let outTime: string | null = null;
        let source = 'SYSTEM';

        if (r) {
          status = r.attendance_status;
          workedHours = +(r.worked_minutes / 60).toFixed(1);
          isLate = r.late_minutes > 0;
          source = r.source;

          if (r.first_check_in_at) {
            inTime = new Date(r.first_check_in_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          }
          if (r.last_check_out_at) {
            outTime = new Date(r.last_check_out_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          }

          if (status === 'PRESENT') {
            glyph = '✓';
            presentDays++;
          } else if (status === 'HALF_DAY') {
            glyph = '½';
            halfDays++;
          } else if (status === 'ABSENT') {
            glyph = '×';
          } else if (status === 'PAID_LEAVE') {
            glyph = 'L';
          } else if (status === 'UNPAID_LEAVE') {
            glyph = 'LOP';
          } else if (status === 'HOLIDAY') {
            glyph = 'H';
          } else if (status === 'WEEKEND') {
            glyph = 'W';
          }
        }

        return {
          day: hdr.day,
          date: hdr.date,
          status,
          glyph,
          inTime,
          outTime,
          workedHours,
          isLate,
          source,
        };
      });

      const monthAttendancePct = workingDays > 0 ? Math.round(((presentDays + 0.5 * halfDays) / workingDays) * 100) : 0;

      deptGroups.get(deptId)!.employees.push({
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        fullName: `${emp.first_name} ${emp.last_name || ''}`.trim(),
        designation: desig?.designation_name || 'Staff Member',
        monthAttendancePct,
        days,
      });
    }

    // Compute department leaderboard
    const leaderboard = Array.from(deptGroups.values()).map((g) => {
      const totalEmp = g.employees.length;
      const avgPct = totalEmp > 0 ? Math.round(g.employees.reduce((acc, e) => acc + e.monthAttendancePct, 0) / totalEmp) : 0;
      return {
        departmentId: g.departmentId,
        departmentName: g.departmentName,
        headcount: totalEmp,
        attendancePct: avgPct,
        presentPct: avgPct,
        halfDayPct: Math.round(avgPct * 0.15),
        leavePct: Math.round((100 - avgPct) * 0.4),
        absentPct: Math.max(0, 100 - avgPct),
      };
    }).sort((a, b) => b.attendancePct - a.attendancePct);

    return {
      month: monthStr,
      daysInMonth,
      daysHeader,
      kpis: {
        presentCount: kpiPresent,
        absentCount: kpiAbsent,
        leaveCount: kpiLeave,
        lateCount: kpiLate,
        headcount: filteredEmployees.length,
      },
      departmentLeaderboard: leaderboard,
      groups: Array.from(deptGroups.values()),
    };
  }

  /**
   * 4. GET /attendance/employee-month?employeeId=&month=YYYY-MM
   * Detailed records, punch timelines, stats, and leave balances for employee detail views
   */
  async getEmployeeMonth(tenantId: string, employeeId: string, monthStr: string) {
    const resolvedId = await this.resolveEmployeeId(tenantId, employeeId);
    if (!resolvedId) {
      throw new NotFoundException(`Employee not found: ${employeeId}`);
    }

    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthNumStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const monthStartDate = new Date(`${monthStr}-01T00:00:00.000Z`);
    const monthEndDate = new Date(`${monthStr}-${String(daysInMonth).padStart(2, '0')}T23:59:59.999Z`);

    // Fetch employee details
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { tenant_id: tenantId, id: resolvedId },
      include: {
        rndtechnosoft_employee_employments: {
          orderBy: { effective_from: 'desc' },
          take: 1,
          include: {
            rndtechnosoft_departments: true,
            rndtechnosoft_designations: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee record not found`);
    }

    const dept = employee.rndtechnosoft_employee_employments[0]?.rndtechnosoft_departments;
    const desig = employee.rndtechnosoft_employee_employments[0]?.rndtechnosoft_designations;

    // Fetch records and punches
    const records = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: {
        tenant_id: tenantId,
        employee_id: resolvedId,
        attendance_date: { gte: monthStartDate, lte: monthEndDate },
      },
      include: {
        rndtechnosoft_attendance_punches: {
          orderBy: { punch_at: 'asc' },
        },
        rndtechnosoft_shifts: {
          include: { rndtechnosoft_shift_breaks: true },
        },
      },
      orderBy: { attendance_date: 'asc' },
    });

    // TIME columns arrive as Dates on 1970-01-01 UTC; the built-in default shift uses 'HH:MM:SS' strings
    const toHhmm = (t: Date | string | null | undefined): string | null =>
      !t ? null : typeof t === 'string' ? t.slice(0, 5) : t.toISOString().slice(11, 16);

    const recordMap = new Map<string, (typeof records)[0]>();
    for (const r of records) {
      const dStr = r.attendance_date.toISOString().slice(0, 10);
      recordMap.set(dStr, r);
    }

    // Fetch default shifts
    const defaultShifts = await this.getShifts(tenantId);
    const defaultShift = defaultShifts[0];

    // Compute month aggregates
    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let lateMarks = 0;
    let totalWorkedMinutes = 0;
    let totalOvertimeMinutes = 0;
    let checkInMinutesSum = 0;
    let checkInCount = 0;
    let workingDays = 0;

    let currentStreak = 0;
    let bestStreak = 0;

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${monthStr}-${String(day).padStart(2, '0')}`;
      const dObj = new Date(`${dStr}T00:00:00.000Z`);
      const dow = dObj.getUTCDay();
      const { isHoliday, holidayName, isWeeklyOff } = await this.checkDateSpecial(tenantId, dStr);

      if (!isWeeklyOff && !isHoliday) workingDays++;

      const r = recordMap.get(dStr);
      let status = isHoliday ? 'HOLIDAY' : isWeeklyOff ? 'WEEKEND' : 'ABSENT';
      let glyph = isHoliday ? 'H' : isWeeklyOff ? 'W' : '×';
      let workedMinutes = 0;
      let lateMinutes = 0;
      let overtimeMinutes = 0;
      let isLate = false;
      let firstCheckInAt: string | null = null;
      let lastCheckOutAt: string | null = null;
      let punches: any[] = [];
      let source = 'SYSTEM';

      const shiftData = r?.rndtechnosoft_shifts || defaultShift;

      if (r) {
        status = r.attendance_status;
        workedMinutes = r.worked_minutes;
        lateMinutes = r.late_minutes;
        overtimeMinutes = r.overtime_minutes;
        isLate = r.late_minutes > 0;
        source = r.source;
        firstCheckInAt = r.first_check_in_at ? r.first_check_in_at.toISOString() : null;
        lastCheckOutAt = r.last_check_out_at ? r.last_check_out_at.toISOString() : null;

        const rawPunches = (r.rndtechnosoft_attendance_punches || []).map((p) => ({
          id: p.id,
          punchAt: p.punch_at.toISOString(),
          punchType: p.punch_type,
          source: p.source,
          deviceReference: p.device_reference || undefined,
        }));

        // Deduplicate punches that occur within 30 seconds with same general direction (IN vs OUT)
        const dedupedPunches: typeof rawPunches = [];
        for (const p of rawPunches) {
          const isCheckIn = p.punchType.includes('IN');
          const lastAdded = dedupedPunches[dedupedPunches.length - 1];
          if (lastAdded) {
            const timeDiffSec = Math.abs(
              (new Date(p.punchAt).getTime() - new Date(lastAdded.punchAt).getTime()) / 1000
            );
            const lastIsCheckIn = lastAdded.punchType.includes('IN');
            if (timeDiffSec < 30 && isCheckIn === lastIsCheckIn) {
              continue; // Skip rapid redundant duplicate
            }
          }
          dedupedPunches.push(p);
        }
        punches = dedupedPunches;

        totalWorkedMinutes += workedMinutes;
        totalOvertimeMinutes += overtimeMinutes;
        if (isLate) lateMarks++;

        if (status === 'PRESENT') {
          presentDays++;
          currentStreak++;
          if (currentStreak > bestStreak) bestStreak = currentStreak;
        } else {
          currentStreak = 0;
        }

        if (status === 'HALF_DAY') halfDays++;
        if (status === 'ABSENT') absentDays++;
        if (status === 'PAID_LEAVE') paidLeaveDays++;
        if (status === 'UNPAID_LEAVE') unpaidLeaveDays++;

        // Average check-in accumulator (in Asia/Kolkata +05:30)
        if (r.first_check_in_at) {
          const cin = new Date(r.first_check_in_at);
          const kolkataMins = cin.getUTCHours() * 60 + cin.getUTCMinutes() + 330;
          checkInMinutesSum += kolkataMins % 1440;
          checkInCount++;
        }
      } else {
        if (!isWeeklyOff && !isHoliday) {
          absentDays++;
        }
        currentStreak = 0;
      }

      // Glyph determination
      if (status === 'PRESENT') glyph = '✓';
      else if (status === 'HALF_DAY') glyph = '½';
      else if (status === 'ABSENT') glyph = '×';
      else if (status === 'PAID_LEAVE') glyph = 'L';
      else if (status === 'UNPAID_LEAVE') glyph = 'LOP';
      else if (status === 'HOLIDAY') glyph = 'H';
      else if (status === 'WEEKEND') glyph = 'W';

      days.push({
        date: dStr,
        day,
        weekday: weekdayNames[dow],
        status,
        glyph,
        firstCheckInAt,
        lastCheckOutAt,
        workedMinutes,
        workedHours: +(workedMinutes / 60).toFixed(1),
        lateMinutes,
        overtimeMinutes,
        isLate,
        source,
        leaveType: status === 'PAID_LEAVE' ? 'Earned Leave' : undefined,
        holidayName: isHoliday ? holidayName : undefined,
        // Device-reported shift for this date wins; otherwise the record's/tenant default shift
        shift: {
          name: r?.scheduled_shift_code ? null : shiftData?.shift_name ?? null,
          scheduledCode: r?.scheduled_shift_code ?? null,
          workingCode: r?.working_shift_code ?? null,
          startTime: toHhmm(r?.scheduled_shift_code ? r.scheduled_shift_start_time : shiftData?.start_time),
          endTime: toHhmm(r?.scheduled_shift_code ? r.scheduled_shift_end_time : shiftData?.end_time),
          graceMinutes: shiftData?.grace_in_minutes || 15,
          standardMinutes: shiftData?.standard_work_minutes || 480,
          breakMinutes: 60,
        },
        punches,
      });
    }

    // Average check-in formatting
    let avgCheckInTime = '09:30 AM';
    if (checkInCount > 0) {
      const avgMins = Math.round(checkInMinutesSum / checkInCount);
      const h = Math.floor(avgMins / 60);
      const m = avgMins % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      avgCheckInTime = `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    const payableDays = Math.max(0, +(daysInMonth - absentDays - 0.5 * halfDays).toFixed(1));
    const attendancePct = workingDays > 0 ? Math.round(((presentDays + 0.5 * halfDays) / workingDays) * 100) : 0;

    return {
      employee: {
        id: employee.id,
        employeeCode: employee.employee_code,
        fullName: `${employee.first_name} ${employee.last_name || ''}`.trim(),
        email: employee.work_email,
        designation: desig?.designation_name || 'Staff Member',
        departmentId: dept?.id || 'unassigned',
        departmentName: dept?.department_name || 'General / Operations',
      },
      month: monthStr,
      workingDays,
      attendancePct,
      payableDays,
      totalWorkedHours: +(totalWorkedMinutes / 60).toFixed(1),
      stats: {
        presentDays,
        absentDays,
        lopCount: unpaidLeaveDays,
        halfDays,
        leaveDays: paidLeaveDays,
        lateMarks,
        avgCheckInTime,
        overtimeHours: +(totalOvertimeMinutes / 60).toFixed(1),
        bestStreakDays: bestStreak,
      },
      leaveBalances: {
        casual: { total: 8, used: 2, remaining: 6 },
        sick: { total: 12, used: 1, remaining: 11 },
        earned: { total: 18, used: 3, remaining: 15 },
      },
      days,
    };
  }

  /**
   * 5. GET /attendance/employee-year?employeeId=&year=YYYY
   * 12 months array with daily status dots and monthly % for Year at a Glance card
   */
  async getEmployeeYear(tenantId: string, employeeId: string, year: number) {
    const resolvedId = await this.resolveEmployeeId(tenantId, employeeId);
    if (!resolvedId) {
      throw new NotFoundException(`Employee not found: ${employeeId}`);
    }

    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

    const records = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: {
        tenant_id: tenantId,
        employee_id: resolvedId,
        attendance_date: { gte: yearStart, lte: yearEnd },
      },
      select: {
        attendance_date: true,
        attendance_status: true,
      },
    });

    const recordMap = new Map<string, string>();
    for (const r of records) {
      const dStr = r.attendance_date.toISOString().slice(0, 10);
      recordMap.set(dStr, r.attendance_status);
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = [];

    for (let m = 1; m <= 12; m++) {
      const mStr = `${year}-${String(m).padStart(2, '0')}`;
      const totalDays = new Date(year, m, 0).getDate();
      let presentDays = 0;
      let halfDays = 0;
      let workingDays = 0;
      const days = [];

      for (let d = 1; d <= totalDays; d++) {
        const dStr = `${mStr}-${String(d).padStart(2, '0')}`;
        const dObj = new Date(`${dStr}T00:00:00.000Z`);
        const isWeekend = dObj.getUTCDay() === 0;

        if (!isWeekend) workingDays++;

        const status = recordMap.get(dStr) || (isWeekend ? 'WEEKEND' : 'FUTURE');
        if (status === 'PRESENT') presentDays++;
        if (status === 'HALF_DAY') halfDays++;

        days.push({
          date: dStr,
          day: d,
          status,
        });
      }

      const attendancePct = workingDays > 0 ? Math.round(((presentDays + 0.5 * halfDays) / workingDays) * 100) : 0;

      months.push({
        month: mStr,
        monthName: monthNames[m - 1],
        attendancePct,
        days,
      });
    }

    return {
      year,
      months,
    };
  }
}


