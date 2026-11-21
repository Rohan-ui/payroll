import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { SalaryAssignmentsService } from '@/modules/salary/salary-assignments.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { noticeOf } from './offboarding.service';
import {
  calculateSettlement, CalculatedLine, MANUAL_COMPONENTS, settlementPolicy, SettlementInputs, SettlementPolicy, settlementTotals,
} from './settlement-calculation';
import { AdjustSettlementLineDto, ManualSettlementLineDto, SettlementPaymentDto, SettlementPolicyDto } from './dto/settlement.dto';
import { OffboardingNotificationsService } from './offboarding-notifications.service';

type Tx = Prisma.TransactionClient;
type Actor = AuthenticatedTenantUser;
type Status = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'REVISED';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const LINES = { rndtechnosoft_final_settlement_lines: { orderBy: { display_order: 'asc' } } } as const;
type SettlementRow = Prisma.rndtechnosoft_final_settlementsGetPayload<{ include: typeof LINES }>;
const LOAN_CODES = ['LOAN_RECOVERY', 'ADVANCE_RECOVERY'];

/**
 * Full and final settlement for an exit: HR prepares it from the rules, Finance
 * reviews it, someone other than the people who prepared and submitted it
 * approves it, and Finance records the payment, which settles the loans and
 * uses up the encashed leave. One live settlement per exit; an approved one is
 * changed only by revising it into a new version.
 */
