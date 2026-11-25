import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CosecRefreshNote, useCosecRefresh } from './CosecRefresh';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogIn,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Layers,
  LayoutGrid,
  Grid3X3,
  SlidersHorizontal,
  X,
  Building,
  Info,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { usePayroll } from '../../context/PayrollContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import {
  attendanceApi,
  DepartmentSummaryResponse,
  EmployeeDayItem,
  RosterMatrixResponse,
  EmployeeMonthResponse,
  EmployeeYearResponse,
  AttendanceStatus,
} from '../../api/attendance.api';
import { StatusPill } from './shared/StatusPill';
import { CommandCenterLayout } from './layouts/CommandCenterLayout';
import { DepartmentBoardsLayout } from './layouts/DepartmentBoardsLayout';
import { RosterMatrixLayout } from './layouts/RosterMatrixLayout';
import { RegularizeModal } from './modals/RegularizeModal';

export type AttendanceLayoutType = 'command' | 'boards' | 'matrix';

interface LayoutOption {
  id: AttendanceLayoutType;
  title: string;
  shortDesc: string;
  icon: React.ReactNode;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'command',
    title: 'Today',
    shortDesc: 'Who is in, late or absent on the chosen day',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    id: 'boards',
    title: 'By department',
    shortDesc: 'Each department’s attendance and recent trend',
    icon: <LayoutGrid className="w-4 h-4" />,
  },
  {
    id: 'matrix',
    title: 'Monthly roster',
    shortDesc: 'Every employee’s month at a glance',
    icon: <Grid3X3 className="w-4 h-4" />,
  },
];

const LEGEND = [
  { dot: 'bg-teal-500', label: 'Present', glyph: '✓' },
  { dot: 'bg-amber-400', label: 'Half day', glyph: '½' },
  { dot: 'bg-red-400', label: 'Absent', glyph: '×' },
  { dot: 'bg-emerald-500', label: 'Leave', glyph: 'L' },
  { dot: 'bg-purple-400', label: 'Holiday', glyph: 'H' },
  { dot: 'bg-slate-300', label: 'Weekly off', glyph: 'W' },
];

