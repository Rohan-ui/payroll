import { Prisma } from '@prisma/client';
import { defaultPolicyConfig } from '@/modules/payroll/policies/policy-config';
import { monthDays, rateVariables } from './salary-variables';

const D = (v: string | number) => new Prisma.Decimal(v);
const show = (values: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.toFixed()]));

describe('salary rate values', () => {
  it('counts a month’s days and weekly offs', () => {
    // October 2026: 31 days, Sundays on the 4th, 11th, 18th and 25th.
    expect(monthDays(2026, 10, [0])).toEqual({ calendarDays: 31, workingDays: 27, weeklyOffs: 4 });
    expect(monthDays(2028, 2, [0, 6])).toEqual({ calendarDays: 29, workingDays: 21, weeklyOffs: 8 });
  });

  it('derives day and hour rates from a monthly salary with the policy’s divisor', () => {
    const policy = defaultPolicyConfig();
    const { values, problems } = rateVariables({ payBasis: 'MONTHLY', monthlySalary: D(31000), annualCtc: D(400000), baseRate: null }, policy, { calendarDays: 31, workingDays: 27 });
    expect(problems).toEqual([]);
    expect(show(values)).toMatchObject({ MONTHLY_SALARY: '31000', DIVISOR: '31', DAILY_RATE: '1000', HOURLY_RATE: '125', ANNUAL_CTC: '400000' });

    policy.divisor = { method: 'FIXED_DAYS', fixedDays: 26 };
    expect(show(rateVariables({ payBasis: 'MONTHLY', monthlySalary: D(26000), annualCtc: null, baseRate: null }, policy, { calendarDays: 31, workingDays: 27 }).values)).toMatchObject({ DIVISOR: '26', DAILY_RATE: '1000' });
    policy.divisor = { method: 'WORKING_DAYS', fixedDays: null };
    expect(show(rateVariables({ payBasis: 'MONTHLY', monthlySalary: D(27000), annualCtc: null, baseRate: null }, policy, { calendarDays: 31, workingDays: 27 }).values).DAILY_RATE).toBe('1000');
  });

  it('uses the rate itself for people paid by the day or hour', () => {
    const policy = defaultPolicyConfig();
    expect(show(rateVariables({ payBasis: 'DAILY', monthlySalary: null, annualCtc: null, baseRate: D(800) }, policy, { calendarDays: 30, workingDays: 26 }).values)).toMatchObject({ DAILY_RATE: '800', HOURLY_RATE: '100' });
    const hourly = rateVariables({ payBasis: 'HOURLY', monthlySalary: null, annualCtc: null, baseRate: D('150.5') }, policy, { calendarDays: 30, workingDays: 26 }).values;
    expect(show(hourly)).toMatchObject({ HOURLY_RATE: '150.5', DAILY_RATE: '1204' });
    expect(hourly.MONTHLY_SALARY).toBeUndefined();
  });

  it('reports a missing salary or rate instead of using zero', () => {
    const policy = defaultPolicyConfig();
    expect(rateVariables({ payBasis: 'MONTHLY', monthlySalary: null, annualCtc: null, baseRate: null }, policy, { calendarDays: 30, workingDays: 26 }).problems).toEqual(['The salary has no monthly salary.']);
    expect(rateVariables({ payBasis: 'HOURLY', monthlySalary: null, annualCtc: null, baseRate: null }, policy, { calendarDays: 30, workingDays: 26 }).problems).toEqual(['The salary has no hourly rate.']);
  });
});
