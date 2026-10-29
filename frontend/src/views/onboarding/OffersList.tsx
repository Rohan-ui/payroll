import React, { useEffect, useId, useState } from 'react';
import { FileText, RotateCcw, Search, Eye } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { PdfViewer } from '../../components/ui/PdfViewer';
import {
  onboardingApi,
  OFFER_STATUS_LABELS,
  type OfferListItem,
  type OfferStatus,
  type OnboardingMeta,
} from '../../api/onboarding.api';
import { fieldClass, formatAmount, formatDate, labelClass } from './onboarding-format';
import { OFFER_VARIANT } from './OfferDetailView';

interface Props {
  awaitingMyApproval: boolean;
  onAwaitingMyApprovalChange: (value: boolean) => void;
  onOpen: (offerId: string) => void;
  meta?: OnboardingMeta | null;
  onOpenCandidate?: (candidateId: string) => void;
}

const ALL_STATUS_KEYS: (OfferStatus | 'ALL')[] = [
  'ALL',
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
];

/** Offers, filtered, searched and paged by the server. */
export const OffersList: React.FC<Props> = ({
  awaitingMyApproval,
  onAwaitingMyApprovalChange,
  onOpen,
  meta,
  onOpenCandidate,
}) => {
  const ids = useId();
  const [status, setStatus] = useState<OfferStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OfferListItem[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
    ALL: 0,
    DRAFT: 0,
    PENDING_APPROVAL: 0,
    APPROVED: 0,
    SENT: 0,
    ACCEPTED: 0,
    DECLINED: 0,
    EXPIRED: 0,
    WITHDRAWN: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [previewOffer, setPreviewOffer] = useState<{ id: string; code: string; title: string; candidateName: string } | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    onboardingApi
      .listOffers({
        page,
        limit: 20,
        status: status === 'ALL' ? undefined : status,
        search: debouncedSearch,
        departmentId: departmentId || undefined,
        designationId: designationId || undefined,
        awaitingMyApproval,
      })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setPagination({
          page: result.pagination.page,
          totalPages: result.pagination.totalPages,
          total: result.pagination.total,
        });
        if (result.statusCounts) {
          setStatusCounts(result.statusCounts);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [page, status, debouncedSearch, departmentId, designationId, awaitingMyApproval, reload]);

  const hasActiveFilters = status !== 'ALL' || debouncedSearch.trim() !== '' || departmentId !== '' || designationId !== '' || awaitingMyApproval;

  const resetFilters = () => {
    setStatus('ALL');
    setSearch('');
    setDebouncedSearch('');
    setDepartmentId('');
    setDesignationId('');
    onAwaitingMyApprovalChange(false);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Status Filter Tabs with Live Accurate Counts */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-[#2B293E]">
        {ALL_STATUS_KEYS.map((s) => {
          const isActive = status === s;
          const label = s === 'ALL' ? 'All Offers' : OFFER_STATUS_LABELS[s];
          const count = statusCounts[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <span>{label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isActive
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search and Secondary Filter Controls */}
      <div className="flex flex-wrap items-end gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E]">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor={`${ids}-search`} className={labelClass}>
            Search offers
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id={`${ids}-search`}
              type="search"
              placeholder="Search by offer ID, candidate name/ID, title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        {meta?.departments && meta.departments.length > 0 && (
          <div className="w-44">
            <label htmlFor={`${ids}-dept`} className={labelClass}>
              Department
            </label>
            <select
              id={`${ids}-dept`}
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              className={fieldClass}
            >
              <option value="">All departments</option>
              {meta.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {meta?.designations && meta.designations.length > 0 && (
          <div className="w-44">
            <label htmlFor={`${ids}-desig`} className={labelClass}>
              Designation
            </label>
            <select
              id={`${ids}-desig`}
              value={designationId}
              onChange={(e) => {
                setDesignationId(e.target.value);
                setPage(1);
              }}
              className={fieldClass}
            >
              <option value="">All designations</option>
              {meta.designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center pb-2">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={awaitingMyApproval}
              onChange={(e) => {
                onAwaitingMyApprovalChange(e.target.checked);
                setPage(1);
              }}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Waiting for my approval
          </label>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="pb-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset filters
          </button>
        )}
      </div>

      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The offers could not be loaded: {error}{' '}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : rows === null ? (
        <div className="h-48 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true">
          <span className="sr-only" role="status">
            Loading offers
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            {awaitingMyApproval
              ? 'No offers waiting for your approval'
              : status !== 'ALL'
              ? `No ${OFFER_STATUS_LABELS[status].toLowerCase()} offers found`
              : debouncedSearch
              ? `No offers match "${debouncedSearch}"`
              : 'No offers created yet'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {hasActiveFilters
              ? 'Try resetting the filters or modifying your search criteria.'
              : 'Offers can be generated from a selected candidate’s profile or Onboarding Documents & Letters.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-x-auto shadow-sm">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Offers List</caption>
            <thead className="bg-slate-50 dark:bg-[#1E1D2D] text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-[#2B293E]">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Offer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Candidate</th>
                <th scope="col" className="px-4 py-3 font-semibold hidden md:table-cell">Dept & Role</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold hidden lg:table-cell">Associated Letter</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right hidden sm:table-cell">CTC per year</th>
                <th scope="col" className="px-4 py-3 font-semibold hidden xl:table-cell">Accept by</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(row.id)}
                      className="font-bold text-teal-700 dark:text-teal-300 hover:underline text-left block"
                    >
                      {row.offerCode}
                    </button>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                      {row.jobTitle}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {onOpenCandidate ? (
                      <button
                        type="button"
                        onClick={() => onOpenCandidate(row.candidate.id)}
                        className="font-medium text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 hover:underline text-left block"
                      >
                        {row.candidate.name}
                      </button>
                    ) : (
                      <span className="font-medium text-slate-900 dark:text-slate-100 block">
                        {row.candidate.name}
                      </span>
                    )}
                    <span className="block text-[11px] text-slate-500 font-mono">
                      {row.candidate.code}
                    </span>
                  </td>

                  <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium block">{row.department || '—'}</span>
                    <span className="text-slate-500 block text-[11px]">{row.employmentType || row.designation || 'Full-time'}</span>
                  </td>

                  <td className="px-4 py-3">
                    <Badge variant={OFFER_VARIANT[row.status]} size="sm">
                      {OFFER_STATUS_LABELS[row.status]}
                    </Badge>
                    {row.awaitingApprovalFrom && (
                      <span className="block mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        {row.awaitingMe ? 'Waiting for you' : `Waiting for ${row.awaitingApprovalFrom}`}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 hidden lg:table-cell text-xs">
                    {row.document ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-300">
                        <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                        <span className="font-mono text-[11px]">v{row.document.version}</span>
                        <span className="text-[10px] text-slate-500 uppercase">· {row.document.status}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell font-semibold text-slate-900 dark:text-slate-100">
                    {formatAmount(row.annualCtc)}
                  </td>

                  <td className="px-4 py-3 hidden xl:table-cell whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                    {formatDate(row.expiresOn)}
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewOffer({
                            id: row.id,
                            code: row.offerCode,
                            title: row.jobTitle,
                            candidateName: row.candidate.name,
                          })
                        }
                        title="Quick preview offer letter"
                        className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                        <span className="sr-only">Preview {row.offerCode}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen(row.id)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/10 text-teal-700 dark:text-teal-300"
                      >
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-[#2B293E] text-xs text-slate-600 dark:text-slate-400">
            <span>
              Showing {rows.length} of {pagination.total} offer{pagination.total === 1 ? '' : 's'} · page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 font-medium"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 font-medium"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick PDF Viewer Modal */}
      {previewOffer && (
        <PdfViewer
          title={`Offer Letter: ${previewOffer.code}`}
          description={`${previewOffer.title} for ${previewOffer.candidateName}`}
          load={() => onboardingApi.offerPdf(previewOffer.id)}
          downloadName={`${previewOffer.code}.pdf`}
          onClose={() => setPreviewOffer(null)}
        />
      )}
    </div>
  );
};
