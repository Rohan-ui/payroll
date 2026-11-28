import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronRight, Plus, Trash2, Save, AlertCircle, Laptop, Coffee, Lock } from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Combobox } from '../components/ui/Combobox';
import { toast } from '../lib/toast';
import { attendanceApi, BackendShift, AttendanceStatus } from '../api/attendance.api';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; desc: string; badge: BadgeVariant }[] = [
  { value: 'PRESENT', label: 'Present', desc: 'Worked the day', badge: 'success' },
  { value: 'HALF_DAY', label: 'Half day', desc: 'Half a day is paid', badge: 'warning' },
  { value: 'PAID_LEAVE', label: 'Paid leave', desc: 'Approved, paid', badge: 'info' },
  { value: 'UNPAID_LEAVE', label: 'Unpaid leave', desc: 'Loss of pay', badge: 'danger' },
  { value: 'ABSENT', label: 'Absent', desc: 'Not paid', badge: 'danger' },
  { value: 'HOLIDAY', label: 'Holiday', desc: 'Public holiday', badge: 'purple' },
  { value: 'WEEKEND', label: 'Week off', desc: 'Scheduled day off', badge: 'neutral' },
];

/** Only these statuses have times worked; for the rest no punches are saved. */
const WORKING_STATUSES: AttendanceStatus[] = ['PRESENT', 'HALF_DAY'];

const REMOTE_LOCATIONS = ['Home (WFH)', 'Client Site', 'Coworking Space', 'Business Travel'];
const BREAK_PRESETS = [0, 15, 30, 45, 60];
const OVERTIME_PRESETS = [0, 30, 60, 120];
/** Less than this many worked minutes on a "present" day pays half a day. */
const HALF_DAY_THRESHOLD_MINUTES = 270;
const DEFAULT_PAYABLE_DAY_MINUTES = 480;

