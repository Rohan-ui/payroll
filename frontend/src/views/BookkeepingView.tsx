import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Calendar,
  Layers,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Plus,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { bookkeepingApi } from '../api/bookkeeping.api';
import {
  FinancialYear,
  AccountingLedger,
  BookkeepingEntry,
  TrialBalanceResponse,
  SyncAccountingResult,
} from '../types/bookkeeping.types';

type ActiveTab = 'trial-balance' | 'journal-entries' | 'chart-of-accounts' | 'financial-years';

export const BookkeepingView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('trial-balance');
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [trialBalance, setTrialBalance] = useState<TrialBalanceResponse | null>(null);
  const [journalEntries, setJournalEntries] = useState<BookkeepingEntry[]>([]);
  const [ledgers, setLedgers] = useState<AccountingLedger[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  // Load initial FY and data
  const loadData = useCallback(async (fyId?: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch Financial Years
      const fys = await bookkeepingApi.getFinancialYears();
      setFinancialYears(fys);

      const targetFy = fyId
        ? fys.find((f) => f.id === fyId)
        : fys.find((f) => f.is_current) || fys[0];

      const currentId = targetFy?.id || '';
      setSelectedFyId(currentId);

      // 2. Fetch Trial Balance, Entries, and Ledgers concurrently
      const [tbData, entriesData, ledgersData] = await Promise.all([
        bookkeepingApi.getTrialBalance(currentId || undefined),
        bookkeepingApi.getJournalEntries(currentId ? { financialYearId: currentId } : undefined),
        bookkeepingApi.getLedgers(),
      ]);

      setTrialBalance(tbData);
      setJournalEntries(entriesData);
      setLedgers(ledgersData);
    } catch (err) {
      console.error('Failed to load bookkeeping data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle FY Selection change
  const handleFyChange = async (fyId: string) => {
    setSelectedFyId(fyId);
    setIsLoading(true);
    try {
      const [tbData, entriesData] = await Promise.all([
        bookkeepingApi.getTrialBalance(fyId),
        bookkeepingApi.getJournalEntries({ financialYearId: fyId }),
      ]);
      setTrialBalance(tbData);
      setJournalEntries(entriesData);
    } catch (err) {
      console.error('Failed to switch FY:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // "Do it all over" retroactive sync action
  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const result: SyncAccountingResult = await bookkeepingApi.syncAllHistoricalAccounting();
      setSyncFeedback(
        `Successfully accounted for ${result.payrollRunsProcessed} payroll runs into ${result.financialYearCode} (Total Debits: ₹${parseFloat(result.totalDebits).toLocaleString('en-IN')})`,
      );
      await loadData(selectedFyId);
    } catch (err: any) {
      console.error('Failed to auto-sync accounting:', err);
      setSyncFeedback('Failed to synchronize bookkeeping. Please check backend logs.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 8000);
    }
  };

  // Compute summary metrics from Trial Balance
  const totalExpense =
    trialBalance?.items
      .filter((i) => i.accountCategory === 'EXPENSE')
      .reduce((sum, i) => sum + parseFloat(i.totalDebits || '0'), 0) || 0;

  const totalPayable =
    trialBalance?.items
      .filter((i) => i.ledgerCode === 'LIA_NET_SALARY_PAYABLE')
      .reduce((sum, i) => sum + parseFloat(i.totalCredits || '0'), 0) || 0;

  const totalStatutory =
    trialBalance?.items
      .filter((i) =>
        ['LIA_PF_PAYABLE', 'LIA_ESI_PAYABLE', 'LIA_PT_PAYABLE', 'LIA_TDS_PAYABLE'].includes(
          i.ledgerCode,
        ),
      )
      .reduce((sum, i) => sum + parseFloat(i.totalCredits || '0'), 0) || 0;

  const selectedFy = financialYears.find((f) => f.id === selectedFyId) || trialBalance?.financialYear;

  return (
    <div className="space-y-6">
      {/* ── Header & Action Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">Financial Year & Bookkeeping</h1>
            <Badge variant="info" size="sm">
              Double-Entry Ledger
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Automated payroll accrual, statutory liabilities, and annual trial balance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* FY Selector Dropdown */}
          <div className="relative">
            <select
              value={selectedFyId}
              onChange={(e) => handleFyChange(e.target.value)}
              className="h-10 pl-3.5 pr-8 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Select Financial Year"
            >
              {financialYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.financial_year_code} ({new Date(fy.start_date).getFullYear()}–
                  {new Date(fy.end_date).getFullYear()}) {fy.is_current ? '• Active' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Retroactive Auto-Sync ("Do it all over") */}
          <Button
            variant="primary"
            onClick={handleSyncAll}
            disabled={isSyncing}
            className="gap-2 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Accounting All Runs…' : 'Auto-Account All Payroll'}
          </Button>
        </div>
      </div>

      {/* Sync Feedback Banner */}
      {syncFeedback && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* ── 4 Top-Level Accounting KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Wage Expense */}
        <Card className="p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Gross Salaries Expense</span>
            <span className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            ₹{totalExpense.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-teal-700 font-medium">
            <span>Debit Accrual</span>
            <span>• P&L Impact</span>
          </div>
        </Card>

        {/* Net Salary Payable */}
        <Card className="p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Net Salary Payable</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            ₹{totalPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-blue-700 font-medium">
            <span>Direct Deposit Liability</span>
          </div>
        </Card>

        {/* Statutory Liabilities */}
        <Card className="p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Statutory Liabilities</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            ₹{totalStatutory.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-purple-700 font-medium">
            <span>PF, ESI, TDS & PT Payable</span>
          </div>
        </Card>

        {/* Double-Entry Balance Check */}
        <Card className="p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Accounting Equation</span>
            <span
              className={`p-1.5 rounded-lg ${
                trialBalance?.isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {trialBalance?.isBalanced ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            {trialBalance?.isBalanced ? 'BALANCED' : 'IMBALANCE'}
          </p>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-700 font-medium">
            <span>Σ Debits ≡ Σ Credits (Δ ₹{trialBalance?.difference || '0.00'})</span>
          </div>
        </Card>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('trial-balance')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'trial-balance'
              ? 'border-teal-500 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Trial Balance
        </button>
        <button
          onClick={() => setActiveTab('journal-entries')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'journal-entries'
              ? 'border-teal-500 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Journal Vouchers ({journalEntries.length})
        </button>
        <button
          onClick={() => setActiveTab('chart-of-accounts')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'chart-of-accounts'
              ? 'border-teal-500 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Chart of Accounts ({ledgers.length})
        </button>
        <button
          onClick={() => setActiveTab('financial-years')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'financial-years'
              ? 'border-teal-500 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Financial Years ({financialYears.length})
        </button>
      </div>

      {/* ── TAB 1: TRIAL BALANCE ── */}
      {activeTab === 'trial-balance' && (
        <div className="space-y-4">
          <Card padded={false} className="overflow-hidden border border-slate-200 shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  Annual Trial Balance — {(selectedFy as any)?.financial_year_name || (selectedFy as any)?.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Period:{' '}
                  {(selectedFy as any)?.start_date || (selectedFy as any)?.startDate
                    ? new Date((selectedFy as any).start_date || (selectedFy as any).startDate).toLocaleDateString('en-IN')
                    : ''}{' '}
                  to{' '}
                  {(selectedFy as any)?.end_date || (selectedFy as any)?.endDate
                    ? new Date((selectedFy as any).end_date || (selectedFy as any).endDate).toLocaleDateString('en-IN')
                    : ''}
                </p>
              </div>
              <Badge variant={trialBalance?.isBalanced ? 'success' : 'danger'} size="md">
                {trialBalance?.isBalanced
                  ? 'Double-Entry Verified'
                  : `Discrepancy: ₹${trialBalance?.difference}`}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Normal</th>
                    <th className="py-3 px-4 text-right">Debit Total (₹)</th>
                    <th className="py-3 px-4 text-right">Credit Total (₹)</th>
                    <th className="py-3 px-4 text-right">Closing Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="w-6 h-6 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto mb-2" />
                        Calculating Trial Balance…
                      </td>
                    </tr>
                  ) : !trialBalance || trialBalance.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No ledger accounts found. Click "Auto-Account All Payroll" to seed accounts and sync.
                      </td>
                    </tr>
                  ) : (
                    trialBalance.items.map((item) => {
                      const hasActivity =
                        parseFloat(item.totalDebits) > 0 || parseFloat(item.totalCredits) > 0;
                      return (
                        <tr
                          key={item.ledgerId}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            hasActivity ? 'font-medium' : 'text-slate-400'
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {item.ledgerCode}
                          </td>
                          <td className="py-3 px-4 text-slate-800">{item.ledgerName}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                item.accountCategory === 'EXPENSE'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : item.accountCategory === 'LIABILITY'
                                  ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {item.accountCategory}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {item.normalBalance}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-slate-800">
                            {parseFloat(item.totalDebits) > 0
                              ? parseFloat(item.totalDebits).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-slate-800">
                            {parseFloat(item.totalCredits) > 0
                              ? parseFloat(item.totalCredits).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {parseFloat(item.closingBalance) !== 0
                              ? parseFloat(item.closingBalance).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })
                              : '0.00'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {trialBalance && (
                  <tfoot>
                    <tr className="bg-teal-50/60 border-t-2 border-teal-200 font-bold text-xs text-slate-900">
                      <td colSpan={4} className="py-3 px-4 uppercase tracking-wider text-teal-900">
                        Grand Totals
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-teal-900">
                        ₹
                        {parseFloat(trialBalance.totalDebits).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-teal-900">
                        ₹
                        {parseFloat(trialBalance.totalCredits).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Balanced
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB 2: JOURNAL VOUCHERS (ENTRIES) ── */}
      {activeTab === 'journal-entries' && (
        <div className="space-y-4">
          {journalEntries.length === 0 ? (
            <Card className="text-center py-16">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">No Journal Vouchers Posted Yet</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                Vouchers are automatically created whenever a payroll run is finalized, or by clicking
                sync below.
              </p>
              <Button variant="primary" onClick={handleSyncAll} loading={isSyncing} className="mx-auto">
                <RefreshCw className="w-4 h-4" /> Auto-Account All Payroll Runs
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {journalEntries.map((entry) => {
                const isExpanded = expandedEntryId === entry.id;
                return (
                  <Card key={entry.id} padded={false} className="border border-slate-200 overflow-hidden">
                    {/* Header Row */}
                    <div
                      onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {entry.voucher_number}
                            </span>
                            <Badge variant="info" size="sm">
                              {entry.voucher_type}
                            </Badge>
                            <Badge variant="success" size="sm">
                              {entry.entry_status}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{entry.narration}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-xs font-bold font-mono text-slate-800">
                            ₹
                            {parseFloat(String(entry.total_debit)).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {new Date(entry.voucher_date).toLocaleDateString('en-IN')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Line Items (Debits & Credits) */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Voucher Debit & Credit Breakdown
                        </p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-200">
                              <th className="py-1.5 text-left">#</th>
                              <th className="py-1.5 text-left">Account Ledger</th>
                              <th className="py-1.5 text-left">Side</th>
                              <th className="py-1.5 text-right">Debit (₹)</th>
                              <th className="py-1.5 text-right">Credit (₹)</th>
                              <th className="py-1.5 text-left pl-4">Narration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {entry.rndtechnosoft_bookkeeping_entry_lines.map((line) => (
                              <tr key={line.id} className="text-slate-700 font-medium">
                                <td className="py-2 text-slate-400">{line.line_number}</td>
                                <td className="py-2">
                                  <span className="font-semibold text-slate-800">
                                    {line.rndtechnosoft_accounting_ledgers?.ledger_name || 'Account'}
                                  </span>{' '}
                                  <span className="text-[10px] font-mono text-slate-400">
                                    ({line.rndtechnosoft_accounting_ledgers?.ledger_code})
                                  </span>
                                </td>
                                <td className="py-2">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      line.entry_side === 'DEBIT'
                                        ? 'bg-amber-50 text-amber-800'
                                        : 'bg-purple-50 text-purple-800'
                                    }`}
                                  >
                                    {line.entry_side}
                                  </span>
                                </td>
                                <td className="py-2 text-right font-mono">
                                  {line.entry_side === 'DEBIT'
                                    ? parseFloat(String(line.amount)).toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                      })
                                    : '—'}
                                </td>
                                <td className="py-2 text-right font-mono">
                                  {line.entry_side === 'CREDIT'
                                    ? parseFloat(String(line.amount)).toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                      })
                                    : '—'}
                                </td>
                                <td className="py-2 pl-4 text-slate-500 text-[11px]">
                                  {line.narration || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: CHART OF ACCOUNTS ── */}
      {activeTab === 'chart-of-accounts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['EXPENSE', 'LIABILITY', 'ASSET'].map((category) => {
              const categoryLedgers = ledgers.filter((l) => l.account_category === category);
              return (
                <Card key={category} title={`${category} Accounts (${categoryLedgers.length})`}>
                  <div className="divide-y divide-slate-100">
                    {categoryLedgers.map((ledger) => (
                      <div key={ledger.id} className="py-2.5 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{ledger.ledger_name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{ledger.ledger_code}</p>
                          {ledger.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{ledger.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            Normal: {ledger.normal_balance}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 4: FINANCIAL YEARS ── */}
      {activeTab === 'financial-years' && (
        <div className="space-y-4">
          <Card title="Tenant Financial Years" subtitle="Indian Financial Years (01 April to 31 March)">
            <div className="divide-y divide-slate-100">
              {financialYears.map((fy) => (
                <div key={fy.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800">{fy.financial_year_code}</span>
                      {fy.is_current && <Badge variant="success">Current Active FY</Badge>}
                      {fy.is_closed && <Badge variant="neutral">Closed</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(fy.start_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      —{' '}
                      {new Date(fy.end_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {fy.assessment_year ? ` • Assessment Year: ${fy.assessment_year}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">
                      {fy._count?.rndtechnosoft_bookkeeping_entries || 0} vouchers posted
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
