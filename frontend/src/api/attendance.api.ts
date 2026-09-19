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
};
