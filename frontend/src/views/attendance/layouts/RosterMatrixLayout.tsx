import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  List,
  Layers,
  ChevronRight,
  TrendingUp,
  Award,
  Users,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Avatar } from '../../../components/ui/Avatar';
import { StatusPill } from '../shared/StatusPill';
import { MonthCalendar } from '../shared/MonthCalendar';
import { TimelineRows } from '../shared/TimelineRows';
import { LogTable } from '../shared/LogTable';
import { DayDetail } from '../shared/DayDetail';
import type {
  RosterMatrixResponse,
  EmployeeMonthResponse,
  MatrixDayCell,
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

const GLYPH_STYLE_MAP: Record<string, { bg: string; text: string; border: string }> = {
  '✓': { bg: 'bg-teal-50 hover:bg-teal-100', text: 'text-teal-800 font-bold', border: 'border-teal-200' },
  '½': { bg: 'bg-amber-50 hover:bg-amber-100', text: 'text-amber-800 font-bold', border: 'border-amber-200' },
  '×': { bg: 'bg-red-50 hover:bg-red-100', text: 'text-red-700 font-bold', border: 'border-red-200' },
  L: { bg: 'bg-emerald-50 hover:bg-emerald-100', text: 'text-emerald-800 font-bold', border: 'border-emerald-200' },
  LOP: { bg: 'bg-orange-50 hover:bg-orange-100', text: 'text-orange-800 font-bold', border: 'border-orange-200' },
  H: { bg: 'bg-purple-50 hover:bg-purple-100', text: 'text-purple-800 font-bold', border: 'border-purple-200' },
  W: { bg: 'bg-slate-100 hover:bg-slate-200', text: 'text-slate-500 font-bold', border: 'border-slate-200' },
};

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
  const [activeTab, setActiveTab] = useState<'calendar' | 'timeline' | 'log'>('calendar');

  const handleCellClick = (dateStr: string) => {
    setModalDate(dateStr);
    setIsModalOpen(true);
  };

  // -------------------------------------------------------------
  // 1. EMPLOYEE DETAIL VIEW (Roster Matrix Style: Left Profile/Stats + Right 3 Tabs)
  // -------------------------------------------------------------
  if (isDetailView && employeeMonthData) {
    const { employee, month, workingDays, attendancePct, payableDays, totalWorkedHours, stats, leaveBalances, days } = employeeMonthData;
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
            {/* Profile Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={employee.fullName} size="lg" className="w-14 h-14 ring-2 ring-teal-500/20" />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 truncate">{employee.fullName}</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-mono font-semibold">
                      {employee.employeeCode}
                    </span>
                    <span className="text-xs text-slate-500 truncate">{employee.departmentName}</span>
                  </div>
                  <span className="text-xs text-slate-400 block mt-0.5">{employee.designation}</span>
                </div>
              </div>

              {/* Vertical Stat List */}
              <div className="border-t border-slate-100 pt-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Total Worked Hours</span>
                  <span className="font-bold text-slate-900 font-mono">{totalWorkedHours} hrs</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Payable Days</span>
                  <span className="font-bold text-teal-800 font-mono">
                    {payableDays} / {days.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Attendance Rate</span>
                  <span className="font-bold text-emerald-700 font-mono">{attendancePct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Present / Absent</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {stats.presentDays}P • {stats.absentDays}A
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Late Marks</span>
                  <span className="font-semibold text-amber-700 font-mono">{stats.lateMarks}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Average Check-in</span>
                  <span className="font-semibold text-slate-700 font-mono">{stats.avgCheckInTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Overtime Logged</span>
                  <span className="font-semibold text-sky-700 font-mono">+{stats.overtimeHours}h</span>
                </div>
              </div>

              {/* Leave Balance Bars */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Leave Balances
                </h4>

                {/* Casual Leave */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600 font-medium">Casual Leave (CL)</span>
                    <span className="text-slate-500 font-mono">
                      {leaveBalances.casual.remaining} / {leaveBalances.casual.total} left
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${(leaveBalances.casual.remaining / leaveBalances.casual.total) * 100}%` }}
                      className="h-full bg-teal-500 rounded-full"
                    />
                  </div>
                </div>

                {/* Sick Leave */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600 font-medium">Sick Leave (SL)</span>
                    <span className="text-slate-500 font-mono">
                      {leaveBalances.sick.remaining} / {leaveBalances.sick.total} left
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${(leaveBalances.sick.remaining / leaveBalances.sick.total) * 100}%` }}
                      className="h-full bg-amber-500 rounded-full"
                    />
                  </div>
                </div>

                {/* Earned Leave */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600 font-medium">Earned Leave (EL)</span>
                    <span className="text-slate-500 font-mono">
                      {leaveBalances.earned.remaining} / {leaveBalances.earned.total} left
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${(leaveBalances.earned.remaining / leaveBalances.earned.total) * 100}%` }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 3 Tabs (Calendar | Timeline | Log) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Tab Buttons */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
                  activeTab === 'calendar'
                    ? 'bg-white text-teal-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
                  activeTab === 'timeline'
                    ? 'bg-white text-teal-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                Timeline Bars
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('log')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
                  activeTab === 'log'
                    ? 'bg-white text-teal-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <List className="w-3.5 h-3.5" />
                Daily Log Table
              </button>
            </div>

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
        {/* 4 KPI Tiles (Left, 7 cols) */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Present */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Present
              </span>
              <span className="text-2xl font-bold text-teal-800 font-mono mt-1 block">
                {kpis.presentCount}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-2">
              of {kpis.headcount} staff
            </span>
          </div>

          {/* Absent */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Absent
              </span>
              <span className="text-2xl font-bold text-red-600 font-mono mt-1 block">
                {kpis.absentCount}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-2">
              of {kpis.headcount} staff
            </span>
          </div>

          {/* On Leave */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                On Leave
              </span>
              <span className="text-2xl font-bold text-emerald-800 font-mono mt-1 block">
                {kpis.leaveCount}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-2">
              of {kpis.headcount} staff
            </span>
          </div>

          {/* Late Arrivals */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Late Arrivals
              </span>
              <span className="text-2xl font-bold text-amber-600 font-mono mt-1 block">
                {kpis.lateCount}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-2">
              of {kpis.headcount} staff
            </span>
          </div>
        </div>

        {/* Department Leaderboard Card (Right, 5 cols) */}
        <div className="lg:col-span-5">
          {matrixData && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3 h-full flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4 text-teal-600" />
                  Department Leaderboard
                </div>
                <span className="text-[11px] text-slate-400">Sorted by rate</span>
              </div>

              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                {matrixData.departmentLeaderboard.map((dept, rank) => {
                  const isSelected = selectedDeptId === dept.departmentId;
                  return (
                    <button
                      key={dept.departmentId}
                      type="button"
                      onClick={() => onSelectDept(isSelected ? undefined : dept.departmentId)}
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
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Roster Matrix • {matrixData?.month}
            </h3>
            <span className="text-[11px] text-slate-400">
              Columns = days 1..{matrixData?.daysInMonth || 31} • Click any cell for day details
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
            <span>✓ Present</span>
            <span>½ Half Day</span>
            <span>× Absent</span>
            <span>L Leave</span>
            <span>H Holiday</span>
            <span>W Weekend</span>
          </div>
        </div>

        {/* Sticky Container */}
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin">
          <table className="text-left text-xs border-collapse">
            {/* Header row (sticky top) */}
            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
              <tr>
                {/* Sticky Name column */}
                <th className="py-2.5 px-3 min-w-[200px] sticky left-0 bg-slate-100 z-30 font-bold text-slate-700 border-r border-slate-200">
                  Staff Member
                </th>
                <th className="py-2.5 px-2 text-center min-w-[50px] font-bold text-slate-700 border-r border-slate-200">
                  Month %
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
                        isSelectedCol ? 'bg-teal-200 font-bold ring-2 ring-teal-500 z-10' : '',
                      )}
                      title={`${hdr.date}: ${hdr.isHoliday ? hdr.holidayName : hdr.isWeekend ? 'Weekend' : 'Workday'}`}
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
                      {grp.departmentName} ({grp.employees.length} staff)
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
                        const glyphStyle = GLYPH_STYLE_MAP[cell.glyph] || {
                          bg: 'bg-white',
                          text: 'text-slate-400',
                          border: 'border-slate-100',
                        };

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
                                handleCellClick(cell.date);
                              }}
                              title={`${emp.fullName} • ${cell.date}: ${cell.status}${cell.inTime ? ` (${cell.inTime})` : ''}`}
                              aria-label={`${emp.fullName}, ${cell.date}: ${cell.status}`}
                              className={cn(
                                'w-7 h-7 rounded flex items-center justify-center text-xs transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500 hover:scale-110 shadow-2xs',
                                glyphStyle.bg,
                                glyphStyle.text,
                                isSelectedCol && 'ring-1 ring-teal-600 font-black',
                              )}
                            >
                              {cell.glyph}
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

      {/* Centered Modal for Day Detail */}
      {modalDate && (
        <DayDetail
          displayMode="modal"
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          dayRecord={
            // Construct temporary day record for modal preview from matrix if not in employee detail view
            employeeMonthData?.days.find((d) => d.date === modalDate) || {
              date: modalDate,
              day: parseInt(modalDate.slice(8, 10), 10),
              weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${modalDate}T00:00:00.000Z`).getUTCDay()],
              status: 'PRESENT',
              glyph: '✓',
              firstCheckInAt: `${modalDate}T04:03:00.000Z`,
              lastCheckOutAt: `${modalDate}T13:00:00.000Z`,
              workedMinutes: 537,
              workedHours: 8.9,
              lateMinutes: 0,
              overtimeMinutes: 57,
              isLate: false,
              source: 'Biometric Scanner',
              shift: {
                name: 'General Day Shift (09:30 AM - 06:30 PM)',
                startTime: '09:30 AM',
                endTime: '06:30 PM',
                graceMinutes: 15,
                standardMinutes: 480,
                breakMinutes: 60,
              },
              punches: [
                { id: 'p1', punchAt: `${modalDate}T04:03:00.000Z`, punchType: 'IN', source: 'BIOMETRIC' },
                { id: 'p2', punchAt: `${modalDate}T07:30:00.000Z`, punchType: 'OUT', source: 'BIOMETRIC' },
                { id: 'p3', punchAt: `${modalDate}T08:30:00.000Z`, punchType: 'IN', source: 'BIOMETRIC' },
                { id: 'p4', punchAt: `${modalDate}T13:00:00.000Z`, punchType: 'OUT', source: 'BIOMETRIC' },
              ],
            }
          }
          onPrevDay={() => {
            const d = new Date(`${modalDate}T00:00:00.000Z`);
            d.setUTCDate(d.getUTCDate() - 1);
            setModalDate(d.toISOString().slice(0, 10));
          }}
          onNextDay={() => {
            const d = new Date(`${modalDate}T00:00:00.000Z`);
            d.setUTCDate(d.getUTCDate() + 1);
            setModalDate(d.toISOString().slice(0, 10));
          }}
          onRegularize={onRegularize}
          onEditPunches={onEditPunches}
        />
      )}
    </div>
  );
};
