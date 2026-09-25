import type { EmployeeMonthDayRecord } from '../../../api/attendance.api';

type DayShift = EmployeeMonthDayRecord['shift'];

/** "08:00" → 8, "17:30" → 17.5; null for missing/invalid values. */
export const shiftClockToHours = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

/** "17:00" → "05:00 PM"; "—" when unknown. */
export const formatShiftClock = (hhmm: string | null | undefined): string => {
  const hours = shiftClockToHours(hhmm);
  if (hours === null || !hhmm) return '—';
  const h = Math.floor(hours);
  return `${String(h % 12 || 12).padStart(2, '0')}:${hhmm.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** Device shift code (noting a different working shift), else configured shift name. */
export const shiftDisplayName = (shift: DayShift | undefined): string => {
  if (shift?.scheduledCode) {
    return shift.workingCode && shift.workingCode !== shift.scheduledCode
      ? `${shift.scheduledCode} (worked as ${shift.workingCode})`
      : shift.scheduledCode;
  }
  return shift?.name || '—';
};
