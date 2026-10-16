import React, { useCallback, useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { departmentHeadsApi, performanceOptionsApi, type AppointmentHistory, type DepartmentHeads, type EmployeeOption } from '../../api/performance.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, tdClass, thClass, todayIso } from '../payroll/payroll-format';
import { ListState } from './performance-format';
import { SearchPicker } from './SearchPicker';

/**
 * Who heads each department, and since when. Appraisal workflows can name the
 * department head as a reviewer; changing the head never rewrites history.
 */
export const DepartmentHeadsTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.department_heads.manage');
  const [departments, setDepartments] = useState<DepartmentHeads[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appointing, setAppointing] = useState<DepartmentHeads | null>(null);
  const [historyOf, setHistoryOf] = useState<DepartmentHeads | null>(null);

  const load = useCallback(() => {
    setError(null);
    departmentHeadsApi.list().then(setDepartments).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const items = departments ?? [];
  return (
    <section className={cardClass} aria-labelledby={`${id}-heading`}>
      <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Department heads</h2>
        <p className="text-xs text-slate-500">Who heads each department and since when. Review workflows can ask the department head to review.</p>
      </div>
      <ListState loading={departments === null} error={error} empty={items.length === 0} what="Departments" onRetry={load}
        emptyTitle="No departments yet" emptyText="Departments are created with employee records. Add employees with their departments first." />
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Department</th>
                <th scope="col" className={thClass}>Head today</th>
                <th scope="col" className={thClass}>Next</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {items.map((d) => (
                <tr key={d.id}>
                  <td className={tdClass}><span className="font-semibold text-slate-800 dark:text-slate-200">{d.name}</span></td>
                  <td className={tdClass}>
                    {d.current ? (
                      <>
                        <span className="text-slate-800 dark:text-slate-200">{d.current.employee.name}</span>
                        <span className="block text-xs text-slate-500">Since {day(d.current.effectiveFrom)}{d.current.effectiveTo ? `, until ${day(d.current.effectiveTo)}` : ''}</span>
                      </>
                    ) : <Badge size="sm" variant="warning">No head</Badge>}
                  </td>
                  <td className={`${tdClass} text-xs text-slate-600 dark:text-slate-400`}>
                    {d.upcoming ? `${d.upcoming.employee.name} from ${day(d.upcoming.effectiveFrom)}` : '—'}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryOf(d)} aria-label={`History of ${d.name}`}>History</Button>
                    {manage && <Button size="sm" variant="ghost" onClick={() => setAppointing(d)} aria-label={`Appoint a head of ${d.name}`}>Appoint head</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {appointing && <AppointDialog department={appointing} onClose={() => setAppointing(null)} onDone={(list) => { setDepartments(list); setAppointing(null); }} />}
      {historyOf && <HistoryDialog department={historyOf} manage={manage} onClose={() => setHistoryOf(null)} onChanged={setDepartments} />}
    </section>
  );
};

const AppointDialog: React.FC<{ department: DepartmentHeads; onClose: () => void; onDone: (list: DepartmentHeads[]) => void }> = ({ department, onClose, onDone }) => {
  const id = useId();
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [from, setFrom] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replacing = department.upcoming ?? department.current;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employee) { setError('Choose the employee who will head the department.'); return; }
    setSaving(true);
    setError(null);
    try {
      const list = await departmentHeadsApi.appoint({ departmentId: department.id, employeeId: employee.id, effectiveFrom: from, reason: reason.trim() || undefined });
      toast.success(`${employee.name} appointed head of ${department.name}`);
      onDone(list);
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Dialog title={`Appoint the head of ${department.name}`} onClose={onClose}
      footer={<><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" form={id} loading={saving} disabled={saving || !employee}>Appoint</Button></>}>
      <form id={id} onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {replacing && !replacing.effectiveTo && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-400">
            {replacing.employee.name}’s appointment will end the day before the new head starts. Their history is kept.
          </p>
        )}
        {employee ? (
          <div>
            <p className={labelClass}>New head</p>
            <p className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2B293E]">
              <span>{employee.name} <span className="font-mono text-xs text-slate-500">{employee.code}</span></span>
              <button type="button" className="text-xs font-semibold text-teal-700 underline" onClick={() => setEmployee(null)}>Change</button>
            </p>
          </div>
        ) : (
          <SearchPicker label="New head" noun="employees" find={performanceOptionsApi.employees} onPick={setEmployee} hint="Only active employees can be appointed." />
        )}
        <div>
          <label htmlFor={`${id}-from`} className={labelClass}>Heads the department from</label>
          <input id={`${id}-from`} type="date" className={fieldClass} value={from} required onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>Reason <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-reason`} className={fieldClass} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Dialog>
  );
};

const HistoryDialog: React.FC<{ department: DepartmentHeads; manage: boolean; onClose: () => void; onChanged: (list: DepartmentHeads[]) => void }> = ({ department, manage, onClose, onChanged }) => {
  const id = useId();
  const [history, setHistory] = useState<AppointmentHistory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'end' | 'cancel' | null>(null);
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    departmentHeadsApi.history(department.id).then((h) => setHistory(h.appointments)).catch((e) => setError(errorText(e)));
  }, [department.id]);
  useEffect(load, [load]);

  const latest = history?.find((h) => h.status === 'ACTIVE') ?? null;
  const act = async () => {
    if (!latest || !action) return;
    setBusy(true);
    setError(null);
    try {
      const list = action === 'end' ? await departmentHeadsApi.end(latest.appointmentId, endDate) : await departmentHeadsApi.cancel(latest.appointmentId, reason.trim());
      toast.success(action === 'end' ? 'Last day set' : 'Appointment cancelled');
      onChanged(list);
      setAction(null);
      setReason('');
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Heads of ${department.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {history === null && !error && <div className="h-16 animate-pulse rounded bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading history</span></div>}
        {history?.length === 0 && <p className="text-sm text-slate-500">No one has been appointed yet.</p>}
        {history && history.length > 0 && (
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
            {history.map((h) => (
              <li key={h.appointmentId} className={`px-3 py-2 text-sm ${h.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{h.employee.name}</span>{' '}
                <span className="text-slate-600 dark:text-slate-400">{day(h.effectiveFrom)} – {h.effectiveTo ? day(h.effectiveTo) : 'open-ended'}</span>
                {h.status === 'CANCELLED' && <Badge size="sm" variant="neutral" className="ml-2">Cancelled</Badge>}
                <span className="block text-xs text-slate-500">
                  Appointed{h.appointedBy ? ` by ${h.appointedBy}` : ''}{h.reason ? ` · ${h.reason}` : ''}
                  {h.status === 'CANCELLED' && ` · cancelled${h.cancelledBy ? ` by ${h.cancelledBy}` : ''}: ${h.cancellationReason ?? ''}`}
                </span>
              </li>
            ))}
          </ol>
        )}
        {manage && latest && !action && (
          <div className="flex flex-wrap gap-2">
            {!latest.effectiveTo && <Button size="sm" variant="outline" onClick={() => setAction('end')}>Set {latest.employee.name}’s last day</Button>}
            <Button size="sm" variant="ghost" onClick={() => setAction('cancel')}>Cancel this appointment (made by mistake)</Button>
          </div>
        )}
        {action === 'end' && latest && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
            <label htmlFor={`${id}-end`} className={labelClass}>{latest.employee.name}’s last day as head</label>
            <input id={`${id}-end`} type="date" className={`${fieldClass} sm:w-auto`} value={endDate} min={latest.effectiveFrom} onChange={(e) => setEndDate(e.target.value)} />
            <p className={hintClass}>After this day the department has no head until someone is appointed.</p>
            <div className="flex gap-2"><Button size="sm" onClick={act} loading={busy}>Set last day</Button><Button size="sm" variant="ghost" onClick={() => setAction(null)}>Back</Button></div>
          </div>
        )}
        {action === 'cancel' && latest && (
          <div className="space-y-2 rounded-lg border border-red-200 p-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Cancel {latest.employee.name}’s appointment from {day(latest.effectiveFrom)}? It stays in the history as cancelled, and the head before, if any, continues as before.
            </p>
            <label htmlFor={`${id}-reason`} className={labelClass}>Why it is cancelled</label>
            <input id={`${id}-reason`} className={fieldClass} value={reason} maxLength={500} required onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="danger" onClick={act} loading={busy} disabled={busy || reason.trim().length < 3}>Cancel appointment</Button>
              <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Keep it</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
