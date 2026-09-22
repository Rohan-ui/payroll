'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Filter, Eye, Edit3, Trash2, ArrowRight, Sparkles,
  Phone, Mail, Building2, MapPin, Calendar, Clock, CheckCircle2,
  FileText, Trophy, X, ChevronRight, AlertCircle, RefreshCw, Send,
  Check, MoreVertical, ChevronLeft, UserCheck, ShieldAlert, Video,
  Globe, Smartphone, Layers, Server, TrendingUp, Palette, ShoppingBag,
  Code2, Cpu, Kanban, List, Snowflake, Download, Upload, Loader2
} from 'lucide-react';
import { ColdLeadImportModal } from './ColdLeadImportModal';
import {
  useTenantIndustries,
  getIndustries,
  getSubIndustries,
  getIndustryLabel,
  getSubIndustryLabel
} from '@/lib/industryTaxonomy';
import { PhoneInputWithCountryCode } from './PhoneInputWithCountryCode';

interface LeadsDirectoryProps {
  leads: any[];
  stages: any[];
  pipelines: any[];
  sources: any[];
  services: any[];
  salesPersons?: any[];
  clients?: any[];
  loading: boolean;
  onRefresh: () => void;
  onSelectLead360: (leadId: string) => void;
  onCreateQuotation?: (leadId: string) => void;
  onScheduleMeeting?: (leadId: string) => void;
  onScheduleFollowup?: (leadId: string) => void;
  onReassignSalesPerson?: (lead: any) => void;
  initialFilterStageId?: string | null;
  autoOpenAdd?: boolean;
  viewMode?: 'kanban' | 'list';
  onViewModeChange?: (mode: 'kanban' | 'list') => void;
}

