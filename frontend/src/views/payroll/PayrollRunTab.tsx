import React, { useCallback, useEffect, useId, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, Check, CheckCircle2, Lock, RefreshCw } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { apiClient } from '../../api/client';
import { payrollOverviewApi, type PayLine, type PayrollOverview } from '../../api/payroll-setup.api';
import { EmployeeTable, monthName, type Filter } from './PayrollOverviewTab';
import { CATEGORY, cardClass, day, errorText, fieldClass, labelClass, money } from './payroll-format';

interface RunEmployee {
  employee: { id: string; code: string; name: string };
  status: string;
  gross: string;
  deductions: string;
  net: string;
  snapshot: {
    lines?: PayLine[];
    exceptions?: string[];
    warnings?: string[];
    attendance?: { calendarDays: number; workingDays: number; paidDays: string; unpaidDays: string; absentDays: number; paidLeaveDays: number; missingDays: number };
    totals?: { employerContributions: string; roundingAdjustment: string };
  } | null;
}

const runApi = {
  start: (month: string, paymentDate: string | null) => apiClient.post(`/payroll/months/${month}/start`, { paymentDate }),
  calculate: (runId: string) => apiClient.post(`/payroll/runs/${runId}/calculate`, {}),
  approve: (runId: string) => apiClient.post(`/payroll/runs/${runId}/approve`, {}),
  finalize: (runId: string) => apiClient.post(`/payroll/runs/${runId}/finalize`, {}),
  employee: async (runId: string, employeeId: string) => (await apiClient.get<{ data: RunEmployee }>(`/payroll/runs/${runId}/employees/${employeeId}`)).data,
};

type Step = 'start' | 'calculate' | 'review' | 'approve' | 'finalize' | 'done';
const STEPS: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'start', label: 'Start' },
  { id: 'calculate', label: 'Calculate' },
  { id: 'review', label: 'Review' },
  { id: 'approve', label: 'Approve' },
  { id: 'finalize', label: 'Finalize' },
];

/** Where a month's payroll stands, from its real run on the server. */
function stepOf(o: PayrollOverview | null): Step {
  const status = o?.run?.status;
  if (!o?.run) return 'start';
  if (status === 'DRAFT') return 'calculate';
  if (status === 'FINALIZED') return 'done';
  if (status === 'APPROVED') return 'finalize';
  return o.summary?.exceptions ? 'review' : 'approve';
}

/**
 * Running a month's payroll on the server, step by step: start the month,
 * calculate everyone's pay with the payroll engine, review exceptions,
 * approve, and finalize into payslips. Nothing here works pay out in the
 * browser, and nothing is approved or finalized until the server says so.
 */
