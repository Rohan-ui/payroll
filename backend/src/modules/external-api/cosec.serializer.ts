/**
 * COSEC → Internal Domain Serializer
 *
 * Maps raw COSEC API JSON response shapes to our internal DTOs.
 * This is the ONLY place that knows about COSEC field names.
 * All other code uses internal domain types.
 */

/* ─────────────────────────────────────────────────────────────
   COSEC Raw Types (JSON format, all lowercase tags)
   ───────────────────────────────────────────────────────────── */

export interface CosecRawUser {
  id?: string;
  name?: string;
  'short-name'?: string;
  'reference-code'?: string;
  active?: string;         // "1" = active, "0" = inactive
  module?: string;
  'joining-date'?: string; // dd/mm/yyyy
  'leaving-date'?: string;
  gender?: string;
  pan?: string;
  'aadhar-no'?: string;
  uan?: string;
  'esi-no'?: string;
  organization?: string;
  branch?: string;
  department?: string;
  designation?: string;
  section?: string;
  category?: string;
  grade?: string;
  'personal-cell'?: string;
  'official-email'?: string;
  'official-cell'?: string;
  'full-name'?: string;
  [key: string]: string | undefined;
}

export interface CosecRawMonthlyAttendance {
  userid?: string;
  username?: string;
  pyear?: string;
  pmonth?: string;
  prdays?: string;    // present days (multiples of 0.5)
  abdays?: string;    // absent days
  wodays?: string;    // week-off days
  phdays?: string;    // public holiday days
  pldays?: string;    // paid leave days
  uldays?: string;    // unpaid leave days
  trdays?: string;    // tour days
  lodays?: string;    // lay-off days
  worktime?: string;  // minutes
  worktime_hhmm?: string;
  overtime?: string;  // minutes
  latein?: string;    // late-in minutes
  earlyout?: string;  // early-out minutes
  integration_reference?: string;
  [key: string]: string | undefined;
}

export interface CosecRawDailyAttendance {
  userid?: string;
  username?: string;
  punch1_date?: string;   // e.g. "21/09/2026"
  punch1_time?: string;
  punch2_time?: string;
  punch3_time?: string;
  punch4_time?: string;
  punch5_time?: string;
  punch6_time?: string;
  punch7_time?: string;
  punch8_time?: string;
  punch9_time?: string;
  punch10_time?: string;
  punch11_time?: string;
  punch12_time?: string;
  outpunch_time?: string;
  firsthalf?: string;     // "PR", "AB", "WO", "PH", etc.
  secondhalf?: string;    // "PR", "AB", "WO", "PH", "IN", etc.
  worktime_hhmm?: string; // "07:30"
  shiftstart?: string;    // "08:00" — start of the scheduled shift for this date
  shiftend?: string;      // "17:00" — end of the scheduled shift for this date
  scheduleshift?: string; // "GS" — shift code scheduled for this date
  workingshift?: string;  // "S3" — shift code COSEC evaluated the day against
  integration_reference?: string;
  [key: string]: string | undefined;
}

/* ─────────────────────────────────────────────────────────────
   Internal Serialized Shapes
   (used as the API response from ExternalApiController)
   ───────────────────────────────────────────────────────────── */

export interface CosecPunchDetail {
  index: number;
  time: string;
  type: 'CHECK_IN' | 'CHECK_OUT';
  label: string; // "Shift In", "Break Out", "Break In", "Shift Out / Break", etc.
}

export interface SerializedCosecUser {
  cosecUserId: string;         // COSEC user id field
  name: string;
  shortName: string | null;
  referenceCode: string | null; // maps to employee_code in our system
  active: boolean;
  department: string | null;
  designation: string | null;
  branch: string | null;
  joinDate: string | null;     // YYYY-MM-DD
  mobile: string | null;
  email: string | null;
  gender: string | null;
}

