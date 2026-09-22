'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Check, Plus, Trash2, Edit3, Sparkles, Copy, Eye, 
  Sliders, ToggleLeft, ToggleRight, DollarSign, Users, Database, 
  Globe, Key, Shield, MessageSquare, Zap, ArrowRight, LayoutGrid, 
  List, RefreshCw, X, AlertCircle, CheckCircle2, TrendingUp, Building2,
  Calendar, Layers, Star, ExternalLink, HelpCircle, Search
} from 'lucide-react';

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  currency: string;
  billing_period: string;
  price_cents: number;
  annual_discount_percentage: number | string;
  max_users: number;
  max_branches: number;
  max_storage_mb: number;
  monthly_whatsapp_credits: number;
  monthly_ai_tokens: number;
  allow_custom_domain: number | boolean;
  allow_api_access: number | boolean;
  is_active: number | boolean;
  badge?: string;
  trial_days?: number;
  features_json?: string;
  active_subscribers?: number;
  plan_mrr_cents?: number;
}

const TEMPLATES = [
  {
    name: 'Solo Free Tier',
    code: 'FREE_SOLO',
    badge: '1 User · Free Forever',
    tagline: 'Ideal for solo entrepreneurs and indie developers',
    price: 0,
    discount: 0,
    seats: 1,
    branches: 1,
    storageGb: 2,
    aiTokens: 50000,
    whatsapp: 100,
    customDomain: false,
    apiAccess: false,
    trialDays: 0,
    features: [
      'Complete Lead & Pipeline CRM',
      'GST-Compliant Invoicing',
      'Project Sprints & Kanban',
      'Attendance & Leave Tracking',
      'Free Forever · No Expiration'
    ]
  },
  {
    name: 'Starter Studio',
    code: 'STARTER_STUDIO',
    badge: '7-Day Free Trial',
    tagline: 'For boutique studios and fast-growing startup teams',
    price: 2999,
    discount: 20,
    seats: 10,
    branches: 1,
    storageGb: 5,
    aiTokens: 100000,
    whatsapp: 500,
    customDomain: false,
    apiAccess: false,
    trialDays: 7,
    features: [
      'Complete Lead & Pipeline CRM',
      'GST-Compliant Quotation Builder',
      'Project Sprints & Kanban Boards',
      'Employee Directory & Attendance',
      'Standard Email Support',
      '7-Day Free Trial Included'
    ]
  },
  {
    name: 'Growth Agency Suite',
    code: 'GROWTH_AGENCY',
    badge: 'Most Popular',
    tagline: 'Our flagship suite for established agencies and IT firms',
    price: 6999,
    discount: 20,
    seats: 30,
    branches: 2,
    storageGb: 25,
    aiTokens: 500000,
    whatsapp: 1500,
    customDomain: false,
    apiAccess: false,
    trialDays: 7,
    features: [
      'Everything in Starter',
      'Automated Follow-up SLA Triggers',
      'Finance, P&L & GST Invoicing',
      'Client Secret Vault & Passwords',
      'Timesheets & Billable Hours',
      'AI Copilot & Lead Scoring',
      '7-Day Free Trial Included'
    ]
  },
  {
    name: 'Enterprise Scale',
    code: 'ENTERPRISE_SCALE',
    badge: 'Enterprise Choice',
    tagline: 'For scaled multi-branch corporations and custom operations',
    price: 19999,
    discount: 25,
    seats: 100,
    branches: 8,
    storageGb: 150,
    aiTokens: 2000000,
    whatsapp: 7500,
    customDomain: true,
    apiAccess: true,
    trialDays: 14,
    features: [
      'Everything in Growth',
      'Multi-Branch Consolidated P&L',
      'Custom Roles & Granular Permissions',
      'Payroll Engine with PF/ESIC/PT',
      'Custom Domain White-labeling',
      'REST API & Webhooks Access',
      '14-Day Free Trial Included'
    ]
  }
];

