import React, { useCallback, useEffect, useId, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../../components/ui/Button';
import { offboardingApi, type Breakdown, type OffboardingReport, type ReportQuery, type SeparationStatus, type SeparationType } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, labelClass, money, tdClass, thClass } from '../payroll/payroll-format';
import { EXIT_STATUS, EXIT_TYPE } from './offboarding-format';

/** The one series colour, as on the payroll chart. */
const SERIES = '#0d9488';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const periodLabel = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${MONTHS[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}` : p.replace('-', ' '));

/**
 * Offboarding at a glance: where exits stand now, how many fall in a range and
 * why, by department and designation, settlements, and who leaves soon. Every
 * filter applies to the whole page.
 */
export const OffboardingReportsTab: React.FC = () => {
  const id = useId();
  const [filters, setFilters] = useState<ReportQuery>({});
  const [report, setReport] = useState<OffboardingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    offboardingApi.report(filters).then(setReport).catch((e) => setError(errorText(e))).finally(() => setLoading(false));
  }, [filters]);
  useEffect(load, [load]);

  const set = (change: Partial<ReportQuery>) => setFilters((f) => ({ ...f, ...change }));
  const filtered = Object.entries(filters).some(([k, v]) => v && !['groupBy'].includes(k));
  const s = report?.summary;

  return (
    <div className="space-y-4" aria-busy={loading}>
      <section className={`${cardClass} p-4`} aria-label="Filters">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <div>
            <label htmlFor={`${id}-from`} className={labelClass}>Last day from</label>
            <input id={`${id}-from`} type="date" className={fieldClass} value={filters.from ?? report?.range.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
          </div>
          <div>
            <label htmlFor={`${id}-to`} className={labelClass}>to</label>
            <input id={`${id}-to`} type="date" className={fieldClass} value={filters.to ?? report?.range.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
          </div>
          <div>
            <label htmlFor={`${id}-group`} className={labelClass}>Group by</label>
            <select id={`${id}-group`} className={fieldClass} value={filters.groupBy ?? 'month'} onChange={(e) => set({ groupBy: e.target.value as ReportQuery['groupBy'] })}>
              <option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option>
            </select>
          </div>
          <FilterSelect id={`${id}-department`} label="Department" value={filters.departmentId} options={report?.options.departments} onChange={(v) => set({ departmentId: v })} />
          <FilterSelect id={`${id}-location`} label="Location" value={filters.locationId} options={report?.options.locations} onChange={(v) => set({ locationId: v })} />
          <FilterSelect id={`${id}-manager`} label="Manager" value={filters.managerId} options={report?.options.managers} onChange={(v) => set({ managerId: v })} />
          <div>
            <label htmlFor={`${id}-type`} className={labelClass}>Exit type</label>
            <select id={`${id}-type`} className={fieldClass} value={filters.type ?? ''} onChange={(e) => set({ type: (e.target.value || undefined) as SeparationType | undefined })}>
              <option value="">All</option>
              {(Object.keys(EXIT_TYPE) as SeparationType[]).map((t) => <option key={t} value={t}>{EXIT_TYPE[t]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-status`} className={labelClass}>Status</label>
            <select id={`${id}-status`} className={fieldClass} value={filters.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as SeparationStatus | undefined })}>
              <option value="">All</option>
              {(Object.keys(EXIT_STATUS) as SeparationStatus[]).map((st) => <option key={st} value={st}>{EXIT_STATUS[st].label}</option>)}
            </select>
          </div>
        </div>
        {filtered && <Button className="mt-3" size="sm" variant="ghost" onClick={() => setFilters({ groupBy: filters.groupBy })}>Clear filters</Button>}
      </section>

      {error && (
        <p role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>The reports could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </p>
      )}

      {!report && !error && <div className={`${cardClass} h-64 animate-pulse motion-reduce:animate-none`}><span className="sr-only" role="status">Loading reports</span></div>}

      {report && s && (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Awaiting acceptance', value: s.pendingResignations },
              { label: 'Serving notice', value: s.accepted, note: s.pastLastDay ? `${s.pastLastDay} past their last day` : undefined },
              { label: 'Leaving in the next 30 days', value: s.upcomingLastDays },
              { label: 'Open checklist items', value: s.pendingChecklistItems },
              { label: 'Exited', value: s.completed },
              { label: 'Cancelled or withdrawn', value: s.cancelled },
              { label: 'All exits', value: s.total },
            ].map((c) => (
              <div key={c.label} className={`${cardClass} px-4 py-3`}>
                <dt className="text-xs text-slate-500 dark:text-slate-400">{c.label}</dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{c.value}</dd>
                {c.note && <dd className="text-xs font-semibold text-amber-700 dark:text-amber-300">{c.note}</dd>}
              </div>
            ))}
          </dl>

          <section className={`${cardClass} p-5`} aria-labelledby={`${id}-trend`}>
            <h2 id={`${id}-trend`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Exits by last working day</h2>
            <p className="text-xs text-slate-500">{day(report.range.from)} to {day(report.range.to)}, by {report.range.groupBy}. Withdrawn and cancelled exits aren’t counted.</p>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.trend.map((p) => ({ ...p, label: periodLabel(p.period) }))} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={40} />
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
                    const p = active && (payload?.[0]?.payload as { label: string; value: number } | undefined);
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-[#2B293E] dark:bg-[#1E1D2D]">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{p.label}</p>
                        <p className="tabular-nums text-slate-600 dark:text-slate-300">{p.value} exit{p.value === 1 ? '' : 's'}</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={40} minPointSize={0} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Exits by {report.range.groupBy}</caption>
              <thead><tr><th scope="col">Period</th><th scope="col">Exits</th></tr></thead>
              <tbody>{report.trend.map((p) => <tr key={p.period}><td>{periodLabel(p.period)}</td><td>{p.value}</td></tr>)}</tbody>
            </table>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard title="By exit type" rows={report.byType} />
            <BreakdownCard title="By reason given in the exit interview" rows={report.byReason} />
            <BreakdownCard title="By department" rows={report.byDepartment} />
            <BreakdownCard title="By designation" rows={report.byDesignation} />
          </div>

          {report.settlements && (
            <section className={`${cardClass} p-5`} aria-labelledby={`${id}-settlements`}>
              <h2 id={`${id}-settlements`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Full and final settlements</h2>
              <p className="text-xs text-slate-500">Counts are for exits in the filters; money paid and recovered is for exits in the date range.</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: 'Not started', value: String(report.settlements.notStarted) },
                  { label: 'Draft or in review', value: String(report.settlements.inReview) },
                  { label: 'Approved, not paid', value: String(report.settlements.approvedUnpaid), note: report.settlements.approvedUnpaid ? money(report.settlements.approvedUnpaidAmount) : undefined },
                  { label: 'Paid', value: String(report.settlements.paid) },
                  { label: 'Total paid out', value: money(report.settlements.totalPaid) },
                  { label: 'Total recovered', value: money(report.settlements.totalRecoveries) },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{c.label}</dt>
                    <dd className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{c.value}</dd>
                    {c.note && <dd className="text-xs tabular-nums text-slate-600 dark:text-slate-300">{c.note} to pay</dd>}
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className={cardClass} aria-labelledby={`${id}-upcoming`}>
            <div className="border-b border-slate-100 p-4 dark:border-[#2B293E]">
              <h2 id={`${id}-upcoming`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Leaving soon</h2>
              <p className="text-xs text-slate-500">Serving notice, last working day in the next 30 days or already past.</p>
            </div>
            {report.upcoming.length === 0 ? <p className="p-4 text-sm text-slate-500">No one is leaving in the next 30 days.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-white/5">
                    <tr><th scope="col" className={thClass}>Employee</th><th scope="col" className={thClass}>Last working day</th><th scope="col" className={thClass}>Type</th><th scope="col" className={thClass}>Department</th><th scope="col" className={thClass}>Location</th><th scope="col" className={thClass}>Manager</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                    {report.upcoming.map((u) => {
                      const past = u.lastWorkingDate < report.today;
                      return (
                        <tr key={u.id}>
                          <td className={tdClass}><span className="font-semibold text-slate-900 dark:text-slate-100">{u.employee.name}</span><span className="block text-xs text-slate-500">{u.employee.code}</span></td>
                          <td className={`${tdClass} whitespace-nowrap`}>{day(u.lastWorkingDate)}{past && <span className="block text-xs font-semibold text-amber-700 dark:text-amber-300">Past, not completed</span>}</td>
                          <td className={tdClass}>{EXIT_TYPE[u.type]}</td>
                          <td className={tdClass}>{u.department ?? '—'}</td>
                          <td className={tdClass}>{u.location ?? '—'}</td>
                          <td className={tdClass}>{u.manager ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

const FilterSelect: React.FC<{ id: string; label: string; value?: string; options?: { id: string; name: string }[]; onChange: (value: string | undefined) => void }> = ({ id, label, value, options, onChange }) => (
  <div>
    <label htmlFor={id} className={labelClass}>{label}</label>
    <select id={id} className={fieldClass} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">All</option>
      {options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  </div>
);

/** A ranked count as a table with a bar in each row: readable as numbers, scannable as shape. */
const BreakdownCard: React.FC<{ title: string; rows: Breakdown[] }> = ({ title, rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((t, r) => t + r.value, 0);
  return (
    <section className={`${cardClass} p-5`}>
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">No exits in this range.</p> : (
        <table className="mt-3 w-full text-sm">
          <thead className="sr-only"><tr><th scope="col">{title.replace(/^By /, '')}</th><th scope="col">Exits</th></tr></thead>
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.label}>
                <td className="w-2/5 py-1 pr-3 align-middle text-slate-700 dark:text-slate-300"><span className="line-clamp-2 break-words">{r.label}</span></td>
                <td className="py-1 align-middle">
                  <div className="flex items-center gap-2">
                    <div className="h-3 flex-1 rounded-sm bg-slate-100 dark:bg-white/5">
                      <div className="h-3 rounded-r" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: SERIES }} />
                    </div>
                    <span className="w-16 shrink-0 text-right tabular-nums text-slate-900 dark:text-slate-100">{r.value} <span className="text-xs text-slate-500">{Math.round((r.value / total) * 100)}%</span></span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 10 && <p className="mt-2 text-xs text-slate-500">And {rows.length - 10} more, with {rows.slice(10).reduce((t, r) => t + r.value, 0)} exits.</p>}
    </section>
  );
};
