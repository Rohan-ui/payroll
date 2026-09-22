import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  Globe,
  Receipt,
  Package,
  Ticket,
  Layout,
  FileText,
  BarChart3,
  Activity,
  LifeBuoy,
  Sliders,
  User,
  Bot,
  Plus,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  CreditCard,
  Lock,
  Search
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';
import { useTheme } from '../../context/ThemeContext';

// Modular Views
import ExecutiveDashboardView from '../../components/super-admin/ExecutiveDashboardView';
import SmartUserManagementView from '../../components/super-admin/SmartUserManagementView';
import DomainSubdomainManagerView from '../../components/super-admin/DomainSubdomainManagerView';
import PackagesManagerView from '../../components/super-admin/PackagesManagerView';
import PlatformBillingCenterView from '../../components/super-admin/PlatformBillingCenterView';
import TenantInvoicesView from '../../components/super-admin/TenantInvoicesView';
import TenantTransactionsView from '../../components/super-admin/TenantTransactionsView';
import CouponManagementView from '../../components/super-admin/CouponManagementView';
import PaymentGatewayView from '../../components/super-admin/PaymentGatewayView';
import TenantRolesBuilderView from '../../components/super-admin/TenantRolesBuilderView';
import PlatformActivityCenterView from '../../components/super-admin/PlatformActivityCenterView';
import PlatformSupportCenterView from '../../components/super-admin/PlatformSupportCenterView';
import PlatformAuditSecurityView from '../../components/super-admin/PlatformAuditSecurityView';
import GlobalSettingsCenterView from '../../components/super-admin/GlobalSettingsCenterView';
import SuperAdminProfileView from '../../components/super-admin/SuperAdminProfileView';
import SuperAdminAiAssistantView from '../../components/super-admin/SuperAdminAiAssistantView';
import WebsiteCmsSeoView from '../../components/super-admin/WebsiteCmsSeoView';
import WebsiteFormBuilderView from '../../components/super-admin/WebsiteFormBuilderView';
import WebsiteSeoAnalyticsView from '../../components/super-admin/WebsiteSeoAnalyticsView';

export type SuperAdminTab =
  | 'overview'
  | 'assistant'
  | 'tenants'
  | 'users'
  | 'domains'
  | 'billing'
  | 'packages'
  | 'coupons'
  | 'website'
  | 'forms'
  | 'seo'
  | 'activity'
  | 'support'
  | 'security'
  | 'roles'
  | 'settings'
  | 'profile';

