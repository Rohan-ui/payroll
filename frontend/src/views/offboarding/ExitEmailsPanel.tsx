import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { offboardingApi, NOTIFICATION_EVENTS, type ExitNotification } from '../../api/offboarding.api';
import { cardClass, errorText } from '../payroll/payroll-format';

const STATUS: Record<ExitNotification['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  SENT: { label: 'Sent', variant: 'success' },
  SENDING: { label: 'Sending', variant: 'neutral' },
  FAILED: { label: 'Failed', variant: 'danger' },
  NOT_SENT: { label: 'Not sent', variant: 'warning' },
};

/** The emails this exit has sent, to whom, and why any didn't go out. */
export const ExitEmailsPanel: React.FC<{ separationId: string; refreshKey?: unknown }> = ({ separationId, refreshKey }) => {
  const [rows, setRows] = useState<ExitNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    offboardingApi.notifications(separationId).then(setRows).catch((e) => setError(errorText(e)));
  }, [separationId]);
  useEffect(load, [load, refreshKey]);

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="exit-emails-heading">
      <h3 id="exit-emails-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Emails</h3>
      <p className="mt-1 text-xs text-slate-500">Sent automatically as the exit moves on. One that didn’t go out is tried again the next time its event happens.</p>
      {error && (
        <p role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>The emails could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </p>
      )}
      {!rows && !error && <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading emails</span></div>}
      {rows && rows.length === 0 && <p className="mt-3 text-sm text-slate-500">No emails yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
          {rows.map((n) => (
            <li key={n.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-200">{NOTIFICATION_EVENTS[n.event] ?? n.event} <span className="break-all text-slate-500">→ {n.recipient}</span></p>
                <p className="text-xs text-slate-500">
                  {new Date(n.sentAt ?? n.updatedAt).toLocaleString()}{n.attempts > 1 ? ` · tried ${n.attempts} times` : ''}
                </p>
                {n.error && <p className="break-words text-xs text-amber-800 dark:text-amber-300">{n.error}</p>}
              </div>
              <Badge size="sm" variant={STATUS[n.status].variant}>{STATUS[n.status].label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
