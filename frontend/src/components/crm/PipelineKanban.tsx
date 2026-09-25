'use client';

import React, { useState } from 'react';
import { 
  Sparkles, ArrowRight, ArrowLeft, Building2, Trophy, Clock,
  Eye, Filter, Plus, ChevronDown, CheckCircle2, TrendingUp,
  Edit3, Trash2, X, Check, Palette, GripVertical, FileText,
  Calendar, UserCheck, Globe, Smartphone, Layers, Server,
  ShoppingBag, Code2, Cpu, Kanban, List
} from 'lucide-react';
import {
  useTenantIndustries,
  getIndustries,
  getSubIndustries,
  getIndustryLabel,
  getSubIndustryLabel
} from '@/lib/industryTaxonomy';
import { PhoneInputWithCountryCode } from './PhoneInputWithCountryCode';

import { apiFetch } from '../../api/client';
import { toast } from '../../lib/toast';
interface PipelineKanbanProps {
  leads: any[];
  stages: any[];
  pipelines: any[];
  salesPersons?: any[];
  clients?: any[];
  initialFilterStageId?: string | null;
  onRefresh: () => void;
  onSelectLead360?: (leadId: string) => void;
  onOpenLead?: (leadId: string) => void;
  onCreateQuotation?: (leadId: string) => void;
  onScheduleMeeting?: (leadId: string) => void;
  onScheduleFollowup?: (leadId: string) => void;
  onReassignSalesPerson?: (lead: any) => void;
  viewMode?: 'kanban' | 'list';
  onViewModeChange?: (mode: 'kanban' | 'list') => void;
}

