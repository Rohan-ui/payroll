import React from 'react';
import { cn } from '../../utils/cn';
import type { AttendanceDay, AttendanceDayStatus } from '../../types/payroll.types';

interface CalendarHeatmapProps {
  year: number;
  month: number; // 1-indexed
  days: AttendanceDay[];
  className?: string;
  selectedDate?: string;
  onDayClick?: (dateStr: string, currentStatus: AttendanceDayStatus) => void;
}

const STATUS_STYLES: Record<AttendanceDayStatus, { bg: string; text: string; label: string }> = {
  PRESENT: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    text: 'text-emerald-800 dark:text-emerald-300',
    label: 'Present',
  },
  ABSENT: {
    bg: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60',
    text: 'text-red-700 dark:text-red-300',
    label: 'Absent',
  },
  HALF_DAY: {
    bg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
    text: 'text-amber-800 dark:text-amber-300',
    label: 'Half Day',
  },
  PAID_LEAVE: {
    bg: 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60',
    text: 'text-teal-800 dark:text-teal-300',
    label: 'Paid Leave',
  },
  UNPAID_LEAVE: {
    bg: 'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60',
    text: 'text-orange-800 dark:text-orange-300',
    label: 'Unpaid (LOP)',
  },
  HOLIDAY: {
    bg: 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60',
    text: 'text-purple-800 dark:text-purple-300',
    label: 'Holiday',
  },
  WEEKEND: {
    bg: 'bg-slate-100 dark:bg-[#252336] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#2B293E]',
    text: 'text-slate-500 dark:text-slate-400',
    label: 'Weekend',
  },
  FUTURE: {
    bg: 'bg-slate-50 dark:bg-[#15141F] text-slate-300 dark:text-slate-600 border border-slate-200/80 dark:border-[#2B293E]/60',
    text: 'text-slate-300 dark:text-slate-600',
    label: 'Future',
  },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({
  year,
  month,
  days = [],
  className,
  selectedDate,
  onDayClick,
}) => {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const safeDays = Array.isArray(days) ? days : [];
  // Build a lookup map from date string → status
  const statusMap: Record<string, AttendanceDayStatus> = {};
  for (const d of safeDays) {
    if (d && d.date) {
      statusMap[d.date] = d.status;
    }
  }

  // Build grid cells — leading empty cells + day cells
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr });
  }

  return (
    <div className={cn('select-none', className)}>
      {/* Legend */}
      <div className="flex flex-wrap gap-2.5 mb-3">
        {(['PRESENT', 'HALF_DAY', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEKEND'] as AttendanceDayStatus[]).map(
          (s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={cn('w-2.5 h-2.5 rounded-sm shadow-2xs', STATUS_STYLES[s].bg)} />
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{STATUS_STYLES[s].label}</span>
            </div>
          ),
        )}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d, idx) => (
          <div
            key={d}
            className={cn(
              'text-[10px] font-semibold text-center py-0.5',
              idx === 0 ? 'text-red-500/80 dark:text-red-400/80' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateStr) {
            return <div key={`empty-${idx}`} className="aspect-square rounded-md bg-transparent" />;
          }

          let status = statusMap[cell.dateStr];
          if (!status) {
            const cellDate = new Date(`${cell.dateStr}T00:00:00`);
            const dow = cellDate.getDay();
            if (dow === 0 || dow === 6) {
              status = 'WEEKEND';
            } else if (cell.dateStr > todayStr) {
              status = 'FUTURE';
            } else {
              status = 'PRESENT';
            }
          }

          const style = STATUS_STYLES[status] || STATUS_STYLES.FUTURE;
          const isSelected = selectedDate === cell.dateStr;
          const isToday = todayStr === cell.dateStr;

          if (onDayClick) {
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => onDayClick(cell.dateStr!, status)}
                title={`${cell.dateStr}: ${style.label}${isToday ? ' (Today)' : ''} (Click to manage attendance)`}
                className={cn(
                  'aspect-square rounded-md flex flex-col items-center justify-center text-[11px] font-semibold transition-all duration-150 cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 hover:scale-105 hover:shadow-sm',
                  style.bg,
                  isSelected && 'ring-2 ring-teal-500 dark:ring-teal-400 scale-105 shadow-sm font-bold',
                  isToday && !isSelected && 'ring-1.5 ring-teal-500/80 dark:ring-teal-400/80 font-bold',
                )}
              >
                <span>{cell.day}</span>
                {isToday && (
                  <span className="w-1 h-1 rounded-full bg-teal-600 dark:bg-teal-400 absolute bottom-0.5" />
                )}
              </button>
            );
          }

          return (
            <div
              key={cell.dateStr}
              title={`${cell.dateStr}: ${style.label}${isToday ? ' (Today)' : ''}`}
              className={cn(
                'aspect-square rounded-md flex flex-col items-center justify-center text-[11px] font-semibold relative',
                style.bg,
                isToday && 'ring-1.5 ring-teal-500/80 dark:ring-teal-400/80 font-bold',
              )}
            >
              <span>{cell.day}</span>
              {isToday && (
                <span className="w-1 h-1 rounded-full bg-teal-600 dark:bg-teal-400 absolute bottom-0.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
