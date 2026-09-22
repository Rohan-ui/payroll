'use client';

import React, { useState } from 'react';
import {
  Sparkles, Send, Zap, Bot, CheckCircle, Clock, AlertTriangle,
  ArrowRight, Check, X, RefreshCw, Layers, ShieldCheck, Database
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  data?: any;
  suggestedAction?: {
    label: string;
    type: string;
    params: any;
  };
}

export default function SuperAdminAiAssistantView() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      text: 'Hello Ravi, I am your dedicated Voogyo HQ Executive Copilot. I have full telemetry across all 4 customer workspaces, MySQL database health, active subscriptions, and payment webhooks. What would you like to inspect or automate today?',
      timestamp: '00:00'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const quickPromptChips = [
    'Which tenants expire this week?',
    'Which subscriptions failed payment?',
    'Show today\'s MRR and ARR breakdown',
    'Create a 25% discount coupon for Growth Plan',
    'Send renewal reminders',
    'Show AI credit consumption',
    'Generate platform revenue report'
  ];

  const handleSend = async (queryText?: string) => {
    const promptToSend = queryText || inputQuery;
    if (!promptToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      sender: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!queryText) setInputQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/super-admin/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptToSend })
      });
      const data = await res.json();

      if (data.success) {
        const assistantMsg: ChatMessage = {
          id: 'msg_' + Date.now() + '_ai',
          sender: 'assistant',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          data: data.data,
          suggestedAction: data.suggestedAction
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (e) {
      console.error('AI assistant error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (action: any) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/super-admin/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_action',
          actionPayload: action
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMessage(data.message || 'Action executed successfully!');
        setPendingAction(null);
        setTimeout(() => setActionSuccessMessage(null), 5000);
      }
    } catch (e) {
      console.error('Error confirming action:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-600 to-cyan-500 text-white flex items-center justify-center shadow-sm">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-slate-900">Voogyo HQ Executive Copilot</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                Gemini 1.5 Pro
              </span>
            </div>
            <p className="text-xs text-slate-500">Autonomous platform analytics, revenue queries, and 1-click administrative actions.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Telemetry Connected
          </span>
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col h-[580px] overflow-hidden">
        {/* Messages scroll area */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-2xl rounded-2xl p-4 text-xs space-y-2.5 ${
                    isUser
                      ? 'bg-slate-900 text-white rounded-br-xs'
                      : 'bg-slate-50 text-slate-800 border border-slate-200 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-line leading-relaxed">{m.text}</p>

                  {/* Render dynamic data tables if returned */}
                  {m.data && Array.isArray(m.data) && m.data.length > 0 && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white text-slate-800 mt-2">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">Workspace</th>
                            <th className="p-2.5">Plan</th>
                            <th className="p-2.5">Period End</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {m.data.map((row: any, i: number) => (
                            <tr key={i}>
                              <td className="p-2.5 font-bold">{row.company_name}</td>
                              <td className="p-2.5 text-teal-700 font-semibold">{row.plan_name}</td>
                              <td className="p-2.5 text-slate-500 font-mono">
                                {new Date(row.current_period_end).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Suggested Action Pill */}
                  {m.suggestedAction && (
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-semibold">Recommended Administrative Action:</span>
                      <button
                        onClick={() => setPendingAction(m.suggestedAction)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Zap className="w-3 h-3" />
                        <span>{m.suggestedAction.label}</span>
                      </button>
                    </div>
                  )}

                  <span className={`text-[9px] block text-right font-mono ${isUser ? 'text-slate-400' : 'text-slate-400'}`}>
                    {m.timestamp}
                  </span>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 items-center text-slate-400 text-xs">
              <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center animate-spin">
                <RefreshCw className="w-4 h-4" />
              </div>
              <span>Gemini Copilot is evaluating telemetry & metrics...</span>
            </div>
          )}
        </div>

        {/* Quick Prompts Bar */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Quick Queries:</span>
          {quickPromptChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(chip)}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-teal-300 hover:text-teal-700 text-[11px] text-slate-600 font-medium whitespace-nowrap transition-all shadow-xs cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Query Input Bar */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center gap-3">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything about SaaS revenues, tenant status, failed webhooks, or ask to create coupons..."
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#00B7A7]"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputQuery.trim() || loading}
            className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Confirm Platform Action</h3>
                <p className="text-xs text-slate-500">Autonomous AI Execution Safety Safeguard</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              Are you sure you want to execute: <strong>{pendingAction.label}</strong>?
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPendingAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmAction(pendingAction)}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm & Execute</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
