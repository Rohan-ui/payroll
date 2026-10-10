import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../lib/toast';
import { sequencesApi, type Page, type SendRow } from '../../../api/sequences.api';
import { cardClass, errorText, fieldClass, formatWhen, secondaryButton, SEND_STATUS, smallButton } from './drip-format';

const FILTERS: { value: string; label: string }[] = [
  { value: 'ATTENTION', label: 'Needs attention' },
  { value: '', label: 'All emails' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'SENT', label: 'Sent' },
  { value: 'REPLIED', label: 'Replied' },
  { value: 'BOUNCED', label: 'Bounced' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/**
 * Every sequence email, newest first: what went, to whom, from which account,
 * and what came back. Emails that failed, may not have gone, or are waiting for
 * a sender are put right here: sent again, or confirmed as sent.
 */
export const SendingActivity: React.FC<{ timeZone?: string; sequenceId?: string; onChanged?: () => void }> = ({ timeZone, sequenceId, onChanged }) => {
  const { can } = useAuth();
  const [status, setStatus] = useState('ATTENTION');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Page<SendRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SendRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    sequencesApi.sends({ status: status || undefined, sequenceId, page, limit: 25 }).then(setRows).catch((e) => setError(errorText(e)));
  }, [status, sequenceId, page]);
  useEffect(load, [load]);

  const act = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.success(message);
      setOpen(null);
      load();
      onChanged?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Sending activity">
      <select aria-label="Show emails" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${fieldClass} w-auto`}>
        {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className={cardClass}>
        {rows === null ? <div className="h-24 animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading emails</span></div> : rows.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">{status === 'ATTENTION' ? 'Nothing needs attention: every email is sent, scheduled or ended normally.' : 'No emails here yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 dark:bg-white/5 text-xs uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-4 py-2.5">Email</th><th scope="col" className="px-4 py-2.5">To</th><th scope="col" className="px-4 py-2.5">Status</th><th scope="col" className="px-4 py-2.5">When</th><th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {rows.items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3"><span className="font-semibold">{s.subject ?? s.step}</span><span className="block text-xs text-slate-500">{s.sequence.name} · {s.step}</span></td>
                    <td className="px-4 py-3"><span>{s.lead.company}</span><span className="block text-xs text-slate-500">{s.recipient}</span></td>
                    <td className="px-4 py-3">
                      <Badge variant={SEND_STATUS[s.status].variant} size="sm">{s.status === 'SCHEDULED' && s.problemCode ? 'Waiting' : SEND_STATUS[s.status].label}</Badge>
                      {s.repliedAt && <span className="ml-1 text-xs font-semibold text-teal-700">Replied</span>}
                      {s.problem && <span className="block max-w-xs text-xs text-amber-800">{s.problem}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">{formatWhen(s.sentAt ?? s.scheduledAt, timeZone)}{s.sender && <span className="block text-slate-500">from {s.sender}</span>}</td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => setOpen(s)} className={smallButton}>Details</button></td>
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

      {open && (
        <Dialog
          title={open.subject ?? open.step}
          description={`${open.sequence.name} · ${open.step} · to ${open.recipient}`}
          onClose={() => setOpen(null)}
          size="lg"
          footer={<>
            <button type="button" onClick={() => setOpen(null)} className={secondaryButton}>Close</button>
            {can('sequences.manage') && open.status === 'UNCERTAIN' && <button type="button" disabled={busy} onClick={() => act(() => sequencesApi.markSent(open.id), 'Marked as sent: the lead moves on')} className={secondaryButton}>It was sent</button>}
            {can('sequences.manage') && (open.status === 'FAILED' || open.status === 'UNCERTAIN') && <button type="button" disabled={busy} onClick={() => act(() => sequencesApi.retrySend(open.id), 'Scheduled to send again')} className={secondaryButton}>{open.status === 'UNCERTAIN' ? 'It wasn’t sent: send again' : 'Send again'}</button>}
          </>}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Status</dt><dd>{SEND_STATUS[open.status].label}{open.attempts > 1 ? ` (after ${open.attempts} tries)` : ''}</dd>
            <dt className="text-slate-500">From</dt><dd>{open.sender ?? 'Not chosen yet'}</dd>
            <dt className="text-slate-500">Scheduled</dt><dd>{formatWhen(open.scheduledAt, timeZone)}</dd>
            {open.sentAt && <><dt className="text-slate-500">Sent</dt><dd>{formatWhen(open.sentAt, timeZone)}</dd></>}
            {open.problem && <><dt className="text-slate-500">Problem</dt><dd className="text-amber-800">{open.problem}</dd></>}
            {open.cancelReason && <><dt className="text-slate-500">Cancelled</dt><dd>{open.cancelReason.replace(/_/g, ' ').toLowerCase()}</dd></>}
          </dl>
          {open.status === 'UNCERTAIN' && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">The connection broke while the email was being handed to the mail server, so it may have gone. Look for it in {open.sender ?? 'the sender'}’s Sent folder, then choose. It is never sent again by itself.</p>}
          {open.events.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold">What came back</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {open.events.map((e, i) => (
                  <li key={i}>{e.kind === 'REPLY' ? 'Reply' : e.kind === 'AUTO_REPLY' ? 'Automatic reply (did not stop the sequence)' : `${e.bounceKind === 'HARD' ? 'Hard' : 'Soft'} bounce`} from {e.from ?? 'unknown'} · {formatWhen(e.at, timeZone)}{e.subject ? ` · “${e.subject}”` : ''}{e.detail ? ` · ${e.detail}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          {open.body !== null ? <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700 dark:bg-white/5 dark:text-slate-300">{open.body}</pre>
            : open.sentAt ? <p className="mt-3 text-xs text-slate-500">You don’t have permission to read sent emails.</p> : null}
        </Dialog>
      )}
    </section>
  );
};
