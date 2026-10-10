import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;
const DAY = 24 * 60 * 60 * 1000;

/** A YYYY-MM-DD business date as stored in a DATE column (UTC midnight). */
export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function dayBefore(value: Date): Date {
  return new Date(value.getTime() - DAY);
}

/**
 * The last day of finalized payroll: for one employee, or for anyone in the
 * workspace. Pay rules and salaries can only change from the day after, since
 * finalized payroll is never recalculated in place (a later correction goes
 * through arrears).
 */
export async function finalizedThrough(db: Db, tenantId: string, employeeId?: string): Promise<Date | null> {
  const run = await db.rndtechnosoft_payroll_runs.findFirst({
    where: {
      tenant_id: tenantId,
      run_status: 'FINALIZED',
      ...(employeeId ? { rndtechnosoft_payroll_run_employees: { some: { tenant_id: tenantId, employee_id: employeeId } } } : {}),
    },
    orderBy: { rndtechnosoft_payroll_periods: { period_end: 'desc' } },
    select: { rndtechnosoft_payroll_periods: { select: { period_end: true } } },
  });
  return run?.rndtechnosoft_payroll_periods.period_end ?? null;
}

/** Refusal text for a change dated on or before finalized payroll, or null when the date is open. */
export function lockedProblem(effectiveFrom: Date, lockedThrough: Date | null, what: string): string | null {
  if (!lockedThrough || effectiveFrom > lockedThrough) return null;
  const next = isoDate(new Date(lockedThrough.getTime() + DAY));
  return `Payroll is finalized up to ${isoDate(lockedThrough)}, so ${what} can take effect from ${next} at the earliest.`;
}

/** Whether an error is PostgreSQL refusing overlapping dates (an exclusion constraint). */
export function isOverlapViolation(error: unknown): boolean {
  const text = error instanceof Error ? error.message : '';
  return text.includes('23P01') || text.includes('exclusion constraint');
}
