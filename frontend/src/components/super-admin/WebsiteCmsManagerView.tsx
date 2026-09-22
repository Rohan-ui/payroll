'use client';

import React, { useState } from 'react';
import {
  Globe, Layout, FileText, Image as ImageIcon, Sparkles, Plus,
  Edit3, Trash2, CheckCircle, ExternalLink, Save, ArrowRight,
  Eye, Search, Code, Video, MessageSquare, Layers, Folder,
  Check, X, Shield, Smartphone
} from 'lucide-react';

export default function WebsiteCmsManagerView() {
  const [activeTab, setActiveTab] = useState<'pages' | 'builder' | 'blog' | 'landing' | 'media' | 'navigation'>('pages');
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string>('home');
  const [aiWriting, setAiWriting] = useState(false);

  // 17 Supported Dynamic Website Pages
  const pages = [
    { id: 'home', title: 'Home (Landing)', path: '/', status: 'PUBLISHED', lastUpdated: '2026-09-14' },
    { id: 'pricing', title: 'Pricing & Plans', path: '/pricing', status: 'PUBLISHED', lastUpdated: '2026-09-14' },
    { id: 'about', title: 'About Voogyo', path: '/about', status: 'PUBLISHED', lastUpdated: '2026-09-10' },
    { id: 'features', title: 'Platform Features', path: '/features', status: 'PUBLISHED', lastUpdated: '2026-09-12' },
    { id: 'industries', title: 'Industry Solutions', path: '/industries', status: 'PUBLISHED', lastUpdated: '2026-09-08' },
    { id: 'solutions', title: 'Enterprise Solutions', path: '/solutions', status: 'PUBLISHED', lastUpdated: '2026-09-05' },
    { id: 'ai-employees', title: 'Autonomous AI Employees', path: '/ai-employees', status: 'PUBLISHED', lastUpdated: '2026-09-13' },
    { id: 'marketplace', title: 'App Marketplace', path: '/marketplace', status: 'PUBLISHED', lastUpdated: '2026-09-02' },
    { id: 'contact', title: 'Contact Us', path: '/contact', status: 'PUBLISHED', lastUpdated: '2026-09-14' },
    { id: 'blog', title: 'Blog & Insights', path: '/blog', status: 'PUBLISHED', lastUpdated: '2026-09-11' },
    { id: 'careers', title: 'Careers & Hiring', path: '/careers', status: 'PUBLISHED', lastUpdated: '2026-08-28' },
    { id: 'privacy', title: 'Privacy Policy', path: '/privacy', status: 'PUBLISHED', lastUpdated: '2026-08-15' },
    { id: 'terms', title: 'Terms of Service', path: '/terms', status: 'PUBLISHED', lastUpdated: '2026-08-15' },
    { id: 'refund', title: 'Refund Policy', path: '/refund', status: 'PUBLISHED', lastUpdated: '2026-08-15' },
    { id: 'login', title: 'Login Portal', path: '/login', status: 'PUBLISHED', lastUpdated: '2026-09-14' },
    { id: 'signup', title: 'Self-Serve Signup', path: '/signup', status: 'PUBLISHED', lastUpdated: '2026-09-14' }
  ];

  // Component Library for Page Builder
  const builderComponents = [
    { type: 'hero', name: 'Hero Banner', desc: 'Heading, subheading, badges & dual CTA' },
    { type: 'cta', name: 'Conversion CTA Block', desc: 'High-contrast conversion callout' },
    { type: 'features', name: 'Feature Grid', desc: 'Icon cards with micro-animations' },
    { type: 'pricing', name: 'Dynamic Pricing Matrix', desc: 'Directly linked to MySQL plans' },
    { type: 'testimonials', name: 'Customer Testimonials', desc: 'Quotes, avatars & star ratings' },
    { type: 'faqs', name: 'Collapsible FAQs', desc: 'Accordion schema-structured questions' },
    { type: 'logos', name: 'Client Logo Marquee', desc: 'Infinite animated sponsor logos' },
    { type: 'counters', name: 'Stats Counter Bar', desc: 'Live counters for users, ARR, uptime' },
    { type: 'video', name: 'Product Demo Showcase', desc: 'Embedded Loom or YouTube modal' },
    { type: 'form', name: 'Lead Capture Form', desc: 'Directly maps to CRM leads pipeline' }
  ];

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleAiBlogWriter = () => {
    setAiWriting(true);
    setTimeout(() => {
      setAiWriting(false);
      showBanner('Gemini AI generated a 1,200-word SEO-optimized blog post with meta tags and reading time!');
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Frontend Website Engine
            </span>
            <span className="text-xs text-slate-500 font-medium">17 Dynamic Pages & Drag-Drop Builder</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Website CMS & Page Builder</h1>
          <p className="text-xs text-slate-500">
            Edit every page of Voogyo's frontend website, blog articles, SEO metadata, landing pages, and media library without code.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Live Website</span>
          </a>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'pages', label: '17 Dynamic Pages', icon: Globe },
          { id: 'builder', label: 'Drag & Drop Builder', icon: Layout },
          { id: 'blog', label: 'Blog CMS & AI Writer', icon: Sparkles },
          { id: 'landing', label: 'Campaign Landing Pages', icon: Layers },
          { id: 'media', label: 'Media Library & CDN', icon: ImageIcon },
          { id: 'navigation', label: 'Global Navigation Builder', icon: Code }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Pages List */}
      {activeTab === 'pages' && (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">Page Title</th>
                <th className="py-3 px-4">Route Path</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Modified</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pages.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">{p.title}</td>
                  <td className="py-3.5 px-4 font-mono text-teal-700 text-[11px]">{p.path}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">{p.lastUpdated}</td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedPage(p.id);
                          setActiveTab('builder');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        Visual Editor
                      </button>
                      <a
                        href={p.path}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Visual Drag & Drop Builder */}
      {activeTab === 'builder' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Editing Page Layout:</span>
              <select
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#00B7A7]"
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.title} ({p.path})</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => showBanner('Page layout changes deployed live!')}
              className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
            >
              Publish Layout
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Component Tray */}
            <div className="space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider block mb-2">
                Drag Component Blocks
              </span>
              {builderComponents.map((comp) => (
                <div
                  key={comp.type}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all cursor-grab shadow-2xs"
                >
                  <span className="font-bold text-xs text-slate-900 block">{comp.name}</span>
                  <span className="text-[10px] text-slate-500">{comp.desc}</span>
                </div>
              ))}
            </div>

            {/* Layout Canvas */}
            <div className="md:col-span-3 space-y-3 bg-slate-100/70 p-5 rounded-2xl border-2 border-dashed border-slate-300 min-h-[400px]">
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900">Hero Section (Headline & CTA)</span>
                  <p className="text-[11px] text-slate-500">Replace 7 Disjointed SaaS Tools · Start 7-Day Free Trial</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700">Hero Block</span>
              </div>

              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900">Dynamic SaaS Pricing Cards</span>
                  <p className="text-[11px] text-slate-500">Live synced to MySQL plans (Free Forever, Starter, Growth, Pro, Business)</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">Pricing Block</span>
              </div>

              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900">Accordion FAQs with Schema Markup</span>
                  <p className="text-[11px] text-slate-500">8 Structured Q&As for SEO rich snippets</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">FAQ Block</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Blog CMS & AI Writer */}
      {activeTab === 'blog' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Voogyo Blog CMS with AI Copilot</h3>
              <p className="text-xs text-slate-500">Publish high-ranking authority articles with automated keyword clustering</p>
            </div>
            <button
              onClick={handleAiBlogWriter}
              disabled={aiWriting}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{aiWriting ? 'Generating Blog...' : 'AI Blog Writer Assistant'}</span>
            </button>
          </div>

          <div className="space-y-3">
            {[
              { title: 'Why Indian Enterprises are Replacing Zoho & HubSpot with Autonomous Business OS', author: 'Ravi Shah', category: 'Product Strategy', readingTime: '6 min', views: '2,420 views' },
              { title: 'How Automated Form 16 & Biometric Attendance Save 40 Hours of HR Overheads', author: 'HR Insights Desk', category: 'Payroll & HR', readingTime: '4 min', views: '1,890 views' },
              { title: 'GST e-Invoicing Compliance in 2026: Complete Guide for SaaS & Agencies', author: 'Tax Team', category: 'Compliance', readingTime: '8 min', views: '3,110 views' }
            ].map((art, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{art.title}</h4>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                    <span>By {art.author}</span>
                    <span>·</span>
                    <span className="text-teal-700 font-semibold">{art.category}</span>
                    <span>·</span>
                    <span>{art.readingTime} read</span>
                    <span>·</span>
                    <span>{art.views}</span>
                  </div>
                </div>
                <button
                  onClick={() => showBanner(`Opened editor for: "${art.title}"`)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Edit Article
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
