import React, { useCallback, useEffect, useId, useState } from 'react';
import { apiClient } from '../../api/client';
import { ACTION_FILTERS, CHANNEL_FILTERS, HistoryEntry, actionLabel, dateRange, describeEntry } from './crmHistory';

interface Props {
  leadId: string;
  pipelines?: { id: string; name: string }[];
  stages?: { id: string; name: string }[];
}

interface Page {
  data: HistoryEntry[];
  pagination: { page: number; totalPages: number; total: number };
  actors: { id: string; name: string }[];
}

const quiet = { feedback: { success: false, error: false } } as RequestInit;
const selectClass = 'h-8 px-2 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
const PAGE_SIZE = 50;

const dayHeading = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * A lead's history as the server recorded it: who did what and when, with
 * before and after values, newest first, filtered on the server by member,
 * action, channel and date, a page at a time.
 */
export function LeadHistory({ leadId, pipelines = [], stages = [] }: Props) {
  const ids = { actor: useId(), action: useId(), channel: useId(), period: useId(), from: useId(), to: useId() };
  const [filters, setFilters] = useState({ actorId: '', actionType: '', channel: '', period: 'ALL', from: '', to: '' });
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    const range = dateRange(filters.period, filters.from, filters.to);
    const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
    if (filters.actorId) params.set('actorId', filters.actorId);
    if (filters.actionType) params.set('actionType', filters.actionType);
    if (filters.channel) params.set('channel', filters.channel);
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    try {
      const res = await apiClient.get<Page>(`/crm/leads/${leadId}/history?${params}`, quiet);
      setEntries((current) => (nextPage === 1 ? res.data : [...(current ?? []), ...res.data]));
      setActors(res.actors);
      setPage(nextPage);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The history could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, [leadId, filters]);

  useEffect(() => { void load(1); }, [load]);

  const names = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'stage_id') return stages.find((s) => s.id === value)?.name ?? 'a stage';
    if (field === 'pipeline_id') return pipelines.find((p) => p.id === value)?.name ?? 'a pipeline';
    if (field === 'assigned_tenant_member_id') return actors.find((a) => a.id === value)?.name ?? 'a former member';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }));

  let lastDay = '';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={ids.actor} className="sr-only">Member</label>
        <select id={ids.actor} className={selectClass} value={filters.actorId} onChange={(e) => set({ actorId: e.target.value })}>
          <option value="">All members</option>
          {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label htmlFor={ids.action} className="sr-only">Action</label>
        <select id={ids.action} className={selectClass} value={filters.actionType} onChange={(e) => set({ actionType: e.target.value })}>
          <option value="">All actions</option>
          {ACTION_FILTERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <label htmlFor={ids.channel} className="sr-only">Channel</label>
        <select id={ids.channel} className={selectClass} value={filters.channel} onChange={(e) => set({ channel: e.target.value })}>
          <option value="">All channels</option>
          {CHANNEL_FILTERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label htmlFor={ids.period} className="sr-only">Date</label>
        <select id={ids.period} className={selectClass} value={filters.period} onChange={(e) => set({ period: e.target.value })}>
          <option value="ALL">Any date</option>
          <option value="TODAY">Today</option>
          <option value="7D">Last 7 days</option>
          <option value="30D">Last 30 days</option>
          <option value="CUSTOM">Custom range</option>
        </select>
        {filters.period === 'CUSTOM' && (
          <>
            <label htmlFor={ids.from} className="text-[11px] text-slate-500">From</label>
            <input id={ids.from} type="date" className={selectClass} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
            <label htmlFor={ids.to} className="text-[11px] text-slate-500">To</label>
            <input id={ids.to} type="date" className={selectClass} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </>
        )}
      </div>

      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {entries === null && loading && <p role="status" className="text-xs text-slate-500">Loading history…</p>}
      {entries?.length === 0 && !loading && (
        <p className="text-xs text-slate-500 py-6 text-center">No recorded actions match these filters.</p>
      )}

      {entries && entries.length > 0 && (
        <ol className="space-y-2" aria-label="Lead history">
          {entries.map((entry) => {
            const heading = dayHeading(entry.created_at);
            const showHeading = heading !== lastDay;
            lastDay = heading;
            const failed = entry.action_type === 'OUTREACH_EMAIL_FAILED';
            return (
              <li key={entry.id}>
                {showHeading && <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-3 mb-1">{heading}</h4>}
                <div className={`p-3 rounded-xl border ${failed ? 'border-red-200 bg-red-50/40' : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D]'}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <time dateTime={entry.created_at} className="text-slate-500 tabular-nums">
                      {new Date(entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{entry.actor_name}</span>
                    <span className={failed ? 'text-red-700 font-semibold' : 'text-slate-700 dark:text-slate-300'}>{actionLabel(entry.action_type)}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                    {describeEntry(entry, names).map((line, i) => <li key={i} className="break-words">{line}</li>)}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {entries && page < totalPages && (
        <button type="button" onClick={() => load(page + 1)} disabled={loading}
          className="w-full h-8 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {loading ? 'Loading…' : 'Show older'}
        </button>
      )}
    </div>
  );
}
