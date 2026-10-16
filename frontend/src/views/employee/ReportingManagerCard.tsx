import React, { useCallback, useEffect, useId, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { employeesApi } from '../../api/employees.api';
import { employeeRelationsApi, type Reporting, type ReportingLine } from '../../api/employee-relations.api';
import { day, errorText, fieldClass, hintClass, labelClass, todayIso } from '../payroll/payroll-format';
import { SearchPicker, type PickerOption } from '../performance/SearchPicker';

/** Active employees by name or code, through the People list the viewer may already see. */
const findEmployees = (term: string) => employeesApi.list(1, 20, term).then((r) => r.items
  .filter((e) => e.employee_status === 'ACTIVE')
  .map((e) => ({ id: e.id, name: [e.first_name, e.last_name].filter(Boolean).join(' '), code: e.employee_code })));

/**
 * Who the employee reports to, with history. A new manager starts from a
 * date and the previous line closes the day before; a mistaken line is
 * cancelled, never edited. Review workflows find managers from here.
 */
export const ReportingManagerCard: React.FC<{ employeeId: string }> = ({ employeeId }) => {
  const { can } = useAuth();
  const manage = can('people.update');
  const [reporting, setReporting] = useState<Reporting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setting, setSetting] = useState(false);
  const [history, setHistory] = useState(false);

  const load = useCallback(() => {
    setError(null);
    employeeRelationsApi.reporting(employeeId).then(setReporting).catch((e) => setError(errorText(e)));
  }, [employeeId]);
  useEffect(load, [load]);

  const current = reporting?.current;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-teal-500" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reports to</h3>
        </div>
        {reporting && reporting.history.length > 0 && <Button size="sm" variant="ghost" onClick={() => setHistory(true)}>History</Button>}
      </div>
      {error && <p role="alert" className="text-xs text-red-700">The manager could not be loaded: {error} <button type="button" className="font-semibold underline" onClick={load}>Try again</button></p>}
      {!reporting && !error && <div className="h-10 animate-pulse rounded bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading manager</span></div>}
      {reporting && (
        <div className="space-y-2 text-xs">
          {current ? (
            <p className="text-slate-700 dark:text-slate-200">
              <span className="font-semibold">{current.manager.name}</span> <span className="font-mono text-slate-500">{current.manager.code}</span>
              <span className="block text-slate-500">Since {day(current.effectiveFrom)}{current.effectiveTo ? `, until ${day(current.effectiveTo)}` : ''}</span>
            </p>
          ) : <p className="text-slate-500">No reporting manager on record. Manager reviews can’t find a reviewer until one is set.</p>}
          {reporting.upcoming && <p className="text-slate-500">From {day(reporting.upcoming.effectiveFrom)}: {reporting.upcoming.manager.name}</p>}
          {manage && <Button size="sm" variant="outline" onClick={() => setSetting(true)}>{current || reporting.upcoming ? 'Change manager' : 'Set manager'}</Button>}
        </div>
      )}
      {setting && reporting && (
        <SetManagerDialog employeeId={employeeId} latest={reporting.history.find((l) => l.status === 'ACTIVE') ?? null}
          onClose={() => setSetting(false)} onDone={(r) => { setReporting(r); setSetting(false); }} />
      )}
      {history && reporting && (
        <HistoryDialog employeeId={employeeId} reporting={reporting} manage={manage} onClose={() => setHistory(false)} onChanged={setReporting} />
      )}
    </Card>
  );
};

