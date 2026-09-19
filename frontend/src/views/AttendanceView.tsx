import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogIn,
  LogOut,
  Sparkles,
  Search,
  CheckCircle2,
  Trash2,
  Edit3,
  X,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CalendarHeatmap } from '../components/ui/CalendarHeatmap';
import { Avatar } from '../components/ui/Avatar';
import {
  attendanceApi,
  BackendAttendanceRecord,
  BackendAttendancePunch,
  AttendanceStatus,
} from '../api/attendance.api';
import type { AttendanceDay, AttendanceDayStatus } from '../types/payroll.types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present (Full Day)',
  ABSENT: 'Absent (Unapproved)',
  HALF_DAY: 'Half Day',
  PAID_LEAVE: 'Paid Leave',
  UNPAID_LEAVE: 'Unpaid Leave (LOP)',
  HOLIDAY: 'Public Holiday',
  WEEKEND: 'Weekend / Off',
};

export const AttendanceView: React.FC = () => {
  const { employees, refreshData: refreshPayrollContext } = usePayroll();

  // Current year & month (Default October 2026 or current)
  const [year, setYear] = useState(2026);
  const [monthIdx, setMonthIdx] = useState(9); // 0-indexed: 9 = October
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  // Attendance records from backend
  const [records, setRecords] = useState<BackendAttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Day editor modal state
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('PRESENT');
  const [editCheckIn, setEditCheckIn] = useState<string>('09:30');
  const [editCheckOut, setEditCheckOut] = useState<string>('18:30');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Bulk mark modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>('PRESENT');
  const [bulkTarget, setBulkTarget] = useState<'SELECTED' | 'ALL'>('SELECTED');
  const [isBulking, setIsBulking] = useState<boolean>(false);

  // Quick punch state
  const [isPunching, setIsPunching] = useState<boolean>(false);

  // Set default selected employee when employees load
  useEffect(() => {
    if (employees.length > 0) {
      const exists = employees.some((e) => e.id === selectedEmpId);
      if (!selectedEmpId || !exists) {
        setSelectedEmpId(employees[0].id);
      }
    }
  }, [employees, selectedEmpId]);

  const selectedEmp = employees.find((e) => e.id === selectedEmpId) || employees[0];
  const month = monthIdx + 1; // 1-indexed for calculations
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();

  // Fetch real attendance records for selected employee & month from PostgreSQL
  const fetchRecords = useCallback(async () => {
    const targetEmpId = selectedEmp?.id || selectedEmpId;
    if (!targetEmpId) return;
    setIsLoading(true);
    setError(null);

    const startDate = `${monthStr}-01`;
    const endDate = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    try {
      const res = await attendanceApi.getRecords({
        employeeId: targetEmpId,
        startDate,
        endDate,
        limit: 100,
      });
      setRecords(res.items || []);
    } catch (err: any) {
      console.error('Failed to fetch attendance records:', err);
      setError(err?.message || 'Could not load attendance from server');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEmp, selectedEmpId, monthStr, daysInMonth]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Navigate months
  const goBack = () => {
    if (monthIdx === 0) {
      setMonthIdx(11);
      setYear((y) => y - 1);
    } else {
      setMonthIdx((m) => m - 1);
    }
  };

  const goForward = () => {
    if (monthIdx === 11) {
      setMonthIdx(0);
      setYear((y) => y + 1);
    } else {
      setMonthIdx((m) => m + 1);
    }
  };

  // Map backend records to calendar days & lookup by date
  const { attendanceDays, recordByDate } = useMemo(() => {
    const map = new Map<string, BackendAttendanceRecord>();
    records.forEach((r) => {
      const dateStr = typeof r.attendance_date === 'string'
        ? r.attendance_date.slice(0, 10)
        : new Date(r.attendance_date).toISOString().slice(0, 10);
      map.set(dateStr, r);
    });

    const days: AttendanceDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = map.get(dateStr);
      if (rec) {
        days.push({
          date: dateStr,
          status: rec.attendance_status as AttendanceDayStatus,
        });
      } else {
        const dow = new Date(year, month - 1, d).getDay();
        const isWeekend = dow === 0 || dow === 6;
        days.push({
          date: dateStr,
          status: isWeekend ? 'WEEKEND' : 'FUTURE',
        });
      }
    }

    return { attendanceDays: days, recordByDate: map };
  }, [records, year, month, daysInMonth]);

  // Summary counts computed directly from real records
  const countBy = (status: AttendanceStatus) =>
    records.filter((r) => r.attendance_status === status).length;

  const presentCount = countBy('PRESENT');
  const absentCount = countBy('ABSENT');
  const halfDayCount = countBy('HALF_DAY');
  const paidLeaveCount = countBy('PAID_LEAVE');
  const unpaidLeaveCount = countBy('UNPAID_LEAVE');
  const holidayCount = countBy('HOLIDAY');
  const weekendCount = countBy('WEEKEND');
  const totalWorkedMinutes = records.reduce((sum, r) => sum + (r.worked_minutes || 0), 0);
  const totalWorkedHours = (totalWorkedMinutes / 60).toFixed(1);

  const summary = [
    { label: 'Present', count: presentCount, color: 'bg-teal-100 text-teal-700' },
    { label: 'Absent', count: absentCount, color: 'bg-red-100 text-red-600' },
    { label: 'Half Day', count: halfDayCount, color: 'bg-amber-100 text-amber-700' },
    { label: 'Paid Leave', count: paidLeaveCount, color: 'bg-emerald-100 text-emerald-800' },
    { label: 'Unpaid (LOP)', count: unpaidLeaveCount, color: 'bg-orange-100 text-orange-700' },
    { label: 'Holidays', count: holidayCount, color: 'bg-purple-100 text-purple-700' },
    { label: 'Weekends', count: weekendCount, color: 'bg-slate-100 text-slate-500' },
  ];

  // Latest punch status for Quick Punch
  const latestPunch = useMemo<BackendAttendancePunch | null>(() => {
    let latest: BackendAttendancePunch | null = null;
    records.forEach((r) => {
      r.rndtechnosoft_attendance_punches?.forEach((p) => {
        if (!latest || new Date(p.punch_at) > new Date(latest.punch_at)) {
          latest = p;
        }
      });
    });
    return latest;
  }, [records]);

  const isClockedIn = latestPunch?.punch_type === 'IN';

  // Handle Day Click for CRUD
  const handleDayClick = (dateStr: string) => {
    setEditingDate(dateStr);
    const existing = recordByDate.get(dateStr);
    if (existing) {
      setEditStatus(existing.attendance_status);
      if (existing.first_check_in_at) {
        const d = new Date(existing.first_check_in_at);
        setEditCheckIn(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      } else {
        setEditCheckIn('09:30');
      }
      if (existing.last_check_out_at) {
        const d = new Date(existing.last_check_out_at);
        setEditCheckOut(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      } else {
        setEditCheckOut('18:30');
      }
    } else {
      const dow = new Date(dateStr).getDay();
      setEditStatus(dow === 0 ? 'WEEKEND' : 'PRESENT');
      setEditCheckIn('09:30');
      setEditCheckOut('18:30');
    }
  };

  // Save/Update Daily Record
  const handleSaveDay = async () => {
    if (!selectedEmpId || !editingDate) return;
    setIsSaving(true);
    setError(null);

    try {
      const checkInIso = editCheckIn ? `${editingDate}T${editCheckIn}:00.000Z` : undefined;
      const checkOutIso = editCheckOut ? `${editingDate}T${editCheckOut}:00.000Z` : undefined;

      await attendanceApi.saveRecord({
        employeeId: selectedEmpId,
        attendanceDate: editingDate,
        attendanceStatus: editStatus,
        firstCheckInAt: checkInIso,
        lastCheckOutAt: checkOutIso,
      });

      setSuccessMessage(`Attendance saved for ${editingDate}`);
      setTimeout(() => setSuccessMessage(null), 3500);
      setEditingDate(null);
      await fetchRecords();
      await refreshPayrollContext();
    } catch (err: any) {
      console.error('Failed to save attendance record:', err);
      setError(err?.message || 'Failed to save attendance record');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Daily Record
  const handleDeleteDay = async () => {
    if (!editingDate) return;
    const existing = recordByDate.get(editingDate);
    if (!existing) {
      setEditingDate(null);
      return;
    }

    if (!confirm(`Are you sure you want to remove attendance for ${editingDate}?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await attendanceApi.deleteRecord(existing.id);
      setSuccessMessage(`Attendance record removed for ${editingDate}`);
      setTimeout(() => setSuccessMessage(null), 3500);
      setEditingDate(null);
      await fetchRecords();
      await refreshPayrollContext();
    } catch (err: any) {
      console.error('Failed to delete attendance record:', err);
      setError(err?.message || 'Failed to delete record');
    } finally {
      setIsDeleting(false);
    }
  };

  // Quick Clock In / Clock Out Punch
  const handleQuickPunch = async () => {
    if (!selectedEmpId) return;
    setIsPunching(true);
    setError(null);

    const nextType: 'IN' | 'OUT' = isClockedIn ? 'OUT' : 'IN';

    try {
      await attendanceApi.recordPunch({
        employeeId: selectedEmpId,
        punchType: nextType,
        source: 'WEB',
      });
      setSuccessMessage(
        `Successfully clocked ${nextType === 'IN' ? 'IN' : 'OUT'} for ${selectedEmp?.name}`
      );
      setTimeout(() => setSuccessMessage(null), 3500);
      await fetchRecords();
      await refreshPayrollContext();
    } catch (err: any) {
      console.error('Failed to record punch:', err);
      setError(err?.message || 'Failed to record punch');
    } finally {
      setIsPunching(false);
    }
  };

  // Bulk Mark Month
  const handleBulkMark = async () => {
    setIsBulking(true);
    setError(null);

    try {
      await attendanceApi.bulkMark({
        month: monthStr,
        defaultStatus: bulkStatus,
        employeeIds: bulkTarget === 'SELECTED' ? [selectedEmpId] : undefined,
      });

      setSuccessMessage(
        `Month ${monthStr} successfully marked as ${bulkStatus} for ${
          bulkTarget === 'SELECTED' ? selectedEmp?.name : 'all active employees'
        }`
      );
      setTimeout(() => setSuccessMessage(null), 3500);
      setIsBulkModalOpen(false);
      await fetchRecords();
      await refreshPayrollContext();
    } catch (err: any) {
      console.error('Failed to bulk mark attendance:', err);
      setError(err?.message || 'Failed to bulk mark attendance');
    } finally {
      setIsBulking(false);
    }
  };

  // Filtered employees list for left column
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">Attendance & Shifts</h1>
            <Badge variant="success" size="sm">Live PostgreSQL</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Daily logs, biometric punches, regularization, and LOP tracking
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Quick Punch Button */}
          <Button
            variant={isClockedIn ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleQuickPunch}
            loading={isPunching}
            className={isClockedIn ? 'border-amber-400 text-amber-800 bg-amber-50 hover:bg-amber-100' : ''}
          >
            {isClockedIn ? (
              <>
                <LogOut className="w-4 h-4 mr-1 text-amber-700" />
                Clock Out ({selectedEmp?.name?.split(' ')[0]})
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 mr-1" />
                Clock In ({selectedEmp?.name?.split(' ')[0]})
              </>
            )}
          </Button>

          {/* Bulk Mark Month Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBulkModalOpen(true)}
          >
            <SlidersHorizontal className="w-4 h-4 mr-1 text-slate-600" />
            Bulk Mark Month
          </Button>

          {/* Refresh Button */}
          <button
            onClick={() => {
              fetchRecords();
              refreshPayrollContext();
            }}
            disabled={isLoading}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh Attendance Records"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-teal-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left: Employee Selection List */}
        <div className="lg:w-72 shrink-0">
          <Card padded={false} className="overflow-hidden">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <ul className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {filteredEmployees.map((emp) => {
                const isSelected = selectedEmpId === emp.id;
                return (
                  <li key={emp.id}>
                    <button
                      onClick={() => setSelectedEmpId(emp.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none ${
                        isSelected
                          ? 'bg-[#E6F4DC] border-l-4 border-[#0E5A47]'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <Avatar
                        name={emp.name}
                        size="sm"
                        status={emp.status === 'ACTIVE' ? 'active' : 'resigned'}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {emp.name}
                          </p>
                          <span className="text-[10px] font-mono text-slate-400">
                            {emp.code}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {emp.designation} • {emp.department}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}

              {filteredEmployees.length === 0 && (
                <li className="p-6 text-center text-xs text-slate-400">
                  No employees found
                </li>
              )}
            </ul>
          </Card>
        </div>

        {/* Right: Calendar & Metrics Panel */}
        <div className="flex-1 space-y-4">
          {/* Selected Employee Info Banner */}
          {selectedEmp && (
            <Card className="bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-white border-teal-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <Avatar name={selectedEmp.name} size="md" status="active" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">{selectedEmp.name}</h2>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                        {selectedEmp.code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedEmp.designation} • {selectedEmp.department}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Worked Hours</p>
                    <p className="text-base font-bold text-teal-700">{totalWorkedHours} hrs</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Payable Days</p>
                    <p className="text-base font-bold text-emerald-800">
                      {Math.max(0, daysInMonth - unpaidLeaveCount - absentCount - halfDayCount * 0.5)} / {daysInMonth}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Month Navigator & Calendar Heatmap */}
          <Card padded={false}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-bold text-slate-800">
                  {MONTHS[monthIdx]} {year}
                </span>
                <span className="text-xs text-slate-400 ml-1">
                  ({records.length} records recorded)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={goBack}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 focus-visible:ring-2 focus-visible:ring-teal-500"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setYear(2026);
                    setMonthIdx(9); // October
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-mint-50 rounded-lg"
                >
                  Oct 2026
                </button>
                <button
                  onClick={goForward}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 focus-visible:ring-2 focus-visible:ring-teal-500"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
                <span>Click any date on the calendar below to view or edit attendance.</span>
                <span className="text-[11px] font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                  Interactive Heatmap
                </span>
              </div>

              <CalendarHeatmap
                year={year}
                month={month}
                days={attendanceDays}
                selectedDate={editingDate ?? undefined}
                onDayClick={(dateStr) => handleDayClick(dateStr)}
              />
            </div>
          </Card>

          {/* Monthly Summary Statistics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {summary.map(({ label, count, color }) => (
              <Card key={label} className="text-center py-3 px-2">
                <p className={`text-xl font-bold rounded-lg inline-block px-2.5 py-0.5 ${color}`}>
                  {count}
                </p>
                <p className="text-[11px] font-medium text-slate-500 mt-1">{label}</p>
              </Card>
            ))}
          </div>

          {/* Recent Day Punches & Audit Log */}
          {editingDate && (
            <Card
              title={`Attendance Details: ${editingDate}`}
              subtitle={`Manage daily check-in, check-out, and official status for ${selectedEmp?.name}`}
            >
              {(() => {
                const record = recordByDate.get(editingDate);
                const punches = record?.rndtechnosoft_attendance_punches || [];

                return (
                  <div className="space-y-4">
                    {/* Status & Times Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Attendance Status
                        </label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        >
                          <option value="PRESENT">Present (Full Day)</option>
                          <option value="HALF_DAY">Half Day (0.5 LOP)</option>
                          <option value="ABSENT">Absent (1.0 LOP)</option>
                          <option value="PAID_LEAVE">Paid Leave</option>
                          <option value="UNPAID_LEAVE">Unpaid Leave (1.0 LOP)</option>
                          <option value="HOLIDAY">Holiday</option>
                          <option value="WEEKEND">Weekend</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          First Check In
                        </label>
                        <input
                          type="time"
                          value={editCheckIn}
                          onChange={(e) => setEditCheckIn(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Last Check Out
                        </label>
                        <input
                          type="time"
                          value={editCheckOut}
                          onChange={(e) => setEditCheckOut(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Punches on this day */}
                    {punches.length > 0 && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          Punch Events ({punches.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {punches.map((p) => {
                            const timeStr = new Date(p.punch_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            return (
                              <span
                                key={p.id}
                                className={`text-xs px-2.5 py-1 rounded-lg font-mono font-medium border ${
                                  p.punch_type === 'IN'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {p.punch_type}: {timeStr} ({p.source})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Modal Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div>
                        {record && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={handleDeleteDay}
                            loading={isDeleting}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Delete Record
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDate(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSaveDay}
                          loading={isSaving}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Save Day Attendance
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Card>
          )}
        </div>
      </div>

      {/* Bulk Mark Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <Card className="w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-800">Bulk Mark Month</h3>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Quickly populate daily attendance records for <strong>{MONTHS[monthIdx]} {year}</strong>. Weekdays will be marked with the selected status, and Sundays will be marked as WEEKEND.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Employees
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkTarget('SELECTED')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      bulkTarget === 'SELECTED'
                        ? 'border-teal-500 bg-mint-50 text-[#0E5A47]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Only {selectedEmp?.name?.split(' ')[0] || 'Selected'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkTarget('ALL')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      bulkTarget === 'ALL'
                        ? 'border-teal-500 bg-mint-50 text-[#0E5A47]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    All Active ({employees.length})
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Weekday Status
                </label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as AttendanceStatus)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="PRESENT">Present (Full Day)</option>
                  <option value="PAID_LEAVE">Paid Leave</option>
                  <option value="ABSENT">Absent</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsBulkModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBulkMark}
                  loading={isBulking}
                >
                  Apply to Month
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
