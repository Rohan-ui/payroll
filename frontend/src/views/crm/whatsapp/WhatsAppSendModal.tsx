import React, { useState, useEffect } from 'react';
import { X, Send, RefreshCw, MessageSquare, AlertCircle, Eye, FileText, CheckCircle2 } from 'lucide-react';
import { CrmMessageTemplate, whatsAppApi } from '../../../api/whatsapp.api';
import { toast } from '../../../lib/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  crmTemplates: CrmMessageTemplate[];
  defaultTemplateId?: string;
  leadContext?: {
    id: string;
    name?: string;
    company?: string;
    phone?: string;
    email?: string;
    service?: string;
  } | null;
  onSent?: (result: any) => void;
}

export const WhatsAppSendModal: React.FC<Props> = ({
  isOpen,
  onClose,
  crmTemplates,
  defaultTemplateId,
  leadContext,
  onSent,
}) => {
  const [sendMode, setSendMode] = useState<'template' | 'text'>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [freeformText, setFreeformText] = useState<string>('');
  const [headerImage, setHeaderImage] = useState<string>('');
  const [headerDocUrl, setHeaderDocUrl] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [previewText, setPreviewText] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    const initialTplId = defaultTemplateId || crmTemplates[0]?.id || '';
    setSelectedTemplateId(initialTplId);

    const initialPhone = leadContext?.phone || '';
    setPhone(initialPhone);

    // Dynamic variable prefill derived strictly from lead context, avoiding fake mock placeholders
    const initialVars: Record<string, string> = {
      customer_name: leadContext?.name || leadContext?.company || '',
      first_name: leadContext?.name?.split(' ')[0] || '',
      company_name: leadContext?.company || '',
      email: leadContext?.email || '',
      phone: leadContext?.phone || '',
      primary_service: leadContext?.service || '',
    };
    setVariables(initialVars);
    setFreeformText('');
  }, [isOpen, defaultTemplateId, crmTemplates, leadContext]);

  const selectedTemplate = crmTemplates.find((t) => t.id === selectedTemplateId);
  const hasActiveMapping = Boolean(
    selectedTemplate?.rndtechnosoft_crm_whatsapp_mappings &&
    selectedTemplate.rndtechnosoft_crm_whatsapp_mappings.some((m) => m.is_active)
  );

  // Update preview text when variables, mode, or template change
  useEffect(() => {
    if (sendMode === 'text') {
      setPreviewText(freeformText || '(Type your message above to preview)');
      return;
    }

    if (!selectedTemplate) {
      setPreviewText('');
      return;
    }

    let text = selectedTemplate.message_body;
    for (const [key, val] of Object.entries(variables)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`);
    }
    setPreviewText(text);
  }, [sendMode, freeformText, selectedTemplate, variables]);

  const handleSend = async () => {
    if (!phone.trim()) {
      toast.error('Recipient phone number is required');
      return;
    }

    setSending(true);
    try {
      if (sendMode === 'text') {
        if (!freeformText.trim()) {
          toast.error('Message content cannot be empty');
          setSending(false);
          return;
        }

        const res = await whatsAppApi.sendTextMessage({
          recipient: phone.trim(),
          message: freeformText.trim(),
          lead_id: leadContext?.id,
        });

        if (res.success) {
          toast.success('WhatsApp direct message dispatched successfully!');
          onSent?.(res.data);
          onClose();
        } else {
          toast.error(res.message || 'Failed to dispatch WhatsApp message');
        }
      } else {
        if (!selectedTemplateId) {
          toast.error('Please choose a template');
          setSending(false);
          return;
        }

        const res = await whatsAppApi.sendMessage({
          template_id: selectedTemplateId,
          recipient: phone.trim(),
          variables,
          lead_id: leadContext?.id,
          header_image: headerImage.trim() || undefined,
          header_document: headerDocUrl.trim() || undefined,
        });

        if (res.success) {
          toast.success(`WhatsApp message sent successfully! Message ID: ${res.data?.messageId || 'SENT'}`);
          onSent?.(res.data);
          onClose();
        } else {
          toast.error(res.message || 'Failed to dispatch WhatsApp message');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error dispatching message');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-[#1E1C2E] shadow-2xl border border-slate-200 dark:border-[#2B293E] flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2B293E] px-6 py-4 bg-slate-50/50 dark:bg-[#252339]/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Send WhatsApp Template Message
              </h2>
              <p className="text-xs text-slate-500">
                Dispatches an approved WhatsApp message mapped to your CRM template or sends a quick direct text.
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

        {/* Mode Switcher */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-[#252339] text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSendMode('template')}
              className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                sendMode === 'template'
                  ? 'bg-white dark:bg-[#1E1C2E] text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Template Message</span>
            </button>
            <button
              type="button"
              onClick={() => setSendMode('text')}
              className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                sendMode === 'text'
                  ? 'bg-white dark:bg-[#1E1C2E] text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Direct Text Message</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          
          {/* Lead Context Banner */}
          {leadContext && (
            <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
              <div>
                <span className="font-bold">Contact:</span> {leadContext.name || leadContext.company || 'Lead'}
                {leadContext.company && leadContext.name && (
                  <span className="text-emerald-700 dark:text-emerald-400"> ({leadContext.company})</span>
                )}
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-200/60 dark:bg-emerald-900/60">
                CRM Linked
              </span>
            </div>
          )}

          {sendMode === 'template' ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Select CRM Template *
                  </label>
                  {selectedTemplate && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      hasActiveMapping
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                    }`}>
                      {hasActiveMapping ? 'Mapped to WhatsApp' : 'Unmapped Template'}
                    </span>
                  )}
                </div>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] text-slate-800 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-emerald-500"
                >
                  {crmTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.template_name} ({t.template_code})
                    </option>
                  ))}
                </select>
                {!hasActiveMapping && selectedTemplate && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>This template has no active mapping. Dispatches will require an approved mapping in Template Hub.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Phone Number (with Country Code) *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +919876543210"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] text-slate-800 dark:text-slate-100 font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Dynamic Variables Inputs */}
              {selectedTemplate && (selectedTemplate.detected_variables || []).length > 0 && (
                <div className="p-3.5 bg-slate-50 dark:bg-[#252339]/50 rounded-xl border border-slate-200 dark:border-[#2B293E] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      Dynamic Variables
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Auto-filled from contact
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {selectedTemplate.detected_variables.map((v) => (
                      <div key={v}>
                        <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-0.5">
                          {`{{${v}}}`}
                        </label>
                        <input
                          type="text"
                          value={variables[v] || ''}
                          onChange={(e) => setVariables({ ...variables, [v]: e.target.value })}
                          placeholder={`Value for ${v}`}
                          className="w-full px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1C2E] text-slate-800 dark:text-slate-200 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Phone Number (with Country Code) *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +919876543210"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] text-slate-800 dark:text-slate-100 font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Direct Text Message Body *
                </label>
                <textarea
                  rows={4}
                  value={freeformText}
                  onChange={(e) => setFreeformText(e.target.value)}
                  placeholder="Type your WhatsApp message directly to the client..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </>
          )}

          {/* Live Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] overflow-hidden">
            <div className="bg-slate-100 dark:bg-[#1E1C2E] px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-[#2B293E]">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Message Content Preview
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                {sendMode === 'template' ? 'Variables Interpolated' : 'Direct Text'}
              </span>
            </div>
            <div className="p-3.5 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-line font-sans bg-emerald-50/20 dark:bg-emerald-950/10 min-h-[70px]">
              {previewText}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-[#2B293E] px-6 py-3.5 bg-slate-50/50 dark:bg-[#252339]/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252339] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={handleSend}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-xs"
          >
            {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Dispatch Message</span>
          </button>
        </div>

      </div>
    </div>
  );
};
