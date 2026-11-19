import { sealAccountNumber } from '@/common/security/bank-account.util';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';
import { dateOnly, dayBefore, finalizedThrough, isoDate, lockedProblem } from '@/modules/payroll/payroll-lock';
import {
  ActivityQueryDto, ChangeStatusDto, EmploymentChangeDto, ReplaceBankAccountDto, SaveAddressDto, SaveEmergencyContactDto, UpdatePersonalDto,
} from './dto/employee-profile.dto';

type Actor = AuthenticatedTenantUser;
type Tx = Prisma.TransactionClient;

const EMPLOYMENT_NAMES = {
  rndtechnosoft_departments: { select: { id: true, department_name: true } },
  rndtechnosoft_designations: { select: { id: true, designation_name: true } },
  rndtechnosoft_branches: { select: { id: true, branch_name: true } },
  rndtechnosoft_employment_types: { select: { id: true, employment_type_name: true } },
} satisfies Prisma.rndtechnosoft_employee_employmentsInclude;

/** The job fields a new employment row carries over or changes. */
type JobFields = Pick<EmploymentRow, 'department_id' | 'designation_id' | 'branch_id' | 'employment_type_id' | 'team_id' | 'cost_center_id' | 'confirmation_date' | 'probation_end_date' | 'notice_period_days'>;

type EmploymentRow = Prisma.rndtechnosoft_employee_employmentsGetPayload<{ include: typeof EMPLOYMENT_NAMES }>;

/** Personal fields: API name → column. */
const PERSONAL_FIELDS = {
  firstName: 'first_name',
  middleName: 'middle_name',
  lastName: 'last_name',
  preferredName: 'preferred_name',
  dateOfBirth: 'date_of_birth',
  genderCode: 'gender_code',
  maritalStatus: 'marital_status',
  bloodGroup: 'blood_group',
  nationalityCountryCode: 'nationality_country_code',
  workEmail: 'work_email',
  personalEmail: 'personal_email',
  workMobile: 'work_mobile',
  personalMobile: 'personal_mobile',
  alternateMobile: 'alternate_mobile',
} as const satisfies Record<keyof UpdatePersonalDto, string>;

/** Job fields a change can set: API name → column, and how the timeline names it. */
const EMPLOYMENT_FIELDS = {
  departmentId: { column: 'department_id', label: 'Department' },
  designationId: { column: 'designation_id', label: 'Designation' },
  branchId: { column: 'branch_id', label: 'Work location' },
  employmentTypeId: { column: 'employment_type_id', label: 'Employment type' },
  confirmationDate: { column: 'confirmation_date', label: 'Confirmation date' },
  probationEndDate: { column: 'probation_end_date', label: 'Probation end date' },
  noticePeriodDays: { column: 'notice_period_days', label: 'Notice period' },
} as const;

