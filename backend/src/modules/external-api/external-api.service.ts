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

import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { cosecGet, cosecTestConnection } from './cosec-api.client';
import { decryptPlatformSecret, encryptPlatformSecret } from '../super-admin/auth/platform-crypto.util';
import { SetCosecMappingDto } from './dto/cosec-sync.dto';
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

/** COSEC connection details as used to call the server (the password decrypted). */
export interface CosecApiSettings {
  baseUrl: string;
  username: string;
  /** Never returned to the client. */
  password: string;
}

/**
 * Stored at settings.cosecApi in tenant_settings: the password encrypted
 * (passwordEncrypted). `password` is plain text saved before encryption; it is
 * still read, and replaced by the encrypted copy on the next save.
 */
interface StoredCosecApiSettings {
  baseUrl: string;
  username: string;
  passwordEncrypted?: string;
  password?: string;
}

/** What one sync of daily attendance did. */
export interface CosecDailySyncResult {
  /** Days returned by COSEC for known employees. */
  syncedRecords: number;
  /** Punches written (only on days that changed). */
  syncedPunches: number;
  /** Days whose times, status or punches changed and were updated. */
  changedRecords: number;
  unchangedRecords: number;
  /** Days left alone: locked by finalized payroll, or corrected by an approved adjustment. */
  skippedLocked: number;
  /** COSEC user IDs with no employee of that Employee Code. */
  unmatchedUsers: string[];
}

/** COSEC works in its server's local time: India. */
const COSEC_OFFSET = '+05:30';

/** Whole minutes between each check-in and the check-out that follows it. */
export function workedFromPunches(punches: { punch_at: Date; punch_type: 'CHECK_IN' | 'CHECK_OUT' }[]): number {
  let total = 0;
  let openSince: Date | null = null;
  for (const p of punches) {
    if (p.punch_type === 'CHECK_IN') openSince = p.punch_at;
    else if (openSince) {
      total += Math.max(0, p.punch_at.getTime() - openSince.getTime());
      openSince = null;
    }
  }
  return Math.floor(total / 60_000);
}
/** Today in COSEC's time zone, as YYYY-MM-DD. */
export const cosecToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** What we return to the frontend (never includes password plaintext) */
export interface CosecConfigPublic {
  baseUrl: string;
  username: string;
  passwordSet: boolean;
}

/** Punch sources written by COSEC syncs, past and present. */
const COSEC_PUNCH_SOURCES = ['COSEC_SYNC', 'COSEC_DEVICE'];

