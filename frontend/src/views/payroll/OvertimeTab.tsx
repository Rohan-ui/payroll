import React, { useCallback, useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { overtimeApi, type OvertimeDay } from '../../api/payroll-setup.api';
import { cardClass, day, errorText, fieldClass, labelClass, tdClass, thClass } from './payroll-format';

const STATE: Record<OvertimeDay['state'], { label: string; variant: 'warning' | 'success' | 'danger' | 'info' }> = {
  PENDING: { label: 'Waiting', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  CHANGED: { label: 'Changed since approval', variant: 'info' },
};
const lastMonth = () => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const key = (d: OvertimeDay) => `${d.employee.id} ${d.date}`;

/**
 * Overtime approval: each day attendance records overtime, decide how much
 * is paid. Payroll pays only approved minutes (when the policy requires
 * approval), under the policy's minimum, rounding, caps and rates.
 */
export const OvertimeTab: React.FC = () => {
  const { can } = useAuth();
  const id = useId();
  const editable = can('payroll.overtime.approve');
  const [month, setMonth] = useState(lastMonth());
  const [days, setDays] = useState<OvertimeDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setError(null);
    setDays(null);
    overtimeApi.list(month).then((d) => { setDays(d); setMinutes({}); }).catch((e) => setError(errorText(e)));
  }, [month]);
  useEffect(load, [load]);

  const decide = async (list: OvertimeDay[], decision: 'APPROVED' | 'REJECTED') => {
    setBusy(true);
    try {
      const result = await overtimeApi.decide(list.map((d) => {
        const typed = minutes[key(d)]?.trim();
        return { employeeId: d.employee.id, date: d.date, decision, ...(decision === 'APPROVED' && typed ? { approvedMinutes: Number(typed) } : {}) };
      }));
      toast.success(`${result.decided} day${result.decided === 1 ? '' : 's'} ${decision === 'APPROVED' ? 'approved' : 'rejected'}`);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const waiting = days?.filter((d) => d.state === 'PENDING' || d.state === 'CHANGED') ?? [];

  return (
    <section className={cardClass} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <div>
          <h2 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Overtime</h2>
          <p className="text-xs text-slate-500">Overtime recorded by attendance. Approve all or part of each day; payroll then applies the policy’s minimum, rounding, caps and rates.</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor={`${id}-month`} className={labelClass}>Month</label>
            <input id={`${id}-month`} type="month" className={fieldClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          {editable && waiting.length > 0 && <Button size="sm" onClick={() => decide(waiting, 'APPROVED')} loading={busy} disabled={busy}>Approve all {waiting.length} waiting</Button>}
        </div>
      </div>
      {error && (
        <div role="alert" className="m-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Overtime could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {days === null && !error ? (
        <div className="h-24 animate-pulse bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading overtime</span></div>
      ) : days?.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No overtime recorded in {month}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Days where attendance records overtime appear here for approval.</p>
        </div>
      ) : days && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5"><tr>
              <th scope="col" className={thClass}>Employee</th>
              <th scope="col" className={thClass}>Day</th>
              <th scope="col" className={`${thClass} text-right`}>Recorded</th>
              <th scope="col" className={thClass}>Decision</th>
              <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {days.map((d) => (
                <tr key={key(d)}>
                  <td className={tdClass}>{d.employee.name}<span className="block text-xs text-slate-500">{d.employee.code}{d.eligible ? '' : ' · salary not eligible for overtime'}</span></td>
                  <td className={tdClass}>{day(d.date)}<span className="block text-xs text-slate-500">{d.attendanceStatus === 'WEEKEND' ? 'Weekly off' : d.attendanceStatus === 'HOLIDAY' ? 'Holiday' : 'Working day'}</span></td>
                  <td className={`${tdClass} text-right tabular-nums`}>{d.recordedMinutes} min</td>
                  <td className={tdClass}>
                    <Badge size="sm" variant={STATE[d.state].variant}>{STATE[d.state].label}</Badge>
                    {d.state === 'APPROVED' && <span className="ml-1 text-xs text-slate-600">{d.approvedMinutes} min</span>}
                    {d.decidedBy && <span className="block text-xs text-slate-500">by {d.decidedBy}</span>}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    {editable && (
                      <span className="inline-flex items-center gap-1">
                        <label className="sr-only" htmlFor={`${id}-${key(d)}`}>Minutes to approve for {d.employee.name} on {d.date}</label>
                        <input id={`${id}-${key(d)}`} type="number" min={0} max={d.recordedMinutes} placeholder={String(d.recordedMinutes)} className={`${fieldClass} w-20 py-1`}
                          value={minutes[key(d)] ?? ''} onChange={(e) => setMinutes((m) => ({ ...m, [key(d)]: e.target.value }))} />
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide([d], 'APPROVED')}>Approve</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide([d], 'REJECTED')}>Reject</Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && <p className="px-4 py-2 text-xs text-slate-500">Leave the minutes empty to approve everything recorded, or type fewer to approve part of a day.</p>}
        </div>
      )}
    </section>
  );
};
