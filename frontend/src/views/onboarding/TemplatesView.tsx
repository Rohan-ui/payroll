import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { onboardingApi, type Letterhead, type TemplateDetail, type TemplateLayout, type TemplateSummary } from '../../api/onboarding.api';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { fieldClass, formatDateTime, labelClass } from './onboarding-format';

const KIND_LABELS: Record<string, string> = {
  OFFER_LETTER: 'Offer letter',
  JOINING_LETTER: 'Joining letter',
  EMPLOYMENT_AGREEMENT: 'Employment agreement',
  CERTIFICATE: 'Certificate',
};
const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5';

const STARTER_BODY = `Dear {{candidate_name}},

We are pleased to offer you the position of {{job_title}} in {{department}} at {{company_name}}, reporting to {{reporting_manager}}, based at {{work_location}}.

Your annual compensation will be {{salary}}. Your joining date is {{joining_date}}, with a probation period of {{probation_period}}.

{{special_terms}}

Please accept this offer by {{offer_expiry_date}}.`;

/** Letter templates: approved versions are what letters use; wording changes happen in a draft. */
export const TemplatesView: React.FC = () => {
  const { can } = useAuth();
  const [rows, setRows] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setRows(null);
    onboardingApi.listTemplates().then(setRows).catch((e: Error) => setError(e.message));
  }, [reload]);

  if (openId) return <TemplateEditor templateId={openId} onBack={() => { setOpenId(null); setReload((n) => n + 1); }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">Letters use only approved template versions. These are templates, not legal advice: have your organization review the wording before approving it.</p>
        {can('onboarding.templates.manage') && <button type="button" onClick={() => setCreating(true)} className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white whitespace-nowrap">New template</button>}
      </div>
      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">The templates could not be loaded: {error}</div>
      ) : rows === null ? (
        <div className="h-32 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading templates</span></div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No templates yet</p>
          <p className="mt-1 text-sm text-slate-500">Create an offer letter template and approve it before drafting offers.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpenId(t.id)} className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                <span className="block font-semibold text-slate-900 dark:text-slate-100">{t.name}</span>
                <span className="block text-xs text-slate-500">{KIND_LABELS[t.kind] ?? t.kind}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {t.approvedVersion ? <Badge variant="success" size="sm">Version {t.approvedVersion.number} approved</Badge> : <Badge variant="warning" size="sm">Not approved yet</Badge>}
                  {t.draftVersion && <Badge variant="neutral" size="sm">Draft v{t.draftVersion.number}</Badge>}
                  {t.isArchived && <Badge variant="neutral" size="sm">Archived</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateTemplateDialog onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); setOpenId(t.id); }} />}
    </div>
  );
};