export interface SerializedCosecMonthlyAttendance {
  cosecUserId: string;
  employeeCode: string | null;  // same as referenceCode / USERID for matching
  employeeName: string;
  month: string;                // YYYY-MM
  presentDays: number;
  absentDays: number;
  weekOffDays: number;
  publicHolidayDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  totalDays: number;            // sum of all
  payableDays: number;          // presentDays + paidLeaveDays + publicHolidayDays
  lossOfPayDays: number;        // absentDays + unpaidLeaveDays
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
}

export interface SerializedCosecDailyAttendance {
  cosecUserId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  firstCheckInTime: string | null;  // Punch 1 (or first punch)
  lastCheckOutTime: string | null;  // Last even punch if checked out, or null if still inside
  isCurrentlyInside: boolean;       // true if last punch was an IN punch (odd)
  currentPresence: 'INSIDE' | 'OUTSIDE' | 'NOT_REPORTED';
  punches: CosecPunchDetail[];      // complete punch history for the day
  rawOutPunchTime: string | null;   // COSEC device reported outpunch_time
  outPunchMatchedIndex: number | null; // Punch index that matches outpunch_time
  punchInTime: string | null;       // compatibility
  punchOutTime: string | null;      // compatibility (only set if actually checked out)
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'WEEK_OFF' | 'HOLIDAY';
  firstHalf: string;
  secondHalf: string;
  shiftStart: string | null;        // "HH:MM"
  shiftEnd: string | null;          // "HH:MM"
  scheduledShiftCode: string | null;
  workingShiftCode: string | null;
  workedMinutes: number;
  workTimeHhmm: string;
}

/* ─────────────────────────────────────────────────────────────
   Helper utilities
   ───────────────────────────────────────────────────────────── */