@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly salary: SalaryAssignmentsService, private readonly notifications: OffboardingNotificationsService) {}

  // ── Rules ───────────────────────────────────────────────────

  async policy(tenantId: string): Promise<SettlementPolicy> {
    const rows = await this.prisma.$queryRaw<{ policy: unknown }[]>`
      SELECT settings->'settlementPolicy' AS policy FROM rndtechnosoft_tenant_settings WHERE tenant_id = ${tenantId}::uuid
    `;
    return settlementPolicy(rows[0]?.policy ?? null);
  }

  async setPolicy(tenantId: string, input: SettlementPolicyDto, actor: Actor) {
    const before = await this.policy(tenantId);
    const next = settlementPolicy({ ...before, ...input });
    if (next.gratuity.cap !== null && !/^\d{1,12}(\.\d{1,2})?$/.test(next.gratuity.cap)) throw new BadRequestException('Give the gratuity limit as an amount in rupees.');
    // Merged into the settings JSON, so other settings stay as they are.
    await this.prisma.$executeRaw`
      INSERT INTO rndtechnosoft_tenant_settings (id, tenant_id, settings, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, jsonb_build_object('settlementPolicy', ${JSON.stringify(next)}::jsonb), NOW(), NOW())
      ON CONFLICT (tenant_id) DO UPDATE
      SET settings = rndtechnosoft_tenant_settings.settings || jsonb_build_object('settlementPolicy', ${JSON.stringify(next)}::jsonb), updated_at = NOW()
    `;
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'SETTLEMENT_POLICY_UPDATED', entityType: 'SETTLEMENT_POLICY', entityId: tenantId, oldValues: before as never, newValues: next as never });
    return next;
  }

  // ── Reading ─────────────────────────────────────────────────

  async forSeparation(tenantId: string, separationId: string) {
    const separation = await this.separation(tenantId, separationId);
    const rows = await this.prisma.rndtechnosoft_final_settlements.findMany({
      where: { tenant_id: tenantId, separation_id: separationId }, orderBy: { version_number: 'desc' }, include: LINES,
    });
    const live = rows.find((r) => ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PAID'].includes(r.settlement_status)) ?? null;
    return {
      current: live ? await this.view(tenantId, live) : null,
      history: rows.map((r) => ({ id: r.id, version: r.version_number, status: r.settlement_status as Status, net: r.net_amount.toFixed(2), createdAt: r.created_at.toISOString() })),
      canPrepare: !live && ['IN_PROGRESS', 'COMPLETED'].includes(separation.separation_status),
    };
  }

  // ── Preparing ───────────────────────────────────────────────

  async prepare(tenantId: string, separationId: string, actor: Actor, revisedFrom?: SettlementRow) {
    const separation = await this.separation(tenantId, separationId);
    this.notOwn(separation.employee_user_id, actor);
    if (!['IN_PROGRESS', 'COMPLETED'].includes(separation.separation_status)) throw new BadRequestException('A settlement is prepared once the exit is under way.');
    const { inputs, policy, calculation } = await this.calculate(tenantId, separation);
    const id = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        const last = await tx.rndtechnosoft_final_settlements.aggregate({ where: { tenant_id: tenantId, separation_id: separationId }, _max: { version_number: true } });
        const lines = this.mergeAdjustments(calculation.lines, revisedFrom?.rndtechnosoft_final_settlement_lines ?? []);
        const totals = settlementTotals(lines.map((l) => ({ kind: l.kind, amount: l.amount, countsInTotal: l.countsInTotal })));
        await tx.rndtechnosoft_final_settlements.create({
          data: {
            id, tenant_id: tenantId, separation_id: separationId, employee_id: separation.employee_id, version_number: (last._max.version_number ?? 0) + 1,
            total_earnings: totals.earnings, total_recoveries: totals.recoveries, net_amount: totals.net,
            policy_snapshot: policy as unknown as Prisma.InputJsonValue, inputs_snapshot: { ...inputs, problems: calculation.problems } as unknown as Prisma.InputJsonValue,
            calculated_at: new Date(), prepared_by_tenant_member_id: actor.tenantMemberId, revised_from_settlement_id: revisedFrom?.id ?? null,
          },
        });
        await this.writeLines(tx, tenantId, id, lines);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This exit already has a settlement in progress. Reload to see it.');
      throw error;
    }
    await this.log(tenantId, actor, revisedFrom ? 'SETTLEMENT_REVISED' : 'SETTLEMENT_PREPARED', id, { separation_id: separationId, revised_from: revisedFrom?.id ?? null });
    return this.forSeparation(tenantId, separationId);
  }

  /** Works the draft out again from current data, keeping hand-made lines and adjustments whose reason still applies. */
  async recalculate(tenantId: string, id: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.requireStatus(row, ['DRAFT']);
    const separation = await this.separation(tenantId, row.separation_id);
    const { inputs, policy, calculation } = await this.calculate(tenantId, separation);
    const before = row.net_amount.toFixed(2);
    await this.prisma.$transaction(async (tx) => {
      const lines = this.mergeAdjustments(calculation.lines, row.rndtechnosoft_final_settlement_lines);
      // A draft's lines are working figures, replaced as a whole; approved settlements are never touched.
      await tx.rndtechnosoft_final_settlement_lines.deleteMany({ where: { tenant_id: tenantId, settlement_id: id } });
      await this.writeLines(tx, tenantId, id, lines);
      await this.touchTotals(tx, tenantId, id, ['DRAFT'], {
        policy_snapshot: policy as unknown as Prisma.InputJsonValue, inputs_snapshot: { ...inputs, problems: calculation.problems } as unknown as Prisma.InputJsonValue, calculated_at: new Date(),
      });
    });
    const after = await this.find(tenantId, id);
    await this.log(tenantId, actor, 'SETTLEMENT_RECALCULATED', id, { old: { net: before }, new: { net: after.net_amount.toFixed(2) } });
    return this.forSeparation(tenantId, row.separation_id);
  }

  async addLine(tenantId: string, id: string, input: ManualSettlementLineDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.requireStatus(row, ['DRAFT']);
    const kind = MANUAL_COMPONENTS[input.code];
    const last = row.rndtechnosoft_final_settlement_lines.reduce((max, l) => Math.max(max, l.display_order), 0);
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_final_settlement_lines.create({
        data: {
          id: randomUUID(), tenant_id: tenantId, settlement_id: id, line_kind: kind, component_code: input.code, line_label: input.label.trim(),
          calculated_amount: null, amount: D(input.amount), is_manual: true, adjustment_reason: input.reason.trim(), basis: { rule: 'Added by hand' }, display_order: last + 1,
        },
      });
      await this.touchTotals(tx, tenantId, id, ['DRAFT']);
    });
    await this.log(tenantId, actor, 'SETTLEMENT_LINE_ADDED', id, { new: { code: input.code, label: input.label.trim(), amount: input.amount }, reason: input.reason.trim() });
    return this.forSeparation(tenantId, row.separation_id);
  }

  async adjustLine(tenantId: string, id: string, lineId: string, input: AdjustSettlementLineDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.requireStatus(row, ['DRAFT']);
    const line = row.rndtechnosoft_final_settlement_lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Settlement line not found.');
    if (!line.counts_in_total) throw new BadRequestException('This line is for information only; it is paid through payroll.');
    const amount = D(input.amount);
    const reason = input.reason?.trim() || null;
    const changed = line.is_manual || !amount.equals(line.calculated_amount ?? 0);
    if (changed && !reason) throw new BadRequestException('Say why the amount is changing.');
    if (LOAN_CODES.includes(line.component_code)) {
      const outstanding = D((line.basis as { outstanding?: string }).outstanding ?? 0);
      if (amount.gt(outstanding)) throw new BadRequestException(`No more than the ${outstanding.toFixed(2)} outstanding can be recovered.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_final_settlement_lines.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: lineId } },
        data: { amount, adjustment_reason: changed ? reason : null, updated_at: new Date() },
      });
      await this.touchTotals(tx, tenantId, id, ['DRAFT']);
    });
    await this.log(tenantId, actor, 'SETTLEMENT_LINE_ADJUSTED', id, { line_id: lineId, old: { amount: line.amount.toFixed(2) }, new: { amount: amount.toFixed(2) }, reason });
    return this.forSeparation(tenantId, row.separation_id);
  }

  // ── Workflow ────────────────────────────────────────────────

  async submit(tenantId: string, id: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    const problems = (row.inputs_snapshot as { problems?: string[] }).problems ?? [];
    if (problems.length) throw new BadRequestException(`Resolve these first, then recalculate: ${problems.join(' ')}`);
    await this.transition(tenantId, id, ['DRAFT'], { settlement_status: 'PENDING_REVIEW', submitted_at: new Date(), submitted_by_tenant_member_id: actor.tenantMemberId });
    await this.log(tenantId, actor, 'SETTLEMENT_SUBMITTED', id, { new: { status: 'PENDING_REVIEW', net: row.net_amount.toFixed(2) } });
    this.notifications.notify(tenantId, 'SETTLEMENT_PENDING_REVIEW', row.separation_id, { actor, key: id });
    return this.forSeparation(tenantId, row.separation_id);
  }

  async review(tenantId: string, id: string, notes: string | undefined, actor: Actor) {
    const row = await this.find(tenantId, id);
    await this.ownGuard(tenantId, row, actor);
    await this.transition(tenantId, id, ['PENDING_REVIEW'], { reviewed_at: new Date(), reviewed_by_tenant_member_id: actor.tenantMemberId, review_notes: notes?.trim() || null });
    await this.log(tenantId, actor, 'SETTLEMENT_REVIEWED', id, { notes: notes?.trim() || null });
    return this.forSeparation(tenantId, row.separation_id);
  }

  async approve(tenantId: string, id: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    await this.ownGuard(tenantId, row, actor);
    if (!row.reviewed_at) throw new BadRequestException('Finance must review the settlement before it is approved.');
    if (row.prepared_by_tenant_member_id === actor.tenantMemberId || row.submitted_by_tenant_member_id === actor.tenantMemberId) {
      throw new ForbiddenException('You prepared or submitted this settlement, so someone else must approve it.');
    }
    await this.assertCurrent(tenantId, row);
    await this.transition(tenantId, id, ['PENDING_REVIEW'], { settlement_status: 'APPROVED', approved_at: new Date(), approved_by_tenant_member_id: actor.tenantMemberId });
    await this.log(tenantId, actor, 'SETTLEMENT_APPROVED', id, { new: { status: 'APPROVED', net: row.net_amount.toFixed(2) } });
    this.notifications.notify(tenantId, 'SETTLEMENT_APPROVED', row.separation_id, { actor, key: id });
    return this.forSeparation(tenantId, row.separation_id);
  }

  async reject(tenantId: string, id: string, reason: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    await this.ownGuard(tenantId, row, actor);
    await this.transition(tenantId, id, ['PENDING_REVIEW'], { settlement_status: 'REJECTED', rejected_at: new Date(), rejected_by_tenant_member_id: actor.tenantMemberId, rejection_reason: reason.trim() });
    await this.log(tenantId, actor, 'SETTLEMENT_REJECTED', id, { new: { status: 'REJECTED' }, reason: reason.trim() });
    return this.forSeparation(tenantId, row.separation_id);
  }

  async cancel(tenantId: string, id: string, reason: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    await this.transition(tenantId, id, ['DRAFT', 'PENDING_REVIEW'], { settlement_status: 'CANCELLED', closed_at: new Date(), closed_by_tenant_member_id: actor.tenantMemberId, close_reason: reason.trim() });
    await this.log(tenantId, actor, 'SETTLEMENT_CANCELLED', id, { old: { status: row.settlement_status }, new: { status: 'CANCELLED' }, reason: reason.trim() });
    return this.forSeparation(tenantId, row.separation_id);
  }

  /** An approved settlement that needs changing is kept as REVISED and a new draft starts from it, keeping its adjustments. */
  async revise(tenantId: string, id: string, reason: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    await this.transition(tenantId, id, ['APPROVED'], { settlement_status: 'REVISED', closed_at: new Date(), closed_by_tenant_member_id: actor.tenantMemberId, close_reason: reason.trim() });
    return this.prepare(tenantId, row.separation_id, actor, row);
  }

  /**
   * Records the payment. Loans and advances are settled here: what is
   * recovered is recorded against them and anything not recovered is waived,
   * so payroll can never deduct it again. Encashed leave is taken off the
   * balance so it can't be encashed twice.
   */
  async pay(tenantId: string, id: string, input: SettlementPaymentDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    await this.ownGuard(tenantId, row, actor);
    await this.assertCurrent(tenantId, row);
    const paymentDate = dateOnly(input.paymentDate);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tenantId, id, ['APPROVED'], {
        settlement_status: 'PAID', paid_at: now, paid_by_tenant_member_id: actor.tenantMemberId, payment_date: paymentDate, payment_mode: input.mode,
        payment_reference: input.reference?.trim() || null, payment_remarks: input.remarks?.trim() || null,
      }, tx);
      for (const line of row.rndtechnosoft_final_settlement_lines) {
        const basis = line.basis as { loanId?: string; installmentIds?: string[]; outstanding?: string; leaveTypeId?: string; days?: string };
        if (LOAN_CODES.includes(line.component_code) && basis.loanId) await this.settleLoan(tx, tenantId, row.id, basis.loanId, basis.installmentIds ?? [], line.amount, D(basis.outstanding ?? 0), paymentDate, now);
        if (line.component_code === 'LEAVE_ENCASHMENT' && basis.leaveTypeId && basis.days && line.amount.gt(0)) {
          await tx.rndtechnosoft_leave_balance_transactions.create({
            data: {
              id: randomUUID(), tenant_id: tenantId, employee_id: row.employee_id, leave_type_id: basis.leaveTypeId, transaction_date: paymentDate, transaction_type: 'ENCASHMENT',
              quantity_days: D(basis.days).negated(), reference_type: 'FINAL_SETTLEMENT', reference_id: row.id, description: `Encashed in the final settlement (version ${row.version_number})`,
            },
          });
          await tx.rndtechnosoft_leave_balance_summaries.updateMany({
            where: { tenant_id: tenantId, employee_id: row.employee_id, leave_type_id: basis.leaveTypeId },
            data: { balance_days: { decrement: D(basis.days) }, as_of_date: paymentDate, updated_at: now },
          });
        }
      }
    });
    this.notifications.notify(tenantId, 'SETTLEMENT_PAID', row.separation_id, { actor, key: id, detail: input.paymentDate });
    await this.log(tenantId, actor, 'SETTLEMENT_PAID', id, { new: { status: 'PAID', net: row.net_amount.toFixed(2), payment_date: input.paymentDate, mode: input.mode, reference: input.reference?.trim() || null } });
    return this.forSeparation(tenantId, row.separation_id);
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async settleLoan(tx: Tx, tenantId: string, settlementId: string, loanId: string, installmentIds: string[], recovered: Prisma.Decimal, outstanding: Prisma.Decimal, paymentDate: Date, now: Date) {
    const open = await tx.rndtechnosoft_loan_installments.findMany({ where: { tenant_id: tenantId, employee_loan_id: loanId, installment_status: { in: ['SCHEDULED', 'DEFERRED'] } }, orderBy: { due_date: 'asc' } });
    if (open.map((i) => i.id).sort().join() !== [...installmentIds].sort().join()) {
      throw new ConflictException('A loan changed after this settlement was worked out. Revise the settlement and approve it again.');
    }
    const full = recovered.equals(outstanding);
    if (full) {
      for (const installment of open) {
        await tx.rndtechnosoft_loan_installments.update({ where: { tenant_id_id: { tenant_id: tenantId, id: installment.id } }, data: { installment_status: 'RECOVERED', updated_at: now } });
        await tx.rndtechnosoft_loan_repayments.create({
          data: { id: randomUUID(), tenant_id: tenantId, employee_loan_id: loanId, loan_installment_id: installment.id, repayment_date: paymentDate, amount: installment.total_amount, repayment_source: 'FINAL_SETTLEMENT', notes: `Recovered in final settlement ${settlementId}` },
        });
      }
    } else {
      // Part recovered, the rest waived as approved: one repayment for what was recovered, the open instalments cancelled.
      if (recovered.gt(0)) {
        await tx.rndtechnosoft_loan_repayments.create({
          data: { id: randomUUID(), tenant_id: tenantId, employee_loan_id: loanId, repayment_date: paymentDate, amount: recovered, repayment_source: 'FINAL_SETTLEMENT', notes: `Recovered in final settlement ${settlementId}; ${outstanding.minus(recovered).toFixed(2)} waived` },
        });
      }
      await tx.rndtechnosoft_loan_installments.updateMany({ where: { tenant_id: tenantId, id: { in: open.map((i) => i.id) } }, data: { installment_status: 'CANCELLED', updated_at: now } });
    }
    await tx.rndtechnosoft_employee_loans.updateMany({ where: { tenant_id: tenantId, id: loanId, loan_status: 'ACTIVE' }, data: { loan_status: 'CLOSED', closed_at: now, updated_at: now } });
  }

  /** Refuses when the data behind the calculated lines has changed since they were worked out. */
  private async assertCurrent(tenantId: string, row: SettlementRow) {
    const separation = await this.separation(tenantId, row.separation_id);
    const { calculation } = await this.calculate(tenantId, separation, row.policy_snapshot);
    const key = (code: string, label: string) => `${code}|${label}`;
    const now = new Map(calculation.lines.map((l) => [key(l.code, l.label), l.amount.toFixed(2)]));
    const stored = row.rndtechnosoft_final_settlement_lines.filter((l) => !l.is_manual);
    const changed = stored.filter((l) => now.get(key(l.component_code, l.line_label)) !== l.calculated_amount?.toFixed(2)).map((l) => l.line_label);
    if (changed.length || now.size !== stored.length) {
      throw new ConflictException(`The figures have changed since this settlement was worked out${changed.length ? ` (${changed.join(', ')})` : ''}. Revise or recalculate it first.`);
    }
  }

  private async calculate(tenantId: string, separation: Awaited<ReturnType<SettlementsService['separation']>>, policySnapshot?: Prisma.JsonValue) {
    const policy = policySnapshot ? settlementPolicy(policySnapshot) : await this.policy(tenantId);
    const inputs = await this.gather(tenantId, separation);
    return { inputs, policy, calculation: calculateSettlement(inputs, policy) };
  }

  private async gather(tenantId: string, s: Awaited<ReturnType<SettlementsService['separation']>>): Promise<SettlementInputs> {
    const lastDay = s.last_working_date;
    const employeeId = s.employee_id;
    const [firstEmployment, monthly, policyAssignment, balances, loans, payslip, assets] = await Promise.all([
      this.prisma.rndtechnosoft_employee_employments.findFirst({ where: { tenant_id: tenantId, employee_id: employeeId }, orderBy: { joining_date: 'asc' }, select: { joining_date: true } }),
      this.salary.monthlyOn(tenantId, employeeId, lastDay),
      this.prisma.rndtechnosoft_employee_leave_policy_assignments.findFirst({
        where: { tenant_id: tenantId, employee_id: employeeId, effective_from: { lte: lastDay }, OR: [{ effective_to: null }, { effective_to: { gte: lastDay } }] },
        orderBy: { effective_from: 'desc' },
        select: { rndtechnosoft_leave_policies: { select: { rndtechnosoft_leave_policy_rules: { select: { leave_type_id: true, encashment_allowed: true } } } } },
      }),
      this.prisma.rndtechnosoft_leave_balance_summaries.findMany({ where: { tenant_id: tenantId, employee_id: employeeId }, include: { rndtechnosoft_leave_types: { select: { leave_type_name: true } } } }),
      this.prisma.rndtechnosoft_employee_loans.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId, loan_status: 'ACTIVE' }, orderBy: { start_date: 'asc' },
        select: { id: true, loan_number: true, loan_type: true, rndtechnosoft_loan_installments: { where: { installment_status: { in: ['SCHEDULED', 'DEFERRED'] } }, select: { id: true, total_amount: true } } },
      }),
      this.prisma.rndtechnosoft_payslips.findFirst({
        where: { tenant_id: tenantId, employee_id: employeeId, rndtechnosoft_payroll_runs: { run_status: 'FINALIZED' }, rndtechnosoft_payroll_periods: { period_start: { lte: lastDay }, period_end: { gte: lastDay } } },
        orderBy: { created_at: 'desc' },
        select: { gross_earnings: true, net_pay: true, rndtechnosoft_payroll_periods: { select: { period_code: true } } },
      }),
      this.prisma.rndtechnosoft_employee_assets.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId, OR: [{ return_status: 'ISSUED' }, { separation_id: s.id, recovery_amount: { gt: 0 }, return_status: { in: ['LOST', 'RETURNED'] } }] },
        orderBy: { assigned_date: 'asc' },
        select: { id: true, asset_name: true, asset_tag: true, return_status: true, recovery_amount: true },
      }),
    ]);
    const encashable = new Set((policyAssignment?.rndtechnosoft_leave_policies.rndtechnosoft_leave_policy_rules ?? []).filter((r) => r.encashment_allowed).map((r) => r.leave_type_id));
    const notice = noticeOf({ noticeDate: isoDate(s.notice_date), requiredDays: s.notice_period_days, requestedLastDay: isoDate(s.requested_last_working_date), lastDay: isoDate(lastDay) });
    return {
      separationType: s.separation_type,
      joiningDate: isoDate(firstEmployment?.joining_date ?? s.hire_date ?? lastDay),
      lastWorkingDate: isoDate(lastDay),
      monthlySalary: monthly && { gross: monthly.gross, components: monthly.components },
      notice: { shortfallDays: notice.shortfallDays, decision: s.notice_shortfall_decision as 'RECOVER' | 'WAIVE' | null },
      leave: balances.map((b) => ({ leaveTypeId: b.leave_type_id, name: b.rndtechnosoft_leave_types.leave_type_name, balanceDays: b.balance_days.toFixed(), encashable: encashable.has(b.leave_type_id), asOf: isoDate(b.as_of_date) })),
      loans: loans.filter((l) => l.rndtechnosoft_loan_installments.length).map((l) => ({
        loanId: l.id, number: l.loan_number, type: l.loan_type,
        outstanding: l.rndtechnosoft_loan_installments.reduce((t, i) => t.add(i.total_amount), D(0)).toFixed(2),
        installmentIds: l.rndtechnosoft_loan_installments.map((i) => i.id),
      })),
      assetRecoveries: assets.filter((a) => a.return_status !== 'ISSUED' && a.recovery_amount).map((a) => ({
        assetId: a.id, name: a.asset_name, tag: a.asset_tag, status: a.return_status, amount: (a.recovery_amount ?? D(0)).toFixed(2),
      })),
      assetsOut: assets.filter((a) => a.return_status === 'ISSUED').length,
      finalPayslip: payslip && { periodCode: payslip.rndtechnosoft_payroll_periods.period_code, gross: payslip.gross_earnings.toFixed(2), net: payslip.net_pay.toFixed(2) },
    };
  }

  /** Recalculated lines with the earlier adjustments and hand-made lines carried over. */
  private mergeAdjustments(calculated: CalculatedLine[], previous: SettlementRow['rndtechnosoft_final_settlement_lines']) {
    const adjusted = new Map(previous.filter((l) => !l.is_manual && l.adjustment_reason).map((l) => [`${l.component_code}|${l.line_label}`, l]));
    const lines = calculated.map((l) => {
      const before = adjusted.get(`${l.code}|${l.label}`);
      return { ...l, calculated: l.amount, isManual: false, amount: before ? before.amount : l.amount, reason: before?.adjustment_reason ?? null };
    });
    const manual = previous.filter((l) => l.is_manual).map((l) => ({
      kind: l.line_kind as 'EARNING' | 'RECOVERY', code: l.component_code as CalculatedLine['code'], label: l.line_label, amount: l.amount, calculated: null, countsInTotal: true, isManual: true,
      reason: l.adjustment_reason, basis: l.basis as Record<string, unknown>,
    }));
    return [...lines, ...manual];
  }

  private writeLines(tx: Tx, tenantId: string, settlementId: string, lines: ReturnType<SettlementsService['mergeAdjustments']>) {
    return tx.rndtechnosoft_final_settlement_lines.createMany({
      data: lines.map((l, index) => ({
        id: randomUUID(), tenant_id: tenantId, settlement_id: settlementId, line_kind: l.kind, component_code: l.code, line_label: l.label.slice(0, 200),
        calculated_amount: l.calculated, amount: l.amount, counts_in_total: l.countsInTotal, is_manual: l.isManual, adjustment_reason: l.reason,
        basis: l.basis as Prisma.InputJsonValue, display_order: index + 1,
      })),
    });
  }

  private async touchTotals(tx: Tx, tenantId: string, id: string, from: Status[], extra: Prisma.rndtechnosoft_final_settlementsUncheckedUpdateManyInput = {}) {
    const lines = await tx.rndtechnosoft_final_settlement_lines.findMany({ where: { tenant_id: tenantId, settlement_id: id }, select: { line_kind: true, amount: true, counts_in_total: true } });
    const totals = settlementTotals(lines.map((l) => ({ kind: l.line_kind, amount: l.amount, countsInTotal: l.counts_in_total })));
    await this.transition(tenantId, id, from, { ...extra, total_earnings: totals.earnings, total_recoveries: totals.recoveries, net_amount: totals.net }, tx);
  }

  private async transition(tenantId: string, id: string, from: Status[], data: Prisma.rndtechnosoft_final_settlementsUncheckedUpdateManyInput, db: Tx | PrismaService = this.prisma) {
    const changed = await db.rndtechnosoft_final_settlements.updateMany({ where: { tenant_id: tenantId, id, settlement_status: { in: from } }, data: { ...data, updated_at: new Date() } });
    if (changed.count !== 1) throw new ConflictException('This settlement has changed since you opened it. Reload it and try again.');
  }

  private requireStatus(row: SettlementRow, allowed: Status[]) {
    if (!allowed.includes(row.settlement_status as Status)) throw new BadRequestException('Only a draft settlement can be changed. Revise an approved one instead.');
  }

  private async find(tenantId: string, id: string): Promise<SettlementRow> {
    const row = await this.prisma.rndtechnosoft_final_settlements.findFirst({ where: { tenant_id: tenantId, id }, include: LINES });
    if (!row) throw new NotFoundException('Settlement not found.');
    return row;
  }

  private async separation(tenantId: string, id: string) {
    const row = await this.prisma.rndtechnosoft_employee_separations.findFirst({
      where: { tenant_id: tenantId, id },
      select: {
        id: true, employee_id: true, separation_type: true, separation_status: true, notice_date: true, notice_period_days: true, requested_last_working_date: true,
        last_working_date: true, notice_shortfall_decision: true, rndtechnosoft_employees: { select: { user_id: true, hire_date: true } },
      },
    });
    if (!row) throw new NotFoundException('Exit not found.');
    const { rndtechnosoft_employees: employee, ...rest } = row;
    return { ...rest, employee_user_id: employee.user_id, hire_date: employee.hire_date };
  }

  private notOwn(employeeUserId: string | null, actor: Actor) {
    if (employeeUserId && employeeUserId === actor.userId) throw new ForbiddenException('You can’t act on your own settlement. Ask someone else.');
  }

  private async ownGuard(tenantId: string, row: SettlementRow, actor: Actor) {
    this.notOwn((await this.separation(tenantId, row.separation_id)).employee_user_id, actor);
  }

  private async view(tenantId: string, r: SettlementRow) {
    const ids = [r.prepared_by_tenant_member_id, r.submitted_by_tenant_member_id, r.reviewed_by_tenant_member_id, r.approved_by_tenant_member_id, r.rejected_by_tenant_member_id, r.paid_by_tenant_member_id, r.closed_by_tenant_member_id].filter((v): v is string => !!v);
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({ where: { tenant_id: tenantId, id: { in: ids } }, select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } });
    const name = (id: string | null) => {
      const m = members.find((x) => x.id === id);
      return m ? m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email : null;
    };
    const at = (d: Date | null) => d?.toISOString() ?? null;
    const inputs = r.inputs_snapshot as unknown as SettlementInputs & { problems?: string[] };
    return {
      id: r.id, version: r.version_number, status: r.settlement_status as Status, currency: r.currency_code,
      totals: { earnings: r.total_earnings.toFixed(2), recoveries: r.total_recoveries.toFixed(2), net: r.net_amount.toFixed(2) },
      lines: r.rndtechnosoft_final_settlement_lines.map((l) => ({
        id: l.id, kind: l.line_kind as 'EARNING' | 'RECOVERY', code: l.component_code, label: l.line_label, calculatedAmount: l.calculated_amount?.toFixed(2) ?? null,
        amount: l.amount.toFixed(2), countsInTotal: l.counts_in_total, isManual: l.is_manual, adjustmentReason: l.adjustment_reason, basis: l.basis,
      })),
      problems: inputs.problems ?? [],
      finalPayslip: inputs.finalPayslip ?? null,
      policy: r.policy_snapshot,
      calculatedAt: r.calculated_at.toISOString(),
      preparedBy: name(r.prepared_by_tenant_member_id),
      submittedBy: name(r.submitted_by_tenant_member_id), submittedAt: at(r.submitted_at),
      reviewedBy: name(r.reviewed_by_tenant_member_id), reviewedAt: at(r.reviewed_at), reviewNotes: r.review_notes,
      approvedBy: name(r.approved_by_tenant_member_id), approvedAt: at(r.approved_at),
      rejectedBy: name(r.rejected_by_tenant_member_id), rejectionReason: r.rejection_reason,
      paidBy: name(r.paid_by_tenant_member_id), paidAt: at(r.paid_at),
      payment: r.payment_date ? { date: isoDate(r.payment_date), mode: r.payment_mode, reference: r.payment_reference, remarks: r.payment_remarks } : null,
      closedBy: name(r.closed_by_tenant_member_id), closeReason: r.close_reason,
    };
  }

  private log(tenantId: string, actor: Actor, actionCode: string, settlementId: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'FINAL_SETTLEMENT', entityId: settlementId, oldValues, newValues, metadata });
  }
}
