'use client';

import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Upload, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  RefreshCw, 
  Image as ImageIcon,
  Shield, 
  Layout, 
  FileCode,
  Link2,
  Sliders,
  Eye
} from 'lucide-react';
import VoogyoLogo, { VoogyoMark } from '@/components/VoogyoLogo';

export default function WebsiteCmsSeoView() {
  const [activeTab, setActiveTab] = useState<'branding' | 'seo' | 'cms'>('branding');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form states
  const [branding, setBranding] = useState<any>({
    company_name: 'Voogyo Technologies',
    tagline: 'Simplify • Automate • Grow',
    logo_url: '/voogyo-logo.png',
    wordmark_url: '/voogyo-wordmark.png',
    mark_url: '/voogyo-mark.png',
    favicon_url: '/favicon.ico',
    support_email: 'support@voogyo.com',
    support_phone: '+91 98765 43210',
    gstin: '24AAACV1234F1Z8',
    address: 'Voogyo Tower, Cyber Park, SG Highway, Ahmedabad, Gujarat 380054, India'
  });

  const [seo, setSeo] = useState<any>({
    meta_title: 'Voogyo — Simplify • Automate • Grow | All-in-One Autonomous Business OS',
    meta_description: 'Replace 7 disjointed SaaS tools with one unified business operating platform: CRM Sales Pipelines, Agile Sprints, Biometric HRMS, Form 16 Payroll, and GST Invoicing powered by Gemini AI co-pilots.',
    keywords: 'Enterprise ERP, Autonomous SaaS, AI CRM, Agile Sprint Project Management, Biometric HRMS India, Form 16 Payroll, GST Invoicing, Zoho alternative, HubSpot alternative',
    canonical_url: 'https://voogyo.com',
    og_image: '/voogyo-logo.png',
    google_analytics_id: 'G-VOOGYO2026',
    google_search_console_id: 'google-site-verification=voogyo-saas-master-2026',
    robots_index: 'index, follow'
  });

  const [cms, setCms] = useState<any>({
    announcement_active: '1',
    announcement_text: '🚀 Voogyo OS 2.0 Released: Autonomous AI Digital Employees & Unified GST Invoicing!',
    announcement_link: '/signup',
    hero_badge: 'Next-Gen Autonomous Enterprise Operating System',
    hero_heading_1: 'Replace 7 Disjointed SaaS Tools.',
    hero_heading_2: 'Run Your Entire Business on Voogyo.',
    hero_subheading: 'Unify B2B Sales CRM, Agile Projects, Biometric HRMS, Automated Payroll, and GST Compliance into one seamless multi-tenant cloud workspace.',
    cta_primary_text: 'Start 7-Day Free Trial',
    cta_primary_link: '/signup',
    cta_secondary_text: 'Explore Live Demo',
    cta_secondary_link: '/login'
  });

  // Upload progress per asset
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/super-admin/settings/website');
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.branding) setBranding((prev: any) => ({ ...prev, ...json.data.branding }));
        if (json.data.seo) setSeo((prev: any) => ({ ...prev, ...json.data.seo }));
        if (json.data.cms) setCms((prev: any) => ({ ...prev, ...json.data.cms }));
      }
    } catch (e) {
      console.error('Failed to load website settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveAll = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/v1/super-admin/settings/website', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding, seo, cms })
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: 'Website branding, SEO metadata, and CMS configuration saved successfully!', type: 'success' });
      } else {
        setStatusMsg({ text: json.error || 'Failed to save settings', type: 'error' });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Error saving settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, uploadType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAsset(uploadType);
    setStatusMsg(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', uploadType);

    try {
      const res = await fetch('/api/v1/super-admin/upload', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: json.message || `${uploadType.toUpperCase()} replaced successfully!`, type: 'success' });
        // Refresh local URL to bust cache
        if (uploadType === 'logo') {
          setBranding((prev: any) => ({ ...prev, logo_url: json.data.url }));
        } else if (uploadType === 'wordmark') {
          setBranding((prev: any) => ({ ...prev, wordmark_url: json.data.url }));
        } else if (uploadType === 'mark') {
          setBranding((prev: any) => ({ ...prev, mark_url: json.data.url }));
        } else if (uploadType === 'favicon_ico' || uploadType === 'favicon') {
          setBranding((prev: any) => ({ ...prev, favicon_url: json.data.url }));
        }
      } else {
        setStatusMsg({ text: json.error || 'File upload failed', type: 'error' });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'File upload error', type: 'error' });
    } finally {
      setUploadingAsset(null);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#5C7BDD]" />
            Website Backend, Logo & SEO Manager
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage public branding assets, SEO meta tags, Google tags, and homepage CMS copy
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSettings}
            className="p-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
            title="Refresh Settings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Toast Alert */}
      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-2">
        <button
          onClick={() => setActiveTab('branding')}
          className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
            activeTab === 'branding'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Brand Assets & Logo Upload</span>
        </button>

        <button
          onClick={() => setActiveTab('seo')}
          className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
            activeTab === 'seo'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>SEO & Metadata</span>
        </button>

        <button
          onClick={() => setActiveTab('cms')}
          className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
            activeTab === 'cms'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layout className="w-4 h-4" />
          <span>Homepage CMS & Copy</span>
        </button>
      </div>

      {/* ================= TAB 1: BRANDING & ASSET UPLOAD ================= */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Asset Card 1: Full Logo */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Official Full Logo Lockup</h3>
                  <p className="text-xs text-slate-500">Includes wordmark, dual chevrons, and tagline</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  /voogyo-logo.png
                </span>
              </div>

              <div className="h-32 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center p-4">
                <img
                  src={branding.logo_url || '/voogyo-logo.png'}
                  alt="Full Logo Preview"
                  className="max-h-20 max-w-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">Recommended: PNG with transparent background (2.5 : 1 ratio)</span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#5C7BDD] text-xs font-bold rounded-xl transition shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingAsset === 'logo' ? 'Uploading...' : 'Replace Full Logo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={e => handleFileUpload(e, 'logo')}
                    disabled={uploadingAsset === 'logo'}
                  />
                </label>
              </div>
            </div>

            {/* Asset Card 2: Horizontal Wordmark */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Horizontal Wordmark</h3>
                  <p className="text-xs text-slate-500">Compact lockup without tagline for topbars and headers</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  /voogyo-wordmark.png
                </span>
              </div>

              <div className="h-32 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center p-4">
                <img
                  src={branding.wordmark_url || '/voogyo-wordmark.png'}
                  alt="Wordmark Preview"
                  className="max-h-16 max-w-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">Used in compact sidebars and headers</span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#5C7BDD] text-xs font-bold rounded-xl transition shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingAsset === 'wordmark' ? 'Uploading...' : 'Replace Wordmark'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={e => handleFileUpload(e, 'wordmark')}
                    disabled={uploadingAsset === 'wordmark'}
                  />
                </label>
              </div>
            </div>

            {/* Asset Card 3: Brand Chevrons Mark */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Dual Chevrons Mark</h3>
                  <p className="text-xs text-slate-500">Square brand icon (Teal & Blue chevrons)</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  /voogyo-mark.png
                </span>
              </div>

              <div className="h-32 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center p-4">
                <img
                  src={branding.mark_url || '/voogyo-mark.png'}
                  alt="Mark Preview"
                  className="h-16 w-16 object-contain"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">512×512 square canvas for avatars and app icons</span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#5C7BDD] text-xs font-bold rounded-xl transition shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingAsset === 'mark' ? 'Uploading...' : 'Replace Mark'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={e => handleFileUpload(e, 'mark')}
                    disabled={uploadingAsset === 'mark'}
                  />
                </label>
              </div>
            </div>

            {/* Asset Card 4: Favicon */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Browser Favicon (.ico / .png)</h3>
                  <p className="text-xs text-slate-500">Browser tabs, bookmarks, and mobile home screen</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  /favicon.ico
                </span>
              </div>

              <div className="h-32 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center p-4 gap-6">
                <div className="flex flex-col items-center gap-1">
                  <img src={branding.favicon_url || '/favicon.ico'} alt="Favicon 32" className="w-8 h-8 object-contain" />
                  <span className="text-[10px] text-slate-400">32×32</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <img src={branding.favicon_url || '/favicon.ico'} alt="Favicon 16" className="w-4 h-4 object-contain" />
                  <span className="text-[10px] text-slate-400">16×16 tab</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">Updates both /public and /src/app automatically</span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#5C7BDD] text-xs font-bold rounded-xl transition shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingAsset === 'favicon_ico' ? 'Uploading...' : 'Replace Favicon'}</span>
                  <input
                    type="file"
                    accept="image/x-icon,image/png,image/ico"
                    className="hidden"
                    onChange={e => handleFileUpload(e, 'favicon_ico')}
                    disabled={uploadingAsset === 'favicon_ico'}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Corporate Details */}
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Legal Corporate & Invoice Letterhead Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Company Legal Name</label>
                <input
                  type="text"
                  value={branding.company_name}
                  onChange={e => setBranding({ ...branding, company_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Brand Tagline</label>
                <input
                  type="text"
                  value={branding.tagline}
                  onChange={e => setBranding({ ...branding, tagline: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">GSTIN Number</label>
                <input
                  type="text"
                  value={branding.gstin}
                  onChange={e => setBranding({ ...branding, gstin: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Support Email</label>
                <input
                  type="email"
                  value={branding.support_email}
                  onChange={e => setBranding({ ...branding, support_email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-500 font-semibold mb-1">Registered Corporate Address</label>
                <input
                  type="text"
                  value={branding.address}
                  onChange={e => setBranding({ ...branding, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: SEO & METADATA ================= */}
      {activeTab === 'seo' && (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-600" />
              <span>Search Engine Optimization (SEO) & Social Meta</span>
            </h3>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Meta Title Tag (50-60 chars recommended)</label>
                <input
                  type="text"
                  value={seo.meta_title}
                  onChange={e => setSeo({ ...seo, meta_title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-medium"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Character count: {seo.meta_title?.length || 0}</span>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Meta Description (140-160 chars recommended)</label>
                <textarea
                  rows={3}
                  value={seo.meta_description}
                  onChange={e => setSeo({ ...seo, meta_description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 leading-relaxed"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Character count: {seo.meta_description?.length || 0}</span>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Target Focus Keywords (Comma-separated)</label>
                <input
                  type="text"
                  value={seo.keywords}
                  onChange={e => setSeo({ ...seo, keywords: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Canonical URL</label>
                  <input
                    type="url"
                    value={seo.canonical_url}
                    onChange={e => setSeo({ ...seo, canonical_url: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">OpenGraph Social Share Image URL</label>
                  <input
                    type="text"
                    value={seo.og_image}
                    onChange={e => setSeo({ ...seo, og_image: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Google Analytics 4 Measurement ID</label>
                  <input
                    type="text"
                    value={seo.google_analytics_id}
                    placeholder="G-XXXXXXXXXX"
                    onChange={e => setSeo({ ...seo, google_analytics_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Google Search Console Verification Tag</label>
                  <input
                    type="text"
                    value={seo.google_search_console_id}
                    placeholder="google-site-verification=..."
                    onChange={e => setSeo({ ...seo, google_search_console_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: HOMEPAGE CMS COPY ================= */}
      {activeTab === 'cms' && (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layout className="w-4 h-4 text-blue-600" />
              <span>Landing Page Hero & Announcements</span>
            </h3>

            <div className="space-y-4 text-xs">
              {/* Announcement Bar */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Top Announcement Banner</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cms.announcement_active === '1'}
                      onChange={e => setCms({ ...cms, announcement_active: e.target.checked ? '1' : '0' })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Banner Announcement Text</label>
                  <input
                    type="text"
                    value={cms.announcement_text}
                    onChange={e => setCms({ ...cms, announcement_text: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Hero Pill Badge</label>
                <input
                  type="text"
                  value={cms.hero_badge}
                  onChange={e => setCms({ ...cms, hero_badge: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Hero Heading (Line 1)</label>
                  <input
                    type="text"
                    value={cms.hero_heading_1}
                    onChange={e => setCms({ ...cms, hero_heading_1: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Hero Heading (Line 2)</label>
                  <input
                    type="text"
                    value={cms.hero_heading_2}
                    onChange={e => setCms({ ...cms, hero_heading_2: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Hero Subheading</label>
                <textarea
                  rows={2}
                  value={cms.hero_subheading}
                  onChange={e => setCms({ ...cms, hero_subheading: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Primary CTA Button Label</label>
                  <input
                    type="text"
                    value={cms.cta_primary_text}
                    onChange={e => setCms({ ...cms, cta_primary_text: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Primary CTA Target Link</label>
                  <input
                    type="text"
                    value={cms.cta_primary_link}
                    onChange={e => setCms({ ...cms, cta_primary_link: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5C7BDD] text-slate-800 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
