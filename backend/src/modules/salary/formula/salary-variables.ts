import { Prisma } from '@prisma/client';
import { PayrollPolicyConfig } from '@/modules/payroll/policies/policy-config';

type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
/** Day and hour rates are kept to 4 decimal places, like other rates. */
const rate = (v: Decimal) => v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

export interface PayFigures {
  payBasis: 'MONTHLY' | 'DAILY' | 'HOURLY';
  monthlySalary: Decimal | null;
  annualCtc: Decimal | null;
  baseRate: Decimal | null;
}

export interface PeriodDays {
  calendarDays: number;
  /** Days that are neither weekly offs nor holidays. */
  workingDays: number;
}

/**
 * The salary and rate values a formula can use, from an employee's salary
 * and their payroll policy. Something that can't be worked out is a problem,
 * never a zero: a monthly salary missing for a monthly-paid employee, say.
 */
export function rateVariables(pay: PayFigures, policy: PayrollPolicyConfig, days: PeriodDays): { values: Record<string, Decimal>; problems: string[] } {
  const problems: string[] = [];
  const hoursPerDay = D(policy.hoursPerDay);
  const divisor = D(
    policy.divisor.method === 'CALENDAR_DAYS' ? days.calendarDays
    : policy.divisor.method === 'WORKING_DAYS' ? days.workingDays
    : (policy.divisor.fixedDays as number),
  );
  const values: Record<string, Decimal> = {
    CALENDAR_DAYS: D(days.calendarDays),
    WORKING_DAYS: D(days.workingDays),
    DIVISOR: divisor,
    HOURS_PER_DAY: hoursPerDay,
  };
  if (pay.annualCtc) values.ANNUAL_CTC = pay.annualCtc;
  if (divisor.lte(0)) problems.push('The policy’s divisor comes to zero days for this period.');

  if (pay.payBasis === 'MONTHLY') {
    if (!pay.monthlySalary) problems.push('The salary has no monthly salary.');
    else {
      values.MONTHLY_SALARY = pay.monthlySalary;
      if (divisor.gt(0)) {
        values.DAILY_RATE = rate(pay.monthlySalary.div(divisor));
        values.HOURLY_RATE = rate(values.DAILY_RATE.div(hoursPerDay));
      }
    }
  } else if (!pay.baseRate) {
    problems.push(`The salary has no ${pay.payBasis === 'DAILY' ? 'daily' : 'hourly'} rate.`);
  } else if (pay.payBasis === 'DAILY') {
    values.DAILY_RATE = pay.baseRate;
    values.HOURLY_RATE = rate(pay.baseRate.div(hoursPerDay));
  } else {
    values.HOURLY_RATE = pay.baseRate;
    values.DAILY_RATE = rate(pay.baseRate.times(hoursPerDay));
  }
  return { values, problems };
}

/** Calendar days and days that aren't weekly offs in a month (holidays are counted by payroll itself). */
export function monthDays(year: number, month: number, weeklyOffDays: number[]): PeriodDays & { weeklyOffs: number } {
  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let weeklyOffs = 0;
  for (let day = 1; day <= calendarDays; day += 1) if (weeklyOffDays.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay())) weeklyOffs += 1;
  return { calendarDays, workingDays: calendarDays - weeklyOffs, weeklyOffs };
}
