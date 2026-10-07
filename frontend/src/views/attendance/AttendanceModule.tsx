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
    title: 'Command Center',
    shortDesc: 'Hero rings, department cards & real-time staff status table',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    id: 'boards',
    title: 'Department Boards',
    shortDesc: 'Donut cards, 7-day sparklines & employee cards with 14-day trends',
    icon: <LayoutGrid className="w-4 h-4" />,
  },
  {
    id: 'matrix',
    title: 'Roster Matrix',
    shortDesc: 'Monthly matrix grouped by department, status glyphs & timelines',
    icon: <Grid3X3 className="w-4 h-4" />,
  },
];

export const AttendanceModule: React.FC = () => {
  const { setCurrentView, setSelectedEmployeeId, selectedEmployeeId } = usePayroll();

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
    const fromUrlEmp = getInitialParam('employeeId', '');
    const targetEmp = fromUrlEmp || selectedEmployeeId || null;
    if (targetEmp && targetEmp !== activeEmployeeId) {
      setActiveEmployeeId(targetEmp);
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

  // Opening an employee brings their month from COSEC; a change reloads it.
  const cosecRefresh = useCosecRefresh(activeEmployeeId, monthStr, () => setRefreshTrigger((c) => c + 1));

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
      setBannerMessage(`Month ${monthStr} successfully initialized with default ${bulkStatus}.`);
      setRefreshTrigger((c) => c + 1);
      setTimeout(() => setBannerMessage(null), 4000);
    } catch (err: any) {
      alert(`Bulk initialization error: ${err?.message || 'Failed'}`);
    } finally {
      setIsBulking(false);
    }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      {/* ------------------------------------------------------------- */}
      {/* 1. SHARED HEADER & ACTIONS                                     */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#2B293E] pb-4">
        <div>
          {/* Breadcrumbs */}
          {activeEmployeeId ? (
            <>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveEmployeeId(null);
                  setSelectedEmployeeId(null);
                }}
                className="hover:text-teal-700 dark:hover:text-teal-400 font-medium flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Attendance
              </button>
              <span>›</span>
              <span>{employeeMonthData?.employee.departmentName || 'Department'}</span>
              <span>›</span>
              <span className="font-bold text-slate-800 dark:text-white">{employeeMonthData?.employee.fullName}</span>
            </div>
            <CosecRefreshNote state={cosecRefresh} />
            </>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Attendance & Shifts
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-mint-100 dark:bg-emerald-950/70 text-[#0E5A47] dark:text-emerald-300 border border-teal-200 dark:border-emerald-800/60 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                Live PostgreSQL
              </span>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unified staff attendance, biometric punch reconciliation, loss-of-pay tracking, and monthly rosters
          </p>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTrigger((c) => c + 1)}
            title="Refresh attendance records"
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBulkModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <CalendarDays className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            Bulk Mark Month
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setCurrentView('clock-in')}
            className="flex items-center gap-1.5 shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5" />
            Clock In / Record Time
          </Button>
        </div>
      </div>

      {/* Success banner if any */}
      {bannerMessage && (
        <div className="p-3 bg-mint-100 dark:bg-emerald-950/60 border border-teal-200 dark:border-emerald-800/60 rounded-lg text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. LAYOUT SWITCHER (Segmented Tablist with Descriptions)        */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white dark:bg-[#181724] rounded-xl border border-slate-200 dark:border-[#2B293E] p-2 shadow-2xs">
        <div
          role="tablist"
          aria-label="Attendance Layout Styles"
          className="grid grid-cols-1 md:grid-cols-3 gap-2"
        >
          {LAYOUT_OPTIONS.map((opt) => {
            const isActive = activeLayout === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveLayout(opt.id)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500',
                  isActive
                    ? 'bg-gradient-to-r from-teal-50 to-teal-50/40 dark:from-teal-950/50 dark:to-teal-950/30 border-teal-500 shadow-2xs'
                    : 'bg-white dark:bg-[#181724] border-transparent hover:bg-slate-50 dark:hover:bg-[#1E1D2D] hover:border-slate-200 dark:hover:border-[#2B293E]',
                )}
              >
                <span
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    isActive ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-[#252336] text-slate-500 dark:text-slate-400',
                  )}
                >
                  {opt.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-bold', isActive ? 'text-teal-900 dark:text-teal-200' : 'text-slate-800 dark:text-slate-200')}>
                      {opt.title}
                    </span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-ping" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {opt.shortDesc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. DATE BAR & STATUS LEGEND                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white dark:bg-[#181724] rounded-xl border border-slate-200 dark:border-[#2B293E] p-3.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Date Stepper & Picker */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#15141F] p-0.5">
            <button
              type="button"
              onClick={handlePrevDay}
              title="Previous Day"
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-[#181724] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="bg-transparent border-0 text-xs font-mono font-semibold text-slate-800 dark:text-white px-2 py-1 focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              onClick={handleNextDay}
              title="Next Day"
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-[#181724] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Formatted Date & Quick Today */}
          <span className="text-xs font-bold text-slate-800 dark:text-white hidden sm:inline">
            {formattedSelectedDate}
          </span>
          <button
            type="button"
            onClick={() => setSelectedDate(getTodayStr())}
            className="text-[11px] px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 font-semibold transition-colors cursor-pointer"
          >
            Today (Live)
          </button>
        </div>

        {/* Status Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
            <span>Present (✓)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span>Half Day (½)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span>Absent (×)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Leave (L)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span>Holiday (H)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span>Weekly Off (W)</span>
          </div>
        </div>
      </div>

      {/* Slim Non-Working Banner if selected date is Holiday or Weekly Off */}
      {dateSpecial.isOff && (
        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span className="font-semibold">
              {dateSpecial.isHoliday
                ? `Official Public Holiday: ${dateSpecial.holidayName || 'National Holiday'}`
                : 'Scheduled Weekly Off (Sunday)'}
            </span>
            <span className="text-purple-600 hidden sm:inline">
              — Standard paid non-working day under Indian payroll regulations (no divide-by-zero).
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-mono font-bold">
            Attendance Rate: –
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. SHARED FILTERS (Search & Department Chips)                  */}
      {/* ------------------------------------------------------------- */}
      {!activeEmployeeId && (
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by staff name, employee code, or role..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Department Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
            <button
              type="button"
              onClick={() => setSelectedDeptId(undefined)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer flex-shrink-0',
                !selectedDeptId
                  ? 'bg-teal-600 text-white font-semibold shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              All Departments
            </button>

            {summaryData?.departments.map((d) => (
              <button
                key={d.departmentId}
                type="button"
                onClick={() => setSelectedDeptId(selectedDeptId === d.departmentId ? undefined : d.departmentId)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer flex-shrink-0 flex items-center gap-1.5',
                  selectedDeptId === d.departmentId
                    ? 'bg-teal-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                <span>{d.departmentName}</span>
                <span className={cn('text-[10px] px-1 rounded-full font-mono', selectedDeptId === d.departmentId ? 'bg-teal-700 text-teal-100' : 'bg-slate-200 text-slate-500')}>
                  {d.headcount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. ACTIVE LAYOUT PRESENTATION (Command Center | Boards | Matrix) */}
      {/* ------------------------------------------------------------- */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between gap-3">
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
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsBulkModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl p-6 sm:w-full sm:max-w-md space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Bulk Mark Month • {monthStr}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Initialize standard working days for all staff across this month with a baseline attendance status.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Default Attendance Status
                </label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as AttendanceStatus)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="PRESENT">Present (Full Day Attended)</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="PAID_LEAVE">Paid Leave</option>
                  <option value="ABSENT">Absent (Unapproved)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setIsBulkModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBulkMarkMonth}
                  disabled={isBulking}
                >
                  {isBulking ? 'Applying...' : 'Apply Baseline Attendance'}
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
