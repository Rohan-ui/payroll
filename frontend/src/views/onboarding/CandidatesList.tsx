import React, { useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import {
  CANDIDATE_STATUSES,
  onboardingApi,
  STATUS_LABELS,
  type CandidateListQuery,
  type CandidateStatus,
  type CandidateSummary,
  type OnboardingMeta,
} from '../../api/onboarding.api';
import { fieldClass, formatDate, formatInTimezone, labelClass, STATUS_VARIANT } from './onboarding-format';

interface Props {
  filters: CandidateListQuery;
  onFiltersChange: (filters: CandidateListQuery) => void;
  meta: OnboardingMeta | null;
  onOpen: (candidateId: string) => void;
}

/** Candidates, filtered and paged by the server. */
export const CandidatesList: React.FC<Props> = ({ filters, onFiltersChange, meta, onOpen }) => {
  const ids = useId();
  const [search, setSearch] = useState(filters.search ?? '');
  const [rows, setRows] = useState<CandidateSummary[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Typing settles for a moment before the server is asked.
  useEffect(() => {
    if (search === (filters.search ?? '')) return;
    const timer = window.setTimeout(() => onFiltersChange({ ...filters, search, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setRows(null);
    onboardingApi
      .listCandidates(filters)
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setPagination({ page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [filters, reload]);

  const set = (change: Partial<CandidateListQuery>) => onFiltersChange({ ...filters, ...change, page: 1 });
  const filtered = Boolean(filters.search || filters.status || filters.departmentId || filters.recruiterMemberId || filters.joiningFrom || filters.documents || filters.archived !== 'active');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2">
          <label htmlFor={`${ids}-search`} className={labelClass}>Search</label>
          <input id={`${ids}-search`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone, code or position" className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${ids}-status`} className={labelClass}>Stage</label>
          <select id={`${ids}-status`} value={filters.status ?? ''} onChange={(e) => set({ status: e.target.value as CandidateStatus | '' })} className={fieldClass}>
            <option value="">All stages</option>
            {CANDIDATE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-department`} className={labelClass}>Department</label>
          <select id={`${ids}-department`} value={filters.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value || undefined })} className={fieldClass}>
            <option value="">All departments</option>
            {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-archived`} className={labelClass}>Showing</label>
          <select id={`${ids}-archived`} value={filters.archived ?? 'active'} onChange={(e) => set({ archived: e.target.value as CandidateListQuery['archived'] })} className={fieldClass}>
            <option value="active">Active candidates</option>
            <option value="archived">Archived candidates</option>
            <option value="all">All candidates</option>
          </select>
        </div>
      </div>
      {(filters.joiningFrom || filters.recruiterMemberId || filters.documents) && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {filters.joiningFrom && <>Joining {formatDate(filters.joiningFrom)} to {formatDate(filters.joiningTo ?? filters.joiningFrom)}. </>}
          {filters.documents === 'to_verify' && <>With documents to verify. </>}
          <button type="button" onClick={() => set({ joiningFrom: undefined, joiningTo: undefined, recruiterMemberId: undefined, documents: undefined })} className="font-semibold text-teal-700 underline">
            Clear this filter
          </button>
        </p>
      )}

      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The candidates could not be loaded: {error}{' '}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />)}
          <span className="sr-only" role="status">Loading candidates</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{filtered ? 'No candidates match these filters' : 'No candidates yet'}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {filtered ? 'Change or clear the filters to see more.' : 'Add a candidate to start screening and scheduling interviews.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Candidates</caption>
            <thead className="bg-slate-50 dark:bg-[#1E1D2D] text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Candidate</th>
                <th scope="col" className="px-4 py-3">Position</th>
                <th scope="col" className="px-4 py-3 hidden md:table-cell">Department</th>
                <th scope="col" className="px-4 py-3">Stage</th>
                <th scope="col" className="px-4 py-3 hidden lg:table-cell">Next interview</th>
                <th scope="col" className="px-4 py-3 hidden lg:table-cell">Joining</th>
                <th scope="col" className="px-4 py-3 hidden xl:table-cell">Recruiter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => onOpen(row.id)} className="text-left font-semibold text-teal-700 dark:text-teal-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
                      {row.fullName}
                    </button>
                    <span className="block text-xs text-slate-500 break-all">{row.candidateCode} · {row.email}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{row.appliedPosition}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-700 dark:text-slate-300">{row.departmentName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[row.status]} size="sm">{STATUS_LABELS[row.status]}</Badge>
                    {row.archivedAt && <span className="block mt-1 text-xs text-slate-500">Archived</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {row.nextInterview ? formatInTimezone(row.nextInterview.scheduled_start, row.nextInterview.timezone, false) : '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">{row.expectedJoiningDate ? formatDate(row.expectedJoiningDate) : '—'}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">{row.recruiterName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-[#2B293E] text-xs text-slate-600 dark:text-slate-400">
            <span>{pagination.total} candidate{pagination.total === 1 ? '' : 's'} · page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={pagination.page <= 1} onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] disabled:opacity-40">
                Previous
              </button>
              <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
