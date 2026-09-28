import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { 
  Users, Kanban, Clock, FileText, Settings2, Plus,
  RefreshCw, TrendingUp, Trophy, AlertTriangle, Sparkles, Building2,
  X, Check, CheckCircle2, UserCheck, ShieldAlert, ShieldCheck, ArrowRight, Video, Phone,
  List, Calendar, Mail
} from 'lucide-react';
import { usePayroll } from '../../context/PayrollContext';
import { useAuth } from '../../context/AuthContext';
import LeadsDirectory from '../../components/crm/LeadsDirectory';
import PipelineKanban, { BoardFocusRequest } from '../../components/crm/PipelineKanban';
import WonDealsView from '../../components/crm/WonDealsView';
import { dealWonMessage, isInOutreach } from '../../components/crm/pipelineBoard';
import FollowupsAndMeetings from '../../components/crm/FollowupsAndMeetings';
import QuotationsManager from '../../components/crm/QuotationsManager';
import CRMAnalytics from '../../components/crm/CRMAnalytics';
import CRMMastersManager from '../../components/crm/CRMMastersManager';
import Lead360Drawer from '../../components/crm/Lead360Drawer';
import CreateLeadModal from '../../components/crm/CreateLeadModal';
import SLeadCadenceCenter from '../../components/crm/SLeadCadenceCenter';
import CrmAuditTrailView from '../../components/crm/CrmAuditTrailView';

import { apiFetch } from '../../api/client';
import { toast } from '../../lib/toast';
const TAB_CONFIG: Record<string, { title: string; desc: string }> = {
  'cold-funnel': {
    title: 'Client Outreach',
    desc: '30-Day Multi-Channel Outbound Marketing Funnel (WhatsApp, Email, LinkedIn, Phone).'
  },
  pipeline: {
    title: 'Sales Pipelines',
    desc: 'Real-time Kanban & list view, stage automation, and lead management.'
  },
  activities: {
    title: 'Follow-ups & Meetings',
    desc: 'Schedule, track, and log calls, follow-ups, and client meetings.'
  },
  proposals: {
    title: 'Quotations',
    desc: 'Generate, manage, and dispatch professional service quotations.'
  },
  reports: {
    title: 'Reports & Analytics',
    desc: 'Conversion velocity, pipeline analytics, and sales performance insights.'
  },
  masters: {
    title: 'CRM Taxonomy & Workflow Masters',
    desc: 'Configure sales pipelines, stage milestones, lead sources, and multi-tier industry tax records.'
  },
  'audit-trail': {
    title: 'Audit Trail & Activity Center',
    desc: 'Tamper-proof log of every employee activity, field update diff, connection, and session for accountability.'
  }
};

type CrmTab = 'cold-funnel' | 'pipeline' | 'activities' | 'proposals' | 'reports'  | 'audit-trail' | 'masters';

