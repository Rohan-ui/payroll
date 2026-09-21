import React, { useState } from 'react';
import {
  Clock,
  Calendar,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Award,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Avatar } from '../../../components/ui/Avatar';
import { StatusPill } from '../shared/StatusPill';
import { MiniBars } from '../shared/MiniBars';
import { DepartmentWidget } from '../shared/DepartmentWidget';
import { MonthCalendar } from '../shared/MonthCalendar';
import { DayDetail } from '../shared/DayDetail';
import { YearGlance } from '../shared/YearGlance';
import type {
  DepartmentSummaryResponse,
  EmployeeDayItem,
  EmployeeMonthResponse,
  EmployeeYearResponse,
} from '../../../api/attendance.api';

interface DepartmentBoardsLayoutProps {
  // Dashboard Props
  summaryData: DepartmentSummaryResponse | null;
  employees: EmployeeDayItem[];
  selectedDeptId?: string;
  onSelectDept: (deptId: string | undefined) => void;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onSelectEmployee: (empId: string) => void;
  isLoading: boolean;

  // Detail View Props
  isDetailView?: boolean;
  employeeMonthData: EmployeeMonthResponse | null;
  employeeYearData?: EmployeeYearResponse | null;
  onSelectMonth?: (monthStr: string) => void;
  onRegularize?: (dateStr: string) => void;
  onEditPunches?: (dateStr: string) => void;
}