const SetManagerDialog: React.FC<{ employeeId: string; latest: ReportingLine | null; onClose: () => void; onDone: (r: Reporting) => void }> = ({ employeeId, latest, onClose, onDone }) => {
  const id = useId();
  const [manager, setManager] = useState<PickerOption | null>(null);
  const [from, setFrom] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manager) { setError('Choose the manager.'); return; }
    setSaving(true);
    setError(null);
    try {
      onDone(await employeeRelationsApi.setManager(employeeId, { managerEmployeeId: manager.id, effectiveFrom: from, reason: reason.trim() || undefined }));
      toast.success(`Reports to ${manager.name} from ${day(from)}`);
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Dialog title="Set the reporting manager" onClose={onClose}
      footer={<><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" form={id} loading={saving} disabled={saving || !manager}>Set manager</Button></>}>
      <form id={id} onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {latest && !latest.effectiveTo && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-400">
            Reporting to {latest.manager.name} will end the day before. That history is kept.
          </p>
        )}
        {manager ? (
          <div>
            <p className={labelClass}>Manager</p>
            <p className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2B293E]">
              <span>{manager.name} <span className="font-mono text-xs text-slate-500">{manager.code}</span></span>
              <button type="button" className="text-xs font-semibold text-teal-700 underline" onClick={() => setManager(null)}>Change</button>
            </p>
          </div>
        ) : <SearchPicker label="Manager" noun="employees" find={findEmployees} onPick={setManager} exclude={[employeeId]} hint="Only active employees." />}
        <div>
          <label htmlFor={`${id}-from`} className={labelClass}>Reports to them from</label>
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

const HistoryDialog: React.FC<{ employeeId: string; reporting: Reporting; manage: boolean; onClose: () => void; onChanged: (r: Reporting) => void }> = ({ employeeId, reporting, manage, onClose, onChanged }) => {
  const id = useId();
  const latest = reporting.history.find((l) => l.status === 'ACTIVE') ?? null;
  const [action, setAction] = useState<'end' | 'cancel' | null>(null);
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async () => {
    if (!latest || !action) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(action === 'end' ? await employeeRelationsApi.endManager(employeeId, latest.lineId, endDate) : await employeeRelationsApi.cancelManager(employeeId, latest.lineId, reason.trim()));
      toast.success(action === 'end' ? 'Last day set' : 'Reporting line cancelled');
      setAction(null);
      setReason('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Reporting managers" onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
          {reporting.history.map((l) => (
            <li key={l.lineId} className={`px-3 py-2 text-sm ${l.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{l.manager.name}</span>{' '}
              <span className="text-slate-600 dark:text-slate-400">{day(l.effectiveFrom)} – {l.effectiveTo ? day(l.effectiveTo) : 'open-ended'}</span>
              {l.status === 'CANCELLED' && <Badge size="sm" variant="neutral" className="ml-2">Cancelled</Badge>}
              <span className="block text-xs text-slate-500">
                Set{l.setBy ? ` by ${l.setBy}` : ''}{l.reason ? ` · ${l.reason}` : ''}
                {l.status === 'CANCELLED' && ` · cancelled${l.cancelledBy ? ` by ${l.cancelledBy}` : ''}: ${l.cancellationReason ?? ''}`}
              </span>
            </li>
          ))}
        </ol>
        {manage && latest && !action && (
          <div className="flex flex-wrap gap-2">
            {!latest.effectiveTo && <Button size="sm" variant="outline" onClick={() => setAction('end')}>Set the last day with {latest.manager.name}</Button>}
            <Button size="sm" variant="ghost" onClick={() => setAction('cancel')}>Cancel the latest line (made by mistake)</Button>
          </div>
        )}
        {action === 'end' && latest && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
            <label htmlFor={`${id}-end`} className={labelClass}>Last day reporting to {latest.manager.name}</label>
            <input id={`${id}-end`} type="date" className={`${fieldClass} sm:w-auto`} value={endDate} min={latest.effectiveFrom} onChange={(e) => setEndDate(e.target.value)} />
            <p className={hintClass}>After this day there is no manager on record until a new one is set.</p>
            <div className="flex gap-2"><Button size="sm" onClick={act} loading={busy}>Set last day</Button><Button size="sm" variant="ghost" onClick={() => setAction(null)}>Back</Button></div>
          </div>
        )}
        {action === 'cancel' && latest && (
          <div className="space-y-2 rounded-lg border border-red-200 p-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Cancel reporting to {latest.manager.name} from {day(latest.effectiveFrom)}? It stays in the history as cancelled, and the manager before, if any, continues.
            </p>
            <label htmlFor={`${id}-reason`} className={labelClass}>Why it is cancelled</label>
            <input id={`${id}-reason`} className={fieldClass} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="danger" onClick={act} loading={busy} disabled={busy || reason.trim().length < 3}>Cancel line</Button>
              <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Keep it</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
