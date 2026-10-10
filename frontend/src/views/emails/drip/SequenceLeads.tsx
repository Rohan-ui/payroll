import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../lib/toast';
import { sequencesApi, type EnrollmentRow, type Page, type SequenceDetail } from '../../../api/sequences.api';
import { cardClass, ENROLLMENT_STATUS, errorText, fieldClass, formatWhen, primaryButton, secondaryButton, SEND_STATUS, smallButton } from './drip-format';

/**
 * The leads in a sequence: where each one is, when its next email goes (or
 * why it is waiting), and why it stopped. Stopping keeps everything already
 * sent; a lead can be moved to Client Outreach at the same time.
 */
export const SequenceLeads: React.FC<{ sequence: SequenceDetail; timeZone?: string; onChanged: () => void }> = ({ sequence, timeZone, onChanged }) => {
  const { can } = useAuth();
  const [status, setStatus] = useState<'ACTIVE' | 'COMPLETED' | 'STOPPED' | ''>('ACTIVE');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Page<EnrollmentRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<EnrollmentRow | null>(null);
  const [moveToOutreach, setMoveToOutreach] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    sequencesApi.enrollments(sequence.id, { status: status || undefined, search: search.trim() || undefined, page, limit: 25 }).then(setRows).catch((e) => setError(errorText(e)));
  }, [sequence.id, status, search, page]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const stop = async () => {
    if (!stopping || busy) return;
    setBusy(true);
    try {
      await sequencesApi.stopEnrollment(stopping.id, moveToOutreach);
      toast.success(moveToOutreach ? 'Stopped and moved to Client Outreach' : 'Stopped: no more emails go to this lead');
      setStopping(null);
      load();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Leads in this sequence">
      <p className="text-sm text-slate-600 dark:text-slate-400">Add leads from a lead’s page (Drip sequences) or from Lead Management (select leads, then Add to drip sequence).</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Show leads" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} className={`${fieldClass} w-auto`}>
          <option value="ACTIVE">In progress</option>
          <option value="COMPLETED">Finished</option>
          <option value="STOPPED">Stopped</option>
          <option value="">All</option>
        </select>
        <input type="search" aria-label="Search leads" placeholder="Search by company, name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${fieldClass} w-auto min-w-[16rem]`} />
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className={cardClass}>
        {rows === null ? <div className="h-24 animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading leads</span></div> : rows.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">{status === 'ACTIVE' && !search ? 'No lead is going through this sequence right now.' : 'No leads match.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 dark:bg-white/5 text-xs uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-4 py-2.5">Lead</th><th scope="col" className="px-4 py-2.5">Status</th><th scope="col" className="px-4 py-2.5 text-right">Sent</th><th scope="col" className="px-4 py-2.5">Next email</th><th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {rows.items.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3"><span className="font-semibold">{e.lead.company}</span><span className="block text-xs text-slate-500">{[e.lead.name, e.lead.email].filter(Boolean).join(' · ')}</span></td>
                    <td className="px-4 py-3">
                      <Badge variant={ENROLLMENT_STATUS[e.status].variant} size="sm">{ENROLLMENT_STATUS[e.status].label}</Badge>
                      {e.replied && <span className="ml-1 text-xs text-teal-700">Replied</span>}
                      {e.stopReasonText && <span className="block text-xs text-slate-500">{e.stopReasonText}{e.stopDetail ? `: ${e.stopDetail}` : ''}</span>}
                      <span className="block text-[11px] text-slate-400">Added {formatWhen(e.enrolledAt, timeZone)}{e.enrolledVia === 'RULE' ? ' by a rule' : ''}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.sent}</td>
                    <td className="px-4 py-3 text-xs">
                      {e.next ? (
                        <>
                          <span className="font-semibold">{e.next.step}</span>
                          <span className="block">{e.next.status === 'SCHEDULED' ? formatWhen(e.next.at, timeZone) : <Badge variant={SEND_STATUS[e.next.status].variant} size="sm">{SEND_STATUS[e.next.status].label}</Badge>}</span>
                          {e.next.problem && <span className="block text-amber-800">{e.next.problem}</span>}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.status === 'ACTIVE' && can('sequences.enroll') && <button type="button" onClick={() => { setStopping(e); setMoveToOutreach(false); }} className={smallButton}>Stop</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && rows.total > rows.limit && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#2B293E] px-4 py-2 text-xs text-slate-500">
            <span>{(rows.page - 1) * rows.limit + 1}–{Math.min(rows.total, rows.page * rows.limit)} of {rows.total}</span>
            <span className="flex gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={smallButton}>Previous</button>
              <button type="button" disabled={rows.page * rows.limit >= rows.total} onClick={() => setPage((p) => p + 1)} className={smallButton}>Next</button>
            </span>
          </div>
        )}
      </div>

      {stopping && (
        <Dialog
          title={`Stop emails to ${stopping.lead.company}?`}
          description="Emails not sent yet are cancelled. Emails already sent stay on record."
          onClose={() => setStopping(null)}
          size="sm"
          footer={<><button type="button" onClick={() => setStopping(null)} className={secondaryButton}>Keep going</button><button type="button" disabled={busy} onClick={stop} className={primaryButton}>{busy ? 'Stopping…' : 'Stop emails'}</button></>}
        >
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={moveToOutreach} onChange={(e) => setMoveToOutreach(e.target.checked)} />
            <span>Move the lead to Client Outreach<span className="block text-xs text-slate-500">It starts the outreach playbook (calls, WhatsApp, LinkedIn and emails done by your team).</span></span>
          </label>
        </Dialog>
      )}
    </section>
  );
};
