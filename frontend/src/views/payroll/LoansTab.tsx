import React, { useCallback, useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { loansApi, payCalculationApi, type LoanDetail, type LoanSummary, type PayableEmployee } from '../../api/payroll-setup.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, money, tdClass, thClass } from './payroll-format';

const LOAN_STATUS: Record<LoanSummary['status'], { label: string; variant: 'info' | 'success' | 'neutral' }> = {
  ACTIVE: { label: 'Recovering', variant: 'info' },
  CLOSED: { label: 'Repaid', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};
const INSTALMENT_STATUS: Record<LoanDetail['installments'][number]['status'], string> = {
  SCHEDULED: 'Due', RECOVERED: 'Recovered', DEFERRED: 'Moved to the end', CANCELLED: 'Cancelled',
};
const nextMonth = () => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Loans and advances to employees, recovered from pay month by month. */
export const LoansTab: React.FC = () => {
  const { can } = useAuth();
  const id = useId();
  const editable = can('payroll.loans.manage');
  const [loans, setLoans] = useState<LoanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LoanDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError(null);
    loansApi.list().then(setLoans).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  const show = async (loanId: string) => {
    try { setOpen(await loansApi.get(loanId)); } catch (e) { toast.error(errorText(e)); }
  };

  return (
    <section className={cardClass} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <div>
          <h2 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Loans and advances</h2>
          <p className="text-xs text-slate-500">Recovered from pay each month. An instalment counts as recovered only when that month’s payroll is finalized.</p>
        </div>
        {editable && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New loan or advance</Button>}
      </div>
      {error && (
        <div role="alert" className="m-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Loans could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {loans === null && !error ? (
        <div className="h-24 animate-pulse bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading loans</span></div>
      ) : loans?.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No loans or advances</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Record a loan or salary advance and how it is repaid; payroll deducts each instalment in its month. You need a deduction component worked out by payroll from “Loan and advance recovery”.</p>
        </div>
      ) : loans && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5"><tr>
              <th scope="col" className={thClass}>Loan</th>
              <th scope="col" className={thClass}>Employee</th>
              <th scope="col" className={`${thClass} text-right`}>Amount</th>
              <th scope="col" className={`${thClass} text-right`}>Recovered</th>
              <th scope="col" className={`${thClass} text-right`}>Outstanding</th>
              <th scope="col" className={thClass}>Next</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className={tdClass}>
                    <button type="button" onClick={() => show(l.id)} className="rounded font-mono text-xs font-semibold text-slate-900 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-100">{l.loanNumber}</button>
                    <span className="block text-xs text-slate-500">{l.loanType === 'ADVANCE' ? 'Advance' : 'Loan'} · <Badge size="sm" variant={LOAN_STATUS[l.status].variant}>{LOAN_STATUS[l.status].label}</Badge></span>
                  </td>
                  <td className={tdClass}>{l.employee.name}<span className="block text-xs text-slate-500">{l.employee.code}</span></td>
                  <td className={`${tdClass} text-right tabular-nums`}>{money(l.principal)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{money(l.recovered)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{money(l.outstanding)}</td>
                  <td className={`${tdClass} text-xs`}>{l.nextDue ? `${money(l.nextDue.amount)} in ${l.nextDue.date.slice(0, 7)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewLoanDialog onClose={() => setCreating(false)} onCreated={(loan) => { setCreating(false); setOpen(loan); load(); }} />}
      {open && <LoanDialog loan={open} editable={editable} onClose={() => setOpen(null)} onChanged={(loan) => { setOpen(loan); load(); }} />}
    </section>
  );
};

const NewLoanDialog: React.FC<{ onClose: () => void; onCreated: (loan: LoanDetail) => void }> = ({ onClose, onCreated }) => {
  const id = useId();
  const [employees, setEmployees] = useState<PayableEmployee[] | null>(null);
  const [form, setForm] = useState({ employeeId: '', loanType: 'LOAN' as 'LOAN' | 'ADVANCE', principal: '', by: 'COUNT' as 'COUNT' | 'AMOUNT', installments: '6', installmentAmount: '', firstMonth: nextMonth(), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { payCalculationApi.employees(form.firstMonth).then(setEmployees).catch((e) => setError(errorText(e))); }, [form.firstMonth]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const loan = await loansApi.create({
        employeeId: form.employeeId, loanType: form.loanType, principal: form.principal.trim(), firstMonth: form.firstMonth, note: form.note.trim() || undefined,
        ...(form.by === 'COUNT' ? { installments: Number(form.installments) } : { installmentAmount: form.installmentAmount.trim() }),
      });
      toast.success(`${loan.loanNumber} recorded`);
      onCreated(loan);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title="New loan or advance" size="lg" onClose={onClose} footer={(
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={id} loading={busy} disabled={busy}>Record and schedule recovery</Button>
      </>
    )}>
      <form id={id} onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-employee`} className={labelClass}>Employee</label>
            <select id={`${id}-employee`} className={fieldClass} required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">{employees === null ? 'Loading…' : 'Choose…'}</option>
              {employees?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-type`} className={labelClass}>Type</label>
            <select id={`${id}-type`} className={fieldClass} value={form.loanType} onChange={(e) => setForm({ ...form, loanType: e.target.value as 'LOAN' | 'ADVANCE' })}>
              <option value="LOAN">Loan</option>
              <option value="ADVANCE">Salary advance</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-principal`} className={labelClass}>Amount given</label>
            <input id={`${id}-principal`} className={fieldClass} inputMode="decimal" required value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
            <p className={hintClass}>No interest is charged; the whole amount is recovered.</p>
          </div>
          <div>
            <label htmlFor={`${id}-first`} className={labelClass}>First month recovered from pay</label>
            <input id={`${id}-first`} type="month" className={fieldClass} required value={form.firstMonth} onChange={(e) => setForm({ ...form, firstMonth: e.target.value })} />
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className={labelClass}>Recover</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-by`} checked={form.by === 'COUNT'} onChange={() => setForm({ ...form, by: 'COUNT' })} />
            Over
            <input aria-label="Number of monthly instalments" type="number" min={1} max={120} className={`${fieldClass} w-20 py-1`} disabled={form.by !== 'COUNT'} value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} />
            months, in equal instalments
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-by`} checked={form.by === 'AMOUNT'} onChange={() => setForm({ ...form, by: 'AMOUNT' })} />
            By
            <input aria-label="Amount recovered each month" inputMode="decimal" className={`${fieldClass} w-28 py-1`} disabled={form.by !== 'AMOUNT'} value={form.installmentAmount} onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })} />
            a month (the last takes what is left)
          </label>
        </fieldset>
        <div>
          <label htmlFor={`${id}-note`} className={labelClass}>Note <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-note`} className={fieldClass} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </form>
    </Dialog>
  );
};

const LoanDialog: React.FC<{ loan: LoanDetail; editable: boolean; onClose: () => void; onChanged: (loan: LoanDetail) => void }> = ({ loan, editable, onClose, onChanged }) => {
  const id = useId();
  const [action, setAction] = useState<{ kind: 'defer'; installmentId: string; label: string } | { kind: 'cancel' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      onChanged(action.kind === 'defer' ? await loansApi.defer(loan.id, action.installmentId, reason.trim()) : await loansApi.cancel(loan.id, reason.trim()));
      toast.success(action.kind === 'defer' ? 'Instalment moved to the end of the plan' : 'Loan cancelled');
      setAction(null);
      setReason('');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`${loan.loanType === 'ADVANCE' ? 'Advance' : 'Loan'} ${loan.loanNumber} · ${loan.employee.name}`} size="lg" onClose={onClose} footer={(
      <>
        {editable && loan.status === 'ACTIVE' && loan.recovered === '0.00' && !action && <Button variant="outline" onClick={() => setAction({ kind: 'cancel' })}>Cancel loan</Button>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>
    )}>
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-3 gap-2">
          <div><dt className="text-xs text-slate-500">Amount</dt><dd className="font-semibold tabular-nums">{money(loan.principal)}</dd></div>
          <div><dt className="text-xs text-slate-500">Recovered</dt><dd className="font-semibold tabular-nums">{money(loan.recovered)}</dd></div>
          <div><dt className="text-xs text-slate-500">Outstanding</dt><dd className="font-semibold tabular-nums">{money(loan.outstanding)}</dd></div>
        </dl>
        <table className="w-full text-sm">
          <caption className="sr-only">Instalments</caption>
          <thead><tr><th scope="col" className="py-1 text-left text-xs text-slate-500">#</th><th scope="col" className="py-1 text-left text-xs text-slate-500">Month</th><th scope="col" className="py-1 text-right text-xs text-slate-500">Amount</th><th scope="col" className="py-1 text-left text-xs text-slate-500">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {loan.installments.map((i) => (
              <tr key={i.id}>
                <td className="py-1.5 tabular-nums">{i.number}</td>
                <td className="py-1.5">{i.dueDate.slice(0, 7)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(i.amount)}</td>
                <td className="py-1.5 pl-3 text-xs">{INSTALMENT_STATUS[i.status]}</td>
                <td className="py-1.5 text-right">
                  {editable && loan.status === 'ACTIVE' && i.status === 'SCHEDULED' && !action && (
                    <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'defer', installmentId: i.id, label: i.dueDate.slice(0, 7) })}>Skip this month</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loan.repayments.length > 0 && <p className="text-xs text-slate-500">Repayments: {loan.repayments.map((r) => `${money(r.amount)} on ${day(r.date)} (${r.source === 'PAYROLL' ? 'payroll' : r.source.toLowerCase()})`).join('; ')}</p>}
        {action && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">{action.kind === 'defer' ? `Skip recovery in ${action.label}? That instalment moves to after the last one.` : 'Cancel this loan? Nothing has been recovered, so no instalment will be deducted.'}</p>
            <label htmlFor={`${id}-reason`} className={labelClass}>Why</label>
            <input id={`${id}-reason`} className={fieldClass} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAction(null); setReason(''); }}>Back</Button>
              <Button size="sm" variant={action.kind === 'cancel' ? 'danger' : 'primary'} disabled={busy || reason.trim().length < 3} loading={busy} onClick={run}>{action.kind === 'defer' ? 'Skip this month' : 'Cancel loan'}</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
