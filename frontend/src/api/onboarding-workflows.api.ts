import { apiClient } from './client';

export type WorkflowStageType =
  | 'START'
  | 'STANDARD'
  | 'APPROVAL'
  | 'WAITING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'TRIGGER'
  | 'ACTION'
  | 'CONDITION'
  | 'DELAY'
  | 'NOTIFICATION'
  | 'TERMINAL';

export interface WorkflowStage {
  id: string;
  stageKey: string;
  name: string;
  description?: string | null;
  stageType: WorkflowStageType;
  isInitial: boolean;
  isTerminal: boolean;
  colorCode?: string | null;
  iconName?: string | null;
  positionX: number;
  positionY: number;
  displayOrder: number;
  stageConfig?: {
    requiredAction?:
      | 'NONE'
      | 'RECRUITER_REVIEW'
      | 'INTERVIEW'
      | 'OFFER_GENERATION'
      | 'OFFER_APPROVAL'
      | 'DOCUMENT_VERIFICATION'
      | 'EMPLOYEE_CONVERSION';
    requiredRole?: string;
    requiredNotes?: boolean;
    triggerEvent?: string;
    actionType?: string;
    conditionExpression?: string;
    notificationChannel?: 'EMAIL' | 'WHATSAPP' | 'IN_APP';
    delayMinutes?: number;
    [key: string]: any;
  } | null;
  isActive: boolean;
}

export interface WorkflowTransition {
  id?: string;
  fromStageId: string;
  toStageId: string;
  fromStageKey?: string | null;
  toStageKey?: string | null;
  name?: string | null;
  conditionType?: string | null;
  transitionConfig?: Record<string, any> | null;
}

export interface WorkflowVersion {
  id: string;
  versionNumber: number;
  versionStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  changeSummary?: string | null;
  publishedAt?: string | null;
  publishedByName?: string | null;
  canvasLayout?: { zoom: number; panX: number; panY: number } | null;
  stages: WorkflowStage[];
  transitions: WorkflowTransition[];
}

export interface WorkflowSummary {
  id: string;
  workflowCode: string;
  name: string;
  description: string | null;
  module: string;
  triggerType: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  candidateCount: number;
  publishedVersion: {
    id: string;
    versionNumber: number;
    publishedAt: string | null;
    stageCount: number;
    transitionCount: number;
  } | null;
  draftVersion: {
    id: string;
    versionNumber: number;
    stageCount: number;
    transitionCount: number;
  } | null;
  latestVersionNumber: number;
}

export interface WorkflowDetailResponse {
  workflow: WorkflowSummary;
  publishedVersion: WorkflowVersion | null;
  draftVersion: WorkflowVersion | null;
  history: Array<{
    id: string;
    versionNumber: number;
    versionStatus: string;
    publishedAt: string | null;
    publishedByName: string | null;
    changeSummary: string | null;
    stageCount: number;
    transitionCount: number;
  }>;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    stageCount: number;
    transitionCount: number;
    initialStages: string[];
    terminalStages: string[];
    unreachableStages: string[];
  };
}

export interface CandidateWorkflowStageOption {
  id: string;
  stageKey: string;
  name: string;
  description?: string | null;
  stageType: WorkflowStageType;
  isTerminal: boolean;
  colorCode?: string | null;
  iconName?: string | null;
  transitionName?: string;
  stageConfig?: any;
}

export interface CandidateStageOptionsResponse {
  candidate: {
    id: string;
    fullName: string;
    candidateCode: string;
    status: string;
    archivedAt: string | null;
  };
  workflow: {
    id: string;
    name: string;
    versionNumber: number;
    versionId: string;
  };
  currentStage: CandidateWorkflowStageOption | null;
  validNextStages: CandidateWorkflowStageOption[];
  allStages: CandidateWorkflowStageOption[];
}

const BASE = '/onboarding';

