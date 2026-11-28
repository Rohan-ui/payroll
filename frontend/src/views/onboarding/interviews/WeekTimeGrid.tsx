import React, { useState } from 'react';
import { cn } from '../../../utils/cn';
import type { InterviewListItem } from '../../../api/onboarding.api';
import { INTERVIEW_TYPE_LABELS } from '../onboarding-format';
import { TYPE_ICON } from './InterviewCard';
import { dayKey, sameDay, STAGE_BY_ID, stageOf, timeLabel } from './interview-utils';

const HOUR_PX = 56;
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 19;
const MIN_BLOCK_PX = 26;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Stage colours for a calendar block: a soft fill with a strong left edge, readable in both themes. */
const BLOCK_TONE: Record<string, string> = {
  upcoming: 'bg-violet-50 border-violet-500 text-violet-950 dark:bg-violet-950/50 dark:text-violet-100',
  awaiting: 'bg-amber-50 border-amber-500 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100',
  passed: 'bg-emerald-50 border-emerald-500 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100',
  failed: 'bg-red-50 border-red-500 text-red-950 dark:bg-red-950/50 dark:text-red-100',
  cancelled: 'bg-slate-100 border-slate-400 text-slate-500 dark:bg-white/10 dark:text-slate-400',
};

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export interface PlacedBlock {
  row: InterviewListItem;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

/**
 * Lays out one day's interviews: ones that overlap in time share the width side by side, the way a
 * calendar does; everything else gets the full column.
 */
export function layoutDay(rows: InterviewListItem[]): PlacedBlock[] {
  const items = rows
    .map((row) => {
      const startMin = minutesOfDay(new Date(row.startsAt));
      return { row, startMin, endMin: Math.min(24 * 60, startMin + Math.max(row.durationMinutes, 15)), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const placed: PlacedBlock[] = [];
  let cluster: PlacedBlock[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    placed.push(...cluster);
    cluster = [];
  };
  for (const item of items) {
    if (item.startMin >= clusterEnd) closeCluster();
    const laneEnds = new Map<number, number>();
    cluster.forEach((c) => laneEnds.set(c.lane, Math.max(laneEnds.get(c.lane) ?? 0, c.endMin)));
    let lane = 0;
    while ((laneEnds.get(lane) ?? -1) > item.startMin) lane += 1;
    item.lane = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  closeCluster();
  return placed;
}

interface Props {
  days: Date[];
  rows: InterviewListItem[];
  now: number;
  onOpen: (candidateId: string) => void;
}

/** A week as a time grid: hours down the side, one column per day, each interview drawn for as long as it lasts. */
export const WeekTimeGrid: React.FC<Props> = ({ days, rows, now, onOpen }) => {
  const today = new Date(now);
  const [mobileDay, setMobileDay] = useState(() => dayKey(days.find((d) => sameDay(d, today)) ?? days[0]));

  const byDay = new Map<string, InterviewListItem[]>();
  rows.forEach((row) => {
    const key = dayKey(new Date(row.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  });

  // Working hours by default, stretched to fit any interview held earlier or later.
  const starts = rows.map((r) => new Date(r.startsAt));
  const firstHour = Math.min(DEFAULT_FIRST_HOUR, ...starts.map((d) => d.getHours()));
  const lastHour = Math.max(DEFAULT_LAST_HOUR, ...rows.map((r) => Math.ceil((minutesOfDay(new Date(r.startsAt)) + r.durationMinutes) / 60)));
  const endHour = Math.min(24, lastHour);
  const hours = Array.from({ length: endHour - firstHour }, (_, i) => firstHour + i);
  const gridHeight = hours.length * HOUR_PX;
  const toPx = (min: number) => ((min - firstHour * 60) / 60) * HOUR_PX;
  const nowMin = minutesOfDay(today);
  const showNow = nowMin >= firstHour * 60 && nowMin <= endHour * 60;

  const dayColumn = (day: Date) => {
    const key = dayKey(day);
    const isToday = sameDay(day, today);
    return (
      <div key={key} className={cn('relative border-l border-slate-200 dark:border-[#2B293E]', isToday && 'bg-teal-50/40 dark:bg-teal-950/10', key !== mobileDay && 'hidden md:block')} style={{ height: gridHeight }}>
        {hours.map((h) => <div key={h} className="border-b border-slate-100 dark:border-[#2B293E]" style={{ height: HOUR_PX }} aria-hidden="true" />)}
        {isToday && showNow && (
          <div className="absolute inset-x-0 z-20 pointer-events-none" style={{ top: toPx(nowMin) }} aria-hidden="true">
            <div className="relative h-0.5 bg-red-500"><span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" /></div>
          </div>
        )}
        <ul aria-label={new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(day)}>
          {layoutDay(byDay.get(key) ?? []).map(({ row, startMin, endMin, lane, lanes }) => {
            const stage = stageOf(row, now);
            const Icon = TYPE_ICON[row.interviewType];
            const height = Math.max(MIN_BLOCK_PX, toPx(endMin) - toPx(startMin) - 2);
            const isShort = height < 44;
            return (
              <li key={row.id} className="absolute z-10 px-0.5" style={{ top: toPx(startMin) + 1, height, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}>
                <button
                  type="button"
                  onClick={() => onOpen(row.candidate.id)}
                  title={`${timeLabel(row.startsAt)} · ${row.candidate.name} · Round ${row.roundNumber} · ${INTERVIEW_TYPE_LABELS[row.interviewType]} · ${STAGE_BY_ID[stage].label}`}
                  aria-label={`${timeLabel(row.startsAt)}, ${row.candidate.name}, round ${row.roundNumber}, ${INTERVIEW_TYPE_LABELS[row.interviewType]}, ${STAGE_BY_ID[stage].label}`}
                  className={cn(
                    'w-full h-full overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                    BLOCK_TONE[stage],
                    row.status === 'CANCELLED' && 'line-through',
                  )}
                >
                  <span className="flex items-center gap-1 font-semibold truncate">
                    <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
                    {isShort ? `${timeLabel(row.startsAt)} ${row.candidate.name}` : row.candidate.name}
                  </span>
                  {!isShort && <span className="block truncate opacity-80 tabular-nums">{timeLabel(row.startsAt)} · {row.durationMinutes} min · R{row.roundNumber}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-hidden">
      {/* Phones: pick one day of the week. */}
      <div role="group" aria-label="Day" className="md:hidden grid grid-cols-7 border-b border-slate-200 dark:border-[#2B293E]">
        {days.map((day) => {
          const key = dayKey(day);
          const count = byDay.get(key)?.length ?? 0;
          return (
            <button key={key} type="button" aria-pressed={key === mobileDay} onClick={() => setMobileDay(key)}
              className={cn('py-2 flex flex-col items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500', key === mobileDay && 'bg-teal-50 dark:bg-teal-950/30')}>
              <span className="text-[10px] font-semibold uppercase text-slate-500">{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
              <span className={cn('w-7 h-7 rounded-full grid place-items-center text-sm tabular-nums', sameDay(day, today) ? 'bg-teal-600 text-white font-semibold' : 'text-slate-800 dark:text-slate-200')}>{day.getDate()}</span>
              <span className={cn('w-1.5 h-1.5 rounded-full', count ? 'bg-teal-500' : 'bg-transparent')} aria-hidden="true" />
              <span className="sr-only">{count} interviews</span>
            </button>
          );
        })}
      </div>

      {/* Wide screens: day headers over the columns. */}
      <div className="hidden md:grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#1E1D2D]" aria-hidden="true">
        <span />
        {days.map((day) => (
          <span key={dayKey(day)} className="py-2 flex items-center justify-center gap-1.5 border-l border-slate-200 dark:border-[#2B293E]">
            <span className="text-[11px] font-semibold uppercase text-slate-500">{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
            <span className={cn('w-7 h-7 rounded-full grid place-items-center text-sm tabular-nums', sameDay(day, today) ? 'bg-teal-600 text-white font-semibold' : 'text-slate-800 dark:text-slate-200')}>{day.getDate()}</span>
          </span>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] md:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div aria-hidden="true">
            {hours.map((h) => (
              <div key={h} className="relative text-right pr-2" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 text-[10px] text-slate-400 tabular-nums">{h === firstHour ? '' : new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2000, 0, 1, h))}</span>
              </div>
            ))}
          </div>
          {days.map(dayColumn)}
        </div>
      </div>
    </div>
  );
};
