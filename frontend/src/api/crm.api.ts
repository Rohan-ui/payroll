import { apiClient } from './client';
import {
  CrmPipeline,
  CrmLead,
  CrmActivity,
  CrmFollowup,
  CrmMeeting,
  CrmQuotation,
  CadenceMatrixLead,
  CrmAuditLog,
  CrmServiceMaster,
  CrmObjectionBattlecard,
} from '../types/crm.types';

/** CRM report figures from the server; amounts are rupee decimal strings. */
export interface CrmReportSummary {
  totals: { openCount: number; openValue: string; weightedForecast: string; wonCount: number; wonValue: string; lostCount: number; winRate: number | null; averageWon: string | null };
  stages: { id: string; name: string; color: string; pipelineId: string; pipelineName: string; count: number; value: string }[];
  sources: { name: string; leads: number; won: number; value: string }[];
  assignees: { name: string; open: number; openValue: string; won: number }[];
  wonByMonth: { month: string; won: number; value: string }[];
}

export const crmApi = {
  reportSummary: async () => apiClient.get<{ success: boolean; data: CrmReportSummary }>('/crm/reports/summary'),

  // Pipelines & Stages
  getPipelines: async () => {
    return apiClient.get<CrmPipeline[]>('/crm/pipelines');
  },

  createPipeline: async (data: { name: string; code: string; isDefault?: boolean }) => {
    return apiClient.post<CrmPipeline>('/crm/pipelines', data);
  },

  // Leads & Kanban
  getLeads: async (query?: {
    pipelineId?: string;
    stageId?: string;
    temperature?: string;
    search?: string;
  }) => {
    const params = new URLSearchParams();
    if (query?.pipelineId) params.append('pipelineId', query.pipelineId);
    if (query?.stageId) params.append('stageId', query.stageId);
    if (query?.temperature) params.append('temperature', query.temperature);
    if (query?.search) params.append('search', query.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<CrmLead[]>(`/crm/leads${qs}`);
  },

  getLeadById: async (id: string) => {
    return apiClient.get<CrmLead>(`/crm/leads/${id}`);
  },

  createLead: async (data: any) => {
    return apiClient.post<CrmLead>('/crm/leads', data);
  },

  updateLeadStage: async (leadId: string, stageId: string) => {
    return apiClient.put<CrmLead>(`/crm/leads/${leadId}/stage`, { stageId });
  },

  convertDealWon: async (leadId: string) => {
    return apiClient.post<{
      message: string;
      lead: CrmLead;
      client: any;
      bookkeepingInvoice?: any;
    }>(`/crm/leads/${leadId}/convert-won`, {});
  },

  // 30-Day Cadence
  getCadenceMatrix: async () => {
    return apiClient.get<{
      sopSteps: any[];
      leadsOnCadence: CadenceMatrixLead[];
    }>('/crm/cadence');
  },

  executeCadenceStep: async (data: { leadId: string; channel: string; notes?: string }) => {
    return apiClient.post<{ message: string; activity: CrmActivity }>('/crm/cadence/step-action', data);
  },

  // Activities, Followups, Meetings
  addActivity: async (data: {
    leadId: string;
    activityType: string;
    title: string;
    description?: string;
    durationSeconds?: number;
    callDisposition?: string;
  }) => {
    return apiClient.post<CrmActivity>('/crm/activities', data);
  },

  getFollowups: async () => {
    return apiClient.get<CrmFollowup[]>('/crm/followups');
  },

  createFollowup: async (data: {
    leadId: string;
    scheduledAt: string;
    followupType?: string;
    priority?: string;
    instructions?: string;
  }) => {
    return apiClient.post<CrmFollowup>('/crm/followups', data);
  },

  completeFollowup: async (id: string, outcomeNote?: string) => {
    return apiClient.put<CrmFollowup>(`/crm/followups/${id}/complete`, { outcomeNote });
  },

  getMeetings: async () => {
    return apiClient.get<CrmMeeting[]>('/crm/meetings');
  },

  createMeeting: async (data: {
    leadId: string;
    title: string;
    meetingType?: string;
    scheduledAt: string;
    meetingLink?: string;
  }) => {
    return apiClient.post<CrmMeeting>('/crm/meetings', data);
  },

  saveMeetingMom: async (meetingId: string, minutesOfMeeting: string) => {
    return apiClient.put<CrmMeeting>(`/crm/meetings/${meetingId}/mom`, { minutesOfMeeting });
  },

  // GST Quotations
  getQuotations: async () => {
    return apiClient.get<CrmQuotation[]>('/crm/quotations');
  },

  createQuotation: async (data: {
    leadId: string;
    clientState?: string;
    branchState?: string;
    taxMode?: string;
    validDays?: number;
    notes?: string;
    items: Array<{
      serviceId?: string;
      description: string;
      sacCode?: string;
      quantity: number;
      unitRate: number;
    }>;
  }) => {
    return apiClient.post<CrmQuotation>('/crm/quotations', data);
  },

  // Masters & Audit
  getMasters: async () => {
    return apiClient.get<{
      services: CrmServiceMaster[];
      lostReasons: any[];
      sopSteps: any[];
      objections: CrmObjectionBattlecard[];
      industries: any[];
    }>('/crm/masters');
  },

  getAuditLogs: async () => {
    return apiClient.get<CrmAuditLog[]>('/crm/audit-logs');
  },
};
