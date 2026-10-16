import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import type { Editor } from '@tiptap/react';
import { documentsApi, type Letterhead, type LetterDocument, type TemplateDetail, type TemplateKind, type TemplateLayout, type TemplateSummary } from '../../api/documents.api';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { fieldClass, formatDateTime, labelClass } from '../onboarding/onboarding-format';
import { LetterEditor } from './LetterEditor';
import { MARGIN_LIMITS, MIN_BODY_MM, PAGE_SIZES, pageFrame, pxPerMm, uniformMargins } from './letterhead-geometry';
import { toLayout, useElementImages, useLetterheadImages } from './LetterheadsView';

const KIND_LABELS: Record<string, string> = {
  OFFER_LETTER: 'Offer letter',
  QUOTATION: 'Quotation',
  APPRAISAL_LETTER: 'Appraisal letter',
  JOINING_LETTER: 'Joining letter',
  EMPLOYMENT_AGREEMENT: 'Employment agreement',
  CERTIFICATE: 'Certificate',
};

/** The kinds that can be created, with what each is for and the name a new one starts with. */
const KINDS: { kind: TemplateKind; label: string; plural: string; hint: string; name: string }[] = [
  { kind: 'OFFER_LETTER', label: 'Offer letter', plural: 'Offer letters', hint: 'Used when drafting offers in Onboarding.', name: 'Standard offer letter' },
  { kind: 'QUOTATION', label: 'Quotation', plural: 'Quotations', hint: 'Used to print quotations as PDFs in CRM.', name: 'Standard quotation' },
  { kind: 'APPRAISAL_LETTER', label: 'Appraisal letter', plural: 'Appraisal letters', hint: 'Used for letters after appraisals are finalised.', name: 'Appraisal letter' },
];
const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5';

/** Document templates: approved versions are what documents use; wording changes happen in a draft. */
export const TemplatesView: React.FC = () => {
  const { can } = useAuth();
  const [kind, setKind] = useState<TemplateKind | 'ALL'>('ALL');
  const [rows, setRows] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setRows(null);
    documentsApi.listTemplates().then(setRows).catch((e: Error) => setError(e.message));
  }, [reload]);

  if (openId) return <TemplateEditor templateId={openId} onBack={() => { setOpenId(null); setReload((n) => n + 1); }} />;
  const shown = (rows ?? []).filter((t) => kind === 'ALL' || t.kind === kind);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">Documents use only approved template versions. These are templates, not legal advice: have your organization review the wording before approving it.</p>
        {can('documents.templates.manage') && <button type="button" onClick={() => setCreating(true)} className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white whitespace-nowrap">New template</button>}
      </div>
      <div role="group" aria-label="Kind of template" className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5">
        {[{ kind: 'ALL' as const, plural: 'All' }, ...KINDS].map((k) => {
          const count = rows?.filter((t) => k.kind === 'ALL' || t.kind === k.kind).length;
          return (
            <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${kind === k.kind ? 'bg-white text-slate-900 shadow-sm dark:bg-[#181724] dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}>
              {k.plural}{count === undefined ? '' : ` (${count})`}
            </button>
          );
        })}
      </div>
      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">The templates could not be loaded: {error}</div>
      ) : rows === null ? (
        <div className="h-32 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading templates</span></div>
      ) : shown.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{kind === 'ALL' ? 'No templates yet' : `No ${KINDS.find((k) => k.kind === kind)?.plural.toLowerCase()} yet`}</p>
          <p className="mt-1 text-sm text-slate-500">
            {kind === 'QUOTATION' ? 'Create a quotation template and approve it to print quotations as PDFs.'
              : kind === 'APPRAISAL_LETTER' ? 'Create an appraisal letter template now; letters are made from it once appraisals are finalised.'
                : 'Create an offer letter template and approve it before drafting offers.'}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shown.map((t) => (
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
      {creating && <CreateTemplateDialog initialKind={kind === 'ALL' ? 'OFFER_LETTER' : kind} onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); setOpenId(t.id); }} />}
    </div>
  );
};

