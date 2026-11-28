import React, { useState } from 'react';
import { cn } from '../../../utils/cn';
import type { InterviewListItem } from '../../../api/onboarding.api';
import { InterviewCard } from './InterviewCard';
import { WeekTimeGrid } from './WeekTimeGrid';
import { dayKey, sameDay, STAGE_BY_ID, stageOf, timeLabel, type CalendarUnit } from './interview-utils';

interface Props {
  days: Date[];
  unit: CalendarUnit;
  anchor: Date;
  rows: InterviewListItem[];
  now: number;
  onOpen: (candidateId: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_CHIPS = 3;

const groupByDay = (rows: InterviewListItem[]) => {
  const map = new Map<string, InterviewListItem[]>();
  for (const row of rows) {
    const key = dayKey(new Date(row.startsAt));
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
};

/** A week as a time grid, or a month as a grid of days with the chosen day's interviews listed under it. */
export const InterviewCalendar: React.FC<Props> = ({ days, unit, anchor, rows, now, onOpen }) => {
  const byDay = groupByDay(rows);
  const today = new Date(now);
  const [picked, setPicked] = useState<string | null>(null);

  if (unit === 'week') return <WeekTimeGrid days={days} rows={rows} now={now} onOpen={onOpen} />;

  const pickedItems = picked ? byDay.get(picked) ?? [] : [];
  const pickedDate = picked ? days.find((d) => dayKey(d) === picked) : undefined;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#1E1D2D]" aria-hidden="true">
          {WEEKDAYS.map((w) => <span key={w} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{w}</span>)}
        </div>
        <ol className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day);
            const items = byDay.get(key) ?? [];
            const inMonth = day.getMonth() === anchor.getMonth();
            const isToday = sameDay(day, today);
            const label = `${new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(day)}: ${items.length ? `${items.length} interview${items.length === 1 ? '' : 's'}` : 'no interviews'}`;
            return (
              <li key={key} className={cn('min-h-[4.5rem] md:min-h-[7rem] border-b border-r border-slate-100 dark:border-[#2B293E] [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-slate-50/70 dark:bg-white/[0.02]')}>
                <button
                  type="button"
                  onClick={() => setPicked(picked === key ? null : key)}
                  aria-label={label}
                  aria-pressed={picked === key}
                  className={cn('w-full h-full p-1.5 text-left flex flex-col gap-1 hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500', picked === key && 'bg-teal-50 dark:bg-teal-950/30')}
                >
                  <span className={cn('self-end w-6 h-6 rounded-full grid place-items-center text-xs tabular-nums', isToday ? 'bg-teal-600 text-white font-semibold' : inMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400')}>{day.getDate()}</span>
                  {/* Wide screens: the first few interviews by name. Phones: one dot per interview. */}
                  <span className="hidden md:flex flex-col gap-0.5 min-w-0">
                    {items.slice(0, MONTH_CHIPS).map((row) => (
                      <span key={row.id} className={cn('flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300', row.status === 'CANCELLED' && 'line-through opacity-60')}>
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STAGE_BY_ID[stageOf(row, now)].dot)} aria-hidden="true" />
                        <span className="tabular-nums">{timeLabel(row.startsAt)}</span>
                        <span className="truncate">{row.candidate.name}</span>
                      </span>
                    ))}
                    {items.length > MONTH_CHIPS && <span className="px-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">+{items.length - MONTH_CHIPS} more</span>}
                  </span>
                  <span className="md:hidden flex flex-wrap gap-0.5" aria-hidden="true">
                    {items.slice(0, 6).map((row) => <span key={row.id} className={cn('w-1.5 h-1.5 rounded-full', STAGE_BY_ID[stageOf(row, now)].dot)} />)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {pickedDate ? (
        <section aria-live="polite" className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(pickedDate)}
          </h3>
          {pickedItems.length === 0 ? (
            <p className="text-sm text-slate-500">No interviews on this day.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pickedItems.map((row) => <li key={row.id}><InterviewCard row={row} now={now} onOpen={onOpen} /></li>)}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Pick a day to see its interviews in full.</p>
      )}
    </div>
  );
};
