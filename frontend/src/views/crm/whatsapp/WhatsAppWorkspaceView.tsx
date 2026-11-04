'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Plus, RefreshCw, Send, CheckCircle2, AlertCircle,
  FileText, Link2, ShieldCheck, Settings, Eye, Trash2, Edit3,
  Search, ArrowRight, Sparkles, Filter, ExternalLink, Layers, Check, X
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

export default function WhatsAppWorkspaceView() {
  const [activeTab, setActiveTab] = useState<'mappings' | 'crm-templates' | 'provider-templates' | 'logs' | 'config'>('mappings');
  const [loading, setLoading] = useState(true);

  // Data states
  const [mappings, setMappings] = useState<WhatsAppTemplateMapping[]>([]);
  const [crmTemplates, setCrmTemplates] = useState<CrmMessageTemplate[]>([]);
  const [providerTemplates, setProviderTemplates] = useState<WhatsAppProviderTemplate[]>([]);
  const [config, setConfig] = useState<WhatsAppProviderConfig | null>(null);
  const [logs, setLogs] = useState<WhatsAppMessageLog[]>([]);
  const [logPagination, setLogPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  // Filters
  const [logStatusFilter, setLogStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [providerCategoryFilter, setProviderCategoryFilter] = useState<string>('ALL');
  const [syncingProvider, setSyncingProvider] = useState<boolean>(false);

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
    api_base_url: 'https://otomat.in/api',
    vendor_uid: '',
    bearer_token: '',
    from_phone_number_id: '',
  });
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
          api_base_url: confRes.data.api_base_url || 'https://otomat.in/api',
          vendor_uid: confRes.data.vendor_uid || '',
          bearer_token: '',
          from_phone_number_id: confRes.data.from_phone_number_id || '',
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
        search: searchTerm,
      });
      if (res.success) {
        setLogs(res.data.rows);
        setLogPagination(res.data.pagination);
      }
    } catch {
      // Ignore background log fetch error
    }
  };

  const handleSyncProviderTemplates = async () => {
    setSyncingProvider(true);
    try {
      const res = await whatsAppApi.listProviderTemplates();
      if (res.success) {
        setProviderTemplates(res.data);
        toast.success(`Synced ${res.data.length} approved templates from Otomat WhatsApp API`);
      } else {
        toast.error('Failed to sync templates from provider');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync templates from Otomat WhatsApp API');
    } finally {
      setSyncingProvider(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs(1);
    }
  }, [activeTab, logStatusFilter, searchTerm]);

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
        toast.success(`Status updated: ${res.data.status}`);
        loadLogs(logPagination.page);
        if (inspectingLog?.id === logId) {
          setInspectingLog(res.data);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not refresh message status');
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

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-white/10 backdrop-blur-xs">
              <MessageSquare className="w-5 h-5 text-emerald-100" />
            </span>
            <h1 className="text-lg font-bold tracking-tight">
              WhatsApp Template Mapping & Dynamic Messaging
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 uppercase tracking-wider">
              External API
            </span>
          </div>
          <p className="text-xs text-emerald-100/90 max-w-2xl">
            Map internal CRM templates to WhatsApp-approved templates once. Send dynamic messages with variable resolution, media, buttons, and delivery status tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowSendModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 transition-colors shadow-sm"
          >
            <Send className="w-3.5 h-3.5 text-emerald-600" />
            <span>Quick Send</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingMapping(null);
              setShowWizardModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-950/40 hover:bg-emerald-950/60 text-white border border-emerald-400/30 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Template Mapping</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#2B293E] pb-3 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('mappings')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'mappings'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Template Mappings ({mappings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('crm-templates')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'crm-templates'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Internal CRM Templates ({crmTemplates.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('provider-templates')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'provider-templates'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Otomat / WhatsApp Templates ({providerTemplates.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'logs'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339]'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Outbound Message Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'config'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339]'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>API Credentials & Settings</span>
          {config?.is_configured ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Configured" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Not configured" />
          )}
        </button>
      </div>

      {/* TAB 1: TEMPLATE MAPPINGS */}
      {activeTab === 'mappings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Active WhatsApp Template Mappings
              </h2>
              <p className="text-xs text-slate-500">
                Whenever the CRM sends a message using a mapped template, variables are mapped to WhatsApp fields (field_1, field_2, etc.) and sent via API.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingMapping(null);
                setShowWizardModal(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Mapping</span>
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading mappings...</span>
            </div>
          ) : mappings.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-[#2B293E] p-8 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">No template mappings yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Connect your internal CRM message templates with approved WhatsApp templates to automate order dispatch, greetings, and quotations.
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
                    className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] p-5 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
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

                      {/* CRM Template info */}
                      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span>{crmTpl?.template_name || 'CRM Template'}</span>
                      </h3>
                      <div className="text-[11px] font-mono text-slate-400 mb-3">
                        Code: {crmTpl?.template_code || 'N/A'}
                      </div>

                      {/* Mapping Arrow to WhatsApp */}
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

                    {/* Action Buttons */}
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

      {/* TAB 2: INTERNAL CRM TEMPLATES */}
      {activeTab === 'crm-templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Internal CRM Message Templates
              </h2>
              <p className="text-xs text-slate-500">
                Create and manage internal message templates with placeholders like {`{{customer_name}}, {{order_id}}, {{vehicle_number}}`}.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCrmTemplate(null);
                setCrmTemplateForm({
                  template_code: 'crm_new_template_' + Math.floor(Math.random() * 1000),
                  template_name: '',
                  category: 'GENERAL',
                  channel: 'WHATSAPP',
                  message_body: 'Hello {{customer_name}},\n\nYour message text here...',
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
                className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] p-5 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      {tpl.template_name}
                    </h3>
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      {tpl.template_code}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#252339] text-slate-600 dark:text-slate-300">
                    {tpl.category}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-[#252339]/50 rounded-xl border border-slate-100 dark:border-[#2B293E] text-xs font-mono whitespace-pre-line text-slate-700 dark:text-slate-300">
                  {tpl.message_body}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">Variables:</span>
                  {(tpl.detected_variables || []).map((v) => (
                    <span key={v} className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#2B293E]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCrmId(tpl.id);
                      setEditingMapping(null);
                      setShowWizardModal(true);
                    }}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Configure WhatsApp Mapping</span>
                  </button>

                  <div className="flex items-center gap-1.5">
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

      {/* TAB 3: OTOMAT / WHATSAPP PROVIDER TEMPLATES */}
      {activeTab === 'provider-templates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>External WhatsApp Provider Templates</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-mono">
                  GET /contact/template-list
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Live approved templates synced from your Otomat / WhatsApp Business provider. Connect them to CRM templates with 1 click.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncProviderTemplates}
                disabled={syncingProvider}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#252339] hover:bg-slate-200 dark:hover:bg-[#2B293E] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2B293E] transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${syncingProvider ? 'animate-spin' : ''}`} />
                <span>{syncingProvider ? 'Syncing from Otomat...' : 'Sync from Otomat'}</span>
              </button>
            </div>
          </div>

          {/* Filters & Search */}
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

          {/* Templates Grid */}
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
                    className="p-4 rounded-2xl bg-white dark:bg-[#1E1C2E] border border-slate-200 dark:border-[#2B293E] shadow-xs flex flex-col justify-between space-y-3"
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
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400">
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

                      {/* Message Body */}
                      <div className="p-3 bg-slate-50 dark:bg-[#252339]/50 rounded-xl border border-slate-100 dark:border-[#2B293E] text-xs font-mono whitespace-pre-line text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">
                        {tpl.body_text || '(No body text preview returned by provider API)'}
                      </div>

                      {/* Header and buttons info */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        {tpl.header_type && tpl.header_type !== 'NONE' && (
                          <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            Header: {tpl.header_type}
                          </span>
                        )}
                        {(tpl.buttons_count || 0) > 0 && (
                          <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                            Buttons: {tpl.buttons_count}
                          </span>
                        )}
                      </div>

                      {linkedMapping && (
                        <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300">
                          Connected to CRM template: <strong>{crmTemplates.find((c) => c.id === linkedMapping.crm_template_id)?.template_name || linkedMapping.rndtechnosoft_crm_message_templates?.template_name || linkedMapping.crm_template_id}</strong>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 border-t border-slate-100 dark:border-[#2B293E] flex items-center justify-between">
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
                          <span>Edit CRM Mapping</span>
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

      {/* TAB 4: OUTBOUND MESSAGE LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Outbound WhatsApp Message Logs
              </h2>
              <p className="text-xs text-slate-500">
                Real-time delivery status, provider message IDs (wamid), and resolved variable audit trails.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] text-slate-800 dark:text-slate-200"
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
                className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#252339]"
                title="Refresh Logs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#252339] text-slate-500 font-bold border-b border-slate-200 dark:border-[#2B293E]">
                  <tr>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">CRM Template</th>
                    <th className="py-3 px-4">WhatsApp Template</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Message ID (wamid)</th>
                    <th className="py-3 px-4">Dispatched At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No messages logged yet. Use Quick Send or test dispatch to send your first message.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const statusColor =
                        log.status === 'DELIVERED' || log.status === 'READ'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          : log.status === 'SENT'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                          : log.status === 'FAILED'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800';

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-[#252339]/30">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-100">
                            {log.recipient_phone}
                          </td>
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                            {log.rndtechnosoft_crm_message_templates?.template_name || 'Direct Send'}
                          </td>
                          <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                            {log.template_name} ({log.template_language})
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px] max-w-[140px] truncate" title={log.provider_message_id || ''}>
                            {log.provider_message_id || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {new Date(log.created_at).toLocaleString('en-GB')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {log.provider_message_id && (
                                <button
                                  type="button"
                                  onClick={() => handleRefreshStatus(log.id)}
                                  className="p-1 rounded text-slate-400 hover:text-emerald-600"
                                  title="Check Delivery Status"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setInspectingLog(log)}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
          </div>
        </div>
      )}

      {/* TAB 4: API CREDENTIALS & SETTINGS */}
      {activeTab === 'config' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#2B293E]">
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  WhatsApp Provider Configuration
                </h3>
                <p className="text-xs text-slate-500">
                  Configure external WhatsApp API credentials from your Postman collection.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={configForm.account_name}
                  onChange={(e) => setConfigForm({ ...configForm, account_name: e.target.value })}
                  placeholder="e.g. Primary WhatsApp Account"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  API Base URL
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

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Vendor UID (VendorId) *
                </label>
                <input
                  type="text"
                  required
                  value={configForm.vendor_uid}
                  onChange={(e) => setConfigForm({ ...configForm, vendor_uid: e.target.value.trim() })}
                  placeholder="e.g. 20182 or your Otomat vendor UID"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  API Token / Bearer Token (token=...)
                </label>
                <input
                  type="password"
                  value={configForm.bearer_token}
                  onChange={(e) => setConfigForm({ ...configForm, bearer_token: e.target.value })}
                  placeholder={config?.is_configured ? '•••••••• (leave blank to keep current secret)' : 'Bearer token (if your vendor ID is the token, you can paste it here too)'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Encrypted at rest using AES-256-GCM. Will be passed both as Bearer Header and ?token= query parameter.
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#252339]/50 rounded-xl border border-slate-200 dark:border-[#2B293E] text-xs font-mono text-slate-600 dark:text-slate-400">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Generated Request Endpoint:</div>
                <div className="text-emerald-600 dark:text-emerald-400 break-all">
                  {(configForm.api_base_url || 'https://otomat.in/api').replace(/\/+$/, '')}/{configForm.vendor_uid || '{{vendorUid}}'}/contact/send-template-message?token=••••••••
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Default From Phone Number ID (Optional)
                </label>
                <input
                  type="text"
                  value={configForm.from_phone_number_id}
                  onChange={(e) => setConfigForm({ ...configForm, from_phone_number_id: e.target.value })}
                  placeholder="e.g. 669217672941135"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-[#2B293E]">
                <button
                  type="button"
                  disabled={testingConfig}
                  onClick={handleTestConnection}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#252339] font-semibold"
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
      )}

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
        onClose={() => {
          setShowSendModal(false);
          setSelectedCrmId('');
        }}
        crmTemplates={crmTemplates}
        defaultTemplateId={selectedCrmId}
        onSent={() => {
          if (activeTab === 'logs') loadLogs(1);
        }}
      />

      {/* CREATE / EDIT CRM TEMPLATE MODAL */}
      {showCrmTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#1E1C2E] shadow-2xl border border-slate-200 dark:border-[#2B293E] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2B293E] pb-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                {editingCrmTemplate ? 'Edit CRM Message Template' : 'New CRM Message Template'}
              </h3>
              <button onClick={() => setShowCrmTemplateModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveCrmTemplate} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={crmTemplateForm.template_name}
                  onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, template_name: e.target.value })}
                  placeholder="e.g. Order Dispatch"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Template Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingCrmTemplate}
                    value={crmTemplateForm.template_code}
                    onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, template_code: e.target.value })}
                    placeholder="e.g. crm_order_dispatch"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={crmTemplateForm.category}
                    onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339]"
                  >
                    <option value="GENERAL">General</option>
                    <option value="ORDERS">Orders & Dispatch</option>
                    <option value="SALES">Sales & Leads</option>
                    <option value="ACTIVITIES">Meetings & Follow-ups</option>
                    <option value="SUPPORT">Customer Support</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Message Body (with variables like {`{{customer_name}}`}) *
                </label>
                <textarea
                  required
                  rows={4}
                  value={crmTemplateForm.message_body}
                  onChange={(e) => setCrmTemplateForm({ ...crmTemplateForm, message_body: e.target.value })}
                  placeholder="Hello {{customer_name}}, your order {{order_id}} has been dispatched."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#2B293E]">
                <button
                  type="button"
                  onClick={() => setShowCrmTemplateModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT LOG MODAL */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[#1E1C2E] shadow-2xl border border-slate-200 dark:border-[#2B293E] p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2B293E] pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Message Log Details
                </h3>
                <span className="text-xs font-mono text-slate-400">ID: {inspectingLog.id}</span>
              </div>
              <button onClick={() => setInspectingLog(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-[#252339]/50 rounded-xl">
                <div>Recipient: <strong className="font-mono">{inspectingLog.recipient_phone}</strong></div>
                <div>Status: <strong className="font-bold">{inspectingLog.status}</strong></div>
                <div>Template: <strong className="font-mono">{inspectingLog.template_name}</strong></div>
                <div>wamid: <strong className="font-mono">{inspectingLog.provider_message_id || 'N/A'}</strong></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-1">Resolved Dynamic Variables</h4>
                <pre className="p-3 bg-slate-900 text-emerald-300 font-mono text-[11px] rounded-xl overflow-x-auto">
                  {JSON.stringify(inspectingLog.resolved_variables, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-1">Provider Request Payload Sent</h4>
                <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto">
                  {JSON.stringify(inspectingLog.payload_sent, null, 2)}
                </pre>
              </div>

              {inspectingLog.provider_response && (
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-1">External Provider Response</h4>
                  <pre className="p-3 bg-slate-900 text-blue-300 font-mono text-[11px] rounded-xl overflow-x-auto">
                    {JSON.stringify(inspectingLog.provider_response, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-[#2B293E]">
              <button
                type="button"
                onClick={() => setInspectingLog(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-[#252339] text-slate-700 dark:text-slate-300 font-semibold"
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