export default function LeadsDirectory({
  leads,
  stages,
  pipelines,
  sources,
  services,
  salesPersons = [],
  clients = [],
  loading,
  onRefresh,
  onSelectLead360,
  onCreateQuotation,
  onScheduleMeeting,
  onScheduleFollowup,
  onReassignSalesPerson,
  initialFilterStageId,
  autoOpenAdd,
  viewMode = 'list',
  onViewModeChange
}: LeadsDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTemp, setFilterTemp] = useState<string>('ALL');
  const [filterStage, setFilterStage] = useState<string>('ALL');
  const [filterSalesPerson, setFilterSalesPerson] = useState<string>('ALL');
  const [filterOrigin, setFilterOrigin] = useState<'ALL' | 'NEW' | 'EXISTING'>('ALL');
  const [filterService, setFilterService] = useState<string>('ALL');
  const [filterIndustry, setFilterIndustry] = useState<string>('ALL');
  const [filterSubIndustry, setFilterSubIndustry] = useState<string>('ALL');

  const availableFilterSubIndustries = useMemo(() => {
    if (filterIndustry === 'ALL') return [];
    return getSubIndustries(filterIndustry);
  }, [filterIndustry]);

  // Cold Lead Isolation: isolate prospects currently in Cold Funnel cadence until converted
  const [includeColdFunnelLeads, setIncludeColdFunnelLeads] = useState(false);

  const isolatedColdCount = useMemo(() => {
    return leads.filter((l: any) => {
      try {
        if (l.custom_attributes) {
          const parsed = typeof l.custom_attributes === 'string' ? JSON.parse(l.custom_attributes) : l.custom_attributes;
          return parsed?.cadence && parsed.cadence.status !== 'CONVERTED' && !parsed.cadence.convertedToOpportunity;
        }
      } catch (e) {}
      return false;
    }).length;
  }, [leads]);

  const { industries, getSubIndustries, getIndustryLabel, getSubIndustryLabel } = useTenantIndustries();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Sync initialFilterStageId
  useEffect(() => {
    if (initialFilterStageId) {
      setFilterStage(initialFilterStageId);
      setCurrentPage(1);
    }
  }, [initialFilterStageId]);

  // Sync autoOpenAdd
  useEffect(() => {
    if (autoOpenAdd) {
      handleOpenAdd();
    }
  }, [autoOpenAdd]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Three-dot action menu open state (stores leadId or null)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // In-app custom confirmation modals
  const [deleteConfirmLead, setDeleteConfirmLead] = useState<any | null>(null);
  const [dealWonConfirmLead, setDealWonConfirmLead] = useState<any | null>(null);

  // In-app Toast notification state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Export & Import states
  const [isExporting, setIsExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleExportLeads = async () => {
    try {
      setIsExporting(true);
      showToast('Generating smart CRM leads export with dynamic masters...', 'success');
      const res = await fetch('/api/v1/crm/leads/export', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to generate export file from server');
      
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
    } catch (err: any) {
      console.error('Error exporting leads:', err);
      showToast('Failed to export leads: ' + err.message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLeadForEdit, setSelectedLeadForEdit] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    companyName: '',
    industry: 'general',
    sub_industry: '',
    firstName: '',
    lastName: '',
    designation: 'Director / Founder',
    email: '',
    phone: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    gstin: '',
    panNumber: '',
    sourceId: sources[0]?.id || 'src_web',
    primaryService: services[0]?.name || 'Enterprise Web App Development',
    budgetAmount: 350000,
    pipelineId: pipelines[0]?.id || 'pipe_rnd_main',
    stageId: stages[0]?.id || 'stage_1',
    assignedUserId: 'user_saloni',
    temperature: 'WARM',
    urgency: 'MEDIUM',
    requirementBrief: '',
    isExistingClient: false,
    clientId: ''
  });

  const defaultSalesHeadId = useMemo(() => {
    const head = salesPersons.find(
      (sp: any) =>
        sp.id === 'user_saloni' ||
        sp.designation?.toLowerCase().includes('director of sales') ||
        sp.designation?.toLowerCase().includes('sales head') ||
        sp.designation?.toLowerCase().includes('sales lead')
    );
    return head?.id || salesPersons[0]?.id || 'user_saloni';
  }, [salesPersons]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const handleOpenAdd = (defaultIsExistingClient: boolean = false) => {
    const firstClient = clients[0];
    if (defaultIsExistingClient && firstClient) {
      setFormData({
        companyName: firstClient.company_name,
        industry: firstClient.industry || 'information_technology',
        sub_industry: firstClient.sub_industry || 'saas_cloud',
        firstName: firstClient.contact_person?.split(' ')[0] || firstClient.company_name,
        lastName: firstClient.contact_person?.split(' ').slice(1).join(' ') || '',
        designation: 'Director / Founder',
        email: firstClient.email || '',
        phone: firstClient.phone || '',
        city: firstClient.city || 'Mumbai',
        state: firstClient.state || 'Maharashtra',
        gstin: firstClient.gstin || '',
        panNumber: firstClient.pan_number || '',
        sourceId: sources.find(s => s.id === 'src_existing_client')?.id || sources[0]?.id || 'src_ref',
        primaryService: services[0]?.name || 'Enterprise Web App Development',
        budgetAmount: 450000,
        pipelineId: pipelines[0]?.id || 'pipe_rnd_main',
        stageId: stages[0]?.id || 'stage_1',
        assignedUserId: defaultSalesHeadId,
        temperature: 'HOT',
        urgency: 'HIGH',
        requirementBrief: 'Repeat business / expansion project for existing client',
        isExistingClient: true,
        clientId: firstClient.id
      });
    } else {
      setFormData({
        companyName: '',
        industry: 'information_technology',
        sub_industry: 'saas_cloud',
        firstName: '',
        lastName: '',
        designation: 'Director / Founder',
        email: '',
        phone: '',
        city: 'Mumbai',
        state: 'Maharashtra',
        gstin: '',
        panNumber: '',
        sourceId: sources[0]?.id || 'src_web',
        primaryService: services[0]?.name || 'Enterprise Web App Development',
        budgetAmount: 350000,
        pipelineId: pipelines[0]?.id || 'pipe_rnd_main',
        stageId: stages[0]?.id || 'stage_1',
        assignedUserId: defaultSalesHeadId,
        temperature: 'WARM',
        urgency: 'MEDIUM',
        requirementBrief: '',
        isExistingClient: false,
        clientId: ''
      });
    }
    setShowAddModal(true);
  };

  const handleOpenEdit = (lead: any) => {
    setSelectedLeadForEdit(lead);
    setFormData({
      companyName: lead.company_name || '',
      industry: lead.industry || 'information_technology',
      sub_industry: lead.sub_industry || 'saas_cloud',
      firstName: lead.first_name || '',
      lastName: lead.last_name || '',
      designation: lead.designation || '',
      email: lead.email || '',
      phone: lead.phone || '',
      city: lead.city || 'Mumbai',
      state: lead.state || 'Maharashtra',
      gstin: lead.gstin || '',
      panNumber: lead.pan_number || '',
      sourceId: lead.source_id || sources[0]?.id || '',
      primaryService: lead.primary_service || services[0]?.name || '',
      budgetAmount: Number(lead.budget_amount) || 0,
      pipelineId: lead.pipeline_id || pipelines[0]?.id || '',
      stageId: lead.stage_id || stages[0]?.id || '',
      assignedUserId: lead.assigned_user_id || salesPersons[0]?.id || 'user_ravi',
      temperature: lead.temperature || 'WARM',
      urgency: lead.urgency || 'MEDIUM',
      requirementBrief: lead.requirement_brief || '',
      isExistingClient: !!lead.is_existing_client || !!lead.client_id,
      clientId: lead.client_id || ''
    });
    setOpenActionMenuId(null);
    setShowEditModal(true);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.firstName || !formData.email) {
      showToast('Company Name, Contact Person, and Email are required!', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        showToast(`Lead for "${formData.companyName}" qualified and created successfully!`);
        onRefresh();
      } else {
        showToast('Error: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Failed to save lead: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadForEdit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/crm/leads/${selectedLeadForEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: formData.companyName,
          industry: formData.industry,
          sub_industry: formData.sub_industry,
          first_name: formData.firstName,
          last_name: formData.lastName,
          designation: formData.designation,
          email: formData.email,
          phone: formData.phone,
          city: formData.city,
          state: formData.state,
          gstin: formData.gstin,
          pan_number: formData.panNumber,
          source_id: formData.sourceId,
          primary_service: formData.primaryService,
          budget_amount: formData.budgetAmount,
          pipeline_id: formData.pipelineId,
          stage_id: formData.stageId,
          assigned_user_id: formData.assignedUserId,
          temperature: formData.temperature,
          urgency: formData.urgency,
          requirement_brief: formData.requirementBrief,
          client_id: formData.isExistingClient ? (formData.clientId || null) : null,
          is_existing_client: formData.isExistingClient ? 1 : 0
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowEditModal(false);
        setSelectedLeadForEdit(null);
        showToast('Lead updated successfully!');
        onRefresh();
      } else {
        showToast('Error: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Failed to update lead: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmLead) return;
    try {
      const res = await fetch(`/api/v1/crm/leads/${deleteConfirmLead.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`Lead "${deleteConfirmLead.company_name}" has been deleted.`);
        setDeleteConfirmLead(null);
        onRefresh();
      } else {
        showToast('Delete failed: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Error deleting lead: ' + err.message, 'error');
    }
  };

  const handleAdvanceStage = async (lead: any) => {
    setOpenActionMenuId(null);
    const stageIds = stages.map(s => s.id);
    const currentIndex = stageIds.indexOf(lead.stage_id);
    if (currentIndex < 0 || currentIndex >= stageIds.length - 1) return;
    const nextStageId = stageIds[currentIndex + 1];

    try {
      await fetch(`/api/v1/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: nextStageId })
      });
      showToast(`Lead advanced to next stage.`);
      onRefresh();
    } catch (err) {
      console.error('Failed to advance stage', err);
    }
  };

  const handleConfirmConvertWon = async () => {
    if (!dealWonConfirmLead) return;
    try {
      const res = await fetch(`/api/v1/crm/leads/${dealWonConfirmLead.id}/convert-won`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🏆 Deal Won! Client created, Project: ${data.data.projectCode}, Invoice: ${data.data.invoiceNumber}`);
        setDealWonConfirmLead(null);
        onRefresh();
      } else {
        showToast('Conversion failed: ' + data.error, 'error');
      }
    } catch (err: any) {
      showToast('Error converting deal: ' + err.message, 'error');
    }
  };

  const handleBulkAction = async (payload: { action: string; [key: string]: any }) => {
    if (selectedLeadIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/v1/crm/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant_rnd_001',
          leadIds: selectedLeadIds,
          ...payload
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Bulk operation completed successfully!', 'success');
        setSelectedLeadIds([]);
        onRefresh();
      } else {
        showToast(data.error || 'Bulk operation failed', 'error');
      }
    } catch (err: any) {
      showToast('Failed to execute bulk action: ' + err.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  // Domain styling and micro-icons for Service column
  const getServiceBadge = (serviceName?: string) => {
    const name = (serviceName || '').toLowerCase();
    
    if (name.includes('web') || name.includes('react') || name.includes('next') || name.includes('frontend') || name.includes('fullstack')) {
      return {
        icon: <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />,
        bg: 'bg-blue-50/90 text-blue-900 border-blue-200/80',
        category: 'Web Engineering'
      };
    }
    if (name.includes('mobile') || name.includes('flutter') || name.includes('ios') || name.includes('android')) {
      return {
        icon: <Smartphone className="w-3.5 h-3.5 text-violet-600 shrink-0" />,
        bg: 'bg-violet-50/90 text-violet-900 border-violet-200/80',
        category: 'Mobile Apps'
      };
    }
    if (name.includes('ai') || name.includes('agent') || name.includes('automation') || name.includes('intelligence') || name.includes('generative')) {
      return {
        icon: <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
        bg: 'bg-amber-50/90 text-amber-900 border-amber-200/80',
        category: 'AI & Automation'
      };
    }
    if (name.includes('erp') || name.includes('crm') || name.includes('cloud saas') || name.includes('enterprise') || name.includes('custom build')) {
      return {
        icon: <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
        bg: 'bg-indigo-50/90 text-indigo-900 border-indigo-200/80',
        category: 'Enterprise SaaS'
      };
    }
    if (name.includes('cloud') || name.includes('devops') || name.includes('infra') || name.includes('aws') || name.includes('gcp') || name.includes('k8s')) {
      return {
        icon: <Server className="w-3.5 h-3.5 text-cyan-600 shrink-0" />,
        bg: 'bg-cyan-50/90 text-cyan-900 border-cyan-200/80',
        category: 'Cloud Infrastructure'
      };
    }
    if (name.includes('seo') || name.includes('marketing') || name.includes('ads') || name.includes('branding') || name.includes('hospitality')) {
      return {
        icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
        bg: 'bg-emerald-50/90 text-emerald-900 border-emerald-200/80',
        category: 'Digital Growth'
      };
    }
    if (name.includes('design') || name.includes('ui') || name.includes('ux') || name.includes('brand')) {
      return {
        icon: <Palette className="w-3.5 h-3.5 text-pink-600 shrink-0" />,
        bg: 'bg-pink-50/90 text-pink-900 border-pink-200/80',
        category: 'UI/UX Design'
      };
    }
    if (name.includes('commerce') || name.includes('shop') || name.includes('store') || name.includes('retail')) {
      return {
        icon: <ShoppingBag className="w-3.5 h-3.5 text-teal-600 shrink-0" />,
        bg: 'bg-teal-50/90 text-teal-900 border-teal-200/80',
        category: 'E-Commerce'
      };
    }
    if (name.includes('health') || name.includes('med') || name.includes('care')) {
      return {
        icon: <Cpu className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
        bg: 'bg-rose-50/90 text-rose-900 border-rose-200/80',
        category: 'HealthTech Platform'
      };
    }

    return {
      icon: <Code2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />,
      bg: 'bg-slate-50 text-slate-800 border-slate-200',
      category: 'IT Services'
    };
  };

  // Filtering
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.lead_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.primary_service?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.assigned_user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.sub_industry?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTemp = filterTemp === 'ALL' || lead.temperature === filterTemp;
    const matchesStage = filterStage === 'ALL' || lead.stage_id === filterStage;
    const matchesSales = filterSalesPerson === 'ALL' || lead.assigned_user_id === filterSalesPerson;
    const matchesService = filterService === 'ALL' || lead.primary_service === filterService;
    const matchesIndustry = filterIndustry === 'ALL' || lead.industry === filterIndustry;
    const matchesSubIndustry = filterSubIndustry === 'ALL' || lead.sub_industry === filterSubIndustry;
    const matchesOrigin = 
      filterOrigin === 'ALL' ||
      (filterOrigin === 'EXISTING' && (lead.is_existing_client || lead.client_id)) ||
      (filterOrigin === 'NEW' && !lead.is_existing_client && !lead.client_id);

    if (!matchesSearch || !matchesTemp || !matchesStage || !matchesSales || !matchesService || !matchesOrigin || !matchesIndustry || !matchesSubIndustry) {
      return false;
    }

    // Cold Funnel Isolation filter: exclude leads currently in cold cadence unless converted or toggle enabled
    if (!includeColdFunnelLeads) {
      try {
        if (lead.custom_attributes) {
          const parsed = typeof lead.custom_attributes === 'string'
            ? JSON.parse(lead.custom_attributes)
            : lead.custom_attributes;
          const cadence = parsed?.cadence;
          if (cadence && cadence.status !== 'CONVERTED' && !cadence.convertedToOpportunity) {
            return false;
          }
        }
      } catch (e) {}
    }

    return true;
  });

  // Pagination calculations
  const totalItems = filteredLeads.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedLeads = filteredLeads.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-4 relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-top duration-200 ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-600 text-white border-emerald-700' 
            : 'bg-red-600 text-white border-red-700'
        }`}>
          {toastMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Actions Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="Search leads by company, contact person, email, code, or assignee..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 focus:bg-white text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Filter Pills & Add Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Origin filter (Prospect vs Existing Client) */}
          <select
            value={filterOrigin}
            onChange={(e) => { setFilterOrigin(e.target.value as any); setCurrentPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">All Origins</option>
            <option value="EXISTING">🔁 Existing Clients ({leads.filter(l => l.is_existing_client || l.client_id).length})</option>
            <option value="NEW">🆕 New Prospects ({leads.filter(l => !l.is_existing_client && !l.client_id).length})</option>
          </select>

          {/* Assignee filter */}
          <select
            value={filterSalesPerson}
            onChange={(e) => { setFilterSalesPerson(e.target.value); setCurrentPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">All Assignees</option>
            {salesPersons.map((sp) => (
              <option key={sp.id} value={sp.id}>👤 {sp.first_name} {sp.last_name}</option>
            ))}
          </select>

          {/* Temperature filter */}
          <select
            value={filterTemp}
            onChange={(e) => { setFilterTemp(e.target.value); setCurrentPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">All Temperatures</option>
            <option value="HOT">🔥 Hot Leads</option>
            <option value="WARM">☀️ Warm Leads</option>
            <option value="COLD">❄️ Cold Leads</option>
            <option value="WON">🏆 Won</option>
          </select>

          {/* Stage filter */}
          <select
            value={filterStage}
            onChange={(e) => { setFilterStage(e.target.value); setCurrentPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">All Pipeline Stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Service filter */}
          <select
            value={filterService}
            onChange={(e) => { setFilterService(e.target.value); setCurrentPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">All Services</option>
            {services.map((srv) => (
              <option key={srv.id} value={srv.name}>{srv.name}</option>
            ))}
          </select>

          {/* Industry Sector filter */}
          <select
            value={filterIndustry}
            onChange={(e) => {
              setFilterIndustry(e.target.value);
              setFilterSubIndustry('ALL');
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">🏢 All Industries</option>
            {industries.map((ind) => (
              <option key={ind.id || ind.key} value={ind.name}>{ind.name}</option>
            ))}
          </select>

          {/* Cascading Sub-Industry filter */}
          {filterIndustry !== 'ALL' && availableFilterSubIndustries.length > 0 && (
            <select
              value={filterSubIndustry}
              onChange={(e) => { setFilterSubIndustry(e.target.value); setCurrentPage(1); }}
              className="px-2.5 py-1.5 bg-blue-50/70 text-xs border border-blue-200 rounded-lg text-blue-900 font-medium focus:outline-none animate-in fade-in-50"
            >
              <option value="ALL">All Sub-Industries ({availableFilterSubIndustries.length})</option>
              {availableFilterSubIndustries.map((sub) => (
                <option key={sub.id || sub.key} value={sub.name}>{sub.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={onRefresh}
            className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            title="Refresh Leads"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isolatedColdCount > 0 && (
            <button
              type="button"
              onClick={() => setIncludeColdFunnelLeads(!includeColdFunnelLeads)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                includeColdFunnelLeads
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}
              title={includeColdFunnelLeads ? 'Hide active cold funnel prospects' : 'Show active cold funnel prospects'}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{isolatedColdCount} Cold In Cadence ({includeColdFunnelLeads ? 'Shown' : 'Isolated'})</span>
            </button>
          )}

          <a
            href="/crm?tab=cold-funnel"
            className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all shrink-0"
            title="Open Client Outreach Cadence Radar"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Client Outreach</span>
          </a>

          {/* Import Leads Button */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer shrink-0"
            title="Import leads from Excel spreadsheet (.xlsx)"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>Import</span>
          </button>

          {/* Export Leads Button */}
          <button
            type="button"
            onClick={handleExportLeads}
            disabled={isExporting}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
            title="Export all CRM leads with 26 fields and live master taxonomy (.xlsx)"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
          </button>

          {/* Kanban / List View Toggle on Extreme Right */}
          {onViewModeChange && (
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/90 shadow-2xs shrink-0 ml-1">
              <button
                type="button"
                onClick={() => onViewModeChange('kanban')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'kanban'
                    ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/60'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                title="Switch to Kanban Board View"
              >
                <Kanban className={`w-3.5 h-3.5 ${viewMode === 'kanban' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>Kanban</span>
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/60'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                title="Switch to List View"
              >
                <List className={`w-3.5 h-3.5 ${viewMode === 'list' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>List</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={paginatedLeads.length > 0 && paginatedLeads.every(l => selectedLeadIds.includes(l.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const pageIds = paginatedLeads.map(l => l.id);
                        setSelectedLeadIds(prev => Array.from(new Set([...prev, ...pageIds])));
                      } else {
                        const pageIds = new Set(paginatedLeads.map(l => l.id));
                        setSelectedLeadIds(prev => prev.filter(id => !pageIds.has(id)));
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Select / Deselect all on current page"
                  />
                </th>
                <th className="py-3 px-4">Lead / Company</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Assignee</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Deal Value</th>
                <th className="py-3 px-4">Stage</th>
                <th className="py-3 px-4">Temp</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedLeads.map((lead) => (
                <tr 
                  key={lead.id} 
                  className={`transition-colors group ${
                    selectedLeadIds.includes(lead.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* Checkbox */}
                  <td className="py-3.5 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLeadIds(prev => [...prev, lead.id]);
                        } else {
                          setSelectedLeadIds(prev => prev.filter(id => id !== lead.id));
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>

                  {/* Lead Company */}
                  <td className="py-3.5 px-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => onSelectLead360(lead.id)}
                          className="font-bold text-slate-900 hover:text-blue-600 hover:underline text-left block"
                        >
                          {lead.company_name}
                        </button>
                        {(lead.is_existing_client || lead.client_id) && (
                          <span 
                            className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold rounded-md inline-flex items-center gap-0.5"
                            title="Opportunity from Existing Verified Customer"
                          >
                            🔁 Repeat Client
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="font-mono text-slate-500">{lead.lead_code}</span>
                        {(lead.city || lead.state) && (
                          <>
                            <span>•</span>
                            <span className="text-slate-500 flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5 text-slate-400 inline" />
                              {lead.city}{lead.city && lead.state ? ', ' : ''}{lead.state}
                            </span>
                          </>
                        )}
                      </div>
                      {(lead.industry || lead.sub_industry) && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {lead.industry && (
                            <span 
                              className="px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium rounded inline-flex items-center gap-1"
                              title={`Industry: ${getIndustryLabel(lead.industry)}`}
                            >
                              <span>🏢</span>
                              <span>{getIndustryLabel(lead.industry)}</span>
                            </span>
                          )}
                          {lead.sub_industry && (
                            <span 
                              className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[10px] font-medium rounded inline-flex items-center gap-1"
                              title={`Sub-Industry: ${getSubIndustryLabel(lead.industry, lead.sub_industry)}`}
                            >
                              <span>🔹</span>
                              <span>{getSubIndustryLabel(lead.industry, lead.sub_industry)}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Contact */}
                  <td className="py-3.5 px-4">
                    <div className="space-y-1.5 max-w-[230px]">
                      {/* Name & Designation */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">
                          {lead.first_name} {lead.last_name}
                        </span>
                        {lead.designation && (
                          <span 
                            className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-md border border-slate-200/80 leading-none truncate max-w-[120px]" 
                            title={lead.designation}
                          >
                            {lead.designation}
                          </span>
                        )}
                      </div>

                      {/* Interactive Channels */}
                      <div className="flex flex-col gap-1 text-[11px]">
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-600 transition-colors group/mail"
                            title={`Send email to ${lead.email}`}
                          >
                            <span className="p-0.5 bg-blue-50 text-blue-600 rounded group-hover/mail:bg-blue-100 shrink-0">
                              <Mail className="w-2.5 h-2.5" />
                            </span>
                            <span className="truncate max-w-[180px] font-medium">{lead.email}</span>
                          </a>
                        )}

                        {lead.phone && (
                          <a
                            href={`tel:${lead.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-emerald-600 transition-colors group/phone font-mono"
                            title={`Call ${lead.phone}`}
                          >
                            <span className="p-0.5 bg-emerald-50 text-emerald-600 rounded group-hover/phone:bg-emerald-100 shrink-0">
                              <Phone className="w-2.5 h-2.5" />
                            </span>
                            <span className="font-medium text-[11px]">{lead.phone}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Assignee */}
                  <td className="py-3.5 px-4">
                    <button
                      type="button"
                      onClick={() => onReassignSalesPerson && onReassignSalesPerson(lead)}
                      className="group/rep flex items-center gap-2 hover:bg-blue-50/80 p-1 -m-1 rounded-lg transition-all text-left cursor-pointer"
                      title="Click to reassign Assignee"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-700">
                        {lead.assigned_user_name ? lead.assigned_user_name.substring(0, 2).toUpperCase() : 'RS'}
                      </div>
                      <span className="text-xs font-semibold text-slate-800 group-hover/rep:text-blue-600 block leading-tight">
                        {lead.assigned_user_name || 'Ravi Shah'}
                      </span>
                    </button>
                  </td>

                  {/* Service */}
                  <td className="py-3.5 px-4">
                    {(() => {
                      const badge = getServiceBadge(lead.primary_service);
                      const srvMatch = services?.find(
                        (s: any) => s.name?.toLowerCase() === lead.primary_service?.toLowerCase()
                      );
                      const categoryLabel = srvMatch?.category || badge.category;
                      const sacCode = srvMatch?.sac_code;

                      return (
                        <div className="space-y-1 max-w-[230px]">
                          <div 
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${badge.bg} shadow-2xs hover:shadow-xs transition-all`}
                            title={lead.primary_service || 'Service'}
                          >
                            {badge.icon}
                            <span className="truncate max-w-[180px]">
                              {lead.primary_service || 'Enterprise Solution'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pl-0.5">
                            <span className="font-medium text-slate-600">{categoryLabel}</span>
                            {sacCode && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="font-mono text-[9px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200/70">
                                  SAC {sacCode}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>

                  {/* Deal Value (with integrated AI Score) */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">
                        {formatCurrency(lead.budget_amount)}
                      </span>
                      <span 
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/90 text-[10px] font-bold rounded-md shadow-2xs"
                        title={`AI Health Score: ${lead.ai_score || 70}/100`}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                        <span>{lead.ai_score || 70}</span>
                      </span>
                    </div>
                    {lead.win_probability && (
                      <p className="text-[10px] text-slate-500 mt-0.5">{lead.win_probability}% Win Prob</p>
                    )}
                  </td>

                  {/* Stage */}
                  <td className="py-3.5 px-4">
                    <span 
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold inline-flex items-center gap-1"
                      style={{ 
                        backgroundColor: `${lead.stage_color || '#3b82f6'}15`, 
                        color: lead.stage_color || '#3b82f6' 
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lead.stage_color || '#3b82f6' }} />
                      {lead.stage_name}
                    </span>
                  </td>

                  {/* Temperature & Cadence Milestone */}
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                        lead.temperature === 'HOT' ? 'bg-red-50 text-red-700 border border-red-200' :
                        lead.temperature === 'WARM' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        lead.temperature === 'WON' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}>
                        {lead.temperature === 'COLD' && <Snowflake className="w-2.5 h-2.5" />}
                        <span>{lead.temperature}</span>
                      </span>

                      {/* Cadence Indicator */}
                      {(() => {
                        let cad: any = null;
                        try {
                          if (lead.custom_attributes) {
                            const p = typeof lead.custom_attributes === 'string' ? JSON.parse(lead.custom_attributes) : lead.custom_attributes;
                            cad = p?.cadence;
                          }
                        } catch(e) {}

                        if (cad && cad.status === 'ACTIVE') {
                          return (
                            <span 
                              onClick={(e) => { e.stopPropagation(); onSelectLead360(lead.id); }}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-pointer hover:bg-indigo-100 flex items-center gap-1 transition-colors"
                              title="Active in Client Outreach Cadence. Click to view."
                            >
                              <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                              <span>Day {cad.currentDay || 1}</span>
                            </span>
                          );
                        } else if (lead.temperature === 'COLD') {
                          return (
                            <span 
                              onClick={(e) => { e.stopPropagation(); onSelectLead360(lead.id); }}
                              className="text-[9px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                              title="Click to enroll into Client Outreach Cadence"
                            >
                              + Enroll Funnel
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </td>

                  {/* SMART ACTIONS & THREE-DOT MENU */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Quick Quote */}
                      {onCreateQuotation && (
                        <button
                          onClick={() => onCreateQuotation(lead.id)}
                          className="p-1.5 hover:bg-purple-50 text-slate-400 hover:text-purple-600 rounded-lg transition-colors"
                          title="Create Quick Quotation"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Schedule Meeting */}
                      {(onScheduleMeeting || onScheduleFollowup) && (
                        <button
                          onClick={() => {
                            if (onScheduleMeeting) onScheduleMeeting(lead.id);
                            else if (onScheduleFollowup) onScheduleFollowup(lead.id);
                          }}
                          className="p-1.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors"
                          title="Schedule Meeting"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Three-dot dropdown menu */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenActionMenuId(openActionMenuId === lead.id ? null : lead.id)}
                          className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                          title="Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Floating Dropdown */}
                        {openActionMenuId === lead.id && (
                          <div className="absolute right-0 top-10 z-40 bg-white w-52 rounded-xl shadow-xl border border-slate-200 py-1.5 text-left text-xs animate-in fade-in-50 duration-150">
                            {/* View 360 */}
                            <button
                              onClick={() => { setOpenActionMenuId(null); onSelectLead360(lead.id); }}
                              className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              <span>View 360° Dossier</span>
                            </button>

                            {/* Create Quotation */}
                            {onCreateQuotation && (
                              <button
                                onClick={() => { setOpenActionMenuId(null); onCreateQuotation(lead.id); }}
                                className="w-full px-3 py-2 text-purple-700 hover:bg-purple-50 flex items-center gap-2 font-medium"
                              >
                                <FileText className="w-3.5 h-3.5 text-purple-600" />
                                <span>Create Quotation</span>
                              </button>
                            )}

                            {/* Schedule Meeting */}
                            {onScheduleMeeting && (
                              <button
                                onClick={() => { setOpenActionMenuId(null); onScheduleMeeting(lead.id); }}
                                className="w-full px-3 py-2 text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 font-medium"
                              >
                                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Schedule Meeting</span>
                              </button>
                            )}

                            {/* Reassign Assignee */}
                            {onReassignSalesPerson && (
                              <button
                                onClick={() => { setOpenActionMenuId(null); onReassignSalesPerson(lead); }}
                                className="w-full px-3 py-2 text-indigo-700 hover:bg-indigo-50 flex items-center gap-2 font-medium"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Reassign Assignee</span>
                              </button>
                            )}

                            {/* Edit */}
                            <button
                              onClick={() => handleOpenEdit(lead)}
                              className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                              <span>Edit Details</span>
                            </button>

                            {/* Advance */}
                            {!lead.is_won && (
                              <button
                                onClick={() => handleAdvanceStage(lead)}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Advance Stage</span>
                              </button>
                            )}

                            {/* Convert to Won */}
                            {!lead.is_won && lead.temperature !== 'WON' && (
                              <button
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  setDealWonConfirmLead(lead);
                                }}
                                className="w-full px-3 py-2 text-amber-700 hover:bg-amber-50 flex items-center gap-2 font-semibold"
                              >
                                <Trophy className="w-3.5 h-3.5 text-amber-600" />
                                <span>Mark Won & Convert</span>
                              </button>
                            )}

                            <div className="border-t border-slate-100 my-1" />

                            {/* Delete */}
                            <button
                              onClick={() => {
                                setOpenActionMenuId(null);
                                setDeleteConfirmLead(lead);
                              }}
                              className="w-full px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Lead</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}

              {paginatedLeads.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-medium">No leads found matching your criteria</p>
                    <button
                      onClick={() => handleOpenAdd(false)}
                      className="mt-3 px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add New Lead</span>
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-slate-900">{totalItems === 0 ? 0 : startIndex + 1}</strong> to{' '}
              <strong className="text-slate-900">{Math.min(startIndex + pageSize, totalItems)}</strong> of{' '}
              <strong className="text-slate-900">{totalItems}</strong> leads
            </span>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-slate-500">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Page Navigator */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                  currentPage === p
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* FLOATING SMART BULK ACTIONS DOCK */}
      {selectedLeadIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-4 text-xs animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shadow-xs">
              {selectedLeadIds.length}
            </span>
            <span className="font-semibold text-slate-200">Selected</span>
          </div>

          {/* Reassign Sales Rep */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Assign:</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkAction({ action: 'reassign', assignedUserId: e.target.value });
                  e.target.value = '';
                }
              }}
              disabled={bulkLoading}
              className="bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              defaultValue=""
            >
              <option value="" disabled>Choose Sales Rep...</option>
              {salesPersons.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.first_name} {sp.last_name}</option>
              ))}
            </select>
          </div>

          {/* Change Pipeline Stage */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Stage:</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkAction({ action: 'change_stage', stageId: e.target.value });
                  e.target.value = '';
                }
              }}
              disabled={bulkLoading}
              className="bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              defaultValue=""
            >
              <option value="" disabled>Move Stage...</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Temperature Chips */}
          <div className="flex items-center gap-1 border-l border-slate-700 pl-3">
            <button
              onClick={() => handleBulkAction({ action: 'change_temperature', temperature: 'HOT' })}
              disabled={bulkLoading}
              className="px-2 py-1 bg-red-950/70 hover:bg-red-900 border border-red-800/80 text-red-200 text-[11px] font-semibold rounded-md transition-colors"
            >
              🔥 Hot
            </button>
            <button
              onClick={() => handleBulkAction({ action: 'change_temperature', temperature: 'WARM' })}
              disabled={bulkLoading}
              className="px-2 py-1 bg-amber-950/70 hover:bg-amber-900 border border-amber-800/80 text-amber-200 text-[11px] font-semibold rounded-md transition-colors"
            >
              ☀️ Warm
            </button>
            <button
              onClick={() => handleBulkAction({ action: 'change_temperature', temperature: 'COLD' })}
              disabled={bulkLoading}
              className="px-2 py-1 bg-blue-950/70 hover:bg-blue-900 border border-blue-800/80 text-blue-200 text-[11px] font-semibold rounded-md transition-colors"
            >
              ❄️ Cold
            </button>
          </div>

          {/* Bulk Delete */}
          <button
            onClick={() => setShowBulkDeleteModal(true)}
            disabled={bulkLoading}
            className="px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1 border-l border-slate-700 pl-3"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {/* Clear selection */}
          <button
            onClick={() => setSelectedLeadIds([])}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors ml-1"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CUSTOM IN-APP BULK DELETE CONFIRMATION MODAL */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete {selectedLeadIds.length} Selected Leads?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete these <strong className="text-slate-900">{selectedLeadIds.length} leads</strong>? All associated notes, activities, and records will be deleted. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowBulkDeleteModal(false);
                  await handleBulkAction({ action: 'delete' });
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Bulk Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM IN-APP DELETE CONFIRMATION MODAL (NO BROWSER ALERT) */}
      {deleteConfirmLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Lead</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
              Are you sure you want to permanently delete lead <strong className="text-slate-900">"{deleteConfirmLead.company_name}"</strong> and its associated history, notes, and records?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmLead(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs"
              >
                Yes, Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM IN-APP DEAL WON CONFIRMATION MODAL (NO BROWSER ALERT) */}
      {dealWonConfirmLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Convert to Deal WON</h3>
                <p className="text-xs text-slate-500">1-Click Automated Provisioning</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-2">
              <p>Converting <strong className="text-slate-900">"{dealWonConfirmLead.company_name}"</strong> will automatically trigger:</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                <li>Create Client account in <strong>crm_clients</strong></li>
                <li>Create an Active Project workspace in <strong>pm_projects</strong></li>
                <li>Generate a 40% Kickoff Advance Tax Invoice in <strong>finance_invoices</strong></li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDealWonConfirmLead(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConvertWon}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Confirm Deal Won</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT LEAD MODAL */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">
                  {showAddModal ? 'Create New Lead (Enterprise CRM)' : 'Edit Lead Details'}
                </h3>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={showAddModal ? handleCreateLead : handleUpdateLead} className="p-6 space-y-4">
              {/* Lead Origin Selector (Available on both Add and Edit) */}
              <div className="space-y-3 pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Lead Origin / Client Type *</label>
                  <span className="text-[10px] text-slate-400">
                    {showEditModal ? 'Switch between new prospect and existing customer' : 'Choose lead origin'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        isExistingClient: false,
                        clientId: ''
                      });
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      !formData.isExistingClient
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>🆕 New Inbound Prospect</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const targetClient = clients.find(c => c.id === formData.clientId) || clients[0];
                      if (targetClient) {
                        setFormData({
                          ...formData,
                          isExistingClient: true,
                          clientId: targetClient.id,
                          companyName: targetClient.company_name,
                          firstName: targetClient.contact_person?.split(' ')[0] || targetClient.company_name,
                          lastName: targetClient.contact_person?.split(' ').slice(1).join(' ') || '',
                          email: targetClient.email || '',
                          phone: targetClient.phone || '',
                          city: targetClient.city || 'Mumbai',
                          state: targetClient.state || 'Maharashtra',
                          gstin: targetClient.gstin || '',
                          panNumber: targetClient.pan_number || '',
                          temperature: 'HOT',
                          urgency: 'HIGH',
                          requirementBrief: formData.requirementBrief || 'Repeat business / expansion project for existing client',
                          sourceId: sources.find(s => s.id === 'src_existing_client')?.id || formData.sourceId
                        });
                      } else {
                        setFormData({
                          ...formData,
                          isExistingClient: true
                        });
                      }
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      formData.isExistingClient
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>🔁 Existing Customer ({clients.length})</span>
                  </button>
                </div>

                {/* If Existing Client is chosen, show the Customer selection dropdown */}
                {formData.isExistingClient && (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 space-y-2 animate-in fade-in-50 duration-150">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-emerald-950">Select Existing Client / Customer *</label>
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/80 px-2 py-0.5 rounded-full">
                        Auto-fills verified billing & tax info
                      </span>
                    </div>
                    <select
                      value={formData.clientId}
                      onChange={(e) => {
                        const selected = clients.find(c => c.id === e.target.value);
                        if (selected) {
                          setFormData({
                            ...formData,
                            clientId: selected.id,
                            companyName: selected.company_name,
                            firstName: selected.contact_person?.split(' ')[0] || selected.company_name,
                            lastName: selected.contact_person?.split(' ').slice(1).join(' ') || '',
                            email: selected.email || '',
                            phone: selected.phone || '',
                            city: selected.city || 'Mumbai',
                            state: selected.state || 'Maharashtra',
                            gstin: selected.gstin || '',
                            panNumber: selected.pan_number || '',
                            temperature: 'HOT'
                          });
                        }
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold bg-white border border-emerald-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                    >
                      {clients.length === 0 ? (
                        <option value="">No existing clients found in system</option>
                      ) : (
                        clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            🏢 {c.company_name} — {c.contact_person} ({c.city || 'India'})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      💡 Repeat Deal: Creates a new pipeline opportunity linked to this customer. Existing financial history is preserved, and AI Win Probability is boosted to 85%+.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Company Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="e.g. Acme FinTech Technologies Ltd."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Industry Sector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Industry Sector *</label>
                  <select
                    value={formData.industry}
                    onChange={(e) => {
                      const newInd = e.target.value;
                      const subList = getSubIndustries(newInd);
                      setFormData({
                        ...formData,
                        industry: newInd,
                        sub_industry: subList[0]?.name || subList[0]?.key || ''
                      });
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {industries.map((ind) => (
                      <option key={ind.id || ind.key} value={ind.name}>{ind.name}</option>
                    ))}
                  </select>
                </div>

                {/* Sub-Industry */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sub-Industry Specialization</label>
                  <select
                    value={formData.sub_industry}
                    onChange={(e) => setFormData({ ...formData, sub_industry: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {getSubIndustries(formData.industry).map((sub) => (
                      <option key={sub.id || sub.key} value={sub.name}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                {/* Contact First Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="e.g. Rahul"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Contact Last Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="e.g. Sharma"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Business Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="rahul@acme.com"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone / Mobile</label>
                  <PhoneInputWithCountryCode
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val })}
                    placeholder="98765 43210"
                  />
                </div>

                {/* Assignee */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assignee *</label>
                  <select
                    value={formData.assignedUserId}
                    onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {salesPersons.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.first_name} {sp.last_name} {sp.id === 'user_saloni' ? '👑 (Sales Head)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Mumbai"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* State */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="Maharashtra"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* GSTIN */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    value={formData.gstin}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                    placeholder="27AAAAA0000A1Z5"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                {/* PAN */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">PAN (Optional)</label>
                  <input
                    type="text"
                    value={formData.panNumber}
                    onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                    placeholder="ABCDE1234F"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                {/* Primary Service */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Primary Service *</label>
                  <select
                    value={formData.primaryService}
                    onChange={(e) => {
                      const sel = services.find(s => s.name === e.target.value);
                      setFormData({ 
                        ...formData, 
                        primaryService: e.target.value,
                        budgetAmount: sel?.default_rate ? Number(sel.default_rate) : formData.budgetAmount
                      });
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.name}>{s.name} ({formatCurrency(s.default_rate)})</option>
                    ))}
                  </select>
                </div>

                {/* Deal Budget */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Deal Budget (INR ₹) *</label>
                  <input
                    type="number"
                    required
                    value={formData.budgetAmount}
                    onChange={(e) => setFormData({ ...formData, budgetAmount: Number(e.target.value) })}
                    placeholder="350000"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>

                {/* Lead Source */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lead Source *</label>
                  <select
                    value={formData.sourceId}
                    onChange={(e) => setFormData({ ...formData, sourceId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {sources.map((src) => (
                      <option key={src.id} value={src.id}>{src.name} ({src.channel})</option>
                    ))}
                  </select>
                </div>

                {/* Pipeline Stage */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Initial Stage *</label>
                  <select
                    value={formData.stageId}
                    onChange={(e) => setFormData({ ...formData, stageId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {stages.map((stg) => (
                      <option key={stg.id} value={stg.id}>{stg.name}</option>
                    ))}
                  </select>
                </div>

                {/* Temperature */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Deal Temperature</label>
                  <select
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="HOT">🔥 Hot (Immediate Requirement)</option>
                    <option value="WARM">☀️ Warm (Exploring Options)</option>
                    <option value="COLD">❄️ Cold (Long Term)</option>
                  </select>
                </div>

                {/* Urgency */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Urgency</label>
                  <select
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="HIGH">High (Within 15 Days)</option>
                    <option value="MEDIUM">Medium (Within 30–60 Days)</option>
                    <option value="LOW">Low (Next Quarter)</option>
                  </select>
                </div>

                {/* Brief */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Requirement Brief & Scope Notes</label>
                  <textarea
                    rows={3}
                    value={formData.requirementBrief}
                    onChange={(e) => setFormData({ ...formData, requirementBrief: e.target.value })}
                    placeholder="Enter project specifications, tech stack requirements, or client notes..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{showAddModal ? 'Save & Qualify Lead' : 'Update Lead'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Cold Lead Import Modal */}
      <ColdLeadImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          onRefresh();
          showToast('Leads imported successfully from Excel!');
        }}
      />
    </div>
  );
}
