import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { finalizedThrough, isoDate } from '../payroll-lock';
import { monthRange } from '../calculation/dto/calculation.dto';
import { CreateLoanDto } from './loans.dto';

type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
const monthEnd = (month: string) => new Date(`${monthRange(month).end}T00:00:00Z`);
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Equal monthly instalments for an amount: the last one takes what rounding leaves. */
export function instalmentPlan(principal: Decimal, options: { installments?: number; installmentAmount?: Decimal }): Decimal[] {
  if (options.installmentAmount) {
    const each = options.installmentAmount;
    if (each.lte(0)) throw new BadRequestException('The monthly amount must be more than zero.');
    const full = principal.div(each).floor().toNumber();
    const rest = principal.minus(each.times(full));
    const plan = Array.from({ length: full }, () => each);
    if (rest.gt(0)) plan.push(rest);
    if (plan.length > 120) throw new BadRequestException('That would take more than 120 months. Recover more each month.');
    return plan;
  }
  const n = options.installments as number;
  const each = principal.div(n).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? principal.minus(each.times(n - 1)) : each));
}

/**
 * Loans and advances to employees, recovered from pay month by month. An
 * instalment counts as recovered only when the payroll that deducted it is
 * finalized; until then it can be deferred or the loan cancelled.
 */
