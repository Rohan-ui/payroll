import React from 'react';
import { cn } from '../../../utils/cn';
import { STATUS_CONFIG } from './StatusPill';
import { formatMinutes } from './duration';

interface MiniBarDay {
  date: string;
  day: number;
  workedMinutes: number;
  status: string;
}

interface MiniBarsProps {
  days: MiniBarDay[];
  height?: number;
  /** The day's expected work, drawn as a dashed line; usually the shift's standard minutes. */
  targetMinutes?: number;
  selectedDate?: string;
  /** Omit to draw a picture only (no buttons), e.g. inside a card that is itself a button. */
  onSelectDay?: (date: string) => void;
  /** Day numbers under the bars and the target value beside its line. */
  showAxis?: boolean;
  className?: string;
}

const DEFAULT_TARGET_MINUTES = 480;
/** Days with no time worked still get a sliver so their status colour shows. */
const STUB_PCT = 6;

const describeDay = (d: MiniBarDay) => {
  const label = STATUS_CONFIG[d.status]?.label ?? d.status;
  const date = new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (d.status === 'FUTURE') return `${date}: upcoming`;
  return `${date}: ${label}${d.workedMinutes > 0 ? `, ${formatMinutes(d.workedMinutes)} worked` : ''}`;
};

/** Hours worked per day as bars, coloured by the day's status, against the expected day. */
export const MiniBars: React.FC<MiniBarsProps> = ({
  days = [],
  height = 40,
  targetMinutes = DEFAULT_TARGET_MINUTES,
  selectedDate,
  onSelectDay,
  showAxis = false,
  className,
}) => {
  // Scale to the longest day, with headroom over the target so the line never sits at the very top.
  const scaleMinutes = Math.max(targetMinutes * 1.25, ...days.map((d) => d.workedMinutes), 1);
  const targetPct = (targetMinutes / scaleMinutes) * 100;

  return (
    <div className={cn('select-none', className)}>
      <div className="relative flex items-end gap-px sm:gap-0.5" style={{ height }}>
        <div className="absolute inset-x-0 border-t border-dashed border-slate-400/70 pointer-events-none z-20" style={{ bottom: `${targetPct}%` }} aria-hidden="true">
          {showAxis && (
            <span className="absolute -top-4 right-0 text-[10px] font-medium text-slate-500 bg-white/90 px-1 rounded">
              {formatMinutes(targetMinutes)} expected
            </span>
          )}
        </div>

        {days.map((d) => {
          const isFuture = d.status === 'FUTURE';
          const barPct = isFuture ? 100 : d.workedMinutes > 0 ? Math.max(STUB_PCT, (d.workedMinutes / scaleMinutes) * 100) : STUB_PCT;
          const isSelected = selectedDate === d.date;
          const bar = (
            <span
              className={cn(
                'block w-full rounded-t-[2px] transition-[height]',
                isFuture ? 'border border-dashed border-slate-200 bg-transparent rounded-[2px]' : STATUS_CONFIG[d.status]?.dot ?? 'bg-slate-200',
                isSelected && !isFuture && 'outline outline-2 outline-offset-1 outline-slate-800',
              )}
              style={{ height: `${barPct}%` }}
            />
          );
          const label = describeDay(d);
          return onSelectDay ? (
            <button
              key={d.date}
              type="button"
              disabled={isFuture}
              onClick={(e) => {
                e.stopPropagation();
                onSelectDay(d.date);
              }}
              title={label}
              aria-label={label}
              aria-pressed={isSelected}
              className="relative z-10 flex-1 h-full flex items-end rounded-sm hover:bg-slate-100/70 disabled:cursor-default disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {bar}
            </button>
          ) : (
            <span key={d.date} title={label} className="relative z-10 flex-1 h-full flex items-end">
              {bar}
            </span>
          );
        })}
      </div>
      {showAxis && (
        <div className="flex gap-px sm:gap-0.5 mt-1" aria-hidden="true">
          {days.map((d) => (
            <span key={d.date} className={cn('flex-1 text-center text-[9px] tabular-nums', selectedDate === d.date ? 'font-bold text-slate-900' : 'text-slate-400')}>
              {/* Every day fits on wide screens; on narrow ones only odd days, so labels don't collide. */}
              <span className={d.day % 2 === 0 ? 'hidden sm:inline' : undefined}>{d.day}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
