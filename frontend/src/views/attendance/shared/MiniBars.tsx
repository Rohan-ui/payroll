import React from 'react';
import { cn } from '../../../utils/cn';
import type { AttendanceStatus } from '../../../api/attendance.api';

interface MiniBarDay {
  date: string;
  day: number;
  workedMinutes: number;
  status: AttendanceStatus;
}

interface MiniBarsProps {
  days: MiniBarDay[];
  height?: number;
  targetHours?: number;
  selectedDate?: string;
  onSelectDay?: (date: string) => void;
  className?: string;
}

const BAR_COLOR: Record<string, string> = {
  PRESENT: 'bg-teal-500 hover:bg-teal-600',
  HALF_DAY: 'bg-amber-400 hover:bg-amber-500',
  ABSENT: 'bg-red-400 hover:bg-red-500',
  PAID_LEAVE: 'bg-emerald-500 hover:bg-emerald-600',
  UNPAID_LEAVE: 'bg-orange-400 hover:bg-orange-500',
  HOLIDAY: 'bg-purple-400 hover:bg-purple-500',
  WEEKEND: 'bg-slate-200 hover:bg-slate-300',
};

export const MiniBars: React.FC<MiniBarsProps> = ({
  days = [],
  height = 40,
  targetHours = 8,
  selectedDate,
  onSelectDay,
  className,
}) => {
  const maxHours = 10;
  const targetPct = (targetHours / maxHours) * 100;

  return (
    <div className={cn('relative flex items-end gap-1 select-none', className)} style={{ height }}>
      {/* Target line (8h) */}
      <div
        className="absolute left-0 right-0 border-b border-dashed border-slate-300 pointer-events-none z-0"
        style={{ bottom: `${targetPct}%` }}
        title={`Target Shift Hours: ${targetHours}h`}
      />

      {days.map((d) => {
        const workedHours = d.workedMinutes / 60;
        const barHeightPct = Math.max(8, Math.min(100, (workedHours / maxHours) * 100));
        const isSelected = selectedDate === d.date;
        const color = BAR_COLOR[d.status] || 'bg-slate-200';

        return (
          <button
            key={d.date}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectDay?.(d.date);
            }}
            title={`${d.date}: ${d.status} • ${workedHours.toFixed(1)}h worked`}
            aria-label={`${d.date}: ${d.status} • ${workedHours.toFixed(1)} hours`}
            className="flex-1 flex flex-col items-center justify-end h-full group focus:outline-none relative z-10"
          >
            <div
              className={cn(
                'w-full rounded-t-[2px] transition-all',
                color,
                isSelected ? 'ring-2 ring-teal-700 brightness-110' : 'opacity-90 group-hover:opacity-100',
              )}
              style={{ height: `${barHeightPct}%` }}
            />
          </button>
        );
      })}
    </div>
  );
};
