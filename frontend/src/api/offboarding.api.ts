import { apiClient } from './client';

/** Offboarding: resignations and other exits, their checklist and exit interview, and completing them. */

interface Envelope<T> { success: boolean; data: T; message?: string }
const data = async <T>(promise: Promise<Envelope<T>>) => (await promise).data;

export type SeparationType = 'RESIGNATION' | 'TERMINATION' | 'RETIREMENT' | 'CONTRACT_END';
export type SeparationStatus = 'PENDING_APPROVAL' | 'IN_PROGRESS' | 'COMPLETED' | 'WITHDRAWN' | 'CANCELLED';
export type ClearanceTeam = 'MANAGER' | 'IT' | 'ADMIN' | 'FINANCE' | 'HR';
export type ClearanceStatus = 'PENDING' | 'CLEARED' | 'WAIVED';

export interface ExitPerson { id: string; code: string; name: string; department: string | null; designation: string | null }

/** What the employee sees of their own exit. */
export interface OwnExit {
  id: string;
  employee: ExitPerson;
  type: SeparationType;
  status: SeparationStatus;
  isSelfService: boolean;
  reason: string | null;
  noticeDate: string;
  noticePeriodDays: number | null;
  requestedLastWorkingDate: string;
  lastWorkingDate: string;
  approvedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  exitInterviewDate: string | null;
  checklist: { id: string; team: ClearanceTeam; title: string; status: ClearanceStatus; clearedAt: string | null }[];
}

export type MyExit =
  | { linked: false }
  | { linked: true; employee: ExitPerson & { status: string; noticePeriodDays: number | null }; today: string; current: OwnExit | null; past: OwnExit[] };

export interface ExitDetail extends Omit<OwnExit, 'checklist' | 'reason'> {
  reason: string;
  requestedBy: string | null;
  approvedBy: string | null;
  completedBy: string | null;
  closedBy: string | null;
  closeReason: string | null;
  exitInterview: { date: string; notes: string | null; rehireEligible: boolean | null; recordedBy: string | null } | null;
  checklist: { id: string; team: ClearanceTeam; title: string; status: ClearanceStatus; note: string | null; clearedBy: string | null; clearedAt: string | null }[];
  hasSignIn: boolean;
  today: string;
  /** Why it can't be completed yet. */
  blockers: string[];
  warnings: string[];
}

export interface ExitRow {
  id: string;
  employee: ExitPerson;
  type: SeparationType;
  status: SeparationStatus;
  isSelfService: boolean;
  noticeDate: string;
  lastWorkingDate: string;
  checklist: { done: number; total: number };
}

export interface ExitSummary { pendingApproval: number; inProgress: number; leavingIn30Days: number; pastLastDay: number }
export interface Pagination { page: number; limit: number; total: number; totalPages: number }

const query = (q: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const offboardingApi = {
  mine: () => data(apiClient.get<Envelope<MyExit>>('/offboarding/my')),
  resign: (input: { reason: string; lastWorkingDate: string }) => data(apiClient.post<Envelope<MyExit>>('/offboarding/my/resignation', input)),
  withdraw: (reason?: string) => data(apiClient.post<Envelope<MyExit>>('/offboarding/my/resignation/withdraw', { reason })),

  summary: () => data(apiClient.get<Envelope<ExitSummary>>('/offboarding/summary')),
  list: (q: { status?: SeparationStatus; search?: string; page?: number; limit?: number }) =>
    apiClient.get<Envelope<ExitRow[]> & { pagination: Pagination }>(`/offboarding/separations${query(q)}`),
  detail: (id: string) => data(apiClient.get<Envelope<ExitDetail>>(`/offboarding/separations/${id}`)),
  /** Active employees without an exit in progress; `code` is the employee code. */
  employees: (search: string) =>
    data(apiClient.get<Envelope<(ExitPerson & { noticePeriodDays: number | null })[]>>(`/offboarding/employees${query({ search })}`)),
  start: (input: { employeeId: string; type: SeparationType; reason: string; noticeDate: string; lastWorkingDate: string }) =>
    data(apiClient.post<Envelope<ExitDetail>>('/offboarding/separations', input)),
  approve: (id: string, lastWorkingDate: string) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/approve`, { lastWorkingDate })),
  changeLastDay: (id: string, lastWorkingDate: string) => data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/last-working-date`, { lastWorkingDate })),
  saveInterview: (id: string, input: { interviewDate: string; notes: string; rehireEligible?: boolean }) =>
    data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/exit-interview`, input)),
  addItem: (id: string, input: { team: ClearanceTeam; title: string }) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/checklist`, input)),
  updateItem: (id: string, itemId: string, input: { status: ClearanceStatus; note?: string }) =>
    data(apiClient.put<Envelope<ExitDetail>>(`/offboarding/separations/${id}/checklist/${itemId}`, input)),
  cancel: (id: string, reason: string) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/cancel`, { reason })),
  complete: (id: string) => data(apiClient.post<Envelope<ExitDetail>>(`/offboarding/separations/${id}/complete`)),
};