export const DepartmentBoardsLayout: React.FC<DepartmentBoardsLayoutProps> = ({
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
  employeeYearData = null,
  onSelectMonth,
  onRegularize,
  onEditPunches,
}) => {
  // Slide-over drawer state in employee detail view
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // -------------------------------------------------------------
  // 1. EMPLOYEE DETAIL VIEW (Department Boards Style)
  // -------------------------------------------------------------
  if (isDetailView && employeeMonthData) {
    const { employee, month, workingDays, attendancePct, payableDays, totalWorkedHours, stats, days } = employeeMonthData;
    const selectedDayRecord = days.find((d) => d.date === selectedDate) || days[0];

    const currentIndex = days.findIndex((d) => d.date === selectedDayRecord?.date);
    const prevDate = currentIndex > 0 ? days[currentIndex - 1]?.date : undefined;
    const nextDate = currentIndex < days.length - 1 ? days[currentIndex + 1]?.date : undefined;

    const handleDateClick = (dateStr: string) => {
      onSelectDate(dateStr);
      setIsDrawerOpen(true);
    };

    return (
      <div className="space-y-6">
        {/* Profile Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                {employee.designation} • {employee.email || 'Employee Profile'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Open Day Drawer
            </button>
          </div>
        </div>

        {/* 2-Column Grid: Compact Calendar on Left, Summary + Year at Glance on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Compact Calendar Heatmap (Left, 7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Attendance Calendar ({month})
                </h3>
                <span className="text-[11px] text-slate-400">Click date to slide open drawer</span>
              </div>

              <MonthCalendar
                variant="compact"
                monthStr={month}
                days={days}
                selectedDate={selectedDate}
                onSelectDay={handleDateClick}
              />
            </div>
          </div>

          {/* Month Summary Card + Year at a Glance (Right, 5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Month Summary Card (Donut + Streak + Late + OT) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Monthly Performance Card
                </h3>
                <span className="text-xs font-bold text-teal-800 font-mono">
                  {workingDays} working days
                </span>
              </div>

              {/* Donut graphic + breakdown */}
              <div className="flex items-center gap-5">
                <div className="relative w-20 h-20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#F1F5F9" strokeWidth="3.5" />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#2FB898"
                      strokeWidth="3.5"
                      strokeDasharray={`${attendancePct * 0.88}, 88`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-base font-bold text-slate-900 leading-none">
                      {attendancePct}%
                    </span>
                    <span className="text-[8px] uppercase tracking-tighter text-slate-400 mt-0.5">
                      Rate
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Present</span>
                    <span className="font-bold text-teal-800 font-mono">{stats.presentDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Half Day</span>
                    <span className="font-bold text-amber-700 font-mono">{stats.halfDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Paid Leave</span>
                    <span className="font-bold text-emerald-800 font-mono">{stats.leaveDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Absent</span>
                    <span className="font-bold text-red-600 font-mono">{stats.absentDays} days</span>
                  </div>
                </div>
              </div>

              {/* Key Highlights (Best streak, Late, OT) */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                <div className="p-2 rounded-lg bg-teal-50 border border-teal-100">
                  <span className="text-[10px] text-teal-700 font-medium block">Best Streak</span>
                  <span className="text-sm font-bold text-teal-900 font-mono mt-0.5 block">
                    {stats.bestStreakDays} Days
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                  <span className="text-[10px] text-amber-700 font-medium block">Late Marks</span>
                  <span className="text-sm font-bold text-amber-900 font-mono mt-0.5 block">
                    {stats.lateMarks}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-sky-50 border border-sky-100">
                  <span className="text-[10px] text-sky-700 font-medium block">Overtime</span>
                  <span className="text-sm font-bold text-sky-900 font-mono mt-0.5 block">
                    +{stats.overtimeHours}h
                  </span>
                </div>
              </div>
            </div>

            {/* Year at a Glance Card */}
            {employeeYearData && (
              <YearGlance
                data={employeeYearData}
                currentMonthStr={month}
                onSelectMonth={onSelectMonth || (() => {})}
              />
            )}
          </div>
        </div>

        {/* Slide-over Drawer for Day Detail */}
        <DayDetail
          displayMode="drawer"
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          dayRecord={selectedDayRecord}
          employeeName={employee.fullName}
          employeeCode={employee.employeeCode}
          onPrevDay={prevDate ? () => onSelectDate(prevDate) : undefined}
          onNextDay={nextDate ? () => onSelectDate(nextDate) : undefined}
          onRegularize={onRegularize}
          onEditPunches={onEditPunches}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. DASHBOARD VIEW (Layout B Department Boards)
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Top Row: Donut Metric Cards with 7-Day Trend Sparklines */}
      {summaryData && (
        <DepartmentWidget
          variant="donut"
          data={summaryData}
          selectedDeptId={selectedDeptId}
          onSelectDept={onSelectDept}
        />
      )}

      {/* Employee Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Employee Board Cards
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono font-semibold">
              {employees.length}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Selected Date: <strong className="text-slate-700">{selectedDate}</strong>
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 rounded-xl bg-slate-100 animate-pulse border border-slate-200" />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="p-10 rounded-xl bg-white border border-slate-200 text-center text-slate-400">
            <p className="text-sm font-medium">No employee cards match the active filter criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => (
              <button
                key={emp.employeeId}
                type="button"
                onClick={() => onSelectEmployee(emp.employeeId)}
                className="p-4 rounded-xl bg-white border border-slate-200 hover:border-teal-400 hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer group focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {/* Card Top: Profile + Status Pill */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={emp.fullName} size="md" />
                    <div className="truncate">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-teal-900 truncate">
                        {emp.fullName}
                      </h4>
                      <span className="text-xs text-slate-400 font-mono block truncate">
                        {emp.employeeCode} • {emp.roleName}
                      </span>
                    </div>
                  </div>
                  <StatusPill status={emp.dayStatus} size="xs" />
                </div>

                {/* Timings & Department */}
                <div className="flex items-center justify-between text-xs text-slate-500 mb-3 pt-2 border-t border-slate-100">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {emp.departmentName}
                  </span>
                  <span className="font-mono">
                    {emp.inTime ? `${emp.inTime} – ${emp.outTime || '...'}` : 'No punch today'}
                  </span>
                </div>

                {/* 14-Day Mini Bar Chart */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>14-Day Hours Trend</span>
                    <span className="font-bold text-teal-800 font-mono">{emp.monthAttendancePct}% month</span>
                  </div>
                  <MiniBars
                    days={emp.last14Days}
                    height={38}
                    selectedDate={selectedDate}
                    onSelectDay={onSelectDate}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