/** Timeline wording for the audited events that concern an employee. Unknown codes are left out. */
const ACTIVITY_LABELS: Record<string, string> = {
  EMPLOYEE_CREATED: 'Employee record created',
  ONBOARDING_CANDIDATE_CONVERTED_TO_EMPLOYEE: 'Joined from onboarding',
  EMPLOYEE_PERSONAL_UPDATED: 'Personal details updated',
  EMPLOYEE_ADDRESS_UPDATED: 'Address updated',
  EMPLOYEE_EMERGENCY_CONTACT_ADDED: 'Emergency contact added',
  EMPLOYEE_EMERGENCY_CONTACT_UPDATED: 'Emergency contact updated',
  EMPLOYEE_EMERGENCY_CONTACT_REMOVED: 'Emergency contact removed',
  EMPLOYEE_EMPLOYMENT_CHANGED: 'Job changed',
  EMPLOYEE_STATUS_CHANGED: 'Employment status changed',
  EMPLOYEE_BANK_ACCOUNT_REPLACED: 'Bank account changed',
  EMPLOYEE_DOCUMENT_UPLOADED: 'Document uploaded',
  EMPLOYEE_DOCUMENT_REPLACED: 'Document replaced',
  EMPLOYEE_DOCUMENT_REMOVED: 'Document removed',
  EMPLOYEE_DOCUMENT_VERIFIED: 'Document verified',
  EMPLOYEE_DOCUMENT_REJECTED: 'Document rejected',
  EMPLOYEE_MANAGER_SET: 'Reporting manager set',
  EMPLOYEE_MANAGER_ENDED: 'Reporting line ended',
  EMPLOYEE_MANAGER_CANCELLED: 'Reporting line cancelled',
  EMPLOYEE_LOGIN_LINKED: 'Sign-in account linked',
  EMPLOYEE_LOGIN_UNLINKED: 'Sign-in account unlinked',
  SEPARATION_STARTED: 'Exit started',
  SEPARATION_RESIGNED: 'Resigned',
  SEPARATION_WITHDRAWN: 'Resignation withdrawn',
  SEPARATION_APPROVED: 'Resignation accepted',
  SEPARATION_LAST_DAY_CHANGED: 'Last working day changed',
  SEPARATION_INTERVIEW_RECORDED: 'Exit interview recorded',
  SEPARATION_CANCELLED: 'Exit cancelled',
  SEPARATION_COMPLETED: 'Exit completed',
  SALARY_REVISED: 'Salary revision recorded',
  SALARY_REVISION_CANCELLED: 'Salary revision cancelled',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active', ON_NOTICE: 'On notice', SUSPENDED: 'Suspended', INACTIVE: 'Inactive', EXITED: 'Exited', RESIGNED: 'Resigned', TERMINATED: 'Terminated',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const day = (value: Date | null | undefined) => (value ? isoDate(value) : null);
const fullName = (e: { first_name: string; middle_name?: string | null; last_name: string | null }) =>
  [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');

/**
 * The employee profile: one read of everything the People page shows about a
 * person, and the changes HR makes from it. Job changes and addresses keep
 * their history (a change ends the old row and starts a new one); every
 * change is audited, and the activity timeline is read back from that audit.
 */
@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  async profile(tenantId: string, employeeId: string, permissions: readonly string[]) {
    const employee = await this.employeeOr404(this.prisma, tenantId, employeeId);
    const today = dateOnly(todayIso());
    const canSeeBank = permissions.includes('salary.view') || permissions.includes('people.bank.update');

    const [employments, addresses, contacts, managerLine, reports, bank] = await Promise.all([
      this.prisma.rndtechnosoft_employee_employments.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId },
        include: EMPLOYMENT_NAMES,
        orderBy: [{ effective_from: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.rndtechnosoft_employee_addresses.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId, valid_to: null },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.rndtechnosoft_employee_emergency_contacts.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId },
        orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      }),
      this.prisma.rndtechnosoft_employee_reporting_lines.findFirst({
        where: this.currentLine(tenantId, today, { employee_id: employeeId }),
        orderBy: { effective_from: 'desc' },
        select: { rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees: { select: { id: true, employee_code: true, first_name: true, last_name: true } } },
      }),
      this.prisma.rndtechnosoft_employee_reporting_lines.findMany({
        where: this.currentLine(tenantId, today, { manager_employee_id: employeeId }),
        orderBy: { effective_from: 'asc' },
        select: { rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees: { select: { id: true, employee_code: true, first_name: true, last_name: true, employee_status: true } } },
      }),
      canSeeBank
        ? this.prisma.rndtechnosoft_employee_bank_accounts.findFirst({
            where: { tenant_id: tenantId, employee_id: employeeId, effective_to: null },
            orderBy: { effective_from: 'desc' },
            select: { account_holder_name: true, bank_name: true, branch_name: true, account_number_last4: true, bank_code: true, account_type: true, effective_from: true },
          })
        : Promise.resolve(null),
    ]);

    const { current, upcoming } = this.currentEmployment(employments, today);
    const manager = managerLine?.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees;

    return {
      id: employee.id,
      employeeCode: employee.employee_code,
      employeeStatus: employee.employee_status,
      hireDate: day(employee.hire_date),
      exitDate: day(employee.exit_date),
      hasSignIn: Boolean(employee.user_id),
      personal: {
        firstName: employee.first_name,
        middleName: employee.middle_name,
        lastName: employee.last_name,
        preferredName: employee.preferred_name,
        fullName: fullName(employee),
        dateOfBirth: day(employee.date_of_birth),
        genderCode: employee.gender_code,
        maritalStatus: employee.marital_status,
        bloodGroup: employee.blood_group,
        nationalityCountryCode: employee.nationality_country_code,
        workEmail: employee.work_email,
        personalEmail: employee.personal_email,
        workMobile: employee.work_mobile,
        personalMobile: employee.personal_mobile,
        alternateMobile: employee.alternate_mobile,
      },
      addresses: (['CURRENT', 'PERMANENT'] as const).map((type) => {
        const a = addresses.find((row) => row.address_type === type);
        return a
          ? { type, addressLine1: a.address_line_1, addressLine2: a.address_line_2, city: a.city, stateRegion: a.state_region, postalCode: a.postal_code, countryCode: a.country_code, validFrom: day(a.valid_from) }
          : { type, addressLine1: null, addressLine2: null, city: null, stateRegion: null, postalCode: null, countryCode: null, validFrom: null };
      }),
      emergencyContacts: contacts.map((c) => ({
        id: c.id, contactName: c.contact_name, relationship: c.relationship, mobileNumber: c.mobile_number,
        alternateMobileNumber: c.alternate_mobile_number, email: c.email, isPrimary: c.is_primary,
      })),
      employment: current ? this.employmentView(current) : null,
      upcomingEmployment: upcoming ? this.employmentView(upcoming) : null,
      employmentHistory: employments.map((row) => this.employmentView(row)),
      manager: manager ? { id: manager.id, employeeCode: manager.employee_code, name: fullName(manager) } : null,
      directReports: reports.map((line) => {
        const e = line.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees;
        return { id: e.id, employeeCode: e.employee_code, name: fullName(e), employeeStatus: e.employee_status };
      }),
      // Null when there is no account, and also when the viewer may not see pay details.
      bankAccount: bank
        ? { accountHolderName: bank.account_holder_name, bankName: bank.bank_name, branchName: bank.branch_name, accountNumberLast4: bank.account_number_last4, ifsc: bank.bank_code, accountType: bank.account_type, effectiveFrom: day(bank.effective_from) }
        : null,
      canSeeBankAccount: canSeeBank,
    };
  }

  async updatePersonal(tenantId: string, employeeId: string, input: UpdatePersonalDto, actor: Actor) {
    const employee = await this.employeeOr404(this.prisma, tenantId, employeeId);
    const data: Record<string, string | Date | null> = {};
    const changed: string[] = [];

    for (const [field, column] of Object.entries(PERSONAL_FIELDS) as [keyof UpdatePersonalDto, string][]) {
      const raw = input[field];
      if (raw === undefined) continue;
      const trimmed = typeof raw === 'string' ? raw.trim() || null : null;
      if (field === 'firstName' && !trimmed) throw new BadRequestException('First name cannot be empty.');
      const value = field === 'dateOfBirth' && trimmed ? dateOnly(trimmed) : field.endsWith('Email') && trimmed ? trimmed.toLowerCase() : trimmed;
      const before = (employee as unknown as Record<string, unknown>)[column];
      const same = value instanceof Date && before instanceof Date ? value.getTime() === before.getTime() : value === (before ?? null);
      if (same) continue;
      data[column] = value;
      changed.push(field);
    }
    if (input.dateOfBirth && input.dateOfBirth > todayIso()) throw new BadRequestException('Date of birth cannot be in the future.');
    if (changed.length === 0) return this.profileFor(tenantId, employeeId, actor);

    await this.prisma.rndtechnosoft_employees.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: employeeId } },
      data: { ...data, updated_at: new Date() },
    });
    // Field names only: the values are personal data and stay out of the audit trail.
    await this.log(tenantId, actor, 'EMPLOYEE_PERSONAL_UPDATED', employeeId, { fields: changed });
    return this.profileFor(tenantId, employeeId, actor);
  }

  /** A new address replaces the current one of its type; the old one is kept, ended today. */
  async saveAddress(tenantId: string, employeeId: string, type: 'CURRENT' | 'PERMANENT', input: SaveAddressDto, actor: Actor) {
    const today = dateOnly(todayIso());
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const existing = await tx.rndtechnosoft_employee_addresses.findFirst({ where: { tenant_id: tenantId, employee_id: employeeId, address_type: type, valid_to: null } });
      const values = {
        address_line_1: input.addressLine1.trim(),
        address_line_2: input.addressLine2?.trim() || null,
        city: input.city.trim(),
        state_region: input.stateRegion?.trim() || null,
        postal_code: input.postalCode?.trim() || null,
        country_code: input.countryCode,
      };
      // Corrected on the day it was entered: fix that row rather than keep a same-day history entry.
      if (existing && existing.valid_from && existing.valid_from.getTime() >= today.getTime()) {
        await tx.rndtechnosoft_employee_addresses.update({ where: { tenant_id_id: { tenant_id: tenantId, id: existing.id } }, data: { ...values, updated_at: new Date() } });
        return;
      }
      if (existing) {
        await tx.rndtechnosoft_employee_addresses.update({ where: { tenant_id_id: { tenant_id: tenantId, id: existing.id } }, data: { valid_to: dayBefore(today), updated_at: new Date() } });
      }
      await tx.rndtechnosoft_employee_addresses.create({
        data: { id: randomUUID(), tenant_id: tenantId, employee_id: employeeId, address_type: type, is_primary: type === 'CURRENT', valid_from: today, ...values },
      });
    });
    await this.log(tenantId, actor, 'EMPLOYEE_ADDRESS_UPDATED', employeeId, { address_type: type });
    return this.profileFor(tenantId, employeeId, actor);
  }

  async addEmergencyContact(tenantId: string, employeeId: string, input: SaveEmergencyContactDto, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const count = await tx.rndtechnosoft_employee_emergency_contacts.count({ where: { tenant_id: tenantId, employee_id: employeeId } });
      if (count >= 5) throw new BadRequestException('An employee can have at most 5 emergency contacts. Remove one first.');
      const isPrimary = input.isPrimary ?? count === 0;
      if (isPrimary) await this.clearPrimaryContact(tx, tenantId, employeeId);
      await tx.rndtechnosoft_employee_emergency_contacts.create({ data: { id: randomUUID(), tenant_id: tenantId, employee_id: employeeId, ...this.contactValues(input), is_primary: isPrimary } });
    });
    await this.log(tenantId, actor, 'EMPLOYEE_EMERGENCY_CONTACT_ADDED', employeeId, {});
    return this.profileFor(tenantId, employeeId, actor);
  }

  async updateEmergencyContact(tenantId: string, employeeId: string, contactId: string, input: SaveEmergencyContactDto, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      await this.contactOr404(tx, tenantId, employeeId, contactId);
      if (input.isPrimary) await this.clearPrimaryContact(tx, tenantId, employeeId);
      await tx.rndtechnosoft_employee_emergency_contacts.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: contactId } },
        data: { ...this.contactValues(input), ...(input.isPrimary !== undefined ? { is_primary: input.isPrimary } : {}), updated_at: new Date() },
      });
    });
    await this.log(tenantId, actor, 'EMPLOYEE_EMERGENCY_CONTACT_UPDATED', employeeId, {});
    return this.profileFor(tenantId, employeeId, actor);
  }

  async removeEmergencyContact(tenantId: string, employeeId: string, contactId: string, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      await this.contactOr404(tx, tenantId, employeeId, contactId);
      await tx.rndtechnosoft_employee_emergency_contacts.delete({ where: { tenant_id_id: { tenant_id: tenantId, id: contactId } } });
    });
    await this.log(tenantId, actor, 'EMPLOYEE_EMERGENCY_CONTACT_REMOVED', employeeId, {});
    return this.profileFor(tenantId, employeeId, actor);
  }

  /**
   * A job change from a date: the employment rows still open end the day
   * before and a new row starts, carrying over every field not changed. A date
   * inside finalized payroll is refused, since that month is never recalculated.
   */
  async changeEmployment(tenantId: string, employeeId: string, input: EmploymentChangeDto, actor: Actor) {
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const changes = await this.prisma.$transaction(async (tx) => {
      const employee = await this.lockEmployee(tx, tenantId, employeeId);
      if (employee.employee_status === 'EXITED') throw new BadRequestException('This employee has exited; their job can no longer change.');

      const locked = lockedProblem(effectiveFrom, await finalizedThrough(tx, tenantId, employeeId), 'a job change');
      if (locked) throw new BadRequestException(locked);

      const open = await tx.rndtechnosoft_employee_employments.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId, effective_to: null },
        include: EMPLOYMENT_NAMES,
        orderBy: { effective_from: 'desc' },
      });
      const base = open[0];
      if (base && effectiveFrom.getTime() <= base.effective_from.getTime()) {
        throw new BadRequestException(`The current job record starts on ${isoDate(base.effective_from)}, so a change must start after that day.`);
      }

      const next: JobFields = {
        department_id: base?.department_id ?? null,
        designation_id: base?.designation_id ?? null,
        branch_id: base?.branch_id ?? null,
        employment_type_id: base?.employment_type_id ?? null,
        team_id: base?.team_id ?? null,
        cost_center_id: base?.cost_center_id ?? null,
        confirmation_date: base?.confirmation_date ?? null,
        probation_end_date: base?.probation_end_date ?? null,
        notice_period_days: base?.notice_period_days ?? null,
      };
      const changed: string[] = [];
      for (const [field, { column, label }] of Object.entries(EMPLOYMENT_FIELDS) as [keyof typeof EMPLOYMENT_FIELDS, { column: string; label: string }][]) {
        const raw = input[field];
        if (raw === undefined) continue;
        const value = raw === null ? null : field.endsWith('Date') ? dateOnly(String(raw)) : raw;
        const before = next[column as keyof JobFields];
        const same = value instanceof Date && before instanceof Date ? value.getTime() === before.getTime() : value === before;
        if (same) continue;
        Object.assign(next, { [column]: value });
        changed.push(label);
      }
      if (changed.length === 0) throw new BadRequestException('Nothing changes: every value is the same as the current job record.');

      await tx.rndtechnosoft_employee_employments.updateMany({
        where: { tenant_id: tenantId, employee_id: employeeId, effective_to: null },
        data: { effective_to: dayBefore(effectiveFrom), updated_at: new Date() },
      });
      const created = await tx.rndtechnosoft_employee_employments.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: employeeId,
          ...next,
          joining_date: base?.joining_date ?? employee.hire_date ?? effectiveFrom,
          termination_date: null,
          effective_from: effectiveFrom,
          employment_status: base?.employment_status ?? 'CONFIRMED',
        },
        include: EMPLOYMENT_NAMES,
      });

      // Names, not ids, so the timeline reads the same after a department is renamed or archived.
      const before = base ? this.employmentView(base) : null;
      const after = this.employmentView(created);
      return changed.map((field) => ({ field, from: this.labelOf(field, before), to: this.labelOf(field, after) }));
    });

    await this.log(tenantId, actor, 'EMPLOYEE_EMPLOYMENT_CHANGED', employeeId, { effective_from: input.effectiveFrom, reason: input.reason.trim(), changes });
    return this.profileFor(tenantId, employeeId, actor);
  }

  async changeStatus(tenantId: string, employeeId: string, input: ChangeStatusDto, actor: Actor) {
    const from = await this.prisma.$transaction(async (tx) => {
      const employee = await this.lockEmployee(tx, tenantId, employeeId);
      if (employee.employee_status === 'EXITED') {
        throw new BadRequestException('This employee has exited through Offboarding; that cannot be undone from here.');
      }
      if (employee.employee_status === input.status) throw new ConflictException(`The status is already ${STATUS_LABELS[input.status] ?? input.status}.`);
      await tx.rndtechnosoft_employees.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: employeeId } },
        data: { employee_status: input.status, updated_at: new Date() },
      });
      return employee.employee_status;
    });
    await this.log(tenantId, actor, 'EMPLOYEE_STATUS_CHANGED', employeeId, { from, to: input.status, reason: input.reason.trim() });
    return this.profileFor(tenantId, employeeId, actor);
  }

  /**
   * Replaces the account salary is paid into, from a date: the current account
   * ends the day before. Only the last four digits are ever returned or audited.
   */
  async replaceBankAccount(tenantId: string, employeeId: string, input: ReplaceBankAccountDto, actor: Actor) {
    const effectiveFrom = dateOnly(input.effectiveFrom);
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const locked = lockedProblem(effectiveFrom, await finalizedThrough(tx, tenantId, employeeId), 'a bank account change');
      if (locked) throw new BadRequestException(locked);
      const open = await tx.rndtechnosoft_employee_bank_accounts.findFirst({
        where: { tenant_id: tenantId, employee_id: employeeId, effective_to: null },
        orderBy: { effective_from: 'desc' },
      });
      if (open && effectiveFrom.getTime() <= open.effective_from.getTime()) {
        throw new BadRequestException(`The current account is in use from ${isoDate(open.effective_from)}, so the new one must start after that day.`);
      }
      await tx.rndtechnosoft_employee_bank_accounts.updateMany({
        where: { tenant_id: tenantId, employee_id: employeeId, effective_to: null },
        data: { effective_to: dayBefore(effectiveFrom), updated_at: new Date() },
      });
      await tx.rndtechnosoft_employee_bank_accounts.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: employeeId,
          account_holder_name: input.accountHolderName.trim(),
          bank_name: input.bankName.trim(),
          branch_name: input.branchName?.trim() || null,
          ...sealAccountNumber(input.accountNumber),
          bank_code_type: 'IFSC',
          bank_code: input.bankCode,
          account_type: input.accountType ?? 'SAVINGS',
          effective_from: effectiveFrom,
          bank_account_status: 'ACTIVE',
        },
      });
    });
    await this.log(tenantId, actor, 'EMPLOYEE_BANK_ACCOUNT_REPLACED', employeeId, { effective_from: input.effectiveFrom, last4: input.accountNumber.slice(-4) });
    return this.profileFor(tenantId, employeeId, actor);
  }

  /**
   * What happened to this employee, newest first, from the audit trail: their
   * own record, their exit, their onboarding conversion, and (for people who
   * may see pay) salary revisions. Only curated wording and safe details are
   * returned, never raw audit values.
   */
  async activity(tenantId: string, employeeId: string, query: ActivityQueryDto, permissions: readonly string[]) {
    await this.employeeOr404(this.prisma, tenantId, employeeId);
    const [separations, assignments] = await Promise.all([
      this.prisma.rndtechnosoft_employee_separations.findMany({ where: { tenant_id: tenantId, employee_id: employeeId }, select: { id: true } }),
      permissions.includes('salary.view')
        ? this.prisma.rndtechnosoft_employee_salary_assignments.findMany({ where: { tenant_id: tenantId, employee_id: employeeId }, select: { id: true } })
        : Promise.resolve([]),
    ]);

    const sources: Prisma.rndtechnosoft_audit_logsWhereInput[] = [
      { entity_type: 'EMPLOYEE', entity_id: employeeId },
      { entity_type: 'CANDIDATE', action_code: 'ONBOARDING_CANDIDATE_CONVERTED_TO_EMPLOYEE', new_values: { path: ['employeeId'], equals: employeeId } },
    ];
    if (separations.length) sources.push({ entity_type: 'EMPLOYEE_SEPARATION', entity_id: { in: separations.map((s) => s.id) } });
    if (assignments.length) sources.push({ entity_type: 'SALARY_ASSIGNMENT', entity_id: { in: assignments.map((a) => a.id) } });

    const limit = query.limit ?? 30;
    const rows = await this.prisma.rndtechnosoft_audit_logs.findMany({
      where: {
        tenant_id: tenantId,
        action_code: { in: Object.keys(ACTIVITY_LABELS) },
        OR: sources,
        ...(query.before ? { occurred_at: { lt: new Date(query.before) } } : {}),
      },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, occurred_at: true, action_code: true, actor_user_id: true, metadata: true },
    });
    const page = rows.slice(0, limit);
    const actorIds = [...new Set(page.map((r) => r.actor_user_id).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await this.prisma.rndtechnosoft_users.findMany({ where: { id: { in: actorIds } }, select: { id: true, display_name: true, email: true } })
      : [];

    return {
      items: page.map((row) => {
        const actor = actors.find((a) => a.id === row.actor_user_id);
        return {
          id: row.id,
          at: row.occurred_at.toISOString(),
          action: row.action_code,
          label: ACTIVITY_LABELS[row.action_code],
          detail: this.activityDetail(row.action_code, row.metadata),
          actor: actor ? actor.display_name || actor.email : null,
        };
      }),
      next: rows.length > limit ? page[page.length - 1].occurred_at.toISOString() : null,
    };
  }

  /** The employee, or 404 when it does not exist in this workspace (never saying whether it exists elsewhere). */
  async employeeOr404(db: Tx | PrismaService, tenantId: string, employeeId: string) {
    const employee = await db.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  /** Serialises changes to one employee: concurrent edits wait instead of both closing the same row. */
  private async lockEmployee(tx: Tx, tenantId: string, employeeId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM rndtechnosoft_employees WHERE tenant_id = ${tenantId}::uuid AND id = ${employeeId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Employee not found.');
    return this.employeeOr404(tx, tenantId, employeeId);
  }

  private async profileFor(tenantId: string, employeeId: string, actor: Actor) {
    return this.profile(tenantId, employeeId, await this.access.getMemberPermissions(tenantId, actor.tenantMemberId));
  }

  private currentLine(tenantId: string, today: Date, who: Prisma.rndtechnosoft_employee_reporting_linesWhereInput): Prisma.rndtechnosoft_employee_reporting_linesWhereInput {
    return {
      tenant_id: tenantId,
      ...who,
      relationship_type: 'PRIMARY',
      line_status: 'ACTIVE',
      effective_from: { lte: today },
      OR: [{ effective_to: null }, { effective_to: { gte: today } }],
    };
  }

  /** The row in effect today; for someone who has not started yet, the row they start with. */
  private currentEmployment(rows: EmploymentRow[], today: Date) {
    const live = rows.filter((r) => !r.effective_to || r.effective_to.getTime() >= today.getTime());
    const current = live.find((r) => r.effective_from.getTime() <= today.getTime()) ?? live[live.length - 1] ?? null;
    const upcoming = current && current.effective_from.getTime() <= today.getTime()
      ? live.filter((r) => r.effective_from.getTime() > today.getTime()).pop() ?? null
      : null;
    return { current, upcoming };
  }

  private employmentView(row: EmploymentRow) {
    return {
      id: row.id,
      effectiveFrom: isoDate(row.effective_from),
      effectiveTo: day(row.effective_to),
      joiningDate: isoDate(row.joining_date),
      confirmationDate: day(row.confirmation_date),
      probationEndDate: day(row.probation_end_date),
      noticePeriodDays: row.notice_period_days,
      employmentStatus: row.employment_status,
      department: row.rndtechnosoft_departments ? { id: row.rndtechnosoft_departments.id, name: row.rndtechnosoft_departments.department_name } : null,
      designation: row.rndtechnosoft_designations ? { id: row.rndtechnosoft_designations.id, name: row.rndtechnosoft_designations.designation_name } : null,
      branch: row.rndtechnosoft_branches ? { id: row.rndtechnosoft_branches.id, name: row.rndtechnosoft_branches.branch_name } : null,
      employmentType: row.rndtechnosoft_employment_types ? { id: row.rndtechnosoft_employment_types.id, name: row.rndtechnosoft_employment_types.employment_type_name } : null,
    };
  }

  private labelOf(field: string, view: ReturnType<EmployeeProfileService['employmentView']> | null): string | null {
    if (!view) return null;
    switch (field) {
      case 'Department': return view.department?.name ?? null;
      case 'Designation': return view.designation?.name ?? null;
      case 'Work location': return view.branch?.name ?? null;
      case 'Employment type': return view.employmentType?.name ?? null;
      case 'Confirmation date': return view.confirmationDate;
      case 'Probation end date': return view.probationEndDate;
      case 'Notice period': return view.noticePeriodDays === null ? null : `${view.noticePeriodDays} days`;
      default: return null;
    }
  }

  /** One readable line per event from values this module wrote itself; nothing else is passed through. */
  private activityDetail(action: string, metadata: Prisma.JsonValue): string | null {
    const m = (metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    switch (action) {
      case 'EMPLOYEE_PERSONAL_UPDATED':
        return Array.isArray(m.fields) ? `Changed: ${m.fields.filter((f): f is string => typeof f === 'string').map((f) => f.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}` : null;
      case 'EMPLOYEE_ADDRESS_UPDATED':
        return m.address_type === 'PERMANENT' ? 'Permanent address' : 'Current address';
      case 'EMPLOYEE_EMPLOYMENT_CHANGED': {
        const changes = Array.isArray(m.changes) ? (m.changes as { field?: unknown; from?: unknown; to?: unknown }[]) : [];
        const parts = changes.map((c) => `${text(c.field) ?? 'Field'}: ${text(c.from) ?? '—'} → ${text(c.to) ?? '—'}`);
        return [`From ${text(m.effective_from) ?? '?'}`, ...parts, text(m.reason) ? `Reason: ${text(m.reason)}` : null].filter(Boolean).join(' · ');
      }
      case 'EMPLOYEE_STATUS_CHANGED':
        return `${STATUS_LABELS[text(m.from) ?? ''] ?? text(m.from)} → ${STATUS_LABELS[text(m.to) ?? ''] ?? text(m.to)}${text(m.reason) ? ` · ${text(m.reason)}` : ''}`;
      case 'EMPLOYEE_DOCUMENT_UPLOADED':
      case 'EMPLOYEE_DOCUMENT_REPLACED':
      case 'EMPLOYEE_DOCUMENT_VERIFIED':
      case 'EMPLOYEE_DOCUMENT_REMOVED':
      case 'EMPLOYEE_DOCUMENT_REJECTED':
        return [text(m.title), text(m.reason)].filter(Boolean).join(' · ') || null;
      case 'EMPLOYEE_BANK_ACCOUNT_REPLACED':
        return `Account ending ${text(m.last4) ?? '····'} from ${text(m.effective_from) ?? '?'}`;
      default:
        return null;
    }
  }

  private async clearPrimaryContact(tx: Tx, tenantId: string, employeeId: string) {
    await tx.rndtechnosoft_employee_emergency_contacts.updateMany({ where: { tenant_id: tenantId, employee_id: employeeId, is_primary: true }, data: { is_primary: false } });
  }

  private async contactOr404(tx: Tx, tenantId: string, employeeId: string, contactId: string) {
    const contact = await tx.rndtechnosoft_employee_emergency_contacts.findFirst({ where: { tenant_id: tenantId, employee_id: employeeId, id: contactId } });
    if (!contact) throw new NotFoundException('Emergency contact not found.');
    return contact;
  }

  private contactValues(input: SaveEmergencyContactDto) {
    return {
      contact_name: input.contactName.trim(),
      relationship: input.relationship?.trim() || null,
      mobile_number: input.mobileNumber.trim(),
      alternate_mobile_number: input.alternateMobileNumber?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
    };
  }

  private log(tenantId: string, actor: Actor, actionCode: string, employeeId: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMPLOYEE', entityId: employeeId, metadata });
  }
}
