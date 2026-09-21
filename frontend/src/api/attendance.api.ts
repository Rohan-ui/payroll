import { apiClient } from './client';

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'PAID_LEAVE'
  | 'UNPAID_LEAVE'
  | 'HOLIDAY'
  | 'WEEKEND';

export interface BackendAttendancePunch {
  id: string;
  punch_at: string;
  punch_type: 'IN' | 'OUT';
  source: string;
}

export interface BackendAttendanceRecord {
  id: string;
  tenant_id: string;
  employee_id: string;
  attendance_date: string;
  attendance_status: AttendanceStatus;
  first_check_in_at?: string | null;
  last_check_out_at?: string | null;
  worked_minutes: number;
  payable_minutes: number;
  late_minutes: number;
  early_departure_minutes: number;
  overtime_minutes: number;
  source: string;
  approval_status: string;
  finalized_at?: string | null;
  created_at: string;
  updated_at: string;
  rndtechnosoft_employees?: {
    id: string;
    employee_code: string;
    first_name: string;
    last_name?: string | null;
    work_email?: string | null;
  };
  rndtechnosoft_shifts?: {
    shift_code: string;
    shift_name: string;
  } | null;
  rndtechnosoft_attendance_punches?: BackendAttendancePunch[];
}

export interface AttendanceListResponse {
  total: number;
  page: number;
  limit: number;
  items: BackendAttendanceRecord[];
}

export interface EmployeeAttendanceSummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  month: string;
  monthDays: number;
  recordedDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  lossOfPayDays: number;
  holidayDays: number;
  weekendDays: number;
  payableDays: number;
  totalWorkedMinutes: number;
  totalWorkedHours: number;
  totalOvertimeMinutes: number;
  totalLateMinutes: number;
}

export interface AttendanceSummaryResponse {
  month: string;
  totalEmployees: number;
  totalMonthDays: number;
  summaries: EmployeeAttendanceSummary[];
}

export interface BackendShiftBreak {
  id: string;
  break_name: string;
  break_duration_minutes: number;
  is_paid_break: boolean;
}

export interface BackendShift {
  id: string;
  tenant_id: string;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  standard_work_minutes: number;
  grace_in_minutes: number;
  grace_out_minutes: number;
  shift_status: string;
  rndtechnosoft_shift_breaks?: BackendShiftBreak[];
}

export interface TimeSession {
  clockIn: string;
  clockOut?: string;
}

export interface SaveAttendanceRecordInput {
  employeeId: string;
  attendanceDate: string; // YYYY-MM-DD
  attendanceStatus: AttendanceStatus;
  firstCheckInAt?: string;
  lastCheckOutAt?: string;
  workedMinutes?: number;
  payableMinutes?: number;
  shiftId?: string;
  source?: string;
  notes?: string;
  breakMinutes?: number;
  overtimeMinutes?: number;
  remoteMinutes?: number;
  sessions?: TimeSession[];
}



export interface UpdateAttendanceRecordInput {
  attendanceStatus?: AttendanceStatus;
  firstCheckInAt?: string;
  lastCheckOutAt?: string;
  workedMinutes?: number;
  payableMinutes?: number;
  shiftId?: string;
}

export interface BulkMarkMonthInput {
  month: string; // YYYY-MM e.g. "2026-10"
  employeeIds?: string[];
  defaultStatus?: AttendanceStatus;
  standardWorkMinutes?: number;
}

export interface RecordPunchInput {
  employeeId: string;
  punchAt?: string;
  punchType: 'IN' | 'OUT';
  source?: string;
  deviceReference?: string;
}

