import React, { useCallback, useEffect, useId, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  onboardingApi,
  type CandidateDetail,
  type CandidateFormReview,
  type CandidateStatus,
  type EmailOutcome,
  type FormAddress,
} from '../../api/onboarding.api';
import { fieldClass, formatAmount, formatDate, formatDateTime, labelClass } from './onboarding-format';

/** Mirrors the server's rules; the server enforces them. */
const FORM_SENDABLE: CandidateStatus[] = ['NEW', 'FORM_SENT', 'FORM_SUBMITTED', 'SCREENING'];
const DECIDABLE: CandidateStatus[] = ['NEW', 'FORM_SUBMITTED', 'SCREENING'];
const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
const GENDER: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other', UNDISCLOSED: 'Prefers not to say' };

interface Props {
  candidate: CandidateDetail;
  onChanged: (candidate: CandidateDetail, notice: { tone: 'ok' | 'warn'; text: string } | null) => void;
}

/**
 * The candidate's information form: sending (or reopening) it, what they
 * submitted, and the eligibility decision that follows.
 */
export const CandidateFormPanel: React.FC<Props> = ({ candidate, onChanged }) => {
  const ids = useId();
  const { can } = useAuth();
  const [review, setReview] = useState<CandidateFormReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'send' | 'ELIGIBLE' | 'NOT_ELIGIBLE' | null>(null);
  const archived = Boolean(candidate.archivedAt);

  const load = useCallback(() => {
    setError(null);
    onboardingApi.candidateForm(candidate.id).then(setReview).catch((e: Error) => setError(e.message));
  }, [candidate.id]);
  // Reloaded whenever the candidate changes status (sent, submitted, decided).
  useEffect(load, [load, candidate.status]);

  const done = (result: { candidate: CandidateDetail; notifications: EmailOutcome[] }, message: string) => {
    setDialog(null);
    if (result.notifications.some((n) => n.status === 'SENT') || result.notifications.length === 0) toast.success(message);
    onChanged(result.candidate, describeDeliveries(result.notifications));
  };

  const canSend = can('onboarding.candidates.manage') && !archived && FORM_SENDABLE.includes(candidate.status);
  const canDecide = can('onboarding.candidates.decide') && !archived && DECIDABLE.includes(candidate.status);
  const form = review?.form;
  const submitted = Boolean(form?.submittedAt);

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2B293E] dark:bg-[#181724]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`${ids}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Candidate form and eligibility</h2>
          <p className="text-xs text-slate-500" role="status">
            {!form ? 'Loading…'
              : form.isOpen ? `Sent ${formatDateTime(form.sentAt)}, waiting for the candidate. The link works until ${formatDate(form.expiresAt)}.`
              : submitted ? `Submitted ${formatDateTime(form.submittedAt)}.`
              : form.linkNumber > 0 ? 'Sent, but the email may not have been delivered. Send it again to retry.'
              : 'Not sent yet. The candidate fills in their own details from an emailed link.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSend && (
            <button type="button" className={actionClass} onClick={() => setDialog('send')}>
              {form?.linkNumber ? (submitted ? 'Ask for more information' : 'Send the form again') : 'Send form'}
            </button>
          )}
          {canDecide && <button type="button" className={actionClass} onClick={() => setDialog('ELIGIBLE')}>Mark eligible</button>}
          {canDecide && <button type="button" className={`${actionClass} text-red-700 dark:text-red-300`} onClick={() => setDialog('NOT_ELIGIBLE')}>Not eligible</button>}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-700">The form could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button></p>}

      {review?.eligibility && (
        <div className={`rounded-xl border p-3 text-sm ${review.eligibility.decision === 'ELIGIBLE' ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100'}`}>
          <p className="font-semibold">
            {review.eligibility.decision === 'ELIGIBLE' ? 'Eligible' : 'Not eligible'} · {formatDateTime(review.eligibility.decidedAt)}{review.eligibility.decidedBy ? ` by ${review.eligibility.decidedBy}` : ''}
          </p>
          {review.eligibility.reason && <p>Reason: {review.eligibility.reason}</p>}
          {review.eligibility.remarks && <p>Remarks: {review.eligibility.remarks}</p>}
        </div>
      )}

      {review && submitted && <Submitted review={review} />}

      {dialog === 'send' && (
        <SendFormDialog candidate={candidate} reopening={submitted} onClose={() => setDialog(null)}
          onDone={(r) => done(r, submitted ? 'Form reopened and sent' : 'Form sent')} />
      )}
      {(dialog === 'ELIGIBLE' || dialog === 'NOT_ELIGIBLE') && (
        <EligibilityDialog candidate={candidate} decision={dialog} onClose={() => setDialog(null)}
          onDone={(r) => done(r, dialog === 'ELIGIBLE' ? 'Marked eligible' : 'Marked not eligible')} />
      )}
    </section>
  );
};

