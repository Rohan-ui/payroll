import React, { useId, useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, Globe, MessageSquare, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../api/client';
import {
  COPY_FAILED, LINKEDIN_INVALID, LINKEDIN_MISSING, copyText, displayUrl, normalizeLinkedInUrl, whatsAppChatUrl, whatsAppDigits,
} from '../../lib/outreachChannels';

/**
 * Client Outreach touchpoints sent by hand: the CRM opens the lead's WhatsApp
 * chat or LinkedIn page with the message ready, and the member sends it there.
 * The message shown is the one string that is copied and put in the WhatsApp
 * link, unchanged. Opening and copying are recorded as such; the message is
 * recorded as sent (and tracked like an outreach email) only when the member
 * confirms sending it, and it says so.
 */

export interface ManualChannelAction {
  status: 'OPENED' | 'COPIED' | 'SENT' | string;
  executedBy?: { name: string };
  openedAt?: string;
  copiedAt?: string;
  sentAt?: string;
  attempt?: number;
  /** USER: the member confirmed sending it; the CRM did not send it. */
  confirmation?: 'USER';
  message?: string;
  to?: string;
  destination?: 'CONVERSATION' | 'PROFILE' | 'PAGE';
}
export interface ChannelRecorded {
  channel: 'WHATSAPP' | 'LINKEDIN';
  action: 'OPENED' | 'MESSAGE_COPIED' | 'MARKED_SENT';
  channelActions: Record<string, unknown>;
  state: ManualChannelAction;
  touchpointCompleted: boolean;
  message: string;
}
type Channel = 'WHATSAPP' | 'LINKEDIN';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const button = 'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

/**
 * Records an opened chat, a copied message or (MARKED_SENT) a message the
 * member sent, on the touchpoint; the server reads the lead's own number or address.
 */
async function recordChannel(
  leadId: string, channel: Channel, action: ChannelRecorded['action'], extra: { message?: string; resend?: boolean; completeTouchpoint?: boolean } = {},
): Promise<{ data: ChannelRecorded } | { error: string }> {
  try {
    const res = await apiFetch('/api/v1/crm/cadence/channel-action', {
      feedback: { success: false },
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, channel, action, ...extra }),
    });
    const json = await res.json().catch(() => null);
    return res.ok && json?.success ? { data: json.data as ChannelRecorded } : { error: json?.message ?? 'That could not be recorded. Try again.' };
  } catch {
    // Reported by the API client.
    return { error: 'That could not be recorded. Try again.' };
  }
}
const recorded = (result: { data: ChannelRecorded } | { error: string }) => ('data' in result ? result.data : null);

/**
 * Confirming the message was sent by hand: then it is tracked like an email
 * (sent, when, by whom, to whom, which attempt), and the day can be completed.
 */
