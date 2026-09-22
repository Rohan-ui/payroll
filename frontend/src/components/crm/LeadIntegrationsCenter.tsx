'use client';

import React, { useState } from 'react';
import { 
  Video, Globe, MessageSquare, CheckCircle2, Copy, Check,
  AlertCircle, RefreshCw, ExternalLink, ShieldCheck, Zap,
  Save, Play, Smartphone, Store, ShoppingBag
} from 'lucide-react';

export default function LeadIntegrationsCenter() {
  const [activeTab, setActiveTab] = useState<'google_meet' | 'indiamart' | 'tradeindia' | 'gmb' | 'justdial' | 'inbound_api'>('google_meet');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Google Meet Config
  const [meetConfig, setMeetConfig] = useState({
    enabled: true,
    defaultRoomType: 'instant', // 'instant' | 'custom_room'
    customRoomUrl: 'https://meet.google.com/rnd-voogyo-sync',
    defaultDuration: 30,
    sendReminderEmail: true,
    inviteTemplate: 'Hi {{ClientName}},\n\nHere are the details for our scheduled video call:\nDate & Time: {{MeetingTime}}\nGoogle Meet Link: {{MeetLink}}\n\nLooking forward to speaking with you!'
  });

  // IndiaMART Config
  const [indiaMartConfig, setIndiaMartConfig] = useState({
    enabled: false,
    apiKey: '',
    mobileNumber: '',
    autoSyncMinutes: 15,
    lastSyncTime: 'Never synced'
  });

  // TradeIndia Config
  const [tradeIndiaConfig, setTradeIndiaConfig] = useState({
    enabled: false,
    userId: '',
    profileId: '',
    apiKey: '',
    lastSyncTime: 'Never synced'
  });

  // GMB Config
  const [gmbConfig, setGmbConfig] = useState({
    enabled: false,
    accountId: '',
    locationId: '',
    autoAssignUserId: ''
  });

  // Justdial Config
  const [justdialConfig, setJustdialConfig] = useState({
    enabled: false,
    vendorMobile: '',
    apiKey: ''
  });

  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      showToast('Integration settings updated successfully!');
    }, 600);
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://erp.voogyo.com';
  const genericWebhookUrl = `${baseUrl}/api/v1/crm/leads/webhook?tenant_id=demo_tenant`;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                API & Lead Channel Hub
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync Ready
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1.5 flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              Lead Channels, Marketplaces & Google Meet Settings
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Connect external lead sources (IndiaMART, TradeIndia, Google My Business, Justdial) and configure direct Google Meet creation for instant client appointments.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>

        {/* Channel Navigation Pills */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1 pt-2 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('google_meet')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'google_meet'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Google Meet (Free Direct)</span>
          </button>

          <button
            onClick={() => setActiveTab('indiamart')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'indiamart'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
            <span>IndiaMART API</span>
          </button>

          <button
            onClick={() => setActiveTab('tradeindia')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'tradeindia'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Globe className="w-4 h-4 text-blue-600" />
            <span>TradeIndia API</span>
          </button>

          <button
            onClick={() => setActiveTab('gmb')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'gmb'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Store className="w-4 h-4 text-amber-600" />
            <span>Google My Business</span>
          </button>

          <button
            onClick={() => setActiveTab('justdial')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'justdial'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4 text-orange-600" />
            <span>Justdial API</span>
          </button>

          <button
            onClick={() => setActiveTab('inbound_api')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'inbound_api'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-purple-600" />
            <span>Inbound Webhook / Forms</span>
          </button>
        </div>
      </div>

      {/* TAB 1: GOOGLE MEET CONFIGURATION */}
      {activeTab === 'google_meet' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Google Meet (Free Direct Integration)</h3>
                <p className="text-xs text-slate-500">Generate Google Meet conference links directly when booking discovery calls or client demos.</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active & Ready
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Meeting Link Generation Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="meetMode"
                      value="instant"
                      checked={meetConfig.defaultRoomType === 'instant'}
                      onChange={() => setMeetConfig({ ...meetConfig, defaultRoomType: 'instant' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">1-Click Instant Room (https://meet.google.com/new)</div>
                      <div className="text-[11px] text-slate-500">Automatically launches a fresh Google Meet session with zero Google Cloud API credentials required.</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="meetMode"
                      value="custom_room"
                      checked={meetConfig.defaultRoomType === 'custom_room'}
                      onChange={() => setMeetConfig({ ...meetConfig, defaultRoomType: 'custom_room' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Dedicated Company Room / Custom URL</div>
                      <div className="text-[11px] text-slate-500">Use a permanent company Google Workspace meeting code.</div>
                    </div>
                  </label>
                </div>
              </div>

              {meetConfig.defaultRoomType === 'custom_room' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Permanent Google Meet Room URL
                  </label>
                  <input
                    type="url"
                    value={meetConfig.customRoomUrl}
                    onChange={(e) => setMeetConfig({ ...meetConfig, customRoomUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://meet.google.com/abc-defg-hij"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Default Meeting Duration (Minutes)
                </label>
                <select
                  value={meetConfig.defaultDuration}
                  onChange={(e) => setMeetConfig({ ...meetConfig, defaultDuration: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={15}>15 Minutes (Quick Intro / Alignment)</option>
                  <option value={30}>30 Minutes (Standard Discovery Call)</option>
                  <option value={45}>45 Minutes (Solution Presentation)</option>
                  <option value={60}>60 Minutes (Proposal & Technical Walkthrough)</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Client WhatsApp / Email Invite Template
                </label>
                <textarea
                  rows={5}
                  value={meetConfig.inviteTemplate}
                  onChange={(e) => setMeetConfig({ ...meetConfig, inviteTemplate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Available Merge Tags: {"{{ClientName}}, {{MeetingTime}}, {{MeetLink}}"}</p>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 text-xs space-y-2">
                <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Direct CRM Scheduling
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  When scheduling any appointment in <strong>Follow-ups & Meetings</strong>, choosing "Google Meet" will automatically generate and attach the meeting link to the lead's profile, making it 1-click shareable via WhatsApp or Email.
                </p>
                <a
                  href="https://meet.google.com/new"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 pt-1"
                >
                  <span>Test Google Meet Room Now</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INDIAMART INTEGRATION */}
      {activeTab === 'indiamart' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">IndiaMART CRM API Integration</h3>
                <p className="text-xs text-slate-500">Automatically pull or receive RFQs and buyer inquiries from IndiaMART directly into your CRM leads pipeline.</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {indiaMartConfig.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-900">Enable IndiaMART Sync</div>
                  <div className="text-[11px] text-slate-500">Poll IndiaMART API for new buyer inquiries.</div>
                </div>
                <input
                  type="checkbox"
                  checked={indiaMartConfig.enabled}
                  onChange={(e) => setIndiaMartConfig({ ...indiaMartConfig, enabled: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  IndiaMART CRM Key / API Key
                </label>
                <input
                  type="password"
                  value={indiaMartConfig.apiKey}
                  onChange={(e) => setIndiaMartConfig({ ...indiaMartConfig, apiKey: e.target.value })}
                  placeholder="mR_XXXXXXXXXX..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Found in your IndiaMART Seller Panel under CRM Integration.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Registered Mobile Number
                </label>
                <input
                  type="text"
                  value={indiaMartConfig.mobileNumber}
                  onChange={(e) => setIndiaMartConfig({ ...indiaMartConfig, mobileNumber: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  IndiaMART Webhook URL (Instant Push)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${baseUrl}/api/v1/crm/webhooks/indiamart`}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(`${baseUrl}/api/v1/crm/webhooks/indiamart`, 'indiamart_url')}
                    className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                    title="Copy Webhook URL"
                  >
                    {copiedKey === 'indiamart_url' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Provide this URL to your IndiaMART account manager for real-time lead webhooks.</p>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
                <div className="text-xs font-bold text-emerald-900">Lead Classification Rule</div>
                <p className="text-[11px] text-slate-600">
                  Every lead imported from IndiaMART will automatically be tagged with:
                  <br />• <strong>Source:</strong> IndiaMART
                  <br />• <strong>Channel:</strong> Marketplace
                  <br />• <strong>Initial Pipeline Stage:</strong> Inbound Qualification / Discovery
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TRADEINDIA INTEGRATION */}
      {activeTab === 'tradeindia' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">TradeIndia Inquiries Integration</h3>
                <p className="text-xs text-slate-500">Capture direct B2B inquiries and buy-leads from the TradeIndia marketplace automatically.</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {tradeIndiaConfig.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  TradeIndia User ID
                </label>
                <input
                  type="text"
                  value={tradeIndiaConfig.userId}
                  onChange={(e) => setTradeIndiaConfig({ ...tradeIndiaConfig, userId: e.target.value })}
                  placeholder="e.g. 1029384"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  TradeIndia Profile ID
                </label>
                <input
                  type="text"
                  value={tradeIndiaConfig.profileId}
                  onChange={(e) => setTradeIndiaConfig({ ...tradeIndiaConfig, profileId: e.target.value })}
                  placeholder="e.g. 5948302"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  TradeIndia API Key
                </label>
                <input
                  type="password"
                  value={tradeIndiaConfig.apiKey}
                  onChange={(e) => setTradeIndiaConfig({ ...tradeIndiaConfig, apiKey: e.target.value })}
                  placeholder="ti_XXXXXXXXXX..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  TradeIndia Push Webhook URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${baseUrl}/api/v1/crm/webhooks/tradeindia`}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(`${baseUrl}/api/v1/crm/webhooks/tradeindia`, 'tradeindia_url')}
                    className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                  >
                    {copiedKey === 'tradeindia_url' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GOOGLE MY BUSINESS */}
      {activeTab === 'gmb' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Google My Business (GMB) Integration</h3>
                <p className="text-xs text-slate-500">Capture direct calls, quote requests, and chat inquiries from your Google Maps profile.</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {gmbConfig.enabled ? 'Connected' : 'Setup Required'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  GMB Account / Business Location ID
                </label>
                <input
                  type="text"
                  value={gmbConfig.locationId}
                  onChange={(e) => setGmbConfig({ ...gmbConfig, locationId: e.target.value })}
                  placeholder="locations/109283746..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  GMB Inbound Webhook (Google Pub/Sub / Cloud Function)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${baseUrl}/api/v1/crm/webhooks/gmb`}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(`${baseUrl}/api/v1/crm/webhooks/gmb`, 'gmb_url')}
                    className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                  >
                    {copiedKey === 'gmb_url' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: JUSTDIAL */}
      {activeTab === 'justdial' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Justdial Lead API Integration</h3>
                <p className="text-xs text-slate-500">Automatically sync SMS and app-based buyer inquiries sent to your Justdial verified profile.</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {justdialConfig.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Justdial Registered Mobile
                </label>
                <input
                  type="text"
                  value={justdialConfig.vendorMobile}
                  onChange={(e) => setJustdialConfig({ ...justdialConfig, vendorMobile: e.target.value })}
                  placeholder="+91 98200 XXXXX"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Justdial Push Webhook Endpoint
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${baseUrl}/api/v1/crm/webhooks/justdial`}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(`${baseUrl}/api/v1/crm/webhooks/justdial`, 'justdial_url')}
                    className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                  >
                    {copiedKey === 'justdial_url' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: INBOUND API / WEBHOOK / FORM */}
      {activeTab === 'inbound_api' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Direct Inbound Lead Webhook & Form Endpoint</h3>
                <p className="text-xs text-slate-500">Connect your website contact form, WordPress, Elementor, Webflow, or Zapier to create leads automatically.</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              24/7 Active
            </span>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                HTTP POST Lead Capture URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={genericWebhookUrl}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 select-all"
                />
                <button
                  onClick={() => copyToClipboard(genericWebhookUrl, 'generic_url')}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  {copiedKey === 'generic_url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'generic_url' ? 'Copied' : 'Copy Endpoint'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Sample JSON Request Payload
              </label>
              <pre className="p-4 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto">
{`{
  "companyName": "Apex Technologies Pvt Ltd",
  "firstName": "Suresh",
  "lastName": "Patel",
  "email": "suresh@apextech.in",
  "phone": "+919876543210",
  "source": "IndiaMART", // or "TradeIndia", "Google My Business", "Justdial", "Website Form"
  "industry": "Manufacturing",
  "subIndustry": "Plastic & Packaging",
  "budgetAmount": 150000,
  "requirementBrief": "Looking for complete ERP and warehouse inventory automation solution."
}`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