/** One line per channel: what went out, and why anything did not. */
export function describeDeliveries(outcomes: EmailOutcome[]): { tone: 'ok' | 'warn'; text: string } | null {
  if (outcomes.length === 0) return null;
  const channel = (o: EmailOutcome) => (o.recipient.startsWith('WhatsApp') ? 'WhatsApp' : 'Email');
  const failed = outcomes.filter((o) => o.status !== 'SENT');
  const sent = outcomes.filter((o) => o.status === 'SENT').map(channel);
  const parts = [
    ...(sent.length ? [`Sent by ${sent.join(' and ').toLowerCase().replace('whatsapp', 'WhatsApp')}.`] : ['Nothing was sent.']),
    ...failed.map((o) => `${channel(o)} not sent: ${o.error ?? 'it could not be delivered.'}`),
  ];
  return { tone: failed.length ? 'warn' : 'ok', text: parts.join(' ') };
}

const address = (a: FormAddress | null) => (a ? [a.addressLine1, a.addressLine2, a.city, a.stateRegion, a.postalCode, a.countryCode].filter(Boolean).join(', ') : null);

/** What the candidate submitted, in the order they filled it in. */
const Submitted: React.FC<{ review: CandidateFormReview }> = ({ review }) => {
  const p = review.personal;
  const facts: [string, React.ReactNode][] = [
    ['Date of birth', p.dateOfBirth && formatDate(p.dateOfBirth)],
    ['Gender', p.genderCode && (GENDER[p.genderCode] ?? p.genderCode)],
    ['Mobile', p.phone],
    ['Alternate number', p.alternatePhone],
    ['Current address', address(review.addresses.CURRENT)],
    ['Permanent address', address(review.addresses.PERMANENT) ?? (review.addresses.CURRENT ? 'Same as current' : null)],
    ['Total experience', p.totalExperienceYears && `${p.totalExperienceYears} years`],
    ['Expected salary', p.expectedSalary && `${formatAmount(p.expectedSalary)} a year`],
    ['Notice period', p.noticePeriodDays !== null ? `${p.noticePeriodDays} days` : null],
    ['Last working date', p.lastWorkingDate && formatDate(p.lastWorkingDate)],
    ['Emergency contact', p.emergencyContactName && [p.emergencyContactName, p.emergencyContactRelationship, p.emergencyContactPhone].filter(Boolean).join(' · ')],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="break-words text-slate-900 dark:text-slate-100">{value || <span className="text-slate-400">Not given</span>}</dd>
          </div>
        ))}
        {p.skills && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Skills</dt><dd className="whitespace-pre-wrap">{p.skills}</dd></div>}
      </dl>

      <Table caption="Education" empty="No education given."
        headers={['Qualification', 'Institution', 'University', 'Year', 'Score']}
        rows={review.education.map((e) => [e.qualification, e.institution, e.university, e.passingYear, e.score])} />
      <Table caption="Employment history" empty="No previous jobs: a first job."
        headers={['Company', 'Designation', 'Period', 'Last salary (year)']}
        rows={review.experience.map((x) => [
          x.companyName, x.designation,
          `${x.startDate ? formatDate(x.startDate) : '?'} – ${x.isCurrent ? 'now' : x.endDate ? formatDate(x.endDate) : '?'}`,
          x.lastSalary ? formatAmount(x.lastSalary) : null,
        ])} />
      <Table caption="References" empty="No references given."
        headers={['Name', 'Relationship', 'Company', 'Contact']}
        rows={review.references.map((r) => [r.name, r.relationship, r.companyName, [r.phone, r.email].filter(Boolean).join(' · ')])} />
      {p.additionalInformation && <p className="text-sm"><span className="text-xs text-slate-500">Other information: </span>{p.additionalInformation}</p>}
    </div>
  );
};

