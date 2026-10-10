import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';

import { toast } from '../../lib/toast';
import {
  gmailApi,
  GmailAttachment,
  GmailConnectionStatus,
  GmailFolder,
  GmailInboxMessage,
  GmailMessage,
  GmailMessageFilters,
  GmailTemplate,
} from '../../api/gmail.api';
import {
  Mail,
  Send,
  Plus,
  CheckCircle2,
  Users,
  ShieldCheck,
  Eye,
  AlertTriangle,
  Filter,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Layers,
  FileCode,
  Sliders,
  Inbox,
  Paperclip,
  Reply,
  ReplyAll,
  Pencil,
  Trash2,
  Save,
  BarChart3,
  MousePointer,
  MessageSquare,
  Copy,
  Play,
  Pause,
  ShieldAlert,
} from 'lucide-react';
import { usePayroll } from '../../context/PayrollContext';
import { useAuth } from '../../context/AuthContext';
import { DripSequencesView } from './DripSequencesView';
import { ComingSoon } from './ComingSoon';

const INBOX_REFRESH_INTERVAL_MS = 30_000;
const INBOX_PAGE_SIZE = 25;
const TEMPLATE_PAGE_SIZE = 12;
const EMPTY_GMAIL_FILTERS: GmailMessageFilters = { dateRange: 'any' };

