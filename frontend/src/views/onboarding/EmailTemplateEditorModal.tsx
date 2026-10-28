import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bold,
  Check,
  ChevronDown,
  Edit3,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
  X,
} from 'lucide-react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Dialog } from '../../components/ui/Dialog';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../lib/toast';
import {
  onboardingApi,
  type EmailTemplateItem,
} from '../../api/onboarding.api';
import { fieldClass, labelClass } from './onboarding-format';

interface Props {
  templateId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (template: EmailTemplateItem) => void;
  candidateContext?: {
    candidateName?: string;
    candidateEmail?: string;
    candidateId?: string;
    designation?: string;
    department?: string;
    companyName?: string;
    recruiterName?: string;
    documentTitle?: string;
    documentType?: string;
    documentVersion?: string;
    joiningDate?: string;
    annualSalary?: string;
    currentDate?: string;
    senderName?: string;
  };
}

export const EMAIL_PLACEHOLDERS = [
  { token: 'candidate_name', label: 'Candidate Name', desc: 'Full name of candidate' },
  { token: 'candidate_email', label: 'Candidate Email', desc: 'Email address of candidate' },
  { token: 'candidate_id', label: 'Candidate Code', desc: 'Reference ID (e.g. CAN-2026-243723)' },
  { token: 'designation', label: 'Designation / Title', desc: 'Position title' },
  { token: 'department', label: 'Department', desc: 'Candidate department' },
  { token: 'company_name', label: 'Company Name', desc: 'Workspace or tenant name' },
  { token: 'recruiter_name', label: 'Recruiter Name', desc: 'Assigned recruiter name' },
  { token: 'document_title', label: 'Document Title', desc: 'Title of attached document' },
  { token: 'document_type', label: 'Document Kind', desc: 'Kind of document' },
  { token: 'document_version', label: 'Document Version', desc: 'Attached version (e.g. v3)' },
  { token: 'joining_date', label: 'Joining Date', desc: 'Date candidate begins employment' },
  { token: 'annual_salary', label: 'Annual Compensation', desc: 'CTC or salary amount' },
  { token: 'current_date', label: 'Current Date', desc: 'Today’s date' },
  { token: 'sender_name', label: 'Sender Name', desc: 'HR / Recruiter sender' },
];

const actionClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 transition-colors';
const primaryClass =
  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 transition-colors';