@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string, status?: string) {
    const loans = await this.prisma.rndtechnosoft_employee_loans.findMany({
      where: { tenant_id: tenantId, ...(status ? { loan_status: status } : {}) },
      orderBy: { created_at: 'desc' },
      take: 500,
      include: {
        rndtechnosoft_employees: { select: { id: true, employee_code: true, first_name: true, last_name: true } },
        rndtechnosoft_loan_installments: { select: { total_amount: true, installment_status: true, due_date: true }, orderBy: { installment_number: 'asc' } },
      },
    });
    return loans.map((l) => this.view(l));
  }

  async get(tenantId: string, id: string) {
    const loan = await this.prisma.rndtechnosoft_employee_loans.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_employees: { select: { id: true, employee_code: true, first_name: true, last_name: true } },
        rndtechnosoft_loan_installments: { orderBy: { installment_number: 'asc' } },
        rndtechnosoft_loan_repayments: { orderBy: { repayment_date: 'asc' } },
      },
    });
    if (!loan) throw new NotFoundException('Loan not found.');
    return {
      ...this.view(loan),
      installments: loan.rndtechnosoft_loan_installments.map((i) => ({ id: i.id, number: i.installment_number, dueDate: isoDate(i.due_date), amount: i.total_amount.toFixed(2), status: i.installment_status })),
      repayments: loan.rndtechnosoft_loan_repayments.map((r) => ({ date: isoDate(r.repayment_date), amount: r.amount.toFixed(2), source: r.repayment_source, notes: r.notes })),
    };
  }

  async create(tenantId: string, input: CreateLoanDto, actor: AuthenticatedTenantUser) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: input.employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Employee not found.');
    const principal = D(input.principal);
    if (principal.lte(0)) throw new BadRequestException('The amount must be more than zero.');
    const locked = await finalizedThrough(this.prisma, tenantId, input.employeeId);
    if (locked && monthEnd(input.firstMonth) <= locked) throw new BadRequestException(`Payroll is finalized up to ${isoDate(locked)} for this employee; recovery can start from the month after.`);
    const plan = instalmentPlan(principal, { installments: input.installments, installmentAmount: input.installmentAmount ? D(input.installmentAmount) : undefined });
    const id = randomUUID();
    const prefix = input.loanType === 'ADVANCE' ? 'ADV' : 'LN';
    for (let attempt = 0; ; attempt += 1) {
      const count = await this.prisma.rndtechnosoft_employee_loans.count({ where: { tenant_id: tenantId } });
      const loanNumber = `${prefix}-${input.firstMonth.slice(0, 4)}-${String(count + 1 + attempt).padStart(4, '0')}`;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.rndtechnosoft_employee_loans.create({
            data: {
              id, tenant_id: tenantId, employee_id: input.employeeId, loan_number: loanNumber, loan_type: input.loanType, principal_amount: principal, interest_amount: D(0),
              total_repayable_amount: principal, installment_amount: plan[0], start_date: new Date(`${input.firstMonth}-01T00:00:00Z`),
              expected_end_date: monthEnd(addMonths(input.firstMonth, plan.length - 1)), loan_status: 'ACTIVE',
            },
          });
          await tx.rndtechnosoft_loan_installments.createMany({
            data: plan.map((amount, i) => ({
              id: randomUUID(), tenant_id: tenantId, employee_loan_id: id, installment_number: i + 1, due_date: monthEnd(addMonths(input.firstMonth, i)),
              principal_amount: amount, interest_amount: D(0), total_amount: amount, installment_status: 'SCHEDULED',
            })),
          });
        });
        await this.log(tenantId, actor, 'LOAN_CREATED', id, { loan_number: loanNumber, employee_id: input.employeeId, type: input.loanType, installments: plan.length, first_month: input.firstMonth, note: input.note?.trim() || null });
        return this.get(tenantId, id);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 5) continue;
        throw e;
      }
    }
  }

  /** Moves an instalment not yet recovered to the end of the plan (recovery skips that month). */
  async defer(tenantId: string, loanId: string, installmentId: string, reason: string, actor: AuthenticatedTenantUser) {
    const loan = await this.prisma.rndtechnosoft_employee_loans.findFirst({ where: { tenant_id: tenantId, id: loanId }, include: { rndtechnosoft_loan_installments: { orderBy: { installment_number: 'asc' } } } });
    if (!loan) throw new NotFoundException('Loan not found.');
    if (loan.loan_status !== 'ACTIVE') throw new BadRequestException('Only an active loan’s instalments can be deferred.');
    const installment = loan.rndtechnosoft_loan_installments.find((i) => i.id === installmentId);
    if (!installment || installment.installment_status !== 'SCHEDULED') throw new BadRequestException('Only an instalment not yet recovered can be deferred.');
    const locked = await finalizedThrough(this.prisma, tenantId, loan.employee_id);
    if (locked && installment.due_date <= locked) throw new BadRequestException('That month’s payroll is finalized.');
    const lastInstalment = loan.rndtechnosoft_loan_installments[loan.rndtechnosoft_loan_installments.length - 1];
    const nextMonth = addMonths(isoDate(lastInstalment.due_date).slice(0, 7), 1);
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_loan_installments.update({ where: { tenant_id_id: { tenant_id: tenantId, id: installmentId } }, data: { installment_status: 'DEFERRED', updated_at: new Date() } });
      await tx.rndtechnosoft_loan_installments.create({
        data: {
          id: randomUUID(), tenant_id: tenantId, employee_loan_id: loanId, installment_number: lastInstalment.installment_number + 1, due_date: monthEnd(nextMonth),
          principal_amount: installment.principal_amount, interest_amount: installment.interest_amount, total_amount: installment.total_amount, installment_status: 'SCHEDULED',
        },
      });
      await tx.rndtechnosoft_employee_loans.update({ where: { tenant_id_id: { tenant_id: tenantId, id: loanId } }, data: { expected_end_date: monthEnd(nextMonth), updated_at: new Date() } });
    });
    await this.log(tenantId, actor, 'LOAN_INSTALMENT_DEFERRED', loanId, { installment: installment.installment_number, moved_to: nextMonth, reason: reason.trim() });
    return this.get(tenantId, loanId);
  }

  /** Cancels a loan nothing has been recovered from yet. */
  async cancel(tenantId: string, loanId: string, reason: string, actor: AuthenticatedTenantUser) {
    const loan = await this.prisma.rndtechnosoft_employee_loans.findFirst({ where: { tenant_id: tenantId, id: loanId }, include: { _count: { select: { rndtechnosoft_loan_repayments: true } } } });
    if (!loan) throw new NotFoundException('Loan not found.');
    if (loan.loan_status !== 'ACTIVE') throw new BadRequestException('This loan is already closed or cancelled.');
    if (loan._count.rndtechnosoft_loan_repayments) throw new BadRequestException('Some of this loan has been recovered, so it can’t be cancelled.');
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_loan_installments.updateMany({ where: { tenant_id: tenantId, employee_loan_id: loanId, installment_status: 'SCHEDULED' }, data: { installment_status: 'CANCELLED', updated_at: new Date() } });
      await tx.rndtechnosoft_employee_loans.update({ where: { tenant_id_id: { tenant_id: tenantId, id: loanId } }, data: { loan_status: 'CANCELLED', closed_at: new Date(), updated_at: new Date() } });
    });
    await this.log(tenantId, actor, 'LOAN_CANCELLED', loanId, { reason: reason.trim() });
    return this.get(tenantId, loanId);
  }

  private view(l: {
    id: string; loan_number: string; loan_type: string; principal_amount: Decimal; installment_amount: Decimal; start_date: Date; expected_end_date: Date | null; loan_status: string;
    rndtechnosoft_employees: { id: string; employee_code: string; first_name: string; last_name: string | null };
    rndtechnosoft_loan_installments: { total_amount: Decimal; installment_status: string; due_date: Date }[];
  }) {
    const sum = (status: string) => l.rndtechnosoft_loan_installments.filter((i) => i.installment_status === status).reduce((s, i) => s.plus(i.total_amount), D(0));
    const next = l.rndtechnosoft_loan_installments.find((i) => i.installment_status === 'SCHEDULED');
    return {
      id: l.id,
      loanNumber: l.loan_number,
      loanType: l.loan_type,
      employee: { id: l.rndtechnosoft_employees.id, code: l.rndtechnosoft_employees.employee_code, name: [l.rndtechnosoft_employees.first_name, l.rndtechnosoft_employees.last_name].filter(Boolean).join(' ') },
      principal: l.principal_amount.toFixed(2),
      installmentAmount: l.installment_amount.toFixed(2),
      firstMonth: isoDate(l.start_date).slice(0, 7),
      expectedEnd: l.expected_end_date ? isoDate(l.expected_end_date) : null,
      status: l.loan_status,
      recovered: sum('RECOVERED').toFixed(2),
      outstanding: sum('SCHEDULED').toFixed(2),
      nextDue: next ? { date: isoDate(next.due_date), amount: next.total_amount.toFixed(2) } : null,
    };
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMPLOYEE_LOAN', entityId: id, metadata });
  }
}
