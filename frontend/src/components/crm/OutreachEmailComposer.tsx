import React, { useEffect, useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Mail, RotateCcw, Send } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

/** A touchpoint's email as the server saved it on the lead's cadence. */
export interface OutreachEmailAction {
  status: 'SENDING' | 'SENT' | 'FAILED';
  attempt: number;
  executedBy: { memberId: string; name: string };
  startedAt: string;
  sentAt?: string;
  failedAt?: string;
  from?: { name: string | null; email: string };
  to?: string;
  subject?: string;
}

export interface OutreachEmailSent {
  sent: true;
  email: OutreachEmailAction & { status: 'SENT'; sentAt: string };
  /** The day's channel actions after the send, as saved. */
  channelActions: Record<string, OutreachEmailAction>;
  from: { name: string | null; email: string };
  to: string;
  touchpoint: { day: number; title: string; status: 'IN_PROGRESS' | 'COMPLETED' };
  attempt: number;
  touchpointCompleted: boolean;
  message: string;
}

interface Sender {
  configured: boolean;
  name: string | null;
  email: string | null;
  replyTo: string | null;
}

interface Props {
  leadId: string;
  recipient: string | null;
  touchpoint: { day: number; title: string; channels: string[] };
  /** The touchpoint's template, filled in for this lead. */
  subject: string;
  body: string;
  /** This touchpoint's email as saved on the lead (from the server), if anything was done yet. */
  saved?: OutreachEmailAction | null;
  /** Other messages of the day still to send: the day can't be completed with this email alone. */
  othersLeft?: string[];
  onSent: (result: OutreachEmailSent) => void;
}

const quiet = { feedback: { success: false, error: false } } as RequestInit;
const fieldClass = 'w-full px-3 py-2 rounded-lg border border-purple-100 bg-white text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400';
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
/** A send claimed this long ago without an outcome was interrupted, as the server treats it. */
const SENDING_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * A lead's touchpoint email. It always goes out from the workspace's
 * organization email (shown, never editable), under the sending member's
 * name; the member is recorded as the one who executed it. Whether it was sent is what the server
 * saved on the lead, so it reads the same after a reload or when reopened;
 * once sent, it can only be sent again through an explicit Resend.
 */
