import React from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Avatar } from '../../../components/ui/Avatar';
import { StatusPill } from '../shared/StatusPill';
import { MonthStrip } from '../shared/MonthStrip';
import { MiniBars } from '../shared/MiniBars';
import { MonthSummary } from '../shared/MonthSummary';
import { EmployeeHeader } from '../shared/EmployeeHeader';
import { DepartmentWidget } from '../shared/DepartmentWidget';
import { MonthCalendar } from '../shared/MonthCalendar';
import { DayDetail } from '../shared/DayDetail';
import { LiveTimes, isInsideNow } from '../shared/LiveTimes';
import { useNow } from '../shared/duration';
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

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

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
  // One clock for the whole board: rows of people still inside today count up every second.
  const now = useNow(employees.some((e) => isInsideNow(e.firstCheckInAt, e.lastCheckOutAt)));
  // -------------------------------------------------------------
  // 1. EMPLOYEE DETAIL VIEW (Command Center Style)
  // -------------------------------------------------------------
  if (isDetailView && employeeMonthData) {
    const { employee, month, days } = employeeMonthData;
    const selectedDayRecord = days.find((d) => d.date === selectedDate) || days[0];
    const targetMinutes = days.find((d) => d.status !== 'FUTURE')?.shift.standardMinutes || undefined;

    // Stepper navigation for day
    const currentIndex = days.findIndex((d) => d.date === selectedDayRecord?.date);
    const prevDate = currentIndex > 0 ? days[currentIndex - 1]?.date : undefined;
    const nextDate = currentIndex < days.length - 1 ? days[currentIndex + 1]?.date : undefined;

    return (
      <div className="space-y-6">
        <EmployeeHeader employee={employee} />
        <MonthSummary data={employeeMonthData} />

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

            <section aria-labelledby="hours-chart-title" className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="hours-chart-title" className="text-sm font-semibold text-slate-900">Hours worked each day</h3>
                <span className="text-xs text-slate-500">Pick a bar to open that day</span>
              </div>
              <MiniBars days={days} height={112} targetMinutes={targetMinutes} selectedDate={selectedDate} onSelectDay={onSelectDate} showAxis />
            </section>
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
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Employees <span className="ml-1 text-xs font-medium text-slate-500 tabular-nums">{employees.length}</span>
          </h3>
          <span className="text-xs text-slate-500">Status for {dayLabel(selectedDate)} · pick a row for the month</span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium text-[11px]">
              <tr>
                <th scope="col" className="py-3 px-4">Employee</th>
                <th scope="col" className="py-3 px-3">Department</th>
                <th scope="col" className="py-3 px-3">Status</th>
                <th scope="col" className="py-3 px-3">Check In / Out</th>
                <th scope="col" className="py-3 px-4">This month</th>
                <th scope="col" className="py-3 px-4 text-right">Month %</th>
                <th scope="col" className="py-3 px-3 text-center">Action</th>
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
                    <p className="text-sm font-medium">No employees match this search or department. Clear the search or pick “All departments”.</p>
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
                            {emp.employeeCode}{emp.roleName ? ` · ${emp.roleName}` : ''}
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
                      <LiveTimes firstCheckInAt={emp.firstCheckInAt} lastCheckOutAt={emp.lastCheckOutAt} now={now} />
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