export const attendanceApi = {
  /**
   * Get daily records with pagination and filters
   */
  getRecords: async (params?: {
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<AttendanceListResponse> => {
    const query = new URLSearchParams();
    if (params?.employeeId) query.append('employeeId', params.employeeId);
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));

    const qs = query.toString();
    return apiClient.get<AttendanceListResponse>(`/attendance/records${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get single attendance record by ID
   */
  getRecordById: async (id: string): Promise<BackendAttendanceRecord> => {
    return apiClient.get<BackendAttendanceRecord>(`/attendance/records/${id}`);
  },

  /**
   * Create or upsert a daily attendance record
   */
  saveRecord: async (data: SaveAttendanceRecordInput): Promise<BackendAttendanceRecord> => {
    return apiClient.post<BackendAttendanceRecord>('/attendance/records', data);
  },

  /**
   * Update an existing attendance record
   */
  updateRecord: async (
    id: string,
    data: UpdateAttendanceRecordInput,
  ): Promise<BackendAttendanceRecord> => {
    return apiClient.patch<BackendAttendanceRecord>(`/attendance/records/${id}`, data);
  },

  /**
   * Delete an unfinalized attendance record
   */
  deleteRecord: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/attendance/records/${id}`);
  },

  /**
   * Get monthly aggregated attendance summary per employee
   */
  getSummary: async (month?: string, employeeId?: string): Promise<AttendanceSummaryResponse> => {
    const query = new URLSearchParams();
    if (month) query.append('month', month);
    if (employeeId) query.append('employeeId', employeeId);

    const qs = query.toString();
    return apiClient.get<AttendanceSummaryResponse>(`/attendance/summary${qs ? `?${qs}` : ''}`);
  },

  /**
   * Bulk mark/initialize attendance for a month
   */
  bulkMark: async (data: BulkMarkMonthInput) => {
    return apiClient.post('/attendance/bulk-mark', data);
  },

  /**
   * Clock in or out
   */
  recordPunch: async (data: RecordPunchInput) => {
    return apiClient.post('/attendance/punch', data);
  },

  /**
   * Get punch history
   */
  getPunches: async (employeeId?: string, date?: string) => {
    const query = new URLSearchParams();
    if (employeeId) query.append('employeeId', employeeId);
    if (date) query.append('date', date);

    const qs = query.toString();
    return apiClient.get(`/attendance/punches${qs ? `?${qs}` : ''}`);
  },

  /**
   * Seed demo attendance for tenant
   */
  seedAttendance: async (month?: string) => {
    return apiClient.post('/attendance/seed', { month: month || '2026-10' });
  },

  /**
   * Get active shifts for tenant
   */
  getShifts: async (): Promise<BackendShift[]> => {
    return apiClient.get<BackendShift[]>('/attendance/shifts');
  },

  /**
   * 1. Get department summary at a date
   */
  getDepartmentSummary: async (date?: string): Promise<DepartmentSummaryResponse> => {
    const query = new URLSearchParams();
    if (date) query.append('date', date);
    const qs = query.toString();
    return apiClient.get<DepartmentSummaryResponse>(`/attendance/department-summary${qs ? `?${qs}` : ''}`);
  },

  /**
   * 2. Get employee list at a date with filters and month strip
   */
  getEmployeeDayList: async (params?: {
    date?: string;
    departmentId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<EmployeeDayListResponse> => {
    const query = new URLSearchParams();
    if (params?.date) query.append('date', params.date);
    if (params?.departmentId) query.append('departmentId', params.departmentId);
    if (params?.search) query.append('search', params.search);
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return apiClient.get<EmployeeDayListResponse>(`/attendance/employee-day-list${qs ? `?${qs}` : ''}`);
  },

  /**
   * 3. Get roster matrix of employees x days of month
   */
  getRosterMatrix: async (params?: {
    month?: string;
    departmentId?: string;
    search?: string;
    selectedDate?: string;
  }): Promise<RosterMatrixResponse> => {
    const query = new URLSearchParams();
    if (params?.month) query.append('month', params.month);
    if (params?.departmentId) query.append('departmentId', params.departmentId);
    if (params?.search) query.append('search', params.search);
    if (params?.selectedDate) query.append('selectedDate', params.selectedDate);
    const qs = query.toString();
    return apiClient.get<RosterMatrixResponse>(`/attendance/roster-matrix${qs ? `?${qs}` : ''}`);
  },

  /**
   * 4. Get comprehensive monthly attendance for employee
   */
  getEmployeeMonth: async (employeeId: string, month?: string): Promise<EmployeeMonthResponse> => {
    const query = new URLSearchParams();
    query.append('employeeId', employeeId);
    if (month) query.append('month', month);
    const qs = query.toString();
    return apiClient.get<EmployeeMonthResponse>(`/attendance/employee-month?${qs}`);
  },

  /**
   * 5. Get 12-month array for Year at a Glance
   */
  getEmployeeYear: async (employeeId: string, year?: number): Promise<EmployeeYearResponse> => {
    const query = new URLSearchParams();
    query.append('employeeId', employeeId);
    if (year) query.append('year', String(year));
    const qs = query.toString();
    return apiClient.get<EmployeeYearResponse>(`/attendance/employee-year?${qs}`);
  },
};

export interface TrendDay {
  date: string;
  dayName: string;
  attendancePct: number | null;
  isOff: boolean;
}

export interface DepartmentCardData {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  headcount: number;
  presentCount: number;
  absentCount: number;
  halfDayCount: number;
  leaveCount: number;
  lateCount: number;
  attendancePct: number | null;
  presentPct: number;
  halfDayPct: number;
  leavePct: number;
  absentPct: number;
  trend7Days: TrendDay[];
}

export interface DepartmentSummaryResponse {
  date: string;
  isHoliday: boolean;
  holidayName: string | null;
  isWeeklyOff: boolean;
  overall: {
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
}

export interface EmployeeDayItem {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  roleName: string;
  departmentId: string;
  departmentName: string;
  dayStatus: AttendanceStatus;
  inTime: string | null;
  outTime: string | null;
  workedMinutes: number;
  lateMinutes: number;
  isLate: boolean;
  monthAttendancePct: number;
  monthDays: Array<{
    day: number;
    date: string;
    status: AttendanceStatus;
    workedMinutes: number;
    isLate: boolean;
  }>;
  last14Days: Array<{
    date: string;
    day: number;
    workedMinutes: number;
    status: AttendanceStatus;
  }>;
}

export interface EmployeeDayListResponse {
  total: number;
  page: number;
  limit: number;
  items: EmployeeDayItem[];
}

export interface MatrixDayCell {
  day: number;
  date: string;
  status: AttendanceStatus;
  glyph: string;
  inTime: string | null;
  outTime: string | null;
  workedHours: number;
  isLate: boolean;
  source: string;
}

export interface MatrixEmployee {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  monthAttendancePct: number;
  days: MatrixDayCell[];
}

export interface MatrixGroup {
  departmentId: string;
  departmentName: string;
  employees: MatrixEmployee[];
}

export interface RosterMatrixResponse {
  month: string;
  daysInMonth: number;
  daysHeader: Array<{
    day: number;
    date: string;
    weekday: string;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName: string | null;
  }>;
  kpis: {
    presentCount: number;
    absentCount: number;
    leaveCount: number;
    lateCount: number;
    headcount: number;
  };
  departmentLeaderboard: Array<{
    departmentId: string;
    departmentName: string;
    headcount: number;
    attendancePct: number;
    presentPct: number;
    halfDayPct: number;
    leavePct: number;
    absentPct: number;
  }>;
  groups: MatrixGroup[];
}

export interface EmployeeMonthDayRecord {
  date: string;
  day: number;
  weekday: string;
  status: AttendanceStatus;
  glyph: string;
  firstCheckInAt: string | null;
  lastCheckOutAt: string | null;
  workedMinutes: number;
  workedHours: number;
  lateMinutes: number;
  overtimeMinutes: number;
  isLate: boolean;
  source: string;
  leaveType?: string;
  holidayName?: string;
  shift: {
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes: number;
    standardMinutes: number;
    breakMinutes: number;
  };
  punches: Array<{
    id: string;
    punchAt: string;
    punchType: 'IN' | 'OUT' | 'CHECK_IN' | 'CHECK_OUT';
    source: string;
    deviceReference?: string;
  }>;
}

export interface EmployeeMonthResponse {
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    email?: string | null;
    designation: string;
    departmentId: string;
    departmentName: string;
  };
  month: string;
  workingDays: number;
  attendancePct: number;
  payableDays: number;
  totalWorkedHours: number;
  stats: {
    presentDays: number;
    absentDays: number;
    lopCount: number;
    halfDays: number;
    leaveDays: number;
    lateMarks: number;
    avgCheckInTime: string;
    overtimeHours: number;
    bestStreakDays: number;
  };
  leaveBalances: {
    casual: { total: number; used: number; remaining: number };
    sick: { total: number; used: number; remaining: number };
    earned: { total: number; used: number; remaining: number };
  };
  days: EmployeeMonthDayRecord[];
}

export interface EmployeeYearResponse {
  year: number;
  months: Array<{
    month: string;
    monthName: string;
    attendancePct: number;
    days: Array<{
      date: string;
      day: number;
      status: AttendanceStatus;
    }>;
  }>;
}