export default function PackagesManagerView() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Editor Modal States
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Active form state (Everything in admin's hand)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    code: '',
    badge: '',
    description: '',
    priceRupees: 6999,
    annualDiscountPercentage: 20,
    billingPeriod: 'MONTHLY',
    maxUsers: 30,
    maxBranches: 2,
    storageGb: 25,
    monthlyAiTokens: 500000,
    monthlyWhatsappCredits: 1500,
    allowCustomDomain: false,
    allowApiAccess: false,
    isActive: true,
    trialDays: 7,
    features: [
      'Complete Lead & Pipeline CRM',
      'GST-Compliant Invoicing',
      'Project Sprints & Kanban',
      'Biometric HRMS & Attendance'
    ]
  });

  const [newFeatureInput, setNewFeatureInput] = useState('');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/super-admin/packages');
      const json = await res.json();
      if (json.success && json.data) {
        setPlans(json.data.plans || []);
      }
    } catch (err: any) {
      showToast('Failed to load packages: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = plans.length;
    const active = plans.filter(p => Boolean(p.is_active)).length;
    const subscribers = plans.reduce((acc, p) => acc + (Number(p.active_subscribers) || 0), 0);
    const mrr = plans.reduce((acc, p) => acc + (Number(p.plan_mrr_cents) || 0), 0);
    return { total, active, subscribers, mrr };
  }, [plans]);

  // Open Edit Modal
  const openEditModal = (plan: Plan) => {
    setIsCreating(false);
    setEditingPlan(plan);

    let parsedFeatures: string[] = [];
    if (plan.features_json) {
      try {
        parsedFeatures = typeof plan.features_json === 'string' ? JSON.parse(plan.features_json) : plan.features_json;
      } catch (e) {
        parsedFeatures = [];
      }
    }
    if (!Array.isArray(parsedFeatures) || parsedFeatures.length === 0) {
      parsedFeatures = [
        'Complete Lead & Pipeline CRM',
        'GST-Compliant Invoicing',
        'Project Sprints & Kanban',
        'Biometric HRMS & Attendance'
      ];
    }

    setFormData({
      id: plan.id,
      name: plan.name || '',
      code: plan.code || '',
      badge: plan.badge || '',
      description: plan.description || '',
      priceRupees: Math.round((plan.price_cents || 0) / 100),
      annualDiscountPercentage: Number(plan.annual_discount_percentage) || 20,
      billingPeriod: plan.billing_period || 'MONTHLY',
      maxUsers: plan.max_users || 10,
      maxBranches: plan.max_branches || 1,
      storageGb: Math.round((plan.max_storage_mb || 5120) / 1024),
      monthlyAiTokens: plan.monthly_ai_tokens || 100000,
      monthlyWhatsappCredits: plan.monthly_whatsapp_credits || 500,
      allowCustomDomain: Boolean(plan.allow_custom_domain),
      allowApiAccess: Boolean(plan.allow_api_access),
      isActive: Boolean(plan.is_active),
      trialDays: plan.trial_days !== undefined && plan.trial_days !== null ? plan.trial_days : (plan.price_cents === 0 ? 0 : 7),
      features: parsedFeatures
    });
  };

  // Open Create Modal
  const openCreateModal = () => {
    setIsCreating(true);
    setEditingPlan(null);
    applyTemplate(TEMPLATES[1]); // Default to Starter template
  };

  const applyTemplate = (tmpl: typeof TEMPLATES[0]) => {
    setFormData({
      id: '',
      name: tmpl.name,
      code: tmpl.code,
      badge: tmpl.badge,
      description: tmpl.tagline,
      priceRupees: tmpl.price,
      annualDiscountPercentage: tmpl.discount,
      billingPeriod: 'MONTHLY',
      maxUsers: tmpl.seats,
      maxBranches: tmpl.branches,
      storageGb: tmpl.storageGb,
      monthlyAiTokens: tmpl.aiTokens,
      monthlyWhatsappCredits: tmpl.whatsapp,
      allowCustomDomain: tmpl.customDomain,
      allowApiAccess: tmpl.apiAccess,
      isActive: true,
      trialDays: tmpl.trialDays,
      features: [...tmpl.features]
    });
  };

  // Duplicate / Clone Plan
  const handleDuplicatePlan = (plan: Plan) => {
    openEditModal(plan);
    setIsCreating(true);
    setEditingPlan(null);
    setFormData(prev => ({
      ...prev,
      id: '',
      name: `${prev.name} (Copy)`,
      code: `${prev.code}_COPY`,
      badge: prev.badge ? `${prev.badge}` : 'Custom Tier'
    }));
  };

  // Quick Toggle Active Status
  const handleQuickToggleActive = async (plan: Plan, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !Boolean(plan.is_active);
    try {
      const res = await fetch('/api/v1/super-admin/packages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, isActive: newStatus })
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'success');
        setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: newStatus ? 1 : 0 } : p));
      } else {
        showToast(json.error || 'Failed to toggle status', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Save Plan (Create or Update)
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      showToast('Package Name and Code are required', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: isCreating ? undefined : formData.id,
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        badge: formData.badge.trim(),
        description: formData.description.trim(),
        priceCents: Math.round(Number(formData.priceRupees) * 100),
        annualDiscountPercentage: Number(formData.annualDiscountPercentage) || 0,
        billingPeriod: formData.billingPeriod,
        maxUsers: Number(formData.maxUsers) || 1,
        maxBranches: Number(formData.maxBranches) || 1,
        maxStorageMb: Math.round(Number(formData.storageGb) * 1024),
        monthlyAiTokens: Number(formData.monthlyAiTokens) || 0,
        monthlyWhatsappCredits: Number(formData.monthlyWhatsappCredits) || 0,
        allowCustomDomain: formData.allowCustomDomain,
        allowApiAccess: formData.allowApiAccess,
        isActive: formData.isActive,
        trialDays: Number(formData.trialDays) || 0,
        features: formData.features
      };

      const method = isCreating ? 'POST' : 'PUT';
      const res = await fetch('/api/v1/super-admin/packages', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        showToast(json.message || (isCreating ? 'Package created!' : 'Package updated!'), 'success');
        setEditingPlan(null);
        setIsCreating(false);
        fetchPackages();
      } else {
        showToast(json.error || 'Failed to save package', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete Plan
  const handleDeletePlan = async (plan: Plan, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to delete package "${plan.name}"? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/v1/super-admin/packages?id=${plan.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || 'Package deleted successfully', 'success');
        setPlans(prev => prev.filter(p => p.id !== plan.id));
      } else {
        showToast(json.error || 'Cannot delete package', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Feature list management in modal
  const addFeature = () => {
    if (!newFeatureInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      features: [...prev.features, newFeatureInput.trim()]
    }));
    setNewFeatureInput('');
  };

  const removeFeature = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== idx)
    }));
  };

  const updateFeature = (idx: number, val: string) => {
    setFormData(prev => {
      const updated = [...prev.features];
      updated[idx] = val;
      return { ...prev, features: updated };
    });
  };

  const formatINR = (paise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(paise / 100);
  };

  const filteredPlans = useMemo(() => {
    return plans
      .filter(p => {
        if (statusFilter === 'ACTIVE') return Boolean(p.is_active);
        if (statusFilter === 'INACTIVE') return !Boolean(p.is_active);
        return true;
      })
      .filter(p => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          p.name?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.badge?.toLowerCase().includes(q)
        );
      });
  }, [plans, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold text-white transition-all animate-in fade-in slide-in-from-bottom-3 ${
          toastMsg.type === 'success' ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-rose-600 shadow-rose-600/30'
        }`}>
          {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Top Banner & KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Packages</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1">{metrics.total}</h4>
            <p className="text-[11px] text-teal-600 font-semibold mt-0.5">{metrics.active} published on site</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Subscribers</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1">{metrics.subscribers}</h4>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Enrolled customer tenants</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monthly Run-rate</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1">{formatINR(metrics.mrr)}</h4>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Live subscription MRR</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#00B7A7] to-[#009E90] rounded-2xl p-4 shadow-md text-white flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
              SaaS Control
            </span>
            <Sparkles className="w-4 h-4 text-teal-100" />
          </div>
          <div>
            <p className="text-xs font-semibold text-teal-50 mt-2">Instant Public Sync</p>
            <p className="text-[11px] text-teal-100/90 leading-tight mt-0.5">
              Updates to prices, quotas & badges publish immediately to the live site.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="mt-3 w-full py-2 bg-white text-teal-900 rounded-xl text-xs font-bold hover:bg-teal-50 transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Provision New Package</span>
          </button>
        </div>
      </div>

      {/* Controls Bar: Search, Filters, View Mode */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search package name, code, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#00B7A7] focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-[#00B7A7] cursor-pointer"
          >
            <option value="ALL">All Packages ({plans.length})</option>
            <option value="ACTIVE">Active / Published ({metrics.active})</option>
            <option value="INACTIVE">Draft / Unpublished ({metrics.total - metrics.active})</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            onClick={fetchPackages}
            disabled={loading}
            title="Refresh Packages"
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Grid vs Table Toggle */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden md:inline">Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Detailed Table View"
            >
              <List className="w-4 h-4" />
              <span className="hidden md:inline">Table</span>
            </button>
          </div>

          {/* Action to create */}
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Package</span>
          </button>
        </div>
      </div>

      {/* ===================== VIEW 1: GRID VIEW (DYNAMIC SAAS CARDS) ===================== */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {filteredPlans.map((plan) => {
            const isFree = plan.code === 'FREE_FOREVER' || plan.price_cents === 0;
            const isActive = Boolean(plan.is_active);

            let parsedFeatures: string[] = [];
            if (plan.features_json) {
              try {
                parsedFeatures = typeof plan.features_json === 'string' ? JSON.parse(plan.features_json) : plan.features_json;
              } catch (e) {
                parsedFeatures = [];
              }
            }

            return (
              <div 
                key={plan.id}
                className={`rounded-3xl p-5 flex flex-col justify-between transition-all relative group bg-white ${
                  !isActive
                    ? 'border-2 border-dashed border-slate-300 opacity-75'
                    : isFree
                      ? 'border-2 border-[#5C7BDD] shadow-md shadow-blue-500/10'
                      : plan.badge?.toLowerCase().includes('popular')
                        ? 'border-2 border-[#00B7A7] shadow-lg shadow-teal-500/15 ring-2 ring-[#00B7A7]/20'
                        : 'border border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-md'
                }`}
              >
                <div>
                  {/* Top Status & Controls */}
                  <div className="flex items-center justify-between gap-1.5 mb-2.5">
                    <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded ${
                      isFree ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      {plan.code}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleQuickToggleActive(plan, e)}
                        title={isActive ? 'Click to Unpublish / Hide from site' : 'Click to Publish on site'}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition cursor-pointer ${
                          isActive 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <span>{isActive ? 'Published' : 'Hidden'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Plan Name & Badge */}
                  <h3 className="text-sm font-black text-slate-900 truncate">
                    {plan.name}
                  </h3>

                  {plan.badge && (
                    <div className="mt-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        plan.badge.toLowerCase().includes('popular')
                          ? 'bg-teal-50 text-teal-700 border-teal-200'
                          : isFree
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span>{plan.badge}</span>
                      </span>
                    </div>
                  )}

                  {/* Pricing Display */}
                  <div className="mt-3">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900">
                        {formatINR(plan.price_cents)}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {isFree ? '/ forever' : `/${plan.billing_period?.toLowerCase() || 'mo'}`}
                      </span>
                    </div>
                    {Number(plan.annual_discount_percentage) > 0 && !isFree && (
                      <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                        {plan.annual_discount_percentage}% Annual Discount Included
                      </p>
                    )}
                  </div>

                  {/* Description Tagline */}
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 min-h-[32px] leading-relaxed">
                    {plan.description || 'Enterprise ERP suite tailored for high-growth teams.'}
                  </p>

                  {/* Quotas Box */}
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-1.5 text-xs text-slate-700 mt-3">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                      <Users className="w-3.5 h-3.5 text-[#00B7A7] shrink-0" />
                      <span>{isFree ? '1 User (Single Seat)' : `${plan.max_users} Team Seats`}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{plan.max_branches} Branch Offices</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{Math.round(plan.max_storage_mb / 1024)} GB Cloud Storage</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{Number(plan.monthly_whatsapp_credits || 0).toLocaleString()} WhatsApp Credits</span>
                    </div>
                    <div className="text-[11px] text-[#5C7BDD] font-medium flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#5C7BDD] shrink-0" />
                      <span>{Number(plan.monthly_ai_tokens || 0).toLocaleString()} AI Tokens</span>
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  {parsedFeatures.length > 0 && (
                    <div className="mt-3 space-y-1.5 pt-2 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                        Included Features ({parsedFeatures.length})
                      </span>
                      {parsedFeatures.slice(0, 4).map((f, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-tight">
                          <Check className="w-3 h-3 text-[#00B7A7] shrink-0 mt-0.5" />
                          <span className="truncate">{f}</span>
                        </div>
                      ))}
                      {parsedFeatures.length > 4 && (
                        <span className="text-[10px] text-slate-400 italic block pl-4">
                          +{parsedFeatures.length - 4} more features
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer: MRR, Subscribers & Actions */}
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px] block">{plan.active_subscribers || 0} Tenants</span>
                    <p className="font-bold text-teal-700 text-xs">
                      {isFree ? '₹0 MRR' : `${formatINR(plan.plan_mrr_cents || plan.price_cents)} MRR`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDuplicatePlan(plan)}
                      title="Duplicate this package"
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditModal(plan)}
                      title="Edit package details"
                      className="p-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold transition cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {!isFree && (
                      <button
                        onClick={(e) => handleDeletePlan(plan, e)}
                        title="Delete package"
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================== VIEW 2: TABLE VIEW (DENSE ADMINISTRATIVE) ===================== */}
      {viewMode === 'table' && (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">Package & Badge</th>
                <th className="py-3 px-4">Monthly Price</th>
                <th className="py-3 px-4">Annual Discount</th>
                <th className="py-3 px-4">Seats Quota</th>
                <th className="py-3 px-4">Storage & Quotas</th>
                <th className="py-3 px-4">Subscribers</th>
                <th className="py-3 px-4">Live Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPlans.map((plan) => {
                const isFree = plan.code === 'FREE_FOREVER' || plan.price_cents === 0;
                const isActive = Boolean(plan.is_active);

                return (
                  <tr key={plan.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs">{plan.name}</span>
                        <span className="px-1.5 py-0.5 font-mono text-[9px] bg-slate-100 text-slate-600 rounded">
                          {plan.code}
                        </span>
                      </div>
                      {plan.badge && (
                        <span className="text-[10px] text-teal-700 font-semibold block mt-0.5">
                          {plan.badge}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900">
                      {formatINR(plan.price_cents)}
                      <span className="text-[10px] text-slate-400 font-normal"> /{plan.billing_period?.toLowerCase() || 'mo'}</span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-emerald-600">
                      {plan.annual_discount_percentage}% off
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800">{isFree ? '1 User' : `${plan.max_users} Seats`}</span>
                      <span className="text-slate-400 text-[10px] block">{plan.max_branches} Branches</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-[11px]">
                      <span>{Math.round(plan.max_storage_mb / 1024)}GB</span> · <span>{(plan.monthly_ai_tokens / 1000).toLocaleString()}k AI</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-800">{plan.active_subscribers || 0}</span>
                      <p className="text-[10px] text-teal-700">{formatINR(plan.plan_mrr_cents || plan.price_cents)} MRR</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={(e) => handleQuickToggleActive(plan, e)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                          isActive 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <span>{isActive ? 'Published' : 'Hidden'}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDuplicatePlan(plan)}
                          title="Clone Package"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer shadow-xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(plan)}
                          title="Edit Package"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-teal-700 transition cursor-pointer shadow-xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {!isFree && (
                          <button
                            onClick={(e) => handleDeletePlan(plan, e)}
                            title="Delete Package"
                            className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== COMPREHENSIVE PACKAGE EDITOR MODAL ===================== */}
      {(editingPlan || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 border border-teal-200 text-teal-700 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isCreating ? 'Provision New SaaS Package' : `Edit Package: ${formData.name}`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Control pricing, seat quotas, resource limits, feature bullet points, and public visibility.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setEditingPlan(null); setIsCreating(false); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Template Presets (When Creating) */}
            {isCreating && (
              <div className="px-6 py-2.5 bg-teal-50/50 border-b border-teal-100 flex items-center gap-2 overflow-x-auto text-xs">
                <span className="font-bold text-teal-900 shrink-0 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Start from Template:</span>
                </span>
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.code}
                    type="button"
                    onClick={() => applyTemplate(tmpl)}
                    className="px-2.5 py-1 bg-white hover:bg-teal-100 text-teal-800 rounded-lg border border-teal-200 text-[11px] font-semibold transition cursor-pointer shrink-0 shadow-2xs"
                  >
                    {tmpl.name} (₹{tmpl.price.toLocaleString()})
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSavePlan}>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[72vh] overflow-y-auto">
                {/* Left Column: Form Controls (7 cols) */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Group 1: Identity & Presentation */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      <span>1. Package Identity & Branding</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Package Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g. Growth Agency Suite"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Package Code *</label>
                        <input
                          type="text"
                          required
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                          placeholder="e.g. GROWTH"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Promotional Badge Tag</label>
                        <input
                          type="text"
                          value={formData.badge}
                          onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                          placeholder="e.g. Most Popular, 7-Day Free Trial"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Trial Period (Days)</label>
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={formData.trialDays}
                          onChange={(e) => setFormData({ ...formData, trialDays: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tagline & Description</label>
                      <textarea
                        rows={2}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Brief summary shown to customers on the pricing page..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                      />
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <input
                        type="checkbox"
                        id="plan_is_active"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                        className="w-4 h-4 text-[#00B7A7] rounded border-slate-300 focus:ring-[#00B7A7] cursor-pointer"
                      />
                      <label htmlFor="plan_is_active" className="text-xs text-slate-700 font-semibold cursor-pointer">
                        Publish on Public Website & Signup Flow (Active Tier)
                      </label>
                    </div>
                  </div>

                  {/* Group 2: Pricing & Commercials */}
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                      <span>2. Pricing & Commercial Structure</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Price (₹)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={formData.priceRupees}
                            onChange={(e) => setFormData({ ...formData, priceRupees: Number(e.target.value) })}
                            className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#00B7A7]"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {formData.priceRupees === 0 ? 'Free tier' : `₹${formData.priceRupees.toLocaleString()}/mo`}
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Annual Discount (%)</label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={90}
                            value={formData.annualDiscountPercentage}
                            onChange={(e) => setFormData({ ...formData, annualDiscountPercentage: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#00B7A7]"
                          />
                          <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                        </div>
                        <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                          Net: ₹{Math.round(formData.priceRupees * (1 - formData.annualDiscountPercentage / 100)).toLocaleString()}/mo
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Billing Period</label>
                        <select
                          value={formData.billingPeriod}
                          onChange={(e) => setFormData({ ...formData, billingPeriod: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="ANNUAL">Annual</option>
                          <option value="QUARTERLY">Quarterly</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Group 3: Quotas & Resource Capacities */}
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-slate-500" />
                      <span>3. Quotas & Resource Allocations</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Team Seats / Max Users</label>
                        <input
                          type="number"
                          min={1}
                          value={formData.maxUsers}
                          onChange={(e) => setFormData({ ...formData, maxUsers: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Branch Offices Quota</label>
                        <input
                          type="number"
                          min={1}
                          value={formData.maxBranches}
                          onChange={(e) => setFormData({ ...formData, maxBranches: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Storage Vault (GB)</label>
                        <input
                          type="number"
                          min={1}
                          value={formData.storageGb}
                          onChange={(e) => setFormData({ ...formData, storageGb: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Monthly AI Tokens</label>
                        <input
                          type="number"
                          min={0}
                          step={10000}
                          value={formData.monthlyAiTokens}
                          onChange={(e) => setFormData({ ...formData, monthlyAiTokens: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp Credits</label>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={formData.monthlyWhatsappCredits}
                          onChange={(e) => setFormData({ ...formData, monthlyWhatsappCredits: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                      </div>
                    </div>

                    {/* Enterprise Feature Toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
                        <input
                          type="checkbox"
                          checked={formData.allowCustomDomain}
                          onChange={(e) => setFormData({ ...formData, allowCustomDomain: e.target.checked })}
                          className="w-4 h-4 text-[#00B7A7] rounded border-slate-300 focus:ring-[#00B7A7] cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800">Custom Domain White-labeling</p>
                          <p className="text-[10px] text-slate-500">Allow tenant custom CNAME / domain</p>
                        </div>
                      </label>

                      <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
                        <input
                          type="checkbox"
                          checked={formData.allowApiAccess}
                          onChange={(e) => setFormData({ ...formData, allowApiAccess: e.target.checked })}
                          className="w-4 h-4 text-[#00B7A7] rounded border-slate-300 focus:ring-[#00B7A7] cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800">REST API & Webhooks Access</p>
                          <p className="text-[10px] text-slate-500">Enable developer programmatic integrations</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Group 4: Dynamic Included Features Builder */}
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-slate-500" />
                        <span>4. Included Feature Bullet Points</span>
                      </h4>
                      <span className="text-[11px] text-teal-700 font-bold">{formData.features.length} Features</span>
                    </div>

                    <div className="space-y-2">
                      {formData.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-[#00B7A7] shrink-0" />
                          <input
                            type="text"
                            value={feat}
                            onChange={(e) => updateFeature(idx, e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                          />
                          <button
                            type="button"
                            onClick={() => removeFeature(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Remove feature"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {/* Add feature row */}
                      <div className="flex items-center gap-2 pt-1">
                        <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          placeholder="Add new feature bullet (e.g. 24/7 Dedicated Manager)..."
                          value={newFeatureInput}
                          onChange={(e) => setNewFeatureInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addFeature();
                            }
                          }}
                          className="flex-1 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-[#00B7A7]"
                        />
                        <button
                          type="button"
                          onClick={addFeature}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Interactive Card Preview (5 cols) */}
                <div className="lg:col-span-5 bg-slate-50/70 p-5 rounded-3xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 mb-4">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-[#00B7A7]" />
                        <span>Live Public Preview</span>
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                        Real-time
                      </span>
                    </div>

                    {/* Preview Card */}
                    <div className="bg-white rounded-3xl p-5 border-2 border-[#00B7A7] shadow-xl shadow-teal-500/10 relative">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                          {formData.name || 'Untitled Package'}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-[9px] font-bold rounded">
                          {formData.code || 'CODE'}
                        </span>
                      </div>

                      {formData.badge && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-[10px] font-bold">
                            <Sparkles className="w-3 h-3" />
                            <span>{formData.badge}</span>
                          </span>
                        </div>
                      )}

                      <div className="mt-3">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900">
                            ₹{formData.priceRupees.toLocaleString()}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {formData.priceRupees === 0 ? '/ forever' : `/${formData.billingPeriod.toLowerCase()}`}
                          </span>
                        </div>
                        {formData.annualDiscountPercentage > 0 && formData.priceRupees > 0 && (
                          <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                            ₹{Math.round(formData.priceRupees * (1 - formData.annualDiscountPercentage / 100)).toLocaleString()}/mo with annual billing
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        {formData.description || 'Package description and customer benefits...'}
                      </p>

                      {/* Quotas */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-1.5 text-xs text-slate-700 mt-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                          <Users className="w-3.5 h-3.5 text-[#00B7A7]" />
                          <span>{formData.maxUsers} Team Seats</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formData.maxBranches} Branch Offices</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formData.storageGb} GB Cloud Storage</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                          <span>{Number(formData.monthlyWhatsappCredits || 0).toLocaleString()} WhatsApp Credits</span>
                        </div>
                        <div className="text-[11px] text-[#5C7BDD] font-medium flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-[#5C7BDD]" />
                          <span>{Number(formData.monthlyAiTokens || 0).toLocaleString()} AI Tokens</span>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="mt-3.5 space-y-1.5 pt-2 border-t border-slate-100">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                          Included in this tier
                        </span>
                        {formData.features.map((f, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-tight">
                            <Check className="w-3 h-3 text-[#00B7A7] shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA Button Preview */}
                      <div className="mt-4 pt-2">
                        <div className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#00B7A7] text-white flex items-center justify-center gap-1.5 shadow-xs">
                          <span>{formData.trialDays > 0 ? `Start ${formData.trialDays}-Day Free Trial` : 'Get Started Free'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 text-center mt-4">
                    Changes take effect on public pricing page upon clicking &quot;Save &amp; Publish Package&quot;.
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${formData.isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-xs text-slate-600 font-medium">
                    Status: <strong className="text-slate-900">{formData.isActive ? 'Published / Active' : 'Draft / Hidden'}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setEditingPlan(null); setIsCreating(false); }}
                    className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{saving ? 'Saving Package...' : isCreating ? 'Create & Publish Package' : 'Save & Publish Package'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
