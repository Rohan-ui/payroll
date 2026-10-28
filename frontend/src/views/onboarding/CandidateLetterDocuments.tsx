import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bold,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileBadge,
  FileCheck,
  FileDown,
  FileText,
  Heading2,
  History,
  Italic,
  List,
  ListOrdered,
  Mail,
  MailCheck,
  MoreVertical,
  Plus,
  Redo,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sliders,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
  X,
  XCircle,
} from 'lucide-react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
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
  type DocumentStatusHistoryItem,
  type DocumentVersionItem,
  type DocumentEmailItem,
  type DocumentEmailPreview,
  type EmailTemplateItem,
} from '../../api/onboarding.api';
import { documentsApi, type DocumentFormat, type LetterDocument, type Letterhead, type PageMargins } from '../../api/documents.api';
import { fieldClass, formatDate, formatDateTime, labelClass } from './onboarding-format';
import { LetterEditor } from '../documents/LetterEditor';
import { PAGE_SIZES, pxPerMm, uniformMargins } from '../documents/letterhead-geometry';
import { toLayout, useElementImages, useLetterheadImages } from '../documents/LetterheadsView';
import { EmailTemplateEditorModal } from './EmailTemplateEditorModal';
import { EmailTemplatesView } from '../documents/EmailTemplatesView';

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW', 'APPROVED', 'WITHDRAWN'],
  IN_REVIEW: ['DRAFT', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['SENT', 'IN_REVIEW', 'REJECTED', 'WITHDRAWN'],
  SENT: ['DELIVERED', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  DELIVERED: ['VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  VIEWED: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  ACCEPTED: ['WITHDRAWN'],
  REJECTED: ['DRAFT'],
  EXPIRED: ['DRAFT', 'WITHDRAWN'],
  WITHDRAWN: ['DRAFT'],
};

const STATUS_VARIANTS: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'purple'> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  APPROVED: 'success',
  SENT: 'purple',
  DELIVERED: 'neutral',
  VIEWED: 'neutral',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  WITHDRAWN: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  VIEWED: 'Viewed',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
};

const EMAIL_STATUS_VARIANTS: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'purple'> = {
  SENT: 'purple',
  DELIVERED: 'success',
  FAILED: 'danger',
  NOT_SENT: 'neutral',
};

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

function getUnresolvedPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.slice(2, -2))));
}

