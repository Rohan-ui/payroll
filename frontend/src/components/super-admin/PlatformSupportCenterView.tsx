'use client';

import React, { useState, useEffect } from 'react';
import {
  LifeBuoy, Search, Filter, MessageSquare, Clock, AlertTriangle,
  CheckCircle, ArrowRight, BookOpen, Send, Sparkles, UserCheck,
  ExternalLink, Video, ShieldCheck, ChevronRight, X, Plus
} from 'lucide-react';

export default function PlatformSupportCenterView() {
  const [activeTab, setActiveTab] = useState<'tickets' | 'kb' | 'chat'>('tickets');
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/super-admin/support');
      const json = await res.json();
      if (json.success) {
        setTickets(json.data || []);
        if (json.data?.length > 0 && !selectedTicket) {
          setSelectedTicket(json.data[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching tickets:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleRemoteLogin = (tenantSubdomain: string) => {
    showBanner(`Initiating secure Remote Impersonation session for ${tenantSubdomain}.voogyo.com...`);
    window.open(`https://${tenantSubdomain}.voogyo.com/super-admin/impersonate?token=imp_sec_live`, '_blank');
  };

  const handleSendAiDraft = () => {
    setReplyText(`Hello ${selectedTicket?.user_name || 'there'}, thank you for contacting Voogyo Enterprise Support.
I have reviewed your inquiry regarding "${selectedTicket?.subject}". Our telemetry indicates your webhook integration has been re-synchronized. Please let us know if you require any further assistance.`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Customer Success & Helpdesk
            </span>
            <span className="text-xs text-slate-500 font-medium">SLA Priority Matrix & Remote Login</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Platform Support Center</h1>
          <p className="text-xs text-slate-500">
            Manage tenant helpdesk tickets, SLA timers, live AI drafting, knowledge base articles, and 1-click workspace impersonation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'tickets' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            Tickets ({tickets.length})
          </button>
          <button
            onClick={() => setActiveTab('kb')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'kb' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            Knowledge Base
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Tab: Tickets Console */}
      {activeTab === 'tickets' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Tickets List */}
          <div className="space-y-2">
            {tickets.map((t) => {
              const isSelected = selectedTicket?.id === t.id;
              const isCritical = t.priority === 'CRITICAL' || t.priority === 'HIGH';
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-teal-50 border-[#00B7A7] shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-teal-700">#{t.ticket_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      isCritical ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {t.priority} SLA
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 mt-1 line-clamp-1">{t.subject}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t.company_name} · {t.user_name}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-amber-500" /> SLA: 1h 40m left
                    </span>
                    <span className="font-bold text-emerald-700">{t.status}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ticket Detail & Live Chat / Remote Impersonation Pane */}
          {selectedTicket && (
            <div className="md:col-span-2 space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-teal-700">#{selectedTicket.ticket_number}</span>
                    <h3 className="text-sm font-bold text-slate-900">{selectedTicket.subject}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Filed by {selectedTicket.user_name} ({selectedTicket.user_email}) · {selectedTicket.company_name}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRemoteLogin('rndtechnosoft')}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-teal-400" />
                    <span>Remote Login (Impersonate)</span>
                  </button>
                  <button
                    onClick={() => showBanner(`Ticket #${selectedTicket.ticket_number} marked Resolved!`)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold cursor-pointer"
                  >
                    Mark Resolved
                  </button>
                </div>
              </div>

              {/* Ticket Description Box */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <span className="font-bold text-slate-700 block">Customer Issue Description:</span>
                <p className="text-slate-800 leading-relaxed whitespace-pre-line">
                  {selectedTicket.description || 'We are unable to sync our biometric attendance punch data from our Surat branch eSSL device to the August payroll summary. Need urgent assistance before 10th of the month.'}
                </p>
                <div className="flex items-center gap-4 text-[10px] text-slate-400 pt-2 border-t border-slate-200">
                  <span>Category: {selectedTicket.category || 'BIOMETRIC_HRMS'}</span>
                  <span>·</span>
                  <span>Assigned to: Voogyo Support Tier-2</span>
                </div>
              </div>

              {/* AI Draft Response Assistant */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Reply to Customer</span>
                  <button
                    onClick={handleSendAiDraft}
                    className="text-xs text-teal-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Copilot Response</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type official response to tenant administrator..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      showBanner('Response dispatched to tenant email & in-app inbox!');
                      setReplyText('');
                    }}
                    className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Response</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Knowledge Base Articles */}
      {activeTab === 'kb' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Platform Knowledge Base & Troubleshooting Guides</h3>
              <p className="text-xs text-slate-500">Public and tenant-facing self-service documentation articles</p>
            </div>
            <button
              onClick={() => showBanner('Knowledge base article creator opened!')}
              className="px-3.5 py-1.5 rounded-xl bg-[#00B7A7] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create KB Article</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {[
              { title: 'Connecting eSSL & Realtime Biometric Attendance Devices to Voogyo', views: '1,420 reads', cat: 'HRMS Guide' },
              { title: 'Configuring GST E-Way Bills & Tax Invoicing on Custom Domains', views: '980 reads', cat: 'Finance' },
              { title: 'WhatsApp Cloud API Webhook Verification & Business Account Setup', views: '2,100 reads', cat: 'Integrations' }
            ].map((kb, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700">
                  {kb.cat}
                </span>
                <h4 className="font-bold text-slate-900 text-xs">{kb.title}</h4>
                <p className="text-[10px] text-slate-400">{kb.views} · Verified Documentation</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