interface NavSection {
  title: string;
  items: {
    id: SuperAdminTab;
    label: string;
    icon: React.ElementType;
    badge?: string;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Executive Suite',
    items: [
      { id: 'overview', label: 'CEO Command Center', icon: LayoutDashboard },
      { id: 'assistant', label: 'HQ AI Copilot', icon: Bot, badge: 'AI' },
    ],
  },
  {
    title: 'Tenants & Operations',
    items: [
      { id: 'tenants', label: 'Tenants & Workspaces', icon: Building2 },
      { id: 'users', label: 'Smart User Management', icon: Users },
      { id: 'domains', label: 'Domains & DNS', icon: Globe },
      { id: 'roles', label: 'Enterprise Role Templates', icon: ShieldCheck },
    ],
  },
  {
    title: 'Monetization & Commercials',
    items: [
      { id: 'billing', label: 'Platform Billing Center', icon: Receipt },
      { id: 'packages', label: 'Packages & Tiers', icon: Package },
      { id: 'coupons', label: 'Coupon Management', icon: Ticket },
    ],
  },
  {
    title: 'Website Engine & Marketing',
    items: [
      { id: 'website', label: 'Website CMS & SEO', icon: Layout },
      { id: 'forms', label: 'Form Builder', icon: FileText },
      { id: 'seo', label: 'SEO Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Platform Governance',
    items: [
      { id: 'activity', label: 'Platform Activity Center', icon: Activity },
      { id: 'support', label: 'Support Ticket Center', icon: LifeBuoy },
      { id: 'security', label: 'Security & Integrity', icon: Lock },
    ],
  },
  {
    title: 'System Headquarters',
    items: [
      { id: 'settings', label: 'Global Settings & Gateways', icon: Sliders },
      { id: 'profile', label: 'Super Admin Profile', icon: User },
    ],
  },
];

export const SuperAdminDashboardView: React.FC = () => {
  const { user, activeTenant, switchTenant } = useAuth();
  const { setCurrentView } = usePayroll();
  const { theme } = useTheme();

  const [activeTab, setActiveTab] = useState<SuperAdminTab>('overview');
  const [tenantsSubTab, setTenantsSubTab] = useState<'directory' | 'subscriptions' | 'invoices' | 'transactions'>('directory');
  const [tenantsList, setTenantsList] = useState<any[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [newTenantData, setNewTenantData] = useState({
    legalName: '',
    displayName: '',
    tenantCode: '',
    adminEmail: '',
    adminName: '',
  });
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load tenants for the tenants view
  const fetchTenants = async () => {
    try {
      setLoadingTenants(true);
      const res = await fetch(`/api/v1/super-admin/tenants?status=${statusFilter}&search=${encodeURIComponent(searchQuery)}`);
      const json = await res.json();
      if (json.success) {
        setTenantsList(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load tenants:', err);
    } finally {
      setLoadingTenants(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tenants') {
      fetchTenants();
    }
  }, [activeTab, statusFilter]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/super-admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTenantData),
      });
      const json = await res.json();
      if (json.success) {
        setActionNotice({ text: `Tenant "${newTenantData.legalName}" provisioned successfully!`, type: 'success' });
        setShowCreateTenantModal(false);
        setNewTenantData({ legalName: '', displayName: '', tenantCode: '', adminEmail: '', adminName: '' });
        fetchTenants();
      } else {
        setActionNotice({ text: json.error || 'Failed to create tenant', type: 'error' });
      }
    } catch (err: any) {
      setActionNotice({ text: err.message, type: 'error' });
    }
  };

  const handleImpersonate = (tenantId: string) => {
    switchTenant(tenantId);
    setCurrentView('dashboard');
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-[calc(100vh-5rem)] flex flex-col rounded-2xl border transition-colors ${
      isDark ? 'bg-[#0f0e17] border-[#2B293E] text-slate-100' : 'bg-white border-slate-200/80 text-slate-900 shadow-sm'
    }`}>
      {/* ── Top Header Banner ──────────────────────────────────────────────── */}
      <div className={`p-4 sm:p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        isDark ? 'border-[#2B293E] bg-[#141221]' : 'border-slate-100 bg-slate-50/50'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black tracking-tight">Voogyo Platform HQ</h1>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Multi-Tenant Governance, Licensing, Billing & System Ecosystem Controller
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border transition-colors ${
              isDark
                ? 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Workspace ({activeTenant?.displayName || activeTenant?.legalName || 'RND'})</span>
          </button>

          <button
            onClick={() => setActiveTab('assistant')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Copilot</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between ${
          actionNotice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-rose-50 text-rose-800 border-b border-rose-200'
        }`}>
          <span>{actionNotice.text}</span>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {/* ── Main Layout with Super Admin Sidebar & Content Area ────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Category Navigation Sidebar */}
        <aside className={`w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r p-3 overflow-y-auto ${
          isDark ? 'border-[#2B293E] bg-[#12111d]' : 'border-slate-100 bg-slate-50/30'
        }`}>
          <div className="space-y-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title}>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs font-bold'
                            : isDark
                            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`px-1.5 py-0.5 text-[9px] font-black rounded-full ${
                            isActive ? 'bg-indigo-700 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Active Viewport Container */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-w-0">
          {activeTab === 'overview' && <ExecutiveDashboardView />}

          {activeTab === 'assistant' && <SuperAdminAiAssistantView />}

          {activeTab === 'tenants' && (
            <div className="space-y-5">
              {/* Tenants Subtabs & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
                  <button
                    onClick={() => setTenantsSubTab('directory')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      tenantsSubTab === 'directory' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Tenants Directory
                  </button>
                  <button
                    onClick={() => setTenantsSubTab('subscriptions')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      tenantsSubTab === 'subscriptions' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Subscriptions
                  </button>
                  <button
                    onClick={() => setTenantsSubTab('invoices')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      tenantsSubTab === 'invoices' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Invoices
                  </button>
                  <button
                    onClick={() => setTenantsSubTab('transactions')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      tenantsSubTab === 'transactions' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Transactions
                  </button>
                </div>

                {tenantsSubTab === 'directory' && (
                  <button
                    onClick={() => setShowCreateTenantModal(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Provision New Tenant</span>
                  </button>
                )}
              </div>

              {tenantsSubTab === 'directory' && (
                <div className="space-y-4">
                  {/* Filter bar */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search tenants by name or code..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchTenants()}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ACTIVE">Active</option>
                      <option value="TRIALING">Trialing</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                    <button
                      onClick={fetchTenants}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingTenants ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Tenants Table */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800/40">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Company Name</th>
                            <th className="py-3 px-4">Code / Subdomain</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Created Date</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {tenantsList.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-400">
                                {loadingTenants ? 'Loading tenants...' : 'No tenants found'}
                              </td>
                            </tr>
                          ) : (
                            tenantsList.map((t) => (
                              <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                                <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                                  {t.displayName || t.legalName}
                                  <div className="text-[10px] font-normal text-slate-400 font-mono">{t.legalName}</div>
                                </td>
                                <td className="py-3 px-4 font-mono text-indigo-600 dark:text-indigo-400">
                                  {t.tenantCode}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    t.tenantStatus === 'ACTIVE'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {t.tenantStatus}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-slate-500">
                                  {new Date(t.createdAt).toISOString().slice(0, 10)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    onClick={() => handleImpersonate(t.id)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 rounded-lg text-xs font-bold transition-all"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Open Workspace</span>
                                  </button>
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

              {tenantsSubTab === 'subscriptions' && <PlatformBillingCenterView />}
              {tenantsSubTab === 'invoices' && <TenantInvoicesView />}
              {tenantsSubTab === 'transactions' && <TenantTransactionsView />}
            </div>
          )}

          {activeTab === 'users' && <SmartUserManagementView />}
          {activeTab === 'domains' && <DomainSubdomainManagerView />}
          {activeTab === 'roles' && <TenantRolesBuilderView />}
          {activeTab === 'billing' && <PlatformBillingCenterView />}
          {activeTab === 'packages' && <PackagesManagerView />}
          {activeTab === 'coupons' && <CouponManagementView />}
          {activeTab === 'website' && <WebsiteCmsSeoView />}
          {activeTab === 'forms' && <WebsiteFormBuilderView />}
          {activeTab === 'seo' && <WebsiteSeoAnalyticsView />}
          {activeTab === 'activity' && <PlatformActivityCenterView />}
          {activeTab === 'support' && <PlatformSupportCenterView />}
          {activeTab === 'security' && <PlatformAuditSecurityView />}
          {activeTab === 'settings' && <GlobalSettingsCenterView />}
          {activeTab === 'profile' && <SuperAdminProfileView />}
        </div>
      </div>

      {/* ── Provision New Tenant Modal ────────────────────────────────────── */}
      {showCreateTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Provision New Tenant</h3>
              </div>
              <button onClick={() => setShowCreateTenantModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <form onSubmit={handleCreateTenant} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Legal Company Name *</label>
                <input
                  type="text"
                  required
                  value={newTenantData.legalName}
                  onChange={(e) => setNewTenantData({ ...newTenantData, legalName: e.target.value })}
                  placeholder="e.g. Acme Precision Technologies Pvt Ltd"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Display Brand Name *</label>
                <input
                  type="text"
                  required
                  value={newTenantData.displayName}
                  onChange={(e) => setNewTenantData({ ...newTenantData, displayName: e.target.value })}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tenant Code (Subdomain) *</label>
                <input
                  type="text"
                  required
                  value={newTenantData.tenantCode}
                  onChange={(e) => setNewTenantData({ ...newTenantData, tenantCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                  placeholder="e.g. ACME_CORP"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Admin Email *</label>
                <input
                  type="email"
                  required
                  value={newTenantData.adminEmail}
                  onChange={(e) => setNewTenantData({ ...newTenantData, adminEmail: e.target.value })}
                  placeholder="e.g. admin@acmecorp.com"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Admin Full Name *</label>
                <input
                  type="text"
                  required
                  value={newTenantData.adminName}
                  onChange={(e) => setNewTenantData({ ...newTenantData, adminName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTenantModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  Provision Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
