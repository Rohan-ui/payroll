/**
 * ExternalApiService
 *
 * Orchestrates calls to the COSEC API:
 *  1. Reads per-tenant COSEC config from tenant_settings
 *  2. Calls CosecApiClient
 *  3. Passes raw response to CosecSerializer
 *  4. Returns internal domain objects
 *
 * This service does NOT touch AttendanceService or EmployeesService.
 * The proxy endpoints it exposes return serialized data that callers
 * can use directly or feed into existing services.
 */

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { cosecGet, cosecTestConnection } from './cosec-api.client';
import {
  serializeCosecUsers,
  serializeCosecMonthlyAttendance,
  serializeCosecDailyAttendance,
  parseCosecDate,
  CosecRawUser,
  CosecRawMonthlyAttendance,
  CosecRawDailyAttendance,
  SerializedCosecUser,
  SerializedCosecMonthlyAttendance,
  SerializedCosecDailyAttendance,
} from './cosec.serializer';

/** Shape stored at settings.cosecApi in tenant_settings */
export interface CosecApiSettings {
  baseUrl: string;
  username: string;
  /** Stored password — never returned to client */
  password: string;
}

/** What we return to the frontend (never includes password plaintext) */
export interface CosecConfigPublic {
  baseUrl: string;
  username: string;
  passwordSet: boolean;
}

