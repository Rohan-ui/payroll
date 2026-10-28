import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Download,
  Edit3,
  Eye,
  FileDown,
  FileText,
  History,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  onboardingApi,
  type AvailableTemplateSummary,
  type CandidateLetterDocumentDetail,
  type CandidateLetterDocumentSummary,
  type CandidatePlaceholderInfo,
} from '../../api/onboarding.api';
import { documentsApi, type DocumentFormat, type LetterDocument, type Letterhead, type PageMargins } from '../../api/documents.api';
import { fieldClass, formatDate, formatDateTime, labelClass } from './onboarding-format';
import { LetterEditor } from '../documents/LetterEditor';
import { PAGE_SIZES, pxPerMm, uniformMargins } from '../documents/letterhead-geometry';
import { toLayout, useElementImages, useLetterheadImages } from '../documents/LetterheadsView';

interface Props {
  candidateId: string;
  candidateName: string;
}

const DEFAULT_FORMAT: DocumentFormat = {
  style: {
    fontFamily: 'helvetica',
    fontSize: 11,
    color: '#111111',
    lineHeight: 1.3,
    paragraph: { spaceBefore: 0, spaceAfter: 6 },
    listParagraph: { spaceBefore: 0, spaceAfter: 2 },
    headings: {
      1: { fontSize: 20, bold: true, italic: false, color: '#111111', spaceBefore: 0, spaceAfter: 10 },
      2: { fontSize: 16, bold: true, italic: false, color: '#111111', spaceBefore: 12, spaceAfter: 6 },
      3: { fontSize: 13, bold: true, italic: false, color: '#111111', spaceBefore: 10, spaceAfter: 4 },
      4: { fontSize: 12, bold: false, italic: true, color: '#444444', spaceBefore: 4, spaceAfter: 4 },
    },
    headingLineHeight: 1.2,
    listIndentMm: 7,
    rule: { spaceBefore: 6, spaceAfter: 6, thickness: 0.75, color: '#999999' },
    table: { spaceBefore: 6, spaceAfter: 10 },
    script: { scale: 0.75, raise: 0.33, drop: 0.2 },
  },
  fonts: [
    { key: 'helvetica', label: 'Helvetica (Arial)', css: 'Helvetica, Arial, sans-serif' },
    { key: 'times', label: 'Times New Roman', css: 'Times New Roman, Times, serif' },
    { key: 'courier', label: 'Courier New', css: 'Courier New, Courier, monospace' },
  ],
  fontSizes: { min: 6, max: 72, presets: [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48] },
};

const CATEGORIES = [
  { id: 'ALL', label: 'All Templates' },
  { id: 'OFFER', label: 'Offer Letters' },
  { id: 'APPOINTMENT', label: 'Appointment & Contracts' },
  { id: 'ONBOARDING', label: 'Joining & Welcome' },
  { id: 'AGREEMENT', label: 'NDAs & Agreements' },
  { id: 'EXIT', label: 'Experience & Relieving' },
  { id: 'CUSTOM', label: 'Custom HR' },
];

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
}

