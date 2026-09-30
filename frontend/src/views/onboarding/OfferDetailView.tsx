import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { onboardingApi, OFFER_STATUS_LABELS, type OfferActionResult, type OfferDetail, type OfferStatus, type OnboardingMeta } from '../../api/onboarding.api';
import { fieldClass, formatAmount, formatDate, formatDateTime, labelClass } from './onboarding-format';
import { describeEmails } from './InterviewDialogs';

interface Props {
  offerId: string;
  meta: OnboardingMeta | null;
  onBack: () => void;
  onEdit: (offer: OfferDetail) => void;
  onOpenCandidate: (candidateId: string) => void;
}

export const OFFER_VARIANT: Record<OfferStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple'> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  SENT: 'purple',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'neutral',
  WITHDRAWN: 'neutral',
};

const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';
const primaryClass = 'px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50';

type Open = 'submit' | 'approve' | 'reject' | 'send' | 'withdraw' | 'pdf' | null;

/** One offer: its letter as it will be (or was) sent, its pay, the approval chain, and the actions its status allows. */
export const OfferDetailView: React.FC<Props> = ({ offerId, meta, onBack, onEdit, onOpenCandidate }) => {
  const ids = useId();
  const { can } = useAuth();
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    onboardingApi.getOffer(offerId).then(setOffer).catch((e: Error) => setError(e.message));
  }, [offerId]);
  useEffect(load, [load]);

  const done = (message: string) => (result: OfferActionResult) => {
    setOffer(result.offer);
    setOpen(null);
    setNotice(describeEmails(result.notifications));
    toast.success(message);
  };

  if (error) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className={actionClass}>Back</button>
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The offer could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="h-64 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true">
        <span className="sr-only" role="status">Loading the offer</span>
      </div>
    );
  }

  const open_ = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(offer.status);
  const rounds = [...new Set(offer.approvals.map((a) => a.submission))];

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button type="button" onClick={onBack} aria-label="Back" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Offer {offer.offerCode}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {offer.jobTitle} for{' '}
              <button type="button" onClick={() => onOpenCandidate(offer.candidate.id)} className="font-semibold text-teal-700 dark:text-teal-300 hover:underline">{offer.candidate.name}</button>
            </p>
            <div className="mt-2 flex flex-wrap gap-2"><Badge variant={OFFER_VARIANT[offer.status]}>{OFFER_STATUS_LABELS[offer.status]}</Badge></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {offer.status === 'DRAFT' && can('onboarding.offers.manage') && <button type="button" onClick={() => onEdit(offer)} className={actionClass}>Edit</button>}
          {offer.status === 'DRAFT' && can('onboarding.offers.manage') && <button type="button" onClick={() => setOpen('submit')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white">Send for approval</button>}
          {offer.status === 'PENDING_APPROVAL' && offer.awaitingMe && can('onboarding.offers.approve') && (
            <>
              <button type="button" onClick={() => setOpen('approve')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white">Approve</button>
              <button type="button" onClick={() => setOpen('reject')} className={actionClass}>Send back</button>
            </>
          )}
          {offer.status === 'APPROVED' && can('onboarding.offers.send') && <button type="button" onClick={() => setOpen('send')} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white">Send to candidate</button>}
          <button type="button" onClick={() => setOpen('pdf')} className={actionClass}>
            {offer.hasPdf && offer.status !== 'APPROVED' ? 'View sent PDF' : 'Preview PDF'}
          </button>
          {open_ && can('onboarding.offers.manage') && <button type="button" onClick={() => setOpen('withdraw')} className={`${actionClass} text-red-700`}>Withdraw</button>}
        </div>
      </div>

      {notice && (
        <div role="status" className={`p-3 rounded-xl border text-sm flex items-start justify-between gap-3 ${notice.tone === 'ok' ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline shrink-0">Dismiss</button>
        </div>
      )}
      {offer.status === 'PENDING_APPROVAL' && !offer.awaitingMe && (
        <p className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] text-sm text-slate-600 dark:text-slate-300">
          Waiting for {offer.approvals.find((a) => a.submission === offer.submissionNumber && a.status === 'PENDING')?.approverName ?? 'the next approver'} to approve.
        </p>
      )}
      {offer.status === 'ACCEPTED' && <p className="p-3 rounded-xl border border-teal-200 bg-teal-50 text-sm text-teal-900">Accepted {offer.respondedAt ? formatDateTime(offer.respondedAt) : ''} by the candidate, who typed the name “{offer.acceptedName}”. This is a recorded confirmation, not a verified electronic signature.</p>}
      {offer.status === 'DECLINED' && <p className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-900">Declined {offer.respondedAt ? formatDateTime(offer.respondedAt) : ''}{offer.declineReason ? `: “${offer.declineReason}”` : '.'}</p>}
      {offer.status === 'WITHDRAWN' && <p className="p-3 rounded-xl border border-slate-200 text-sm">Withdrawn: {offer.withdrawnReason}</p>}
      {offer.status === 'EXPIRED' && <p className="p-3 rounded-xl border border-slate-200 text-sm">Expired unanswered after {formatDate(offer.expiresOn)}.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <section aria-labelledby={`${ids}-letter`} className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <div className="flex items-center justify-between gap-2">
            <h2 id={`${ids}-letter`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Letter</h2>
            <span className="text-xs text-slate-500">{offer.letterIsFinal ? 'Fixed as submitted' : `Draft from ${offer.templateName} v${offer.templateVersion}`}</span>
          </div>
          <h3 className="mt-3 font-bold text-slate-900 dark:text-slate-100">{offer.letter.title}</h3>
          <p className="mt-2 text-sm whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200 leading-relaxed">{offer.letter.body}</p>
        </section>

        <div className="space-y-5">
          <section aria-labelledby={`${ids}-pay`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h2 id={`${ids}-pay`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Pay per year</h2>
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">Pay per year</caption>
              <tbody>
                {offer.components.map((c) => (
                  <tr key={c.label}><th scope="row" className="py-1 text-left font-normal text-slate-600 dark:text-slate-300">{c.label}</th><td className="py-1 text-right tabular-nums">{formatAmount(c.annualAmount)}</td></tr>
                ))}
                <tr className="border-t border-slate-200 dark:border-[#2B293E] font-bold"><th scope="row" className="py-1 text-left">Total (CTC)</th><td className="py-1 text-right tabular-nums">{formatAmount(offer.annualCtc)}</td></tr>
              </tbody>
            </table>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-slate-500">Accept by</dt><dd className="font-semibold">{formatDate(offer.expiresOn)}</dd></div>
              <div><dt className="text-slate-500">Joining</dt><dd className="font-semibold">{formatDate(offer.joiningDate)}</dd></div>
              {offer.sentAt && <div className="col-span-2"><dt className="text-slate-500">Sent</dt><dd>{formatDateTime(offer.sentAt)}{offer.sentBy ? ` by ${offer.sentBy}` : ''} to {offer.candidate.email}</dd></div>}
            </dl>
          </section>

          <section aria-labelledby={`${ids}-approvals`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h2 id={`${ids}-approvals`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Approvals</h2>
            {rounds.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Not sent for approval yet.</p>
            ) : (
              rounds.map((round) => (
                <div key={round} className="mt-3">
                  <p className="text-xs font-semibold text-slate-500">Round {round}{round === offer.submissionNumber ? ' (current)' : ''}</p>
                  <ol className="mt-1 space-y-1">
                    {offer.approvals.filter((a) => a.submission === round).map((a) => (
                      <li key={`${round}-${a.step}`} className="text-sm">
                        {a.step}. {a.approverName}: <span className="font-semibold">{a.status === 'PENDING' ? 'waiting' : a.status.toLowerCase()}</span>
                        {a.comment && <span className="block text-xs text-slate-600 dark:text-slate-400">“{a.comment}”</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      {open === 'submit' && <SubmitDialog offer={offer} meta={meta} onClose={() => setOpen(null)} onDone={done('Offer sent for approval')} />}
      {(open === 'approve' || open === 'reject') && <ApprovalDialog offer={offer} approve={open === 'approve'} onClose={() => setOpen(null)} onDone={done(open === 'approve' ? 'Offer approved' : 'Offer sent back')} />}
      {open === 'send' && <SendDialog offer={offer} onClose={() => setOpen(null)} onDone={(result) => { done(result.offer.status === 'SENT' ? 'Offer sent' : 'The offer was not sent')(result); }} />}
      {open === 'withdraw' && <WithdrawDialog offer={offer} onClose={() => setOpen(null)} onDone={done('Offer withdrawn')} />}
      {open === 'pdf' && (
        <PdfViewer
          title={`Offer ${offer.offerCode}`}
          description={`${offer.jobTitle} for ${offer.candidate.name}`}
          notice={offer.hasPdf && offer.status !== 'APPROVED' ? undefined : 'Preview: this is not the sent letter. Nothing is sent or changed by previewing.'}
          load={() => onboardingApi.offerPdf(offer.id)}
          downloadName={offer.hasPdf && offer.status !== 'APPROVED' ? `${offer.offerCode}.pdf` : `${offer.offerCode}-preview.pdf`}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
};

function useAction(run: () => Promise<OfferActionResult>, onDone: (r: OfferActionResult) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await run());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}

const ErrorLine: React.FC<{ message: string | null }> = ({ message }) =>
  message ? <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{message}</p> : null;

const SubmitDialog: React.FC<{ offer: OfferDetail; meta: OnboardingMeta | null; onClose: () => void; onDone: (r: OfferActionResult) => void }> = ({ offer, meta, onClose, onDone }) => {
  const ids = useId();
  const [chain, setChain] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  const { busy, error, setError, submit } = useAction(() => onboardingApi.submitOffer(offer.id, chain), onDone);
  const nameOf = (id: string) => meta?.members.find((m) => m.id === id)?.name ?? id;
  const move = (index: number, by: number) => setChain((c) => { const next = [...c]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item); return next; });
  return (
    <Dialog
      title="Send for approval"
      description="The letter is fixed as it is now. Approvers approve one after another, in this order. You can't approve an offer you submit."
      onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={actionClass}>Cancel</button><button type="button" disabled={busy} onClick={() => (chain.length ? submit() : setError('Add at least one approver.'))} className={primaryClass}>{busy ? 'Sending…' : 'Send for approval'}</button></>}
    >
      <ErrorLine message={error} />
      <label htmlFor={`${ids}-add`} className={labelClass}>Add an approver</label>
      <div className="flex gap-2">
        <select id={`${ids}-add`} value={adding} onChange={(e) => setAdding(e.target.value)} className={fieldClass}>
          <option value="">Choose a team member</option>
          {meta?.members.filter((m) => !chain.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button type="button" disabled={!adding || chain.length >= 5} onClick={() => { setChain((c) => [...c, adding]); setAdding(''); }} className={actionClass}>Add</button>
      </div>
      <ol className="mt-3 space-y-2" aria-label="Approval order">
        {chain.map((id, index) => (
          <li key={id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] text-sm">
            <span>{index + 1}. {nameOf(id)}</span>
            <span className="flex gap-1">
              <button type="button" aria-label={`Move ${nameOf(id)} up`} disabled={index === 0} onClick={() => move(index, -1)} className="p-1 rounded disabled:opacity-30"><ArrowUp className="w-4 h-4" aria-hidden="true" /></button>
              <button type="button" aria-label={`Move ${nameOf(id)} down`} disabled={index === chain.length - 1} onClick={() => move(index, 1)} className="p-1 rounded disabled:opacity-30"><ArrowDown className="w-4 h-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => setChain((c) => c.filter((x) => x !== id))} className="text-xs font-semibold text-red-700 underline">Remove</button>
            </span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
};

const ApprovalDialog: React.FC<{ offer: OfferDetail; approve: boolean; onClose: () => void; onDone: (r: OfferActionResult) => void }> = ({ offer, approve, onClose, onDone }) => {
  const ids = useId();
  const [comment, setComment] = useState('');
  const { busy, error, setError, submit } = useAction(
    () => (approve ? onboardingApi.approveOffer(offer.id, comment.trim() || undefined) : onboardingApi.rejectOffer(offer.id, comment.trim())),
    onDone,
  );
  return (
    <Dialog
      title={approve ? `Approve offer ${offer.offerCode}?` : `Send offer ${offer.offerCode} back?`}
      description={approve ? `You approve the letter and pay of ${formatAmount(offer.annualCtc)} per year as shown.` : 'The offer returns to draft so it can be corrected, and your reason is recorded.'}
      onClose={onClose}
      size="sm"
      footer={<><button type="button" onClick={onClose} className={actionClass}>Cancel</button><button type="button" disabled={busy} onClick={() => (!approve && comment.trim().length < 3 ? setError('Say why it is being sent back.') : submit())} className={approve ? primaryClass : 'px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'}>{busy ? 'Saving…' : approve ? 'Approve' : 'Send back'}</button></>}
    >
      <ErrorLine message={error} />
      <label htmlFor={`${ids}-comment`} className={labelClass}>{approve ? 'Comment (optional)' : 'Reason *'}</label>
      <textarea id={`${ids}-comment`} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} className={fieldClass} />
    </Dialog>
  );
};

const SendDialog: React.FC<{ offer: OfferDetail; onClose: () => void; onDone: (r: OfferActionResult) => void }> = ({ offer, onClose, onDone }) => {
  const { busy, error, submit } = useAction(() => onboardingApi.sendOffer(offer.id), onDone);
  return (
    <Dialog
      title={`Send offer ${offer.offerCode} to ${offer.candidate.name}?`}
      description={`${offer.candidate.email} receives the letter as a PDF and a personal link to accept or decline by ${formatDate(offer.expiresOn)}. A sent offer can't be edited, only withdrawn.`}
      onClose={onClose}
      size="sm"
      footer={<><button type="button" onClick={onClose} className={actionClass}>Cancel</button><button type="button" disabled={busy} onClick={submit} className={primaryClass}>{busy ? 'Sending…' : 'Send offer'}</button></>}
    >
      <ErrorLine message={error} />
      <p className="text-sm text-slate-600 dark:text-slate-300">It is sent from your workspace's email account. If it can't be sent, the offer stays approved and you can try again.</p>
    </Dialog>
  );
};

const WithdrawDialog: React.FC<{ offer: OfferDetail; onClose: () => void; onDone: (r: OfferActionResult) => void }> = ({ offer, onClose, onDone }) => {
  const ids = useId();
  const [reason, setReason] = useState('');
  const { busy, error, setError, submit } = useAction(() => onboardingApi.withdrawOffer(offer.id, reason.trim()), onDone);
  return (
    <Dialog
      title={`Withdraw offer ${offer.offerCode}?`}
      description={offer.status === 'SENT' ? 'The candidate’s link will show the offer as withdrawn, and they return to Selected.' : 'The offer is closed and stays on record.'}
      onClose={onClose}
      size="sm"
      footer={<><button type="button" onClick={onClose} className={actionClass}>Keep offer</button><button type="button" disabled={busy} onClick={() => (reason.trim().length < 3 ? setError('Say why the offer is being withdrawn.') : submit())} className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">{busy ? 'Withdrawing…' : 'Withdraw offer'}</button></>}
    >
      <ErrorLine message={error} />
      <label htmlFor={`${ids}-reason`} className={labelClass}>Reason *</label>
      <input id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className={fieldClass} />
    </Dialog>
  );
};
