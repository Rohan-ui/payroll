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
  PRESENT:      { bg: 'bg-teal-100 text-teal-700',      text: 'text-teal-700',   label: 'Present' },
  ABSENT:       { bg: 'bg-red-100 text-red-600',         text: 'text-red-600',    label: 'Absent' },
  HALF_DAY:     { bg: 'bg-amber-100 text-amber-700',     text: 'text-amber-700',  label: 'Half Day' },
  PAID_LEAVE:   { bg: 'bg-emerald-100 text-emerald-800', text: 'text-emerald-800', label: 'Paid Leave' },
  UNPAID_LEAVE: { bg: 'bg-orange-100 text-orange-700',   text: 'text-orange-700', label: 'Unpaid (LOP)' },
  HOLIDAY:      { bg: 'bg-purple-100 text-purple-700',   text: 'text-purple-700', label: 'Holiday' },
  WEEKEND:      { bg: 'bg-slate-100 text-slate-500',     text: 'text-slate-500',  label: 'Weekend' },
  FUTURE:       { bg: 'bg-white text-slate-300 border border-slate-200', text: 'text-slate-300', label: 'Future' },
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
      <div className="flex flex-wrap gap-3 mb-3">
        {(['PRESENT', 'HALF_DAY', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEKEND'] as AttendanceDayStatus[]).map(
          (s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={cn('w-3 h-3 rounded-xs shadow-2xs', STATUS_STYLES[s].bg)} />
              <span className="text-[11px] font-medium text-slate-600">{STATUS_STYLES[s].label}</span>
            </div>
          ),
        )}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] text-slate-400 font-medium text-center py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateStr) {
            return <div key={`empty-${idx}`} />;
          }
          const status = statusMap[cell.dateStr] ?? 'FUTURE';
          const style = STATUS_STYLES[status] || STATUS_STYLES.FUTURE;
          const isSelected = selectedDate === cell.dateStr;

          if (onDayClick) {
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => onDayClick(cell.dateStr!, status)}
                title={`${cell.dateStr}: ${style.label} (Click to edit)`}
                className={cn(
                  'aspect-square rounded-md flex items-center justify-center text-[11px] font-semibold transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 hover:scale-105 hover:shadow-sm',
                  style.bg,
                  isSelected && 'ring-2 ring-teal-600 scale-105 shadow-sm font-bold',
                )}
              >
                {cell.day}
              </button>
            );
          }

          return (
            <div
              key={cell.dateStr}
              title={`${cell.dateStr}: ${style.label}`}
              className={cn(
                'aspect-square rounded-md flex items-center justify-center text-[11px] font-semibold',
                style.bg,
              )}
            >
              {cell.day}
            </div>
          );
        })}
      </div>
    </div>
  );
};
