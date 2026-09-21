import React, { useState } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  User,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Avatar } from '../../../components/ui/Avatar';
import { StatusPill } from '../shared/StatusPill';
import { MonthStrip } from '../shared/MonthStrip';
import { DepartmentWidget } from '../shared/DepartmentWidget';
import { MonthCalendar } from '../shared/MonthCalendar';
import { DayDetail } from '../shared/DayDetail';
import type {
  DepartmentSummaryResponse,
  EmployeeDayItem,
  EmployeeMonthResponse,
} from '../../../api/attendance.api';

interface CommandCenterLayoutProps {
  // Dashboard Props
  summaryData: DepartmentSummaryResponse | null;
  employees: EmployeeDayItem[];
  selectedDeptId?: string;
  onSelectDept: (deptId: string | undefined) => void;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onSelectEmployee: (empId: string) => void;
  isLoading: boolean;

  // Detail View Props (if in employee detail mode)
  isDetailView?: boolean;
  employeeMonthData: EmployeeMonthResponse | null;
  onRegularize?: (dateStr: string) => void;
  onEditPunches?: (dateStr: string) => void;
}

export const CommandCenterLayout: React.FC<CommandCenterLayoutProps> = ({
  summaryData,
  employees = [],
  selectedDeptId,
  onSelectDept,
  selectedDate,
  onSelectDate,
  onSelectEmployee,
  isLoading,
  isDetailView = false,
  employeeMonthData,
  onRegularize,
  onEditPunches,
}) => {
  // -------------------------------------------------------------
  // 1. EMPLOYEE DETAIL VIEW (Command Center Style)
  // -------------------------------------------------------------
  if (isDetailView && employeeMonthData) {
    const { employee, month, workingDays, attendancePct, payableDays, totalWorkedHours, stats, leaveBalances, days } = employeeMonthData;
    const selectedDayRecord = days.find((d) => d.date === selectedDate) || days[0];

    // Stepper navigation for day
    const currentIndex = days.findIndex((d) => d.date === selectedDayRecord?.date);
    const prevDate = currentIndex > 0 ? days[currentIndex - 1]?.date : undefined;
    const nextDate = currentIndex < days.length - 1 ? days[currentIndex + 1]?.date : undefined;

    return (
      <div className="space-y-6">
        {/* Profile Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={employee.fullName} size="lg" className="w-14 h-14 ring-2 ring-teal-500/20" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900">{employee.fullName}</h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-semibold">
                  {employee.employeeCode}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 text-xs font-medium border border-teal-200">
                  {employee.departmentName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {employee.designation} • {employee.email || 'Official Tenant Member'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-6">
            <div>
              <span className="text-xs text-slate-400 block font-medium">Worked Hours</span>
              <span className="text-xl font-bold font-mono text-slate-900">{totalWorkedHours} hrs</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">Payable Days</span>
              <span className="text-xl font-bold font-mono text-teal-700">
                {payableDays} / {days.length}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">Attendance</span>
              <span className="text-xl font-bold font-mono text-emerald-700">{attendancePct}%</span>
            </div>
          </div>
        </div>

        {/* 6 Stat Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Present */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">Present Days</span>
            <span className="text-xl font-bold text-teal-800 font-mono mt-1 block">
              {stats.presentDays}
            </span>
            <span className="text-[10px] text-teal-600">Full shifts logged</span>
          </div>

          {/* Absent + LOP */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">Absent Days</span>
            <span className="text-xl font-bold text-red-600 font-mono mt-1 block">
              {stats.absentDays}
            </span>
            <span className="text-[10px] text-orange-600 font-medium">
              {stats.lopCount} LOP marked
            </span>
          </div>

          {/* Half Days & Leave */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">Half Day / Leave</span>
            <span className="text-xl font-bold text-amber-700 font-mono mt-1 block">
              {stats.halfDays + stats.leaveDays}
            </span>
            <span className="text-[10px] text-slate-400">
              {stats.halfDays} half • {stats.leaveDays} leave
            </span>
          </div>

          {/* Late Marks */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">Late Marks</span>
            <span className="text-xl font-bold text-amber-600 font-mono mt-1 block">
              {stats.lateMarks}
            </span>
            <span className="text-[10px] text-slate-400">Grace &gt;15 min</span>
          </div>

          {/* Avg Check-In */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">Avg Check-In</span>
            <span className="text-base font-bold text-slate-800 font-mono mt-1.5 block">
              {stats.avgCheckInTime}
            </span>
            <span className="text-[10px] text-slate-400">Shift start 9:30 AM</span>
          </div>

          {/* Overtime */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 block">Overtime Hours</span>
            <span className="text-xl font-bold text-sky-700 font-mono mt-1 block">
              +{stats.overtimeHours}h
            </span>
            <span className="text-[10px] text-sky-600">Net extra hours</span>
          </div>
        </div>

        {/* Large Month Heatmap + Sticky Day Detail Side Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Detailed Calendar (7 cols on desktop) */}
          <div className="lg:col-span-7 space-y-4">
            <MonthCalendar
              variant="detailed"
              monthStr={month}
              days={days}
              selectedDate={selectedDate}
              onSelectDay={onSelectDate}
            />

            {/* Month Breakdown Stacked Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 uppercase tracking-wider">
                  Month Status Distribution
                </span>
                <span className="text-slate-400 font-mono">{days.length} days total</span>
              </div>

              {/* Stacked bar */}
              <div className="w-full h-3 rounded-full bg-slate-100 flex overflow-hidden">
                <div style={{ width: `${(stats.presentDays / days.length) * 100}%` }} className="bg-teal-500" title="Present" />
                <div style={{ width: `${(stats.halfDays / days.length) * 100}%` }} className="bg-amber-400" title="Half Day" />
                <div style={{ width: `${(stats.leaveDays / days.length) * 100}%` }} className="bg-emerald-500" title="Paid Leave" />
                <div style={{ width: `${(stats.lopCount / days.length) * 100}%` }} className="bg-orange-400" title="Unpaid LOP" />
                <div style={{ width: `${(stats.absentDays / days.length) * 100}%` }} className="bg-red-400" title="Absent" />
              </div>

              {/* Day Counts */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-1">
                <span className="flex items-center gap-1.5 font-medium text-teal-800">
                  <span className="w-2 h-2 rounded-full bg-teal-500" /> {stats.presentDays} Present
                </span>
                <span className="flex items-center gap-1.5 font-medium text-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> {stats.halfDays} Half Days
                </span>
                <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> {stats.leaveDays} Leaves
                </span>
                <span className="flex items-center gap-1.5 font-medium text-red-700">
                  <span className="w-2 h-2 rounded-full bg-red-400" /> {stats.absentDays} Absences
                </span>
              </div>
            </div>

            {/* Clickable Hours-per-day Bar Chart with Target Line */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 uppercase tracking-wider">
                  Daily Worked Hours vs 8h Target
                </span>
                <span className="text-[11px] text-teal-700 font-medium">Click a bar to inspect day</span>
              </div>

              <div className="relative h-24 pt-4 flex items-end gap-1 select-none">
                {/* 8h Target Line */}
                <div
                  className="absolute left-0 right-0 border-b-2 border-dashed border-teal-600/40 pointer-events-none z-0"
                  style={{ bottom: `${(8 / 10) * 100}%` }}
                >
                  <span className="text-[9px] font-bold text-teal-800 bg-teal-50 px-1 py-0.5 rounded absolute -top-4 right-0">
                    8h Net Target
                  </span>
                </div>

                {days.map((d) => {
                  const barPct = Math.max(5, Math.min(100, (d.workedHours / 10) * 100));
                  const isSelected = selectedDate === d.date;

                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => onSelectDate(d.date)}
                      title={`Day ${d.day}: ${d.workedHours}h worked (${d.status})`}
                      className="flex-1 h-full flex flex-col items-center justify-end group focus:outline-none relative z-10"
                    >
                      <div
                        style={{ height: `${barPct}%` }}
                        className={cn(
                          'w-full rounded-t-xs transition-all',
                          d.status === 'PRESENT'
                            ? 'bg-teal-500 group-hover:bg-teal-600'
                            : d.status === 'HALF_DAY'
                            ? 'bg-amber-400 group-hover:bg-amber-500'
                            : d.status === 'WEEKEND'
                            ? 'bg-slate-200'
                            : 'bg-slate-100',
                          isSelected && 'ring-2 ring-teal-700 brightness-110',
                        )}
                      />
                      <span className="text-[9px] font-mono text-slate-400 mt-1 block">
                        {d.day}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sticky Day Detail Side Panel */}
          <div className="lg:col-span-5">
            <DayDetail
              displayMode="panel"
              dayRecord={selectedDayRecord}
              employeeName={employee.fullName}
              employeeCode={employee.employeeCode}
              onPrevDay={prevDate ? () => onSelectDate(prevDate) : undefined}
              onNextDay={nextDate ? () => onSelectDate(nextDate) : undefined}
              onRegularize={onRegularize}
              onEditPunches={onEditPunches}
            />
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. DASHBOARD VIEW (Layout A Command Center)
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Top Row: Hero Card + Department Cards */}
      {summaryData && (
        <DepartmentWidget
          variant="ring"
          data={summaryData}
          selectedDeptId={selectedDeptId}
          onSelectDept={onSelectDept}
        />
      )}

      {/* Employee Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Staff Daily Log & Month Overview
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono font-semibold">
              {employees.length}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Target Date: <strong className="text-slate-700">{selectedDate}</strong>
          </span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-3">Department</th>
                <th className="py-3 px-3">Status Today</th>
                <th className="py-3 px-3">Check In / Out</th>
                <th className="py-3 px-4">Month Attendance Strip</th>
                <th className="py-3 px-4 text-right">Month %</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-4 bg-slate-50/30">
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                    </td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium">No employee records match the active criteria.</p>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr
                    key={emp.employeeId}
                    onClick={() => onSelectEmployee(emp.employeeId)}
                    className="hover:bg-teal-50/40 transition-colors cursor-pointer group focus-within:bg-teal-50/60"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectEmployee(emp.employeeId);
                      }
                    }}
                  >
                    {/* Employee Profile */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.fullName} size="sm" />
                        <div>
                          <span className="font-bold text-slate-900 group-hover:text-teal-900 block">
                            {emp.fullName}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {emp.employeeCode} • {emp.roleName}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                        {emp.departmentName}
                      </span>
                    </td>

                    {/* Status on Selected Date */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <StatusPill status={emp.dayStatus} size="xs" />
                        {emp.isLate && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                            Late by {emp.lateMinutes}m
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Timings */}
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {emp.inTime ? (
                        <span>
                          {emp.inTime} – {emp.outTime || 'Working'}
                        </span>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>

                    {/* Month Strip */}
                    <td className="py-3 px-4">
                      <MonthStrip
                        days={emp.monthDays}
                        selectedDate={selectedDate}
                        onSelectDay={onSelectDate}
                      />
                    </td>

                    {/* Month Attendance % */}
                    <td className="py-3 px-4 text-right">
                      <span
                        className={cn(
                          'text-xs font-bold font-mono px-2 py-0.5 rounded-md',
                          emp.monthAttendancePct >= 75
                            ? 'bg-mint-100 text-emerald-800'
                            : emp.monthAttendancePct >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800',
                        )}
                      >
                        {emp.monthAttendancePct}%
                      </span>
                    </td>

                    {/* Chevron Action */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEmployee(emp.employeeId);
                        }}
                        aria-label={`View ${emp.fullName}'s attendance details`}
                        className="p-1 rounded hover:bg-teal-100 text-slate-400 group-hover:text-teal-700 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
