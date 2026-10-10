import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Clock,
  LogIn,
  LogOut,
  Coffee,
  Laptop,
  CheckCircle2,
  AlertCircle,
  Building2,
  ShieldCheck,
  Save,
  FileText,
  ChevronDown,
  Search,
  User,
  Info,
  Check,
  TrendingUp,
  Plus,
  Trash2,
  Layers,
} from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import {
  attendanceApi,
  BackendShift,
  AttendanceStatus,
  BackendAttendanceRecord,
} from '../api/attendance.api';

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  desc: string;
  badgeVariant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
}[] = [
  { value: 'PRESENT', label: 'Present', desc: 'Full day attended', badgeVariant: 'success' },
  { value: 'HALF_DAY', label: 'Half Day', desc: 'Half day (0.5 payable)', badgeVariant: 'warning' },
  { value: 'PAID_LEAVE', label: 'Paid Leave', desc: 'Authorized leave', badgeVariant: 'info' },
  { value: 'UNPAID_LEAVE', label: 'Unpaid / LOP', desc: 'Loss of pay', badgeVariant: 'danger' },
  { value: 'ABSENT', label: 'Absent', desc: 'Unapproved absence', badgeVariant: 'danger' },
  { value: 'HOLIDAY', label: 'Holiday', desc: 'Public holiday', badgeVariant: 'purple' },
  { value: 'WEEKEND', label: 'Weekend', desc: 'Scheduled day off', badgeVariant: 'neutral' },
];

export interface ClockSession {
  id: string;
  clockIn: string; // HH:MM
  clockOut: string; // HH:MM
  hasClockOut: boolean;
  label?: string;
}