@Injectable()
export class ExternalApiService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── Config ───────────────────────────────────────────────── */

  /** Read COSEC config from tenant_settings. Throws if not configured. */
  async getCosecConfig(tenantId: string): Promise<CosecApiSettings> {
    const settings = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const raw = settings?.settings as Record<string, any> | null;
    const cosecApi = raw?.cosecApi as CosecApiSettings | undefined;

    if (!cosecApi?.baseUrl || !cosecApi?.username || !cosecApi?.password) {
      throw new BadRequestException(
        'COSEC API is not configured. Please add the base URL, username, and password in Settings → API Configuration.',
      );
    }

    return cosecApi;
  }

  /** Save COSEC config into tenant_settings.cosecApi */
  async saveCosecConfig(tenantId: string, config: CosecApiSettings): Promise<CosecConfigPublic> {
    // Ensure tenant exists
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const existing = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const existingSettings = (existing?.settings ?? {}) as Record<string, any>;
    const prevCosec = existingSettings?.cosecApi as CosecApiSettings | undefined;

    const finalPassword = (config.password && config.password.trim()) || prevCosec?.password;
    if (!finalPassword) {
      throw new BadRequestException('Password is required.');
    }

    // Cast to Prisma.InputJsonValue to satisfy Prisma's Json type
    const mergedSettings: Prisma.InputJsonValue = {
      ...existingSettings,
      cosecApi: {
        baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
        username: config.username.trim(),
        password: finalPassword,
      },
    };

    await this.prisma.rndtechnosoft_tenant_settings.upsert({
      where: { tenant_id: tenantId },
      update: { settings: mergedSettings },
      create: {
        id: randomUUID(),
        tenant_id: tenantId,
        settings: mergedSettings,
      },
    });

    return {
      baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
      username: config.username.trim(),
      passwordSet: true,
    };
  }

  /** Returns public (masked) COSEC config */
  async getCosecConfigPublic(tenantId: string): Promise<CosecConfigPublic | null> {
    try {
      const cfg = await this.getCosecConfig(tenantId);
      return { baseUrl: cfg.baseUrl, username: cfg.username, passwordSet: !!cfg.password };
    } catch {
      return null;
    }
  }

  /* ── Test Connection ──────────────────────────────────────── */

  async testConnection(tenantId: string): Promise<{ ok: boolean; message: string }> {
    const config = await this.getCosecConfig(tenantId);
    return cosecTestConnection(config);
  }

  /** Test with an explicit (not yet saved) config — used from the settings form */
  async testConnectionWithConfig(
    config: CosecApiSettings,
  ): Promise<{ ok: boolean; message: string }> {
    return cosecTestConnection(config);
  }

  /* ── Users ────────────────────────────────────────────────── */

  async getUsers(tenantId: string): Promise<SerializedCosecUser[]> {
    const config = await this.getCosecConfig(tenantId);
    try {
      const raw = await cosecGet<CosecRawUser[]>(config, 'user', {
        action: 'get',
        range: 'all',
      });

      // COSEC returns { "user": [ ... ] }
      const records = this.unwrapCosecList<CosecRawUser>(raw);
      return serializeCosecUsers(records);
    } catch (err: any) {
      throw new BadRequestException(
        err?.message || 'Failed to fetch users from COSEC server. Please check your API configuration.',
      );
    }
  }

  /* ── Sync Users into Database ─────────────────────────────── */

  /**
   * Sync all users from COSEC into rndtechnosoft_employees for this tenant.
   * Also cleans up any previously seeded mock employees.
   */
  async syncUsers(tenantId: string): Promise<{
    syncedCount: number;
    deletedMockCount: number;
    employees: Array<{ id: string; employeeCode: string; name: string }>;
  }> {
    const config = await this.getCosecConfig(tenantId);
    const raw = await cosecGet<CosecRawUser[]>(config, 'user', {
      action: 'get',
      range: 'all',
    });

    const rawUsers = this.unwrapCosecList<CosecRawUser>(raw);
    if (!rawUsers.length) {
      return { syncedCount: 0, deletedMockCount: 0, employees: [] };
    }

    const syncedEmployees: Array<{ id: string; employeeCode: string; name: string }> = [];
    const validEmployeeCodes: string[] = [];

    for (const u of rawUsers) {
      const employeeCode = (u.id || u['reference-code'] || '').trim();
      if (!employeeCode) continue;

      validEmployeeCodes.push(employeeCode);

      // Parse name into first / last
      const fullName = (u['full-name'] || u.name || employeeCode).trim();
      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0] || employeeCode;
      const lastName = nameParts.slice(1).join(' ') || null;

      // Dates
      const dobStr = parseCosecDate(u['date-of-birth']);
      const dateOfBirth = dobStr ? new Date(dobStr) : null;
      const joinStr = parseCosecDate(u['joining-date']);
      const hireDate = joinStr ? new Date(joinStr) : new Date();

      // Contacts & gender
      const workEmail = u['personal-email'] || u['official-email'] || null;
      const workMobile = u['personal-phone'] || u['personal-cell'] || u['official-cell'] || null;
      const genderCode = u.gender?.toUpperCase() === 'FEMALE' ? 'FEMALE' : 'MALE';

      // 1. Resolve or create department
      let departmentId: string | null = null;
      const deptName = (u['department-name'] || u.department || '').trim();
      if (deptName) {
        let dept = await this.prisma.rndtechnosoft_departments.findFirst({
          where: { tenant_id: tenantId, department_name: { equals: deptName, mode: 'insensitive' } },
        });
        if (!dept) {
          dept = await this.prisma.rndtechnosoft_departments.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              department_name: deptName,
              department_code: deptName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 32) || `DEPT_${Date.now()}`,
              department_status: 'ACTIVE',
            },
          });
        }
        departmentId = dept.id;
      }

      // 2. Resolve or create designation
      let designationId: string | null = null;
      const desigName = (u['designation-name'] || u.designation || '').trim();
      if (desigName) {
        let desig = await this.prisma.rndtechnosoft_designations.findFirst({
          where: { tenant_id: tenantId, designation_name: { equals: desigName, mode: 'insensitive' } },
        });
        if (!desig) {
          desig = await this.prisma.rndtechnosoft_designations.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              designation_name: desigName,
              designation_code: desigName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 32) || `DESIG_${Date.now()}`,
              designation_status: 'ACTIVE',
            },
          });
        }
        designationId = desig.id;
      }

      // 3. Resolve or create branch
      let branchId: string | null = null;
      const branchName = (u['branch-name'] || u.branch || '').trim();
      if (branchName) {
        let branch = await this.prisma.rndtechnosoft_branches.findFirst({
          where: { tenant_id: tenantId, branch_name: { equals: branchName, mode: 'insensitive' } },
        });
        if (!branch) {
          branch = await this.prisma.rndtechnosoft_branches.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              branch_name: branchName,
              branch_code: branchName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 32) || `BR_${Date.now()}`,
              branch_status: 'ACTIVE',
            },
          });
        }
        branchId = branch.id;
      }

      // 4. Upsert employee
      let employee = await this.prisma.rndtechnosoft_employees.findFirst({
        where: { tenant_id: tenantId, employee_code: employeeCode },
      });

      if (!employee) {
        employee = await this.prisma.rndtechnosoft_employees.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_code: employeeCode,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dateOfBirth,
            gender_code: genderCode,
            work_email: workEmail,
            personal_email: workEmail,
            work_mobile: workMobile,
            hire_date: hireDate,
            employee_status: u.active === '0' ? 'INACTIVE' : 'ACTIVE',
          },
        });
      } else {
        employee = await this.prisma.rndtechnosoft_employees.update({
          where: { id: employee.id },
          data: {
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dateOfBirth,
            gender_code: genderCode,
            work_email: workEmail,
            personal_email: workEmail,
            work_mobile: workMobile,
            hire_date: hireDate,
            employee_status: u.active === '0' ? 'INACTIVE' : 'ACTIVE',
          },
        });
      }

      // 5. Upsert active employment
      const existingEmployment = await this.prisma.rndtechnosoft_employee_employments.findFirst({
        where: { tenant_id: tenantId, employee_id: employee.id, effective_to: null },
      });

      if (!existingEmployment) {
        await this.prisma.rndtechnosoft_employee_employments.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employee.id,
            joining_date: hireDate,
            effective_from: hireDate,
            employment_status: 'ACTIVE',
            department_id: departmentId,
            designation_id: designationId,
            branch_id: branchId,
          },
        });
      } else {
        await this.prisma.rndtechnosoft_employee_employments.update({
          where: { id: existingEmployment.id },
          data: {
            department_id: departmentId ?? existingEmployment.department_id,
            designation_id: designationId ?? existingEmployment.designation_id,
            branch_id: branchId ?? existingEmployment.branch_id,
          },
        });
      }

      // 6. PAN identifier if provided
      if (u.pan && u.pan.trim()) {
        const panVal = u.pan.trim().toUpperCase();
        const existingPan = await this.prisma.rndtechnosoft_employee_identifiers.findFirst({
          where: { tenant_id: tenantId, employee_id: employee.id, identifier_type: 'PAN' },
        });
        if (!existingPan) {
          await this.prisma.rndtechnosoft_employee_identifiers.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: employee.id,
              identifier_type: 'PAN',
              identifier_value_encrypted: panVal,
              identifier_last4: panVal.slice(-4),
              country_code: 'IN',
            },
          });
        }
      }

      syncedEmployees.push({
        id: employee.id,
        employeeCode: employee.employee_code,
        name: `${employee.first_name} ${employee.last_name || ''}`.trim(),
      });
    }

    // 7. Delete mock employees for this tenant (any employee not in validEmployeeCodes)
    const mockEmployees = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        employee_code: { notIn: validEmployeeCodes },
      },
      select: { id: true, employee_code: true },
    });

    let deletedMockCount = 0;
    if (mockEmployees.length > 0) {
      const mockIds = mockEmployees.map((m) => m.id);
      await this.prisma.rndtechnosoft_attendance_records.deleteMany({
        where: { tenant_id: tenantId, employee_id: { in: mockIds } },
      });
      await this.prisma.rndtechnosoft_employee_employments.deleteMany({
        where: { tenant_id: tenantId, employee_id: { in: mockIds } },
      });
      await this.prisma.rndtechnosoft_employee_identifiers.deleteMany({
        where: { tenant_id: tenantId, employee_id: { in: mockIds } },
      });
      await this.prisma.rndtechnosoft_employee_bank_accounts.deleteMany({
        where: { tenant_id: tenantId, employee_id: { in: mockIds } },
      });
      await this.prisma.rndtechnosoft_employee_salary_assignments.deleteMany({
        where: { tenant_id: tenantId, employee_id: { in: mockIds } },
      });
      const delRes = await this.prisma.rndtechnosoft_employees.deleteMany({
        where: { tenant_id: tenantId, id: { in: mockIds } },
      });
      deletedMockCount = delRes.count;
    }

    return {
      syncedCount: syncedEmployees.length,
      deletedMockCount,
      employees: syncedEmployees,
    };
  }

  /* ── Daily Attendance & Punches ───────────────────────────── */

  /**
   * Fetch daily attendance with punch in / out times from COSEC for a date range.
   * @param startDate YYYY-MM-DD
   * @param endDate   YYYY-MM-DD
   */
  async getDailyAttendance(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    range: string = 'all',
    rangeId?: string,
  ): Promise<SerializedCosecDailyAttendance[]> {
    const config = await this.getCosecConfig(tenantId);

    // Build ddmmyyyy-ddmmyyyy date range
    let dRange = '';
    if (startDate && endDate) {
      const sY = startDate.slice(0, 4);
      const sM = startDate.slice(5, 7);
      const sD = startDate.slice(8, 10);
      const eY = endDate.slice(0, 4);
      const eM = endDate.slice(5, 7);
      const eD = endDate.slice(8, 10);
      dRange = `${sD}${sM}${sY}-${eD}${eM}${eY}`;
    } else {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      dRange = `01${mm}${yyyy}-${dd}${mm}${yyyy}`;
    }

    const params: Record<string, string> = {
      action: 'get',
      'date-range': dRange,
      range,
      'field-name': 'userid,username,punch1_date,punch1_time,punch2_time,punch3_time,punch4_time,punch5_time,punch6_time,punch7_time,outpunch_time,firsthalf,secondhalf,worktime_hhmm,shiftstart',
    };
    if (range !== 'all' && rangeId) {
      params['id'] = rangeId;
    }

    try {
      const raw = await cosecGet<CosecRawDailyAttendance[]>(
        config,
        'attendance-daily',
        params,
      );
      const records = this.unwrapCosecList<CosecRawDailyAttendance>(raw);
      return serializeCosecDailyAttendance(records);
    } catch (err: any) {
      throw new BadRequestException(
        err?.message || 'Failed to fetch daily attendance from COSEC server.',
      );
    }
  }

  /**
   * Sync daily attendance & punches into DB for a date range (defaults to month-to-date).
   */
  async syncDailyAttendance(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{ syncedRecords: number; syncedPunches: number }> {
    const dailyList = await this.getDailyAttendance(tenantId, startDate, endDate);
    if (!dailyList.length) {
      return { syncedRecords: 0, syncedPunches: 0 };
    }

    let syncedRecords = 0;
    let syncedPunches = 0;

    for (const item of dailyList) {
      if (!item.employeeCode || !item.date) continue;

      const employee = await this.prisma.rndtechnosoft_employees.findFirst({
        where: { tenant_id: tenantId, employee_code: item.employeeCode },
      });
      if (!employee) continue;

      const attDate = new Date(`${item.date}T00:00:00.000Z`);

      let firstCheckInAt: Date | null = null;
      let lastCheckOutAt: Date | null = null;

      if (item.firstCheckInTime) {
        firstCheckInAt = new Date(`${item.date}T${item.firstCheckInTime}.000Z`);
      }
      if (item.lastCheckOutTime && !item.isCurrentlyInside) {
        lastCheckOutAt = new Date(`${item.date}T${item.lastCheckOutTime}.000Z`);
      }

      // Upsert daily attendance record
      const record = await this.prisma.rndtechnosoft_attendance_records.upsert({
        where: {
          tenant_id_employee_id_attendance_date: {
            tenant_id: tenantId,
            employee_id: employee.id,
            attendance_date: attDate,
          },
        },
        update: {
          attendance_status: item.status,
          first_check_in_at: firstCheckInAt,
          last_check_out_at: lastCheckOutAt,
          worked_minutes: item.workedMinutes > 0 ? item.workedMinutes : (item.status === 'PRESENT' ? 480 : (item.status === 'HALF_DAY' ? 240 : 0)),
          payable_minutes: item.status === 'PRESENT' ? 480 : (item.status === 'HALF_DAY' ? 240 : 0),
          source: 'COSEC_SYNC',
        },
        create: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: employee.id,
          attendance_date: attDate,
          attendance_status: item.status,
          first_check_in_at: firstCheckInAt,
          last_check_out_at: lastCheckOutAt,
          worked_minutes: item.workedMinutes > 0 ? item.workedMinutes : (item.status === 'PRESENT' ? 480 : (item.status === 'HALF_DAY' ? 240 : 0)),
          payable_minutes: item.status === 'PRESENT' ? 480 : (item.status === 'HALF_DAY' ? 240 : 0),
          source: 'COSEC_SYNC',
        },
      });
      syncedRecords++;

      // Create/sync each individual punch in sequence (Punch 1 IN, Punch 2 OUT, Punch 3 IN, etc.)
      for (const p of item.punches) {
        const punchAt = new Date(`${item.date}T${p.time}.000Z`);
        const existingPunch = await this.prisma.rndtechnosoft_attendance_punches.findFirst({
          where: {
            tenant_id: tenantId,
            employee_id: employee.id,
            punch_at: punchAt,
            punch_type: p.type,
          },
        });
        if (!existingPunch) {
          await this.prisma.rndtechnosoft_attendance_punches.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: employee.id,
              attendance_record_id: record.id,
              punch_at: punchAt,
              punch_type: p.type,
              source: 'COSEC_SYNC',
              device_reference: `COSEC_PUNCH_${p.index}_${p.label}`,
            },
          });
          syncedPunches++;
        }
      }
    }

    return { syncedRecords, syncedPunches };
  }

  /* ── Monthly Attendance ───────────────────────────────────── */

  /**
   * @param month  YYYY-MM format (e.g. "2026-09")
   * @param cosecRange  "all" | "organization" | "department" — defaults to "all"
   * @param cosecRangeId  Only required when range != "all"
   */
  async getMonthlyAttendance(
    tenantId: string,
    month: string,
    cosecRange: string = 'all',
    cosecRangeId?: string,
  ): Promise<SerializedCosecMonthlyAttendance[]> {
    const config = await this.getCosecConfig(tenantId);

    // COSEC month-year format: MMYYYY
    const [yearStr, monthStr] = month.split('-');
    if (!yearStr || !monthStr) {
      throw new BadRequestException('month parameter must be in YYYY-MM format');
    }
    const cosecMonthYear = `${monthStr}${yearStr}`; // e.g. "092026"

    const params: Record<string, string> = {
      action: 'get',
      range: cosecRange,
      'month-year': cosecMonthYear,
    };
    if (cosecRange !== 'all' && cosecRangeId) {
      params['id'] = cosecRangeId;
    }

    const raw = await cosecGet<CosecRawMonthlyAttendance[]>(
      config,
      'attendance-monthly',
      params,
    );

    const records = this.unwrapCosecList<CosecRawMonthlyAttendance>(raw);
    return serializeCosecMonthlyAttendance(records, month);
  }

  /**
   * Sync COSEC monthly attendance into internal attendance records.
   */
  async syncAttendance(
    tenantId: string,
    month: string,
  ): Promise<{ syncedCount: number; records: SerializedCosecMonthlyAttendance[] }> {
    const records = await this.getMonthlyAttendance(tenantId, month);
    if (!records.length) {
      return { syncedCount: 0, records: [] };
    }

    for (const rec of records) {
      if (!rec.employeeCode) continue;

      // Find employee in this tenant
      const employee = await this.prisma.rndtechnosoft_employees.findFirst({
        where: { tenant_id: tenantId, employee_code: rec.employeeCode },
      });
      if (!employee) continue;

      // Clean existing attendance records for that employee in this month
      const [year, mon] = month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(year, mon - 1, 1));
      const endOfMonth = new Date(Date.UTC(year, mon, 0));

      await this.prisma.rndtechnosoft_attendance_records.deleteMany({
        where: {
          tenant_id: tenantId,
          employee_id: employee.id,
          attendance_date: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      // Generate daily records representing the COSEC monthly breakdown
      // e.g. Present days, Absent days, etc.
      let dayCounter = 1;
      const daysInMonth = endOfMonth.getUTCDate();

      // Present days
      let pr = rec.presentDays;
      while (pr >= 1 && dayCounter <= daysInMonth) {
        const dateStr = `${month}-${String(dayCounter).padStart(2, '0')}`;
        await this.prisma.rndtechnosoft_attendance_records.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employee.id,
            attendance_date: new Date(dateStr),
            attendance_status: 'PRESENT',
            worked_minutes: 480,
            payable_minutes: 480,
            source: 'COSEC_SYNC',
          },
        });
        pr -= 1;
        dayCounter++;
      }
      if (pr > 0 && dayCounter <= daysInMonth) {
        const dateStr = `${month}-${String(dayCounter).padStart(2, '0')}`;
        await this.prisma.rndtechnosoft_attendance_records.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employee.id,
            attendance_date: new Date(dateStr),
            attendance_status: 'HALF_DAY',
            worked_minutes: 240,
            payable_minutes: 240,
            source: 'COSEC_SYNC',
          },
        });
        dayCounter++;
      }

      // Absent days
      let ab = rec.absentDays;
      while (ab >= 1 && dayCounter <= daysInMonth) {
        const dateStr = `${month}-${String(dayCounter).padStart(2, '0')}`;
        await this.prisma.rndtechnosoft_attendance_records.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employee.id,
            attendance_date: new Date(dateStr),
            attendance_status: 'ABSENT',
            worked_minutes: 0,
            payable_minutes: 0,
            source: 'COSEC_SYNC',
          },
        });
        ab -= 1;
        dayCounter++;
      }
    }

    return { syncedCount: records.length, records };
  }

  /**
   * One-click master sync:
   *  1. Syncs all users from COSEC into employees & removes mock employees
   *  2. Syncs daily attendance & punches for the month
   *  3. Syncs monthly attendance records
   *  4. Returns a complete summary
   */
  async syncAll(
    tenantId: string,
    month?: string,
  ): Promise<{
    users: { syncedCount: number; deletedMockCount: number };
    daily: { syncedRecords: number; syncedPunches: number };
    monthly: { syncedCount: number };
  }> {
    const targetMonth = month ?? new Date().toISOString().slice(0, 7);

    // 1. Sync users
    const usersResult = await this.syncUsers(tenantId);

    // 2. Sync daily attendance & punches
    const dailyResult = await this.syncDailyAttendance(tenantId);

    // 3. Sync monthly attendance summary
    let monthlyCount = 0;
    try {
      const monthlyResult = await this.syncAttendance(tenantId, targetMonth);
      monthlyCount = monthlyResult.syncedCount;
    } catch {
      // Non-blocking if monthly endpoint has no data for future/empty month
    }

    return {
      users: {
        syncedCount: usersResult.syncedCount,
        deletedMockCount: usersResult.deletedMockCount,
      },
      daily: dailyResult,
      monthly: {
        syncedCount: monthlyCount,
      },
    };
  }

  /* ── Private helpers ──────────────────────────────────────── */

  /**
   * COSEC JSON format can wrap results in different shapes:
   *  - Array directly
   *  - { "user": [...] }
   *  - { "attendance-monthly": [...] }
   *  - { "rows": [...] }
   * Normalize to an array.
   */
  private unwrapCosecList<T>(raw: unknown): T[] {
    if (Array.isArray(raw)) {
      return raw as T[];
    }
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const wrapperKeys = [
        'user',
        'users',
        'attendance-daily',
        'daily-attendance',
        'attendance-monthly',
        'attendance',
        'event-ta',
        'events',
        'rows',
        'data',
        'records',
        'result',
      ];
      for (const key of wrapperKeys) {
        if (Array.isArray(obj[key])) {
          return obj[key] as T[];
        }
      }
      // Single object — wrap in array
      return [raw as T];
    }
    return [];
  }
}
