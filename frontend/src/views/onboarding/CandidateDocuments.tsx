import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_STATE_LABELS,
  FILE_REVIEW_LABELS,
  MAX_DOCUMENT_BYTES,
  onboardingApi,
  type CandidateDocuments as Documents,
  type DocumentFile,
  type DocumentRequest,
  type DocumentState,
  type EmailOutcome,
  fetchFile,
} from '../../api/onboarding.api';
import { fieldClass, formatDate, formatDateTime, labelClass } from './onboarding-format';
import { describeEmails } from './InterviewDialogs';
import { PdfViewer } from '../../components/ui/PdfViewer';

interface Props {
  candidateId: string;
  candidateName: string;
  /** Called after anything that may have moved the candidate, so their stage and timeline reload. */
  onChanged: () => void;
}

const STATE_VARIANT: Record<DocumentState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  MISSING: 'neutral',
  PENDING_REVIEW: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
};
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
const primaryClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50';

export const formatBytes = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

/** Why a chosen file would be refused, before sending it; the server checks the content again. */
export function fileProblem(file: File): string | null {
  const byName = /\.(pdf|jpe?g|png)$/i.test(file.name);
  if (!ALLOWED_TYPES.includes(file.type) && !byName) return 'Choose a PDF, JPG or PNG file.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) return `That file is ${formatBytes(file.size)}. Files can be up to 10 MB.`;
  return null;
}

type Open =
  | { kind: 'request' }
  | { kind: 'link' }
  | { kind: 'view'; request: DocumentRequest; file: DocumentFile }
  | { kind: 'reject'; request: DocumentRequest; file: DocumentFile }
  | null;

/**
 * A candidate's documents: what was asked of them, each upload and its review,
 * and the link that lets the candidate upload their own. Shown only to members
 * who may see documents; each action appears only for those allowed to take it.
 */
