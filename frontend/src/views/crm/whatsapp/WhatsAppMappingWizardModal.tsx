import React, { useState, useEffect } from 'react';
import {
  X, Check, AlertCircle, ArrowRight, ArrowLeft, RefreshCw, Send,
  FileText, Sparkles, MessageSquare, Image as ImageIcon, Video, File,
  Layers, Link2, Eye, ShieldCheck, CheckCircle2, ChevronRight
} from 'lucide-react';
import {
  CrmMessageTemplate,
  WhatsAppProviderTemplate,
  WhatsAppTemplateMapping,
  whatsAppApi
} from '../../../api/whatsapp.api';
import { toast } from '../../../lib/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingMapping?: WhatsAppTemplateMapping | null;
  initialCrmTemplateId?: string;
  initialWhatsappTemplateName?: string;
  crmTemplates: CrmMessageTemplate[];
  providerTemplates: WhatsAppProviderTemplate[];
}

export const WhatsAppMappingWizardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSaved,
  editingMapping,
  initialCrmTemplateId,
  initialWhatsappTemplateName,
  crmTemplates,
  providerTemplates,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [selectedCrmId, setSelectedCrmId] = useState<string>('');
  const [whatsappTemplateName, setWhatsappTemplateName] = useState<string>('');
  const [whatsappLanguage, setWhatsappLanguage] = useState<string>('en');

  // Mappings
  const [bodyMapping, setBodyMapping] = useState<Record<string, string>>({});
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [mediaType, setMediaType] = useState<'NONE' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('NONE');
  const [mediaMapping, setMediaMapping] = useState<Record<string, string>>({});
  const [buttonMapping, setButtonMapping] = useState<Record<string, string>>({});
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});

  // Preview & Testing State
  const [previewData, setPreviewData] = useState<{
    crmMessage?: string;
    resolvedVariables?: Record<string, string>;
    missingVariables?: string[];
    providerPayload?: any;
  } | null>(null);
  const [testRecipientPhone, setTestRecipientPhone] = useState<string>('919876543210');
  const [sendingTest, setSendingTest] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize data when editing or opening
  useEffect(() => {
    if (!isOpen) return;

    if (editingMapping) {
      setSelectedCrmId(editingMapping.crm_template_id);
      setWhatsappTemplateName(editingMapping.whatsapp_template_name);
      setWhatsappLanguage(editingMapping.whatsapp_template_language || 'en');
      setBodyMapping(editingMapping.body_mapping || {});
      setHeaderMapping(editingMapping.header_mapping || {});
      setMediaType(editingMapping.media_type || 'NONE');
      setMediaMapping(editingMapping.media_mapping || {});
      setButtonMapping(editingMapping.button_mapping || {});
      setSampleValues(editingMapping.sample_preview_values || {});
      setStep(3);
    } else {
      setSelectedCrmId(initialCrmTemplateId || crmTemplates[0]?.id || '');
      setWhatsappTemplateName(initialWhatsappTemplateName || providerTemplates[0]?.name || 'order_dispatch');
      setWhatsappLanguage('en');
      setBodyMapping({});
      setHeaderMapping({});
      setMediaType('NONE');
      setMediaMapping({});
      setButtonMapping({});
      setSampleValues({
        customer_name: 'Rohan',
        order_id: 'ORD-10025',
        vehicle_number: 'GJ-15-AB-1234',
        delivery_date: '5 November 2026',
        first_name: 'Rohan',
        company_name: 'Acme Logistics',
      });
      setStep(1);
    }
  }, [isOpen, editingMapping, crmTemplates, providerTemplates]);

  const selectedCrmTemplate = crmTemplates.find((t) => t.id === selectedCrmId);
  const selectedProviderTemplate = providerTemplates.find((p) => p.name === whatsappTemplateName);

  // Auto-suggest mappings when transitioning to Step 3
  const handleAutoSuggest = () => {
    if (!selectedCrmTemplate) return;
    const crmVars = selectedCrmTemplate.detected_variables || [];
    const newBodyMap: Record<string, string> = { ...bodyMapping };

    // Common smart heuristic: field_1 -> 1st var, field_2 -> 2nd var, etc.
    crmVars.forEach((v, index) => {
      const fieldKey = `field_${index + 1}`;
      if (!newBodyMap[fieldKey]) {
        newBodyMap[fieldKey] = v;
      }
    });

    setBodyMapping(newBodyMap);
    toast.success('Auto-mapped CRM variables to WhatsApp fields!');
  };

  // Live preview refresh
  useEffect(() => {
    if (step === 3 && selectedCrmTemplate) {
      updateLivePreview();
    }
  }, [step, selectedCrmId, whatsappTemplateName, bodyMapping, headerMapping, mediaType, mediaMapping, buttonMapping, sampleValues]);

  const updateLivePreview = async () => {
    if (!selectedCrmId) return;
    try {
      const res = await whatsAppApi.previewMapping({
        crm_template_id: selectedCrmId,
        whatsapp_template_name: whatsappTemplateName || 'sample_template',
        whatsapp_template_language: whatsappLanguage,
        body_mapping: bodyMapping,
        header_mapping: headerMapping,
        media_type: mediaType,
        media_mapping: mediaMapping,
        button_mapping: buttonMapping,
        variables: sampleValues,
        recipient: testRecipientPhone,
      });
      if (res.success) {
        setPreviewData(res.data);
      }
    } catch {
      // Ignore preview errors during typing
    }
  };

  const handleSendTestMessage = async () => {
    if (!selectedCrmId) {
      toast.error('Please select a CRM template');
      return;
    }
    if (!testRecipientPhone.trim()) {
      toast.error('Enter recipient phone number for test dispatch');
      return;
    }

    setSendingTest(true);
    try {
      // First save or temporarily send with current payload
      const res = await whatsAppApi.sendMessage({
        template_id: selectedCrmId,
        recipient: testRecipientPhone.trim(),
        variables: sampleValues,
        header_image: mediaType === 'IMAGE' ? mediaMapping.header_image : undefined,
        header_video: mediaType === 'VIDEO' ? mediaMapping.header_video : undefined,
        header_document: mediaType === 'DOCUMENT' ? mediaMapping.header_document : undefined,
        header_document_name: mediaType === 'DOCUMENT' ? mediaMapping.header_document_name : undefined,
        button_0: buttonMapping.button_0,
        button_1: buttonMapping.button_1,
        copy_code: buttonMapping.copy_code,
      });

      if (res.success) {
        toast.success(`Test WhatsApp message sent! Status: ${res.data?.status} (ID: ${res.data?.messageId || 'Queued'})`);
      } else {
        toast.error(res.message || 'Test message failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send test message');
    } finally {
      setSendingTest(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCrmId) {
      toast.error('Please select a CRM template');
      return;
    }
    if (!whatsappTemplateName.trim()) {
      toast.error('Please specify an approved WhatsApp template name');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        crm_template_id: selectedCrmId,
        whatsapp_template_name: whatsappTemplateName.trim(),
        whatsapp_template_language: whatsappLanguage.trim() || 'en',
        body_mapping: bodyMapping,
        header_mapping: Object.keys(headerMapping).length > 0 ? headerMapping : null,
        media_type: mediaType,
        media_mapping: Object.keys(mediaMapping).length > 0 ? mediaMapping : null,
        button_mapping: Object.keys(buttonMapping).length > 0 ? buttonMapping : null,
        sample_preview_values: sampleValues,
        is_active: true,
      };

      if (editingMapping) {
        await whatsAppApi.updateMapping(editingMapping.id, payload);
        toast.success('WhatsApp template mapping updated successfully!');
      } else {
        await whatsAppApi.saveMapping(payload);
        toast.success('WhatsApp template mapping saved successfully!');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save mapping');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white dark:bg-[#1E1C2E] shadow-2xl border border-slate-200 dark:border-[#2B293E] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2B293E] px-6 py-4 bg-slate-50/50 dark:bg-[#252339]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {editingMapping ? 'Edit WhatsApp Template Mapping' : 'Connect CRM Template to WhatsApp'}
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-medium">
                  Dynamic Automation
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Map CRM parameters to WhatsApp variables once; the system dynamically resolves and sends approved payloads.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#2B293E] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Stepper */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] flex items-center justify-between text-xs">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setStep(1)}
              className={`flex items-center gap-2 font-semibold transition-colors ${
                step === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 1 ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-[#2B293E] text-slate-500'
              }`}>1</span>
              <span>1. Select CRM Template</span>
            </button>

            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />

            <button
              onClick={() => setStep(2)}
              className={`flex items-center gap-2 font-semibold transition-colors ${
                step === 2 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 2 ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-[#2B293E] text-slate-500'
              }`}>2</span>
              <span>2. Select WhatsApp Template</span>
            </button>

            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />

            <button
              onClick={() => setStep(3)}
              className={`flex items-center gap-2 font-semibold transition-colors ${
                step === 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-[#2B293E] text-slate-500'
              }`}>3</span>
              <span>3. Map Dynamic Variables</span>
            </button>
          </div>

          {step === 3 && (
            <button
              type="button"
              onClick={handleAutoSuggest}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Suggest Mappings</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* STEP 1: SELECT CRM TEMPLATE */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Step 1: Choose the Internal CRM Template
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select the business template you want to connect (e.g. Order Dispatch, Lead Welcome, Quotation Proposal).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {crmTemplates.map((tpl) => {
                  const isSelected = tpl.id === selectedCrmId;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedCrmId(tpl.id)}
                      className={`cursor-pointer rounded-xl p-4 border transition-all text-left flex flex-col justify-between ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339]/50 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                            {tpl.template_name}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#2B293E] text-slate-600 dark:text-slate-300">
                            {tpl.category}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-500 mb-2">
                          ID: <span className="text-emerald-600 dark:text-emerald-400">{tpl.template_code}</span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 bg-slate-50 dark:bg-[#1E1C2E] p-2.5 rounded-lg border border-slate-100 dark:border-[#2B293E] whitespace-pre-line mb-3 font-mono">
                          {tpl.message_body}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-[#2B293E]">
                        <span className="text-[11px] font-semibold text-slate-400">Variables:</span>
                        {(tpl.detected_variables || []).length > 0 ? (
                          tpl.detected_variables.map((v) => (
                            <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                              {`{{${v}}}`}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">No variables</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: SELECT APPROVED WHATSAPP TEMPLATE */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Step 2: Choose the External Approved WhatsApp Template
                </h3>
                <p className="text-xs text-slate-500">
                  Match your CRM template with the approved template created in your WhatsApp Business account.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp Template Name *
                  </label>
                  <input
                    type="text"
                    value={whatsappTemplateName}
                    onChange={(e) => setWhatsappTemplateName(e.target.value)}
                    placeholder="e.g. order_dispatch, lead_welcome_v1"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] text-slate-800 dark:text-slate-100 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Template Language
                  </label>
                  <select
                    value={whatsappLanguage}
                    onChange={(e) => setWhatsappLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#252339] text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="en">English (en)</option>
                    <option value="en_US">English US (en_US)</option>
                    <option value="hi">Hindi (hi)</option>
                    <option value="mr">Marathi (mr)</option>
                    <option value="gu">Gujarati (gu)</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Available Approved Templates from Provider ({providerTemplates.length})
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {providerTemplates.map((p) => {
                    const isSelected = p.name === whatsappTemplateName;
                    return (
                      <div
                        key={p.name}
                        onClick={() => {
                          setWhatsappTemplateName(p.name);
                          setWhatsappLanguage(p.language || 'en');
                        }}
                        className={`cursor-pointer p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 ring-1 ring-emerald-500'
                            : 'border-slate-200 dark:border-[#2B293E] hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#252339]/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                            {p.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-bold">
                            {p.status}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 whitespace-pre-line bg-slate-50 dark:bg-[#1E1C2E] p-2 rounded border border-slate-100 dark:border-[#2B293E] line-clamp-3">
                          {p.body_text || '(Template text not provided)'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MAP VARIABLES & LIVE PREVIEW */}
          {step === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in-50 duration-150">
              
              {/* Left Column: Variable Configuration Form */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* Body Variables Table */}
                <div className="bg-slate-50/70 dark:bg-[#252339]/40 p-4 rounded-xl border border-slate-200 dark:border-[#2B293E]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-emerald-500" />
                      Body Variables Mapping (field_1, field_2, ...)
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      CRM Template: <strong className="text-slate-700 dark:text-slate-200">{selectedCrmTemplate?.template_name}</strong>
                    </span>
                  </div>

                  <div className="border border-slate-200 dark:border-[#2B293E] rounded-lg overflow-hidden bg-white dark:bg-[#1E1C2E]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-[#252339] text-slate-500 font-bold border-b border-slate-200 dark:border-[#2B293E]">
                        <tr>
                          <th className="py-2 px-3 w-1/4">WhatsApp Variable</th>
                          <th className="py-2 px-3 w-1/2">Mapped CRM Variable</th>
                          <th className="py-2 px-3 w-1/4">Sample Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                        {[1, 2, 3, 4, 5, 6].map((num) => {
                          const fieldKey = `field_${num}`;
                          const currentVar = bodyMapping[fieldKey] || '';
                          return (
                            <tr key={fieldKey} className="hover:bg-slate-50/50 dark:hover:bg-[#252339]/30">
                              <td className="py-2 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                                {fieldKey} <span className="text-[10px] text-slate-400">({`{{${num}}}`})</span>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={currentVar}
                                    onChange={(e) => {
                                      setBodyMapping({ ...bodyMapping, [fieldKey]: e.target.value });
                                      if (e.target.value && !sampleValues[e.target.value]) {
                                        setSampleValues({ ...sampleValues, [e.target.value]: `Sample ${e.target.value}` });
                                      }
                                    }}
                                    className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono text-slate-800 dark:text-slate-200"
                                  >
                                    <option value="">-- None (unmapped) --</option>
                                    {(selectedCrmTemplate?.detected_variables || []).map((v) => (
                                      <option key={v} value={v}>
                                        {`{{${v}}}`}
                                      </option>
                                    ))}
                                    <optgroup label="Standard CRM Lead Attributes">
                                      <option value="first_name">first_name</option>
                                      <option value="last_name">last_name</option>
                                      <option value="full_name">full_name</option>
                                      <option value="company_name">company_name</option>
                                      <option value="email">email</option>
                                      <option value="phone">phone</option>
                                      <option value="primary_service">primary_service</option>
                                      <option value="city">city</option>
                                      <option value="lead_code">lead_code</option>
                                      <option value="today">today (current date)</option>
                                    </optgroup>
                                  </select>
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={sampleValues[currentVar] || ''}
                                  onChange={(e) => setSampleValues({ ...sampleValues, [currentVar]: e.target.value })}
                                  placeholder="Sample value"
                                  disabled={!currentVar}
                                  className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono text-slate-800 dark:text-slate-200 disabled:opacity-40"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Header Variables & Media Support */}
                <div className="bg-slate-50/70 dark:bg-[#252339]/40 p-4 rounded-xl border border-slate-200 dark:border-[#2B293E] space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-500" />
                    Header & Dynamic Media Configuration
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Header Text Variable (header_field_1)
                      </label>
                      <select
                        value={headerMapping.header_field_1 || ''}
                        onChange={(e) => setHeaderMapping({ ...headerMapping, header_field_1: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                      >
                        <option value="">-- None --</option>
                        {(selectedCrmTemplate?.detected_variables || []).map((v) => (
                          <option key={v} value={v}>{`{{${v}}}`}</option>
                        ))}
                        <option value="company_name">company_name</option>
                        <option value="first_name">first_name</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Header Media Type
                      </label>
                      <select
                        value={mediaType}
                        onChange={(e) => setMediaType(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339]"
                      >
                        <option value="NONE">None (Text-only Header)</option>
                        <option value="IMAGE">Image (header_image)</option>
                        <option value="VIDEO">Video (header_video)</option>
                        <option value="DOCUMENT">Document / PDF (header_document)</option>
                      </select>
                    </div>
                  </div>

                  {mediaType !== 'NONE' && (
                    <div className="p-3 bg-white dark:bg-[#1E1C2E] rounded-lg border border-slate-200 dark:border-[#2B293E] space-y-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          {mediaType === 'IMAGE' ? 'Image URL (or {{variable}})' : mediaType === 'VIDEO' ? 'Video URL' : 'Document URL (or {{invoice_url}})'}
                        </label>
                        <input
                          type="text"
                          value={
                            mediaType === 'IMAGE'
                              ? mediaMapping.header_image || ''
                              : mediaType === 'VIDEO'
                              ? mediaMapping.header_video || ''
                              : mediaMapping.header_document || ''
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (mediaType === 'IMAGE') setMediaMapping({ ...mediaMapping, header_image: val });
                            else if (mediaType === 'VIDEO') setMediaMapping({ ...mediaMapping, header_video: val });
                            else setMediaMapping({ ...mediaMapping, header_document: val });
                          }}
                          placeholder="https://... or {{invoice_pdf_url}}"
                          className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                        />
                      </div>

                      {mediaType === 'DOCUMENT' && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Document Display Name (header_document_name)
                          </label>
                          <input
                            type="text"
                            value={mediaMapping.header_document_name || ''}
                            onChange={(e) => setMediaMapping({ ...mediaMapping, header_document_name: e.target.value })}
                            placeholder="e.g. Quotation.pdf or {{order_id}}.pdf"
                            className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Dynamic Button Variables */}
                <div className="bg-slate-50/70 dark:bg-[#252339]/40 p-4 rounded-xl border border-slate-200 dark:border-[#2B293E] space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-emerald-500" />
                    Dynamic Buttons (button_0, button_1, copy_code)
                  </h4>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">button_0</label>
                      <input
                        type="text"
                        value={buttonMapping.button_0 || ''}
                        onChange={(e) => setButtonMapping({ ...buttonMapping, button_0: e.target.value })}
                        placeholder="{{portal_url}}"
                        className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">button_1</label>
                      <input
                        type="text"
                        value={buttonMapping.button_1 || ''}
                        onChange={(e) => setButtonMapping({ ...buttonMapping, button_1: e.target.value })}
                        placeholder="{{phone}}"
                        className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">copy_code</label>
                      <input
                        type="text"
                        value={buttonMapping.copy_code || ''}
                        onChange={(e) => setButtonMapping({ ...buttonMapping, copy_code: e.target.value })}
                        placeholder="{{coupon_code}}"
                        className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] font-mono"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Live Testing & Real-time Payload Preview */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* Live Message Preview */}
                <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] overflow-hidden shadow-xs">
                  <div className="bg-emerald-600 text-white px-3 py-2 flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      Live Message Preview
                    </span>
                    <span className="text-[10px] font-mono opacity-90">{whatsappTemplateName} ({whatsappLanguage})</span>
                  </div>

                  <div className="p-4 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs font-sans whitespace-pre-line text-slate-800 dark:text-slate-200 min-h-[90px] border-b border-slate-100 dark:border-[#2B293E]">
                    {previewData?.crmMessage || selectedCrmTemplate?.message_body}
                  </div>

                  {previewData?.missingVariables && previewData.missingVariables.length > 0 && (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Missing sample values for: {previewData.missingVariables.join(', ')}</span>
                    </div>
                  )}

                  {/* Provider JSON Payload Preview */}
                  <div className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-56">
                    <div className="text-[10px] uppercase font-bold text-emerald-400 mb-1 flex items-center justify-between">
                      <span>External WhatsApp API Payload</span>
                      <span className="text-slate-400 font-normal">POST .../send-template-message</span>
                    </div>
                    <pre className="text-slate-300">
                      {JSON.stringify(previewData?.providerPayload || {}, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Instant Test Dispatch Card */}
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" />
                      Dispatch Live Test Message
                    </h5>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={testRecipientPhone}
                      onChange={(e) => setTestRecipientPhone(e.target.value)}
                      placeholder="e.g. 919876543210"
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] font-mono text-slate-800 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      disabled={sendingTest}
                      onClick={handleSendTestMessage}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      {sendingTest ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      <span>Send Test</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Sends an actual test template dispatch using current variable mappings and sample test values.
                  </p>
                </div>

              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-[#2B293E] px-6 py-3.5 bg-slate-50/50 dark:bg-[#252339]/40">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339] transition-colors"
            >
              Cancel
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as any)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-xs"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Mapping</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