export const PayrollRunTab: React.FC<{ month: string; onMonthChange: (month: string) => void }> = ({ month, onMonthChange }) => {
  const { can } = useAuth();
  const id = useId();
  const [overview, setOverview] = useState<PayrollOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'finalize' | null>(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const valid = /^\d{4}-\d{2}$/.test(month);

  const load = useCallback(() => {
    if (!valid) return;
    setError(null);
    payrollOverviewApi.get(month).then(setOverview).catch((e) => setError(errorText(e)));
  }, [month, valid]);
  useEffect(() => { setOverview(null); setActionError(null); setFilter('ALL'); load(); }, [load]);

  const step = stepOf(overview);
  const s = overview?.summary;
  const runId = overview?.run?.id;
  const name = monthName(month);

  const act = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setActionError(null);
    setConfirm(null);
    try {
      await work();
      toast.success(done);
      const next = await payrollOverviewApi.get(month);
      setOverview(next);
      if (next.summary?.exceptions) setFilter('EXCEPTION');
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const stepIndex = STEPS.findIndex((x) => x.id === step);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Run payroll</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">Every amount is worked out on the server from salaries, policies, attendance, approved entries, overtime and loans.</p>
        </div>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor={`${id}-month`} className="sr-only">Payroll month</label>
          <input id={`${id}-month`} type="month" value={month} onChange={(e) => onMonthChange(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-[#2B293E] dark:bg-[#181724] dark:text-slate-100" />
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Payroll for {name} could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}

      <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby={`${id}-progress`}>
        <h2 id={`${id}-progress`} className="sr-only">{name} payroll progress</h2>
        <ol className="flex flex-wrap items-center gap-y-3">
          {STEPS.map((x, i) => {
            const done = step === 'done' || i < stepIndex;
            const current = i === stepIndex;
            return (
              <li key={x.id} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-teal-600 text-white' : current ? 'border-2 border-teal-600 text-teal-700' : 'border border-slate-300 text-slate-500 dark:border-slate-600'}`}>
                  {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                </span>
                <span className={`text-sm ${current ? 'font-bold text-slate-900 dark:text-slate-100' : done ? 'font-semibold text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>
                  {x.label}<span className="sr-only">{done ? ' (done)' : current ? ' (current step)' : ''}</span>
                </span>
                {i < STEPS.length - 1 && <span className={`mx-2 hidden h-px flex-1 sm:block ${done ? 'bg-teal-500' : 'bg-slate-200 dark:bg-slate-700'}`} aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-[#2B293E] dark:bg-white/5">
          {!overview && !error ? (
            <div className="h-16 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading</span></div>
          ) : step === 'start' ? (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-xl">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{name} payroll hasn’t started</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Starting creates the month’s pay run. Nothing is worked out or paid until you calculate, approve and finalize it.</p>
                {overview && overview.readiness.withoutSalary > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{overview.readiness.withoutSalary} active employees have no salary for this month and will be listed as needing attention.</p>
                )}
              </div>
              {can('payroll.create') ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor={`${id}-pay`} className={labelClass}>Pay date <span className="font-normal text-slate-400">(optional)</span></label>
                    <input id={`${id}-pay`} type="date" className={fieldClass} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                  </div>
                  <Button loading={busy === 'start'} disabled={!!busy} onClick={() => act('start', () => runApi.start(month, paymentDate || null), `${name} payroll started`)}>
                    Start {name} payroll<ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : <p className="text-sm text-slate-500">You don’t have permission to start payroll.</p>}
            </div>
          ) : step === 'calculate' ? (
            <ActionRow
              title={`Calculate ${name} payroll`}
              text="Works out each employee’s pay from their salary, payroll policy, attendance, leave, approved monthly entries, overtime, loans and arrears. You can recalculate until it is approved."
              allowed={can('payroll.process')} denied="You don’t have permission to calculate payroll."
              button={<Button loading={busy === 'calc'} disabled={!!busy} onClick={() => runId && act('calc', () => runApi.calculate(runId), 'Payroll calculated')}>Calculate payroll</Button>}
            />
          ) : step === 'review' ? (
            <ActionRow
              tone="warning"
              title={`${s?.exceptions} employee${s?.exceptions === 1 ? ' needs' : 's need'} attention`}
              text="They can’t be paid until what stops their pay is fixed: their reasons are listed below. Fix them (salary, attendance, components), then recalculate. Payroll can’t be approved while anyone needs attention."
              allowed={can('payroll.process')} denied="Ask someone who can calculate payroll to recalculate after the fixes."
              button={<Button variant="secondary" loading={busy === 'calc'} disabled={!!busy} onClick={() => runId && act('calc', () => runApi.calculate(runId), 'Payroll recalculated')}><RefreshCw className="h-4 w-4" aria-hidden="true" />Recalculate</Button>}
            />
          ) : step === 'approve' ? (
            <ActionRow
              title={`Everyone’s pay is ready: approve ${name} payroll`}
              text="Check the totals and the employees below. Once approved, the payroll can’t be recalculated; it can then be finalized into payslips."
              allowed={can('payroll.approve') || can('payroll.process')} denied="You don’t have permission to approve payroll."
              button={(
                <div className="flex flex-wrap gap-2">
                  {can('payroll.process') && <Button variant="outline" loading={busy === 'calc'} disabled={!!busy} onClick={() => runId && act('calc', () => runApi.calculate(runId), 'Payroll recalculated')}><RefreshCw className="h-4 w-4" aria-hidden="true" />Recalculate</Button>}
                  {can('payroll.approve') && <Button loading={busy === 'approve'} disabled={!!busy} onClick={() => setConfirm('approve')}>Approve payroll</Button>}
                </div>
              )}
            />
          ) : step === 'finalize' ? (
            <ActionRow
              title={`${name} payroll is approved: finalize it`}
              text="Finalizing issues a payslip to each employee, settles loan instalments and arrears, and posts the accounts. It can’t be undone or recalculated."
              allowed={can('payroll.finalize')} denied="You don’t have permission to finalize payroll."
              button={<Button loading={busy === 'finalize'} disabled={!!busy} onClick={() => setConfirm('finalize')}><Lock className="h-4 w-4" aria-hidden="true" />Finalize payroll</Button>}
            />
          ) : (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{name} payroll is finalized</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Finalized {overview?.run?.finalizedAt ? day(overview.run.finalizedAt.slice(0, 10)) : ''}. Payslips are issued and the month is closed to changes; corrections go through arrears in a later month. No payment is recorded yet.
                </p>
              </div>
            </div>
          )}
          {actionError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
        </div>

        {s && (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ['Employees', String(s.employees)],
              ['Need attention', String(s.exceptions)],
              ['Gross pay', money(s.earnings)],
              ['Deductions', money(s.deductions)],
              ['Net pay', money(s.net)],
              ['Employer contributions', money(s.employerContributions)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className={`mt-1 font-bold tabular-nums ${label === 'Need attention' && s.exceptions ? 'text-red-700' : 'text-slate-900 dark:text-slate-100'}`}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {s && <p className="mt-2 text-xs text-slate-500">Totals cover employees whose pay is worked out; those needing attention aren’t included until fixed.</p>}
      </section>

      {overview?.run && overview.run.status !== 'DRAFT' && valid && (
        <EmployeeTable month={month} filter={filter} onFilter={setFilter} hasRun refreshKey={`${overview.run.status}-${overview.run.calculatedAt}`} onOpen={can('salary.view') ? setOpen : undefined} />
      )}

      {confirm === 'approve' && s && (
        <Dialog title={`Approve ${name} payroll?`} onClose={() => setConfirm(null)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep reviewing</Button>
            <Button onClick={() => runId && act('approve', () => runApi.approve(runId), `${name} payroll approved`)}>Approve {s.employees} employees</Button>
          </>
        )}>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {s.employees} employees, net pay {money(s.net)} (gross {money(s.earnings)}, deductions {money(s.deductions)}). Once approved, this payroll can’t be recalculated.
          </p>
        </Dialog>
      )}
      {confirm === 'finalize' && s && (
        <Dialog title={`Finalize ${name} payroll?`} onClose={() => setConfirm(null)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Not yet</Button>
            <Button onClick={() => runId && act('finalize', () => runApi.finalize(runId), `${name} payroll finalized; payslips issued`)}><Lock className="h-4 w-4" aria-hidden="true" />Finalize and issue payslips</Button>
          </>
        )}>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Finalized payslips can’t be recalculated in place. {s.employees} payslips are issued for {money(s.net)} net pay, loan instalments and arrears in this payroll are settled, and {name} is closed to salary, policy and attendance changes.
          </p>
        </Dialog>
      )}
      {open && runId && <EmployeePayDialog runId={runId} employeeId={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

const ActionRow: React.FC<{ title: string; text: string; button: React.ReactNode; allowed: boolean; denied: string; tone?: 'warning' }> = ({ title, text, button, allowed, denied, tone }) => (
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="max-w-2xl">
      <p className={`flex items-center gap-2 font-semibold ${tone === 'warning' ? 'text-amber-900 dark:text-amber-200' : 'text-slate-900 dark:text-slate-100'}`}>
        {tone === 'warning' && <AlertTriangle className="h-4 w-4" aria-hidden="true" />}{title}
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{text}</p>
    </div>
    {allowed ? button : <p className="text-sm text-slate-500">{denied}</p>}
  </div>
);

export const EmployeePayDialog: React.FC<{ runId: string; employeeId: string; onClose: () => void }> = ({ runId, employeeId, onClose }) => {
  const [data, setData] = useState<RunEmployee | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { runApi.employee(runId, employeeId).then(setData).catch((e) => setError(errorText(e))); }, [runId, employeeId]);
  const snap = data?.snapshot;
  return (
    <Dialog title={data ? `${data.employee.name} · pay` : 'Employee pay'} size="lg" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!data && !error && <div className="h-32 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading</span></div>}
      {data && (
        <div className="space-y-4 text-sm">
          {!!snap?.exceptions?.length && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
              <p className="font-semibold">Can’t be paid until fixed:</p>
              <ul className="mt-1 list-disc pl-5">{snap.exceptions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {!!snap?.warnings?.length && <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">{snap.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {snap?.attendance && (
            <p className="text-xs text-slate-600">
              {snap.attendance.paidDays} paid of {snap.attendance.calendarDays} days · {snap.attendance.unpaidDays} unpaid · {snap.attendance.absentDays} absent · {snap.attendance.paidLeaveDays} paid leave{snap.attendance.missingDays ? ` · ${snap.attendance.missingDays} without attendance` : ''}
            </p>
          )}
          <table className="w-full">
            <caption className="sr-only">Pay lines</caption>
            <thead><tr><th scope="col" className="py-1 text-left text-xs text-slate-500">Component</th><th scope="col" className="py-1 text-right text-xs text-slate-500">Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {(snap?.lines ?? []).map((l) => (
                <tr key={l.componentCode}>
                  <td className="py-2 pr-2">
                    <span className="font-medium">{l.componentName}</span> <Badge size="sm" variant={CATEGORY[l.componentCategory].variant}>{CATEGORY[l.componentCategory].label}</Badge>
                    <ul className="mt-0.5 text-xs text-slate-500">{l.steps.map((step, i) => <li key={i}>{step}</li>)}</ul>
                  </td>
                  <td className="py-2 text-right align-top tabular-nums">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-1 border-t border-slate-200 pt-2 dark:border-[#2B293E]">
            <div className="flex justify-between"><dt>Gross</dt><dd className="tabular-nums">{money(data.gross)}</dd></div>
            <div className="flex justify-between"><dt>Deductions</dt><dd className="tabular-nums">−{money(data.deductions)}</dd></div>
            {snap?.totals?.roundingAdjustment && snap.totals.roundingAdjustment !== '0.00' && <div className="flex justify-between text-slate-500"><dt>Rounding</dt><dd className="tabular-nums">{money(snap.totals.roundingAdjustment)}</dd></div>}
            <div className="flex justify-between font-bold"><dt>Net pay</dt><dd className="tabular-nums">{money(data.net)}</dd></div>
          </dl>
        </div>
      )}
    </Dialog>
  );
};
