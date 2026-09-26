'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, Clock, Send, CheckCircle2, AlertCircle, Calendar,
  ArrowRight, ExternalLink, Copy, Check, PhoneCall, MessageSquare,
  Mail, Users, Filter, Search, RefreshCw, Play, Pause, Building2,
  Tag, ChevronRight, X, UserCheck, Flame, Phone, Globe, HelpCircle, MapPin,
  TrendingUp, Layers, CheckSquare, ShieldCheck, Kanban, List, Trophy,
  DollarSign, Target, CheckCheck, Briefcase, Settings2, Download, Upload, MoreVertical, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  CADENCE_STEPS_MASTER, 
  CADENCE_REPLY_BRANCHES, 
  CADENCE_INDUSTRIES,
  CadenceStep,
  ReplyBranch,
  generateWhatsAppUrl,
  generateMailtoUrl,
  interpolateText
} from '@/lib/coldMarketingCadence';
import { 
  getSubIndustries, 
  getIndustryLabel, 
  getSubIndustryLabel, 
  useTenantIndustries 
} from '@/lib/industryTaxonomy';
import { ColdLeadImportModal } from './ColdLeadImportModal';

import { apiFetch } from '../../api/client';
import { toast } from '../../lib/toast';
import { coldFunnelDestination } from './pipelineBoard';
import { ConvertDestination } from './ConvertDestination';
interface SLeadCadenceCenterProps {
  onSelectLead360: (leadId: string) => void;
  onRefreshParent?: () => void;
  pipelines?: any[];
  stages?: any[];
  onNavigateToPipeline?: () => void;
  tenantName?: string;
  /** Receives the server's answer after a lead is converted into an opportunity. */
  onLeadConverted?: (result: any) => void;
}

