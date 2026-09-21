import React from 'react';
import { cn } from '../../../utils/cn';
import type { AttendanceStatus } from '../../../api/attendance.api';

interface MonthDayItem {
  day: number;
  date: string;
  status: AttendanceStatus;
  workedMinutes: number;
  isLate: boolean;
}

interface MonthStripProps {
  days: MonthDayItem[];
  selectedDate?: string;
  onSelectDay?: (date: string) => void;
  className?: string;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  PRESENT: 'bg-teal-500 hover:bg-teal-600',
  HALF_DAY: 'bg-amber-400 hover:bg-amber-500',
  ABSENT: 'bg-red-400 hover:bg-red-500',
  PAID_LEAVE: 'bg-emerald-500 hover:bg-emerald-600',
  UNPAID_LEAVE: 'bg-orange-400 hover:bg-orange-500',
  HOLIDAY: 'bg-purple-400 hover:bg-purple-500',
  WEEKEND: 'bg-slate-200 hover:bg-slate-300',
};

export const MonthStrip: React.FC<MonthStripProps> = ({
  days = [],
  selectedDate,
  onSelectDay,
  className,
}) => {
  return (
    <div
      className={cn('inline-flex items-center gap-[2px] p-1 bg-slate-50 border border-slate-200 rounded-md', className)}
      role="list"
      aria-label="Monthly Attendance Strip"
    >
      {days.map((d) => {
        const isSelected = selectedDate === d.date;
        const color = STATUS_COLOR_MAP[d.status] || 'bg-slate-100';
        const hours = (d.workedMinutes / 60).toFixed(1);

        return (
          <button
            key={d.date}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectDay?.(d.date);
            }}
            title={`Day ${d.day} (${d.date}): ${d.status} • ${hours}h${d.isLate ? ' • LATE' : ''}`}
            aria-label={`Day ${d.day}, ${d.status}`}
            className={cn(
              'w-2 h-5 rounded-[2px] transition-all relative cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500',
              color,
              isSelected && 'ring-2 ring-teal-700 scale-110 z-10',
            )}
          >
            {d.isLate && (
              <span
                className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-500 rounded-full ring-1 ring-white"
                title="Late arrival"
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
