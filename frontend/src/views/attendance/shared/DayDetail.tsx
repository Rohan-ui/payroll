import React, { useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  ShieldCheck,
  FileText,
  Building,
  Info,
  Layers,
  LogIn,
  LogOut,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { StatusPill } from './StatusPill';
import { PunchTimeline } from './PunchTimeline';
import { getAttendancePunches, getPunchSessions } from './punches';
import { formatShiftClock, shiftClockToHours, shiftDisplayName } from './shift';
import type { EmployeeMonthDayRecord } from '../../../api/attendance.api';

export interface DayDetailProps {
  dayRecord: EmployeeMonthDayRecord | null;
  displayMode: 'panel' | 'drawer' | 'modal';
  isOpen?: boolean;
  onClose?: () => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  onRegularize?: (date: string) => void;
  onEditPunches?: (date: string) => void;
  employeeName?: string;
  employeeCode?: string;
  className?: string;
}

export const DayDetail: React.FC<DayDetailProps> = ({
  dayRecord,
  displayMode,
  isOpen = true,
  onClose,
  onPrevDay,
  onNextDay,
  onRegularize,
  onEditPunches,
  employeeName,
  employeeCode,
  className,
}) => {
  // Handle escape key to close drawer/modal
  useEffect(() => {
    if (displayMode === 'panel' || !isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayMode, isOpen, onClose]);

  if (!dayRecord) {
    if (displayMode === 'panel') {
      return (
        <div className={cn('bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400', className)}>
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-medium">Select any date on the calendar to view full day details</p>
        </div>
      );
    }
    return null;
  }

  if ((displayMode === 'drawer' || displayMode === 'modal') && !isOpen) {
    return null;
  }

  // Format date readable e.g. "Monday, 19 October 2026"
  const dateObj = new Date(`${dayRecord.date}T00:00:00.000Z`);
  const formattedFullDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const isPresentOrHalf = dayRecord.status === 'PRESENT' || dayRecord.status === 'HALF_DAY';
  const isAbsent = dayRecord.status === 'ABSENT';
  const isPaidLeave = dayRecord.status === 'PAID_LEAVE' || dayRecord.status === 'UNPAID_LEAVE';
  const isHolidayOrOff = dayRecord.status === 'HOLIDAY' || dayRecord.status === 'WEEKEND';

  const requiredMinutes = dayRecord.shift?.standardMinutes || 480;
  const workedMinutes = dayRecord.workedMinutes || 0;
  const progressPct = Math.min(100, Math.round((workedMinutes / requiredMinutes) * 100));

  // 24-Hour Bar: scheduled shift window from the API (cross-midnight shifts clipped at end of day)
  const shiftStartText = formatShiftClock(dayRecord.shift?.startTime);
  const shiftEndText = formatShiftClock(dayRecord.shift?.endTime);
  const shiftStartHour = shiftClockToHours(dayRecord.shift?.startTime);
  const shiftEndHour = shiftClockToHours(dayRecord.shift?.endTime);
  const shiftWindow =
    shiftStartHour !== null && shiftEndHour !== null
      ? {
          leftPct: (shiftStartHour / 24) * 100,
          widthPct: (((shiftEndHour > shiftStartHour ? shiftEndHour : 24) - shiftStartHour) / 24) * 100,
        }
      : null;

  // Helper to get decimal hour in Asia/Kolkata timezone (e.g. 8.5 for 08:30 AM)
  const getKolkataHour = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const totalMinutes = (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
    return totalMinutes / 60;
  };

  const punches = getAttendancePunches(dayRecord.punches);
  const sessions = getPunchSessions(punches);

  // Worked segments: one per completed IN→OUT session; without punches, first check-in → last check-out
  const segmentBounds: Array<{ from?: string | null; to?: string | null }> = punches.length > 0
    ? sessions.filter((s) => s.in && s.out).map((s) => ({ from: s.in?.punchAt, to: s.out?.punchAt }))
    : [{ from: dayRecord.firstCheckInAt, to: dayRecord.lastCheckOutAt }];
  const workedSegments = segmentBounds.flatMap(({ from, to }) => {
    const inHour = getKolkataHour(from);
    const outHour = getKolkataHour(to);
    if (inHour === null || outHour === null) return [];
    const endHour = outHour >= inHour ? outHour : 24; // cross-midnight: clip at end of day
    return [{ leftPct: (inHour / 24) * 100, widthPct: Math.max(0.5, ((endHour - inHour) / 24) * 100) }];
  });

  // Last punch is an IN with no recorded check-out: session still open
  const hasOpenSession = punches.length > 0 && punches[punches.length - 1].direction === 'IN' && !dayRecord.lastCheckOutAt;
  const todayKolkata = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const openSessionText = dayRecord.date === todayKolkata ? 'Currently inside' : 'Missing check-out punch';

  // Format time in Asia/Kolkata
  const formatTimeDisplay = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const formattedInTime = formatTimeDisplay(dayRecord.firstCheckInAt);
  const formattedOutTime = formatTimeDisplay(dayRecord.lastCheckOutAt);

  let grossElapsedText = '—';
  if (dayRecord.firstCheckInAt && dayRecord.lastCheckOutAt) {
    const diffMs = new Date(dayRecord.lastCheckOutAt).getTime() - new Date(dayRecord.firstCheckInAt).getTime();
    if (diffMs > 0) {
      const grossMins = Math.round(diffMs / 60000);
      const gh = Math.floor(grossMins / 60);
      const gm = grossMins % 60;
      grossElapsedText = `${gh}h ${gm}m`;
    }
  }

  // Inner Day Detail Content
  const content = (
    <div className="flex flex-col h-full bg-white text-slate-800">
      {/* Top Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex items-start justify-between gap-3 bg-slate-50/70">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {dayRecord.weekday} • Day {dayRecord.day}
            </span>
            <StatusPill status={dayRecord.status} size="sm" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
            {formattedFullDate}
          </h3>
          {(employeeName || employeeCode) && (
            <p className="text-xs text-slate-600 font-medium">
              {employeeName} {employeeCode ? `(${employeeCode})` : ''}
            </p>
          )}
        </div>

        {/* Stepper + Close */}
        <div className="flex items-center gap-1">
          {onPrevDay && (
            <button
              type="button"
              onClick={onPrevDay}
              title="Previous Day"
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {onNextDay && (
            <button
              type="button"
              onClick={onNextDay}
              title="Next Day"
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {displayMode !== 'panel' && onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-1.5 ml-1 rounded-lg border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {/* PRESENT / HALF DAY STATE */}
        {isPresentOrHalf && (
          <>
            {/* Worked vs Required Time */}
            <div className="p-4 rounded-xl border border-teal-100 bg-teal-50/30 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-teal-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-teal-600" />
                  Worked vs Net Required Time
                </span>
                <span className="text-teal-800 font-mono">
                  {dayRecord.workedHours} hrs / {(requiredMinutes / 60).toFixed(1)} hrs ({progressPct}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-teal-100/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Badges / Tags */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {dayRecord.isLate ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                    <AlertTriangle className="w-3 h-3" />
                    Late by {dayRecord.lateMinutes} min
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-mint-100 text-emerald-800 border border-teal-200">
                    <CheckCircle2 className="w-3 h-3 text-teal-600" />
                    On Time Check-in
                  </span>
                )}

                {dayRecord.overtimeMinutes > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                    +{(dayRecord.overtimeMinutes / 60).toFixed(1)}h Overtime
                  </span>
                )}

                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  Source: {dayRecord.source || 'Biometric'}
                </span>
              </div>
            </div>

            {/* In-Time and Out-Time Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs">
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <LogIn className="w-3.5 h-3.5 text-teal-600" />
                  First Check-In
                </span>
                <p className="text-sm font-bold font-mono text-slate-800">
                  {formattedInTime}
                </p>
                <span className="text-[10px] text-slate-500 block">
                  Shift start: {shiftStartText}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  Last Check-Out
                </span>
                <p className="text-sm font-bold font-mono text-slate-800">
                  {formattedOutTime}
                </p>
                {hasOpenSession && (
                  <span className="text-[10px] font-semibold text-amber-700 block">{openSessionText}</span>
                )}
                <span className="text-[10px] text-slate-500 block">
                  Shift end: {shiftEndText}
                </span>
              </div>

              <div className="space-y-1 col-span-2 sm:col-span-1 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-3">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Gross Duration
                </span>
                <p className="text-sm font-bold font-mono text-slate-800">
                  {grossElapsedText}
                </p>
                <span className="text-[10px] text-teal-700 font-medium block">
                  Net worked: {dayRecord.workedHours} hrs
                </span>
              </div>
            </div>

            {/* 24-Hour Bar Showing Shift Window & Worked Segments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  24-Hour Timeline Visualizer
                </span>
                <span className="text-[11px] text-slate-400">00:00 to 24:00</span>
              </div>

              <div className="relative h-8 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                {/* 24-hour hour tick markers */}
                <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="w-px h-full bg-slate-400" />
                  ))}
                </div>

                {/* Scheduled Shift Window */}
                {shiftWindow && (
                  <div
                    className="absolute top-1 bottom-1 bg-slate-200/80 rounded border border-slate-300 pointer-events-none"
                    style={{ left: `${shiftWindow.leftPct}%`, width: `${shiftWindow.widthPct}%` }}
                    title={`Scheduled shift window (${shiftStartText} – ${shiftEndText})`}
                  />
                )}

                {/* Actual Worked Segments */}
                {workedSegments.map((seg, i) => (
                  <div
                    key={i}
                    className="absolute top-1.5 bottom-1.5 bg-teal-500 rounded shadow-xs transition-all"
                    style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                <span>12 AM</span>
                <span>6 AM</span>
                <span className="font-medium text-teal-700">{shiftStartText} (Shift In)</span>
                <span className="font-medium text-slate-600">{shiftEndText} (Out)</span>
                <span>12 AM</span>
              </div>
            </div>

            {/* Vertical Punch Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Daily Punch Log
              </h4>
              <PunchTimeline punches={punches} />
            </div>

            {/* Shift Details Card */}
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                <span>Assigned Shift Configuration</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>
                  <span className="text-slate-400 block text-[11px]">Shift</span>
                  <span className="font-medium text-slate-700">{shiftDisplayName(dayRecord.shift)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Standard Hours</span>
                  <span className="font-medium text-slate-700">
                    {shiftStartText} – {shiftEndText}
                  </span>
                </div>
                {/* Grace/break come from the configured shift, not the device shift */}
                {!dayRecord.shift?.scheduledCode && (
                  <>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Grace In Period</span>
                      <span className="font-medium text-slate-700">
                        {dayRecord.shift?.graceMinutes} minutes
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Break Length</span>
                      <span className="font-medium text-slate-700">
                        {dayRecord.shift?.breakMinutes} minutes (Lunch)
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ABSENT STATE */}
        {isAbsent && (
          <div className="p-5 rounded-xl border border-red-200 bg-red-50/40 space-y-4 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto ring-4 ring-red-50">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-red-900">No Punches Recorded</h4>
              <p className="text-xs text-red-700 max-w-sm mx-auto">
                No biometric punches or online check-in timestamps were detected for this scheduled working day.
              </p>
            </div>

            {/* Actions for absent day */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onRegularize?.(dayRecord.date)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Regularize Attendance
              </button>
              <button
                type="button"
                onClick={() => onEditPunches?.(dayRecord.date)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-300 hover:bg-white text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Mark Paid Leave
              </button>
            </div>
          </div>
        )}

        {/* PAID LEAVE / UNPAID LEAVE STATE */}
        {isPaidLeave && (
          <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
            <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Official Leave Record</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Leave Category</span>
                <span className="font-semibold text-slate-800">
                  {dayRecord.leaveType || (dayRecord.status === 'PAID_LEAVE' ? 'Earned Leave (EL)' : 'Unpaid / LOP')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Approval Status</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <ShieldCheck className="w-3.5 h-3.5" /> Approved
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Payable Weight</span>
                <span className="font-semibold text-slate-800">
                  {dayRecord.status === 'PAID_LEAVE' ? '1.0 Day (Full Pay)' : '0.0 Day (LOP)'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Approver</span>
                <span className="font-medium text-slate-700">HR Administrator</span>
              </div>
            </div>
          </div>
        )}

        {/* HOLIDAY / WEEKLY OFF STATE */}
        {isHolidayOrOff && (
          <div className="p-5 rounded-xl border border-purple-200 bg-purple-50/40 space-y-2">
            <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
              <Info className="w-4 h-4 text-purple-600" />
              <span>
                {dayRecord.status === 'HOLIDAY'
                  ? dayRecord.holidayName || 'Public Holiday'
                  : 'Scheduled Weekly Off'}
              </span>
            </div>
            <p className="text-xs text-purple-700">
              This date is configured as a non-working company calendar day and is counted as a payable day under standard salary regulations.
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onRegularize?.(dayRecord.date)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            Regularize
          </button>
          <button
            type="button"
            onClick={() => onEditPunches?.(dayRecord.date)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Record / Punches
          </button>
        </div>
      </div>
    </div>
  );

  // 1. SIDE PANEL MODE (Layout A)
  if (displayMode === 'panel') {
    return (
      <div className={cn('bg-white rounded-xl border border-slate-200 shadow-xs sticky top-4 overflow-hidden', className)}>
        {content}
      </div>
    );
  }

  // 2. SLIDE-OVER DRAWER MODE (Layout B)
  if (displayMode === 'drawer') {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Day Detail Drawer">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Drawer panel */}
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <div className="w-screen max-w-md bg-white shadow-2xl transition-transform animate-in slide-in-from-right duration-300 flex flex-col">
            {content}
          </div>
        </div>
      </div>
    );
  }

  // 3. CENTERED MODAL MODE (Layout C)
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Day Detail Modal">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered dialog container */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg animate-in zoom-in-95 duration-200">
          {content}
        </div>
      </div>
    </div>
  );
};
