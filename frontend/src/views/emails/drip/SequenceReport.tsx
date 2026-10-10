import React, { useCallback, useEffect, useState } from 'react';
import { sequencesApi, type SequenceReport as Report } from '../../../api/sequences.api';
import { cardClass, errorText, fieldClass, labelClass } from './drip-format';

const STOP_LABELS: Record<string, string> = {
  REPLIED: 'Replied', BOUNCED: 'Bounced', UNSUBSCRIBED: 'Unsubscribed', SUPPRESSED: 'On the do-not-email list', WON: 'Won', LOST: 'Lost',
  STOP_STAGE: 'Entered a stop stage', MANUAL: 'Stopped by a person', SEQUENCE_ARCHIVED: 'Sequence archived', MOVED_TO_OUTREACH: 'Moved to Client Outreach', NO_EMAIL: 'No valid email',
};

/**
 * What a sequence did, from its records only: no open or click rates (they
 * aren't tracked). Emails count by when they were sent, replies by when they
 * came, and the reply rate is replies over emails sent.
 */
export const SequenceReport: React.FC<{ sequenceId: string }> = ({ sequenceId }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    // Dates are whole days: from the start of `from` to the end of `to`.
    const end = to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined;
    sequencesApi.report(sequenceId, from ? new Date(`${from}T00:00:00`).toISOString() : undefined, end).then(setReport).catch((e) => setError(errorText(e)));
  }, [sequenceId, from, to]);
  useEffect(load, [load]);

  const totals = report?.totals;
  const cells: [string, number | string | undefined][] = [
    ['Leads added', report?.enrollments.enrolled], ['In progress', report?.enrollments.inProgress], ['Finished', report?.enrollments.completed], ['Stopped', report?.enrollments.stopped],
    ['Emails sent', totals?.sent], ['Replies', totals?.replied], ['Reply rate', totals ? (totals.replyRate === null ? '—' : `${totals.replyRate}%`) : undefined], ['Bounced', totals?.bounced],
    ['Unsubscribed', totals?.unsubscribed], ['Failed', totals?.failed], ['Scheduled', totals?.scheduled],
  ];

  return (
    <section className="space-y-3" aria-label="Report">
      <div className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="report-from" className={labelClass}>From</label><input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} /></div>
        <div><label htmlFor="report-to" className={labelClass}>To</label><input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} /></div>
        <p className="text-xs text-slate-500">Reply rate is replies divided by emails sent. Opens and clicks aren’t tracked.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {cells.map(([label, value]) => (
          <div key={label} className={`${cardClass} p-3`}><span className="block text-xs text-slate-500">{label}</span><span className="mt-1 block text-lg font-bold tabular-nums">{value ?? '—'}</span></div>
        ))}
      </div>
      {report && Object.keys(report.enrollments.stoppedBy).length > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-400">Why leads stopped: {Object.entries(report.enrollments.stoppedBy).map(([k, v]) => `${STOP_LABELS[k] ?? k} ${v}`).join(' · ')}</p>
      )}
      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Each email of the sequence</caption>
          <thead className="bg-slate-50 dark:bg-white/5 text-xs uppercase tracking-wide text-slate-500">
            <tr>{['Email', 'Scheduled', 'Sent', 'Replies', 'Reply rate', 'Bounced', 'Failed', 'Cancelled'].map((h, i) => <th key={h} scope="col" className={`px-4 py-2.5 ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {report?.steps.map((s) => (
              <tr key={s.stepId}>
                <td className="px-4 py-2.5"><span className="font-semibold">{s.order}. {s.name}</span>{s.removed && <span className="ml-1 text-xs text-slate-500">(removed)</span>}{!s.enabled && !s.removed && <span className="ml-1 text-xs text-slate-500">(off)</span>}</td>
                {[s.scheduled, s.sent, s.replied, s.replyRate === null ? '—' : `${s.replyRate}%`, s.bounced, s.failed + s.uncertain, s.cancelled].map((v, i) => <td key={i} className="px-4 py-2.5 text-right tabular-nums">{v}</td>)}
              </tr>
            ))}
            {report && report.steps.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No emails yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
};
