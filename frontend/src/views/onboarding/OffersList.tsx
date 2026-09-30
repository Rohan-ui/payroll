import React, { useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { onboardingApi, OFFER_STATUS_LABELS, type OfferListItem, type OfferStatus } from '../../api/onboarding.api';
import { fieldClass, formatAmount, formatDate, labelClass } from './onboarding-format';
import { OFFER_VARIANT } from './OfferDetailView';

interface Props {
  awaitingMyApproval: boolean;
  onAwaitingMyApprovalChange: (value: boolean) => void;
  onOpen: (offerId: string) => void;
}

/** Offers, filtered and paged by the server. */
export const OffersList: React.FC<Props> = ({ awaitingMyApproval, onAwaitingMyApprovalChange, onOpen }) => {
  const ids = useId();
  const [status, setStatus] = useState<OfferStatus | ''>('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OfferListItem[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    onboardingApi
      .listOffers({ page, limit: 20, status, awaitingMyApproval })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setPagination({ page: result.pagination.page, totalPages: result.pagination.totalPages, total: result.pagination.total });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [page, status, awaitingMyApproval, reload]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="sm:w-60">
          <label htmlFor={`${ids}-status`} className={labelClass}>Status</label>
          <select id={`${ids}-status`} value={status} onChange={(e) => { setStatus(e.target.value as OfferStatus | ''); setPage(1); }} className={fieldClass}>
            <option value="">All offers</option>
            {(Object.keys(OFFER_STATUS_LABELS) as OfferStatus[]).map((s) => <option key={s} value={s}>{OFFER_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={awaitingMyApproval} onChange={(e) => { onAwaitingMyApprovalChange(e.target.checked); setPage(1); }} />
          Waiting for my approval
        </label>
      </div>

      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The offers could not be loaded: {error} <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="h-40 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading offers</span></div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{awaitingMyApproval ? 'Nothing is waiting for your approval' : status ? 'No offers with this status' : 'No offers yet'}</p>
          <p className="mt-1 text-sm text-slate-500">Offers are drafted from a selected candidate’s page.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Offers</caption>
            <thead className="bg-slate-50 dark:bg-[#1E1D2D] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Offer</th>
                <th scope="col" className="px-4 py-3">Candidate</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right hidden md:table-cell">CTC per year</th>
                <th scope="col" className="px-4 py-3 hidden lg:table-cell">Accept by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => onOpen(row.id)} className="font-semibold text-teal-700 dark:text-teal-300 hover:underline">{row.offerCode}</button>
                    <span className="block text-xs text-slate-500">{row.jobTitle}</span>
                  </td>
                  <td className="px-4 py-3">{row.candidate.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={OFFER_VARIANT[row.status]} size="sm">{OFFER_STATUS_LABELS[row.status]}</Badge>
                    {row.awaitingApprovalFrom && <span className="block mt-1 text-xs text-slate-500">{row.awaitingMe ? 'Waiting for you' : `Waiting for ${row.awaitingApprovalFrom}`}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{formatAmount(row.annualCtc)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">{formatDate(row.expiresOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-[#2B293E] text-xs text-slate-600">
            <span>{pagination.total} offer{pagination.total === 1 ? '' : 's'} · page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
              <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
