import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Search,
  Plus,
  Edit2,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Ticket,
  Percent,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import { superAdminApi } from '../../api/super-admin.api';
import {
  SuperAdminTenant,
  AnalyticsOverview,
  PlatformInvoice,
  PlatformCoupon,
  SupportTicket,
  TenantQuota,
} from '../../types/super-admin.types';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';

export const SuperAdminDashboardView: React.FC = () => {
  const { switchTenant } = useAuth();
  const { setCurrentView } = usePayroll();

  const [activeTab, setActiveTab] = useState<'tenants' | 'billing' | 'support'>('tenants');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [tenants, setTenants] = useState<SuperAdminTenant[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [coupons, setCoupons] = useState<PlatformCoupon[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isNewTenantOpen, setIsNewTenantOpen] = useState(false);
  const [newTenantData, setNewTenantData] = useState({
    legalName: '',
    displayName: '',
    tenantCode: '',
    adminEmail: '',
    adminName: '',
    currency: 'INR',
    countryCode: 'IN',
  });

  const [editingQuotaTenant, setEditingQuotaTenant] = useState<SuperAdminTenant | null>(null);
  const [quotaForm, setQuotaForm] = useState<Partial<TenantQuota>>({});

  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [couponData, setCouponData] = useState({
    couponCode: '',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    maxUses: 100,
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [overviewData, tenantsData, packagesData, invoicesData, couponsData, ticketsData] = await Promise.all([
        superAdminApi.getAnalyticsOverview(),
        superAdminApi.getTenants(searchQuery, statusFilter),
        superAdminApi.getBillingPackages(),
        superAdminApi.getInvoices(),
        superAdminApi.getCoupons(),
        superAdminApi.getSupportTickets(),
      ]);

      setOverview(overviewData);
      setTenants(tenantsData);
      setPackages(packagesData);
      setInvoices(invoicesData);
      setCoupons(couponsData);
      setTickets(ticketsData);
    } catch (err: any) {
      console.error('Failed to load Super Admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await superAdminApi.createTenant(newTenantData);
      setActionMessage({ type: 'success', text: `Tenant "${newTenantData.legalName}" provisioned successfully!` });
      setIsNewTenantOpen(false);
      setNewTenantData({
        legalName: '',
        displayName: '',
        tenantCode: '',
        adminEmail: '',
        adminName: '',
        currency: 'INR',
        countryCode: 'IN',
      });
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create tenant' });
    }
  };

  const handleToggleTenantStatus = async (tenantId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await superAdminApi.updateTenantStatus(tenantId, nextStatus);
      setActionMessage({ type: 'success', text: `Tenant status updated to ${nextStatus}` });
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to update tenant status' });
    }
  };

  const handleUpdateQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotaTenant) return;
    try {
      await superAdminApi.updateTenantQuotas(editingQuotaTenant.id, quotaForm);
      setActionMessage({ type: 'success', text: `Quotas updated for ${editingQuotaTenant.displayName || (editingQuotaTenant as any).display_name || 'Tenant'}` });
      setEditingQuotaTenant(null);
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to update quotas' });
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await superAdminApi.impersonateTenant(tenantId);
      switchTenant(res.activeTenantId);
      setActionMessage({ type: 'success', text: 'Impersonated tenant successfully. Switching to CRM…' });
      setTimeout(() => {
        setCurrentView('crm');
      }, 500);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to impersonate tenant' });
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await superAdminApi.createCoupon(couponData);
      setActionMessage({ type: 'success', text: `Coupon ${couponData.couponCode} created!` });
      setIsCouponModalOpen(false);
      loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create coupon' });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Top Header Banner ───────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold mb-3 border border-teal-500/30">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            VOOGYO OPERATING SYSTEM • MODULE 01
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Super Admin Control Plane
          </h1>
          <p className="text-slate-300 text-sm mt-1 max-w-xl">
            Platform governance, multi-tenant quota allocation, MRR analytics, and zero-knowledge impersonation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadData}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Telemetry
          </button>
          <button
            onClick={() => setIsNewTenantOpen(true)}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            Provision Tenant
          </button>
        </div>
      </div>

      {/* ── Flash Alert ─────────────────────────────────────────────── */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm font-medium ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
      )}

      {/* ── Executive Metrics KPIs ──────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total MRR</span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">
              ₹{(overview.kpi?.estimatedMrr ?? overview.estimatedMrr ?? 0).toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-teal-600 font-medium mt-1">
              ARR: ₹{(overview.kpi?.estimatedArr ?? overview.estimatedArr ?? 0).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Tenants</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{overview.kpi?.activeTenants ?? overview.activeTenants ?? 0}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Out of {overview.kpi?.totalTenants ?? overview.totalTenants ?? 0} total tenants</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Trial Accounts</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{overview.kpi?.trialingTenants ?? overview.trialingTenants ?? 0}</p>
            <p className="text-[11px] text-amber-600 font-medium mt-1">High conversion target</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Platform Users</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{overview.kpi?.totalUsers ?? overview.totalUsers ?? 0}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Across all workspaces</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Suspended</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{overview.kpi?.suspendedTenants ?? overview.suspendedTenants ?? 0}</p>
            <p className="text-[11px] text-rose-600 font-medium mt-1">Non-compliant / overdue</p>
          </div>
        </div>
      )}

      {/* ── Sub-Navigation Tabs ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`px-4 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'tenants'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Tenants Directory ({tenants.length})
        </button>

        <button
          onClick={() => setActiveTab('billing')}
          className={`px-4 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'billing'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          SaaS Packages & Invoices
        </button>

        <button
          onClick={() => setActiveTab('support')}
          className={`px-4 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'support'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Ticket className="w-4 h-4" />
          Support & Governance ({tickets.length})
        </button>
      </div>

      {/* ── TAB 1: TENANTS DIRECTORY ─────────────────────────────────── */}
      {activeTab === 'tenants' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <form onSubmit={handleSearch} className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tenant name or code…"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="TRIALING">Trialing</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          {/* Tenants Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-4">Tenant Company</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Subscription Plan</th>
                    <th className="p-4">Allocated Quotas</th>
                    <th className="p-4">Created Date</th>
                    <th className="p-4 text-right">HQ Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {tenants.map((t: any) => {
                    const name = String(t?.displayName || t?.display_name || t?.legal_name || t?.tenant_code || 'Tenant');
                    const code = String(t?.tenantCode || t?.tenant_code || t?.id || '—');
                    const status = String(t?.tenantStatus || t?.tenant_status || 'ACTIVE');
                    const planName = String(t?.subscriptionPlan?.planName || t?.subscription_plan?.plan_name || 'Enterprise Plan');
                    const q = t?.quotas || (Array.isArray(t?.rndtechnosoft_tenant_quotas) ? t.rndtechnosoft_tenant_quotas[0] : t?.rndtechnosoft_tenant_quotas);
                    const createdDate = t?.createdAt || t?.created_at;
                    const initials = (name.trim() || 'TE').slice(0, 2).toUpperCase();
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0">
                              {initials}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{name}</p>
                              <p className="text-[11px] text-slate-400 font-mono">Code: {code}</p>
                            </div>
                          </div>
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : status === 'TRIALING'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {status}
                          </span>
                        </td>

                        <td className="p-4">
                          <span className="font-semibold text-slate-900">
                            {planName}
                          </span>
                        </td>

                        <td className="p-4">
                          {q ? (
                            <div className="space-y-0.5 text-[11px] text-slate-500">
                              <div>
                                <span className="font-semibold text-slate-700">{q.userSeatsLimit || q.user_seats_limit || 50}</span> Seats •{' '}
                                <span className="font-semibold text-slate-700">{q.branchLimit || q.branch_limit || 5}</span> Branches
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">{Math.round((q.monthlyAiTokens || q.monthly_ai_tokens || 500000) / 1000)}k</span> AI
                                Tokens • <span className="font-semibold text-slate-700">{Math.round((q.storageLimitMb || q.storage_limit_mb || 51200) / 1024)}GB</span> Storage
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Default</span>
                          )}
                        </td>

                        <td className="p-4 text-slate-500">
                          {createdDate ? new Date(createdDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          }) : '—'}
                        </td>

                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingQuotaTenant(t);
                                setQuotaForm(q ? {
                                  userSeatsLimit: q.userSeatsLimit || q.user_seats_limit,
                                  branchLimit: q.branchLimit || q.branch_limit,
                                  storageLimitMb: q.storageLimitMb || q.storage_limit_mb,
                                  monthlyAiTokens: q.monthlyAiTokens || q.monthly_ai_tokens,
                                  monthlyWhatsappCredits: q.monthlyWhatsappCredits || q.monthly_whatsapp_credits,
                                } : {
                                  userSeatsLimit: 10,
                                  branchLimit: 2,
                                  storageLimitMb: 5120,
                                  monthlyAiTokens: 100000,
                                  monthlyWhatsappCredits: 500,
                                });
                              }}
                              title="Configure Quotas"
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleToggleTenantStatus(t.id, status)}
                              title={status === 'ACTIVE' ? 'Suspend Tenant' : 'Activate Tenant'}
                              className={`p-1.5 rounded-lg border transition ${
                                status === 'ACTIVE'
                                  ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {status === 'ACTIVE' ? (
                                <XCircle className="w-3.5 h-3.5" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => handleImpersonate(t.id)}
                              title="Impersonate & Switch Workspace"
                              className="px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 font-semibold text-[11px] flex items-center gap-1.5 transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Access</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: SAAS PACKAGES & INVOICES ─────────────────────────── */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Packages Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {packages.map((pkg: any) => (
              <div
                key={pkg.tier}
                className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="inline-flex px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-extrabold uppercase mb-2">
                    {pkg.tier}
                  </div>
                  <h3 className="text-lg font-black text-slate-900">{pkg.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">
                      ₹{pkg.priceMonthlyInr.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">/ month</span>
                  </div>

                  <ul className="mt-5 space-y-2.5 text-xs text-slate-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>{pkg.userSeats} Team User Seats</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>{pkg.branches} Company Branch Quota</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>{pkg.storageMb / 1024} GB Secure Cloud Storage</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>{(pkg.aiTokens / 1000).toLocaleString('en-IN')}k AI Assistant Tokens</span>
                    </li>
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* SaaS Invoices Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm">Tenant Subscription Invoices</h3>
              <button
                onClick={() => setIsCouponModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Percent className="w-3.5 h-3.5" />
                Manage Coupons
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Tenant</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                        No subscription invoices generated yet.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="p-3 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                        <td className="p-3">{inv.rndtechnosoft_tenants?.display_name || 'Acme Corp'}</td>
                        <td className="p-3 font-bold text-slate-900">
                          ₹{Number(inv.total_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.invoice_status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {inv.invoice_status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">
                          {new Date(inv.due_date).toLocaleDateString('en-IN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: SUPPORT & GOVERNANCE ─────────────────────────────── */}
      {activeTab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Helpdesk Support Tickets */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Ticket className="w-4 h-4 text-teal-600" />
              Tenant Helpdesk Tickets ({tickets.length})
            </h3>

            <div className="space-y-3">
              {tickets.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-4 text-center">No open support tickets.</p>
              ) : (
                tickets.map((t) => (
                  <div key={t.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold text-teal-700">{t.ticket_number}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          t.priority === 'URGENT' || t.priority === 'HIGH'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>
                    <p className="font-bold text-xs text-slate-900">{t.subject}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{t.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>Tenant: {t.rndtechnosoft_tenants?.tenant_code || 'ACME'}</span>
                      <span>{new Date(t.created_at).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Audit Logs Timeline */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              Recent HQ Governance Actions
            </h3>

            <div className="space-y-3">
              {overview?.recentLogs?.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="font-bold text-slate-900">{log.action}</p>
                    <p className="text-slate-500 text-[11px]">{log.description}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">
                      {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} •{' '}
                      {log.rndtechnosoft_super_admins?.display_name || 'Chief Architect'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PROVISION NEW TENANT ─────────────────────────────── */}
      {isNewTenantOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                Provision New Tenant Company
              </h3>
              <button onClick={() => setIsNewTenantOpen(false)} className="text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Company Legal Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Nexus Infotech Ltd"
                    value={newTenantData.legalName}
                    onChange={(e) => setNewTenantData({ ...newTenantData, legalName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Nexus Infotech"
                    value={newTenantData.displayName}
                    onChange={(e) => setNewTenantData({ ...newTenantData, displayName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tenant Code (Slug)</label>
                <input
                  type="text"
                  required
                  placeholder="NEXUS_IN"
                  value={newTenantData.tenantCode}
                  onChange={(e) => setNewTenantData({ ...newTenantData, tenantCode: e.target.value.toUpperCase() })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Initial Admin Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Priya Patel"
                    value={newTenantData.adminName}
                    onChange={(e) => setNewTenantData({ ...newTenantData, adminName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Admin Email</label>
                  <input
                    type="email"
                    required
                    placeholder="admin@nexus.in"
                    value={newTenantData.adminEmail}
                    onChange={(e) => setNewTenantData({ ...newTenantData, adminEmail: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewTenantOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md"
                >
                  Provision Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT QUOTAS ───────────────────────────────────────── */}
      {editingQuotaTenant && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Quotas: {editingQuotaTenant.displayName || (editingQuotaTenant as any).display_name || 'Tenant'}
              </h3>
              <button onClick={() => setEditingQuotaTenant(null)} className="text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateQuotas} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">User Seats Limit</label>
                <input
                  type="number"
                  value={quotaForm.userSeatsLimit || 10}
                  onChange={(e) => setQuotaForm({ ...quotaForm, userSeatsLimit: parseInt(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Branch Limit</label>
                <input
                  type="number"
                  value={quotaForm.branchLimit || 2}
                  onChange={(e) => setQuotaForm({ ...quotaForm, branchLimit: parseInt(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Storage Limit (MB)</label>
                <input
                  type="number"
                  value={quotaForm.storageLimitMb || 5120}
                  onChange={(e) => setQuotaForm({ ...quotaForm, storageLimitMb: parseInt(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Monthly AI Tokens</label>
                <input
                  type="number"
                  value={quotaForm.monthlyAiTokens || 100000}
                  onChange={(e) => setQuotaForm({ ...quotaForm, monthlyAiTokens: parseInt(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingQuotaTenant(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold"
                >
                  Save Quotas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
