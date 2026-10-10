import React from 'react';
import { cn } from '../../../utils/cn';
import { StatusPill } from './StatusPill';
import type { EmployeeMonthDayRecord } from '../../../api/attendance.api';
import { getAttendancePunches } from './punches';
import { attendanceToday, clockTime, formatDuration, formatMinutes, useNow, workedFromPunches } from './duration';

interface LogTableProps {
  days: EmployeeMonthDayRecord[];
  onSelectDay: (dateStr: string) => void;
  className?: string;
}

export const LogTable: React.FC<LogTableProps> = ({ days = [], onSelectDay, className }) => {
  // Today's row counts up while the employee is still checked in.
  const today = attendanceToday();
  const now = useNow(days.some((d) => d.date === today && d.firstCheckInAt && !d.lastCheckOutAt));
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs', className)}>
      <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] sticky top-0 z-10">
            <tr>
              <th className="py-2.5 px-3">Date</th>
              <th className="py-2.5 px-2">Day</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Check In</th>
              <th className="py-2.5 px-3">Check Out</th>
              <th className="py-2.5 px-3 text-right">Worked</th>
              <th className="py-2.5 px-3">Late By</th>
              <th className="py-2.5 px-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {days.map((d) => {
              const inTime = d.firstCheckInAt ? clockTime(d.firstCheckInAt) : '–';
              const outTime = d.lastCheckOutAt ? clockTime(d.lastCheckOutAt) : '–';
              const punches = getAttendancePunches(d.punches);
              const worked = punches.length ? workedFromPunches(punches, d.date, now) : null;

              return (
                <tr
                  key={d.date}
                  onClick={() => onSelectDay(d.date)}
                  className="hover:bg-teal-50/40 transition-colors cursor-pointer focus-within:bg-teal-50/60"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectDay(d.date);
                    }
                  }}
                >
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                    {d.date}
                  </td>
                  <td className="py-2.5 px-2 text-slate-500 font-medium">
                    {d.weekday}
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusPill status={d.status} size="xs" />
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">
                    {inTime}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">
                    {outTime}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 whitespace-nowrap">
                    {worked && worked.ms > 0 ? (
                      <span className={worked.running ? 'text-teal-700' : undefined}>
                        {formatDuration(worked.ms)}{worked.running && <span className="ml-1 text-[10px] font-semibold">LIVE</span>}
                      </span>
                    ) : formatMinutes(d.workedMinutes)}
                  </td>
                  <td className="py-2.5 px-3">
                    {d.isLate ? (
                      <span className="text-amber-700 font-semibold">{d.lateMinutes}m late</span>
                    ) : (
                      <span className="text-slate-400">–</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 capitalize">
                    {d.source?.toLowerCase().replace(/_/g, ' ') || 'System'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
