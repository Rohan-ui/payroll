import React, { useEffect, useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { externalApiClient, type CosecSyncStatus } from '../../api/external-api.api';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'That did not work.');

/**
 * The every-minute COSEC sync: on or off, and how its last run went. Runs are
 * made by the cosec-sync worker process, so a warning shows when it has not
 * run for a while (the worker is not running).
 */
export const CosecAutoSyncCard: React.FC = () => {
  const ids = useId();
  const [status, setStatus] = useState<CosecSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      externalApiClient
        .getSyncStatus()
        .then((s) => { if (live) { setStatus(s); setError(null); } })
        .catch((e) => { if (live) setError(errorText(e)); });
    load();
    // The status follows the worker's runs while the page is open.
    const timer = setInterval(load, 30_000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  const toggle = async () => {
    if (!status || saving) return;
    setSaving(true);
    setError(null);
    try {
      setStatus(await externalApiClient.setAutoSync(!status.autoSyncEnabled));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (!status && !error) {
    return <Card><div className="h-16 rounded-lg bg-slate-100 animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading sync status</span></div></Card>;
  }

  return (
    <Card>
      <section aria-labelledby={`${ids}-title`} className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id={`${ids}-title`} className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-teal-600" aria-hidden="true" /> Automatic sync
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Every minute, today’s and yesterday’s punches are brought from COSEC; only days that changed are updated. Days locked by payroll or corrected in attendance are never overwritten. Opening an employee’s attendance also fetches their month.
            </p>
          </div>
          {status && (
            <button
              type="button"
              role="switch"
              aria-checked={status.autoSyncEnabled}
              aria-labelledby={`${ids}-title`}
              disabled={saving}
              onClick={toggle}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 ${status.autoSyncEnabled ? 'bg-teal-600' : 'bg-slate-300'}`}
            >
              <span className="sr-only">{status.autoSyncEnabled ? 'On' : 'Off'}</span>
              <span aria-hidden="true" className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${status.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          )}
        </div>

        {error && <p role="alert" className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">{error}</p>}

        {status && !status.configured && <p className="text-xs text-slate-500">Save the COSEC connection above to start syncing.</p>}

        {status?.configured && !status.autoSyncEnabled && (
          <p className="text-xs text-slate-600">Automatic sync is off. Attendance is still fetched when an employee’s attendance is opened, and with the sync buttons below.</p>
        )}

        {status?.configured && status.autoSyncEnabled && (
          <>
            {status.workerSilent && (
              <p role="alert" className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>No sync has run for over 5 minutes (last: {when(status.lastFinishedAt ?? status.lastStartedAt)}). The COSEC sync worker is not running: start it on the server with <code className="font-mono">npm run start:cosec-sync:prod</code>.</span>
              </p>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border border-slate-200">
                <dt className="text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> Last sync</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">{when(status.lastFinishedAt)}</dd>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200">
                <dt className="text-slate-500">Result</dt>
                <dd className="font-semibold mt-0.5">
                  {status.lastStatus === 'FAILED' ? (
                    <span className="text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Failed</span>
                  ) : status.lastStatus === 'SUCCEEDED' ? (
                    <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {status.lastChangedRecords} day{status.lastChangedRecords === 1 ? '' : 's'} updated</span>
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Waiting for the first sync</span>
                  )}
                </dd>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200">
                <dt className="text-slate-500">COSEC users without an employee</dt>
                <dd className={`font-semibold mt-0.5 ${status.lastUnmatchedUsers ? 'text-amber-700' : 'text-slate-800'}`}>{status.lastUnmatchedUsers}</dd>
              </div>
            </dl>
            {status.lastStatus === 'FAILED' && status.lastError && <p className="text-xs text-red-700 break-words">{status.lastError}</p>}
            {status.lastUnmatchedUsers > 0 && (
              <p className="text-xs text-slate-500">Punches of COSEC users whose User ID matches no Employee Code are skipped. Give those employees the same code as in COSEC.</p>
            )}
          </>
        )}
      </section>
    </Card>
  );
};
