import React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { StatusPill } from './StatusPill';
import type { EmployeeMonthDayRecord } from '../../../api/attendance.api';
import { getAttendancePunches } from './punches';
import { attendanceToday, formatDuration, formatMinutes, useNow, workedFromBounds, workedFromPunches } from './duration';

/** Hours since midnight India time (+05:30) for an instant, such as 9.5 for 09:30. */
const indiaHour = (iso: string) => {
  const d = new Date(iso);
  return ((d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + 330) % 1440) / 60;
};

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
  const today = attendanceToday();
  const now = useNow(days.some((d) => d.date === today && d.firstCheckInAt && !d.lastCheckOutAt));

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
        <span className="w-28 text-right">Worked</span>
      </div>

      {/* Daily rows */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto scrollbar-thin">
        {days.map((d) => {
          const isWorking = d.status === 'PRESENT' || d.status === 'HALF_DAY';
          const isOff = d.status === 'WEEKEND' || d.status === 'HOLIDAY';

          // The bar runs from first check-in to last check-out (or to now while still inside today), in India time.
          const span = workedFromBounds(d.firstCheckInAt, d.lastCheckOutAt, d.date, now);
          const punches = getAttendancePunches(d.punches);
          const worked = punches.length ? workedFromPunches(punches, d.date, now) : null;
          let workedLeft = 0;
          let workedWidth = 0;
          if (d.firstCheckInAt && span) {
            const inHour = indiaHour(d.firstCheckInAt);
            const outHour = Math.min(24, inHour + span.ms / 3_600_000);
            workedLeft = Math.max(0, (inHour / 24) * 100);
            workedWidth = Math.max(2, ((outHour - inHour) / 24) * 100);
          }
          const workedText = worked && worked.ms > 0 ? formatDuration(worked.ms) : formatMinutes(d.workedMinutes);
          const running = !!(worked?.running || span?.running);

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
                {isWorking && (d.workedMinutes > 0 || running) ? (
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
                      title={`Worked: ${workedText}${running ? ' (still inside)' : ''}`}
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
              <div className="w-28 text-right flex-shrink-0">
                <span className={cn('text-xs font-bold font-mono tabular-nums', running ? 'text-teal-700' : 'text-slate-800')}>
                  {workedText}
                </span>
                {running && <span className="text-[10px] text-teal-700 block font-semibold">Live</span>}
                {d.isLate && <span className="text-[10px] text-amber-600 block font-medium">Late</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
