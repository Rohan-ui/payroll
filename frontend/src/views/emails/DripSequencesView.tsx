import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { sequencesApi, type SequenceOverview, type SequenceStatus, type SequenceSummary } from '../../api/sequences.api';
import { SequenceEditor } from './drip/SequenceEditor';
import { SendingActivity } from './drip/SendingActivity';
import { SuppressionList } from './drip/SuppressionList';
import { cardClass, errorText, primaryButton, secondaryButton, SEQUENCE_STATUS } from './drip/drip-format';

type View = 'sequences' | 'activity' | 'suppression';
const VIEWS: { id: View; label: string }[] = [
  { id: 'sequences', label: 'Sequences' },
  { id: 'activity', label: 'Sending activity' },
  { id: 'suppression', label: 'Do-not-email list' },
];

/**
 * Drip sequences: automatic email sequences for CRM leads. Every number here
 * is counted from what was actually sent and came back; nothing is sample data.
 */
export const DripSequencesView: React.FC = () => {
  const { can } = useAuth();
  const [view, setView] = useState<View>('sequences');
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [overview, setOverview] = useState<SequenceOverview | null>(null);
  const [sequences, setSequences] = useState<SequenceSummary[] | null>(null);
  const [filter, setFilter] = useState<SequenceStatus | 'CURRENT'>('CURRENT');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([sequencesApi.overview(), sequencesApi.list(filter === 'CURRENT' ? undefined : filter)])
      .then(([o, list]) => { setOverview(o); setSequences(list); })
      .catch((e) => setError(errorText(e)));
  }, [filter]);
  const allowed = can('sequences.view');
  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  if (!allowed) {
    return <p className={`${cardClass} p-6 text-sm text-slate-600`}>You don’t have access to drip sequences. Ask an administrator for the “View drip sequences” permission.</p>;
  }
  if (open) {
    return <SequenceEditor sequenceId={open === 'new' ? null : open} overview={overview} onBack={() => { setOpen(null); load(); }} onOpen={setOpen} />;
  }

  const r = overview?.readiness;
  const metrics: { label: string; value: number | undefined; hint?: string; tone?: 'danger' }[] = [
    { label: 'Active sequences', value: overview?.sequences.active, hint: overview ? `${overview.sequences.draft} draft · ${overview.sequences.paused} paused` : undefined },
    { label: 'Leads in a sequence', value: overview?.enrolled },
    { label: 'Scheduled today', value: overview?.scheduledToday },
    { label: 'Emails sent', value: overview?.sent },
    { label: 'Replies', value: overview?.replied },
    { label: 'Bounced', value: overview?.bounced },
    { label: 'Unsubscribed', value: overview?.unsubscribed },
    { label: 'Need attention', value: overview?.needsAttention.total, tone: overview?.needsAttention.total ? 'danger' : undefined, hint: overview?.needsAttention.total ? `${overview.needsAttention.failed} failed · ${overview.needsAttention.uncertain} may not have sent · ${overview.needsAttention.waitingForSender} waiting for a sender` : undefined },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Drip sequences could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {r && (!r.unsubscribeAvailable || (!r.organizationSender && !r.personalAccountsAllowed)) && (
        <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {!r.unsubscribeAvailable && <p>No sequence email can be sent yet: this workspace has no web address for the unsubscribe link every email must carry. Ask your platform administrator to set one up.</p>}
          {!r.organizationSender && !r.personalAccountsAllowed && <p>No account can send yet. {r.organizationProblem ?? 'Set up the organization’s email account in Organization Settings.'}</p>}
        </div>
      )}

      <section aria-label="Drip sequence numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map((m) => (
          <button
            key={m.label}
            type="button"
            disabled={m.label !== 'Need attention' || !m.value}
            onClick={() => setView('activity')}
            className={`${cardClass} p-3 text-left disabled:cursor-default ${m.tone === 'danger' ? 'border-red-200 dark:border-red-900' : ''}`}
          >
            <span className="block text-xs font-semibold text-slate-500">{m.label}</span>
            <span className={`mt-1 block text-xl font-bold tabular-nums ${m.tone === 'danger' ? 'text-red-700' : 'text-slate-900 dark:text-slate-100'}`}>{m.value ?? '—'}</span>
            {m.hint && <span className="mt-0.5 block text-[11px] text-slate-500">{m.hint}</span>}
          </button>
        ))}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Drip sequences" className="inline-flex w-fit rounded-lg bg-slate-100 dark:bg-white/5 p-1 text-sm">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={`rounded-md px-3 py-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${view === v.id ? 'bg-white dark:bg-[#181724] text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              {v.label}
            </button>
          ))}
        </div>
        {view === 'sequences' && can('sequences.manage') && (
          <button type="button" onClick={() => setOpen('new')} className={primaryButton}><Plus className="h-4 w-4" aria-hidden="true" />Create sequence</button>
        )}
      </div>

      {view === 'activity' && <SendingActivity timeZone={overview?.timeZone} onChanged={load} />}
      {view === 'suppression' && <SuppressionList onChanged={load} />}
      {view === 'sequences' && (
        <section className={cardClass} aria-labelledby="drip-sequences-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#2B293E] px-4 py-3">
            <h2 id="drip-sequences-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Sequences</h2>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Show
              <select value={filter} onChange={(e) => setFilter(e.target.value as SequenceStatus | 'CURRENT')} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-[#2B293E] dark:bg-[#1E1D2D]">
                <option value="CURRENT">All but archived</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Drafts</option>
                <option value="PAUSED">Paused</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
          </div>
          {sequences === null ? (
            <div className="h-24 animate-pulse motion-reduce:animate-none bg-slate-50 dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading sequences</span></div>
          ) : sequences.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-semibold text-slate-800 dark:text-slate-200">{filter === 'CURRENT' ? 'No drip sequences yet' : 'No sequences here'}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">A drip sequence sends a series of emails to each lead you add, on a schedule, until they reply or unsubscribe. Create one, add its emails, then activate it.</p>
              {can('sequences.manage') && filter === 'CURRENT' && <button type="button" onClick={() => setOpen('new')} className={`${secondaryButton} mt-4`}>Create your first sequence</button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 dark:bg-white/5 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Sequence</th>
                    <th scope="col" className="px-4 py-2.5">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Emails</th>
                    <th scope="col" className="px-4 py-2.5 text-right">In progress</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Sent</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Replies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {sequences.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setOpen(s.id)} className="text-left font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
                          {s.name}
                        </button>
                        <span className="block text-xs text-slate-500">{s.senderMode === 'LEAD_OWNER' ? 'From each lead owner’s account' : 'From the organization account'}{s.description ? ` · ${s.description}` : ''}</span>
                      </td>
                      <td className="px-4 py-3"><Badge variant={SEQUENCE_STATUS[s.status].variant} size="sm">{SEQUENCE_STATUS[s.status].label}</Badge></td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.steps}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.enrolled}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.sent}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.replied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
