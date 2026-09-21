import React from 'react';
import { Users, TrendingUp, AlertCircle, ArrowUpRight, Check, X, ShieldAlert } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { DepartmentCardData, TrendDay } from '../../../api/attendance.api';

interface DepartmentWidgetProps {
  variant: 'ring' | 'donut' | 'leaderboard';
  data: {
    overall?: {
      headcount: number;
      presentCount: number;
      absentCount: number;
      halfDayCount: number;
      leaveCount: number;
      lateCount: number;
      attendancePct: number | null;
      trend7Days: TrendDay[];
    };
    departments: DepartmentCardData[];
  };
  selectedDeptId?: string;
  onSelectDept?: (deptId: string | undefined) => void;
  className?: string;
}

export const DepartmentWidget: React.FC<DepartmentWidgetProps> = ({
  variant,
  data,
  selectedDeptId,
  onSelectDept,
  className,
}) => {
  const { overall, departments = [] } = data;

  // VARIANT A: RING (Layout A Command Center top row)
  if (variant === 'ring') {
    const overallPct = overall?.attendancePct ?? 0;
    const isOff = overall?.attendancePct === null;
    const isOverallSelected = !selectedDeptId;

    return (
      <div className={cn('flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-thin', className)}>
        {/* All Departments Hero Card */}
        <button
          type="button"
          onClick={() => onSelectDept?.(undefined)}
          className={cn(
            'min-w-[280px] p-4 rounded-xl border transition-all text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
            isOverallSelected
              ? 'bg-gradient-to-br from-teal-900 to-teal-800 text-white border-teal-700 shadow-md ring-2 ring-teal-500'
              : 'bg-white text-slate-800 border-slate-200 hover:border-teal-300 hover:shadow-xs',
          )}
        >
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn('text-xs font-bold uppercase tracking-wider', isOverallSelected ? 'text-teal-200' : 'text-teal-700')}>
                All Departments
              </span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-mono', isOverallSelected ? 'bg-teal-700/60 text-teal-100' : 'bg-teal-50 text-teal-800 border border-teal-200')}>
                {overall?.headcount ?? 0} staff
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs pt-1">
              <div>
                <span className={cn('text-[11px] block', isOverallSelected ? 'text-teal-200' : 'text-slate-400')}>Present</span>
                <span className="font-bold text-sm">{overall?.presentCount ?? 0}</span>
              </div>
              <div>
                <span className={cn('text-[11px] block', isOverallSelected ? 'text-teal-200' : 'text-slate-400')}>On Leave</span>
                <span className="font-bold text-sm">{overall?.leaveCount ?? 0}</span>
              </div>
              <div>
                <span className={cn('text-[11px] block', isOverallSelected ? 'text-teal-200' : 'text-slate-400')}>Absent</span>
                <span className="font-bold text-sm text-red-300">{overall?.absentCount ?? 0}</span>
              </div>
              <div>
                <span className={cn('text-[11px] block', isOverallSelected ? 'text-teal-200' : 'text-slate-400')}>Late</span>
                <span className="font-bold text-sm text-amber-300">{overall?.lateCount ?? 0}</span>
              </div>
            </div>
          </div>

          {/* SVG Progress Ring */}
          <div className="relative flex-shrink-0 w-16 h-16 flex items-center justify-center">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path
                className={isOverallSelected ? 'text-teal-950/40' : 'text-slate-100'}
                stroke="currentColor"
                strokeWidth="3.5"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={isOverallSelected ? 'text-teal-300' : 'text-teal-600'}
                stroke="currentColor"
                strokeWidth="3.5"
                strokeDasharray={`${isOff ? 0 : overallPct}, 100`}
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold leading-none">
                {isOff ? '–' : `${overallPct}%`}
              </span>
              <span className={cn('text-[9px] uppercase tracking-tighter mt-0.5', isOverallSelected ? 'text-teal-200' : 'text-slate-400')}>
                Attended
              </span>
            </div>
          </div>
        </button>

        {/* Individual Department Cards */}
        {departments.map((dept) => {
          const isSelected = selectedDeptId === dept.departmentId;
          const deptPct = dept.attendancePct;
          const isDeptOff = deptPct === null;

          return (
            <button
              key={dept.departmentId}
              type="button"
              onClick={() => onSelectDept?.(isSelected ? undefined : dept.departmentId)}
              className={cn(
                'min-w-[240px] p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
                isSelected
                  ? 'bg-teal-50/70 border-teal-500 shadow-sm ring-2 ring-teal-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs',
              )}
            >
              <div className="flex items-start justify-between gap-2 w-full mb-2">
                <div className="truncate">
                  <h4 className="text-xs font-bold text-slate-800 truncate" title={dept.departmentName}>
                    {dept.departmentName}
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {dept.headcount} {dept.headcount === 1 ? 'member' : 'members'}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-md font-mono',
                    isDeptOff
                      ? 'bg-slate-100 text-slate-500'
                      : (deptPct ?? 0) >= 75
                      ? 'bg-mint-100 text-emerald-800'
                      : (deptPct ?? 0) >= 50
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800',
                  )}
                >
                  {isDeptOff ? '–' : `${deptPct}%`}
                </span>
              </div>

              {/* Stacked Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-100 flex overflow-hidden mb-2">
                {dept.presentPct > 0 && <div style={{ width: `${dept.presentPct}%` }} className="bg-teal-500" title={`Present: ${dept.presentCount}`} />}
                {dept.halfDayPct > 0 && <div style={{ width: `${dept.halfDayPct}%` }} className="bg-amber-400" title={`Half Day: ${dept.halfDayCount}`} />}
                {dept.leavePct > 0 && <div style={{ width: `${dept.leavePct}%` }} className="bg-emerald-500" title={`Leave: ${dept.leaveCount}`} />}
                {dept.absentPct > 0 && <div style={{ width: `${dept.absentPct}%` }} className="bg-red-400" title={`Absent: ${dept.absentCount}`} />}
              </div>

              {/* Counts legend */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span title="Present" className="flex items-center gap-1 text-teal-700 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  {dept.presentCount}
                </span>
                <span title="Leave" className="flex items-center gap-1 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {dept.leaveCount}
                </span>
                <span title="Absent" className="flex items-center gap-1 text-red-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {dept.absentCount}
                </span>
                {dept.lateCount > 0 && (
                  <span title="Late" className="flex items-center gap-1 text-amber-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {dept.lateCount}L
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // VARIANT B: DONUT (Layout B Department Boards top row with 7-day trend sparklines)
  if (variant === 'donut') {
    const renderCard = (
      id: string | undefined,
      title: string,
      headcount: number,
      pct: number | null,
      present: number,
      half: number,
      leave: number,
      absent: number,
      trend: TrendDay[],
      isSelected: boolean,
    ) => {
      const isOff = pct === null;

      return (
        <button
          key={id || 'all'}
          type="button"
          onClick={() => onSelectDept?.(isSelected ? undefined : id)}
          className={cn(
            'min-w-[260px] p-4 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
            isSelected
              ? 'bg-teal-50/50 border-teal-500 shadow-md ring-2 ring-teal-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs',
          )}
        >
          {/* Card Title */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="truncate">
              <h4 className="text-xs font-bold text-slate-800 truncate" title={title}>
                {title}
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">
                {headcount} staff
              </span>
            </div>
            {isSelected && (
              <span className="w-2 h-2 rounded-full bg-teal-600 ring-4 ring-teal-100" />
            )}
          </div>

          {/* Donut and Counts */}
          <div className="flex items-center justify-between gap-3 mb-3">
            {/* Donut graphic */}
            <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#F1F5F9" strokeWidth="4" />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#2FB898"
                  strokeWidth="4"
                  strokeDasharray={`${isOff ? 0 : (pct ?? 0) * 0.88}, 88`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-slate-800">
                  {isOff ? '–' : `${pct}%`}
                </span>
              </div>
            </div>

            {/* Legend counts */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-teal-800 font-medium">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                <span>{present} Pres</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-800 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>{half} Half</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{leave} Leave</span>
              </div>
              <div className="flex items-center gap-1.5 text-red-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span>{absent} Abs</span>
              </div>
            </div>
          </div>

          {/* 7-Day Mini Trend Sparkline */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>7-Day Trend</span>
              <span className="font-semibold text-slate-600">Today</span>
            </div>
            <div className="flex items-end justify-between gap-1 h-6">
              {trend.map((t, idx) => {
                const isSelectedDay = idx === trend.length - 1;
                const barPct = t.attendancePct === null ? 10 : Math.max(10, t.attendancePct);
                return (
                  <div key={t.date} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      style={{ height: `${barPct}%` }}
                      className={cn(
                        'w-full rounded-xs transition-all',
                        t.isOff
                          ? 'bg-slate-200'
                          : isSelectedDay
                          ? 'bg-teal-600 ring-1 ring-teal-700'
                          : 'bg-teal-300 hover:bg-teal-400',
                      )}
                      title={`${t.dayName} (${t.date}): ${t.isOff ? 'Off / Holiday' : `${t.attendancePct}%`}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </button>
      );
    };

    return (
      <div className={cn('flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-thin', className)}>
        {/* All Departments Donut */}
        {renderCard(
          undefined,
          'All Departments',
          overall?.headcount ?? 0,
          overall?.attendancePct ?? null,
          overall?.presentCount ?? 0,
          overall?.halfDayCount ?? 0,
          overall?.leaveCount ?? 0,
          overall?.absentCount ?? 0,
          overall?.trend7Days ?? [],
          !selectedDeptId,
        )}

        {/* Per Department Donut */}
        {departments.map((d) =>
          renderCard(
            d.departmentId,
            d.departmentName,
            d.headcount,
            d.attendancePct,
            d.presentCount,
            d.halfDayCount,
            d.leaveCount,
            d.absentCount,
            d.trend7Days,
            selectedDeptId === d.departmentId,
          ),
        )}
      </div>
    );
  }

  // VARIANT C: LEADERBOARD (Layout C Roster Matrix top section)
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-teal-600" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Department Attendance Leaderboard
          </h4>
        </div>
        <span className="text-[11px] text-slate-400">Click to filter matrix</span>
      </div>

      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
        {departments.map((dept, rank) => {
          const isSelected = selectedDeptId === dept.departmentId;
          const isOff = dept.attendancePct === null;

          return (
            <button
              key={dept.departmentId}
              type="button"
              onClick={() => onSelectDept?.(isSelected ? undefined : dept.departmentId)}
              className={cn(
                'w-full p-2 rounded-lg border transition-all flex items-center justify-between gap-3 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500',
                isSelected
                  ? 'bg-teal-50 border-teal-400 font-semibold shadow-2xs'
                  : 'bg-slate-50/50 border-slate-100 hover:bg-slate-100/60',
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                    rank === 0
                      ? 'bg-amber-100 text-amber-800'
                      : rank === 1
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {rank + 1}
                </span>
                <div className="truncate flex-1 min-w-0">
                  <div className="text-xs text-slate-800 truncate font-medium">{dept.departmentName}</div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 flex overflow-hidden mt-1">
                    <div style={{ width: `${dept.presentPct}%` }} className="bg-teal-500" />
                    <div style={{ width: `${dept.halfDayPct}%` }} className="bg-amber-400" />
                    <div style={{ width: `${dept.leavePct}%` }} className="bg-emerald-500" />
                    <div style={{ width: `${dept.absentPct}%` }} className="bg-red-400" />
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span className="text-xs font-bold text-slate-900 font-mono">
                  {isOff ? '–' : `${dept.attendancePct}%`}
                </span>
                <span className="text-[10px] text-slate-400 block">{dept.headcount} staff</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