export const AttendanceModule: React.FC = () => {
  const { setCurrentView, setSelectedEmployeeId, selectedEmployeeId } = usePayroll();
  const { can } = useAuth();
  const canRecord = can('attendance.create');
  const canBulkMark = can('attendance.adjust');
  const [bulkError, setBulkError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 1. URL Query Parameter & LocalStorage Sync
  // -------------------------------------------------------------
  const getInitialParam = (key: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const params = new URLSearchParams(window.location.search);
    return params.get(key) || fallback;
  };

  const [activeLayout, setActiveLayout] = useState<AttendanceLayoutType>(() => {
    const fromUrl = getInitialParam('layout', '');
    if (fromUrl === 'command' || fromUrl === 'boards' || fromUrl === 'matrix') {
      return fromUrl;
    }
    const saved = localStorage.getItem('rnd_attendance_layout_preference') as AttendanceLayoutType;
    if (saved === 'command' || saved === 'boards' || saved === 'matrix') {
      return saved;
    }
    return 'command';
  });

  const getTodayStr = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Target Date (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const fromUrl = getInitialParam('date', '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromUrl)) return fromUrl;
    return getTodayStr();
  });

  // Selected Department Filter
  const [selectedDeptId, setSelectedDeptId] = useState<string | undefined>(() => {
    const fromUrl = getInitialParam('dept', '');
    return fromUrl || undefined;
  });

  // Search Filter
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return getInitialParam('search', '');
  });

  // Selected Employee (for Employee Detail view)
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(() => {
    const fromUrl = getInitialParam('employeeId', '');
    return fromUrl || selectedEmployeeId || null;
  });

  // Sync state when navigating from EmployeeDetailView or query parameters
  useEffect(() => {
    const fromUrlDate = getInitialParam('date', '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromUrlDate) && fromUrlDate !== selectedDate) {
      setSelectedDate(fromUrlDate);
    }
    // Only an employee opened from elsewhere (e.g. Employee detail). The URL's employeeId is read
    // once at mount; re-reading it here would reopen the employee just closed, before the URL updates.
    if (selectedEmployeeId && selectedEmployeeId !== activeEmployeeId) {
      setActiveEmployeeId(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  // Update URL whenever layout, date, dept, search, or employee changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('layout', activeLayout);
    params.set('date', selectedDate);
    if (selectedDeptId) params.set('dept', selectedDeptId);
    else params.delete('dept');

    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    else params.delete('search');

    if (activeEmployeeId) params.set('employeeId', activeEmployeeId);
    else params.delete('employeeId');

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);

    // Persist layout preference
    localStorage.setItem('rnd_attendance_layout_preference', activeLayout);
  }, [activeLayout, selectedDate, selectedDeptId, searchQuery, activeEmployeeId]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const l = params.get('layout') as AttendanceLayoutType;
      if (l === 'command' || l === 'boards' || l === 'matrix') setActiveLayout(l);

      const d = params.get('date');
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setSelectedDate(d);

      setSelectedDeptId(params.get('dept') || undefined);
      setSearchQuery(params.get('search') || '');
      setActiveEmployeeId(params.get('employeeId') || null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // -------------------------------------------------------------
  // 2. Data State & Fetching (Shared across all 3 layouts)
  // -------------------------------------------------------------
  const [summaryData, setSummaryData] = useState<DepartmentSummaryResponse | null>(null);
  const [employeeDayList, setEmployeeDayList] = useState<EmployeeDayItem[]>([]);
  const [matrixData, setMatrixData] = useState<RosterMatrixResponse | null>(null);
  const [employeeMonthData, setEmployeeMonthData] = useState<EmployeeMonthResponse | null>(null);
  const [employeeYearData, setEmployeeYearData] = useState<EmployeeYearResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Bulk Mark Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>('PRESENT');
  const [isBulking, setIsBulking] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Regularize Modal State
  const [isRegularizeModalOpen, setIsRegularizeModalOpen] = useState(false);
  const [regularizeTargetDate, setRegularizeTargetDate] = useState<string>(selectedDate);

  const handleOpenRegularize = (dateStr: string) => {
    setRegularizeTargetDate(dateStr);
    setIsRegularizeModalOpen(true);
  };

  const handleRegularizeSuccess = () => {
    setBannerMessage(`Attendance for ${regularizeTargetDate} successfully regularized.`);
    setRefreshTrigger((c) => c + 1);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const monthStr = selectedDate.slice(0, 7); // e.g. "2026-10"

  // Fetch Dashboard Data (Department summary, Day list, Roster matrix)
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sumRes, listRes, matrixRes] = await Promise.all([
        attendanceApi.getDepartmentSummary(selectedDate),
        attendanceApi.getEmployeeDayList({
          date: selectedDate,
          departmentId: selectedDeptId,
          search: searchQuery,
          limit: 100,
        }),
        attendanceApi.getRosterMatrix({
          month: monthStr,
          departmentId: selectedDeptId,
          search: searchQuery,
          selectedDate,
        }),
      ]);

      setSummaryData(sumRes);
      setEmployeeDayList(listRes.items || []);
      setMatrixData(matrixRes);
    } catch (err: any) {
      console.error('Failed to load attendance dashboard data:', err);
      setError(err?.message || 'Could not fetch attendance records from PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, selectedDeptId, searchQuery, monthStr, refreshTrigger]);

  // Fetch Employee Detail Data (Month records + Year at a glance)
  const fetchEmployeeDetailData = useCallback(async () => {
    if (!activeEmployeeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const targetYear = parseInt(selectedDate.slice(0, 4), 10);
      const [monthRes, yearRes] = await Promise.all([
        attendanceApi.getEmployeeMonth(activeEmployeeId, monthStr),
        attendanceApi.getEmployeeYear(activeEmployeeId, targetYear),
      ]);
      setEmployeeMonthData(monthRes);
      setEmployeeYearData(yearRes);
    } catch (err: any) {
      console.error('Failed to load employee attendance detail:', err);
      setError(err?.message || 'Could not fetch employee attendance record.');
    } finally {
      setIsLoading(false);
    }
  }, [activeEmployeeId, monthStr, selectedDate, refreshTrigger]);

  // Opening the page brings everyone's month from COSEC, and opening an employee brings theirs; a change reloads it.
  const cosecRefresh = useCosecRefresh(activeEmployeeId ?? 'ALL', monthStr, () => setRefreshTrigger((c) => c + 1));

  useEffect(() => {
    if (activeEmployeeId) {
      fetchEmployeeDetailData();
    } else {
      fetchDashboardData();
    }
  }, [activeEmployeeId, fetchDashboardData, fetchEmployeeDetailData]);

  // Date Stepper Functions (Prev Day / Next Day)
  const handlePrevDay = () => {
    const d = new Date(`${selectedDate}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(`${selectedDate}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // Date formatting for human-friendly title e.g. "Thursday, 15 October 2026"
  const formattedSelectedDate = useMemo(() => {
    const d = new Date(`${selectedDate}T00:00:00.000Z`);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [selectedDate]);

  const todayStr = getTodayStr();
  const isToday = selectedDate === todayStr;
  const monthLabel = new Date(`${monthStr}-01T00:00:00.000Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Esc closes the bulk dialog
  useEffect(() => {
    if (!isBulkModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isBulking) setIsBulkModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isBulkModalOpen, isBulking]);

  // Check if selected date is weekly off or holiday
  const dateSpecial = useMemo(() => {
    const d = new Date(`${selectedDate}T00:00:00.000Z`);
    const isSun = d.getUTCDay() === 0;
    const isHol = summaryData?.isHoliday;
    const holName = summaryData?.holidayName;

    return {
      isOff: isSun || isHol,
      isWeeklyOff: isSun,
      isHoliday: isHol,
      holidayName: holName,
    };
  }, [selectedDate, summaryData]);

  // Bulk mark month action
  const handleBulkMarkMonth = async () => {
    setIsBulking(true);
    try {
      await attendanceApi.bulkMark({
        month: monthStr,
        defaultStatus: bulkStatus,
      });
      setIsBulkModalOpen(false);
      setBannerMessage(`Working days in ${monthLabel} without a record were marked ${bulkStatus.replace('_', ' ').toLowerCase()}.`);
      setRefreshTrigger((c) => c + 1);
      setTimeout(() => setBannerMessage(null), 4000);
    } catch (err: unknown) {
      setBulkError(err instanceof Error && err.message ? err.message : 'Could not mark the month. Nothing was changed; try again.');
    } finally {
      setIsBulking(false);
    }
  };

  const employeeName = employeeMonthData?.employee.fullName;
  const closeEmployee = () => {
    setActiveEmployeeId(null);
    setSelectedEmployeeId(null);
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* 1. HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          {activeEmployeeId ? (
            <nav aria-label="Breadcrumb" className="mb-1">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <li>
                  <button type="button" onClick={closeEmployee} className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Attendance
                  </button>
                </li>
                {employeeMonthData?.employee.departmentName && (
                  <><li aria-hidden="true">/</li><li>{employeeMonthData.employee.departmentName}</li></>
                )}
              </ol>
            </nav>
          ) : (
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-0.5">HRMS</p>
          )}
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight break-words">
            {activeEmployeeId ? employeeName || 'Employee attendance' : 'Attendance'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {activeEmployeeId
              ? `${employeeMonthData?.employee.employeeCode ? `${employeeMonthData.employee.employeeCode} · ` : ''}Month view, punches and corrections`
              : LAYOUT_OPTIONS.find((o) => o.id === activeLayout)?.shortDesc}
          </p>
          <div className="mt-1"><CosecRefreshNote state={cosecRefresh} /></div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTrigger((c) => c + 1)}
            disabled={isLoading}
            aria-label="Refresh attendance"
            title="Refresh attendance"
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canBulkMark && !activeEmployeeId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setBulkError(null); setIsBulkModalOpen(true); }}
              className="flex items-center gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
              Mark month
            </Button>
          )}
          {canRecord && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCurrentView('clock-in')}
              className="flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              Record punch
            </Button>
          )}
        </div>
      </div>

      {bannerMessage && (
        <div role="status" className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-sm text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1">{bannerMessage}</span>
          <button type="button" onClick={() => setBannerMessage(null)} aria-label="Dismiss" className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 2. TOOLBAR: view, date, search, departments */}
      <div className="bg-white dark:bg-[#181724] rounded-xl border border-slate-200 dark:border-[#2B293E] shadow-2xs divide-y divide-slate-100 dark:divide-[#2B293E]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-3">
          {/* View switcher */}
          {!activeEmployeeId && (
            <div role="tablist" aria-label="Attendance view" className="inline-flex w-full sm:w-auto rounded-lg bg-slate-100 dark:bg-[#15141F] p-1">
              {LAYOUT_OPTIONS.map((opt) => {
                const isActive = activeLayout === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    title={opt.shortDesc}
                    onClick={() => setActiveLayout(opt.id)}
                    className={cn(
                      'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                      isActive
                        ? 'bg-white dark:bg-[#252336] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
                    )}
                  >
                    <span aria-hidden="true" className={isActive ? 'text-teal-600 dark:text-teal-400' : ''}>{opt.icon}</span>
                    {opt.title}
                  </button>
                );
              })}
            </div>
          )}

          {/* Date stepper */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#15141F]">
              <button
                type="button"
                onClick={handlePrevDay}
                aria-label="Previous day"
                className="p-2 rounded-l-lg hover:bg-slate-50 dark:hover:bg-[#1E1D2D] text-slate-600 dark:text-slate-400 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <label className="sr-only" htmlFor="attendance-date">Date</label>
              <input
                id="attendance-date"
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="bg-transparent border-x border-slate-200 dark:border-[#2B293E] text-sm font-semibold text-slate-800 dark:text-white px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 cursor-pointer"
              />
              <button
                type="button"
                onClick={handleNextDay}
                disabled={selectedDate >= todayStr}
                aria-label="Next day"
                className="p-2 rounded-r-lg hover:bg-slate-50 dark:hover:bg-[#1E1D2D] text-slate-600 dark:text-slate-400 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 hidden md:inline">{formattedSelectedDate}</span>
            {isToday ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" aria-hidden="true" /> Today
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 font-semibold cursor-pointer"
              >
                Go to today
              </button>
            )}
          </div>
        </div>

        {!activeEmployeeId && (
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-3">
            <div className="relative flex-1 min-w-0 lg:max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, employee code or role"
                aria-label="Search employees"
                className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-[#15141F] rounded-lg border border-slate-200 dark:border-[#2B293E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div role="group" aria-label="Department" className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 min-w-0">
              {[{ departmentId: undefined as string | undefined, departmentName: 'All departments', headcount: summaryData?.departments.reduce((n, d) => n + d.headcount, 0) }, ...(summaryData?.departments ?? [])].map((d) => {
                const active = selectedDeptId === d.departmentId;
                return (
                  <button
                    key={d.departmentId ?? 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedDeptId(d.departmentId && selectedDeptId === d.departmentId ? undefined : d.departmentId)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 border focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                      active
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'bg-white dark:bg-[#15141F] border-slate-200 dark:border-[#2B293E] text-slate-600 dark:text-slate-300 hover:border-slate-300',
                    )}
                  >
                    {d.departmentName}
                    {d.headcount !== undefined && (
                      <span className={cn('tabular-nums', active ? 'text-teal-100' : 'text-slate-400')}>{d.headcount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <ul aria-label="Status key" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className={cn('w-2.5 h-2.5 rounded-full', item.dot)} aria-hidden="true" />
              {item.label} <span className="text-slate-400 font-mono" aria-hidden="true">{item.glyph}</span>
            </li>
          ))}
        </ul>
      </div>

      {dateSpecial.isOff && (
        <div role="note" className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 text-purple-900 dark:text-purple-200 flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 text-purple-600 flex-shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">
              {dateSpecial.isHoliday ? `Holiday: ${dateSpecial.holidayName || 'Public holiday'}` : 'Weekly off'}
            </span>
            <span className="text-purple-700 dark:text-purple-300"> — a paid non-working day, so no one is marked absent.</span>
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. ACTIVE LAYOUT PRESENTATION (Command Center | Boards | Matrix) */}
      {/* ------------------------------------------------------------- */}
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setRefreshTrigger((c) => c + 1)}
            className="px-3 py-1 rounded bg-red-100 hover:bg-red-200 font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Layout A: Command Center */}
      {activeLayout === 'command' && (
        <CommandCenterLayout
          summaryData={summaryData}
          employees={employeeDayList}
          selectedDeptId={selectedDeptId}
          onSelectDept={setSelectedDeptId}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onSelectEmployee={(empId) => {
            setActiveEmployeeId(empId);
            setSelectedEmployeeId(empId);
          }}
          isLoading={isLoading}
          isDetailView={Boolean(activeEmployeeId)}
          employeeMonthData={employeeMonthData}
          onRegularize={handleOpenRegularize}
          onEditPunches={(dateStr) => {
            setCurrentView('clock-in');
          }}
        />
      )}

      {/* Layout B: Department Boards */}
      {activeLayout === 'boards' && (
        <DepartmentBoardsLayout
          summaryData={summaryData}
          employees={employeeDayList}
          selectedDeptId={selectedDeptId}
          onSelectDept={setSelectedDeptId}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onSelectEmployee={(empId) => {
            setActiveEmployeeId(empId);
            setSelectedEmployeeId(empId);
          }}
          isLoading={isLoading}
          isDetailView={Boolean(activeEmployeeId)}
          employeeMonthData={employeeMonthData}
          employeeYearData={employeeYearData}
          onSelectMonth={(m) => {
            setSelectedDate(`${m}-15`);
          }}
          onRegularize={handleOpenRegularize}
          onEditPunches={(dateStr) => {
            setCurrentView('clock-in');
          }}
        />
      )}

      {/* Layout C: Roster Matrix */}
      {activeLayout === 'matrix' && (
        <RosterMatrixLayout
          matrixData={matrixData}
          selectedDeptId={selectedDeptId}
          onSelectDept={setSelectedDeptId}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onSelectEmployee={(empId) => {
            setActiveEmployeeId(empId);
            setSelectedEmployeeId(empId);
          }}
          isLoading={isLoading}
          isDetailView={Boolean(activeEmployeeId)}
          employeeMonthData={employeeMonthData}
          onRegularize={handleOpenRegularize}
          onEditPunches={(dateStr) => {
            setCurrentView('clock-in');
          }}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. BULK MARK MONTH MODAL                                      */}
      {/* ------------------------------------------------------------- */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50" aria-hidden="true" onClick={() => !isBulking && setIsBulkModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="bulk-mark-title" aria-describedby="bulk-mark-desc" className="relative rounded-2xl bg-white dark:bg-[#181724] text-left shadow-2xl p-6 w-full sm:max-w-md space-y-4 border border-slate-200 dark:border-[#2B293E]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="bulk-mark-title" className="text-base font-bold text-slate-900 dark:text-white">Mark {monthLabel}</h2>
                  <p id="bulk-mark-desc" className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Fills every working day in {monthLabel} that has no attendance yet, for all employees. Days already recorded, synced from the device, or locked by payroll are left as they are.
                  </p>
                </div>
                <button type="button" onClick={() => setIsBulkModalOpen(false)} disabled={isBulking} aria-label="Close" className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="bulk-status" className="text-sm font-semibold text-slate-700 dark:text-slate-200 block">Mark those days as</label>
                <select
                  id="bulk-status"
                  autoFocus
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as AttendanceStatus)}
                  className="w-full text-sm p-2.5 rounded-lg border border-slate-300 dark:border-[#2B293E] dark:bg-[#15141F] focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="PRESENT">Present</option>
                  <option value="HALF_DAY">Half day</option>
                  <option value="PAID_LEAVE">Paid leave</option>
                  <option value="ABSENT">Absent (loss of pay)</option>
                </select>
              </div>

              {bulkError && (
                <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{bulkError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#2B293E]">
                <Button variant="outline" size="sm" onClick={() => setIsBulkModalOpen(false)} disabled={isBulking}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleBulkMarkMonth} disabled={isBulking}>
                  {isBulking ? 'Marking…' : `Mark ${monthLabel}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. REGULARIZE MODAL */}
      {isRegularizeModalOpen && (
        <RegularizeModal
          isOpen={isRegularizeModalOpen}
          onClose={() => setIsRegularizeModalOpen(false)}
          onSuccess={handleRegularizeSuccess}
          employeeId={activeEmployeeId || selectedEmployeeId || employeeDayList[0]?.employeeId || ''}
          employeeName={
            employeeMonthData?.employee?.fullName ||
            employeeDayList.find((e) => e.employeeId === (activeEmployeeId || selectedEmployeeId))?.fullName
          }
          employeeCode={
            employeeMonthData?.employee?.employeeCode ||
            employeeDayList.find((e) => e.employeeId === (activeEmployeeId || selectedEmployeeId))?.employeeCode
          }
          departmentName={
            employeeMonthData?.employee?.departmentName ||
            employeeDayList.find((e) => e.employeeId === (activeEmployeeId || selectedEmployeeId))?.departmentName
          }
          dateStr={regularizeTargetDate}
          dayRecord={
            employeeMonthData?.days?.find((d) => d.date === regularizeTargetDate) || null
          }
        />
      )}
    </div>
  );
};