function parseFloatSafe(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseIntSafe(val: string | undefined): number {
  if (!val) return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

/** Validate a COSEC clock value ("HH:MM" or "HH:MM:SS") and return "HH:MM", or null. */
export function parseCosecClock(val: string | undefined): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(val?.trim() ?? '');
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Convert COSEC date format dd/mm/yyyy or DDMMYYYY → YYYY-MM-DD.
 * Returns null if unparseable.
 */
export function parseCosecDate(val: string | undefined): string | null {
  if (!val || !val.trim()) return null;
  const s = val.trim();
  // Format 1: DD/MM/YYYY
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;
      if (dd && mm && yyyy) return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  // Format 2: DDMMYYYY (8 digits, e.g. 15022025)
  if (/^\d{8}$/.test(s)) {
    const dd = s.slice(0, 2);
    const mm = s.slice(2, 4);
    const yyyy = s.slice(4, 8);
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Build YYYY-MM month string from COSEC PYEAR + PMONTH fields.
 */
function buildMonthString(year: string | undefined, month: string | undefined): string {
  const y = (year ?? '').padStart(4, '20');
  const m = (month ?? '1').padStart(2, '0');
  return `${y}-${m}`;
}

/* ─────────────────────────────────────────────────────────────
   Serializer functions
   ───────────────────────────────────────────────────────────── */

/**
 * Serialize a list of COSEC raw users into clean internal user objects.
 */
export function serializeCosecUsers(rawUsers: CosecRawUser[]): SerializedCosecUser[] {
  return rawUsers
    .filter((u) => u.id)
    .map((u) => ({
      cosecUserId: u.id!,
      name: u['full-name'] || u.name || u.id!,
      shortName: u['short-name'] || null,
      referenceCode: u['reference-code'] || u.id || null,
      active: u.active === '1' || u.active === 'true',
      department: u['department-name'] || u.department || null,
      designation: u['designation-name'] || u.designation || null,
      branch: u['branch-name'] || u.branch || null,
      joinDate: parseCosecDate(u['joining-date']),
      mobile: u['personal-phone'] || u['personal-cell'] || u['official-cell'] || null,
      email: u['personal-email'] || u['official-email'] || null,
      gender: u.gender || null,
    }));
}

/**
 * Serialize a list of COSEC raw monthly attendance records.
 * The fallback month parameter is used when PYEAR/PMONTH are absent.
 */
export function serializeCosecMonthlyAttendance(
  rawRecords: CosecRawMonthlyAttendance[],
  fallbackMonth?: string, // YYYY-MM
): SerializedCosecMonthlyAttendance[] {
  return rawRecords
    .filter((r) => r.userid)
    .map((r) => {
      const presentDays = parseFloatSafe(r.prdays);
      const absentDays = parseFloatSafe(r.abdays);
      const weekOffDays = parseFloatSafe(r.wodays);
      const publicHolidayDays = parseFloatSafe(r.phdays);
      const paidLeaveDays = parseFloatSafe(r.pldays);
      const unpaidLeaveDays = parseFloatSafe(r.uldays);
      const tourDays = parseFloatSafe(r.trdays);
      const layOffDays = parseFloatSafe(r.lodays);

      const totalDays =
        presentDays + absentDays + weekOffDays + publicHolidayDays +
        paidLeaveDays + unpaidLeaveDays + tourDays + layOffDays;

      // Payable = present + paid leave + public holiday (not absent/unpaid)
      const payableDays = presentDays + paidLeaveDays + publicHolidayDays;
      // Loss of pay = absent + unpaid leave
      const lossOfPayDays = absentDays + unpaidLeaveDays;

      // Worked minutes from worktime (minutes) or parse from WORKTIME_HHMM
      let workedMinutes = parseIntSafe(r.worktime);
      if (!workedMinutes && r.worktime_hhmm) {
        const [hh, mm] = r.worktime_hhmm.split(':').map(Number);
        workedMinutes = (hh || 0) * 60 + (mm || 0);
      }

      const month =
        r.pyear && r.pmonth
          ? buildMonthString(r.pyear, r.pmonth)
          : (fallbackMonth ?? '');

      return {
        cosecUserId: r.userid!,
        employeeCode: r.integration_reference || r.userid || null,
        employeeName: r.username || r.userid!,
        month,
        presentDays,
        absentDays,
        weekOffDays,
        publicHolidayDays,
        paidLeaveDays,
        unpaidLeaveDays,
        totalDays,
        payableDays,
        lossOfPayDays,
        workedMinutes,
        overtimeMinutes: parseIntSafe(r.overtime),
        lateMinutes: parseIntSafe(r.latein),
        earlyOutMinutes: parseIntSafe(r.earlyout),
      };
    });
}

/**
 * Serialize a list of COSEC raw daily attendance records.
 * Accurately analyzes odd/even punches to determine whether employee is STILL INSIDE or OUTSIDE.
 */
export function serializeCosecDailyAttendance(
  rawRecords: CosecRawDailyAttendance[],
  fallbackDate?: string,
): SerializedCosecDailyAttendance[] {
  return rawRecords
    .filter((r) => r.userid)
    .map((r) => {
      const dateStr = parseCosecDate(r.punch1_date) || fallbackDate || new Date().toISOString().slice(0, 10);
      const fHalf = (r.firsthalf || '').trim().toUpperCase();
      const sHalf = (r.secondhalf || '').trim().toUpperCase();

      // Extract every populated punchN_time field returned by COSEC, in punch order
      const punchIndexes = Object.keys(r)
        .map((key) => /^punch(\d+)_time$/.exec(key)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number)
        .sort((a, b) => a - b);
      const punches: CosecPunchDetail[] = [];
      for (const i of punchIndexes) {
        const pTime = r[`punch${i}_time`]?.trim();
        if (pTime) {
          const isOdd = i % 2 === 1;
          let label = '';
          if (i === 1) label = 'Shift In';
          else if (i === 2) label = 'Break Out';
          else if (i === 3) label = 'Break In';
          else if (i === 4) label = 'Shift Out / Break';
          else if (i === 5) label = 'Break In';
          else if (i === 6) label = 'Shift Out';
          else label = isOdd ? 'In' : 'Out';

          punches.push({
            index: i,
            time: pTime,
            type: isOdd ? 'CHECK_IN' : 'CHECK_OUT',
            label,
          });
        }
      }

      const hasPunches = punches.length > 0;
      const lastPunch = hasPunches ? punches[punches.length - 1] : null;

      // Identify which punch matches COSEC's outpunch_time
      const rawOutPunch = r.outpunch_time?.trim() || null;
      let outPunchMatchedIndex: number | null = null;
      if (rawOutPunch && hasPunches) {
        const matchingPunch = punches.find((p) => p.time === rawOutPunch);
        if (matchingPunch) {
          outPunchMatchedIndex = matchingPunch.index;
        }
      }

      // Odd-numbered last punch (1, 3, 5, ...) means employee punched IN and has NOT punched out yet -> STILL INSIDE
      // Even-numbered last punch (2, 4, 6, ...) means employee punched OUT -> OUTSIDE
      const isCurrentlyInside = hasPunches && lastPunch?.type === 'CHECK_IN';
      const currentPresence: 'INSIDE' | 'OUTSIDE' | 'NOT_REPORTED' = !hasPunches
        ? 'NOT_REPORTED'
        : isCurrentlyInside
        ? 'INSIDE'
        : 'OUTSIDE';

      const firstCheckInTime = hasPunches ? punches[0].time : (r.punch1_time?.trim() || null);

      // Checkout time is set only if the employee has actually punched out (last punch is even)
      // If they are still inside, lastCheckOutTime is null (pending / inside)
      const lastCheckOutTime = !isCurrentlyInside && lastPunch?.type === 'CHECK_OUT'
        ? lastPunch.time
        : null;

      let status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'WEEK_OFF' | 'HOLIDAY' = 'ABSENT';
      if (fHalf === 'WO' || sHalf === 'WO') {
        status = 'WEEK_OFF';
      } else if (fHalf === 'PH' || sHalf === 'PH') {
        status = 'HOLIDAY';
      } else if (fHalf === 'PR' && sHalf === 'PR') {
        status = 'PRESENT';
      } else if (isCurrentlyInside || fHalf === 'PR' || sHalf === 'PR' || hasPunches) {
        if (fHalf === 'AB' && sHalf === 'PR' && !isCurrentlyInside) {
          status = 'HALF_DAY';
        } else if (fHalf === 'PR' && sHalf === 'AB' && !isCurrentlyInside) {
          status = 'HALF_DAY';
        } else {
          status = 'PRESENT';
        }
      }

      let workedMinutes = 0;
      const hhmm = r.worktime_hhmm?.trim() || '00:00';
      if (hhmm.includes(':')) {
        const [h, m] = hhmm.split(':').map(Number);
        workedMinutes = (h || 0) * 60 + (m || 0);
      }

      return {
        cosecUserId: r.userid!,
        employeeCode: r.integration_reference || r.userid!,
        employeeName: r.username || r.userid!,
        date: dateStr,
        firstCheckInTime,
        lastCheckOutTime,
        isCurrentlyInside,
        currentPresence,
        punches,
        rawOutPunchTime: rawOutPunch,
        outPunchMatchedIndex,
        punchInTime: firstCheckInTime,
        punchOutTime: lastCheckOutTime,
        status,
        firstHalf: fHalf,
        secondHalf: sHalf,
        shiftStart: parseCosecClock(r.shiftstart),
        shiftEnd: parseCosecClock(r.shiftend),
        scheduledShiftCode: r.scheduleshift?.trim() || null,
        workingShiftCode: r.workingshift?.trim() || null,
        workedMinutes,
        workTimeHhmm: hhmm,
      };
    });
}
