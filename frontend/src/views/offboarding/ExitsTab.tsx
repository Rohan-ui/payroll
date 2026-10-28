import React, { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { offboardingApi, type ExitRow, type ExitSummary, type Pagination, type SeparationStatus } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, labelClass, tdClass, thClass } from '../payroll/payroll-format';
import { ListState } from '../performance/performance-format';
import { EXIT_STATUS, EXIT_TYPE } from './offboarding-format';
import { ExitDetailView } from './ExitDetailView';
import { StartExitDialog } from './StartExitDialog';

const FILTERS: { value: SeparationStatus | ''; label: string }[] = [
  { value: '', label: 'All exits' },
  { value: 'PENDING_APPROVAL', label: 'Awaiting acceptance' },
  { value: 'IN_PROGRESS', label: 'Serving notice' },
  { value: 'COMPLETED', label: 'Exited' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** Every exit in the workspace, newest last day first, and the one being worked on. */
export const ExitsTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const [status, setStatus] = useState<SeparationStatus | ''>('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ExitRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [summary, setSummary] = useState<ExitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([offboardingApi.list({ status: status || undefined, search: term || undefined, page, limit: 20 }), offboardingApi.summary()])
      .then(([list, counts]) => { setRows(list.data); setPagination(list.pagination); setSummary(counts); })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [status, term, page]);
  useEffect(load, [load]);

  if (openId) return <ExitDetailView id={openId} onBack={() => setOpenId(null)} onChanged={load} />;

  return (
    <div className="space-y-4">
      {summary && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Awaiting acceptance', value: summary.pendingApproval },
            { label: 'Serving notice', value: summary.inProgress },
            { label: 'Leaving in the next 30 days', value: summary.leavingIn30Days },
            { label: 'Past their last day, not completed', value: summary.pastLastDay },
          ].map((s) => (
            <div key={s.label} className={`${cardClass} px-4 py-3`}>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{s.label}</dt>
              <dd className="mt-0.5 text-xl font-bold text-slate-900 dark:text-slate-100">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className={cardClass} aria-labelledby={`${id}-heading`}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4 dark:border-[#2B293E]">
          <div>
            <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Exits</h2>
            <p className="text-xs text-slate-500">Resignations, terminations, retirements and contract ends.</p>
          </div>
          {can('offboarding.manage') && <Button onClick={() => setStarting(true)}>Start an exit</Button>}
        </div>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-[#2B293E]">
          <div className="w-full sm:w-64">
            <label htmlFor={`${id}-search`} className={labelClass}>Search</label>
            <input id={`${id}-search`} type="search" className={fieldClass} placeholder="Name or employee code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-full sm:w-56">
            <label htmlFor={`${id}-status`} className={labelClass}>Status</label>
            <select id={`${id}-status`} className={fieldClass} value={status} onChange={(e) => { setStatus(e.target.value as SeparationStatus | ''); setPage(1); }}>
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <ListState loading={loading} error={error} empty={rows.length === 0} what="Exits" onRetry={load}
          emptyTitle={term || status ? 'No exits match' : 'No exits yet'}
          emptyText={term || status ? 'Try another name or status.' : 'When someone resigns from their own sign-in, or you start an exit, it appears here.'} />

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr>
                  <th scope="col" className={thClass}>Employee</th>
                  <th scope="col" className={thClass}>Type</th>
                  <th scope="col" className={thClass}>Notice given</th>
                  <th scope="col" className={thClass}>Last working day</th>
                  <th scope="col" className={thClass}>Checklist</th>
                  <th scope="col" className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className={tdClass}>
                      <button type="button" onClick={() => setOpenId(r.id)} className="text-left font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300">
                        {r.employee.name}
                      </button>
                      <p className="text-xs text-slate-500">{[r.employee.code, r.employee.department].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className={tdClass}>{EXIT_TYPE[r.type]}{r.isSelfService && <span className="block text-xs text-slate-500">From the employee</span>}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{day(r.noticeDate)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{day(r.lastWorkingDate)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{r.checklist.total ? `${r.checklist.done} of ${r.checklist.total}` : '—'}</td>
                    <td className={tdClass}><Badge size="sm" variant={EXIT_STATUS[r.status].variant}>{EXIT_STATUS[r.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <nav className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 text-sm dark:border-[#2B293E]" aria-label="Pages">
            <span className="text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.total} exits</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </nav>
        )}
      </section>

      {starting && <StartExitDialog onClose={() => setStarting(false)} onStarted={(exit) => { setStarting(false); load(); setOpenId(exit.id); }} />}
    </div>
  );
};
