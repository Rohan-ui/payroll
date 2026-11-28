import React, { useState } from 'react';
import { Calendar, List, Layers } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { LeaveBalances } from '../shared/LeaveBalances';
import { Avatar } from '../../../components/ui/Avatar';
import { STATUS_CONFIG } from '../shared/StatusPill';
import { MonthCalendar } from '../shared/MonthCalendar';
import { MonthSummary } from '../shared/MonthSummary';
import { TimelineRows } from '../shared/TimelineRows';
import { LogTable } from '../shared/LogTable';
import { DayDetail } from '../shared/DayDetail';
import type {
  RosterMatrixResponse,
  EmployeeMonthResponse,
} from '../../../api/attendance.api';

interface RosterMatrixLayoutProps {
  // Dashboard Props
  matrixData: RosterMatrixResponse | null;
  selectedDeptId?: string;
  onSelectDept: (deptId: string | undefined) => void;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onSelectEmployee: (empId: string) => void;
  isLoading: boolean;

  // Detail View Props
  isDetailView?: boolean;
  employeeMonthData: EmployeeMonthResponse | null;
  onRegularize?: (dateStr: string) => void;
  onEditPunches?: (dateStr: string) => void;
}

const LEGEND = ['PRESENT', 'HALF_DAY', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEKEND'] as const;
const DETAIL_TABS = [
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'timeline', label: 'Timeline', icon: Layers },
  { id: 'log', label: 'Daily log', icon: List },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['id'];

export const RosterMatrixLayout: React.FC<RosterMatrixLayoutProps> = ({
  matrixData,
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
  // Modal state for Day Detail (when clicking a cell in matrix or row in Timeline/Log)
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Tabs state in employee detail view (Calendar | Timeline | Log)
  const [activeTab, setActiveTab] = useState<DetailTab>('calendar');

  const handleCellClick = (dateStr: string) => {
    setModalDate(dateStr);
    setIsModalOpen(true);
  };

  // -------------------------------------------------------------
  // 1. EMPLOYEE DETAIL VIEW (Roster Matrix Style: Left Profile/Stats + Right 3 Tabs)
  // -------------------------------------------------------------
  if (isDetailView && employeeMonthData) {
    const { employee, month, days } = employeeMonthData;
    const targetDateForModal = modalDate || selectedDate;
    const selectedDayRecord = days.find((d) => d.date === targetDateForModal) || days[0];

    const currentIndex = days.findIndex((d) => d.date === selectedDayRecord?.date);
    const prevDate = currentIndex > 0 ? days[currentIndex - 1]?.date : undefined;
    const nextDate = currentIndex < days.length - 1 ? days[currentIndex + 1]?.date : undefined;

    return (
      <div className="space-y-6">
        {/* Main 2-Column Split: Left Column Stats & Leave Bars, Right Column 3 Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (4 cols on lg screens) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={employee.fullName} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 truncate">{employee.fullName}</h2>
                  <p className="text-xs text-slate-500 truncate">{[employee.employeeCode, employee.designation, employee.departmentName].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <LeaveBalances employeeId={employee.id} />
            </div>
            <MonthSummary data={employeeMonthData} compact />
          </div>

          {/* Right Column: 3 Tabs (Calendar | Timeline | Log) */}
          <div className="lg:col-span-8 space-y-4">
            <div role="tablist" aria-label="Month views" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              {DETAIL_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`roster-tab-${id}`}
                  aria-selected={activeTab === id}
                  aria-controls="roster-tab-panel"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex-1 h-9 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                    activeTab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <div id="roster-tab-panel" role="tabpanel" aria-labelledby={`roster-tab-${activeTab}`}>
            {/* Tab 1: Calendar */}
            {activeTab === 'calendar' && (
              <div className="space-y-4">
                <MonthCalendar
                  variant="simple"
                  monthStr={month}
                  days={days}
                  selectedDate={selectedDate}
                  onSelectDay={(dStr) => {
                    onSelectDate(dStr);
                    handleCellClick(dStr);
                  }}
                />
              </div>
            )}

            {/* Tab 2: Timeline Bars */}
            {activeTab === 'timeline' && (
              <TimelineRows
                days={days}
                onSelectDay={handleCellClick}
              />
            )}

            {/* Tab 3: Daily Log Table */}
            {activeTab === 'log' && (
              <LogTable
                days={days}
                onSelectDay={handleCellClick}
              />
            )}
            </div>
          </div>
        </div>

        {/* Centered Modal for Day Detail */}
        <DayDetail
          displayMode="modal"
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          dayRecord={selectedDayRecord}
          employeeName={employee.fullName}
          employeeCode={employee.employeeCode}
          onPrevDay={prevDate ? () => setModalDate(prevDate) : undefined}
          onNextDay={nextDate ? () => setModalDate(nextDate) : undefined}
          onRegularize={onRegularize}
          onEditPunches={onEditPunches}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. DASHBOARD VIEW (Layout C Roster Matrix)
  // -------------------------------------------------------------
  const kpis = matrixData?.kpis || {
    presentCount: 0,
    absentCount: 0,
    leaveCount: 0,
    lateCount: 0,
    headcount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Area: 4 KPI Tiles + Department Leaderboard Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <dl className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Present', value: kpis.presentCount, dot: STATUS_CONFIG.PRESENT.dot },
            { label: 'Absent', value: kpis.absentCount, dot: STATUS_CONFIG.ABSENT.dot },
            { label: 'On leave', value: kpis.leaveCount, dot: STATUS_CONFIG.PAID_LEAVE.dot },
            { label: 'Late', value: kpis.lateCount, dot: 'bg-amber-500' },
          ].map((k) => (
            <div key={k.label} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <span className={cn('w-2 h-2 rounded-full', k.dot)} aria-hidden="true" />
                {k.label}
              </dt>
              <dd className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">{k.value}</dd>
              <dd className="text-[11px] text-slate-500">
                {kpis.headcount > 0 ? `${Math.round((k.value / kpis.headcount) * 100)}% of ${kpis.headcount}` : 'No employees'}
              </dd>
            </div>
          ))}
        </dl>

        {/* Department Leaderboard Card (Right, 5 cols) */}
        <div className="lg:col-span-5">
          {matrixData && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 h-full flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Departments</h3>
                <span className="text-xs text-slate-500">Highest attendance first · pick one to filter</span>
              </div>

              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                {matrixData.departmentLeaderboard.map((dept, rank) => {
                  const isSelected = selectedDeptId === dept.departmentId;
                  return (
                    <button
                      key={dept.departmentId}
                      type="button"
                      onClick={() => onSelectDept(isSelected ? undefined : dept.departmentId)}
                      aria-pressed={isSelected}
                      className={cn(
                        'w-full p-2 rounded-lg border transition-all flex items-center justify-between gap-3 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500',
                        isSelected ? 'bg-teal-50 border-teal-400 shadow-2xs' : 'bg-slate-50 border-slate-100 hover:bg-slate-100/60',
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                          {rank + 1}
                        </span>
                        <span className="text-xs font-medium text-slate-800 truncate">
                          {dept.departmentName}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-900 font-mono">
                        {dept.attendancePct}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The Roster Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Month roster{matrixData?.month ? ` · ${matrixData.month}` : ''}</h3>
            <p className="text-xs text-slate-500">Pick a cell to open that employee's day</p>
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600" aria-label="Legend">
            {LEGEND.map((st) => (
              <li key={st} className="inline-flex items-center gap-1">
                <span className={cn(STATUS_CONFIG[st].glyph.length > 1 ? 'text-[7px]' : 'text-[10px]', 'w-5 h-5 rounded font-bold flex items-center justify-center border', STATUS_CONFIG[st].bg, STATUS_CONFIG[st].text, STATUS_CONFIG[st].border)} aria-hidden="true">
                  {STATUS_CONFIG[st].glyph}
                </span>
                {STATUS_CONFIG[st].label}
              </li>
            ))}
            <li className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" /> Late
            </li>
          </ul>
        </div>

        {/* Sticky Container */}
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin">
          <table className="text-left text-xs border-collapse">
            {/* Header row (sticky top) */}
            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
              <tr>
                {/* Sticky Name column */}
                <th scope="col" className="py-2.5 px-3 min-w-[200px] sticky left-0 bg-slate-100 z-30 font-bold text-slate-700 border-r border-slate-200">
                  Employee
                </th>
                <th scope="col" className="py-2.5 px-2 text-center min-w-[50px] font-bold text-slate-700 border-r border-slate-200">
                  Month
                </th>
                {/* Days columns */}
                {matrixData?.daysHeader.map((hdr) => {
                  const isSelectedCol = selectedDate === hdr.date;

                  return (
                    <th
                      key={hdr.date}
                      className={cn(
                        'py-1 px-1 text-center min-w-[32px] border-r border-slate-200 select-none transition-colors',
                        hdr.isWeekend ? 'bg-slate-200/60' : '',
                        hdr.isHoliday ? 'bg-purple-100/50' : '',
                        isSelectedCol ? 'bg-teal-100 text-teal-900' : '',
                      )}
                      title={`${hdr.date}: ${hdr.isHoliday ? hdr.holidayName : hdr.isWeekend ? 'Week off' : 'Working day'}`}
                      scope="col"
                      aria-current={isSelectedCol ? 'date' : undefined}
                    >
                      <span className="text-[9px] text-slate-400 block">{hdr.weekday}</span>
                      <span className="text-xs font-bold text-slate-800">{hdr.day}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Department Groups and Rows */}
            <tbody className="divide-y divide-slate-100">
              {matrixData?.groups.map((grp) => (
                <React.Fragment key={grp.departmentId}>
                  {/* Department Group Header (sticky) */}
                  <tr className="bg-slate-50/90 font-bold text-slate-700">
                    <td
                      colSpan={(matrixData?.daysInMonth || 31) + 2}
                      className="py-1.5 px-3 uppercase text-[10px] tracking-wider text-teal-900 bg-teal-50/60 border-y border-teal-100 sticky left-0 z-10"
                    >
                      {grp.departmentName} · {grp.employees.length}
                    </td>
                  </tr>

                  {/* Employees in department */}
                  {grp.employees.map((emp) => (
                    <tr key={emp.employeeId} className="hover:bg-teal-50/20 transition-colors">
                      {/* Sticky Employee Name */}
                      <td className="py-2 px-3 sticky left-0 bg-white group-hover:bg-teal-50/20 z-10 border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => onSelectEmployee(emp.employeeId)}
                          className="flex items-center gap-2 text-left cursor-pointer group focus:outline-none"
                        >
                          <Avatar name={emp.fullName} size="xs" />
                          <div className="truncate">
                            <span className="font-bold text-slate-900 group-hover:text-teal-800 truncate block">
                              {emp.fullName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {emp.employeeCode}
                            </span>
                          </div>
                        </button>
                      </td>

                      {/* Month Attendance % */}
                      <td className="py-2 px-2 text-center border-r border-slate-200 font-mono font-bold text-slate-800">
                        {emp.monthAttendancePct}%
                      </td>

                      {/* Day Cells with Glyphs */}
                      {emp.days.map((cell) => {
                        const isSelectedCol = selectedDate === cell.date;
                        const style = STATUS_CONFIG[cell.status] ?? STATUS_CONFIG.FUTURE;
                        const isFuture = cell.status === 'FUTURE';

                        return (
                          <td
                            key={cell.date}
                            className={cn(
                              'p-0.5 text-center border-r border-slate-100 relative',
                              isSelectedCol && 'bg-teal-50/60',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                onSelectDate(cell.date);
                                onSelectEmployee(emp.employeeId);
                              }}
                              disabled={isFuture}
                              title={`${emp.fullName} · ${cell.date}: ${style.label}${cell.inTime ? ` (in ${cell.inTime})` : ''}${cell.isLate ? ', late' : ''}`}
                              aria-label={`${emp.fullName}, ${cell.date}: ${style.label}${cell.isLate ? ', late' : ''}`}
                              className={cn(
                                cell.glyph.length > 1 ? 'text-[8px]' : 'text-[11px]', 'relative w-7 h-7 rounded border flex items-center justify-center font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                                style.bg,
                                style.text,
                                style.border,
                                isFuture ? 'cursor-default border-dashed' : 'cursor-pointer hover:brightness-95',
                                isSelectedCol && !isFuture && 'ring-1 ring-teal-600',
                              )}
                            >
                              {cell.glyph}
                              {cell.isLate && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
