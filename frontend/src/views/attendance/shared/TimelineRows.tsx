import React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { StatusPill } from './StatusPill';
import type { EmployeeMonthDayRecord } from '../../../api/attendance.api';

interface TimelineRowsProps {
  days: EmployeeMonthDayRecord[];
  onSelectDay: (dateStr: string) => void;
  className?: string;
}

export const TimelineRows: React.FC<TimelineRowsProps> = ({ days = [], onSelectDay, className }) => {
  // 24-hour shift reference: 09:30 AM (9.5) to 06:30 PM (18.5)
  const shiftStart = 9.5;
  const shiftEnd = 18.5;
  const shiftLeft = (shiftStart / 24) * 100;
  const shiftWidth = ((shiftEnd - shiftStart) / 24) * 100;

  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs', className)}>
      {/* Header guide */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
        <span className="w-24">Date & Day</span>
        <div className="flex-1 flex items-center justify-between px-4 text-[11px] text-slate-400">
          <span>12 AM</span>
          <span>6 AM</span>
          <span className="font-semibold text-teal-700">9:30 AM</span>
          <span className="font-semibold text-slate-600">6:30 PM</span>
          <span>12 AM</span>
        </div>
        <span className="w-20 text-right">Hours</span>
      </div>

      {/* Daily rows */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto scrollbar-thin">
        {days.map((d) => {
          const isWorking = d.status === 'PRESENT' || d.status === 'HALF_DAY';
          const isOff = d.status === 'WEEKEND' || d.status === 'HOLIDAY';

          let workedLeft = 0;
          let workedWidth = 0;
          if (d.firstCheckInAt) {
            const cin = new Date(d.firstCheckInAt);
            const inHour = cin.getUTCHours() + cin.getUTCMinutes() / 60;
            let outHour = inHour + (d.workedMinutes || 0) / 60;
            if (d.lastCheckOutAt) {
              const cout = new Date(d.lastCheckOutAt);
              outHour = cout.getUTCHours() + cout.getUTCMinutes() / 60;
            }
            workedLeft = Math.max(0, (inHour / 24) * 100);
            workedWidth = Math.max(2, ((outHour - inHour) / 24) * 100);
          }

          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelectDay(d.date)}
              className="w-full p-2.5 flex items-center justify-between gap-4 hover:bg-teal-50/40 transition-colors text-left cursor-pointer focus:outline-none focus:bg-teal-50/60"
            >
              {/* Date */}
              <div className="w-24 flex-shrink-0">
                <span className="text-xs font-bold text-slate-800">
                  {d.weekday} {d.day}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">{d.date.slice(5)}</span>
              </div>

              {/* Bar against shift window or status chip */}
              <div className="flex-1 min-w-0">
                {isWorking && d.workedMinutes > 0 ? (
                  <div className="relative h-6 bg-slate-100 rounded-md overflow-hidden border border-slate-200">
                    {/* Shift target shadow */}
                    <div
                      className="absolute top-0 bottom-0 bg-slate-200/70 border-x border-slate-300 pointer-events-none"
                      style={{ left: `${shiftLeft}%`, width: `${shiftWidth}%` }}
                    />
                    {/* Worked bar */}
                    <div
                      className={cn(
                        'absolute top-1 bottom-1 rounded shadow-xs transition-all',
                        d.isLate ? 'bg-amber-500' : 'bg-teal-500',
                      )}
                      style={{ left: `${workedLeft}%`, width: `${workedWidth}%` }}
                      title={`Worked: ${d.workedHours}h`}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <StatusPill status={d.status} size="xs" />
                    {d.holidayName && (
                      <span className="text-xs text-purple-700 font-medium truncate">{d.holidayName}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Worked hours */}
              <div className="w-20 text-right flex-shrink-0">
                <span className="text-xs font-bold font-mono text-slate-800">
                  {d.workedHours > 0 ? `${d.workedHours}h` : '–'}
                </span>
                {d.isLate && <span className="text-[10px] text-amber-600 block font-medium">Late</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