export function OutreachEmailComposer({ leadId, recipient, touchpoint, subject: templateSubject, body: templateBody, saved = null, othersLeft = [], onSent }: Props) {
  const ids = { subject: useId(), body: useId(), complete: useId() };
  const { user } = useAuth();
  const [sender, setSender] = useState<Sender | null>(null);
  const [senderError, setSenderError] = useState<string | null>(null);
  const [subject, setSubject] = useState(templateSubject);
  const [body, setBody] = useState(templateBody);
  const [complete, setComplete] = useState(touchpoint.channels.length === 1 && touchpoint.channels[0] === 'EMAIL');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<OutreachEmailAction | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let live = true;
    apiClient.get<{ data: Sender }>('/crm/cadence/email-sender', quiet)
      .then((res) => live && setSender(res.data))
      .catch(() => live && setSenderError('The organization sender could not be loaded. Close this window and try again.'));
    return () => { live = false; };
  }, []);

  // What the server saved, the newest of what this window sent and what was loaded.
  const state = latest ?? saved;
  const sent = state?.status === 'SENT' ? state : null;
  const inFlight = state?.status === 'SENDING' && Date.now() - Date.parse(state.startedAt) < SENDING_TIMEOUT_MS ? state : null;
  const lastFailure = state?.status === 'FAILED' ? state : null;
  const showForm = (!sent || resending) && !inFlight;
  const canSend = Boolean(recipient && sender?.configured && subject.trim() && body.trim()) && !sending;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await apiClient.post<{ data: OutreachEmailSent }>(
        '/crm/cadence/email',
        { leadId, subject, body, completeTouchpoint: complete && othersLeft.length === 0, ...(sent ? { resend: true } : {}) },
        quiet,
      );
      setLatest(res.data.email);
      setResending(false);
      onSent(res.data);
    } catch (err) {
      // Nothing was marked as sent; the server's message says why and what to do.
      setError(err instanceof Error && err.message ? err.message : 'The email could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  // The server sends under the member's own name, at the organization's address.
  const fromName = user?.displayName || sender?.name;
  const fromLabel = sender?.email ? (fromName ? `${fromName} <${sender.email}>` : sender.email) : '';

  return (
    <div className="border border-purple-200 bg-purple-50/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-purple-900 text-sm">
          <Mail className="w-4 h-4 text-purple-600" aria-hidden="true" />
          <span>Email — Day {touchpoint.day}</span>
        </div>
        {sent && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Sent
          </span>
        )}
      </div>

      {sent && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Email sent</p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5">
            <dt className="font-semibold">Sent at</dt><dd>{when(sent.sentAt)}</dd>
            <dt className="font-semibold">Executed by</dt><dd>{sent.executedBy.name}</dd>
            {sent.from && <><dt className="font-semibold">From</dt><dd className="break-all">{sent.from.name ? `${sent.from.name} <${sent.from.email}>` : sent.from.email}</dd></>}
            {sent.to && <><dt className="font-semibold">To</dt><dd className="break-all">{sent.to}</dd></>}
            {sent.subject && <><dt className="font-semibold">Subject</dt><dd className="break-words">{sent.subject}</dd></>}
          </dl>
          {!resending && (
            <button type="button" onClick={() => { setResending(true); setError(null); }}
              className="mt-1 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
              <RotateCcw className="w-3 h-3" aria-hidden="true" /> Resend email
            </button>
          )}
        </div>
      )}

      {inFlight && (
        <p role="status" className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {`Being sent by ${inFlight.executedBy.name}. Reload in a moment to see the result.`}
        </p>
      )}

      {lastFailure && !error && (
        <p role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {`The last attempt (${when(lastFailure.failedAt)}, by ${lastFailure.executedBy.name}) failed. The email has not been marked as sent.`}
        </p>
      )}

      {showForm && (
        <>
          {resending && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {`This sends the email to ${recipient} again. The first send stays on record.`}
            </p>
          )}
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="font-semibold text-slate-500">To</dt>
            <dd className="text-slate-800 break-all">{recipient || 'This lead has no email address.'}</dd>
            <dt className="font-semibold text-slate-500">From</dt>
            <dd className="text-slate-800 break-all" data-testid="outreach-email-from">
              {sender === null && !senderError ? 'Loading…' : sender?.configured ? fromLabel : '—'}
            </dd>
            {sender?.replyTo && (
              <>
                <dt className="font-semibold text-slate-500">Reply-To</dt>
                <dd className="text-slate-800 break-all">{sender.replyTo}</dd>
              </>
            )}
            <dt className="font-semibold text-slate-500">Executed by</dt>
            <dd className="text-slate-800">{user?.displayName || user?.email || 'You'}</dd>
          </dl>
          {sender?.configured && <p className="text-[11px] text-slate-500">Sent on behalf of your organization. The sender can only be changed by an administrator in Organization &amp; Settings.</p>}
          {sender && !sender.configured && (
            <p role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Organization email is not configured. Please contact your workspace administrator to configure the organization&apos;s email settings.
            </p>
          )}
          {senderError && <p role="alert" className="text-xs text-red-700">{senderError}</p>}

          <div>
            <label htmlFor={ids.subject} className="block text-[11px] font-semibold text-slate-600 mb-1">Subject</label>
            <input id={ids.subject} className={fieldClass} value={subject} maxLength={300} disabled={sending} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label htmlFor={ids.body} className="block text-[11px] font-semibold text-slate-600 mb-1">Message</label>
            <textarea id={ids.body} className={`${fieldClass} min-h-[160px] leading-relaxed`} value={body} maxLength={20000} disabled={sending} onChange={(e) => setBody(e.target.value)} />
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span><strong>Email failed to send. The email has not been marked as sent.</strong> {error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {othersLeft.length === 0 ? (
              <label htmlFor={ids.complete} className="flex items-center gap-2 text-xs text-slate-700">
                <input id={ids.complete} type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} className="accent-purple-600" />
                {`Mark Day ${touchpoint.day} complete after sending`}
              </label>
            ) : (
              <p className="text-[11px] text-slate-500">Day {touchpoint.day} can be completed once the {othersLeft.join(' and ')} message{othersLeft.length === 1 ? ' is' : 's are'} done too.</p>
            )}
            <div className="flex items-center gap-2">
              {resending && (
                <button type="button" onClick={() => setResending(false)} disabled={sending}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                <Send className="w-3 h-3" aria-hidden="true" />
                <span>{sending ? 'Sending…' : resending ? 'Send again' : 'Send email'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
