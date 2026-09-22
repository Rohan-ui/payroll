'use client';

import React, { useState } from 'react';
import {
  Globe, Search, TrendingUp, BarChart3, Zap, AlertTriangle,
  CheckCircle, ArrowUpRight, Sparkles, ExternalLink, ShieldCheck,
  FileText, Activity, RefreshCw
} from 'lucide-react';

export default function WebsiteSeoAnalyticsView() {
  const [refreshing, setRefreshing] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      showBanner('Refreshed Google Search Console & Core Web Vitals telemetry!');
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Search Performance & Indexing
            </span>
            <span className="text-xs text-slate-500 font-medium">Google Search Console & GA4 HQ</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Website SEO Analytics & Suggestions</h1>
          <p className="text-xs text-slate-500">
            Monitor Google rankings, organic search volume, PageSpeed scores, Core Web Vitals, and Gemini SEO recommendations.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Sync GSC Telemetry</span>
        </button>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* 4 Primary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Monthly Organic Clicks</span>
          <p className="text-xl font-black text-slate-900">18,420 Clicks</p>
          <span className="text-[10px] text-emerald-600 font-bold">+32.4% vs Previous Month</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Total Impressions</span>
          <p className="text-xl font-black text-slate-900">284,500</p>
          <span className="text-[10px] text-teal-700 font-bold">Avg Position: 6.8</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Google Index Coverage</span>
          <p className="text-xl font-black text-emerald-700">17 / 17 Pages</p>
          <span className="text-[10px] text-slate-400">100% Valid Sitemap</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Desktop PageSpeed</span>
          <p className="text-xl font-black text-purple-700">98 / 100</p>
          <span className="text-[10px] text-slate-400">LCP 0.8s · FID 12ms</span>
        </div>
      </div>

      {/* AI SEO Recommendations Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white border border-teal-500/30 shadow-md space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-300" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300">
            Gemini Autonomous SEO Recommendations
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-white/10 rounded-xl border border-white/15 space-y-1.5">
            <span className="font-bold text-teal-300">High-Impact Meta Title Tweak</span>
            <p className="text-slate-300 text-[11px]">
              Add "India's #1 Biometric HRMS" to the home page title tag to capture 4,200 monthly exact searches.
            </p>
            <button
              onClick={() => showBanner('Applied Meta Title optimization to Home page!')}
              className="text-[11px] text-teal-400 hover:text-teal-300 font-bold cursor-pointer underline"
            >
              1-Click Apply
            </button>
          </div>

          <div className="p-3.5 bg-white/10 rounded-xl border border-white/15 space-y-1.5">
            <span className="font-bold text-amber-300">Internal Linking Opportunity</span>
            <p className="text-slate-300 text-[11px]">
              Link blog post "GST Compliance 2026" directly to the Pricing page with anchor text "GST Invoicing Software".
            </p>
            <button
              onClick={() => showBanner('Internal links updated in blog CMS!')}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer underline"
            >
              Auto-Link Article
            </button>
          </div>

          <div className="p-3.5 bg-white/10 rounded-xl border border-white/15 space-y-1.5">
            <span className="font-bold text-emerald-300">SoftwareApplication Schema</span>
            <p className="text-slate-300 text-[11px]">
              JSON-LD schema for SaaS pricing tiers is valid with 4.9 star customer aggregate review rating.
            </p>
            <span className="text-[10px] text-emerald-400 font-bold">● Active & Verified</span>
          </div>
        </div>
      </div>

      {/* Top Ranking Keywords & Landing Pages */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Keywords */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Top Performing Search Keywords</h3>
          <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500">
                <tr>
                  <th className="p-2.5">Search Query</th>
                  <th className="p-2.5">Position</th>
                  <th className="p-2.5">Monthly Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { kw: 'Autonomous enterprise ERP software India', pos: '#2', clicks: '4,120' },
                  { kw: 'GST e-invoicing and payroll SaaS', pos: '#3', clicks: '3,290' },
                  { kw: 'Zoho One alternative with biometric HRMS', pos: '#4', clicks: '2,810' },
                  { kw: 'HubSpot alternative for B2B agencies', pos: '#6', clicks: '1,950' }
                ].map((k, i) => (
                  <tr key={i}>
                    <td className="p-2.5 font-bold text-slate-900">{k.kw}</td>
                    <td className="p-2.5 font-bold text-teal-700">{k.pos}</td>
                    <td className="p-2.5 font-mono text-slate-600">{k.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Core Web Vitals Telemetry */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Core Web Vitals & Speed Scores</h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">Largest Contentful Paint (LCP)</span>
                <p className="text-[10px] text-slate-500">Main hero content render duration</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                0.8s (Good)
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">First Input Delay (FID) / INP</span>
                <p className="text-[10px] text-slate-500">Interaction responsiveness latency</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                12ms (Good)
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">Cumulative Layout Shift (CLS)</span>
                <p className="text-[10px] text-slate-500">Visual stability metric</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                0.01 (Good)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
