/**
 * External API (COSEC Integration) — Frontend API client
 */

import { apiClient } from './client';

export interface CosecConfig {
  baseUrl: string;
  username: string;
  /** Left out to keep the saved password. */
  password?: string;
}

export interface CosecConfigPublic {
  baseUrl: string;
  username: string;
  passwordSet: boolean;
}

/** The every-minute COSEC sync of this workspace: on or off, and how its last run went. */
export interface CosecSyncStatus {
  configured: boolean;
  autoSyncEnabled: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: 'SUCCEEDED' | 'FAILED' | null;
  lastError: string | null;
  lastChangedRecords: number;
  lastUnmatchedUsers: number;
  /** Switched on, but no run for over 5 minutes: the cosec-sync worker isn't running. */
  workerSilent: boolean;
}

/** One employee's month refreshed from COSEC. */
export type CosecRefreshResult =
  | { status: 'NOT_CONFIGURED' }
  | { status: 'RECENT' | 'SYNCED'; syncedAt: string; changedRecords: number; skippedLocked?: number; matched?: boolean };

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface CosecUser {
  cosecUserId: string;
  name: string;
  shortName: string | null;
  referenceCode: string | null;
  active: boolean;
  department: string | null;
  designation: string | null;
  branch: string | null;
  joinDate: string | null;
  mobile: string | null;
  email: string | null;
  gender: string | null;
}

export interface CosecMonthlyAttendance {
  cosecUserId: string;
  employeeCode: string | null;
  employeeName: string;
  month: string;
  presentDays: number;
  absentDays: number;
  weekOffDays: number;
  publicHolidayDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  totalDays: number;
  payableDays: number;
  lossOfPayDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
}

export interface CosecPunchDetail {
  index: number;
  time: string;
  type: 'CHECK_IN' | 'CHECK_OUT';
  label: string;
}

export interface CosecDailyAttendance {
  cosecUserId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  firstCheckInTime: string | null;
  lastCheckOutTime: string | null;
  isCurrentlyInside: boolean;
  currentPresence: 'INSIDE' | 'OUTSIDE' | 'NOT_REPORTED';
  punches: CosecPunchDetail[];
  rawOutPunchTime?: string | null;
  outPunchMatchedIndex?: number | null;
  punchInTime: string | null;
  punchOutTime: string | null;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'WEEK_OFF' | 'HOLIDAY';
  firstHalf: string;
  secondHalf: string;
  shiftStart: string | null;
  workedMinutes: number;
  workTimeHhmm: string;
}

export interface SyncAllResult {
  users: { syncedCount: number; deletedMockCount: number };
  daily: { syncedRecords: number; syncedPunches: number };
  monthly: { syncedCount: number };
}

