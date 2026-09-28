import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Building,
  User,
  Info,
  HelpCircle,
} from 'lucide-react';
import { attendanceApi, AttendanceStatus, EmployeeMonthDayRecord } from '../../../api/attendance.api';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { formatShiftClock, shiftDisplayName } from '../shared/shift';

export interface RegularizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  departmentName?: string;
  dateStr: string; // YYYY-MM-DD
  dayRecord?: EmployeeMonthDayRecord | null;
}

const REASON_OPTIONS = [
  { value: 'BIOMETRIC_ERROR', label: 'Biometric Machine Failure / Sync Issue' },
  { value: 'FORGOT_PUNCH', label: 'Forgot to Clock In / Out' },
  { value: 'OFFICIAL_DUTY', label: 'Official Duty / Client Visit / Field Work' },
  { value: 'REMOTE_WORK', label: 'Approved Work From Home / Remote' },
  { value: 'SHIFT_OVERRIDE', label: 'Shift Schedule / Split Shift Override' },
  { value: 'OTHER', label: 'Other Justification' },
];

export const RegularizeModal: React.FC<RegularizeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  employeeId,
  employeeName,
  employeeCode,
  departmentName,
  dateStr,
  dayRecord,
}) => {
  // Extract initial times from dayRecord or default to shift times (09:30 - 18:30)
  const parseTimeToHHmm = (dateString?: string | null, fallback = '09:30'): string => {
    if (!dateString) return fallback;
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return fallback;
      // Format in Asia/Kolkata timezone
      const timeParts = d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return timeParts; // "08:30"
    } catch {
      return fallback;
    }
  };

  const [status, setStatus] = useState<AttendanceStatus>('PRESENT');
  const [inTime, setInTime] = useState<string>('09:30');
  const [outTime, setOutTime] = useState<string>('18:30');
  const [breakMinutes, setBreakMinutes] = useState<number>(60);
  const [reasonCategory, setReasonCategory] = useState<string>('BIOMETRIC_ERROR');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form when opened or record changes
  useEffect(() => {
    if (isOpen) {
      setStatus(dayRecord?.status || 'PRESENT');
      setInTime(parseTimeToHHmm(dayRecord?.firstCheckInAt, '09:30'));
      setOutTime(parseTimeToHHmm(dayRecord?.lastCheckOutAt, '18:30'));
      setBreakMinutes(dayRecord?.shift?.breakMinutes || 60);
      setReasonCategory('BIOMETRIC_ERROR');
      setRemarks('');
      setErrorMessage(null);
    }
  }, [isOpen, dayRecord]);

  // Calculate live worked duration
  const calculation = useMemo(() => {
    if (status === 'ABSENT' || status === 'UNPAID_LEAVE') {
      return { grossMinutes: 0, netMinutes: 0, netHours: 0, isCompliance: false };
    }
    if (status === 'HALF_DAY') {
      return { grossMinutes: 240, netMinutes: 240, netHours: 4.0, isCompliance: true };
    }
    if (status === 'PAID_LEAVE' || status === 'HOLIDAY' || status === 'WEEKEND') {
      return { grossMinutes: 480, netMinutes: 480, netHours: 8.0, isCompliance: true };
    }

    if (!inTime || !outTime) {
      return { grossMinutes: 0, netMinutes: 0, netHours: 0, isCompliance: false };
    }

    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);

    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) {
      return { grossMinutes: 0, netMinutes: 0, netHours: 0, isCompliance: false };
    }

    let diffMinutes = outH * 60 + outM - (inH * 60 + inM);
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60; // Handle overnight shifts
    }

    const net = Math.max(0, diffMinutes - (breakMinutes || 0));
    const hours = +(net / 60).toFixed(1);
    const standardMin = dayRecord?.shift?.standardMinutes || 480;

    return {
      grossMinutes: diffMinutes,
      netMinutes: net,
      netHours: hours,
      isCompliance: net >= standardMin,
    };
  }, [status, inTime, outTime, breakMinutes, dayRecord]);

  if (!isOpen) return null;

  // Format date readable
  let formattedDate = dateStr;
  try {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    formattedDate = d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    // fallback
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarks.trim()) {
      setErrorMessage('Please provide an audit justification remark for this regularization.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const selectedReasonText =
        REASON_OPTIONS.find((r) => r.value === reasonCategory)?.label || reasonCategory;
      const fullRemarks = `[Regularization - ${selectedReasonText}]: ${remarks.trim()}`;

      // Calculate payable minutes based on status
      let payableMinutes = 480;
      if (status === 'HALF_DAY') payableMinutes = 240;
      else if (status === 'ABSENT' || status === 'UNPAID_LEAVE') payableMinutes = 0;

      await attendanceApi.saveRecord({
        employeeId,
        attendanceDate: dateStr,
        attendanceStatus: status,
        sessions:
          status === 'PRESENT' || status === 'HALF_DAY'
            ? [
                {
                  clockIn: inTime,
                  clockOut: outTime,
                },
              ]
            : [],
        workedMinutes: calculation.netMinutes,
        payableMinutes,
        breakMinutes,
        source: 'REGULARIZATION',
        notes: fullRemarks,
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to regularize attendance:', err);
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Failed to submit regularization. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-in zoom-in-95">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/80">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-teal-100 text-teal-700">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">Regularize Staff Attendance</h3>
              </div>
              <p className="text-xs text-slate-500">
                Correct biometric punches, adjust shift hours, and record an authorized audit trail.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Employee & Date Strip */}
          <div className="px-5 py-3 bg-teal-50/40 border-b border-teal-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-teal-600" />
              <span className="font-bold text-slate-800">
                {employeeName || 'Staff Member'} {employeeCode ? `(${employeeCode})` : ''}
              </span>
              {departmentName && (
                <span className="text-slate-500">• {departmentName}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-teal-800 font-medium">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>{formattedDate}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
            {errorMessage && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Shift Reference */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="font-semibold text-slate-800 block">
                    {shiftDisplayName(dayRecord?.shift)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Standard: {formatShiftClock(dayRecord?.shift?.startTime)} – {formatShiftClock(dayRecord?.shift?.endTime)} (8.0h target)
                  </span>
                </div>
              </div>
              <Badge variant="neutral">Assigned Shift</Badge>
            </div>

            {/* Attendance Status */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                Regularized Attendance Status <span className="text-red-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="PRESENT">Present (Full Day • 1.0 Day)</option>
                <option value="HALF_DAY">Half Day (0.5 Payable)</option>
                <option value="PAID_LEAVE">Paid Leave (Official Leave)</option>
                <option value="UNPAID_LEAVE">Unpaid Leave / LOP (0.0 Payable)</option>
                <option value="ABSENT">Absent (Loss of Pay)</option>
              </select>
            </div>

            {/* Check-In and Check-Out Time Pickers */}
            {(status === 'PRESENT' || status === 'HALF_DAY') && (
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-teal-100 bg-teal-50/20">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    Regularized In-Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={inTime}
                    onChange={(e) => setInTime(e.target.value)}
                    required
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-mono text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <span className="text-[10px] text-slate-400 block">Shift start: 09:30 AM</span>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-rose-600" />
                    Regularized Out-Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={outTime}
                    onChange={(e) => setOutTime(e.target.value)}
                    required
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-mono text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <span className="text-[10px] text-slate-400 block">Shift end: 06:30 PM</span>
                </div>

                {/* Calculation summary */}
                <div className="col-span-2 pt-2 border-t border-teal-100/60 flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    Net Worked: <strong className="text-teal-700 font-mono">{calculation.netHours} hrs</strong> (60m lunch deducted)
                  </span>
                  {calculation.isCompliance ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Meets 8h Target
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5" /> Under 8h Standard
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Regularization Reason Category */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                Primary Reason for Regularization <span className="text-red-500">*</span>
              </label>
              <select
                value={reasonCategory}
                onChange={(e) => setReasonCategory(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Remarks / Justification */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 block">
                  Remarks & Audit Justification <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Required for compliance</span>
              </div>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Biometric thumb scanner was offline / staff was present in morning meeting / verified with branch manager..."
                required
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isSubmitting}>
                Apply Regularization
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
