import React, { useEffect, useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { payrollOverviewApi, type PayrollOverview } from '../api/payroll-setup.api';
import { EmployeeTable, monthName, thisMonth, type Filter } from './payroll/PayrollOverviewTab';
import { EmployeePayDialog } from './payroll/PayrollRunTab';
import { cardClass, day, errorText, money } from './payroll/payroll-format';

/**
 * Payslips: what each employee was paid in a finalized month, line by line.
 * Only finalized payroll issues payslips; a month still in progress says so.
 */
export const PayslipsView: React.FC = () => {
  const { can } = useAuth();
  const id = useId();
  const [month, setMonth] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [overview, setOverview] = useState<PayrollOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('FINALIZED');
  const [open, setOpen] = useState<string | null>(null);
  const valid = /^\d{4}-\d{2}$/.test(month);

  useEffect(() => {
    if (!valid || !can('payroll.view')) return;
    setOverview(null);
    setError(null);
    payrollOverviewApi.get(month).then(setOverview).catch((e) => setError(errorText(e)));
  }, [month, valid, can]);

  if (!can('payroll.view')) {
    return <p className={`${cardClass} p-6 text-sm text-slate-600`}>You don’t have access to payslips. Ask an administrator for the “View payroll” permission.</p>;
  }
  const finalized = overview?.run?.status === 'FINALIZED';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Payslips</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
            {!overview ? ' '
              : finalized ? `${overview.summary?.employees ?? 0} payslips issued for ${monthName(month)}${overview.run?.finalizedAt ? ` on ${day(overview.run.finalizedAt.slice(0, 10))}` : ''} · ${money(overview.summary?.net ?? '0')} net pay.`
              : overview.run ? `${monthName(month)} payroll isn’t finalized yet, so no payslips are issued.`
              : `No payroll for ${monthName(month)} yet.`}
          </p>
        </div>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor={`${id}-month`} className="sr-only">Month</label>
          <input id={`${id}-month`} type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-[#2B293E] dark:bg-[#181724] dark:text-slate-100" />
        </div>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Payslips could not be loaded: {error}</p>}
      {valid && overview && (
        <EmployeeTable month={month} filter={filter} onFilter={setFilter} hasRun={!!overview.run}
          refreshKey={overview.run?.status} onOpen={overview.run && can('salary.view') ? setOpen : undefined} />
      )}
      {open && overview?.run && <EmployeePayDialog runId={overview.run.id} employeeId={open} onClose={() => setOpen(null)} />}
    </div>
  );
};
