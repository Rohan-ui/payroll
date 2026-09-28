'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  Settings2, Plus, Edit3, Trash2, CheckCircle2, RefreshCw, X,
  Layers, Tag, Flag, Briefcase, HelpCircle, Check, Palette, FileText,
  Users, MoreVertical, AlertTriangle, ShieldCheck, Mail, Phone, DollarSign,
  FolderKanban, GripVertical, Clock, MessageSquare, Send, Sparkles,
  ExternalLink, ChevronRight, Share2, Target, PhoneCall, ArrowUpDown,
  Eye, EyeOff, LayoutGrid, List, Info, Crown, Radio
} from 'lucide-react';
import WordDocumentEditor from './WordDocumentEditor';
import IndustriesMaster from './IndustriesMaster';
import LeadIntegrationsCenter from './LeadIntegrationsCenter';

import { apiFetch } from '../../api/client';
import { toast } from '../../lib/toast';
interface CRMMastersManagerProps {
  onRefreshParent: () => void;
}

/**
 * What the CRM API lets this screen change, per master. Tabs not listed, and
 * actions set to false, are shown read-only: there is no API to save them.
 */
const MASTER_ACTIONS: Record<string, { create: boolean; update: boolean; delete: boolean }> = {
  stages: { create: true, update: true, delete: true },
  services: { create: true, update: true, delete: true },
  sources: { create: true, update: true, delete: true },
  pipelines: { create: true, update: true, delete: true },
  sop_steps: { create: true, update: true, delete: true },
  sop_branches: { create: true, update: true, delete: true },
  lost_reasons: { create: true, update: true, delete: true },
  templates: { create: false, update: false, delete: true },
};
const canChange = (tab: string, action: 'create' | 'update' | 'delete') => MASTER_ACTIONS[tab]?.[action] ?? false;

