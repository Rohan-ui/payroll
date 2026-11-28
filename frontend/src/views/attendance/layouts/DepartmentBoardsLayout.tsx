import React, { useState } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { StatusPill } from '../shared/StatusPill';
import { MiniBars } from '../shared/MiniBars';
import { MonthSummary } from '../shared/MonthSummary';
import { EmployeeHeader } from '../shared/EmployeeHeader';
import { DepartmentWidget } from '../shared/DepartmentWidget';
import { MonthCalendar } from '../shared/MonthCalendar';
import { DayDetail } from '../shared/DayDetail';
import { LiveTimes, isInsideNow } from '../shared/LiveTimes';
import { useNow } from '../shared/duration';
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
  // One clock for the whole board: rows of people still inside today count up every second.
  const now = useNow(employees.some((e) => isInsideNow(e.firstCheckInAt, e.lastCheckOutAt)));
  // Slide-over drawer state in employee detail view
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // -------------------------------------------------------------
  // 1. EMPLOYEE DETAIL VIEW (Department Boards Style)
  // -------------------------------------------------------------
  if (isDetailView && employeeMonthData) {
    const { employee, month, days } = employeeMonthData;
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
        <EmployeeHeader
          employee={employee}
          action={
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="self-start sm:self-auto px-4 h-10 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              Open {selectedDayRecord ? new Date(`${selectedDayRecord.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'day'}
            </button>
          }
        />

        {/* 2-Column Grid: Compact Calendar on Left, Summary + Year at Glance on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Compact Calendar Heatmap (Left, 7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Calendar</h3>
                <span className="text-xs text-slate-500">Pick a day to see its details</span>
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
            <MonthSummary data={employeeMonthData} compact />

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Employees <span className="ml-1 text-xs font-medium text-slate-500 tabular-nums">{employees.length}</span>
          </h3>
          <span className="text-xs text-slate-500">
            Status for {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
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
            <p className="text-sm font-medium">No employees match this search or department. Clear the search or pick “All departments”.</p>
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
                        {emp.employeeCode}{emp.roleName ? ` · ${emp.roleName}` : ''}
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
                  <LiveTimes firstCheckInAt={emp.firstCheckInAt} lastCheckOutAt={emp.lastCheckOutAt} now={now} className="text-right" />
                </div>

                {/* 14-Day Mini Bar Chart */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Hours, last 14 days</span>
                    <span className="font-semibold text-slate-700 tabular-nums">{emp.monthAttendancePct}% this month</span>
                  </div>
                  {/* No onSelectDay: the whole card is already a button, and buttons can't nest. */}
                  <MiniBars days={emp.last14Days} height={38} selectedDate={selectedDate} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
