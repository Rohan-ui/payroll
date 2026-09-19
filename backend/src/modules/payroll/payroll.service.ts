import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DecimalMath } from '@/common/utils/decimal-math.util';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BookkeepingService } from '../bookkeeping/bookkeeping.service';
import { FinancialYearsService } from '../bookkeeping/financial-years.service';

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

interface CalculatedLine {
  salaryComponentId: string;
  componentCode: string;
  componentName: string;
  componentCategory: 'EARNING' | 'DEDUCTION' | 'STATUTORY';
  calculationType: string;
  amount: Prisma.Decimal;
  displayOrder: number;
  source: string;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookkeepingService: BookkeepingService,
    private readonly financialYearsService: FinancialYearsService,
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
   * Calculates payroll for all active employees in the tenant using strict Decimal arithmetic.
   */
  async calculateRun(tenantId: string, runId: string) {
    const run = await this.prisma.rndtechnosoft_payroll_runs.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: { rndtechnosoft_payroll_periods: true },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    if (run.run_status === 'FINALIZED') {
      throw new BadRequestException('Cannot calculate a finalized payroll run');
    }

    const period = run.rndtechnosoft_payroll_periods;
    const periodStart = period.period_start;
    const periodEnd = period.period_end;
    const totalPeriodDays = Math.ceil(
      (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    // Fetch active employees with active salary assignments and structure components
    const employees = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId,
        employee_status: 'ACTIVE',
      },
      include: {
        rndtechnosoft_employee_salary_assignments: {
          where: {
            effective_from: { lte: periodEnd },
            OR: [{ effective_to: null }, { effective_to: { gte: periodStart } }],
          },
          orderBy: { effective_from: 'desc' },
          take: 1,
          include: {
            rndtechnosoft_salary_structures: {
              include: {
                rndtechnosoft_salary_structure_components: {
                  include: {
                    rndtechnosoft_salary_components_rndtechnosoft_salary_structure_components_tenant_id_salary_component_idTorndtechnosoft_salary_components: true,
                  },
                },
              },
            },
            rndtechnosoft_employee_salary_component_values: {
              where: {
                effective_from: { lte: periodEnd },
                OR: [{ effective_to: null }, { effective_to: { gte: periodStart } }],
              },
              include: {
                rndtechnosoft_salary_components: true,
              },
            },
          },
        },
        rndtechnosoft_payroll_inputs: {
          where: {
            tenant_id: tenantId,
            payroll_period_id: period.id,
            input_status: 'APPROVED',
          },
          include: {
            rndtechnosoft_salary_components: true,
          },
        },
      },
    });

    const calculationTimestamp = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Mark calculation started
      await tx.rndtechnosoft_payroll_runs.update({
        where: { id: runId },
        data: { calculation_started_at: calculationTimestamp },
      });

      // Clear previous draft employee run entries
      await tx.rndtechnosoft_payroll_run_employees.deleteMany({
        where: { tenant_id: tenantId, payroll_run_id: runId },
      });

