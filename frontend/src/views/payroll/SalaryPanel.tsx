import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  employeeSalaryApi, policiesApi, structuresApi,
  type EmployeeSalary, type PayBasis, type PaymentMethod, type PolicySummary, type RevisionInput, type SalaryRevision, type StructureDetail, type StructureSummary,
} from '../../api/payroll-setup.api';
import { CATEGORY, PAY_BASIS, PAYMENT_METHOD, day, errorText, fieldClass, hintClass, labelClass, money, nextMonthIso } from './payroll-format';

const amountText = (r: SalaryRevision) =>
  r.payBasis === 'MONTHLY' ? `${money(r.monthlySalary, r.currencyCode)} a month` : `${money(r.baseRate, r.currencyCode)} ${r.payBasis === 'DAILY' ? 'a day' : 'an hour'}`;

/** An employee's salary: what applies now, how it is worked out, its history, and revising it. */
export const SalaryPanel: React.FC<{ employeeId: string }> = ({ employeeId }) => {
  const { can } = useAuth();
  const allowed = can('salary.view');
  const [salary, setSalary] = useState<EmployeeSalary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [cancelling, setCancelling] = useState<SalaryRevision | null>(null);

  const load = useCallback(() => {
    setError(null);
    employeeSalaryApi.get(employeeId).then(setSalary).catch((e) => setError(errorText(e)));
  }, [employeeId]);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (!allowed) return null;
  if (error) {
    return (
      <Card>
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-red-800">
          <span>The salary could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      </Card>
    );
  }
  if (!salary) return <Card><div className="h-32 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading salary</span></div></Card>;

  const shown = salary.history.find((h) => h.id === (salary.currentId ?? salary.upcomingId));
  const latestActive = salary.history.find((h) => h.status === 'ACTIVE');
  const estimate = salary.estimate;

  return (
    <>
      <Card>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Salary</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {shown ? (shown.id === salary.currentId ? `Since ${day(shown.effectiveFrom)}` : `Starts ${day(shown.effectiveFrom)}`) : 'Not set'}
            </p>
          </div>
          {can('salary.assign') && <Button size="sm" variant="secondary" onClick={() => setRevising(true)}>{salary.history.some((h) => h.status === 'ACTIVE') ? 'Revise salary' : 'Set salary'}</Button>}
        </div>

        {!shown ? (
          <p className="text-sm text-slate-500">No salary is set, so this employee can’t be included in payroll. {can('salary.assign') ? 'Set one from a published salary structure.' : 'Ask someone who can assign salaries to set one.'}</p>
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-slate-500">Structure</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{shown.structure.name}</dd></div>
              <div><dt className="text-slate-500">{PAY_BASIS[shown.payBasis]}</dt><dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{amountText(shown)}</dd></div>
              {shown.annualCtc && <div><dt className="text-slate-500">Annual CTC</dt><dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{money(shown.annualCtc, shown.currencyCode)}</dd></div>}
              <div><dt className="text-slate-500">Paid by</dt><dd className="text-slate-800 dark:text-slate-200">{PAYMENT_METHOD[shown.paymentMethod]}</dd></div>
              <div className="col-span-2">
                <dt className="text-slate-500">Payroll policy</dt>
                <dd className="text-slate-800 dark:text-slate-200">
                  {salary.policy?.policy ? <>{salary.policy.policy.policyName} <span className="text-slate-500">· {salary.policy.reason}</span></> : <span className="text-amber-700">{salary.policy?.problem ?? 'None applies'}</span>}
                </dd>
              </div>
              <div className="col-span-2"><dt className="text-slate-500">Overtime</dt><dd className="text-slate-800 dark:text-slate-200">{shown.isOvertimeEligible ? 'Eligible, under the policy’s rules' : 'Not eligible'}</dd></div>
            </dl>

            {estimate && (
              <div className="border-t border-slate-200 pt-3 dark:border-[#2B293E]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Full month estimate</p>
                <p className="mb-2 text-[11px] text-slate-500">A full month with no unpaid days. Overtime, penalties and other attendance-based amounts are worked out when payroll runs.</p>
                {estimate.problems.length > 0 && (
                  <ul className="mb-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    {estimate.problems.map((p, i) => <li key={i}>{p.message}</li>)}
                  </ul>
                )}
                <ul className="space-y-1">
                  {estimate.lines.map((l) => (
                    <li key={l.code} className="text-xs">
                      <details>
                        <summary className="flex cursor-pointer justify-between gap-2 py-0.5">
                          <span className="text-slate-700 dark:text-slate-300">{l.name} <span className="text-[10px] text-slate-400">{CATEGORY[l.category].label}</span></span>
                          <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">{money(l.amount, shown.currencyCode)}</span>
                        </summary>
                        <ul className="pb-1 pl-3 text-[11px] text-slate-500">{l.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </details>
                    </li>
                  ))}
                </ul>
                {estimate.totals && (
                  <dl className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-xs dark:border-[#2B293E]">
                    <div className="flex justify-between"><dt>Gross</dt><dd className="tabular-nums">{money(estimate.totals.gross, shown.currencyCode)}</dd></div>
                    <div className="flex justify-between"><dt>Deductions</dt><dd className="tabular-nums">{money(estimate.totals.deductions, shown.currencyCode)}</dd></div>
                    <div className="flex justify-between font-bold"><dt>Net pay</dt><dd className="tabular-nums">{money(estimate.totals.net, shown.currencyCode)}</dd></div>
                    <div className="flex justify-between text-slate-500"><dt>Employer contributions</dt><dd className="tabular-nums">{money(estimate.totals.employerContributions, shown.currencyCode)}</dd></div>
                  </dl>
                )}
              </div>
            )}
          </div>
        )}

        {salary.history.length > 0 && (
          <details className="mt-3 border-t border-slate-200 pt-3 dark:border-[#2B293E]">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">Salary history ({salary.history.length})</summary>
            <ol className="mt-2 space-y-2">
              {salary.history.map((h) => (
                <li key={h.id} className={`rounded-lg border border-slate-200 p-2 text-xs dark:border-[#2B293E] ${h.status === 'CANCELLED' ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{day(h.effectiveFrom)} – {h.status === 'CANCELLED' ? '' : h.effectiveTo ? day(h.effectiveTo) : 'now'}</span>
                    {h.status === 'CANCELLED' ? <Badge size="sm" variant="neutral">Cancelled</Badge> : h.id === salary.currentId ? <Badge size="sm" variant="success">Current</Badge> : h.id === salary.upcomingId ? <Badge size="sm" variant="info">Upcoming</Badge> : null}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{h.structure.name} · {amountText(h)}</p>
                  {h.changeReason && <p className="text-slate-500">{h.changeReason}{h.createdBy ? ` · ${h.createdBy}` : ''}</p>}
                  {h.status === 'CANCELLED' && <p className="text-slate-500">Cancelled{h.cancelledBy ? ` by ${h.cancelledBy}` : ''}: {h.cancellationReason}</p>}
                  {can('salary.assign') && h.id === latestActive?.id && (
                    <button type="button" onClick={() => setCancelling(h)} className="mt-1 text-xs font-semibold text-red-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">Cancel this revision</button>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
        {salary.arrears.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-[#2B293E]">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Arrears</p>
            <ul className="mt-1 space-y-1 text-xs">
              {salary.arrears.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400">{a.period.start.slice(0, 7)}: {money(a.revised)} on the new salary − {money(a.paid)} paid</span>
                  <span className="tabular-nums font-medium">{money(a.amount)} <Badge size="sm" variant={a.status === 'INCLUDED' ? 'success' : a.status === 'PENDING' ? 'warning' : 'neutral'}>{a.status === 'INCLUDED' ? 'Paid' : a.status === 'PENDING' ? 'Paid with next payroll' : 'Cancelled'}</Badge></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      {revising && <RevisionDialog salary={salary} base={shown ?? null} onClose={() => setRevising(false)} onSaved={(next) => { setSalary(next); setRevising(false); }} />}
      {cancelling && <CancelDialog revision={cancelling} onClose={() => setCancelling(null)} onCancelled={(next) => { setSalary(next); setCancelling(null); }} />}
    </>
  );
};

const CancelDialog: React.FC<{ revision: SalaryRevision; onClose: () => void; onCancelled: (salary: EmployeeSalary) => void }> = ({ revision, onClose, onCancelled }) => {
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCancelled(await employeeSalaryApi.cancel(revision.id, reason.trim()));
      toast.success('Salary revision cancelled');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Cancel the salary from ${day(revision.effectiveFrom)}?`} onClose={onClose} footer={(
      <>
        <Button variant="outline" type="button" onClick={onClose}>Keep it</Button>
        <Button variant="danger" type="submit" form={id} loading={busy} disabled={busy || reason.trim().length < 3}>Cancel revision</Button>
      </>
    )}>
      <form id={id} onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">The salary before it applies again from {day(revision.effectiveFrom)}. This is only possible while no payroll has used this salary; it stays in the history as cancelled.</p>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>Why</label>
          <input id={`${id}-reason`} className={fieldClass} value={reason} required minLength={3} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Dialog>
  );
};

const RevisionDialog: React.FC<{ salary: EmployeeSalary; base: SalaryRevision | null; onClose: () => void; onSaved: (salary: EmployeeSalary) => void }> = ({ salary, base, onClose, onSaved }) => {
  const id = useId();
  const [structures, setStructures] = useState<StructureSummary[] | null>(null);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [structure, setStructure] = useState<StructureDetail | null>(null);
  const [form, setForm] = useState({
    salaryStructureId: base?.structure.id ?? '',
    effectiveFrom: nextMonthIso(),
    payBasis: (base?.payBasis ?? 'MONTHLY') as PayBasis,
    monthlySalary: base?.monthlySalary ?? '',
    annualCtc: base?.annualCtc ?? '',
    baseRate: base?.baseRate ?? '',
    currencyCode: base?.currencyCode ?? 'INR',
    payrollPolicyId: base?.policy?.id ?? '',
    isOvertimeEligible: base?.isOvertimeEligible ?? false,
    paymentMethod: (base?.paymentMethod ?? 'BANK_TRANSFER') as PaymentMethod,
    changeReason: '',
    arrearsFrom: '',
  });
  // A finalized month can't take a new salary; the day after the lock is the earliest start, with arrears for before.
  const firstOpenDay = salary.lockedThrough ? new Date(new Date(`${salary.lockedThrough}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10) : null;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((base?.componentValues ?? []).map((v) => [v.salaryComponentId, v.amount ?? v.percentage ?? ''])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    Promise.all([structuresApi.list(), policiesApi.list()])
      .then(([s, p]) => { setStructures(s); setPolicies(p); })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (!form.salaryStructureId) { setStructure(null); return; }
    structuresApi.get(form.salaryStructureId).then(setStructure).catch((e) => setError(errorText(e)));
  }, [form.salaryStructureId]);

  // The structure version in force on the chosen date decides which values the employee needs.
  const version = useMemo(() => structure?.versions.find((v) => v.status === 'PUBLISHED' && v.effectiveFrom <= form.effectiveFrom && (!v.effectiveTo || v.effectiveTo >= form.effectiveFrom)) ?? null, [structure, form.effectiveFrom]);
  const valueLines = version?.lines.filter((l) => l.component.calculationType === 'FIXED' || l.component.calculationType === 'PERCENTAGE') ?? [];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input: RevisionInput = {
      salaryStructureId: form.salaryStructureId,
      effectiveFrom: form.effectiveFrom,
      payBasis: form.payBasis,
      monthlySalary: form.payBasis === 'MONTHLY' ? form.monthlySalary.trim() || null : null,
      annualCtc: form.annualCtc.trim() || null,
      baseRate: form.payBasis !== 'MONTHLY' ? form.baseRate.trim() || null : null,
      currencyCode: form.currencyCode.trim().toUpperCase(),
      payrollPolicyId: form.payrollPolicyId || null,
      isOvertimeEligible: form.isOvertimeEligible,
      paymentMethod: form.paymentMethod,
      changeReason: form.changeReason.trim(),
      arrearsFrom: form.arrearsFrom || null,
      componentValues: valueLines
        .filter((l) => values[l.salaryComponentId]?.trim())
        .map((l) => ({
          salaryComponentId: l.salaryComponentId,
          amount: l.component.calculationType === 'FIXED' ? values[l.salaryComponentId].trim() : null,
          percentage: l.component.calculationType === 'PERCENTAGE' ? values[l.salaryComponentId].trim() : null,
        })),
    };
    try {
      onSaved(await employeeSalaryApi.revise(salary.employee.id, input));
      toast.success(`Salary from ${day(form.effectiveFrom)} recorded`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const publishedStructures = (structures ?? []).filter((s) => s.currentVersion || s.upcomingVersion);

  return (
    <Dialog title={base ? `Revise ${salary.employee.name}’s salary` : `Set ${salary.employee.name}’s salary`} size="lg" onClose={onClose} footer={(
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={id} loading={busy} disabled={busy || !version}>Record salary from {day(form.effectiveFrom)}</Button>
      </>
    )}>
      <form id={id} onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A salary is never edited. This records a new salary from the date you choose; {base ? `the current one ends the day before.` : 'it applies from then on.'}
          {salary.lockedThrough ? ` Payroll for this employee is finalized up to ${day(salary.lockedThrough)}, so the date must be after that.` : ''}
        </p>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-from`} className={labelClass}>Takes effect from</label>
            <input id={`${id}-from`} type="date" className={fieldClass} value={form.effectiveFrom} required onChange={(e) => set('effectiveFrom', e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-structure`} className={labelClass}>Salary structure</label>
            <select id={`${id}-structure`} className={fieldClass} value={form.salaryStructureId} required onChange={(e) => set('salaryStructureId', e.target.value)}>
              <option value="">{structures === null ? 'Loading…' : publishedStructures.length ? 'Choose…' : 'No published structures yet'}</option>
              {publishedStructures.map((s) => <option key={s.id} value={s.id}>{s.structureName} ({s.structureCode})</option>)}
            </select>
            {structure && !version && <p className="mt-1 text-xs text-red-700">This structure has no published version in force on {day(form.effectiveFrom)}.</p>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-basis`} className={labelClass}>Paid</label>
            <select id={`${id}-basis`} className={fieldClass} value={form.payBasis} onChange={(e) => set('payBasis', e.target.value as PayBasis)}>
              {Object.entries(PAY_BASIS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {form.payBasis === 'MONTHLY' ? (
            <div>
              <label htmlFor={`${id}-monthly`} className={labelClass}>Monthly salary</label>
              <input id={`${id}-monthly`} inputMode="decimal" className={fieldClass} value={form.monthlySalary} required onChange={(e) => set('monthlySalary', e.target.value)} />
            </div>
          ) : (
            <div>
              <label htmlFor={`${id}-rate`} className={labelClass}>{form.payBasis === 'DAILY' ? 'Daily rate' : 'Hourly rate'}</label>
              <input id={`${id}-rate`} inputMode="decimal" className={fieldClass} value={form.baseRate} required onChange={(e) => set('baseRate', e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor={`${id}-ctc`} className={labelClass}>Annual CTC <span className="font-normal text-slate-400">(optional)</span></label>
            <input id={`${id}-ctc`} inputMode="decimal" className={fieldClass} value={form.annualCtc} onChange={(e) => set('annualCtc', e.target.value)} />
          </div>
        </div>
        {valueLines.length > 0 && (
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
            <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">This employee’s amounts</legend>
            <p className="text-xs text-slate-500">Leave empty to use the structure’s default. A component without a default needs a value.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {valueLines.map((l) => {
                const isFixed = l.component.calculationType === 'FIXED';
                const fallback = isFixed ? l.defaultAmount : l.defaultPercentage;
                const field = `${id}-${l.salaryComponentId}`;
                return (
                  <div key={l.salaryComponentId}>
                    <label htmlFor={field} className={labelClass}>{l.component.componentName} ({isFixed ? 'monthly amount' : `% of ${l.percentageBase}`})</label>
                    <input id={field} inputMode="decimal" className={fieldClass} value={values[l.salaryComponentId] ?? ''} required={!fallback}
                      onChange={(e) => setValues((v) => ({ ...v, [l.salaryComponentId]: e.target.value }))} aria-describedby={`${field}-hint`} />
                    <p id={`${field}-hint`} className={hintClass}>{fallback ? `Structure default: ${isFixed ? money(fallback) : `${fallback}%`}` : 'Required: the structure has no default.'}</p>
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-policy`} className={labelClass}>Payroll policy</label>
            <select id={`${id}-policy`} className={fieldClass} value={form.payrollPolicyId} onChange={(e) => set('payrollPolicyId', e.target.value)}>
              <option value="">The policy that covers this employee</option>
              {policies.filter((p) => p.status === 'ACTIVE').map((p) => <option key={p.id} value={p.id}>{p.policyName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-method`} className={labelClass}>Paid by</label>
            <select id={`${id}-method`} className={fieldClass} value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-currency`} className={labelClass}>Currency</label>
            <input id={`${id}-currency`} className={`${fieldClass} uppercase`} value={form.currencyCode} required maxLength={3} onChange={(e) => set('currencyCode', e.target.value)} />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={form.isOvertimeEligible} onChange={(e) => set('isOvertimeEligible', e.target.checked)} className="mt-0.5 rounded border-slate-300" />
          <span>Eligible for overtime<span className="block text-xs text-slate-500">Paid under the payroll policy’s overtime rules.</span></span>
        </label>
        {salary.lockedThrough && (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
            <label htmlFor={`${id}-arrears`} className={labelClass}>Pay arrears from <span className="font-normal text-slate-400">(optional)</span></label>
            <input id={`${id}-arrears`} type="date" className={fieldClass} max={salary.lockedThrough} value={form.arrearsFrom}
              onChange={(e) => setForm((f) => ({ ...f, arrearsFrom: e.target.value, effectiveFrom: e.target.value && firstOpenDay && f.effectiveFrom < firstOpenDay ? firstOpenDay : f.effectiveFrom }))} aria-describedby={`${id}-arrears-hint`} />
            <p id={`${id}-arrears-hint`} className={hintClass}>
              For a raise that should have started on or before {day(salary.lockedThrough)}, when payroll was finalized. Those months are worked out again on the new salary and the difference is paid with the next payroll; their payslips don’t change.
            </p>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>Reason for the change</label>
          <input id={`${id}-reason`} className={fieldClass} value={form.changeReason} required minLength={3} maxLength={500} onChange={(e) => set('changeReason', e.target.value)} aria-describedby={`${id}-reason-hint`} />
          <p id={`${id}-reason-hint`} className={hintClass}>For example “Annual increment 2026” or “Joining salary”. Kept in the salary history.</p>
        </div>
      </form>
    </Dialog>
  );
};