export interface ClockSession {
  id: string;
  clockIn: string; // HH:MM
  clockOut: string; // HH:MM
  hasClockOut: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
const nowHhmm = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Shift times arrive as "09:30:00" or as a time-of-day ISO string; both carry HH:MM. */
export const shiftHhmm = (raw: string | undefined): string => raw?.match(/(\d{2}):(\d{2})/)?.[0] ?? '';
/** Punches are stored with the wall-clock time in the UTC slot, so read them back the same way. */
const punchHhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
/** 24h "HH:MM" as "9:30 AM" for reading; the inputs keep the 24h value. */
const displayTime = (hhmm: string) => {
  if (!hhmm) return '--:--';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

export interface DaySummary {
  sessionMinutes: number;
  gapMinutes: number;
  workedMinutes: number;
  payableDays: number;
  firstIn: string;
  lastOut: string;
  lateByMinutes: number;
  earlyExitMinutes: number;
}

/**
 * Worked time is the sum of the sessions minus any extra unpaid break. Overtime is saved as its own
 * field, so it is not added to worked time. Late and early exit are measured against the shift, after grace.
 */
export function summariseDay(
  sessions: ClockSession[],
  extraBreakMinutes: number,
  status: AttendanceStatus,
  shift: Pick<BackendShift, 'start_time' | 'end_time' | 'grace_in_minutes' | 'grace_out_minutes'> | null,
): DaySummary {
  const sorted = [...sessions].filter((s) => s.clockIn).sort((a, b) => toMinutes(a.clockIn) - toMinutes(b.clockIn));
  let sessionMinutes = 0;
  let gapMinutes = 0;
  sorted.forEach((s, i) => {
    const inM = toMinutes(s.clockIn);
    const outM = s.hasClockOut && s.clockOut ? toMinutes(s.clockOut) : null;
    if (outM !== null && outM > inM) sessionMinutes += outM - inM;
    const next = sorted[i + 1];
    if (next && outM !== null && toMinutes(next.clockIn) > outM) gapMinutes += toMinutes(next.clockIn) - outM;
  });
  const workedMinutes = Math.max(0, sessionMinutes - extraBreakMinutes);

  let payableDays = 1;
  if (status === 'ABSENT' || status === 'UNPAID_LEAVE') payableDays = 0;
  else if (status === 'HALF_DAY' || (status === 'PRESENT' && sessionMinutes > 0 && workedMinutes < HALF_DAY_THRESHOLD_MINUTES)) payableDays = 0.5;

  const firstIn = sorted[0]?.clockIn ?? '';
  const closed = sorted.filter((s) => s.hasClockOut && s.clockOut);
  const lastOut = closed.length ? closed.map((s) => s.clockOut).sort()[closed.length - 1] : '';

  const start = shiftHhmm(shift?.start_time);
  const end = shiftHhmm(shift?.end_time);
  const lateBy = firstIn && start ? toMinutes(firstIn) - toMinutes(start) : 0;
  const earlyBy = lastOut && end && toMinutes(end) > toMinutes(start) ? toMinutes(end) - toMinutes(lastOut) : 0;
  return {
    sessionMinutes,
    gapMinutes,
    workedMinutes,
    payableDays,
    firstIn,
    lastOut,
    lateByMinutes: lateBy > (shift?.grace_in_minutes ?? 0) ? lateBy : 0,
    earlyExitMinutes: earlyBy > (shift?.grace_out_minutes ?? 0) ? earlyBy : 0,
  };
}

const inputClass =
  'w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed';
const labelClass = 'block text-xs font-semibold text-slate-700 mb-1';
const chipClass = (isOn: boolean) =>
  `min-h-8 px-2.5 rounded-md text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
    isOn ? 'bg-teal-50 text-teal-800 border-teal-300' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
  }`;

const SectionHeading: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
    <div>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
    {action}
  </div>
);

export const ClockInView: React.FC = () => {
  const { employees, selectedEmployeeId, setSelectedEmployeeId, setCurrentView, refreshData } = usePayroll();
  const { can } = useAuth();
  const canAdjust = can('attendance.adjust');

  const [empId, setEmpId] = useState<string>(() =>
    selectedEmployeeId && employees.some((e) => e.id === selectedEmployeeId) ? selectedEmployeeId : employees[0]?.id || '',
  );
  const currentEmp = useMemo(() => employees.find((e) => e.id === empId), [employees, empId]);
  const [empQuery, setEmpQuery] = useState(() => currentEmp?.name ?? '');

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);
  const [attendanceDate, setAttendanceDate] = useState<string>(todayIso);

  const [shifts, setShifts] = useState<BackendShift[]>([]);
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const activeShift = useMemo(() => shifts.find((s) => s.id === selectedShiftId) || shifts[0] || null, [shifts, selectedShiftId]);
  const shiftRef = useRef(activeShift);
  shiftRef.current = activeShift;

  const [status, setStatus] = useState<AttendanceStatus>('PRESENT');
  const [sessions, setSessions] = useState<ClockSession[]>([]);
  const [extraBreakMinutes, setExtraBreakMinutes] = useState(0);
  const [overtimeMinutes, setOvertimeMinutes] = useState(0);
  const [isRemote, setIsRemote] = useState(false);
  const [remoteHours, setRemoteHours] = useState(8);
  const [remoteLocation, setRemoteLocation] = useState(REMOTE_LOCATIONS[0]);
  const [notes, setNotes] = useState('');

  const [hasExistingRecord, setHasExistingRecord] = useState(false);
  const [isCheckingRecord, setIsCheckingRecord] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const blankSession = (): ClockSession => ({
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    clockIn: shiftHhmm(shiftRef.current?.start_time),
    clockOut: shiftHhmm(shiftRef.current?.end_time),
    hasClockOut: true,
  });

  useEffect(() => {
    attendanceApi
      .getShifts()
      .then((data) => {
        setShifts(data);
        if (data.length > 0) setSelectedShiftId(data[0].id);
      })
      .catch((err: unknown) => {
        console.error('Failed to load shifts:', err);
        setLoadError('Shifts could not be loaded, so late and early-exit checks are off.');
      })
      .finally(() => setShiftsLoaded(true));
  }, []);

