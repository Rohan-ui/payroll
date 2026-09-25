import React, { useState } from 'react';

import { toast } from '../../lib/toast';
import { apiFetch } from '../../api/client';
import {
  Mail, Send, Sparkles, Plus, CheckCircle2, Clock, Users,
  BarChart3, ShieldCheck, Eye, MousePointer, MessageSquare,
  AlertTriangle, Filter, Search, ArrowUpRight, Copy, Check,
  Play, Pause, RefreshCw, ChevronRight, X, ExternalLink,
  Layers, FileCode, CheckCircle, Zap, ShieldAlert, Sliders,
  Inbox, Trash2, Edit3, Star, Settings, ChevronDown, Paperclip,
  Reply, CornerUpLeft, ArrowLeft, FileText
} from 'lucide-react';
import { usePayroll } from '../../context/PayrollContext';

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

interface EmailTemplate {
  id: string;
  title: string;
  category: string;
  subject: string;
  description: string;
  bodyPreview: string;
  fullBody: string;
}

interface MailboxEmail {
  id: string;
  folder: 'inbox' | 'sent' | 'cadence' | 'drafts' | 'trash';
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  isStarred?: boolean;
  isRead?: boolean;
  leadName?: string;
  leadCompany?: string;
  leadStage?: string;
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

const TEMPLATES: EmailTemplate[] = [
  {
    id: 'tmpl-1',
    title: 'High-Impact B2B Cold Outreach',
    category: 'Sales Outbound',
    subject: 'Quick question regarding {{company}} roadmap',
    description: 'Concise 3-paragraph outreach highlighting unit economics and engineering capacity.',
    bodyPreview: 'Hi {{firstName}}, I noticed {{company}} has been expanding fast. Most teams we work with face bottlenecking in sprint delivery...',
    fullBody: `Hi {{firstName}},

I came across {{company}} and noticed the recent momentum you're driving in the market. Huge congratulations on the progress!

Typically, when fast-growing teams scale up, engineering velocity and product releases encounter unforeseen bottlenecks. We partner with leaders to provide dedicated senior engineering squads that integrate within 48 hours.

Would you have 10 minutes this Thursday afternoon for a quick chat?

Best regards,
{{senderName}}
Voogyo Enterprise Solutions`,
  },
  {
    id: 'tmpl-2',
    title: 'Post-Demo Follow-up & Next Steps',
    category: 'Sales Pipeline',
    subject: 'Great speaking today! Recap & Next Steps for {{company}}',
    description: 'Structured recap of meeting findings, action items, and quotation link.',
    bodyPreview: 'Thank you for taking the time to connect today. Here is a summary of our discussion and agreed milestones...',
    fullBody: `Hi {{firstName}},

Thank you for your time earlier today. It was great learning more about {{company}}'s upcoming milestones.

As discussed, here are the key takeaways and our recommended action items:
• Milestone 1: Scope architecture & resource requirements.
• Milestone 2: Deployment of 2 Senior Full-Stack Engineers & QA.
• Delivery Model: Agile 2-week sprints with transparent daily reporting.

I have attached our official quotation and scope breakdown below for your team's review.

Looking forward to your thoughts!

Warm regards,
{{senderName}}`,
  },
  {
    id: 'tmpl-3',
    title: 'Quotation Executive Summary',
    category: 'Quotations',
    subject: 'Voogyo Quotation #{{quoteNumber}} for {{company}}',
    description: 'Formal proposal cover note with breakdown of deliverables, payment terms, and validity.',
    bodyPreview: 'We have finalized the formal proposal for {{company}}. Please find attached our detailed scope and fee schedule...',
    fullBody: `Dear {{firstName}},

Please find attached the official quotation (Quotation #{{quoteNumber}}) prepared for {{company}} for your review.

Highlights of this proposal:
• Total Investment: {{totalAmount}}
• Project Timeline: {{timeline}}
• Terms: 50% Advance, 50% on Milestone Acceptance
• Validity: 15 Business Days

You can review and electronically sign the proposal through our secure client portal here: {{proposalLink}}.

Please let us know if you have any questions or require scope adjustments.

Sincerely,
{{senderName}}
Voogyo Commercial Team`,
  },
  {
    id: 'tmpl-4',
    title: 'Polite Break-up / Closing the File',
    category: 'Cadence Follow-up',
    subject: 'Permission to close your file at {{company}}?',
    description: 'Proven high-reply breakup email that re-engages non-responsive leads.',
    bodyPreview: 'I haven\'t heard back, which usually means either you\'ve already solved this or priorities have shifted...',
    fullBody: `Hi {{firstName}},

I've reached out a couple of times regarding {{company}}'s engineering requirements, but haven't heard back yet.

That usually means one of three things:
1. You've already found another solution (totally fine!).
2. This is on the back burner for now.
3. You're interested, but haven't had a chance to reply.

If you'd like me to close out your file and stop following up, just let me know. Either way, wishing you and {{company}} continued success!

Best regards,
{{senderName}}`,
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

const INITIAL_MAILBOX_EMAILS: MailboxEmail[] = [
  {
    id: 'msg-1',
    folder: 'sent',
    fromName: 'Bhavin Pathak',
    fromEmail: 'bhavin@voogyo.com',
    toEmail: 'arjun@zenithtech.io',
    subject: 'Quick question about Zenith Tech development roadmap',
    preview: 'Hi Arjun, I noticed Zenith Tech has been expanding fast. Most teams we work with face bottlenecking...',
    body: `Hi Arjun,

I noticed Zenith Tech has been expanding fast in the enterprise fintech space. Huge congratulations on your recent growth!

Typically, when engineering teams scale past 20 engineers, sprint velocity encounters technical debt bottlenecks. We partner with product companies to provide dedicated senior engineers that plug into your repository within 48 hours.

Would you have 10 minutes this Thursday for a quick introductory exchange?

Best regards,
Bhavin Pathak
Voogyo Enterprise Solutions`,
    date: 'Today, 09:30 AM',
    leadName: 'Arjun Mehta',
    leadCompany: 'Zenith Tech',
    leadStage: 'Prospect',
  },
  {
    id: 'msg-2',
    folder: 'cadence',
    fromName: 'Voogyo Cadence Engine',
    fromEmail: 'sales@voogyo.com',
    toEmail: 'priya@cloudcraft.in',
    subject: 'Case Study: How CloudCraft can reduce cloud deployment cycles by 50%',
    preview: 'Hi Priya, Following up on our initial introduction regarding engineering sprints...',
    body: `Hi Priya,

Following up on our earlier note. I wanted to share a brief case study on how we helped a similar cloud infrastructure firm reduce release cycles by 55% while trimming AWS infrastructure costs by 28%.

You can review the breakdown here: https://voogyo.com/case-studies/cloudcraft

Would love to discuss how this applies to your current Q4 priorities.

Warm regards,
Sales Outbound Cadence
Voogyo Outbound Hub`,
    date: 'Yesterday, 04:15 PM',
    leadName: 'Priya Sharma',
    leadCompany: 'CloudCraft Solutions',
    leadStage: 'Cold Cadence Step 2',
  },
];

export const EmailMarketingView: React.FC = () => {
  const { navigateTo } = usePayroll();
  
  // Navigation tabs: 'hub' is the Tenant Mailbox & Outbound Hub from screenshot!
  const [activeTab, setActiveTab] = useState<'hub' | 'campaigns' | 'sequences' | 'templates' | 'audience' | 'deliverability'>('hub');

  // Mailbox Hub State
  const [mailboxFolder, setMailboxFolder] = useState<'inbox' | 'sent' | 'cadence' | 'drafts' | 'trash'>('inbox');
  const [mailboxEmails, setMailboxEmails] = useState<MailboxEmail[]>(INITIAL_MAILBOX_EMAILS);
  const [selectedEmail, setSelectedEmail] = useState<MailboxEmail | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const [mailboxSearch, setMailboxSearch] = useState('');

  // SMTP Configuration State
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(false);
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [isSmtpModalOpen, setIsSmtpModalOpen] = useState(false);

  // Compose Email State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSender, setComposeSender] = useState('Bhavin Pathak <bhavin@voogyo.com>');
  const [composeLeadLink, setComposeLeadLink] = useState('');

  // Campaign State
  const [campaigns, setCampaigns] = useState<CampaignItem[]>(INITIAL_CAMPAIGNS);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [isQuickTestOpen, setIsQuickTestOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

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

  // Folder Counts
  const inboxCount = mailboxEmails.filter((e) => e.folder === 'inbox').length;
  const sentCount = mailboxEmails.filter((e) => e.folder === 'sent').length;
  const cadenceCount = mailboxEmails.filter((e) => e.folder === 'cadence').length;
  const draftsCount = mailboxEmails.filter((e) => e.folder === 'drafts').length;
  const trashCount = mailboxEmails.filter((e) => e.folder === 'trash').length;

  // Filtered Mailbox Messages
  const currentFolderEmails = mailboxEmails.filter((e) => {
    if (e.folder !== mailboxFolder) return false;
    if (starredOnly && !e.isStarred) return false;
    if (mailboxSearch) {
      const q = mailboxSearch.toLowerCase();
      return (
        e.subject.toLowerCase().includes(q) ||
        e.fromName.toLowerCase().includes(q) ||
        e.fromEmail.toLowerCase().includes(q) ||
        e.toEmail.toLowerCase().includes(q) ||
        (e.leadCompany && e.leadCompany.toLowerCase().includes(q))
      );
    }
    return true;
  });

  /** Sends through the workspace email API and reports exactly what it answered. */
  const handleSendCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo || !composeSubject || !composeBody) return;

    let res: Response;
    try {
      res = await apiFetch('/api/v1/tenant/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: composeTo, subject: composeSubject, text: composeBody }),
      });
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
      return;
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(json?.message || 'The email could not be sent. Nothing was sent.');
      return;
    }

    const newEmail: MailboxEmail = {
      id: `msg-${Date.now()}`,
      folder: 'sent',
      fromName: 'You',
      fromEmail: '',
      toEmail: composeTo,
      subject: composeSubject,
      preview: composeBody.slice(0, 100) + '...',
      body: composeBody,
      date: 'Just now',
      leadCompany: composeLeadLink || undefined,
    };

    setMailboxEmails([newEmail, ...mailboxEmails]);
    setIsComposeOpen(false);
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    showToast(`Email sent to ${composeTo}`);
  };

  const handleSaveSmtp = (e: React.FormEvent) => {
    e.preventDefault();
    // SMTP is saved and tested in Organization & Settings; this form stores nothing.
    toast.error('Set up and test the mail server in Organization & Settings → Email. Nothing was saved here.');
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
    <div className="space-y-5 pb-12">
      <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        Preview only. The campaigns, contacts and mailbox below are sample content: this screen is not yet connected to your
        workspace, and it does not send email. Nothing here reflects your data.
      </p>

      {/* ── Top Header Card (Matching User Screenshot) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
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
                {isSmtpConfigured ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    SMTP Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    SMTP Not Configured
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Live multi-channel inbox, direct portal SMTP dispatch &amp; cold marketing cadence emails
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSmtpModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>SMTP Settings</span>
            </button>

            <button
              onClick={() => {
                toast.error('Not available yet: this screen is not connected to the server, so nothing was synced.');
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-2xs transition-colors"
              title="Refresh Mailbox"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsComposeOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Compose Email</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub-navigation Tabs (Preserving all existing suite features!) ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 text-xs font-semibold">
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
            {TEMPLATES.length}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start min-h-[580px]">
          {/* Left Column: Folders & SMTP Health */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs space-y-1">
              <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold tracking-wider uppercase text-slate-400">
                Mailbox Folders
              </p>

              <button
                onClick={() => { setMailboxFolder('inbox'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  mailboxFolder === 'inbox'
                    ? 'bg-blue-50/80 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Inbox className="w-4 h-4 text-blue-600" />
                  <span>Inbox</span>
                </div>
                {inboxCount > 0 ? (
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">
                    {inboxCount}
                  </span>
                ) : null}
              </button>

              <button
                onClick={() => { setMailboxFolder('sent'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  mailboxFolder === 'sent'
                    ? 'bg-blue-50/80 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Send className="w-4 h-4 text-indigo-500" />
                  <span>Sent Outbound</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{sentCount}</span>
              </button>

              <button
                onClick={() => { setMailboxFolder('cadence'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  mailboxFolder === 'cadence'
                    ? 'bg-blue-50/80 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Cold Funnel</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold">
                  {cadenceCount}
                </span>
              </button>

              <button
                onClick={() => { setMailboxFolder('drafts'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  mailboxFolder === 'drafts'
                    ? 'bg-blue-50/80 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span>Drafts</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{draftsCount}</span>
              </button>

              <button
                onClick={() => { setMailboxFolder('trash'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  mailboxFolder === 'trash'
                    ? 'bg-blue-50/80 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 className="w-4 h-4 text-slate-400" />
                  <span>Trash</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{trashCount}</span>
              </button>
            </div>

            {/* SMTP HEALTH Widget (Matching Screenshot) */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>SMTP HEALTH</span>
                </div>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSmtpConfigured ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
                  }`}
                />
              </div>

              <p className="text-xs font-bold text-slate-800">
                {isSmtpConfigured ? 'SMTP Connected' : 'No sender set'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                Host: {smtpHost}
              </p>

              <button
                onClick={() => setIsSmtpModalOpen(true)}
                className="w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
              >
                Configure SMTP
              </button>
            </div>
          </div>

          {/* Middle Column: Email List & Search */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col min-h-[500px]">
            {/* Search header */}
            <div className="p-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={mailboxSearch}
                  onChange={(e) => setMailboxSearch(e.target.value)}
                  placeholder="Search subject, sender, lead..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200/80 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>{currentFolderEmails.length} messages</span>
                <button
                  onClick={() => setStarredOnly((prev) => !prev)}
                  className={`flex items-center gap-1 hover:text-slate-600 transition-colors ${
                    starredOnly ? 'text-amber-500 font-bold' : ''
                  }`}
                >
                  <Star className={`w-3 h-3 ${starredOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
                  <span>Starred only</span>
                </button>
              </div>
            </div>

            {/* List or Empty State */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {currentFolderEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 shadow-2xs">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 mb-1">
                    No emails in {mailboxFolder}
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                    All caught up! New emails and cadence dispatches will appear here.
                  </p>
                </div>
              ) : (
                currentFolderEmails.map((email) => {
                  const isSelected = selectedEmail?.id === email.id;
                  return (
                    <div
                      key={email.id}
                      onClick={() => setSelectedEmail(email)}
                      className={`p-3 cursor-pointer transition-colors text-xs ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-3 border-indigo-600'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 truncate max-w-[180px]">
                          {mailboxFolder === 'sent' ? `To: ${email.toEmail}` : email.fromName}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{email.date}</span>
                      </div>
                      <p className="font-medium text-slate-700 truncate mb-1">{email.subject}</p>
                      <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed">
                        {email.preview}
                      </p>
                      {email.leadCompany && (
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            🏢 {email.leadCompany}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Email Viewer Pane */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs min-h-[500px] flex flex-col overflow-hidden">
            {selectedEmail ? (
              <div className="flex-1 flex flex-col p-5">
                {/* Email Reader Header */}
                <div className="border-b border-slate-100 pb-4 mb-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                      {selectedEmail.subject}
                    </h3>
                    <button
                      onClick={() => setSelectedEmail(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div>
                      <p className="font-semibold text-slate-800">
                        {selectedEmail.fromName}{' '}
                        <span className="font-normal text-slate-400">&lt;{selectedEmail.fromEmail}&gt;</span>
                      </p>
                      <p className="text-[11px] text-slate-400">To: {selectedEmail.toEmail}</p>
                    </div>
                    <span className="text-[10px] text-slate-400">{selectedEmail.date}</span>
                  </div>

                  {selectedEmail.leadCompany && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Linked CRM Lead: {selectedEmail.leadName} ({selectedEmail.leadCompany})
                      </span>
                    </div>
                  )}
                </div>

                {/* Email Body Content */}
                <div className="flex-1 text-xs text-slate-800 whitespace-pre-line leading-relaxed overflow-y-auto mb-4 font-sans">
                  {selectedEmail.body}
                </div>

                {/* Quick Reply Form */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <CornerUpLeft className="w-3.5 h-3.5 text-indigo-600" />
                      Quick Reply via Portal SMTP
                    </span>
                    <span className="text-[10px] text-slate-400">Sending as {smtpUser || 'bhavin@voogyo.com'}</span>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Write a quick follow-up or reply..."
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 resize-none"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600 text-xs flex items-center gap-1"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Attach file</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toast.error('Not available yet: this screen is not connected to the server, so nothing was sent.')}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Send Reply</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty Preview State (Matching Screenshot) */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3.5 shadow-2xs">
                  <Mail className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Select an email to view</h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Choose any email from the list on the left to read, reply via portal SMTP, or view linked CRM lead details.
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TEMPLATES.map((tmpl) => (
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
                    <p className="text-slate-500 line-clamp-2">{tmpl.bodyPreview}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Dynamic Tokens Supported</span>
                  </div>

                  <button
                    onClick={() => {
                      setNewCampSubject(tmpl.subject);
                      setNewCampName(`${tmpl.title} Campaign`);
                      setIsCreateCampaignOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors"
                  >
                    Use in Campaign
                  </button>
                </div>
              </div>
            ))}
          </div>
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
          MODAL: COMPOSE EMAIL (DIRECT PORTAL SMTP DISPATCH)
      ───────────────────────────────────────────────────────────── */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/10 flex items-center justify-center text-indigo-600">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Compose New Outbound Email</h3>
              </div>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendCompose} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">From (Outbound Sender)</label>
                <select
                  value={composeSender}
                  onChange={(e) => setComposeSender(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  <option value="Bhavin Pathak <bhavin@voogyo.com>">Bhavin Pathak (bhavin@voogyo.com)</option>
                  <option value="Sales Team <sales@voogyo.com>">Sales Team (sales@voogyo.com)</option>
                  <option value="Outbound Cadence <cadence@voogyo.com>">Outbound Cadence (cadence@voogyo.com)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">To (Recipient Email)</label>
                <input
                  type="email"
                  required
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="e.g. client@acmecorp.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
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
                    const tmpl = TEMPLATES.find((t) => t.id === e.target.value);
                    if (tmpl) {
                      setComposeSubject(tmpl.subject);
                      setComposeBody(tmpl.fullBody);
                    }
                  }}
                  className="text-[11px] text-indigo-600 bg-indigo-50/70 border border-indigo-200 rounded-md px-2 py-0.5 focus:outline-none"
                >
                  <option value="">Insert Template...</option>
                  {TEMPLATES.map((t) => (
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

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-[11px] text-slate-400">
                  <span>Delivered via Portal SMTP engine</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsComposeOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send via SMTP</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: SMTP SETTINGS CONFIGURATION
      ───────────────────────────────────────────────────────────── */}
      {isSmtpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Tenant SMTP Outbound Settings</h3>
              </div>
              <button
                onClick={() => setIsSmtpModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSmtp} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">SMTP Server Host</label>
                <input
                  type="text"
                  required
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">SMTP Port</label>
                  <input
                    type="text"
                    required
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Security / Encryption</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                    <option>STARTTLS (Recommended)</option>
                    <option>SSL / TLS</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Username / Sender Email</label>
                <input
                  type="email"
                  required
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="e.g. outreach@voogyo.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">App Password / Auth Token</label>
                <input
                  type="password"
                  required
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">For Gmail or Google Workspace, generate an App Password in your Google Account security settings.</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => toast.error('Test the mail server in Organization & Settings → Email. Nothing was tested here.')}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Test Connection
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSmtpModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors shadow-xs"
                  >
                    Save &amp; Connect
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
                {previewTemplate.fullBody}
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
                  setNewCampSubject(previewTemplate.subject);
                  setNewCampName(`${previewTemplate.title} Campaign`);
                  setPreviewTemplate(null);
                  setIsCreateCampaignOpen(true);
                }}
                className="px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-bold transition-colors text-xs"
              >
                Use this Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
