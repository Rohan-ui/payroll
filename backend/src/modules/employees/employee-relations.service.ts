import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, dayBefore, isOverlapViolation, isoDate } from '@/modules/payroll/payroll-lock';
import { CancelManagerDto, EndManagerDto, SetManagerDto } from './dto/employee-relations.dto';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;
const PERSON = { select: { id: true, first_name: true, last_name: true, preferred_name: true, employee_code: true } } as const;
const name = (e: { first_name: string; last_name: string | null; preferred_name: string | null }) => `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim();
/** Reporting chains are walked at most this far, which also stops on bad data. */
const MAX_CHAIN = 50;

/**
 * Who an employee reports to, and which sign-in account is theirs.
 *
 * Reporting lines are effective-dated history: a new manager closes the
 * current line the day before; a line made by mistake is cancelled, not
 * deleted; the database refuses two primary managers at once or reporting to
 * oneself, and here a chain that would loop back is refused too.
 *
 * Linking a login is explicit: matching work emails are only suggested.
 */
@Injectable()
export class EmployeeRelationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** The employee's manager today, the next one already set, and every line, newest first. */
  async reporting(tenantId: string, employeeId: string, today: Date = dateOnly(isoDate(new Date()))) {
    await this.findEmployee(this.prisma, tenantId, employeeId);
    const lines = await this.prisma.rndtechnosoft_employee_reporting_lines.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId, relationship_type: 'PRIMARY' },
      orderBy: [{ effective_from: 'desc' }, { created_at: 'desc' }],
      take: 100,
      include: {
        rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees: PERSON,
        created_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
        cancelled_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
      },
    });
    const present = lines.map((l) => {
      const manager = l.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees;
      return {
        lineId: l.id,
        manager: { id: manager.id, name: name(manager), code: manager.employee_code },
        effectiveFrom: isoDate(l.effective_from),
        effectiveTo: l.effective_to ? isoDate(l.effective_to) : null,
        status: l.line_status,
        reason: l.change_reason,
        setBy: l.created_by?.rndtechnosoft_users.display_name ?? null,
        setAt: l.created_at,
        cancelledBy: l.cancelled_by?.rndtechnosoft_users.display_name ?? null,
        cancellationReason: l.cancellation_reason,
      };
    });
    const active = present.filter((l) => l.status === 'ACTIVE');
    const todayIso = isoDate(today);
    return {
      current: active.find((l) => l.effectiveFrom <= todayIso && (!l.effectiveTo || l.effectiveTo >= todayIso)) ?? null,
      upcoming: [...active].reverse().find((l) => l.effectiveFrom > todayIso) ?? null,
      history: present,
    };
  }

  async setManager(tenantId: string, employeeId: string, input: SetManagerDto, actor: AuthenticatedTenantUser) {
    if (input.managerEmployeeId === employeeId) throw new BadRequestException('An employee can’t report to themselves.');
    const from = dateOnly(input.effectiveFrom);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      await this.findEmployee(tx, tenantId, employeeId);
      const manager = await tx.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: input.managerEmployeeId }, select: { employee_status: true, archived_at: true, ...PERSON.select } });
      if (!manager) throw new BadRequestException('The manager was not found in this workspace.');
      if (manager.employee_status !== 'ACTIVE' || manager.archived_at) throw new BadRequestException('Only an active employee can be a manager.');
      // The manager's own chain on that date must not lead back to this employee.
      const chain = await this.chainAbove(tx, tenantId, input.managerEmployeeId, from);
      if (chain.includes(employeeId)) {
        throw new BadRequestException(`${name(manager)} already reports, directly or through others, to this employee on that date, so this would make a loop.`);
      }
      const latest = await this.latest(tx, tenantId, employeeId);
      let closed: string | null = null;
      if (latest) {
        if (from <= latest.effective_from) {
          throw new BadRequestException(`The latest manager starts on ${isoDate(latest.effective_from)}. A new manager must start after that; to correct a mistake, cancel that line first.`);
        }
        if (latest.manager_employee_id === input.managerEmployeeId && (!latest.effective_to || latest.effective_to >= dayBefore(from))) {
          throw new BadRequestException(`They already report to ${name(manager)} on that date.`);
        }
        if (!latest.effective_to || latest.effective_to >= from) {
          await tx.rndtechnosoft_employee_reporting_lines.update({ where: { tenant_id_id: { tenant_id: tenantId, id: latest.id } }, data: { effective_to: dayBefore(from) } });
          closed = latest.id;
        }
      }
      const id = randomUUID();
      await tx.rndtechnosoft_employee_reporting_lines.create({
        data: {
          id, tenant_id: tenantId, employee_id: employeeId, manager_employee_id: input.managerEmployeeId, relationship_type: 'PRIMARY', effective_from: from,
          change_reason: input.reason?.trim() || null, created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      return { id, closed, previousManager: latest?.manager_employee_id ?? null };
    }).catch((e) => {
      if (isOverlapViolation(e)) throw new ConflictException('These dates overlap another manager for this employee. Reload and try again.');
      throw e;
    });
    await this.log(tenantId, actor, 'EMPLOYEE_MANAGER_SET', employeeId, {
      old: { manager_employee_id: result.previousManager },
      new: { manager_employee_id: input.managerEmployeeId, effective_from: input.effectiveFrom },
      line_id: result.id, closed_line_id: result.closed,
    });
    return this.reporting(tenantId, employeeId);
  }

  /** Ends an open line on a given last day, leaving the employee without a manager after it. */
  async endManager(tenantId: string, employeeId: string, lineId: string, input: EndManagerDto, actor: AuthenticatedTenantUser) {
    const to = dateOnly(input.effectiveTo);
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const line = await this.findLine(tx, tenantId, employeeId, lineId);
      if (line.line_status !== 'ACTIVE') throw new BadRequestException('This reporting line was cancelled.');
      if (line.effective_to) throw new BadRequestException(`This reporting line already ends on ${isoDate(line.effective_to)}.`);
      if (to < line.effective_from) throw new BadRequestException(`It starts on ${isoDate(line.effective_from)}, so it can’t end before that.`);
      await tx.rndtechnosoft_employee_reporting_lines.update({ where: { tenant_id_id: { tenant_id: tenantId, id: lineId } }, data: { effective_to: to } });
    });
    await this.log(tenantId, actor, 'EMPLOYEE_MANAGER_ENDED', employeeId, { old: { effective_to: null }, new: { effective_to: input.effectiveTo }, line_id: lineId });
    return this.reporting(tenantId, employeeId);
  }

  /** Cancels the latest line, made by mistake; the line before, if this one closed it, runs on again. */
  async cancelManager(tenantId: string, employeeId: string, lineId: string, input: CancelManagerDto, actor: AuthenticatedTenantUser) {
    const reopened = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const line = await this.findLine(tx, tenantId, employeeId, lineId);
      if (line.line_status !== 'ACTIVE') throw new BadRequestException('This reporting line is already cancelled.');
      const latest = await this.latest(tx, tenantId, employeeId);
      if (latest?.id !== lineId) throw new BadRequestException('Only the latest reporting line can be cancelled. Cancel the later ones first.');
      await tx.rndtechnosoft_employee_reporting_lines.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: lineId } },
        data: { line_status: 'CANCELLED', cancelled_at: new Date(), cancelled_by_tenant_member_id: actor.tenantMemberId, cancellation_reason: input.reason.trim() },
      });
      const previous = await this.latest(tx, tenantId, employeeId);
      if (previous?.effective_to && isoDate(previous.effective_to) === isoDate(dayBefore(line.effective_from))) {
        await tx.rndtechnosoft_employee_reporting_lines.update({ where: { tenant_id_id: { tenant_id: tenantId, id: previous.id } }, data: { effective_to: line.effective_to } });
        return previous.id;
      }
      return null;
    });
    await this.log(tenantId, actor, 'EMPLOYEE_MANAGER_CANCELLED', employeeId, { line_id: lineId, reason: input.reason.trim(), reopened_line_id: reopened });
    return this.reporting(tenantId, employeeId);
  }

  /**
   * The sign-in account linked to the employee, and, for people who may link
   * one, workspace members whose sign-in email matches the employee's work
   * email. A suggestion is never linked automatically.
   */
  async login(tenantId: string, employeeId: string, canManage: boolean) {
    const employee = await this.findEmployee(this.prisma, tenantId, employeeId);
    const linked = employee.user_id
      ? await this.prisma.rndtechnosoft_tenant_members.findFirst({
        where: { tenant_id: tenantId, user_id: employee.user_id },
        select: { id: true, membership_status: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
      })
      : null;
    let suggestions: { tenantMemberId: string; name: string; email: string }[] = [];
    if (canManage && !employee.user_id && employee.work_email) {
      const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
        where: { tenant_id: tenantId, membership_status: 'ACTIVE', archived_at: null, rndtechnosoft_users: { email: { equals: employee.work_email.trim(), mode: 'insensitive' } } },
        select: { id: true, user_id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
        take: 5,
      });
      const taken = await this.prisma.rndtechnosoft_employees.findMany({ where: { tenant_id: tenantId, user_id: { in: members.map((m) => m.user_id) } }, select: { user_id: true } });
      suggestions = members
        .filter((m) => !taken.some((t) => t.user_id === m.user_id))
        .map((m) => ({ tenantMemberId: m.id, name: m.rndtechnosoft_users.display_name ?? m.rndtechnosoft_users.email, email: m.rndtechnosoft_users.email }));
    }
    return {
      linked: linked && {
        tenantMemberId: linked.id,
        name: linked.rndtechnosoft_users.display_name ?? linked.rndtechnosoft_users.email,
        email: canManage ? linked.rndtechnosoft_users.email : null,
        active: linked.membership_status === 'ACTIVE',
      },
      // A user who is no longer a member of this workspace still shows as linked, so it can be undone.
      linkedOutsideWorkspace: !!employee.user_id && !linked,
      suggestions,
    };
  }

  /** Up to 20 active members, by name or sign-in email, who aren't linked to another employee. */
  async loginCandidates(tenantId: string, employeeId: string, search: string | undefined) {
    await this.findEmployee(this.prisma, tenantId, employeeId);
    const term = search?.trim();
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: {
        tenant_id: tenantId, membership_status: 'ACTIVE', archived_at: null,
        ...(term ? { rndtechnosoft_users: { OR: [{ display_name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] } } : {}),
      },
      orderBy: { rndtechnosoft_users: { display_name: 'asc' } },
      take: 40,
      select: { id: true, user_id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    const taken = await this.prisma.rndtechnosoft_employees.findMany({ where: { tenant_id: tenantId, user_id: { in: members.map((m) => m.user_id) }, NOT: { id: employeeId } }, select: { user_id: true } });
    return members
      .filter((m) => !taken.some((t) => t.user_id === m.user_id))
      .slice(0, 20)
      .map((m) => ({ id: m.id, name: m.rndtechnosoft_users.display_name ?? m.rndtechnosoft_users.email, code: m.rndtechnosoft_users.email }));
  }

  async linkLogin(tenantId: string, employeeId: string, tenantMemberId: string, actor: AuthenticatedTenantUser) {
    const before = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const employee = await this.findEmployee(tx, tenantId, employeeId);
      const member = await tx.rndtechnosoft_tenant_members.findFirst({ where: { tenant_id: tenantId, id: tenantMemberId }, select: { user_id: true, membership_status: true, archived_at: true } });
      if (!member) throw new BadRequestException('That member was not found in this workspace.');
      if (member.membership_status !== 'ACTIVE' || member.archived_at) throw new BadRequestException('Only an active member can be linked.');
      if (employee.user_id === member.user_id) return employee.user_id;
      const other = await tx.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, user_id: member.user_id }, select: { ...PERSON.select } });
      if (other) throw new ConflictException(`That sign-in account is already linked to ${name(other)} (${other.employee_code}). Unlink it there first.`);
      await tx.rndtechnosoft_employees.update({ where: { tenant_id_id: { tenant_id: tenantId, id: employeeId } }, data: { user_id: member.user_id, updated_at: new Date() } });
      return employee.user_id;
    });
    await this.log(tenantId, actor, 'EMPLOYEE_LOGIN_LINKED', employeeId, { old: { user_id: before }, new: { tenant_member_id: tenantMemberId } });
    return this.login(tenantId, employeeId, true);
  }

  async unlinkLogin(tenantId: string, employeeId: string, actor: AuthenticatedTenantUser) {
    const employee = await this.findEmployee(this.prisma, tenantId, employeeId);
    if (!employee.user_id) throw new BadRequestException('No sign-in account is linked to this employee.');
    await this.prisma.rndtechnosoft_employees.update({ where: { tenant_id_id: { tenant_id: tenantId, id: employeeId } }, data: { user_id: null, updated_at: new Date() } });
    await this.log(tenantId, actor, 'EMPLOYEE_LOGIN_UNLINKED', employeeId, { old: { user_id: employee.user_id }, new: { user_id: null } });
    return this.login(tenantId, employeeId, true);
  }

  /** The managers above an employee on a date, nearest first. */
  async chainAbove(db: Db, tenantId: string, employeeId: string, onDate: Date): Promise<string[]> {
    const chain: string[] = [];
    let current = employeeId;
    for (let i = 0; i < MAX_CHAIN; i += 1) {
      const line = await db.rndtechnosoft_employee_reporting_lines.findFirst({
        where: {
          tenant_id: tenantId, employee_id: current, relationship_type: 'PRIMARY', line_status: 'ACTIVE',
          effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }],
        },
        select: { manager_employee_id: true },
      });
      if (!line || chain.includes(line.manager_employee_id)) break;
      chain.push(line.manager_employee_id);
      current = line.manager_employee_id;
    }
    return chain;
  }

  private latest(tx: Tx, tenantId: string, employeeId: string) {
    return tx.rndtechnosoft_employee_reporting_lines.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, relationship_type: 'PRIMARY', line_status: 'ACTIVE' },
      orderBy: { effective_from: 'desc' },
    });
  }

  private async findLine(tx: Tx, tenantId: string, employeeId: string, lineId: string) {
    const line = await tx.rndtechnosoft_employee_reporting_lines.findFirst({ where: { tenant_id: tenantId, employee_id: employeeId, id: lineId } });
    if (!line) throw new NotFoundException('Reporting line not found.');
    return line;
  }

  private async findEmployee(db: Db, tenantId: string, employeeId: string) {
    const employee = await db.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: employeeId }, select: { id: true, user_id: true, work_email: true } });
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  /** An employee's reporting lines and login change one at a time. */
  private async lockEmployee(tx: Tx, tenantId: string, employeeId: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_employees WHERE tenant_id = ${tenantId}::uuid AND id = ${employeeId}::uuid FOR UPDATE`;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, employeeId: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMPLOYEE', entityId: employeeId, oldValues, newValues, metadata });
  }
}
