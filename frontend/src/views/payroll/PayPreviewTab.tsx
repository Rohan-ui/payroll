import React, { useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { payCalculationApi, type EmployeePay, type PayableEmployee } from '../../api/payroll-setup.api';
import { CATEGORY, PAY_BASIS, cardClass, day, errorText, fieldClass, labelClass, money } from './payroll-format';

const lastMonth = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const hours = (minutes: number) => `${(minutes / 60).toFixed(minutes % 60 ? 2 : 0)} h`;

/**
 * One employee's pay for a month, worked out the way a payroll run does it,
 * with every number explained. Nothing is saved.
 */
export const PayPreviewTab: React.FC = () => {
  const id = useId();
  const [month, setMonth] = useState(lastMonth());
  const [employees, setEmployees] = useState<PayableEmployee[] | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [pay, setPay] = useState<EmployeePay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setEmployees(null);
    payCalculationApi.employees(month).then(setEmployees).catch((e) => setError(errorText(e)));
  }, [month]);

  useEffect(() => {
    if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) { setPay(null); return; }
    let current = true;
    setLoading(true);
    setError(null);
    payCalculationApi.preview(employeeId, month)
      .then((p) => { if (current) setPay(p); })
      .catch((e) => { if (current) { setPay(null); setError(errorText(e)); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [employeeId, month]);

  const withSalary = employees?.filter((e) => e.hasSalary) ?? [];
  const withoutSalary = employees?.filter((e) => !e.hasSalary) ?? [];
  const a = pay?.attendance;

  return (
    <div className="space-y-4">
      <section className={`${cardClass} p-4`} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Pay preview</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Works out one employee’s pay for a month exactly as a payroll run does, from their salary, payroll policy and attendance. Nothing is saved.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label htmlFor={`${id}-month`} className={labelClass}>Month</label>
            <input id={`${id}-month`} type="month" className={fieldClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-employee`} className={labelClass}>Employee</label>
            <select id={`${id}-employee`} className={fieldClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!employees}>
              <option value="">{employees === null ? 'Loading…' : employees.length ? 'Choose…' : 'No one to pay this month'}</option>
              {withSalary.length > 0 && <optgroup label="With a salary this month">{withSalary.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}</optgroup>}
              {withoutSalary.length > 0 && <optgroup label="Active, but no salary set">{withoutSalary.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}</optgroup>}
            </select>
            {employees && withoutSalary.length > 0 && <p className="mt-1 text-xs text-amber-700">{withoutSalary.length} active employee{withoutSalary.length === 1 ? ' has' : 's have'} no salary for this month and can’t be paid.</p>}
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <div className="h-32 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Working out pay</span></div>}

      {pay && !loading && a && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className={cardClass} aria-labelledby={`${id}-pay`}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
              <div>
                <h3 id={`${id}-pay`} className="text-sm font-bold text-slate-900 dark:text-slate-100">{pay.employee.name} · {day(pay.period.start)} – {day(pay.period.end)}</h3>
                <p className="text-xs text-slate-500">
                  {pay.segments.map((s) => `${s.structure.name} v${s.structure.version} · ${PAY_BASIS[s.payBasis]}${s.policy ? ` · ${s.policy.name} v${s.policy.version}` : ''}${pay.segments.length > 1 ? ` (${day(s.from)} – ${day(s.to)})` : ''}`).join('; ') || 'No salary'}
                </p>
              </div>
              {pay.status === 'READY' ? <Badge variant="success">Ready to pay</Badge> : <Badge variant="danger">Needs attention</Badge>}
            </div>
            {pay.exceptions.length > 0 && (
              <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">This employee can’t be paid until these are fixed:</p>
                <ul className="mt-1 list-disc pl-5">{pay.exceptions.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {pay.warnings.length > 0 && <ul className="m-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{pay.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Pay lines and how each was worked out</caption>
                <thead className="bg-slate-50 dark:bg-white/5"><tr>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Component and how it was worked out</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {pay.lines.map((l) => (
                    <tr key={l.componentCode}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{l.componentName}</span>
                        <span className="ml-2"><Badge size="sm" variant={CATEGORY[l.componentCategory].variant}>{CATEGORY[l.componentCategory].label}</Badge></span>
                        {!l.showOnPayslip && <span className="ml-2 text-[11px] text-slate-500">not shown on payslip</span>}
                        <ul className="mt-1 text-xs text-slate-500">{l.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </td>
                      <td className="px-4 py-2.5 text-right align-top tabular-nums">{money(l.amount, pay.currency)}</td>
                    </tr>
                  ))}
                  {pay.lines.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-sm text-slate-500">No pay lines.</td></tr>}
                </tbody>
              </table>
            </div>
            <dl className="space-y-1 border-t border-slate-200 px-4 py-3 text-sm dark:border-[#2B293E]">
              <div className="flex justify-between"><dt>Earnings</dt><dd className="tabular-nums">{money(pay.totals.earnings, pay.currency)}</dd></div>
              <div className="flex justify-between"><dt>Deductions</dt><dd className="tabular-nums">−{money(pay.totals.deductions, pay.currency)}</dd></div>
              {pay.totals.roundingAdjustment !== '0.00' && <div className="flex justify-between text-slate-500"><dt>Rounding (policy)</dt><dd className="tabular-nums">{money(pay.totals.roundingAdjustment, pay.currency)}</dd></div>}
              <div className="flex justify-between text-base font-bold"><dt>Net pay</dt><dd className="tabular-nums">{money(pay.totals.net, pay.currency)}</dd></div>
              <div className="flex justify-between text-xs text-slate-500"><dt>Employer contributions (not from pay)</dt><dd className="tabular-nums">{money(pay.totals.employerContributions, pay.currency)}</dd></div>
            </dl>
          </section>

          <aside className={`${cardClass} h-fit p-4`} aria-labelledby={`${id}-days`}>
            <h3 id={`${id}-days`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Days and hours</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {([
                ['Days in period', a.calendarDays], ['Working days', a.workingDays], ['Present', a.presentDays], ['Half days', a.halfDays],
                ['Paid leave', a.paidLeaveDays], ['Unpaid leave', a.unpaidLeaveDays], ['Absent', a.absentDays], ['Holidays', a.holidays],
                ['Weekly offs', a.weeklyOffs], ['Not employed', a.notEmployedDays], ['No attendance', a.missingDays],
                ['Paid days', a.paidDays], ['Unpaid days', a.unpaidDays],
                ['Worked', hours(a.workedMinutes)], ['Payable', hours(a.payableMinutes)], ['Late arrivals', `${a.lateCount} (${a.lateMinutes} min)`],
                ['Early departures', `${a.earlyCount} (${a.earlyMinutes} min)`], ['Overtime recorded', hours(a.overtimeMinutes)],
              ] as [string, string | number][]).map(([label, value]) => (
                <React.Fragment key={label}><dt className="text-slate-500">{label}</dt><dd className={`text-right tabular-nums ${label === 'No attendance' && a.missingDays ? 'font-semibold text-red-700' : 'text-slate-800 dark:text-slate-200'}`}>{value}</dd></React.Fragment>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">“Unpaid days” are counted the policy’s way: with a working-day or fixed divisor, only unpaid working days count. Overtime recorded by attendance isn’t paid until overtime rules are worked out.</p>
            {pay.segments.map((s, i) => (
              <details key={i} className="mt-3 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">Values used{pay.segments.length > 1 ? ` (${day(s.from)} – ${day(s.to)})` : ''}</summary>
                <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono">
                  {Object.entries(s.variables).map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="text-right">{v}</dd></React.Fragment>)}
                </dl>
              </details>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
};