const TemplateSearchPicker: React.FC<{
  label: string;
  onSelect: (template: GmailTemplate) => void;
}> = ({ label, onSelect }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<GmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await gmailApi.listTemplates(1, 10, search);
        if (!cancelled) setItems(result.items);
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Templates could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
        placeholder="Search templates…"
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        className="h-9 w-full rounded-lg border border-indigo-200 bg-indigo-50/70 pl-8 pr-3 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
      {open && (
        <div role="listbox" className="absolute bottom-full right-0 z-40 mb-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 px-3 py-4 text-[11px] text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading templates…</div>
          ) : error ? (
            <p role="alert" className="px-3 py-3 text-[11px] text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-slate-500">No matching templates.</p>
          ) : items.map((template) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={template.id}
              onClick={() => {
                onSelect(template);
                setSearch('');
                setOpen(false);
              }}
              className="block w-full rounded-md px-3 py-2 text-left hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="block truncate text-xs font-semibold text-slate-800">{template.title}</span>
              <span className="block truncate text-[10px] text-slate-500">{template.category} · {template.subject}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// const AUDIENCE_CONTACTS = [
//   { id: '1', name: 'Arjun Mehta', email: 'arjun@zenithtech.io', company: 'Zenith Tech', stage: 'Prospect', score: 94, status: 'Active' },
//   { id: '2', name: 'Priya Sharma', email: 'priya@cloudcraft.in', company: 'CloudCraft Solutions', stage: 'Proposal Sent', score: 88, status: 'Active' },
//   { id: '3', name: 'Rajesh Nair', email: 'rajesh@nexushub.co', company: 'NexusHub Enterprise', stage: 'Meeting Booked', score: 91, status: 'Active' },
//   { id: '4', name: 'Sneha Patel', email: 'sneha@finflow.io', company: 'FinFlow Global', stage: 'Cold Qualified', score: 76, status: 'Active' },
//   { id: '5', name: 'Vikram Singh', email: 'vikram@apexretail.in', company: 'Apex Retail Brands', stage: 'Active Client', score: 99, status: 'Active' },
//   { id: '6', name: 'Ananya Verma', email: 'ananya@scaleup.agency', company: 'ScaleUp Creative', stage: 'Cold Outreach', score: 68, status: 'Active' },
// ];

export const EmailMarketingView: React.FC = () => {
  const { navigateTo, setCurrentView } = usePayroll();
  const { can } = useAuth();
  const canManageEmail = can('marketing.manage');
  
  // Navigation tabs: 'hub' is the Tenant Mailbox & Outbound Hub from screenshot!
  const [activeTab, setActiveTab] = useState<'hub' | 'campaigns' | 'sequences' | 'templates' | 'audience' | 'deliverability'>('hub');

  // Mailbox Hub State
  const [mailboxEmails, setMailboxEmails] = useState<GmailInboxMessage[]>([]);
  const [mailboxFolder, setMailboxFolder] = useState<GmailFolder>('inbox');
  const [folderTotals, setFolderTotals] = useState<Record<GmailFolder, number>>({ inbox: 0, sent: 0 });
  const [selectedEmail, setSelectedEmail] = useState<GmailMessage | null>(null);
  const [mailboxSearch, setMailboxSearch] = useState('');
  const [mailboxFilters, setMailboxFilters] = useState<GmailMessageFilters>(EMPTY_GMAIL_FILTERS);
  const mailboxFiltersRef = useRef<GmailMessageFilters>(EMPTY_GMAIL_FILTERS);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<GmailMessageFilters>(EMPTY_GMAIL_FILTERS);
  const advancedSearchReturnFocus = useRef<HTMLElement | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus | null>(null);
  const [gmailStatusLoading, setGmailStatusLoading] = useState(true);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);
  const [gmailPage, setGmailPage] = useState(1);
  const [gmailTotal, setGmailTotal] = useState(0);
  const [gmailHasMore, setGmailHasMore] = useState(false);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);
  const [messageBodyMode, setMessageBodyMode] = useState<'formatted' | 'text'>('formatted');
  const inboxRequestInFlight = useRef(false);

  // Compose Email State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBcc, setComposeBcc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Tenant-owned template library
  const [templates, setTemplates] = useState<GmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatePage, setTemplatePage] = useState(1);
  const [templateTotal, setTemplateTotal] = useState(0);
  const [templateTotalPages, setTemplateTotalPages] = useState(0);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GmailTemplate | null>(null);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateCategory, setTemplateCategory] = useState('General');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateBody, setTemplateBody] = useState('');

  const [isQuickTestOpen, setIsQuickTestOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<GmailTemplate | null>(null);

  // Test Email Form State
  const [testEmailRecipient, setTestEmailRecipient] = useState('test@voogyo.com');
  const [testEmailSubject, setTestEmailSubject] = useState('Voogyo Email Dispatch Verification Test');

  // Toast feedback

  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'error' ? toast.error(text) : toast.success(text);

  const mailboxRangeStart = gmailTotal === 0 ? 0 : (gmailPage - 1) * INBOX_PAGE_SIZE + 1;
  const mailboxRangeEnd = Math.min(gmailPage * INBOX_PAGE_SIZE, gmailTotal);

  const currentFolderEmails = mailboxEmails;
  const activeFilterCount = Object.entries(mailboxFilters).filter(
    ([key, value]) => key !== 'dateRange' ? value !== undefined && value !== '' && value !== false : value !== 'any',
  ).length;

  const loadMailbox = useCallback(async (
    folder: GmailFolder,
    page = 1,
    options: { silent?: boolean; preserveSelection?: boolean } = {},
    filters = mailboxFiltersRef.current,
  ) => {
    if (inboxRequestInFlight.current) return;
    inboxRequestInFlight.current = true;
    if (!options.silent) setInboxLoading(true);
    setMailboxError(null);
    try {
      const result = await gmailApi.listMessages(folder, page, INBOX_PAGE_SIZE, filters);
      setMailboxEmails(result.items);
      setFolderTotals((current) => ({ ...current, [folder]: result.total }));
      setGmailPage(result.page);
      setGmailTotal(result.total);
      setGmailHasMore(result.hasMore);
      if (!options.preserveSelection) setSelectedEmail(null);
    } catch (error) {
      setMailboxError(error instanceof Error ? error.message : `Gmail ${folder} messages could not be loaded.`);
      gmailApi.status().then(setGmailStatus).catch(() => undefined);
    } finally {
      inboxRequestInFlight.current = false;
      if (!options.silent) setInboxLoading(false);
    }
  }, []);

  const applyMailboxFilters = (next: GmailMessageFilters) => {
    mailboxFiltersRef.current = next;
    setMailboxFilters(next);
    setMailboxSearch(next.search ?? '');
    setSelectedEmail(null);
    void loadMailbox(mailboxFolder, 1, {}, next);
  };

  const handleMailboxSearch = (event: React.FormEvent) => {
    event.preventDefault();
    applyMailboxFilters({ ...mailboxFilters, search: mailboxSearch.trim() || undefined });
  };

  const closeAdvancedSearch = () => {
    setAdvancedSearchOpen(false);
    window.setTimeout(() => advancedSearchReturnFocus.current?.focus(), 0);
  };

  const openAdvancedSearch = (focus: 'from' | 'to' = 'from') => {
    advancedSearchReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAdvancedFilters(mailboxFilters);
    setAdvancedSearchOpen(true);
    window.setTimeout(() => document.getElementById(`gmail-filter-${focus}`)?.focus(), 0);
  };

  const submitAdvancedSearch = (event: React.FormEvent) => {
    event.preventDefault();
    applyMailboxFilters({
      ...advancedFilters,
      search: advancedFilters.search?.trim() || undefined,
      from: advancedFilters.from?.trim() || undefined,
      to: advancedFilters.to?.trim() || undefined,
      subject: advancedFilters.subject?.trim() || undefined,
      exclude: advancedFilters.exclude?.trim() || undefined,
      dateWithinDays: advancedFilters.date ? advancedFilters.dateWithinDays : undefined,
      sizeOperator: advancedFilters.sizeMb ? advancedFilters.sizeOperator : undefined,
    });
    closeAdvancedSearch();
  };

  const handleAdvancedSearchKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') return closeAdvancedSearch();
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const loadGmailStatus = useCallback(async () => {
    setGmailStatusLoading(true);
    try {
      const status = await gmailApi.status();
      setGmailStatus(status);
      if (status.connected) await loadMailbox('inbox', 1);
    } catch (error) {
      setMailboxError(error instanceof Error ? error.message : 'Gmail connection status could not be loaded.');
    } finally {
      setGmailStatusLoading(false);
    }
  }, [loadMailbox]);

  const loadTemplates = useCallback(async (page = 1, search = '') => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const result = await gmailApi.listTemplates(page, TEMPLATE_PAGE_SIZE, search);
      setTemplates(result.items);
      setTemplatePage(result.page);
      setTemplateTotal(result.total);
      setTemplateTotalPages(result.totalPages);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : 'Email templates could not be loaded.');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('gmail');
    if (oauthResult === 'connected') toast.success('Gmail connected. Loading your inbox…');
    if (oauthResult === 'error') toast.error('Google authorization did not complete. Retry the Gmail connection.');
    if (oauthResult) {
      params.delete('gmail');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
    void loadGmailStatus();
  }, [loadGmailStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTemplates(templatePage, templateSearch), templateSearch ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadTemplates, templatePage, templateSearch]);

  useEffect(() => {
    if (!gmailStatus?.connected || mailboxFolder !== 'inbox' || gmailPage !== 1) return;

    const refreshVisibleInbox = () => {
      if (document.visibilityState === 'visible') {
        void loadMailbox('inbox', 1, { silent: true, preserveSelection: true });
      }
    };
    const interval = window.setInterval(refreshVisibleInbox, INBOX_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshVisibleInbox);
    document.addEventListener('visibilitychange', refreshVisibleInbox);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisibleInbox);
      document.removeEventListener('visibilitychange', refreshVisibleInbox);
    };
  }, [gmailPage, gmailStatus?.connected, loadMailbox, mailboxFolder]);

  const handleConnectGmail = async () => {
    setGmailConnecting(true);
    setMailboxError(null);
    try {
      const { authorizationUrl } = await gmailApi.connect();
      window.location.assign(authorizationUrl);
    } catch (error) {
      setMailboxError(error instanceof Error ? error.message : 'Gmail connection could not be started.');
      setGmailConnecting(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setGmailConnecting(true);
    try {
      await gmailApi.disconnect();
      setGmailStatus({ connected: false, email: null, status: 'DISCONNECTED', connectedAt: null, requiresReconnect: false });
      setMailboxEmails([]);
      setMailboxFolder('inbox');
      setMailboxSearch('');
      mailboxFiltersRef.current = EMPTY_GMAIL_FILTERS;
      setMailboxFilters(EMPTY_GMAIL_FILTERS);
      setSelectedEmail(null);
      setGmailTotal(0);
      setFolderTotals({ inbox: 0, sent: 0 });
      toast.success('Gmail disconnected.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gmail could not be disconnected.');
    } finally {
      setGmailConnecting(false);
    }
  };

  const handleSelectFolder = (folder: GmailFolder) => {
    if (folder === mailboxFolder || !gmailStatus?.connected || inboxRequestInFlight.current) return;
    setMailboxFolder(folder);
    setSelectedEmail(null);
    void loadMailbox(folder, 1);
  };

  const handleOpenEmail = async (uid: number) => {
    setMessageLoading(true);
    setMailboxError(null);
    try {
      const message = await gmailApi.getMessage(mailboxFolder, uid);
      setSelectedEmail(message);
      setMailboxEmails((current) => current.map((item) => (item.uid === uid ? { ...item, isRead: true } : item)));
      setMessageBodyMode(message.html ? 'formatted' : 'text');
      setReplyOpen(false);
      setReplyBody('');
      setReplyError(null);
    } catch (error) {
      setMailboxError(error instanceof Error ? error.message : 'This email could not be opened.');
      gmailApi.status().then(setGmailStatus).catch(() => undefined);
    } finally {
      setMessageLoading(false);
    }
  };

  const handleDownloadAttachment = async (attachment: GmailAttachment) => {
    if (!selectedEmail) return;
    setDownloadingAttachment(attachment.id);
    try {
      await gmailApi.downloadAttachment(mailboxFolder, selectedEmail.uid, attachment);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The attachment could not be downloaded.');
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const formatMailboxDate = (value: string | null): string =>
    value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : 'Unknown date';

  const formatMailboxAddress = ({ name, email }: GmailMessage['from']): string =>
    name && email ? `${name} <${email}>` : name || email || 'Unknown';

  const sanitizedEmailHtml = selectedEmail?.html
    ? DOMPurify.sanitize(selectedEmail.html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'img'],
        FORBID_ATTR: ['srcset', 'style'],
      })
    : null;

  const recipients = (value: string): string[] =>
    value.split(/[;,]/).map((email) => email.trim()).filter(Boolean);

  const handleSendCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo || !composeSubject || !composeBody) return;
    setComposeSending(true);
    setComposeError(null);
    try {
      const sent = await gmailApi.sendMessage({
        to: recipients(composeTo),
        cc: recipients(composeCc),
        bcc: recipients(composeBcc),
        subject: composeSubject,
        text: composeBody,
      });
      setIsComposeOpen(false);
      setComposeTo('');
      setComposeCc('');
      setComposeBcc('');
      setComposeSubject('');
      setComposeBody('');
      showToast(`Email sent to ${composeTo} from ${sent.sentFrom}`);
      if (mailboxFolder === 'sent') {
        window.setTimeout(() => void loadMailbox('sent', 1), 750);
      }
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : 'The email could not be sent. Nothing was sent.');
    } finally {
      setComposeSending(false);
    }
  };

  const handleReply = async (replyAll: boolean) => {
    if (!selectedEmail || !replyBody.trim()) return;
    setReplySending(true);
    setReplyError(null);
    try {
      await gmailApi.reply(selectedEmail.uid, replyBody, replyAll);
      setReplyBody('');
      setReplyOpen(false);
      showToast(replyAll ? 'Reply all sent.' : 'Reply sent.');
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : 'The reply could not be sent.');
    } finally {
      setReplySending(false);
    }
  };

  const openTemplateEditor = (template?: GmailTemplate) => {
    setEditingTemplate(template ?? null);
    setTemplateTitle(template?.title ?? '');
    setTemplateCategory(template?.category ?? 'General');
    setTemplateSubject(template?.subject ?? '');
    setTemplateDescription(template?.description ?? '');
    setTemplateBody(template?.body ?? '');
    setTemplatesError(null);
    setIsTemplateEditorOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTemplateSaving(true);
    setTemplatesError(null);
    const input = {
      title: templateTitle,
      category: templateCategory,
      subject: templateSubject,
      description: templateDescription,
      body: templateBody,
    };
    try {
      if (editingTemplate) await gmailApi.updateTemplate(editingTemplate.id, input);
      else await gmailApi.createTemplate(input);
      setTemplateSearch('');
      setTemplatePage(1);
      void loadTemplates(1, '');
      setIsTemplateEditorOpen(false);
      showToast(editingTemplate ? 'Template updated.' : 'Template created.');
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : 'The template could not be saved.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: GmailTemplate) => {
    if (!window.confirm(`Delete the email template “${template.title}”? This cannot be undone.`)) return;
    try {
      await gmailApi.deleteTemplate(template.id);
      const nextPage = templates.length === 1 && templatePage > 1 ? templatePage - 1 : templatePage;
      setTemplatePage(nextPage);
      void loadTemplates(nextPage, templateSearch);
      showToast('Template deleted.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The template could not be deleted.', 'error');
    }
  };

  const useTemplateInCompose = (template: GmailTemplate) => {
    setComposeSubject(template.subject);
    setComposeBody(template.body);
    setComposeError(null);
    setPreviewTemplate(null);
    setIsComposeOpen(true);
  };

  return (
    <div
      className={
        activeTab === 'hub'
          ? 'space-y-5 pb-12 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-5 lg:space-y-0 lg:pb-0'
          : 'space-y-5 pb-12'
      }
    >

      {/* ── Top Header Card (Matching User Screenshot) ── */}
      <div className="shrink-0 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Tenant Mailbox &amp; Outbound Hub
                </h1>
                {gmailStatus?.connected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {gmailStatus.via === 'IMAP' ? `Inbox connected: ${gmailStatus.email}` : 'Gmail Connected'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {gmailStatusLoading ? 'Checking Gmail…' : gmailStatus?.requiresReconnect ? 'Reconnect Gmail' : 'Gmail Not Connected'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Read, send, and reply through your Gmail or your own email account from My email settings
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {gmailStatus?.via !== 'GMAIL' && (
              <button
                type="button"
                onClick={() => setCurrentView('my-email')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <span>My email settings</span>
              </button>
            )}
            {gmailStatus?.via === 'IMAP' ? null : gmailStatus?.connected ? (
              <button
                onClick={handleDisconnectGmail}
                disabled={gmailConnecting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-2xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>Disconnect Gmail</span>
              </button>
            ) : (
              <button
                onClick={handleConnectGmail}
                disabled={gmailConnecting || gmailStatusLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-2xs transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-red-500" />
                <span>{gmailConnecting ? 'Opening Google…' : gmailStatus?.requiresReconnect ? 'Reconnect Gmail' : 'Connect Gmail'}</span>
              </button>
            )}

            <button
              onClick={() => void loadMailbox(mailboxFolder, gmailPage)}
              disabled={!gmailStatus?.connected || inboxLoading}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-2xs transition-colors"
              title="Refresh Gmail inbox"
              aria-label="Refresh Gmail inbox"
            >
              <RefreshCw className={`w-4 h-4 ${inboxLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setIsComposeOpen(true)}
              // The server sends from the account the workspace policy picks: the member's own, or the organization's.
              disabled={!canManageEmail}
              title={!canManageEmail ? 'Your role cannot send email' : 'Compose email'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Compose Email</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub-navigation Tabs (Preserving all existing suite features!) ── */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('hub')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'hub'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Inbox className="w-3.5 h-3.5 text-indigo-600" />
          <span>Tenant Mailbox &amp; Hub</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 text-indigo-700 font-bold">
            Live
          </span>
        </button>

        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'campaigns'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Mail className="w-3.5 h-3.5 text-teal-600" />
          <span>Email Campaigns</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">Soon</span>
        </button>

        <button
          onClick={() => setActiveTab('sequences')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'sequences'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-indigo-600" />
          <span>Drip Sequences</span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'templates'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <FileCode className="w-3.5 h-3.5 text-purple-600" />
          <span>Templates Library</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
            {templates.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('audience')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'audience'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-blue-600" />
          <span>Audience &amp; Segments</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">Soon</span>
        </button>

        <button
          onClick={() => setActiveTab('deliverability')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'deliverability'
              ? 'bg-white text-slate-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Deliverability &amp; Senders</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">Soon</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB: TENANT MAILBOX & OUTBOUND HUB (SCREENSHOT EXACT MATCH)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'hub' && (
        <div className="grid min-h-0 grid-cols-1 items-start gap-4 lg:flex-1 lg:grid-cols-12 lg:items-stretch lg:overflow-hidden">
          {/* Left Column: Gmail connection */}
          <div className="space-y-4 lg:col-span-3 lg:min-h-0 lg:overflow-y-auto">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs space-y-1">
              <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold tracking-wider uppercase text-slate-400">
                Mailbox Folders
              </p>
              <button
                type="button"
                onClick={() => handleSelectFolder('inbox')}
                disabled={!gmailStatus?.connected}
                aria-current={mailboxFolder === 'inbox' ? 'page' : undefined}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${mailboxFolder === 'inbox' ? 'bg-blue-50/80 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2.5">
                  <Inbox className="w-4 h-4 text-blue-600" />
                  <span>Inbox</span>
                </div>
                {folderTotals.inbox > 0 ? (
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">
                    {folderTotals.inbox}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => handleSelectFolder('sent')}
                disabled={!gmailStatus?.connected}
                aria-current={mailboxFolder === 'sent' ? 'page' : undefined}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${mailboxFolder === 'sent' ? 'bg-blue-50/80 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2.5">
                  <Send className="h-4 w-4 text-indigo-500" />
                  <span>Sent</span>
                </div>
                {folderTotals.sent > 0 ? <span className="rounded-full bg-blue-100 px-2 text-[10px] font-bold text-blue-800">{folderTotals.sent}</span> : null}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Gmail IMAP</span>
                </div>
                <span
                  className={`w-2 h-2 rounded-full ${
                    gmailStatus?.connected ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                />
              </div>

              <p className="text-xs font-bold text-slate-800">
                {gmailStatus?.connected ? 'Connected securely' : gmailStatus?.requiresReconnect ? 'Authorization expired' : 'Not connected'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 break-all">
                {gmailStatus?.email || 'imap.gmail.com:993 • TLS'}
              </p>

              <button
                onClick={gmailStatus?.connected ? handleDisconnectGmail : handleConnectGmail}
                disabled={gmailConnecting || gmailStatusLoading}
                className="w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
              >
                {gmailStatus?.connected ? 'Disconnect Gmail' : gmailStatus?.requiresReconnect ? 'Reconnect Gmail' : 'Connect Gmail'}
              </button>
            </div>

            {mailboxError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <p>{mailboxError}</p>
                <button
                  type="button"
                  onClick={() => void (gmailStatus?.connected ? loadMailbox(mailboxFolder, gmailPage) : loadGmailStatus())}
                  className="mt-2 font-bold underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Middle Column: Email List & Search */}
          <div className={`${selectedEmail ? 'hidden lg:flex' : 'flex'} h-[70dvh] min-h-[28rem] max-h-[42rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs lg:col-span-4 lg:h-full lg:min-h-0 lg:max-h-none`}>
            {/* Search header */}
            <div className="p-3 border-b border-slate-100 space-y-2">
              <form onSubmit={handleMailboxSearch} className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={mailboxSearch}
                  onChange={(e) => setMailboxSearch(e.target.value)}
                  aria-label={`Filter ${mailboxFolder} messages`}
                  placeholder={`Filter this ${mailboxFolder} page…`}
                  className="min-h-11 w-full rounded-lg border border-slate-200/80 bg-slate-50 py-2 pl-8 pr-20 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:min-h-9"
                />
                <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
                  <button type="button" onClick={() => openAdvancedSearch()} aria-label="Open advanced Gmail search" aria-expanded={advancedSearchOpen} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:h-7 sm:w-7">
                    <Sliders className="h-3.5 w-3.5" />
                  </button>
                  <button type="submit" aria-label="Search Gmail" className="flex h-9 w-9 items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:h-7 sm:w-7">
                    <Search className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>

              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Mailbox filters">
                <button type="button" onClick={() => openAdvancedSearch('from')} aria-pressed={Boolean(mailboxFilters.from)} className={`min-h-11 shrink-0 rounded-lg border px-3 text-[11px] font-semibold sm:min-h-8 ${mailboxFilters.from ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-[#f8fafc] dark:hover:bg-[#252336]'}`}>
                  {mailboxFilters.from ? `From: ${mailboxFilters.from}` : 'From'}
                </button>
                <select
                  aria-label="Received date"
                  value={mailboxFilters.dateRange ?? 'any'}
                  onChange={(event) => applyMailboxFilters({ ...mailboxFilters, dateRange: event.target.value as GmailMessageFilters['dateRange'], date: undefined, dateWithinDays: undefined })}
                  className="min-h-11 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:min-h-8"
                >
                  <option value="any">Any time</option>
                  <option value="1d">Past day</option>
                  <option value="7d">Past week</option>
                  <option value="30d">Past month</option>
                  <option value="1y">Past year</option>
                </select>
                <button type="button" aria-pressed={Boolean(mailboxFilters.hasAttachment)} onClick={() => applyMailboxFilters({ ...mailboxFilters, hasAttachment: !mailboxFilters.hasAttachment })} className={`min-h-11 shrink-0 rounded-lg border px-3 text-[11px] font-semibold sm:min-h-8 ${mailboxFilters.hasAttachment ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-[#f8fafc] dark:hover:bg-[#252336]'}`}>Has attachment</button>
                <button type="button" onClick={() => openAdvancedSearch('to')} aria-pressed={Boolean(mailboxFilters.to)} className={`min-h-11 shrink-0 rounded-lg border px-3 text-[11px] font-semibold sm:min-h-8 ${mailboxFilters.to ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-[#f8fafc] dark:hover:bg-[#252336]'}`}>
                  {mailboxFilters.to ? `To: ${mailboxFilters.to}` : 'To'}
                </button>
                <button type="button" aria-pressed={Boolean(mailboxFilters.excludePromotions)} onClick={() => applyMailboxFilters({ ...mailboxFilters, excludePromotions: !mailboxFilters.excludePromotions })} className={`min-h-11 shrink-0 rounded-lg border px-3 text-[11px] font-semibold sm:min-h-8 ${mailboxFilters.excludePromotions ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-[#f8fafc] dark:hover:bg-[#252336]'}`}>Exclude Promotions</button>
                <button type="button" aria-pressed={Boolean(mailboxFilters.unread)} onClick={() => applyMailboxFilters({ ...mailboxFilters, unread: !mailboxFilters.unread })} className={`min-h-11 shrink-0 rounded-lg border px-3 text-[11px] font-semibold sm:min-h-8 ${mailboxFilters.unread ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-[#f8fafc] dark:hover:bg-[#252336]'}`}>Is unread</button>
                <button type="button" onClick={() => openAdvancedSearch()} className="min-h-11 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 sm:min-h-8">Advanced search</button>
                {activeFilterCount > 0 && <button type="button" onClick={() => applyMailboxFilters(EMPTY_GMAIL_FILTERS)} className="min-h-11 shrink-0 px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800 sm:min-h-8">Clear</button>}
              </div>

              <div className="flex items-center justify-between gap-3 px-1 text-[11px] text-slate-400">
                <span>{mailboxFolder === 'inbox' ? 'Inbox' : 'Sent'}</span>
                <div className="flex items-center gap-1">
                  <span className="mr-1 tabular-nums">
                    {mailboxRangeStart}–{mailboxRangeEnd} of {gmailTotal}
                  </span>
                  <button
                    type="button"
                    aria-label="Show newer messages"
                    title="Newer messages"
                    disabled={gmailPage === 1 || inboxLoading}
                    onClick={() => void loadMailbox(mailboxFolder, gmailPage - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Show older messages"
                    title="Older messages"
                    disabled={!gmailHasMore || inboxLoading}
                    onClick={() => void loadMailbox(mailboxFolder, gmailPage + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* List or Empty State */}
            <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
              {inboxLoading ? (
                <div role="status" className="flex flex-col items-center justify-center py-20 text-xs text-slate-500">
                  <RefreshCw className="mb-3 h-6 w-6 animate-spin" />
                  Loading Gmail {mailboxFolder}…
                </div>
              ) : !gmailStatus?.connected ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                  <Mail className="mb-3 h-8 w-8 text-slate-300" />
                  <h4 className="text-xs font-bold text-slate-800">Connect Gmail to read your mailbox</h4>
                  <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-slate-400">Google OAuth opens on the next step. Your Gmail password is never requested or stored.</p>
                  <button type="button" onClick={handleConnectGmail} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">
                    Connect Gmail
                  </button>
                </div>
              ) : currentFolderEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 shadow-2xs">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 mb-1">
                    {activeFilterCount > 0 ? 'No matching messages' : `No ${mailboxFolder} messages`}
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                    {activeFilterCount > 0 ? 'Try changing or clearing the active filters.' : 'Gmail returned no messages for this page.'}
                  </p>
                </div>
              ) : (
                currentFolderEmails.map((email) => {
                  const isSelected = selectedEmail?.uid === email.uid;
                  const correspondent = mailboxFolder === 'sent' ? email.to[0] : email.from;
                  return (
                    <button
                      type="button"
                      key={email.uid}
                      onClick={() => void handleOpenEmail(email.uid)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`block w-full p-3 text-left transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-3 border-indigo-600'
                          : 'hover:bg-[#f8fafc] dark:hover:bg-[#252336]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 truncate max-w-[180px]">
                          {mailboxFolder === 'sent' ? 'To: ' : ''}{correspondent?.name || correspondent?.email || (mailboxFolder === 'sent' ? 'Unknown recipient' : 'Unknown sender')}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{formatMailboxDate(email.date)}</span>
                      </div>
                      <p className={`${email.isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'} truncate mb-1`}>{email.subject}</p>
                      <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed">
                        {email.preview}
                      </p>
                      {email.hasAttachments && <Paperclip className="mt-2 h-3 w-3 text-slate-400" aria-label="Has attachments" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Email Viewer Pane */}
          <div className={`${selectedEmail ? 'flex' : 'hidden lg:flex'} h-[70dvh] min-h-[28rem] max-h-[42rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs lg:col-span-5 lg:h-full lg:min-h-0 lg:max-h-none`}>
            {messageLoading ? (
              <div role="status" className="flex flex-1 items-center justify-center text-xs text-slate-500">
                <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading message…
              </div>
            ) : selectedEmail ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Email Reader Header */}
                <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="min-w-0 break-words text-base font-bold leading-snug text-slate-900">
                      {selectedEmail.subject}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedEmail(null)}
                      aria-label="Close email"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700" aria-hidden="true">
                      {(selectedEmail.from.name || selectedEmail.from.email || '?').trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <p className="min-w-0 break-all font-semibold text-slate-800">
                          {formatMailboxAddress(selectedEmail.from)}
                        </p>
                        <time className="shrink-0 text-[11px] text-slate-400" dateTime={selectedEmail.date || undefined}>
                          {formatMailboxDate(selectedEmail.date)}
                        </time>
                      </div>
                      <p className="mt-1 break-all text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-600">To:</span>{' '}
                        {selectedEmail.to.map(formatMailboxAddress).join(', ') || 'Undisclosed recipients'}
                      </p>
                      {selectedEmail.cc.length > 0 && (
                        <p className="mt-0.5 break-all text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-600">Cc:</span>{' '}
                          {selectedEmail.cc.map(formatMailboxAddress).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedEmail.html && selectedEmail.plainText && (
                    <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Email body format">
                      <button
                        type="button"
                        aria-pressed={messageBodyMode === 'formatted'}
                        onClick={() => setMessageBodyMode('formatted')}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${messageBodyMode === 'formatted' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Formatted
                      </button>
                      <button
                        type="button"
                        aria-pressed={messageBodyMode === 'text'}
                        onClick={() => setMessageBodyMode('text')}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${messageBodyMode === 'text' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Plain text
                      </button>
                    </div>
                  )}
                </div>

                {/* Email Body Content */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 p-3 sm:p-5">
                  <article className="mx-auto min-h-full w-full max-w-3xl overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-6 text-slate-800 shadow-2xs sm:p-6">
                    {messageBodyMode === 'formatted' && sanitizedEmailHtml ? (
                      <div
                        className="gmail-message-body min-w-0 max-w-full break-words [&_*]:max-w-full [&_a]:break-all [&_a]:text-indigo-600 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_table]:w-full [&_table]:table-auto [&_td]:break-words [&_th]:break-words"
                        dangerouslySetInnerHTML={{ __html: sanitizedEmailHtml }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">
                        {selectedEmail.plainText || 'This email has no readable text body.'}
                      </div>
                    )}
                  </article>
                </div>

                {mailboxFolder === 'inbox' && (
                <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
                  {replyOpen ? (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label htmlFor="gmail-reply" className="text-xs font-bold text-slate-700">Reply</label>
                        <TemplateSearchPicker label="Search and insert an email template into reply" onSelect={(template) => setReplyBody(template.body)} />
                      </div>
                      <textarea
                        id="gmail-reply"
                        rows={4}
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        placeholder="Write a reply…"
                        className="w-full resize-y rounded-lg border border-slate-200 p-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      {replyError && <p role="alert" className="text-[11px] text-red-600">{replyError}</p>}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => setReplyOpen(false)} disabled={replySending} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                        <button type="button" onClick={() => void handleReply(false)} disabled={replySending || !replyBody.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                          <Reply className="h-3.5 w-3.5" /> {replySending ? 'Sending…' : 'Reply'}
                        </button>
                        <button type="button" onClick={() => void handleReply(true)} disabled={replySending || !replyBody.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          <ReplyAll className="h-3.5 w-3.5" /> Reply all
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReplyOpen(true)}
                      disabled={!canManageEmail || !gmailStatus?.connected}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Reply className="h-3.5 w-3.5" /> Reply
                    </button>
                  )}
                </div>
                )}

                {selectedEmail.attachments.length > 0 && (
                  <div className="max-h-40 shrink-0 overflow-y-auto border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Attachments</p>
                    <div className="space-y-2">
                      {selectedEmail.attachments.map((attachment) => (
                        <button
                          type="button"
                          key={attachment.id}
                          onClick={() => void handleDownloadAttachment(attachment)}
                          disabled={downloadingAttachment === attachment.id}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate text-xs font-semibold text-slate-700">{attachment.filename}</span>
                          </span>
                          <span className="ml-3 shrink-0 text-[10px] text-slate-400">{Math.max(1, Math.ceil(attachment.size / 1024))} KB</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Empty Preview State (Matching Screenshot) */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3.5 shadow-2xs">
                  <Mail className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Select an email to view</h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Choose an inbox message to load its body and attachment details from Gmail.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'campaigns' && <ComingSoon tab="campaigns" />}

      {activeTab === 'sequences' && <DripSequencesView />}

      {/* ─────────────────────────────────────────────────────────────
          TAB: TEMPLATES LIBRARY
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Email templates</h2>
              <p className="mt-0.5 text-xs text-slate-500">{templateTotal} reusable templates for compose and reply.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input type="search" value={templateSearch} onChange={(event) => { setTemplateSearch(event.target.value); setTemplatePage(1); }} placeholder="Search templates…" aria-label="Search email templates" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-56" />
              </div>
              <button
                type="button"
                onClick={() => openTemplateEditor()}
                disabled={!canManageEmail}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> New template
              </button>
            </div>
          </div>

          {templatesError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {templatesError}
              <button type="button" onClick={() => void loadTemplates(templatePage, templateSearch)} className="ml-2 font-bold underline">Retry</button>
            </div>
          )}

          {templatesLoading ? (
            <div role="status" className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-xs text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading templates…
            </div>
          ) : templatesError && templates.length === 0 ? null : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <FileCode className="mx-auto h-8 w-8 text-slate-300" />
              <h3 className="mt-3 text-sm font-bold text-slate-800">{templateSearch ? 'No matching templates' : 'No email templates yet'}</h3>
              <p className="mt-1 text-xs text-slate-500">{templateSearch ? 'Try a different title, category, or subject.' : 'Create one to insert it directly while composing or replying.'}</p>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-white p-5 rounded-xl border border-slate-200 hover:border-teal-400/80 transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                      {tmpl.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(tmpl)}
                      className="text-xs text-slate-400 hover:text-slate-700 font-medium flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">{tmpl.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-3">{tmpl.description}</p>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600 font-mono text-[11px] leading-relaxed">
                    <span className="font-bold text-slate-700 block mb-1">Subject: {tmpl.subject}</span>
                    <p className="text-slate-500 line-clamp-2">{tmpl.body}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openTemplateEditor(tmpl)} disabled={!canManageEmail} aria-label={`Edit ${tmpl.title}`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => void handleDeleteTemplate(tmpl)} disabled={!canManageEmail} aria-label={`Delete ${tmpl.title}`} className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>

                  <button
                    type="button"
                    onClick={() => useTemplateInCompose(tmpl)}
                    disabled={!canManageEmail || !gmailStatus?.connected}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Use in email
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}

          {!templatesLoading && !templatesError && templateTotalPages > 1 && (
            <nav className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2" aria-label="Email template pagination">
              <span className="text-xs text-slate-500">Page {templatePage} of {templateTotalPages}</span>
              <div className="flex gap-2">
                <button type="button" disabled={templatePage <= 1} onClick={() => setTemplatePage((value) => value - 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
                <button type="button" disabled={templatePage >= templateTotalPages} onClick={() => setTemplatePage((value) => value + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </nav>
          )}
        </div>
      )}

      {activeTab === 'audience' && <ComingSoon tab="audience" />}

      {activeTab === 'deliverability' && <ComingSoon tab="deliverability" />}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: COMPOSE EMAIL
      ───────────────────────────────────────────────────────────── */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/10 flex items-center justify-center text-indigo-600">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Compose New Outbound Email</h3>
              </div>
              <button
                onClick={() => setIsComposeOpen(false)}
                aria-label="Close compose email"
                disabled={composeSending}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendCompose} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">From</label>
                <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                  {gmailStatus?.email || 'Connected Gmail account'}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">To (Recipient Email)</label>
                <input
                  type="text"
                  required
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="client@example.com, teammate@example.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cc <span className="font-normal text-slate-400">(optional)</span></label>
                  <input type="text" value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="cc@example.com" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bcc <span className="font-normal text-slate-400">(optional)</span></label>
                  <input type="text" value={composeBcc} onChange={(e) => setComposeBcc(e.target.value)} placeholder="bcc@example.com" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold text-slate-700">Message Body</span>
                <TemplateSearchPicker
                  label="Search and insert an email template into compose"
                  onSelect={(template) => {
                    setComposeSubject(template.subject);
                    setComposeBody(template.body);
                  }}
                />
              </div>

              <textarea
                required
                rows={6}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Type your message here..."
                className="w-full p-3 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-sans"
              />

              {composeError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{composeError}</p>}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-[11px] text-slate-400">
                  <span>Sent by Gmail using OAuth 2.0</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsComposeOpen(false)}
                    disabled={composeSending}
                    className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={composeSending}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors shadow-xs flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{composeSending ? 'Sending…' : 'Send'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTemplateEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">{editingTemplate ? 'Edit email template' : 'New email template'}</h3>
              </div>
              <button type="button" onClick={() => setIsTemplateEditorOpen(false)} disabled={templateSaving} aria-label="Close template editor" className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={handleSaveTemplate} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="template-title" className="mb-1 block font-semibold text-slate-700">Template name</label>
                  <input id="template-title" required maxLength={160} value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <div>
                  <label htmlFor="template-category" className="mb-1 block font-semibold text-slate-700">Category</label>
                  <input id="template-category" required maxLength={80} value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
              </div>
              <div>
                <label htmlFor="template-subject" className="mb-1 block font-semibold text-slate-700">Subject</label>
                <input id="template-subject" required maxLength={300} value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label htmlFor="template-description" className="mb-1 block font-semibold text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="template-description" maxLength={500} value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label htmlFor="template-body" className="mb-1 block font-semibold text-slate-700">Message</label>
                <textarea id="template-body" required rows={10} value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} className="w-full resize-y rounded-lg border border-slate-200 p-3 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <p className="mt-1 text-[10px] text-slate-400">Placeholders such as {'{{firstName}}'} stay as text until you replace them.</p>
              </div>
              {templatesError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{templatesError}</p>}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setIsTemplateEditorOpen(false)} disabled={templateSaving} className="rounded-lg px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={templateSaving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {templateSaving ? 'Saving…' : 'Save template'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: TEMPLATE PREVIEW
      ───────────────────────────────────────────────────────────── */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">{previewTemplate.title}</h3>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500"><span className="font-bold text-slate-700">Subject:</span> {previewTemplate.subject}</p>
                <p className="text-slate-400 text-[10px] mt-0.5"><span className="font-semibold text-slate-600">Category:</span> {previewTemplate.category}</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white font-sans text-slate-800 whitespace-pre-line leading-relaxed text-xs max-h-72 overflow-y-auto">
                {previewTemplate.body}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium text-xs"
              >
                Close
              </button>
              <button
                onClick={() => {
                  useTemplateInCompose(previewTemplate);
                }}
                disabled={!canManageEmail || !gmailStatus?.connected}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use in email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
