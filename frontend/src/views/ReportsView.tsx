import React, { useEffect, useId, useState } from 'react';
import { CalendarCheck, CalendarDays, Download, DoorOpen, IndianRupee, Target, Users } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { downloadReport, reportsOverview, type ReportsOverview } from '../api/reports.api';
import { payrollApi, type BackendPayrollPeriod } from '../api/payroll.api';
import { saveFile } from '../utils/download';
import { toast } from '../lib/toast';
import { fieldClass, labelClass } from './payroll/payroll-format';

type Area = 'People' | 'Time and leave' | 'Payroll' | 'Sales';
type Input = 'none' | 'month' | 'range' | 'period';
interface Values { month: string; from: string; to: string; periodId: string }

interface Report {
  id: string;
  area: Area;
  title: string;
  /** What question the report answers. */
  summary: string;
  /** The spreadsheet's columns, so people know what they get before downloading. */
  includes: string[];
  icon: React.ElementType;
  /** All are needed; the server checks the same ones. */
  permissions: string[];
  input: Input;
  path: (v: Values) => string;
  fallbackName: string;
}

const REPORTS: Report[] = [
  {
    id: 'employees', area: 'People', title: 'Employee directory', icon: Users,
    summary: 'Everyone in the workspace with their current job, manager and status.',
    includes: ['Employee ID', 'Name', 'Work email and phone', 'Department', 'Designation', 'Reporting manager', 'Employment type', 'Joining date', 'Status', 'Work location'],
    permissions: ['people.export'], input: 'none', path: () => '/employees/export', fallbackName: 'employees.xlsx',
  },
  {
    id: 'exits', area: 'People', title: 'Exits', icon: DoorOpen,
    summary: 'Who left or is leaving, when, why, and whether they can be rehired.',
    includes: ['Employee ID', 'Name', 'Department', 'Designation', 'Exit type', 'Status', 'Notice given', 'Last working day', 'Main exit reason', 'Eligible for rehire', 'Exit interview date'],
    permissions: ['reports.view', 'offboarding.view'], input: 'range',
    path: (v) => `/reports/exits?from=${v.from}&to=${v.to}`, fallbackName: 'exits.xlsx',
  },
  {
    id: 'attendance', area: 'Time and leave', title: 'Monthly attendance', icon: CalendarCheck,
    summary: 'Each employee’s month at a glance: days present, absent and on leave, hours worked, lateness and overtime.',
    includes: ['Employee ID', 'Name', 'Department', 'Designation', 'Present', 'Half day', 'Absent', 'Paid leave', 'Unpaid leave', 'Holidays and weekends', 'Hours worked', 'Minutes late', 'Overtime hours'],
    permissions: ['reports.view', 'attendance.view'], input: 'month',
    path: (v) => `/reports/attendance?month=${v.month}`, fallbackName: 'attendance.xlsx',
  },
  {
    id: 'leave', area: 'Time and leave', title: 'Leave requests', icon: CalendarDays,
    summary: 'Every leave request that falls in the dates you choose, with its type, days and decision.',
    includes: ['Request number', 'Employee ID', 'Name', 'Department', 'Leave type', 'Paid or unpaid', 'From', 'To', 'Days', 'Status', 'Submitted', 'Decided'],
    permissions: ['reports.view', 'leave.view'], input: 'range',
    path: (v) => `/reports/leave?from=${v.from}&to=${v.to}`, fallbackName: 'leave.xlsx',
  },
  {
    id: 'payroll-register', area: 'Payroll', title: 'Payroll register', icon: IndianRupee,
    summary: 'What each employee was paid for a pay period, component by component, exactly as on their finalized payslips.',
    includes: ['Payslip number', 'Employee ID', 'Name', 'Department', 'Designation', 'One column per earning and deduction', 'Gross earnings', 'Total deductions', 'Net pay'],
    permissions: ['reports.view', 'payroll.view', 'salary.view'], input: 'period',
    path: (v) => `/reports/payroll-register?periodId=${v.periodId}`, fallbackName: 'payroll-register.xlsx',
  },
  {
    id: 'leads', area: 'Sales', title: 'CRM leads', icon: Target,
    summary: 'Every lead you can see, in the same layout the lead import uses, so it can be edited and imported back.',
    includes: ['Date created', 'Company', 'Contact name and designation', 'Email and phones', 'Industry', 'Website and LinkedIn', 'Address', 'Assigned to', 'Lead source', 'Budget', 'Internal notes'],
    permissions: ['leads.export'], input: 'none', path: () => '/crm/leads/export', fallbackName: 'leads.xlsx',
  },
];