function triggerDownload(buffer: ArrayBuffer, filename: string, mimeType: string) {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const actionClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 transition-colors';
const primaryClass =
  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 transition-colors';

export const CandidateLetterDocuments: React.FC<Props> = ({ candidateId, candidateName }) => {
  const ids = useId();
  const { can } = useAuth();
  const canManage = can('onboarding.documents.manage');

  // Documents list state
  const [documents, setDocuments] = useState<CandidateLetterDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workflow modal state: 'templates' | 'review' | 'editor' | null
  const [workflowState, setWorkflowState] = useState<'templates' | 'review' | 'editor' | null>(null);

  // Template selection state
  const [availableTemplates, setAvailableTemplates] = useState<AvailableTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<AvailableTemplateSummary | null>(null);

  // Placeholder review state
  const [placeholderInfo, setPlaceholderInfo] = useState<CandidatePlaceholderInfo | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  // Active document in editor
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocTitle, setEditingDocTitle] = useState('');
  const [editingDocType, setEditingDocType] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateVersionId, setEditingTemplateVersionId] = useState<string | null>(null);
  const [editingDocStatus, setEditingDocStatus] = useState('SAVED');
  const [docContent, setDocContent] = useState<LetterDocument | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [docLayout, setDocLayout] = useState<{
    letterheadId: string | null;
    pageSize: 'A4' | 'LETTER';
    marginsMm: PageMargins;
    showPageNumbers: boolean;
  }>({
    letterheadId: null,
    pageSize: 'A4',
    marginsMm: uniformMargins(20),
    showPageNumbers: true,
  });
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [savingDoc, setSavingDoc] = useState(false);
  const [versionsList, setVersionsList] = useState<{ id: string; versionNumber: number; title: string; createdAt: string; createdByName: string | null }[]>([]);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Export / Preview state
  const [previewPdfBuffer, setPreviewPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState('');
  const [downloadingDocx, setDownloadingDocx] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  // Editor zoom & stage ref
  const [zoom, setZoom] = useState(0.85);
  const stageRef = useRef<HTMLDivElement>(null);

  const loadDocuments = useCallback(() => {
    setLoading(true);
    setError(null);
    onboardingApi
      .listCandidateLetterDocuments(candidateId)
      .then(setDocuments)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [candidateId]);

  useEffect(() => {
    loadDocuments();
    documentsApi
      .listLetterheads()
      .then(setLetterheads)
      .catch(() => setLetterheads([]));
  }, [loadDocuments]);

  // Open "Generate Document" wizard
  const startGenerateWizard = async () => {
    setWorkflowState('templates');
    setSelectedTemplate(null);
    setSearchQuery('');
    setSelectedCategory('ALL');
    setTemplatesLoading(true);
    try {
      const templates = await onboardingApi.listAvailableTemplates();
      setAvailableTemplates(templates);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Move from Template selection to Placeholder Review
  const proceedToReview = async (template: AvailableTemplateSummary) => {
    setSelectedTemplate(template);
    setGenerating(true);
    try {
      const info = await onboardingApi.getCandidatePlaceholders(candidateId);
      setPlaceholderInfo(info);
      // Initialize custom field values from existing candidate values
      const initial: Record<string, string> = {};
      info.missingFields.forEach((f) => {
        initial[f.key] = '';
      });
      setCustomFieldValues(initial);
      setWorkflowState('review');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load candidate information.');
    } finally {
      setGenerating(false);
    }
  };

  // Generate document from review step
  const executeGenerate = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const result = await onboardingApi.generateLetterDocument(candidateId, {
        templateId: selectedTemplate.id,
        customValues: customFieldValues,
      });

      setEditingDocId(null);
      setEditingDocTitle(result.documentTitle);
      setEditingDocType(result.documentType);
      setEditingTemplateId(result.templateId);
      setEditingTemplateVersionId(result.templateVersionId);
      setEditingDocStatus('DRAFT');
      setDocContent(result.document);
      setSavedSnapshot(null); // unsaved brand new document
      setDocLayout({
        letterheadId: result.layout.letterheadId,
        pageSize: result.layout.pageSize,
        marginsMm: result.layout.marginsMm,
        showPageNumbers: result.layout.showPageNumbers,
      });
      setVersionsList([]);
      setWorkflowState('editor');
      toast.success('Document populated from candidate profile. You can now edit and format.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate document.');
    } finally {
      setGenerating(false);
    }
  };

  // Open previously saved document in editor
  const openSavedDocument = async (docId: string) => {
    try {
      setLoading(true);
      const detail: CandidateLetterDocumentDetail = await onboardingApi.getCandidateLetterDocument(candidateId, docId);
      setEditingDocId(detail.id);
      setEditingDocTitle(detail.documentTitle);
      setEditingDocType(detail.documentType);
      setEditingTemplateId(detail.templateId);
      setEditingTemplateVersionId(detail.templateVersionId);
      setEditingDocStatus(detail.documentStatus);
      setDocContent(detail.document);
      setDocLayout({
        letterheadId: detail.layout.letterheadId,
        pageSize: detail.layout.pageSize,
        marginsMm: detail.layout.marginsMm,
        showPageNumbers: detail.layout.showPageNumbers,
      });
      setVersionsList(detail.versions ?? []);
      setSavedSnapshot(JSON.stringify(detail.document));
      setWorkflowState('editor');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load document.');
    } finally {
      setLoading(false);
    }
  };

  // Check if current document has unsaved edits
  const isDirty = useMemo(() => {
    if (!docContent) return false;
    if (savedSnapshot === null) return true; // never saved yet
    return JSON.stringify(docContent) !== savedSnapshot;
  }, [docContent, savedSnapshot]);

  // Save document (handles new save and update without duplicating)
  const handleSave = async (status: string = editingDocStatus) => {
    if (!docContent) return;
    if (!editingDocTitle.trim()) {
      toast.error('Please enter a document title.');
      return;
    }

    setSavingDoc(true);
    try {
      const saved = await onboardingApi.saveCandidateLetterDocument(candidateId, {
        documentId: editingDocId || undefined,
        templateId: editingTemplateId || undefined,
        templateVersionId: editingTemplateVersionId || undefined,
        documentTitle: editingDocTitle.trim(),
        documentType: editingDocType,
        document: docContent,
        documentStatus: status,
        layout: docLayout,
        changelogNote: editingDocId ? `Edited ${editingDocTitle}` : 'Initial generation',
      });

      setEditingDocId(saved.id);
      setEditingDocStatus(saved.documentStatus);
      setSavedSnapshot(JSON.stringify(docContent));
      toast.success('Document saved successfully');
      loadDocuments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save document.');
    } finally {
      setSavingDoc(false);
    }
  };

  // Safe exit from editor
  const handleCloseEditor = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      setWorkflowState(null);
      setDocContent(null);
      setEditingDocId(null);
    }
  };

  // Downloads
  const downloadDocx = async (docId: string, title: string) => {
    setDownloadingDocx(docId);
    try {
      const bytes = await onboardingApi.downloadLetterDocx(candidateId, docId);
      const filename = `${sanitizeFilename(candidateName)}_${sanitizeFilename(title)}.docx`;
      triggerDownload(bytes, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      toast.success('DOCX file downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download DOCX.');
    } finally {
      setDownloadingDocx(null);
    }
  };

  const downloadPdf = async (docId: string, title: string) => {
    setDownloadingPdf(docId);
    try {
      const bytes = await onboardingApi.downloadLetterPdf(candidateId, docId);
      const filename = `${sanitizeFilename(candidateName)}_${sanitizeFilename(title)}.pdf`;
      triggerDownload(bytes, filename, 'application/pdf');
      toast.success('PDF file downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download PDF.');
    } finally {
      setDownloadingPdf(null);
    }
  };

  const previewPdf = async (docId: string, title: string) => {
    try {
      setLoading(true);
      const bytes = await onboardingApi.downloadLetterPdf(candidateId, docId);
      setPreviewPdfBuffer(bytes);
      setPreviewPdfTitle(title);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load PDF preview.');
    } finally {
      setLoading(false);
    }
  };

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return availableTemplates.filter((t) => {
      const matchesSearch =
        !searchQuery.trim() ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.kindLabel.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedCategory === 'ALL') return true;
      if (selectedCategory === 'OFFER') return t.kind === 'OFFER_LETTER';
      if (selectedCategory === 'APPOINTMENT') return ['APPOINTMENT_LETTER', 'EMPLOYMENT_CONTRACT', 'EMPLOYMENT_AGREEMENT'].includes(t.kind);
      if (selectedCategory === 'ONBOARDING') return ['JOINING_LETTER', 'WELCOME_LETTER'].includes(t.kind);
      if (selectedCategory === 'AGREEMENT') return t.kind === 'NDA';
      if (selectedCategory === 'EXIT') return ['EXPERIENCE_LETTER', 'RELIEVING_LETTER'].includes(t.kind);
      if (selectedCategory === 'CUSTOM') return ['CUSTOM_HR', 'CERTIFICATE', 'APPRAISAL_LETTER', 'QUOTATION'].includes(t.kind);

      return true;
    });
  }, [availableTemplates, searchQuery, selectedCategory]);

  // Letterhead images
  const currentLetterhead = useMemo(() => {
    return letterheads.find((l) => l.id === docLayout.letterheadId) ?? null;
  }, [letterheads, docLayout.letterheadId]);

  const { images } = useLetterheadImages(currentLetterhead);
  const letterheadImages = useMemo(() => {
    return Object.fromEntries(Object.entries(images).filter(([, i]) => i.width > 0 && i.height > 0));
  }, [images]);

  const elementImages = useElementImages(
    currentLetterhead?.id,
    currentLetterhead?.elements.flatMap((e) => (e.imageId ? [e.imageId] : [])) ?? [],
  );

  const activePage = PAGE_SIZES[docLayout.pageSize === 'LETTER' ? 'LETTER' : 'A4'];

  const fitEditorZoom = () => {
    const width = stageRef.current?.clientWidth ?? 0;
    if (width > 0) {
      setZoom(Math.max(0.25, Math.min(1.4, Math.floor(((width - 48) / pxPerMm(1) / activePage.width) * 100) / 100)));
    }
  };

  const zoomControls = (
    <div className="flex items-center gap-1.5 text-xs">
      <button
        type="button"
        onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
        className="px-2 py-1 rounded border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"
        title="Zoom out"
      >
        -
      </button>
      <span className="w-12 text-center tabular-nums text-slate-600 dark:text-slate-300 font-medium">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
        className="px-2 py-1 rounded border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"
        title="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={fitEditorZoom}
        className="px-2 py-1 rounded border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"
      >
        Fit
      </button>
    </div>
  );

  return (
    <>
      {/* ── Main Section on Candidate Details Page ──────────────── */}
      <section aria-labelledby={`${ids}-heading`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <FileText className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id={`${ids}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Onboarding Documents & Letters
              </h2>
              <p className="text-xs text-slate-500">
                Generate, edit in rich-text, and export appointment letters, contracts, NDAs, and onboarding documents.
              </p>
            </div>
          </div>
          {canManage && (
            <button type="button" onClick={startGenerateWizard} className={primaryClass}>
              <Plus className="w-4 h-4" />
              Generate Document
            </button>
          )}
        </div>

        {error && (
          <div role="alert" className="p-3 mb-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
            {error} <button type="button" onClick={loadDocuments} className="underline font-semibold ml-1">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="h-28 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none flex items-center justify-center text-xs text-slate-400">
            Loading candidate documents…
          </div>
        ) : documents.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-[#2B293E] bg-slate-50/50 dark:bg-slate-900/20">
            <FileText className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No onboarding documents generated yet</p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Generate customizable appointment letters, employment contracts, joining letters, or confidentiality agreements for {candidateName}.
            </p>
            {canManage && (
              <button type="button" onClick={startGenerateWizard} className={`${primaryClass} mt-3`}>
                <Sparkles className="w-3.5 h-3.5" />
                Select a Template & Generate
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] hover:border-teal-300 dark:hover:border-teal-700/60 transition-colors shadow-xs"
              >
                <div className="min-w-0 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{doc.documentTitle}</h3>
                      <Badge variant="neutral" size="sm">
                        {doc.typeLabel}
                      </Badge>
                      <Badge variant={doc.documentStatus === 'FINALIZED' ? 'success' : doc.documentStatus === 'SENT' ? 'purple' : 'warning'} size="sm">
                        {doc.documentStatus}
                      </Badge>
                      <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                        v{doc.versionNumber}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {doc.templateName ? `From template “${doc.templateName}” · ` : ''}
                      Updated {formatDateTime(doc.updatedAt)} {doc.updatedByName ? `by ${doc.updatedByName}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => previewPdf(doc.id, doc.documentTitle)}
                    className={actionClass}
                    title="Preview PDF"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={downloadingDocx === doc.id}
                    onClick={() => downloadDocx(doc.id, doc.documentTitle)}
                    className={actionClass}
                    title="Download Microsoft Word .docx file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloadingDocx === doc.id ? 'Exporting…' : 'DOCX'}
                  </button>
                  <button
                    type="button"
                    disabled={downloadingPdf === doc.id}
                    onClick={() => downloadPdf(doc.id, doc.documentTitle)}
                    className={actionClass}
                    title="Download PDF file"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    {downloadingPdf === doc.id ? 'Exporting…' : 'PDF'}
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openSavedDocument(doc.id)}
                      className={`${actionClass} text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-500/10 hover:bg-teal-100/60`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── STEP 1: Template Selection Dialog ───────────────────── */}
      {workflowState === 'templates' && (
        <Dialog
          title="Select Document Template"
          description={`Choose any active document template to generate for ${candidateName}.`}
          onClose={() => setWorkflowState(null)}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setWorkflowState(null)} className={actionClass}>
                Cancel
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-[#2B293E]">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search templates by name or document kind…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${fieldClass} pl-9`}
              />
            </div>

            {/* Template list / grid */}
            {templatesLoading ? (
              <div className="h-48 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse flex items-center justify-center text-xs text-slate-400">
                Loading available templates…
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-[#2B293E]">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No matching templates found</p>
                <p className="text-xs text-slate-500 mt-1">
                  Templates can be created and managed under Documents & Letterheads.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => proceedToReview(template)}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] hover:border-teal-500 dark:hover:border-teal-500 bg-white dark:bg-[#181724] cursor-pointer group transition-all shadow-2xs hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        {template.name}
                      </h4>
                      <Badge variant="neutral" size="sm">
                        {template.kindLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.description}</p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-white/5 pt-2">
                      <span>Version {template.versionNumber}</span>
                      <span className="font-semibold text-teal-600 dark:text-teal-400 group-hover:underline flex items-center gap-1">
                        Select template →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* ── STEP 2: Candidate Placeholder Review Dialog ─────────── */}
      {workflowState === 'review' && selectedTemplate && (
        <Dialog
          title={`Generate ${selectedTemplate.name}`}
          description={`Verify and complete the information that will populate this document for ${candidateName}.`}
          onClose={() => setWorkflowState('templates')}
          size="md"
          footer={
            <div className="flex justify-between items-center w-full">
              <button
                type="button"
                onClick={() => setWorkflowState('templates')}
                className={actionClass}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to templates
              </button>
              <button
                type="button"
                disabled={generating}
                onClick={executeGenerate}
                className={primaryClass}
              >
                <Sparkles className="w-4 h-4" />
                {generating ? 'Generating…' : 'Generate & Open Editor'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Missing fields notice */}
            {placeholderInfo && placeholderInfo.missingFields.length > 0 ? (
              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Some candidate fields are not yet set</span>
                </div>
                <p>
                  You can provide values below before generating the letter, or edit them directly inside the document editor later.
                </p>
                <div className="mt-3 space-y-2">
                  {placeholderInfo.missingFields.map((field) => (
                    <div key={field.key} className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900/40">
                      <label htmlFor={`custom-${field.key}`} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {field.label} <span className="font-normal text-slate-400 font-mono text-[10px]">({`{{${field.key}}}`})</span>
                      </label>
                      <input
                        id={`custom-${field.key}`}
                        type="text"
                        placeholder={`Enter ${field.label.toLowerCase()}…`}
                        value={customFieldValues[field.key] ?? ''}
                        onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })}
                        className={fieldClass}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-teal-200 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-950/20 text-xs text-teal-800 dark:text-teal-200 flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-600 shrink-0" />
                <span>All standard candidate profile fields are available and mapped.</span>
              </div>
            )}

            {/* Candidate information summary preview */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Candidate Information Used
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-[#2B293E]">
                {placeholderInfo &&
                  Object.entries(placeholderInfo.placeholders)
                    .filter(([k, v]) => v && ['candidate_name', 'candidate_id', 'designation', 'department', 'annual_salary', 'joining_date', 'candidate_email', 'company_name'].includes(k))
                    .map(([key, val]) => (
                      <div key={key}>
                        <span className="text-slate-400 block text-[10px]">{key.replace(/_/g, ' ')}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">{val}</span>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* ── STEP 3: Full Document Editor View ───────────────────── */}
      {workflowState === 'editor' && docContent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-between overflow-hidden">
          {/* Header */}
          <header className="px-4 py-3 bg-white dark:bg-[#181724] border-b border-slate-200 dark:border-[#2B293E] flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={handleCloseEditor}
                className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"
                title="Close editor"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex items-center gap-2">
                <input
                  type="text"
                  value={editingDocTitle}
                  onChange={(e) => setEditingDocTitle(e.target.value)}
                  className="font-bold text-base text-slate-900 dark:text-slate-100 bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 focus:border-teal-500 focus:outline-none px-1 py-0.5 max-w-sm sm:max-w-md"
                  placeholder="Document title…"
                />
                <Badge variant={isDirty ? 'warning' : 'success'} size="sm">
                  {savingDoc ? 'Saving…' : isDirty ? 'Unsaved changes' : 'All changes saved'}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {editingDocId && versionsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowVersionsModal(true)}
                  className={actionClass}
                  title="View revision history"
                >
                  <History className="w-3.5 h-3.5" />
                  History ({versionsList.length})
                </button>
              )}

              {editingDocId && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadDocx(editingDocId, editingDocTitle)}
                    disabled={downloadingDocx === editingDocId}
                    className={actionClass}
                    title="Export as Microsoft Word .docx"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Word (.docx)
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPdf(editingDocId, editingDocTitle)}
                    disabled={downloadingPdf === editingDocId}
                    className={actionClass}
                    title="Export as PDF"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </>
              )}

              {canManage && (
                <button
                  type="button"
                  disabled={savingDoc}
                  onClick={() => handleSave()}
                  className={primaryClass}
                >
                  <Check className="w-4 h-4" />
                  {savingDoc ? 'Saving…' : 'Save Document'}
                </button>
              )}

              <button
                type="button"
                onClick={handleCloseEditor}
                className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10 ml-2"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Editor Body */}
          <main className="flex-1 overflow-y-auto bg-slate-100 dark:bg-[#12111B] p-4 sm:p-6">
            <div className="max-w-5xl mx-auto">
              <LetterEditor
                document={docContent}
                format={DEFAULT_FORMAT}
                editable={canManage}
                table="OFFER_LETTER"
                page={activePage}
                margins={docLayout.marginsMm}
                letterhead={currentLetterhead}
                letterheadImages={letterheadImages}
                elementImages={elementImages}
                showPageNumbers={docLayout.showPageNumbers}
                zoom={zoom}
                stageRef={stageRef}
                zoomControls={zoomControls}
                onReady={(_editor, doc) => {
                  setDocContent(doc);
                }}
                onChange={setDocContent}
              />
            </div>
          </main>
        </div>
      )}

      {/* ── Confirm Exit Modal ──────────────────────────────────── */}
      {showExitConfirm && (
        <Dialog
          title="Leave without saving?"
          description="You have unsaved edits in this document that will be lost if you exit now."
          onClose={() => setShowExitConfirm(false)}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowExitConfirm(false)} className={actionClass}>
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  setWorkflowState(null);
                  setDocContent(null);
                  setEditingDocId(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white"
              >
                Discard changes
              </button>
            </div>
          }
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Click “Keep editing” to stay and save your changes, or “Discard changes” to close the editor.
          </p>
        </Dialog>
      )}

      {/* ── Version History Modal ───────────────────────────────── */}
      {showVersionsModal && (
        <Dialog
          title="Document Revision History"
          description={`Past saved revisions of “${editingDocTitle}”.`}
          onClose={() => setShowVersionsModal(false)}
          size="md"
          footer={
            <div className="flex justify-end">
              <button type="button" onClick={() => setShowVersionsModal(false)} className={actionClass}>
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <ol className="divide-y divide-slate-100 dark:divide-white/5">
              {versionsList.map((ver) => (
                <li key={ver.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Version {ver.versionNumber}: {ver.title}
                    </span>
                    <span className="block text-slate-400 text-[11px] mt-0.5">
                      Saved {formatDateTime(ver.createdAt)} {ver.createdByName ? `by ${ver.createdByName}` : ''}
                    </span>
                  </div>
                  <Badge variant="neutral" size="sm">Saved</Badge>
                </li>
              ))}
            </ol>
          </div>
        </Dialog>
      )}

      {/* ── PDF Preview Modal ───────────────────────────────────── */}
      {previewPdfBuffer && (
        <PdfViewer
          title={previewPdfTitle}
          description="High-fidelity PDF preview of the candidate document."
          notice="Official document preview with letterhead artwork and layout."
          load={() => Promise.resolve(previewPdfBuffer)}
          downloadName={`${sanitizeFilename(candidateName)}_${sanitizeFilename(previewPdfTitle)}.pdf`}
          onClose={() => setPreviewPdfBuffer(null)}
        />
      )}
    </>
  );
};
