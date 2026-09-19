import { apiClient } from './client';
import {
  FinancialYear,
  AccountingLedger,
  BookkeepingEntry,
  TrialBalanceResponse,
  SyncAccountingResult,
} from '../types/bookkeeping.types';

export const bookkeepingApi = {
  getFinancialYears: async (): Promise<FinancialYear[]> => {
    return apiClient.get<FinancialYear[]>('/bookkeeping/financial-years');
  },

  getCurrentFinancialYear: async (): Promise<FinancialYear> => {
    return apiClient.get<FinancialYear>('/bookkeeping/financial-years/current');
  },

  createFinancialYear: async (data: {
    financialYearCode: string;
    financialYearName: string;
    startDate: string;
    endDate: string;
    assessmentYear?: string;
    notes?: string;
  }): Promise<FinancialYear> => {
    return apiClient.post<FinancialYear>('/bookkeeping/financial-years', data);
  },

  closeFinancialYear: async (id: string): Promise<FinancialYear> => {
    return apiClient.post<FinancialYear>(`/bookkeeping/financial-years/${id}/close`, {});
  },

  getLedgers: async (): Promise<AccountingLedger[]> => {
    return apiClient.get<AccountingLedger[]>('/bookkeeping/ledgers');
  },

  getTrialBalance: async (financialYearId?: string): Promise<TrialBalanceResponse> => {
    const query = financialYearId ? `?financialYearId=${financialYearId}` : '';
    return apiClient.get<TrialBalanceResponse>(`/bookkeeping/trial-balance${query}`);
  },

  getJournalEntries: async (params?: {
    financialYearId?: string;
    runId?: string;
    limit?: number;
  }): Promise<BookkeepingEntry[]> => {
    const searchParams = new URLSearchParams();
    if (params?.financialYearId) searchParams.set('financialYearId', params.financialYearId);
    if (params?.runId) searchParams.set('runId', params.runId);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return apiClient.get<BookkeepingEntry[]>(`/bookkeeping/entries${query}`);
  },

  syncAllHistoricalAccounting: async (): Promise<SyncAccountingResult> => {
    return apiClient.post<SyncAccountingResult>('/bookkeeping/sync-all', {});
  },

  postRunAccrual: async (runId: string): Promise<BookkeepingEntry> => {
    return apiClient.post<BookkeepingEntry>(`/bookkeeping/post-run/${runId}`, {});
  },
};
