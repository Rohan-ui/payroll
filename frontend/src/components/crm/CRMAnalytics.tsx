import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronRight, Download, Lightbulb, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { crmApi, type CrmReportSummary } from '../../api/crm.api';
import { errorText, fieldClass } from '../../views/payroll/payroll-format';
import { saveFile } from '../../utils/download';
import { toast } from '../../lib/toast';

/** The one series colour, as on the other charts in the app. */
const SERIES = '#0d9488';
/** Leads added, a lighter companion to the won series. */
const CREATED = '#94a3b8';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A stage holding at least this share of open deals is called out as where deals pile up. */
const CONCENTRATION = 50;

const inr = (value: string | number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value ?? 0));
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const card = 'rounded-xl border border-slate-200 bg-white p-5 dark:border-[#2B293E] dark:bg-[#181724]';
const heading = 'text-sm font-semibold text-slate-900 dark:text-slate-100';
const sub = 'text-xs text-slate-500 dark:text-slate-400';
const th = 'py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400';

interface Metric { label: string; value: string; hint: string; action?: { onClick: () => void; label: string } }

interface CRMAnalyticsProps {
  /** Opens the pipeline board filtered to a stage. */
  onSelectStage?: (stageId: string) => void;
  /** Opens the list of won deals. */
  onSelectWon?: () => void;
}

/**
 * Plain-language takeaways, each worked out from the server's figures; nothing
 * is shown that the numbers do not say.
 */
export function takeaways(report: CrmReportSummary): string[] {
  const t = report.totals;
  const notes: string[] = [];
  const open = report.stages.reduce((sum, s) => sum + s.count, 0);
  const top = [...report.stages].sort((a, b) => b.count - a.count)[0];
  if (open && top && pct(top.count, open) >= CONCENTRATION) {
    notes.push(`${pct(top.count, open)}% of open deals (${top.count} of ${open}) are in “${top.name}”. Moving them on is where the pipeline can grow.`);
  }
  const unassigned = report.assignees.find((a) => a.name === 'Unassigned');
  if (unassigned && unassigned.open > 0) notes.push(`${plural(unassigned.open, 'open deal')} ${unassigned.open === 1 ? 'has' : 'have'} no one assigned.`);
  if (t.winRate === null) notes.push('No deal has been won or lost yet, so there is no win rate.');
  else notes.push(`${t.winRate}% of closed deals were won (${t.wonCount} of ${t.wonCount + t.lostCount}).`);
  const leads = report.sources.reduce((sum, s) => sum + s.leads, 0);
  const noSource = report.sources.find((s) => s.name === 'No source');
  const topSource = report.sources.find((s) => s.name !== 'No source');
  if (topSource && leads) notes.push(`Most leads with a known source come from ${topSource.name} (${topSource.leads}, ${pct(topSource.leads, leads)}% of all leads).`);
  if (noSource && leads && pct(noSource.leads, leads) >= 20) notes.push(`${pct(noSource.leads, leads)}% of leads (${noSource.leads}) have no source recorded, so these figures can’t say where they came from.`);
  if (t.newThisMonth !== undefined && t.newLastMonth !== undefined && t.newLastMonth > 0 && t.newThisMonth < t.newLastMonth / 2) {
    notes.push(`New leads are down this month: ${t.newThisMonth} so far against ${t.newLastMonth} last month.`);
  }
  if (open && Number(t.openValue) === 0) notes.push('No open deal has a value yet; add budgets to see pipeline value and the forecast.');
  return notes;
}

/**
 * CRM reports from the server: every lead in the sales pipelines that the
 * member may see, never just the page the browser holds. What the figures
 * mean, open and won value, the weighted forecast, open deals by stage,
 * sources, assignees and wins by month, and the same as an Excel file.
 */