export const onboardingWorkflowsApi = {
  listWorkflows: async (module?: string): Promise<WorkflowSummary[]> => {
    const query = module && module !== 'ALL' ? `?module=${encodeURIComponent(module)}` : '';
    const res = await apiClient.get<{ success: boolean; data: WorkflowSummary[] }>(
      `${BASE}/workflows${query}`,
    );
    return res.data;
  },

  getActiveWorkflow: async (): Promise<{ workflow: any; version: WorkflowVersion }> => {
    const res = await apiClient.get<{ success: boolean; data: { workflow: any; version: WorkflowVersion } }>(
      `${BASE}/workflows/active`,
    );
    return res.data;
  },

  getWorkflow: async (id: string): Promise<WorkflowDetailResponse> => {
    const res = await apiClient.get<{ success: boolean; data: WorkflowDetailResponse }>(
      `${BASE}/workflows/${id}`,
    );
    return res.data;
  },

  createWorkflow: async (input: {
    name: string;
    workflowCode?: string;
    description?: string;
    module?: string;
    triggerType?: string;
    isDefault?: boolean;
  }): Promise<WorkflowDetailResponse> => {
    const res = await apiClient.post<{ success: boolean; data: WorkflowDetailResponse }>(
      `${BASE}/workflows`,
      input,
    );
    return res.data;
  },

  updateWorkflow: async (
    id: string,
    input: {
      name?: string;
      description?: string;
      module?: string;
      triggerType?: string;
      isActive?: boolean;
      isDefault?: boolean;
    },
  ): Promise<WorkflowDetailResponse> => {
    const res = await apiClient.put<{ success: boolean; data: WorkflowDetailResponse }>(
      `${BASE}/workflows/${id}`,
      input,
    );
    return res.data;
  },

  duplicateWorkflow: async (id: string): Promise<WorkflowDetailResponse> => {
    const res = await apiClient.post<{ success: boolean; data: WorkflowDetailResponse }>(
      `${BASE}/workflows/${id}/duplicate`,
    );
    return res.data;
  },

  deleteWorkflow: async (id: string): Promise<{ success: boolean; message: string; archived?: boolean }> => {
    const res = await apiClient.delete<{ success: boolean; data: any; message: string }>(
      `${BASE}/workflows/${id}`,
    );
    return { success: res.success, message: res.message, archived: res.data?.archived };
  },

  saveDraft: async (
    id: string,
    input: {
      changeSummary?: string;
      canvasLayout?: Record<string, any>;
      stages: any[];
      transitions: any[];
    },
  ): Promise<WorkflowDetailResponse> => {
    const res = await apiClient.put<{ success: boolean; data: WorkflowDetailResponse }>(
      `${BASE}/workflows/${id}/draft`,
      input,
    );
    return res.data;
  },

  validateWorkflow: async (id: string): Promise<WorkflowValidationResult> => {
    const res = await apiClient.get<{ success: boolean; data: WorkflowValidationResult }>(
      `${BASE}/workflows/${id}/validate`,
    );
    return res.data;
  },

  publishWorkflow: async (
    id: string,
    input?: { changeSummary?: string },
  ): Promise<WorkflowDetailResponse> => {
    const res = await apiClient.post<{ success: boolean; data: WorkflowDetailResponse }>(
      `${BASE}/workflows/${id}/publish`,
      input || {},
    );
    return res.data;
  },

  // Candidate stage transitions
  getCandidateStageOptions: async (candidateId: string): Promise<CandidateStageOptionsResponse> => {
    const res = await apiClient.get<{ success: boolean; data: CandidateStageOptionsResponse }>(
      `${BASE}/candidates/${candidateId}/valid-stages`,
    );
    return res.data;
  },

  changeCandidateStage: async (
    candidateId: string,
    stageIdOrKey: string,
    notes?: string,
  ): Promise<any> => {
    const res = await apiClient.post<{ success: boolean; data: any; message: string }>(
      `${BASE}/candidates/${candidateId}/stage`,
      {
        stageKey: stageIdOrKey,
        stageId: stageIdOrKey.includes('-') && stageIdOrKey.length === 36 ? stageIdOrKey : undefined,
        notes,
      },
    );
    return res.data;
  },

  overrideCandidateStage: async (
    candidateId: string,
    stageIdOrKey: string,
    reason: string,
  ): Promise<any> => {
    const res = await apiClient.post<{ success: boolean; data: any; message: string }>(
      `${BASE}/candidates/${candidateId}/override-stage`,
      {
        stageKey: stageIdOrKey,
        stageId: stageIdOrKey.includes('-') && stageIdOrKey.length === 36 ? stageIdOrKey : undefined,
        reason,
      },
    );
    return res.data;
  },
};
