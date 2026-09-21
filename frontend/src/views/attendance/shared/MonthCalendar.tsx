import React from 'react';
import { cn } from '../../../utils/cn';
import type { EmployeeMonthDayRecord, AttendanceStatus } from '../../../api/attendance.api';

interface MonthCalendarProps {
  variant?: 'detailed' | 'compact' | 'simple';
  monthStr: string; // YYYY-MM
  days: EmployeeMonthDayRecord[];
  selectedDate?: string;
  onSelectDay: (dateStr: string) => void;
  className?: string;
}

const STATUS_COLOR_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  PRESENT: { bg: 'bg-teal-50 hover:bg-teal-100/70', text: 'text-teal-900', border: 'border-teal-200', label: 'Present' },
  HALF_DAY: { bg: 'bg-amber-50 hover:bg-amber-100/70', text: 'text-amber-900', border: 'border-amber-200', label: 'Half Day' },
  ABSENT: { bg: 'bg-red-50 hover:bg-red-100/70', text: 'text-red-900', border: 'border-red-200', label: 'Absent' },
  PAID_LEAVE: { bg: 'bg-emerald-50 hover:bg-emerald-100/70', text: 'text-emerald-900', border: 'border-emerald-200', label: 'Paid Leave' },
  UNPAID_LEAVE: { bg: 'bg-orange-50 hover:bg-orange-100/70', text: 'text-orange-900', border: 'border-orange-200', label: 'Unpaid (LOP)' },
  HOLIDAY: { bg: 'bg-purple-50 hover:bg-purple-100/70', text: 'text-purple-900', border: 'border-purple-200', label: 'Holiday' },
  WEEKEND: { bg: 'bg-slate-50 hover:bg-slate-100/70', text: 'text-slate-500', border: 'border-slate-200', label: 'Weekly Off' },
  FUTURE: { bg: 'bg-white', text: 'text-slate-300', border: 'border-slate-100', label: 'Future' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  variant = 'detailed',
  monthStr,
  days = [],
  selectedDate,
  onSelectDay,
  className,
}) => {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthNumStr, 10);

  const firstDow = new Date(Date.UTC(year, monthNum - 1, 1)).getUTCDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // Lookup map: dateStr -> record
  const dayMap = new Map<string, EmployeeMonthDayRecord>();
  for (const d of days) {
    dayMap.set(d.date, d);
  }

  // Grid cells (leading empties + days)
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${monthStr}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr: dStr });
  }

  return (
    <div className={cn('select-none bg-white rounded-xl border border-slate-200 p-4 shadow-xs', className)}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {WEEKDAYS.map((wd, idx) => (
          <div
            key={wd}
            className={cn(
              'text-[11px] font-semibold text-center py-1',
              idx === 0 ? 'text-red-500' : 'text-slate-400',
            )}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateStr) {
            return <div key={`empty-${idx}`} className="aspect-square rounded-lg bg-slate-50/50" />;
          }

          const rec = dayMap.get(cell.dateStr);
          const status: AttendanceStatus | 'FUTURE' = rec ? rec.status : 'FUTURE';
          const styles = STATUS_COLOR_STYLES[status] || STATUS_COLOR_STYLES.FUTURE;
          const isSelected = selectedDate === cell.dateStr;

          // COMPACT or SIMPLE VARIANT (Layout B and C)
          if (variant === 'compact' || variant === 'simple') {
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => onSelectDay(cell.dateStr!)}
                aria-label={`${cell.day}, ${status}`}
                className={cn(
                  'aspect-square rounded-lg border flex flex-col items-center justify-center p-1 relative transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
                  styles.bg,
                  styles.text,
                  styles.border,
                  isSelected && 'ring-2 ring-teal-700 shadow-sm font-bold scale-105 z-10',
                )}
              >
                <span className="text-xs font-semibold">{cell.day}</span>
                {rec?.isLate && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-0.5" title="Late" />
                )}
                {rec && !rec.isLate && rec.workedHours > 0 && (
                  <span className="text-[9px] font-mono opacity-70 mt-0.5">
                    {rec.workedHours}h
                  </span>
                )}
              </button>
            );
          }

          // DETAILED VARIANT (Layout A)
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDay(cell.dateStr!)}
              aria-label={`${cell.day}, ${status}`}
              className={cn(
                'min-h-[72px] rounded-lg border p-1.5 flex flex-col justify-between text-left transition-all relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
                styles.bg,
                styles.text,
                styles.border,
                isSelected && 'ring-2 ring-teal-700 shadow-sm scale-105 z-10',
              )}
            >
              {/* Day Number and Late Tag */}
              <div className="flex items-center justify-between w-full">
                <span className={cn('text-xs font-bold', isSelected ? 'text-teal-900' : '')}>
                  {cell.day}
                </span>
                {rec?.isLate && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white shadow-2xs"
                    title={`Late arrival by ${rec.lateMinutes}m`}
                  />
                )}
              </div>

              {/* Status and Punch Time */}
              <div className="mt-1 space-y-0.5">
                {rec?.status === 'PRESENT' && (
                  <>
                    <span className="text-[10px] font-semibold text-teal-800 block truncate">
                      {rec.firstCheckInAt
                        ? new Date(rec.firstCheckInAt).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'Present'}
                    </span>
                    <span className="text-[10px] font-mono text-teal-700 block">
                      {rec.workedHours} hrs
                    </span>
                  </>
                )}

                {rec?.status === 'HALF_DAY' && (
                  <>
                    <span className="text-[10px] font-semibold text-amber-800 block">½ Half Day</span>
                    <span className="text-[10px] font-mono text-amber-700 block">
                      {rec.workedHours} hrs
                    </span>
                  </>
                )}

                {rec?.status === 'ABSENT' && (
                  <span className="text-[10px] font-bold text-red-600 block">Absent</span>
                )}

                {rec?.status === 'PAID_LEAVE' && (
                  <span className="text-[10px] font-semibold text-emerald-700 block truncate">
                    {rec.leaveType || 'Leave'}
                  </span>
                )}

                {rec?.status === 'UNPAID_LEAVE' && (
                  <span className="text-[10px] font-bold text-orange-700 block">LOP</span>
                )}

                {rec?.status === 'HOLIDAY' && (
                  <span className="text-[10px] font-semibold text-purple-700 block truncate" title={rec.holidayName}>
                    {rec.holidayName || 'Holiday'}
                  </span>
                )}

                {rec?.status === 'WEEKEND' && (
                  <span className="text-[10px] text-slate-400 block">Off</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