const MarkSent: React.FC<{
  leadId: string;
  channel: Channel;
  day: number;
  message: string;
  saved: ManualChannelAction | null;
  tone: 'emerald' | 'blue';
  onRecorded: (result: ChannelRecorded) => void;
}> = ({ leadId, channel, day, message, saved, tone, onRecorded }) => {
  const ids = useId();
  const name = channel === 'WHATSAPP' ? 'WhatsApp' : 'LinkedIn';
  const [sent, setSent] = useState<ManualChannelAction | null>(saved?.status === 'SENT' ? saved : null);
  const [again, setAgain] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await recordChannel(leadId, channel, 'MARKED_SENT', { message, completeTouchpoint: complete, ...(sent ? { resend: true } : {}) });
    setBusy(false);
    if ('error' in result) return setError(result.error);
    setSent(result.data.state);
    setAgain(false);
    onRecorded(result.data);
  };
  const accent = tone === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500' : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500';

  return (
    <div className="space-y-2 pt-2 border-t border-slate-200/70">
      {sent && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {name} message sent</p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5">
            <dt className="font-semibold">Sent at</dt><dd>{when(sent.sentAt)}</dd>
            <dt className="font-semibold">Marked sent by</dt><dd>{sent.executedBy?.name ?? 'A team member'}</dd>
            {sent.to && <><dt className="font-semibold">To</dt><dd className="break-all">{channel === 'LINKEDIN' ? displayUrl(sent.to) : sent.to}</dd></>}
            {sent.attempt && sent.attempt > 1 && <><dt className="font-semibold">Attempt</dt><dd>{sent.attempt}</dd></>}
          </dl>
          <p className="text-[11px] text-emerald-800">Sent by hand in {name} and confirmed here; the CRM did not send it.</p>
          {!again && (
            <button type="button" onClick={() => { setAgain(true); setError(null); }} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
              <RotateCcw className="w-3 h-3" aria-hidden="true" /> Mark sent again
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-[11px] font-semibold text-rose-700">{error}</p>}
      {(!sent || again) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${ids}-complete`} className="flex items-center gap-2 text-[11px] text-slate-700">
            <input id={`${ids}-complete`} type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
            {`Mark Day ${day} complete too`}
          </label>
          <div className="flex items-center gap-2">
            {again && <button type="button" onClick={() => setAgain(false)} className={`${button} bg-white border border-slate-200 text-slate-700 focus-visible:ring-slate-400`}>Cancel</button>}
            <button type="button" disabled={busy || !message} onClick={confirm} className={`${button} ${accent} text-white font-bold disabled:opacity-50`}>
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              <span>{busy ? 'Recording…' : again ? 'Record another send' : 'I’ve sent it'}</span>
            </button>
          </div>
          <p className="w-full text-[11px] text-slate-500">After sending the message in {name}, record it here: it is then tracked like an email.</p>
        </div>
      )}
    </div>
  );
};

/** Copies the message exactly, saying whether it worked. */
function useCopy() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async (text: string) => {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    return ok;
  };
  return { state, copy };
}

const CopyStatus: React.FC<{ state: 'idle' | 'copied' | 'failed' }> = ({ state }) =>
  state === 'copied' ? (
    <p role="status" className="text-[11px] font-semibold text-emerald-700">Message copied.</p>
  ) : state === 'failed' ? (
    <p role="alert" className="text-[11px] font-semibold text-rose-700">{COPY_FAILED}</p>
  ) : null;

const MessageBox: React.FC<{ id: string; label: string; message: string; tone: 'emerald' | 'blue' }> = ({ id, label, message, tone }) => (
  <div>
    <p id={id} className="sr-only">{label}</p>
    <div aria-labelledby={id} className={`bg-white p-3 rounded-lg border ${tone === 'emerald' ? 'border-emerald-100' : 'border-blue-100'} font-sans text-xs text-slate-800 whitespace-pre-wrap break-words leading-relaxed shadow-2xs select-text`}>
      {message}
    </div>
  </div>
);

/** WhatsApp: opens the lead's chat with the message filled in. */
export const OutreachWhatsAppPanel: React.FC<{
  leadId: string;
  day: number;
  phone: string | null;
  message: string;
  saved: ManualChannelAction | null;
  /** The existing WhatsApp Cloud API send, when offered. */
  apiSend?: React.ReactNode;
  onRecorded: (result: ChannelRecorded) => void;
}> = ({ leadId, day, phone, message, saved, apiSend, onRecorded }) => {
  const ids = useId();
  const target = whatsAppDigits(phone);
  const url = 'digits' in target ? whatsAppChatUrl(target.digits, message) : null;
  const { state: copied, copy } = useCopy();
  const [opened, setOpened] = useState(false);

  return (
    <section aria-labelledby={`${ids}-title`} className="border border-emerald-200 bg-emerald-50/20 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
          <MessageSquare className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          <h3 id={`${ids}-title`}>WhatsApp message</h3>
          <span className="text-[10px] font-normal text-slate-500">({phone || 'No phone provided'})</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => copy(message)} className={`${button} bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 focus-visible:ring-emerald-500`}>
            {copied === 'copied' ? <Check className="w-3 h-3" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
            <span>Copy message</span>
          </button>
          {url && apiSend}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setOpened(true);
                recordChannel(leadId, 'WHATSAPP', 'OPENED').then((result) => { const data = recorded(result); if (data) onRecorded(data); });
              }}
              className={`${button} bg-emerald-600 hover:bg-emerald-700 text-white font-bold focus-visible:ring-emerald-500`}
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              <span>Open WhatsApp</span>
            </a>
          )}
        </div>
      </div>
      {'problem' in target && <p role="alert" className="p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold">{target.problem}</p>}
      <MessageBox id={`${ids}-message`} label="Message to send" message={message} tone="emerald" />
      <CopyStatus state={copied} />
      {(opened || saved?.openedAt) && (
        <p className="text-[11px] text-slate-600">
          {opened ? 'WhatsApp opened with this message.' : `WhatsApp opened on ${when(saved?.openedAt)}.`} Send it there, then record it below.
        </p>
      )}
      {url && <MarkSent leadId={leadId} channel="WHATSAPP" day={day} message={message} saved={saved} tone="emerald" onRecorded={onRecorded} />}
    </section>
  );
};

/** LinkedIn: opens the lead's conversation or profile, with the message to copy and paste. */
export const OutreachLinkedInPanel: React.FC<{
  leadId: string;
  day: number;
  leadName: string;
  linkedinUrl: string | null;
  actionType: string;
  actionNote?: string;
  message: string;
  saved: ManualChannelAction | null;
  canEditLead: boolean;
  onLinkedInSaved: (url: string) => void;
  onRecorded: (result: ChannelRecorded) => void;
}> = ({ leadId, day, leadName, linkedinUrl, actionType, actionNote, message, saved, canEditLead, onLinkedInSaved, onRecorded }) => {
  const ids = useId();
  const destination = normalizeLinkedInUrl(linkedinUrl);
  const problem = !linkedinUrl?.trim() ? LINKEDIN_MISSING : !destination ? LINKEDIN_INVALID : null;
  const { state: copied, copy } = useCopy();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const conversation = destination?.kind === 'CONVERSATION';

  const saveUrl = async () => {
    const normalized = normalizeLinkedInUrl(draft);
    if (!normalized) return setSaveError(`${LINKEDIN_INVALID} Use the address of their LinkedIn page, such as https://www.linkedin.com/in/name.`);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${leadId}`, {
        feedback: { success: false },
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: normalized.url }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return setSaveError(json?.message ?? 'The LinkedIn URL could not be saved.');
      onLinkedInSaved(json.data?.linkedin_url ?? normalized.url);
      setEditing(false);
      setDraft('');
    } catch {
      setSaveError('The LinkedIn URL could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${ids}-title`} className="border border-blue-200 bg-blue-50/20 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
          <Globe className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <h3 id={`${ids}-title`}>LinkedIn: {actionType}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {message && (
            <button
              type="button"
              onClick={async () => { if (await copy(message)) { const data = recorded(await recordChannel(leadId, 'LINKEDIN', 'MESSAGE_COPIED')); if (data) onRecorded(data); } }}
              className={`${button} bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 focus-visible:ring-blue-500`}
            >
              {copied === 'copied' ? <Check className="w-3 h-3" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
              <span>Copy message</span>
            </button>
          )}
          {destination && (
            <a
              href={destination.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setOpened(true);
                recordChannel(leadId, 'LINKEDIN', 'OPENED').then((result) => { const data = recorded(result); if (data) onRecorded(data); });
              }}
              className={`${button} bg-blue-600 hover:bg-blue-700 text-white font-bold focus-visible:ring-blue-500`}
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              <span>{conversation ? 'Open LinkedIn conversation' : 'Open LinkedIn profile'}</span>
            </a>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="font-semibold text-slate-500">To</dt>
        <dd className="text-slate-800 break-words">{leadName}</dd>
        <dt className="font-semibold text-slate-500">{conversation ? 'Conversation' : 'Profile'}</dt>
        <dd className="text-slate-800 break-all">{destination ? displayUrl(destination.url) : linkedinUrl || 'None'}</dd>
      </dl>

      {problem && (
        <div role="alert" className="p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-[11px] space-y-2">
          <p className="font-semibold">{problem === LINKEDIN_MISSING ? 'LinkedIn profile not available for this lead.' : problem}</p>
          {canEditLead && !editing && (
            <button type="button" onClick={() => { setEditing(true); setDraft(linkedinUrl ?? ''); }} className={`${button} bg-white border border-rose-200 hover:bg-rose-50 text-rose-800 focus-visible:ring-rose-500`}>
              {problem === LINKEDIN_MISSING ? 'Add LinkedIn URL' : 'Fix LinkedIn URL'}
            </button>
          )}
        </div>
      )}
      {editing && (
        // Checked here, not by the browser: "linkedin.com/in/name" (no https://) is fine.
        <form noValidate className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); saveUrl(); }}>
          <div className="flex-1 min-w-[14rem]">
            <label htmlFor={`${ids}-url`} className="block text-[11px] font-semibold text-slate-700 mb-1">LinkedIn profile URL</label>
            <input
              id={`${ids}-url`}
              type="url"
              inputMode="url"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://www.linkedin.com/in/name"
              aria-invalid={Boolean(saveError)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <button type="submit" disabled={saving} className={`${button} bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 focus-visible:ring-blue-500`}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => { setEditing(false); setSaveError(null); }} className={`${button} bg-white border border-slate-200 text-slate-700 focus-visible:ring-blue-500`}>Cancel</button>
          {saveError && <p role="alert" className="w-full text-[11px] font-semibold text-rose-700">{saveError}</p>}
        </form>
      )}

      {actionNote && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] leading-relaxed">
          💡 <strong>Action Instruction:</strong> {actionNote}
        </div>
      )}
      {message && <MessageBox id={`${ids}-message`} label="Message to paste in LinkedIn" message={message} tone="blue" />}
      <CopyStatus state={copied} />
      {destination && (
        <p className="text-[11px] text-slate-600">
          {opened
            ? `LinkedIn opened. Paste the message into the ${conversation ? 'conversation' : 'conversation from their profile'}.`
            : 'LinkedIn doesn’t let other apps fill in or send messages: copy the message, open LinkedIn, and paste it there.'}
        </p>
      )}
      {saved?.status !== 'SENT' && (saved?.openedAt || saved?.copiedAt) && (
        <p className="text-[11px] text-slate-500">
          {[saved.openedAt && `LinkedIn opened ${when(saved.openedAt)}`, saved.copiedAt && `message copied ${when(saved.copiedAt)}`].filter(Boolean).join(', ')}
          {saved.executedBy ? ` by ${saved.executedBy.name}` : ''}. Not sent by the CRM.
        </p>
      )}
      {destination && message && <MarkSent leadId={leadId} channel="LINKEDIN" day={day} message={message} saved={saved} tone="blue" onRecorded={onRecorded} />}
    </section>
  );
};