const Table: React.FC<{ caption: string; empty: string; headers: string[]; rows: React.ReactNode[][] }> = ({ caption, empty, headers, rows }) => (
  <div>
    <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{caption}</h3>
    {rows.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-[11px] uppercase text-slate-500"><tr className="border-b border-slate-200 dark:border-[#2B293E]">{headers.map((h) => <th key={h} scope="col" className="px-2 py-1.5 font-bold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="px-2 py-1.5">{cell ?? '—'}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

type Result = { candidate: CandidateDetail; notifications: EmailOutcome[] };

const SendFormDialog: React.FC<{ candidate: CandidateDetail; reopening: boolean; onClose: () => void; onDone: (r: Result) => void }> = ({ candidate, reopening, onClose, onDone }) => {
  const id = useId();
  const [message, setMessage] = useState('');
  const [byEmail, setByEmail] = useState(true);
  const [byWhatsApp, setByWhatsApp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (busy) return;
    if (!byEmail && !byWhatsApp) { setError('Choose email, WhatsApp or both.'); return; }
    if (reopening && message.trim().length < 3) { setError('Say what more you need, so the candidate knows what to add.'); return; }
    setBusy(true);
    setError(null);
    try {
      onDone(await onboardingApi.sendForm(candidate.id, message.trim() || undefined, [...(byEmail ? ['EMAIL' as const] : []), ...(byWhatsApp ? ['WHATSAPP' as const] : [])]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The form could not be sent.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={reopening ? `Ask ${candidate.fullName} for more information?` : `Send the form to ${candidate.fullName}?`}
      description="The candidate gets a personal link that works for 14 days and can be submitted once; any earlier link stops working."
      onClose={() => !busy && onClose()}
      footer={<div className="flex justify-end gap-2"><button type="button" className={actionClass} onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button></div>}>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <fieldset className="mb-3">
        <legend className={labelClass}>Send by</legend>
        <label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={byEmail} onChange={(e) => setByEmail(e.target.checked)} /> Email ({candidate.email})</label>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={byWhatsApp} disabled={!candidate.phone} onChange={(e) => setByWhatsApp(e.target.checked)} /> WhatsApp {candidate.phone ? `(${candidate.phone})` : '(no mobile number)'}</label>
      </fieldset>
      <label htmlFor={`${id}-message`} className={labelClass}>{reopening ? 'What more is needed *' : 'Message to the candidate (optional)'}</label>
      <textarea id={`${id}-message`} rows={3} maxLength={1000} className={fieldClass} value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder={reopening ? 'e.g. Please add your permanent address and your M.Com details.' : undefined} />
      {reopening && <p className="mt-1 text-xs text-slate-500">The form opens with their earlier answers filled in. Their status returns to Form sent until they submit again.</p>}
    </Dialog>
  );
};

const EligibilityDialog: React.FC<{ candidate: CandidateDetail; decision: 'ELIGIBLE' | 'NOT_ELIGIBLE'; onClose: () => void; onDone: (r: Result) => void }> = ({ candidate, decision, onClose, onDone }) => {
  const id = useId();
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rejecting = decision === 'NOT_ELIGIBLE';
  const save = async () => {
    if (busy) return;
    if (rejecting && reason.trim().length < 3) { setError('Give the reason the candidate is not eligible.'); return; }
    setBusy(true);
    setError(null);
    try {
      onDone(await onboardingApi.decideEligibility(candidate.id, {
        decision, remarks: remarks.trim() || undefined, ...(rejecting ? { reason: reason.trim(), notifyCandidate: notify, ...(notifyWhatsApp ? { notifyWhatsApp: true } : {}) } : {}),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={rejecting ? `Mark ${candidate.fullName} not eligible?` : `Mark ${candidate.fullName} eligible?`}
      description={rejecting ? 'Their application ends here. This can only be reversed by an override with a reason.' : 'They can then be scheduled for interviews.'}
      onClose={() => !busy && onClose()}
      footer={<div className="flex justify-end gap-2"><button type="button" className={actionClass} onClick={onClose} disabled={busy}>Cancel</button><button type="button" className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${rejecting ? 'bg-red-700' : 'bg-teal-700'}`} onClick={save} disabled={busy}>{busy ? 'Saving…' : rejecting ? 'Mark not eligible' : 'Mark eligible'}</button></div>}>
      <div className="space-y-3">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {rejecting && (
          <div>
            <label htmlFor={`${id}-reason`} className={labelClass}>Reason *</label>
            <input id={`${id}-reason`} maxLength={500} className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Requires a CA qualification" />
            <p className="mt-1 text-xs text-slate-500">Kept internally; it is not sent to the candidate.</p>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-remarks`} className={labelClass}>Internal remarks (optional)</label>
          <textarea id={`${id}-remarks`} rows={3} maxLength={2000} className={fieldClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        {rejecting && (
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Email {candidate.email} a polite note that the application is not moving forward
          </label>
        )}
        {rejecting && candidate.phone && (
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" checked={notifyWhatsApp} onChange={(e) => setNotifyWhatsApp(e.target.checked)} />
            Also tell them by WhatsApp ({candidate.phone})
          </label>
        )}
      </div>
    </Dialog>
  );
};