const EmailPersonalizeEditor: React.FC<{
  initialContent: string;
  onChange: (html: string) => void;
  supportedPlaceholders: string[];
}> = ({ initialContent, onChange, supportedPlaceholders }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
  }, [initialContent, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-hidden focus-within:ring-2 focus-within:ring-teal-500">
      <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-xs">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${editor.isActive('bold') ? 'bg-slate-200 dark:bg-white/20 font-bold' : ''}`}
          title="Bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${editor.isActive('italic') ? 'bg-slate-200 dark:bg-white/20' : ''}`}
          title="Italic"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${editor.isActive('underline') ? 'bg-slate-200 dark:bg-white/20' : ''}`}
          title="Underline"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${editor.isActive('strike') ? 'bg-slate-200 dark:bg-white/20' : ''}`}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-slate-300 dark:bg-white/10 mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${editor.isActive('heading', { level: 2 }) ? 'bg-slate-200 dark:bg-white/20 font-bold' : ''}`}
          title="Heading"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${editor.isActive('bulletList') ? 'bg-slate-200 dark:bg-white/20' : ''}`}
          title="Bullet List"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${editor.isActive('orderedList') ? 'bg-slate-200 dark:bg-white/20' : ''}`}
          title="Numbered List"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-slate-300 dark:bg-white/10 mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30"
          title="Undo"
        >
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30"
          title="Redo"
        >
          <Redo className="w-3.5 h-3.5" />
        </button>
      </div>

      <EditorContent editor={editor} className="p-4 min-h-[220px] max-h-[440px] overflow-y-auto text-xs sm:text-sm focus:outline-none" />

      {/* Quick Insert Placeholders */}
      {supportedPlaceholders.length > 0 && (
        <div className="p-2 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
            Insert token:
          </span>
          {supportedPlaceholders.slice(0, 8).map((ph) => (
            <button
              key={ph}
              type="button"
              onClick={() => {
                editor.chain().focus().insertContent(`{{${ph}}}`).run();
                toast.success(`Inserted {{${ph}}}`);
              }}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-teal-500 text-teal-700 dark:text-teal-300"
            >
              {`{{${ph}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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

  // Status modal state
  const [statusModalDoc, setStatusModalDoc] = useState<CandidateLetterDocumentSummary | null>(null);
  const [selectedNextStatus, setSelectedNextStatus] = useState<string>('');
  const [statusReason, setStatusReason] = useState<string>('');
  const [statusHistory, setStatusHistory] = useState<DocumentStatusHistoryItem[]>([]);
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  // Version history modal state
  const [versionModalDoc, setVersionModalDoc] = useState<CandidateLetterDocumentSummary | null>(null);
  const [versionsHistoryList, setVersionsHistoryList] = useState<DocumentVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState<boolean>(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState<string>('');
  const [versionToRestore, setVersionToRestore] = useState<DocumentVersionItem | null>(null);

  // Action Menu dropdown state (by doc id)
  const [openActionMenuDocId, setOpenActionMenuDocId] = useState<string | null>(null);

  // Email template editor modal state
  const [editingEmailTemplateId, setEditingEmailTemplateId] = useState<string | null>(null);
  const [showEmailTemplatesModal, setShowEmailTemplatesModal] = useState<boolean>(false);

  // Send email modal state
  const [emailModalDoc, setEmailModalDoc] = useState<CandidateLetterDocumentSummary | null>(null);
  const [emailPreview, setEmailPreview] = useState<DocumentEmailPreview | null>(null);
  const [emailLoading, setEmailLoading] = useState<boolean>(false);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [ccEmails, setCcEmails] = useState<string>('');
  const [bccEmails, setBccEmails] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [showPlaceholdersGuide, setShowPlaceholdersGuide] = useState<boolean>(false);
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [showSendConfirm, setShowSendConfirm] = useState<boolean>(false);
  const [emailDialogTab, setEmailDialogTab] = useState<'preview' | 'personalize'>('preview');
  const [settingDefaultTemplate, setSettingDefaultTemplate] = useState<boolean>(false);
  const [confirmUnresolvedSend, setConfirmUnresolvedSend] = useState<boolean>(false);

  // Email history modal state
  const [emailHistoryDoc, setEmailHistoryDoc] = useState<CandidateLetterDocumentSummary | null>(null);
  const [emailHistoryList, setEmailHistoryList] = useState<DocumentEmailItem[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState<boolean>(false);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);

  // Editor changelog note & concurrency
  const [editingVersionNumber, setEditingVersionNumber] = useState<number>(1);
  const [saveChangelogNote, setSaveChangelogNote] = useState<string>('');

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
      setEditingVersionNumber(detail.versionNumber || 1);
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
        changelogNote: saveChangelogNote.trim() || (editingDocId ? `Edited ${editingDocTitle}` : 'Initial generation'),
        expectedVersionNumber: editingDocId ? editingVersionNumber : undefined,
      } as any);

      setEditingDocId(saved.id);
      setEditingDocStatus(saved.documentStatus);
      setEditingVersionNumber(saved.versionNumber);
      setSavedSnapshot(JSON.stringify(docContent));
      toast.success(saved.versionNumber > editingVersionNumber ? `Saved as version v${saved.versionNumber}` : 'Document saved successfully');
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

  // ── Status Management Handlers ───────────────────────────────
  const openStatusModal = async (doc: CandidateLetterDocumentSummary) => {
    setStatusModalDoc(doc);
    const allowed = VALID_STATUS_TRANSITIONS[doc.documentStatus] || [];
    setSelectedNextStatus(allowed[0] || '');
    setStatusReason('');
    setStatusLoading(true);
    try {
      const history = await onboardingApi.getDocumentStatusHistory(candidateId, doc.id);
      setStatusHistory(history);
    } catch {
      setStatusHistory([]);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusModalDoc || !selectedNextStatus) return;
    if (['REJECTED', 'WITHDRAWN'].includes(selectedNextStatus) && !statusReason.trim()) {
      toast.error(`A reason is required when transitioning status to ${STATUS_LABELS[selectedNextStatus] || selectedNextStatus}.`);
      return;
    }

    setUpdatingStatus(true);
    try {
      await onboardingApi.changeDocumentStatus(candidateId, statusModalDoc.id, {
        newStatus: selectedNextStatus,
        reason: statusReason.trim() || undefined,
      });
      toast.success(`Status changed to ${STATUS_LABELS[selectedNextStatus] || selectedNextStatus}`);
      setStatusModalDoc(null);
      loadDocuments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to change status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Version History Handlers ─────────────────────────────────
  const openVersionHistoryModal = async (doc: CandidateLetterDocumentSummary) => {
    setVersionModalDoc(doc);
    setVersionsLoading(true);
    try {
      const versions = await onboardingApi.listDocumentVersions(candidateId, doc.id);
      setVersionsHistoryList(versions);
    } catch (e) {
      toast.error('Failed to load version history.');
      setVersionsHistoryList([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleDownloadVersionPdf = async (verId: string, verNumber: number, title: string) => {
    try {
      if (!versionModalDoc) return;
      const bytes = await onboardingApi.downloadVersionPdf(candidateId, versionModalDoc.id, verId);
      const filename = `${sanitizeFilename(candidateName)}_${sanitizeFilename(title)}_v${verNumber}.pdf`;
      triggerDownload(bytes, filename, 'application/pdf');
      toast.success(`Downloaded PDF v${verNumber}`);
    } catch (e) {
      toast.error('Failed to download PDF.');
    }
  };

  const handleDownloadVersionDocx = async (verId: string, verNumber: number, title: string) => {
    try {
      if (!versionModalDoc) return;
      const bytes = await onboardingApi.downloadVersionDocx(candidateId, versionModalDoc.id, verId);
      const filename = `${sanitizeFilename(candidateName)}_${sanitizeFilename(title)}_v${verNumber}.docx`;
      triggerDownload(bytes, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      toast.success(`Downloaded DOCX v${verNumber}`);
    } catch (e) {
      toast.error('Failed to download DOCX.');
    }
  };

  const handlePreviewVersionPdf = async (verId: string, verNumber: number, title: string) => {
    try {
      if (!versionModalDoc) return;
      const bytes = await onboardingApi.downloadVersionPdf(candidateId, versionModalDoc.id, verId);
      setPreviewPdfBuffer(bytes);
      setPreviewPdfTitle(`${title} (v${verNumber})`);
    } catch (e) {
      toast.error('Failed to preview version PDF.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!versionModalDoc || !versionToRestore) return;
    setRestoringVersionId(versionToRestore.id);
    try {
      const res = await onboardingApi.restoreDocumentVersion(
        candidateId,
        versionModalDoc.id,
        versionToRestore.id,
        restoreNote.trim() || `Restored from version v${versionToRestore.versionNumber}`,
      );
      toast.success(`Restored version v${versionToRestore.versionNumber} as new version v${res.versionNumber}`);
      setVersionToRestore(null);
      setRestoreNote('');
      const updatedVersions = await onboardingApi.listDocumentVersions(candidateId, versionModalDoc.id);
      setVersionsHistoryList(updatedVersions);
      loadDocuments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore version.');
    } finally {
      setRestoringVersionId(null);
    }
  };

  // ── Send Email Handlers ──────────────────────────────────────
  const openSendEmailModal = async (doc: CandidateLetterDocumentSummary) => {
    setEmailModalDoc(doc);
    setEmailLoading(true);
    setShowPlaceholdersGuide(false);
    setShowSendConfirm(false);
    setEmailDialogTab('preview');
    setConfirmUnresolvedSend(false);
    try {
      const preview = await onboardingApi.previewDocumentEmail(candidateId, doc.id);
      setEmailPreview(preview);
      const initialTplId = preview.associatedTemplateId || preview.templateId || (preview.availableTemplates[0]?.id ?? '');
      setSelectedEmailTemplateId(initialTplId);
      setRecipientEmail(preview.recipientEmail || '');
      setCcEmails('');
      setBccEmails('');
      setEmailSubject(preview.subject || '');
      setEmailBody(preview.bodyHtml || '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not prepare email preview.');
      setEmailModalDoc(null);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSelectEmailTemplate = async (templateId: string) => {
    setSelectedEmailTemplateId(templateId);
    if (!emailModalDoc) return;
    try {
      setEmailLoading(true);
      const preview = await onboardingApi.previewDocumentEmail(candidateId, emailModalDoc.id, { templateId });
      setEmailPreview(preview);
      setEmailSubject(preview.subject);
      setEmailBody(preview.bodyHtml);
      setEmailDialogTab('preview');
    } catch (e) {
      toast.error('Failed to load email template preview.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSetAsDefaultAssociation = async () => {
    if (!emailPreview?.documentTemplateId || !selectedEmailTemplateId) return;
    setSettingDefaultTemplate(true);
    try {
      await onboardingApi.updateDocumentTemplateEmailAssociation(
        emailPreview.documentTemplateId,
        selectedEmailTemplateId,
      );
      setEmailPreview((prev) => (prev ? { ...prev, associatedTemplateId: selectedEmailTemplateId } : prev));
      const chosenTpl = emailPreview.availableTemplates.find((t) => t.id === selectedEmailTemplateId);
      toast.success(`Set "${chosenTpl?.name || 'Email Template'}" as default template for this document.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update email template association.');
    } finally {
      setSettingDefaultTemplate(false);
    }
  };

  const openEditMasterEmailTemplate = () => {
    if (!selectedEmailTemplateId) {
      toast.error('Please select an email template to edit.');
      return;
    }
    setEditingEmailTemplateId(selectedEmailTemplateId);
  };

  const handleEmailTemplateSaved = async (savedTpl: EmailTemplateItem) => {
    setEditingEmailTemplateId(null);
    if (emailModalDoc) {
      setEmailLoading(true);
      try {
        const preview = await onboardingApi.previewDocumentEmail(candidateId, emailModalDoc.id, {
          templateId: savedTpl.id,
        });
        setEmailPreview(preview);
        setSelectedEmailTemplateId(savedTpl.id);
        setEmailSubject(preview.subject);
        setEmailBody(preview.bodyHtml);
        setEmailDialogTab('preview');
        toast.success(`Master template "${savedTpl.templateName || savedTpl.name}" updated in database. Live preview refreshed.`);
      } catch {
        toast.error('Template saved, but preview refresh failed.');
      } finally {
        setEmailLoading(false);
      }
    }
  };

  const handleResetToTemplateDefaults = async () => {
    if (!emailModalDoc || !selectedEmailTemplateId) return;
    try {
      setEmailLoading(true);
      const preview = await onboardingApi.previewDocumentEmail(candidateId, emailModalDoc.id, {
        templateId: selectedEmailTemplateId,
      });
      setEmailSubject(preview.subject);
      setEmailBody(preview.bodyHtml);
      toast.success('Reset email subject and body to master template defaults.');
    } catch {
      toast.error('Failed to reset template defaults.');
    } finally {
      setEmailLoading(false);
    }
  };

  const unresolvedTokens = useMemo(() => {
    return getUnresolvedPlaceholders(`${emailSubject} ${emailBody}`);
  }, [emailSubject, emailBody]);

  const handleSendEmail = async () => {
    if (!emailModalDoc || !emailPreview) return;
    if (!recipientEmail.trim()) {
      toast.error('Please enter a recipient email address.');
      return;
    }
    if (!emailSubject.trim()) {
      toast.error('Please enter an email subject.');
      return;
    }
    if (!emailBody.trim()) {
      toast.error('Please enter email content.');
      return;
    }

    if (unresolvedTokens.length > 0 && !confirmUnresolvedSend) {
      toast.error('Please resolve missing placeholders or acknowledge the warning before sending.');
      return;
    }

    setIsSendingEmail(true);
    try {
      const result = await onboardingApi.sendDocumentEmail(candidateId, emailModalDoc.id, {
        emailTemplateId: selectedEmailTemplateId || undefined,
        recipientEmail: recipientEmail.trim(),
        ccEmails: ccEmails.trim() || undefined,
        bccEmails: bccEmails.trim() || undefined,
        subject: emailSubject.trim(),
        bodyHtml: emailBody,
        versionId: emailPreview.versionId,
      });

      if (result.success) {
        toast.success(`Document sent successfully to ${recipientEmail}`);
      } else {
        toast.error(`Email send recorded with status: ${result.deliveryStatus}`);
      }
      setEmailModalDoc(null);
      setShowSendConfirm(false);
      loadDocuments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send email.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // ── Email History Handlers ───────────────────────────────────
  const openEmailHistoryModal = async (doc: CandidateLetterDocumentSummary) => {
    setEmailHistoryDoc(doc);
    setEmailHistoryLoading(true);
    try {
      const list = await onboardingApi.listDocumentEmails(candidateId, doc.id);
      setEmailHistoryList(list);
    } catch (e) {
      toast.error('Failed to load email sending history.');
      setEmailHistoryList([]);
    } finally {
      setEmailHistoryLoading(false);
    }
  };

  const handleRetryEmail = async (emailId: string) => {
    if (!emailHistoryDoc) return;
    setRetryingEmailId(emailId);
    try {
      const result = await onboardingApi.retryDocumentEmail(candidateId, emailHistoryDoc.id, emailId);
      if (result.success) {
        toast.success('Email resent successfully');
      } else {
        toast.error(`Retry finished with status: ${result.deliveryStatus}`);
      }
      const list = await onboardingApi.listDocumentEmails(candidateId, emailHistoryDoc.id);
      setEmailHistoryList(list);
      loadDocuments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to retry sending.');
    } finally {
      setRetryingEmailId(null);
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEmailTemplatesModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 shadow-xs transition-colors"
                title="Open Email Templates Module to customize and link templates"
              >
                <Mail className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Email Templates</span>
              </button>
              <button type="button" onClick={startGenerateWizard} className={primaryClass}>
                <Plus className="w-4 h-4" />
                <span>Generate Document</span>
              </button>
            </div>
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
                className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs space-y-3"
              >
                {/* Top Row: Title, Status, Version, and Primary Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5">
                      <FileText className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
                          {doc.documentTitle}
                        </h3>
                        <Badge variant={STATUS_VARIANTS[doc.documentStatus] || 'neutral'} size="sm">
                          {STATUS_LABELS[doc.documentStatus] || doc.documentStatus}
                        </Badge>
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/10">
                          v{doc.versionNumber}
                        </span>
                      </div>

                      {/* Secondary Metadata Row */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{doc.typeLabel}</span>
                        {doc.templateName && (
                          <>
                            <span>•</span>
                            <span>Template: <strong className="font-medium text-slate-700 dark:text-slate-300">{doc.templateName}</strong></span>
                          </>
                        )}
                        <span>•</span>
                        <span>Updated {formatDateTime(doc.updatedAt)} {doc.updatedByName ? `by ${doc.updatedByName}` : ''}</span>
                      </div>
                    </div>
                  </div>

                  {/* Primary Quick Actions & Action Menu */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => previewPdf(doc.id, doc.documentTitle)}
                      className={actionClass}
                      title="Preview official PDF"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Preview</span>
                    </button>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openSavedDocument(doc.id)}
                        className={`${actionClass} text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-500/10 hover:bg-teal-100/60`}
                        title="Edit Document Content & Layout"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openSendEmailModal(doc)}
                        className={`${actionClass} font-semibold text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60 bg-sky-50/50 dark:bg-sky-500/10 hover:bg-sky-100/60`}
                        title="Send PDF to candidate via email"
                      >
                        <Send className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>Send Email</span>
                      </button>
                    )}

                    {/* Action Menu (More actions dropdown) */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionMenuDocId(openActionMenuDocId === doc.id ? null : doc.id);
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        aria-label="More actions"
                        aria-expanded={openActionMenuDocId === doc.id}
                        title="More actions"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openActionMenuDocId === doc.id && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setOpenActionMenuDocId(null)}
                          />
                          <div
                            role="menu"
                            className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] shadow-lg py-1.5 z-30 focus:outline-none"
                          >
                            {canManage && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenActionMenuDocId(null);
                                  openStatusModal(doc);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                              >
                                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                                <span>Change Workflow Status</span>
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenuDocId(null);
                                openVersionHistoryModal(doc);
                              }}
                              className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                            >
                              <span className="flex items-center gap-2.5">
                                <History className="w-3.5 h-3.5 text-slate-400" />
                                <span>Version History</span>
                              </span>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500">
                                v{doc.versionCount || 1}
                              </span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenuDocId(null);
                                openEmailHistoryModal(doc);
                              }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              <span>Email Delivery History</span>
                            </button>
                            <div className="my-1 border-t border-slate-100 dark:border-white/10" />
                            <button
                              type="button"
                              role="menuitem"
                              disabled={downloadingPdf === doc.id}
                              onClick={() => {
                                setOpenActionMenuDocId(null);
                                downloadPdf(doc.id, doc.documentTitle);
                              }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                            >
                              <FileDown className="w-3.5 h-3.5 text-slate-400" />
                              <span>Download PDF</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={downloadingDocx === doc.id}
                              onClick={() => {
                                setOpenActionMenuDocId(null);
                                downloadDocx(doc.id, doc.documentTitle);
                              }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                            >
                              <Download className="w-3.5 h-3.5 text-slate-400" />
                              <span>Download DOCX</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Email Delivery Status Strip (Separated from document workflow status) */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Email Delivery:</span>
                    {doc.emailStatus ? (
                      <Badge variant={EMAIL_STATUS_VARIANTS[doc.emailStatus] || 'neutral'} size="sm">
                        {doc.emailStatus === 'SENT' ? 'Email Sent' : doc.emailStatus === 'DELIVERED' ? 'Delivered' : doc.emailStatus === 'FAILED' ? 'Delivery Failed' : doc.emailStatus}
                      </Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Not Sent Yet
                      </span>
                    )}
                    {doc.lastSentAt ? (
                      <span className="text-slate-500 dark:text-slate-400 text-xs">
                        Last sent {formatDateTime(doc.lastSentAt)} {doc.lastSentByName ? `by ${doc.lastSentByName}` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">No email dispatched to candidate</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {doc.emailStatus && (
                      <button
                        type="button"
                        onClick={() => openEmailHistoryModal(doc)}
                        className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 underline underline-offset-2 flex items-center gap-1 transition-colors"
                      >
                        <Mail className="w-3 h-3" />
                        View Email History
                      </button>
                    )}
                    {!doc.emailStatus && canManage && (
                      <button
                        type="button"
                        onClick={() => openSendEmailModal(doc)}
                        className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 transition-colors"
                      >
                        <Send className="w-3 h-3" />
                        Send via Email
                      </button>
                    )}
                  </div>
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

      {/* ── Status Management Modal ────────────────────────────── */}
      {statusModalDoc && (
        <Dialog
          title="Change Document Status"
          description={`Update lifecycle status for “${statusModalDoc.documentTitle}”.`}
          onClose={() => setStatusModalDoc(null)}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStatusModalDoc(null)} className={actionClass}>
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingStatus || !selectedNextStatus}
                onClick={handleUpdateStatus}
                className={primaryClass}
              >
                {updatingStatus ? 'Updating…' : 'Update Status'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Current Status</span>
              <Badge variant={STATUS_VARIANTS[statusModalDoc.documentStatus] || 'neutral'}>
                {STATUS_LABELS[statusModalDoc.documentStatus] || statusModalDoc.documentStatus}
              </Badge>
            </div>

            <div>
              <label className={labelClass}>
                Next Status <span className="text-red-500">*</span>
              </label>
              {(VALID_STATUS_TRANSITIONS[statusModalDoc.documentStatus] || []).length === 0 ? (
                <p className="text-xs text-slate-500 p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                  No permitted transitions available from this status.
                </p>
              ) : (
                <select
                  value={selectedNextStatus}
                  onChange={(e) => setSelectedNextStatus(e.target.value)}
                  className={fieldClass}
                >
                  {(VALID_STATUS_TRANSITIONS[statusModalDoc.documentStatus] || []).map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st] || st}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className={labelClass}>
                Reason / Comment {['REJECTED', 'WITHDRAWN'].includes(selectedNextStatus) ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(Optional)</span>}
              </label>
              <textarea
                rows={3}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder={
                  ['REJECTED', 'WITHDRAWN'].includes(selectedNextStatus)
                    ? 'Enter reason for rejection or withdrawal (mandatory)…'
                    : 'Add audit note explaining this status change…'
                }
                className={fieldClass}
              />
            </div>

            {/* Status History Timeline */}
            <div className="pt-2 border-t border-slate-100 dark:border-white/10">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" />
                Status Audit Trail
              </h4>
              {statusLoading ? (
                <p className="text-xs text-slate-400 py-2">Loading status history…</p>
              ) : statusHistory.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No previous transitions recorded.</p>
              ) : (
                <ol className="relative border-l border-slate-200 dark:border-white/10 ml-2 space-y-3">
                  {statusHistory.map((item) => (
                    <li key={item.id} className="ml-4 text-xs">
                      <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#181724] bg-teal-500" />
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.toStatus}
                        </span>
                        {item.fromStatus && (
                          <span className="text-[11px] text-slate-400">from {item.fromStatus}</span>
                        )}
                        <span className="text-[11px] text-slate-400 ml-auto">{formatDateTime(item.changedAt)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        By {item.changedByName || 'System'}
                        {item.reason ? ` · “${item.reason}”` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </Dialog>
      )}

      {/* ── Complete Version History Modal ──────────────────────── */}
      {versionModalDoc && (
        <Dialog
          title="Document Version History"
          description={`Complete immutable version log for “${versionModalDoc.documentTitle}”.`}
          onClose={() => setVersionModalDoc(null)}
          size="lg"
          footer={
            <div className="flex justify-end">
              <button type="button" onClick={() => setVersionModalDoc(null)} className={actionClass}>
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {versionsLoading ? (
              <div className="h-40 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse flex items-center justify-center text-xs text-slate-400">
                Loading version history…
              </div>
            ) : versionsHistoryList.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No historical versions found.</p>
            ) : (
              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {versionsHistoryList.map((ver) => (
                  <div
                    key={ver.id}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      ver.isCurrent
                        ? 'border-teal-300 dark:border-teal-700/60 bg-teal-50/30 dark:bg-teal-500/5'
                        : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200">
                            v{ver.versionNumber}
                          </span>
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {ver.title}
                          </span>
                          {ver.isCurrent && (
                            <Badge variant="success" size="sm">
                              Current
                            </Badge>
                          )}
                          <Badge variant={STATUS_VARIANTS[ver.documentStatus] || 'neutral'} size="sm">
                            {ver.documentStatus}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Saved {formatDateTime(ver.createdAt)} {ver.createdByName ? `by ${ver.createdByName}` : ''}
                          {ver.changelogNote ? ` · Note: ${ver.changelogNote}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewVersionPdf(ver.id, ver.versionNumber, ver.title)}
                          className={actionClass}
                          title="Preview PDF"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadVersionPdf(ver.id, ver.versionNumber, ver.title)}
                          className={actionClass}
                          title="Download PDF snapshot"
                        >
                          <FileDown className="w-3.5 h-3.5 text-slate-500" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadVersionDocx(ver.id, ver.versionNumber, ver.title)}
                          className={actionClass}
                          title="Download Word DOCX snapshot"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          DOCX
                        </button>
                        {canManage && !ver.isCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              setVersionToRestore(ver);
                              setRestoreNote(`Restored from version v${ver.versionNumber}`);
                            }}
                            className={`${actionClass} text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-500/10 hover:bg-amber-100/60`}
                            title="Restore this version (creates new version)"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* ── Restore Version Confirmation Modal ──────────────────── */}
      {versionToRestore && (
        <Dialog
          title={`Restore Version v${versionToRestore.versionNumber}?`}
          description="Restoring an earlier version creates a brand new immutable version containing that historical snapshot. Past revisions remain untouched and will never be overwritten."
          onClose={() => setVersionToRestore(null)}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVersionToRestore(null)} className={actionClass}>
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(restoringVersionId)}
                onClick={handleConfirmRestore}
                className={primaryClass}
              >
                {restoringVersionId ? 'Restoring…' : 'Confirm Restoration'}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className={labelClass}>Restoration Note</label>
              <input
                type="text"
                value={restoreNote}
                onChange={(e) => setRestoreNote(e.target.value)}
                placeholder="Optional explanation for restoring this revision…"
                className={fieldClass}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* ── Send Email Composition Modal ────────────────────────── */}
      {emailModalDoc && (
        <Dialog
          title="Send Document via Email"
          description={`Compose, personalize, and deliver official PDF to ${candidateName}.`}
          onClose={() => setEmailModalDoc(null)}
          size="2xl"
          footer={
            <div className="flex flex-col sm:flex-row justify-between items-center w-full gap-2">
              <span className="text-[11px] text-slate-400">
                Exact PDF snapshot v{emailPreview?.versionNumber} will be attached and permanently recorded.
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEmailModalDoc(null)} className={actionClass}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={emailLoading || isSendingEmail || !emailPreview}
                  onClick={() => {
                    setConfirmUnresolvedSend(false);
                    setShowSendConfirm(true);
                  }}
                  className={primaryClass}
                >
                  <Send className="w-3.5 h-3.5" />
                  Review & Send
                </button>
              </div>
            </div>
          }
        >
          {emailLoading ? (
            <div className="h-64 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse flex items-center justify-center text-xs text-slate-400">
              Preparing email template & PDF attachment snapshot…
            </div>
          ) : emailPreview ? (
            <div className="space-y-4">
              {/* Unresolved Placeholders Warning Banner */}
              {unresolvedTokens.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Unresolved Dynamic Placeholders Detected</strong>
                    <p className="mt-0.5">
                      The current subject or email body contains placeholders that could not be automatically resolved from candidate data:
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {unresolvedTokens.map((p) => (
                        <span key={p} className="px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/40 font-mono text-[11px] font-bold">
                          {`{{${p}}}`}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                      You can click <strong>Personalize This Email</strong> below to replace them manually, or edit the master template.
                    </p>
                  </div>
                </div>
              )}

              {/* Master Email Template Configuration Card */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50/70 dark:bg-white/[0.03] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {emailPreview.availableTemplates.find((t) => t.id === selectedEmailTemplateId)?.name || 'Email Template'}
                        </span>
                        <Badge variant="purple" size="sm">
                          Reusable Master Template
                        </Badge>
                        {emailPreview.documentTemplateId && emailPreview.associatedTemplateId === selectedEmailTemplateId && (
                          <Badge variant="success" size="sm">
                            Default Association
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Controls the reusable subject line, rich-text layout, and candidate placeholders for future sends.
                      </p>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowEmailTemplatesModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-[#181724] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 shadow-xs transition-colors shrink-0"
                        title="Manage, create, or link reusable email templates across all document types"
                      >
                        <Settings className="w-3.5 h-3.5 text-slate-500" />
                        <span>Manage All Templates</span>
                      </button>
                      <button
                        type="button"
                        onClick={openEditMasterEmailTemplate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-[#181724] border border-teal-300 dark:border-teal-700/60 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-500/10 shadow-xs transition-colors shrink-0"
                        title="Edit the master template saved in the database for all future emails"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>Edit Master Template</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Template Switcher & Association Button */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-white/5">
                  <div className="flex-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                      Switch Reusable Email Template:
                    </label>
                    <select
                      value={selectedEmailTemplateId}
                      onChange={(e) => {
                        if (e.target.value === '__manage_templates__') {
                          setShowEmailTemplatesModal(true);
                          return;
                        }
                        handleSelectEmailTemplate(e.target.value);
                      }}
                      className={fieldClass}
                    >
                      {emailPreview.availableTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.documentKind || tpl.category || 'Standard'})
                        </option>
                      ))}
                      <option value="__manage_templates__">
                        ⚙️ Manage / Create Email Templates...
                      </option>
                    </select>
                  </div>

                  {canManage && emailPreview.documentTemplateId && emailPreview.associatedTemplateId !== selectedEmailTemplateId && (
                    <div className="sm:self-end">
                      <button
                        type="button"
                        disabled={settingDefaultTemplate}
                        onClick={handleSetAsDefaultAssociation}
                        className={`${actionClass} text-xs text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60 hover:bg-teal-50 dark:hover:bg-teal-500/10 whitespace-nowrap`}
                        title="Set this template as the default email template for this document type"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {settingDefaultTemplate ? 'Saving…' : 'Save as Default for Document'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* View / Edit Mode Switcher */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2B293E] pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEmailDialogTab('preview')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                      emailDialogTab === 'preview'
                        ? 'bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Live Preview (Resolved)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailDialogTab('personalize')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                      emailDialogTab === 'personalize'
                        ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/30'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Personalize This Email (One-off)</span>
                  </button>
                </div>

                {emailDialogTab === 'personalize' && (
                  <button
                    type="button"
                    onClick={handleResetToTemplateDefaults}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline flex items-center gap-1"
                    title="Discard individual edits and reload from master template"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Template Defaults
                  </button>
                )}
              </div>

              {/* Mode A: Live Preview */}
              {emailDialogTab === 'preview' && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] shadow-xs space-y-3">
                    <div className="border-b border-slate-100 dark:border-white/5 pb-2.5 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-400 w-16">To:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {recipientEmail}
                        </span>
                      </div>
                      {(ccEmails || bccEmails) && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-400 w-16">CC/BCC:</span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {[ccEmails && `CC: ${ccEmails}`, bccEmails && `BCC: ${bccEmails}`].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-400 w-16">Subject:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {emailSubject}
                        </span>
                      </div>
                    </div>

                    {/* Email Body Preview rendered safely */}
                    <div
                      className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-slate-800 dark:text-slate-200 p-4 min-h-[240px] max-h-[460px] overflow-y-auto rounded-xl bg-slate-50/60 dark:bg-black/20 border border-slate-200/60 dark:border-white/5"
                      dangerouslySetInnerHTML={{ __html: emailBody }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      Dynamic placeholders resolved using verified candidate & document records.
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmailDialogTab('personalize')}
                      className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                    >
                      Need to tweak this email? Personalize it →
                    </button>
                  </div>
                </div>
              )}

              {/* Mode B: Personalize This Email */}
              {emailDialogTab === 'personalize' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-800/60 text-xs text-sky-800 dark:text-sky-300 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
                    <div>
                      <strong>Personalizing message for {candidateName}</strong>
                      <p className="mt-0.5 text-sky-700 dark:text-sky-300">
                        Changes made here apply only to this specific delivery. The reusable master template in the database will not be altered.
                      </p>
                    </div>
                  </div>

                  {/* Recipients */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Recipient Email (To) <span className="text-red-500">*</span></label>
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className={fieldClass}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>CC Emails <span className="text-slate-400 font-normal">(comma-separated)</span></label>
                      <input
                        type="text"
                        value={ccEmails}
                        onChange={(e) => setCcEmails(e.target.value)}
                        placeholder="e.g. hr@company.com, manager@company.com"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>BCC Emails <span className="text-slate-400 font-normal">(comma-separated)</span></label>
                      <input
                        type="text"
                        value={bccEmails}
                        onChange={(e) => setBccEmails(e.target.value)}
                        placeholder="e.g. archive@company.com"
                        className={fieldClass}
                      />
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className={labelClass}>Subject Line <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className={fieldClass}
                      required
                    />
                  </div>

                  {/* Rich Text Body Editor */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelClass}>Email Body (Rich Text)</label>
                      <span className="text-[11px] text-slate-400">Formatted with live formatting & dynamic placeholders</span>
                    </div>
                    <EmailPersonalizeEditor
                      initialContent={emailBody}
                      onChange={setEmailBody}
                      supportedPlaceholders={emailPreview.supportedPlaceholders || []}
                    />
                  </div>
                </div>
              )}

              {/* Attachment chip */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                      {emailPreview.attachmentFilename}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Document Version: v{emailPreview.versionNumber} (Official PDF)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => previewPdf(emailModalDoc.id, emailModalDoc.documentTitle)}
                  className={actionClass}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview PDF
                </button>
              </div>
            </div>
          ) : null}
        </Dialog>
      )}

      {/* ── Send Confirmation Dialog ────────────────────────────── */}
      {showSendConfirm && emailModalDoc && emailPreview && (
        <Dialog
          title="Confirm PDF Delivery"
          description={`Are you sure you want to send this ${emailModalDoc.typeLabel} to ${recipientEmail}?`}
          onClose={() => setShowSendConfirm(false)}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowSendConfirm(false)} className={actionClass}>
                Back
              </button>
              <button
                type="button"
                disabled={isSendingEmail || (unresolvedTokens.length > 0 && !confirmUnresolvedSend)}
                onClick={handleSendEmail}
                className={primaryClass}
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingEmail ? 'Sending…' : 'Confirm & Send Now'}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <p>
              An official email containing version <strong>v{emailPreview.versionNumber}</strong> of <strong>{emailModalDoc.documentTitle}</strong> will be delivered to <strong>{recipientEmail}</strong>.
            </p>
            <p className="text-slate-500">
              The exact PDF snapshot and delivery outcome will be permanently recorded in the document audit trail.
            </p>

            {/* Unresolved Placeholders Protection Checkbox */}
            {unresolvedTokens.length > 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <strong>Unresolved Placeholders in Message:</strong>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {unresolvedTokens.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/40 font-mono text-[10px] font-bold">
                          {`{{${t}}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-900 dark:text-amber-200 pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                  <input
                    type="checkbox"
                    checked={confirmUnresolvedSend}
                    onChange={(e) => setConfirmUnresolvedSend(e.target.checked)}
                    className="rounded border-amber-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>I acknowledge that literal tokens will be sent to the candidate</span>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>All dynamic placeholders resolved successfully.</span>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* ── Reusable Email Template Editor Modal ─────────────────── */}
      {editingEmailTemplateId && (
        <EmailTemplateEditorModal
          templateId={editingEmailTemplateId}
          isOpen={true}
          onClose={() => setEditingEmailTemplateId(null)}
          onSaved={handleEmailTemplateSaved}
          candidateContext={{
            candidateName,
            candidateEmail: recipientEmail,
            candidateId,
            documentTitle: emailModalDoc?.documentTitle,
            documentType: emailModalDoc?.typeLabel,
            documentVersion: `v${emailPreview?.versionNumber || emailModalDoc?.versionNumber || 1}`,
          }}
        />
      )}

      {/* ── Email History Modal ─────────────────────────────────── */}
      {emailHistoryDoc && (
        <Dialog
          title="Email Delivery History"
          description={`Delivery attempts and audit records for “${emailHistoryDoc.documentTitle}”.`}
          onClose={() => setEmailHistoryDoc(null)}
          size="lg"
          footer={
            <div className="flex justify-end">
              <button type="button" onClick={() => setEmailHistoryDoc(null)} className={actionClass}>
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {emailHistoryLoading ? (
              <div className="h-40 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse flex items-center justify-center text-xs text-slate-400">
                Loading email delivery history…
              </div>
            ) : emailHistoryList.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No emails have been sent for this document yet.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {emailHistoryList.map((email) => (
                  <div
                    key={email.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={EMAIL_STATUS_VARIANTS[email.deliveryStatus] || 'neutral'} size="sm">
                            {email.deliveryStatus}
                          </Badge>
                          <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                            To: {email.recipientEmail}
                          </span>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                            v{email.versionNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          Subject: {email.subject}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Sent {formatDateTime(email.sentAt)} {email.senderName ? `by ${email.senderName}` : ''}
                          {email.attachmentFilename ? ` · Attached: ${email.attachmentFilename}` : ''}
                        </p>
                        {email.errorMessage && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 bg-red-50 dark:bg-red-500/10 p-2 rounded-lg">
                            Error: {email.errorMessage}
                          </p>
                        )}
                      </div>

                      {email.deliveryStatus === 'FAILED' && canManage && (
                        <button
                          type="button"
                          disabled={retryingEmailId === email.id}
                          onClick={() => handleRetryEmail(email.id)}
                          className={`${actionClass} text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-500/10 hover:bg-amber-100/60 shrink-0 self-start sm:self-center`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {retryingEmailId === email.id ? 'Retrying…' : 'Retry Send'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* ── Email Templates Management Module Modal ───────────── */}
      {showEmailTemplatesModal && (
        <Dialog
          title="Email Templates Module"
          description="Create, customize, preview, and link reusable email templates to document templates."
          onClose={() => {
            setShowEmailTemplatesModal(false);
            if (emailModalDoc) {
              handleSelectEmailTemplate(selectedEmailTemplateId);
            }
          }}
          size="xl"
        >
          <div className="max-h-[75vh] overflow-y-auto pr-1">
            <EmailTemplatesView />
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
