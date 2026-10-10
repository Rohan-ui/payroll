import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, dayBefore, finalizedThrough, isOverlapViolation, isoDate, lockedProblem } from '@/modules/payroll/payroll-lock';
import { PayrollPoliciesService } from '@/modules/payroll/policies/payroll-policies.service';
import { PayrollPolicyConfig } from '@/modules/payroll/policies/policy-config';
import { PayrollCalculationService } from '@/modules/payroll/calculation/payroll-calculation.service';
import { calculateStructure, checkStructure } from './formula/structure-engine';
import { monthDays, rateVariables } from './formula/salary-variables';
import { SYSTEM_VARIABLES } from './formula/variables';
import { engineLines } from './salary-structures.service';
import { SalaryRevisionDto } from './dto/salary.dto';

type Tx = Prisma.TransactionClient;
const COMPONENT = 'rndtechnosoft_salary_components_rndtechnosoft_salary_structure_components_tenant_id_salary_component_idTorndtechnosoft_salary_components' as const;
const D = (v: string | number) => new Prisma.Decimal(v);
const memberName = { select: { rndtechnosoft_users: { select: { display_name: true } } } } as const;

/**
 * Employee salaries. A salary is never edited: a revision closes the current
 * one on the day before it starts and adds a new one, so every past month
 * keeps the salary it was paid on.
 */
