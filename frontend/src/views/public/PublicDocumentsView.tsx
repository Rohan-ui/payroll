import React, { useEffect, useState } from 'react';
import { publicDocumentsApi, type PublicDocumentRequest, type PublicDocuments, type PublicDocumentSlotStatus } from '../../api/public-documents.api';

const date = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const STATE_TEXT: Record<PublicDocumentRequest['state'], { label: string; className: string }> = {
  MISSING: { label: 'Not uploaded yet', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  INCOMPLETE: { label: 'Incomplete', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  PENDING_REVIEW: { label: 'Uploaded, being checked', className: 'bg-blue-50 text-blue-900 border-blue-200' },
  PARTIALLY_VERIFIED: { label: 'Partially verified', className: 'bg-purple-50 text-purple-900 border-purple-200' },
  VERIFIED: { label: 'Accepted', className: 'bg-teal-50 text-teal-900 border-teal-200' },
  REJECTED: { label: 'Needs attention', className: 'bg-red-50 text-red-800 border-red-200' },
};

const FILE_STATE_TEXT: Record<string, { label: string; className: string }> = {
  PENDING_REVIEW: { label: 'Under review', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  VERIFIED: { label: 'Accepted', className: 'bg-teal-50 text-teal-800 border-teal-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-800 border-red-200' },
};

export const PublicDocumentsView: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<PublicDocuments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<{ id: string; tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    document.title = 'Upload your joining documents';
    publicDocumentsApi
      .view(token)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    return () => meta.remove();
  }, [token]);

  const uploadFiles = async (
    request: PublicDocumentRequest,
    files: File[],
    meta?: { slotName?: string; replacedFileId?: string },
  ) => {
    if (busy) return;
    if (files.length === 0) return;

    const maxBytes = data?.maxFileBytes ?? 10 * 1024 * 1024;
    for (const f of files) {
      const byName = /\.(pdf|jpe?g|png)$/i.test(f.name);
      if (!ALLOWED.includes(f.type) && !byName) {
        return setRowMessage({
          id: request.id,
          tone: 'error',
          text: `"${f.name}" is not supported. Please upload PDF, JPG, or PNG files only.`,
        });
      }
      if (f.size === 0) {
        return setRowMessage({ id: request.id, tone: 'error', text: `"${f.name}" is empty.` });
      }
      if (f.size > maxBytes) {
        return setRowMessage({
          id: request.id,
          tone: 'error',
          text: `"${f.name}" is larger than ${formatBytes(maxBytes)}. Upload a smaller copy.`,
        });
      }
    }

    const currentCount = request.activeFiles?.length ?? 0;
    const maxFiles = request.maxFiles ?? 1;
    if (!meta?.replacedFileId && !meta?.slotName && currentCount + files.length > maxFiles) {
      return setRowMessage({
        id: request.id,
        tone: 'error',
        text: `You can upload at most ${maxFiles} file${maxFiles === 1 ? '' : 's'} for ${request.label}. You currently have ${currentCount} uploaded.`,
      });
    }

    const busyKey = meta?.slotName ? `${request.id}:${meta.slotName}` : meta?.replacedFileId ? `${request.id}:${meta.replacedFileId}` : request.id;
    setBusy(busyKey);
    setRowMessage(null);

    try {
      const payload = files.length === 1 ? files[0] : files;
      const next = await publicDocumentsApi.upload(token, request.id, payload, meta);
      setData(next);
      const slotDesc = meta?.slotName ? ` (${meta.slotName})` : '';
      setRowMessage({
        id: request.id,
        tone: 'ok',
        text: `${request.label}${slotDesc} uploaded. We will check it and let you know if anything is wrong.`,
      });
    } catch (e) {
      setRowMessage({
        id: request.id,
        tone: 'error',
        text: e instanceof Error ? e.message : 'The file could not be uploaded. Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
        <div role="alert" className="max-w-2xl mx-auto p-6 rounded-2xl border border-red-200 bg-white text-center shadow-sm">
          <h1 className="text-lg font-bold text-red-900">This link can't be opened</h1>
          <p className="mt-2 text-sm text-slate-600">{error} If you think this is a mistake, reply to the email you received.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="max-w-2xl mx-auto h-64 rounded-2xl bg-slate-200 animate-pulse motion-reduce:animate-none" aria-busy="true">
          <span className="sr-only" role="status">Loading your documents</span>
        </div>
      </main>
    );
  }

  const requiredRequests = data.requests.filter((r) => r.isRequired);
  const verifiedCount = requiredRequests.filter((r) => r.state === 'VERIFIED').length;
  const remainingCount = requiredRequests.filter((r) => r.state === 'MISSING' || r.state === 'INCOMPLETE' || r.state === 'REJECTED').length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{data.companyName}</p>
          <h1 className="text-2xl font-bold mt-1">Your joining documents</h1>
          <p className="text-sm text-slate-600 mt-1">
            For {data.candidateName}.{data.linkExpiresAt ? ` This link works until ${date(data.linkExpiresAt)}.` : ''}
          </p>

          <p role="status" className="mt-4 p-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm">
            {remainingCount > 0
              ? `${remainingCount} required document${remainingCount === 1 ? ' is' : 's are'} still needed. Upload each as a PDF, JPG or PNG file of up to 10 MB.`
              : 'Thank you: every required document is uploaded. We will contact you if anything needs to change.'}
          </p>
        </header>

        <ul className="space-y-4" aria-label="Documents required for onboarding">
          {data.requests.map((request) => {
            const state = STATE_TEXT[request.state];
            const message = rowMessage?.id === request.id ? rowMessage : null;
            const isSlotted = Array.isArray(request.slots) && request.slots.length > 0;
            const minFiles = request.minFiles ?? 1;
            const maxFiles = request.maxFiles ?? 1;
            const activeFiles = request.activeFiles ?? [];
            const isMaxReached = activeFiles.length >= maxFiles;

            return (
              <li key={request.id} className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-base text-slate-900">{request.label}</h2>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          request.isRequired ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {request.isRequired ? 'Required' : 'Optional'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isSlotted
                        ? `Required slots: ${request.slots?.join(' + ')}`
                        : minFiles === maxFiles
                        ? `${minFiles} file${minFiles > 1 ? 's' : ''} required`
                        : `Upload between ${minFiles} and ${maxFiles} files`}
                      {' · '}
                      <span className="font-medium text-slate-700">
                        {activeFiles.length} of {maxFiles} uploaded
                      </span>
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${state.className}`}>
                    {state.label}
                  </span>
                </div>

                {request.rejectionReason && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                    Why it was not accepted: {request.rejectionReason}
                  </div>
                )}

                {/* Slotted Documents View (e.g. Aadhaar Front/Back) */}
                {isSlotted && request.slotsStatus && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Document Slots</p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {request.slotsStatus.map((slot) => {
                        const slotBusyKey = `${request.id}:${slot.slotName}`;
                        const isSlotBusy = busy === slotBusyKey;
                        const slotFileState = slot.file?.reviewStatus ? FILE_STATE_TEXT[slot.file.reviewStatus] : null;

                        return (
                          <div
                            key={slot.slotName}
                            className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                              slot.isUploaded
                                ? slot.file?.reviewStatus === 'REJECTED'
                                  ? 'border-red-200 bg-red-50/40'
                                  : 'border-slate-200 bg-slate-50/50'
                                : 'border-dashed border-amber-300 bg-amber-50/30'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold text-xs text-slate-800">{slot.slotName}</span>
                                {slotFileState ? (
                                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${slotFileState.className}`}>
                                    {slotFileState.label}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-amber-100 text-amber-800 border-amber-200">
                                    Missing
                                  </span>
                                )}
                              </div>

                              {slot.isUploaded && slot.file?.filename && (
                                <p className="mt-1.5 text-xs text-slate-600 break-all font-mono">
                                  {slot.file.filename}
                                </p>
                              )}
                              {slot.isUploaded && slot.file?.uploadedAt && (
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Uploaded on {date(slot.file.uploadedAt)}
                                </p>
                              )}
                              {slot.file?.rejectionReason && (
                                <p className="mt-1 text-xs text-red-700 bg-white/70 p-1.5 rounded border border-red-200">
                                  <span className="font-medium">Reason: </span>
                                  {slot.file.rejectionReason}
                                </p>
                              )}
                            </div>

                            {request.canUpload && (
                              <div className="mt-3">
                                <label
                                  className={`inline-flex items-center justify-center w-full px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                                    slot.isUploaded
                                      ? slot.file?.reviewStatus === 'REJECTED'
                                        ? 'bg-red-600 hover:bg-red-700 text-white border-transparent'
                                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                                      : 'bg-teal-600 hover:bg-teal-700 text-white border-transparent'
                                  } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                  {isSlotBusy
                                    ? 'Uploading…'
                                    : slot.isUploaded
                                    ? slot.file?.reviewStatus === 'REJECTED'
                                      ? `Replace ${slot.slotName}`
                                      : `Re-upload ${slot.slotName}`
                                    : `Upload ${slot.slotName}`}
                                  <input
                                    type="file"
                                    accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                                    disabled={busy !== null}
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = '';
                                      if (file) {
                                        uploadFiles(request, [file], {
                                          slotName: slot.slotName,
                                          replacedFileId: slot.file?.id,
                                        });
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Generic Multi-File / Non-slotted Document View */}
                {!isSlotted && (
                  <div className="space-y-3">
                    {activeFiles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          Uploaded Files ({activeFiles.length} of {maxFiles})
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
                          {activeFiles.map((f) => {
                            const fState = FILE_STATE_TEXT[f.reviewStatus] ?? { label: f.reviewStatus, className: 'bg-slate-100 text-slate-700' };
                            const fBusyKey = `${request.id}:${f.id}`;
                            const isFBusy = busy === fBusyKey;

                            return (
                              <li key={f.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0 pr-2">
                                  <p className="text-xs font-medium text-slate-900 break-all">{f.filename}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {formatBytes(f.sizeBytes)} · {date(f.uploadedAt)}
                                  </p>
                                  {f.rejectionReason && (
                                    <p className="mt-1 text-xs text-red-700 font-medium">
                                      Reason: {f.rejectionReason}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${fState.className}`}>
                                    {fState.label}
                                  </span>
                                  {request.canUpload && f.reviewStatus === 'REJECTED' && (
                                    <label
                                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white cursor-pointer ${
                                        busy ? 'opacity-50 pointer-events-none' : ''
                                      }`}
                                    >
                                      {isFBusy ? 'Uploading…' : 'Replace file'}
                                      <input
                                        type="file"
                                        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                                        disabled={busy !== null}
                                        className="sr-only"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          e.target.value = '';
                                          if (file) {
                                            uploadFiles(request, [file], { replacedFileId: f.id });
                                          }
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {request.canUpload && !isMaxReached && (
                      <div className="pt-2">
                        <label
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                            activeFiles.length === 0
                              ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                              : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
                          } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          {busy === request.id
                            ? 'Uploading…'
                            : activeFiles.length === 0
                            ? maxFiles > 1
                              ? 'Choose files (single or multiple)'
                              : 'Choose file to upload'
                            : `Add more files (${activeFiles.length}/${maxFiles})`}
                          <span className="sr-only">: {request.label}</span>
                          <input
                            type="file"
                            multiple={maxFiles > 1}
                            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                            disabled={busy !== null}
                            className="sr-only"
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              e.target.value = '';
                              if (files.length > 0) {
                                uploadFiles(request, files);
                              }
                            }}
                          />
                        </label>
                        <span className="ml-3 text-[11px] text-slate-500">
                          PDF, JPG or PNG up to {formatBytes(data.maxFileBytes)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {message && (
                  <p
                    role={message.tone === 'error' ? 'alert' : 'status'}
                    className={`text-xs p-2.5 rounded-lg border ${
                      message.tone === 'error'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-teal-200 bg-teal-50 text-teal-800'
                    }`}
                  >
                    {message.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="text-center text-xs text-slate-500 py-4">
          Your documents are encrypted and accessible only to {data.companyName}’s authorized HR personnel.
        </footer>
      </div>
    </main>
  );
};
