import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, Upload } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  DOCUMENT_CATEGORIES,
  employeeProfileApi,
  type DocumentCategory,
  type EmployeeDocument,
} from '../../api/employee-profile.api';
import { day, errorText, fieldClass } from '../payroll/payroll-format';
import { Field, Section } from './profile-ui';
import { saveFile } from '../../utils/download';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
const statusOf = (d: EmployeeDocument): { label: string; variant: BadgeVariant } =>
  d.isExpired ? { label: 'Expired', variant: 'danger' }
    : d.status === 'VERIFIED' ? { label: 'Verified', variant: 'success' }
    : d.status === 'REJECTED' ? { label: 'Rejected', variant: 'danger' }
    : { label: 'Pending verification', variant: 'warning' };

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const uploadedOn = (iso: string) => day(iso.slice(0, 10));

/** The employee's documents on file: upload, view, download, replace, remove, verify and reject. */
export const DocumentsTab: React.FC<{ employeeId: string; employeeName: string; onChanged: () => void }> = ({ employeeId, employeeName, onChanged }) => {
  const { can } = useAuth();
  const canManage = can('people.documents.manage');
  const canVerify = can('people.documents.verify');
  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<
    | { kind: 'upload' }
    | { kind: 'view' | 'replace' | 'remove' | 'reject'; doc: EmployeeDocument }
    | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    employeeProfileApi.documents(employeeId).then((d) => live && setDocuments(d)).catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [employeeId, reload]);

  const changed = useCallback((next: EmployeeDocument[], message: string) => {
    setDocuments(next);
    setDialog(null);
    toast.success(message);
    onChanged();
  }, [onChanged]);

  const verify = async (doc: EmployeeDocument) => {
    setBusyId(doc.id);
    try {
      changed(await employeeProfileApi.verifyDocument(employeeId, doc.id), `${doc.title} verified`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const download = async (doc: EmployeeDocument) => {
    setBusyId(doc.id);
    try {
      saveFile(await employeeProfileApi.documentFile(employeeId, doc.id), doc.filename, doc.contentType);
    } catch (e) {
      toast.error(`${doc.title} could not be downloaded: ${errorText(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const pending = documents?.filter((d) => d.status === 'PENDING_VERIFICATION' && !d.isExpired).length ?? 0;
  const expired = documents?.filter((d) => d.isExpired).length ?? 0;

  return (
    <Section title="Documents"
      description={documents && documents.length > 0 ? [pending && `${pending} waiting for verification`, expired && `${expired} expired`].filter(Boolean).join(' · ') || 'All documents are reviewed.' : undefined}
      action={canManage && <Button variant="primary" size="sm" onClick={() => setDialog({ kind: 'upload' })}><Upload className="h-3.5 w-3.5" aria-hidden="true" /> Upload document</Button>}>
      {error ? (
        <div role="alert" className="text-sm text-red-700">
          Documents could not be loaded: {error} <button type="button" className="font-semibold underline" onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      ) : documents === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true" aria-label="Loading documents" />
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No documents on file</p>
          <p className="mt-1 text-sm text-slate-500">Keep {employeeName}’s identity proof, letters and certificates here, so they are verified once and found in one place.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">{employeeName}’s documents</caption>
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200 dark:border-[#2B293E]">
                {['Document', 'Category', 'Uploaded', 'Expires', 'Status'].map((h) => <th key={h} scope="col" className="px-2 py-2 font-bold">{h}</th>)}
                <th scope="col" className="px-2 py-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top text-slate-700 dark:divide-[#2B293E] dark:text-slate-300">
              {documents.map((doc) => {
                const status = statusOf(doc);
                return (
                  <tr key={doc.id}>
                    <td className="px-2 py-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{doc.title}</p>
                      <p className="text-xs text-slate-500">{doc.filename} · {size(doc.sizeBytes)}</p>
                      {doc.description && <p className="mt-0.5 text-xs text-slate-500">{doc.description}</p>}
                    </td>
                    <td className="px-2 py-3">{DOCUMENT_CATEGORIES[doc.category]}</td>
                    <td className="whitespace-nowrap px-2 py-3">{uploadedOn(doc.uploadedAt)}{doc.uploadedBy && <span className="block text-xs text-slate-500">by {doc.uploadedBy}</span>}</td>
                    <td className="whitespace-nowrap px-2 py-3">{doc.expiresOn ? day(doc.expiresOn) : '—'}</td>
                    <td className="px-2 py-3">
                      <Badge variant={status.variant} size="sm">{status.label}</Badge>
                      {doc.reviewedAt && doc.status !== 'PENDING_VERIFICATION' && (
                        <span className="mt-1 block text-xs text-slate-500">{doc.status === 'VERIFIED' ? 'Verified' : 'Rejected'} {uploadedOn(doc.reviewedAt)}{doc.reviewedBy ? ` by ${doc.reviewedBy}` : ''}</span>
                      )}
                      {doc.rejectionReason && <span className="mt-0.5 block text-xs text-red-700 dark:text-red-300">{doc.rejectionReason}</span>}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'view', doc })} aria-label={`View ${doc.title}`}><Eye className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => download(doc)} disabled={busyId === doc.id} aria-label={`Download ${doc.title}`}><Download className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                        {canVerify && doc.status === 'PENDING_VERIFICATION' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => verify(doc)} disabled={busyId === doc.id}>Verify</Button>
                            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'reject', doc })}>Reject</Button>
                          </>
                        )}
                        {canManage && <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'replace', doc })}>Replace</Button>}
                        {canManage && <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'remove', doc })} className="text-red-700">Remove</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'upload' && <UploadDialog employeeId={employeeId} onClose={() => setDialog(null)} onDone={(d) => changed(d, 'Document uploaded')} />}
      {dialog?.kind === 'replace' && <UploadDialog employeeId={employeeId} replacing={dialog.doc} onClose={() => setDialog(null)} onDone={(d) => changed(d, `${dialog.doc.title} replaced`)} />}
      {dialog?.kind === 'view' && <ViewDialog employeeId={employeeId} doc={dialog.doc} onClose={() => setDialog(null)} />}
      {(dialog?.kind === 'remove' || dialog?.kind === 'reject') && (
        <ReasonDialog employeeId={employeeId} employeeName={employeeName} doc={dialog.doc} kind={dialog.kind} onClose={() => setDialog(null)} onDone={changed} />
      )}
    </Section>
  );
};

const UploadDialog: React.FC<{ employeeId: string; replacing?: EmployeeDocument; onClose: () => void; onDone: (docs: EmployeeDocument[]) => void }> = ({ employeeId, replacing, onClose, onDone }) => {
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ category: '' as DocumentCategory | '', title: '', description: '', issuedOn: '', expiresOn: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = React.useId();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] ?? null;
    setError(null);
    if (chosen && chosen.size > MAX_BYTES) { setError('The file is larger than 10 MB. Upload a smaller copy.'); setFile(null); return; }
    if (chosen && !ACCEPT.split(',').includes(chosen.type)) { setError('Upload a PDF, JPG or PNG file.'); setFile(null); return; }
    setFile(chosen);
    if (chosen && !form.title) setForm((f) => ({ ...f, title: chosen.name.replace(/\.[^.]+$/, '').slice(0, 200) }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    if (!file) return setError('Choose a file to upload.');
    if (!replacing && !form.category) return setError('Choose a category.');
    if (!replacing && !form.title.trim()) return setError('Give the document a title.');
    if (form.issuedOn && form.expiresOn && form.expiresOn < form.issuedOn) return setError('The expiry date is before the issue date.');
    setIsSaving(true);
    setError(null);
    try {
      onDone(replacing
        ? await employeeProfileApi.replaceDocument(employeeId, replacing.id, file)
        : await employeeProfileApi.uploadDocument(employeeId, file, {
            category: form.category as DocumentCategory, title: form.title.trim(), description: form.description.trim() || undefined,
            issuedOn: form.issuedOn || undefined, expiresOn: form.expiresOn || undefined,
          }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog title={replacing ? `Replace ${replacing.title}` : 'Upload document'} onClose={() => !isSaving && onClose()} size="md"
      description={replacing ? 'The new file takes its place and is reviewed again. The previous file is kept in the record.' : 'PDF, JPG or PNG, up to 10 MB.'}
      footer={<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button><Button type="submit" form={formId} disabled={isSaving}>{isSaving ? 'Uploading…' : replacing ? 'Replace file' : 'Upload'}</Button></div>}>
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <Field label="File" required>{(a) => <input {...a} type="file" accept={ACCEPT} onChange={pick} className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800 dark:text-slate-200" required />}</Field>
        {!replacing && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Category" required>
                {(a) => (
                  <select {...a} className={fieldClass} value={form.category} onChange={set('category')} required>
                    <option value="">Choose…</option>
                    {Object.entries(DOCUMENT_CATEGORIES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Title" required>{(a) => <input {...a} className={fieldClass} maxLength={200} value={form.title} onChange={set('title')} required />}</Field>
              <Field label="Issued on">{(a) => <input {...a} type="date" className={fieldClass} value={form.issuedOn} onChange={set('issuedOn')} />}</Field>
              <Field label="Expires on" hint="For passports, visas and similar.">{(a) => <input {...a} type="date" className={fieldClass} value={form.expiresOn} min={form.issuedOn || undefined} onChange={set('expiresOn')} />}</Field>
            </div>
            <Field label="Description">{(a) => <textarea {...a} rows={2} maxLength={1000} className={fieldClass} value={form.description} onChange={set('description')} />}</Field>
          </>
        )}
      </form>
    </Dialog>
  );
};

const ReasonDialog: React.FC<{
  employeeId: string; employeeName: string; doc: EmployeeDocument; kind: 'remove' | 'reject';
  onClose: () => void; onDone: (docs: EmployeeDocument[], message: string) => void;
}> = ({ employeeId, employeeName, doc, kind, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = React.useId();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    if (reason.trim().length < 3) return setError(kind === 'remove' ? 'Say why the document is removed.' : 'Say what is wrong, so it can be fixed.');
    setIsSaving(true);
    setError(null);
    try {
      onDone(
        kind === 'remove' ? await employeeProfileApi.removeDocument(employeeId, doc.id, reason.trim()) : await employeeProfileApi.rejectDocument(employeeId, doc.id, reason.trim()),
        kind === 'remove' ? `${doc.title} removed` : `${doc.title} rejected`,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <Dialog title={kind === 'remove' ? `Remove ${doc.title} from ${employeeName}’s documents?` : `Reject ${doc.title}?`} onClose={() => !isSaving && onClose()} size="sm"
      description={kind === 'remove' ? 'It disappears from the list. The file and who removed it stay in the record for audit.' : 'It stays on file marked rejected, with your reason, until it is replaced.'}
      footer={<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button><Button type="submit" form={formId} variant="danger" disabled={isSaving}>{isSaving ? 'Saving…' : kind === 'remove' ? 'Remove document' : 'Reject document'}</Button></div>}>
      <form id={formId} onSubmit={submit} noValidate className="space-y-3">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Field label="Reason" required>{(a) => <textarea {...a} rows={3} maxLength={500} className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} required />}</Field>
      </form>
    </Dialog>
  );
};

const ViewDialog: React.FC<{ employeeId: string; doc: EmployeeDocument; onClose: () => void }> = ({ employeeId, doc, onClose }) => {
  const load = useCallback(() => employeeProfileApi.documentFile(employeeId, doc.id), [employeeId, doc.id]);
  const description = `${doc.filename} · ${DOCUMENT_CATEGORIES[doc.category]} · ${statusOf(doc).label}`;
  if (doc.contentType === 'application/pdf') return <PdfViewer title={doc.title} description={description} load={load} downloadName={doc.filename} onClose={onClose} />;
  return <ImageDialog title={doc.title} description={description} doc={doc} load={load} onClose={onClose} />;
};

const ImageDialog: React.FC<{ title: string; description: string; doc: EmployeeDocument; load: () => Promise<ArrayBuffer>; onClose: () => void }> = ({ title, description, doc, load, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const created = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    load()
      .then((bytes) => {
        if (!live) return;
        created.current = URL.createObjectURL(new Blob([bytes], { type: doc.contentType }));
        setUrl(created.current);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
      if (created.current) URL.revokeObjectURL(created.current);
    };
  }, [load, doc.contentType]);
  return (
    <Dialog title={title} description={description} size="lg" onClose={onClose}
      footer={<div className="flex justify-end gap-2">{url && <a href={url} download={doc.filename} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#2B293E] dark:text-slate-200">Download</a>}<Button type="button" variant="secondary" onClick={onClose}>Close</Button></div>}>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p>
        : !url ? <div className="h-96 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading the file</span></div>
        : <img src={url} alt={`${title} (${doc.filename})`} className="mx-auto max-h-[70vh] max-w-full rounded-lg" />}
    </Dialog>
  );
};
