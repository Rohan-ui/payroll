import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  FileCheck,
  FileDown,
  FileText,
  History,
  Mail,
  MoreVertical,
  RotateCcw,
  Sliders,
  User,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  onboardingApi,
  OFFER_STATUS_LABELS,
  type OfferActionResult,
  type OfferDetail,
  type OfferStatus,
  type OnboardingMeta,
} from '../../api/onboarding.api';
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

const actionClass =
  'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300';
const primaryClass =
  'px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50 inline-flex items-center gap-1.5';

type OpenModal = 'submit' | 'approve' | 'reject' | 'send' | 'withdraw' | 'pdf' | 'changeStatus' | 'versions' | 'emails' | null;

/** One offer: its letter, terms, approval chain, versions, delivery history, and lifecycle actions. */
export const OfferDetailView: React.FC<Props> = ({ offerId, meta, onBack, onEdit, onOpenCandidate }) => {
  const ids = useId();
  const { can } = useAuth();
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenModal>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  const load = useCallback(() => {
    setError(null);
    onboardingApi
      .getOffer(offerId)
      .then(setOffer)
      .catch((e: Error) => setError(e.message));
  }, [offerId]);

  useEffect(load, [load]);

  const done = (message: string) => (result: OfferActionResult) => {
    setOffer(result.offer);
    setOpen(null);
    setNotice(describeEmails(result.notifications));
    toast.success(message);
  };

  const handleDownloadDocx = async () => {
    if (!offer?.document || !offer.candidate?.id) return;
    setDownloadingDocx(true);
    try {
      const file = await onboardingApi.downloadLetterDocx(offer.candidate.id, offer.document.id);
      const url = URL.createObjectURL(new Blob([file], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${offer.offerCode}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('DOCX file downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download DOCX file');
    } finally {
      setDownloadingDocx(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className={actionClass}>
          Back
        </button>
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The offer could not be loaded: {error}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="h-64 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true">
        <span className="sr-only" role="status">
          Loading the offer
        </span>
      </div>
    );
  }

  const open_ = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(offer.status);
  const rounds = [...new Set(offer.approvals.map((a) => a.submission))];
  const linkedDoc = offer.document;

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Offers"
            className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Offer {offer.offerCode}</h1>
              <Badge variant={OFFER_VARIANT[offer.status]}>{OFFER_STATUS_LABELS[offer.status]}</Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {offer.jobTitle}
              {offer.departmentName ? ` · ${offer.departmentName}` : ''}
              {offer.employmentTypeName ? ` · ${offer.employmentTypeName}` : ''} for{' '}
              <button
                type="button"
                onClick={() => onOpenCandidate(offer.candidate.id)}
                className="font-semibold text-teal-700 dark:text-teal-300 hover:underline inline-flex items-center gap-1"
              >
                <User className="w-3.5 h-3.5" aria-hidden="true" />
                {offer.candidate.name} ({offer.candidate.code})
              </button>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {offer.status === 'DRAFT' && can('onboarding.offers.manage') && (
            <button type="button" onClick={() => onEdit(offer)} className={actionClass}>
              Edit Terms
            </button>
          )}

          {offer.status === 'DRAFT' && can('onboarding.offers.manage') && (
            <button
              type="button"
              onClick={() => setOpen('submit')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white"
            >
              Send for approval
            </button>
          )}

          {offer.status === 'PENDING_APPROVAL' && offer.awaitingMe && can('onboarding.offers.approve') && (
            <>
              <button
                type="button"
                onClick={() => setOpen('approve')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white"
              >
                Approve
              </button>
              <button type="button" onClick={() => setOpen('reject')} className={actionClass}>
                Send back
              </button>
            </>
          )}

          {offer.status === 'APPROVED' && can('onboarding.offers.send') && (
            <button
              type="button"
              onClick={() => setOpen('send')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white"
            >
              Send to candidate
            </button>
          )}

          <button type="button" onClick={() => setOpen('pdf')} className={actionClass}>
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            {offer.hasPdf && offer.status !== 'APPROVED' ? 'View sent PDF' : 'Preview PDF'}
          </button>

          {linkedDoc && (
            <button
              type="button"
              disabled={downloadingDocx}
              onClick={handleDownloadDocx}
              className={actionClass}
              title="Download editable DOCX"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              DOCX
            </button>
          )}

          {can('onboarding.offers.manage') && (
            <button
              type="button"
              onClick={() => setOpen('changeStatus')}
              className={actionClass}
              title="Change offer lifecycle status"
            >
              <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
              Change Status
            </button>
          )}

          {open_ && can('onboarding.offers.manage') && (
            <button type="button" onClick={() => setOpen('withdraw')} className={`${actionClass} text-red-700 dark:text-red-400`}>
              Withdraw
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-3 rounded-xl border text-sm flex items-start justify-between gap-3 ${
            notice.tone === 'ok' ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Status Notice Banners */}
      {offer.status === 'PENDING_APPROVAL' && !offer.awaitingMe && (
        <p className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] text-sm text-slate-600 dark:text-slate-300">
          Waiting for {offer.approvals.find((a) => a.submission === offer.submissionNumber && a.status === 'PENDING')?.approverName ?? 'the next approver'} to approve.
        </p>
      )}
      {offer.status === 'ACCEPTED' && (
        <p className="p-3.5 rounded-xl border border-teal-200 bg-teal-50 dark:bg-teal-950/30 text-sm text-teal-900 dark:text-teal-200">
          Accepted {offer.respondedAt ? formatDateTime(offer.respondedAt) : ''} by the candidate (typed confirmation name: “{offer.acceptedName || 'Candidate'}”).
        </p>
      )}
      {offer.status === 'DECLINED' && (
        <p className="p-3.5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-sm text-red-900 dark:text-red-200">
          Declined {offer.respondedAt ? formatDateTime(offer.respondedAt) : ''}
          {offer.declineReason ? `: “${offer.declineReason}”` : '.'}
        </p>
      )}
      {offer.status === 'WITHDRAWN' && (
        <p className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] text-sm text-slate-700 dark:text-slate-300">
          Withdrawn: {offer.withdrawnReason || 'No reason specified'}
        </p>
      )}
      {offer.status === 'EXPIRED' && (
        <p className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] text-sm text-slate-700 dark:text-slate-300">
          Expired unanswered after {formatDate(offer.expiresOn)}.
        </p>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left 2 Cols: Letter and Associated Document Card */}
        <div className="lg:col-span-2 space-y-5">
          {/* Associated Document Card */}
          {linkedDoc && (
            <div className="p-4 rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/40 dark:bg-[#151d24] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300">
                  <FileCheck className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                      Linked Onboarding Document
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white dark:bg-black/20 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300">
                      v{linkedDoc.versionNumber} · {linkedDoc.status}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                    {linkedDoc.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Updated {formatDateTime(linkedDoc.updatedAt)}
                    {linkedDoc.emailStatus ? ` · Email: ${linkedDoc.emailStatus}` : ''}
                    {linkedDoc.lastSentAt ? ` (sent ${formatDate(linkedDoc.lastSentAt)})` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen('versions')}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] hover:bg-slate-50 dark:hover:bg-white/5 inline-flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  Versions ({linkedDoc.versions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOpen('emails')}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] hover:bg-slate-50 dark:hover:bg-white/5 inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  Emails ({linkedDoc.emails.length})
                </button>
              </div>
            </div>
          )}

          {/* Letter Content */}
          <section aria-labelledby={`${ids}-letter`} className="p-5 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-[#2B293E] pb-3">
              <div>
                <h2 id={`${ids}-letter`} className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Offer Letter Content
                </h2>
                <span className="text-xs text-slate-500">
                  {offer.letterIsFinal ? 'Fixed and locked as submitted' : `Draft template: ${offer.templateName} (v${offer.templateVersion})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen('pdf')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 inline-flex items-center gap-1 text-teal-700 dark:text-teal-300"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                Preview PDF
              </button>
            </div>
            <h3 className="mt-4 font-bold text-slate-900 dark:text-slate-100">{offer.letter.title}</h3>
            <p className="mt-2 text-sm whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
              {offer.letter.body}
            </p>
          </section>

          {/* Offer Lifecycle & Candidate Timeline Events */}
          {offer.timeline && offer.timeline.length > 0 && (
            <section aria-labelledby={`${ids}-timeline`} className="p-5 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
              <h2 id={`${ids}-timeline`} className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-teal-600" aria-hidden="true" />
                Audit Trail & Offer Timeline
              </h2>
              <ol className="space-y-3 relative border-l-2 border-slate-100 dark:border-[#2B293E] ml-2">
                {offer.timeline.map((event) => (
                  <li key={event.id} className="ml-4 text-xs">
                    <span className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-teal-500 border-2 border-white dark:border-[#181724]" />
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{event.summary}</span>
                      <span className="text-slate-400">{formatDateTime(event.createdAt)}</span>
                    </div>
                    {event.notes && <p className="mt-1 text-slate-600 dark:text-slate-400 italic">“{event.notes}”</p>}
                    {event.actorName && <span className="text-[11px] text-slate-400 block mt-0.5">By {event.actorName}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* Right 1 Col: Pay, Metadata, Approvals */}
        <div className="space-y-5">
          {/* Compensation Breakdown */}
          <section aria-labelledby={`${ids}-pay`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h2 id={`${ids}-pay`} className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Annual Compensation
            </h2>
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">Annual Compensation Details</caption>
              <tbody>
                {offer.components.map((c) => (
                  <tr key={c.label}>
                    <th scope="row" className="py-1 text-left font-normal text-slate-600 dark:text-slate-300">
                      {c.label}
                    </th>
                    <td className="py-1 text-right tabular-nums font-mono">{formatAmount(c.annualAmount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 dark:border-[#2B293E] font-bold text-slate-900 dark:text-slate-100">
                  <th scope="row" className="py-2 text-left">
                    Total (CTC)
                  </th>
                  <td className="py-2 text-right tabular-nums font-mono text-base text-teal-700 dark:text-teal-300">
                    {formatAmount(offer.annualCtc)}
                  </td>
                </tr>
              </tbody>
            </table>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-slate-100 dark:border-[#2B293E] pt-3">
              <div>
                <dt className="text-slate-500">Accept by</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(offer.expiresOn)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Target Joining</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(offer.joiningDate)}</dd>
              </div>
              {offer.probationMonths ? (
                <div>
                  <dt className="text-slate-500">Probation</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-200">{offer.probationMonths} months</dd>
                </div>
              ) : null}
              {offer.reportingManagerName ? (
                <div>
                  <dt className="text-slate-500">Reporting to</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-200">{offer.reportingManagerName}</dd>
                </div>
              ) : null}
              {offer.createdByName && (
                <div className="col-span-2">
                  <dt className="text-slate-500">Created by</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{offer.createdByName} on {formatDate(offer.createdAt)}</dd>
                </div>
              )}
              {offer.sentAt && (
                <div className="col-span-2">
                  <dt className="text-slate-500">Sent</dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {formatDateTime(offer.sentAt)}
                    {offer.sentBy ? ` by ${offer.sentBy}` : ''} to {offer.candidate.email}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Approval Progress */}
          <section aria-labelledby={`${ids}-approvals`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h2 id={`${ids}-approvals`} className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Approval Chain
            </h2>
            {rounds.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Not submitted for approval yet.</p>
            ) : (
              rounds.map((round) => (
                <div key={round} className="mt-3">
                  <p className="text-xs font-semibold text-slate-500">
                    Round {round}
                    {round === offer.submissionNumber ? ' (Current submission)' : ''}
                  </p>
                  <ol className="mt-1 space-y-1.5">
                    {offer.approvals
                      .filter((a) => a.submission === round)
                      .map((a) => (
                        <li key={`${round}-${a.step}`} className="text-sm p-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-[#2B293E]">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {a.step}. {a.approverName}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-semibold ${
                                a.status === 'APPROVED'
                                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'
                                  : a.status === 'REJECTED'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                              }`}
                            >
                              {a.status}
                            </span>
                          </div>
                          {a.comment && <span className="block mt-1 text-xs text-slate-600 dark:text-slate-400 italic">“{a.comment}”</span>}
                        </li>
                      ))}
                  </ol>
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      {/* Action Dialogs */}
      {open === 'submit' && <SubmitDialog offer={offer} meta={meta} onClose={() => setOpen(null)} onDone={done('Offer sent for approval')} />}
      {(open === 'approve' || open === 'reject') && (
        <ApprovalDialog
          offer={offer}
          approve={open === 'approve'}
          onClose={() => setOpen(null)}
          onDone={done(open === 'approve' ? 'Offer approved' : 'Offer sent back')}
        />
      )}
      {open === 'send' && (
        <SendDialog
          offer={offer}
          onClose={() => setOpen(null)}
          onDone={(result) => {
            done(result.offer.status === 'SENT' ? 'Offer sent to candidate' : 'The offer was not sent')(result);
          }}
        />
      )}
      {open === 'withdraw' && <WithdrawDialog offer={offer} onClose={() => setOpen(null)} onDone={done('Offer withdrawn')} />}
      {open === 'changeStatus' && (
        <ChangeStatusDialog
          offer={offer}
          onClose={() => setOpen(null)}
          onDone={done('Offer status changed successfully')}
        />
      )}
      {open === 'versions' && linkedDoc && (
        <VersionsModal
          candidateId={offer.candidate.id}
          documentId={linkedDoc.id}
          versions={linkedDoc.versions}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'emails' && linkedDoc && (
        <EmailsModal
          emails={linkedDoc.emails}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'pdf' && (
        <PdfViewer
          title={`Offer ${offer.offerCode}`}
          description={`${offer.jobTitle} for ${offer.candidate.name}`}
          notice={offer.hasPdf && offer.status !== 'APPROVED' ? undefined : 'Preview: this is a generated preview of the current wording.'}
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
  const move = (index: number, by: number) =>
    setChain((c) => {
      const next = [...c];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });

  return (
    <Dialog
      title="Send for approval"
      description="The letter is fixed as it is now. Approvers approve one after another, in this order. You can't approve an offer you submit."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => (chain.length ? submit() : setError('Add at least one approver.'))}
            className={primaryClass}
          >
            {busy ? 'Sending…' : 'Send for approval'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <label htmlFor={`${ids}-add`} className={labelClass}>
        Add an approver
      </label>
      <div className="flex gap-2">
        <select id={`${ids}-add`} value={adding} onChange={(e) => setAdding(e.target.value)} className={fieldClass}>
          <option value="">Choose a team member</option>
          {meta?.members.filter((m) => !chain.includes(m.id)).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!adding || chain.length >= 5}
          onClick={() => {
            setChain((c) => [...c, adding]);
            setAdding('');
          }}
          className={actionClass}
        >
          Add
        </button>
      </div>
      <ol className="mt-3 space-y-2" aria-label="Approval order">
        {chain.map((id, index) => (
          <li key={id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] text-sm">
            <span>
              {index + 1}. {nameOf(id)}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                aria-label={`Move ${nameOf(id)} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="p-1 rounded disabled:opacity-30"
              >
                <ArrowUp className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move ${nameOf(id)} down`}
                disabled={index === chain.length - 1}
                onClick={() => move(index, 1)}
                className="p-1 rounded disabled:opacity-30"
              >
                <ArrowDown className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setChain((c) => c.filter((x) => x !== id))} className="text-xs font-semibold text-red-700 underline">
                Remove
              </button>
            </span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
};

const ApprovalDialog: React.FC<{ offer: OfferDetail; approve: boolean; onClose: () => void; onDone: (r: OfferActionResult) => void }> = ({
  offer,
  approve,
  onClose,
  onDone,
}) => {
  const ids = useId();
  const [comment, setComment] = useState('');
  const { busy, error, setError, submit } = useAction(
    () => (approve ? onboardingApi.approveOffer(offer.id, comment.trim() || undefined) : onboardingApi.rejectOffer(offer.id, comment.trim())),
    onDone,
  );
  return (
    <Dialog
      title={approve ? `Approve offer ${offer.offerCode}?` : `Send offer ${offer.offerCode} back?`}
      description={
        approve
          ? `You approve the letter and pay of ${formatAmount(offer.annualCtc)} per year as shown.`
          : 'The offer returns to draft so it can be corrected, and your reason is recorded.'
      }
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => (!approve && comment.trim().length < 3 ? setError('Say why it is being sent back.') : submit())}
            className={approve ? primaryClass : 'px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'}
          >
            {busy ? 'Saving…' : approve ? 'Approve' : 'Send back'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <label htmlFor={`${ids}-comment`} className={labelClass}>
        {approve ? 'Comment (optional)' : 'Reason *'}
      </label>
      <textarea id={`${ids}-comment`} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} className={fieldClass} />
    </Dialog>
  );
};

const SendDialog: React.FC<{ offer: OfferDetail; onClose: () => void; onDone: (r: OfferActionResult) => void }> = ({ offer, onClose, onDone }) => {
  const { busy, error, submit } = useAction(() => onboardingApi.sendOffer(offer.id), onDone);
  return (
    <Dialog
      title={`Send offer ${offer.offerCode} to ${offer.candidate.name}?`}
      description={`${offer.candidate.email} receives the letter as a PDF and a link to accept or decline by ${formatDate(offer.expiresOn)}.`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={submit} className={primaryClass}>
            {busy ? 'Sending…' : 'Send offer'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        It is sent from your workspace's official email account. The delivery and document status will update automatically.
      </p>
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
      description={
        offer.status === 'SENT'
          ? 'The candidate’s response link will show the offer as withdrawn, and the candidate status returns to Selected.'
          : 'The offer is closed and archived in the audit history.'
      }
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>
            Keep offer
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => (reason.trim().length < 3 ? setError('Say why the offer is being withdrawn.') : submit())}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            {busy ? 'Withdrawing…' : 'Withdraw offer'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <label htmlFor={`${ids}-reason`} className={labelClass}>
        Reason *
      </label>
      <input id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className={fieldClass} />
    </Dialog>
  );
};

const ChangeStatusDialog: React.FC<{
  offer: OfferDetail;
  onClose: () => void;
  onDone: (r: OfferActionResult) => void;
}> = ({ offer, onClose, onDone }) => {
  const ids = useId();
  const { can } = useAuth();
  const [newStatus, setNewStatus] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isOverride, setIsOverride] = useState(false);

  const allowedTransitions: Record<string, string[]> = {
    DRAFT: ['PENDING_APPROVAL', 'APPROVED', 'WITHDRAWN'],
    PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'WITHDRAWN'],
    APPROVED: ['SENT', 'WITHDRAWN'],
    SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'],
    ACCEPTED: ['WITHDRAWN'],
    DECLINED: ['DRAFT', 'WITHDRAWN'],
    EXPIRED: ['DRAFT', 'WITHDRAWN'],
    WITHDRAWN: ['DRAFT'],
  };

  const normalOptions = allowedTransitions[offer.status] || [];
  const allOptions = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'].filter(
    (s) => s !== offer.status,
  );
  const options = isOverride ? allOptions : normalOptions;

  const { busy, error, setError, submit } = useAction(
    () =>
      onboardingApi.changeOfferStatus(offer.id, {
        newStatus,
        reason: reason.trim() || undefined,
        isOverride,
      }),
    onDone,
  );

  return (
    <Dialog
      title={`Change Status for ${offer.offerCode}`}
      description={`Current lifecycle status: ${OFFER_STATUS_LABELS[offer.status] || offer.status}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !newStatus}
            onClick={() => {
              if (isOverride && reason.trim().length < 10) {
                setError('Administrative overrides require a justification of at least 10 characters.');
                return;
              }
              if (['DECLINED', 'WITHDRAWN'].includes(newStatus) && !reason.trim()) {
                setError('A reason is required when transitioning to Declined or Withdrawn.');
                return;
              }
              submit();
            }}
            className={primaryClass}
          >
            {busy ? 'Updating…' : 'Update Status'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <div className="space-y-3">
        <div>
          <label htmlFor={`${ids}-status-select`} className={labelClass}>
            New Offer Status *
          </label>
          <select
            id={`${ids}-status-select`}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className={fieldClass}
          >
            <option value="">Select target status</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {OFFER_STATUS_LABELS[s as OfferStatus] || s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${ids}-status-reason`} className={labelClass}>
            Reason or Audit Note {isOverride ? '*' : ''}
          </label>
          <textarea
            id={`${ids}-status-reason`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isOverride ? 'Mandatory reason for administrative override...' : 'Optional comment...'}
            className={fieldClass}
          />
        </div>

        {can('onboarding.candidates.override') && (
          <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isOverride}
              onChange={(e) => {
                setIsOverride(e.target.checked);
                setNewStatus('');
              }}
              className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            Administrative Override (bypasses standard state transition rules)
          </label>
        )}
      </div>
    </Dialog>
  );
};

const VersionsModal: React.FC<{
  candidateId: string;
  documentId: string;
  versions: { id: string; versionNumber: number; title: string; changelogNote: string | null; createdAt: string; createdByName: string | null }[];
  onClose: () => void;
}> = ({ candidateId, documentId, versions, onClose }) => {
  return (
    <Dialog
      title="Offer Letter Version History"
      description="Inspect version snapshots and download historical copies."
      onClose={onClose}
      size="md"
      footer={
        <button type="button" onClick={onClose} className={actionClass}>
          Close
        </button>
      }
    >
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {versions.map((v) => (
          <div
            key={v.id}
            className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-white/5 flex items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Version {v.versionNumber}</span>
                <span className="text-xs text-slate-500">{formatDateTime(v.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{v.title}</p>
              {v.changelogNote && <p className="text-xs text-slate-500 italic mt-0.5">“{v.changelogNote}”</p>}
              {v.createdByName && <span className="text-[11px] text-slate-400 block mt-0.5">Author: {v.createdByName}</span>}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const file = await onboardingApi.downloadVersionPdf(candidateId, documentId, v.id);
                    const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
                    window.open(url, '_blank');
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Could not download PDF');
                  }
                }}
                className={actionClass}
                title="Download version PDF"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
};

const EmailsModal: React.FC<{
  emails: { id: string; toEmail: string; subject: string; deliveryStatus: string; sentAt: string; sentByName: string | null; errorMessage: string | null }[];
  onClose: () => void;
}> = ({ emails, onClose }) => {
  return (
    <Dialog
      title="Offer Letter Email History"
      description="Record of email deliveries for this offer letter."
      onClose={onClose}
      size="md"
      footer={
        <button type="button" onClick={onClose} className={actionClass}>
          Close
        </button>
      }
    >
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {emails.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No emails recorded yet for this offer letter.</p>
        ) : (
          emails.map((e) => (
            <div
              key={e.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-white/5 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">{e.toEmail}</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    e.deliveryStatus === 'SENT' || e.deliveryStatus === 'DELIVERED'
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}
                >
                  {e.deliveryStatus}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{e.subject}</p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span>Sent {formatDateTime(e.sentAt)}</span>
                {e.sentByName && <span>By {e.sentByName}</span>}
              </div>
              {e.errorMessage && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{e.errorMessage}</p>}
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
};
