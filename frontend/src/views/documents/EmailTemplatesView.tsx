import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileBadge,
  FileCheck,
  FileText,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  onboardingApi,
  type AvailableTemplateSummary,
  type EmailTemplateItem,
} from '../../api/onboarding.api';
import { fieldClass, formatDateTime, labelClass } from '../onboarding/onboarding-format';
import { EmailTemplateEditorModal } from '../onboarding/EmailTemplateEditorModal';

const CATEGORIES = [
  { id: 'ALL', label: 'All Categories' },
  { id: 'ONBOARDING', label: 'Onboarding' },
  { id: 'OFFER', label: 'Offers' },
  { id: 'APPOINTMENT', label: 'Appointment' },
  { id: 'AGREEMENT', label: 'Agreements & NDAs' },
  { id: 'EXIT', label: 'Exit & Relieving' },
  { id: 'GENERAL', label: 'General HR' },
];

const actionClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 transition-colors';
const primaryClass =
  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 transition-colors';

interface Props {
  onTemplateSelected?: (template: EmailTemplateItem) => void;
  selectedTemplateId?: string | null;
}

export const EmailTemplatesView: React.FC<Props> = ({ onTemplateSelected, selectedTemplateId }) => {
  const ids = useId();
  const { can } = useAuth();
  const canManage = can('onboarding.documents.manage') || can('documents.templates.manage') || can('email-templates.edit');

  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [docTemplates, setDocTemplates] = useState<AvailableTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [category, setCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newCategory, setNewCategory] = useState('ONBOARDING');
  const [newDocumentKind, setNewDocumentKind] = useState('OFFER_LETTER');
  const [newSubject, setNewSubject] = useState('');
  const [newBodyText, setNewBodyText] = useState('<p>Dear {{candidate_name}},</p><p>Please find attached your document.</p><p>Regards,<br />HR Team</p>');
  const [creating, setCreating] = useState(false);

  // Association modal state
  const [associatingTemplate, setAssociatingTemplate] = useState<EmailTemplateItem | null>(null);
  const [selectedDocTemplateId, setSelectedDocTemplateId] = useState<string>('');
  const [savingAssociation, setSavingAssociation] = useState(false);

  // Load email templates and document templates
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [emailTpls, availableDocs] = await Promise.all([
        onboardingApi.listEmailTemplates(),
        onboardingApi.listAvailableTemplates().catch(() => []),
      ]);
      setTemplates(emailTpls);
      setDocTemplates(availableDocs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load email templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const name = tpl.templateName || tpl.template_name || tpl.name || '';
      const subject = tpl.subject || '';
      const kind = tpl.documentKind || tpl.document_kind || '';
      const cat = tpl.category || '';

      const matchesSearch =
        !searchQuery.trim() ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kind.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (category === 'ALL') return true;
      return cat.toUpperCase() === category.toUpperCase();
    });
  }, [templates, searchQuery, category]);

  // Handle create
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name.');
      return;
    }
    if (!newSubject.trim()) {
      toast.error('Please enter an email subject line.');
      return;
    }

    setCreating(true);
    try {
      const created = await onboardingApi.createEmailTemplate({
        templateName: newTemplateName.trim(),
        category: newCategory,
        documentKind: newDocumentKind,
        subject: newSubject.trim(),
        bodyText: newBodyText,
      });
      toast.success(`Email template "${created.templateName || created.name}" created successfully.`);
      setShowCreateModal(false);
      setNewTemplateName('');
      setNewSubject('');
      await loadData();
      // Open editor immediately to allow rich text editing
      setEditingTemplateId(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create email template.');
    } finally {
      setCreating(false);
    }
  };

  // Handle duplicate
  const handleDuplicate = async (tpl: EmailTemplateItem) => {
    try {
      const duplicated = await onboardingApi.duplicateEmailTemplate(tpl.id);
      toast.success(`Duplicated "${tpl.templateName || tpl.name}" successfully.`);
      await loadData();
      setEditingTemplateId(duplicated.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to duplicate template.');
    }
  };

  // Handle delete
  const handleDelete = async (tpl: EmailTemplateItem) => {
    const name = tpl.templateName || tpl.name || 'this template';
    if (!window.confirm(`Are you sure you want to deactivate "${name}"?`)) return;

    try {
      await onboardingApi.deleteEmailTemplate(tpl.id);
      toast.success(`Template "${name}" deactivated.`);
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deactivate template.');
    }
  };

  // Handle associate document template
  const handleSaveAssociation = async () => {
    if (!associatingTemplate || !selectedDocTemplateId) return;
    setSavingAssociation(true);
    try {
      await onboardingApi.updateDocumentTemplateEmailAssociation(
        selectedDocTemplateId,
        associatingTemplate.id,
      );
      const docName = docTemplates.find((d) => d.id === selectedDocTemplateId)?.name || 'Document Template';
      toast.success(`Linked "${associatingTemplate.templateName || associatingTemplate.name}" as default email for "${docName}".`);
      setAssociatingTemplate(null);
      setSelectedDocTemplateId('');
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to link email template.');
    } finally {
      setSavingAssociation(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Mail className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Reusable Email Templates
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Configure dynamic subject lines, rich-text email layouts, and default email associations for all onboarding and HR documents.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className={primaryClass}
          >
            <Plus className="w-4 h-4" />
            <span>New Email Template</span>
          </button>
        )}
      </div>

      {/* Category Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-[#2B293E] sm:border-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                category === cat.id
                  ? 'bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search email templates…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${fieldClass} pl-9`}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={loadData} className="underline font-semibold">
            Retry
          </button>
        </div>
      )}

      {/* Templates List */}
      {loading ? (
        <div className="h-40 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse flex items-center justify-center text-xs text-slate-400">
          Loading email templates…
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <Mail className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No email templates found</p>
          <p className="mt-1 text-xs text-slate-500">
            {searchQuery ? 'Try adjusting your search criteria.' : 'Create your first reusable email template to standardize communications.'}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className={`${primaryClass} mt-3`}
            >
              <Plus className="w-3.5 h-3.5" />
              Create Email Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filteredTemplates.map((tpl) => {
            const name = tpl.templateName || tpl.template_name || tpl.name || 'Untitled Template';
            const linkedDocs = tpl.linkedDocumentTemplates || [];
            const isSelected = selectedTemplateId === tpl.id;

            return (
              <div
                key={tpl.id}
                className={`p-4 rounded-2xl border transition-all shadow-xs flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50/20 dark:bg-teal-500/5 ring-1 ring-teal-500'
                    : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Top line: Name & Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                          {name}
                        </h4>
                        <Badge variant="purple" size="sm">
                          {tpl.category}
                        </Badge>
                        {tpl.documentKind && (
                          <Badge variant="neutral" size="sm">
                            {tpl.documentKind}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1 truncate">
                        Subject: <span className="font-mono text-slate-700 dark:text-slate-300">{tpl.subject}</span>
                      </p>
                    </div>

                    {onTemplateSelected && (
                      <button
                        type="button"
                        onClick={() => onTemplateSelected(tpl)}
                        className={`${actionClass} text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-500/10 shrink-0`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Select
                      </button>
                    )}
                  </div>

                  {/* Linked Document Templates Strip */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-slate-400">Default for:</span>
                        {linkedDocs.length > 0 ? (
                          linkedDocs.map((doc) => (
                            <span
                              key={doc.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-medium"
                            >
                              <FileCheck className="w-3 h-3 text-emerald-600" />
                              {doc.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">Not set as default for any document template</span>
                        )}
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setAssociatingTemplate(tpl);
                            setSelectedDocTemplateId(docTemplates[0]?.id || '');
                          }}
                          className="text-teal-600 dark:text-teal-400 hover:underline font-semibold flex items-center gap-1 shrink-0"
                          title="Assign as default email template for a document template"
                        >
                          <Link2 className="w-3 h-3" />
                          Link to Document
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    Updated {formatDateTime(tpl.updatedAt || tpl.updated_at || tpl.createdAt || tpl.created_at)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(tpl)}
                      className={actionClass}
                      title="Preview email template formatting"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Preview</span>
                    </button>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setEditingTemplateId(tpl.id)}
                        className={`${actionClass} text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-500/10 hover:bg-teal-100/60`}
                        title="Edit reusable template subject and rich-text body"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Template</span>
                      </button>
                    )}

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDuplicate(tpl)}
                        className={actionClass}
                        title="Duplicate template"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Duplicate</span>
                      </button>
                    )}

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDelete(tpl)}
                        className={`${actionClass} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border-transparent hover:border-red-200`}
                        title="Deactivate template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Link to Document Template Modal ──────────────────────── */}
      {associatingTemplate && (
        <Dialog
          title="Link Email Template to Document Template"
          description={`Set “${associatingTemplate.templateName || associatingTemplate.name}” as the default email template.`}
          onClose={() => setAssociatingTemplate(null)}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssociatingTemplate(null)}
                className={actionClass}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingAssociation || !selectedDocTemplateId}
                onClick={handleSaveAssociation}
                className={primaryClass}
              >
                <Check className="w-3.5 h-3.5" />
                {savingAssociation ? 'Saving…' : 'Save Default Association'}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-300">
              When an HR manager generates or emails this document type, <strong>{associatingTemplate.templateName || associatingTemplate.name}</strong> will be loaded automatically as the default email template.
            </p>

            <div>
              <label className={labelClass}>
                Select Document Template <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedDocTemplateId}
                onChange={(e) => setSelectedDocTemplateId(e.target.value)}
                className={fieldClass}
              >
                {docTemplates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.kindLabel || d.kind})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Dialog>
      )}

      {/* ── New Email Template Modal ─────────────────────────────── */}
      {showCreateModal && (
        <Dialog
          title="Create Reusable Email Template"
          description="Create a new shared email template for onboarding, offer letters, or HR documents."
          onClose={() => setShowCreateModal(false)}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className={actionClass}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={handleCreateTemplate}
                className={primaryClass}
              >
                <Plus className="w-3.5 h-3.5" />
                {creating ? 'Creating…' : 'Create & Open Editor'}
              </button>
            </div>
          }
        >
          <form onSubmit={handleCreateTemplate} className="space-y-3 text-xs">
            <div>
              <label className={labelClass}>
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. Senior Leadership Offer Letter Email"
                className={fieldClass}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className={fieldClass}
                >
                  <option value="ONBOARDING">Onboarding</option>
                  <option value="OFFER">Offers</option>
                  <option value="APPOINTMENT">Appointment</option>
                  <option value="AGREEMENT">Agreements</option>
                  <option value="EXIT">Exit</option>
                  <option value="GENERAL">General HR</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Document Kind</label>
                <select
                  value={newDocumentKind}
                  onChange={(e) => setNewDocumentKind(e.target.value)}
                  className={fieldClass}
                >
                  <option value="OFFER_LETTER">Offer Letter</option>
                  <option value="APPOINTMENT_LETTER">Appointment Letter</option>
                  <option value="EMPLOYMENT_CONTRACT">Employment Contract</option>
                  <option value="NDA">NDA</option>
                  <option value="JOINING_LETTER">Joining Letter</option>
                  <option value="GENERAL">General Document</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Default Subject Line <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="e.g. Your Appointment Letter — {{candidate_name}} | {{company_name}}"
                className={fieldClass}
                required
              />
            </div>
          </form>
        </Dialog>
      )}

      {/* ── Read-only Preview Modal ──────────────────────────────── */}
      {previewTemplate && (
        <Dialog
          title={previewTemplate.templateName || previewTemplate.name || 'Email Template Preview'}
          description={`Category: ${previewTemplate.category} · Document Kind: ${previewTemplate.documentKind || 'General'}`}
          onClose={() => setPreviewTemplate(null)}
          size="lg"
          footer={
            <div className="flex justify-between items-center w-full">
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    const id = previewTemplate.id;
                    setPreviewTemplate(null);
                    setEditingTemplateId(id);
                  }}
                  className={`${actionClass} text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-500/10`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit This Template
                </button>
              )}
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className={actionClass}
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs">
              <span className="font-semibold text-slate-400">Subject: </span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{previewTemplate.subject}</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
              <div
                className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-slate-800 dark:text-slate-200"
                dangerouslySetInnerHTML={{ __html: previewTemplate.bodyText || previewTemplate.body_text || '' }}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* ── TipTap Rich-Text Editor Modal ────────────────────────── */}
      {editingTemplateId && (
        <EmailTemplateEditorModal
          templateId={editingTemplateId}
          isOpen={true}
          onClose={() => setEditingTemplateId(null)}
          onSaved={() => {
            setEditingTemplateId(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};