      for (const emp of employees) {
        const salaryAssignment = emp.rndtechnosoft_employee_salary_assignments[0];
        if (!salaryAssignment) {
          // Employee has no assigned salary structure, record as failed/skipped
          await tx.rndtechnosoft_payroll_run_employees.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              payroll_run_id: runId,
              employee_id: emp.id,
              salary_assignment_id: null,
              processing_status: 'FAILED',
              payable_days: DecimalMath.toDecimal(0),
              loss_of_pay_days: DecimalMath.toDecimal(0),
              gross_earnings: DecimalMath.toDecimal(0),
              gross_deductions: DecimalMath.toDecimal(0),
              net_pay: DecimalMath.toDecimal(0),
              calculation_error: 'No active salary structure assigned to employee',
            },
          });
          continue;
        }

        const lines: CalculatedLine[] = [];
        let grossEarnings = DecimalMath.toDecimal(0);
        let grossDeductions = DecimalMath.toDecimal(0);

        // Assume full period attendance unless LOP days exist
        const payableDays = DecimalMath.toDecimal(totalPeriodDays);
        const lopDays = DecimalMath.toDecimal(0);

        // 1. Process Structure Components
        const structureComponents =
          salaryAssignment.rndtechnosoft_salary_structures.rndtechnosoft_salary_structure_components;

        for (const sc of structureComponents) {
          const component = sc.rndtechnosoft_salary_components_rndtechnosoft_salary_structure_components_tenant_id_salary_component_idTorndtechnosoft_salary_components;

          // Check if employee has a specific override value
          const overrideVal = salaryAssignment.rndtechnosoft_employee_salary_component_values.find(
            (v) => v.salary_component_id === component.id,
          );

          let baseAmount = overrideVal?.amount || sc.default_amount || DecimalMath.toDecimal(0);

          // If percentage-based
          if (component.calculation_type === 'PERCENTAGE') {
            const percentage = overrideVal?.percentage || sc.default_percentage || DecimalMath.toDecimal(0);
            if (salaryAssignment.monthly_gross_target) {
              baseAmount = DecimalMath.percentageOf(salaryAssignment.monthly_gross_target, percentage);
            }
          }

          // Pro-rata based on payable days
          const proRatedAmount = DecimalMath.calculateProRata(baseAmount, payableDays, totalPeriodDays);

          lines.push({
            salaryComponentId: component.id,
            componentCode: component.component_code,
            componentName: component.component_name,
            componentCategory: component.component_category as 'EARNING' | 'DEDUCTION' | 'STATUTORY',
            calculationType: component.calculation_type,
            amount: proRatedAmount,
            displayOrder: component.display_order,
            source: 'STRUCTURE',
          });

          if (component.component_category === 'EARNING') {
            grossEarnings = DecimalMath.add(grossEarnings, proRatedAmount);
          } else {
            grossDeductions = DecimalMath.add(grossDeductions, proRatedAmount);
          }
        }

        // 2. Process variable inputs (bonuses, overtime, manual deductions)
        for (const input of emp.rndtechnosoft_payroll_inputs) {
          const comp = input.rndtechnosoft_salary_components;
          const inputAmount = DecimalMath.roundCurrency(input.amount);

          lines.push({
            salaryComponentId: comp.id,
            componentCode: comp.component_code,
            componentName: comp.component_name,
            componentCategory: comp.component_category as 'EARNING' | 'DEDUCTION' | 'STATUTORY',
            calculationType: comp.calculation_type,
            amount: inputAmount,
            displayOrder: comp.display_order + 50,
            source: 'VARIABLE_INPUT',
          });

          if (comp.component_category === 'EARNING') {
            grossEarnings = DecimalMath.add(grossEarnings, inputAmount);
          } else {
            grossDeductions = DecimalMath.add(grossDeductions, inputAmount);
          }
        }

        // 3. Deterministic Net Pay: Gross Earnings - Gross Deductions
        const netPay = DecimalMath.sub(grossEarnings, grossDeductions);

        await tx.rndtechnosoft_payroll_run_employees.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            payroll_run_id: runId,
            employee_id: emp.id,
            salary_assignment_id: salaryAssignment.id,
            processing_status: 'CALCULATED',
            payable_days: payableDays,
            loss_of_pay_days: lopDays,
            gross_earnings: DecimalMath.roundCurrency(grossEarnings),
            gross_deductions: DecimalMath.roundCurrency(grossDeductions),
            net_pay: DecimalMath.roundCurrency(netPay),
            calculation_snapshot: {
              currency: salaryAssignment.currency_code,
              totalPeriodDays,
              lines: lines.map((l) => ({
                ...l,
                amount: l.amount.toString(),
              })),
            },
          },
        });
      }

      // Update Run Status
      return tx.rndtechnosoft_payroll_runs.update({
        where: { id: runId },
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

    return this.prisma.rndtechnosoft_payroll_runs.update({
      where: { id: runId },
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

        // 2. Create immutable line items
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
        where: { id: runId },
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
