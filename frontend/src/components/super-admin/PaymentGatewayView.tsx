'use client';

import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  ShieldCheck, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  ExternalLink,
  Zap,
  Activity
} from 'lucide-react';

export default function PaymentGatewayView() {
  const [config, setConfig] = useState({
    enabled: true,
    mode: 'test',
    key_id: '',
    key_secret: '',
    webhook_secret: '',
    currency: 'INR',
    auto_capture: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/super-admin/settings/razorpay');
      const json = await res.json();
      if (json.success && json.data) {
        setConfig(json.data);
      }
    } catch (e) {
      console.error('Failed to fetch Razorpay config:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/v1/super-admin/settings/razorpay', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: 'Razorpay configuration saved successfully!', type: 'success' });
      } else {
        setStatusMsg({ text: json.error || 'Failed to save configuration', type: 'error' });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Error saving settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/super-admin/settings/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_id: config.key_id,
          key_secret: config.key_secret
        })
      });
      const json = await res.json();
      setTestResult(json);
    } catch (err: any) {
      setTestResult({ success: false, message: `Test error: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/v1/billing/razorpay/webhook` 
    : 'https://voogyo.com/api/v1/billing/razorpay/webhook';

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#5C7BDD]" />
            Razorpay Payment Gateway Setup
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure live and test merchant credentials, automated subscription billing, and webhooks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchConfig}
            className="p-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
            title="Refresh Settings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Razorpay Config'}</span>
          </button>
        </div>
      </div>

      {/* Status Message */}
      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Credentials Form (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Gateway Operating Mode</h3>
                <p className="text-xs text-slate-500">Switch between Razorpay Sandbox and Live Production</p>
              </div>

              {/* Mode Toggle Pills */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  onClick={() => setConfig({ ...config, mode: 'test' })}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    config.mode === 'test'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Test Mode
                </button>
                <button
                  onClick={() => setConfig({ ...config, mode: 'live' })}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    config.mode === 'live'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Live Production
                </button>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Razorpay Key ID ({config.mode === 'live' ? 'rzp_live_...' : 'rzp_test_...'})
                </label>
                <input
                  type="text"
                  value={config.key_id}
                  placeholder={config.mode === 'live' ? 'rzp_live_XXXXXXXX' : 'rzp_test_XXXXXXXX'}
                  onChange={e => setConfig({ ...config, key_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-[#5C7BDD]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-600 font-semibold">Razorpay Key Secret</label>
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="text-[11px] text-[#5C7BDD] hover:underline flex items-center gap-1"
                  >
                    {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showSecret ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={config.key_secret}
                  placeholder="Enter or replace Key Secret"
                  onChange={e => setConfig({ ...config, key_secret: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-[#5C7BDD]"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Webhook Secret (For HMAC-SHA256 signature verification)
                </label>
                <input
                  type="text"
                  value={config.webhook_secret}
                  placeholder="whsec_..."
                  onChange={e => setConfig({ ...config, webhook_secret: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-[#5C7BDD]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Settlement Currency</label>
                  <select
                    value={config.currency}
                    onChange={e => setConfig({ ...config, currency: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-[#5C7BDD]"
                  >
                    <option value="INR">INR (₹ - Indian Rupee)</option>
                    <option value="USD">USD ($ - US Dollar)</option>
                    <option value="EUR">EUR (€ - Euro)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="font-semibold text-slate-800 block">Instant Auto-Capture</span>
                    <span className="text-[10px] text-slate-400">Capture payment upon authorization</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.auto_capture}
                    onChange={e => setConfig({ ...config, auto_capture: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Test Connection Action */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
              >
                <Activity className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
                <span>{testing ? 'Testing Connection...' : 'Test API Credentials'}</span>
              </button>

              {testResult && (
                <div className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  testResult.success 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Webhook & Setup Guide (1 col) */}
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">Webhook Integration URL</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Add this endpoint in your Razorpay Merchant Dashboard under <span className="font-semibold text-slate-700">Settings → Webhooks</span>:
            </p>

            <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] break-all flex items-center justify-between gap-2">
              <span>{webhookUrl}</span>
              <button
                onClick={copyWebhook}
                className="p-1 text-slate-400 hover:text-white transition shrink-0"
                title="Copy Webhook URL"
              >
                {copiedWebhook ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-bold text-slate-700 block">Required Webhook Events:</span>
              <ul className="text-xs text-slate-600 space-y-1">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="font-mono text-[11px]">payment.captured</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="font-mono text-[11px]">payment.failed</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="font-mono text-[11px]">order.paid</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-100 space-y-2">
            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Razorpay Sandbox Credentials</span>
            </h4>
            <p className="text-[11px] text-blue-800/80 leading-relaxed">
              When in Test Mode, you can use any mock Razorpay test UPI handles or mock credit cards without incurring live debit. All transactions are logged in the Transactions feed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