export default function CRMMastersManager({ onRefreshParent }: CRMMastersManagerProps) {
  const [activeMasterTab, setActiveMasterTab] = useState<
    'industries' | 'stages' | 'pipelines' | 'sources' | 'services' | 'lost_reasons' | 'quotation_categories' | 'templates' | 'sop_steps' | 'sop_branches' | 'sales_persons' | 'integrations'
  >('industries');
  const [loading, setLoading] = useState(true);

  // SOP Steps View Mode: Simple Cards vs Detailed Table
  const [sopStepsViewMode, setSopStepsViewMode] = useState<'cards' | 'table'>('cards');
  // Card-level active preview channel tabs
  const [cardActiveChannel, setCardActiveChannel] = useState<Record<string, 'WHATSAPP' | 'EMAIL' | 'LINKEDIN' | 'PHONE'>>({});

  // Dynamic Variable Live Preview Test inputs in SOP modal
  const [testLeadVars, setTestLeadVars] = useState({
    firstName: 'Rahul',
    lastName: 'Sharma',
    companyName: 'TechCorp Pvt Ltd',
    assigneeName: 'Your sales rep',
    designation: 'VP of Technology',
    industry: 'IT & Software',
    portfolioLink: 'https://voogyo.com/work'
  });
  const [showVarTestInputs, setShowVarTestInputs] = useState(true);

  // Helper to interpolate merge tags in real time preview
  const interpolatePreview = (text: string) => {
    if (!text) return '';
    return text
      .replace(/\{\{First Name\}\}/gi, testLeadVars.firstName)
      .replace(/\{\{Last Name\}\}/gi, testLeadVars.lastName)
      .replace(/\{\{Full Name\}\}/gi, `${testLeadVars.firstName} ${testLeadVars.lastName}`)
      .replace(/\{\{Company Name\}\}/gi, testLeadVars.companyName)
      .replace(/\{\{Assignee Name\}\}/gi, testLeadVars.assigneeName)
      .replace(/\{\{Designation\}\}/gi, testLeadVars.designation)
      .replace(/\{\{Industry\}\}/gi, testLeadVars.industry)
      .replace(/\{\{Portfolio Link\}\}/gi, testLeadVars.portfolioLink);
  };

  // Master datasets
  const [sopSteps, setSopSteps] = useState<any[]>([]);
  const [sopBranches, setSopBranches] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [lostReasons, setLostReasons] = useState<any[]>([]);
  const [quotationCategories, setQuotationCategories] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [salesPersons, setSalesPersons] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sub-channel active tab in SOP Step modal
  const [sopModalActiveChannel, setSopModalActiveChannel] = useState<'WHATSAPP' | 'EMAIL' | 'LINKEDIN' | 'PHONE'>('WHATSAPP');

  // Action menu open id
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; label: string; tab: string } | null>(null);
  // Why the server refused the delete, e.g. how many leads still use the record.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The objection strategy shown in full, read-only; focus goes back to its eye button on close.
  const [viewBranch, setViewBranch] = useState<any | null>(null);
  const viewBranchTrigger = useRef<HTMLButtonElement | null>(null);
  const viewBranchClose = useRef<HTMLButtonElement | null>(null);
  const closeViewBranch = () => {
    setViewBranch(null);
    viewBranchTrigger.current?.focus();
  };
  useEffect(() => {
    if (!viewBranch) return;
    viewBranchClose.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeViewBranch();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [viewBranch]);
  const [submitting, setSubmitting] = useState(false);

  // In-app Toast state

  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'error' ? toast.error(text) : toast.success(text);

  // Generic form fields
  const [formData, setFormData] = useState<any>({});

  const fetchAllMasters = async () => {
    setLoading(true);
    try {
      const [
        srcRes, stgRes, pipeRes, srvRes, lrRes, tmplRes, usrRes,
        sopStepsRes, sopBranchesRes
      ] = await Promise.all([
        apiFetch('/api/v1/crm/masters/sources'),
        apiFetch('/api/v1/crm/masters/stages'),
        apiFetch('/api/v1/crm/masters/pipelines'),
        apiFetch('/api/v1/crm/masters/services'),
        apiFetch('/api/v1/crm/masters/lost-reasons'),
        apiFetch('/api/v1/crm/quotation-templates'),
        apiFetch('/api/v1/users'),
        apiFetch('/api/v1/crm/masters/sop-steps'),
        apiFetch('/api/v1/crm/masters/sop-branches')
      ]);

      const [srcJ, stgJ, pipeJ, srvJ, lrJ, tmplJ, usrJ, sopStepsJ, sopBranchesJ] = await Promise.all([
        srcRes.json(),
        stgRes.json(),
        pipeRes.json(),
        srvRes.json(),
        lrRes.json(),
        tmplRes.json(),
        usrRes.json(),
        sopStepsRes.json(),
        sopBranchesRes.json()
      ]);

      if (srcJ.success) setSources(srcJ.data || []);
      if (stgJ.success) setStages(stgJ.data || []);
      if (pipeJ.success) setPipelines(pipeJ.data || []);
      if (srvJ.success) setServices(srvJ.data || []);
      if (lrJ.success) setLostReasons(lrJ.data || []);
      if (tmplJ.success) setTemplates(tmplJ.data || []);
      if (sopStepsJ.success) setSopSteps(sopStepsJ.data || []);
      if (sopBranchesJ.success) setSopBranches(sopBranchesJ.data || []);
      if (usrJ.success) {
        setSalesPersons(usrJ.data.users || []);
        setRoles(usrJ.data.roles || []);
      }
    } catch {
      // Reported by the API client.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllMasters();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // --- DRAG AND DROP HANDLERS ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch (err) {}
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = async (
    e: React.DragEvent,
    targetIndex: number,
    masterType: string,
    list: any[],
    setList: (newList: any[]) => void
  ) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...list];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    // Optimistically update list in UI
    setList(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Persist order in backend
    try {
      const orderedIds = updated.map((item) => item.id);
      const res = await apiFetch('/api/v1/crm/masters/reorder', {
        feedback: { success: false },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterType, orderedIds })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('New position saved successfully!', 'success');
        onRefreshParent();
      } else {
        fetchAllMasters();
      }
    } catch (err: any) {
      fetchAllMasters();
    }
  };

  const handleOpenAdd = () => {
    setOpenActionId(null);
    if (activeMasterTab === 'sop_steps') {
      const nextDay = sopSteps.length > 0 
        ? Math.max(...sopSteps.map((s: any) => Number(s.day_number) || 0)) + 5
        : 1;
      setFormData({
        day_number: nextDay,
        day_offset: Math.max(0, nextDay - 1),
        title: '',
        goal: '',
        channels: ['WHATSAPP', 'EMAIL'],
        timing_guide: 'WhatsApp (11:00 AM), Email (2:30 PM)',
        role_note: '',
        templates: {
          whatsapp: { message: 'Hi {{First Name}},\n\n' },
          email: { subject: 'Connecting with {{Company Name}}', body: 'Dear {{First Name}},\n\n' },
          linkedin: { actionType: 'CONNECT', message: 'Hi {{First Name}},\n\n' },
          phone: { pitchScript: '', afterCallTakenWhatsApp: '', missedCallWhatsApp: '' }
        },
        is_active: 1
      });
      setSopModalActiveChannel('WHATSAPP');
    } else if (activeMasterTab === 'sop_branches') {
      setFormData({
        branch_key: '',
        label: '',
        trigger_condition: '',
        next_lead_temperature: 'WARM',
        suggested_action: '',
        recommended_response_script: '',
        whatsapp_message: '',
        email_subject: '',
        email_body: '',
        is_active: 1
      });
    } else if (activeMasterTab === 'sources') {
      setFormData({ name: '', channel: 'Organic Search', is_active: 1 });
    } else if (activeMasterTab === 'stages') {
      setFormData({
        pipeline_id: pipelines[0]?.id ?? '',
        name: '',
        code: '',
        color: '#2563eb',
        stage_probability: 30,
        sort_order: stages.length + 1,
        sla_duration_hours: 48,
        is_won: 0,
        is_lost: 0,
        is_active: 1
      });
    } else if (activeMasterTab === 'pipelines') {
      setFormData({ name: '', code: '', is_default: 0, is_active: 1 });
    } else if (activeMasterTab === 'services') {
      setFormData({ name: '', category: 'IT & Software', sac_code: '998314', default_rate: 250000, is_active: 1 });
    } else if (activeMasterTab === 'lost_reasons') {
      setFormData({ reason_name: '', is_active: 1 });
    } else if (activeMasterTab === 'templates') {
      setFormData({
        name: '',
        category: quotationCategories[0]?.name || 'SaaS Platform Engineering',
        intro_content: '<h3>Executive Scope & Deliverables</h3><p>Proposal overview, scope deliverables, architecture specifications, and commercial terms for implementation.</p>',
        terms_content: 'Payment terms: 40% Advance, 40% UAT milestone, 20% Production launch.',
        default_items_json: JSON.stringify([
          { service_name: 'Architecture & Engineering', sac_code: '998314', qty: 1, unit_rate: 150000, amount: 150000 }
        ], null, 2),
        is_active: 1
      });
    }
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: any, initialChannel?: 'WHATSAPP' | 'EMAIL' | 'LINKEDIN' | 'PHONE') => {
    setOpenActionId(null);
    if (activeMasterTab === 'sop_steps') {
      const parsedTemplates = typeof item.templates === 'string' 
        ? JSON.parse(item.templates) 
        : (item.templates || {});
      const parsedChannels = typeof item.channels === 'string'
        ? JSON.parse(item.channels)
        : (item.channels || ['WHATSAPP']);
      setFormData({
        ...item,
        templates: parsedTemplates,
        channels: parsedChannels
      });
      setSopModalActiveChannel(initialChannel || parsedChannels[0] || 'WHATSAPP');
    } else if (activeMasterTab === 'templates') {
      setFormData({
        ...item,
        default_items_json: typeof item.default_items_json === 'string'
          ? item.default_items_json
          : JSON.stringify(item.default_items_json, null, 2)
      });
    } else {
      setFormData({ ...item });
    }
    setShowEditModal(true);
  };

  const getApiEndpoint = (tab = activeMasterTab) => {
    if (tab === 'sop_steps') return '/api/v1/crm/masters/sop-steps';
    if (tab === 'sop_branches') return '/api/v1/crm/masters/sop-branches';
    if (tab === 'sources') return '/api/v1/crm/masters/sources';
    if (tab === 'stages') return '/api/v1/crm/masters/stages';
    if (tab === 'pipelines') return '/api/v1/crm/masters/pipelines';
    if (tab === 'services') return '/api/v1/crm/masters/services';
    if (tab === 'lost_reasons') return '/api/v1/crm/masters/lost-reasons';
    if (tab === 'templates') return '/api/v1/crm/quotation-templates';
    return '/api/v1/users';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // A stage belongs to a pipeline, so there is nothing to attach it to until
    // one exists. Stopping here gives a useful message instead of a rejected
    // write against a missing reference.
    if (activeMasterTab === 'stages' && !formData.pipeline_id) {
      showToast('Create a pipeline first, then add stages to it.', 'error');
      return;
    }

    setSubmitting(true);
    const endpoint = getApiEndpoint();

    try {
      const method = showAddModal ? 'POST' : 'PUT';
      const res = await apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      // CRM endpoints report their own result; other endpoints are reported here.
      const reportsItself = endpoint.startsWith('/api/v1/crm/');
      if (!res.ok) {
        if (!reportsItself) showToast(data.message || data.error || 'Failed to save master record', 'error');
        return;
      }

      setShowAddModal(false);
      setShowEditModal(false);
      if (!reportsItself) showToast(showAddModal ? 'Record created successfully' : 'Record updated successfully');
      fetchAllMasters();
      onRefreshParent();
    } catch {
      if (!endpoint.startsWith('/api/v1/crm/')) showToast('Could not reach the server. Check your connection and try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmItem(null);
    setDeleteError(null);
  };

  const executeDelete = async () => {
    if (!deleteConfirmItem || deleting) return;
    const { id, tab } = deleteConfirmItem;
    const endpoint = `${getApiEndpoint(tab as any)}?id=${encodeURIComponent(id)}`;

    setDeleting(true);
    setDeleteError(null);
    try {
      // A refusal is shown in the dialog, where the user is looking.
      const res = await apiFetch(endpoint, { method: 'DELETE', feedback: { error: false } });
      if (res.ok) {
        closeDeleteConfirm();
        fetchAllMasters();
        onRefreshParent();
      } else {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.message || 'This record could not be deleted. Reload the page and try again.');
      }
    } catch {
      setDeleteError('Could not reach the server. Check your connection and try again.');
    } finally {
      setDeleting(false);
    }
  };

  // Helper to insert merge tag at cursor/end
  const insertMergeTag = (tag: string, fieldPath: string) => {
    const current = getDeepValue(formData, fieldPath) || '';
    setDeepValue(fieldPath, current + tag);
  };

  const getDeepValue = (obj: any, path: string) => {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  };

  const setDeepValue = (path: string, value: any) => {
    const parts = path.split('.');
    const updated = { ...formData };
    let cur = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = { ...(cur[parts[i]] || {}) };
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    setFormData(updated);
  };

  const toggleChannelSelection = (ch: string) => {
    const existing: string[] = formData.channels || [];
    if (existing.includes(ch)) {
      if (existing.length === 1) {
        showToast('At least one communication channel is required', 'error');
        return;
      }
      setFormData({ ...formData, channels: existing.filter((c) => c !== ch) });
    } else {
      setFormData({ ...formData, channels: [...existing, ch] });
    }
  };

  return (
    <div className="space-y-4">

      {/* Sub-Header & Navigation */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">CRM Master Configuration & Dropdowns</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure dropdown values, 30-Day SOP strategy & dynamic messages. Reorder any list from the backend by dragging and dropping.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" />
            <span>Drag & drop rows to reorder positions</span>
          </div>
          <button
            onClick={fetchAllMasters}
            className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-500 transition-colors"
            title="Refresh Masters"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          {canChange(activeMasterTab, 'create') && (
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Master</span>
            </button>
          )}
        </div>
      </div>

      {/* TABS HEADER */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-semibold scrollbar-none">
        {/* Dynamic Global CRM Industries */}
        <button
          onClick={() => { setActiveMasterTab('industries'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap font-bold ${
            activeMasterTab === 'industries'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Industries & Sub-Industries</span>
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1 flex-shrink-0" />

        {/* 30-Day SOP Funnel Steps */}
        <button
          onClick={() => { setActiveMasterTab('sop_steps'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'sop_steps'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>30-Day SOP Funnel ({sopSteps.length})</span>
        </button>

        {/* SOP Reply Branches */}
        <button
          onClick={() => { setActiveMasterTab('sop_branches'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'sop_branches'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>SOP Objection Strategies ({sopBranches.length})</span>
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1 flex-shrink-0" />

        {/* Pipeline Stages */}
        <button
          onClick={() => { setActiveMasterTab('stages'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'stages'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Pipeline Stages ({stages.length})</span>
        </button>

        {/* Pipelines */}
        <button
          onClick={() => { setActiveMasterTab('pipelines'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'pipelines'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Pipelines ({pipelines.length})</span>
        </button>

        {/* Lead Sources */}
        <button
          onClick={() => { setActiveMasterTab('sources'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'sources'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Lead Sources ({sources.length})</span>
        </button>

        {/* Services Master */}
        <button
          onClick={() => { setActiveMasterTab('services'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'services'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Services Master ({services.length})</span>
        </button>

        {/* Lost Reasons */}
        <button
          onClick={() => { setActiveMasterTab('lost_reasons'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'lost_reasons'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Lost Reasons ({lostReasons.length})</span>
        </button>

        {/* Quotation Templates */}
        <button
          onClick={() => { setActiveMasterTab('templates'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'templates'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Quotation Templates ({templates.length})</span>
        </button>

        {/* Assignee Master */}
        <button
          onClick={() => { setActiveMasterTab('sales_persons'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeMasterTab === 'sales_persons'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Assignees ({salesPersons.length})</span>
        </button>

        {/* APIs & Lead Channels */}
        <button
          onClick={() => { setActiveMasterTab('integrations'); setOpenActionId(null); }}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeMasterTab === 'integrations'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border hover:bg-slate-50'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-indigo-600" />
          <span>APIs & Lead Channels</span>
        </button>
      </div>

      {/* MASTER TABLES WITH DRAG AND DROP */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* 1. SOP STEPS MASTER (DAY 1 TO DAY 30) */}
        {activeMasterTab === 'sop_steps' && (
          <div className="space-y-3 p-4">
            {/* Top SOP Header with View Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm text-slate-900">30-Day Multi-Channel SOP Funnel</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
                    {sopSteps.length} Milestones
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Drag and drop cards or rows to re-order the milestone sequence. Click any card to edit strategies & templates.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* View Switcher: Cards vs Table */}
                <div className="bg-slate-100 p-0.5 rounded-lg flex items-center border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setSopStepsViewMode('cards')}
                    className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 transition-all ${
                      sopStepsViewMode === 'cards'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Timeline Cards (Simpler)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSopStepsViewMode('table')}
                    className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 transition-all ${
                      sopStepsViewMode === 'table'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Detailed Table</span>
                  </button>
                </div>

                {canChange('sop_steps', 'create') && (
                  <button
                    onClick={handleOpenAdd}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add SOP Step</span>
                  </button>
                )}
              </div>
            </div>

            {/* VIEW 1: TIMELINE CARDS (SIMPLE) */}
            {sopStepsViewMode === 'cards' && (
              <div className="space-y-3">
                {sopSteps.map((step, idx) => {
                  const channels: string[] = typeof step.channels === 'string' ? JSON.parse(step.channels) : (step.channels || []);
                  const templates = typeof step.templates === 'string' ? JSON.parse(step.templates) : (step.templates || {});
                  const currentChannel = cardActiveChannel[step.id] || (channels[0] as any) || 'WHATSAPP';

                  return (
                    <div
                      key={step.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, idx, 'sop_steps', sopSteps, setSopSteps)}
                      className={`rounded-xl border transition-all ${
                        draggedIndex === idx 
                          ? 'opacity-40 bg-blue-50/50 border-dashed border-blue-400' 
                          : dragOverIndex === idx 
                          ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-400' 
                          : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-xs'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40">
                        <div className="flex items-center gap-3">
                          <div 
                            className="text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-100" 
                            title="Drag to change step sequence"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-blue-600 text-white font-extrabold rounded-lg text-xs shadow-2xs">
                              Day {step.day_number}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              +{step.day_offset}d offset
                            </span>
                          </div>
                          <div>
                            <h5 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                              <span>{step.title}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${step.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                                {step.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </h5>
                            <p className="text-xs text-slate-500 font-medium">{step.goal}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-7 md:ml-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(step, currentChannel)} disabled={!canChange(activeMasterTab, 'update')}
                            className="disabled:hidden px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 flex items-center gap-1.5 transition-colors shadow-2xs"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Strategy & Messages</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmItem({ id: step.id, label: `Day ${step.day_number}: ${step.title}`, tab: 'sop_steps' })} disabled={!canChange(activeMasterTab, 'delete')}
                            className="disabled:hidden p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                            title="Delete Step"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          {/* Channels & Timing */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold text-slate-500">Channels:</span>
                            {channels.map((ch) => (
                              <span
                                key={ch}
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${
                                  ch === 'WHATSAPP' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  ch === 'EMAIL' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                  ch === 'LINKEDIN' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                                  'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {ch}
                              </span>
                            ))}
                            {step.timing_guide && (
                              <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{step.timing_guide}</span>
                              </span>
                            )}
                          </div>

                          {/* Channel Tab Selector for Preview */}
                          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
                            {channels.map((ch) => (
                              <button
                                key={ch}
                                type="button"
                                onClick={() => setCardActiveChannel((prev) => ({ ...prev, [step.id]: ch as any }))}
                                className={`px-2 py-0.5 rounded transition-all ${
                                  currentChannel === ch
                                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {ch === 'WHATSAPP' ? 'WhatsApp' :
                                 ch === 'EMAIL' ? 'Email' :
                                 ch === 'LINKEDIN' ? 'LinkedIn' : 'Call Pitch'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Message Preview Box */}
                        <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200 text-xs font-sans relative group">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            <span>Preview of {currentChannel} message template:</span>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(step, currentChannel)} disabled={!canChange(activeMasterTab, 'update')}
                              className="disabled:hidden text-blue-600 hover:underline font-semibold flex items-center gap-1 lowercase"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>edit this template</span>
                            </button>
                          </div>

                          {currentChannel === 'WHATSAPP' && (
                            <div className="text-slate-800 whitespace-pre-wrap text-[11px] leading-relaxed">
                              {templates.whatsapp?.message || <span className="text-slate-400 italic">No WhatsApp template defined</span>}
                            </div>
                          )}

                          {currentChannel === 'EMAIL' && (
                            <div className="space-y-1 text-[11px]">
                              <div className="font-bold text-slate-900">
                                Subject: <span className="font-normal text-slate-700">{templates.email?.subject || '—'}</span>
                              </div>
                              <div className="text-slate-700 whitespace-pre-wrap leading-relaxed pt-1 border-t border-slate-200/60">
                                {templates.email?.body || <span className="text-slate-400 italic">No email body defined</span>}
                              </div>
                            </div>
                          )}

                          {currentChannel === 'LINKEDIN' && (
                            <div className="space-y-1 text-[11px]">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">Action:</span>
                                <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-bold text-[10px]">
                                  {templates.linkedin?.actionType || 'CONNECT'}
                                </span>
                                {templates.linkedin?.actionNote && (
                                  <span className="text-slate-500 text-[10px]">({templates.linkedin.actionNote})</span>
                                )}
                              </div>
                              <div className="text-slate-700 whitespace-pre-wrap leading-relaxed pt-1 border-t border-slate-200/60">
                                {templates.linkedin?.message || <span className="text-slate-400 italic">No LinkedIn message defined</span>}
                              </div>
                            </div>
                          )}

                          {currentChannel === 'PHONE' && (
                            <div className="space-y-1.5 text-[11px]">
                              <div>
                                <span className="font-bold text-slate-900">Pitch Script:</span>
                                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed mt-0.5">
                                  {templates.phone?.pitchScript || <span className="text-slate-400 italic">No script defined</span>}
                                </p>
                              </div>
                              {templates.phone?.afterCallTakenWhatsApp && (
                                <div className="pt-1 border-t border-slate-200/60">
                                  <span className="font-bold text-emerald-700 text-[10px]">After Call WhatsApp:</span>
                                  <p className="text-slate-600 text-[10px] mt-0.5">{templates.phone.afterCallTakenWhatsApp}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {step.role_note && (
                          <div className="text-[11px] text-slate-500 italic bg-amber-50/50 p-2 rounded border border-amber-100 flex items-center gap-1.5">
                            <span className="font-bold not-italic text-amber-800">SDR Note:</span>
                            <span>{step.role_note}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* VIEW 2: DETAILED TABLE */}
            {sopStepsViewMode === 'table' && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3 w-8" title="Drag and Drop to Reorder"></th>
                      <th className="py-3 px-4">Milestone Day</th>
                      <th className="py-3 px-4">Step Title & Strategic Goal</th>
                      <th className="py-3 px-4">Active Channels</th>
                      <th className="py-3 px-4">Timing Guide</th>
                      <th className="py-3 px-4">Template Messages Preview</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sopSteps.map((step, idx) => {
                      const channels: string[] = typeof step.channels === 'string' ? JSON.parse(step.channels) : (step.channels || []);
                      const templates = typeof step.templates === 'string' ? JSON.parse(step.templates) : (step.templates || {});

                      return (
                        <tr
                          key={step.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, idx, 'sop_steps', sopSteps, setSopSteps)}
                          className={`hover:bg-slate-50/70 transition-all ${
                            draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                          } ${
                            dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                            <GripVertical className="w-4 h-4 mx-auto" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 font-extrabold rounded-md text-[11px]">
                                Day {step.day_number}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                +{step.day_offset}d
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{step.title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{step.goal}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 flex-wrap">
                              {channels.map((ch) => (
                                <span 
                                  key={ch} 
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                    ch === 'WHATSAPP' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    ch === 'EMAIL' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                    ch === 'LINKEDIN' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                                    'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {ch}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-[11px] max-w-[180px]">
                            {step.timing_guide || '—'}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <div className="space-y-1">
                              {templates.whatsapp?.message && (
                                <div className="text-[10px] text-slate-600 truncate flex items-center gap-1">
                                  <span className="font-bold text-emerald-600">WA:</span>
                                  <span className="truncate">{templates.whatsapp.message.slice(0, 50)}...</span>
                                </div>
                              )}
                              {templates.email?.subject && (
                                <div className="text-[10px] text-slate-600 truncate flex items-center gap-1">
                                  <span className="font-bold text-indigo-600">Email:</span>
                                  <span className="truncate">{templates.email.subject}</span>
                                </div>
                              )}
                              {templates.linkedin?.actionType && (
                                <div className="text-[10px] text-slate-600 truncate flex items-center gap-1">
                                  <span className="font-bold text-sky-600">LI:</span>
                                  <span>{templates.linkedin.actionType}</span>
                                </div>
                              )}
                              {templates.phone?.pitchScript && (
                                <div className="text-[10px] text-slate-600 truncate flex items-center gap-1">
                                  <span className="font-bold text-amber-600">Call:</span>
                                  <span className="truncate">{templates.phone.pitchScript.slice(0, 40)}...</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${step.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {step.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => handleOpenEdit(step)} disabled={!canChange(activeMasterTab, 'update')} 
                                className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" 
                                title="Edit Step Strategy & Messages"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setDeleteConfirmItem({ id: step.id, label: `Day ${step.day_number}: ${step.title}`, tab: 'sop_steps' })} disabled={!canChange(activeMasterTab, 'delete')} 
                                className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600" 
                                title="Delete Step"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 2. SOP OBJECTION REPLY STRATEGIES */}
        {activeMasterTab === 'sop_branches' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-8" title="Drag and Drop to Reorder"></th>
                <th className="py-3 px-4">Objection Trigger</th>
                <th className="py-3 px-4">Next Temperature</th>
                <th className="py-3 px-4">Recommended SDR Action</th>
                <th className="py-3 px-4">WhatsApp Script</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sopBranches.map((br, idx) => (
                <tr
                  key={br.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx, 'sop_branches', sopBranches, setSopBranches)}
                  className={`hover:bg-slate-50/70 transition-all ${
                    draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                  } ${
                    dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                    <GripVertical className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    <div>{br.label}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{br.trigger_condition || br.branch_key}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      br.next_lead_temperature === 'HOT' ? 'bg-rose-100 text-rose-800' :
                      br.next_lead_temperature === 'WARM' ? 'bg-amber-100 text-amber-800' :
                      br.next_lead_temperature === 'LOST' ? 'bg-slate-100 text-slate-700' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {br.next_lead_temperature}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                    {br.suggested_action || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                    {br.whatsapp_message || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${br.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {br.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          viewBranchTrigger.current = e.currentTarget;
                          setViewBranch(br);
                        }}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"
                        title="View details"
                        aria-label={`View details of ${br.label}`}
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button onClick={() => handleOpenEdit(br)} disabled={!canChange(activeMasterTab, 'update')} className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Edit Strategy">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmItem({ id: br.id, label: br.label, tab: 'sop_branches' })} disabled={!canChange(activeMasterTab, 'delete')} 
                        className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"
                        title="Delete Strategy"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 4. SOURCES */}
        {activeMasterTab === 'sources' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-4">Source Name</th>
                <th className="py-3 px-4">Channel Group</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sources.map((s, idx) => (
                <tr 
                  key={s.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx, 'sources', sources, setSources)}
                  className={`hover:bg-slate-50/70 transition-all ${
                    draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                  } ${
                    dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                    <GripVertical className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">{s.name}</td>
                  <td className="py-3 px-4 text-slate-600">{s.channel}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(s)} disabled={!canChange(activeMasterTab, 'update')} className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmItem({ id: s.id, label: s.name, tab: 'sources' })} disabled={!canChange(activeMasterTab, 'delete')} 
                        className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 5. STAGES */}
        {activeMasterTab === 'stages' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-4">Stage Name</th>
                <th className="py-3 px-4">Pipeline</th>
                <th className="py-3 px-4">Color</th>
                <th className="py-3 px-4">Win Prob %</th>
                <th className="py-3 px-4">SLA Hours</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stages.map((stg, idx) => (
                <tr 
                  key={stg.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx, 'stages', stages, setStages)}
                  className={`hover:bg-slate-50/70 transition-all ${
                    draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                  } ${
                    dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                    <GripVertical className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stg.color }} />
                    <span>{stg.name}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{pipelines.find((p) => p.id === stg.pipeline_id)?.name ?? 'Unknown pipeline'}</td>
                  <td className="py-3 px-4 font-mono text-[11px]">{stg.color}</td>
                  <td className="py-3 px-4 font-semibold text-blue-700">{stg.stage_probability}%</td>
                  <td className="py-3 px-4 text-slate-600">{stg.sla_duration_hours}h</td>
                  <td className="py-3 px-4">
                    {stg.is_won ? (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">WON</span>
                    ) : stg.is_lost ? (
                      <span className="text-[10px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">LOST</span>
                    ) : (
                      <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">OPEN</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(stg)} disabled={!canChange(activeMasterTab, 'update')} className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmItem({ id: stg.id, label: stg.name, tab: 'stages' })} disabled={!canChange(activeMasterTab, 'delete')} 
                        className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 6. PIPELINES */}
        {activeMasterTab === 'pipelines' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-4">Pipeline Name</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Stages</th>
                <th className="py-3 px-4">Deals</th>
                <th className="py-3 px-4">Default</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pipelines.map((p, idx) => (
                <tr 
                  key={p.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx, 'pipelines', pipelines, setPipelines)}
                  className={`hover:bg-slate-50/70 transition-all ${
                    draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                  } ${
                    dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                    <GripVertical className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">{p.name}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{p.code}</td>
                  <td className="py-3 px-4 text-slate-600">{p.stages_count || 0} stages</td>
                  <td className="py-3 px-4 font-semibold text-blue-700">{p.leads_count || 0} deals</td>
                  <td className="py-3 px-4">
                    {p.is_default ? (
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">Default</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(p)} disabled={!canChange(activeMasterTab, 'update')} className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmItem({ id: p.id, label: p.name, tab: 'pipelines' })} disabled={!canChange(activeMasterTab, 'delete')} 
                        className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 7. SERVICES */}
        {activeMasterTab === 'services' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-4">Service Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">SAC Code</th>
                <th className="py-3 px-4">Default Rate (INR ₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.map((srv, idx) => (
                <tr 
                  key={srv.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx, 'services', services, setServices)}
                  className={`hover:bg-slate-50/70 transition-all ${
                    draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                  } ${
                    dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                    <GripVertical className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">{srv.name}</td>
                  <td className="py-3 px-4 text-slate-600">{srv.category}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-700">{srv.sac_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(srv.default_rate)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${srv.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {srv.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(srv)} disabled={!canChange(activeMasterTab, 'update')} className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmItem({ id: srv.id, label: srv.name, tab: 'services' })} disabled={!canChange(activeMasterTab, 'delete')} 
                        className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 8. LOST REASONS */}
        {activeMasterTab === 'lost_reasons' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-4">Lost Reason</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lostReasons.map((lr, idx) => (
                <tr 
                  key={lr.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx, 'lost_reasons', lostReasons, setLostReasons)}
                  className={`hover:bg-slate-50/70 transition-all ${
                    draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                  } ${
                    dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                    <GripVertical className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">{lr.reason_name}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${lr.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {lr.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(lr)} disabled={!canChange(activeMasterTab, 'update')} className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmItem({ id: lr.id, label: lr.reason_name, tab: 'lost_reasons' })} disabled={!canChange(activeMasterTab, 'delete')} 
                        className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 9. QUOTATION TEMPLATES */}
        {activeMasterTab === 'templates' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-4">Template Name</th>
                <th className="py-3 px-4">Quotation Category</th>
                <th className="py-3 px-4">Scope & Deliverables (Word Doc)</th>
                <th className="py-3 px-4">Payment Terms</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((tmpl, idx) => (
                <tr 
                  key={tmpl.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx, 'templates', templates, setTemplates)}
                  className={`hover:bg-slate-50/70 transition-all ${
                    draggedIndex === idx ? 'opacity-40 bg-blue-50/50' : ''
                  } ${
                    dragOverIndex === idx ? 'border-t-2 border-blue-500 bg-blue-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-center">
                    <GripVertical className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span>{tmpl.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[10px]">
                      {tmpl.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={tmpl.intro_content}>
                    {tmpl.intro_content ? tmpl.intro_content.replace(/<[^>]*>?/gm, '') : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={tmpl.terms_content}>
                    {tmpl.terms_content || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tmpl.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {tmpl.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(tmpl)} disabled={!canChange(activeMasterTab, 'update')} className="disabled:hidden p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800" title="Edit Template">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmItem({ id: tmpl.id, label: tmpl.name, tab: 'templates' })} disabled={!canChange(activeMasterTab, 'delete')} 
                        className="disabled:hidden p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"
                        title="Delete Template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 11. ASSIGNEES */}
        {activeMasterTab === 'sales_persons' && (
          <>
          <p className="px-4 py-3 text-xs text-slate-600 bg-slate-50 border-b border-slate-100">
            Assignees are this workspace’s team members. Add, edit or remove people in Organization &amp; Settings → Team Members.
          </p>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Assignee</th>
                <th className="py-3 px-4">Designation</th>
                <th className="py-3 px-4">Role Access</th>
                <th className="py-3 px-4">Assigned Leads</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salesPersons.map((u) => {
                const isSalesHead = /sales (head|lead)|director of sales/i.test(u.designation || '');
                return (
                  <tr key={u.id} className={`hover:bg-slate-50/70 transition-colors ${isSalesHead ? 'bg-amber-50/40 font-medium' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs border ${
                          isSalesHead ? 'bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-300/40' : 'bg-blue-100 text-blue-700 border-blue-200'
                        }`}>
                          {u.first_name[0]}{u.last_name?.[0] || ''}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <span>{u.first_name} {u.last_name || ''}</span>
                            {isSalesHead && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500 text-white flex items-center gap-0.5 shadow-2xs">
                                <Crown className="w-2.5 h-2.5" />
                                <span>Sales Head & Default Assignee</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{u.designation || 'Sales Executive'}</div>
                      {isSalesHead && (
                        <div className="text-[10px] text-amber-700 font-semibold mt-0.5">Primary auto-assignee for all new leads</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                        {u.role_name || 'CRM User'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-blue-600">{u.leads_count || 0} leads</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}

        {/* 13. LEAD CHANNELS & APIS INTEGRATIONS */}
        {activeMasterTab === 'integrations' && (
          <div className="p-4">
            <LeadIntegrationsCenter />
          </div>
        )}

        {/* 14. GLOBAL CRM INDUSTRY & SUB-INDUSTRY TAXONOMY */}
        {activeMasterTab === 'industries' && (
          <div className="p-4 sm:p-6 bg-slate-50/50">
            <IndustriesMaster />
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 my-8 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  {showAddModal ? <Plus className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    {showAddModal ? 'Add to Master' : 'Edit Master Record'}
                  </h4>
                  <p className="text-[11px] text-slate-500 capitalize">
                    {activeMasterTab.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setShowAddModal(false); setShowEditModal(false); }} 
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* --- 1. SOP STEPS FORM --- */}
              {activeMasterTab === 'sop_steps' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Day Number *</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        required
                        value={formData.day_number ?? 1}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFormData({
                            ...formData,
                            day_number: val,
                            day_offset: Math.max(0, val - 1)
                          });
                        }}
                        className="w-full px-3 py-2 text-xs border rounded-lg font-bold text-blue-700"
                      />
                    </div>
                    <div>
                      <label htmlFor="sop-day-offset" className="block text-xs font-bold text-slate-700 mb-1">Day Offset</label>
                      {/* Always the day number less one: the days after enrolment the step falls due. */}
                      <input
                        id="sop-day-offset"
                        type="number"
                        readOnly
                        value={Math.max(0, Number(formData.day_number ?? 1) - 1)}
                        className="w-full px-3 py-2 text-xs border rounded-lg text-slate-500 bg-slate-50"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Timing Guide</label>
                      <input
                        type="text"
                        value={formData.timing_guide || ''}
                        onChange={(e) => setFormData({ ...formData, timing_guide: e.target.value })}
                        placeholder="e.g. Email (10 AM), WhatsApp (3 PM)"
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Step Title *</label>
                    <input
                      type="text"
                      required
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g. Triple Platform Launch, Free Audit Offer"
                      className="w-full px-3 py-2 text-xs border rounded-lg font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Strategic Goal *</label>
                    <input
                      type="text"
                      required
                      value={formData.goal || ''}
                      onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                      placeholder="e.g. Build Trust, Deliver Value, Discovery Qualification"
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Active Communication Channels *</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {['WHATSAPP', 'EMAIL', 'LINKEDIN', 'PHONE'].map((ch) => {
                        const isChecked = (formData.channels || []).includes(ch);
                        return (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => toggleChannelSelection(ch)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                              isChecked
                                ? 'bg-blue-50 border-blue-600 text-blue-700'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                              isChecked ? 'bg-blue-600 text-white' : 'border border-slate-300'
                            }`}>
                              {isChecked && <Check className="w-2.5 h-2.5" />}
                            </span>
                            <span>{ch}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Channel Message Templates Editor */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <MessageSquare className="w-4 h-4 text-blue-600" />
                        <span>Dynamic Multi-Channel Templates for Day {formData.day_number}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {['WHATSAPP', 'EMAIL', 'LINKEDIN', 'PHONE'].map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setSopModalActiveChannel(tab as any)}
                            className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                              sopModalActiveChannel === tab
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Educational Callout on Dynamic Variations */}
                    <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>How Dynamic "Variations" (Merge Tags) Work</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Tags like <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold text-amber-900">{"{{First Name}}"}</code>, <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold text-amber-900">{"{{Last Name}}"}</code>, and <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold text-amber-900">{"{{Assignee Name}}"}</code> are dynamic placeholders. 
                        You can <strong>drag & drop</strong> or <strong>click</strong> any tag chip below directly into the message. 
                        When outreach is sent to a lead, Voogyo automatically replaces them with that lead's actual details and the lead's assigned sales rep.
                      </p>
                      <div className="text-[10px] text-amber-700 bg-amber-100/60 p-1.5 rounded-lg border border-amber-200/60 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                        <span>To edit a lead's First/Last Name, open the lead directly on the Kanban Board or Leads Directory using the <strong>Quick Edit</strong> button.</span>
                      </div>
                    </div>

                    {/* Merge Tags Helper Bar with Drag & Drop */}
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-700 flex items-center gap-1">
                          <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                          <span>Draggable Variations & Merge Tags:</span>
                        </span>
                        <span className="text-[10px] text-slate-400">Click to insert or drag onto message box</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { tag: '{{First Name}}', label: 'First Name', desc: "Lead's first name" },
                          { tag: '{{Last Name}}', label: 'Last Name', desc: "Lead's surname" },
                          { tag: '{{Full Name}}', label: 'Full Name', desc: 'First + Last name' },
                          { tag: '{{Company Name}}', label: 'Company Name', desc: 'Lead company' },
                          { tag: '{{Assignee Name}}', label: 'Assignee', desc: "The lead's assigned sales rep", highlight: true },
                          { tag: '{{Designation}}', label: 'Designation', desc: 'Job title' },
                          { tag: '{{Industry}}', label: 'Industry', desc: 'Business industry' },
                          { tag: '{{Portfolio Link}}', label: 'Portfolio Link', desc: 'Portfolio URL' }
                        ].map((item) => (
                          <button
                            key={item.tag}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', item.tag);
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={() => {
                              if (sopModalActiveChannel === 'WHATSAPP') {
                                insertMergeTag(item.tag, 'templates.whatsapp.message');
                              } else if (sopModalActiveChannel === 'EMAIL') {
                                insertMergeTag(item.tag, 'templates.email.body');
                              } else if (sopModalActiveChannel === 'LINKEDIN') {
                                insertMergeTag(item.tag, 'templates.linkedin.message');
                              } else if (sopModalActiveChannel === 'PHONE') {
                                insertMergeTag(item.tag, 'templates.phone.pitchScript');
                              }
                            }}
                            title={`Click to insert or drag: ${item.desc}`}
                            className={`px-2 py-1 text-[11px] font-mono rounded-md border flex items-center gap-1 cursor-grab active:cursor-grabbing transition-all ${
                              item.highlight 
                                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 font-bold' 
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300'
                            }`}
                          >
                            <GripVertical className="w-2.5 h-2.5 opacity-40" />
                            <span>{item.tag}</span>
                            {item.highlight && <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded font-sans font-bold">👑 Head</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* WHATSAPP TEMPLATE */}
                    {sopModalActiveChannel === 'WHATSAPP' && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-emerald-800">WhatsApp Message Template</label>
                        <textarea
                          rows={4}
                          value={formData.templates?.whatsapp?.message || ''}
                          onChange={(e) => setDeepValue('templates.whatsapp.message', e.target.value)}
                          placeholder="Hi {{First Name}} 👋\n\nI'm {{Assignee Name}} from Voogyo..."
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-sans bg-white focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}

                    {/* EMAIL TEMPLATE */}
                    {sopModalActiveChannel === 'EMAIL' && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-bold text-indigo-800 mb-1">Email Subject Line</label>
                          <input
                            type="text"
                            value={formData.templates?.email?.subject || ''}
                            onChange={(e) => setDeepValue('templates.email.subject', e.target.value)}
                            placeholder="Connecting with {{Company Name}} | Voogyo"
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-indigo-800 mb-1">Email Body</label>
                          <textarea
                            rows={5}
                            value={formData.templates?.email?.body || ''}
                            onChange={(e) => setDeepValue('templates.email.body', e.target.value)}
                            placeholder="Dear {{First Name}},\n\nI'm {{Assignee Name}} from Voogyo..."
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-sans bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* LINKEDIN TEMPLATE */}
                    {sopModalActiveChannel === 'LINKEDIN' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-sky-800 mb-1">LinkedIn Action Type</label>
                            <select
                              value={formData.templates?.linkedin?.actionType || 'CONNECT'}
                              onChange={(e) => setDeepValue('templates.linkedin.actionType', e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-semibold"
                            >
                              <option value="CONNECT">CONNECT (Send Connection Note)</option>
                              <option value="ENGAGE_POST">ENGAGE_POST (Like & Comment on their post)</option>
                              <option value="SHARE_POST">SHARE_POST (Share Industry Value Post)</option>
                              <option value="FAREWELL">FAREWELL (Closing note)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-sky-800 mb-1">Action Guidance Note</label>
                            <input
                              type="text"
                              value={formData.templates?.linkedin?.actionNote || ''}
                              onChange={(e) => setDeepValue('templates.linkedin.actionNote', e.target.value)}
                              placeholder="e.g. Do not pitch. Only connect professionally."
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-sky-800 mb-1">Direct Connection / DM Message</label>
                          <textarea
                            rows={3}
                            value={formData.templates?.linkedin?.message || ''}
                            onChange={(e) => setDeepValue('templates.linkedin.message', e.target.value)}
                            placeholder="Hi {{First Name}}, came across {{Company Name}}..."
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-sans bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* PHONE TEMPLATE */}
                    {sopModalActiveChannel === 'PHONE' && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-bold text-amber-800 mb-1">2-Minute Qualification Pitch Script</label>
                          <textarea
                            rows={4}
                            value={formData.templates?.phone?.pitchScript || ''}
                            onChange={(e) => setDeepValue('templates.phone.pitchScript', e.target.value)}
                            placeholder="Good Morning Sir/Madam. {{Assignee Name}} from Voogyo..."
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-sans bg-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-amber-800 mb-1">After Call Taken (WhatsApp)</label>
                            <textarea
                              rows={2}
                              value={formData.templates?.phone?.afterCallTakenWhatsApp || ''}
                              onChange={(e) => setDeepValue('templates.phone.afterCallTakenWhatsApp', e.target.value)}
                              placeholder="Thank you for taking my call today..."
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-amber-800 mb-1">Missed Call Follow-up (WhatsApp)</label>
                            <textarea
                              rows={2}
                              value={formData.templates?.phone?.missedCallWhatsApp || ''}
                              onChange={(e) => setDeepValue('templates.phone.missedCallWhatsApp', e.target.value)}
                              placeholder="Tried reaching you today, probably you were busy..."
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live Variable Preview & Sandbox */}
                    <div className="border border-slate-200 rounded-xl bg-white p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>Test Dynamic Variations with Sample Lead Data</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowVarTestInputs(!showVarTestInputs)}
                          className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center gap-1"
                        >
                          {showVarTestInputs ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showVarTestInputs ? 'Collapse Test Inputs' : 'Edit Test Values'}</span>
                        </button>
                      </div>

                      {showVarTestInputs && (
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Type test values below to verify how your variations render in real time:
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{"{{First Name}}"}</label>
                              <input
                                type="text"
                                value={testLeadVars.firstName}
                                onChange={(e) => setTestLeadVars({ ...testLeadVars, firstName: e.target.value })}
                                className="w-full px-2 py-1 text-xs border rounded bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{"{{Last Name}}"}</label>
                              <input
                                type="text"
                                value={testLeadVars.lastName}
                                onChange={(e) => setTestLeadVars({ ...testLeadVars, lastName: e.target.value })}
                                className="w-full px-2 py-1 text-xs border rounded bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{"{{Company Name}}"}</label>
                              <input
                                type="text"
                                value={testLeadVars.companyName}
                                onChange={(e) => setTestLeadVars({ ...testLeadVars, companyName: e.target.value })}
                                className="w-full px-2 py-1 text-xs border rounded bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-amber-800 mb-0.5">{"{{Assignee Name}} (Head)"}</label>
                              <input
                                type="text"
                                value={testLeadVars.assigneeName}
                                onChange={(e) => setTestLeadVars({ ...testLeadVars, assigneeName: e.target.value })}
                                className="w-full px-2 py-1 text-xs border border-amber-300 rounded bg-amber-50/50 font-bold text-amber-900"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-slate-50/90 rounded-lg p-3 border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Rendered Message Live Preview ({sopModalActiveChannel}):</span>
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Live Interpolated</span>
                          </span>
                        </div>
                        <div className="bg-white rounded p-2.5 border border-slate-200 text-xs font-sans whitespace-pre-wrap text-slate-800 leading-relaxed shadow-2xs">
                          {interpolatePreview(
                            sopModalActiveChannel === 'WHATSAPP' ? (formData.templates?.whatsapp?.message || '') :
                            sopModalActiveChannel === 'EMAIL' ? `Subject: ${formData.templates?.email?.subject || ''}\n\n${formData.templates?.email?.body || ''}` :
                            sopModalActiveChannel === 'LINKEDIN' ? (formData.templates?.linkedin?.message || '') :
                            (formData.templates?.phone?.pitchScript || '')
                          ) || <span className="text-slate-400 italic">Type a message above or insert dynamic variations to see live preview...</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Role & SDR Internal Notes</label>
                    <textarea
                      rows={2}
                      value={formData.role_note || ''}
                      onChange={(e) => setFormData({ ...formData, role_note: e.target.value })}
                      placeholder="e.g. LinkedIn: Connect professionally | Email: Introduce company | WhatsApp: Friendly connect"
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* --- 2. SOP BRANCHES FORM --- */}
              {activeMasterTab === 'sop_branches' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Objection Label *</label>
                      <input
                        type="text"
                        required
                        value={formData.label || ''}
                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                        placeholder="e.g. Already have website"
                        className="w-full px-3 py-2 text-xs border rounded-lg font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Next Lead Temperature</label>
                      <select
                        value={formData.next_lead_temperature || 'WARM'}
                        onChange={(e) => setFormData({ ...formData, next_lead_temperature: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg bg-white font-bold text-blue-700"
                      >
                        <option value="HOT">HOT (Immediate follow-up)</option>
                        <option value="WARM">WARM (Nurture/Audit)</option>
                        <option value="COLD">COLD (Long-term keep-in-touch)</option>
                        <option value="LOST">LOST (Respectful exit)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Trigger Condition (Prospect Words)</label>
                    <input
                      type="text"
                      value={formData.trigger_condition || ''}
                      onChange={(e) => setFormData({ ...formData, trigger_condition: e.target.value })}
                      placeholder='e.g. Prospect says: "We already have website" or "Site is ready"'
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Suggested SDR Action</label>
                    <textarea
                      rows={2}
                      value={formData.suggested_action || ''}
                      onChange={(e) => setFormData({ ...formData, suggested_action: e.target.value })}
                      placeholder="e.g. Offer complimentary Speed/SEO Audit rather than full website rewrite"
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp Response Script *</label>
                    <textarea
                      rows={3}
                      required
                      value={formData.whatsapp_message || ''}
                      onChange={(e) => setFormData({ ...formData, whatsapp_message: e.target.value })}
                      placeholder="Understood {{First Name}}! Most of our premier clients already had websites..."
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Email Subject (Optional)</label>
                      <input
                        type="text"
                        value={formData.email_subject || ''}
                        onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Email Body (Optional)</label>
                      <textarea
                        rows={2}
                        value={formData.email_body || ''}
                        onChange={(e) => setFormData({ ...formData, email_body: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}


              {/* --- EXISTING MASTERS FORMS --- */}
              {/* SOURCES FORM */}
              {activeMasterTab === 'sources' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Source Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Google Ads, LinkedIn Campaign"
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Channel Group</label>
                    <input
                      type="text"
                      value={formData.channel || ''}
                      onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                      placeholder="e.g. Paid Search, Social Media"
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>
                </>
              )}

              {/* STAGES FORM */}
              {activeMasterTab === 'stages' && (
                <>
                  {/* A stage belongs to one pipeline. It can move to another only while no lead is in it;
                      the server refuses otherwise and says how many leads are there. */}
                  <div>
                    <label htmlFor="stage-pipeline" className="block text-xs font-bold text-slate-700 mb-1">Pipeline *</label>
                    <select
                      id="stage-pipeline"
                      required
                      value={formData.pipeline_id || ''}
                      onChange={(e) => setFormData({ ...formData, pipeline_id: e.target.value })}
                      aria-describedby={!showAddModal ? 'stage-pipeline-hint' : undefined}
                      className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                    >
                      <option value="" disabled>Choose a pipeline</option>
                      {pipelines.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                      ))}
                    </select>
                    {!showAddModal && (
                      <p id="stage-pipeline-hint" className="mt-1 text-[11px] text-slate-500">
                        A stage can move to another pipeline only while no leads are in it.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Stage Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Technical Proposal Shared"
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Stage Code</label>
                      <input
                        type="text"
                        value={formData.code || ''}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        placeholder="e.g. PROPOSAL_SHARED"
                        className="w-full px-3 py-2 text-xs border rounded-lg font-mono uppercase"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Color Tag</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.color || '#2563eb'}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                          className="w-8 h-8 rounded border p-0.5 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={formData.color || '#2563eb'}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                          className="w-full px-2 py-1.5 text-xs border rounded font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Win Prob (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.stage_probability || 0}
                        onChange={(e) => setFormData({ ...formData, stage_probability: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">SLA Hours</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.sla_duration_hours || 48}
                        onChange={(e) => setFormData({ ...formData, sla_duration_hours: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.is_won)}
                        onChange={(e) => setFormData({ ...formData, is_won: e.target.checked ? 1 : 0 })}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Is Deal Won Milestone</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.is_lost)}
                        onChange={(e) => setFormData({ ...formData, is_lost: e.target.checked ? 1 : 0 })}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      <span>Is Deal Lost Milestone</span>
                    </label>
                  </div>
                </>
              )}

              {/* PIPELINES FORM */}
              {activeMasterTab === 'pipelines' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Pipeline Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Enterprise Software Retainers"
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="pipeline-code" className="block text-xs font-bold text-slate-700 mb-1">Code</label>
                    <input
                      id="pipeline-code"
                      type="text"
                      maxLength={64}
                      value={formData.code || ''}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="Left empty, it is made from the name"
                      aria-describedby="pipeline-code-hint"
                      className="w-full px-3 py-2 text-xs border rounded-lg font-mono"
                    />
                    <p id="pipeline-code-hint" className="mt-1 text-[11px] text-slate-500">
                      Leads converted from Client Outreach go to the pipeline with code <span className="font-mono">COLD_FUNNEL</span> by default.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(Number(formData.is_default ?? 0))}
                      onChange={(e) => setFormData({ ...formData, is_default: e.target.checked ? 1 : 0 })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Default pipeline (new leads start here; only one pipeline can be the default)</span>
                  </label>
                </>
              )}

              {/* SERVICES FORM */}
              {activeMasterTab === 'services' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Service Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Next.js SaaS Custom Engineering"
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                      <input
                        type="text"
                        value={formData.category || 'Software Development'}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">SAC Code *</label>
                      <input
                        type="text"
                        required
                        value={formData.sac_code || '998314'}
                        onChange={(e) => setFormData({ ...formData, sac_code: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Default Base Rate (INR ₹)</label>
                    <input
                      type="number"
                      value={formData.default_rate || 0}
                      onChange={(e) => setFormData({ ...formData, default_rate: e.target.value })}
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>
                </>
              )}

              {/* LOST REASONS FORM */}
              {activeMasterTab === 'lost_reasons' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lost Reason Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.reason_name || ''}
                    onChange={(e) => setFormData({ ...formData, reason_name: e.target.value })}
                    placeholder="e.g. Competitor provided cheaper rate"
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
              )}

              {/* TEMPLATES FORM */}
              {activeMasterTab === 'templates' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Template Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Enterprise SaaS Engineering Proposal"
                        className="w-full px-3 py-2 text-xs border rounded-lg"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">Quotation Category *</label>
                        <span className="text-[10px] text-blue-600 font-semibold">From Categories Master</span>
                      </div>
                      <select
                        value={formData.category || (quotationCategories[0]?.name || 'SaaS Platform Engineering')}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-3 py-2 text-xs border rounded-lg bg-white font-medium"
                      >
                        {quotationCategories.map((cat) => (
                          <option key={cat.id} value={cat.name}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <WordDocumentEditor
                      label="Scope & Deliverables (Word Editor)"
                      value={formData.intro_content || ''}
                      onChange={(html) => setFormData({ ...formData, intro_content: html })}
                      placeholder="Write executive scope, deliverables, architecture specifications, and commercial introduction..."
                      minHeight="180px"
                      maxHeight="260px"
                      showCategoryTag={formData.category}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Commercial Payment Terms & Conditions</label>
                    <textarea
                      rows={2}
                      value={formData.terms_content || ''}
                      onChange={(e) => setFormData({ ...formData, terms_content: e.target.value })}
                      placeholder="e.g. 40% advance, 40% UAT milestone, 20% completion..."
                      className="w-full px-3 py-2 text-xs border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Default Services Configuration (JSON Line Services)</label>
                    <textarea
                      rows={3}
                      value={formData.default_items_json || '[]'}
                      onChange={(e) => setFormData({ ...formData, default_items_json: e.target.value })}
                      className="w-full px-3 py-2 text-xs border rounded-lg font-mono text-[11px]"
                    />
                  </div>
                </>
              )}

              {/* Status field. Every playbook step runs, so steps have none. */}
              {activeMasterTab !== 'sop_steps' && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.is_active ?? 1)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Active in CRM Dropdowns</span>
                </label>
              </div>
              )}

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{showAddModal ? 'Save to Master' : 'Update Record'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {viewBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={closeViewBranch}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-branch-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Objection strategy</p>
                <h4 id="view-branch-title" className="font-bold text-sm text-slate-900 break-words">{viewBranch.label}</h4>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5 break-all">{viewBranch.branch_key}</p>
              </div>
              <button
                ref={viewBranchClose}
                type="button"
                onClick={closeViewBranch}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <dl className="px-5 py-4 space-y-4 overflow-y-auto text-xs">
              {([
                ['Next lead temperature', `${viewBranch.next_lead_temperature} — ${({ HOT: 'Immediate follow-up', WARM: 'Nurture/Audit', COLD: 'Long-term keep-in-touch', LOST: 'Respectful exit' } as Record<string, string>)[viewBranch.next_lead_temperature] ?? ''}`],
                ['Trigger condition (prospect words)', viewBranch.trigger_condition],
                ['Suggested SDR action', viewBranch.suggested_action],
                ['WhatsApp response script', viewBranch.whatsapp_message],
                ...(viewBranch.recommended_response_script && viewBranch.recommended_response_script !== viewBranch.whatsapp_message
                  ? [['Recommended response script', viewBranch.recommended_response_script]]
                  : []),
                ['Email subject', viewBranch.email_subject],
                ['Email body', viewBranch.email_body],
              ] as [string, string | undefined][]).map(([term, value]) => (
                <div key={term}>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{term}</dt>
                  <dd className={`whitespace-pre-wrap break-words leading-relaxed ${value ? 'text-slate-800' : 'text-slate-400 italic'}`}>{value || 'Not set'}</dd>
                </div>
              ))}
            </dl>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeViewBranch}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
              {canChange('sop_branches', 'update') && (
                <button
                  type="button"
                  onClick={() => {
                    const branch = viewBranch;
                    setViewBranch(null);
                    handleOpenEdit(branch);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg"
                >
                  Edit strategy
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-slate-900 mb-1">Confirm Master Deletion</h4>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to remove <span className="font-bold text-slate-800">"{deleteConfirmItem.label}"</span> from the CRM master list?
            </p>
            {deleteError && (
              <p role="alert" className="mb-4 p-3 text-left text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                {deleteError}
              </p>
            )}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={closeDeleteConfirm}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg"
              >
                {deleteError ? 'Close' : 'Cancel'}
              </button>
              {!deleteError && (
                <button
                  onClick={executeDelete}
                  disabled={deleting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete Record'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
