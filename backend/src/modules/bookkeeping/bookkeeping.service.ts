import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DecimalMath } from '@/common/utils/decimal-math.util';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { FinancialYearsService } from './financial-years.service';
import {
  STANDARD_PAYROLL_LEDGERS,
  TrialBalanceResponse,
  TrialBalanceItem,
  SyncAccountingResult,
  AccountCategory,
  EntrySide,
} from './bookkeeping.types';

@Injectable()
export class BookkeepingService {
  private readonly logger = new Logger(BookkeepingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialYearsService: FinancialYearsService,
  ) {}

  /**
   * Ensures the tenant has all standard accounts in their Chart of Accounts.
   */
  async ensureStandardLedgers(tenantId: string) {
    const existing = await this.prisma.rndtechnosoft_accounting_ledgers.findMany({
      where: { tenant_id: tenantId },
    });

    const existingCodes = new Set(existing.map((l) => l.ledger_code));
    const createdLedgers = [];

    for (const def of STANDARD_PAYROLL_LEDGERS) {
      if (!existingCodes.has(def.code)) {
        const created = await this.prisma.rndtechnosoft_accounting_ledgers.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            ledger_code: def.code,
            ledger_name: def.name,
            account_category: def.category,
            normal_balance: def.normalBalance,
            currency_code: 'INR',
            is_system: true,
            is_active: true,
            description: def.description,
          },
        });
        createdLedgers.push(created);
      }
    }

    if (createdLedgers.length > 0) {
      this.logger.log(`Seeded ${createdLedgers.length} standard accounts for tenant ${tenantId}`);
    }

    return this.prisma.rndtechnosoft_accounting_ledgers.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ account_category: 'asc' }, { ledger_code: 'asc' }],
    });
  }

  /**
   * Posts the complete double-entry payroll accrual voucher for a finalized payroll run.
   * Debits Salaries & Wages Expense, Credits Net Salary Payable and all Statutory Liabilities.
   */
  async postPayrollRunAccrual(tenantId: string, runId: string, externalTx?: Prisma.TransactionClient) {
    const execute = async (tx: Prisma.TransactionClient) => {
      // 1. Check if journal entry already exists for this run (idempotency)
      const existingEntry = await tx.rndtechnosoft_bookkeeping_entries.findFirst({
        where: {
          tenant_id: tenantId,
          payroll_run_id: runId,
          voucher_type: 'PAYROLL_ACCRUAL',
        },
        include: {
          rndtechnosoft_bookkeeping_entry_lines: {
            include: { rndtechnosoft_accounting_ledgers: true },
          },
        },
      });

      if (existingEntry) {
        this.logger.log(`Journal entry already exists for run ${runId}: ${existingEntry.voucher_number}`);
        return existingEntry;
      }

      // 2. Fetch the payroll run, its period, and payslips
      const run = await tx.rndtechnosoft_payroll_runs.findFirst({
        where: { id: runId, tenant_id: tenantId },
        include: {
          rndtechnosoft_payroll_periods: true,
          rndtechnosoft_payslips: {
            include: {
              rndtechnosoft_payslip_lines: true,
            },
          },
        },
      });

      if (!run) {
        throw new NotFoundException(`Payroll run ${runId} not found`);
      }

      if (run.rndtechnosoft_payslips.length === 0) {
        this.logger.warn(`No payslips found in payroll run ${runId}; skipping bookkeeping accrual.`);
        return null;
      }

      // 3. Ensure Chart of Accounts exists
      await this.ensureStandardLedgers(tenantId);
      const ledgers = await tx.rndtechnosoft_accounting_ledgers.findMany({
        where: { tenant_id: tenantId },
      });
      const ledgerMap = new Map(ledgers.map((l) => [l.ledger_code, l]));

      // 4. Resolve Financial Year
      const periodEnd = run.rndtechnosoft_payroll_periods.period_end;
      const fy = await this.financialYearsService.ensureFinancialYear(tenantId, periodEnd);

      // Link period to FY if not already linked
      if (!run.rndtechnosoft_payroll_periods.financial_year_id) {
        await tx.rndtechnosoft_payroll_periods.update({
          where: { id: run.payroll_period_id },
          data: { financial_year_id: fy.id },
        });
      }

      // 5. Aggregate financial numbers
      let totalGrossEarnings = new Prisma.Decimal(0);
      let totalNetPay = new Prisma.Decimal(0);
      let totalPf = new Prisma.Decimal(0);
      let totalEsi = new Prisma.Decimal(0);
      let totalPt = new Prisma.Decimal(0);
      let totalTds = new Prisma.Decimal(0);
      let totalOtherDeductions = new Prisma.Decimal(0);

      for (const slip of run.rndtechnosoft_payslips) {
        totalGrossEarnings = totalGrossEarnings.plus(slip.gross_earnings);
        totalNetPay = totalNetPay.plus(slip.net_pay);

        for (const line of slip.rndtechnosoft_payslip_lines) {
          if (line.component_category === 'DEDUCTION' || line.component_category === 'STATUTORY') {
            const code = (line.component_code_snapshot || '').toUpperCase();
            const name = (line.component_name_snapshot || '').toUpperCase();

            if (code.includes('PF') || name.includes('PROVIDENT') || code === 'EPF') {
              totalPf = totalPf.plus(line.amount);
            } else if (code.includes('ESI') || name.includes('STATE INSURANCE')) {
              totalEsi = totalEsi.plus(line.amount);
            } else if (code.includes('PT') || name.includes('PROFESSIONAL')) {
              totalPt = totalPt.plus(line.amount);
            } else if (code.includes('TDS') || name.includes('INCOME TAX') || code.includes('TAX')) {
              totalTds = totalTds.plus(line.amount);
            } else {
              totalOtherDeductions = totalOtherDeductions.plus(line.amount);
            }
          }
        }
      }

      // 6. Build double-entry line items
      interface JournalLineDraft {
        ledgerCode: string;
        side: EntrySide;
        amount: Prisma.Decimal;
        narration: string;
      }

      const lineDrafts: JournalLineDraft[] = [];

      // DEBITS:
      // Gross Salaries & Wages Expense
      if (totalGrossEarnings.greaterThan(0)) {
        lineDrafts.push({
          ledgerCode: 'EXP_SALARY_WAGES',
          side: 'DEBIT',
          amount: totalGrossEarnings,
          narration: `Gross salary expense for ${run.rndtechnosoft_payroll_periods.period_code} (${run.rndtechnosoft_payslips.length} employees)`,
        });
      }

      // CREDITS:
      // Net Salary Payable (Disbursable to staff)
      if (totalNetPay.greaterThan(0)) {
        lineDrafts.push({
          ledgerCode: 'LIA_NET_SALARY_PAYABLE',
          side: 'CREDIT',
          amount: totalNetPay,
          narration: `Net payable salary awaiting bank disbursement`,
        });
      }

      // PF Payable
      if (totalPf.greaterThan(0)) {
        lineDrafts.push({
          ledgerCode: 'LIA_PF_PAYABLE',
          side: 'CREDIT',
          amount: totalPf,
          narration: `Employee PF deductions payable to EPFO`,
        });
      }

      // ESI Payable
      if (totalEsi.greaterThan(0)) {
        lineDrafts.push({
          ledgerCode: 'LIA_ESI_PAYABLE',
          side: 'CREDIT',
          amount: totalEsi,
          narration: `Employee ESIC deductions payable`,
        });
      }

      // PT Payable
      if (totalPt.greaterThan(0)) {
        lineDrafts.push({
          ledgerCode: 'LIA_PT_PAYABLE',
          side: 'CREDIT',
          amount: totalPt,
          narration: `Professional tax payable to state authority`,
        });
      }

      // TDS Payable
      if (totalTds.greaterThan(0)) {
        lineDrafts.push({
          ledgerCode: 'LIA_TDS_PAYABLE',
          side: 'CREDIT',
          amount: totalTds,
          narration: `TDS under Section 192 payable to IT Department`,
        });
      }

      // Other Deductions
      if (totalOtherDeductions.greaterThan(0)) {
        lineDrafts.push({
          ledgerCode: 'LIA_OTHER_DEDUCTIONS',
          side: 'CREDIT',
          amount: totalOtherDeductions,
          narration: `Miscellaneous deductions and recoveries`,
        });
      }

      // Verify Mathematical Balance: Sum(Debits) === Sum(Credits)
      let sumDebits = new Prisma.Decimal(0);
      let sumCredits = new Prisma.Decimal(0);

      for (const item of lineDrafts) {
        if (item.side === 'DEBIT') {
          sumDebits = sumDebits.plus(item.amount);
        } else {
          sumCredits = sumCredits.plus(item.amount);
        }
      }

      // If there's an unexplained rounding discrepancy between Gross vs (Net + Deductions),
      // balance it into Other Deductions or Gross Wages
      const diff = sumDebits.minus(sumCredits);
      if (!diff.isZero()) {
        if (diff.greaterThan(0)) {
          // Debits > Credits -> Add credit difference to Other Deductions
          lineDrafts.push({
            ledgerCode: 'LIA_OTHER_DEDUCTIONS',
            side: 'CREDIT',
            amount: diff,
            narration: 'Payroll rounding balancing adjustment',
          });
          sumCredits = sumCredits.plus(diff);
        } else {
          // Credits > Debits -> Add debit difference to Gross Wages
          const absDiff = diff.abs();
          lineDrafts.push({
            ledgerCode: 'EXP_SALARY_WAGES',
            side: 'DEBIT',
            amount: absDiff,
            narration: 'Payroll rounding balancing adjustment',
          });
          sumDebits = sumDebits.plus(absDiff);
        }
      }

      // 7. Create Journal Voucher Entry
      const entryId = randomUUID();
      const voucherNum = `JV-${run.rndtechnosoft_payroll_periods.period_code}-${Date.now().toString().slice(-4)}`;

      const entry = await tx.rndtechnosoft_bookkeeping_entries.create({
        data: {
          id: entryId,
          tenant_id: tenantId,
          financial_year_id: fy.id,
          payroll_run_id: runId,
          payroll_period_id: run.payroll_period_id,
          voucher_number: voucherNum,
          voucher_date: run.finalized_at || new Date(),
          voucher_type: 'PAYROLL_ACCRUAL',
          total_debit: sumDebits,
          total_credit: sumCredits,
          narration: `Payroll accrual for period ${run.rndtechnosoft_payroll_periods.period_code} (Run: ${run.run_number})`,
          entry_status: 'POSTED',
          posted_at: new Date(),
        },
      });

      // 8. Insert individual Journal Lines
      let lineNumber = 1;
      for (const draft of lineDrafts) {
        const ledger = ledgerMap.get(draft.ledgerCode);
        if (!ledger) continue;

        await tx.rndtechnosoft_bookkeeping_entry_lines.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            bookkeeping_entry_id: entryId,
            ledger_id: ledger.id,
            line_number: lineNumber++,
            entry_side: draft.side,
            amount: draft.amount,
            narration: draft.narration,
          },
        });

        // 9. Update Financial Year Ledger Balance
        const existingBalance = await tx.rndtechnosoft_financial_year_ledger_balances.findFirst({
          where: {
            tenant_id: tenantId,
            financial_year_id: fy.id,
            ledger_id: ledger.id,
          },
        });

        const debitInc = draft.side === 'DEBIT' ? draft.amount : new Prisma.Decimal(0);
        const creditInc = draft.side === 'CREDIT' ? draft.amount : new Prisma.Decimal(0);

        if (existingBalance) {
          const newDebits = existingBalance.total_debits.plus(debitInc);
          const newCredits = existingBalance.total_credits.plus(creditInc);
          const newClosing =
            ledger.normal_balance === 'DEBIT'
              ? existingBalance.opening_balance.plus(newDebits).minus(newCredits)
              : existingBalance.opening_balance.plus(newCredits).minus(newDebits);

          await tx.rndtechnosoft_financial_year_ledger_balances.update({
            where: { id: existingBalance.id },
            data: {
              total_debits: newDebits,
              total_credits: newCredits,
              closing_balance: newClosing,
            },
          });
        } else {
          const newClosing =
            ledger.normal_balance === 'DEBIT'
              ? debitInc.minus(creditInc)
              : creditInc.minus(debitInc);

          await tx.rndtechnosoft_financial_year_ledger_balances.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              financial_year_id: fy.id,
              ledger_id: ledger.id,
              opening_balance: new Prisma.Decimal(0),
              total_debits: debitInc,
              total_credits: creditInc,
              closing_balance: newClosing,
            },
          });
        }
      }

      this.logger.log(
        `Successfully posted payroll accrual voucher ${voucherNum} (Debit: ₹${sumDebits.toFixed(2)}, Credit: ₹${sumCredits.toFixed(2)}) for run ${run.run_number}`,
      );

      return entry;
    };

    if (externalTx) {
      return execute(externalTx);
    } else {
      return this.prisma.$transaction(execute);
    }
  }

  /**
   * "Do it all over" retroactive sync:
   * Scans all historical payroll periods, ensures financial years are assigned,
   * seeds the chart of accounts, and automatically accounts for every finalized payroll run.
   */
  async syncAllHistoricalAccounting(tenantId: string): Promise<SyncAccountingResult> {
    this.logger.log(`Initiating complete retroactive bookkeeping synchronization for tenant ${tenantId}...`);

    // 1. Ensure Standard Ledgers
    const ledgers = await this.ensureStandardLedgers(tenantId);

    // 2. Ensure current financial year exists
    const currentFy = await this.financialYearsService.ensureFinancialYear(tenantId);

    // 3. Find all payroll periods and link to appropriate FY
    const periods = await this.prisma.rndtechnosoft_payroll_periods.findMany({
      where: { tenant_id: tenantId },
    });

    for (const period of periods) {
      const targetFy = await this.financialYearsService.ensureFinancialYear(tenantId, period.period_end);
      if (period.financial_year_id !== targetFy.id) {
        await this.prisma.rndtechnosoft_payroll_periods.update({
          where: { id: period.id },
          data: { financial_year_id: targetFy.id },
        });
      }
    }

    // 4. Find all FINALIZED payroll runs
    const finalizedRuns = await this.prisma.rndtechnosoft_payroll_runs.findMany({
      where: {
        tenant_id: tenantId,
        run_status: 'FINALIZED',
      },
      include: {
        rndtechnosoft_payroll_periods: true,
      },
    });

    let journalEntriesCreated = 0;

    for (const run of finalizedRuns) {
      const existing = await this.prisma.rndtechnosoft_bookkeeping_entries.findFirst({
        where: {
          tenant_id: tenantId,
          payroll_run_id: run.id,
        },
      });

      if (!existing) {
        await this.postPayrollRunAccrual(tenantId, run.id);
        journalEntriesCreated++;
      }
    }

    // 5. Fetch overall trial balance to confirm zero-difference balance
    const tb = await this.getTrialBalance(tenantId, currentFy.id);

    return {
      financialYearCreated: true,
      financialYearCode: currentFy.financial_year_code,
      ledgersSeeded: ledgers.length,
      payrollRunsProcessed: finalizedRuns.length,
      journalEntriesCreated,
      totalDebits: tb.totalDebits,
      totalCredits: tb.totalCredits,
      isBalanced: tb.isBalanced,
    };
  }

  /**
   * Generates a Trial Balance for the given Financial Year.
   * Proves double-entry correctness: Sum(Debits) === Sum(Credits).
   */
  async getTrialBalance(tenantId: string, financialYearId?: string): Promise<TrialBalanceResponse> {
    let fy = null;
    if (financialYearId) {
      fy = await this.financialYearsService.getFinancialYearById(tenantId, financialYearId);
    } else {
      fy = await this.financialYearsService.getCurrentFinancialYear(tenantId);
    }

    // Ensure ledgers exist
    await this.ensureStandardLedgers(tenantId);

    const ledgers = await this.prisma.rndtechnosoft_accounting_ledgers.findMany({
      where: { tenant_id: tenantId, is_active: true },
      orderBy: [{ account_category: 'asc' }, { ledger_code: 'asc' }],
    });

    // Aggregate debits and credits from journal entry lines for this FY
    const lines = await this.prisma.rndtechnosoft_bookkeeping_entry_lines.findMany({
      where: {
        tenant_id: tenantId,
        rndtechnosoft_bookkeeping_entries: {
          financial_year_id: fy.id,
          entry_status: 'POSTED',
        },
      },
    });

    const debitMap = new Map<string, Prisma.Decimal>();
    const creditMap = new Map<string, Prisma.Decimal>();

    for (const line of lines) {
      if (line.entry_side === 'DEBIT') {
        const cur = debitMap.get(line.ledger_id) || new Prisma.Decimal(0);
        debitMap.set(line.ledger_id, cur.plus(line.amount));
      } else {
        const cur = creditMap.get(line.ledger_id) || new Prisma.Decimal(0);
        creditMap.set(line.ledger_id, cur.plus(line.amount));
      }
    }

    let grandTotalDebits = new Prisma.Decimal(0);
    let grandTotalCredits = new Prisma.Decimal(0);

    const items: TrialBalanceItem[] = ledgers.map((l) => {
      const debits = debitMap.get(l.id) || new Prisma.Decimal(0);
      const credits = creditMap.get(l.id) || new Prisma.Decimal(0);
      const opening = new Prisma.Decimal(0);

      const closing =
        l.normal_balance === 'DEBIT'
          ? opening.plus(debits).minus(credits)
          : opening.plus(credits).minus(debits);

      grandTotalDebits = grandTotalDebits.plus(debits);
      grandTotalCredits = grandTotalCredits.plus(credits);

      return {
        ledgerId: l.id,
        ledgerCode: l.ledger_code,
        ledgerName: l.ledger_name,
        accountCategory: l.account_category as AccountCategory,
        normalBalance: l.normal_balance as EntrySide,
        openingBalance: opening.toFixed(2),
        totalDebits: debits.toFixed(2),
        totalCredits: credits.toFixed(2),
        closingBalance: closing.toFixed(2),
      };
    });

    const diff = grandTotalDebits.minus(grandTotalCredits);

    return {
      financialYear: {
        id: fy.id,
        code: fy.financial_year_code,
        name: fy.financial_year_name,
        startDate: fy.start_date.toISOString().split('T')[0],
        endDate: fy.end_date.toISOString().split('T')[0],
        isCurrent: fy.is_current,
        isClosed: fy.is_closed,
      },
      items,
      totalDebits: grandTotalDebits.toFixed(2),
      totalCredits: grandTotalCredits.toFixed(2),
      isBalanced: diff.isZero(),
      difference: diff.abs().toFixed(2),
    };
  }

  /**
   * Retrieves all Journal Vouchers for the tenant with full debit/credit lines.
   */
  async getJournalEntries(
    tenantId: string,
    filters?: { financialYearId?: string; runId?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 50));
    const where: Prisma.rndtechnosoft_bookkeeping_entriesWhereInput = {
      tenant_id: tenantId,
    };

    if (filters?.financialYearId) {
      where.financial_year_id = filters.financialYearId;
    }
    if (filters?.runId) {
      where.payroll_run_id = filters.runId;
    }

    const [items, total] = await Promise.all([
      this.prisma.rndtechnosoft_bookkeeping_entries.findMany({
        where,
        orderBy: [{ voucher_date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          rndtechnosoft_financial_years: {
            select: { financial_year_code: true, financial_year_name: true },
          },
          rndtechnosoft_payroll_runs: {
            select: { run_number: true, run_type: true },
          },
          rndtechnosoft_bookkeeping_entry_lines: {
            orderBy: { line_number: 'asc' },
            include: {
              rndtechnosoft_accounting_ledgers: {
                select: { ledger_code: true, ledger_name: true, account_category: true },
              },
            },
          },
        },
      }),
      this.prisma.rndtechnosoft_bookkeeping_entries.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  async getLedgers(tenantId: string) {
    await this.ensureStandardLedgers(tenantId);
    return this.prisma.rndtechnosoft_accounting_ledgers.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ account_category: 'asc' }, { ledger_code: 'asc' }],
    });
  }
}