export default function SLeadCadenceCenter({
  onSelectLead360,
  onRefreshParent,
  pipelines = [],
  stages = [],
  onNavigateToPipeline,
  tenantName = 'Voogyo',
  onLeadConverted
}: SLeadCadenceCenterProps) {
  const [loading, setLoading] = useState(true);
  const [radarData, setRadarData] = useState<any>(null);
  const activeTenantName = tenantName || radarData?.tenantName || 'Voogyo';
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('ALL');
  const [selectedSubIndustry, setSelectedSubIndustry] = useState('ALL');
  const [selectedQueueTab, setSelectedQueueTab] = useState<'ACTION_RADAR' | 'ALL_ACTIVE' | 'BRANCHED' | 'COMPLETED' | 'CONVERTED'>('ACTION_RADAR');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'WHATSAPP' | 'EMAIL' | 'LINKEDIN' | 'PHONE'>('ALL');
  const [sendingWhatsAppApi, setSendingWhatsAppApi] = useState(false);

  // Execution Modal State
  const [selectedLeadForAction, setSelectedLeadForAction] = useState<any | null>(null);
  const { industries: tenantIndustries, getSubIndustries: getTenantSubIndustries } = useTenantIndustries();
  const [activeIndustryKey, setActiveIndustryKey] = useState<string>('general');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [executionNotes, setExecutionNotes] = useState('');
  const [executing, setExecuting] = useState(false);

  // Convert to Opportunity Modal State
  const [selectedLeadForConvert, setSelectedLeadForConvert] = useState<any | null>(null);
  const [dealValue, setDealValue] = useState<string | number>('');
  const [leadTemperature, setLeadTemperature] = useState<'WARM' | 'HOT'>('HOT');
  const [conversionNotes, setConversionNotes] = useState<string>('');
  const [convertingOpp, setConvertingOpp] = useState<boolean>(false);
  // Set synchronously, so a second click before the next render cannot send a second request.
  const convertInFlight = useRef(false);

  // Layer 3 Reply Branch State
  const [selectedBranchKey, setSelectedBranchKey] = useState<string>('');
  const [branchFeedback, setBranchFeedback] = useState<string>('');
  const [branching, setBranching] = useState(false);

  // Phone logger state
  const [phoneDisposition, setPhoneDisposition] = useState<'ANSWERED' | 'MISSED' | 'NONE'>('NONE');

  const [seeding, setSeeding] = useState(false);
  const [sendingSmtp, setSendingSmtp] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Dynamic masters with fallback to static constants
  const currentMasterSteps = useMemo(() => {
    return (radarData?.masterSteps && radarData.masterSteps.length > 0) 
      ? radarData.masterSteps 
      : CADENCE_STEPS_MASTER;
  }, [radarData]);

  const currentIndustries = useMemo(() => {
    if (tenantIndustries && tenantIndustries.length > 0) {
      const map: Record<string, { id?: string; name: string; key: string }> = {};
      tenantIndustries.forEach(ind => {
        map[ind.key] = { id: ind.id, name: ind.name, key: ind.key };
      });
      return map;
    }
    return (radarData?.industries && Object.keys(radarData.industries).length > 0)
      ? radarData.industries
      : CADENCE_INDUSTRIES;
  }, [tenantIndustries, radarData]);

  const currentReplyBranches = useMemo(() => {
    return (radarData?.replyBranches && Object.keys(radarData.replyBranches).length > 0)
      ? radarData.replyBranches
      : CADENCE_REPLY_BRANCHES;
  }, [radarData]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'error' ? toast.error(text) : toast.success(text);

  const handleReSeedDemoLeads = async () => {
    setSeeding(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence/seed', { method: 'POST', feedback: { success: false } });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(json.message || 'Seeded 12 cold marketing leads across all funnel steps!', 'success');
        await fetchCadenceData();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setSeeding(false);
    }
  };

  const getInterpolationVars = (lead?: any) => {
    const target = lead || selectedLeadForAction;
    if (!target) return {};
    return {
      firstName: target.first_name,
      lastName: target.last_name,
      companyName: target.company_name,
      designation: target.designation,
      industry: activeIndustryKey || target.cadence?.industry || 'general',
      assigneeName: target.assigned_user_name || ''
    };
  };

  const handleSendViaPortalSmtp = async () => {
    if (!selectedLeadForAction || !selectedLeadForAction.email) {
      showToast('Lead email address missing', 'error');
      return;
    }
    const subject = interpolateText(selectedLeadForAction.currentStep.templates.email.subject, getInterpolationVars());
    const text = interpolateText(selectedLeadForAction.currentStep.templates.email.body, getInterpolationVars());

    setSendingSmtp(true);
    try {
      const res = await apiFetch('/api/v1/tenant/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedLeadForAction.email,
          recipientName: `${selectedLeadForAction.first_name} ${selectedLeadForAction.last_name || ''}`.trim(),
          subject,
          text,
          leadId: selectedLeadForAction.id,
          cadenceStepIndex: selectedLeadForAction.currentStep.stepIndex,
          advanceCadence: false
        })
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.data?.message || 'Email sent via portal SMTP!', 'success');
        if (!executionNotes) {
          setExecutionNotes(`Email dispatched via Portal SMTP to ${selectedLeadForAction.email}`);
        }
      } else {
        showToast(json.message || json.error || 'Failed to send email via SMTP', 'error');
      }
    } catch (err: any) {
      showToast('Error communicating with SMTP service', 'error');
    } finally {
      setSendingSmtp(false);
    }
  };

  const handleSendViaWhatsAppApi = async () => {
    const recipientPhone = selectedLeadForAction?.whatsapp_number || selectedLeadForAction?.phone;
    if (!recipientPhone) {
      showToast('Lead phone / WhatsApp number missing', 'error');
      return;
    }
    const message = interpolateText(
      selectedLeadForAction.currentStep.templates?.whatsapp?.message || '', 
      getInterpolationVars()
    );

    if (!message) {
      showToast('WhatsApp template message is empty', 'error');
      return;
    }

    setSendingWhatsAppApi(true);
    try {
      const res = await apiFetch('/api/v1/tenant/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone,
          message,
          leadId: selectedLeadForAction.id
        })
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.data?.message || 'Message dispatched via WhatsApp Cloud API!', 'success');
        if (!executionNotes) {
          setExecutionNotes(`WhatsApp message dispatched via WhatsApp Cloud API to ${recipientPhone}`);
        }
      } else {
        showToast(json.message || json.error || 'Failed to send WhatsApp message via API', 'error');
      }
    } catch (err: any) {
      showToast('Error communicating with WhatsApp API service', 'error');
    } finally {
      setSendingWhatsAppApi(false);
    }
  };

  const fetchCadenceData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence');
      const json = await res.json();
      if (res.ok && json.success) {
        setRadarData(json.data);
      }
    } catch {
      // Reported by the API client.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCadenceData();
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    showToast('Copied to clipboard!', 'success');
  };

  // Open Action Modal for a lead
  const handleOpenActionModal = (leadItem: any) => {
    setSelectedLeadForAction(leadItem);
    setActiveIndustryKey(leadItem.cadence?.industry || 'general');
    setSelectedBranchKey('');
    setBranchFeedback('');
    setPhoneDisposition('NONE');
    setExecutionNotes('');
  };

  // Complete current step
  const handleCompleteStep = async () => {
    if (!selectedLeadForAction) return;
    setExecuting(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        feedback: { success: false },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPLETE_STEP',
          leadId: selectedLeadForAction.id,
          stepIndex: selectedLeadForAction.currentStep.stepIndex,
          channelsUsed: selectedLeadForAction.currentStep.channels,
          notes: executionNotes
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(`Day ${selectedLeadForAction.currentStep.dayNumber} touchpoint marked complete! Next step scheduled.`, 'success');
        setSelectedLeadForAction(null);
        fetchCadenceData();
        if (onRefreshParent) onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setExecuting(false);
    }
  };

  // Apply Layer 3 Reply Branching
  const handleApplyBranch = async () => {
    if (!selectedLeadForAction || !selectedBranchKey) return;
    setBranching(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        feedback: { success: false },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'BRANCH_REPLY',
          leadId: selectedLeadForAction.id,
          branchKey: selectedBranchKey,
          feedbackNotes: branchFeedback
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(json.message || 'Reply branch applied successfully!', 'success');
        setSelectedLeadForAction(null);
        fetchCadenceData();
        if (onRefreshParent) onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setBranching(false);
    }
  };

  // Open Convert to Opportunity Modal
  const handleOpenConvertModal = (leadItem: any) => {
    setSelectedLeadForConvert(leadItem);
    // The lead's own budget if it has one; never an invented figure.
    setDealValue(Number(leadItem.budget_amount) > 0 ? Number(leadItem.budget_amount) : '');
    setLeadTemperature('HOT');
    setConversionNotes(`Prospect expressed strong interest in ${activeTenantName} services during Client Outreach Day ${leadItem.currentStep?.dayNumber || 1} outreach.`);
  };

  // Execute conversion to Opportunity
  // Converted leads go to the Cold Funnel's first open stage; the server decides and checks this too.
  const convertDestination = coldFunnelDestination(pipelines, stages);

  const handleExecuteConvertOpportunity = async () => {
    if (!selectedLeadForConvert || convertInFlight.current || !convertDestination) return;
    convertInFlight.current = true;
    setConvertingOpp(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        feedback: { success: false },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONVERT_OPPORTUNITY',
          leadId: selectedLeadForConvert.id,
          ...(dealValue !== '' ? { budgetAmount: Number(dealValue) } : {}),
          temperature: leadTemperature,
          notes: conversionNotes
        })
      });
      const json = await res.json();
      // Success only once the server confirms the lead was moved; a refusal is shown by the API client and the dialog stays open.
      if (res.ok && json.success && json.data?.lead) {
        if (onLeadConverted) onLeadConverted(json.data);
        else showToast(json.message, 'success');
        setSelectedLeadForConvert(null);
        await fetchCadenceData();
        if (onRefreshParent) onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      convertInFlight.current = false;
      setConvertingOpp(false);
    }
  };

  // Unfiltered list of all enrolled leads across all radar categories (for global counts)
  const rawAllEnrolledLeads = useMemo(() => {
    if (!radarData?.radar) return [];
    const map = new Map<string, any>();
    const allLists = [
      ...(radarData.radar.allActive || []),
      ...(radarData.radar.overdue || []),
      ...(radarData.radar.dueToday || []),
      ...(radarData.radar.upcoming || []),
      ...(radarData.radar.branched || []),
      ...(radarData.radar.completed || []),
      ...(radarData.radar.converted || [])
    ];
    for (const item of allLists) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }, [radarData]);

  // Available sub-industries for currently selected industry
  const availableSubIndustries = useMemo(() => {
    if (selectedIndustry === 'ALL') return [];
    return getTenantSubIndustries(selectedIndustry);
  }, [selectedIndustry, getTenantSubIndustries]);

  // Filtered list of enrolled leads across all radar categories (for Kanban)
  const allEnrolledLeads = useMemo(() => {
    return rawAllEnrolledLeads.filter((item: any) => {
      // Search
      const searchStr = `${item.company_name} ${item.first_name} ${item.last_name} ${item.email} ${item.phone} ${item.lead_code}`.toLowerCase();
      if (searchQuery && !searchStr.includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Industry
      const itemInd = (item.industry || item.cadence?.industry || 'general').toLowerCase().trim();
      if (selectedIndustry !== 'ALL') {
        const selLower = selectedIndustry.toLowerCase().trim();
        const selNorm = selLower.replace(/[^a-z0-9]+/g, '_');
        const itemNorm = itemInd.replace(/[^a-z0-9]+/g, '_');
        if (itemInd !== selLower && itemNorm !== selNorm && itemNorm !== selLower) {
          return false;
        }
      }
      // Sub-Industry
      if (selectedSubIndustry !== 'ALL') {
        const itemSub = (item.sub_industry || item.subIndustry || '').toLowerCase().trim();
        const subLower = selectedSubIndustry.toLowerCase().trim();
        const itemSubNorm = itemSub.replace(/[^a-z0-9]+/g, '_');
        const subNorm = subLower.replace(/[^a-z0-9]+/g, '_');
        if (itemSub !== subLower && itemSubNorm !== subNorm && itemSubNorm !== subLower) {
          return false;
        }
      }
      // Channel
      if (channelFilter !== 'ALL') {
        const stepChannels = item.currentStep?.channels || [];
        if (!stepChannels.includes(channelFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [rawAllEnrolledLeads, searchQuery, selectedIndustry, selectedSubIndustry, channelFilter]);

  const handleExportLeads = async () => {
    try {
      setIsExporting(true);
      const res = await apiFetch('/api/v1/crm/leads/export', { cache: 'no-store' });
      if (!res.ok) return; // Reported by the API client.
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Voogyo_CRM_Leads_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Exported complete CRM leads to Excel successfully!', 'success');
    } catch {
      // Reported by the API client.
    } finally {
      setIsExporting(false);
    }
  };

  // Filter queue based on tab, search, industry, sub-industry, and channel (for List view)
  const displayedLeads = useMemo(() => {
    if (!radarData) return [];
    let list: any[] = [];

    if (selectedQueueTab === 'ACTION_RADAR') {
      // Combines overdue and due today
      list = [...(radarData.radar.overdue || []), ...(radarData.radar.dueToday || [])];
    } else if (selectedQueueTab === 'ALL_ACTIVE') {
      list = radarData.radar.allActive || [];
    } else if (selectedQueueTab === 'BRANCHED') {
      list = radarData.radar.branched || [];
    } else if (selectedQueueTab === 'COMPLETED') {
      list = radarData.radar.completed || [];
    } else if (selectedQueueTab === 'CONVERTED') {
      list = radarData.radar.converted || [];
    }

    return list.filter((item: any) => {
      // Search
      const searchStr = `${item.company_name} ${item.first_name} ${item.last_name} ${item.email} ${item.phone} ${item.lead_code}`.toLowerCase();
      if (searchQuery && !searchStr.includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Industry
      const itemInd = item.industry || item.cadence?.industry || 'general';
      if (selectedIndustry !== 'ALL' && itemInd !== selectedIndustry) {
        return false;
      }
      // Sub-Industry
      if (selectedSubIndustry !== 'ALL') {
        const itemSub = item.sub_industry || item.subIndustry || '';
        if (itemSub !== selectedSubIndustry) {
          return false;
        }
      }
      // Channel
      if (channelFilter !== 'ALL') {
        const stepChannels = item.currentStep?.channels || [];
        if (!stepChannels.includes(channelFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [radarData, selectedQueueTab, searchQuery, selectedIndustry, selectedSubIndustry, channelFilter]);

  const stats = radarData?.stats || {
    totalEnrolled: 0,
    activeCount: 0,
    dueTodayCount: 0,
    overdueCount: 0,
    completedCount: 0,
    branchedCount: 0,
    convertedCount: 0,
    platformCounts: { WHATSAPP: 0, EMAIL: 0, LINKEDIN: 0, PHONE: 0 }
  };

  const KANBAN_COLUMNS = [
    {
      id: 'day-1',
      title: 'Day 1: Triple Launch',
      dayNumber: 1,
      goal: 'Professional Introduction',
      channels: ['LINKEDIN', 'EMAIL', 'WHATSAPP'],
      accentColor: 'border-blue-500',
      badgeBg: 'bg-blue-100 text-blue-800'
    },
    {
      id: 'day-5',
      title: 'Day 5: Portfolio & Trust',
      dayNumber: 5,
      goal: 'Establish Credibility',
      channels: ['WHATSAPP', 'EMAIL'],
      accentColor: 'border-emerald-500',
      badgeBg: 'bg-emerald-100 text-emerald-800'
    },
    {
      id: 'day-10',
      title: 'Day 10: Value & Tip',
      dayNumber: 10,
      goal: 'Free Industry Insight',
      channels: ['EMAIL', 'LINKEDIN'],
      accentColor: 'border-indigo-500',
      badgeBg: 'bg-indigo-100 text-indigo-800'
    },
    {
      id: 'day-15',
      title: 'Day 15: Free Audit',
      dayNumber: 15,
      goal: 'High-Value Offer',
      channels: ['WHATSAPP', 'EMAIL'],
      accentColor: 'border-violet-500',
      badgeBg: 'bg-violet-100 text-violet-800'
    },
    {
      id: 'day-20',
      title: 'Day 20: Case Study',
      dayNumber: 20,
      goal: 'Concrete Client Proof',
      channels: ['EMAIL', 'LINKEDIN'],
      accentColor: 'border-cyan-500',
      badgeBg: 'bg-cyan-100 text-cyan-800'
    },
    {
      id: 'day-25',
      title: 'Day 25: Discovery Call',
      dayNumber: 25,
      goal: 'Direct Strategy Call',
      channels: ['WHATSAPP', 'PHONE'],
      accentColor: 'border-amber-500',
      badgeBg: 'bg-amber-100 text-amber-800'
    },
    {
      id: 'day-30',
      title: 'Day 30: Respectful Exit',
      dayNumber: 30,
      goal: 'Psychological Reversal',
      channels: ['EMAIL', 'LINKEDIN'],
      accentColor: 'border-slate-500',
      badgeBg: 'bg-slate-100 text-slate-800'
    },
    {
      id: 'branched',
      title: 'Branched / Responded',
      isBranched: true,
      goal: 'Objection & Warm Interest',
      channels: ['WHATSAPP', 'EMAIL', 'PHONE'],
      accentColor: 'border-orange-500',
      badgeBg: 'bg-orange-100 text-orange-800'
    },
    {
      id: 'converted',
      title: 'Converted to Opportunity',
      isConverted: true,
      goal: 'Active in Sales Pipeline',
      channels: ['LINKEDIN', 'EMAIL', 'WHATSAPP', 'PHONE'],
      accentColor: 'border-emerald-600',
      badgeBg: 'bg-emerald-200 text-emerald-950 font-black'
    }
  ];

  const getLeadsForColumn = (col: typeof KANBAN_COLUMNS[0]) => {
    if (col.isConverted) {
      return allEnrolledLeads.filter(l => l.cadence?.status === 'CONVERTED' || l.cadence?.convertedToOpportunity);
    }
    if (col.isBranched) {
      return allEnrolledLeads.filter(l => l.cadence?.status === 'BRANCHED');
    }
    return allEnrolledLeads.filter(l => 
      l.cadence?.status === 'ACTIVE' && 
      !l.cadence?.convertedToOpportunity &&
      l.currentStep?.dayNumber === col.dayNumber
    );
  };

  return (
    <div className="space-y-6">
      {/* Minimalist Top Header: Outreach Funnel Command Center */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-600" />
                {activeTenantName} Outbound
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                30-Day Multi-Touch SOP
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                8 Touchpoints
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Cold Outreach Command Center
            </h1>
            <p className="text-slate-500 text-xs mt-0.5 max-w-2xl">
              Systematic cadence across LinkedIn, Email, WhatsApp & Phone. Builds familiarity to book high-intent client calls.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* View Mode Toggle: Kanban vs Radar List */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'kanban'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Kanban className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kanban</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5 text-indigo-600" />
                <span>Radar List</span>
              </button>
            </div>

            {/* Import Leads Button */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Leads</span>
            </button>

            {/* Export Leads Button */}
            <button
              onClick={handleExportLeads}
              disabled={isExporting}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="Export all cadence leads to Excel spreadsheet (.xlsx)"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{isExporting ? 'Exporting...' : 'Export Leads'}</span>
            </button>


            {/* Seed Demo Leads: only where the server allows it (a demo or sandbox deployment) */}
            {radarData?.demoSeedAllowed === true && (
              <button
                onClick={handleReSeedDemoLeads}
                disabled={seeding}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Seed 12 realistic cold leads across all steps"
              >
                <Sparkles className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
                <span>{seeding ? 'Seeding...' : '⚡ Seed Demo'}</span>
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={fetchCadenceData}
              disabled={loading}
              className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl border border-slate-200 transition-all cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 4 High-Clarity Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div 
          onClick={() => { setViewMode('list'); setSelectedQueueTab('ALL_ACTIVE'); }}
          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-indigo-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>In Active Cadence</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.activeCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{stats.totalEnrolled} total enrolled in 30D SOP</div>
        </div>

        <div 
          onClick={() => { setViewMode('list'); setSelectedQueueTab('ACTION_RADAR'); }}
          className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-xs hover:border-amber-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-amber-700 font-semibold">
            <span>Due Today</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">{stats.dueTodayCount}</div>
          <div className="text-[11px] text-amber-600/80 mt-0.5">Execution required today</div>
        </div>

        <div 
          onClick={() => { setViewMode('list'); setSelectedQueueTab('ACTION_RADAR'); }}
          className="bg-white rounded-2xl p-4 border border-rose-200/80 shadow-xs hover:border-rose-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-rose-700 font-semibold">
            <span>Overdue SLA</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-900 mt-1">{stats.overdueCount}</div>
          <div className="text-[11px] text-rose-600/80 mt-0.5">Delayed touchpoints</div>
        </div>

        <div 
          onClick={() => { setViewMode('list'); setSelectedQueueTab('CONVERTED'); }}
          className="bg-white rounded-2xl p-4 border border-emerald-200/80 shadow-xs hover:border-emerald-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-emerald-700 font-semibold">
            <span>Converted to Deals</span>
            <Trophy className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1">{stats.convertedCount}</div>
          <div className="text-[11px] text-emerald-600/80 mt-0.5">Transferred to Pipeline</div>
        </div>
      </div>

      {/* Main Radar Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Global Search & Industry Filter Bar (Applies to both Kanban & List) */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search company, contact person, phone, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Industry Layer:</span>
              <select
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="ALL">All Industries</option>
                {tenantIndustries.map((ind) => (
                  <option key={ind.key} value={ind.key}>{ind.name}</option>
                ))}
              </select>
            </div>

            {/* Channel Filters */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400 mr-1 font-medium">Channel:</span>
              {(['ALL', 'WHATSAPP', 'EMAIL', 'LINKEDIN', 'PHONE'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={`px-2 py-1 rounded-lg font-medium transition-all ${
                    channelFilter === ch
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {ch === 'ALL' ? 'All' : ch === 'WHATSAPP' ? 'WA' : ch === 'EMAIL' ? 'EM' : ch === 'LINKEDIN' ? 'LI' : 'PH'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Industry Segregation Quick Bar */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-200/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 mr-1">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Industry Sector:</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedIndustry('ALL');
              setSelectedSubIndustry('ALL');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              selectedIndustry === 'ALL'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>All Industries</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${selectedIndustry === 'ALL' ? 'bg-indigo-800 text-indigo-100' : 'bg-white text-slate-600'}`}>
              {rawAllEnrolledLeads.length}
            </span>
          </button>
          {tenantIndustries.map((ind) => {
            const indKeyLower = ind.key.toLowerCase().trim();
            const indNameLower = ind.name.toLowerCase().trim();
            const count = rawAllEnrolledLeads.filter((l: any) => {
              const itemInd = (l.industry || l.cadence?.industry || 'general').toLowerCase().trim();
              const itemNorm = itemInd.replace(/[^a-z0-9]+/g, '_');
              return itemInd === indKeyLower || itemInd === indNameLower || itemNorm === ind.key;
            }).length;
            return (
              <button
                key={ind.key}
                type="button"
                onClick={() => {
                  setSelectedIndustry(ind.key);
                  setSelectedSubIndustry('ALL');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  selectedIndustry === ind.key
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{ind.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedIndustry === ind.key 
                    ? 'bg-indigo-800 text-indigo-100' 
                    : count > 0 
                      ? 'bg-indigo-100 text-indigo-700 font-extrabold' 
                      : 'bg-white text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Secondary Sub-Industry Filter Bar (Cascades from Selected Industry) */}
        {selectedIndustry !== 'ALL' && availableSubIndustries.length > 0 && (
          <div className="px-4 py-2 bg-indigo-50/50 border-b border-indigo-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar animate-in fade-in duration-150">
            <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider whitespace-nowrap flex items-center gap-1 mr-1">
              <span>Sub-Industry:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedSubIndustry('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedSubIndustry === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-700 hover:bg-indigo-100 border border-indigo-200'
              }`}
            >
              <span>All Sub-Industries</span>
            </button>
            {availableSubIndustries.map((sub) => {
              const subKeyLower = sub.key.toLowerCase().trim();
              const subNameLower = sub.name.toLowerCase().trim();
              const count = rawAllEnrolledLeads.filter((l: any) => {
                const itemInd = (l.industry || l.cadence?.industry || 'general').toLowerCase().trim();
                const selLower = selectedIndustry.toLowerCase().trim();
                const selNorm = selLower.replace(/[^a-z0-9]+/g, '_');
                const itemNorm = itemInd.replace(/[^a-z0-9]+/g, '_');
                if (itemInd !== selLower && itemNorm !== selNorm && itemNorm !== selLower) return false;
                
                const itemSub = (l.sub_industry || l.subIndustry || '').toLowerCase().trim();
                const itemSubNorm = itemSub.replace(/[^a-z0-9]+/g, '_');
                return itemSub === subKeyLower || itemSub === subNameLower || itemSubNorm === sub.key;
              }).length;
              return (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => setSelectedSubIndustry(sub.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    selectedSubIndustry === sub.key
                      ? 'bg-indigo-600 text-white shadow-xs font-bold'
                      : 'bg-white text-slate-700 hover:bg-indigo-100 border border-indigo-200'
                  }`}
                >
                  <span>{sub.name}</span>
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedSubIndustry === sub.key ? 'bg-indigo-800 text-indigo-100' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: INTERACTIVE 30-DAY MULTI-COLUMN FUNNEL KANBAN         */}
        {/* ------------------------------------------------------------- */}
        {viewMode === 'kanban' ? (
          <div className="p-4 bg-slate-50/40">
            {loading ? (
              <div className="p-16 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-500" />
                <p className="text-xs font-semibold">Loading 30-Day Outbound Funnel Board...</p>
              </div>
            ) : allEnrolledLeads.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-indigo-600">
                  <Sparkles className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No Prospects Enrolled in Funnel</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {radarData?.demoSeedAllowed === true
                    ? 'Click "⚡ Seed Demo" in the header above to load sample prospects across all 8 touchpoint milestones.'
                    : 'Add a lead as Cold, enrol leads from the list, or import them to start the 30-day outreach cadence.'}
                </p>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 items-start scrollbar-thin">
                {KANBAN_COLUMNS.map((col) => {
                  const colLeads = getLeadsForColumn(col);
                  return (
                    <div 
                      key={col.id} 
                      className="w-80 flex-shrink-0 bg-slate-100/70 dark:bg-[#151421] border border-slate-200/90 dark:border-[#262438] rounded-2xl flex flex-col shadow-2xs max-h-[780px]"
                    >
                      {/* Column Header */}
                      <div className={`p-3.5 border-t-4 ${col.accentColor} rounded-t-2xl border-b border-slate-200 dark:border-[#262438] bg-white dark:bg-[#1a1928]`}>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-black text-slate-900 dark:text-white truncate tracking-tight">
                            {col.title}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${col.badgeBg}`}>
                            {colLeads.length}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate font-medium">
                          {col.goal}
                        </div>
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {col.channels.map((ch) => (
                            <span 
                              key={ch} 
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                ch === 'LINKEDIN' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300' :
                                ch === 'EMAIL' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300' :
                                ch === 'WHATSAPP' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' :
                                'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {ch === 'LINKEDIN' ? 'LI' : ch === 'EMAIL' ? 'EM' : ch === 'WHATSAPP' ? 'WA' : 'PH'}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Column Cards Container */}
                      <div className="p-2.5 overflow-y-auto space-y-2.5 flex-1 min-h-[140px]">
                        {colLeads.length === 0 ? (
                          <div className="p-6 text-center border border-dashed border-slate-200 dark:border-[#2e2c43] rounded-xl">
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">No leads at this milestone</p>
                          </div>
                        ) : (
                          colLeads.map((item: any) => {
                            const currentStep = item.currentStep;
                            const dueStatus = currentStep?.dueStatus;
                            const isOverdue = dueStatus === 'OVERDUE';
                            const isDueToday = dueStatus === 'DUE_TODAY';
                            const isConverted = item.cadence?.status === 'CONVERTED' || item.cadence?.convertedToOpportunity;
                            const isBranched = item.cadence?.status === 'BRANCHED';

                            return (
                              <div
                                key={item.id}
                                className="bg-white dark:bg-[#1c1b29] border border-slate-200 dark:border-[#2e2c43] hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl p-3 shadow-xs hover:shadow-md transition-all space-y-2.5 group"
                              >
                                {/* Card Header */}
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <div 
                                      onClick={() => onSelectLead360(item.id)}
                                      className="font-bold text-slate-900 dark:text-white text-xs truncate flex items-center gap-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" 
                                      title={item.company_name}
                                    >
                                      <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="truncate">{item.company_name}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                                      {item.first_name} {item.last_name}
                                      {item.designation ? ` • ${item.designation}` : ''}
                                    </div>
                                    {item.website_url && (
                                      <div className="text-[10px] text-indigo-600 dark:text-indigo-400 truncate flex items-center gap-1 mt-0.5">
                                        <Globe className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                        <span className="truncate">{item.website_url.replace(/^https?:\/\//, '')}</span>
                                      </div>
                                    )}
                                    {item.city && item.state && (
                                      <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-1">
                                        <MapPin className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                        <span>{item.city}, {item.state}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-[#252336] text-slate-700 dark:text-slate-300 rounded border border-slate-200/80 dark:border-[#383550]">
                                      {getIndustryLabel(item.industry || item.cadence?.industry)}
                                    </span>
                                    {(item.sub_industry || item.subIndustry) && (
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800/60">
                                        {getSubIndustryLabel(item.industry || item.cadence?.industry, item.sub_industry || item.subIndustry)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Status / Due Badge */}
                                <div>
                                  {isConverted ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                      <Trophy className="w-3 h-3 text-emerald-600" />
                                      <span>Opportunity Won • Sales Pipeline</span>
                                    </span>
                                  ) : isBranched ? (
                                    <div className="text-[10px] font-medium bg-amber-50 dark:bg-[#252119] text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/60 p-1.5 rounded-lg line-clamp-2">
                                      <span className="font-bold text-amber-700 dark:text-amber-400">⚡ Replied: </span>
                                      {item.cadence.branchReply?.leadFeedback || 'Response received'}
                                    </div>
                                  ) : isOverdue ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 animate-pulse">
                                      <AlertCircle className="w-3 h-3 text-rose-600" />
                                      <span>⚠️ Past Due Date</span>
                                    </span>
                                  ) : isDueToday ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                      <Flame className="w-3 h-3 text-amber-600" />
                                      <span>🔥 Outreach Due Today</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      <span>Upcoming Touchpoint</span>
                                    </span>
                                  )}
                                </div>

                                {/* Contact Links & Deal Value */}
                                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-[#2e2c43]">
                                  <div className="flex items-center gap-1.5">
                                    {item.whatsapp_number || item.phone ? (
                                      <a
                                        href={generateWhatsAppUrl(item.whatsapp_number || item.phone, '')}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition-colors"
                                        title="WhatsApp"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                      </a>
                                    ) : null}
                                    {item.email ? (
                                      <a
                                        href={`mailto:${item.email}`}
                                        className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors"
                                        title="Email"
                                      >
                                        <Mail className="w-3.5 h-3.5" />
                                      </a>
                                    ) : null}
                                    {item.phone ? (
                                      <a
                                        href={`tel:${item.phone}`}
                                        className="p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                        title="Call"
                                      >
                                        <Phone className="w-3.5 h-3.5" />
                                      </a>
                                    ) : null}
                                  </div>

                                  {item.budget_amount ? (
                                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 font-mono">
                                      ₹{Number(item.budget_amount).toLocaleString('en-IN')}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 dark:text-slate-600 italic">No budget</span>
                                  )}
                                </div>

                                {/* Card Action Buttons */}
                                <div className="grid grid-cols-2 gap-1.5 pt-1">
                                  {!isConverted ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenActionModal(item)}
                                        className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 shadow-xs transition-colors"
                                        title="Execute Multi-Channel Step"
                                      >
                                        <Send className="w-3 h-3" />
                                        <span>Execute</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleOpenConvertModal(item)}
                                        className="px-2 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 shadow-xs transition-colors"
                                        title="Convert to Sales Opportunity"
                                      >
                                        <Sparkles className="w-3 h-3 text-amber-300" />
                                        <span>Convert Opp</span>
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => onNavigateToPipeline && onNavigateToPipeline()}
                                      className="col-span-2 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 shadow-xs transition-colors"
                                    >
                                      <Trophy className="w-3 h-3 text-amber-300" />
                                      <span>View in Sales Pipeline</span>
                                    </button>
                                  )}
                                </div>

                                {/* Bottom full 360 link */}
                                <button
                                  type="button"
                                  onClick={() => onSelectLead360(item.id)}
                                  className="w-full py-1 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 rounded transition-colors"
                                >
                                  View 360° Lead Dossier →
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ------------------------------------------------------------- */
          /* VIEW 2: BDE ACTION RADAR & CATEGORIZED LIST VIEW              */
          /* ------------------------------------------------------------- */
          <div>
            {/* Sub-Queue Tabs */}
            <div className="p-3 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto bg-slate-50/60 text-xs font-semibold">
              <button
                onClick={() => setSelectedQueueTab('ACTION_RADAR')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  selectedQueueTab === 'ACTION_RADAR'
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Due & Overdue ({stats.overdueCount + stats.dueTodayCount})</span>
              </button>

              <button
                onClick={() => setSelectedQueueTab('ALL_ACTIVE')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  selectedQueueTab === 'ALL_ACTIVE'
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All Active ({stats.activeCount})</span>
              </button>

              <button
                onClick={() => setSelectedQueueTab('BRANCHED')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  selectedQueueTab === 'BRANCHED'
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Replied & Branched ({stats.branchedCount})</span>
              </button>

              <button
                onClick={() => setSelectedQueueTab('CONVERTED')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  selectedQueueTab === 'CONVERTED'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 text-amber-300" />
                <span>Converted to Deals ({stats.convertedCount})</span>
              </button>

              <button
                onClick={() => setSelectedQueueTab('COMPLETED')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  selectedQueueTab === 'COMPLETED'
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Completed ({stats.completedCount})</span>
              </button>
            </div>

            {/* Lead Table / List */}
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                <p className="text-xs font-medium">Calculating cadence due dates & templates...</p>
              </div>
            ) : displayedLeads.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No leads in this view</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No prospects matching the selected tab and filter criteria.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {displayedLeads.map((item: any) => {
                  const currentStep = item.currentStep;
                  const dueStatus = currentStep?.dueStatus;
                  const isOverdue = dueStatus === 'OVERDUE';
                  const isDueToday = dueStatus === 'DUE_TODAY';
                  const isConverted = item.cadence?.status === 'CONVERTED' || item.cadence?.convertedToOpportunity;

                  return (
                    <div 
                      key={item.id} 
                      className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      {/* Left: Lead Identity */}
                      <div className="flex items-start gap-3 min-w-[280px]">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm flex-shrink-0">
                          {item.company_name?.charAt(0) || 'L'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span 
                              onClick={() => onSelectLead360(item.id)}
                              className="font-bold text-slate-900 text-sm hover:text-indigo-600 cursor-pointer transition-colors"
                            >
                              {item.company_name}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {item.lead_code}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {getIndustryLabel(item.industry || item.cadence?.industry)}
                            </span>
                            {(item.sub_industry || item.subIndustry) && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {getSubIndustryLabel(item.industry || item.cadence?.industry, item.sub_industry || item.subIndustry)}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2">
                            <span className="font-medium text-slate-800">{item.first_name} {item.last_name}</span>
                            {item.designation && <span className="text-slate-400">({item.designation})</span>}
                            {item.city && <span className="text-slate-400">• {item.city}</span>}
                          </div>

                          {/* Contact quick links */}
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            {item.whatsapp_number || item.phone ? (
                              <a
                                href={generateWhatsAppUrl(item.whatsapp_number || item.phone, '')}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>{item.whatsapp_number || item.phone}</span>
                              </a>
                            ) : null}

                            {item.email && (
                              <a
                                href={`mailto:${item.email}`}
                                className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                              >
                                <Mail className="w-3 h-3" />
                                <span>{item.email}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Cadence Progress & Current Touchpoint */}
                      <div className="flex-1 max-w-xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isConverted ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <Trophy className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Converted to Sales Opportunity • Deal Value: ₹{Number(item.budget_amount || 0).toLocaleString('en-IN')}</span>
                            </span>
                          ) : (
                            <>
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                <span>Day {currentStep?.dayNumber}: {currentStep?.title}</span>
                              </span>

                              {isOverdue && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 animate-pulse">
                                  <AlertCircle className="w-3 h-3 text-rose-500" />
                                  <span>Overdue</span>
                                </span>
                              )}

                              {isDueToday && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  <span>Due Today</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <span>Goal: <strong className="text-slate-700">{currentStep?.goal}</strong></span>
                          <span>•</span>
                          <span>Channels:</span>
                          {(currentStep?.channels || []).map((ch: string) => (
                            <span
                              key={ch}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                ch === 'WHATSAPP' 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : ch === 'EMAIL'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : ch === 'LINKEDIN'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {ch === 'WHATSAPP' && '💬 WhatsApp'}
                              {ch === 'EMAIL' && '✉️ Email'}
                              {ch === 'LINKEDIN' && '🟢 LinkedIn'}
                              {ch === 'PHONE' && '📞 Phone Call'}
                            </span>
                          ))}
                        </div>

                        {/* If branched, show customer feedback */}
                        {item.cadence?.branchReply && (
                          <div className="mt-2 text-xs bg-amber-50 border border-amber-200 p-2 rounded-lg text-amber-900">
                            <span className="font-bold">⚡ Replied: </span>
                            {item.cadence.branchReply.leadFeedback}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isConverted ? (
                          <>
                            <button
                              onClick={() => handleOpenActionModal(item)}
                              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all hover:shadow-md"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Execute Touchpoint</span>
                            </button>

                            <button
                              onClick={() => handleOpenConvertModal(item)}
                              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all hover:shadow-md"
                              title="Convert to Sales Opportunity"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              <span>Convert to Opp</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onNavigateToPipeline && onNavigateToPipeline()}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
                          >
                            <Trophy className="w-3.5 h-3.5 text-amber-300" />
                            <span>View in Pipeline</span>
                          </button>
                        )}

                        <button
                          onClick={() => onSelectLead360(item.id)}
                          className="p-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold transition-all"
                          title="View 360 Profile"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 1-CLICK TOUCHPOINT EXECUTION MODAL                               */}
      {/* ----------------------------------------------------------------- */}
      {selectedLeadForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {activeTenantName} Funnel
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    Day {selectedLeadForAction.currentStep.dayNumber} of 30
                  </span>
                </div>
                <h2 className="text-lg font-bold mt-1 text-white flex items-center gap-2">
                  <span>{selectedLeadForAction.currentStep.title}</span>
                  <span className="text-slate-400 text-sm font-normal">
                    for {selectedLeadForAction.company_name}
                  </span>
                </h2>
              </div>

              <button
                onClick={() => setSelectedLeadForAction(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Prospect Quick Card & Industry Personalizer */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 text-sm">
                    {selectedLeadForAction.first_name} {selectedLeadForAction.last_name}
                  </div>
                  <div className="text-slate-500 text-xs">
                    {selectedLeadForAction.designation || 'Decision Maker'} • {selectedLeadForAction.company_name}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-600">Personalize for:</span>
                  <select
                    value={activeIndustryKey}
                    onChange={(e) => setActiveIndustryKey(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {tenantIndustries.map((ind) => (
                      <option key={ind.key} value={ind.key}>{ind.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Timing & Role Guidance */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-indigo-900">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>SOP Timing & Role Guidance</span>
                </div>
                <div className="text-[11px] text-indigo-800 space-y-1">
                  <div>⏰ <strong>Recommended Timing:</strong> {selectedLeadForAction.currentStep.timingGuide}</div>
                  <div>🎯 <strong>Platform Role:</strong> {selectedLeadForAction.currentStep.roleNote}</div>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* CHANNEL 1: WHATSAPP                                           */}
              {/* ------------------------------------------------------------- */}
              {selectedLeadForAction.currentStep.templates?.whatsapp && (
                <div className="border border-emerald-200 bg-emerald-50/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp Message</span>
                      <span className="text-[10px] font-normal text-slate-500">
                        ({selectedLeadForAction.whatsapp_number || selectedLeadForAction.phone || 'No phone provided'})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(
                          interpolateText(selectedLeadForAction.currentStep.templates.whatsapp.message, getInterpolationVars()),
                          'wa_msg'
                        )}
                        className="px-2.5 py-1 bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                      >
                        {copiedKey === 'wa_msg' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>Copy Text</span>
                      </button>

                      {(selectedLeadForAction.whatsapp_number || selectedLeadForAction.phone) && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleSendViaWhatsAppApi}
                            disabled={sendingWhatsAppApi}
                            className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                            title="Directly send template via WhatsApp Cloud API"
                          >
                            <Send className={`w-3 h-3 ${sendingWhatsAppApi ? 'animate-spin' : ''}`} />
                            <span>{sendingWhatsAppApi ? 'Sending API...' : '🚀 Send via WhatsApp API'}</span>
                          </button>

                          <a
                            href={generateWhatsAppUrl(
                              selectedLeadForAction.whatsapp_number || selectedLeadForAction.phone,
                              interpolateText(selectedLeadForAction.currentStep.templates.whatsapp.message, getInterpolationVars())
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-all"
                            title="Open in WhatsApp Web or App"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Web Chat</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-emerald-100 font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                    {interpolateText(selectedLeadForAction.currentStep.templates.whatsapp.message, getInterpolationVars())}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* CHANNEL 2: EMAIL                                              */}
              {/* ------------------------------------------------------------- */}
              {selectedLeadForAction.currentStep.templates?.email && (
                <div className="border border-purple-200 bg-purple-50/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-purple-900 text-sm">
                      <Mail className="w-4 h-4 text-purple-600" />
                      <span>Email Template</span>
                      <span className="text-[10px] font-normal text-slate-500">
                        ({selectedLeadForAction.email || 'No email provided'})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(
                          interpolateText(selectedLeadForAction.currentStep.templates.email.body, getInterpolationVars()),
                          'email_body'
                        )}
                        className="px-2.5 py-1 bg-white border border-purple-200 hover:bg-purple-50 text-purple-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                      >
                        {copiedKey === 'email_body' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>Copy Body</span>
                      </button>

                      {selectedLeadForAction.email && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleSendViaPortalSmtp}
                            disabled={sendingSmtp}
                            className="px-3 py-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                            title="Directly send this personalized email through the tenant portal SMTP"
                          >
                            <Send className={`w-3 h-3 ${sendingSmtp ? 'animate-spin' : ''}`} />
                            <span>{sendingSmtp ? 'Sending...' : '⚡ Send via Portal SMTP'}</span>
                          </button>

                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="bg-white px-3 py-2 rounded-lg border border-purple-100 flex items-center gap-2">
                      <span className="font-bold text-slate-400">Subject:</span>
                      <span className="font-medium text-slate-800">
                        {interpolateText(selectedLeadForAction.currentStep.templates.email.subject, getInterpolationVars())}
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-purple-100 font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                      {interpolateText(selectedLeadForAction.currentStep.templates.email.body, getInterpolationVars())}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* CHANNEL 3: LINKEDIN                                           */}
              {/* ------------------------------------------------------------- */}
              {selectedLeadForAction.currentStep.templates?.linkedin && (
                <div className="border border-blue-200 bg-blue-50/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
                      <Globe className="w-4 h-4 text-blue-600" />
                      <span>LinkedIn Action: {selectedLeadForAction.currentStep.templates.linkedin.actionType}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedLeadForAction.currentStep.templates.linkedin.message && (
                        <button
                          onClick={() => handleCopy(
                            interpolateText(selectedLeadForAction.currentStep.templates.linkedin.message, getInterpolationVars()),
                            'li_msg'
                          )}
                          className="px-2.5 py-1 bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                        >
                          {copiedKey === 'li_msg' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy Note</span>
                        </button>
                      )}

                      {selectedLeadForAction.linkedin_url ? (
                        <a
                          href={selectedLeadForAction.linkedin_url.startsWith('http') ? selectedLeadForAction.linkedin_url : `https://${selectedLeadForAction.linkedin_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open LinkedIn Profile</span>
                        </a>
                      ) : (
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(`${selectedLeadForAction.first_name} ${selectedLeadForAction.last_name} ${selectedLeadForAction.company_name} linkedin`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1"
                        >
                          <Search className="w-3 h-3" />
                          <span>Find on LinkedIn</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {selectedLeadForAction.currentStep.templates.linkedin.actionNote && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] leading-relaxed">
                      💡 <strong>Action Instruction:</strong> {selectedLeadForAction.currentStep.templates.linkedin.actionNote}
                    </div>
                  )}

                  {selectedLeadForAction.currentStep.templates.linkedin.message && (
                    <div className="bg-white p-3 rounded-lg border border-blue-100 font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                      {interpolateText(selectedLeadForAction.currentStep.templates.linkedin.message, getInterpolationVars())}
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* CHANNEL 4: PHONE (DAY 25)                                     */}
              {/* ------------------------------------------------------------- */}
              {selectedLeadForAction.currentStep.templates?.phone && (
                <div className="border border-amber-200 bg-amber-50/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                      <PhoneCall className="w-4 h-4 text-amber-600" />
                      <span>Phone Qualification Script (2-Min Call)</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPhoneDisposition('ANSWERED')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          phoneDisposition === 'ANSWERED'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Call Answered
                      </button>
                      <button
                        onClick={() => setPhoneDisposition('MISSED')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          phoneDisposition === 'MISSED'
                            ? 'bg-rose-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Missed / Busy
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-amber-200/80 font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Live Call Script:</div>
                    {interpolateText(selectedLeadForAction.currentStep.templates.phone.pitchScript, getInterpolationVars())}
                  </div>

                  {/* Post-Call WhatsApp Follow-up Message */}
                  {phoneDisposition !== 'NONE' && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between font-bold text-emerald-900">
                        <span>
                          {phoneDisposition === 'ANSWERED' ? '✅ Send Post-Call Discovery WhatsApp:' : '⏰ Send Missed-Call WhatsApp:'}
                        </span>
                        <button
                          onClick={() => handleCopy(
                            interpolateText(
                              phoneDisposition === 'ANSWERED' 
                                ? selectedLeadForAction.currentStep.templates.phone.afterCallTakenWhatsApp
                                : selectedLeadForAction.currentStep.templates.phone.missedCallWhatsApp,
                              getInterpolationVars()
                            ),
                            'post_call_wa'
                          )}
                          className="px-2 py-0.5 bg-white border border-emerald-300 text-emerald-700 rounded text-[11px] font-bold"
                        >
                          {copiedKey === 'post_call_wa' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100 text-slate-800 whitespace-pre-wrap">
                        {interpolateText(
                          phoneDisposition === 'ANSWERED' 
                            ? selectedLeadForAction.currentStep.templates.phone.afterCallTakenWhatsApp
                            : selectedLeadForAction.currentStep.templates.phone.missedCallWhatsApp,
                          getInterpolationVars()
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* LAYER 3: REPLY-BASED INTELLIGENT BRANCHING                    */}
              {/* ------------------------------------------------------------- */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span>Layer 3: Prospect Replied? (Branch Funnel)</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Auto-upgrades lead temperature</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(currentReplyBranches).map(([key, branch]: [string, any]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedBranchKey(selectedBranchKey === key ? '' : key);
                        setBranchFeedback(branch.triggerCondition);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selectedBranchKey === key
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50/40'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>"{branch.label}"</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          selectedBranchKey === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {branch.nextLeadTemperature}
                        </span>
                      </div>
                      <div className={`text-[10px] mt-1 ${selectedBranchKey === key ? 'text-amber-100' : 'text-slate-500'}`}>
                        {branch.suggestedAction}
                      </div>
                    </button>
                  ))}
                </div>

                {/* If branch selected, reveal recommended response script */}
                {selectedBranchKey && currentReplyBranches[selectedBranchKey] && (
                  <div className="p-3 bg-white border border-amber-300 rounded-xl space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span>Recommended Fast-Response Script:</span>
                      <button
                        onClick={() => handleCopy(
                          interpolateText(currentReplyBranches[selectedBranchKey].recommendedResponseScript, getInterpolationVars()),
                          'branch_script'
                        )}
                        className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs"
                      >
                        {copiedKey === 'branch_script' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>Copy Script</span>
                      </button>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap text-slate-800 leading-relaxed font-sans">
                      {interpolateText(currentReplyBranches[selectedBranchKey].recommendedResponseScript, getInterpolationVars())}
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        Applying branch pauses automated cadence and creates an urgent follow-up.
                      </span>
                      <button
                        onClick={handleApplyBranch}
                        disabled={branching}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition-all"
                      >
                        {branching ? 'Applying...' : 'Apply Branch & Upgrade Lead'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* BDE Execution Notes */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  BDE Activity Notes (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sent WhatsApp and connection request. Prospect viewed profile."
                  value={executionNotes}
                  onChange={(e) => setExecutionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setSelectedLeadForAction(null)}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCompleteStep}
                  disabled={executing}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all hover:shadow-md disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {executing ? 'Marking Complete...' : `Mark Day ${selectedLeadForAction.currentStep.dayNumber} Complete & Schedule Next`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* CONVERT TO SALES OPPORTUNITY MODAL                                */}
      {/* ================================================================= */}
      {selectedLeadForConvert && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-orange-500 to-yellow-500 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Convert to Sales Opportunity</h3>
                    <p className="text-xs text-orange-100">
                      Promote cold cadence lead to active deal pipeline
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedLeadForConvert(null)}
                className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Prospect Summary Card */}
            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span>{selectedLeadForConvert.company_name}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Contact: {selectedLeadForConvert.first_name} {selectedLeadForConvert.last_name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {selectedLeadForConvert.email || 'No email'} • {selectedLeadForConvert.phone || 'No phone'}
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold">
                    Day {selectedLeadForConvert.currentStep?.dayNumber || 1} Cadence
                  </span>
                  <div className="text-[10px] text-slate-400 mt-1 uppercase font-mono">
                    {selectedLeadForConvert.lead_code}
                  </div>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <ConvertDestination destination={convertDestination} />
                </div>

                {/* Deal Value */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                    <span>Estimated Deal Value (₹ INR)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="e.g. 250000"
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                {/* Lead Temperature */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-500" />
                    <span>Deal Temperature</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLeadTemperature('HOT')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                        leadTemperature === 'HOT'
                          ? 'bg-rose-500 text-white shadow-xs'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>HOT Lead</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeadTemperature('WARM')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                        leadTemperature === 'WARM'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>WARM Lead</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Conversion Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Handover & Discovery Notes
                </label>
                <textarea
                  rows={3}
                  value={conversionNotes}
                  onChange={(e) => setConversionNotes(e.target.value)}
                  placeholder="Record prospect requirements, pain points discussed, and next actions..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {/* Handoff Explanation Banner */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  Converting takes this lead out of the outreach cadence and puts it on the <strong>Sales Pipeline</strong> board{convertDestination ? <> under <strong>{convertDestination.pipeline.name}</strong></> : null}. Its notes are kept on the lead's timeline.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setSelectedLeadForConvert(null)}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteConvertOpportunity}
                disabled={convertingOpp || !convertDestination}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all hover:shadow-lg disabled:opacity-50"
              >
                <Trophy className="w-4 h-4" />
                <span>{convertingOpp ? 'Converting...' : '🚀 Confirm Conversion to Opportunity'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
      <ColdLeadImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onSuccess={() => {
          fetchCadenceData();
          if (onRefreshParent) onRefreshParent();
        }}
      />
    </div>
  );
}
