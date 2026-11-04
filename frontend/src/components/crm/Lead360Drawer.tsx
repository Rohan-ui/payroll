'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
  X, Sparkles, Building2, Phone, Mail, MapPin, Calendar, Clock,
  CheckCircle2, FileText, Trophy, ArrowRight, Plus, RefreshCw,
  MessageSquare, Video, ShieldCheck, UserCheck, AlertTriangle, Send, Check,
  ExternalLink, Copy, Globe, Flame, PhoneCall, Target, DollarSign, Briefcase,
  Edit3, Save, History
} from 'lucide-react';
import { 
  CadenceStep,
  ReplyBranch,
  CADENCE_INDUSTRIES,
  interpolateText,
  generateWhatsAppUrl,
  generateMailtoUrl
} from '@/lib/coldMarketingCadence';
import {
  useTenantIndustries,
  getIndustries,
  getSubIndustries,
  getIndustryLabel,
  getSubIndustryLabel
} from '@/lib/industryTaxonomy';
import { parsePhoneWithCountryCode } from '@/lib/countryCodes';

import { apiFetch } from '../../api/client';
import { MESSAGE_CHANNEL_NAMES, channelsStillToDo } from '../../lib/outreachChannels';
import { toast } from '../../lib/toast';
import { conversionDestination, dealWonMessage } from './pipelineBoard';
import { LeadHistory } from './LeadHistory';
import { OutreachEmailComposer } from './OutreachEmailComposer';
import { ConvertDestination } from './ConvertDestination';
import { useAuth } from '../../context/AuthContext';
import { whatsAppApi } from '../../api/whatsapp.api';
import { WhatsAppSendModal } from '../../views/crm/whatsapp/WhatsAppSendModal';
import { LeadSequencesPanel } from '../../views/emails/drip/LeadSequencesPanel';
interface Lead360DrawerProps {
  leadId: string | null;
  onClose: () => void;
  onRefreshParent: () => void;
  /** The workspace's own pipelines and stages, for converting a lead into an opportunity. */
  pipelines?: { id: string; name: string; code?: string | null; is_active?: boolean | null }[];
  stages?: { id: string; name: string; pipeline_id: string; stage_probability?: number; sort_order?: number | null; is_won?: boolean | null; is_lost?: boolean | null }[];
  /** Receives the server's answer after the lead is converted into an opportunity. */
  onLeadConverted?: (result: any) => void;
  /** Opens the create-quotation page for this lead. */
  onCreateQuotation?: (leadId: string) => void;
  /** Opens straight into editing the lead's details, as from Lead Management's Edit. */
  startEditing?: boolean;
}