export const externalApiClient = {
  /**
   * Get the current COSEC config (password masked / passwordSet flag only).
   */
  async getCosecConfig(): Promise<CosecConfigPublic | null> {
    return apiClient.get<CosecConfigPublic | null>('/external-api/cosec/config');
  },

  /**
   * Save COSEC connection credentials.
   */
  async saveCosecConfig(config: CosecConfig): Promise<CosecConfigPublic> {
    return apiClient.put<CosecConfigPublic>('/external-api/cosec/config', config);
  },

  /**
   * Test connection. Sends the given config so the server can test before saving.
   */
  async testConnection(config: CosecConfig): Promise<TestConnectionResult> {
    return apiClient.post<TestConnectionResult>('/external-api/cosec/test-connection', config);
  },

  /**
   * Get all active COSEC users.
   */
  async getUsers(page = 1, limit = 25): Promise<{ total: number; page: number; limit: number; totalPages: number; hasMore: boolean; data: CosecUser[] }> {
    return apiClient.get(`/external-api/cosec/users?page=${page}&limit=${limit}`);
  },

  /**
   * Get monthly attendance for the given month.
   * @param month  YYYY-MM format
   */
  async getMonthlyAttendance(
    month: string,
    range = 'all',
    rangeId?: string,
    page = 1,
    limit = 25,
  ): Promise<{ month: string; total: number; page: number; limit: number; totalPages: number; hasMore: boolean; data: CosecMonthlyAttendance[] }> {
    const query = new URLSearchParams();
    query.append('month', month);
    query.append('range', range);
    if (rangeId) query.append('rangeId', rangeId);
    query.append('page', String(page));
    query.append('limit', String(limit));

    const qs = query.toString();
    return apiClient.get<{ month: string; total: number; page: number; limit: number; totalPages: number; hasMore: boolean; data: CosecMonthlyAttendance[] }>(
      `/external-api/cosec/attendance-monthly${qs ? `?${qs}` : ''}`,
    );
  },

  /**
   * Get daily attendance with punch in / out times for date range.
   */
  async getDailyAttendance(
    startDate?: string,
    endDate?: string,
    range = 'all',
    rangeId?: string,
    page = 1,
    limit = 25,
  ): Promise<{ total: number; page: number; limit: number; totalPages: number; hasMore: boolean; data: CosecDailyAttendance[] }> {
    const query = new URLSearchParams();
    if (startDate) query.append('startDate', startDate);
    if (endDate) query.append('endDate', endDate);
    query.append('range', range);
    if (rangeId) query.append('rangeId', rangeId);
    query.append('page', String(page));
    query.append('limit', String(limit));

    const qs = query.toString();
    return apiClient.get<{ total: number; page: number; limit: number; totalPages: number; hasMore: boolean; data: CosecDailyAttendance[] }>(
      `/external-api/cosec/attendance-daily${qs ? `?${qs}` : ''}`,
    );
  },

  /**
   * Sync all users from COSEC into the database, replacing mock data.
   */
  async syncUsers(): Promise<{
    syncedCount: number;
    deletedMockCount: number;
    employees: Array<{ id: string; employeeCode: string; name: string }>;
  }> {
    return apiClient.post('/external-api/cosec/sync-users');
  },

  /**
   * Sync daily attendance and punches into database.
   */
  async syncDailyAttendance(
    startDate?: string,
    endDate?: string,
  ): Promise<{ syncedRecords: number; syncedPunches: number }> {
    const query = new URLSearchParams();
    if (startDate) query.append('startDate', startDate);
    if (endDate) query.append('endDate', endDate);
    const qs = query.toString();
    return apiClient.post(`/external-api/cosec/sync-daily-attendance${qs ? `?${qs}` : ''}`);
  },

  /**
   * Sync monthly attendance from COSEC into attendance records.
   */
  async syncAttendance(month?: string): Promise<{
    syncedCount: number;
    records: CosecMonthlyAttendance[];
  }> {
    const qs = month ? `?month=${month}` : '';
    return apiClient.post(`/external-api/cosec/sync-attendance${qs}`);
  },

  /**
   * Master sync: Syncs all users, daily attendance punches, and monthly summary.
   */
  async syncAll(month?: string): Promise<SyncAllResult> {
    const qs = month ? `?month=${month}` : '';
    return apiClient.post<SyncAllResult>(`/external-api/cosec/sync-all${qs}`);
  },

  async getSyncStatus(): Promise<CosecSyncStatus> {
    return apiClient.get<CosecSyncStatus>('/external-api/cosec/sync-status');
  },

  async setAutoSync(enabled: boolean): Promise<CosecSyncStatus> {
    return apiClient.put<CosecSyncStatus>('/external-api/cosec/auto-sync', { enabled });
  },

  /** Brings one employee's month (so far) from COSEC into their attendance. */
  async refreshEmployee(employeeId: string, month: string): Promise<CosecRefreshResult> {
    return apiClient.post<CosecRefreshResult>('/external-api/cosec/refresh-employee', { employeeId, month });
  },
};