export default function CRMAnalytics({ onSelectStage, onSelectWon }: CRMAnalyticsProps) {
  const id = useId();
  const [report, setReport] = useState<CrmReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pipelineId, setPipelineId] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    crmApi.reportSummary()
      .then((r) => { setReport(r.data); setLoadedAt(new Date()); })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const exportReport = async () => {
    setExporting(true);
    try {
      const file = await crmApi.exportReport();
      saveFile(file.blob, file.filename);
      toast.success('CRM report downloaded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The report could not be exported. Try again.');
    } finally {
      setExporting(false);
    }
  };

  const pipelines = useMemo(() => {
    const seen = new Map<string, string>();
    report?.stages.forEach((s) => seen.set(s.pipelineId, s.pipelineName));
    return [...seen.entries()].map(([value, name]) => ({ value, name }));
  }, [report]);
  const shownPipeline = pipelineId || pipelines[0]?.value || '';
  const stages = report?.stages.filter((s) => s.pipelineId === shownPipeline) ?? [];
  const stageTotal = stages.reduce((sum, s) => sum + s.count, 0);
  const maxStage = Math.max(1, ...stages.map((s) => s.count));

  if (error) {
    return (
      <p role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <span>The reports could not be loaded: {error}</span>
        <button type="button" onClick={load} className="font-semibold underline">Try again</button>
      </p>
    );
  }
  if (!report) return <div className={`${card} h-64 animate-pulse motion-reduce:animate-none`} aria-busy="true"><span className="sr-only" role="status">Loading reports</span></div>;

  const t = report.totals;
  const trend = report.wonByMonth.map((m) => ({ ...m, created: m.created ?? 0, label: `${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}`, amount: Number(m.value) }));
  const wonInYear = trend.reduce((sum, m) => sum + m.won, 0);
  const createdInYear = trend.reduce((sum, m) => sum + m.created, 0);
  const notes = takeaways(report);
  const totalLeads = report.sources.reduce((sum, s) => sum + s.leads, 0);
  const totalOpen = report.assignees.reduce((sum, a) => sum + a.open, 0);
  const maxSource = Math.max(1, ...report.sources.map((s) => s.leads));
  const maxAssignee = Math.max(1, ...report.assignees.map((a) => a.open));
  const newChange = t.newThisMonth !== undefined && t.newLastMonth !== undefined ? t.newThisMonth - t.newLastMonth : null;

  const metrics: Metric[] = [
    { label: 'Leads', value: String(t.totalLeads ?? totalLeads), hint: t.newThisMonth === undefined ? 'In the sales pipelines' : `${t.newThisMonth} new this month${newChange === null ? '' : newChange === 0 ? ', same as last month' : `, ${Math.abs(newChange)} ${newChange > 0 ? 'more' : 'fewer'} than last month`}` },
    { label: 'Open pipeline', value: inr(t.openValue), hint: `${plural(t.openCount, 'open deal')} · their total budget` },
    { label: 'Weighted forecast', value: inr(t.weightedForecast), hint: 'Open value × each stage’s chance of winning: what the pipeline is likely to bring in' },
    { label: 'Won', value: inr(t.wonValue), hint: `${plural(t.wonCount, 'deal')} won in all`, action: onSelectWon ? { onClick: onSelectWon, label: 'See the won deals' } : undefined },
    { label: 'Win rate', value: t.winRate === null ? '—' : `${t.winRate}%`, hint: t.winRate === null ? 'No deals closed yet' : `Of ${t.wonCount + t.lostCount} closed, ${t.wonCount} won and ${t.lostCount} lost` },
    { label: 'Average deal won', value: t.averageWon === null ? '—' : inr(t.averageWon), hint: t.averageWon === null ? 'Shown once a deal is won' : 'Won value ÷ deals won' },
    { label: 'Days to win', value: t.averageDaysToWin === null || t.averageDaysToWin === undefined ? '—' : String(t.averageDaysToWin), hint: t.averageDaysToWin === null || t.averageDaysToWin === undefined ? 'Shown once a deal is won' : 'Average from a lead being added to being won' },
    { label: 'Lost', value: String(t.lostCount), hint: 'Deals marked lost' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={sub}>
          Every lead you can see in the sales pipelines{loadedAt ? `, as of ${loadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}. Leads still in the 30-day outreach cadence count as deals once they are converted to an opportunity.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="Refresh reports">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={exportReport} loading={exporting} className="gap-2">
            {!exporting && <Download className="h-4 w-4" aria-hidden="true" />}
            {exporting ? 'Preparing…' : 'Export Excel'}
          </Button>
        </div>
      </div>

      <section aria-label="Sales summary">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2B293E] dark:bg-[#181724]">
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{m.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {m.action ? (
                  <button type="button" onClick={m.action.onClick} aria-label={m.action.label} className="inline-flex items-center gap-1 rounded hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:text-teal-300">
                    {m.value}<ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </button>
                ) : m.value}
              </dd>
              <dd className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{m.hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      {notes.length > 0 && (
        <section aria-labelledby={`${id}-notes`} className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-900 dark:bg-teal-950/20">
          <h2 id={`${id}-notes`} className="flex items-center gap-2 text-sm font-semibold text-teal-900 dark:text-teal-100">
            <Lightbulb className="h-4 w-4" aria-hidden="true" /> What the numbers say
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-teal-900/90 dark:text-teal-100/90">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <section className={`${card} xl:col-span-3`} aria-labelledby={`${id}-stages`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id={`${id}-stages`} className={heading}>Open deals by stage</h2>
              <p className={sub}>Where deals that are not yet won or lost sit now.{onSelectStage ? ' Choose a stage to see its deals on the board.' : ''}</p>
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
          {stages.length === 0 ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">This pipeline has no stages yet. Add them in CRM settings.</p> : (
            <>
              <div className="mt-4 hidden items-center gap-3 border-b border-slate-100 px-2 pb-2 text-xs font-medium text-slate-500 dark:border-[#2B293E] dark:text-slate-400 sm:flex" aria-hidden="true">
                <span className="w-44">Stage</span>
                <span className="flex-1">Share of open deals</span>
                <span className="w-12 text-right">Deals</span>
                <span className="w-12 text-right">Share</span>
                <span className="w-24 text-right">Value</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {stages.map((s) => {
                  const share = pct(s.count, stageTotal);
                  const row = (
                    <>
                      <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-300 sm:w-44">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                        <span className="truncate">{s.name}</span>
                      </span>
                      <span className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-white/5" aria-hidden="true">
                        <span className="block h-2 rounded-full" style={{ width: `${(s.count / maxStage) * 100}%`, backgroundColor: SERIES }} />
                      </span>
                      <span className="w-12 shrink-0 text-right text-sm tabular-nums text-slate-900 dark:text-slate-100">{s.count}</span>
                      <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400 sm:block">{share}%</span>
                      <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400 sm:block">{inr(s.value)}</span>
                    </>
                  );
                  return (
                    <li key={s.id}>
                      {onSelectStage ? (
                        <button type="button" onClick={() => onSelectStage(s.id)} aria-label={`${s.name}: ${s.count} deals, ${inr(s.value)}. Show on the board`}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-white/5">
                          {row}
                        </button>
                      ) : <div className="flex items-center gap-3 px-2 py-2">{row}</div>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section className={`${card} xl:col-span-2`} aria-labelledby={`${id}-sources`}>
          <h2 id={`${id}-sources`} className={heading}>Leads by source</h2>
          <p className={sub}>Where leads come from, and how many of each were won.</p>
          {report.sources.length === 0 ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No leads yet.</p> : (
            <ul className="mt-4 space-y-3">
              {report.sources.map((s) => (
                <li key={s.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={s.name === 'No source' ? 'italic text-slate-500' : 'text-slate-700 dark:text-slate-300'}>{s.name === 'No source' ? 'Not recorded' : s.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-900 dark:text-slate-100">{s.leads} <span className="text-xs text-slate-500 dark:text-slate-400">({pct(s.leads, totalLeads)}%)</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-white/5" aria-hidden="true">
                    <div className="h-2 rounded-full" style={{ width: `${(s.leads / maxSource) * 100}%`, backgroundColor: SERIES }} />
                  </div>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">{s.won} won · {pct(s.won, s.leads)}% of its leads · {inr(s.value)} in budgets</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={card} aria-labelledby={`${id}-trend`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id={`${id}-trend`} className={heading}>Leads added and deals won, last 12 months</h2>
            <p className={sub}>Leads by the month they were added; wins by the month they were won.</p>
          </div>
          {(wonInYear > 0 || createdInYear > 0) && (
            <p className="text-sm tabular-nums text-slate-700 dark:text-slate-300">{plural(createdInYear, 'lead')} added · {plural(wonInYear, 'deal')} won · {inr(trend.reduce((sum, m) => sum + m.amount, 0))}</p>
          )}
        </div>
        {wonInYear === 0 && createdInYear === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-[#2B293E]">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No deals won in the last 12 months</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mark a deal won on the pipeline board and it appears here in that month.</p>
          </div>
        ) : (
          <>
            {wonInYear === 0 && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No deals won in the last 12 months yet; only leads added are shown.</p>}
            <div className="mt-3 flex gap-4 text-xs text-slate-600 dark:text-slate-300" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CREATED }} />Leads added</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES }} />Deals won</span>
            </div>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barGap={2}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={40} />
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
                    const p = active && (payload?.[0]?.payload as (typeof trend)[number] | undefined);
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-[#2B293E] dark:bg-[#1E1D2D]">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{p.label}</p>
                        <p className="tabular-nums text-slate-600 dark:text-slate-300">{p.created} leads added</p>
                        <p className="tabular-nums text-slate-600 dark:text-slate-300">{p.won} won · {inr(p.value)}</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="created" fill={CREATED} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="won" fill={SERIES} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Leads added and deals won by month</caption>
              <thead><tr><th scope="col">Month</th><th scope="col">Leads added</th><th scope="col">Won</th><th scope="col">Value</th></tr></thead>
              <tbody>{trend.map((m) => <tr key={m.month}><td>{m.label}</td><td>{m.created}</td><td>{m.won}</td><td>{inr(m.value)}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </section>

      <section className={card} aria-labelledby={`${id}-assignees`}>
        <h2 id={`${id}-assignees`} className={heading}>Team</h2>
        <p className={sub}>Who holds the open deals, what they are worth, and how many each person has won.</p>
        {report.assignees.length === 0 ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No leads yet.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr><th scope="col" className={`${th} text-left`}>Assignee</th><th scope="col" className={`${th} w-1/3 text-left`}><span className="sr-only">Share of open deals</span></th><th scope="col" className={th}>Open</th><th scope="col" className={th}>Share</th><th scope="col" className={th}>Open value</th><th scope="col" className={th}>Won</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {report.assignees.map((a) => (
                  <tr key={a.name}>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{a.name === 'Unassigned' ? <span className="italic text-slate-500">Unassigned</span> : a.name}</td>
                    <td className="py-2 pr-3" aria-hidden="true">
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5"><div className="h-2 rounded-full" style={{ width: `${(a.open / maxAssignee) * 100}%`, backgroundColor: a.name === 'Unassigned' ? '#94a3b8' : SERIES }} /></div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{a.open}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{pct(a.open, totalOpen)}%</td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{inr(a.openValue)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{a.won}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
