import { apiClient, apiFetch } from './client';

/**
 * Downloads a report file from the API with the session (a plain link would
 * carry no sign-in) and returns it with the server's file name.
 */
export async function downloadReport(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
  const response = await apiFetch(`/api/v1${path}`, { cache: 'no-store', feedback: { success: false, error: false } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'The report could not be created. Try again.');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition) ?? /filename="?([^";]+)"?/.exec(disposition);
  return { blob: await response.blob(), filename: match ? decodeURIComponent(match[1]) : fallbackName };
}

/** Each area's current figures; an area the member may not report on is null. Amounts are decimal strings in rupees. */
export interface ReportsOverview {
  people: { active: number; onNotice: number; inactive: number; joinedThisMonth: number } | null;
  attendance: { month: string; attendanceRate: number | null; absentDays: number; leaveDays: number; lateMarks: number; overtimeHours: number } | null;
  leave: { pending: number; onLeaveToday: number; approvedDaysThisMonth: number } | null;
  payroll: { latestPeriod: { code: string; employees: number; gross: string; deductions: string; net: string } | null; openPeriods: number } | null;
  exits: { inProgress: number; leavingIn30Days: number; completedThisYear: number } | null;
  sales: { leads: number; openDeals: number; openValue: string; wonThisMonth: number; wonThisMonthValue: string } | null;
}

export async function reportsOverview(): Promise<ReportsOverview> {
  return (await apiClient.get<{ success: boolean; data: ReportsOverview }>('/reports/overview')).data;
}
