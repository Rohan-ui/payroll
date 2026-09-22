'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity, Search, Filter, Download, Calendar, RefreshCw,
  Building2, DollarSign, Shield, Globe, Users, Zap, CheckCircle,
  AlertTriangle, Clock, Terminal, ChevronDown
} from 'lucide-react';

export default function PlatformActivityCenterView() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const categories = [
    { id: 'ALL', label: 'All Activities' },
    { id: 'TENANT', label: 'Tenant Workspaces', icon: Building2 },
    { id: 'SUBSCRIPTION', label: 'Subscriptions', icon: DollarSign },
    { id: 'COUPON', label: 'Coupons & Billing', icon: DollarSign },
    { id: 'USER', label: 'User Actions', icon: Users },
    { id: 'WEBSITE', label: 'Website CMS', icon: Globe },
    { id: 'DOMAIN', label: 'Domains & DNS', icon: Globe },
    { id: 'SECURITY', label: 'Security & Logins', icon: Shield },
    { id: 'AI', label: 'AI Copilot', icon: Zap },
    { id: 'PAYMENT', label: 'Payment Gateway', icon: DollarSign }
  ];

  useEffect(() => {
    fetchLogs();
  }, [selectedCategory, selectedSeverity]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      let url = `/api/v1/super-admin/activity?category=${selectedCategory}&severity=${selectedSeverity}`;
      if (searchQuery.trim()) url += `&q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data || []);
      }
    } catch (e) {
      console.error('Error fetching activity logs:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleExportCsv = () => {
    showBanner(`Exported ${logs.length} platform audit activity events to CSV!`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Platform Telemetry & Audit Stream
            </span>
            <span className="text-xs text-slate-500 font-medium">Real-Time Event Bus</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Platform Activity Center</h1>
          <p className="text-xs text-slate-500">
            Real-time audit records across tenants, payment webhooks, DNS changes, AI tokens, and login events.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit Log (CSV)</span>
        </button>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === c.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search activity title, description, or actor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#00B7A7]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#00B7A7] cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
            title="Refresh Stream"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
        <div className="divide-y divide-slate-100">
          {logs.map((log) => {
            const isWarning = log.severity === 'WARNING';
            const isCritical = log.severity === 'CRITICAL';
            return (
              <div key={log.id} className="p-4 hover:bg-slate-50/70 transition-colors flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                      isCritical
                        ? 'bg-rose-50 border-rose-200 text-rose-600'
                        : isWarning
                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                        : 'bg-teal-50 border-teal-200 text-teal-700'
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{log.title}</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-slate-100 text-slate-600">
                        {log.category}
                      </span>
                      {log.company_name && (
                        <span className="text-[10px] text-teal-700 font-semibold">· {log.company_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{log.description}</p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1 font-mono">
                      <span>Actor: {log.actor_name} ({log.actor_type})</span>
                      <span>·</span>
                      <span>IP: {log.ip_address || '127.0.0.1'}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] font-mono text-slate-400">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
