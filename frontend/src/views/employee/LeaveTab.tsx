import React, { useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { employeeProfileApi, type LeaveBalance, type LeaveRequest } from '../../api/employee-profile.api';
import { day, errorText, fieldClass } from '../payroll/payroll-format';
import { Section } from './profile-ui';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};

/** Balances and requests from the leave module, read-only here. */
export const LeaveTab: React.FC<{ employeeId: string }> = ({ employeeId }) => {
  const ids = useId();
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<{ items: LeaveRequest[]; pendingCount: number; pagination: { page: number; total: number; totalPages: number } } | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    employeeProfileApi.leaveBalances(employeeId).then((b) => live && setBalances(b)).catch((e) => live && setBalanceError(errorText(e)));
    return () => { live = false; };
  }, [employeeId]);

  useEffect(() => {
    let live = true;
    setRequests(null);
    setRequestError(null);
    employeeProfileApi.leaveRequests(employeeId, status || undefined, page).then((r) => live && setRequests(r)).catch((e) => live && setRequestError(errorText(e)));
    return () => { live = false; };
  }, [employeeId, status, page]);

  return (
    <div className="space-y-4">
      <Section title="Leave balances">
        {balanceError ? <p role="alert" className="text-sm text-red-700">Balances could not be loaded: {balanceError}</p>
          : balances === null ? <p className="text-sm text-slate-500">Loading balances…</p>
          : balances.length === 0 ? <p className="text-sm text-slate-500">No leave balances yet. They appear once leave types are set up and assigned to this employee.</p>
          : (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {balances.map((b) => (
                <div key={b.id} className="rounded-xl border border-slate-200 px-3 py-2 dark:border-[#2B293E]">
                  <dt className="text-xs text-slate-500">{b.rndtechnosoft_leave_types.leave_type_name}{!b.rndtechnosoft_leave_types.is_paid && ' (unpaid)'}</dt>
                  <dd className="text-lg font-bold tabular-nums text-slate-800 dark:text-white">{Number(b.balance_days).toString()} <span className="text-xs font-normal text-slate-500">days</span></dd>
                  <dd className="text-[11px] text-slate-400">as of {day(b.as_of_date.slice(0, 10))}</dd>
                </div>
              ))}
            </dl>
          )}
      </Section>

      <Section title="Leave requests"
        description={requests?.pendingCount ? `${requests.pendingCount} waiting for a decision` : undefined}
        action={
          <div className="w-44">
            <label htmlFor={`${ids}-status`} className="sr-only">Request status</label>
            <select id={`${ids}-status`} className={fieldClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All requests</option>
              {Object.entries(STATUS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
            </select>
          </div>
        }>
        {requestError ? <p role="alert" className="text-sm text-red-700">Requests could not be loaded: {requestError}</p>
          : requests === null ? <p className="text-sm text-slate-500">Loading requests…</p>
          : requests.items.length === 0 ? <p className="text-sm text-slate-500">{status ? 'No requests with this status.' : 'No leave requested yet.'}</p>
          : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <caption className="sr-only">Leave requests, latest first</caption>
                  <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-200 dark:border-[#2B293E]">
                      {['Dates', 'Type', 'Days', 'Status', 'Reason'].map((h) => <th key={h} scope="col" className={`px-2 py-2 font-bold ${h === 'Days' ? 'text-right' : ''}`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                    {requests.items.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-2 py-2.5">{day(r.startDate)}{r.endDate !== r.startDate && ` – ${day(r.endDate)}`}</td>
                        <td className="px-2 py-2.5">{r.leaveType}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{Number(r.days).toString()}</td>
                        <td className="px-2 py-2.5"><Badge size="sm" variant={STATUS[r.status]?.variant ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                        <td className="max-w-xs truncate px-2 py-2.5 text-slate-600 dark:text-slate-300" title={r.reason ?? undefined}>{r.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {requests.pagination.totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Page {requests.pagination.page} of {requests.pagination.totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="secondary" size="sm" disabled={page >= requests.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
      </Section>
    </div>
  );
};