  useEffect(() => {
    if (empId) setSelectedEmployeeId(empId);
  }, [empId, setSelectedEmployeeId]);

  const loadRecord = useCallback(async () => {
    if (!empId || !attendanceDate || !shiftsLoaded) return;
    setIsCheckingRecord(true);
    setErrorMessage(null);
    // Start from a clean form so nothing carries over from the previous employee or day.
    setStatus('PRESENT');
    setExtraBreakMinutes(0);
    setOvertimeMinutes(0);
    setIsRemote(false);
    setNotes('');
    try {
      const res = await attendanceApi.getRecords({ employeeId: empId, startDate: attendanceDate, endDate: attendanceDate, limit: 1 });
      const rec = res.items?.[0];
      setHasExistingRecord(Boolean(rec));
      if (!rec) {
        setSessions([blankSession()]);
        return;
      }
      setStatus(rec.attendance_status);
      setOvertimeMinutes(rec.overtime_minutes || 0);
      setIsRemote(rec.source === 'REMOTE');

      const punches = [...(rec.rndtechnosoft_attendance_punches || [])].sort(
        (a, b) => new Date(a.punch_at).getTime() - new Date(b.punch_at).getTime(),
      );
      const rebuilt: ClockSession[] = [];
      let openIn: string | null = null;
      punches.forEach((p, i) => {
        if (p.punch_type === 'IN') openIn = punchHhmm(p.punch_at);
        else if (openIn) {
          rebuilt.push({ id: `session-saved-${i}`, clockIn: openIn, clockOut: punchHhmm(p.punch_at), hasClockOut: true });
          openIn = null;
        }
      });
      if (openIn) rebuilt.push({ id: 'session-saved-open', clockIn: openIn, clockOut: '', hasClockOut: false });
      if (!rebuilt.length && rec.first_check_in_at) {
        rebuilt.push({
          id: 'session-saved-0',
          clockIn: punchHhmm(rec.first_check_in_at),
          clockOut: rec.last_check_out_at ? punchHhmm(rec.last_check_out_at) : '',
          hasClockOut: Boolean(rec.last_check_out_at),
        });
      }
      setSessions(rebuilt.length ? rebuilt : [blankSession()]);
    } catch (err: unknown) {
      console.error('Failed to load attendance record:', err);
      setHasExistingRecord(false);
      setSessions([blankSession()]);
      setErrorMessage('The saved record for this day could not be loaded. Saving now may replace it, so try again first.');
    } finally {
      setIsCheckingRecord(false);
    }
    // blankSession reads the shift through a ref, so it is not a dependency.
  }, [empId, attendanceDate, shiftsLoaded]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  const isWorkingDay = WORKING_STATUSES.includes(status);
  const summary = useMemo(
    () => summariseDay(isWorkingDay ? sessions : [], isWorkingDay ? extraBreakMinutes : 0, status, activeShift),
    [sessions, extraBreakMinutes, status, activeShift, isWorkingDay],
  );

  const updateSession = (id: string, updates: Partial<ClockSession>) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  const addSession = () =>
    setSessions((prev) => {
      const last = prev[prev.length - 1];
      if (!last?.hasClockOut || !last.clockOut) return [...prev, blankSession()];
      const start = Math.min(toMinutes(last.clockOut) + 60, 23 * 60);
      const end = Math.min(start + 4 * 60, 23 * 60 + 59);
      return [...prev, { ...blankSession(), clockIn: `${pad(Math.floor(start / 60))}:${pad(start % 60)}`, clockOut: `${pad(Math.floor(end / 60))}:${pad(end % 60)}` }];
    });
  const removeSession = (id: string) => setSessions((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));

  const validate = (): string | null => {
    if (!currentEmp) return 'Choose an employee first.';
    if (attendanceDate > todayIso) return 'Attendance can only be recorded for today or an earlier day.';
    if (!isWorkingDay) return null;
    for (const [i, s] of sessions.entries()) {
      if (!s.clockIn) return `Session ${i + 1} needs an in time.`;
      if (s.hasClockOut && !s.clockOut) return `Session ${i + 1} needs an out time, or tick "Still in".`;
      if (s.hasClockOut && toMinutes(s.clockOut) <= toMinutes(s.clockIn)) return `Session ${i + 1}: the out time must be after the in time.`;
    }
    if (sessions.filter((s) => !s.hasClockOut).length > 1) return 'Only one session can still be open.';
    return null;
  };

  const handleSave = async (recordAnother: boolean) => {
    const problem = validate();
    if (problem || !currentEmp) {
      setErrorMessage(problem);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const sorted = isWorkingDay ? [...sessions].sort((a, b) => toMinutes(a.clockIn) - toMinutes(b.clockIn)) : [];
      const at = (hhmm: string) => `${attendanceDate}T${hhmm}:00.000Z`;
      const tag = isRemote && isWorkingDay ? `[Remote: ${remoteLocation}, ${remoteHours}h] ` : '';
      const sessionNote = isWorkingDay ? `[${sorted.length} session${sorted.length === 1 ? '' : 's'} (${formatDuration(summary.workedMinutes)} worked)] ` : '';

      await attendanceApi.saveRecord({
        employeeId: currentEmp.id,
        attendanceDate,
        attendanceStatus: status,
        firstCheckInAt: summary.firstIn ? at(summary.firstIn) : undefined,
        lastCheckOutAt: summary.lastOut ? at(summary.lastOut) : undefined,
        workedMinutes: summary.workedMinutes,
        payableMinutes: Math.round(summary.payableDays * (activeShift?.standard_work_minutes || DEFAULT_PAYABLE_DAY_MINUTES)),
        breakMinutes: isWorkingDay ? summary.gapMinutes + extraBreakMinutes : 0,
        overtimeMinutes: isWorkingDay ? overtimeMinutes : 0,
        remoteMinutes: isRemote && isWorkingDay ? Math.round(remoteHours * 60) : 0,
        source: isRemote && isWorkingDay ? 'REMOTE' : 'MANUAL',
        shiftId: activeShift && activeShift.id !== 'default-general-shift' ? activeShift.id : undefined,
        notes: `${tag}${sessionNote}${notes.trim()}`.trim(),
        sessions: sorted.map((s) => ({ clockIn: at(s.clockIn), clockOut: s.hasClockOut && s.clockOut ? at(s.clockOut) : undefined })),
      });
      toast.success(`Attendance saved for ${currentEmp.name} on ${dateLabel}.`);
      await refreshData();
      if (recordAnother) void loadRecord();
      else setCurrentView('attendance');
    } catch (err: unknown) {
      console.error('Failed to save attendance record:', err);
      setErrorMessage(err instanceof Error && err.message ? err.message : 'The attendance could not be saved. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const employeeOptions = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    const matches = !q || q === currentEmp?.name.toLowerCase()
      ? employees
      : employees.filter((e) => [e.name, e.code, e.department].some((v) => v?.toLowerCase().includes(q)));
    return matches.slice(0, 50).map((e) => ({ id: e.id, label: e.name, hint: [e.code, e.department].filter(Boolean).join(' · ') }));
  }, [employees, empQuery, currentEmp]);

  const dateLabel = useMemo(() => {
    const [y, m, d] = attendanceDate.split('-').map(Number);
    if (!y || !m || !d) return attendanceDate;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }, [attendanceDate]);

  const shiftStart = shiftHhmm(activeShift?.start_time);
  const shiftEnd = shiftHhmm(activeShift?.end_time);
  const statusMeta = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];

  // Timeline spans the shift and every session, whichever is wider.
  const timeline = useMemo(() => {
    const points = [summary.firstIn, summary.lastOut, shiftStart, shiftEnd].filter(Boolean).map(toMinutes);
    if (points.length < 2) return null;
    const from = Math.min(...points);
    const to = Math.max(...points);
    if (to <= from) return null;
    const pct = (m: number) => ((m - from) / (to - from)) * 100;
    const bars = (isWorkingDay ? sessions : [])
      .filter((s) => s.clockIn && s.hasClockOut && s.clockOut && toMinutes(s.clockOut) > toMinutes(s.clockIn))
      .map((s) => ({ id: s.id, left: pct(toMinutes(s.clockIn)), width: pct(toMinutes(s.clockOut)) - pct(toMinutes(s.clockIn)) }));
    const shiftBand = shiftStart && shiftEnd && toMinutes(shiftEnd) > toMinutes(shiftStart)
      ? { left: pct(toMinutes(shiftStart)), width: pct(toMinutes(shiftEnd)) - pct(toMinutes(shiftStart)) }
      : null;
    const label = (m: number) => displayTime(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    return { bars, shiftBand, fromLabel: label(from), toLabel: label(to) };
  }, [summary.firstIn, summary.lastOut, shiftStart, shiftEnd, sessions, isWorkingDay]);

  const isBusy = isSaving || isCheckingRecord;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-xs text-slate-500">
            <li>
              <button type="button" onClick={() => setCurrentView('attendance')} className="font-medium text-teal-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
                Attendance
              </button>
            </li>
            <li aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li aria-current="page" className="text-slate-700">Record attendance</li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Record attendance</h1>
            <p className="text-sm text-slate-500 mt-1">Enter or correct one employee's day. It is saved as a manual entry.</p>
          </div>
          {!isCheckingRecord && currentEmp && (
            <Badge variant={hasExistingRecord ? 'warning' : 'neutral'} size="sm">
              {hasExistingRecord ? 'Editing the saved record' : 'New entry'}
            </Badge>
          )}
        </div>
      </header>

      {!canAdjust && (
        <div role="note" className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          You can look at this page, but saving needs the "Enter, edit or bulk-mark attendance" permission. Ask an administrator.
        </div>
      )}
      {loadError && <p role="status" className="text-xs text-amber-700">{loadError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-5">
          <Card padded>
            <SectionHeading title="Employee and day" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="clock-employee" className={labelClass}>Employee</label>
                <Combobox
                  id="clock-employee"
                  value={empQuery}
                  onInputChange={setEmpQuery}
                  options={employeeOptions}
                  onSelect={(o) => { setEmpId(o.id); setEmpQuery(o.label); }}
                  placeholder="Search by name, code or department"
                  emptyText="No employee matches"
                  className={inputClass}
                />
                {currentEmp && (
                  <p className="text-xs text-slate-500 mt-1">{[currentEmp.code, currentEmp.designation, currentEmp.department].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              <div>
                <label htmlFor="clock-date" className={labelClass}>Date</label>
                <input id="clock-date" type="date" max={todayIso} value={attendanceDate} onChange={(e) => e.target.value && setAttendanceDate(e.target.value)} className={inputClass} />
                <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                  <span>{dateLabel}</span>
                  {attendanceDate !== todayIso && (
                    <button type="button" onClick={() => setAttendanceDate(todayIso)} className="font-medium text-teal-700 hover:underline">Today</button>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="clock-shift" className={labelClass}>Shift</label>
                <select id="clock-shift" value={activeShift?.id ?? ''} onChange={(e) => setSelectedShiftId(e.target.value)} disabled={!shifts.length} className={inputClass}>
                  {!shifts.length && <option value="">{shiftsLoaded ? 'No shifts set up' : 'Loading shifts…'}</option>}
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>{s.shift_name}</option>
                  ))}
                </select>
                {activeShift && shiftStart && (
                  <p className="text-xs text-slate-500 mt-1">
                    {displayTime(shiftStart)} – {displayTime(shiftEnd)}
                    {activeShift.grace_in_minutes > 0 && ` · ${activeShift.grace_in_minutes} min grace`}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card padded>
            <SectionHeading title="Day status" hint="Decides how this day counts in payroll." />
            <div role="radiogroup" aria-label="Day status" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setStatus(opt.value)}
                    className={`p-2.5 rounded-lg border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                      isSelected ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 text-sm font-semibold ${isSelected ? 'text-teal-900' : 'text-slate-800'}`}>
                      <span aria-hidden="true" className={`w-3 h-3 rounded-full border ${isSelected ? 'border-teal-600 bg-teal-600 ring-2 ring-inset ring-white' : 'border-slate-300'}`} />
                      {opt.label}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5 pl-[18px]">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card padded>
            <SectionHeading
              title="Time worked"
              hint={isWorkingDay ? 'One row per in and out. Add a row for each time they left and came back.' : undefined}
              action={isWorkingDay ? (
                <Button variant="outline" size="sm" onClick={addSession} disabled={isBusy}>
                  <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Add session
                </Button>
              ) : undefined}
            />

            {!isWorkingDay ? (
              <p className="text-sm text-slate-500">No times are needed for {statusMeta.label.toLowerCase()}. Any times on this day are not saved.</p>
            ) : isCheckingRecord ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading saved times">
                <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
              </div>
            ) : (
              <div className="space-y-5">
                <ol className="space-y-2">
                  {sessions.map((session, idx) => {
                    const prev = sessions[idx - 1];
                    const gap = prev?.hasClockOut && prev.clockOut && session.clockIn ? toMinutes(session.clockIn) - toMinutes(prev.clockOut) : 0;
                    const duration = session.hasClockOut && session.clockOut && session.clockIn ? toMinutes(session.clockOut) - toMinutes(session.clockIn) : 0;
                    const n = idx + 1;
                    return (
                      <li key={session.id} className="space-y-2">
                        {gap > 0 && (
                          <p className="flex items-center gap-1.5 pl-2 text-xs text-amber-800">
                            <Coffee className="w-3.5 h-3.5" aria-hidden="true" /> {formatDuration(gap)} away between sessions (not counted as worked)
                          </p>
                        )}
                        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-700">
                              Session {n}
                              {duration > 0 && <span className="ml-2 font-normal text-slate-500">{formatDuration(duration)}</span>}
                              {!session.hasClockOut && <span className="ml-2 font-medium text-teal-700">Still in</span>}
                            </span>
                            {sessions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSession(session.id)}
                                aria-label={`Remove session ${n}`}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={`${session.id}-in`} className={labelClass}>In</label>
                              <div className="flex gap-2">
                                <input id={`${session.id}-in`} type="time" value={session.clockIn} onChange={(e) => updateSession(session.id, { clockIn: e.target.value })} className={inputClass} />
                                <button type="button" onClick={() => updateSession(session.id, { clockIn: nowHhmm() })} className={chipClass(false)}>Now</button>
                              </div>
                            </div>
                            <div>
                              <label htmlFor={`${session.id}-out`} className={labelClass}>Out</label>
                              <div className="flex gap-2">
                                <input id={`${session.id}-out`} type="time" value={session.clockOut} disabled={!session.hasClockOut} onChange={(e) => updateSession(session.id, { clockOut: e.target.value })} className={inputClass} />
                                <button type="button" disabled={!session.hasClockOut} onClick={() => updateSession(session.id, { clockOut: nowHhmm() })} className={`${chipClass(false)} disabled:opacity-50`}>Now</button>
                              </div>
                              <label className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                                <input type="checkbox" checked={!session.hasClockOut} onChange={(e) => updateSession(session.id, { hasClockOut: !e.target.checked })} className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500" />
                                Still in (no out time yet)
                              </label>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <label htmlFor="clock-break" className={labelClass}>Extra unpaid break (minutes)</label>
                    <input id="clock-break" type="number" inputMode="numeric" min={0} max={180} step={5} value={extraBreakMinutes}
                      onChange={(e) => setExtraBreakMinutes(Math.min(180, Math.max(0, parseInt(e.target.value, 10) || 0)))} className={inputClass} aria-describedby="clock-break-hint" />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {BREAK_PRESETS.map((m) => (
                        <button key={m} type="button" aria-pressed={extraBreakMinutes === m} onClick={() => setExtraBreakMinutes(m)} className={chipClass(extraBreakMinutes === m)}>{m === 0 ? 'None' : `${m}m`}</button>
                      ))}
                    </div>
                    <p id="clock-break-hint" className="text-xs text-slate-500 mt-1">Taken off worked time. Gaps between sessions are already left out.</p>
                  </div>
                  <div>
                    <label htmlFor="clock-ot" className={labelClass}>Overtime (minutes)</label>
                    <input id="clock-ot" type="number" inputMode="numeric" min={0} max={480} step={15} value={overtimeMinutes}
                      onChange={(e) => setOvertimeMinutes(Math.min(480, Math.max(0, parseInt(e.target.value, 10) || 0)))} className={inputClass} aria-describedby="clock-ot-hint" />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {OVERTIME_PRESETS.map((m) => (
                        <button key={m} type="button" aria-pressed={overtimeMinutes === m} onClick={() => setOvertimeMinutes(m)} className={chipClass(overtimeMinutes === m)}>{m === 0 ? 'None' : m < 60 ? `${m}m` : `${m / 60}h`}</button>
                      ))}
                    </div>
                    <p id="clock-ot-hint" className="text-xs text-slate-500 mt-1">Saved on its own, not added to worked time.</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer select-none">
                    <input type="checkbox" checked={isRemote} onChange={(e) => setIsRemote(e.target.checked)} className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500" />
                    <Laptop className="w-4 h-4 text-slate-500" aria-hidden="true" /> Worked remotely
                  </label>
                  {isRemote && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      <div>
                        <label htmlFor="clock-remote-where" className={labelClass}>Where</label>
                        <select id="clock-remote-where" value={remoteLocation} onChange={(e) => setRemoteLocation(e.target.value)} className={inputClass}>
                          {REMOTE_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="clock-remote-hours" className={labelClass}>Remote hours</label>
                        <input id="clock-remote-hours" type="number" inputMode="decimal" min={0.5} max={16} step={0.5} value={remoteHours}
                          onChange={(e) => setRemoteHours(Math.min(16, Math.max(0, parseFloat(e.target.value) || 0)))} className={inputClass} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card padded>
            <label htmlFor="clock-notes" className="block text-sm font-semibold text-slate-900">
              Reason <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <p id="clock-notes-hint" className="text-xs text-slate-500 mt-0.5 mb-3">Kept with the record so others can see why it was entered or changed.</p>
            <textarea id="clock-notes" rows={3} aria-describedby="clock-notes-hint" placeholder="For example: forgot to punch out, approved by the team lead" value={notes}
              onChange={(e) => setNotes(e.target.value)} className="w-full p-3 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" />
          </Card>

          {errorMessage && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <Button variant="ghost" onClick={() => setCurrentView('attendance')} disabled={isSaving}>Cancel</Button>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Button variant="outline" onClick={() => handleSave(true)} loading={isSaving} disabled={!canAdjust || isBusy || !currentEmp}>Save and add another</Button>
              <Button variant="primary" onClick={() => handleSave(false)} loading={isSaving} disabled={!canAdjust || isBusy || !currentEmp}>
                <Save className="w-4 h-4 mr-1.5" aria-hidden="true" /> Save attendance
              </Button>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-4 lg:sticky lg:top-6" aria-label="Summary">
          <Card padded className="space-y-4">
            {currentEmp ? (
              <div className="flex items-center gap-3">
                <Avatar name={currentEmp.name} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{currentEmp.name}</p>
                  <p className="text-xs text-slate-500 truncate">{dateLabel}</p>
                </div>
                <Badge variant={statusMeta.badge} size="sm" className="ml-auto shrink-0">{statusMeta.label}</Badge>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Choose an employee to see the summary.</p>
            )}

            {isWorkingDay && timeline && (
              <div>
                <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden" role="img"
                  aria-label={`Sessions from ${displayTime(summary.firstIn)} to ${displayTime(summary.lastOut)}${shiftStart ? `, shift ${displayTime(shiftStart)} to ${displayTime(shiftEnd)}` : ''}`}>
                  {timeline.shiftBand && (
                    <div className="absolute inset-y-0 bg-slate-200" style={{ left: `${timeline.shiftBand.left}%`, width: `${timeline.shiftBand.width}%` }} />
                  )}
                  {timeline.bars.map((b) => (
                    <div key={b.id} className="absolute inset-y-0.5 rounded-full bg-teal-500" style={{ left: `${b.left}%`, width: `${Math.max(b.width, 1)}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>{timeline.fromLabel}</span>
                  <span>{timeline.toLabel}</span>
                </div>
                <p className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-teal-500" aria-hidden="true" /> Worked</span>
                  {timeline.shiftBand && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200" aria-hidden="true" /> Shift</span>}
                </p>
              </div>
            )}

            <dl className="text-sm divide-y divide-slate-100 border-t border-slate-100">
              {isWorkingDay && (
                <>
                  <div className="flex justify-between py-2"><dt className="text-slate-600">In / out</dt><dd className="font-medium text-slate-900">{displayTime(summary.firstIn)} – {summary.lastOut ? displayTime(summary.lastOut) : 'still in'}</dd></div>
                  <div className="flex justify-between py-2"><dt className="text-slate-600">Time in sessions</dt><dd className="font-medium text-slate-900 tabular-nums">{formatDuration(summary.sessionMinutes)}</dd></div>
                  {extraBreakMinutes > 0 && (
                    <div className="flex justify-between py-2"><dt className="text-slate-600">Extra break</dt><dd className="font-medium text-amber-700 tabular-nums">−{formatDuration(extraBreakMinutes)}</dd></div>
                  )}
                  {summary.gapMinutes > 0 && (
                    <div className="flex justify-between py-2"><dt className="text-slate-600">Away between sessions</dt><dd className="text-slate-500 tabular-nums">{formatDuration(summary.gapMinutes)}</dd></div>
                  )}
                  <div className="flex justify-between py-2"><dt className="font-semibold text-slate-900">Worked</dt><dd className="font-semibold text-teal-700 tabular-nums">{formatDuration(summary.workedMinutes)}</dd></div>
                  {overtimeMinutes > 0 && (
                    <div className="flex justify-between py-2"><dt className="text-slate-600">Overtime</dt><dd className="font-medium text-slate-900 tabular-nums">{formatDuration(overtimeMinutes)}</dd></div>
                  )}
                  {isRemote && (
                    <div className="flex justify-between py-2"><dt className="text-slate-600">Remote</dt><dd className="font-medium text-slate-900">{remoteHours} h · {remoteLocation}</dd></div>
                  )}
                </>
              )}
              <div className="flex justify-between py-2">
                <dt className="text-slate-600">Paid as</dt>
                <dd className="font-semibold text-slate-900">{summary.payableDays === 1 ? 'Full day' : summary.payableDays === 0.5 ? 'Half day' : 'Not paid'}</dd>
              </div>
            </dl>

            {isWorkingDay && shiftStart && (summary.lateByMinutes > 0 || summary.earlyExitMinutes > 0) && (
              <ul className="space-y-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                {summary.lateByMinutes > 0 && <li>Came in {formatDuration(summary.lateByMinutes)} after the shift start</li>}
                {summary.earlyExitMinutes > 0 && <li>Left {formatDuration(summary.earlyExitMinutes)} before the shift end</li>}
              </ul>
            )}
            {isWorkingDay && status === 'PRESENT' && summary.payableDays === 0.5 && (
              <p className="text-xs text-slate-500">Paid as a half day because less than {HALF_DAY_THRESHOLD_MINUTES / 60} hours were worked.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
};