const CreateTemplateDialog: React.FC<{ initialKind: TemplateKind; onClose: () => void; onCreated: (t: TemplateDetail) => void }> = ({ initialKind, onClose, onCreated }) => {
  const ids = useId();
  const [kind, setKind] = useState<TemplateKind>(initialKind);
  const [name, setName] = useState(KINDS.find((k) => k.kind === initialKind)?.name ?? '');
  const [named, setNamed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!name.trim()) return setError('Enter a name.');
    setBusy(true);
    setError(null);
    try {
      // New templates start on the workspace's default letterhead, when it has one.
      const standard = (await documentsApi.listLetterheads()).find((l) => l.isDefault && !l.isArchived);
      const created = await documentsApi.createTemplate({
        // No wording: it starts from the standard wording for its kind.
        kind,
        name: name.trim(),
        letterheadId: standard?.id ?? null,
        pageSize: 'A4',
        marginsMm: uniformMargins(20),
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
      title="New document template"
      description="It starts as a draft with sample wording you can change."
      onClose={onClose}
      size="sm"
      footer={<><button type="button" onClick={onClose} className={actionClass}>Cancel</button><button type="button" disabled={busy} onClick={create} className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create draft'}</button></>}
    >
      {error && <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      <fieldset className="mb-4">
        <legend className={labelClass}>Kind *</legend>
        <div className="space-y-2">
          {KINDS.map((k) => (
            <label key={k.kind} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name={`${ids}-kind`} className="mt-1" checked={kind === k.kind} onChange={() => { setKind(k.kind); if (!named) setName(k.name); }} />
              <span><span className="font-semibold">{k.label}</span><span className="block text-xs text-slate-500">{k.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${ids}-name`} className={labelClass}>Name *</label>
      <input id={`${ids}-name`} value={name} onChange={(e) => { setName(e.target.value); setNamed(true); }} maxLength={160} className={fieldClass} />
    </Dialog>
  );
};

const MARGIN_SIDES: { side: keyof TemplateLayout['marginsMm']; label: string }[] = [
  { side: 'top', label: 'Top' },
  { side: 'bottom', label: 'Bottom' },
  { side: 'left', label: 'Left' },
  { side: 'right', label: 'Right' },
];

/** A template's versions, and its draft to edit, preview and approve. */
type SideTab = 'page' | 'placeholders' | 'versions';
const SIDE_TABS: { id: SideTab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'placeholders', label: 'Placeholders' },
  { id: 'versions', label: 'Versions' },
];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];
const snapshot = (document: LetterDocument | null, layout: TemplateLayout) => JSON.stringify({ document, layout });

/** A template's versions, and its draft to edit as a formatted page, preview and approve. */
const TemplateEditor: React.FC<{ templateId: string; onBack: () => void }> = ({ templateId, onBack }) => {
  const ids = useId();
  const { can } = useAuth();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [document, setDocument] = useState<LetterDocument | null>(null);
  const [layout, setLayout] = useState<TemplateLayout>({ letterheadId: null, pageSize: 'A4', marginsMm: uniformMargins(20), showPageNumbers: false });
  const [saved, setSaved] = useState<string | null>(null);
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [preview, setPreview] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'approve' | 'preview' | 'archive' | null>(null);
  const [tab, setTab] = useState<SideTab>('page');
  const [leaving, setLeaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const editorRef = useRef<Editor | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const editable = template ? template.versions.find((v) => v.status === 'DRAFT') ?? template.versions.find((v) => v.status === 'APPROVED') ?? template.versions[0] : undefined;
  const apply = useCallback((t: TemplateDetail) => {
    setTemplate(t);
    const v = t.versions.find((x) => x.status === 'DRAFT') ?? t.versions.find((x) => x.status === 'APPROVED') ?? t.versions[0];
    if (v) {
      const { letterheadId, pageSize, marginsMm, showPageNumbers } = v.layout;
      setLayout({ letterheadId, pageSize, marginsMm, showPageNumbers });
    }
  }, []);
  useEffect(() => {
    documentsApi.getTemplate(templateId).then(apply).catch((e: Error) => setError(e.message));
    documentsApi.listLetterheads().then(setLetterheads).catch(() => setLetterheads([]));
  }, [templateId, apply]);

  const dirty = saved !== null && snapshot(document, layout) !== saved;
  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const page = PAGE_SIZES[layout.pageSize === 'LETTER' ? 'LETTER' : 'A4'];
  const fit = () => {
    const width = stage.current?.clientWidth ?? 0;
    if (width > 0) setZoom(Math.max(0.25, Math.min(1.5, Math.floor(((width - 48) / pxPerMm(1) / page.width) * 100) / 100)));
  };
  const letterhead = letterheads.find((l) => l.id === layout.letterheadId) ?? null;
  // The PDF refuses a page that leaves the text too little room.
  const textRoom = pageFrame(page, layout.marginsMm, letterhead && toLayout(letterhead)).body.height;
  const tooTight = textRoom < MIN_BODY_MM - 0.01;
  const { images } = useLetterheadImages(letterhead);
  const letterheadImages = Object.fromEntries(Object.entries(images).filter(([, i]) => i.width > 0 && i.height > 0));
  const elementImages = useElementImages(letterhead?.id, letterhead?.elements.flatMap((e) => (e.imageId ? [e.imageId] : [])) ?? []);

  if (!template || !editable) {
    return error ? <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">{error}</div> : <div className="h-64 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading template</span></div>;
  }
  const draft = template.versions.find((v) => v.status === 'DRAFT');
  const canEdit = can('documents.templates.manage') && !template.isArchived;
  const nextNumber = Math.max(...template.versions.map((v) => v.number)) + 1;

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    run('save', async () => {
      if (!document) return;
      const sent = { document, layout };
      const result = await documentsApi.saveTemplateDraft(template.id, { document, ...layout });
      apply(result);
      // What was sent is what is saved; the editor keeps its place.
      setSaved(snapshot(sent.document, sent.layout));
      toast.success(draft ? 'Draft saved' : `Draft version ${nextNumber} started`);
    });
  const approve = () =>
    run('approve', async () => {
      if (!draft) return;
      apply(await documentsApi.approveTemplate(template.id));
      toast.success(`Version ${draft.number} approved`);
    });
  /** The page as it is now, saved or not, filled with sample data and shown in the viewer. */
  const showPreview = () =>
    run('preview', async () => {
      if (!document) return;
      setPreview(await documentsApi.previewTemplatePdf({ kind: template.kind, document, ...layout }));
    });
  const insert = (key: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent({ type: 'placeholder', attrs: { key } }).run();
  };

  const status = busy === 'save' ? 'Saving…' : dirty ? 'Unsaved changes' : draft ? 'All changes saved' : 'No changes';
  const zoomControls = (
    <div className="flex items-center gap-1">
      <label htmlFor={`${ids}-zoom`} className="sr-only">Zoom</label>
      <select id={`${ids}-zoom`} value={ZOOMS.includes(zoom) ? String(zoom) : 'custom'} onChange={(e) => setZoom(Number(e.target.value))} className="h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs px-1.5">
        {!ZOOMS.includes(zoom) && <option value="custom">{Math.round(zoom * 100)}%</option>}
        {ZOOMS.map((z) => <option key={z} value={String(z)}>{z * 100}%</option>)}
      </select>
      <button type="button" onClick={fit} className={actionClass}>Fit</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => (dirty ? setLeaving(true) : onBack())} aria-label="Back to templates" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"><ArrowLeft className="w-4 h-4" aria-hidden="true" /></button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 break-words">{template.name}</h2>
            <p className="text-xs text-slate-500">
              {KIND_LABELS[template.kind]}
              {template.isArchived ? ' · Archived' : draft ? ` · Editing draft version ${draft.number}` : canEdit ? ` · Saving starts draft version ${nextNumber}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && <span role="status" className={`text-xs ${dirty ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-slate-500'}`}>{status}</span>}
          {canEdit && <button type="button" disabled={!!busy} onClick={showPreview} className={actionClass}>{busy === 'preview' ? 'Preparing…' : 'Preview PDF'}</button>}
          {canEdit && <button type="button" disabled={!!busy || (!dirty && !!draft)} onClick={save} className={actionClass}>{busy === 'save' ? 'Saving…' : draft ? 'Save draft' : 'Save as new draft'}</button>}
          {draft && can('documents.templates.approve') && !template.isArchived && (
            <button
              type="button"
              disabled={!!busy || dirty}
              title={dirty ? 'Save the draft first: approval fixes the saved draft' : undefined}
              onClick={approve}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
            >
              {busy === 'approve' ? 'Approving…' : `Approve draft v${draft.number}`}
            </button>
          )}
          {can('documents.templates.manage') && <button type="button" disabled={!!busy} onClick={() => run('archive', async () => { apply(await documentsApi.archiveTemplate(template.id, !template.isArchived)); toast.success(template.isArchived ? 'Template restored' : 'Template archived'); })} className={actionClass}>{template.isArchived ? 'Restore' : 'Archive'}</button>}
        </div>
      </div>
      {error && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      {draft && dirty && can('documents.templates.approve') && <p className="text-xs text-slate-600 dark:text-slate-400">Save the draft before approving it: approval fixes the saved draft.</p>}
      {editable.format === 'PLAIN' && (
        <p className="p-3 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-white/5 text-xs text-slate-600 dark:text-slate-300">
          Version {editable.number} was written as plain text. It is shown here as a formatted page; saving makes a formatted draft. Approved versions keep printing exactly as they did.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <LetterEditor
          key={`${editable.id}`}
          document={editable.document}
          format={template.format}
          editable={canEdit}
          table={template.kind === 'OFFER_LETTER' || template.kind === 'QUOTATION' ? template.kind : null}
          page={page}
          margins={layout.marginsMm}
          letterhead={letterhead}
          letterheadImages={letterheadImages}
          elementImages={elementImages}
          showPageNumbers={layout.showPageNumbers}
          zoom={zoom}
          stageRef={stage}
          zoomControls={zoomControls}
          onReady={(editor, doc) => {
            editorRef.current = editor;
            setDocument(doc);
            setSaved(snapshot(doc, layoutRef.current));
          }}
          onChange={setDocument}
        />

        <section aria-label="Document settings" className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] min-w-0">
          <div role="tablist" aria-label="Document settings" className="flex gap-1 px-2 border-b border-slate-200 dark:border-[#2B293E] overflow-x-auto">
            {SIDE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${ids}-tab-${t.id}`}
                aria-controls={`${ids}-panel-${t.id}`}
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-t-lg ${tab === t.id ? 'border-teal-500 text-teal-700 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`${ids}-panel-page`} aria-labelledby={`${ids}-tab-page`} hidden={tab !== 'page'} className="p-4 space-y-3">
            <p className="text-xs text-slate-500">Saved with the draft and approved together with the wording.</p>
            <div>
              <label htmlFor={`${ids}-letterhead`} className={labelClass}>Letterhead</label>
              <select id={`${ids}-letterhead`} value={layout.letterheadId ?? ''} disabled={!canEdit} onChange={(e) => setLayout({ ...layout, letterheadId: e.target.value || null })} className={fieldClass}>
                <option value="">None: plain page</option>
                {letterheads
                  .filter((l) => !l.isArchived || l.id === layout.letterheadId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>{l.name}{l.isDefault ? ' (default)' : ''}{l.isArchived ? ' (archived)' : ''}</option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Letterheads are set up in the Letterheads tab.</p>
            </div>
            <div>
              <label htmlFor={`${ids}-size`} className={labelClass}>Page size</label>
              <select id={`${ids}-size`} value={layout.pageSize} disabled={!canEdit} onChange={(e) => setLayout({ ...layout, pageSize: e.target.value as TemplateLayout['pageSize'] })} className={fieldClass}>
                <option value="A4">A4</option>
                <option value="LETTER">US Letter</option>
              </select>
            </div>
            <fieldset aria-describedby={`${ids}-margin-hint`}>
              <legend className={labelClass}>Margins (mm)</legend>
              <div className="grid grid-cols-2 gap-3">
                {MARGIN_SIDES.map(({ side, label }) => (
                  <div key={side}>
                    <label htmlFor={`${ids}-margin-${side}`} className="block text-xs text-slate-600 dark:text-slate-400 mb-1">{label}</label>
                    <input
                      id={`${ids}-margin-${side}`}
                      type="number"
                      min={MARGIN_LIMITS.min}
                      max={MARGIN_LIMITS.max}
                      value={layout.marginsMm[side]}
                      readOnly={!canEdit}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (e.target.value && n >= MARGIN_LIMITS.min && n <= MARGIN_LIMITS.max) setLayout({ ...layout, marginsMm: { ...layout.marginsMm, [side]: Math.round(n) } });
                      }}
                      className={fieldClass}
                    />
                  </div>
                ))}
              </div>
              <p id={`${ids}-margin-hint`} className="mt-1 text-xs text-slate-500">0 to 60 each. The letter text stays inside the margins and below the letterhead. Where the letterhead itself sits is set on the letterhead.</p>
            </fieldset>
            {tooTight && (
              <p role="alert" className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
                The letter text has only {Math.max(0, Math.floor(textRoom))} mm of the page’s height; it needs at least {MIN_BODY_MM} mm. Make the top or bottom margin smaller, or choose a letterhead with a shorter header or footer.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={layout.showPageNumbers} disabled={!canEdit} onChange={(e) => setLayout({ ...layout, showPageNumbers: e.target.checked })} />
              Show page numbers
            </label>
          </div>

          <div role="tabpanel" id={`${ids}-panel-placeholders`} aria-labelledby={`${ids}-tab-placeholders`} hidden={tab !== 'placeholders'} className="p-4">
            <p className="text-xs text-slate-500">Click one to insert it where the cursor is. Select it on the page to format it like text; the value takes that formatting.</p>
            <ul className="mt-2 space-y-1">
              {template.placeholders.map((p) => (
                <li key={p.key}>
                  <button type="button" disabled={!canEdit} onClick={() => insert(p.key)} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-60">
                    <code className="font-mono text-teal-700 dark:text-teal-300">{`{{${p.key}}}`}</code> <span className="text-slate-500">{p.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div role="tabpanel" id={`${ids}-panel-versions`} aria-labelledby={`${ids}-tab-versions`} hidden={tab !== 'versions'} className="p-4">
            <ol className="space-y-2 text-xs">
              {template.versions.map((v) => (
                <li key={v.id}>
                  <span className="font-semibold">Version {v.number}</span>: {v.status === 'APPROVED' ? 'approved, in use' : v.status === 'DRAFT' ? 'draft' : 'retired'}
                  {v.format === 'PLAIN' && <span className="text-slate-500"> · plain text</span>}
                  {v.approvedAt && <span className="block text-slate-500">Approved {formatDateTime(v.approvedAt)}{v.approvedBy ? ` by ${v.approvedBy}` : ''}</span>}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-slate-500">Approved versions never change. Offers keep the letter they were made with.</p>
          </div>
        </section>
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
      {leaving && (
        <Dialog
          title="Leave without saving?"
          description="Your changes to this template since it was last saved will be lost."
          onClose={() => setLeaving(false)}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => setLeaving(false)} className={actionClass}>Keep editing</button>
              <button type="button" onClick={onBack} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white">Leave without saving</button>
            </>
          }
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">Save the draft first to keep them.</p>
        </Dialog>
      )}
    </div>
  );
};
