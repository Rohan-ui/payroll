import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatStrip } from '../ui/StatStrip';
import { crmApi, type CrmReportSummary } from '../../api/crm.api';
import { errorText, fieldClass } from '../../views/payroll/payroll-format';

/** The one series colour, as on the other charts in the app. */
const SERIES = '#0d9488';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const inr = (value: string | number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value ?? 0));

const card = 'rounded-xl border border-slate-200 bg-white p-5 dark:border-[#2B293E] dark:bg-[#181724]';
const heading = 'text-sm font-semibold text-slate-900 dark:text-slate-100';

interface CRMAnalyticsProps {
  /** Opens the pipeline board filtered to a stage. */
  onSelectStage?: (stageId: string) => void;
  /** Opens the list of won deals. */
  onSelectWon?: () => void;
}

/**
 * CRM reports from the server: every lead in the sales pipelines that the
 * member may see, never just the page the browser holds. Open and won value,
 * the weighted forecast, open deals by stage, sources, assignees and wins by
 * month.
 */
export default function CRMAnalytics({ onSelectStage, onSelectWon }: CRMAnalyticsProps) {
  const id = useId();
  const [report, setReport] = useState<CrmReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState('');

  const load = useCallback(() => {
    setError(null);
    crmApi.reportSummary().then((r) => setReport(r.data)).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const pipelines = useMemo(() => {
    const seen = new Map<string, string>();
    report?.stages.forEach((s) => seen.set(s.pipelineId, s.pipelineName));
    return [...seen.entries()].map(([value, name]) => ({ value, name }));
  }, [report]);
  const shownPipeline = pipelineId || pipelines[0]?.value || '';
  const stages = report?.stages.filter((s) => s.pipelineId === shownPipeline) ?? [];
  const maxStage = Math.max(1, ...stages.map((s) => s.count));

  if (error) {
    return (
      <p role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>The reports could not be loaded: {error}</span>
        <button type="button" onClick={load} className="font-semibold underline">Try again</button>
      </p>
    );
  }
  if (!report) return <div className={`${card} h-64 animate-pulse motion-reduce:animate-none`} aria-busy="true"><span className="sr-only" role="status">Loading reports</span></div>;

  const t = report.totals;
  const trend = report.wonByMonth.map((m) => ({ ...m, label: `${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}`, amount: Number(m.value) }));

  return (
    <div className="space-y-5">
      <StatStrip label="Sales summary" stats={[
        { label: 'Open pipeline', value: inr(t.openValue), hint: `${t.openCount} open deal${t.openCount === 1 ? '' : 's'}` },
        { label: 'Weighted forecast', value: inr(t.weightedForecast), hint: 'Open value × stage probability' },
        { label: 'Won', value: inr(t.wonValue), hint: `${t.wonCount} deal${t.wonCount === 1 ? '' : 's'}`, ...(onSelectWon ? { onClick: onSelectWon, actionLabel: 'See the won deals' } : {}) },
        { label: 'Win rate', value: t.winRate === null ? '—' : `${t.winRate}%`, hint: t.winRate === null ? 'No deals closed yet' : `Of ${t.wonCount + t.lostCount} closed · average win ${inr(t.averageWon)}` },
      ]} />

      <section className={card} aria-labelledby={`${id}-stages`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id={`${id}-stages`} className={heading}>Open deals by stage</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{onSelectStage ? 'Choose a stage to see its deals on the board.' : 'Deals not yet won or lost.'}</p>
          </div>
          {pipelines.length > 1 && (
            <div className="w-full sm:w-56">
              <label htmlFor={`${id}-pipeline`} className="sr-only">Pipeline</label>
              <select id={`${id}-pipeline`} className={fieldClass} value={shownPipeline} onChange={(e) => setPipelineId(e.target.value)}>
                {pipelines.map((p) => <option key={p.value} value={p.value}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {stages.length === 0 ? <p className="mt-3 text-sm text-slate-500">This pipeline has no stages yet. Add them in CRM settings.</p> : (
          <ul className="mt-4 space-y-1">
            {stages.map((s) => {
              const row = (
                <>
                  <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-300 sm:w-48">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="h-2.5 flex-1 rounded-sm bg-slate-100 dark:bg-white/5" aria-hidden="true">
                    <span className="block h-2.5 rounded-r" style={{ width: `${(s.count / maxStage) * 100}%`, backgroundColor: SERIES }} />
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-slate-900 dark:text-slate-100">{s.count}</span>
                  <span className="hidden w-28 shrink-0 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400 sm:block">{inr(s.value)}</span>
                </>
              );
              return (
                <li key={s.id}>
                  {onSelectStage ? (
                    <button type="button" onClick={() => onSelectStage(s.id)} aria-label={`${s.name}: ${s.count} deals, ${inr(s.value)}. Show on the board`}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-white/5">
                      {row}
                    </button>
                  ) : <div className="flex items-center gap-3 px-2 py-1.5">{row}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby={`${id}-trend`}>
        <h2 id={`${id}-trend`} className={heading}>Deals won, last 12 months</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">By the month the deal was won.</p>
        <div className="mt-3 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={40} />
              <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
                const p = active && (payload?.[0]?.payload as (typeof trend)[number] | undefined);
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-[#2B293E] dark:bg-[#1E1D2D]">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{p.label}</p>
                    <p className="tabular-nums text-slate-600 dark:text-slate-300">{p.won} won · {inr(p.value)}</p>
                  </div>
                );
              }} />
              <Bar dataKey="won" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Deals won by month</caption>
          <thead><tr><th scope="col">Month</th><th scope="col">Won</th><th scope="col">Value</th></tr></thead>
          <tbody>{trend.map((m) => <tr key={m.month}><td>{m.label}</td><td>{m.won}</td><td>{inr(m.value)}</td></tr>)}</tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card} aria-labelledby={`${id}-sources`}>
          <h2 id={`${id}-sources`} className={heading}>Leads by source</h2>
          {report.sources.length === 0 ? <p className="mt-3 text-sm text-slate-500">No leads yet.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-xs text-slate-500 dark:text-slate-400">
                <tr><th scope="col" className="py-1.5 text-left font-medium">Source</th><th scope="col" className="py-1.5 text-right font-medium">Leads</th><th scope="col" className="py-1.5 text-right font-medium">Won</th><th scope="col" className="py-1.5 text-right font-medium">Value</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {report.sources.map((s) => (
                  <tr key={s.name}>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{s.name}</td>
                    <td className="py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{s.leads}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{s.won}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{inr(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={card} aria-labelledby={`${id}-assignees`}>
          <h2 id={`${id}-assignees`} className={heading}>By assignee</h2>
          {report.assignees.length === 0 ? <p className="mt-3 text-sm text-slate-500">No leads yet.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-xs text-slate-500 dark:text-slate-400">
                <tr><th scope="col" className="py-1.5 text-left font-medium">Assignee</th><th scope="col" className="py-1.5 text-right font-medium">Open</th><th scope="col" className="py-1.5 text-right font-medium">Open value</th><th scope="col" className="py-1.5 text-right font-medium">Won</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {report.assignees.map((a) => (
                  <tr key={a.name}>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{a.name}</td>
                    <td className="py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{a.open}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{inr(a.openValue)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{a.won}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
