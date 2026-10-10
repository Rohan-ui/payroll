import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { externalApiClient } from '../../api/external-api.api';

/**
 * Opening the attendance page, or an employee's attendance, brings the month
 * from COSEC first: the page shows what we have at once, asks the server to
 * refresh the month from COSEC, and reloads only when a day changed.
 * Workspaces without COSEC see nothing.
 */

export type CosecRefreshState =
  | { kind: 'idle' }
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'done'; syncedAt: string; changed: number; matched: boolean; unmatchedUsers: number }
  | { kind: 'failed'; message: string };

/**
 * Refreshes attendance from COSEC for one employee's month, or, with
 * `employeeId` set to 'ALL', for everyone's month (the attendance page).
 * Nothing happens while `employeeId` is empty.
 */
export function useCosecRefresh(employeeId: string | null | undefined, month: string, onChanged: () => void): CosecRefreshState {
  const [state, setState] = useState<CosecRefreshState>({ kind: 'idle' });
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    if (!employeeId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    let live = true;
    setState({ kind: 'syncing' });
    (employeeId === 'ALL' ? externalApiClient.refreshMonth(month) : externalApiClient.refreshEmployee(employeeId, month))
      .then((result) => {
        if (!live) return;
        if (result.status === 'NOT_CONFIGURED') return setState({ kind: 'off' });
        setState({ kind: 'done', syncedAt: result.syncedAt, changed: result.changedRecords, matched: result.matched !== false, unmatchedUsers: result.unmatchedUsers ?? 0 });
        if (result.changedRecords > 0) onChangedRef.current();
      })
      .catch((error: unknown) => {
        if (live) setState({ kind: 'failed', message: error instanceof Error ? error.message : 'COSEC could not be reached.' });
      });
    return () => { live = false; };
  }, [employeeId, month]);

  return state;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** One line saying whether the attendance shown is up to date with COSEC. */
export const CosecRefreshNote: React.FC<{ state: CosecRefreshState }> = ({ state }) => {
  if (state.kind === 'idle' || state.kind === 'off') return null;
  const base = 'flex items-center gap-1.5 text-xs';
  if (state.kind === 'syncing') {
    return (
      <p role="status" className={`${base} text-slate-500`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Fetching the latest punches from COSEC…
      </p>
    );
  }
  if (state.kind === 'failed') {
    return (
      <p role="status" className={`${base} text-amber-700 dark:text-amber-300`}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {state.message} Showing the attendance last synced.
      </p>
    );
  }
  if (!state.matched) {
    return (
      <p role="status" className={`${base} text-amber-700 dark:text-amber-300`}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> COSEC has no user with this Employee Code, so no punches were fetched.
      </p>
    );
  }
  return (
    <p role="status" className={`${base} text-slate-500`}>
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
      Up to date with COSEC · checked {time(state.syncedAt)}
      {state.changed > 0 ? ` · ${state.changed} day${state.changed === 1 ? '' : 's'} updated` : ''}
      {state.unmatchedUsers > 0 ? ` · ${state.unmatchedUsers} COSEC user${state.unmatchedUsers === 1 ? ' has' : 's have'} no matching Employee Code` : ''}
    </p>
  );
};
