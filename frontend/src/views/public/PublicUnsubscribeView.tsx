import React, { useEffect, useRef, useState } from 'react';
import { publicUnsubscribeApi, type UnsubscribeState } from '../../api/public-unsubscribe.api';

/**
 * The page a recipient opens from the unsubscribe link in a sequence email.
 * No sign-in: the link's token is the only key. Opening it changes nothing
 * (link scanners open links too); the button unsubscribes, at once, from all
 * of the company's marketing email.
 */
export const PublicUnsubscribeView: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = useState<UnsubscribeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    // The link carries the token: keep it out of requests to other sites.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    document.title = 'Unsubscribe';
    publicUnsubscribeApi.view(token).then(setState).catch((e: Error) => setError(e.message));
    return () => meta.remove();
  }, [token]);

  const unsubscribe = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      setState(await publicUnsubscribeApi.unsubscribe(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">{state?.unsubscribed ? 'You’re unsubscribed' : 'Unsubscribe'}</h1>
        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!state && !error && <p role="status" className="mt-3 text-sm text-slate-500">Loading…</p>}
        {state && (state.unsubscribed ? (
          <p role="status" className="mt-3 text-sm text-slate-700">{state.email} won’t get any more marketing emails from {state.company}. You can close this page.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-700">Stop all marketing emails from <strong>{state.company}</strong> to {state.email}?</p>
            <button type="button" onClick={unsubscribe} disabled={busy} className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:opacity-50">
              {busy ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
          </>
        ))}
      </div>
    </main>
  );
};
