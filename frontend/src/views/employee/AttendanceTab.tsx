import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { CalendarHeatmap } from '../../components/ui/CalendarHeatmap';
import { attendanceApi, type EmployeeMonthResponse } from '../../api/attendance.api';
import { usePayroll } from '../../context/PayrollContext';
import type { AttendanceDay, AttendanceDayStatus } from '../../types/payroll.types';
import { CosecRefreshNote, useCosecRefresh } from '../attendance/CosecRefresh';
import { errorText } from '../payroll/payroll-format';
import { Section } from './profile-ui';

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/**
 * A month of attendance from the attendance module, with its summary. Editing
 * happens in Attendance; a day here opens it there.
 */
export const AttendanceTab: React.FC<{ employeeId: string }> = ({ employeeId }) => {
  const { setCurrentView, setSelectedEmployeeId } = usePayroll();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<EmployeeMonthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const month = monthKey(period.year, period.month);
  const isThisMonth = period.year === now.getFullYear() && period.month === now.getMonth() + 1;

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    attendanceApi.getEmployeeMonth(employeeId, month)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [employeeId, month, reload]);

  const cosec = useCosecRefresh(employeeId, month, () => setReload((n) => n + 1));

  const shift = (delta: number) => setPeriod(({ year, month: m }) => {
    const d = new Date(year, m - 1 + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  const openInAttendance = (date?: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('view', 'attendance');
    params.set('date', date ?? `${month}-${isThisMonth ? String(now.getDate()).padStart(2, '0') : '01'}`);
    params.set('employeeId', employeeId);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    setSelectedEmployeeId(employeeId);
    setCurrentView('attendance');
  };

  const days: AttendanceDay[] = data?.days.map((d) => ({ date: d.date, status: d.status as AttendanceDayStatus })) ?? [];
  const stats = data?.stats;
  const label = new Date(period.year, period.month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <Section title={`Attendance — ${label}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-[#2B293E]">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-white/10"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-white/10"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          {!isThisMonth && <Button variant="ghost" size="sm" onClick={() => setPeriod({ year: now.getFullYear(), month: now.getMonth() + 1 })}>This month</Button>}
          <Button variant="outline" size="sm" onClick={() => openInAttendance()}>Open in Attendance</Button>
        </div>
      }>
      <div className="mb-3"><CosecRefreshNote state={cosec} /></div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">Attendance could not be loaded: {error}</p>
      ) : !data ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true" aria-label="Loading attendance" />
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6 dark:border-[#2B293E] dark:bg-[#2B293E]">
            {[
              ['Present', stats?.presentDays],
              ['Absent', stats?.absentDays],
              ['Half days', stats?.halfDays],
              ['Late arrivals', stats?.lateMarks],
              ['On leave', stats?.leaveDays],
              ['Hours worked', data.totalWorkedHours],
            ].map(([name, value]) => (
              <div key={name as string} className="bg-white px-3 py-2 dark:bg-[#181724]">
                <dt className="text-xs text-slate-500">{name}</dt>
                <dd className="text-lg font-bold tabular-nums text-slate-800 dark:text-white">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <CalendarHeatmap year={period.year} month={period.month} days={days} onDayClick={(date) => openInAttendance(date)} />
          <p className="mt-2 text-xs text-slate-500">Select a day to open it in Attendance, where corrections are made and approved.</p>
        </>
      )}
    </Section>
  );
};
