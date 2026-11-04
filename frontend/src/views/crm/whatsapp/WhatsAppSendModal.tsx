import React, { useState, useEffect } from 'react';
import { X, Send, RefreshCw, MessageSquare, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
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

    // Initial variable prefill from lead
    const initialVars: Record<string, string> = {
      customer_name: leadContext?.name || leadContext?.company || '',
      first_name: leadContext?.name?.split(' ')[0] || '',
      company_name: leadContext?.company || '',
      primary_service: leadContext?.service || 'Software Consulting',
      order_id: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      delivery_date: new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-GB'),
      vehicle_number: 'GJ-01-XX-9999',
    };
    setVariables(initialVars);
  }, [isOpen, defaultTemplateId, crmTemplates, leadContext]);

  const selectedTemplate = crmTemplates.find((t) => t.id === selectedTemplateId);

  // Update preview text when variables or template change
  useEffect(() => {
    if (!selectedTemplate) {
      setPreviewText('');
      return;
    }

    let text = selectedTemplate.message_body;
    for (const [key, val] of Object.entries(variables)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`);
    }
    setPreviewText(text);
  }, [selectedTemplate, variables]);

  const handleSend = async () => {
    if (!selectedTemplateId) {
      toast.error('Please choose a template');
      return;
    }
    if (!phone.trim()) {
      toast.error('Recipient phone number is required');
      return;
    }

    setSending(true);
    try {
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
                Dispatches an approved WhatsApp message mapped to your CRM template.
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

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Select CRM Template *
            </label>
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
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Recipient Phone Number (with Country Code) *
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 919876543210"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] text-slate-800 dark:text-slate-100 font-mono focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Dynamic Variables Inputs */}
          {selectedTemplate && (selectedTemplate.detected_variables || []).length > 0 && (
            <div className="p-3.5 bg-slate-50 dark:bg-[#252339]/50 rounded-xl border border-slate-200 dark:border-[#2B293E] space-y-2.5">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                Dynamic Variables
              </span>
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

          {/* Live Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#252339] overflow-hidden">
            <div className="bg-slate-100 dark:bg-[#1E1C2E] px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-[#2B293E]">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Message Content Preview
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                Variables Interpolated
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

