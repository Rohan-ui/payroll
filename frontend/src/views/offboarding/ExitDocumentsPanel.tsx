import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { toast } from '../../lib/toast';
import { useAuth } from '../../context/AuthContext';
import { exitDocumentsApi, type ExitDocument, type ExitDocuments, type ExitDocumentType } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, labelClass } from '../payroll/payroll-format';

/**
 * The exit's letters and settlement statement: generate a draft, preview it,
 * regenerate it while it is a draft, and issue it. An issued document never
 * changes. Files come only through the session.
 */
export const ExitDocumentsPanel: React.FC<{ separationId: string; employeeName: string; isCompleted: boolean }> = ({ separationId, employeeName, isCompleted }) => {
  const { can } = useAuth();
  const canManage = can('offboarding.documents.manage');
  const canIssue = can('offboarding.documents.issue');
  const [state, setState] = useState<ExitDocuments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExitDocument | null>(null);
  const [issuing, setIssuing] = useState<ExitDocument | null>(null);
  const [template, setTemplate] = useState<Partial<Record<ExitDocumentType, string>>>({});

  const load = useCallback(() => {
    setError(null);
    exitDocumentsApi.list(separationId).then(setState).catch((e) => setError(errorText(e)));
  }, [separationId]);
  useEffect(load, [load]);

  const generate = async (type: ExitDocumentType) => {
    setBusy(type);
    setError(null);
    try {
      setState(await exitDocumentsApi.generate(separationId, { documentType: type, templateId: template[type] || undefined }));
      toast.success('Draft generated');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="exit-documents-heading">
      <h3 id="exit-documents-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Exit documents</h3>
      <p className="mt-1 text-xs text-slate-500">Made from {employeeName}’s employment records. Letters are issued once the exit is complete; the statement once the settlement is approved.</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!state && !error && <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading documents</span></div>}
      {state && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
          {state.types.map(({ type, label }) => {
            const doc = state.documents.find((d) => d.type === type);
            const templates = state.templates.filter((t) => t.kind === type);
            const issued = doc?.status === 'ISSUED';
            return (
              <li key={type} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</p>
                  {doc ? (
                    <p className="text-xs text-slate-500">
                      <Badge size="sm" variant={issued ? 'success' : 'neutral'}>{issued ? 'Issued' : 'Draft'}</Badge>{' '}
                      Version {doc.version} · {doc.generatedBy ? `${issued ? 'issued' : 'generated'} by ${doc.generatedBy}, ` : ''}{day(doc.generatedAt.slice(0, 10))}
                    </p>
                  ) : <p className="text-xs text-slate-500">Not generated yet.</p>}
                  {doc && doc.missing.length > 0 && (
                    <p className="mt-1 flex gap-1 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Missing from the records: {doc.missing.join(', ')}. Add them, then regenerate.</p>
                  )}
                  {canManage && !issued && templates.length > 0 && (
                    <div className="mt-2 max-w-xs">
                      <label htmlFor={`exit-doc-template-${type}`} className={labelClass}>Template</label>
                      <select id={`exit-doc-template-${type}`} className={fieldClass} value={template[type] ?? ''} onChange={(e) => setTemplate((t) => ({ ...t, [type]: e.target.value }))}>
                        <option value="">Newest template</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {doc && <Button size="sm" variant="outline" onClick={() => setPreview(doc)} aria-label={`Preview ${label}`}>Preview</Button>}
                  {canManage && !issued && (
                    <Button size="sm" variant={doc ? 'ghost' : 'secondary'} loading={busy === type} disabled={!!busy} onClick={() => generate(type)}>{doc ? 'Regenerate' : 'Generate'}</Button>
                  )}
                  {canIssue && doc && !issued && (
                    <Button size="sm" onClick={() => setIssuing(doc)} disabled={doc.missing.length > 0 || (type !== 'FULL_AND_FINAL_STATEMENT' && !isCompleted)}
                      title={type !== 'FULL_AND_FINAL_STATEMENT' && !isCompleted ? 'Letters are issued once the exit is complete' : undefined}>Issue…</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <PdfViewer title={preview.title} description={preview.status === 'DRAFT' ? 'Draft: not yet issued' : `Issued, version ${preview.version}`}
          load={() => exitDocumentsApi.pdf(separationId, preview.id)} downloadName={`${preview.title}.pdf`} onClose={() => setPreview(null)} />
      )}
      {issuing && <IssueDialog doc={issuing} employeeName={employeeName} onClose={() => setIssuing(null)}
        run={async () => { setState(await exitDocumentsApi.issue(separationId, issuing.id)); setIssuing(null); toast.success(`${issuing.label} issued`); }} />}
    </section>
  );
};

const IssueDialog: React.FC<{ doc: ExitDocument; employeeName: string; onClose: () => void; run: () => Promise<void> }> = ({ doc, employeeName, onClose, run }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Issue ${employeeName}’s ${doc.label.toLowerCase()}?`} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Not yet</Button><Button onClick={go} loading={busy} disabled={busy}>Issue {doc.label.toLowerCase()}</Button></>}>
      <p className="text-sm text-slate-700 dark:text-slate-300">Version {doc.version} becomes the official document. It can’t be regenerated or changed afterwards, so preview it first.</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};
