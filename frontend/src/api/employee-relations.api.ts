import { apiClient } from './client';

/** An employee's reporting manager (effective-dated history) and linked sign-in account. */

interface Envelope<T> { success: boolean; data: T; message?: string }
const data = async <T>(promise: Promise<Envelope<T>>) => (await promise).data;

export interface ReportingLine {
  lineId: string;
  manager: { id: string; name: string; code: string };
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  reason: string | null;
  setBy: string | null;
  setAt: string;
  cancelledBy: string | null;
  cancellationReason: string | null;
}

export interface Reporting { current: ReportingLine | null; upcoming: ReportingLine | null; history: ReportingLine[] }

export interface LoginLink {
  linked: { tenantMemberId: string; name: string; email: string | null; active: boolean } | null;
  linkedOutsideWorkspace: boolean;
  suggestions: { tenantMemberId: string; name: string; email: string }[];
}

export const employeeRelationsApi = {
  reporting: (employeeId: string) => data(apiClient.get<Envelope<Reporting>>(`/employees/${employeeId}/reporting`)),
  setManager: (employeeId: string, input: { managerEmployeeId: string; effectiveFrom: string; reason?: string }) =>
    data(apiClient.post<Envelope<Reporting>>(`/employees/${employeeId}/reporting`, input)),
  endManager: (employeeId: string, lineId: string, effectiveTo: string) => data(apiClient.post<Envelope<Reporting>>(`/employees/${employeeId}/reporting/${lineId}/end`, { effectiveTo })),
  cancelManager: (employeeId: string, lineId: string, reason: string) => data(apiClient.post<Envelope<Reporting>>(`/employees/${employeeId}/reporting/${lineId}/cancel`, { reason })),
  login: (employeeId: string) => data(apiClient.get<Envelope<LoginLink>>(`/employees/${employeeId}/login`)),
  /** Active members, by name or sign-in email, not linked to another employee; `code` is their email. */
  candidates: (employeeId: string, search: string) =>
    data(apiClient.get<Envelope<{ id: string; name: string; code: string }[]>>(`/employees/${employeeId}/login/candidates?search=${encodeURIComponent(search)}`)),
  link: (employeeId: string, tenantMemberId: string) => data(apiClient.put<Envelope<LoginLink>>(`/employees/${employeeId}/login`, { tenantMemberId })),
  unlink: (employeeId: string) => data(apiClient.delete<Envelope<LoginLink>>(`/employees/${employeeId}/login`)),
};
