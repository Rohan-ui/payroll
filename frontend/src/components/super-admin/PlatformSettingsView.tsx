'use client';

import React, { useState } from 'react';
import { 
  Sliders, 
  CreditCard, 
  Globe, 
  Search, 
  Layout, 
  Building2,
  ShieldCheck
} from 'lucide-react';
import PaymentGatewayView from './PaymentGatewayView';
import WebsiteCmsSeoView from './WebsiteCmsSeoView';

interface PlatformSettingsViewProps {
  initialTab?: 'gateway' | 'website' | 'branding' | 'seo' | 'cms';
}

export default function PlatformSettingsView({ initialTab = 'gateway' }: PlatformSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'gateway' | 'website'>(
    initialTab === 'gateway' ? 'gateway' : 'website'
  );

  return (
    <div className="space-y-6">
      {/* Settings Navigation Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl">
          <button
            onClick={() => setActiveTab('gateway')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'gateway'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-[#5C7BDD]" />
            <span>Payment Gateway (Razorpay)</span>
          </button>

          <button
            onClick={() => setActiveTab('website')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'website'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-4 h-4 text-[#00B7A7]" />
            <span>Website CMS, Logo & SEO</span>
          </button>
        </div>

        <div className="px-3 text-xs text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-slate-700">Platform Settings HQ</span>
        </div>
      </div>

      {/* Render Active Settings Module */}
      {activeTab === 'gateway' && (
        <PaymentGatewayView />
      )}

      {activeTab === 'website' && (
        <WebsiteCmsSeoView />
      )}
    </div>
  );
}
