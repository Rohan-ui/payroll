import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DecimalMath } from '@/common/utils/decimal-math.util';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BookkeepingService } from '../bookkeeping/bookkeeping.service';
import { FinancialYearsService } from '../bookkeeping/financial-years.service';
import { EmployeePay, PayrollCalculationService } from './calculation/payroll-calculation.service';
import { isoDate } from './payroll-lock';
import { monthRange } from './calculation/dto/calculation.dto';

export interface CreatePayrollPeriodInput {
  periodCode: string;
  payFrequency?: string;
  periodStart: string;
  periodEnd: string;
  paymentDate?: string;
}

export interface CreatePayrollRunInput {
  payrollPeriodId: string;
  runType?: 'REGULAR' | 'OFF_CYCLE';
  createdByTenantMemberId?: string;
}


@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookkeepingService: BookkeepingService,
    private readonly financialYearsService: FinancialYearsService,
    private readonly calculation: PayrollCalculationService,
  ) {}

  async createPeriod(tenantId: string, input: CreatePayrollPeriodInput) {
    const existing = await this.prisma.rndtechnosoft_payroll_periods.findFirst({
      where: { tenant_id: tenantId, period_code: input.periodCode },
    });

    if (existing) {
      throw new BadRequestException(`Payroll period with code '${input.periodCode}' already exists`);
    }

    const startDate = new Date(input.periodStart);
    const endDate = new Date(input.periodEnd);

    if (endDate < startDate) {
      throw new BadRequestException('periodEnd cannot be earlier than periodStart');
    }

    // Auto-resolve Financial Year
    const fy = await this.financialYearsService.ensureFinancialYear(tenantId, endDate);

    return this.prisma.rndtechnosoft_payroll_periods.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        financial_year_id: fy.id,
        period_code: input.periodCode,
        pay_frequency: input.payFrequency || 'MONTHLY',
        period_start: startDate,
        period_end: endDate,
        payment_date: input.paymentDate ? new Date(input.paymentDate) : null,
        period_status: 'OPEN',
      },
    });
  }

  async listPeriods(tenantId: string) {
    return this.prisma.rndtechnosoft_payroll_periods.findMany({
      where: { tenant_id: tenantId },
      orderBy: { period_start: 'desc' },
    });
  }

  async createRun(tenantId: string, input: CreatePayrollRunInput) {
    const period = await this.prisma.rndtechnosoft_payroll_periods.findFirst({
      where: { id: input.payrollPeriodId, tenant_id: tenantId },
    });

    if (!period) {
      throw new NotFoundException('Payroll period not found');
    }

    // One payroll run per month: recalculate the open one instead of starting another.
    const existing = await this.prisma.rndtechnosoft_payroll_runs.findFirst({
      where: { tenant_id: tenantId, payroll_period_id: period.id, run_type: input.runType || 'REGULAR' },
      orderBy: { created_at: 'desc' },
    });
    if (existing?.run_status === 'FINALIZED') throw new BadRequestException(`Payroll for ${period.period_code} is already finalized.`);
    if (existing) throw new BadRequestException(`Payroll for ${period.period_code} already has a run (${existing.run_number}); recalculate that one instead.`);

    const runNumber = `RUN-${period.period_code}-${Date.now().toString().slice(-4)}`;

    return this.prisma.rndtechnosoft_payroll_runs.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        payroll_period_id: input.payrollPeriodId,
        run_number: runNumber,
        run_type: input.runType || 'REGULAR',
        run_status: 'DRAFT',
        created_by_tenant_member_id: input.createdByTenantMemberId || null,
      },
    });
  }

  /**
   * Starts a month's payroll: its pay period (created if needed) and its run,
   * ready to calculate. Returns the open run if there already is one.
   */
  async startMonth(tenantId: string, month: string, paymentDate: string | null, createdByTenantMemberId: string) {
    const { start, end } = monthRange(month);
    let period = await this.prisma.rndtechnosoft_payroll_periods.findFirst({
      where: { tenant_id: tenantId, period_start: new Date(`${start}T00:00:00.000Z`), period_end: new Date(`${end}T00:00:00.000Z`) },
    });
    if (!period) period = await this.createPeriod(tenantId, { periodCode: month, periodStart: start, periodEnd: end, paymentDate: paymentDate ?? undefined });
    else if (paymentDate && !period.payment_date) {
      period = await this.prisma.rndtechnosoft_payroll_periods.update({ where: { tenant_id_id: { tenant_id: tenantId, id: period.id } }, data: { payment_date: new Date(`${paymentDate}T00:00:00.000Z`), updated_at: new Date() } });
    }
    const existing = await this.prisma.rndtechnosoft_payroll_runs.findFirst({
      where: { tenant_id: tenantId, payroll_period_id: period.id, run_type: 'REGULAR' },
      orderBy: { created_at: 'desc' },
    });
    if (existing?.run_status === 'FINALIZED') throw new BadRequestException(`Payroll for ${month} is already finalized.`);
    return existing ?? this.createRun(tenantId, { payrollPeriodId: period.id, createdByTenantMemberId });
  }

  /** An employee's issued payslips, newest first (finalized payroll only). */
  async employeePayslips(tenantId: string, employeeId: string) {
    const slips = await this.prisma.rndtechnosoft_payslips.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId, payslip_status: 'FINALIZED' },
      orderBy: { rndtechnosoft_payroll_periods: { period_start: 'desc' } },
      take: 12,
      select: {
        payslip_number: true, payroll_run_id: true, gross_earnings: true, gross_deductions: true, net_pay: true, finalized_at: true,
        rndtechnosoft_payroll_periods: { select: { period_start: true, payment_date: true } },
      },
    });
    return slips.map((p) => ({
      month: isoDate(p.rndtechnosoft_payroll_periods.period_start).slice(0, 7),
      payslipNumber: p.payslip_number,
      runId: p.payroll_run_id,
      gross: p.gross_earnings.toFixed(2),
      deductions: p.gross_deductions.toFixed(2),
      net: p.net_pay.toFixed(2),
      paymentDate: p.rndtechnosoft_payroll_periods.payment_date ? isoDate(p.rndtechnosoft_payroll_periods.payment_date) : null,
    }));
  }

  /** One employee's pay in a run, with every line and how it was worked out. */
  async runEmployee(tenantId: string, runId: string, employeeId: string) {
    const row = await this.prisma.rndtechnosoft_payroll_run_employees.findFirst({
      where: { tenant_id: tenantId, payroll_run_id: runId, employee_id: employeeId },
      include: { rndtechnosoft_employees: { select: { employee_code: true, first_name: true, last_name: true } } },
    });
    if (!row) throw new NotFoundException('This employee isn’t in that payroll run.');
    return {
      employee: { id: employeeId, code: row.rndtechnosoft_employees.employee_code, name: [row.rndtechnosoft_employees.first_name, row.rndtechnosoft_employees.last_name].filter(Boolean).join(' ') },
      status: row.processing_status,
      gross: row.gross_earnings.toFixed(2),
      deductions: row.gross_deductions.toFixed(2),
      net: row.net_pay.toFixed(2),
      snapshot: row.calculation_snapshot,
    };
  }

  /**
   * Calculates the run with the payroll engine. Every employee who is active
   * or has a salary in the period gets a row: CALCULATED, with explained
   * lines, or EXCEPTION, with what stops their pay. Nobody is skipped or paid
   * zero without a reason on record.
   */
  async calculateRun(tenantId: string, runId: string) {
    const run = await this.prisma.rndtechnosoft_payroll_runs.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: { rndtechnosoft_payroll_periods: true },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    if (!['DRAFT', 'CALCULATED', 'REVIEWED'].includes(run.run_status)) {
      throw new BadRequestException(`A ${run.run_status.toLowerCase()} payroll run can’t be recalculated.`);
    }

    const period = run.rndtechnosoft_payroll_periods;
    const periodStart = isoDate(period.period_start);
    const periodEnd = isoDate(period.period_end);
    const employees = await this.payableEmployees(tenantId, periodStart, periodEnd);

    const calculationStarted = new Date();
    const results: EmployeePay[] = [];
    for (const employee of employees) {
      results.push(await this.calculation.calculate(tenantId, employee.id, periodStart, periodEnd));
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_payroll_runs.update({
        // Composite [tenant_id, id] key: the database refuses a write against
        // another tenant's payroll run even if the id is guessed.
        where: { tenant_id_id: { tenant_id: tenantId, id: runId } },
        data: { calculation_started_at: calculationStarted },
      });

      // A run is recalculated from scratch until it is approved.
      await tx.rndtechnosoft_payroll_run_employees.deleteMany({
        where: { tenant_id: tenantId, payroll_run_id: runId },
      });

      for (const result of results) {
        await tx.rndtechnosoft_payroll_run_employees.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            payroll_run_id: runId,
            employee_id: result.employee.id,
            salary_assignment_id: result.salaryAssignmentId,
            processing_status: result.status === 'READY' ? 'CALCULATED' : 'EXCEPTION',
            payable_days: DecimalMath.toDecimal(result.attendance.paidDays),
            loss_of_pay_days: DecimalMath.toDecimal(result.attendance.unpaidDays),
            gross_earnings: DecimalMath.toDecimal(result.totals.earnings),
            gross_deductions: DecimalMath.toDecimal(result.totals.deductions),
            net_pay: DecimalMath.toDecimal(result.totals.net),
            calculation_error: result.exceptions.length ? result.exceptions.join('\n') : null,
            calculation_snapshot: {
              engine: 'structure-engine-1',
              currency: result.currency,
              period: result.period,
              lines: result.lines,
              totals: result.totals,
              attendance: result.attendance,
              segments: result.segments,
              exceptions: result.exceptions,
              warnings: result.warnings,
              settles: result.settles,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return tx.rndtechnosoft_payroll_runs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: runId } },
        data: {
          run_status: 'CALCULATED',
          calculation_completed_at: new Date(),
        },
        include: {
          rndtechnosoft_payroll_run_employees: {
            include: {
              rndtechnosoft_employees: {
                select: {
                  employee_code: true,
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
        },
      });
    });
  }

  /** Everyone payroll covers for a period: active employees, and anyone with a salary in it. */
  async payableEmployees(tenantId: string, periodStart: string, periodEnd: string) {
    const start = new Date(`${periodStart}T00:00:00.000Z`);
    const end = new Date(`${periodEnd}T00:00:00.000Z`);
    const rows = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        AND: [{ OR: [{ exit_date: null }, { exit_date: { gte: start } }] }],
        OR: [
          { employee_status: 'ACTIVE', OR: [{ hire_date: null }, { hire_date: { lte: end } }] },
          {
            rndtechnosoft_employee_salary_assignments: {
              some: { assignment_status: 'ACTIVE', effective_from: { lte: end }, OR: [{ effective_to: null }, { effective_to: { gte: start } }] },
            },
          },
        ],
      },
      select: {
        id: true, employee_code: true, first_name: true, last_name: true, employee_status: true,
        _count: { select: { rndtechnosoft_employee_salary_assignments: { where: { assignment_status: 'ACTIVE', effective_from: { lte: end }, OR: [{ effective_to: null }, { effective_to: { gte: start } }] } } } },
      },
      orderBy: { employee_code: 'asc' },
      take: 5000,
    });
    return rows.map((e) => ({
      id: e.id, code: e.employee_code, name: [e.first_name, e.last_name].filter(Boolean).join(' '), status: e.employee_status,
      hasSalary: e._count.rndtechnosoft_employee_salary_assignments > 0,
    }));
  }

  async approveRun(tenantId: string, runId: string, approverTenantMemberId?: string) {
    const run = await this.prisma.rndtechnosoft_payroll_runs.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    if (run.run_status !== 'CALCULATED' && run.run_status !== 'REVIEWED') {
      throw new BadRequestException(`Cannot approve run with status '${run.run_status}'`);
    }

    // Approving would leave these employees out of payroll without anyone deciding to.
    const held = await this.prisma.rndtechnosoft_payroll_run_employees.count({
      where: { tenant_id: tenantId, payroll_run_id: runId, processing_status: { in: ['EXCEPTION', 'FAILED'] } },
    });
    if (held) {
      throw new BadRequestException(`${held} employee${held === 1 ? ' has' : 's have'} pay exceptions. Fix them and recalculate before approving.`);
    }

    return this.prisma.rndtechnosoft_payroll_runs.update({
      // Composite [tenant_id, id] key keeps approval inside this tenant.
      where: { tenant_id_id: { tenant_id: tenantId, id: runId } },
      data: {
        run_status: 'APPROVED',
        approved_at: new Date(),
        approved_by_tenant_member_id: approverTenantMemberId || null,
      },
    });
  }

  /**
   * Finalizes the payroll run: Generates permanent, immutable payslips and line items.
   * Finalized records will NEVER mutate when salary config changes.
   */
  async finalizeRun(tenantId: string, runId: string, finalizerTenantMemberId?: string) {
    const run = await this.prisma.rndtechnosoft_payroll_runs.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        rndtechnosoft_payroll_periods: true,
        rndtechnosoft_payroll_run_employees: {
          where: { processing_status: 'CALCULATED' },
          include: {
            rndtechnosoft_employees: {
              include: {
                rndtechnosoft_employee_employments: {
                  where: { effective_to: null },
                  include: {
                    rndtechnosoft_branches: true,
                    rndtechnosoft_departments: true,
                    rndtechnosoft_designations: true,
                  },
                },
                rndtechnosoft_employee_bank_accounts: {
                  where: { effective_to: null },
                },
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    if (run.run_status !== 'APPROVED') {
      throw new BadRequestException(
        `Only APPROVED payroll runs can be finalized. Current status is '${run.run_status}'`,
      );
    }

    const finalizeTimestamp = new Date();

    return this.prisma.$transaction(async (tx) => {
      for (const runEmp of run.rndtechnosoft_payroll_run_employees) {
        const emp = runEmp.rndtechnosoft_employees;
        const currentEmployment = emp.rndtechnosoft_employee_employments[0];
        const currentBank = emp.rndtechnosoft_employee_bank_accounts[0];

        const payslipId = randomUUID();
        const payslipNumber = `PS-${run.rndtechnosoft_payroll_periods.period_code}-${emp.employee_code}`;

        const snapshotData = runEmp.calculation_snapshot as {
          currency?: string;
          lines?: Array<{
            salaryComponentId: string;
            componentCode: string;
            componentName: string;
            componentCategory: string;
            calculationType: string;
            amount: string;
            displayOrder: number;
            source: string;
          }>;
        } | null;

        // 1. Create immutable payslip
        await tx.rndtechnosoft_payslips.create({
          data: {
            id: payslipId,
            tenant_id: tenantId,
            payroll_run_employee_id: runEmp.id,
            payroll_run_id: runId,
            payroll_period_id: run.payroll_period_id,
            employee_id: emp.id,
            payslip_number: payslipNumber,
            employee_code_snapshot: emp.employee_code,
            employee_name_snapshot: `${emp.first_name} ${emp.last_name || ''}`.trim(),
            branch_name_snapshot: currentEmployment?.rndtechnosoft_branches?.branch_name || null,
            department_name_snapshot: currentEmployment?.rndtechnosoft_departments?.department_name || null,
            designation_name_snapshot: currentEmployment?.rndtechnosoft_designations?.designation_name || null,
            bank_account_last4_snapshot: currentBank?.account_number_last4 || null,
            currency_code: snapshotData?.currency || 'INR',
            gross_earnings: runEmp.gross_earnings,
            gross_deductions: runEmp.gross_deductions,
            net_pay: runEmp.net_pay,
            payslip_status: 'FINALIZED',
            generated_at: finalizeTimestamp,
            finalized_at: finalizeTimestamp,
            snapshot_metadata: runEmp.calculation_snapshot || Prisma.DbNull,
          },
        });

        // 2. Settle what this payslip pays: loan instalments recovered and arrears paid, once each.
        const settles = (runEmp.calculation_snapshot as { settles?: { loanInstallments?: { id: string; loanId: string; amount: string }[]; arrearsIds?: string[] } } | null)?.settles;
        for (const installment of settles?.loanInstallments ?? []) {
          const marked = await tx.rndtechnosoft_loan_installments.updateMany({
            where: { tenant_id: tenantId, id: installment.id, installment_status: 'SCHEDULED' },
            data: { installment_status: 'RECOVERED', payroll_period_id: run.payroll_period_id, updated_at: finalizeTimestamp },
          });
          if (marked.count !== 1) throw new BadRequestException(`A loan instalment for ${emp.employee_code} was already recovered or changed. Recalculate the run before finalizing.`);
          await tx.rndtechnosoft_loan_repayments.create({
            data: {
              id: randomUUID(), tenant_id: tenantId, employee_loan_id: installment.loanId, loan_installment_id: installment.id, repayment_date: run.rndtechnosoft_payroll_periods.period_end,
              amount: DecimalMath.toDecimal(installment.amount), repayment_source: 'PAYROLL', payroll_run_employee_id: runEmp.id, notes: `Recovered in payroll ${run.rndtechnosoft_payroll_periods.period_code}`,
            },
          });
          const open = await tx.rndtechnosoft_loan_installments.count({ where: { tenant_id: tenantId, employee_loan_id: installment.loanId, installment_status: 'SCHEDULED' } });
          if (!open) {
            await tx.rndtechnosoft_employee_loans.updateMany({ where: { tenant_id: tenantId, id: installment.loanId, loan_status: 'ACTIVE' }, data: { loan_status: 'CLOSED', closed_at: finalizeTimestamp, updated_at: finalizeTimestamp } });
          }
        }
        if (settles?.arrearsIds?.length) {
          const paid = await tx.rndtechnosoft_salary_arrears.updateMany({
            where: { tenant_id: tenantId, id: { in: settles.arrearsIds }, arrears_status: 'PENDING' },
            data: { arrears_status: 'INCLUDED', included_in_run_employee_id: runEmp.id, included_at: finalizeTimestamp, updated_at: finalizeTimestamp },
          });
          if (paid.count !== settles.arrearsIds.length) throw new BadRequestException(`Arrears for ${emp.employee_code} were already paid or cancelled. Recalculate the run before finalizing.`);
        }

        // 3. Create immutable line items
        if (snapshotData?.lines && snapshotData.lines.length > 0) {
          for (const line of snapshotData.lines) {
            await tx.rndtechnosoft_payslip_lines.create({
              data: {
                id: randomUUID(),
                tenant_id: tenantId,
                payslip_id: payslipId,
                salary_component_id: line.salaryComponentId,
                component_code_snapshot: line.componentCode,
                component_name_snapshot: line.componentName,
                component_category: line.componentCategory,
                calculation_type_snapshot: line.calculationType,
                amount: DecimalMath.toDecimal(line.amount),
                display_order: line.displayOrder,
                source: line.source,
              },
            });
          }
        }
      }

      // Mark run as FINALIZED
      const finalizedRun = await tx.rndtechnosoft_payroll_runs.update({
        // Finalisation is irreversible, so the tenant scope is enforced by the
        // composite [tenant_id, id] key rather than by the caller.
        where: { tenant_id_id: { tenant_id: tenantId, id: runId } },
        data: {
          run_status: 'FINALIZED',
          finalized_at: finalizeTimestamp,
          finalized_by_tenant_member_id: finalizerTenantMemberId || null,
        },
      });

      // Automatically post double-entry payroll accrual voucher into general ledger
      try {
        await this.bookkeepingService.postPayrollRunAccrual(tenantId, runId, tx);
      } catch (err) {
        console.error('Failed to post bookkeeping accrual voucher:', err);
      }

      return finalizedRun;
    });
  }

  async getRunDetails(tenantId: string, runId: string) {
    const run = await this.prisma.rndtechnosoft_payroll_runs.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        rndtechnosoft_payroll_periods: true,
        rndtechnosoft_payroll_run_employees: {
          include: {
            rndtechnosoft_employees: {
              select: {
                employee_code: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
        rndtechnosoft_payslips: {
          select: {
            id: true,
            payslip_number: true,
            employee_code_snapshot: true,
            employee_name_snapshot: true,
            net_pay: true,
            payslip_status: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    return run;
  }
}
