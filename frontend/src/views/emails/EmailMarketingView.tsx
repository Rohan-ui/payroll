import React, { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

import { toast } from '../../lib/toast';
import {
  gmailApi,
  GmailAttachment,
  GmailConnectionStatus,
  GmailFolder,
  GmailInboxMessage,
  GmailMessage,
  GmailTemplate,
} from '../../api/gmail.api';
import {
  Mail, Send, Plus, CheckCircle2, Clock, Users,
  BarChart3, ShieldCheck, Eye, MousePointer, MessageSquare,
  AlertTriangle, Filter, Search, ArrowUpRight, Copy, Check,
  Play, Pause, RefreshCw, ChevronLeft, ChevronRight, X, ExternalLink,
  Layers, FileCode, CheckCircle, Zap, ShieldAlert, Sliders,
  Inbox, Paperclip, Reply, ReplyAll, Pencil, Trash2, Save
} from 'lucide-react';
import { usePayroll } from '../../context/PayrollContext';
import { useAuth } from '../../context/AuthContext';

const INBOX_REFRESH_INTERVAL_MS = 30_000;
const INBOX_PAGE_SIZE = 25;

interface CampaignItem {
  id: string;
  name: string;
  subject: string;
  audience: string;
  audienceCount: number;
  status: 'ACTIVE' | 'SCHEDULED' | 'COMPLETED' | 'DRAFT' | 'PAUSED';
  sentDate: string;
  openRate: number;
  clickRate: number;
  replyRate: number;
  sender: string;
}

interface DripStep {
  stepNumber: number;
  dayOffset: number;
  name: string;
  trigger: string;
  subject: string;
  openRate: number;
  replyRate: number;
  isActive: boolean;
}

const INITIAL_CAMPAIGNS: CampaignItem[] = [
  {
    id: 'camp-1',
    name: 'SaaS Founders - Q3 Tech Retainers',
    subject: 'Quick question about {{company}} tech stack roadmap',
    audience: 'B2B Founders (India & US)',
    audienceCount: 420,
    status: 'ACTIVE',
    sentDate: 'Today, 09:30 AM',
    openRate: 58.4,
    clickRate: 22.8,
    replyRate: 11.2,
    sender: 'Bhavin Pathak <bhavin@voogyo.com>',
  },
  {
    id: 'camp-2',
    name: 'Dormant Quotation Follow-up Wave 2',
    subject: 'Revised pricing & timeline for {{company}} proposal',
    audience: 'Pending Proposals (>14 days)',
    audienceCount: 165,
    status: 'ACTIVE',
    sentDate: 'Yesterday',
    openRate: 64.2,
    clickRate: 31.0,
    replyRate: 18.5,
    sender: 'Sales Team <sales@voogyo.com>',
  },
  {
    id: 'camp-3',
    name: 'Voogyo 2.0 Product Launch Announcement',
    subject: 'Introducing Voogyo Business OS: All-in-one CRM & Payroll',
    audience: 'All Active Clients & Leads',
    audienceCount: 1250,
    status: 'SCHEDULED',
    sentDate: 'Tomorrow, 10:00 AM',
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    sender: 'Voogyo Product Team <updates@voogyo.com>',
  },
  {
    id: 'camp-4',
    name: 'E-Commerce Shopify Plus Migration',
    subject: 'How {{company}} can boost checkout speed by 40%',
    audience: 'D2C & Retail Brands',
    audienceCount: 310,
    status: 'COMPLETED',
    sentDate: 'Sep 18, 2026',
    openRate: 51.2,
    clickRate: 17.6,
    replyRate: 8.9,
    sender: 'Growth Team <growth@voogyo.com>',
  },
  {
    id: 'camp-5',
    name: 'Webinar: Scaling Agency Profitability in 2026',
    subject: 'Live Workshop: Real-time unit economics for agency owners',
    audience: 'Design & Development Agencies',
    audienceCount: 540,
    status: 'COMPLETED',
    sentDate: 'Sep 12, 2026',
    openRate: 49.8,
    clickRate: 24.5,
    replyRate: 14.1,
    sender: 'Events <events@voogyo.com>',
  },
];

const INITIAL_DRIP_STEPS: DripStep[] = [
  {
    stepNumber: 1,
    dayOffset: 0,
    name: 'Cold Introduction & Pain Point Resonance',
    trigger: 'Immediate upon lead qualification',
    subject: 'Quick idea regarding {{company}}’s development velocity',
    openRate: 62.1,
    replyRate: 7.8,
    isActive: true,
  },
  {
    stepNumber: 2,
    dayOffset: 3,
    name: 'Proof of Work & Client Case Study',
    trigger: 'If Step 1 opened, no reply in 72 hours',
    subject: 'Case Study: How we reduced release cycles by 55%',
    openRate: 54.6,
    replyRate: 12.3,
    isActive: true,
  },
  {
    stepNumber: 3,
    dayOffset: 7,
    name: 'Executive Teardown & 10-Min Strategy Call',
    trigger: 'If no reply after Step 2',
    subject: '10-minute architecture teardown for {{company}}',
    openRate: 48.2,
    replyRate: 15.6,
    isActive: true,
  },
  {
    stepNumber: 4,
    dayOffset: 14,
    name: 'Quotation & Flexible Retainer Model',
    trigger: 'If engaged with previous links',
    subject: 'Resource pricing & sprint models overview',
    openRate: 44.0,
    replyRate: 11.4,
    isActive: true,
  },
  {
    stepNumber: 5,
    dayOffset: 24,
    name: 'Closing the Loop (Break-up Email)',
    trigger: 'Final touch before archival',
    subject: 'Permission to close {{company}} file for now?',
    openRate: 59.8,
    replyRate: 21.0,
    isActive: true,
  },
];

const AUDIENCE_CONTACTS = [
  { id: '1', name: 'Arjun Mehta', email: 'arjun@zenithtech.io', company: 'Zenith Tech', stage: 'Prospect', score: 94, status: 'Active' },
  { id: '2', name: 'Priya Sharma', email: 'priya@cloudcraft.in', company: 'CloudCraft Solutions', stage: 'Proposal Sent', score: 88, status: 'Active' },
  { id: '3', name: 'Rajesh Nair', email: 'rajesh@nexushub.co', company: 'NexusHub Enterprise', stage: 'Meeting Booked', score: 91, status: 'Active' },
  { id: '4', name: 'Sneha Patel', email: 'sneha@finflow.io', company: 'FinFlow Global', stage: 'Cold Qualified', score: 76, status: 'Active' },
  { id: '5', name: 'Vikram Singh', email: 'vikram@apexretail.in', company: 'Apex Retail Brands', stage: 'Active Client', score: 99, status: 'Active' },
  { id: '6', name: 'Ananya Verma', email: 'ananya@scaleup.agency', company: 'ScaleUp Creative', stage: 'Cold Outreach', score: 68, status: 'Active' },
];

export const EmailMarketingView: React.FC = () => {
  const { navigateTo } = usePayroll();
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
  const [templateSaving, setTemplateSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GmailTemplate | null>(null);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateCategory, setTemplateCategory] = useState('General');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateBody, setTemplateBody] = useState('');

  // Campaign State
  const [campaigns, setCampaigns] = useState<CampaignItem[]>(INITIAL_CAMPAIGNS);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [isQuickTestOpen, setIsQuickTestOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<GmailTemplate | null>(null);

  // New Campaign Form State
  const [newCampName, setNewCampName] = useState('');
  const [newCampSubject, setNewCampSubject] = useState('');
  const [newCampAudience, setNewCampAudience] = useState('B2B Founders (India & US)');
  const [newCampSender, setNewCampSender] = useState('Bhavin Pathak <bhavin@voogyo.com>');

  // Test Email Form State
  const [testEmailRecipient, setTestEmailRecipient] = useState('test@voogyo.com');
  const [testEmailSubject, setTestEmailSubject] = useState('Voogyo Email Dispatch Verification Test');

  // Toast feedback

  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'error' ? toast.error(text) : toast.success(text);

  const mailboxRangeStart = gmailTotal === 0 ? 0 : (gmailPage - 1) * INBOX_PAGE_SIZE + 1;
  const mailboxRangeEnd = Math.min(gmailPage * INBOX_PAGE_SIZE, gmailTotal);

  // Filtered Mailbox Messages
  const currentFolderEmails = mailboxEmails.filter((e) => {
    if (mailboxSearch) {
      const q = mailboxSearch.toLowerCase();
      return (
        e.subject.toLowerCase().includes(q) ||
        e.from.name.toLowerCase().includes(q) ||
        e.from.email.toLowerCase().includes(q) ||
        e.to.some((address) => address.name.toLowerCase().includes(q) || address.email.toLowerCase().includes(q)) ||
        e.preview.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const loadMailbox = useCallback(async (
    folder: GmailFolder,
    page = 1,
    options: { silent?: boolean; preserveSelection?: boolean } = {},
  ) => {
    if (inboxRequestInFlight.current) return;
    inboxRequestInFlight.current = true;
    if (!options.silent) setInboxLoading(true);
    setMailboxError(null);
    try {
      const result = await gmailApi.listMessages(folder, page, INBOX_PAGE_SIZE);
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

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const result = await gmailApi.listTemplates();
      setTemplates(result.items);
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
    void loadTemplates();
  }, [loadGmailStatus, loadTemplates]);

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
    setMailboxSearch('');
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
      await gmailApi.sendMessage({
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
      showToast(`Email sent to ${composeTo}`);
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
      const saved = editingTemplate
        ? await gmailApi.updateTemplate(editingTemplate.id, input)
        : await gmailApi.createTemplate(input);
      setTemplates((current) => [saved, ...current.filter((template) => template.id !== saved.id)]);
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
      setTemplates((current) => current.filter((item) => item.id !== template.id));
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

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampName || !newCampSubject) return;

    const newCamp: CampaignItem = {
      id: `camp-${Date.now()}`,
      name: newCampName,
      subject: newCampSubject,
      audience: newCampAudience,
      audienceCount: 280,
      status: 'ACTIVE',
      sentDate: 'Just now',
      openRate: 0,
      clickRate: 0,
      replyRate: 0,
      sender: newCampSender,
    };

    void newCamp;
    toast.error('Not available yet: this screen is not connected to the server, so nothing was launched.');
  };

  const filteredCampaigns = campaigns.filter((c) => {
    if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.audience.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div
      className={
        activeTab === 'hub'
          ? 'space-y-5 pb-12 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-5 lg:space-y-0 lg:pb-0'
          : 'space-y-5 pb-12'
      }
    >
      {activeTab !== 'hub' && activeTab !== 'templates' && (
        <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Preview only. Campaigns, contacts, and deliverability content on this tab are sample data and are not sent.
        </p>
      )}

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
                    Gmail Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {gmailStatusLoading ? 'Checking Gmail…' : gmailStatus?.requiresReconnect ? 'Reconnect Gmail' : 'Gmail Not Connected'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Read, send, and reply through Gmail securely with OAuth 2.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {gmailStatus?.connected ? (
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
              disabled={!gmailStatus?.connected || !canManageEmail}
              title={!canManageEmail ? 'Your role cannot send email' : !gmailStatus?.connected ? 'Connect Gmail before composing' : 'Compose email'}
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
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
            {campaigns.length}
          </span>
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
          <span>Drip Sequences (Cadence)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 text-indigo-700 font-bold">
            5 Steps
          </span>
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
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={mailboxSearch}
                  onChange={(e) => setMailboxSearch(e.target.value)}
                  aria-label={`Filter ${mailboxFolder} messages`}
                  placeholder={`Filter this ${mailboxFolder} page…`}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200/80 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400"
                />
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
                    No {mailboxFolder} messages
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                    Gmail returned no messages for this page.
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
                      className={`block w-full p-3 text-left transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-3 border-indigo-600'
                          : 'hover:bg-slate-50/80'
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
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="gmail-reply" className="text-xs font-bold text-slate-700">Reply</label>
                        {templates.length > 0 && (
                          <select
                            aria-label="Insert an email template into reply"
                            defaultValue=""
                            onChange={(event) => {
                              const template = templates.find((item) => item.id === event.target.value);
                              if (template) setReplyBody(template.body);
                              event.target.value = '';
                            }}
                            className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            <option value="">Insert template…</option>
                            {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                          </select>
                        )}
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

      {/* ─────────────────────────────────────────────────────────────
          TAB: EMAIL CAMPAIGNS (PRESERVED & ENHANCED)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          {/* Global KPIs bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sent Volume</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-slate-900">24,850</span>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">+12%</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Last 30 days total</p>
            </div>

            <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Avg. Open Rate</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-teal-600">54.8%</span>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">+4.2%</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Industry avg: 21.3%</p>
            </div>

            <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Click Rate (CTR)</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-indigo-600">19.4%</span>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">High</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">4,820 proposal clicks</p>
            </div>

            <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Reply Rate</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-amber-600">11.8%</span>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">+2.1%</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Direct positive responses</p>
            </div>

            <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Inbox Placement</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-emerald-600">99.6%</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Optimal</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">SPF, DKIM, DMARC valid</p>
            </div>
          </div>

          {/* Controls: Search & Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaigns, subjects, or audiences…"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              {['ALL', 'ACTIVE', 'SCHEDULED', 'COMPLETED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterStatus === status
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Campaigns Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-4">Campaign Name &amp; Subject</th>
                    <th className="py-3 px-4">Target Audience</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Open Rate</th>
                    <th className="py-3 px-4 text-center">Click Rate</th>
                    <th className="py-3 px-4 text-center">Reply Rate</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCampaigns.map((camp) => (
                    <tr key={camp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{camp.name}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-sm mt-0.5">
                          "{camp.subject}"
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                          <span>{camp.sentDate}</span>
                          <span>•</span>
                          <span>{camp.sender}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
                          <Users className="w-3 h-3 text-slate-500" />
                          {camp.audience}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {camp.audienceCount} recipients
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {camp.status === 'ACTIVE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        )}
                        {camp.status === 'SCHEDULED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            Scheduled
                          </span>
                        )}
                        {camp.status === 'COMPLETED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <Check className="w-3 h-3 text-slate-500" />
                            Completed
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-teal-600 text-sm">{camp.openRate}%</span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-indigo-600 text-sm">{camp.clickRate}%</span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-amber-600 text-sm">{camp.replyRate}%</span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => toast.error('Not available yet: this screen is not connected to the server, so nothing was refreshed.')}
                          className="px-2.5 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        >
                          View Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: DRIP SEQUENCES
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'sequences' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Voogyo 30-Day Multi-Touch Sales Sequence
                </h2>
                <p className="text-xs text-slate-500">
                  Automated outreach triggers based on recipient engagement, link tracking, and stage milestone changes.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 self-start sm:self-auto">
                <Zap className="w-3.5 h-3.5" />
                Workflow Active
              </span>
            </div>

            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {INITIAL_DRIP_STEPS.map((step) => (
                <div key={step.stepNumber} className="relative group">
                  <div className="absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-teal-500 flex items-center justify-center text-[10px] font-bold text-teal-700 shadow-2xs">
                    {step.stepNumber}
                  </div>

                  <div className="bg-slate-50 hover:bg-white p-4 rounded-xl border border-slate-200 transition-all shadow-2xs hover:shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-900 text-white">
                            Day {step.dayOffset}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">{step.name}</h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Trigger: {step.trigger}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Open Rate</p>
                          <p className="font-bold text-teal-600">{step.openRate}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Reply Rate</p>
                          <p className="font-bold text-amber-600">{step.replyRate}%</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                      <div className="text-slate-600 text-[11px] truncate max-w-lg">
                        <span className="font-semibold text-slate-700">Subject: </span>
                        {step.subject}
                      </div>
                      <button
                        onClick={() => showToast(`Editing Step ${step.stepNumber}: ${step.name}`)}
                        className="text-teal-600 font-semibold hover:underline text-xs"
                      >
                        Configure Step
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: TEMPLATES LIBRARY
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Email templates</h2>
              <p className="mt-0.5 text-xs text-slate-500">Reusable subject and message text for compose and reply.</p>
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

          {templatesError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {templatesError}
              <button type="button" onClick={() => void loadTemplates()} className="ml-2 font-bold underline">Retry</button>
            </div>
          )}

          {templatesLoading ? (
            <div role="status" className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-xs text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading templates…
            </div>
          ) : templatesError && templates.length === 0 ? null : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <FileCode className="mx-auto h-8 w-8 text-slate-300" />
              <h3 className="mt-3 text-sm font-bold text-slate-800">No email templates yet</h3>
              <p className="mt-1 text-xs text-slate-500">Create one to insert it directly while composing or replying.</p>
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: AUDIENCE & CONTACTS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'audience' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Prospect &amp; Client Audiences</h3>
                <p className="text-xs text-slate-500">Live synced from Voogyo CRM Leads &amp; Clients master database.</p>
              </div>
              <button
                onClick={() => navigateTo('crm', 'cold-funnel')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              >
                <span>View CRM Outreach Leads</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">CRM Stage</th>
                    <th className="py-3 px-4 text-center">Engagement Score</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {AUDIENCE_CONTACTS.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-slate-400 text-[11px]">{c.email}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">{c.company}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {c.stage}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-teal-600">{c.score} / 100</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: DELIVERABILITY & SENDER ACCOUNTS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'deliverability' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Connected Outbound Senders</h3>
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> 3 Active Senders
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">bhavin@voogyo.com</p>
                    <p className="text-[11px] text-slate-500">Google Workspace OAuth • Primary Personal</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                      Warmup: 100%
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">150/150 sent today</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">sales@voogyo.com</p>
                    <p className="text-[11px] text-slate-500">Microsoft 365 Exchange • Inbound &amp; Quotes</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                      Warmup: 98%
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">82/120 sent today</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">updates@voogyo.com</p>
                    <p className="text-[11px] text-slate-500">Amazon SES • High-Volume Product Announcements</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                      Bulk SES
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">4,200/50,000 sent</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Domain DNS Authentication</h3>
              <p className="text-xs text-slate-500 mb-4">Security records verifying email legitimacy and anti-spoofing compliance.</p>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/60">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="font-bold text-slate-900">SPF Record (Sender Policy Framework)</span>
                      <p className="text-[10px] text-slate-500">v=spf1 include:_spf.google.com ~all</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Valid</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/60">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="font-bold text-slate-900">DKIM Signature (2048-bit RSA)</span>
                      <p className="text-[10px] text-slate-500">google._domainkey.voogyo.com</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Valid</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/60">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="font-bold text-slate-900">DMARC Strict Policy</span>
                      <p className="text-[10px] text-slate-500">v=DMARC1; p=quarantine; rua=mailto:dmarc@voogyo.com</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Message Body</span>
                <select
                  onChange={(e) => {
                    const tmpl = templates.find((t) => t.id === e.target.value);
                    if (tmpl) {
                      setComposeSubject(tmpl.subject);
                      setComposeBody(tmpl.body);
                    }
                    e.target.value = '';
                  }}
                  className="text-[11px] text-indigo-600 bg-indigo-50/70 border border-indigo-200 rounded-md px-2 py-0.5 focus:outline-none"
                >
                  <option value="">Insert Template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
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

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CREATE CAMPAIGN
      ───────────────────────────────────────────────────────────── */}
      {isCreateCampaignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-600">
                  <Mail className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Launch New Email Campaign</h3>
              </div>
              <button
                onClick={() => setIsCreateCampaignOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Campaign Internal Name</label>
                <input
                  type="text"
                  required
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="e.g. Q4 CTO Outreach - Cloud Modernization"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Subject Line</label>
                <input
                  type="text"
                  required
                  value={newCampSubject}
                  onChange={(e) => setNewCampSubject(e.target.value)}
                  placeholder="e.g. Quick question regarding {{company}}'s next sprint"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500">
                  <span>Variables:</span>
                  <button
                    type="button"
                    onClick={() => setNewCampSubject((s) => s + ' {{firstName}}')}
                    className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-700"
                  >
                    {"{{firstName}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampSubject((s) => s + ' {{company}}')}
                    className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-700"
                  >
                    {"{{company}}"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Audience Segment</label>
                  <select
                    value={newCampAudience}
                    onChange={(e) => setNewCampAudience(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  >
                    <option value="B2B Founders (India & US)">B2B Founders (India &amp; US)</option>
                    <option value="Pending Proposals (>14 days)">Pending Proposals (&gt;14 days)</option>
                    <option value="D2C & Retail Brands">D2C &amp; Retail Brands</option>
                    <option value="Design & Development Agencies">Design &amp; Development Agencies</option>
                    <option value="All Active Clients & Leads">All Active Clients &amp; Leads</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sender Profile</label>
                  <select
                    value={newCampSender}
                    onChange={(e) => setNewCampSender(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  >
                    <option value="Bhavin Pathak <bhavin@voogyo.com>">Bhavin Pathak (bhavin@voogyo.com)</option>
                    <option value="Sales Team <sales@voogyo.com>">Sales Team (sales@voogyo.com)</option>
                    <option value="Voogyo Updates <updates@voogyo.com>">Voogyo Updates (updates@voogyo.com)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-teal-50/70 border border-teal-200/60 text-teal-800 text-[11px] leading-relaxed">
                <span className="font-bold">Voogyo Deliverability Safeguard:</span> Emails will be dispatched using smart throttling (1 email every 45-90 seconds) to ensure 0% spam placement.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateCampaignOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-bold transition-colors shadow-xs"
                >
                  Schedule &amp; Launch
                </button>
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