@Injectable()
export class SalaryAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policies: PayrollPoliciesService,
    private readonly calculation: PayrollCalculationService,
  ) {}

  async employeeSalary(tenantId: string, employeeId: string) {
    const employee = await this.employee(tenantId, employeeId);
    const assignments = await this.prisma.rndtechnosoft_employee_salary_assignments.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId },
      orderBy: [{ effective_from: 'desc' }, { created_at: 'desc' }],
      take: 100,
      include: {
        rndtechnosoft_salary_structures: { select: { id: true, salary_structure_code: true, salary_structure_name: true } },
        rndtechnosoft_payroll_policies: { select: { id: true, policy_code: true, policy_name: true } },
        rndtechnosoft_employee_salary_component_values: { include: { rndtechnosoft_salary_components: { select: { component_code: true, component_name: true } } } },
        created_by: memberName,
        cancelled_by: memberName,
      },
    });
    const today = dateOnly(isoDate(new Date()));
    const active = assignments.filter((a) => a.assignment_status === 'ACTIVE');
    const current = active.find((a) => a.effective_from <= today && (!a.effective_to || a.effective_to >= today)) ?? null;
    const future = active.filter((a) => a.effective_from > today);
    const upcoming = future.length ? future[future.length - 1] : null;
    const shown = current ?? upcoming;
    const policy = shown ? await this.policies.resolve(tenantId, employeeId, shown.effective_from > today ? shown.effective_from : today, shown.payroll_policy_id) : null;
    const locked = await finalizedThrough(this.prisma, tenantId, employeeId);
    const arrears = await this.prisma.rndtechnosoft_salary_arrears.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId },
      orderBy: { created_at: 'desc' },
      take: 100,
      include: { rndtechnosoft_payroll_periods: { select: { period_start: true, period_end: true } } },
    });
    return {
      arrears: arrears.map((a) => ({
        id: a.id, salaryAssignmentId: a.salary_assignment_id, status: a.arrears_status,
        period: { start: isoDate(a.rndtechnosoft_payroll_periods.period_start), end: isoDate(a.rndtechnosoft_payroll_periods.period_end) },
        paid: a.paid_earnings.toFixed(2), revised: a.revised_earnings.toFixed(2), amount: a.arrears_amount.toFixed(2), includedAt: a.included_at,
      })),
      employee: { id: employee.id, employeeCode: employee.employee_code, name: [employee.first_name, employee.last_name].filter(Boolean).join(' ') },
      lockedThrough: locked ? isoDate(locked) : null,
      currentId: current?.id ?? null,
      upcomingId: upcoming?.id ?? null,
      policy,
      estimate: shown && policy?.version ? await this.estimate(tenantId, shown, policy.version.config, shown.effective_from > today ? shown.effective_from : today) : null,
      history: assignments.map((a) => ({
        id: a.id,
        status: a.assignment_status,
        effectiveFrom: isoDate(a.effective_from),
        effectiveTo: a.effective_to ? isoDate(a.effective_to) : null,
        structure: { id: a.rndtechnosoft_salary_structures.id, code: a.rndtechnosoft_salary_structures.salary_structure_code, name: a.rndtechnosoft_salary_structures.salary_structure_name },
        policy: a.rndtechnosoft_payroll_policies && { id: a.rndtechnosoft_payroll_policies.id, code: a.rndtechnosoft_payroll_policies.policy_code, name: a.rndtechnosoft_payroll_policies.policy_name },
        payBasis: a.pay_basis,
        monthlySalary: a.monthly_gross_target?.toFixed() ?? null,
        annualCtc: a.annual_ctc?.toFixed() ?? null,
        baseRate: a.base_rate?.toFixed() ?? null,
        currencyCode: a.currency_code,
        isOvertimeEligible: a.is_overtime_eligible,
        paymentMethod: a.payment_method,
        changeReason: a.change_reason,
        createdAt: a.created_at,
        createdBy: a.created_by?.rndtechnosoft_users.display_name ?? null,
        cancelledAt: a.cancelled_at,
        cancelledBy: a.cancelled_by?.rndtechnosoft_users.display_name ?? null,
        cancellationReason: a.cancellation_reason,
        componentValues: a.rndtechnosoft_employee_salary_component_values.map((v) => ({
          salaryComponentId: v.salary_component_id,
          code: v.rndtechnosoft_salary_components.component_code,
          name: v.rndtechnosoft_salary_components.component_name,
          amount: v.amount?.toFixed() ?? null,
          percentage: v.percentage?.toFixed() ?? null,
        })),
      })),
    };
  }

  /** Records a new salary from a date; the salary before it ends the day before. */
  async revise(tenantId: string, employeeId: string, input: SalaryRevisionDto, actor: AuthenticatedTenantUser) {
    await this.employee(tenantId, employeeId);
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const lockedThrough = await finalizedThrough(this.prisma, tenantId, employeeId);
    const locked = lockedProblem(effectiveFrom, lockedThrough, 'a salary change');
    if (locked) throw new BadRequestException(`${locked} To pay the new salary for earlier months, add arrears from the date it should have started.`);
    if (input.arrearsFrom) {
      if (!lockedThrough || dateOnly(input.arrearsFrom) > lockedThrough) throw new BadRequestException('Arrears are only for months whose payroll is finalized. For a later date, start the salary from that date instead.');
      if (input.arrearsFrom >= input.effectiveFrom) throw new BadRequestException('Arrears must start before the new salary does.');
    }

    if (input.payBasis === 'MONTHLY' && !input.monthlySalary) throw new BadRequestException('Enter the monthly salary.');
    if (input.payBasis !== 'MONTHLY' && !input.baseRate) throw new BadRequestException(`Enter the ${input.payBasis === 'DAILY' ? 'daily' : 'hourly'} rate.`);
    if (input.baseRate && D(input.baseRate).lte(0)) throw new BadRequestException('The rate must be more than zero.');

    const structure = await this.prisma.rndtechnosoft_salary_structures.findFirst({ where: { tenant_id: tenantId, id: input.salaryStructureId }, select: { id: true, structure_status: true, salary_structure_code: true } });
    if (!structure) throw new NotFoundException('Salary structure not found.');
    if (structure.structure_status !== 'ACTIVE') throw new BadRequestException('This salary structure is archived.');
    const version = await this.versionInForce(this.prisma, tenantId, structure.id, effectiveFrom);
    if (!version) throw new BadRequestException(`${structure.salary_structure_code} has no published version in force on ${input.effectiveFrom}. Publish one first.`);

    if (input.payrollPolicyId) {
      const policy = await this.prisma.rndtechnosoft_payroll_policies.findFirst({ where: { tenant_id: tenantId, id: input.payrollPolicyId }, select: { policy_status: true } });
      if (!policy) throw new NotFoundException('Payroll policy not found.');
      if (policy.policy_status !== 'ACTIVE') throw new BadRequestException('This payroll policy is archived.');
    }

    // The employee's own values must belong to the structure, and fixed or
    // percentage lines without a default need one.
    const lines = version.rndtechnosoft_salary_structure_components;
    const byComponent = new Map(lines.map((l) => [l.salary_component_id, l]));
    const ids = input.componentValues.map((v) => v.salaryComponentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A component has more than one value.');
    for (const value of input.componentValues) {
      const line = byComponent.get(value.salaryComponentId);
      if (!line) throw new BadRequestException('A value was given for a component that is not in this structure.');
      const component = line[COMPONENT];
      if (component.calculation_type === 'FIXED' && (!value.amount || value.percentage)) throw new BadRequestException(`${component.component_code} is a fixed amount: give an amount.`);
      if (component.calculation_type === 'PERCENTAGE' && (!value.percentage || value.amount)) throw new BadRequestException(`${component.component_code} is a percentage: give a percentage.`);
      if (!['FIXED', 'PERCENTAGE'].includes(component.calculation_type)) throw new BadRequestException(`${component.component_code} is worked out by ${component.calculation_type === 'FORMULA' ? 'its formula' : 'payroll'}, so it takes no value here.`);
    }
    const given = new Set(ids);
    const missing = lines.filter((l) => !given.has(l.salary_component_id) && (
      (l[COMPONENT].calculation_type === 'FIXED' && !l.default_amount) || (l[COMPONENT].calculation_type === 'PERCENTAGE' && !l.default_percentage)
    ));
    if (missing.length) {
      throw new BadRequestException(`The structure has no default for ${missing.map((l) => l[COMPONENT].component_code).join(', ')}: give ${missing.length === 1 ? 'it a value' : 'them values'} for this employee.`);
    }

    const id = randomUUID();
    const arrears = input.arrearsFrom ? await this.arrears(tenantId, employeeId, id, input, structure.id, lines) : [];

    const previousId = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const later = await tx.rndtechnosoft_employee_salary_assignments.findFirst({
        where: { tenant_id: tenantId, employee_id: employeeId, assignment_status: 'ACTIVE', effective_from: { gte: effectiveFrom } },
        orderBy: { effective_from: 'asc' },
        select: { effective_from: true },
      });
      if (later) {
        throw new ConflictException(`A salary from ${isoDate(later.effective_from)} is already recorded. Cancel it first, or choose a date after it.`);
      }
      const previous = await tx.rndtechnosoft_employee_salary_assignments.findFirst({
        where: { tenant_id: tenantId, employee_id: employeeId, assignment_status: 'ACTIVE', effective_from: { lt: effectiveFrom }, OR: [{ effective_to: null }, { effective_to: { gte: effectiveFrom } }] },
        select: { id: true },
      });
      if (previous) {
        await tx.rndtechnosoft_employee_salary_assignments.update({ where: { tenant_id_id: { tenant_id: tenantId, id: previous.id } }, data: { effective_to: dayBefore(effectiveFrom), updated_at: new Date() } });
      }
      await tx.rndtechnosoft_employee_salary_assignments.create({
        data: {
          id,
          tenant_id: tenantId,
          employee_id: employeeId,
          salary_structure_id: structure.id,
          payroll_policy_id: input.payrollPolicyId ?? null,
          pay_basis: input.payBasis,
          monthly_gross_target: input.payBasis === 'MONTHLY' && input.monthlySalary ? D(input.monthlySalary) : null,
          annual_ctc: input.annualCtc ? D(input.annualCtc) : null,
          base_rate: input.payBasis !== 'MONTHLY' && input.baseRate ? D(input.baseRate) : null,
          currency_code: input.currencyCode,
          effective_from: effectiveFrom,
          is_overtime_eligible: input.isOvertimeEligible,
          payment_method: input.paymentMethod,
          change_reason: input.changeReason.trim(),
          created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      if (input.componentValues.length) {
        await tx.rndtechnosoft_employee_salary_component_values.createMany({
          data: input.componentValues.map((v) => ({
            id: randomUUID(),
            tenant_id: tenantId,
            employee_salary_assignment_id: id,
            salary_component_id: v.salaryComponentId,
            amount: v.amount ? D(v.amount) : null,
            percentage: v.percentage ? D(v.percentage) : null,
            effective_from: effectiveFrom,
          })),
        });
      }
      if (arrears.length) {
        await tx.rndtechnosoft_salary_arrears.createMany({
          data: arrears.map((a) => ({
            id: randomUUID(), tenant_id: tenantId, employee_id: employeeId, salary_assignment_id: id, payroll_period_id: a.periodId,
            paid_earnings: a.paid, revised_earnings: a.revised, arrears_amount: a.amount, calculation_detail: a.detail as Prisma.InputJsonValue,
            arrears_status: 'PENDING', created_by_tenant_member_id: actor.tenantMemberId,
          })),
        });
      }
      return previous?.id ?? null;
    }).catch((e) => {
      if (isOverlapViolation(e)) throw new ConflictException('This salary’s dates overlap another salary of this employee. Reload and try again.');
      throw e;
    });
    // Amounts stay in the salary history itself, not in the audit trail.
    await this.log(tenantId, actor, 'SALARY_REVISED', id, {
      employee_id: employeeId, previous_assignment_id: previousId, structure: structure.salary_structure_code, effective_from: input.effectiveFrom,
      pay_basis: input.payBasis, policy_id: input.payrollPolicyId ?? null, reason: input.changeReason.trim(),
      arrears_from: input.arrearsFrom ?? null, arrears_months: arrears.length,
    });
    return this.employeeSalary(tenantId, employeeId);
  }

  /**
   * Cancels the latest salary revision if no payroll has used it; the salary
   * before it applies again from then on.
   */
  async cancel(tenantId: string, assignmentId: string, reason: string, actor: AuthenticatedTenantUser) {
    const assignment = await this.prisma.rndtechnosoft_employee_salary_assignments.findFirst({ where: { tenant_id: tenantId, id: assignmentId } });
    if (!assignment) throw new NotFoundException('Salary revision not found.');
    if (assignment.assignment_status !== 'ACTIVE') throw new BadRequestException('This salary revision is already cancelled.');
    const usedByPayroll = await this.prisma.rndtechnosoft_payroll_run_employees.count({ where: { tenant_id: tenantId, salary_assignment_id: assignmentId } });
    if (usedByPayroll) throw new BadRequestException('Payroll has already been calculated with this salary, so it can’t be cancelled. Record a new revision instead.');
    const paidArrears = await this.prisma.rndtechnosoft_salary_arrears.count({ where: { tenant_id: tenantId, salary_assignment_id: assignmentId, arrears_status: 'INCLUDED' } });
    if (paidArrears) throw new BadRequestException('Arrears from this salary have already been paid, so it can’t be cancelled. Record a new revision instead.');
    const locked = lockedProblem(assignment.effective_from, await finalizedThrough(this.prisma, tenantId, assignment.employee_id), 'a salary change');
    if (locked) throw new BadRequestException(locked);

    const reopened = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, assignment.employee_id);
      const later = await tx.rndtechnosoft_employee_salary_assignments.count({
        where: { tenant_id: tenantId, employee_id: assignment.employee_id, assignment_status: 'ACTIVE', effective_from: { gt: assignment.effective_from } },
      });
      if (later) throw new BadRequestException('A later salary revision exists. Only the latest revision can be cancelled.');
      await tx.rndtechnosoft_salary_arrears.updateMany({ where: { tenant_id: tenantId, salary_assignment_id: assignmentId, arrears_status: 'PENDING' }, data: { arrears_status: 'CANCELLED', updated_at: new Date() } });
      await tx.rndtechnosoft_employee_salary_assignments.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: assignmentId } },
        data: { assignment_status: 'CANCELLED', cancelled_at: new Date(), cancelled_by_tenant_member_id: actor.tenantMemberId, cancellation_reason: reason.trim(), updated_at: new Date() },
      });
      const previous = await tx.rndtechnosoft_employee_salary_assignments.findFirst({
        where: { tenant_id: tenantId, employee_id: assignment.employee_id, assignment_status: 'ACTIVE', effective_to: dayBefore(assignment.effective_from) },
        select: { id: true },
      });
      if (previous) {
        await tx.rndtechnosoft_employee_salary_assignments.update({ where: { tenant_id_id: { tenant_id: tenantId, id: previous.id } }, data: { effective_to: assignment.effective_to, updated_at: new Date() } });
      }
      return previous?.id ?? null;
    });
    await this.log(tenantId, actor, 'SALARY_REVISION_CANCELLED', assignmentId, { employee_id: assignment.employee_id, effective_from: isoDate(assignment.effective_from), reopened_assignment_id: reopened, reason: reason.trim() });
    return this.employeeSalary(tenantId, assignment.employee_id);
  }

  /**
   * A full month of this salary with no unpaid days, under the employee's
   * policy. Attendance-based values (late marks, overtime) use samples and
   * system-calculated lines are 0: payroll works them out from attendance.
   */
  private async estimate(
    tenantId: string,
    assignment: { salary_structure_id: string; pay_basis: string; monthly_gross_target: Prisma.Decimal | null; annual_ctc: Prisma.Decimal | null; base_rate: Prisma.Decimal | null; rndtechnosoft_employee_salary_component_values: { salary_component_id: string; amount: Prisma.Decimal | null; percentage: Prisma.Decimal | null; rndtechnosoft_salary_components: { component_code: string } }[] },
    policy: PayrollPolicyConfig,
    onDate: Date,
  ) {
    const version = await this.versionInForce(this.prisma, tenantId, assignment.salary_structure_id, onDate);
    if (!version) return { month: isoDate(onDate).slice(0, 7), problems: [{ code: null, message: 'The structure has no published version in force for this month.' }], lines: [], totals: null };
    const days = monthDays(onDate.getUTCFullYear(), onDate.getUTCMonth() + 1, policy.weeklyOffDays);
    const rates = rateVariables(
      { payBasis: assignment.pay_basis as 'MONTHLY' | 'DAILY' | 'HOURLY', monthlySalary: assignment.monthly_gross_target, annualCtc: assignment.annual_ctc, baseRate: assignment.base_rate },
      policy,
      days,
    );
    const variables: Record<string, Prisma.Decimal> = {};
    for (const v of SYSTEM_VARIABLES) if (v.group !== 'Salary') variables[v.name] = D(v.sample);
    const hours = D(days.workingDays).times(D(policy.hoursPerDay));
    Object.assign(variables, {
      PRORATION: D(1), PAID_DAYS: D(days.calendarDays), UNPAID_DAYS: D(0), PRESENT_DAYS: D(days.workingDays), WEEKLY_OFFS: D(days.weeklyOffs), HOLIDAYS: D(0),
      WORKED_HOURS: hours, PAYABLE_HOURS: hours,
    }, rates.values);
    const lines = engineLines(version.rndtechnosoft_salary_structure_components);
    const overrides = Object.fromEntries(assignment.rndtechnosoft_employee_salary_component_values.map((v) => [v.rndtechnosoft_salary_components.component_code, { amount: v.amount, percentage: v.percentage }]));
    const provided = Object.fromEntries(lines.filter((l) => l.calculationType === 'SYSTEM_CALCULATED').map((l) => [l.code, { amount: D(0), note: 'Worked out by payroll from attendance and records; 0 in this estimate' }]));
    const result = calculateStructure(lines, checkStructure(lines), { variables, overrides, provided });
    const money = (v: Prisma.Decimal) => v.toFixed(2);
    return {
      month: isoDate(onDate).slice(0, 7),
      version: version.version_number,
      problems: [...rates.problems.map((message) => ({ code: null, message })), ...result.problems],
      lines: result.lines.map((l) => ({ code: l.code, name: l.name, category: l.category, amount: l.amount.toFixed(), steps: l.steps })),
      totals: { gross: money(result.gross), earnings: money(result.totalEarnings), deductions: money(result.totalDeductions), employerContributions: money(result.employerContributions), net: money(result.net) },
    };
  }

  /**
   * The arrears a back-dated salary creates: each finalized month from the
   * arrears date worked out again on the new salary, minus what its payslip
   * paid. Only increases are paid as arrears; nothing finalized changes.
   */
  private async arrears(
    tenantId: string, employeeId: string, assignmentId: string, input: SalaryRevisionDto, structureId: string,
    lines: { salary_component_id: string; [COMPONENT]: { component_code: string } }[],
  ) {
    const from = dateOnly(input.arrearsFrom as string);
    const slips = await this.prisma.rndtechnosoft_payslips.findMany({
      where: {
        tenant_id: tenantId, employee_id: employeeId, payslip_status: 'FINALIZED',
        rndtechnosoft_payroll_periods: { period_end: { gte: from }, period_start: { lt: dateOnly(input.effectiveFrom) } },
      },
      include: { rndtechnosoft_payroll_periods: true, rndtechnosoft_payslip_lines: true },
      orderBy: { rndtechnosoft_payroll_periods: { period_start: 'asc' } },
    });
    if (!slips.length) throw new BadRequestException(`No finalized payslip of this employee covers ${input.arrearsFrom} onwards, so there is nothing to pay arrears on.`);
    const codes = new Map(lines.map((l) => [l.salary_component_id, l[COMPONENT].component_code]));
    const revised = {
      id: assignmentId, salary_structure_id: structureId, pay_basis: input.payBasis,
      monthly_gross_target: input.payBasis === 'MONTHLY' && input.monthlySalary ? D(input.monthlySalary) : null,
      annual_ctc: input.annualCtc ? D(input.annualCtc) : null,
      base_rate: input.payBasis !== 'MONTHLY' && input.baseRate ? D(input.baseRate) : null,
      payroll_policy_id: input.payrollPolicyId ?? null, is_overtime_eligible: input.isOvertimeEligible, currency_code: input.currencyCode,
      effective_from: from, effective_to: null,
      rndtechnosoft_employee_salary_component_values: input.componentValues.map((v) => ({
        amount: v.amount ? D(v.amount) : null, percentage: v.percentage ? D(v.percentage) : null,
        rndtechnosoft_salary_components: { component_code: codes.get(v.salaryComponentId) as string },
      })),
    };
    const result: { periodId: string; paid: Prisma.Decimal; revised: Prisma.Decimal; amount: Prisma.Decimal; detail: Record<string, unknown> }[] = [];
    for (const slip of slips) {
      const period = slip.rndtechnosoft_payroll_periods;
      const pStart = isoDate(period.period_start);
      const overrideFrom = period.period_start > from ? period.period_start : from;
      const pay = await this.calculation.calculate(tenantId, employeeId, pStart, isoDate(period.period_end), {
        override: { from: isoDate(overrideFrom), assignment: { ...revised, effective_from: overrideFrom } },
        earningsOnly: true,
      });
      if (pay.status === 'EXCEPTION') {
        throw new BadRequestException(`Arrears for ${pStart.slice(0, 7)} can’t be worked out: ${pay.exceptions.join(' ')}`);
      }
      const paid = slip.gross_earnings;
      const revisedEarnings = D(pay.totals.earnings);
      const amount = revisedEarnings.minus(paid);
      if (amount.lte(0)) continue;
      const paidLines = new Map(slip.rndtechnosoft_payslip_lines.filter((l) => l.component_category === 'EARNING').map((l) => [l.component_code_snapshot, l.amount.toFixed(2)]));
      result.push({
        periodId: period.id, paid, revised: revisedEarnings, amount,
        detail: {
          period: { start: pStart, end: isoDate(period.period_end) },
          from: isoDate(overrideFrom),
          lines: pay.lines.filter((l) => l.componentCategory === 'EARNING').map((l) => ({ code: l.componentCode, name: l.componentName, revised: l.amount, paid: paidLines.get(l.componentCode) ?? '0.00', steps: l.steps })),
          paidOnly: [...paidLines.entries()].filter(([code]) => !pay.lines.some((l) => l.componentCode === code)).map(([code, amount]) => ({ code, paid: amount })),
          note: 'Earnings only. Deductions such as provident fund or tax on arrears are not worked out; check them with your payroll adviser.',
        },
      });
    }
    if (!result.length) {
      throw new BadRequestException('The new salary isn’t more than what was paid for those months, so there are no arrears. Arrears are only paid for increases; start the salary from the next open month instead.');
    }
    return result;
  }

  private versionInForce(db: Tx | PrismaService, tenantId: string, structureId: string, onDate: Date) {
    return db.rndtechnosoft_salary_structure_versions.findFirst({
      where: { tenant_id: tenantId, salary_structure_id: structureId, version_status: 'PUBLISHED', effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }] },
      include: { rndtechnosoft_salary_structure_components: { include: { [COMPONENT]: true } } },
    });
  }

  private async employee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: employeeId }, select: { id: true, employee_code: true, first_name: true, last_name: true } });
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  /** Serializes salary changes for one employee. */
  private async lockEmployee(tx: Tx, tenantId: string, employeeId: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_employees WHERE tenant_id = ${tenantId}::uuid AND id = ${employeeId}::uuid FOR UPDATE`;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'SALARY_ASSIGNMENT', entityId: id, metadata });
  }
}