export const ClockInView: React.FC = () => {
  const {
    employees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    setCurrentView,
    refreshData,
  } = usePayroll();

  // Selected Employee
  const [empId, setEmpId] = useState<string>(() => {
    if (selectedEmployeeId && employees.some((e) => e.id === selectedEmployeeId)) {
      return selectedEmployeeId;
    }
    return employees[0]?.id || '';
  });
  const [searchEmpQuery, setSearchEmpQuery] = useState('');
  const [isEmpPickerOpen, setIsEmpPickerOpen] = useState(false);

  // Date Selection (defaults to today)
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [attendanceDate, setAttendanceDate] = useState<string>(todayIso);

  // Shifts
  const [shifts, setShifts] = useState<BackendShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  // Form Fields: Status
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT');

  // Multiple Clock In / Clock Out Sessions
  const [sessions, setSessions] = useState<ClockSession[]>([
    {
      id: 'session-1',
      clockIn: '09:30',
      clockOut: '18:30',
      hasClockOut: true,
      label: 'Session 1 (Standard Shift)',
    },
  ]);

  // Additional Break & Overtime
  const [additionalBreakMinutes, setAdditionalBreakMinutes] = useState<number>(0);
  const [overtimeMinutes, setOvertimeMinutes] = useState<number>(0);

  // Remote / WFH Tracking
  const [isRemote, setIsRemote] = useState<boolean>(false);
  const [remoteHours, setRemoteHours] = useState<number>(8);
  const [remoteLocation, setRemoteLocation] = useState<string>('Home (WFH)');

  // Notes & Regularization
  const [notes, setNotes] = useState<string>('');

  // Existing Record Detection & Async State
  const [existingRecord, setExistingRecord] = useState<BackendAttendanceRecord | null>(null);
  const [isCheckingRecord, setIsCheckingRecord] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load shifts on mount
  useEffect(() => {
    attendanceApi
      .getShifts()
      .then((data) => {
        setShifts(data);
        if (data.length > 0) {
          setSelectedShiftId(data[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load shifts:', err);
      });
  }, []);

  // Update selected employee in context
  useEffect(() => {
    if (empId) {
      setSelectedEmployeeId(empId);
    }
  }, [empId, setSelectedEmployeeId]);

  const currentEmp = useMemo(() => {
    return employees.find((e) => e.id === empId) || employees[0];
  }, [employees, empId]);

  // Helper to format Date to HH:MM in local/UTC
  const parseTimeToHHMM = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };

  // Check if a record already exists for this employee on selected date
  const checkExistingRecord = useCallback(async () => {
    if (!empId || !attendanceDate) return;
    setIsCheckingRecord(true);
    try {
      const res = await attendanceApi.getRecords({
        employeeId: empId,
        startDate: attendanceDate,
        endDate: attendanceDate,
        limit: 1,
      });

      if (res.items && res.items.length > 0) {
        const rec = res.items[0];
        setExistingRecord(rec);
        setStatus(rec.attendance_status);

        if (rec.overtime_minutes) {
          setOvertimeMinutes(rec.overtime_minutes);
        }

        if (rec.source === 'REMOTE') {
          setIsRemote(true);
        }

        // Reconstruct sessions from punches if available
        const punches = rec.rndtechnosoft_attendance_punches || [];
        if (punches.length > 0) {
          // Sort punches chronologically
          const sorted = [...punches].sort(
            (a, b) => new Date(a.punch_at).getTime() - new Date(b.punch_at).getTime()
          );

          const reconstructedSessions: ClockSession[] = [];
          let currentIn: string | null = null;
          let sessionCount = 1;

          for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            const timeStr = parseTimeToHHMM(p.punch_at);

            if (p.punch_type === 'IN') {
              currentIn = timeStr;
            } else if (p.punch_type === 'OUT' && currentIn) {
              reconstructedSessions.push({
                id: `session-reconstructed-${sessionCount}`,
                clockIn: currentIn,
                clockOut: timeStr,
                hasClockOut: true,
                label: `Session ${sessionCount}`,
              });
              currentIn = null;
              sessionCount++;
            }
          }

          // If there's an open IN punch without OUT
          if (currentIn) {
            reconstructedSessions.push({
              id: `session-reconstructed-${sessionCount}`,
              clockIn: currentIn,
              clockOut: '',
              hasClockOut: false,
              label: `Session ${sessionCount} (Active)`,
            });
          }

          if (reconstructedSessions.length > 0) {
            setSessions(reconstructedSessions);
          }
        } else if (rec.first_check_in_at) {
          // Fallback to first_check_in_at and last_check_out_at
          const inTime = parseTimeToHHMM(rec.first_check_in_at);
          const outTime = rec.last_check_out_at ? parseTimeToHHMM(rec.last_check_out_at) : '';
          setSessions([
            {
              id: 'session-existing-1',
              clockIn: inTime,
              clockOut: outTime,
              hasClockOut: Boolean(rec.last_check_out_at),
              label: 'Session 1',
            },
          ]);
        }
      } else {
        setExistingRecord(null);
      }
    } catch (err) {
      console.error('Failed to check existing attendance:', err);
    } finally {
      setIsCheckingRecord(false);
    }
  }, [empId, attendanceDate]);

  useEffect(() => {
    checkExistingRecord();
  }, [checkExistingRecord]);

  // Active shift info
  const activeShift = useMemo(() => {
    return shifts.find((s) => s.id === selectedShiftId) || shifts[0] || null;
  }, [shifts, selectedShiftId]);

  // Session Manipulation Handlers
  const addSession = () => {
    const lastSession = sessions[sessions.length - 1];
    let defaultIn = '14:00';
    let defaultOut = '18:30';

    if (lastSession && lastSession.hasClockOut && lastSession.clockOut) {
      const [h, m] = lastSession.clockOut.split(':').map(Number);
      // Default next session 60 min after previous clock out
      const nextH = (h + 1) % 24;
      defaultIn = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const nextEndH = Math.min(23, nextH + 4);
      defaultOut = `${String(nextEndH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const newIndex = sessions.length + 1;
    const newSession: ClockSession = {
      id: `session-${Date.now()}`,
      clockIn: defaultIn,
      clockOut: defaultOut,
      hasClockOut: true,
      label: `Session ${newIndex}`,
    };

    setSessions((prev) => [...prev, newSession]);
  };

  const removeSession = (id: string) => {
    if (sessions.length <= 1) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSession = (id: string, updates: Partial<ClockSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  // Convert HH:MM to minutes from midnight
  const timeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Real-time Dynamic Calculation across all sessions
  const calculations = useMemo(() => {
    let totalGrossMinutes = 0;
    let totalInterSessionBreaks = 0;
    const sessionDetails: Array<{
      id: string;
      label: string;
      inTime: string;
      outTime: string;
      durationMinutes: number;
      durationFormatted: string;
      hasOut: boolean;
    }> = [];

    // Sort copy of sessions by clock in for accurate interval & break calculation
    const sorted = [...sessions].sort(
      (a, b) => timeToMinutes(a.clockIn) - timeToMinutes(b.clockIn)
    );

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const inM = timeToMinutes(s.clockIn);
      const outM = s.hasClockOut && s.clockOut ? timeToMinutes(s.clockOut) : inM;
      const durM = s.hasClockOut && outM > inM ? outM - inM : 0;
      totalGrossMinutes += durM;

      sessionDetails.push({
        id: s.id,
        label: s.label || `Session ${i + 1}`,
        inTime: s.clockIn,
        outTime: s.hasClockOut ? s.clockOut : 'Active',
        durationMinutes: durM,
        durationFormatted: `${Math.floor(durM / 60)}h ${String(durM % 60).padStart(2, '0')}m`,
        hasOut: s.hasClockOut,
      });

      // Check gap between this session's OUT and next session's IN
      if (i < sorted.length - 1 && s.hasClockOut && s.clockOut) {
        const nextInM = timeToMinutes(sorted[i + 1].clockIn);
        if (nextInM > outM) {
          totalInterSessionBreaks += nextInM - outM;
        }
      }
    }

    const netM = Math.max(
      0,
      totalGrossMinutes - additionalBreakMinutes + overtimeMinutes
    );

    const netHoursFormatted = `${(netM / 60).toFixed(1)} hrs`;
    const grossHoursFormatted = `${Math.floor(totalGrossMinutes / 60)}h ${String(
      totalGrossMinutes % 60
    ).padStart(2, '0')}m`;
    const breakHoursFormatted = `${Math.floor(
      (totalInterSessionBreaks + additionalBreakMinutes) / 60
    )}h ${String(
      (totalInterSessionBreaks + additionalBreakMinutes) % 60
    ).padStart(2, '0')}m`;
    const overtimeHoursFormatted = `${Math.floor(overtimeMinutes / 60)}h ${String(
      overtimeMinutes % 60
    ).padStart(2, '0')}m`;

    // Punctuality check vs shift (default 09:30 AM start, 18:30 PM end)
    let punctuality = 'On Time';
    if (sorted.length > 0 && sorted[0].clockIn) {
      const firstInM = timeToMinutes(sorted[0].clockIn);
      const shiftStartM = 9 * 60 + 30; // 09:30 AM
      if (firstInM > shiftStartM + 15) {
        punctuality = `Late by ${firstInM - shiftStartM} mins`;
      } else if (firstInM < shiftStartM - 15) {
        punctuality = `Early arrival (${shiftStartM - firstInM} mins early)`;
      }

      const lastSession = sorted[sorted.length - 1];
      if (lastSession.hasClockOut && lastSession.clockOut) {
        const lastOutM = timeToMinutes(lastSession.clockOut);
        const shiftEndM = 18 * 60 + 30;
        if (lastOutM < shiftEndM - 15) {
          punctuality += ` • Early exit by ${shiftEndM - lastOutM} mins`;
        }
      }
    }

    // Payable Days Impact
    let payableDays = 1.0;
    if (status === 'HALF_DAY' || (totalGrossMinutes > 0 && netM < 270)) {
      payableDays = 0.5;
    } else if (status === 'ABSENT' || status === 'UNPAID_LEAVE') {
      payableDays = 0.0;
    }

    return {
      sessionDetails,
      totalGrossMinutes,
      grossHoursFormatted,
      totalInterSessionBreaks,
      totalBreaksMinutes: totalInterSessionBreaks + additionalBreakMinutes,
      breakHoursFormatted,
      overtimeMinutes,
      overtimeHoursFormatted,
      netWorkedMinutes: netM,
      netWorkedHoursFormatted: netHoursFormatted,
      payableDays,
      punctuality,
    };
  }, [sessions, additionalBreakMinutes, overtimeMinutes, status]);

  // Form Submission
  const handleSave = async (recordAnother = false) => {
    if (!currentEmp) {
      setErrorMessage('Please select an employee first.');
      return;
    }

    // Validation: Check that every session with clockOut has clockOut >= clockIn
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s.clockIn) {
        setErrorMessage(`Session ${i + 1} is missing a Clock In time.`);
        return;
      }
      if (s.hasClockOut && s.clockOut) {
        const inM = timeToMinutes(s.clockIn);
        const outM = timeToMinutes(s.clockOut);
        if (outM < inM) {
          setErrorMessage(
            `Session ${i + 1} has a Clock Out time (${s.clockOut}) earlier than Clock In (${s.clockIn}).`
          );
          return;
        }
      }
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const sortedSessions = [...sessions].sort(
        (a, b) => timeToMinutes(a.clockIn) - timeToMinutes(b.clockIn)
      );

      const firstSession = sortedSessions[0];
      const lastCompletedSession = sortedSessions
        .filter((s) => s.hasClockOut && s.clockOut)
        .pop();

      const firstCheckInIso = firstSession
        ? `${attendanceDate}T${firstSession.clockIn}:00.000Z`
        : undefined;
      const lastCheckOutIso = lastCompletedSession
        ? `${attendanceDate}T${lastCompletedSession.clockOut}:00.000Z`
        : undefined;

      const sessionsPayload = sortedSessions.map((s) => ({
        clockIn: `${attendanceDate}T${s.clockIn}:00.000Z`,
        clockOut:
          s.hasClockOut && s.clockOut
            ? `${attendanceDate}T${s.clockOut}:00.000Z`
            : undefined,
      }));

      let effectiveStatus = status;
      if (isRemote && status === 'PRESENT') {
        effectiveStatus = 'PRESENT';
      }

      const sessionSummaryText = `${sessions.length} session${
        sessions.length > 1 ? 's' : ''
      } (${calculations.netWorkedHoursFormatted} worked)`;

      const noteContent = notes.trim()
        ? isRemote
          ? `[Remote: ${remoteLocation}, ${remoteHours}h] [${sessionSummaryText}] ${notes.trim()}`
          : `[${sessionSummaryText}] ${notes.trim()}`
        : isRemote
        ? `[Remote: ${remoteLocation}, ${remoteHours}h] [${sessionSummaryText}]`
        : `[${sessionSummaryText}]`;

      await attendanceApi.saveRecord({
        employeeId: currentEmp.id,
        attendanceDate,
        attendanceStatus: effectiveStatus,
        firstCheckInAt: firstCheckInIso,
        lastCheckOutAt: lastCheckOutIso,
        workedMinutes: calculations.netWorkedMinutes,
        payableMinutes: Math.round(calculations.payableDays * 480),
        breakMinutes: calculations.totalBreaksMinutes,
        overtimeMinutes,
        remoteMinutes: isRemote ? Math.round(remoteHours * 60) : 0,
        source: isRemote ? 'REMOTE' : 'MANUAL',
        shiftId:
          activeShift?.id !== 'default-general-shift'
            ? activeShift?.id
            : undefined,
        notes: noteContent,
        sessions: sessionsPayload,
      });

      setSuccessMessage(
        `Attendance recorded successfully with ${sessions.length} session${
          sessions.length > 1 ? 's' : ''
        } for ${currentEmp.name} on ${attendanceDate}!`
      );
      await refreshData();

      if (recordAnother) {
        setTimeout(() => setSuccessMessage(null), 3000);
        checkExistingRecord();
      } else {
        setTimeout(() => {
          setCurrentView('attendance');
        }, 1200);
      }
    } catch (err: any) {
      console.error('Failed to save attendance record:', err);
      setErrorMessage(err?.message || 'Failed to save attendance time entry.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered employees for dropdown
  const filteredEmployees = useMemo(() => {
    if (!searchEmpQuery.trim()) return employees;
    const q = searchEmpQuery.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
    );
  }, [employees, searchEmpQuery]);

  // Formatted date string for header
  const dateHeading = useMemo(() => {
    try {
      const parts = attendanceDate.split('-');
      const d = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10)
      );
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return attendanceDate;
    }
  }, [attendanceDate]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <button
            onClick={() => setCurrentView('attendance')}
            className="inline-flex items-center text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors mb-2 gap-1 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
            Back to Attendance & Shifts
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Clock In & Detailed Time Entry
            </h1>
            <Badge variant="info" size="sm">
              <Layers className="w-3 h-3 mr-1" />
              Multi-Session Punching
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Support for multiple clock-in and clock-out sessions throughout the day with automated inter-session break calculation.
          </p>
        </div>

        {/* Existing Record Pill */}
        {existingRecord && (
          <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Editing existing record for {attendanceDate}</span>
          </div>
        )}
      </div>

      {/* Success / Error Alerts */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl flex items-center gap-3 animate-fade-in shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-2xl flex items-center gap-3 animate-fade-in shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form Column (8 Cols on desktop) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section 1: Employee & Date Picker */}
          <Card padded className="space-y-4 shadow-card">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">
                    1. Employee & Attendance Date
                  </h2>
                  <p className="text-xs text-slate-500">
                    Select employee and target date for attendance recording
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                {dateHeading}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Employee Selector Dropdown */}
              <div className="relative">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Target Employee *
                </label>
                <div
                  onClick={() => setIsEmpPickerOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 cursor-pointer transition-colors shadow-sm"
                >
                  {currentEmp ? (
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={currentEmp.name} size="sm" />
                      <div className="truncate">
                        <div className="text-sm font-bold text-slate-800 truncate">
                          {currentEmp.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {currentEmp.code} • {currentEmp.department}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">
                      Select employee...
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </div>

                {/* Dropdown Menu */}
                {isEmpPickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="Search employee by name, code, dept..."
                        value={searchEmpQuery}
                        onChange={(e) => setSearchEmpQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1">
                      {filteredEmployees.map((emp) => (
                        <div
                          key={emp.id}
                          onClick={() => {
                            setEmpId(emp.id);
                            setIsEmpPickerOpen(false);
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                            emp.id === empId
                              ? 'bg-teal-50 text-teal-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={emp.name} size="sm" />
                            <div className="truncate">
                              <p className="text-xs font-bold truncate">
                                {emp.name}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {emp.code} • {emp.designation}
                              </p>
                            </div>
                          </div>
                          {emp.id === empId && (
                            <Check className="w-4 h-4 text-teal-600 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Attendance Date Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Attendance Date *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-sm"
                  />
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                  <span>Standard Shift: 09:30 AM – 06:30 PM</span>
                  <button
                    type="button"
                    onClick={() => setAttendanceDate(todayIso)}
                    className="text-teal-600 hover:underline font-semibold"
                  >
                    Today
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Section 2: Attendance Status */}
          <Card padded className="space-y-4 shadow-card">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  2. Attendance Status
                </h2>
                <p className="text-xs text-slate-500">
                  Classify the employee day type for payroll calculations
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          isSelected ? 'text-teal-900' : 'text-slate-800'
                        }`}
                      >
                        {opt.label}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-teal-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Section 3: Multiple Check-In & Check-Out Sessions */}
          <Card padded className="space-y-5 shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    3. Check-In & Check-Out Sessions
                    <span className="text-xs font-normal text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">
                      {sessions.length} Session{sessions.length > 1 ? 's' : ''}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Add multiple punch-in & punch-out sessions for lunch, off-site visits, or overtime
                  </p>
                </div>
              </div>

              {/* Add Session Button */}
              <Button
                variant="secondary"
                size="sm"
                onClick={addSession}
                className="self-start sm:self-auto font-bold border-teal-300 text-teal-800 hover:bg-teal-50"
              >
                <Plus className="w-4 h-4 mr-1 text-teal-600" />
                Add Another Session
              </Button>
            </div>

            {/* List of Sessions */}
            <div className="space-y-4">
              {sessions.map((session, idx) => {
                const sDetail = calculations.sessionDetails.find(
                  (d) => d.id === session.id
                );

                // Check gap with previous session
                let breakBefore = 0;
                let prevOutStr = '';
                if (idx > 0) {
                  const prev = sessions[idx - 1];
                  if (prev.hasClockOut && prev.clockOut && session.clockIn) {
                    const prevOutM = timeToMinutes(prev.clockOut);
                    const currInM = timeToMinutes(session.clockIn);
                    if (currInM > prevOutM) {
                      breakBefore = currInM - prevOutM;
                      prevOutStr = prev.clockOut;
                    }
                  }
                }

                return (
                  <React.Fragment key={session.id}>
                    {/* Inter-Session Break Banner */}
                    {breakBefore > 0 && (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs font-medium">
                        <div className="flex items-center gap-2">
                          <Coffee className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            Inter-Session Break: <strong>{breakBefore} mins</strong> ({prevOutStr} ➔ {session.clockIn})
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-md font-semibold">
                          Deducted from day span
                        </span>
                      </div>
                    )}

                    {/* Session Box */}
                    <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-4 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {session.label || `Session ${idx + 1}`}
                          </span>
                          {sDetail && sDetail.hasOut && (
                            <Badge variant="info" size="sm">
                              {sDetail.durationFormatted}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Still Working Checkbox */}
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!session.hasClockOut}
                              onChange={(e) =>
                                updateSession(session.id, {
                                  hasClockOut: !e.target.checked,
                                })
                              }
                              className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                            />
                            <span>Still in Session</span>
                          </label>

                          {/* Delete Session (if > 1 session) */}
                          {sessions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSession(session.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remove Session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inputs for Clock In and Clock Out */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Clock In */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <LogIn className="w-3.5 h-3.5 text-teal-600" />
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                Clock In Time *
                              </label>
                            </div>
                            <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                              IN
                            </span>
                          </div>

                          <input
                            type="time"
                            value={session.clockIn}
                            onChange={(e) =>
                              updateSession(session.id, {
                                clockIn: e.target.value,
                              })
                            }
                            className="w-full p-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />

                          <div className="flex items-center gap-1.5 text-[11px]">
                            {idx === 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateSession(session.id, {
                                    clockIn: '09:30',
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                              >
                                09:30 AM
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const now = new Date();
                                const time = `${String(
                                  now.getHours()
                                ).padStart(2, '0')}:${String(
                                  now.getMinutes()
                                ).padStart(2, '0')}`;
                                updateSession(session.id, { clockIn: time });
                              }}
                              className="px-2 py-0.5 rounded bg-white border border-slate-200 text-teal-700 hover:bg-teal-50"
                            >
                              Current Time
                            </button>
                          </div>
                        </div>

                        {/* Clock Out */}
                        <div
                          className={`space-y-2 transition-opacity ${
                            session.hasClockOut ? '' : 'opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <LogOut className="w-3.5 h-3.5 text-amber-600" />
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                Clock Out Time
                              </label>
                            </div>
                            <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                              OUT
                            </span>
                          </div>

                          <input
                            type="time"
                            value={session.clockOut}
                            disabled={!session.hasClockOut}
                            onChange={(e) =>
                              updateSession(session.id, {
                                clockOut: e.target.value,
                              })
                            }
                            className="w-full p-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                          />

                          <div className="flex items-center gap-1.5 text-[11px]">
                            {idx === 0 && sessions.length > 1 ? (
                              <button
                                type="button"
                                disabled={!session.hasClockOut}
                                onClick={() =>
                                  updateSession(session.id, {
                                    clockOut: '13:00',
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              >
                                01:00 PM (Lunch)
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!session.hasClockOut}
                                onClick={() =>
                                  updateSession(session.id, {
                                    clockOut: '18:30',
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              >
                                06:30 PM (Shift End)
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!session.hasClockOut}
                              onClick={() => {
                                const now = new Date();
                                const time = `${String(
                                  now.getHours()
                                ).padStart(2, '0')}:${String(
                                  now.getMinutes()
                                ).padStart(2, '0')}`;
                                updateSession(session.id, {
                                  clockOut: time,
                                  hasClockOut: true,
                                });
                              }}
                              className="px-2 py-0.5 rounded bg-white border border-slate-200 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                            >
                              Current Time
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Bottom Add Session Helper */}
            <div className="pt-2 flex justify-center border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={addSession}
                className="w-full sm:w-auto text-teal-700 border-teal-200 hover:bg-teal-50"
              >
                <Plus className="w-4 h-4 mr-1.5 text-teal-600" />
                Add Another Clock In / Out Session
              </Button>
            </div>
          </Card>

          {/* Section 4: Break Time & Overtime Allowance */}
          <Card padded className="space-y-4 shadow-card">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                <Coffee className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  4. Break Time & Overtime Allowance
                </h2>
                <p className="text-xs text-slate-500">
                  Inter-session breaks are automatically calculated; add extra break or overtime as needed
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Break Time Summary & Additional Break */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Additional Break (Minutes)
                  </label>
                  <span className="text-xs font-semibold text-slate-500">
                    Total: {calculations.breakHoursFormatted}
                  </span>
                </div>

                <input
                  type="number"
                  min="0"
                  max="180"
                  step="5"
                  value={additionalBreakMinutes}
                  onChange={(e) =>
                    setAdditionalBreakMinutes(
                      Math.max(0, parseInt(e.target.value, 10) || 0)
                    )
                  }
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                />

                <div className="flex items-center flex-wrap gap-1.5 pt-1">
                  {[0, 15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setAdditionalBreakMinutes(mins)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        additionalBreakMinutes === mins
                          ? 'bg-teal-50 text-teal-800 border-teal-300 font-bold'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {mins === 0 ? 'None' : `+${mins}m`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  {calculations.totalInterSessionBreaks > 0 ? (
                    <>
                      {calculations.totalInterSessionBreaks}m auto-detected from session intervals + {additionalBreakMinutes}m additional.
                    </>
                  ) : (
                    'Enter any extra unpaid recess or tea break duration.'
                  )}
                </p>
              </div>

              {/* Overtime Duration Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Overtime Duration (Minutes)
                  </label>
                  <span className="text-xs font-semibold text-teal-700">
                    +{calculations.overtimeHoursFormatted}
                  </span>
                </div>

                <input
                  type="number"
                  min="0"
                  max="480"
                  step="15"
                  value={overtimeMinutes}
                  onChange={(e) =>
                    setOvertimeMinutes(
                      Math.max(0, parseInt(e.target.value, 10) || 0)
                    )
                  }
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                />

                <div className="flex items-center flex-wrap gap-1.5 pt-1">
                  {[0, 30, 60, 120, 180].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setOvertimeMinutes(mins)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        overtimeMinutes === mins
                          ? 'bg-teal-50 text-teal-800 border-teal-300 font-bold'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {mins === 0
                        ? 'None'
                        : mins === 60
                        ? '1 hr'
                        : mins === 120
                        ? '2 hrs'
                        : `${mins}m`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Logged in payroll as approved overtime allowance lines.
                </p>
              </div>
            </div>
          </Card>

          {/* Section 5: Remote Work / WFH Tracking */}
          <Card padded className="space-y-4 shadow-card">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">
                    5. Remote Time & Work-From-Home (WFH)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Record whether all or part of the day was worked remotely
                  </p>
                </div>
              </div>

              {/* Remote Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRemote}
                  onChange={(e) => setIsRemote(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-700">
                  {isRemote ? 'Remote Work Active' : 'Mark as Remote Work'}
                </span>
              </label>
            </div>

            {isRemote && (
              <div className="p-4 rounded-2xl bg-teal-50/50 border border-teal-200 space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Remote Location */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-teal-900 mb-1.5">
                      Remote Location
                    </label>
                    <select
                      value={remoteLocation}
                      onChange={(e) => setRemoteLocation(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-teal-300 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="Home (WFH)">Home (Standard WFH)</option>
                      <option value="Client Site">
                        Client Site / Customer Office
                      </option>
                      <option value="Coworking Space">Coworking Space</option>
                      <option value="Business Travel">
                        Business Travel / Transit
                      </option>
                    </select>
                  </div>

                  {/* Remote Hours */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-teal-900 mb-1.5">
                      Remote Duration (Hours)
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      max="16"
                      step="0.5"
                      value={remoteHours}
                      onChange={(e) =>
                        setRemoteHours(parseFloat(e.target.value) || 0)
                      }
                      className="w-full p-2.5 rounded-xl border border-teal-300 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <p className="text-xs text-teal-800 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Remote records are tagged with{' '}
                  <code className="px-1.5 py-0.5 rounded bg-white text-teal-900 font-mono text-[11px]">
                    source: REMOTE
                  </code>{' '}
                  for compliance reporting and attendance analytics.
                </p>
              </div>
            )}
          </Card>

          {/* Section 6: Notes & Remarks */}
          <Card padded className="space-y-3 shadow-card">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  6. Reason & Regularization Remarks
                </h2>
                <p className="text-xs text-slate-500">
                  Provide an audit trail justification for manual entries or punches
                </p>
              </div>
            </div>

            <textarea
              rows={3}
              placeholder="e.g. Regularized morning and evening punches / split shift approved by department head..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setCurrentView('attendance')}
              disabled={isSaving}
            >
              Cancel
            </Button>

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => handleSave(true)}
                loading={isSaving}
              >
                Save & Record Another
              </Button>

              <Button
                variant="primary"
                onClick={() => handleSave(false)}
                loading={isSaving}
                className="px-6"
              >
                <Save className="w-4 h-4 mr-1.5" />
                Save Time Entry
              </Button>
            </div>
          </div>
        </div>

        {/* Right Desktop Summary & Calculation Card (4 Cols on desktop) */}
        <div className="lg:col-span-4 space-y-5 sticky top-6">
          {/* Real-time Calculation Summary Card */}
          <Card padded className="shadow-card border-t-4 border-t-teal-500 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  Live Computation
                </span>
                <Badge variant="info" size="sm">
                  {sessions.length} Session{sessions.length > 1 ? 's' : ''}
                </Badge>
              </div>
              <h3 className="text-base font-black text-slate-800 mt-1">
                Productive Hours Breakdown
              </h3>
            </div>

            {/* Selected Employee Snapshot */}
            {currentEmp && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <Avatar name={currentEmp.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {currentEmp.name}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {currentEmp.code} • {currentEmp.designation}
                  </div>
                </div>
              </div>
            )}

            {/* Multi-Segment Timeline Visualizer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Multi-Session Timeline</span>
                <span className="text-slate-500 font-bold">
                  {calculations.netWorkedHoursFormatted} net
                </span>
              </div>

              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner gap-0.5 p-0.5">
                {calculations.sessionDetails.map((sd, i) => (
                  <React.Fragment key={sd.id}>
                    {/* Session Bar */}
                    <div
                      className="bg-teal-500 h-full rounded-sm transition-all duration-300"
                      style={{
                        width: `${Math.max(
                          10,
                          (sd.durationMinutes /
                            Math.max(1, calculations.totalGrossMinutes)) *
                            75
                        )}%`,
                      }}
                      title={`${sd.label}: ${sd.durationFormatted}`}
                    />
                    {/* Break Bar (if gap exists) */}
                    {i < calculations.sessionDetails.length - 1 && (
                      <div
                        className="bg-amber-400 h-full rounded-sm transition-all duration-300 w-3 shrink-0"
                        title="Inter-Session Break"
                      />
                    )}
                  </React.Fragment>
                ))}
                {overtimeMinutes > 0 && (
                  <div
                    className="bg-indigo-500 h-full rounded-sm transition-all duration-300 w-6 shrink-0"
                    title="Overtime Added"
                  />
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                <span>
                  Start: {calculations.sessionDetails[0]?.inTime || '--:--'}
                </span>
                <span>
                  End:{' '}
                  {calculations.sessionDetails[
                    calculations.sessionDetails.length - 1
                  ]?.outTime || '--:--'}
                </span>
              </div>
            </div>

            {/* Detailed Sessions Breakdown Table */}
            <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100 space-y-1.5 text-xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-slate-200">
                Session Intervals
              </div>
              {calculations.sessionDetails.map((sd, i) => (
                <div
                  key={sd.id}
                  className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0"
                >
                  <span className="text-slate-700 font-medium">
                    {sd.label} ({sd.inTime} – {sd.outTime})
                  </span>
                  <span className="font-bold text-teal-700">
                    {sd.durationFormatted}
                  </span>
                </div>
              ))}
            </div>

            {/* Metrics Breakdown Table */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between py-1 border-b border-slate-50 text-slate-600">
                <span>Gross Worked Duration:</span>
                <span className="font-semibold text-slate-800">
                  {calculations.grossHoursFormatted}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50 text-slate-600">
                <span className="flex items-center gap-1 text-amber-700">
                  <Coffee className="w-3 h-3" />
                  Total Breaks Deducted:
                </span>
                <span className="font-semibold text-amber-700">
                  - {calculations.breakHoursFormatted}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50 text-slate-600">
                <span className="flex items-center gap-1 text-indigo-700">
                  <TrendingUp className="w-3 h-3" />
                  Overtime Allowance:
                </span>
                <span className="font-semibold text-indigo-700">
                  + {calculations.overtimeHoursFormatted}
                </span>
              </div>

              {isRemote && (
                <div className="flex items-center justify-between py-1 border-b border-slate-50 text-teal-800">
                  <span className="flex items-center gap-1">
                    <Laptop className="w-3 h-3" />
                    Remote Worked Time:
                  </span>
                  <span className="font-semibold">
                    {remoteHours.toFixed(1)} hrs
                  </span>
                </div>
              )}

              {/* Net Worked Total */}
              <div className="flex items-center justify-between pt-2 text-sm font-black text-slate-800">
                <span>Net Productive Time:</span>
                <span className="text-teal-600 text-base">
                  {calculations.netWorkedHoursFormatted}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 text-slate-600">
                <span>Payable Day Value:</span>
                <span className="font-bold text-slate-800">
                  {calculations.payableDays}{' '}
                  {calculations.payableDays === 1
                    ? 'Full Day'
                    : calculations.payableDays === 0.5
                    ? 'Half Day'
                    : 'Day'}
                </span>
              </div>
            </div>

            {/* Shift & Punctuality Assessment */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Shift Compliance
                </span>
                <span>
                  {activeShift?.shift_name?.split('(')[0] || 'General Shift'}
                </span>
              </div>
              <div className="text-slate-700 font-medium">
                {calculations.punctuality}
              </div>
            </div>

            {/* Audit Trail Note */}
            <div className="text-[11px] text-slate-400 flex items-start gap-1.5 bg-slate-50 p-2.5 rounded-xl">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
              <span>
                Each session creates paired IN/OUT punch records in PostgreSQL with strict tenant isolation.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