export default function Lead360Drawer({ leadId, onClose, onRefreshParent, pipelines = [], stages = [], onLeadConverted, onCreateQuotation, startEditing = false }: Lead360DrawerProps) {
  const { industries, getSubIndustries, getIndustryLabel, getSubIndustryLabel } = useTenantIndustries();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'history' | 'followups' | 'meetings' | 'quotes' | 'cadence'>('overview');

  // Form states for adding activities / follow-ups
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [showScheduleFollowup, setShowScheduleFollowup] = useState(false);
  const [showScheduleMeeting, setShowScheduleMeeting] = useState(false);

  // New activity form
  const [actType, setActType] = useState('CALL');
  const [actTitle, setActTitle] = useState('');
  const [actDesc, setActDesc] = useState('');
  const [actDuration, setActDuration] = useState(300);

  // New followup form
  const [fupDate, setFupDate] = useState('');
  const [fupType, setFupType] = useState('CALL');
  const [fupPriority, setFupPriority] = useState('HIGH');
  const [fupInstructions, setFupInstructions] = useState('');

  // New meeting form
  const [meetTitle, setMeetTitle] = useState('Client Discovery Call');
  const [meetDate, setMeetDate] = useState('');
  const [meetType, setMeetType] = useState('GOOGLE_MEET');
  const [meetLink, setMeetLink] = useState('https://meet.google.com/rnd-voogyo-sync');

  const [saving, setSaving] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [converting, setConverting] = useState(false);

  // Cadence state inside Lead360
  const [drawerIndustry, setDrawerIndustry] = useState('general');
  const [enrollingCadence, setEnrollingCadence] = useState(false);
  const [executingStep, setExecutingStep] = useState(false);
  const [copiedCadenceKey, setCopiedCadenceKey] = useState<string | null>(null);
  const [drawerBranchKey, setDrawerBranchKey] = useState<string>('');
  const [applyingDrawerBranch, setApplyingDrawerBranch] = useState(false);
  const [drawerPhoneDisposition, setDrawerPhoneDisposition] = useState<'ANSWERED' | 'MISSED' | 'NONE'>('NONE');
  const [showWhatsAppTemplateModal, setShowWhatsAppTemplateModal] = useState(false);
  const [availableCrmTemplates, setAvailableCrmTemplates] = useState<any[]>([]);

  // Cadence conversion to Opportunity state
  const [showCadenceConvertModal, setShowCadenceConvertModal] = useState(false);
  const [cadenceTargetChannel, setCadenceTargetChannel] = useState('cold_sop');
  const [cadenceDealValue, setCadenceDealValue] = useState<string | number>('');
  const [cadenceTemperature, setCadenceTemperature] = useState<'HOT' | 'WARM'>('HOT');
  const [convertPipelineId, setConvertPipelineId] = useState('');
  const [convertStageId, setConvertStageId] = useState('');
  const [cadenceNotes, setCadenceNotes] = useState('');
  const [convertingCadenceOpp, setConvertingCadenceOpp] = useState(false);
  // Set synchronously, so a second click before the next render cannot send a second request.
  const convertInFlight = useRef(false);

  // Industry & Sub-Industry Sector state
  const [isEditingSector, setIsEditingSector] = useState(false);
  const [selectedInd, setSelectedInd] = useState('');
  const [selectedSubInd, setSelectedSubInd] = useState('');
  const [savingSector, setSavingSector] = useState(false);

  // Full Lead Profile Edit State
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [savingLeadEdit, setSavingLeadEdit] = useState(false);
  const [editFormData, setEditFormData] = useState({
    companyName: '',
    firstName: '',
    lastName: '',
    designation: '',
    email: '',
    phone: '',
    whatsappNumber: '',
    websiteUrl: '',
    linkedinUrl: '',
    city: '',
    state: '',
    address: '',
    postalCode: '',
    primaryService: '',
    industry: '',
    subIndustry: '',
    budgetAmount: 0,
    requirementBrief: '',
    gstin: '',
    pan: ''
  });
  // The values the form opened with; saving sends only the fields changed since.
  const [editFormOriginal, setEditFormOriginal] = useState<typeof editFormData | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') toast.error(text);
    else toast.success(text);
  };

  const openEditModal = () => {
    if (!lead) return;
    const values = {
      companyName: lead.company_name || '',
      firstName: lead.first_name || '',
      lastName: lead.last_name || '',
      designation: lead.designation || '',
      email: lead.email || '',
      phone: lead.phone || '',
      whatsappNumber: lead.whatsapp_number || lead.phone || '',
      websiteUrl: lead.website_url || '',
      linkedinUrl: lead.linkedin_url || '',
      city: lead.city || '',
      state: lead.state || '',
      address: lead.address || '',
      postalCode: lead.postal_code || '',
      primaryService: lead.primary_service || '',
      industry: lead.industry || '',
      subIndustry: lead.sub_industry || '',
      budgetAmount: Number(lead.budget_amount) || 0,
      requirementBrief: lead.requirement_brief || '',
      gstin: lead.gstin || '',
      pan: lead.pan || lead.pan_number || ''
    };
    setEditFormData(values);
    setEditFormOriginal(values);
    setShowEditLeadModal(true);
  };

  const handleSaveLeadEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId) return;
    // Resending untouched fields would re-validate stored values the user never edited.
    const changed = Object.fromEntries(
      Object.entries(editFormData).filter(([field, value]) => editFormOriginal?.[field as keyof typeof editFormData] !== value)
    );
    if (Object.keys(changed).length === 0) {
      setShowEditLeadModal(false);
      return;
    }
    setSavingLeadEdit(true);
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed)
      });
      if (res.ok) {
        setShowEditLeadModal(false);
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setSavingLeadEdit(false);
    }
  };

  const handleSaveSector = async () => {
    if (!leadId) return;
    setSavingSector(true);
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: selectedInd,
          sub_industry: selectedSubInd
        })
      });
      if (res.ok) {
        setIsEditingSector(false);
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setSavingSector(false);
    }
  };

  // Converted leads go to the chosen pipeline and open stage; by default the Cold Funnel and its first open stage. The server checks this too.
  const convertDestination = conversionDestination(pipelines, stages, { pipelineId: convertPipelineId, stageId: convertStageId });

  const handleExecuteConvertCadenceOpportunity = async () => {
    if (!leadId || convertInFlight.current || !convertDestination.pipeline || !convertDestination.stage) return;
    convertInFlight.current = true;
    setConvertingCadenceOpp(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONVERT_OPPORTUNITY',
          leadId,
          pipelineId: convertDestination.pipeline.id,
          stageId: convertDestination.stage.id,
          conversionChannel: cadenceTargetChannel,
          ...(cadenceDealValue !== '' ? { budgetAmount: Number(cadenceDealValue) } : {}),
          temperature: cadenceTemperature,
          notes: cadenceNotes || `Prospect converted to active Sales Pipeline Opportunity from Lead 360 Cadence view.`
        }),
        // The workspace announces the result with a link to the board; otherwise the server's message is shown.
        ...(onLeadConverted ? { feedback: { success: false as const } } : {}),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data?.lead) {
        setShowCadenceConvertModal(false);
        onLeadConverted?.(json.data);
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      convertInFlight.current = false;
      setConvertingCadenceOpp(false);
    }
  };

  const handleCadenceCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCadenceKey(key);
    setTimeout(() => setCopiedCadenceKey(null), 2000);
    showToast('Copied to clipboard!', 'success');
  };

  const handleEnrollLeadInCadence = async () => {
    if (!leadId) return;
    setEnrollingCadence(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ENROLL',
          leadId,
          industry: drawerIndustry
        }),
        feedback: { success: 'Lead enrolled in the 30-day outreach cadence' },
      });
      if (res.ok) {
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setEnrollingCadence(false);
    }
  };

  const handleCompleteCadenceStep = async (stepIndex: number, channels: any[]) => {
    if (!leadId) return;
    setExecutingStep(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPLETE_STEP',
          leadId,
          stepIndex,
          channelsUsed: channels
        }),
        feedback: { success: 'Step completed; next touchpoint scheduled' },
      });
      if (res.ok) {
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setExecutingStep(false);
    }
  };

  const handleApplyDrawerBranch = async () => {
    if (!leadId || !drawerBranchKey) return;
    setApplyingDrawerBranch(true);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'BRANCH_REPLY',
          leadId,
          branchKey: drawerBranchKey
        }),
        feedback: { success: 'Reply branch applied' },
      });
      if (res.ok) {
        setDrawerBranchKey('');
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setApplyingDrawerBranch(false);
    }
  };

  const fetchLead360 = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${leadId}`);
      const json = await res.json();
      if (json.success && json.data) {
        const leadObj = json.data.lead || json.data;
        setData({
          ...json.data,
          lead: leadObj
        });
        if (leadObj) {
          setSelectedInd(leadObj.industry || '');
          setSelectedSubInd(leadObj.sub_industry || '');
        }
      }
    } catch (err) {
      console.error('Failed to fetch 360 data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLead360();
  }, [leadId]);

  // Opened from Lead Management's Edit: go straight to the details form once the lead has loaded.
  const editOpened = useRef(false);
  useEffect(() => {
    if (!startEditing || !(data?.lead || data) || editOpened.current) return;
    editOpened.current = true;
    openEditModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEditing, data]);

  if (!leadId) return null;

  const lead = data?.lead || data;

  let leadCadence: any = null;
  try {
    if (lead?.custom_attributes) {
      const parsed = typeof lead.custom_attributes === 'string' 
        ? JSON.parse(lead.custom_attributes) 
        : lead.custom_attributes;
      leadCadence = parsed?.cadence || null;
    }
  } catch (e) {}

  // The workspace's outreach playbook (CRM Masters, in its order), sent with the lead,
  // and the step the lead is at, as the server works it out.
  const cadenceSteps: (CadenceStep & { id?: string })[] = data?.cadence_steps ?? [];
  const currentCadenceStep = cadenceSteps.find((step) => step.id && step.id === data?.cadence_current_step_id);
  const playbookDays = Math.max(0, ...cadenceSteps.map((step) => step.dayNumber));
  const playbookChannels = [...new Set(cadenceSteps.flatMap((step) => step.channels))];
  const replyBranches: Record<string, ReplyBranch> = data?.reply_branches ?? {};

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actTitle) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          activityType: actType,
          title: actTitle,
          description: actDesc,
          durationSeconds: actDuration
        })
      });
      if (res.ok) {
        setActTitle('');
        setActDesc('');
        setShowLogActivity(false);
        fetchLead360();
        onRefreshParent();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fupDate) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/crm/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          scheduledAt: fupDate,
          followupType: fupType,
          priority: fupPriority,
          instructions: fupInstructions
        })
      });
      if (res.ok) {
        setFupInstructions('');
        setShowScheduleFollowup(false);
        fetchLead360();
        onRefreshParent();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetDate || !meetTitle) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/crm/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          title: meetTitle,
          meetingType: meetType,
          scheduledAt: meetDate,
          meetingLink: meetLink
        })
      });
      if (res.ok) {
        setShowScheduleMeeting(false);
        fetchLead360();
        onRefreshParent();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteFollowup = async (fupId: string) => {
    try {
      const res = await apiFetch(`/api/v1/crm/followups/${fupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
        feedback: { success: 'Follow-up completed' },
      });
      if (res.ok) {
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    }
  };

  const handleExecuteConvertWon = async () => {
    setConverting(true);
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${leadId}/convert-won`, { method: 'POST', feedback: { success: false } });
      if (res.ok) {
        const json = await res.json();
        setShowConvertConfirm(false);
        showToast(dealWonMessage(json.data));
        fetchLead360();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setConverting(false);
    }
  };

  return (
    // !mt-0: the page wrapper spaces its children with space-y, whose top margin would push this full-screen layer down.
    <div className="fixed inset-0 !mt-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="bg-white dark:bg-[#12111A] w-full max-w-4xl h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-[#262438] animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#262438] bg-slate-50 dark:bg-[#171622] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
              {lead?.company_name?.substring(0, 2).toUpperCase() || 'LD'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  {lead?.company_name || 'Loading Lead Dossier...'}
                </h2>
                {lead?.lead_code && (
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-[#201f2e] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#323048]">
                    {lead.lead_code}
                  </span>
                )}
                {lead?.stage_name && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {lead.stage_name}
                  </span>
                )}
                {lead?.urgency && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    lead.urgency === 'HIGH' ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800' :
                    'bg-slate-100 dark:bg-[#252336] text-slate-700 dark:text-slate-300'
                  }`}>
                    {lead.urgency} Urgency
                  </span>
                )}
                {(lead?.is_existing_client || lead?.client_id) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    🔁 Repeat Customer
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                {lead ? `${lead.first_name || ''} ${lead.last_name || ''} • ${lead.designation || 'Founder & CTO'}` : 'Fetching comprehensive 360° records...'}
              </p>
              {(lead?.industry || lead?.sub_industry) && (
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {lead?.industry && (
                    <span 
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200/70 dark:bg-[#252336] text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-[#36344d]"
                      title={`Sector: ${getIndustryLabel(lead.industry)}`}
                    >
                      <span>🏢</span>
                      <span>{getIndustryLabel(lead.industry)}</span>
                    </span>
                  )}
                  {lead?.sub_industry && (
                    <span 
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60"
                      title={`Sub-Sector: ${getSubIndustryLabel(lead.industry, lead.sub_industry)}`}
                    >
                      <span>🔹</span>
                      <span>{getSubIndustryLabel(lead.industry, lead.sub_industry)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {lead && (
              <button
                onClick={openEditModal}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-[#252336] dark:hover:bg-[#34314c] text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Edit Contact & Corporate Details"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline">Edit Details</span>
              </button>
            )}

            {lead && (!lead.is_won && lead.temperature !== 'WON') && (
              <button
                onClick={() => setShowConvertConfirm(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark WON & Convert</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-[#28263a] rounded-lg text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 border-b border-slate-200 dark:border-[#262438] bg-white dark:bg-[#151421] text-xs font-semibold text-slate-600 dark:text-slate-400 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>360° Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('cadence')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'cadence'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold dark:border-indigo-400'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Cold Funnel (30D SOP)</span>
            {leadCadence?.status === 'ACTIVE' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'timeline'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Activity Timeline ({data?.activities?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            aria-pressed={activeTab === 'history'}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-4 h-4" aria-hidden="true" />
            <span>History</span>
          </button>

          <button
            onClick={() => setActiveTab('followups')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'followups'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Follow-ups ({data?.followups?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('meetings')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'meetings'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Meetings ({data?.meetings?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('quotes')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'quotes'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Quotations ({data?.quotations?.length || 0})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* TAB 1: 360° OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* AI Win Score & Key Metrics Banner */}
                  <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Voogyo AI Qualification</span>
                      </div>
                      <div className="text-2xl font-black mt-1">
                        {lead?.ai_score} / 100
                      </div>
                      <p className="text-xs text-blue-200 mt-0.5">
                        Predicted Win Probability: {lead?.win_probability}%
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-blue-200 block">Deal Budget</span>
                      <span className="text-xl font-bold text-white">
                        {formatCurrency(lead?.budget_amount)}
                      </span>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-white/10 rounded text-[10px] font-semibold">
                        Stage: {lead?.stage_name}
                      </span>
                    </div>
                  </div>

                  {/* Linked Existing Customer Account Highlight (if linked) */}
                  {(lead?.is_existing_client || lead?.client_id) && (
                    <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold">
                            🔁
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-purple-950">
                              Linked Existing Customer Account
                            </h4>
                            <p className="text-[11px] text-purple-700">
                              Opportunity generated for an existing verified client portfolio
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-purple-200/80 text-purple-900 text-[10px] font-bold rounded-full uppercase">
                          {lead?.existing_client_status || 'Active Client'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-purple-200/60 text-xs">
                        <div>
                          <span className="text-purple-600/80 block text-[10px] uppercase font-bold">Customer Entity</span>
                          <span className="font-bold text-purple-950">{lead?.existing_client_name || lead?.company_name}</span>
                        </div>
                        <div>
                          <span className="text-purple-600/80 block text-[10px] uppercase font-bold">Client ID</span>
                          <span className="font-mono text-slate-700 text-[11px]">{lead?.client_id || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-purple-600/80 block text-[10px] uppercase font-bold">Billing GSTIN</span>
                          <span className="font-mono font-bold text-purple-900">{lead?.existing_client_gstin || lead?.gstin || 'Not Registered'}</span>
                        </div>
                        <div>
                          <span className="text-purple-600/80 block text-[10px] uppercase font-bold">Registered Email</span>
                          <span className="text-slate-800">{lead?.existing_client_email || lead?.email}</span>
                        </div>
                        <div>
                          <span className="text-purple-600/80 block text-[10px] uppercase font-bold">Registered Phone</span>
                          <span className="text-slate-800">{lead?.existing_client_phone || lead?.phone || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-purple-600/80 block text-[10px] uppercase font-bold">Opportunity Type</span>
                          <span className="font-bold text-emerald-700">Contract Upsell / Expansion</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Contact Dossier */}
                  <div className="bg-white dark:bg-[#171622] rounded-xl border border-slate-200 dark:border-[#262438] p-4 sm:p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#262438] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="p-1 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg">
                          <Building2 className="w-3.5 h-3.5" />
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Primary Contact & Corporate Profile
                        </h3>
                      </div>
                      <button
                        onClick={openEditModal}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Info</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Contact Person</span>
                        <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                          {lead?.first_name} {lead?.last_name || ''}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Designation / Role</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {lead?.designation || 'Founder & Chief Technology Officer (CTO)'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Corporate Email</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <a 
                            href={`mailto:${lead?.email}`} 
                            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[190px]"
                            title={lead?.email}
                          >
                            {lead?.email}
                          </a>
                          <button
                            onClick={() => handleCadenceCopy(lead?.email || '', 'lead_email')}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                            title="Copy Email"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Direct Phone / Mobile</span>
                        {(() => {
                          if (!lead?.phone) return <span className="font-semibold text-slate-400 text-xs">Not provided</span>;
                          const parsed = parsePhoneWithCountryCode(lead.phone);
                          return (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#252336] border border-slate-200 dark:border-[#323048] text-xs font-medium text-slate-700 dark:text-slate-300" title={parsed.countryItem?.name}>
                                <span>{parsed.countryItem?.flag || '🌐'}</span>
                                <span className="font-mono text-[11px] font-semibold">{parsed.countryCode}</span>
                              </span>
                              <a href={`tel:${lead.phone}`} className="font-semibold text-slate-800 dark:text-slate-200 hover:text-emerald-600 transition-colors font-mono text-xs">
                                {parsed.number}
                              </a>
                            </div>
                          );
                        })()}
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">WhatsApp Channel</span>
                        {(() => {
                          const wa = lead?.whatsapp_number || lead?.phone;
                          if (!wa) return <span className="font-semibold text-slate-400 text-xs">Not provided</span>;
                          const parsed = parsePhoneWithCountryCode(wa);
                          return (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300" title={parsed.countryItem?.name}>
                                <span>{parsed.countryItem?.flag || '🟢'}</span>
                                <span className="font-mono text-[11px] font-semibold">{parsed.countryCode}</span>
                              </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono text-xs">
                                {parsed.number}
                              </span>
                              <a
                                href={generateWhatsAppUrl(wa, `Hi ${lead?.first_name || ''}, connecting from Voogyo RND regarding enterprise technology solutions.`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold inline-flex items-center gap-1"
                              >
                                <MessageSquare className="w-2.5 h-2.5" /> Chat
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await whatsAppApi.listCrmTemplates();
                                    if (res.success) setAvailableCrmTemplates(res.data);
                                  } catch {}
                                  setShowWhatsAppTemplateModal(true);
                                }}
                                className="ml-1 px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-bold inline-flex items-center gap-1"
                                title="Send WhatsApp Template via external API"
                              >
                                <Send className="w-2.5 h-2.5" /> Template API
                              </button>
                            </div>
                          );
                        })()}
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Official Website</span>
                        {lead?.website_url ? (
                          <a
                            href={lead.website_url.startsWith('http') ? lead.website_url : `https://${lead.website_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                          >
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[170px]">{lead.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                            <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Not specified</span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">LinkedIn Profile</span>
                        {lead?.linkedin_url ? (
                          <a
                            href={lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                          >
                            <span>🔗</span>
                            <span className="truncate max-w-[170px]">{lead.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}</span>
                            <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Not linked</span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Location</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {[lead?.city, lead?.state, lead?.country_code].filter(Boolean).join(', ') || 'Bengaluru, Karnataka, India'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Street Address & PIN</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block truncate" title={lead?.address}>
                          {lead?.address ? `${lead.address}${lead.postal_code ? ` - ${lead.postal_code}` : ''}` : 'Block 4, Embassy Tech Village, Outer Ring Road - 560103'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Primary Service Scope</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 block truncate" title={lead?.primary_service}>
                          {lead?.primary_service || 'Enterprise Cloud & ERP Modernization'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Lead Source</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {lead?.source_name || 'Inbound / Outbound B2B'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Assigned Sales Rep</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {lead?.assigned_user_name || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Industry & Sub-Industry Sector Classification */}
                  <div className="bg-white dark:bg-[#171622] rounded-xl border border-slate-200 dark:border-[#262438] p-4 sm:p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#262438] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg">
                          <Building2 className="w-3.5 h-3.5" />
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Industry & Sub-Industry Sector
                        </h3>
                      </div>
                      {!isEditingSector ? (
                        <button
                          onClick={() => {
                            setSelectedInd(lead?.industry || '');
                            setSelectedSubInd(lead?.sub_industry || '');
                            setIsEditingSector(true);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Sector</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setIsEditingSector(false)}
                            className="px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252336] rounded"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveSector}
                            disabled={savingSector}
                            className="px-2.5 py-1 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1 disabled:opacity-60"
                          >
                            {savingSector ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            <span>Save</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {!isEditingSector ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Primary Industry Sector</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5">
                            <span className="text-base">🏢</span>
                            <span>{getIndustryLabel(lead?.industry)}</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">Sub-Industry Specialization</span>
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mt-0.5">
                            <span className="text-base">🔹</span>
                            <span>{getSubIndustryLabel(lead?.industry, lead?.sub_industry) || 'General Sector'}</span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                              Industry Sector
                            </label>
                            <select
                              value={selectedInd}
                              onChange={(e) => {
                                const newInd = e.target.value;
                                const subList = getSubIndustries(newInd);
                                setSelectedInd(newInd);
                                setSelectedSubInd(subList[0]?.name || subList[0]?.key || '');
                              }}
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-[#323048] rounded-lg bg-white dark:bg-[#201f2e] font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                            >
                              {industries.map((ind) => (
                                <option key={ind.id || ind.key} value={ind.name}>{ind.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                              Sub-Industry Specialization
                            </label>
                            <select
                              value={selectedSubInd}
                              onChange={(e) => setSelectedSubInd(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-[#323048] rounded-lg bg-white dark:bg-[#201f2e] font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                            >
                              {getSubIndustries(selectedInd).map((sub) => (
                                <option key={sub.id || sub.key} value={sub.name}>{sub.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Statutory & Tax Info */}
                  <div className="bg-white dark:bg-[#171622] rounded-xl border border-slate-200 dark:border-[#262438] p-4 sm:p-5 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-[#262438] pb-2">
                      Statutory & GST Compliance
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">GSTIN</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {lead?.gstin }
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">PAN Number</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {lead?.pan || lead?.pan_number }
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Requirements & Scope */}
                  <div className="bg-white dark:bg-[#171622] rounded-xl border border-slate-200 dark:border-[#262438] p-4 sm:p-5 shadow-xs space-y-2">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Service Scope & Requirements
                    </h3>
                    <div className="bg-slate-50 dark:bg-[#111019] p-3.5 rounded-lg border border-slate-200 dark:border-[#262438] text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {lead?.requirement_brief || 'Nexus Quantum Labs requires multi-tenant SaaS architecture, cloud infrastructure optimization, and high-performance ERP modernization for their deep-tech platform.'}
                    </div>
                  </div>

                  {/* Deal Won Status (if converted) */}
                  {lead?.converted_client_id && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-xs text-emerald-900 dark:text-emerald-300">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Deal Converted & Won</span>
                      </div>
                      <p>Client ID: {lead?.converted_client_id}</p>
                    </div>
                  )}
                </div>
              )}

              {/* HISTORY: who did what to this lead, recorded by the server */}
              {activeTab === 'history' && leadId && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">History</h3>
                    <p className="text-[11px] text-slate-500">Every recorded action on this lead: who did it, when, and what changed.</p>
                  </div>
                  <LeadHistory leadId={leadId} pipelines={pipelines} stages={stages} />
                </div>
              )}

              {/* TAB 2: ACTIVITY TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-700 uppercase">Communication & Activity Timeline</h3>
                      <p className="text-[11px] text-slate-500">Chronological history of calls, follow-ups, meetings, and activities</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowScheduleFollowup(!showScheduleFollowup)}
                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>+ Follow-up</span>
                      </button>
                      <button
                        onClick={() => setShowLogActivity(!showLogActivity)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Log Activity</span>
                      </button>
                    </div>
                  </div>

                  {/* Schedule Followup Form (Timeline quick trigger) */}
                  {showScheduleFollowup && (
                    <form onSubmit={handleScheduleFollowup} className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-indigo-600" />
                          <span>Schedule Follow-up Reminder</span>
                        </span>
                        <button type="button" onClick={() => setShowScheduleFollowup(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Date & Time *</label>
                          <input
                            type="datetime-local"
                            required
                            value={fupDate}
                            onChange={(e) => setFupDate(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Priority</label>
                          <select
                            value={fupPriority}
                            onChange={(e) => setFupPriority(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          >
                            <option value="URGENT">🚨 Urgent</option>
                            <option value="HIGH">High Priority</option>
                            <option value="MEDIUM">Medium Priority</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700">Instructions / Agenda</label>
                        <input
                          type="text"
                          value={fupInstructions}
                          onChange={(e) => setFupInstructions(e.target.value)}
                          placeholder="Check client decision on proposed scope..."
                          className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowScheduleFollowup(false)}
                          className="px-3 py-1 text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                        >
                          {saving ? 'Scheduling...' : 'Save Follow-up'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Log Activity Form */}
                  {showLogActivity && (
                    <form onSubmit={handleLogActivity} className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Type</label>
                          <select
                            value={actType}
                            onChange={(e) => setActType(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          >
                            <option value="CALL">Phone Call</option>
                            <option value="WHATSAPP">WhatsApp Message</option>
                            <option value="EMAIL">Email</option>
                            <option value="NOTE">Internal Note</option>
                            <option value="SITE_VISIT">Site Visit</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Title / Subject</label>
                          <input
                            type="text"
                            required
                            value={actTitle}
                            onChange={(e) => setActTitle(e.target.value)}
                            placeholder="e.g. Discovery Call with VP"
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700">Notes & Outcomes</label>
                        <textarea
                          rows={2}
                          value={actDesc}
                          onChange={(e) => setActDesc(e.target.value)}
                          placeholder="Client confirmed requirement for multi-tenant architecture..."
                          className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowLogActivity(false)}
                          className="px-3 py-1 text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg"
                        >
                          {saving ? 'Saving...' : 'Save Activity'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Activity Feed */}
                  <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
                    {data?.activities?.map((act: any) => (
                      <div key={act.id} className="relative flex items-start gap-3 pl-1">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white z-10 shrink-0 ${
                          act.activity_type === 'CALL' ? 'bg-blue-600' :
                          act.activity_type === 'WHATSAPP' ? 'bg-emerald-600' :
                          act.activity_type === 'FOLLOWUP' ? 'bg-indigo-600' :
                          act.activity_type === 'FOLLOWUP_COMPLETED' ? 'bg-teal-600' :
                          act.activity_type === 'MEETING' ? 'bg-purple-600' :
                          act.activity_type === 'STATUS_CHANGE' ? 'bg-amber-600' :
                          'bg-slate-600'
                        }`}>
                          {act.activity_type === 'CALL' ? <Phone className="w-3 h-3" /> :
                           act.activity_type === 'WHATSAPP' ? <MessageSquare className="w-3 h-3" /> :
                           act.activity_type === 'FOLLOWUP' ? <Clock className="w-3 h-3" /> :
                           act.activity_type === 'FOLLOWUP_COMPLETED' ? <CheckCircle2 className="w-3 h-3" /> :
                           act.activity_type === 'MEETING' ? <Video className="w-3 h-3" /> :
                           act.activity_type === 'STATUS_CHANGE' ? <Trophy className="w-3 h-3" /> :
                           <FileText className="w-3 h-3" />}
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 flex-1 shadow-xs">
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-800">{act.title}</span>
                              {act.activity_type === 'FOLLOWUP' && (
                                <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold rounded">
                                  Follow-up
                                </span>
                              )}
                              {act.activity_type === 'FOLLOWUP_COMPLETED' && (
                                <span className="px-1.5 py-0.2 bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-bold rounded">
                                  Completed
                                </span>
                              )}
                              {act.activity_type === 'MEETING' && (
                                <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-bold rounded">
                                  Meeting
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400">{new Date(act.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </div>
                          {act.description && (
                            <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{act.description}</p>
                          )}
                          <div className="mt-2 text-[10px] text-slate-400">
                            Logged by {act.performed_by_name || 'Voogyo System'}
                          </div>
                        </div>
                      </div>
                    ))}

                    {(!data?.activities || data.activities.length === 0) && (
                      <p className="text-xs text-slate-400 py-6 text-center">No communication activities recorded yet.</p>
                    )}

                    {/* Employee Audit Events for this Lead */}
                    {data?.auditLogs && data.auditLogs.length > 0 && (
                      <div className="pt-4 border-t border-slate-200 mt-4 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Employee Actions & Audit Trail ({data.auditLogs.length})</span>
                        </div>
                        <div className="space-y-2">
                          {data.auditLogs.map((log: any) => (
                            <div key={log.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">{log.title}</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {new Date(log.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {log.description && (
                                <p className="text-[11px] text-slate-600">{log.description}</p>
                              )}
                              <div className="text-[10px] text-indigo-700 font-semibold">
                                Performed by: {log.actor_name} ({log.actor_role || 'Staff'})
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: FOLLOW-UPS */}
              {activeTab === 'followups' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase">Follow-up Tasks & Reminders</h3>
                    <button
                      onClick={() => setShowScheduleFollowup(!showScheduleFollowup)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Schedule Follow-up</span>
                    </button>
                  </div>

                  {showScheduleFollowup && (
                    <form onSubmit={handleScheduleFollowup} className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Date & Time *</label>
                          <input
                            type="datetime-local"
                            required
                            value={fupDate}
                            onChange={(e) => setFupDate(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Priority</label>
                          <select
                            value={fupPriority}
                            onChange={(e) => setFupPriority(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          >
                            <option value="URGENT">🚨 Urgent</option>
                            <option value="HIGH">High Priority</option>
                            <option value="MEDIUM">Medium Priority</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700">Instructions / Agenda</label>
                        <input
                          type="text"
                          value={fupInstructions}
                          onChange={(e) => setFupInstructions(e.target.value)}
                          placeholder="Check client availability for contract signing..."
                          className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowScheduleFollowup(false)}
                          className="px-3 py-1 text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg"
                        >
                          {saving ? 'Scheduling...' : 'Set Reminder'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2">
                    {data?.followups?.map((fup: any) => (
                      <div
                        key={fup.id}
                        className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                          fup.status === 'COMPLETED'
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : fup.is_overdue
                            ? 'bg-red-50/70 border-red-200'
                            : 'bg-white border-slate-200 shadow-xs'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {new Date(fup.scheduled_at).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              fup.priority === 'URGENT' ? 'bg-red-100 text-red-800' :
                              fup.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {fup.priority}
                            </span>
                            {fup.status === 'COMPLETED' && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                                Completed
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">{fup.instructions || 'Follow up with client'}</p>
                        </div>

                        {fup.status !== 'COMPLETED' && (
                          <button
                            onClick={() => handleCompleteFollowup(fup.id)}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs rounded-lg border border-emerald-200 flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Mark Done</span>
                          </button>
                        )}
                      </div>
                    ))}

                    {(!data?.followups || data.followups.length === 0) && (
                      <p className="text-xs text-slate-400 py-6 text-center">No follow-ups scheduled.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: MEETINGS */}
              {activeTab === 'meetings' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase">Client Meetings</h3>
                    <button
                      onClick={() => setShowScheduleMeeting(!showScheduleMeeting)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Schedule Meeting</span>
                    </button>
                  </div>

                  {showScheduleMeeting && (
                    <form onSubmit={handleScheduleMeeting} className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs space-y-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700">Meeting Title *</label>
                        <input
                          type="text"
                          required
                          value={meetTitle}
                          onChange={(e) => setMeetTitle(e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Date & Time *</label>
                          <input
                            type="datetime-local"
                            required
                            value={meetDate}
                            onChange={(e) => setMeetDate(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700">Platform</label>
                          <select
                            value={meetType}
                            onChange={(e) => setMeetType(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-xs border rounded-lg"
                          >
                            <option value="GOOGLE_MEET">Google Meet</option>
                            <option value="ZOOM">Zoom</option>
                            <option value="IN_PERSON">In-Person Site Visit</option>
                            <option value="PHONE">Phone Conference</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowScheduleMeeting(false)}
                          className="px-3 py-1 text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg"
                        >
                          {saving ? 'Scheduling...' : 'Confirm Meeting'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3">
                    {data?.meetings?.map((m: any) => (
                      <div key={m.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">{m.title}</span>
                          <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded">
                            {m.meeting_type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{new Date(m.scheduled_at).toLocaleString('en-IN')}</span>
                          <span>({m.duration_minutes} mins)</span>
                        </p>
                        {m.meeting_link && (
                          <a
                            href={m.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Join Video Meeting</span>
                          </a>
                        )}
                        {m.minutes_of_meeting && (
                          <div className="mt-2 bg-slate-50 p-2.5 rounded-lg text-xs text-slate-700">
                            <span className="font-bold block text-[10px] text-slate-500 uppercase">Minutes of Meeting (MOM):</span>
                            {m.minutes_of_meeting}
                          </div>
                        )}
                      </div>
                    ))}

                    {(!data?.meetings || data.meetings.length === 0) && (
                      <p className="text-xs text-slate-400 py-6 text-center">No meetings scheduled.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: QUOTATIONS */}
              {activeTab === 'quotes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase">Quotations</h3>
                    {onCreateQuotation && (
                      <button
                        type="button"
                        onClick={() => onCreateQuotation(data?.lead?.id || leadId)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Create Quotation</span>
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {data?.quotations?.map((q: any) => (
                      <div key={q.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-blue-700">{q.quotation_number}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            q.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' :
                            q.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {q.status}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-800">{q.subject}</h4>
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                          <span className="text-slate-500">{q.items_count} {q.items_count === 1 ? 'service' : 'services'}</span>
                          <span className="font-bold text-slate-900">{formatCurrency(q.total_amount)}</span>
                        </div>
                      </div>
                    ))}

                    {(!data?.quotations || data.quotations.length === 0) && (
                      <p className="text-xs text-slate-400 py-6 text-center">No quotations generated yet for this lead.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: RND GOLD CADENCE (30-DAY MULTI-CHANNEL FUNNEL) */}
              {activeTab === 'cadence' && (
                <div className="space-y-5">
                  {can('sequences.view') && leadId && <LeadSequencesPanel leadId={leadId} onChanged={fetchLead360} />}
                  {!leadCadence ? (
                    <div className="bg-white rounded-2xl border border-indigo-100 p-6 shadow-xs space-y-4 text-center">
                      <div className="w-14 h-14 bg-gradient-to-tr from-amber-400 to-amber-500 rounded-2xl flex items-center justify-center mx-auto text-white shadow-md">
                        <Sparkles className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          RND Technosoft Smart Multi-Channel Cold Marketing Funnel
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          {`${cadenceSteps.length} milestones over ${playbookDays} days on ${playbookChannels.map((ch) => ch.charAt(0) + ch.slice(1).toLowerCase()).join(', ')}, as set in CRM Masters.`}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-sm mx-auto text-left space-y-2">
                        <label className="block text-[11px] font-bold text-slate-700 uppercase">
                          Select Target Industry (Layer 2 Personalization):
                        </label>
                        <select
                          value={drawerIndustry}
                          onChange={(e) => setDrawerIndustry(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          {Object.entries(CADENCE_INDUSTRIES).map(([k, ind]) => (
                            <option key={k} value={k}>{ind.name}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleEnrollLeadInCadence}
                        disabled={enrollingCadence}
                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-2 mx-auto transition-all disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{enrollingCadence ? 'Enrolling in Funnel...' : '🚀 Enroll into 30-Day Client Outreach Funnel'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Cadence Status Banner */}
                      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl shadow-sm border border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              {leadCadence.funnelName || 'Client Outreach Funnel'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              leadCadence.status === 'CONVERTED' ? 'bg-purple-500/30 text-purple-200 border border-purple-400/40' :
                              leadCadence.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                              leadCadence.status === 'BRANCHED' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              'bg-blue-500/20 text-blue-300'
                            }`}>
                              {leadCadence.status === 'CONVERTED' ? 'CONVERTED TO OPP' : leadCadence.status}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white mt-1">
                            Current: Day {currentCadenceStep?.dayNumber}: {currentCadenceStep?.title}
                          </h4>
                          <div className="text-[11px] text-slate-300 mt-0.5">
                            Industry: <span className="font-semibold text-amber-300">{CADENCE_INDUSTRIES[leadCadence.industry]?.name || leadCadence.industry}</span> • Enrolled: {new Date(leadCadence.enrolledAt).toLocaleDateString('en-IN')}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {leadCadence.status !== 'CONVERTED' ? (
                            <button
                              onClick={() => {
                                setCadenceDealValue(Number(lead?.budget_amount) > 0 ? Number(lead?.budget_amount) : '');
                                setCadenceNotes(`Prospect ${[lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || lead?.company_name} qualified during Cold Cadence Day ${currentCadenceStep?.dayNumber || 1}.`);
                                setConvertPipelineId('');
                                setConvertStageId('');
                                setShowCadenceConvertModal(true);
                              }}
                              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:shadow-md"
                            >
                              <Trophy className="w-3.5 h-3.5 text-white" />
                              <span>🚀 Convert to Opp</span>
                            </button>
                          ) : (
                            <span className="px-3 py-1 bg-purple-900/60 border border-purple-400/40 text-purple-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Converted Opp (₹{Number(leadCadence.opportunityDealValue || lead?.budget_amount || 0).toLocaleString('en-IN')})</span>
                            </span>
                          )}

                          <button
                            onClick={() => handleCadenceCopy(
                              `Company: ${lead?.company_name}\nContact: ${[lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || '—'}\nCadence Day: ${currentCadenceStep?.dayNumber}\nStatus: ${leadCadence.status}`,
                              'summary'
                            )}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1 border border-white/10 transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy Summary</span>
                          </button>
                        </div>
                      </div>

                      {/* SOP Operational Architecture & Cadence Narrative for Lead */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-[#1b1a2e] dark:to-[#171626] border border-blue-200/80 dark:border-[#2d2a4a] rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              30D
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                {`${playbookDays}-Day Multi-Touch SOP Workflow`}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Target: <span className="font-semibold text-slate-800 dark:text-slate-200">{lead?.company_name}</span> ({lead?.first_name} {lead?.last_name}{lead?.designation ? ` • ${lead?.designation}` : ''})
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Multi-Channel SOP
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {leadCadence.currentStepIndex === 0
                            ? `Day 1 initiates the Triple Platform Launch across LinkedIn, Email, and WhatsApp. This synchronized 3-channel touchpoint establishes high immediate brand authority and recognition for ${lead?.company_name || 'the prospect'} before subsequent trust and audit milestones.`
                            : `Currently progressing through Day ${currentCadenceStep?.dayNumber} of the 30-Day Outbound SOP (${currentCadenceStep?.title}). Follow-ups are spaced to nurture interest without spamming.`
                          }
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-blue-100 dark:border-[#2d2a4a] text-[11px]">
                          <div className="p-2 bg-white/70 dark:bg-[#12111d] rounded-lg border border-blue-100 dark:border-[#2d2a4a]">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Cadence Plan</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">8 Strategic Touchpoints</span>
                          </div>
                          <div className="p-2 bg-white/70 dark:bg-[#12111d] rounded-lg border border-blue-100 dark:border-[#2d2a4a]">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Channels</span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">LI • EM • WA • PH</span>
                          </div>
                          <div className="p-2 bg-white/70 dark:bg-[#12111d] rounded-lg border border-blue-100 dark:border-[#2d2a4a]">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Goal</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">15m Discovery Call</span>
                          </div>
                          <div className="p-2 bg-white/70 dark:bg-[#12111d] rounded-lg border border-blue-100 dark:border-[#2d2a4a]">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Handling</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">Layer 3 Smart Scripts</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 3 Reply Branching Quick Bar */}
                      <div className="bg-amber-50/70 dark:bg-[#1b1916] border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200 text-xs">
                            <Flame className="w-4 h-4 text-amber-600" />
                            <span>Did the prospect reply to an outreach?</span>
                          </div>
                          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">Layer 3 Objection Branching</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {Object.entries(replyBranches).map(([k, br]) => (
                            <button
                              key={k}
                              onClick={() => setDrawerBranchKey(drawerBranchKey === k ? '' : k)}
                              className={`p-2 rounded-xl text-left border text-xs transition-all ${
                                drawerBranchKey === k 
                                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                                  : 'bg-white dark:bg-[#201d1c] border-amber-200/80 dark:border-amber-900/50 text-amber-950 dark:text-amber-200 hover:bg-amber-100/50 dark:hover:bg-amber-900/30'
                              }`}
                            >
                              <div className="font-bold text-[11px] truncate">"{br.label}"</div>
                              <div className={`text-[10px] ${drawerBranchKey === k ? 'text-amber-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                Temp: {br.nextLeadTemperature}
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Selected Branch Details */}
                        {drawerBranchKey && replyBranches[drawerBranchKey] && (
                          <div className="p-3 bg-white dark:bg-[#151421] border border-amber-300 dark:border-amber-900/60 rounded-xl space-y-2 animate-in fade-in">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-amber-900 dark:text-amber-200">Recommended Reply Script:</span>
                              <button
                                onClick={() => handleCadenceCopy(
                                  interpolateText(replyBranches[drawerBranchKey].recommendedResponseScript, {
                                    firstName: lead?.first_name || 'Aditya',
                                    lastName: lead?.last_name || 'Kulkarni',
                                    fullName: [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'Aditya Kulkarni',
                                    companyName: lead?.company_name || 'Nexus Quantum Labs',
                                    designation: lead?.designation || 'Founder & CTO',
                                    industry: leadCadence.industry || 'software_it'
                                  }),
                                  'drawer_branch_script'
                                )}
                                className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold"
                              >
                                {copiedCadenceKey === 'drawer_branch_script' ? 'Copied!' : 'Copy Script'}
                              </button>
                            </div>
                            <div className="bg-slate-50 dark:bg-[#11101a] p-2.5 rounded-lg border border-slate-200 dark:border-[#2e2c43] text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                              {interpolateText(replyBranches[drawerBranchKey].recommendedResponseScript, {
                                firstName: lead?.first_name || 'Aditya',
                                lastName: lead?.last_name || 'Kulkarni',
                                fullName: [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'Aditya Kulkarni',
                                companyName: lead?.company_name || 'Nexus Quantum Labs',
                                designation: lead?.designation || 'Founder & CTO',
                                industry: leadCadence.industry || 'software_it'
                              })}
                            </div>
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={handleApplyDrawerBranch}
                                disabled={applyingDrawerBranch}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                              >
                                {applyingDrawerBranch ? 'Applying...' : 'Apply Branch & Upgrade Lead'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 8-Step Visual Roadmap */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center justify-between">
                          <span>{`${playbookDays}-Day Multi-Channel Roadmap`}</span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">{cadenceSteps.length} Steps</span>
                        </h4>

                        <div className="space-y-3">
                          {cadenceSteps.map((step) => {
                            const isCompleted = leadCadence.completedSteps?.some((s: any) => s.dayNumber === step.dayNumber);
                            const isCurrent = step === currentCadenceStep && leadCadence.status === 'ACTIVE';
                            const completedRecord = leadCadence.completedSteps?.find((s: any) => s.dayNumber === step.dayNumber);

                            // The lead's own details; the template fills in a polite default for anything missing.
                            const vars = {
                              firstName: lead?.first_name || undefined,
                              lastName: lead?.last_name || undefined,
                              companyName: lead?.company_name || undefined,
                              designation: lead?.designation || undefined,
                              industry: leadCadence?.industry || lead?.industry || 'general',
                              phone: lead?.whatsapp_number || lead?.phone || undefined,
                              email: lead?.email || undefined,
                              assigneeName: lead?.assigned_user_name && lead.assigned_user_name !== 'Unassigned' ? lead.assigned_user_name : undefined,
                            };
                            const emailAction = leadCadence.channelActions?.[String(step.dayNumber)]?.EMAIL;

                            return (
                              <div
                                key={step.stepIndex}
                                className={`rounded-xl border p-4 transition-all ${
                                  isCurrent
                                    ? 'bg-indigo-50/50 dark:bg-[#1b192e] border-indigo-300 dark:border-indigo-700/60 ring-2 ring-indigo-500/20 shadow-xs'
                                    : isCompleted
                                      ? 'bg-emerald-50/30 dark:bg-[#14231e] border-emerald-200 dark:border-emerald-800/40'
                                      : 'bg-white dark:bg-[#171622] border-slate-200 dark:border-[#262438] opacity-80 dark:opacity-90'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                      isCompleted
                                        ? 'bg-emerald-600 text-white'
                                        : isCurrent
                                          ? 'bg-indigo-600 text-white animate-pulse'
                                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                    }`}>
                                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.dayNumber}
                                    </span>

                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                                          Day {step.dayNumber}: {step.title}
                                        </span>
                                        {isCurrent && (
                                          <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded text-[10px] font-bold">
                                            ACTIVE NOW
                                          </span>
                                        )}
                                        {isCompleted && (
                                          <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded text-[10px] font-bold">
                                            COMPLETED
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Goal: {step.goal}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {step.channels.map((ch) => (
                                      <span key={ch} className="text-[10px] px-2 py-0.5 bg-white dark:bg-[#1c1b29] border border-slate-200 dark:border-[#2e2c43] rounded font-semibold text-slate-700 dark:text-slate-300">
                                        {ch}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Step Templates Accordion / Preview */}
                                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#262438] space-y-2 text-xs">
                                  {step.templates.whatsapp && (
                                    <div className="bg-white dark:bg-[#12111d] p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-900/40 space-y-1.5">
                                      <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                                        <span className="flex items-center gap-1">
                                          <MessageSquare className="w-3 h-3" /> WhatsApp
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            onClick={() => handleCadenceCopy(
                                              interpolateText(step.templates.whatsapp!.message, vars),
                                              `wa_${step.stepIndex}`
                                            )}
                                            className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline"
                                          >
                                            {copiedCadenceKey === `wa_${step.stepIndex}` ? 'Copied!' : 'Copy'}
                                          </button>
                                          {lead?.phone && (
                                            <a
                                              href={generateWhatsAppUrl(lead?.whatsapp_number || lead?.phone, interpolateText(step.templates.whatsapp!.message, vars))}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                                            >
                                              <Send className="w-2.5 h-2.5" /> Chat
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-slate-700 dark:text-slate-300 text-[11px] whitespace-pre-wrap leading-relaxed">
                                        {interpolateText(step.templates.whatsapp.message, vars)}
                                      </p>
                                    </div>
                                  )}

                                  {step.templates.email && isCurrent && (
                                    <OutreachEmailComposer
                                      leadId={lead.id}
                                      recipient={lead?.email || null}
                                      touchpoint={{ day: step.dayNumber, title: step.title, channels: step.channels }}
                                      subject={interpolateText(step.templates.email.subject, vars)}
                                      body={interpolateText(step.templates.email.body, vars)}
                                      saved={emailAction ?? null}
                                      onSent={(result) => {
                                        showToast(result.message, 'success');
                                        fetchLead360();
                                        onRefreshParent?.();
                                      }}
                                    />
                                  )}

                                  {step.templates.email && !isCurrent && (
                                    <div className="bg-white dark:bg-[#12111d] p-3 rounded-xl border border-purple-200/80 dark:border-purple-900/40 space-y-1.5">
                                      <div className="flex items-center justify-between text-purple-900 dark:text-purple-300 font-bold text-[11px]">
                                        <span className="flex items-center gap-1 truncate max-w-[320px]">
                                          <Mail className="w-3 h-3 flex-shrink-0" /> Email: {interpolateText(step.templates.email.subject, vars)}
                                        </span>
                                        <button
                                          onClick={() => handleCadenceCopy(
                                            interpolateText(step.templates.email!.body, vars),
                                            `email_${step.stepIndex}`
                                          )}
                                          className="text-[10px] text-purple-700 dark:text-purple-400 hover:underline flex-shrink-0"
                                        >
                                          {copiedCadenceKey === `email_${step.stepIndex}` ? 'Copied!' : 'Copy Body'}
                                        </button>
                                      </div>
                                      {emailAction?.status === 'SENT' && (
                                        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                          {`✓ Sent ${new Date(emailAction.sentAt).toLocaleString('en-IN')} by ${emailAction.executedBy.name}${emailAction.from ? ` from ${emailAction.from.email}` : ''}`}
                                        </p>
                                      )}
                                      <p className="text-slate-700 dark:text-slate-300 text-[11px] whitespace-pre-wrap leading-relaxed">
                                        {interpolateText(step.templates.email.body, vars)}
                                      </p>
                                    </div>
                                  )}

                                  {step.templates.linkedin && (
                                    <div className="bg-white dark:bg-[#12111d] p-3 rounded-xl border border-blue-200/80 dark:border-blue-900/40 space-y-1.5">
                                      <div className="flex items-center justify-between text-blue-900 dark:text-blue-300 font-bold text-[11px]">
                                        <span className="flex items-center gap-1">
                                          <Globe className="w-3 h-3" /> LinkedIn: {step.templates.linkedin.actionType}
                                        </span>
                                        {step.templates.linkedin.message && (
                                          <button
                                            onClick={() => handleCadenceCopy(
                                              interpolateText(step.templates.linkedin!.message!, vars),
                                              `li_${step.stepIndex}`
                                            )}
                                            className="text-[10px] text-blue-700 dark:text-blue-400 hover:underline"
                                          >
                                            {copiedCadenceKey === `li_${step.stepIndex}` ? 'Copied!' : 'Copy Note'}
                                          </button>
                                        )}
                                      </div>
                                      {step.templates.linkedin.actionNote && (
                                        <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                                          💡 {step.templates.linkedin.actionNote}
                                        </p>
                                      )}
                                      {step.templates.linkedin.message && (
                                        <p className="text-slate-700 dark:text-slate-300 text-[11px] whitespace-pre-wrap leading-relaxed">
                                          {interpolateText(step.templates.linkedin.message, vars)}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Mark Step Completed Action Button */}
                                  {isCurrent && (() => {
                                    // The same rule as the server: every message of the day sent (or LinkedIn / WhatsApp marked not available) first.
                                    const left = channelsStillToDo(step, leadCadence.channelActions?.[String(step.dayNumber)]);
                                    return (
                                    <div className="pt-2 flex flex-col items-end gap-1">
                                      {left.length > 0 && (
                                        <p className="text-[11px] text-slate-600 dark:text-slate-400 text-right">
                                          Send the {left.map((c) => MESSAGE_CHANNEL_NAMES[c]).join(', ')} message{left.length === 1 ? '' : 's'} from Client Outreach → Execute first{left.includes('LINKEDIN') ? ' (or mark the lead as not on LinkedIn there)' : ''}.
                                        </p>
                                      )}
                                      <button
                                        onClick={() => handleCompleteCadenceStep(step.stepIndex, step.channels)}
                                        disabled={executingStep || left.length > 0}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>
                                          {executingStep ? 'Advancing...' : `Mark Day ${step.dayNumber} Complete & Schedule Next`}
                                        </span>
                                      </button>
                                    </div>
                                    );
                                  })()}

                                  {isCompleted && completedRecord && (
                                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium pt-1">
                                      ✅ Completed on {new Date(completedRecord.completedAt).toLocaleString('en-IN')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* QUICK EDIT LEAD 360 PROFILE MODAL */}
      {showEditLeadModal && (
        <div className="fixed inset-0 z-70 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#171622] max-w-2xl w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-[#2e2c43] overflow-hidden my-8 animate-in zoom-in-95">
            <div className="p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Edit Lead 360° Profile & Contact Details</h3>
                  <p className="text-[11px] text-blue-100">Update company credentials, key contact person, tax info, and deal scope.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditLeadModal(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeadEdit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Company / Organization *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.companyName}
                    onChange={(e) => setEditFormData({ ...editFormData, companyName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="e.g. Nexus Quantum Labs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Official Website URL</label>
                  <input
                    type="text"
                    value={editFormData.websiteUrl}
                    onChange={(e) => setEditFormData({ ...editFormData, websiteUrl: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="e.g. https://nexusquantum.io"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.firstName}
                    onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="Aditya"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editFormData.lastName}
                    onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="Kulkarni"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Designation / Role</label>
                  <input
                    type="text"
                    value={editFormData.designation}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="Founder & Chief Technology Officer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="aditya@nexusquantum.io"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="+91 98201 44892"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">WhatsApp Number</label>
                  <input
                    type="text"
                    maxLength={32}
                    value={editFormData.whatsappNumber}
                    onChange={(e) => setEditFormData({ ...editFormData, whatsappNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="+91 98201 44892"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">LinkedIn Profile</label>
                  <input
                    type="text"
                    value={editFormData.linkedinUrl}
                    onChange={(e) => setEditFormData({ ...editFormData, linkedinUrl: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Primary Service / Scope</label>
                  <input
                    type="text"
                    value={editFormData.primaryService}
                    onChange={(e) => setEditFormData({ ...editFormData, primaryService: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="e.g. Enterprise Cloud & ERP Modernization"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">City</label>
                  <input
                    type="text"
                    value={editFormData.city}
                    onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="Bengaluru"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">State</label>
                  <input
                    type="text"
                    value={editFormData.state}
                    onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="Karnataka"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">PIN / Postal Code</label>
                  <input
                    type="text"
                    value={editFormData.postalCode}
                    onChange={(e) => setEditFormData({ ...editFormData, postalCode: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="560103"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Corporate Address</label>
                <input
                  type="text"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                  placeholder="e.g. 402, Outer Ring Road, Bellandur, Bengaluru"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Budget (₹ INR)</label>
                  <input
                    type="number"
                    value={editFormData.budgetAmount}
                    onChange={(e) => setEditFormData({ ...editFormData, budgetAmount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none font-mono"
                    placeholder="750000"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">GSTIN Number</label>
                  <input
                    type="text"
                    value={editFormData.gstin}
                    onChange={(e) => setEditFormData({ ...editFormData, gstin: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none font-mono"
                    placeholder="29AABCN1234F1Z5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={editFormData.pan}
                    onChange={(e) => setEditFormData({ ...editFormData, pan: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none font-mono"
                    placeholder="AABCN1234F"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Requirements Brief</label>
                <textarea
                  rows={2}
                  value={editFormData.requirementBrief}
                  onChange={(e) => setEditFormData({ ...editFormData, requirementBrief: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#11101a] border border-slate-200 dark:border-[#2e2c43] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                  placeholder="Notes on scope, timeline, current tech stack..."
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-[#2e2c43] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditLeadModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLeadEdit}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {savingLeadEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{savingLeadEdit ? 'Saving Changes...' : 'Save Dossier Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM IN-APP DEAL WON CONVERSION MODAL */}
      {showConvertConfirm && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <Trophy className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-base text-slate-900">1-Click Deal Won Automation</h3>
              <p className="text-xs text-slate-500">
                Are you ready to convert <span className="font-bold text-slate-800">{lead?.company_name}</span> to a Won Client?
              </p>
            </div>
            
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
              <p className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">Automated Actions on Conversion:</p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Provisions Client account in <code className="font-mono text-blue-600">crm_clients</code></span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Creates Active Project in Agency PM workspace</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Generates 40% Kickoff Advance GST Tax Invoice</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConvertConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={converting}
                onClick={handleExecuteConvertWon}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm flex items-center gap-1.5"
              >
                {converting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trophy className="w-3.5 h-3.5" />}
                <span>{converting ? 'Converting Deal...' : 'Yes, Convert Deal Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CADENCE TO SALES OPPORTUNITY CONVERSION MODAL */}
      {showCadenceConvertModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-200">
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
                      Promote <span className="font-bold text-white">{lead?.company_name}</span> from cold marketing cadence to your active Sales Pipeline.
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowCadenceConvertModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <ConvertDestination
                destination={convertDestination}
                onPipelineChange={(pipelineId) => {
                  setConvertPipelineId(pipelineId);
                  setConvertStageId('');
                }}
                onStageChange={setConvertStageId}
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Conversion Channel</label>
                <select
                  value={cadenceTargetChannel}
                  onChange={(e) => setCadenceTargetChannel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  <option value="cold_sop">Cold SOP</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="phone_call">Phone Call</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Deal Value (₹ INR)</label>
                  <input
                    type="number"
                    value={cadenceDealValue}
                    onChange={(e) => setCadenceDealValue(e.target.value)}
                    placeholder="e.g. 250000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lead Temperature</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCadenceTemperature('HOT')}
                      className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        cadenceTemperature === 'HOT'
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>HOT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCadenceTemperature('WARM')}
                      className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        cadenceTemperature === 'WARM'
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>WARM</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Handover Notes</label>
                <textarea
                  rows={2}
                  value={cadenceNotes}
                  onChange={(e) => setCadenceNotes(e.target.value)}
                  placeholder="Record prospect interest, requested discussion points..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Converting takes this lead out of the outreach cadence and puts it on the <strong>Sales Pipeline</strong> board{convertDestination.pipeline ? <> under <strong>{convertDestination.pipeline.name}</strong></> : null}.
                </span>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCadenceConvertModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={convertingCadenceOpp || !convertDestination.stage}
                onClick={handleExecuteConvertCadenceOpportunity}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 rounded-xl shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {convertingCadenceOpp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trophy className="w-3.5 h-3.5" />}
                <span>{convertingCadenceOpp ? 'Converting...' : '🚀 Confirm & Handoff to Sales Pipeline'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP SEND TEMPLATE MODAL */}
      <WhatsAppSendModal
        isOpen={showWhatsAppTemplateModal}
        onClose={() => setShowWhatsAppTemplateModal(false)}
        crmTemplates={availableCrmTemplates}
        leadContext={lead ? {
          id: lead.id,
          name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company_name,
          company: lead.company_name,
          phone: lead.whatsapp_number || lead.phone,
          email: lead.email,
          service: lead.primary_service,
        } : null}
        onSent={() => {
          fetchLead360();
          onRefreshParent?.();
        }}
      />

    </div>
  );
}
