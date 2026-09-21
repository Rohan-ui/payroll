import React from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { EmployeeYearResponse, AttendanceStatus } from '../../../api/attendance.api';

interface YearGlanceProps {
  data: EmployeeYearResponse | null;
  currentMonthStr: string; // YYYY-MM
  onSelectMonth: (monthStr: string) => void;
  className?: string;
}

const STATUS_COLOR_DOT: Record<string, string> = {
  PRESENT: 'bg-teal-500',
  HALF_DAY: 'bg-amber-400',
  ABSENT: 'bg-red-400',
  PAID_LEAVE: 'bg-emerald-500',
  UNPAID_LEAVE: 'bg-orange-400',
  HOLIDAY: 'bg-purple-400',
  WEEKEND: 'bg-slate-200',
  FUTURE: 'bg-slate-100',
};

export const YearGlance: React.FC<YearGlanceProps> = ({
  data,
  currentMonthStr,
  onSelectMonth,
  className,
}) => {
  if (!data || !data.months) {
    return null;
  }

  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-600" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Year at a Glance ({data.year})
          </h4>
        </div>
        <span className="text-[11px] text-slate-400">Click a month to jump</span>
      </div>

      {/* 12 Monthly Rows */}
      <div className="space-y-1.5">
        {data.months.map((m) => {
          const isCurrent = m.month === currentMonthStr;

          return (
            <button
              key={m.month}
              type="button"
              onClick={() => onSelectMonth(m.month)}
              className={cn(
                'w-full p-2 rounded-lg border flex items-center justify-between gap-3 text-left transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500',
                isCurrent
                  ? 'bg-teal-50 border-teal-300 font-semibold shadow-2xs'
                  : 'bg-slate-50/50 border-slate-100 hover:bg-slate-100',
              )}
            >
              {/* Month label */}
              <span className="w-8 text-xs font-bold text-slate-700 font-mono">
                {m.monthName}
              </span>

              {/* Day Dots Grid (up to 31 dots) */}
              <div className="flex-1 flex items-center gap-[2px] overflow-hidden">
                {m.days.map((d) => {
                  const color = STATUS_COLOR_DOT[d.status] || 'bg-slate-100';
                  return (
                    <span
                      key={d.date}
                      title={`${d.date}: ${d.status}`}
                      className={cn('w-2 h-3.5 rounded-[1px] transition-transform hover:scale-125', color)}
                    />
                  );
                })}
              </div>

              {/* Attendance % */}
              <div className="flex items-center gap-1 min-w-[48px] justify-end">
                <span className="text-xs font-bold text-slate-800 font-mono">
                  {m.attendancePct}%
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
