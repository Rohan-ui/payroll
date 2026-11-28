import React from 'react';
import { cn } from '../../../utils/cn';
import { STATUS_CONFIG } from './StatusPill';
import type { EmployeeMonthResponse } from '../../../api/attendance.api';

/** Order of the segments in the month bar: paid days first, then lost days, then days off. */
const SEGMENT_ORDER = ['PRESENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'ABSENT', 'HOLIDAY', 'WEEKEND'] as const;

interface MonthSummaryProps {
  data: EmployeeMonthResponse;
  /** Narrow column: two figures per row instead of three. */
  compact?: boolean;
  className?: string;
}

/** One month for one employee: headline figures, how the days so far split by status, and the smaller facts. */
export const MonthSummary: React.FC<MonthSummaryProps> = ({ data, compact = false, className }) => {
  const { workingDays, attendancePct, payableDays, totalWorkedHours, stats, days } = data;
  const daysSoFar = days.filter((d) => d.status !== 'FUTURE');
  const upcoming = days.length - daysSoFar.length;
  const counts = SEGMENT_ORDER.map((status) => ({ status, count: daysSoFar.filter((d) => d.status === status).length })).filter((c) => c.count > 0);
  const barLabel = counts.map((c) => `${c.count} ${STATUS_CONFIG[c.status].label.toLowerCase()}`).join(', ');

  const headline = [
    { label: 'Attendance', value: `${attendancePct}%`, hint: `of ${workingDays} working day${workingDays === 1 ? '' : 's'}` },
    { label: 'Paid days', value: String(payableDays), hint: `of ${daysSoFar.length} so far` },
    { label: 'Worked', value: `${totalWorkedHours} h`, hint: 'this month' },
  ];
  const facts = [
    { label: 'Late marks', value: String(stats.lateMarks) },
    { label: 'Avg. check-in', value: stats.avgCheckInTime ?? '—' },
    { label: 'Overtime', value: stats.overtimeHours > 0 ? `${stats.overtimeHours} h` : '—' },
    { label: 'Best streak', value: stats.bestStreakDays > 0 ? `${stats.bestStreakDays} day${stats.bestStreakDays === 1 ? '' : 's'}` : '—' },
  ];

  return (
    <section aria-label="Month summary" className={cn('bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4', className)}>
      <dl className={cn('grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-3')}>
        {headline.map((h) => (
          <div key={h.label} className="min-w-0">
            <dt className="text-xs font-medium text-slate-500">{h.label}</dt>
            <dd className="text-xl font-semibold text-slate-900 tabular-nums mt-0.5">{h.value}</dd>
            <dd className="text-[11px] text-slate-500">{h.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        {daysSoFar.length > 0 ? (
          <div role="img" aria-label={`Days so far: ${barLabel}`} className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-slate-100">
            {counts.map((c) => (
              <span key={c.status} className={STATUS_CONFIG[c.status].dot} style={{ width: `${(c.count / daysSoFar.length) * 100}%` }} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No days recorded yet this month.</p>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-hidden="true">
          {counts.map((c) => (
            <li key={c.status} className="inline-flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[c.status].dot)} />
              <span className="tabular-nums font-medium text-slate-800">{c.count}</span> {STATUS_CONFIG[c.status].label}
            </li>
          ))}
          {upcoming > 0 && <li className="text-slate-400">{upcoming} day{upcoming === 1 ? '' : 's'} to come</li>}
        </ul>
      </div>

      <dl className={cn('grid gap-3 pt-3 border-t border-slate-100', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[11px] text-slate-500">{f.label}</dt>
            <dd className="text-sm font-medium text-slate-900 tabular-nums truncate">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
