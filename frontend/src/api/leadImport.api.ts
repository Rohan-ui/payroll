import { apiClient } from './client';
import type { ImportRow } from '../lib/leadImportSheet';

/** Spreadsheet lead import: into Client Outreach (enrolled in the cadence) or a sales pipeline. */

export type ImportDestination = 'CLIENT_OUTREACH' | 'SALES_PIPELINE';
export type ImportRowOutcome = 'READY' | 'IMPORTED' | 'DUPLICATE' | 'FAILED';

export interface ImportPipeline {
  id: string;
  name: string;
  kind: 'SALES' | 'OUTREACH';
  isDefault: boolean;
  /** Open stages, in order. */
  stages: { id: string; name: string }[];
}

export interface ImportOptions {
  pipelines: ImportPipeline[];
  /** Every active team member; `eligible` false for those whose role can't view leads. */
  assignees: { id: string; name: string; email: string; eligible: boolean }[];
  /** The person importing: the assignee chosen by default. */
  currentMemberId: string;
  /** The workspace's outreach cadence, the 30-day SOP every Client Outreach lead follows. */
  cadence: { name: string; steps: number; days: number };
  canImportToOutreach: boolean;
}

export interface ImportRowResult {
  rowNumber: number;
  outcome: ImportRowOutcome;
  companyName: string | null;
  email: string | null;
  reasons: string[];
  warnings: string[];
  leadId?: string;
  leadCode?: string;
}

export interface ImportResult {
  dryRun: boolean;
  destination: ImportDestination;
  pipeline: { id: string; name: string };
  stage: { id: string; name: string };
  /** Who the leads go to unless a row's "Assigned to" names another member. */
  assignee: { id: string; name: string };
  cadence: { name: string; steps: number; days: number } | null;
  summary: { processed: number; ready: number; imported: number; duplicates: number; failed: number; enrolled: number; withWarnings: number };
  rows: ImportRowResult[];
}

export interface ImportRequest {
  destination: ImportDestination;
  /** Left out for Client Outreach to import into the 30-day SOP itself. */
  pipelineId?: string;
  stageId?: string;
  assigneeMemberId?: string;
  fileName?: string;
  rows: ImportRow[];
}

/** Rows one import may hold (the server's limit). */
export const MAX_IMPORT_ROWS = 1000;

const quiet = { feedback: { success: false, error: false } } as RequestInit;

export const leadImportApi = {
  options: () => apiClient.get<{ success: boolean; data: ImportOptions }>('/crm/leads/import/options', quiet).then((r) => r.data),
  /** Checks every row and reports what would happen; saves nothing. */
  preview: (request: ImportRequest) =>
    apiClient.post<{ success: boolean; data: ImportResult }>('/crm/leads/import', { ...request, dryRun: true }, quiet).then((r) => r.data),
  run: (request: ImportRequest) =>
    apiClient.post<{ success: boolean; data: ImportResult }>('/crm/leads/import', request, quiet).then((r) => r.data),
};
