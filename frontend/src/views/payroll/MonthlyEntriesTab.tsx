import React, { useCallback, useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { inputsApi, payCalculationApi, type InputEntry, type InputMonth, type PayableEmployee } from '../../api/payroll-setup.api';
import { CATEGORY, cardClass, errorText, fieldClass, hintClass, labelClass, money, tdClass, thClass } from './payroll-format';

const STATUS: Record<InputEntry['status'], { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Waiting for approval', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Monthly entries: one-off amounts for a month such as a bonus, incentive,
 * commission or manual deduction. Paid only once someone other than the
 * person who entered them approves them.
 */
export const MonthlyEntriesTab: React.FC = () => {
  const { can } = useAuth();
  const id = useId();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<InputMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rejecting, setRejecting] = useState<InputEntry | null>(null);

  const load = useCallback(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setError(null);
    setData(null);
    inputsApi.list(month).then(setData).catch((e) => setError(errorText(e)));
  }, [month]);
  useEffect(load, [load]);

  const act = async (work: () => Promise<InputMonth>, done: string) => {
    try {
      setData(await work());
      toast.success(done);
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const canManage = can('payroll.inputs.manage') && !data?.finalized;
  const canApprove = can('payroll.inputs.approve') && !data?.finalized;
  const pending = data?.entries.filter((e) => e.status === 'PENDING').length ?? 0;

  return (
    <section className={cardClass} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <div>
          <h2 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Monthly entries</h2>
          <p className="text-xs text-slate-500">Bonuses, incentives, commissions and other one-off amounts. Each is paid in its month once someone other than the person who entered it approves it.</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor={`${id}-month`} className={labelClass}>Month</label>
            <input id={`${id}-month`} type="month" className={fieldClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          {canManage && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden="true" />New entry</Button>}
        </div>
      </div>
      {data?.finalized && <p role="note" className="m-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Payroll for {month} is finalized, so its entries can’t change. Enter new amounts in a later month.</p>}
      {pending > 0 && !data?.finalized && <p role="note" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{pending} entr{pending === 1 ? 'y is' : 'ies are'} waiting for approval and won’t be paid until approved.</p>}
      {error && (
        <div role="alert" className="m-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Entries could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {!data && !error ? (
        <div className="h-24 animate-pulse bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading entries</span></div>
      ) : data?.entries.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No entries for {month}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Add a bonus, incentive or deduction for an employee for this month. Entries use components set to “Entered each month”.</p>
        </div>
      ) : data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5"><tr>
              <th scope="col" className={thClass}>Employee</th>
              <th scope="col" className={thClass}>Component</th>
              <th scope="col" className={`${thClass} text-right`}>Amount</th>
              <th scope="col" className={thClass}>Status</th>
              <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {data.entries.map((e) => (
                <tr key={e.id} className={e.status === 'CANCELLED' || e.status === 'REJECTED' ? 'opacity-70' : undefined}>
                  <td className={tdClass}>{e.employee.name}<span className="block text-xs text-slate-500">{e.employee.code}</span></td>
                  <td className={tdClass}>{e.component.name} <Badge size="sm" variant={CATEGORY[e.component.category].variant}>{CATEGORY[e.component.category].label}</Badge>{e.note && <span className="block text-xs text-slate-500">{e.note}</span>}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{money(e.amount)}</td>
                  <td className={tdClass}>
                    <Badge size="sm" variant={STATUS[e.status].variant}>{STATUS[e.status].label}</Badge>
                    <span className="block text-xs text-slate-500">
                      {e.createdBy ? `Entered by ${e.createdBy}` : ''}{e.approvedBy ? ` · approved by ${e.approvedBy}` : ''}{e.rejectionReason ? ` · ${e.rejectionReason}` : ''}
                    </span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    {e.status === 'PENDING' && canApprove && <Button size="sm" variant="ghost" onClick={() => act(() => inputsApi.approve(e.id), 'Entry approved')}>Approve</Button>}
                    {e.status === 'PENDING' && canApprove && <Button size="sm" variant="ghost" onClick={() => setRejecting(e)}>Reject</Button>}
                    {(e.status === 'PENDING' || e.status === 'APPROVED') && canManage && <Button size="sm" variant="ghost" onClick={() => act(() => inputsApi.cancel(e.id), 'Entry cancelled')}>Cancel</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <NewEntryDialog month={month} onClose={() => setAdding(false)} onSaved={(next) => { setData(next); setAdding(false); }} />}
      {rejecting && <RejectDialog entry={rejecting} onClose={() => setRejecting(null)} onRejected={(next) => { setData(next); setRejecting(null); }} />}
    </section>
  );
};

const NewEntryDialog: React.FC<{ month: string; onClose: () => void; onSaved: (data: InputMonth) => void }> = ({ month, onClose, onSaved }) => {
  const id = useId();
  const [employees, setEmployees] = useState<PayableEmployee[] | null>(null);
  const [components, setComponents] = useState<{ id: string; code: string; name: string; category: string }[] | null>(null);
  const [form, setForm] = useState({ employeeId: '', salaryComponentId: '', amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([payCalculationApi.employees(month), inputsApi.components()])
      .then(([e, c]) => { setEmployees(e); setComponents(c); })
      .catch((e) => setError(errorText(e)));
  }, [month]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await inputsApi.create({ month, employeeId: form.employeeId, salaryComponentId: form.salaryComponentId, amount: form.amount.trim(), note: form.note.trim() || undefined }));
      toast.success('Entry saved. It is paid once someone else approves it.');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`New entry for ${month}`} onClose={onClose} footer={(
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={id} loading={busy} disabled={busy}>Save entry</Button>
      </>
    )}>
      <form id={id} onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div>
          <label htmlFor={`${id}-employee`} className={labelClass}>Employee</label>
          <select id={`${id}-employee`} className={fieldClass} required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            <option value="">{employees === null ? 'Loading…' : 'Choose…'}</option>
            {employees?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-component`} className={labelClass}>Component</label>
          <select id={`${id}-component`} className={fieldClass} required value={form.salaryComponentId} onChange={(e) => setForm({ ...form, salaryComponentId: e.target.value })}>
            <option value="">{components === null ? 'Loading…' : components.length ? 'Choose…' : 'No components are entered each month'}</option>
            {components?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code}, {c.category === 'EARNING' ? 'earning' : 'deduction'})</option>)}
          </select>
          {components?.length === 0 && <p className={hintClass}>Create a component calculated as “Entered each month” first, such as BONUS.</p>}
        </div>
        <div>
          <label htmlFor={`${id}-amount`} className={labelClass}>Amount</label>
          <input id={`${id}-amount`} className={fieldClass} inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-note`} className={labelClass}>Note <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-note`} className={fieldClass} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </form>
    </Dialog>
  );
};

const RejectDialog: React.FC<{ entry: InputEntry; onClose: () => void; onRejected: (data: InputMonth) => void }> = ({ entry, onClose, onRejected }) => {
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      onRejected(await inputsApi.reject(entry.id, reason.trim()));
      toast.success('Entry rejected');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Reject ${entry.component.name} for ${entry.employee.name}?`} onClose={onClose} footer={(
      <>
        <Button variant="outline" type="button" onClick={onClose}>Keep it</Button>
        <Button variant="danger" type="submit" form={id} loading={busy} disabled={busy || reason.trim().length < 3}>Reject entry</Button>
      </>
    )}>
      <form id={id} onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <p className="text-sm text-slate-700 dark:text-slate-300">{money(entry.amount)} won’t be paid. The person who entered it sees your reason.</p>
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>Why</label>
          <input id={`${id}-reason`} className={fieldClass} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Dialog>
  );
};