export const CandidateDocuments: React.FC<Props> = ({ candidateId, candidateName, onChanged }) => {
  const ids = useId();
  const { can } = useAuth();
  const [documents, setDocuments] = useState<Documents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    onboardingApi.documents(candidateId).then(setDocuments).catch((e: Error) => setError(e.message));
  }, [candidateId]);
  useEffect(load, [load]);

  const changed = (next: Documents, message: string, emails?: EmailOutcome[]) => {
    setDocuments(next);
    setOpen(null);
    setNotice(describeEmails(emails));
    toast.success(message);
    onChanged();
  };

  const upload = async (request: DocumentRequest, file: File) => {
    const problem = fileProblem(file);
    if (problem) return setRowError({ id: request.id, text: problem });
    if (busy) return;
    setBusy(request.id);
    setRowError(null);
    try {
      changed(await onboardingApi.uploadDocument(candidateId, request.id, file), `${request.label} uploaded`);
    } catch (e) {
      setRowError({ id: request.id, text: e instanceof Error ? e.message : 'The file could not be uploaded.' });
    } finally {
      setBusy(null);
    }
  };

  const act = async (key: string, run: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await run();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const section = (body: React.ReactNode, actions?: React.ReactNode) => (
    <section aria-labelledby={`${ids}-documents`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${ids}-documents`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Documents</h2>
        {actions}
      </div>
      {body}
    </section>
  );

  if (error) {
    return section(
      <div role="alert" className="mt-2 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
        The documents could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
      </div>,
    );
  }
  if (!documents) {
    return section(<div className="mt-3 h-24 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading documents</span></div>);
  }

  const canManage = can('onboarding.documents.manage') && documents.canChange;
  const canVerify = can('onboarding.documents.verify') && documents.canChange;
  const hasRequests = documents.requests.length > 0;
  const { counts, link } = documents;

  return (
    <>
      {section(
        <>
          {hasRequests && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {counts.verified} of {counts.required} required verified{counts.toReview > 0 ? ` · ${counts.toReview} to verify` : ''}
            </p>
          )}
          {documents.canSendLink && hasRequests && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {link.sentAt
                ? `Upload link sent ${formatDateTime(link.sentAt)}${link.expiresAt ? `; it works until ${formatDate(link.expiresAt.slice(0, 10))}` : ''}.`
                : 'The candidate has not been sent an upload link yet.'}
            </p>
          )}
          {notice && (
            <div role="status" className={`mt-3 p-3 rounded-xl border text-sm flex items-start justify-between gap-3 ${notice.tone === 'ok' ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              <span>{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline shrink-0">Dismiss</button>
            </div>
          )}

          {!hasRequests ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              No documents asked for yet.{' '}
              {canManage ? 'Ask for what the candidate must provide before joining, such as their PAN card, Aadhaar card and certificates.' : ''}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {documents.requests.map((request) => {
                const latest = request.files[0] ?? null;
                const live = request.files.find((f) => f.reviewStatus === 'PENDING_REVIEW' || f.reviewStatus === 'VERIFIED') ?? null;
                const older = request.files.filter((f) => f !== live && f !== latest);
                const shown = live ?? latest;
                return (
                  <li key={request.id} className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 break-words">
                          {request.label} <span className="font-normal text-xs text-slate-500">{request.isRequired ? 'Required' : 'Optional'}</span>
                        </p>
                        {shown ? (
                          <p className="text-xs text-slate-600 dark:text-slate-400 break-all">
                            {shown.filename} · {formatBytes(shown.sizeBytes)} · uploaded by {shown.uploadedBy ?? 'a former member'} on {formatDateTime(shown.uploadedAt)}
                            {shown.version > 1 ? ` · version ${shown.version}` : ''}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">Nothing uploaded yet.</p>
                        )}
                        {shown?.reviewStatus === 'VERIFIED' && shown.reviewedBy && shown.reviewedAt && <p className="text-xs text-slate-500">Verified by {shown.reviewedBy} on {formatDateTime(shown.reviewedAt)}</p>}
                        {request.state === 'REJECTED' && latest?.rejectionReason && (
                          <p className="mt-1 text-xs text-red-700 dark:text-red-300">Rejected{latest.reviewedBy ? ` by ${latest.reviewedBy}` : ''}: {latest.rejectionReason}</p>
                        )}
                      </div>
                      <Badge variant={STATE_VARIANT[request.state]} size="sm">{DOCUMENT_STATE_LABELS[request.state]}</Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {shown && (
                        <button type="button" onClick={() => setOpen({ kind: 'view', request, file: shown })} className={actionClass} aria-label={`View ${request.label}`}>
                          View
                        </button>
                      )}
                      {canVerify && live?.reviewStatus === 'PENDING_REVIEW' && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => act(live.id, async () => { const r = await onboardingApi.verifyDocument(candidateId, live.id); changed(r.documents, `${request.label} verified`, r.notifications); })}
                          className={primaryClass}
                          aria-label={`Verify ${request.label}`}
                        >
                          {busy === live.id ? 'Verifying…' : 'Verify'}
                        </button>
                      )}
                      {canVerify && live && (
                        <button type="button" disabled={busy !== null} onClick={() => setOpen({ kind: 'reject', request, file: live })} className={`${actionClass} text-red-700`} aria-label={`Reject ${request.label}`}>
                          Reject
                        </button>
                      )}
                      {canManage && request.state !== 'VERIFIED' && (
                        <UploadButton
                          label={shown ? 'Upload a new copy' : 'Upload'}
                          name={request.label}
                          busy={busy === request.id}
                          disabled={busy !== null}
                          onFile={(file) => upload(request, file)}
                        />
                      )}
                      {canManage && request.files.length === 0 && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => act(`remove-${request.id}`, async () => changed(await onboardingApi.removeDocumentRequest(candidateId, request.id), `${request.label} removed from the list`))}
                          className={actionClass}
                          aria-label={`Remove ${request.label} from the list`}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {rowError?.id === request.id && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{rowError.text}</p>}

                    {older.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">Earlier uploads ({older.length})</summary>
                        <ul className="mt-1 space-y-1">
                          {older.map((file) => (
                            <li key={file.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                              <span className="break-all">Version {file.version}: {file.filename}, {formatDateTime(file.uploadedAt)}</span>
                              <span>({FILE_REVIEW_LABELS[file.reviewStatus]}{file.rejectionReason ? `: ${file.rejectionReason}` : ''})</span>
                              <button type="button" onClick={() => setOpen({ kind: 'view', request, file })} className="font-semibold text-teal-700 dark:text-teal-300 underline">
                                View<span className="sr-only"> version {file.version}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>,
        <div className="flex flex-wrap gap-2">
          {canManage && documents.canSendLink && hasRequests && (
            <button type="button" onClick={() => setOpen({ kind: 'link' })} className={actionClass}>{link.sentAt ? 'Send a new upload link' : 'Send upload link'}</button>
          )}
          {canManage && (
            <button type="button" onClick={() => setOpen({ kind: 'request' })} className={primaryClass}>Ask for documents</button>
          )}
        </div>,
      )}

      {open?.kind === 'request' && (
        <RequestDocumentsDialog
          documents={documents}
          onClose={() => setOpen(null)}
          onSubmit={async (items) => changed(await onboardingApi.requestDocuments(candidateId, items), 'Documents requested')}
        />
      )}
      {open?.kind === 'view' && <DocumentViewer url={onboardingApi.documentFileUrl(candidateId, open.file.id)} file={open.file} title={open.request.label} onClose={() => setOpen(null)} />}
      {open?.kind === 'reject' && (
        <RejectDocumentDialog
          label={open.request.label}
          candidateName={candidateName}
          linkSent={Boolean(link.sentAt) && documents.canSendLink}
          onClose={() => setOpen(null)}
          onSubmit={async (reason) => {
            const r = await onboardingApi.rejectDocument(candidateId, open.file.id, reason);
            changed(r.documents, `${open.request.label} rejected`, r.notifications);
          }}
        />
      )}
      {open?.kind === 'link' && (
        <Dialog
          title={link.sentAt ? `Send ${candidateName} a new upload link?` : `Email ${candidateName} a link to upload their documents?`}
          description="The link lets them see what is asked of them and upload each document, and works for 30 days."
          size="sm"
          onClose={() => setOpen(null)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(null)} className={actionClass}>Cancel</button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  act('link', async () => {
                    const r = await onboardingApi.sendDocumentLink(candidateId);
                    const sent = r.notifications.some((n) => n.status === 'SENT');
                    setDocuments(r.documents);
                    setOpen(null);
                    setNotice(describeEmails(r.notifications));
                    if (sent) {
                      toast.success('Upload link sent');
                      onChanged();
                    }
                  })
                }
                className={primaryClass}
              >
                {busy === 'link' ? 'Sending…' : link.sentAt ? 'Send new link' : 'Send link'}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {link.sentAt ? 'The link sent earlier will stop working as soon as the new one is sent.' : 'It is sent from your workspace’s email account to the candidate’s email address.'}
          </p>
        </Dialog>
      )}
    </>
  );
};

/** A button that opens the file picker; the input is the real control, so it is reachable by keyboard. */
const UploadButton: React.FC<{ label: string; name: string; busy: boolean; disabled: boolean; onFile: (file: File) => void }> = ({ label, name, busy, disabled, onFile }) => (
  <label className={`${actionClass} cursor-pointer focus-within:ring-2 focus-within:ring-teal-500 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    {busy ? 'Uploading…' : label}
    <input
      type="file"
      accept={DOCUMENT_ACCEPT}
      disabled={disabled}
      aria-label={`${label}: ${name}`}
      className="sr-only"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) onFile(file);
      }}
    />
  </label>
);

const RequestDocumentsDialog: React.FC<{
  documents: Documents;
  onClose: () => void;
  onSubmit: (items: { type: string; label?: string; isRequired: boolean }[]) => Promise<void>;
}> = ({ documents, onClose, onSubmit }) => {
  const ids = useId();
  const taken = new Set(documents.requests.map((r) => r.label.toLowerCase()));
  const choices = documents.types.filter((t) => t.type !== 'OTHER');
  const [chosen, setChosen] = useState<Record<string, { ask: boolean; required: boolean }>>({});
  const [other, setOther] = useState({ label: '', required: true });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const items: { type: string; label?: string; isRequired: boolean }[] = choices
      .filter((c) => chosen[c.type]?.ask)
      .map((c) => ({ type: c.type, isRequired: chosen[c.type].required }));
    const otherLabel = other.label.trim();
    if (otherLabel) {
      if (taken.has(otherLabel.toLowerCase())) return setError(`${otherLabel} is already asked for.`);
      items.push({ type: 'OTHER', label: otherLabel, isRequired: other.required });
    }
    if (items.length === 0) return setError('Choose at least one document, or name another one.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The documents could not be requested.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Ask for documents"
      description="The candidate sees these on their upload link. Required documents must be verified before they are ready to join."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className={primaryClass}>{saving ? 'Saving…' : 'Ask for these'}</button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      <fieldset>
        <legend className={labelClass}>Documents</legend>
        <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
          {choices.map((c) => {
            const already = taken.has(c.label.toLowerCase());
            const state = chosen[c.type] ?? { ask: false, required: true };
            return (
              <li key={c.type} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={already} checked={already || state.ask} onChange={(e) => setChosen({ ...chosen, [c.type]: { ...state, ask: e.target.checked } })} />
                  <span className={already ? 'text-slate-400' : ''}>{c.label}{already ? ' (already asked for)' : ''}</span>
                </label>
                {state.ask && !already && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input type="checkbox" checked={state.required} onChange={(e) => setChosen({ ...chosen, [c.type]: { ...state, required: e.target.checked } })} />
                    Required<span className="sr-only">: {c.label}</span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="mt-3">
        <label htmlFor={`${ids}-other`} className={labelClass}>Another document (optional)</label>
        <input id={`${ids}-other`} value={other.label} maxLength={120} onChange={(e) => setOther({ ...other, label: e.target.value })} placeholder="For example: Class 12 marksheet" className={fieldClass} />
        {other.label.trim() && (
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={other.required} onChange={(e) => setOther({ ...other, required: e.target.checked })} />
            Required
          </label>
        )}
      </div>
    </Dialog>
  );
};

const RejectDocumentDialog: React.FC<{ label: string; candidateName: string; linkSent: boolean; onClose: () => void; onSubmit: (reason: string) => Promise<void> }> = ({
  label,
  candidateName,
  linkSent,
  onClose,
  onSubmit,
}) => {
  const ids = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 3) return setError('Say why the document is not accepted, so the candidate can fix it.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The document could not be rejected.');
      setSaving(false);
    }
  };
  return (
    <Dialog
      title={`Reject ${candidateName}’s ${label}?`}
      description={linkSent ? 'The candidate is emailed the reason and can upload a new copy with their link.' : 'The reason is kept on record. Send an upload link so the candidate can upload a new copy.'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
            {saving ? 'Rejecting…' : `Reject ${label}`}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      <label htmlFor={`${ids}-reason`} className={labelClass}>Reason *</label>
      <textarea id={`${ids}-reason`} rows={3} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
      <p className="mt-1 text-xs text-slate-500">For example: “The photo is blurred and the number can’t be read.”</p>
    </Dialog>
  );
};

/**
 * Shows an uploaded file inside the app, fetched with the session; nothing is
 * served from a public address. PDFs open in the full PDF viewer, photos here.
 */
export const DocumentViewer: React.FC<{ url: string; file: DocumentFile; title: string; onClose: () => void }> = ({ url, file, title, onClose }) => {
  const description = `${file.filename} · version ${file.version} · ${FILE_REVIEW_LABELS[file.reviewStatus]}`;
  if (file.contentType === 'application/pdf') {
    return <PdfViewer title={title} description={description} load={() => fetchFile(url)} downloadName={file.filename} onClose={onClose} />;
  }
  return <ImageViewer url={url} file={file} title={title} description={description} onClose={onClose} />;
};

const ImageViewer: React.FC<{ url: string; file: DocumentFile; title: string; description: string; onClose: () => void }> = ({ url, file, title, description, onClose }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const created = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFile(url)
      .then((bytes) => {
        if (cancelled) return;
        created.current = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
        setObjectUrl(created.current);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (created.current) URL.revokeObjectURL(created.current);
    };
  }, [url, file.contentType]);

  return (
    <Dialog
      title={title}
      description={description}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {objectUrl && <a href={objectUrl} download={file.filename} className={actionClass}>Download</a>}
          <button type="button" onClick={onClose} className={actionClass}>Close</button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>
      ) : !objectUrl ? (
        <div className="h-96 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading the file</span></div>
      ) : (
        <img src={objectUrl} alt={`${title}: ${file.filename}`} className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
      )}
    </Dialog>
  );
};
