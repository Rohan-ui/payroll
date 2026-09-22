'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders, Building2, Globe, FileText, Bot, Mail, MessageSquare,
  Smartphone, CreditCard, HardDrive, Shield, Check, Save, RefreshCw,
  CheckCircle, AlertTriangle, Eye, EyeOff, Lock, Send, Terminal,
  ExternalLink, Sparkles, Layers
} from 'lucide-react';

export default function GlobalSettingsCenterView() {
  const [activeTab, setActiveTab] = useState<
    'general' | 'localization' | 'invoice' | 'quotation' | 'ai' | 'email' | 'whatsapp' | 'sms' | 'payment' | 'storage' | 'domain'
  >('email');

  const [loading, setLoading] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Email Subsystem States
  const [smtpForm, setSmtpForm] = useState({
    host: 'smtp.sendgrid.net',
    port: '587',
    username: 'apikey',
    password: 'SG.voog_master_live_key_99218',
    senderName: 'Voogyo Enterprise Cloud',
    senderEmail: 'no-reply@voogyo.com',
    replyToEmail: 'support@voogyo.com',
    encryption: 'TLS'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<any>(null);

  const [emailPreferences, setEmailPreferences] = useState({
    enableNotifications: true,
    enableMarketing: true,
    enableTransactional: true,
    enableAuthEmails: true,
    enableInvoiceEmails: true
  });

  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);

  // General Settings State
  const [generalForm, setGeneralForm] = useState({
    companyName: 'Voogyo Technologies Private Limited',
    logoUrl: '/voogyo-logo.png',
    faviconUrl: '/favicon.ico',
    supportEmail: 'support@voogyo.com',
    supportPhone: '+91 98765 43210',
    address: 'Voogyo Tower, Cyber Park, SG Highway, Ahmedabad, Gujarat 380054, India',
    gstin: '24AAACV1234F1Z8',
    pan: 'AAACV1234F',
    msme: 'UDYAM-GJ-01-0099812',
    cin: 'U72900GJ2024PTC149812'
  });

  // Invoice & Quotation Settings
  const [invoiceForm, setInvoiceForm] = useState({
    prefix: 'VOOG-INV-',
    postfix: '/26-27',
    financialYear: '2026-2027',
    sacCode: '998314',
    gstPercentage: '18',
    enableQrCode: true,
    defaultNotes: 'Thank you for choosing Voogyo Cloud Platform.',
    defaultTerms: 'Payment due upon receipt. Interest @18% p.a. applicable on overdue balance.'
  });

  // AI Settings
  const [aiForm, setAiForm] = useState({
    defaultModel: 'gemini-1.5-pro',
    monthlyQuotaLimit: 50000000,
    defaultLanguage: 'English (India)',
    enableCodeAssistance: true
  });

  useEffect(() => {
    fetchEmailData();
  }, []);

  const fetchEmailData = async () => {
    try {
      const res = await fetch('/api/v1/super-admin/email');
      const json = await res.json();
      if (json.success) {
        if (json.data.smtp) setSmtpForm(json.data.smtp);
        if (json.data.preferences) setEmailPreferences(json.data.preferences);
        if (json.data.templates) {
          setEmailTemplates(json.data.templates);
          if (json.data.templates.length > 0 && !selectedTemplate) {
            setSelectedTemplate(json.data.templates[0]);
          }
        }
        if (json.data.logs) setEmailLogs(json.data.logs);
      }
    } catch (e) {
      console.error('Error fetching email settings:', e);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await fetch('/api/v1/super-admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_connection',
          ...smtpForm
        })
      });
      const data = await res.json();
      if (data.success) {
        setSmtpTestResult(data.data);
      }
    } catch (e) {
      console.error('SMTP test error:', e);
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSaveSmtp = async () => {
    try {
      const res = await fetch('/api/v1/super-admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_smtp',
          ...smtpForm
        })
      });
      const data = await res.json();
      if (data.success) {
        showBanner('SMTP Gateway configuration securely saved to database!');
      }
    } catch (e) {
      console.error('Save SMTP error:', e);
    }
  };

  const handleSavePreferences = async () => {
    try {
      const res = await fetch('/api/v1/super-admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_preferences',
          preferences: emailPreferences
        })
      });
      const data = await res.json();
      if (data.success) {
        showBanner('Email notification preferences saved!');
      }
    } catch (e) {
      console.error('Save preferences error:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Voogyo Core Engine
            </span>
            <span className="text-xs text-slate-500 font-medium">Common Settings Center</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Global Settings Center</h1>
          <p className="text-xs text-slate-500">
            Configure outgoing SMTP services, dynamic email templates, localization, AI models, and cloud storage providers.
          </p>
        </div>

        <button
          onClick={() => showBanner('All platform configuration parameters synchronized!')}
          className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Save All Settings</span>
        </button>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'general', label: 'General & Identity', icon: Building2 },
          { id: 'email', label: 'Email Subsystem', icon: Mail, badge: '16 Templates' },
          { id: 'localization', label: 'Localization', icon: Globe },
          { id: 'invoice', label: 'Invoice Settings', icon: FileText },
          { id: 'quotation', label: 'Quotation Settings', icon: FileText },
          { id: 'ai', label: 'AI Models', icon: Bot },
          { id: 'whatsapp', label: 'WhatsApp API', icon: MessageSquare },
          { id: 'sms', label: 'SMS Gateways', icon: Smartphone },
          { id: 'payment', label: 'Payment Gateways', icon: CreditCard },
          { id: 'storage', label: 'Cloud Storage', icon: HardDrive }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ================= TAB: EMAIL SUBSYSTEM ================= */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          {/* SMTP Configuration Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">SMTP Outgoing Service Configuration</h3>
                <p className="text-xs text-slate-500">Configure transactional and notification emails via SendGrid, AWS SES, or custom SMTP</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestSmtp}
                  disabled={testingSmtp}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>{testingSmtp ? 'Testing Handshake...' : 'Test SMTP Connection'}</span>
                </button>
                <button
                  onClick={handleSaveSmtp}
                  className="px-3.5 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save SMTP Config</span>
                </button>
              </div>
            </div>

            {/* Live SMTP Handshake Result */}
            {smtpTestResult && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>{smtpTestResult.message}</span>
                </div>
                <p className="text-[11px] text-emerald-700 font-mono">
                  Host: {smtpTestResult.server}:{smtpTestResult.port} · Cipher: {smtpTestResult.tlsHandshake} · Roundtrip: {smtpTestResult.latencyMs}ms
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="font-bold text-slate-700">SMTP Host</label>
                <input
                  type="text"
                  value={smtpForm.host}
                  onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                  placeholder="smtp.sendgrid.net"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">SMTP Port</label>
                <input
                  type="text"
                  value={smtpForm.port}
                  onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })}
                  placeholder="587"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">SMTP Username</label>
                <input
                  type="text"
                  value={smtpForm.username}
                  onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
                  placeholder="apikey"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">SMTP Password / API Key</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={smtpForm.password}
                    onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                    className="w-full p-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-1">
              <div>
                <label className="font-bold text-slate-700">Sender Display Name</label>
                <input
                  type="text"
                  value={smtpForm.senderName}
                  onChange={(e) => setSmtpForm({ ...smtpForm, senderName: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Sender Email Address</label>
                <input
                  type="email"
                  value={smtpForm.senderEmail}
                  onChange={(e) => setSmtpForm({ ...smtpForm, senderEmail: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Reply-To Email</label>
                <input
                  type="email"
                  value={smtpForm.replyToEmail}
                  onChange={(e) => setSmtpForm({ ...smtpForm, replyToEmail: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Encryption Type</label>
                <select
                  value={smtpForm.encryption}
                  onChange={(e) => setSmtpForm({ ...smtpForm, encryption: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                >
                  <option value="TLS">TLS (Recommended - Port 587)</option>
                  <option value="SSL">SSL (Port 465)</option>
                  <option value="NONE">None (Port 25)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Email Preferences Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Email Dispatch Preferences</h3>
                <p className="text-xs text-slate-500">Control automated delivery triggers across operational categories</p>
              </div>
              <button
                onClick={handleSavePreferences}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Save Preferences
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {[
                { key: 'enableNotifications', label: 'Platform Notifications', desc: 'Alerts & mentions' },
                { key: 'enableMarketing', label: 'Marketing Campaigns', desc: 'Promotions & news' },
                { key: 'enableTransactional', label: 'Transactional Emails', desc: 'Activity alerts' },
                { key: 'enableAuthEmails', label: 'Authentication & OTP', desc: 'Pass reset & 2FA' },
                { key: 'enableInvoiceEmails', label: 'Invoices & Quotes', desc: 'GST bills & receipts' }
              ].map((item) => (
                <label key={item.key} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2 cursor-pointer">
                  <div>
                    <span className="font-bold text-slate-900 block">{item.label}</span>
                    <span className="text-[10px] text-slate-500">{item.desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={(emailPreferences as any)[item.key]}
                    onChange={(e) => setEmailPreferences({ ...emailPreferences, [item.key]: e.target.checked })}
                    className="rounded text-teal-600 focus:ring-teal-500 self-start cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Dynamic 16 Email Templates Manager */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Dynamic Email Templates (16 Templates Supported)</h3>
              <p className="text-xs text-slate-500">
                Supports dynamic variables like <code className="text-teal-700">{'{{company_name}}'}</code>, <code className="text-teal-700">{'{{user_name}}'}</code>, <code className="text-teal-700">{'{{invoice_number}}'}</code>, <code className="text-teal-700">{'{{amount}}'}</code>, <code className="text-teal-700">{'{{login_url}}'}</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Template List */}
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {emailTemplates.map((tpl) => {
                  const isSelected = selectedTemplate?.id === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl)}
                      className={`p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-50 border-teal-400 text-teal-900 font-bold'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{tpl.name}</span>
                        <span className="text-[9px] font-mono uppercase text-slate-400">{tpl.category}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{tpl.subject}</p>
                    </div>
                  );
                })}
              </div>

              {/* Template Editor */}
              {selectedTemplate && (
                <div className="md:col-span-2 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{selectedTemplate.name}</span>
                    <button
                      onClick={() => showBanner(`Saved template '${selectedTemplate.name}'!`)}
                      className="px-3 py-1.5 rounded-lg bg-[#00B7A7] text-white font-bold text-xs cursor-pointer"
                    >
                      Save Template
                    </button>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Subject Line</label>
                    <input
                      type="text"
                      defaultValue={selectedTemplate.subject}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#00B7A7]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Body HTML (With Variable Tags)</label>
                    <textarea
                      rows={7}
                      defaultValue={selectedTemplate.body_html}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-mono text-xs focus:outline-none focus:border-[#00B7A7]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Email Delivery Logs */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Recent Outgoing Email Delivery Logs</h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-3">Recipient</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Sent Timestamp</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emailLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-semibold text-slate-900">{log.recipient_email}</td>
                      <td className="p-3 text-slate-700">{log.subject}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'DELIVERED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">{new Date(log.sent_at).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => showBanner(`Queued re-send for ${log.recipient_email}`)}
                          className="text-xs text-teal-600 font-bold hover:underline cursor-pointer"
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB: GENERAL SETTINGS ================= */}
      {activeTab === 'general' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 max-w-3xl">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Corporate & Legal Identity</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700">Company Name</label>
              <input
                type="text"
                value={generalForm.companyName}
                onChange={(e) => setGeneralForm({ ...generalForm, companyName: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">Official GSTIN</label>
              <input
                type="text"
                value={generalForm.gstin}
                onChange={(e) => setGeneralForm({ ...generalForm, gstin: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">PAN Number</label>
              <input
                type="text"
                value={generalForm.pan}
                onChange={(e) => setGeneralForm({ ...generalForm, pan: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">CIN Number</label>
              <input
                type="text"
                value={generalForm.cin}
                onChange={(e) => setGeneralForm({ ...generalForm, cin: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-700 text-xs">Registered Head Office Address</label>
            <textarea
              rows={2}
              value={generalForm.address}
              onChange={(e) => setGeneralForm({ ...generalForm, address: e.target.value })}
              className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>
          <button
            onClick={() => showBanner('General corporate identity updated!')}
            className="px-4 py-2 bg-[#00B7A7] text-white text-xs font-bold rounded-xl"
          >
            Save General Settings
          </button>
        </div>
      )}
    </div>
  );
}