const AREAS: Area[] = ['People', 'Time and leave', 'Payroll', 'Sales'];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Last month: the most recent complete one. */
function defaultValues(): Values {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    month: `${lastMonth.getFullYear()}-${pad(lastMonth.getMonth() + 1)}`,
    from: isoDate(lastMonth),
    to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    periodId: '',
  };
}

interface Tile { label: string; value: string; hint: string }

/** What each area's reports are for, in a sentence, shown above its figures. */
const AREA_INFO: Record<Area, { icon: React.ElementType; about: string }> = {
  People: { icon: Users, about: 'Who works here, who joined and who is leaving.' },
  'Time and leave': { icon: CalendarCheck, about: 'How the month’s attendance is going and who is away.' },
  Payroll: { icon: IndianRupee, about: 'What was paid in the latest payroll, from the issued payslips.' },
  Sales: { icon: Target, about: 'The sales pipeline you can see: open deals and this month’s wins.' },
};

const money = (v: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

/** The figures shown for an area, from the server's overview; nothing is shown for an area it left out. */
export function areaTiles(area: Area, o: ReportsOverview): Tile[] {
  switch (area) {
    case 'People': return [
      ...(o.people ? [
        { label: 'Active employees', value: String(o.people.active), hint: `${o.people.onNotice} on notice · ${o.people.inactive} no longer active` },
        { label: 'Joined this month', value: String(o.people.joinedThisMonth), hint: 'By joining date' },
      ] : []),
      ...(o.exits ? [
        { label: 'Exits in progress', value: String(o.exits.inProgress), hint: `${o.exits.leavingIn30Days} leaving in the next 30 days` },
        { label: 'Left this year', value: String(o.exits.completedThisYear), hint: 'Completed exits since 1 January' },
      ] : []),
    ];
    case 'Time and leave': return [
      ...(o.attendance ? [
        { label: 'Attendance rate', value: o.attendance.attendanceRate === null ? '—' : `${o.attendance.attendanceRate}%`, hint: o.attendance.attendanceRate === null ? `No attendance marked in ${monthName(o.attendance.month)} yet` : `Working days present in ${monthName(o.attendance.month)}, half days as half` },
        { label: 'Absent days', value: String(o.attendance.absentDays), hint: `${o.attendance.lateMarks} late arrivals · ${o.attendance.overtimeHours} h overtime this month` },
      ] : []),
      ...(o.leave ? [
        { label: 'Leave requests waiting', value: String(o.leave.pending), hint: 'Submitted and not yet decided' },
        { label: 'On leave today', value: String(o.leave.onLeaveToday), hint: `${o.leave.approvedDaysThisMonth} approved leave days starting this month` },
      ] : []),
    ];
    case 'Payroll': {
      if (!o.payroll) return [];
      const p = o.payroll.latestPeriod;
      if (!p) return [{ label: 'Latest payroll', value: '—', hint: 'No payslips issued yet. The register fills once a payroll is finalized.' }];
      return [
        { label: 'Latest payroll', value: p.code, hint: `${p.employees} payslip${p.employees === 1 ? '' : 's'} issued` },
        { label: 'Gross earnings', value: money(p.gross), hint: 'Before deductions' },
        { label: 'Deductions', value: money(p.deductions), hint: 'Statutory and other deductions' },
        { label: 'Net pay', value: money(p.net), hint: `${o.payroll.openPeriods} pay period${o.payroll.openPeriods === 1 ? '' : 's'} still open` },
      ];
    }
    case 'Sales': return o.sales ? [
      { label: 'Leads in sales pipelines', value: String(o.sales.leads), hint: 'Every lead you can see' },
      { label: 'Open deals', value: String(o.sales.openDeals), hint: 'Not yet won or lost' },
      { label: 'Open pipeline', value: money(o.sales.openValue), hint: 'Total budget of open deals' },
      { label: 'Won this month', value: money(o.sales.wonThisMonthValue), hint: `${o.sales.wonThisMonth} deal${o.sales.wonThisMonth === 1 ? '' : 's'} won` },
    ] : [];
    default: return [];
  }
}

/**
 * Reports, area by area: what each area's figures are now, then the reports
 * the member may run there. Each report says what it answers and which columns
 * it holds, asks only for the dates it needs, and downloads an Excel file
 * built on the server from the workspace's records.
 */
export const ReportsView: React.FC = () => {
  const { can } = useAuth();
  const available = REPORTS.filter((r) => r.permissions.every((p) => can(p)));
  const needsPeriods = available.some((r) => r.input === 'period');
  const [periods, setPeriods] = useState<BackendPayrollPeriod[] | null>(null);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [active, setActive] = useState<Area | 'All'>('All');

  useEffect(() => {
    if (!needsPeriods) return;
    payrollApi.listPeriods()
      .then((list) => setPeriods([...list].sort((a, b) => b.period_start.localeCompare(a.period_start))))
      .catch((e: Error) => setPeriodsError(e.message));
  }, [needsPeriods]);

  const loadOverview = () => {
    setOverviewError(null);
    reportsOverview().then(setOverview).catch((e: Error) => setOverviewError(e.message));
  };
  const canReport = can('reports.view');
  useEffect(() => { if (canReport) loadOverview(); }, [canReport]);

  const areas = AREAS.filter((area) => available.some((r) => r.area === area));
  const shown = active === 'All' ? areas : areas.filter((a) => a === active);

  return (
    <div data-dark-safe className="space-y-6">
      <PageHeader
        title="Reports"
        description="Where each part of the business stands today, and Excel exports of the records behind it. Every figure comes from your workspace’s data; every export is recorded in the audit log."
      />

      {available.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No reports available to you</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Reports need permission to see the area’s data. Ask an administrator for access.</p>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Report areas" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#2B293E]">
            {(['All', ...areas] as const).map((area) => (
              <button key={area} type="button" role="tab" aria-selected={active === area} onClick={() => setActive(area)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${active === area ? 'border-teal-500 text-teal-700 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                {area === 'All' ? 'All areas' : area}
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500 dark:bg-white/10 dark:text-slate-400">
                  {area === 'All' ? available.length : available.filter((r) => r.area === area).length}
                </span>
              </button>
            ))}
          </div>

          {overviewError && (
            <p role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <span>Today’s figures could not be loaded: {overviewError}. The exports below still work.</span>
              <button type="button" onClick={loadOverview} className="font-semibold underline">Try again</button>
            </p>
          )}

          {shown.map((area) => {
            const { icon: Icon, about } = AREA_INFO[area];
            const tiles = overview ? areaTiles(area, overview) : null;
            const titleId = `reports-${area.replace(/\W+/g, '-').toLowerCase()}`;
            return (
              <section key={area} aria-labelledby={titleId} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 dark:border-[#2B293E] dark:bg-white/[0.02]">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">{area}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{about}</p>
                  </div>
                </div>

                {canReport && (tiles === null ? (
                  !overviewError && <div className="mt-4 h-20 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading figures</span></div>
                ) : tiles.length > 0 && (
                  <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {tiles.map((t) => (
                      <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-[#2B293E] dark:bg-[#181724]">
                        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.label}</dt>
                        <dd className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{t.value}</dd>
                        <dd className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.hint}</dd>
                      </div>
                    ))}
                  </dl>
                ))}

                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Exports</h3>
                <div className="mt-2 grid gap-4 lg:grid-cols-2">
                  {available.filter((r) => r.area === area).map((report) => (
                    <ReportCard key={report.id} report={report} periods={periods} periodsError={periodsError} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
};

const ReportCard: React.FC<{ report: Report; periods: BackendPayrollPeriod[] | null; periodsError: string | null }> = ({ report, periods, periodsError }) => {
  const id = useId();
  const [values, setValues] = useState<Values>(defaultValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = report.icon;
  const periodId = values.periodId || periods?.[0]?.id || '';
  const set = (change: Partial<Values>) => { setValues((v) => ({ ...v, ...change })); setError(null); };

  const problem =
    report.input === 'range' && values.from && values.to && values.to < values.from ? 'The end date is before the start date.'
    : report.input === 'range' && (!values.from || !values.to) ? 'Choose both dates.'
    : report.input === 'month' && !values.month ? 'Choose a month.'
    : report.input === 'period' && !periodId ? (periods === null && !periodsError ? 'Loading pay periods…' : 'There are no pay periods yet.')
    : null;

  const note = error ?? (report.input === 'period' && periodsError ? `The pay periods could not be loaded: ${periodsError}` : problem);

  const exportReport = async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await downloadReport(report.path({ ...values, periodId }), report.fallbackName);
      saveFile(file.blob, file.filename);
      toast.success(`${report.title} downloaded.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby={`${id}-title`} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 dark:border-[#2B293E] dark:bg-[#181724]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h4 id={`${id}-title`} className="font-semibold text-slate-900 dark:text-slate-100">{report.title}</h4>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{report.summary}</p>
        </div>
      </div>

      <details className="group mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
        <summary className="cursor-pointer select-none text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-300">
          Columns in this report ({report.includes.length})
        </summary>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {report.includes.map((c) => (
            <li key={c} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 dark:border-[#2B293E] dark:bg-[#1E1D2D] dark:text-slate-300">{c}</li>
          ))}
        </ul>
      </details>

      <div className="mt-4 flex flex-1 flex-wrap items-end gap-3">
        {report.input === 'month' && (
          <div className="w-full sm:w-48">
            <label htmlFor={`${id}-month`} className={labelClass}>Month</label>
            <input id={`${id}-month`} type="month" value={values.month} onChange={(e) => set({ month: e.target.value })} className={fieldClass} />
          </div>
        )}
        {report.input === 'range' && (
          <>
            <div className="w-full sm:w-40">
              <label htmlFor={`${id}-from`} className={labelClass}>From</label>
              <input id={`${id}-from`} type="date" value={values.from} onChange={(e) => set({ from: e.target.value })} className={fieldClass} />
            </div>
            <div className="w-full sm:w-40">
              <label htmlFor={`${id}-to`} className={labelClass}>To</label>
              <input id={`${id}-to`} type="date" value={values.to} min={values.from || undefined} onChange={(e) => set({ to: e.target.value })} className={fieldClass} />
            </div>
          </>
        )}
        {report.input === 'period' && (
          <div className="w-full sm:w-56">
            <label htmlFor={`${id}-period`} className={labelClass}>Pay period</label>
            <select id={`${id}-period`} value={periodId} onChange={(e) => set({ periodId: e.target.value })} disabled={!periods?.length} className={fieldClass}>
              {!periods?.length && <option value="">{periodsError ? 'Could not load periods' : periods === null ? 'Loading…' : 'No pay periods yet'}</option>}
              {periods?.map((p) => <option key={p.id} value={p.id}>{p.period_code}</option>)}
            </select>
          </div>
        )}
        {report.input === 'none' && <p className="text-xs text-slate-500 dark:text-slate-400">Includes everything you can see; no dates needed.</p>}
        <Button size="sm" className="ml-auto h-10 gap-2" onClick={exportReport} loading={busy} disabled={!!problem} aria-describedby={note ? `${id}-note` : undefined}>
          {!busy && <Download className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Preparing…' : 'Export Excel'}
        </Button>
      </div>

      {note && (
        <p id={`${id}-note`} role={error ? 'alert' : undefined} className={`mt-2 text-xs ${error || (report.input === 'period' && periodsError) ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}>
          {note}
        </p>
      )}
      {report.input === 'period' && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Only finalized payslips appear; a period still being processed exports empty.</p>}
    </article>
  );
};
