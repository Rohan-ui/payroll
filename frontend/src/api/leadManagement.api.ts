import { apiClient } from './client';

/** CRM Lead Management: the workspace's leads, filtered and paged by the server, and bulk assignment. */

export type LeadStatus = 'OPEN' | 'WON' | 'LOST';
export type LeadSort = 'created_at' | 'updated_at' | 'company_name' | 'lead_name' | 'stage';

export interface ManagedLead {
  id: string;
  leadCode: string;
  name: string;
  companyName: string;
  email: string;
  phone: string | null;
  source: { id: string; name: string } | null;
  pipeline: { id: string; name: string } | null;
  stage: { id: string; name: string; color: string | null } | null;
  status: LeadStatus;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadFilters {
  stages: { id: string; name: string; pipeline_id: string }[];
  pipelines: { id: string; name: string }[];
  sources: { id: string; name: string }[];
}

export interface LeadQuery {
  page: number;
  limit: number;
  search?: string;
  /** A member id, or "unassigned". */
  assigneeId?: string;
  pipelineId?: string;
  stageId?: string;
  sourceId?: string;
  status?: LeadStatus | '';
  sort: LeadSort;
  direction: 'asc' | 'desc';
}

export interface Assignee {
  id: string;
  name: string;
  email: string;
  /** Can be given leads: active, and their role can view leads. */
  eligible: boolean;
  leadsCount: number;
}

export interface AssignResult {
  updated: number;
  unchanged: number;
  replaced: number;
  assignee: { id: string; name: string } | null;
}

interface ListEnvelope {
  success: boolean;
  data: ManagedLead[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  filters: LeadFilters;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  return search.toString() ? `?${search}` : '';
};

export const leadManagementApi = {
  list: (query: LeadQuery) =>
    apiClient.get<ListEnvelope>(`/crm/lead-management${qs({ ...query })}`).then((r) => ({ items: r.data, pagination: r.pagination, filters: r.filters })),
  assignees: () => apiClient.get<{ success: boolean; data: Assignee[] }>('/crm/assignees').then((r) => r.data),
  /** All or nothing; a refusal carries the ids that failed in `errors.failedLeadIds`. */
  assign: (leadIds: string[], assigneeMemberId: string | null) =>
    apiClient
      .post<{ success: boolean; data: AssignResult; message: string }>('/crm/leads/assign', { leadIds, assigneeMemberId }, { feedback: { success: false, error: false } } as RequestInit)
      .then((r) => ({ ...r.data, message: r.message })),
};
