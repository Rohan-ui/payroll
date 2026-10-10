import React, { useEffect, useId, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Check, HandCoins, Landmark, Minus, Search, Users, Wallet } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { payrollOverviewApi, type OverviewEmployee, type OverviewEmployeePage, type PayrollOverview, type RunStatus } from '../../api/payroll-setup.api';
import { cardClass, day, errorText, money } from './payroll-format';

type Filter = 'ALL' | 'READY' | 'EXCEPTION' | 'FINALIZED';
export type PayrollDestination = 'run' | 'preview' | 'inputs' | 'setup';

const PAGE_SIZE = 20;
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthName = (month: string, style: 'long' | 'short' = 'long') => {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: style, ...(style === 'long' ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
};
const STEPS: { label: string; reached: (s: RunStatus | null) => boolean }[] = [
  { label: 'Calculated', reached: (s) => !!s && s !== 'DRAFT' },
  { label: 'Approved', reached: (s) => s === 'APPROVED' || s === 'FINALIZED' },
  { label: 'Finalized', reached: (s) => s === 'FINALIZED' },
];
const EMPLOYEE_STATUS: Record<OverviewEmployee['status'], { label: string; variant: 'success' | 'info' | 'danger' | 'neutral' }> = {
  READY: { label: 'Calculated', variant: 'info' },
  APPROVED: { label: 'Approved', variant: 'info' },
  FINALIZED: { label: 'Payslip issued', variant: 'success' },
  EXCEPTION: { label: 'Needs attention', variant: 'danger' },
};

/**
 * The payroll overview: the month's payroll at a glance, its run's progress,
 * the year's cost and each employee's pay. Every figure comes from a
 * calculated or finalized payroll run; nothing is shown as paid unless a
 * payment has been recorded.
 */
export const PayrollOverviewTab: React.FC<{ onNavigate: (to: PayrollDestination) => void }> = ({ onNavigate }) => {
  const id = useId();
  const [month, setMonth] = useState(thisMonth());
  const [overview, setOverview] = useState<PayrollOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const valid = /^\d{4}-\d{2}$/.test(month);

  const load = () => {
    if (!valid) return;
    setError(null);
    setOverview(null);
    payrollOverviewApi.get(month).then(setOverview).catch((e) => setError(errorText(e)));
  };
  useEffect(load, [month]);

  const s = overview?.summary;
  const status = overview?.run?.status ?? null;
  const sentence = !overview ? null
    : !s ? `${monthName(month)} payroll hasn’t been calculated yet.`
    : `${s.employees} employee${s.employees === 1 ? '' : 's'} in ${monthName(month)} payroll, costing ${money(s.totalCost)} in total${status === 'FINALIZED' ? '. Payslips are issued.' : s.exceptions ? `. ${s.exceptions} need${s.exceptions === 1 ? 's' : ''} attention before approval.` : '. Ready for approval.'}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Payroll</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">{sentence ?? ' '}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-month`} className="sr-only">Payroll month</label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input id={`${id}-month`} type="month" value={month} onChange={(e) => { setMonth(e.target.value); setFilter('ALL'); }}
              className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-[#2B293E] dark:bg-[#181724] dark:text-slate-100" />
          </div>
          <Button onClick={() => onNavigate('run')}>Open payroll run<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>The payroll overview could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}

      {overview && overview.readiness.withoutSalary > 0 && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {overview.readiness.withoutSalary} of {overview.readiness.activeEmployees} active employees have no salary for {monthName(month)} and won’t be paid.</span>
          <button type="button" onClick={() => onNavigate('setup')} className="font-semibold underline">Set up salaries</button>
        </div>
      )}

      <section aria-label="This month in figures" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Wallet} label="Payroll cost" value={s?.totalCost} change={overview?.changes?.totalCost} hint="Earnings plus employer contributions" loading={!overview && !error} />
        <Kpi icon={Landmark} label="Deductions" value={s?.deductions} change={overview?.changes?.deductions} hint="Taken from pay" loading={!overview && !error} />
        <Kpi icon={HandCoins} label="Employer contributions" value={s?.employerContributions} change={overview?.changes?.employerContributions} hint="Paid on top of salaries" loading={!overview && !error} />
        <Kpi icon={Users} label="Employees in payroll" count={s?.employees} change={overview?.changes?.employees} hint={s ? `${s.ready} ready${s.exceptions ? ` · ${s.exceptions} need attention` : ''}` : undefined} loading={!overview && !error} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <RunCard overview={overview} month={month} onNavigate={onNavigate} onShowExceptions={() => setFilter('EXCEPTION')} />
        <TrendCard overview={overview} month={month} onSelect={setMonth} />
      </div>

      {valid && <EmployeeTable month={month} filter={filter} onFilter={setFilter} hasRun={!!overview?.run} />}
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ElementType; label: string; value?: string; count?: number; change?: string | null; hint?: string; loading: boolean }> = ({ icon: Icon, label, value, count, change, hint, loading }) => {
  const shown = value !== undefined ? money(value) : count !== undefined ? String(count) : null;
  const n = change === null || change === undefined ? null : Number(change);
  const Trend = n === null ? null : n > 0 ? ArrowUpRight : n < 0 ? ArrowDownRight : Minus;
  return (
    <div className={`${cardClass} p-4`}>
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        {label}
      </p>
      {loading ? (
        <div className="mt-3 h-8 w-32 animate-pulse rounded bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-hidden="true" />
      ) : (
        <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">{shown ?? '—'}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {Trend && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold tabular-nums text-slate-700 dark:bg-white/10 dark:text-slate-200">
            <Trend className="h-3.5 w-3.5" aria-hidden="true" />{n !== null && n > 0 ? '+' : ''}{change}%
            <span className="sr-only"> compared with last month</span>
          </span>
        )}
        <span className="text-slate-500">{Trend ? 'vs last month' : shown ? hint : 'Not calculated yet'}</span>
      </div>
      {Trend && hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
};

const RunCard: React.FC<{ overview: PayrollOverview | null; month: string; onNavigate: (to: PayrollDestination) => void; onShowExceptions: () => void }> = ({ overview, month, onNavigate, onShowExceptions }) => {
  const s = overview?.summary;
  const status = overview?.run?.status ?? null;
  const action = !overview?.run || status === 'DRAFT' ? { label: `Calculate ${monthName(month, 'short')} payroll`, to: 'run' as const }
    : s?.exceptions ? { label: `Resolve ${s.exceptions} exception${s.exceptions === 1 ? '' : 's'}`, to: 'preview' as const }
    : status === 'FINALIZED' ? { label: 'Payroll run and payslips', to: 'run' as const }
    : status === 'APPROVED' ? { label: 'Finalize payroll', to: 'run' as const }
    : { label: 'Review and approve', to: 'run' as const };
  // Shares of the month's cost, for display only.
  const parts = s ? [
    { label: 'Net pay', value: s.net, colour: 'bg-teal-500' },
    { label: 'Deductions', value: s.deductions, colour: 'bg-amber-400' },
    { label: 'Employer contributions', value: s.employerContributions, colour: 'bg-sky-400' },
  ] : [];
  const whole = parts.reduce((t, p) => t + Number(p.value), 0);

  return (
    <section className={`${cardClass} flex flex-col p-4 lg:col-span-2`} aria-labelledby="payrun-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="payrun-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">{monthName(month)} pay run</h2>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
            {overview?.period?.paymentDate ? `Pay on ${day(overview.period.paymentDate)}` : overview?.period ? 'Payment date not set' : 'Not started'}
          </p>
        </div>
        {overview?.run && <Badge size="sm" variant={status === 'FINALIZED' ? 'success' : s?.exceptions ? 'danger' : 'info'}>{status === 'FINALIZED' ? 'Finalized' : s?.exceptions ? 'Needs attention' : status === 'APPROVED' ? 'Approved' : 'Calculated'}</Badge>}
      </div>

      <ol className="mt-4 flex items-center gap-1" aria-label="Pay run progress">
        {STEPS.map((step, i) => {
          const done = step.reached(status);
          return (
            <li key={step.label} className="flex flex-1 items-center gap-1">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? 'bg-teal-600 text-white' : 'border border-slate-300 text-slate-500 dark:border-slate-600'}`}>
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span className={`text-xs ${done ? 'font-semibold text-slate-800 dark:text-slate-200' : 'text-slate-500'}`}>{step.label}<span className="sr-only">{done ? ' (done)' : ' (to do)'}</span></span>
              {i < STEPS.length - 1 && <span className={`mx-1 h-px flex-1 ${done ? 'bg-teal-500' : 'bg-slate-200 dark:bg-slate-700'}`} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {s ? (
        <>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Employees included</dt><dd className="font-semibold tabular-nums">{s.employees}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Ready to pay</dt><dd className="font-semibold tabular-nums">{s.ready}</dd></div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Need attention</dt>
              <dd>{s.exceptions ? <button type="button" onClick={onShowExceptions} className="font-semibold tabular-nums text-red-700 underline">{s.exceptions}</button> : <span className="font-semibold tabular-nums">0</span>}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-[#2B293E]"><dt className="text-slate-500">Net pay</dt><dd className="font-bold tabular-nums">{money(s.net)}</dd></div>
          </dl>
          {whole > 0 && (
            <div className="mt-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" aria-hidden="true">
                {parts.map((p) => <div key={p.label} className={p.colour} style={{ width: `${(Number(p.value) / whole) * 100}%` }} />)}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                {parts.map((p) => <li key={p.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${p.colour}`} aria-hidden="true" />{p.label} {money(p.value)}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{overview ? 'Calculate the month to see who is included and what it costs. Each employee’s pay is worked out from their salary, policy and attendance.' : ' '}</p>
      )}

      <div className="mt-auto pt-4">
        <Button variant={status === 'FINALIZED' ? 'outline' : 'primary'} className="w-full" disabled={!overview} onClick={() => onNavigate(action.to)}>
          {action.label}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
};

const TrendCard: React.FC<{ overview: PayrollOverview | null; month: string; onSelect: (month: string) => void }> = ({ overview, month, onSelect }) => {
  // Chart heights only; amounts stay exact strings everywhere else.
  const points = (overview?.trend ?? []).map((t) => ({ ...t, label: monthName(t.month, 'short'), height: t.totalCost === null ? 0 : Number(t.totalCost) }));
  const months = points.filter((p) => p.totalCost !== null).length;
  return (
    <section className={`${cardClass} p-4 lg:col-span-3`} aria-labelledby="trend-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="trend-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payroll cost, last 12 months</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{overview ? (months ? `${months} month${months === 1 ? '' : 's'} with payroll. Choose a bar to open that month.` : 'No calculated payroll in the last 12 months yet.') : ' '}</p>
        </div>
      </div>
      <div className="mt-2 h-56">
        {!overview ? <div className="h-full animate-pulse rounded-lg bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-hidden="true" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 24, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-[#2B293E] dark:bg-[#1E1D2D]">
                    <p className="font-semibold">{monthName(p.month)}</p>
                    <p className="tabular-nums">{p.totalCost === null ? 'Not calculated' : money(p.totalCost)}</p>
                    {p.status && <p className="text-slate-500">{p.status === 'FINALIZED' ? 'Finalized' : 'Not finalized yet'}</p>}
                  </div>
                );
              }} />
              <Bar dataKey="height" radius={[6, 6, 0, 0]} minPointSize={3} cursor="pointer" isAnimationActive={false}
                onClick={(entry: { payload?: { month: string } }) => entry.payload && onSelect(entry.payload.month)}
                label={(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
                  const point = points[props.index ?? -1];
                  if (!point || point.month !== month || point.totalCost === null) return <g />;
                  return <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 8} textAnchor="middle" className="fill-teal-700 text-[11px] font-bold">{money(point.totalCost)}</text>;
                }}>
                {points.map((p) => <Cell key={p.month} fill={p.month === month ? '#0d9488' : p.totalCost === null ? '#e2e8f0' : '#99d5cf'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {overview && (
        <ul className="sr-only">
          {points.map((p) => <li key={p.month}>{monthName(p.month)}: {p.totalCost === null ? 'not calculated' : money(p.totalCost)}</li>)}
        </ul>
      )}
    </section>
  );
};

const EmployeeTable: React.FC<{ month: string; filter: Filter; onFilter: (f: Filter) => void; hasRun: boolean }> = ({ month, filter, onFilter, hasRun }) => {
  const id = useId();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OverviewEmployeePage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setQuery(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => setPage(1), [month, filter, query]);
  useEffect(() => {
    let current = true;
    setError(null);
    payrollOverviewApi.employees({ month, status: filter, search: query, page, limit: PAGE_SIZE })
      .then((d) => { if (current) setData(d); })
      .catch((e) => { if (current) setError(errorText(e)); });
    return () => { current = false; };
  }, [month, filter, query, page, hasRun]);

  const tabs: { id: Filter; label: string; count?: number }[] = [
    { id: 'ALL', label: 'All', count: data?.counts.all },
    { id: 'READY', label: 'Calculated', count: data?.counts.ready },
    { id: 'EXCEPTION', label: 'Need attention', count: data?.counts.exceptions },
    { id: 'FINALIZED', label: 'Payslip issued', count: data?.counts.finalized },
  ];
  const from = data && data.total ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;

  return (
    <section className={cardClass} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <h2 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Employee pay · {monthName(month)}</h2>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor={`${id}-search`} className="sr-only">Search employees</label>
          <input id={`${id}-search`} type="search" placeholder="Search name or code" value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-[#2B293E] dark:bg-[#1E1D2D]" />
        </div>
      </div>
      <div role="tablist" aria-label="Filter employees" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2 dark:border-[#2B293E]">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={filter === t.id} onClick={() => onFilter(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${filter === t.id ? 'border-teal-600 text-teal-800 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
            {t.count !== undefined && <span className={`rounded-full px-1.5 tabular-nums ${filter === t.id ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{t.count}</span>}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Employees could not be loaded: {error}</p>}
      {!data && !error ? (
        <div className="h-40 animate-pulse bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading employees</span></div>
      ) : data && data.items.length === 0 ? (
        <div className="p-10 text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{!hasRun ? `No payroll calculated for ${monthName(month)}` : query ? 'No one matches that search' : 'No one here'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{!hasRun ? 'Once the month is calculated, every employee in it appears here with their pay.' : 'Try another filter or search.'}</p>
        </div>
      ) : data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">Employee</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">Department</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Gross pay</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Deductions</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Net pay</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {data.items.map((e) => (
                  <tr key={e.employeeId} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{e.name}</p>
                          <p className="truncate text-xs text-slate-500">{e.designation ?? e.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{e.department ? <span className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:border-[#2B293E] dark:text-slate-300">{e.department}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(e.gross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{Number(e.deductions) > 0 ? `−${money(e.deductions)}` : money(e.deductions)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(e.net)}</td>
                    <td className="px-4 py-3">
                      <Badge size="sm" variant={EMPLOYEE_STATUS[e.status].variant}>{EMPLOYEE_STATUS[e.status].label}</Badge>
                      {e.problem && <p className="mt-1 max-w-[260px] text-xs text-red-700" title={e.problem}>{e.problem}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {e.payment
                        ? <span className="font-medium text-slate-800 dark:text-slate-200">{e.payment.status === 'PAID' ? 'Paid' : e.payment.status.toLowerCase()}{e.payment.date ? ` · ${day(e.payment.date)}` : ''}</span>
                        : <span className="text-slate-500">{e.paymentDate ? `Due ${day(e.paymentDate)}` : 'Not recorded'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 dark:border-[#2B293E] dark:text-slate-400">
            <span aria-live="polite">{from}–{to} of {data.total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={to >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
