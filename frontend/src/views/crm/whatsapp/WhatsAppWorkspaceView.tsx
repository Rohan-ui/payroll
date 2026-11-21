'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Plus, RefreshCw, Send, CheckCircle2, FileText, ShieldCheck, Eye, Trash2, Edit3, Search, Layers, Check, X, Copy, RotateCcw, Clock, AlertTriangle, Shield,
} from 'lucide-react';
import {
  CrmMessageTemplate,
  WhatsAppMessageLog,
  WhatsAppProviderConfig,
  WhatsAppProviderTemplate,
  WhatsAppTemplateMapping,
  whatsAppApi
} from '../../../api/whatsapp.api';
import { WhatsAppMappingWizardModal } from './WhatsAppMappingWizardModal';
import { WhatsAppSendModal } from './WhatsAppSendModal';
import { toast } from '../../../lib/toast';
import { Button } from '../../../components/ui/Button';

export default function WhatsAppWorkspaceView() {
  // Consolidated 3 Main Tabs: 'outreach' | 'templates' | 'settings'
  const [activeTab, setActiveTab] = useState<'outreach' | 'templates' | 'settings'>('outreach');
  
  // Sub-tab inside templates hub
  const [templateSubTab, setTemplateSubTab] = useState<'mappings' | 'provider' | 'crm'>('mappings');
  
  const [loading, setLoading] = useState(true);

  // Data states
  const [mappings, setMappings] = useState<WhatsAppTemplateMapping[]>([]);
  const [crmTemplates, setCrmTemplates] = useState<CrmMessageTemplate[]>([]);
  const [providerTemplates, setProviderTemplates] = useState<WhatsAppProviderTemplate[]>([]);
  const [config, setConfig] = useState<WhatsAppProviderConfig | null>(null);
  const [logs, setLogs] = useState<WhatsAppMessageLog[]>([]);
  const [logPagination, setLogPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  // Filters & State
  const [logStatusFilter, setLogStatusFilter] = useState<string>('ALL');
  const [logSearchTerm, setLogSearchTerm] = useState<string>('');
  const [providerCategoryFilter, setProviderCategoryFilter] = useState<string>('ALL');
  const [providerSearchTerm, setProviderSearchTerm] = useState<string>('');
  const [syncingProvider, setSyncingProvider] = useState<boolean>(false);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);

  // Modals
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<WhatsAppTemplateMapping | null>(null);
  const [selectedCrmId, setSelectedCrmId] = useState<string>('');
  const [selectedProviderTemplateName, setSelectedProviderTemplateName] = useState<string>('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [showCrmTemplateModal, setShowCrmTemplateModal] = useState(false);
  const [editingCrmTemplate, setEditingCrmTemplate] = useState<CrmMessageTemplate | null>(null);
  const [crmTemplateForm, setCrmTemplateForm] = useState({
    template_code: '',
    template_name: '',
    category: 'GENERAL',
    channel: 'WHATSAPP',
    message_body: '',
    description: '',
  });

  // Log inspect modal
  const [inspectingLog, setInspectingLog] = useState<WhatsAppMessageLog | null>(null);

  // Config form state
  const [configForm, setConfigForm] = useState({
    account_name: 'Otomat WhatsApp Gateway',
    provider: 'OTOMAT',
    api_base_url: 'https://otomat.in/api',
    vendor_uid: '',
    bearer_token: '',
    from_phone_number_id: '',
    sender_phone_number: '',
    waba_id: '',
    webhook_verify_token: '',
  });
  const [showToken, setShowToken] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);

  // Load all data
  const loadData = async () => {
    setLoading(true);
    try {
      const [mapsRes, crmRes, provRes, confRes] = await Promise.all([
        whatsAppApi.listMappings(),
        whatsAppApi.listCrmTemplates(),
        whatsAppApi.listProviderTemplates().catch(() => ({ success: true, data: [] })),
        whatsAppApi.getConfig().catch(() => ({ success: false, data: null })),
      ]);

      if (mapsRes.success) setMappings(mapsRes.data);
      if (crmRes.success) setCrmTemplates(crmRes.data);
      if (provRes.success) setProviderTemplates(provRes.data);
      if (confRes.success && confRes.data) {
        setConfig(confRes.data);
        setConfigForm({
          account_name: confRes.data.account_name || 'Otomat WhatsApp Gateway',
          provider: confRes.data.provider || 'OTOMAT',
          api_base_url: confRes.data.api_base_url || 'https://otomat.in/api',
          vendor_uid: confRes.data.vendor_uid || '',
          bearer_token: '',
          from_phone_number_id: confRes.data.from_phone_number_id || '',
          sender_phone_number: confRes.data.sender_phone_number || '',
          waba_id: confRes.data.waba_id || '',
          webhook_verify_token: confRes.data.webhook_verify_token || '',
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load WhatsApp integration data');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (page = 1) => {
    try {
      const res = await whatsAppApi.listLogs({
        page,
        limit: 20,
        status: logStatusFilter,
        search: logSearchTerm,
      });
      if (res.success) {
        setLogs(res.data.rows);
        setLogPagination(res.data.pagination);
      }
    } catch {
      // Background fetch error ignored
    }
  };

  // Synchronize templates with external WhatsApp provider API
  const handleSyncProviderTemplates = async () => {
    setSyncingProvider(true);
    try {
      const res = await whatsAppApi.syncProviderTemplates();
      if (res.success) {
        const count = res.data?.syncedCount ?? res.data?.count ?? res.data?.templates?.length ?? 0;
        setProviderTemplates(res.data.templates || []);
        toast.success(`Synchronized ${count} approved templates from WhatsApp Business provider!`);
        // Refresh cached config timestamp
        const confRes = await whatsAppApi.getConfig().catch(() => null);
        if (confRes?.success && confRes.data) {
          setConfig(confRes.data);
        }
      } else {
        toast.error(res.message || 'Failed to sync templates from WhatsApp provider');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error communicating with WhatsApp API server');
    } finally {
      setSyncingProvider(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'outreach') {
      loadLogs(1);
    }
  }, [activeTab, logStatusFilter, logSearchTerm]);

  // Toggle active mapping
  const handleToggleActive = async (m: WhatsAppTemplateMapping) => {
    try {
      await whatsAppApi.updateMapping(m.id, { is_active: !m.is_active });
      toast.success(`Mapping ${!m.is_active ? 'enabled' : 'disabled'}`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not update mapping status');
    }
  };

  // Delete mapping
  const handleDeleteMapping = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this WhatsApp template mapping?')) return;
    try {
      await whatsAppApi.deleteMapping(id);
      toast.success('Mapping deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete mapping');
    }
  };

  // Refresh status of a log entry
  const handleRefreshStatus = async (logId: string) => {
    try {
      const res = await whatsAppApi.refreshLogStatus(logId);
      if (res.success) {
        toast.success(`Delivery status updated: ${res.data.status}`);
        loadLogs(logPagination.page);
        if (inspectingLog?.id === logId) {
          setInspectingLog(res.data);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not refresh message status');
    }
  };

  // Retry sending a message
  const handleRetryMessage = async (logId: string) => {
    setRetryingLogId(logId);
    try {
      const res = await whatsAppApi.retryLog(logId);
      if (res.success) {
        toast.success('Message retry dispatched successfully!');
        loadLogs(logPagination.page);
        if (inspectingLog?.id === logId) {
          setInspectingLog(res.data);
        }
      } else {
        toast.error(res.message || 'Failed to retry message dispatch');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error retrying message dispatch');
    } finally {
      setRetryingLogId(null);
    }
  };

  // Save CRM template
  const handleSaveCrmTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCrmTemplate) {
        await whatsAppApi.updateCrmTemplate(editingCrmTemplate.id, crmTemplateForm);
        toast.success('CRM template updated');
      } else {
        await whatsAppApi.createCrmTemplate(crmTemplateForm);
        toast.success('CRM template created');
      }
      setShowCrmTemplateModal(false);
      setEditingCrmTemplate(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not save CRM template');
    }
  };

  // Delete CRM template
  const handleDeleteCrmTemplate = async (id: string) => {
    if (!window.confirm('Delete this CRM template? Mappings linked to it will also be removed.')) return;
    try {
      await whatsAppApi.deleteCrmTemplate(id);
      toast.success('CRM template deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete template');
    }
  };

  // Save Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await whatsAppApi.saveConfig(configForm);
      toast.success('WhatsApp API credentials saved successfully!');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save WhatsApp credentials');
    } finally {
      setSavingConfig(false);
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    setTestingConfig(true);
    try {
      const res = await whatsAppApi.testConnection({
        api_base_url: configForm.api_base_url,
        vendor_uid: configForm.vendor_uid,
        bearer_token: configForm.bearer_token,
      });
      if (res.connected) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect');
    } finally {
      setTestingConfig(false);
    }
  };

  // Copy to clipboard helper
  const handleCopy = (textToCopy: string, label: string) => {
    navigator.clipboard.writeText(textToCopy);
    toast.success(`${label} copied to clipboard`);
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/whatsapp/webhook`
    : '/api/v1/whatsapp/webhook';

  return (
    <div className="space-y-6">
      
      {/* The page title is the CRM header above; this is WhatsApp's own toolbar. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="WhatsApp" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-[#2B293E]">
          {([
            { id: 'outreach', label: 'Messages and delivery' },
            { id: 'templates', label: `Template mappings (${mappings.length})` },
            { id: 'settings', label: 'Gateway settings' },
          ] as const).map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} onClick={() => setActiveTab(t.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${activeTab === t.id ? 'border-teal-600 text-slate-900 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              {t.label}
              {t.id === 'settings' && !config?.is_configured && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Set up needed</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config?.provider && <span className="text-xs text-slate-500 dark:text-slate-400">Provider: {config.provider}</span>}
          <Button variant="outline" size="sm" onClick={() => setShowSendModal(true)}>
            <Send className="h-4 w-4" aria-hidden="true" /> Quick Send
          </Button>
          <Button size="sm" onClick={() => { setEditingMapping(null); setShowWizardModal(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New template mapping
          </Button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: OUTBOUND MESSENGER & DELIVERY LOGS                 */}
      {/* ========================================================= */}
      {activeTab === 'outreach' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Sent messages</span>
                <span className="text-xs font-normal text-slate-400">({logPagination.total} total)</span>
              </h2>
              <p className="text-xs text-slate-500">
                Each message's delivery status as WhatsApp reports it: sent, delivered, read or failed.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input aria-label="Search recipient phone"
                  type="text"
                  value={logSearchTerm}
                  onChange={(e) => setLogSearchTerm(e.target.value)}
                  placeholder="Search recipient phone..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] text-slate-800 dark:text-slate-100 font-mono w-48"
                />
              </div>

              <select aria-label="Statuses"
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="SENT">Sent</option>
                <option value="DELIVERED">Delivered</option>
                <option value="READ">Read</option>
                <option value="FAILED">Failed</option>
                <option value="PENDING">Pending</option>
              </select>

              <button
                type="button"
                onClick={() => loadLogs(logPagination.page)}
                className="p-2 rounded-xl border border-slate-200 dark:border-[#2B293E] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#252339]"
                title="Refresh Logs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#252339] text-slate-500 font-bold border-b border-slate-200 dark:border-[#2B293E]">
                  <tr>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">CRM Template</th>
                    <th className="py-3 px-4">WhatsApp Template</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="hidden py-3 px-4 xl:table-cell">Message ID</th>
                    <th className="py-3 px-4">Dispatched At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No messages logged yet. Use Quick Send to dispatch your first message.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const statusColor =
                        log.status === 'READ'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          : log.status === 'DELIVERED'
                          ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 border-teal-200 dark:border-teal-800'
                          : log.status === 'SENT'
                          ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 border-teal-200 dark:border-teal-800'
                          : log.status === 'FAILED'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800';

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-[#252339]/30">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-100">
                            {log.recipient_phone}
                          </td>
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                            {log.rndtechnosoft_crm_message_templates?.template_name || (log.template_name === '__text_message__' ? 'Direct Text' : 'Template Message')}
                          </td>
                          <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                            {log.template_name} ({log.template_language})
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="hidden py-3 px-4 font-mono text-slate-400 text-[11px] max-w-[140px] truncate xl:table-cell" title={log.provider_message_id || ''}>
                            {log.provider_message_id || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {new Date(log.created_at).toLocaleString('en-GB')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {log.status === 'FAILED' && (
                                <button
                                  type="button"
                                  onClick={() => handleRetryMessage(log.id)}
                                  disabled={retryingLogId === log.id}
                                  className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                  title="Retry Dispatch"
                                >
                                  <RotateCcw className={`w-3.5 h-3.5 ${retryingLogId === log.id ? 'animate-spin' : ''}`} />
                                </button>
                              )}
                              {log.provider_message_id && (
                                <button
                                  type="button"
                                  onClick={() => handleRefreshStatus(log.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-[#252339]"
                                  title="Check Delivery Status"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setInspectingLog(log)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252339]"
                                title="Inspect Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logPagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#252339] border-t border-slate-200 dark:border-[#2B293E] text-xs">
                <span className="text-slate-500">
                  Page {logPagination.page} of {logPagination.totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={logPagination.page <= 1}
                    onClick={() => loadLogs(logPagination.page - 1)}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-[#2B293E] disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={logPagination.page >= logPagination.totalPages}
                    onClick={() => loadLogs(logPagination.page + 1)}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-[#2B293E] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: TEMPLATE HUB & MAPPINGS                            */}
      {/* ========================================================= */}
      {activeTab === 'templates' && (
        <div className="space-y-5">
          
          {/* Sub-Tabs & Actions Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#1E1C2E] border border-slate-200 dark:border-[#2B293E]">
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setTemplateSubTab('mappings')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                  templateSubTab === 'mappings'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252339]'
                }`}
              >
                Active Mappings ({mappings.length})
              </button>

              <button
                type="button"
                onClick={() => setTemplateSubTab('provider')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                  templateSubTab === 'provider'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252339]'
                }`}
              >
                WhatsApp Approved Templates ({providerTemplates.length})
              </button>

              <button
                type="button"
                onClick={() => setTemplateSubTab('crm')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                  templateSubTab === 'crm'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252339]'
                }`}
              >
                Internal CRM Templates ({crmTemplates.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncProviderTemplates}
                disabled={syncingProvider}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-[#252339] hover:bg-slate-50 dark:hover:bg-[#2B293E] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2B293E] transition-all shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${syncingProvider ? 'animate-spin' : ''}`} />
                <span>{syncingProvider ? 'Syncing...' : 'Sync Templates'}</span>
              </button>

              {config?.last_synced_at && (
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Synced: {new Date(config.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {/* Sync error banner if any */}
          {config?.last_sync_error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Provider Sync Alert: {config.last_sync_error}</span>
            </div>
          )}

          {/* SUB-TAB 1: ACTIVE MAPPINGS */}
          {templateSubTab === 'mappings' && (
            <div className="space-y-4">
              {loading ? (
                <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading mappings...</span>
                </div>
              ) : mappings.length === 0 ? (
                <div className="py-16 text-center rounded-xl border-2 border-dashed border-slate-200 dark:border-[#2B293E] p-8 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">No template mappings yet</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Connect internal CRM templates with approved WhatsApp templates once. Outbound dispatches will then automatically resolve and substitute placeholders like {`{{customer_name}}, {{order_id}}`}.
                  </p>
                  <button
                    onClick={() => {
                      setEditingMapping(null);
                      setShowWizardModal(true);
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                  >
                    Create First Mapping
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mappings.map((m) => {
                    const crmTpl = m.rndtechnosoft_crm_message_templates;
                    const bodyFieldsCount = Object.keys(m.body_mapping || {}).length;

                    return (
                      <div
                        key={m.id}
                        className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] p-5 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800 transition-all flex flex-col justify-between space-y-4"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-900">
                              {crmTpl?.category || 'GENERAL'}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleToggleActive(m)}
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                                m.is_active
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                                  : 'bg-slate-100 dark:bg-[#2B293E] text-slate-500 border border-slate-200 dark:border-[#38354D]'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              <span>{m.is_active ? 'Active' : 'Disabled'}</span>
                            </button>
                          </div>

                          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <span>{crmTpl?.template_name || 'CRM Template'}</span>
                          </h3>
                          <div className="text-[11px] font-mono text-slate-400 mb-3">
                            Code: {crmTpl?.template_code || 'N/A'}
                          </div>

                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#252339]/50 border border-slate-100 dark:border-[#2B293E] space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp: <strong>{m.whatsapp_template_name}</strong></span>
                              <span className="text-[10px] text-slate-400">({m.whatsapp_template_language})</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-[#2B293E]">
                              <div>
                                Body fields: <strong className="text-slate-800 dark:text-slate-200">{bodyFieldsCount}</strong>
                              </div>
                              <div>
                                Media: <strong className="text-slate-800 dark:text-slate-200">{m.media_type || 'None'}</strong>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#2B293E]">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCrmId(m.crm_template_id);
                              setShowSendModal(true);
                            }}
                            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Test Send</span>
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMapping(m);
                                setShowWizardModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252339]"
                              title="Edit Mapping"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMapping(m.id)}
                              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title="Delete Mapping"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: PROVIDER APPROVED TEMPLATES */}
          {templateSubTab === 'provider' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-[#1E1C2E]/60 rounded-xl border border-slate-200/80 dark:border-[#2B293E]">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-400 font-medium mr-1">Category:</span>
                  {(['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setProviderCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        providerCategoryFilter === cat
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252339]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-slate-400">
                  Showing {providerTemplates.filter((t) => providerCategoryFilter === 'ALL' || t.category === providerCategoryFilter).length} templates
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providerTemplates
                  .filter((t) => providerCategoryFilter === 'ALL' || t.category === providerCategoryFilter)
                  .map((tpl) => {
                    const linkedMapping = mappings.find(
                      (m) => m.whatsapp_template_name.toLowerCase() === tpl.name.toLowerCase()
                    );

                    return (
                      <div
                        key={`${tpl.name}-${tpl.language}`}
                        className="p-4 rounded-xl bg-white dark:bg-[#1E1C2E] border border-slate-200 dark:border-[#2B293E] shadow-xs flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-mono font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                <span>{tpl.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                                  {tpl.status || 'APPROVED'}
                                </span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400">
                                  {tpl.category}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#252339] text-slate-600 dark:text-slate-300">
                                  {tpl.language}
                                </span>
                              </div>
                            </div>

                            {linkedMapping ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Mapped</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-[#252339] px-2 py-0.5 rounded-full">
                                Unmapped
                              </span>
                            )}
                          </div>

                          <div className="p-3 bg-slate-50 dark:bg-[#252339]/50 rounded-xl border border-slate-100 dark:border-[#2B293E] text-xs font-mono whitespace-pre-line text-slate-700 dark:text-slate-300 max-h-36 overflow-y-auto">
                            {tpl.body_text || '(Template text not provided by provider)'}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-[#2B293E]">
                          {linkedMapping ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMapping(linkedMapping);
                                setShowWizardModal(true);
                              }}
                              className="w-full py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#252339] dark:hover:bg-[#2B293E] text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Mapping</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProviderTemplateName(tpl.name);
                                setEditingMapping(null);
                                setShowWizardModal(true);
                              }}
                              className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>Map to CRM Template</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* SUB-TAB 3: INTERNAL CRM TEMPLATES */}
          {templateSubTab === 'crm' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Internal CRM Message Templates
                  </h3>
                  <p className="text-xs text-slate-500">
                    Message templates defined within your CRM, containing placeholders like {`{{customer_name}}, {{order_id}}`}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCrmTemplate(null);
                    setCrmTemplateForm({
                      template_code: 'crm_template_' + Math.floor(Math.random() * 1000),
                      template_name: '',
                      category: 'GENERAL',
                      channel: 'WHATSAPP',
                      message_body: 'Hello {{customer_name}},\n\nYour message here...',
                      description: '',
                    });
                    setShowCrmTemplateModal(true);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create CRM Template</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {crmTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-4 rounded-xl bg-white dark:bg-[#1E1C2E] border border-slate-200 dark:border-[#2B293E] shadow-xs flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                          {tpl.template_name}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300">
                          {tpl.category}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mb-2">
                        Code: {tpl.template_code}
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-[#252339]/50 rounded-xl border border-slate-100 dark:border-[#2B293E] text-xs whitespace-pre-line text-slate-700 dark:text-slate-300 font-mono">
                        {tpl.message_body}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-medium mr-1">Variables:</span>
                        {(tpl.detected_variables || []).map((v) => (
                          <span
                            key={v}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold"
                          >
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-[#2B293E] flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCrmId(tpl.id);
                          setEditingMapping(null);
                          setShowWizardModal(true);
                        }}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                      >
                        Connect to WhatsApp
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCrmTemplate(tpl);
                            setCrmTemplateForm({
                              template_code: tpl.template_code,
                              template_name: tpl.template_name,
                              category: tpl.category,
                              channel: tpl.channel,
                              message_body: tpl.message_body,
                              description: tpl.description || '',
                            });
                            setShowCrmTemplateModal(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCrmTemplate(tpl.id)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: GATEWAY SETTINGS & WEBHOOKS                        */}
      {/* ========================================================= */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: API Gateway Credentials */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#2B293E]">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    WhatsApp Business Provider Credentials
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bearer Token authentication matching the official API specifications.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Account / Gateway Name
                    </label>
                    <input
                      type="text"
                      required
                      value={configForm.account_name}
                      onChange={(e) => setConfigForm({ ...configForm, account_name: e.target.value })}
                      placeholder="e.g. Primary WhatsApp Gateway"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Provider Engine
                    </label>
                    <select
                      value={configForm.provider}
                      onChange={(e) => setConfigForm({ ...configForm, provider: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339]"
                    >
                      <option value="OTOMAT">Otomat WhatsApp Gateway</option>
                      <option value="META_CLOUD_API">Meta Cloud API</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    API Base URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={configForm.api_base_url}
                    onChange={(e) => setConfigForm({ ...configForm, api_base_url: e.target.value })}
                    placeholder="https://otomat.in/api"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Vendor UID (VendorId) *
                    </label>
                    <input
                      type="text"
                      required
                      value={configForm.vendor_uid}
                      onChange={(e) => setConfigForm({ ...configForm, vendor_uid: e.target.value.trim() })}
                      placeholder="e.g. 20182 or your vendor UID"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      From Phone Number ID
                    </label>
                    <input
                      type="text"
                      value={configForm.from_phone_number_id}
                      onChange={(e) => setConfigForm({ ...configForm, from_phone_number_id: e.target.value.trim() })}
                      placeholder="e.g. 669217672941135"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Access Token / Bearer Token *
                  </label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={configForm.bearer_token}
                      onChange={(e) => setConfigForm({ ...configForm, bearer_token: e.target.value })}
                      placeholder={config?.is_configured ? '•••••••• (leave blank to keep current secret)' : 'Enter permanent or system user token'}
                      className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Encrypted at rest with AES-256-GCM. Transmitted exclusively via the standard Authorization: Bearer header.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-[#2B293E]">
                  <button
                    type="button"
                    disabled={testingConfig}
                    onClick={handleTestConnection}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#252339] font-semibold"
                  >
                    {testingConfig ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                    <span>Test Connection</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                  >
                    {savingConfig ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Webhook Setup Card */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#2B293E]">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Webhook Handshake & Callbacks</span>
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
                  Ready
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Configure your Meta WhatsApp App or Otomat Webhook settings to point to this SaaS endpoint to receive real-time delivery status updates and customer replies.
              </p>

              {/* Webhook URL */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Webhook Callback URL (GET / POST)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#252339] text-slate-700 dark:text-slate-300 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(webhookUrl, 'Webhook URL')}
                    className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-[#252339] text-slate-600 dark:text-slate-300"
                    title="Copy URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Webhook Verification Token */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Verification Token (hub.verify_token)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={configForm.webhook_verify_token}
                    onChange={(e) => setConfigForm({ ...configForm, webhook_verify_token: e.target.value })}
                    placeholder="Enter or generate verification token"
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] text-slate-700 dark:text-slate-300"
                  />
                  {configForm.webhook_verify_token && (
                    <button
                      type="button"
                      onClick={() => handleCopy(configForm.webhook_verify_token, 'Verify Token')}
                      className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-[#252339] text-slate-600 dark:text-slate-300"
                      title="Copy Token"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  Echoed back to Meta or Otomat during GET subscription handshake verification.
                </p>
              </div>

              {/* Event Subscriptions Checklist */}
              <div className="p-3 bg-slate-50 dark:bg-[#252339]/40 rounded-xl border border-slate-100 dark:border-[#2B293E] space-y-1.5 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] block">
                  Supported Webhook Events:
                </span>
                <ul className="space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span><strong>messages:</strong> Customer inbound replies</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span><strong>message_deliveries:</strong> Delivery & Read receipts</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span><strong>message_fails:</strong> Error codes & rejection reasons</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS                                                    */}
      {/* ========================================================= */}

      {/* WIZARD MODAL */}
      <WhatsAppMappingWizardModal
        isOpen={showWizardModal}
        onClose={() => {
          setShowWizardModal(false);
          setSelectedCrmId('');
          setSelectedProviderTemplateName('');
        }}
        onSaved={loadData}
        editingMapping={editingMapping}
        initialCrmTemplateId={selectedCrmId}
        initialWhatsappTemplateName={selectedProviderTemplateName}
        crmTemplates={crmTemplates}
        providerTemplates={providerTemplates}
      />

      {/* QUICK SEND MODAL */}
      <WhatsAppSendModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        crmTemplates={crmTemplates}
        defaultTemplateId={selectedCrmId}
        onSent={() => loadLogs(1)}
      />

      {/* CRM TEMPLATE CREATE/EDIT MODAL */}
      {showCrmTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-xl bg-white dark:bg-[#1E1C2E] shadow-2xl border border-slate-200 dark:border-[#2B293E] p-6 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2B293E] pb-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                {editingCrmTemplate ? 'Edit CRM Template' : 'New CRM Template'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCrmTemplateModal(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCrmTemplate} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Template Code *
                </label>
                <input
                  type="text"
                  required
                  value={crmTemplateForm.template_code}
                  onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, template_code: e.target.value })}
                  placeholder="e.g. order_dispatch_v1"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E] font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={crmTemplateForm.template_name}
                  onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, template_name: e.target.value })}
                  placeholder="e.g. Order Dispatch Notification"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={crmTemplateForm.category}
                    onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E]"
                  >
                    <option value="GENERAL">GENERAL</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="OPERATIONS">OPERATIONS</option>
                    <option value="ACCOUNTING">ACCOUNTING</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Channel</label>
                  <input
                    type="text"
                    disabled
                    value="WHATSAPP"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#252339] font-mono text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Message Body with Placeholders *
                </label>
                <textarea
                  required
                  rows={4}
                  value={crmTemplateForm.message_body}
                  onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, message_body: e.target.value })}
                  placeholder="Hello {{customer_name}}, your order {{order_id}} has shipped!"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E] font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Use double curly braces like {`{{customer_name}}`} or {`{{order_id}}`} to mark dynamic fields.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#2B293E]">
                <button
                  type="button"
                  onClick={() => setShowCrmTemplateModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG INSPECTION MODAL */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-xl bg-white dark:bg-[#1E1C2E] shadow-2xl border border-slate-200 dark:border-[#2B293E] p-6 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2B293E] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Message Audit Log: {inspectingLog.id.slice(0, 8)}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {inspectingLog.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectingLog(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-[#252339]/50 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-xs font-medium">Recipient</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{inspectingLog.recipient_phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs font-medium">Template</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">{inspectingLog.template_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs font-medium">Provider Message ID (wamid)</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300 break-all">{inspectingLog.provider_message_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs font-medium">Dispatched At</span>
                  <span className="text-slate-600 dark:text-slate-300">{new Date(inspectingLog.created_at).toLocaleString()}</span>
                </div>
              </div>

              {inspectingLog.error_message && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-300">
                  <span className="font-bold block mb-1">Provider Error:</span>
                  <span>{inspectingLog.error_message}</span>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Resolved Variables Sent:</span>
                <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto max-h-36">
                  {JSON.stringify(inspectingLog.resolved_variables || {}, null, 2)}
                </pre>
              </div>

              <div>
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Full Dispatched Payload:</span>
                <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto max-h-40">
                  {JSON.stringify(inspectingLog.payload_sent || {}, null, 2)}
                </pre>
              </div>

              <div>
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Provider Raw Response:</span>
                <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto max-h-36">
                  {JSON.stringify(inspectingLog.provider_response || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-[#2B293E]">
              <button
                type="button"
                onClick={() => setInspectingLog(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-[#252339] text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