function CRMEnterpriseContent() {
  const { crmTab, setCrmTab, navigateTo } = usePayroll();
  const { canOpen } = useAuth();
  const [activeTab, setActiveTab] = useState<CrmTab>(crmTab || 'pipeline');
  const [pipelineView, setPipelineView] = useState<'kanban' | 'list' | 'won'>('kanban');
  // "Show on board" for a lead just created: the board selects its pipeline and highlights it.
  const [boardFocus, setBoardFocus] = useState<BoardFocusRequest | null>(null);
  const clearBoardFocus = useCallback(() => setBoardFocus(null), []);
  // Leads converted from Client Outreach in this visit. The workspace loads only the newest 100
  // leads, so an older lead that was just converted is kept on the board until the next reload.
  const [convertedLeads, setConvertedLeads] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [salesPersons, setSalesPersons] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [tenantName, setTenantName] = useState<string>('Voogyo');
  const [loading, setLoading] = useState(true);

  // Global Direct Add Lead Modal
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);

  // Sub-module modal states triggered from the unified top '+' button
  const [isScheduleFollowupOpen, setIsScheduleFollowupOpen] = useState(false);
  const [isCreateQuotationOpen, setIsCreateQuotationOpen] = useState(false);

  // Activities, Quotations & Cadence data for contextual top mini dashboards
  const [followups, setFollowups] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [cadenceStats, setCadenceStats] = useState<any>(null);

  // Cross-submodule state ("Do Anything From Anywhere")
  const [selectedLead360Id, setSelectedLead360Id] = useState<string | null>(null);
  const [quotationInitialLeadId, setQuotationInitialLeadId] = useState<string | null>(null);
  const [autoOpenQuotation, setAutoOpenQuotation] = useState(false);
  const [followupInitialLeadId, setFollowupInitialLeadId] = useState<string | null>(null);
  const [followupAutoOpenType, setFollowupAutoOpenType] = useState<'followup' | 'meeting' | null>(null);
  const [kanbanInitialFilterStageId, setKanbanInitialFilterStageId] = useState<string | null>(null);
  const [leadsInitialFilterStageId, setLeadsInitialFilterStageId] = useState<string | null>(null);
  const [leadsAutoOpenAdd, setLeadsAutoOpenAdd] = useState(false);

  // Central Reassign Modal
  const [reassignLeadTarget, setReassignLeadTarget] = useState<any | null>(null);
  const [reassignSelectedUserId, setReassignSelectedUserId] = useState<string>('');
  const [reassignLoading, setReassignLoading] = useState(false);

  // Central 1-Click Convert Won Modal
  const [globalDealWonModalOpen, setGlobalDealWonModalOpen] = useState(false);
  const [selectedWonLeadId, setSelectedWonLeadId] = useState<string>('');
  const [convertingWon, setConvertingWon] = useState(false);

  // Toast feedback

  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'error' ? toast.error(text) : toast.success(text);

  const handleTabChange = (tab: CrmTab) => {
    setActiveTab(tab);
    setCrmTab(tab);
  };

  // Sync tab with context updates (e.g. from Sidebar clicks or initial URL parse)
  useEffect(() => {
    if (crmTab && ['pipeline', 'activities', 'proposals', 'reports', 'masters', 'cold-funnel', 'audit-trail'].includes(crmTab)) {
      setActiveTab(crmTab as CrmTab);
    }
  }, [crmTab]);

  // Sync tab and action with URL search parameters
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const tabFromUrl = searchParams.get('tab');
      if (tabFromUrl && ['pipeline', 'activities', 'proposals', 'reports', 'masters', 'cold-funnel', 'audit-trail'].includes(tabFromUrl)) {
        setActiveTab(tabFromUrl as CrmTab);
        setCrmTab(tabFromUrl as CrmTab);
      }

      const actionFromUrl = searchParams.get('action');
      if (actionFromUrl === 'new_lead') {
        setIsAddLeadOpen(true);
      } else if (actionFromUrl === 'new_quotation') {
        setIsCreateQuotationOpen(true);
        setAutoOpenQuotation(true);
      } else if (actionFromUrl === 'new_followup') {
        setIsScheduleFollowupOpen(true);
      } else if (actionFromUrl === 'new_meeting' || actionFromUrl === 'new_activity') {
        setFollowupAutoOpenType('meeting');
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for sidebar plus icon clicks
  useEffect(() => {
    const handleQuickAction = (e: any) => {
      const { action, tab } = e.detail || {};
      if (tab) {
        handleTabChange(tab);
      }
      if (action === 'new_lead') {
        setIsAddLeadOpen(true);
      } else if (action === 'new_quotation') {
        setIsCreateQuotationOpen(true);
        setAutoOpenQuotation(true);
      } else if (action === 'new_followup') {
        setIsScheduleFollowupOpen(true);
      } else if (action === 'new_meeting' || action === 'new_activity') {
        setFollowupAutoOpenType('meeting');
      }
    };

    window.addEventListener('crm-quick-action', handleQuickAction);
    return () => {
      window.removeEventListener('crm-quick-action', handleQuickAction);
    };
  }, []);

  const handleTopPlusAction = () => {
    if (activeTab === 'pipeline' || activeTab === 'cold-funnel') {
      setIsAddLeadOpen(true);
    } else if (activeTab === 'activities') {
      setIsScheduleFollowupOpen(true);
    } else if (activeTab === 'proposals') {
      setIsCreateQuotationOpen(true);
    }
  };

  const getTopPlusTitle = () => {
    if (activeTab === 'pipeline') return 'Add Lead';
    if (activeTab === 'cold-funnel') return 'Add Cold Lead';
    if (activeTab === 'activities') return 'Schedule Follow-up';
    if (activeTab === 'proposals') return 'Create Proposal';
    return 'Quick Add';
  };

  const fetchCRMData = async () => {
    setLoading(true);
    try {
      const [leadsRes, srvRes, fupRes, meetRes, quotesRes, authRes, cadenceRes] = await Promise.all([
        apiFetch('/api/v1/crm/leads?page=1&limit=100'),
        apiFetch('/api/v1/crm/masters/services'),
        apiFetch('/api/v1/crm/followups?page=1&limit=100'),
        apiFetch('/api/v1/crm/meetings?page=1&limit=100'),
        apiFetch('/api/v1/crm/quotations?page=1&limit=100'),
        apiFetch('/api/v1/auth/me'),
        apiFetch('/api/v1/crm/cadence')
      ]);

      const leadsJson = await leadsRes.json().catch(() => ({}));
      const srvJson = await srvRes.json().catch(() => ({}));
      const fupJson = await fupRes.json().catch(() => ({}));
      const meetJson = await meetRes.json().catch(() => ({}));
      const quotesJson = await quotesRes.json().catch(() => ({}));
      const authJson = await authRes.json().catch(() => ({}));
      const cadenceJson = await cadenceRes.json().catch(() => ({}));

      if (authJson.success && authJson.data?.tenant?.company_name) {
        setTenantName(authJson.data.tenant.company_name);
      }

      if (leadsJson.success && leadsJson.data) {
        setLeads(leadsJson.data.leads || []);
        setStages(leadsJson.data.stages || []);
        setPipelines(leadsJson.data.pipelines || []);
        setSources(leadsJson.data.sources || []);
        setSalesPersons(leadsJson.data.salesPersons || []);
        setClients(leadsJson.data.clients || []);
      } else if (leadsJson.leads) {
        setLeads(leadsJson.leads || []);
        setStages(leadsJson.stages || []);
        setPipelines(leadsJson.pipelines || []);
        setSources(leadsJson.sources || []);
        setSalesPersons(leadsJson.salesPersons || []);
        setClients(leadsJson.clients || []);
      } else if (Array.isArray(leadsJson)) {
        setLeads(leadsJson);
      }

      if (srvJson.success && srvJson.data) {
        setServices(srvJson.data || []);
      } else if (Array.isArray(srvJson)) {
        setServices(srvJson);
      }

      if (fupJson.success && fupJson.data) {
        setFollowups(fupJson.data || []);
      } else if (Array.isArray(fupJson)) {
        setFollowups(fupJson);
      }

      if (meetJson.success && meetJson.data) {
        setMeetings(meetJson.data || []);
      } else if (Array.isArray(meetJson)) {
        setMeetings(meetJson);
      }

      if (quotesJson.success && quotesJson.data) {
        setQuotations(quotesJson.data || []);
      } else if (Array.isArray(quotesJson)) {
        setQuotations(quotesJson);
      }

      if (cadenceJson.success && cadenceJson.data?.stats) {
        setCadenceStats(cadenceJson.data.stats);
      } else if (cadenceJson.stats) {
        setCadenceStats(cadenceJson.stats);
      }
    } catch (err) {
      console.error('Failed to load CRM enterprise data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, []);

  const boardLeads = useMemo(() => {
    const loaded = new Set(leads.map((l) => l.id));
    return [...convertedLeads.filter((l) => !loaded.has(l.id)), ...leads];
  }, [leads, convertedLeads]);

  const showOnBoard = (leadId: string, pipelineId: string | null) => {
    setPipelineView('kanban');
    handleTabChange('pipeline');
    setBoardFocus({ leadId, pipelineId, nonce: Date.now() });
  };

  /** After the server confirms a conversion: keep the lead visible and say where it went. */
  const handleLeadConverted = (result: any) => {
    const lead = result?.lead;
    if (!lead?.id) return;
    setConvertedLeads((current) => [lead, ...current.filter((l) => l.id !== lead.id)]);
    toast.success(result.message || `${lead.company_name} is now in the Sales Pipeline`, {
      actions: [
        { label: 'Open lead', onClick: () => setSelectedLead360Id(lead.id) },
        { label: 'Show in pipeline', onClick: () => showOnBoard(lead.id, result.pipeline?.id ?? lead.pipeline_id ?? null) },
      ],
    });
    fetchCRMData();
  };

  /** Says where a lead just created went, with a way to open it or see it there. */
  const announceNewLead = (lead: any) => {
    if (!lead?.id) return;
    const openLead = { label: 'Open lead', onClick: () => setSelectedLead360Id(lead.id) };
    if (isInOutreach(lead)) {
      toast.success(`Lead ${lead.lead_code} created and enrolled in Client Outreach`, {
        actions: [openLead, { label: 'Show in Outreach', onClick: () => handleTabChange('cold-funnel') }],
      });
      return;
    }
    const pipeline = pipelines.find((p) => p.id === lead.pipeline_id);
    const stage = stages.find((s) => s.id === lead.stage_id);
    toast.success(`Lead ${lead.lead_code} created in ${pipeline?.name ?? 'the pipeline'} › ${stage?.name ?? 'its first stage'}`, {
      actions: [
        openLead,
        { label: 'Show on board', onClick: () => showOnBoard(lead.id, lead.pipeline_id ?? null) },
      ],
    });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Cross-submodule action triggers
  const handleCreateQuotation = (leadId: string) => {
    setQuotationInitialLeadId(leadId);
    setAutoOpenQuotation(true);
    handleTabChange('proposals');
  };

  const handleScheduleMeeting = (leadId: string) => {
    setFollowupInitialLeadId(leadId);
    setFollowupAutoOpenType('meeting');
    handleTabChange('activities');
  };

  const handleScheduleFollowup = (leadId: string) => {
    setFollowupInitialLeadId(leadId);
    setFollowupAutoOpenType('followup');
    handleTabChange('activities');
  };

  const handleReassignSalesPerson = (lead: any) => {
    setReassignLeadTarget(lead);
    setReassignSelectedUserId(lead.assigned_user_id || lead.assigned_tenant_member_id || salesPersons[0]?.id || '');
  };

  const handleConfirmReassign = async () => {
    if (!reassignLeadTarget || !reassignSelectedUserId) return;
    setReassignLoading(true);
    try {
      const res = await apiFetch('/api/v1/crm/leads/bulk', {
        feedback: { success: false },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reassign',
          leadIds: [reassignLeadTarget.id],
          assignedUserId: reassignSelectedUserId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Lead reassigned to new sales representative!`, 'success');
        setReassignLeadTarget(null);
        fetchCRMData();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setReassignLoading(false);
    }
  };

  const handleConfirmGlobalConvertWon = async () => {
    if (!selectedWonLeadId) return;
    setConvertingWon(true);
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${selectedWonLeadId}/convert-won`, {
        feedback: { success: false },
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(dealWonMessage(data.data));
        setGlobalDealWonModalOpen(false);
        setSelectedWonLeadId('');
        fetchCRMData();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setConvertingWon(false);
    }
  };

  const handleSelectStageFromAnalytics = (stageId: string) => {
    setKanbanInitialFilterStageId(stageId);
    setLeadsInitialFilterStageId(stageId);
    handleTabChange('pipeline');
    setPipelineView('kanban');
  };

  const handleSelectWonFromAnalytics = () => {
    handleTabChange('pipeline');
    setPipelineView('list');
  };

  // Contextual Mini-Dashboard KPI Calculations
  // 1. Cold Funnel KPIs
  const totalCadenceEnrolled = cadenceStats?.totalEnrolled ?? leads.filter(l => l.temperature === 'COLD').length;
  const cadenceActionDue = (cadenceStats?.dueTodayCount || 0) + (cadenceStats?.overdueCount || 0);
  const cadenceActiveRunning = cadenceStats?.activeCount ?? leads.filter(l => l.temperature === 'COLD').length;
  const cadenceGraduated = cadenceStats?.convertedCount ?? leads.filter(l => l.temperature === 'WON' || l.is_won).length;

  // 2. Pipeline KPIs
  const activeLeads = leads.filter(l => !l.is_won && l.temperature !== 'WON' && !l.is_lost && l.temperature !== 'LOST');
  const activeDealsCount = activeLeads.length;
  const totalPipeline = activeLeads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
  const wonLeads = leads.filter(l => l.is_won || l.temperature === 'WON');
  const wonCount = wonLeads.length;
  const wonRevenue = wonLeads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
  const weightedForecast = activeLeads.reduce((acc, l) => {
    const stage = stages.find(s => s.id === l.stage_id);
    const prob = Number(stage?.stage_probability || l.win_probability || 20);
    return acc + (Number(l.budget_amount || 0) * prob / 100);
  }, 0);

  // 3. Activities & Meetings KPIs
  const pendingFollowupsCount = followups.filter(f => f.status === 'PENDING').length;
  const scheduledMeetingsCount = meetings.filter(m => m.status === 'SCHEDULED' || !m.status || m.status === 'PENDING').length;
  const overdueFollowupsCount = followups.filter(f => f.is_overdue || (f.status === 'PENDING' && new Date(f.scheduled_at) < new Date())).length;
  const completedActivitiesCount = followups.filter(f => f.status === 'COMPLETED').length + meetings.filter(m => m.status === 'COMPLETED').length;

  // 4. Quotations KPIs
  const totalQuotationsCount = quotations.length;
  const totalQuotationsValue = quotations.reduce((acc, q) => acc + Number(q.total_amount || q.grand_total || 0), 0);
  const acceptedQuotations = quotations.filter(q => ['ACCEPTED', 'WON', 'APPROVED'].includes(q.status));
  const acceptedQuotationsCount = acceptedQuotations.length;
  const acceptedQuotationsValue = acceptedQuotations.reduce((acc, q) => acc + Number(q.total_amount || q.grand_total || 0), 0);
  const inDiscussionQuotationsCount = quotations.filter(q => ['SENT', 'DRAFT', 'PENDING'].includes(q.status)).length;

  // 5. Reports KPIs
  const totalAllLeads = leads.length;
  const winRatePercent = totalAllLeads > 0 ? Math.round((wonCount / totalAllLeads) * 100) : 0;
  const avgDealSize = wonCount > 0 ? wonRevenue / wonCount : (totalAllLeads > 0 ? totalPipeline / totalAllLeads : 0);

  // 6. Masters KPIs
  const activeServicesCount = services.filter(s => s.is_active !== false).length;

  // Active unconverted leads for 1-Click Convert
  const unconvertedLeads = leads.filter(l => !l.is_won && l.temperature !== 'WON');

  // Each CRM area is its own sidebar item; the server decides which ones this member may open.
  if (!canOpen(`crm.${activeTab}`)) {
    return (
      <div role="status" className="max-w-xl mx-auto mt-10 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-lg font-bold text-slate-900">You don't have access to this part of the CRM</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your role doesn't include it. Choose another CRM item from the menu, or ask a workspace administrator for access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 relative p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">

      {/* Module Title & Top Controls Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-md border border-blue-200 uppercase tracking-wider">
                CRM
              </span>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                {activeTab === 'cold-funnel' ? 'Client Outreach' : (TAB_CONFIG[activeTab]?.title || 'Sales Pipelines')}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTab === 'cold-funnel' 
                ? `${tenantName} 30-Day Multi-Channel Outbound Marketing Funnel (WhatsApp, Email, LinkedIn, Phone).`
                : (TAB_CONFIG[activeTab]?.desc || 'Service-based CRM, 360° Lead Dossiers, Sales Pipelines')}
            </p>
          </div>

          {/* Controls: Contextual Mini Dashboards and Actionable '+' Button */}
          <div className="flex items-center gap-2.5 overflow-x-auto flex-wrap sm:flex-nowrap">
            {activeTab === 'cold-funnel' && (
              <>
                <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">Total Outreach Leads</span>
                  <span className="font-bold text-blue-900">{totalCadenceEnrolled}</span>
                </div>

                <div className={`px-3 py-1.5 rounded-xl text-xs border ${
                  cadenceActionDue > 0 ? 'bg-amber-50/90 border-amber-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className={`text-[10px] font-bold uppercase block ${
                    cadenceActionDue > 0 ? 'text-amber-700' : 'text-slate-400'
                  }`}>
                    Action Due / Overdue
                  </span>
                  <span className={`font-bold ${
                    cadenceActionDue > 0 ? 'text-amber-900 flex items-center gap-1.5' : 'text-slate-900'
                  }`}>
                    {cadenceActionDue > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                    {cadenceActionDue} Touchpoints
                  </span>
                </div>

                <div className="px-3 py-1.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs">
                  <span className="text-[10px] text-indigo-700 font-bold uppercase block">In Active Cadence</span>
                  <span className="font-bold text-indigo-900">{cadenceActiveRunning}</span>
                </div>

                <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Graduated to Deal</span>
                  <span className="font-bold text-emerald-900">{cadenceGraduated} Leads</span>
                </div>
              </>
            )}

            {activeTab === 'pipeline' && (
              <>
                <button
                  onClick={() => setGlobalDealWonModalOpen(true)}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>1-Click Deal Won</span>
                </button>

                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Active Deals</span>
                  <span className="font-bold text-slate-900">{activeDealsCount}</span>
                </div>

                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Pipeline Gross</span>
                  <span className="font-bold text-slate-900">{formatCurrency(totalPipeline)}</span>
                </div>

                <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">Weighted Forecast</span>
                  <span className="font-bold text-blue-900">{formatCurrency(weightedForecast)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setPipelineView('won')}
                  title="See every won deal"
                  className="px-3 py-1.5 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Deals Won · View</span>
                  <span className="font-bold text-emerald-900">{wonCount} ({formatCurrency(wonRevenue)})</span>
                </button>
              </>
            )}

            {activeTab === 'activities' && (
              <>
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Pending Follow-ups</span>
                  <span className="font-bold text-slate-900">{pendingFollowupsCount}</span>
                </div>

                <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">Client Meetings</span>
                  <span className="font-bold text-blue-900">{scheduledMeetingsCount}</span>
                </div>

                <div className={`px-3 py-1.5 rounded-xl text-xs border ${
                  overdueFollowupsCount > 0 ? 'bg-amber-50/90 border-amber-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className={`text-[10px] font-bold uppercase block ${
                    overdueFollowupsCount > 0 ? 'text-amber-700' : 'text-slate-400'
                  }`}>
                    Overdue Attention
                  </span>
                  <span className={`font-bold ${
                    overdueFollowupsCount > 0 ? 'text-amber-900 flex items-center gap-1.5' : 'text-slate-900'
                  }`}>
                    {overdueFollowupsCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                    {overdueFollowupsCount}
                  </span>
                </div>

                <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Completed</span>
                  <span className="font-bold text-emerald-900">{completedActivitiesCount}</span>
                </div>
              </>
            )}

            {activeTab === 'proposals' && (
              <>
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Quotes</span>
                  <span className="font-bold text-slate-900">{totalQuotationsCount}</span>
                </div>

                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Quoted Value</span>
                  <span className="font-bold text-slate-900">{formatCurrency(totalQuotationsValue)}</span>
                </div>

                <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Accepted Proposals</span>
                  <span className="font-bold text-emerald-900">{acceptedQuotationsCount} ({formatCurrency(acceptedQuotationsValue)})</span>
                </div>

                <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">In Discussion / Sent</span>
                  <span className="font-bold text-blue-900">{inDiscussionQuotationsCount}</span>
                </div>
              </>
            )}

            {activeTab === 'reports' && (
              <>
                <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Deal Win Rate</span>
                  <span className="font-bold text-emerald-900">{winRatePercent}%</span>
                </div>

                <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">Won Revenue</span>
                  <span className="font-bold text-blue-900">{formatCurrency(wonRevenue)}</span>
                </div>

                <div className="px-3 py-1.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs">
                  <span className="text-[10px] text-indigo-700 font-bold uppercase block">Avg Deal Size</span>
                  <span className="font-bold text-indigo-950">{formatCurrency(avgDealSize)}</span>
                </div>

                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Closed Deals</span>
                  <span className="font-bold text-slate-900">{wonCount} of {totalAllLeads} Leads</span>
                </div>
              </>
            )}

            {activeTab === 'masters' && (
              <>
                <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">Active Services</span>
                  <span className="font-bold text-blue-900">{activeServicesCount} R&D Services</span>
                </div>

                <div className="px-3 py-1.5 bg-purple-50/80 border border-purple-200 rounded-xl text-xs">
                  <span className="text-[10px] text-purple-700 font-bold uppercase block">Taxonomy Configured</span>
                  <span className="font-bold text-purple-900">20 Ind · 120+ Sub</span>
                </div>

                <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Pipeline Stages</span>
                  <span className="font-bold text-emerald-900">{stages.length} Active Stages</span>
                </div>

                <div className="px-3 py-1.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs">
                  <span className="text-[10px] text-amber-700 font-bold uppercase block">Outbound Cadence</span>
                  <span className="font-bold text-amber-900">10-Touch 30D SOP</span>
                </div>
              </>
            )}

            {activeTab === 'audit-trail' && (
              <>
                <div className="px-3 py-1.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs">
                  <span className="text-[10px] text-indigo-700 font-bold uppercase block">Activity Tracking</span>
                  <span className="font-bold text-indigo-900">100% Comprehensive</span>
                </div>
                <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Accountability</span>
                  <span className="font-bold text-emerald-900">Diffs & IP Enforced</span>
                </div>
              </>
            )}

            {/* Single Actionable '+' Button on Top */}
            {['pipeline', 'cold-funnel', 'proposals', 'activities'].includes(activeTab) && (
              <button
                type="button"
                onClick={handleTopPlusAction}
                className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center shadow-sm hover:shadow transition-all cursor-pointer shrink-0"
                title={getTopPlusTitle()}
                aria-label={getTopPlusTitle()}
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SUB-MODULE: CLIENT OUTREACH & 30-DAY CADENCE */}
      {activeTab === 'cold-funnel' && (
        <SLeadCadenceCenter
          onSelectLead360={(leadId) => setSelectedLead360Id(leadId)}
          onRefreshParent={fetchCRMData}
          pipelines={pipelines}
          stages={stages}
          onNavigateToPipeline={() => handleTabChange('pipeline')}
          tenantName={tenantName}
          onLeadConverted={handleLeadConverted}
        />
      )}

      {/* SUB-MODULE 1: SALES PIPELINES (KANBAN OR LIST VIEW) */}
      {activeTab === 'pipeline' && pipelineView === 'list' && (
        <LeadsDirectory
          leads={boardLeads}
          stages={stages}
          pipelines={pipelines}
          sources={sources}
          services={services}
          salesPersons={salesPersons}
          clients={clients}
          loading={loading}
          onRefresh={fetchCRMData}
          onSelectLead360={(leadId) => setSelectedLead360Id(leadId)}
          onCreateQuotation={handleCreateQuotation}
          onScheduleMeeting={handleScheduleMeeting}
          onScheduleFollowup={handleScheduleFollowup}
          onReassignSalesPerson={handleReassignSalesPerson}
          initialFilterStageId={leadsInitialFilterStageId}
          autoOpenAdd={leadsAutoOpenAdd}
          viewMode={pipelineView}
          onViewModeChange={(m) => setPipelineView(m)}
          onLeadCreated={announceNewLead}
        />
      )}

      {activeTab === 'pipeline' && pipelineView === 'won' && (
        <WonDealsView onBack={() => setPipelineView('kanban')} onSelectLead360={(leadId) => setSelectedLead360Id(leadId)} />
      )}

      {activeTab === 'pipeline' && pipelineView === 'kanban' && (
        <PipelineKanban
          leads={boardLeads}
          stages={stages}
          pipelines={pipelines}
          salesPersons={salesPersons}
          clients={clients}
          initialFilterStageId={kanbanInitialFilterStageId}
          onRefresh={fetchCRMData}
          onSelectLead360={(leadId) => setSelectedLead360Id(leadId)}
          onCreateQuotation={handleCreateQuotation}
          onScheduleMeeting={handleScheduleMeeting}
          onScheduleFollowup={handleScheduleFollowup}
          onReassignSalesPerson={handleReassignSalesPerson}
          viewMode={pipelineView}
          onViewModeChange={(m) => setPipelineView(m)}
          focusRequest={boardFocus}
          onFocusHandled={clearBoardFocus}
          onOpenOutreach={() => handleTabChange('cold-funnel')}
        />
      )}

      {/* SUB-MODULE 3: FOLLOW-UPS & MEETINGS */}
      {activeTab === 'activities' && (
        <FollowupsAndMeetings
          leads={leads}
          initialLeadId={followupInitialLeadId}
          autoOpenType={followupAutoOpenType}
          onRefreshParent={fetchCRMData}
          onSelectLead360={(leadId) => setSelectedLead360Id(leadId)}
          onCreateQuotation={handleCreateQuotation}
          isScheduleFollowupOpen={isScheduleFollowupOpen}
          onCloseScheduleFollowup={() => setIsScheduleFollowupOpen(false)}
        />
      )}

      {/* SUB-MODULE 4: QUOTATIONS & PROPOSALS */}
      {activeTab === 'proposals' && (
        <QuotationsManager
          leads={leads}
          services={services}
          initialLeadId={quotationInitialLeadId}
          autoOpenCreate={autoOpenQuotation || isCreateQuotationOpen}
          onCloseCreate={() => {
            setIsCreateQuotationOpen(false);
            setAutoOpenQuotation(false);
            setQuotationInitialLeadId(null);
          }}
          onRefreshParent={fetchCRMData}
          onSelectLead360={(leadId) => setSelectedLead360Id(leadId)}
          onScheduleMeeting={handleScheduleMeeting}
        />
      )}

      {/* SUB-MODULE 5: CRM ANALYTICS */}
      {activeTab === 'reports' && (
        <CRMAnalytics
          leads={leads}
          stages={stages}
          sources={sources}
          onSelectStage={handleSelectStageFromAnalytics}
          onSelectWon={handleSelectWonFromAnalytics}
          onSelectLead360={(leadId) => setSelectedLead360Id(leadId)}
        />
      )}

      {/* SUB-MODULE 6: CRM TAXONOMY & WORKFLOW MASTERS */}
      {activeTab === 'masters' && (
        <CRMMastersManager onRefreshParent={fetchCRMData} />
      )}

      {/* SUB-MODULE 7: COMPREHENSIVE CRM AUDIT TRAIL */}
      {activeTab === 'audit-trail' && (
        <CrmAuditTrailView onSelectLead360={(leadId: string) => setSelectedLead360Id(leadId)} />
      )}

      {/* GLOBAL 360° LEAD DOSSIER DRAWER */}
      {selectedLead360Id && (
        <Lead360Drawer
          leadId={selectedLead360Id}
          onClose={() => setSelectedLead360Id(null)}
          onRefreshParent={fetchCRMData}
          pipelines={pipelines}
          stages={stages}
          onLeadConverted={handleLeadConverted}
          onCreateQuotation={(leadId) => {
            setSelectedLead360Id(null);
            handleCreateQuotation(leadId);
          }}
        />
      )}

      {/* Central Reassign Assignee Modal */}
      {reassignLeadTarget && (
        <div className="fixed inset-0 !mt-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in-50 zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reassign Assignee</h3>
                  <p className="text-[11px] text-slate-500">Update lead ownership and SLA tracking</p>
                </div>
              </div>
              <button
                onClick={() => setReassignLeadTarget(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Lead Account</span>
              <span className="font-bold text-slate-900 text-sm">{reassignLeadTarget.company_name}</span>
              <span className="text-slate-500 block text-[11px] mt-0.5 font-mono">{reassignLeadTarget.lead_code}</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Select New Assignee *</label>
              <select
                value={reassignSelectedUserId}
                onChange={(e) => setReassignSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                {salesPersons.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    👤 {sp.first_name} {sp.last_name} ({sp.designation || 'Sales'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setReassignLeadTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReassign}
                disabled={reassignLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{reassignLoading ? 'Reassigning...' : 'Confirm Reassignment'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Central 1-Click Convert Won Modal */}
      {globalDealWonModalOpen && (
        <div className="fixed inset-0 !mt-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in-50 zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">1-Click Deal Won & Client Provisioning</h3>
                  <p className="text-[11px] text-slate-500">Instantly convert lead into active project & invoice</p>
                </div>
              </div>
              <button
                onClick={() => setGlobalDealWonModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Active Deal to Convert *</label>
              {unconvertedLeads.length === 0 ? (
                <p className="text-xs text-slate-500 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  All current leads have already been marked Won or Converted!
                </p>
              ) : (
                <select
                  value={selectedWonLeadId}
                  onChange={(e) => setSelectedWonLeadId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-100"
                >
                  <option value="">-- Choose Lead to Convert --</option>
                  {unconvertedLeads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company_name} — {formatCurrency(l.budget_amount)} ({l.stage_name || 'Active'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="text-xs text-slate-700 bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-2">
              <p className="font-bold text-amber-900">Automated Enterprise Provisioning Workflow:</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                <li>Create verified Customer record in <strong>crm_clients</strong></li>
                <li>Create an Active Project workspace in <strong>pm_projects</strong></li>
                <li>Generate a 40% Kickoff Advance Tax Invoice in <strong>finance_invoices</strong></li>
                <li>Update Pipeline status to <strong>Deal Won (Closed)</strong></li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setGlobalDealWonModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmGlobalConvertWon}
                disabled={convertingWon || !selectedWonLeadId}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>{convertingWon ? 'Converting...' : 'Execute 1-Click Convert'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Direct Create Lead Modal */}
      <CreateLeadModal
        isOpen={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        onSuccess={(lead) => {
          setIsAddLeadOpen(false);
          announceNewLead(lead);
          fetchCRMData();
        }}
        sources={sources}
        services={services}
        pipelines={pipelines}
        stages={stages}
        salesPersons={salesPersons}
        clients={clients}
      />
    </div>
  );
}

export const CrmWorkspaceView: React.FC = () => {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 font-medium">Loading CRM Enterprise...</div>}>
      <CRMEnterpriseContent />
    </Suspense>
  );
};

export default CrmWorkspaceView;
