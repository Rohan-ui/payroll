import { Prisma } from '@prisma/client';
import { PayrollPolicyConfig, PenaltyRule } from '../policies/policy-config';

/**
 * Overtime pay and late-arrival / early-departure deductions for a month,
 * by the payroll policy's rules, each with the steps that explain it.
 * Amounts are exact decimals, rounded once to paise at the end of each day
 * or occurrence.
 */

type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);
const paise = (v: Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export type DayType = 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY';

export interface OvertimeDay {
  date: string;
  dayType: DayType;
  /** Overtime attendance recorded for the day. */
  recordedMinutes: number;
  /** Minutes approved for the day; null when no decision has been made. */
  approvedMinutes: number | null;
  /** Minutes the approval was made against (attendance may have changed since). */
  approvedAgainstMinutes: number | null;
}

export interface OvertimeResult {
  /** Paid overtime minutes, after the policy's minimum, rounding and caps. */
  paidMinutes: number;
  amount: Decimal;
  steps: string[];
  /** Days with overtime still waiting for a decision (not paid). */
  awaitingApproval: string[];
  /** Days whose attendance changed after the overtime was approved (not paid until re-approved). */
  changedSinceApproval: string[];
}

const TYPE_WORDS: Record<DayType, string> = { WORKING: 'working day', WEEKLY_OFF: 'weekly off', HOLIDAY: 'holiday' };

function roundMinutes(minutes: number, block: number, mode: 'DOWN' | 'NEAREST' | 'UP') {
  if (block <= 1) return minutes;
  const blocks = minutes / block;
  return (mode === 'DOWN' ? Math.floor(blocks) : mode === 'UP' ? Math.ceil(blocks) : Math.round(blocks)) * block;
}

export function overtimePay(days: OvertimeDay[], policy: PayrollPolicyConfig, hourlyRate: Decimal): OvertimeResult {
  const ot = policy.overtime;
  const result: OvertimeResult = { paidMinutes: 0, amount: ZERO, steps: [], awaitingApproval: [], changedSinceApproval: [] };
  const multiplier = { WORKING: D(ot.multipliers.workingDay), WEEKLY_OFF: D(ot.multipliers.weeklyOff), HOLIDAY: D(ot.multipliers.holiday) };
  let monthLeft = ot.monthlyCapMinutes ?? Number.POSITIVE_INFINITY;

  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.recordedMinutes <= 0) continue;
    let minutes = day.recordedMinutes;
    if (ot.requiresApproval) {
      if (day.approvedMinutes === null) { result.awaitingApproval.push(day.date); continue; }
      if (day.approvedAgainstMinutes !== null && day.approvedAgainstMinutes !== day.recordedMinutes) { result.changedSinceApproval.push(day.date); continue; }
      minutes = Math.min(day.approvedMinutes, day.recordedMinutes);
    }
    if (minutes < ot.minimumMinutes) continue;
    minutes = roundMinutes(minutes, ot.roundToMinutes, ot.roundingMode);
    if (ot.dailyCapMinutes !== null) minutes = Math.min(minutes, ot.dailyCapMinutes);
    minutes = Math.min(minutes, monthLeft);
    if (minutes <= 0) continue;
    monthLeft -= minutes;
    const amount = paise(D(minutes).div(60).times(hourlyRate).times(multiplier[day.dayType]));
    result.paidMinutes += minutes;
    result.amount = result.amount.plus(amount);
    result.steps.push(`${day.date} (${TYPE_WORDS[day.dayType]}): ${minutes} min × hourly rate ${hourlyRate.toFixed()} × ${multiplier[day.dayType].toFixed()} = ${amount.toFixed(2)}`);
  }
  if (ot.monthlyCapMinutes !== null && monthLeft <= 0) result.steps.push(`Limited to the policy’s ${ot.monthlyCapMinutes} minutes a month`);
  return result;
}

export interface PenaltyResult {
  amount: Decimal;
  steps: string[];
  /** Occurrences counted (beyond the grace period). */
  occurrences: number;
}

/**
 * Deductions for late arrival or early departure. Each occurrence (a day
 * beyond the grace period, in date order) after the free ones is matched to
 * its band; every N counted occurrences may also deduct part of a day.
 */
export function penaltyDeduction(rule: PenaltyRule, occurrences: { date: string; minutes: number }[], dailyRate: Decimal, what: 'late' | 'early'): PenaltyResult {
  const result: PenaltyResult = { amount: ZERO, steps: [], occurrences: 0 };
  if (!rule.enabled) return result;
  const counted = [...occurrences].filter((o) => o.minutes > rule.graceMinutes).sort((a, b) => a.date.localeCompare(b.date));
  result.occurrences = counted.length;
  const words = what === 'late' ? 'late' : 'early';
  let charged = 0;
  for (const [index, o] of counted.entries()) {
    if (index < rule.freeOccurrences) {
      result.steps.push(`${o.date}: ${o.minutes} min ${words}, one of ${rule.freeOccurrences} free time${rule.freeOccurrences === 1 ? '' : 's'} a month`);
      continue;
    }
    charged += 1;
    const band = rule.bands.find((b) => o.minutes >= b.fromMinute && (b.toMinute === null || o.minutes <= b.toMinute));
    if (band) {
      let amount = ZERO;
      let how = '';
      switch (band.action) {
        case 'WARNING': how = 'warning only'; break;
        case 'FIXED_AMOUNT': amount = D(band.amount as string); how = `fixed ${amount.toFixed()}`; break;
        case 'PER_MINUTE': amount = D(band.amount as string).times(o.minutes); how = `${o.minutes} min × ${band.amount}`; break;
        case 'DAY_FRACTION': amount = D(band.dayFraction as string).times(dailyRate); how = `${band.dayFraction} × daily rate ${dailyRate.toFixed()}`; break;
      }
      amount = paise(amount);
      result.amount = result.amount.plus(amount);
      result.steps.push(`${o.date}: ${o.minutes} min ${words}, ${how} = ${amount.toFixed(2)}`);
    } else {
      result.steps.push(`${o.date}: ${o.minutes} min ${words}, no band applies`);
    }
    if (rule.repeated && charged % rule.repeated.everyOccurrences === 0) {
      const amount = paise(D(rule.repeated.dayFraction).times(dailyRate));
      result.amount = result.amount.plus(amount);
      result.steps.push(`${charged} times ${words}: ${rule.repeated.dayFraction} × daily rate ${dailyRate.toFixed()} = ${amount.toFixed(2)}`);
    }
  }
  if (rule.monthlyCapAmount !== null && result.amount.gt(rule.monthlyCapAmount)) {
    result.amount = D(rule.monthlyCapAmount);
    result.steps.push(`Limited to the policy’s ${rule.monthlyCapAmount} a month`);
  }
  return result;
}