@Injectable()
export class ExternalApiService {
  private readonly logger = new Logger(ExternalApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ── Config ───────────────────────────────────────────────── */

  /** Read COSEC config from tenant_settings. Throws if not configured. */
  async getCosecConfig(tenantId: string): Promise<CosecApiSettings> {
    const settings = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const raw = settings?.settings as Record<string, any> | null;
    const cosecApi = raw?.cosecApi as StoredCosecApiSettings | undefined;
    const password = cosecApi ? this.readPassword(cosecApi) : null;

    if (!cosecApi?.baseUrl || !cosecApi?.username || !password) {
      throw new BadRequestException(
        'COSEC API is not configured. Please add the base URL, username, and password in Settings → API Configuration.',
      );
    }

    return { baseUrl: cosecApi.baseUrl, username: cosecApi.username, password };
  }

  /** Whether this workspace has COSEC set up (without reading the password). */
  async isCosecConfigured(tenantId: string): Promise<boolean> {
    const row = await this.prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantId }, select: { settings: true } });
    const cosecApi = (row?.settings as Record<string, any> | null)?.cosecApi as StoredCosecApiSettings | undefined;
    return Boolean(cosecApi?.baseUrl && cosecApi?.username && (cosecApi.passwordEncrypted || cosecApi.password));
  }

  private readPassword(stored: StoredCosecApiSettings): string | null {
    if (stored.passwordEncrypted) return decryptPlatformSecret(stored.passwordEncrypted);
    return stored.password || null;
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
    const prevCosec = existingSettings?.cosecApi as StoredCosecApiSettings | undefined;

    // A new password, or the saved one; stored encrypted either way.
    const finalPassword = (config.password && config.password.trim()) || (prevCosec ? this.readPassword(prevCosec) : null);
    if (!finalPassword) {
      throw new BadRequestException('Password is required.');
    }

    // Cast to Prisma.InputJsonValue to satisfy Prisma's Json type
    const mergedSettings: Prisma.InputJsonValue = {
      ...existingSettings,
      cosecApi: {
        baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
        username: config.username.trim(),
        passwordEncrypted: encryptPlatformSecret(finalPassword),
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

      // 4. Preferred matching order:
      // Rule 1: Explicit COSEC Employee ID mapping
      const mapping = await this.prisma.rndtechnosoft_employee_cosec_mappings.findFirst({
        where: { tenant_id: tenantId, cosec_employee_id: employeeCode },
      });
      let employee = mapping
        ? await this.prisma.rndtechnosoft_employees.findFirst({
            where: { tenant_id: tenantId, id: mapping.employee_id },
          })
        : null;

      // Rule 2: Existing verified external identifier / exact employee_code match
      if (!employee) {
        employee = await this.prisma.rndtechnosoft_employees.findFirst({
          where: { tenant_id: tenantId, employee_code: employeeCode },
        });
      }

      // Rule 3: Exact normalized email matching (only when unambiguous single match)
      if (!employee && workEmail && workEmail.trim()) {
        const normEmail = workEmail.trim().toLowerCase();
        const emailMatches = await this.prisma.rndtechnosoft_employees.findMany({
          where: {
            tenant_id: tenantId,
            OR: [
              { work_email: { equals: normEmail, mode: 'insensitive' } },
              { personal_email: { equals: normEmail, mode: 'insensitive' } },
            ],
          },
        });
        if (emailMatches.length === 1) {
          employee = emailMatches[0];
        }
      }

      if (!employee) {
        // Create new employee from COSEC
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
        // Matched existing employee! Preserve their existing employee_code!
        employee = await this.prisma.rndtechnosoft_employees.update({
          where: { id: employee.id },
          data: {
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dateOfBirth ?? employee.date_of_birth,
            gender_code: genderCode ?? employee.gender_code,
            work_email: workEmail ?? employee.work_email,
            personal_email: workEmail ?? employee.personal_email,
            work_mobile: workMobile ?? employee.work_mobile,
            employee_status: u.active === '0' ? 'INACTIVE' : employee.employee_status,
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

      // 7. Upsert verified mapping record in rndtechnosoft_employee_cosec_mappings
      await this.prisma.rndtechnosoft_employee_cosec_mappings.upsert({
        where: { tenant_id_employee_id: { tenant_id: tenantId, employee_id: employee.id } },
        update: {
          cosec_employee_id: employeeCode,
          mapping_status: 'MAPPED',
          verification_status: 'VERIFIED',
          last_synced_at: new Date(),
          last_sync_result: `Mapped to COSEC user ${employeeCode}`,
          updated_at: new Date(),
        },
        create: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: employee.id,
          cosec_employee_id: employeeCode,
          mapping_status: 'MAPPED',
          mapping_source: 'AUTOMATIC',
          verification_status: 'VERIFIED',
          last_synced_at: new Date(),
          last_sync_result: `Mapped to COSEC user ${employeeCode}`,
        },
      });

      syncedEmployees.push({
        id: employee.id,
        employeeCode: employee.employee_code,
        name: `${employee.first_name} ${employee.last_name || ''}`.trim(),
      });
    }

    // 8. Ensure any existing HRMS employees without a mapping record are set to MAPPING_PENDING
    const unmappedEmployees = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        rndtechnosoft_employee_cosec_mappings: null,
      },
      select: { id: true },
    });
    for (const unmapped of unmappedEmployees) {
      await this.prisma.rndtechnosoft_employee_cosec_mappings.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: unmapped.id,
          cosec_employee_id: null,
          mapping_status: 'MAPPING_PENDING',
          mapping_source: 'AUTOMATIC',
          verification_status: 'UNVERIFIED',
        },
      }).catch(() => {});
    }

    return {
      syncedCount: syncedEmployees.length,
      deletedMockCount: 0,
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

    // Each punch with its own date (a night shift's punch-out falls on the next day), and the day's process date.
    const punchFields = Array.from({ length: 12 }, (_, i) => `punch${i + 1}_date,punch${i + 1}_time`).join(',');
    const params: Record<string, string> = {
      action: 'get',
      'date-range': dRange,
      range,
      'field-name': `userid,username,processdate,${punchFields},outpunch_time,firsthalf,secondhalf,worktime_hhmm,shiftstart,shiftend,scheduleshift,workingshift`,
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
      // A row without a date can only be placed when a single day was asked for.
      const singleDay = startDate && startDate === endDate ? startDate : undefined;
      return serializeCosecDailyAttendance(records, singleDay);
    } catch (err: any) {
      throw new BadRequestException(
        err?.message || 'Failed to fetch daily attendance from COSEC server.',
      );
    }
  }

  /**
   * Brings daily attendance and punches from COSEC into our records for a date
   * range (month to date by default), for everyone or one employee
   * (`employeeCode`, which is also their COSEC user ID).
   *
   * Only days that differ are written: a day is compared with COSEC (status,
   * times, shift, and its COSEC punches) and left alone when equal, so this can
   * run every minute. A changed day gets COSEC's punches in place of the ones
   * synced before. Days locked by finalized payroll, or corrected by an
   * approved adjustment, are never overwritten.
   */
  async syncDailyAttendance(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    options: { employeeCode?: string } = {},
  ): Promise<CosecDailySyncResult> {
    const dailyList = await this.getDailyAttendance(tenantId, startDate, endDate, options.employeeCode ? 'user' : 'all', options.employeeCode);
    const result: CosecDailySyncResult = { syncedRecords: 0, syncedPunches: 0, changedRecords: 0, unchangedRecords: 0, skippedLocked: 0, unmatchedUsers: [] };
    const items = dailyList.filter((item) => item.employeeCode && item.date);
    if (!items.length) return result;

    // Employees and their days in one go, not one query per row.
    const codes = [...new Set(items.map((item) => item.employeeCode))];

    // 1. Check explicit mappings first
    const mappings = await this.prisma.rndtechnosoft_employee_cosec_mappings.findMany({
      where: {
        tenant_id: tenantId,
        cosec_employee_id: { in: codes },
        mapping_status: 'MAPPED',
      },
      select: { employee_id: true, cosec_employee_id: true },
    });
    const employeeByCosecId = new Map(mappings.map((m) => [m.cosec_employee_id!, m.employee_id]));

    // 2. Fallback to direct employee_code match
    const unmappedCodes = codes.filter((c) => !employeeByCosecId.has(c));
    let employeeByCode = new Map<string, string>();
    if (unmappedCodes.length > 0) {
      const employees = await this.prisma.rndtechnosoft_employees.findMany({
        where: { tenant_id: tenantId, employee_code: { in: unmappedCodes } },
        select: { id: true, employee_code: true },
      });
      employeeByCode = new Map(employees.map((e) => [e.employee_code, e.id]));
    }

    const resolveEmployeeId = (code: string) => employeeByCosecId.get(code) || employeeByCode.get(code);

    result.unmatchedUsers = codes.filter((code) => !resolveEmployeeId(code));
    const allEmployeeIds = [...new Set(codes.map(resolveEmployeeId).filter((id): id is string => Boolean(id)))];
    const dates = items.map((item) => item.date).sort();
    const existing = await this.prisma.rndtechnosoft_attendance_records.findMany({
      where: {
        tenant_id: tenantId,
        employee_id: { in: allEmployeeIds },
        attendance_date: { gte: new Date(`${dates[0]}T00:00:00.000Z`), lte: new Date(`${dates[dates.length - 1]}T00:00:00.000Z`) },
      },
      include: {
        rndtechnosoft_attendance_punches: { where: { source: { in: COSEC_PUNCH_SOURCES } }, orderBy: { punch_at: 'asc' } },
        rndtechnosoft_attendance_adjustments: { where: { adjustment_status: 'APPROVED' }, select: { id: true } },
      },
    });
    const recordByDay = new Map(existing.map((rec) => [`${rec.employee_id}|${rec.attendance_date.toISOString().slice(0, 10)}`, rec]));

    // A COSEC local time ("HH:MM" or "HH:MM:SS") on a date, as an instant.
    const parseLocalTime = (dateStr: string, timeStr: string | null | undefined): Date | null => {
      const clean = timeStr?.trim();
      if (!clean) return null;
      const at = new Date(`${dateStr}T${clean.length === 5 ? `${clean}:00` : clean}${COSEC_OFFSET}`);
      return Number.isNaN(at.getTime()) ? null : at;
    };
    // Postgres TIME columns: Prisma represents them as a Date on 1970-01-01 UTC
    const toTimeOfDay = (hhmm: string | null): Date | null => (hhmm ? new Date(`1970-01-01T${hhmm}:00.000Z`) : null);
    const time = (d: Date | null | undefined) => (d ? d.getTime() : null);

    for (const item of items) {
      const employeeId = resolveEmployeeId(item.employeeCode);
      if (!employeeId) continue;
      result.syncedRecords++;
      const current = recordByDay.get(`${employeeId}|${item.date}`);
      if (current && (current.finalized_at || current.rndtechnosoft_attendance_adjustments.length)) {
        result.skippedLocked++;
        continue;
      }

      // Punch 1 IN, Punch 2 OUT, Punch 3 IN, …, each on its own date.
      const punches = item.punches
        .map((p) => ({ punch_at: parseLocalTime(p.date ?? item.date, p.time), punch_type: p.type, device_reference: `COSEC_PUNCH_${p.index}_${p.label}` }))
        .filter((p): p is { punch_at: Date; punch_type: 'CHECK_IN' | 'CHECK_OUT'; device_reference: string } => p.punch_at !== null);
      // The device's work time when it gives one; otherwise the time between each
      // check-in and the check-out after it. Nothing is assumed: a day still open
      // (checked in, not yet out) counts only its completed pairs so far.
      const workedMinutes = item.workedMinutes > 0 ? item.workedMinutes : workedFromPunches(punches);
      const fields = {
        // COSEC calls a weekly off WEEK_OFF; attendance and payroll know it as WEEKEND.
        attendance_status: item.status === 'WEEK_OFF' ? 'WEEKEND' : item.status,
        first_check_in_at: parseLocalTime(item.punches[0]?.date ?? item.date, item.firstCheckInTime),
        last_check_out_at: item.lastCheckOutTime && !item.isCurrentlyInside
          ? parseLocalTime(item.punches[item.punches.length - 1]?.date ?? item.date, item.lastCheckOutTime)
          : null,
        worked_minutes: workedMinutes,
        payable_minutes: item.status === 'PRESENT' ? 480 : item.status === 'HALF_DAY' ? 240 : 0,
        scheduled_shift_code: item.scheduledShiftCode,
        working_shift_code: item.workingShiftCode,
        scheduled_shift_start_time: toTimeOfDay(item.shiftStart),
        scheduled_shift_end_time: toTimeOfDay(item.shiftEnd),
      };

      const unchanged = current
        && current.source === 'COSEC_SYNC'
        && current.attendance_status === fields.attendance_status
        && time(current.first_check_in_at) === time(fields.first_check_in_at)
        && time(current.last_check_out_at) === time(fields.last_check_out_at)
        && current.worked_minutes === fields.worked_minutes
        && current.payable_minutes === fields.payable_minutes
        && current.scheduled_shift_code === fields.scheduled_shift_code
        && current.working_shift_code === fields.working_shift_code
        && time(current.scheduled_shift_start_time) === time(fields.scheduled_shift_start_time)
        && time(current.scheduled_shift_end_time) === time(fields.scheduled_shift_end_time)
        && current.rndtechnosoft_attendance_punches.length === punches.length
        && current.rndtechnosoft_attendance_punches.every((p, i) =>
          p.punch_at.getTime() === punches[i].punch_at.getTime() && p.punch_type === punches[i].punch_type && p.device_reference === punches[i].device_reference);
      if (unchanged) {
        result.unchangedRecords++;
        continue;
      }

      // The day and its punches change together.
      await this.prisma.$transaction(async (tx) => {
        const record = await tx.rndtechnosoft_attendance_records.upsert({
          where: { tenant_id_employee_id_attendance_date: { tenant_id: tenantId, employee_id: employeeId, attendance_date: new Date(`${item.date}T00:00:00.000Z`) } },
          update: { ...fields, source: 'COSEC_SYNC', updated_at: new Date() },
          create: { id: randomUUID(), tenant_id: tenantId, employee_id: employeeId, attendance_date: new Date(`${item.date}T00:00:00.000Z`), ...fields, source: 'COSEC_SYNC' },
        });
        await tx.rndtechnosoft_attendance_punches.deleteMany({ where: { tenant_id: tenantId, attendance_record_id: record.id, source: { in: COSEC_PUNCH_SOURCES } } });
        if (punches.length) {
          await tx.rndtechnosoft_attendance_punches.createMany({
            data: punches.map((p) => ({ id: randomUUID(), tenant_id: tenantId, employee_id: employeeId, attendance_record_id: record.id, ...p, source: 'COSEC_SYNC' })),
          });
        }
      });
      result.changedRecords++;
      result.syncedPunches += punches.length;
    }

    return result;
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

      // Find employee in this tenant via COSEC mapping first, fallback to employee_code
      const mapping = await this.prisma.rndtechnosoft_employee_cosec_mappings.findFirst({
        where: { tenant_id: tenantId, cosec_employee_id: rec.employeeCode },
        include: { rndtechnosoft_employees: true },
      });
      const employee = mapping?.rndtechnosoft_employees ?? await this.prisma.rndtechnosoft_employees.findFirst({
        where: { tenant_id: tenantId, employee_code: rec.employeeCode },
      });
      if (!employee) continue;

      if (mapping) {
        await this.prisma.rndtechnosoft_employee_cosec_mappings.update({
          where: { id: mapping.id },
          data: {
            last_synced_at: new Date(),
            last_sync_result: `Monthly attendance synced for ${month}`,
            mapping_status: 'MAPPED',
            updated_at: new Date(),
          },
        });
      }

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

  /* ── COSEC Employee Mappings & Reconciliation ──────────────────────────── */

  /**
   * Get the COSEC mapping status for a specific employee.
   */
  async getEmployeeMapping(tenantId: string, employeeId: string) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { id: employeeId, tenant_id: tenantId },
      select: {
        id: true,
        employee_code: true,
        first_name: true,
        last_name: true,
        work_email: true,
        employee_status: true,
      },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found in workspace`);
    }

    const mapping = await this.prisma.rndtechnosoft_employee_cosec_mappings.findUnique({
      where: {
        tenant_id_employee_id: {
          tenant_id: tenantId,
          employee_id: employeeId,
        },
      },
    });

    const isConfigured = await this.isCosecConfigured(tenantId);

    if (!mapping) {
      return {
        id: null,
        tenantId,
        employeeId: employee.id,
        employeeCode: employee.employee_code,
        employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
        workEmail: employee.work_email,
        cosecEmployeeId: null,
        mappingStatus: 'MAPPING_PENDING' as const,
        mappingSource: 'AUTOMATIC' as const,
        verificationStatus: 'UNVERIFIED' as const,
        lastSyncedAt: null,
        lastSyncResult: null,
        reviewNotes: null,
        isCosecConfigured: isConfigured,
      };
    }

    return {
      id: mapping.id,
      tenantId: mapping.tenant_id,
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
      workEmail: employee.work_email,
      cosecEmployeeId: mapping.cosec_employee_id,
      mappingStatus: mapping.mapping_status,
      mappingSource: mapping.mapping_source,
      verificationStatus: mapping.verification_status,
      lastSyncedAt: mapping.last_synced_at,
      lastSyncResult: mapping.last_sync_result,
      reviewNotes: mapping.review_notes,
      isCosecConfigured: isConfigured,
      createdAt: mapping.created_at,
      updatedAt: mapping.updated_at,
    };
  }

  /**
   * Check if a given COSEC User/Employee ID exists in COSEC, and whether it's
   * already linked to another employee in this tenant.
   */
  async lookupCosecUser(tenantId: string, cosecId: string) {
    const trimmed = (cosecId ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('COSEC Employee ID is required for lookup');
    }

    // Check if already mapped in this tenant
    const existingMapping = await this.prisma.rndtechnosoft_employee_cosec_mappings.findFirst({
      where: {
        tenant_id: tenantId,
        cosec_employee_id: trimmed,
      },
      include: {
        rndtechnosoft_employees: {
          select: { id: true, employee_code: true, first_name: true, last_name: true },
        },
      },
    });

    let alreadyMappedTo: {
      employeeId: string;
      employeeCode: string;
      employeeName: string;
    } | null = null;

    if (existingMapping?.rndtechnosoft_employees) {
      const emp = existingMapping.rndtechnosoft_employees;
      alreadyMappedTo = {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
      };
    }

    // Check if COSEC is configured
    const isConfigured = await this.isCosecConfigured(tenantId);
    let existsInCosec = false;
    let cosecUser: SerializedCosecUser | null = null;

    if (isConfigured) {
      try {
        const cosecUsers = await this.getUsers(tenantId);
        const match = cosecUsers.find(
          (u) => (u.cosecUserId || u.referenceCode || '').trim().toUpperCase() === trimmed.toUpperCase(),
        );
        if (match) {
          existsInCosec = true;
          cosecUser = match;
        }
      } catch (err) {
        // If COSEC is temporarily unreachable, do not fail lookup completely
        this.logger.warn(`Could not query COSEC users during lookup: ${err instanceof Error ? err.message : err}`);
      }
    }

    return {
      cosecId: trimmed,
      isConfigured,
      existsInCosec,
      cosecUser,
      alreadyMapped: !!alreadyMappedTo,
      alreadyMappedTo,
    };
  }

  /**
   * Set or update manual COSEC mapping for an employee.
   * Enforces uniqueness of cosec_employee_id per tenant.
   */
  async setEmployeeMapping(
    tenantId: string,
    employeeId: string,
    dto: SetCosecMappingDto,
    actor: { userId?: string; tenantMemberId?: string },
  ) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { id: employeeId, tenant_id: tenantId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found in workspace`);
    }

    const trimmedCosecId = (dto.cosecEmployeeId ?? '').trim();
    if (!trimmedCosecId) {
      throw new BadRequestException('COSEC Employee ID cannot be empty');
    }

    // Check uniqueness within the workspace
    const conflict = await this.prisma.rndtechnosoft_employee_cosec_mappings.findFirst({
      where: {
        tenant_id: tenantId,
        cosec_employee_id: trimmedCosecId,
        NOT: { employee_id: employeeId },
      },
      include: {
        rndtechnosoft_employees: {
          select: { employee_code: true, first_name: true, last_name: true },
        },
      },
    });

    if (conflict) {
      const emp = conflict.rndtechnosoft_employees;
      throw new ConflictException(
        `COSEC Employee ID "${trimmedCosecId}" is already mapped to ${emp.first_name} ${emp.last_name} (${emp.employee_code}).`,
      );
    }

    // Check if the user exists in COSEC (best-effort verification)
    let verificationStatus = 'UNVERIFIED';
    let mappingStatus = 'MAPPED';
    if (await this.isCosecConfigured(tenantId)) {
      try {
        const cosecUsers = await this.getUsers(tenantId);
        const match = cosecUsers.find(
          (u) => (u.cosecUserId || u.referenceCode || '').trim().toUpperCase() === trimmedCosecId.toUpperCase(),
        );
        if (match) {
          verificationStatus = 'VERIFIED';
          mappingStatus = 'MAPPED';
        } else {
          verificationStatus = 'FAILED';
          mappingStatus = 'NOT_FOUND';
        }
      } catch {
        // If COSEC API is offline, keep UNVERIFIED but MAPPED
        verificationStatus = 'UNVERIFIED';
        mappingStatus = 'MAPPED';
      }
    }

    const existing = await this.prisma.rndtechnosoft_employee_cosec_mappings.findUnique({
      where: {
        tenant_id_employee_id: { tenant_id: tenantId, employee_id: employeeId },
      },
    });

    const result = await this.prisma.rndtechnosoft_employee_cosec_mappings.upsert({
      where: {
        tenant_id_employee_id: { tenant_id: tenantId, employee_id: employeeId },
      },
      create: {
        id: randomUUID(),
        tenant_id: tenantId,
        employee_id: employeeId,
        cosec_employee_id: trimmedCosecId,
        mapping_status: mappingStatus,
        mapping_source: 'MANUAL',
        verification_status: verificationStatus,
        review_notes: dto.notes ?? null,
        created_by_tenant_member_id: actor.tenantMemberId || null,
        updated_by_tenant_member_id: actor.tenantMemberId || null,
      },
      update: {
        cosec_employee_id: trimmedCosecId,
        mapping_status: mappingStatus,
        mapping_source: 'MANUAL',
        verification_status: verificationStatus,
        review_notes: dto.notes !== undefined ? dto.notes : undefined,
        updated_by_tenant_member_id: actor.tenantMemberId || null,
        updated_at: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: existing ? 'COSEC_MAPPING_UPDATED' : 'COSEC_MAPPING_CREATED',
      entityType: 'EMPLOYEE_COSEC_MAPPING',
      entityId: result.id,
      oldValues: existing
        ? {
            cosecEmployeeId: existing.cosec_employee_id,
            mappingStatus: existing.mapping_status,
          }
        : undefined,
      newValues: {
        cosecEmployeeId: trimmedCosecId,
        mappingStatus,
        verificationStatus,
        employeeId,
        employeeCode: employee.employee_code,
      },
      metadata: { notes: dto.notes },
    });

    return this.getEmployeeMapping(tenantId, employeeId);
  }

  /**
   * Remove COSEC mapping for an employee.
   */
  async removeEmployeeMapping(
    tenantId: string,
    employeeId: string,
    actor: { userId?: string; tenantMemberId?: string },
  ) {
    const existing = await this.prisma.rndtechnosoft_employee_cosec_mappings.findUnique({
      where: {
        tenant_id_employee_id: { tenant_id: tenantId, employee_id: employeeId },
      },
    });
    if (!existing) {
      return { success: true };
    }

    await this.prisma.rndtechnosoft_employee_cosec_mappings.update({
      where: { id: existing.id },
      data: {
        cosec_employee_id: null,
        mapping_status: 'MAPPING_PENDING',
        verification_status: 'UNVERIFIED',
        updated_by_tenant_member_id: actor.tenantMemberId || null,
        updated_at: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'COSEC_MAPPING_REMOVED',
      entityType: 'EMPLOYEE_COSEC_MAPPING',
      entityId: existing.id,
      oldValues: {
        cosecEmployeeId: existing.cosec_employee_id,
        mappingStatus: existing.mapping_status,
      },
      newValues: {
        cosecEmployeeId: null,
        mappingStatus: 'MAPPING_PENDING',
      },
    });

    return { success: true };
  }

  /**
   * Get reconciliation status across all employees in the workspace.
   */
  async getReconciliation(tenantId: string) {
    const [employees, mappings, isConfigured] = await Promise.all([
      this.prisma.rndtechnosoft_employees.findMany({
        where: { tenant_id: tenantId, employee_status: 'ACTIVE' },
        select: {
          id: true,
          employee_code: true,
          first_name: true,
          last_name: true,
          work_email: true,
          rndtechnosoft_employee_employments: {
            where: { effective_to: null },
            take: 1,
            include: {
              rndtechnosoft_departments: { select: { department_name: true } },
            },
          },
        },
        orderBy: { employee_code: 'asc' },
      }),
      this.prisma.rndtechnosoft_employee_cosec_mappings.findMany({
        where: { tenant_id: tenantId },
      }),
      this.isCosecConfigured(tenantId),
    ]);

    let cosecUsers: SerializedCosecUser[] = [];
    if (isConfigured) {
      try {
        cosecUsers = await this.getUsers(tenantId);
      } catch (err) {
        this.logger.warn(`Could not load COSEC users for reconciliation: ${err}`);
      }
    }

    const mappingByEmployeeId = new Map(mappings.map((m) => [m.employee_id, m]));
    const mappedCosecIds = new Set(
      mappings
        .filter((m) => m.cosec_employee_id && m.mapping_status === 'MAPPED')
        .map((m) => m.cosec_employee_id!.toUpperCase()),
    );

    const unmappedEmployees: any[] = [];
    let mappedCount = 0;
    let pendingCount = 0;
    let notFoundCount = 0;
    let reviewCount = 0;

    for (const emp of employees) {
      const mapping = mappingByEmployeeId.get(emp.id);
      const status = mapping?.mapping_status ?? 'MAPPING_PENDING';

      if (status === 'MAPPED') {
        mappedCount++;
      } else {
        if (status === 'MAPPING_PENDING') pendingCount++;
        else if (status === 'NOT_FOUND') notFoundCount++;
        else if (status === 'REQUIRES_REVIEW') reviewCount++;

        // Look for suggested match in COSEC users
        let suggestedMatch: SerializedCosecUser | null = null;
        if (cosecUsers.length > 0) {
          // By employee_code
          const byCode = cosecUsers.find(
            (cu) => (cu.cosecUserId || cu.referenceCode || '').trim().toUpperCase() === emp.employee_code.toUpperCase(),
          );
          if (byCode) {
            suggestedMatch = byCode;
          } else if (emp.work_email) {
            // By exact work_email
            const byEmail = cosecUsers.filter(
              (cu) => cu.email && cu.email.toLowerCase() === emp.work_email!.toLowerCase(),
            );
            if (byEmail.length === 1) {
              suggestedMatch = byEmail[0];
            }
          }
        }

        unmappedEmployees.push({
          employeeId: emp.id,
          employeeCode: emp.employee_code,
          name: `${emp.first_name} ${emp.last_name}`.trim(),
          workEmail: emp.work_email,
          department: emp.rndtechnosoft_employee_employments[0]?.rndtechnosoft_departments?.department_name || null,
          mappingStatus: status,
          currentCosecId: mapping?.cosec_employee_id ?? null,
          suggestedMatch: suggestedMatch
            ? {
                cosecId: (suggestedMatch.cosecUserId || suggestedMatch.referenceCode || '').trim(),
                name: suggestedMatch.name,
                email: suggestedMatch.email,
              }
            : null,
        });
      }
    }

    // Unmatched COSEC users: COSEC users that are not mapped to any active employee
    const unmatchedCosecUsers = cosecUsers
      .filter((cu) => {
        const id = (cu.cosecUserId || cu.referenceCode || '').trim().toUpperCase();
        return id && !mappedCosecIds.has(id);
      })
      .map((cu) => ({
        cosecId: (cu.cosecUserId || cu.referenceCode || '').trim(),
        name: cu.name,
        email: cu.email,
        department: cu.department,
        designation: cu.designation,
      }));

    return {
      isConfigured,
      totalEmployees: employees.length,
      totalCosecUsers: cosecUsers.length,
      mappedCount,
      pendingCount,
      notFoundCount,
      reviewCount,
      unmappedEmployees,
      unmatchedCosecUsers,
    };
  }

  /**
   * Run automated reconciliation between HRMS employees and COSEC users.
   * 3-tier matching:
   *  Tier 1: Explicit mapping already established
   *  Tier 2: Exact employee_code match
   *  Tier 3: Exact normalized email match (single match only)
   * Never matches by name alone.
   */
  async reconcile(tenantId: string, actor: { userId?: string; tenantMemberId?: string }) {
    const isConfigured = await this.isCosecConfigured(tenantId);
    if (!isConfigured) {
      throw new BadRequestException('COSEC is not configured for this workspace.');
    }

    const [employees, existingMappings, cosecUsers] = await Promise.all([
      this.prisma.rndtechnosoft_employees.findMany({
        where: { tenant_id: tenantId, employee_status: 'ACTIVE' },
      }),
      this.prisma.rndtechnosoft_employee_cosec_mappings.findMany({
        where: { tenant_id: tenantId },
      }),
      this.getUsers(tenantId),
    ]);

    const cosecById = new Map<string, SerializedCosecUser>();
    const cosecByEmail = new Map<string, SerializedCosecUser[]>();
    for (const u of cosecUsers) {
      const codeKey = (u.cosecUserId || u.referenceCode || '').trim().toUpperCase();
      if (codeKey) {
        cosecById.set(codeKey, u);
      }
      if (u.email) {
        const emailKey = u.email.trim().toLowerCase();
        const list = cosecByEmail.get(emailKey) ?? [];
        list.push(u);
        cosecByEmail.set(emailKey, list);
      }
    }

    const mappingByEmployeeId = new Map(existingMappings.map((m) => [m.employee_id, m]));
    const claimedCosecIds = new Set<string>();

    let newlyMappedCount = 0;
    let verifiedCount = 0;
    let notFoundCount = 0;
    let reviewRequiredCount = 0;

    // Track already claimed mapped COSEC IDs
    for (const m of existingMappings) {
      if (m.cosec_employee_id && m.mapping_status === 'MAPPED') {
        claimedCosecIds.add(m.cosec_employee_id.trim().toUpperCase());
      }
    }

    for (const emp of employees) {
      const existing = mappingByEmployeeId.get(emp.id);

      // Tier 1: Check existing explicit mapping
      if (existing?.cosec_employee_id) {
        const cosecKey = existing.cosec_employee_id.trim().toUpperCase();
        if (cosecById.has(cosecKey)) {
          if (existing.verification_status !== 'VERIFIED' || existing.mapping_status !== 'MAPPED') {
            await this.prisma.rndtechnosoft_employee_cosec_mappings.update({
              where: { id: existing.id },
              data: {
                verification_status: 'VERIFIED',
                mapping_status: 'MAPPED',
                updated_at: new Date(),
              },
            });
          }
          verifiedCount++;
        } else {
          // COSEC ID no longer in COSEC
          await this.prisma.rndtechnosoft_employee_cosec_mappings.update({
            where: { id: existing.id },
            data: {
              verification_status: 'FAILED',
              mapping_status: 'NOT_FOUND',
              updated_at: new Date(),
            },
          });
          notFoundCount++;
        }
        continue;
      }

      // Tier 2: Exact employee_code match
      const codeKey = emp.employee_code.trim().toUpperCase();
      const codeMatch = cosecById.get(codeKey);
      if (codeMatch && !claimedCosecIds.has(codeKey)) {
        const cosecIdVal = (codeMatch.cosecUserId || codeMatch.referenceCode || '').trim();
        await this.prisma.rndtechnosoft_employee_cosec_mappings.upsert({
          where: { tenant_id_employee_id: { tenant_id: tenantId, employee_id: emp.id } },
          create: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: emp.id,
            cosec_employee_id: cosecIdVal,
            mapping_status: 'MAPPED',
            mapping_source: 'AUTOMATIC',
            verification_status: 'VERIFIED',
            created_by_tenant_member_id: actor.tenantMemberId || null,
            updated_by_tenant_member_id: actor.tenantMemberId || null,
          },
          update: {
            cosec_employee_id: cosecIdVal,
            mapping_status: 'MAPPED',
            mapping_source: 'AUTOMATIC',
            verification_status: 'VERIFIED',
            updated_by_tenant_member_id: actor.tenantMemberId || null,
            updated_at: new Date(),
          },
        });
        claimedCosecIds.add(codeKey);
        newlyMappedCount++;
        continue;
      }

      // Tier 3: Exact email match (unambiguous 1-to-1 only)
      if (emp.work_email) {
        const emailKey = emp.work_email.trim().toLowerCase();
        const emailMatches = cosecByEmail.get(emailKey) ?? [];
        if (emailMatches.length === 1) {
          const matchedCosec = emailMatches[0];
          const cosecIdVal = (matchedCosec.cosecUserId || matchedCosec.referenceCode || '').trim();
          const matchKey = cosecIdVal.toUpperCase();
          if (matchKey && !claimedCosecIds.has(matchKey)) {
            await this.prisma.rndtechnosoft_employee_cosec_mappings.upsert({
              where: { tenant_id_employee_id: { tenant_id: tenantId, employee_id: emp.id } },
              create: {
                id: randomUUID(),
                tenant_id: tenantId,
                employee_id: emp.id,
                cosec_employee_id: cosecIdVal,
                mapping_status: 'MAPPED',
                mapping_source: 'AUTOMATIC',
                verification_status: 'VERIFIED',
                review_notes: `Matched automatically via email (${emp.work_email})`,
                created_by_tenant_member_id: actor.tenantMemberId || null,
                updated_by_tenant_member_id: actor.tenantMemberId || null,
              },
              update: {
                cosec_employee_id: cosecIdVal,
                mapping_status: 'MAPPED',
                mapping_source: 'AUTOMATIC',
                verification_status: 'VERIFIED',
                review_notes: `Matched automatically via email (${emp.work_email})`,
                updated_by_tenant_member_id: actor.tenantMemberId || null,
                updated_at: new Date(),
              },
            });
            claimedCosecIds.add(matchKey);
            newlyMappedCount++;
            continue;
          }
        } else if (emailMatches.length > 1) {
          // Ambiguous email: mark REQUIRES_REVIEW
          await this.prisma.rndtechnosoft_employee_cosec_mappings.upsert({
            where: { tenant_id_employee_id: { tenant_id: tenantId, employee_id: emp.id } },
            create: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: emp.id,
              cosec_employee_id: null,
              mapping_status: 'REQUIRES_REVIEW',
              mapping_source: 'AUTOMATIC',
              verification_status: 'FAILED',
              review_notes: `Multiple COSEC users share email ${emp.work_email}. Manual mapping required.`,
              created_by_tenant_member_id: actor.tenantMemberId || null,
              updated_by_tenant_member_id: actor.tenantMemberId || null,
            },
            update: {
              mapping_status: 'REQUIRES_REVIEW',
              review_notes: `Multiple COSEC users share email ${emp.work_email}. Manual mapping required.`,
              updated_by_tenant_member_id: actor.tenantMemberId || null,
              updated_at: new Date(),
            },
          });
          reviewRequiredCount++;
          continue;
        }
      }

      // No match: ensure MAPPING_PENDING row exists
      if (!existing) {
        await this.prisma.rndtechnosoft_employee_cosec_mappings.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: emp.id,
            cosec_employee_id: null,
            mapping_status: 'MAPPING_PENDING',
            mapping_source: 'AUTOMATIC',
            verification_status: 'UNVERIFIED',
            created_by_tenant_member_id: actor.tenantMemberId || null,
            updated_by_tenant_member_id: actor.tenantMemberId || null,
          },
        });
      }
    }

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'COSEC_RECONCILIATION_RUN',
      entityType: 'COSEC_RECONCILIATION',
      newValues: {
        newlyMappedCount,
        verifiedCount,
        notFoundCount,
        reviewRequiredCount,
        totalEmployees: employees.length,
        totalCosecUsers: cosecUsers.length,
      },
    });

    return {
      newlyMappedCount,
      verifiedCount,
      notFoundCount,
      reviewRequiredCount,
      totalEmployees: employees.length,
      totalCosecUsers: cosecUsers.length,
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
