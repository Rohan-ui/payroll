import React, { useEffect, useState } from 'react';
import { publicDocumentsApi, type PublicDocumentRequest, type PublicDocuments } from '../../api/public-documents.api';

const date = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const STATE_TEXT: Record<PublicDocumentRequest['state'], { label: string; className: string }> = {
  MISSING: { label: 'Not uploaded yet', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDING_REVIEW: { label: 'Uploaded, being checked', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  VERIFIED: { label: 'Accepted', className: 'bg-teal-50 text-teal-900 border-teal-200' },
  REJECTED: { label: 'Please upload again', className: 'bg-red-50 text-red-800 border-red-200' },
};

/**
 * The page a candidate opens from their document email. No sign-in: the
 * link's token is the only key. It lists what is asked of them and takes one
 * file per document; it never shows a stored file.
 */
export const PublicDocumentsView: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<PublicDocuments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<{ id: string; tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // The link carries the token: keep it out of requests to other sites.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    document.title = 'Upload your documents';
    publicDocumentsApi.view(token).then(setData).catch((e: Error) => setError(e.message));
    return () => meta.remove();
  }, [token]);

  const upload = async (request: PublicDocumentRequest, file: File, maxBytes: number) => {
    if (busy) return;
    const byName = /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!ALLOWED.includes(file.type) && !byName) return setRowMessage({ id: request.id, tone: 'error', text: 'Choose a PDF, JPG or PNG file.' });
    if (file.size === 0) return setRowMessage({ id: request.id, tone: 'error', text: 'That file is empty.' });
    if (file.size > maxBytes) return setRowMessage({ id: request.id, tone: 'error', text: 'That file is larger than 10 MB. Upload a smaller copy.' });
    setBusy(request.id);
    setRowMessage(null);
    try {
      setData(await publicDocumentsApi.upload(token, request.id, file));
      setRowMessage({ id: request.id, tone: 'ok', text: `${request.label} uploaded. We will check it and let you know if anything is wrong.` });
    } catch (e) {
      setRowMessage({ id: request.id, tone: 'error', text: e instanceof Error ? e.message : 'The file could not be uploaded. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
        <div role="alert" className="max-w-2xl mx-auto p-6 rounded-2xl border border-red-200 bg-white text-center">
          <h1 className="text-lg font-bold">This link can't be opened</h1>
          <p className="mt-2 text-sm text-slate-600">{error} If you think this is a mistake, reply to the email you received.</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="max-w-2xl mx-auto h-64 rounded-2xl bg-slate-200 animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading your documents</span></div>
      </main>
    );
  }

  const remaining = data.requests.filter((r) => r.isRequired && (r.state === 'MISSING' || r.state === 'REJECTED')).length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <header>
          <p className="text-sm font-semibold text-teal-700">{data.companyName}</p>
          <h1 className="text-2xl font-bold">Your joining documents</h1>
          <p className="text-sm text-slate-600">
            For {data.candidateName}.{data.linkExpiresAt ? ` This link works until ${date(data.linkExpiresAt)}.` : ''}
          </p>
        </header>

        <p role="status" className="p-4 rounded-2xl border border-slate-200 bg-white text-sm">
          {remaining > 0
            ? `${remaining} required document${remaining === 1 ? ' is' : 's are'} still needed. Upload each as a PDF, JPG or PNG file of up to 10 MB.`
            : 'Thank you: every required document is uploaded. We will contact you if anything needs to change.'}
        </p>

        <ul className="space-y-3" aria-label="Documents asked of you">
          {data.requests.map((request) => {
            const state = STATE_TEXT[request.state];
            const message = rowMessage?.id === request.id ? rowMessage : null;
            return (
              <li key={request.id} className="p-4 rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold break-words">{request.label}</h2>
                    <p className="text-xs text-slate-500">{request.isRequired ? 'Required' : 'Optional'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${state.className}`}>{state.label}</span>
                </div>
                {request.lastFilename && request.lastUploadedAt && (
                  <p className="mt-2 text-xs text-slate-600 break-all">Last uploaded: {request.lastFilename}, {date(request.lastUploadedAt)}</p>
                )}
                {request.rejectionReason && <p className="mt-2 text-sm text-red-800">Why it was not accepted: {request.rejectionReason}</p>}
                {request.canUpload && (
                  <div className="mt-3">
                    <label
                      className={`inline-flex px-4 py-2 rounded-xl font-semibold text-sm cursor-pointer focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2 ${
                        request.state === 'MISSING' || request.state === 'REJECTED' ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'border border-slate-300 text-slate-800'
                      } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      {busy === request.id ? 'Uploading…' : request.state === 'MISSING' ? 'Choose a file' : 'Upload a new copy'}
                      <span className="sr-only">: {request.label}</span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                        disabled={busy !== null}
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) upload(request, file, data.maxFileBytes);
                        }}
                      />
                    </label>
                  </div>
                )}
                {message && (
                  <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm ${message.tone === 'error' ? 'text-red-800' : 'text-teal-800'}`}>
                    {message.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500">Your files are sent only to {data.companyName} and kept privately. Please don't forward this link.</p>
      </div>
    </main>
  );
};