const CreateTemplateDialog: React.FC<{ onClose: () => void; onCreated: (t: TemplateDetail) => void }> = ({ onClose, onCreated }) => {
  const ids = useId();
  const [name, setName] = useState('Standard offer letter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!name.trim()) return setError('Enter a name.');
    setBusy(true);
    setError(null);
    try {
      // New templates start on the workspace's default letterhead, when it has one.
      const standard = (await onboardingApi.listLetterheads()).find((l) => l.isDefault && !l.isArchived);
      const created = await onboardingApi.createTemplate({
        kind: 'OFFER_LETTER',
        name: name.trim(),
        title: 'Offer of employment: {{job_title}}',
        body: STARTER_BODY,
        letterheadId: standard?.id ?? null,
        pageSize: 'A4',
        marginMm: 20,
        showPageNumbers: true,
      });
      toast.success('Template created as a draft');
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The template could not be created.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="New offer letter template"
      description="It starts as a draft with sample wording you can change. Only offer letters can be created for now."
      onClose={onClose}
      size="sm"
      footer={<><button type="button" onClick={onClose} className={actionClass}>Cancel</button><button type="button" disabled={busy} onClick={create} className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create draft'}</button></>}
    >
      {error && <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      <label htmlFor={`${ids}-name`} className={labelClass}>Name *</label>
      <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} className={fieldClass} />
    </Dialog>
  );
};

/** A template's versions, and its draft to edit, preview and approve. */
const TemplateEditor: React.FC<{ templateId: string; onBack: () => void }> = ({ templateId, onBack }) => {
  const ids = useId();
  const { can } = useAuth();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [layout, setLayout] = useState<TemplateLayout>({ letterheadId: null, pageSize: 'A4', marginMm: 20, showPageNumbers: false });
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [preview, setPreview] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const apply = useCallback((t: TemplateDetail) => {
    setTemplate(t);
    const editable = t.versions.find((v) => v.status === 'DRAFT') ?? t.versions.find((v) => v.status === 'APPROVED') ?? t.versions[0];
    setTitle(editable?.title ?? '');
    setBody(editable?.body ?? '');
    if (editable) {
      const { letterheadId, pageSize, marginMm, showPageNumbers } = editable.layout;
      setLayout({ letterheadId, pageSize, marginMm, showPageNumbers });
    }
  }, []);
  useEffect(() => {
    onboardingApi.getTemplate(templateId).then(apply).catch((e: Error) => setError(e.message));
    onboardingApi.listLetterheads().then(setLetterheads).catch(() => setLetterheads([]));
  }, [templateId, apply]);

  const run = async (action: () => Promise<TemplateDetail>, message?: string) => {
    setBusy(true);
    setError(null);
    try {
      apply(await action());
      if (message) toast.success(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  /** The editor's text and layout as they are now, saved or not, filled with sample data and shown in the viewer. */
  const showPreview = async () => {
    if (!title.trim()) return setError('Enter the letter heading before previewing.');
    if (!body.trim()) return setError('Enter the letter text before previewing.');
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await onboardingApi.previewTemplatePdf({ kind: template.kind, title, body, ...layout }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The preview could not be made.');
    } finally {
      setBusy(false);
    }
  };

  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  if (!template) {
    return error ? <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">{error}</div> : <div className="h-64 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true" />;
  }
  const draft = template.versions.find((v) => v.status === 'DRAFT');
  const canEdit = can('onboarding.templates.manage') && !template.isArchived;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to templates" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"><ArrowLeft className="w-4 h-4" aria-hidden="true" /></button>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{template.name}</h2>
            <p className="text-xs text-slate-500">{KIND_LABELS[template.kind]}{template.isArchived ? ' · Archived' : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <button type="button" disabled={busy} onClick={showPreview} className={actionClass}>Preview PDF</button>}
          {canEdit && <button type="button" disabled={busy} onClick={() => run(() => onboardingApi.saveTemplateDraft(template.id, { title, body, ...layout }), 'Draft saved')} className={actionClass}>{draft ? 'Save draft' : 'Start a new draft'}</button>}
          {draft && can('onboarding.templates.approve') && !template.isArchived && (
            <button type="button" disabled={busy} onClick={() => run(() => onboardingApi.approveTemplate(template.id), `Version ${draft.number} approved`)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white">Approve draft v{draft.number}</button>
          )}
          {can('onboarding.templates.manage') && <button type="button" disabled={busy} onClick={() => run(() => onboardingApi.archiveTemplate(template.id, !template.isArchived), template.isArchived ? 'Template restored' : 'Template archived')} className={actionClass}>{template.isArchived ? 'Restore' : 'Archive'}</button>}
        </div>
      </div>
      {error && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      {draft && <p className="text-xs text-slate-600 dark:text-slate-400">You are editing draft version {draft.number}. Saved drafts are not used until approved; offers already made keep their own copy of the text.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-3">
          <div>
            <label htmlFor={`${ids}-title`} className={labelClass}>Letter heading *</label>
            <input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} readOnly={!canEdit} maxLength={200} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`${ids}-body`} className={labelClass}>Letter text * (a blank line starts a new paragraph)</label>
            <textarea id={`${ids}-body`} ref={bodyRef} rows={16} value={body} onChange={(e) => setBody(e.target.value)} readOnly={!canEdit} maxLength={20000} className={`${fieldClass} font-mono text-xs`} />
          </div>
        </div>
        <aside className="space-y-4">
          <section aria-labelledby={`${ids}-layout`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-3">
            <div>
              <h3 id={`${ids}-layout`} className="text-sm font-bold">Page layout</h3>
              <p className="text-xs text-slate-500">Saved with the draft and approved together with the wording.</p>
            </div>
            <div>
              <label htmlFor={`${ids}-letterhead`} className={labelClass}>Letterhead</label>
              <select id={`${ids}-letterhead`} value={layout.letterheadId ?? ''} disabled={!canEdit} onChange={(e) => setLayout({ ...layout, letterheadId: e.target.value || null })} className={fieldClass}>
                <option value="">None: plain page with the company name</option>
                {letterheads
                  .filter((l) => !l.isArchived || l.id === layout.letterheadId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>{l.name}{l.isDefault ? ' (default)' : ''}{l.isArchived ? ' (archived)' : ''}</option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Letterheads are set up in the Letterheads tab.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${ids}-size`} className={labelClass}>Page size</label>
                <select id={`${ids}-size`} value={layout.pageSize} disabled={!canEdit} onChange={(e) => setLayout({ ...layout, pageSize: e.target.value as TemplateLayout['pageSize'] })} className={fieldClass}>
                  <option value="A4">A4</option>
                  <option value="LETTER">US Letter</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${ids}-margin`} className={labelClass}>Margins (mm)</label>
                <input
                  id={`${ids}-margin`}
                  type="number"
                  min={10}
                  max={40}
                  value={layout.marginMm}
                  readOnly={!canEdit}
                  onChange={(e) => setLayout({ ...layout, marginMm: Number(e.target.value) })}
                  aria-describedby={`${ids}-margin-hint`}
                  className={fieldClass}
                />
                <p id={`${ids}-margin-hint`} className="mt-1 text-xs text-slate-500">10 to 40</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={layout.showPageNumbers} disabled={!canEdit} onChange={(e) => setLayout({ ...layout, showPageNumbers: e.target.checked })} />
              Show page numbers
            </label>
          </section>
          <section aria-labelledby={`${ids}-placeholders`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h3 id={`${ids}-placeholders`} className="text-sm font-bold">Placeholders</h3>
            <p className="text-xs text-slate-500">Click one to insert it where the cursor is.</p>
            <ul className="mt-2 space-y-1">
              {template.placeholders.map((p) => (
                <li key={p.key}>
                  <button type="button" disabled={!canEdit} onClick={() => insert(p.key)} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60">
                    <code className="font-mono text-teal-700 dark:text-teal-300">{`{{${p.key}}}`}</code> <span className="text-slate-500">{p.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby={`${ids}-versions`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h3 id={`${ids}-versions`} className="text-sm font-bold">Versions</h3>
            <ol className="mt-2 space-y-2 text-xs">
              {template.versions.map((v) => (
                <li key={v.id}>
                  <span className="font-semibold">Version {v.number}</span>: {v.status === 'APPROVED' ? 'approved, in use' : v.status === 'DRAFT' ? 'draft' : 'retired'}
                  {v.approvedAt && <span className="block text-slate-500">Approved {formatDateTime(v.approvedAt)}{v.approvedBy ? ` by ${v.approvedBy}` : ''}</span>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      {preview && (
        <PdfViewer
          title={`Sample: ${template.name}`}
          description="The template as it is in the editor now, filled with made-up data"
          notice="Sample preview: made-up data, not a real document. Nothing is saved. Close it to keep editing."
          load={() => Promise.resolve(preview)}
          downloadName="template-sample.pdf"
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
};