export const EmailTemplateEditorModal: React.FC<Props> = ({
  templateId,
  isOpen,
  onClose,
  onSaved,
  candidateContext,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<EmailTemplateItem | null>(null);

  // Editable fields
  const [templateName, setTemplateName] = useState('');
  const [subject, setSubject] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [showPlaceholdersMenu, setShowPlaceholdersMenu] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Snapshot for dirty check
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const lastFocusedFieldRef = useRef<'subject' | 'body'>('body');

  // TipTap editor setup
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-teal-600 underline font-medium',
        },
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose dark:prose-invert max-w-none min-h-[220px] p-3.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none',
      },
    },
    onFocus: () => {
      lastFocusedFieldRef.current = 'body';
    },
  });

  // Load template data from backend
  const loadTemplate = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const data = await onboardingApi.getEmailTemplate(templateId);
      setTemplate(data);
      const name = data.template_name || data.templateName || '';
      const subj = data.subject || '';
      const body = data.body_text || data.bodyText || '';
      setTemplateName(name);
      setSubject(subj);
      if (editor) {
        editor.commands.setContent(body);
      }
      setInitialSnapshot(JSON.stringify({ name, subj, body }));
    } catch (e) {
      toast.error('Failed to load email template: ' + (e instanceof Error ? e.message : String(e)));
      onClose();
    } finally {
      setLoading(false);
    }
  }, [templateId, editor, onClose]);

  useEffect(() => {
    if (isOpen) {
      loadTemplate();
    }
  }, [isOpen, loadTemplate]);

  // Compute dirty state
  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    const currentBody = editor ? editor.getHTML() : '';
    const current = JSON.stringify({ name: templateName, subj: subject, body: currentBody });
    return current !== initialSnapshot;
  }, [initialSnapshot, templateName, subject, editor]);

  // Insert placeholder token into either subject or rich-text editor body
  const insertPlaceholder = (token: string) => {
    const placeholderStr = `{{${token}}}`;
    if (lastFocusedFieldRef.current === 'subject' && subjectInputRef.current) {
      const input = subjectInputRef.current;
      const start = input.selectionStart ?? subject.length;
      const end = input.selectionEnd ?? subject.length;
      const nextSubj = subject.slice(0, start) + placeholderStr + subject.slice(end);
      setSubject(nextSubj);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + placeholderStr.length, start + placeholderStr.length);
      }, 0);
    } else if (editor) {
      editor.chain().focus().insertContent(placeholderStr).run();
    }
    setShowPlaceholdersMenu(false);
    toast.success(`Inserted ${placeholderStr}`);
  };

  // Safe close handler
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Save changes permanently in backend database
  const handleSaveTemplate = async () => {
    if (!templateId) return;
    if (!templateName.trim()) {
      toast.error('Please enter a template name.');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please enter an email subject line.');
      return;
    }
    const htmlBody = editor ? editor.getHTML() : '';
    if (!htmlBody.trim() || htmlBody === '<p></p>') {
      toast.error('Email body content cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const updated = await onboardingApi.updateEmailTemplate(templateId, {
        templateName: templateName.trim(),
        subject: subject.trim(),
        bodyText: htmlBody,
        category: template?.category || 'ONBOARDING',
        documentKind: template?.document_kind || template?.documentKind || undefined,
        isActive: true,
      });

      setInitialSnapshot(JSON.stringify({ name: templateName.trim(), subj: subject.trim(), body: htmlBody }));
      toast.success('Email template saved successfully to database!');
      onSaved(updated);
      onClose();
    } catch (e) {
      toast.error('Failed to save email template: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  // Add / edit link prompt
  const handleSetLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter link URL (e.g. https://rndtechnosoft.com):', previousUrl || 'https://');
    if (url === null) return;
    if (url === '' || url === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  // Dynamic preview evaluation
  const previewData = useMemo(() => {
    const rawBody = editor ? editor.getHTML() : '';
    const ctx = candidateContext || {
      candidateName: 'Harshit Dhodi',
      candidateEmail: 'harshit@rndtechnosoft.com',
      candidateId: 'CAN-2026-243723',
      designation: 'Lead Full Stack Engineer',
      department: 'Technology',
      companyName: 'RND Technosoft',
      recruiterName: 'Ravi Shah',
      documentTitle: 'Appointment Letter',
      documentType: 'Appointment Letter',
      documentVersion: 'v3',
      joiningDate: '15 November 2026',
      annualSalary: '₹ 18,00,000',
      currentDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      senderName: 'Ravi Shah',
    };

    const replacePlaceholders = (text: string) => {
      return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
        const valMap: Record<string, string | undefined> = {
          candidate_name: ctx.candidateName,
          candidate_email: ctx.candidateEmail,
          candidate_id: ctx.candidateId,
          designation: ctx.designation,
          department: ctx.department,
          company_name: ctx.companyName,
          recruiter_name: ctx.recruiterName,
          document_title: ctx.documentTitle,
          document_type: ctx.documentType,
          document_version: ctx.documentVersion,
          joining_date: ctx.joiningDate,
          annual_salary: ctx.annualSalary,
          annual_ctc: ctx.annualSalary,
          current_date: ctx.currentDate,
          sender_name: ctx.senderName,
        };
        return valMap[key] !== undefined ? valMap[key]! : `{{${key}}}`;
      });
    };

    return {
      resolvedSubject: replacePlaceholders(subject),
      resolvedBody: replacePlaceholders(rawBody),
    };
  }, [subject, editor, candidateContext]);

  if (!isOpen) return null;

  return (
    <>
      <Dialog
        title="Edit Reusable Email Template"
        description="Changes made here are permanently stored in the workspace database and reused for all future emails using this template."
        onClose={handleAttemptClose}
        size="xl"
        footer={
          <div className="flex flex-col sm:flex-row justify-between items-center w-full gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                {isDirty ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    Unsaved changes
                  </span>
                ) : (
                  <span className="text-teal-600 dark:text-teal-400 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                    Up to date with database
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleAttemptClose} className={actionClass}>
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || loading || !isDirty}
                onClick={handleSaveTemplate}
                className={primaryClass}
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving to Database…' : 'Save Changes'}
              </button>
            </div>
          </div>
        }
      >
        {loading ? (
          <div className="h-64 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse flex items-center justify-center text-xs text-slate-400">
            Loading email template details…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Scope Explanation Banner */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 flex items-start gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Reusable Template Configuration</strong>
                <span>
                  You are editing the master email template. When saved, this template will be loaded by default whenever sending documents of this kind. Past sent emails remain immutable.
                </span>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2B293E] pb-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    activeTab === 'edit'
                      ? 'bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Template Editor
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    activeTab === 'preview'
                      ? 'bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Live Preview ({candidateContext?.candidateName || 'Candidate'})
                </button>
              </div>

              {/* Dynamic Placeholders Dropdown Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPlaceholdersMenu(!showPlaceholdersMenu)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 bg-teal-50/50 dark:bg-teal-500/10 hover:bg-teal-100/50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Insert Placeholder
                  <ChevronDown className="w-3 h-3" />
                </button>

                {showPlaceholdersMenu && (
                  <div className="absolute right-0 mt-1 w-72 max-h-72 overflow-y-auto rounded-xl bg-white dark:bg-[#1E1D2D] border border-slate-200 dark:border-[#2B293E] shadow-xl z-50 p-1.5 text-xs">
                    <p className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Click to insert into {lastFocusedFieldRef.current === 'subject' ? 'Subject' : 'Email Body'}
                    </p>
                    <div className="space-y-0.5 mt-1">
                      {EMAIL_PLACEHOLDERS.map((p) => (
                        <button
                          key={p.token}
                          type="button"
                          onClick={() => insertPlaceholder(p.token)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-500/10 flex flex-col group transition-colors"
                        >
                          <span className="font-mono text-teal-700 dark:text-teal-300 font-medium group-hover:underline">
                            {`{{${p.token}}}`}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.label} · {p.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {activeTab === 'edit' ? (
              <div className="space-y-3.5">
                {/* Template Name */}
                <div>
                  <label className={labelClass}>Template Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Appointment Letter Email"
                    className={fieldClass}
                    required
                  />
                </div>

                {/* Email Subject Line */}
                <div>
                  <label className={labelClass}>
                    Default Subject Line <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={subjectInputRef}
                    type="text"
                    value={subject}
                    onFocus={() => {
                      lastFocusedFieldRef.current = 'subject';
                    }}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Your Appointment Letter — {{company_name}}"
                    className={fieldClass}
                    required
                  />
                </div>

                {/* Rich-Text Body Editor */}
                <div>
                  <label className={labelClass}>
                    Rich-Text Email Body Template <span className="text-red-500">*</span>
                  </label>

                  {/* Toolbar */}
                  {editor && (
                    <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#151421] overflow-hidden">
                      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-200 dark:border-[#2B293E] bg-slate-100/60 dark:bg-white/5">
                        {/* Text formatting */}
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleBold().run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('bold') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Bold (Ctrl+B)"
                        >
                          <Bold className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleItalic().run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('italic') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Italic (Ctrl+I)"
                        >
                          <Italic className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleUnderline().run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('underline') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Underline (Ctrl+U)"
                        >
                          <UnderlineIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleStrike().run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('strike') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Strikethrough"
                        >
                          <Strikethrough className="w-4 h-4" />
                        </button>

                        <span className="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                        {/* Headings */}
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('heading', { level: 1 }) ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Heading 1"
                        >
                          <Heading1 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('heading', { level: 2 }) ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Heading 2"
                        >
                          <Heading2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('heading', { level: 3 }) ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Heading 3"
                        >
                          <Heading3 className="w-4 h-4" />
                        </button>

                        <span className="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                        {/* Lists */}
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleBulletList().run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('bulletList') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Bullet List"
                        >
                          <List className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleOrderedList().run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('orderedList') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Numbered List"
                        >
                          <ListOrdered className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleBlockquote().run()}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('blockquote') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Blockquote"
                        >
                          <Quote className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().setHorizontalRule().run()}
                          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300"
                          title="Horizontal Divider"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <span className="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                        {/* Links & History */}
                        <button
                          type="button"
                          onClick={handleSetLink}
                          className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 ${
                            editor.isActive('link') ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20' : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title="Insert / Remove Link"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().undo().run()}
                          disabled={!editor.can().undo()}
                          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 disabled:opacity-30"
                          title="Undo"
                        >
                          <Undo className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().redo().run()}
                          disabled={!editor.can().redo()}
                          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 disabled:opacity-30"
                          title="Redo"
                        >
                          <Redo className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Editor Content Area */}
                      <div className="bg-white dark:bg-[#181724]">
                        <EditorContent editor={editor} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Live Preview with Real Harshit Dhodi / Candidate Context */
              <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-[#2B293E] text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-500 w-16">Subject:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{previewData.resolvedSubject}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-500 w-16">Recipient:</span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {candidateContext?.candidateName || 'Candidate'} &lt;{candidateContext?.candidateEmail || 'candidate@example.com'}&gt;
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-500 w-16">Attachment:</span>
                    <Badge variant="purple" size="sm">
                      {candidateContext?.candidateName ? `${candidateContext.candidateName.replace(/\s+/g, '_')}_${(candidateContext.documentTitle || 'Document').replace(/\s+/g, '_')}.pdf` : 'Candidate_Document.pdf'}
                    </Badge>
                  </div>
                </div>

                <div className="p-5 text-sm prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 min-h-[200px]">
                  <div dangerouslySetInnerHTML={{ __html: previewData.resolvedBody }} />
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Discard confirmation dialog */}
      {showDiscardConfirm && (
        <Dialog
          title="Discard Template Edits?"
          description="You have unsaved changes to this email template that will be lost."
          onClose={() => setShowDiscardConfirm(false)}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDiscardConfirm(false)} className={actionClass}>
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white"
              >
                Discard Changes
              </button>
            </div>
          }
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to close without saving? Changes will not be saved to the database.
          </p>
        </Dialog>
      )}
    </>
  );
};