export default function PipelineKanban({
  leads,
  stages,
  pipelines,
  salesPersons = [],
  clients = [],
  initialFilterStageId = null,
  onRefresh,
  onSelectLead360,
  onOpenLead,
  onCreateQuotation,
  onScheduleMeeting,
  onScheduleFollowup,
  onReassignSalesPerson,
  viewMode = 'kanban',
  onViewModeChange
}: PipelineKanbanProps) {
  const { industries, getSubIndustries, getIndustryLabel, getSubIndustryLabel } = useTenantIndustries();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(
    pipelines[0]?.id || ''
  );
  const [selectedSalesPerson, setSelectedSalesPerson] = useState<string>('ALL');
  const [selectedOrigin, setSelectedOrigin] = useState<'ALL' | 'EXISTING' | 'NEW'>('ALL');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('ALL');
  const [selectedSubIndustry, setSelectedSubIndustry] = useState<string>('ALL');


  // Drag state
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // On-the-fly stage creation modal
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [editingStage, setEditingStage] = useState<any | null>(null);
  const [stageFormData, setStageFormData] = useState({
    name: '',
    color: '#2563eb',
    stage_probability: 30,
    sla_duration_hours: 48,
  });

  // In-app deal won modal
  const [dealWonConfirmLead, setDealWonConfirmLead] = useState<any | null>(null);

  // Quick Edit Lead Modal State
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    industry: 'general',
    sub_industry: '',
    designation: '',
    email: '',
    phone: '',
    budget_amount: 0,
    assigned_user_id: '',
    stage_id: ''
  });
  const [savingLead, setSavingLead] = useState(false);

  const handleOpenEditLead = (lead: any) => {
    setEditingLead(lead);
    setEditFormData({
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      company_name: lead.company_name || '',
      industry: lead.industry || 'general',
      sub_industry: lead.sub_industry || '',
      designation: lead.designation || '',
      email: lead.email || '',
      phone: lead.phone || lead.whatsapp_number || '',
      budget_amount: Number(lead.budget_amount) || 0,
      assigned_user_id: lead.assigned_user_id || '',
      stage_id: lead.stage_id || stages[0]?.id || ''
    });
  };

  const handleSaveEditLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLead) return;
    setSavingLead(true);
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${editingLead.id}`, {
        feedback: { success: false },
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      if (res.ok) {
        showToast('Lead details updated successfully!');
        setEditingLead(null);
        onRefresh();
      }
    } catch {
      // Reported by the API client.
    } finally {
      setSavingLead(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'error' ? toast.error(text) : toast.success(text);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Domain styling and micro-icons for Service tags on Kanban cards
  const getServiceBadge = (serviceName?: string) => {
    const name = (serviceName || '').toLowerCase();
    
    if (name.includes('web') || name.includes('react') || name.includes('next') || name.includes('frontend') || name.includes('fullstack')) {
      return {
        icon: <Globe className="w-2.5 h-2.5 text-blue-600 shrink-0" />,
        bg: 'bg-blue-50 text-blue-800 border-blue-200/80',
        category: 'Web Engineering'
      };
    }
    if (name.includes('mobile') || name.includes('flutter') || name.includes('ios') || name.includes('android')) {
      return {
        icon: <Smartphone className="w-2.5 h-2.5 text-violet-600 shrink-0" />,
        bg: 'bg-violet-50 text-violet-800 border-violet-200/80',
        category: 'Mobile Apps'
      };
    }
    if (name.includes('ai') || name.includes('agent') || name.includes('automation') || name.includes('intelligence') || name.includes('generative')) {
      return {
        icon: <Sparkles className="w-2.5 h-2.5 text-amber-600 shrink-0" />,
        bg: 'bg-amber-50 text-amber-800 border-amber-200/80',
        category: 'AI & Automation'
      };
    }
    if (name.includes('erp') || name.includes('crm') || name.includes('cloud saas') || name.includes('enterprise') || name.includes('custom build')) {
      return {
        icon: <Layers className="w-2.5 h-2.5 text-indigo-600 shrink-0" />,
        bg: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
        category: 'Enterprise SaaS'
      };
    }
    if (name.includes('cloud') || name.includes('devops') || name.includes('infra') || name.includes('aws') || name.includes('gcp') || name.includes('k8s')) {
      return {
        icon: <Server className="w-2.5 h-2.5 text-cyan-600 shrink-0" />,
        bg: 'bg-cyan-50 text-cyan-800 border-cyan-200/80',
        category: 'Cloud Infrastructure'
      };
    }
    if (name.includes('seo') || name.includes('marketing') || name.includes('ads') || name.includes('branding') || name.includes('hospitality')) {
      return {
        icon: <TrendingUp className="w-2.5 h-2.5 text-emerald-600 shrink-0" />,
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        category: 'Digital Growth'
      };
    }
    if (name.includes('design') || name.includes('ui') || name.includes('ux') || name.includes('brand')) {
      return {
        icon: <Palette className="w-2.5 h-2.5 text-pink-600 shrink-0" />,
        bg: 'bg-pink-50 text-pink-800 border-pink-200/80',
        category: 'UI/UX Design'
      };
    }
    if (name.includes('commerce') || name.includes('shop') || name.includes('store') || name.includes('retail')) {
      return {
        icon: <ShoppingBag className="w-2.5 h-2.5 text-teal-600 shrink-0" />,
        bg: 'bg-teal-50 text-teal-800 border-teal-200/80',
        category: 'E-Commerce'
      };
    }
    if (name.includes('health') || name.includes('med') || name.includes('care')) {
      return {
        icon: <Cpu className="w-2.5 h-2.5 text-rose-600 shrink-0" />,
        bg: 'bg-rose-50 text-rose-800 border-rose-200/80',
        category: 'HealthTech Platform'
      };
    }

    return {
      icon: <Code2 className="w-2.5 h-2.5 text-slate-600 shrink-0" />,
      bg: 'bg-slate-50 text-slate-800 border-slate-200',
      category: 'IT Services'
    };
  };

  // Filter leads by pipeline, sales person, origin, and cold cadence isolation
  const pipelineLeads = leads.filter(l => {
    // Isolate unconverted cold marketing leads from active sales pipeline (permanently hidden)
    if (l.custom_attributes) {
      try {
        const parsed = typeof l.custom_attributes === 'string' ? JSON.parse(l.custom_attributes) : l.custom_attributes;
        if (parsed?.cadence && parsed.cadence.status !== 'CONVERTED' && !parsed.cadence.convertedToOpportunity) {
          return false; // Keep sales pipeline clean and isolated from cold marketing cadence
        }
      } catch {
        // ignore
      }
    }

    const matchesPipe = !l.pipeline_id || l.pipeline_id === selectedPipelineId;
    const matchesSales = selectedSalesPerson === 'ALL' || l.assigned_user_id === selectedSalesPerson;
    const matchesOrigin = 
      selectedOrigin === 'ALL' ||
      (selectedOrigin === 'EXISTING' && (l.is_existing_client || l.client_id)) ||
      (selectedOrigin === 'NEW' && !l.is_existing_client && !l.client_id);
    const matchesIndustry = selectedIndustry === 'ALL' || (l.industry || 'general') === selectedIndustry;
    const matchesSubIndustry = selectedSubIndustry === 'ALL' || (l.sub_industry || l.subIndustry || '') === selectedSubIndustry;

    return matchesPipe && matchesSales && matchesOrigin && matchesIndustry && matchesSubIndustry;
  });

  // Calculate Weighted Pipeline Forecast
  const totalPipelineValue = pipelineLeads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
  const weightedForecast = pipelineLeads.reduce((acc, l) => {
    const stage = stages.find(s => s.id === l.stage_id);
    const prob = Number(stage?.stage_probability || l.win_probability || 20);
    return acc + (Number(l.budget_amount || 0) * prob / 100);
  }, 0);

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStageId !== stageId) setDragOverStageId(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadId) return;

    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.stage_id === targetStageId) return;

    try {
      // Leads are updated with PUT; the move is announced only once it is saved.
      const stage = stages.find(s => s.id === targetStageId);
      const res = await apiFetch(`/api/v1/crm/leads/${leadId}`, {
        feedback: { success: `Lead moved to ${stage?.name ?? 'the new stage'}` },
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: targetStageId }),
      });
      if (res.ok) onRefresh();
    } catch {
      // Reported by the API client.
    } finally {
      setDraggedLeadId(null);
    }
  };

  // Stage CRUD directly from Kanban page
  const handleCreateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageFormData.name) return;

    try {
      const res = await apiFetch('/api/v1/crm/masters/stages', {
        feedback: { success: false },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_id: selectedPipelineId,
          name: stageFormData.name,
          color: stageFormData.color,
          stage_probability: Number(stageFormData.stage_probability),
          sla_duration_hours: Number(stageFormData.sla_duration_hours),
          sort_order: stages.length + 1
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowAddStageModal(false);
        setStageFormData({ name: '', color: '#2563eb', stage_probability: 30, sla_duration_hours: 48 });
        showToast('Stage added to pipeline!');
        onRefresh();
      }
    } catch {
      // Reported by the API client.
    }
  };

  const handleUpdateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage) return;

    try {
      const res = await apiFetch('/api/v1/crm/masters/stages', {
        feedback: { success: false },
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingStage.id,
          name: editingStage.name,
          color: editingStage.color,
          stage_probability: editingStage.stage_probability,
          sla_duration_hours: editingStage.sla_duration_hours
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingStage(null);
        showToast('Stage updated successfully!');
        onRefresh();
      }
    } catch {
      // Reported by the API client.
    }
  };

  const handleDeleteStage = async (stageId: string, stageName: string) => {
    const stageLeads = pipelineLeads.filter(l => l.stage_id === stageId);
    if (stageLeads.length > 0) {
      showToast(`Cannot delete this stage: move its ${stageLeads.length} deals out first.`, 'error');
      return;
    }

    try {
      const res = await apiFetch(`/api/v1/crm/masters/stages?id=${stageId}`, { method: 'DELETE', feedback: { success: false } });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Stage "${stageName}" deleted.`);
        onRefresh();
      }
    } catch {
      // Reported by the API client.
    }
  };

  const handleConfirmConvertWon = async () => {
    if (!dealWonConfirmLead) return;
    try {
      const res = await apiFetch(`/api/v1/crm/leads/${dealWonConfirmLead.id}/convert-won`, { method: 'POST', feedback: { success: false } });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🏆 Deal Won! Project: ${data.data.projectCode}, Invoice: ${data.data.invoiceNumber}`);
        setDealWonConfirmLead(null);
        onRefresh();
      }
    } catch {
      // Reported by the API client.
    }
  };

  return (
    <div className="space-y-4 relative">

      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-4">
        {/* Pipeline & Sales Person Selectors */}
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sales Pipeline</label>
            <select
              value={selectedPipelineId}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              className="mt-0.5 px-3 py-1.5 bg-slate-50 text-xs font-bold text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          {/* Assignee Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assignee</label>
            <select
              value={selectedSalesPerson}
              onChange={(e) => setSelectedSalesPerson(e.target.value)}
              className="mt-0.5 px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg focus:outline-none"
            >
              <option value="ALL">All Assignees</option>
              {salesPersons.map((sp) => (
                <option key={sp.id} value={sp.id}>👤 {sp.first_name} {sp.last_name}</option>
              ))}
            </select>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          {/* Industry Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Industry</label>
            <select
              value={selectedIndustry}
              onChange={(e) => {
                setSelectedIndustry(e.target.value);
                setSelectedSubIndustry('ALL');
              }}
              className="mt-0.5 px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg focus:outline-none max-w-[170px] truncate"
            >
              <option value="ALL">All Industries</option>
              {industries.map((ind) => (
                <option key={ind.id || ind.key} value={ind.name}>{ind.name}</option>
              ))}
            </select>
          </div>

          {/* Sub-Industry Filter (Cascading) */}
          {selectedIndustry !== 'ALL' && (
            <div className="animate-in fade-in duration-150">
              <label className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Sub-Industry</label>
              <select
                value={selectedSubIndustry}
                onChange={(e) => setSelectedSubIndustry(e.target.value)}
                className="mt-0.5 px-3 py-1.5 bg-indigo-50/70 text-xs font-semibold text-indigo-900 border border-indigo-200 rounded-lg focus:outline-none max-w-[190px] truncate"
              >
                <option value="ALL">All Sub-Industries</option>
                {getSubIndustries(selectedIndustry).map((sub) => (
                  <option key={sub.id || sub.key} value={sub.name}>{sub.name}</option>
                ))}
              </select>
            </div>
          )}


        </div>

        {/* Kanban / List View Toggle on Extreme Right */}
        {onViewModeChange && (
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/90 shadow-2xs shrink-0">
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

      {/* DRAGGABLE KANBAN BOARD */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-[600px]">
        {stages.map((stage) => {
          const stageLeads = pipelineLeads.filter(l => l.stage_id === stage.id);
          const stageValue = stageLeads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
          const isOver = dragOverStageId === stage.id;

          return (
            <div
              key={stage.id}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
              className={`w-72 shrink-0 rounded-xl p-3 border transition-all flex flex-col max-h-[750px] ${
                isOver 
                  ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-300' 
                  : 'bg-slate-100/70 border-slate-200/80'
              }`}
            >
              {/* Column Header with Inline Edit option */}
              <div className="pb-2.5 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ backgroundColor: stage.color || '#2563eb' }} 
                    />
                    <h3 className="text-xs font-bold text-slate-900 truncate max-w-[130px]" title={stage.name}>
                      {stage.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                      {stageLeads.length}
                    </span>

                    {/* Edit Stage Inline */}
                    <button
                      onClick={() => setEditingStage({ ...stage })}
                      className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700"
                      title="Edit stage settings"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>

                    {/* Delete Empty Stage */}
                    {stageLeads.length === 0 && (
                      <button
                        onClick={() => handleDeleteStage(stage.id, stage.name)}
                        className="p-1 hover:bg-white rounded text-slate-400 hover:text-red-600"
                        title="Delete empty stage"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mt-1.5">
                  <span>{formatCurrency(stageValue)}</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {stage.stage_probability}% Prob
                  </span>
                </div>
              </div>

              {/* Draggable Cards Container */}
              <div className="space-y-2.5 mt-3 overflow-y-auto pr-0.5 flex-1 min-h-[200px]">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-md transition-all space-y-2.5 group cursor-grab active:cursor-grabbing relative"
                  >
                    {/* Grip & Value & AI Score */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" />
                        <span className="text-xs font-bold text-slate-900">
                          {formatCurrency(lead.budget_amount)}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold rounded">
                        <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                        <span>{lead.ai_score || 70}</span>
                      </span>
                    </div>

                    {/* Company & Contact */}
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => onSelectLead360?.(lead.id)}
                          className="text-xs font-bold text-slate-900 hover:text-blue-600 text-left block leading-tight"
                        >
                          {lead.company_name}
                        </button>
                        {(lead.is_existing_client || lead.client_id) && (
                          <span className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded" title="Existing Customer Opportunity">
                            🔁 Repeat
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditLead(lead);
                          }}
                          className="text-[11px] text-slate-600 hover:text-blue-600 font-semibold flex items-center gap-1 group/edit text-left"
                          title="Click to edit First Name, Last Name, etc."
                        >
                          <span>{lead.first_name} {lead.last_name || ''}</span>
                          <Edit3 className="w-2.5 h-2.5 text-slate-400 group-hover/edit:text-blue-600" />
                        </button>
                      </div>

                      {/* Industry & Sub-Industry Tags */}
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <span className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded">
                          {getIndustryLabel(lead.industry)}
                        </span>
                        {lead.sub_industry && (
                          <span 
                            className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded truncate max-w-[150px]"
                            title={getSubIndustryLabel(lead.industry, lead.sub_industry)}
                          >
                            {getSubIndustryLabel(lead.industry, lead.sub_industry)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sales Person Avatar & Service Tag */}
                    <div className="flex items-center justify-between text-[10px] pt-1 gap-1">
                      {(() => {
                        const badge = getServiceBadge(lead.primary_service);
                        return (
                          <div 
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium ${badge.bg} truncate max-w-[130px] shadow-2xs`}
                            title={lead.primary_service || 'Service'}
                          >
                            {badge.icon}
                            <span className="truncate">{lead.primary_service || 'Service'}</span>
                          </div>
                        );
                      })()}

                      {/* Assignee badge (Clickable to Reassign) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onReassignSalesPerson) onReassignSalesPerson(lead);
                        }}
                        className="text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 px-1.5 py-0.5 rounded border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                        title="Click to reassign Assignee"
                      >
                        <span>👤</span>
                        <span className="hover:underline">
                          {lead.assigned_user_name || 'Unassigned'}
                        </span>
                      </button>
                    </div>

                    {/* Card Smart Quick Action Dock ("Do Anything From Anywhere") */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onSelectLead360?.(lead.id)}
                          className="text-[11px] text-slate-500 hover:text-blue-600 font-semibold flex items-center gap-1"
                          title="Open 360° Lead Dossier"
                        >
                          <Eye className="w-3 h-3" />
                          <span>360°</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditLead(lead);
                          }}
                          className="p-1 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded transition-colors"
                          title="Quick Edit Lead (First Name, Last Name, etc.)"
                        >
                          <Edit3 className="w-3 h-3 text-blue-500" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* 📄 Quick Quote */}
                        {onCreateQuotation && (
                          <button
                            onClick={() => onCreateQuotation(lead.id)}
                            className="p-1 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                            title="Generate Proposal for this lead"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* 📅 Quick Meeting */}
                        {(onScheduleMeeting || onScheduleFollowup) && (
                          <button
                            onClick={() => {
                              if (onScheduleMeeting) onScheduleMeeting(lead.id);
                              else if (onScheduleFollowup) onScheduleFollowup(lead.id);
                            }}
                            className="p-1 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded transition-colors"
                            title="Schedule Meeting / Follow-up"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* 👤 Quick Reassign */}
                        {onReassignSalesPerson && (
                          <button
                            onClick={() => onReassignSalesPerson(lead)}
                            className="p-1 hover:bg-violet-50 text-slate-400 hover:text-violet-600 rounded transition-colors"
                            title="Reassign Sales Rep"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* 🏆 1-Click Convert Won */}
                        {!lead.is_won && lead.temperature !== 'WON' && (
                          <button
                            onClick={() => setDealWonConfirmLead(lead)}
                            className="p-1 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded transition-colors"
                            title="1-Click Mark Won & Convert"
                          >
                            <Trophy className="w-3.5 h-3.5 text-amber-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {stageLeads.length === 0 && (
                  <div className="h-28 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-[11px] text-slate-400">
                    Drop cards here
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Quick Add Stage Column Placeholder */}
        <div
          onClick={() => setShowAddStageModal(true)}
          className="w-72 shrink-0 h-44 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 transition-all space-y-1.5"
        >
          <Plus className="w-6 h-6" />
          <span className="text-xs font-bold">Add New Stage</span>
        </div>
      </div>

      {/* ON-THE-FLY ADD STAGE MODAL */}
      {showAddStageModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase">Add New Pipeline Stage</h3>
              <button onClick={() => setShowAddStageModal(false)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleCreateStage} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Stage Name *</label>
                <input
                  type="text"
                  required
                  value={stageFormData.name}
                  onChange={(e) => setStageFormData({ ...stageFormData, name: e.target.value })}
                  placeholder="e.g. Solution Demo"
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Color (Hex)</label>
                  <input
                    type="text"
                    value={stageFormData.color}
                    onChange={(e) => setStageFormData({ ...stageFormData, color: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Win Prob %</label>
                  <input
                    type="number"
                    value={stageFormData.stage_probability}
                    onChange={(e) => setStageFormData({ ...stageFormData, stage_probability: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">SLA Duration (Hours)</label>
                <input
                  type="number"
                  value={stageFormData.sla_duration_hours}
                  onChange={(e) => setStageFormData({ ...stageFormData, sla_duration_hours: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStageModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg shadow-xs"
                >
                  Create Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STAGE MODAL */}
      {editingStage && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase">Edit Stage — {editingStage.name}</h3>
              <button onClick={() => setEditingStage(null)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleUpdateStage} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Stage Name *</label>
                <input
                  type="text"
                  required
                  value={editingStage.name}
                  onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Color (Hex)</label>
                  <input
                    type="text"
                    value={editingStage.color}
                    onChange={(e) => setEditingStage({ ...editingStage, color: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Win Prob %</label>
                  <input
                    type="number"
                    value={editingStage.stage_probability}
                    onChange={(e) => setEditingStage({ ...editingStage, stage_probability: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">SLA Duration (Hours)</label>
                <input
                  type="number"
                  value={editingStage.sla_duration_hours}
                  onChange={(e) => setEditingStage({ ...editingStage, sla_duration_hours: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStage(null)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg shadow-xs"
                >
                  Update Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEAL WON CONFIRMATION MODAL */}
      {dealWonConfirmLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Convert to Deal WON</h3>
                <p className="text-xs text-slate-500">1-Click Automated Provisioning</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              Convert deal for <strong className="text-slate-900">"{dealWonConfirmLead.company_name}"</strong> to WON? This will automatically provision a Client Account, Project workspace, and Advance Tax Invoice.
            </p>

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

      {/* QUICK EDIT LEAD MODAL */}
      {editingLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Edit Lead Details</h3>
                  <p className="text-[11px] text-slate-500">
                    Update First Name, Last Name, Company, or Assignee
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingLead(null)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditLead} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.first_name}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editFormData.last_name}
                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.company_name}
                    onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={editFormData.designation}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    placeholder="e.g. Managing Director"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Industry Sector</label>
                  <select
                    value={editFormData.industry || 'Manufacturing'}
                    onChange={(e) => {
                      const newInd = e.target.value;
                      const subs = getSubIndustries(newInd);
                      setEditFormData({ 
                        ...editFormData, 
                        industry: newInd, 
                        sub_industry: subs[0]?.name || subs[0]?.key || ''
                      });
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    {industries.map((ind) => (
                      <option key={ind.id || ind.key} value={ind.name}>{ind.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sub-Industry</label>
                  <select
                    value={editFormData.sub_industry || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, sub_industry: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    {getSubIndustries(editFormData.industry || 'Manufacturing').map((sub) => (
                      <option key={sub.id || sub.key} value={sub.name}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone / WhatsApp</label>
                  <PhoneInputWithCountryCode
                    value={editFormData.phone}
                    onChange={(val) => setEditFormData({ ...editFormData, phone: val })}
                    placeholder="98765 43210"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Deal Value (₹)</label>
                  <input
                    type="number"
                    value={editFormData.budget_amount}
                    onChange={(e) => setEditFormData({ ...editFormData, budget_amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assignee</label>
                  <select
                    value={editFormData.assigned_user_id}
                    onChange={(e) => setEditFormData({ ...editFormData, assigned_user_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    {salesPersons.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.first_name} {sp.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pipeline Stage</label>
                <select
                  value={editFormData.stage_id}
                  onChange={(e) => setEditFormData({ ...editFormData, stage_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                >
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingLead(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLead}
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  {savingLead ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
