import React, { useEffect, useId, useState } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { cn } from '../../utils/cn';
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

const SHOWING_OPTIONS: { value: NonNullable<CandidateListQuery['archived']>; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

/** Every filter off, keeping the page size. */
const cleared = (filters: CandidateListQuery): CandidateListQuery => ({ page: 1, limit: filters.limit, search: '', status: '', archived: 'active' });

/** Candidates, filtered and paged by the server. */
export const CandidatesList: React.FC<Props> = ({ filters, onFiltersChange, meta, onOpen }) => {
  const ids = useId();
  const [search, setSearch] = useState(filters.search ?? '');
  const [rows, setRows] = useState<CandidateSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Typing settles for a moment before the server is asked.
  useEffect(() => {
    if (search === (filters.search ?? '')) return;
    const timer = window.setTimeout(() => onFiltersChange({ ...filters, search, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // A filter cleared from outside the search box (e.g. "Clear all") empties the box too.
  useEffect(() => {
    setSearch(filters.search ?? '');
  }, [filters.search]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Keep the current rows on screen while the next page or filter loads, so the table doesn't flash.
    setIsLoading(true);
    onboardingApi
      .listCandidates(filters)
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setPagination({ page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total });
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, reload]);

  const set = (change: Partial<CandidateListQuery>) => onFiltersChange({ ...filters, ...change, page: 1 });
  const recruiterName = meta?.members.find((m) => m.id === filters.recruiterMemberId)?.name;
  const chips: { key: string; label: string; clear: Partial<CandidateListQuery> }[] = [
    ...(filters.joiningFrom ? [{ key: 'joining', label: `Joining ${formatDate(filters.joiningFrom)} – ${formatDate(filters.joiningTo ?? filters.joiningFrom)}`, clear: { joiningFrom: undefined, joiningTo: undefined } }] : []),
    ...(filters.documents === 'to_verify' ? [{ key: 'docs', label: 'Documents to verify', clear: { documents: undefined } }] : []),
  ];
  const isFiltered = Boolean(filters.search || filters.status || filters.departmentId || filters.recruiterMemberId || chips.length || filters.archived !== 'active');
  const firstRow = (pagination.page - 1) * filters.limit + 1;
  const lastRow = Math.min(pagination.page * filters.limit, pagination.total);

  const stage = (row: CandidateSummary) => (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={STATUS_VARIANT[row.status]} size="sm">{STATUS_LABELS[row.status]}</Badge>
      {row.archivedAt && <Badge variant="neutral" size="sm">Archived</Badge>}
    </span>
  );
  const nextInterview = (row: CandidateSummary) =>
    row.nextInterview ? `Round ${row.nextInterview.round_number} · ${formatInTimezone(row.nextInterview.scheduled_start, row.nextInterview.timezone, false)}` : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor={`${ids}-search`} className={labelClass}>Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
              <input id={`${ids}-search`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone, code or position" className={cn(fieldClass, 'pl-9 h-10')} />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor={`${ids}-status`} className={labelClass}>Stage</label>
            <select id={`${ids}-status`} value={filters.status ?? ''} onChange={(e) => set({ status: e.target.value as CandidateStatus | '' })} className={cn(fieldClass, 'h-10')}>
              <option value="">All stages</option>
              {CANDIDATE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor={`${ids}-department`} className={labelClass}>Department</label>
            <select id={`${ids}-department`} value={filters.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value || undefined })} className={cn(fieldClass, 'h-10')}>
              <option value="">All departments</option>
              {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor={`${ids}-recruiter`} className={labelClass}>Recruiter</label>
            <select id={`${ids}-recruiter`} value={filters.recruiterMemberId ?? ''} onChange={(e) => set({ recruiterMemberId: e.target.value || undefined })} className={cn(fieldClass, 'h-10')}>
              <option value="">Anyone</option>
              {meta?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              {filters.recruiterMemberId && !recruiterName && <option value={filters.recruiterMemberId}>Selected recruiter</option>}
            </select>
          </div>
          <fieldset className="lg:col-span-2">
            <legend className={labelClass}>Showing</legend>
            <div className="flex h-10 p-0.5 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#12111A]">
              {SHOWING_OPTIONS.map((o) => {
                const isOn = (filters.archived ?? 'active') === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => set({ archived: o.value })}
                    className={cn(
                      'flex-1 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                      isOn ? 'bg-white dark:bg-[#181724] text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {(chips.length > 0 || isFiltered) && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 h-7 rounded-full bg-teal-50 dark:bg-teal-950/40 text-xs font-medium text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800/60">
                {chip.label}
                <button type="button" onClick={() => set(chip.clear)} aria-label={`Remove filter: ${chip.label}`} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-teal-100 dark:hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            {isFiltered && (
              <button type="button" onClick={() => onFiltersChange(cleared(filters))} className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3">
          <span>The candidates could not be loaded: {error}</span>
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />)}
          <span className="sr-only" role="status">Loading candidates</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{isFiltered ? 'No candidates match these filters' : 'No candidates yet'}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isFiltered ? 'Change the filters, or clear them to see everyone.' : 'Use “Add candidate” above to start screening and scheduling interviews.'}
          </p>
          {isFiltered && (
            <button type="button" onClick={() => onFiltersChange(cleared(filters))} className="mt-3 text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className={cn('rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-hidden transition-opacity', isLoading && 'opacity-60')} aria-busy={isLoading}>
          {/* Phones: one card per candidate. */}
          <ul className="sm:hidden divide-y divide-slate-100 dark:divide-[#2B293E]">
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => onOpen(row.id)} className="w-full text-left p-4 flex gap-3 hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500">
                  <Avatar name={row.fullName} size="sm" />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-semibold text-slate-900 dark:text-slate-100 truncate">{row.fullName}</span>
                    <span className="block text-xs text-slate-500 truncate">{row.appliedPosition}{row.departmentName ? ` · ${row.departmentName}` : ''}</span>
                    {stage(row)}
                    {nextInterview(row) && <span className="block text-xs text-slate-600 dark:text-slate-400">Next: {nextInterview(row)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <caption className="sr-only">Candidates</caption>
              <thead className="bg-slate-50 dark:bg-[#1E1D2D] text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#2B293E]">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Candidate</th>
                  <th scope="col" className="px-4 py-2.5">Position</th>
                  <th scope="col" className="px-4 py-2.5">Stage</th>
                  <th scope="col" className="px-4 py-2.5 hidden lg:table-cell">Next interview</th>
                  <th scope="col" className="px-4 py-2.5 hidden lg:table-cell">Joining</th>
                  <th scope="col" className="px-4 py-2.5 hidden xl:table-cell">Recruiter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {rows.map((row) => (
                  // The name is the real control; clicking anywhere on the row is a shortcut for mouse users.
                  <tr key={row.id} onClick={() => onOpen(row.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 max-w-[18rem]">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={row.fullName} size="sm" />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpen(row.id); }}
                            className="block max-w-full truncate text-left font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
                          >
                            {row.fullName}
                          </button>
                          <span className="block text-xs text-slate-500 truncate" title={row.email}>{row.candidateCode} · {row.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <span className="block">{row.appliedPosition}</span>
                      {row.departmentName && <span className="block text-xs text-slate-500">{row.departmentName}</span>}
                    </td>
                    <td className="px-4 py-3">{stage(row)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-700 dark:text-slate-300 whitespace-nowrap">{nextInterview(row) ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap text-slate-700 dark:text-slate-300">{row.expectedJoiningDate ? formatDate(row.expectedJoiningDate) : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 hidden xl:table-cell text-slate-700 dark:text-slate-300">{row.recruiterName ?? <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Candidate pages" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-[#2B293E] text-xs text-slate-600 dark:text-slate-400">
            <span role="status">
              {firstRow}–{lastRow} of {pagination.total} candidate{pagination.total === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous page" disabled={pagination.page <= 1 || isLoading} onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })} className="h-9 px-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Previous
              </button>
              <span className="tabular-nums">Page {pagination.page} of {pagination.totalPages}</span>
              <button type="button" aria-label="Next page" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })} className="h-9 px-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                Next <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
};
