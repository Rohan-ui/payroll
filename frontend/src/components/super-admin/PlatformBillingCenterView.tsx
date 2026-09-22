'use client';

import React, { useState } from 'react';
import {
  DollarSign, TrendingUp, Calendar, AlertTriangle, ShieldCheck,
  CreditCard, Receipt, ArrowLeftRight, RefreshCw, CheckCircle,
  FileText, ArrowUpRight, Plus, Download, Sliders
} from 'lucide-react';
import TenantInvoicesView from '@/components/super-admin/TenantInvoicesView';
import TenantTransactionsView from '@/components/super-admin/TenantTransactionsView';
import PaymentGatewayView from '@/components/super-admin/PaymentGatewayView';

export default function PlatformBillingCenterView() {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'invoices' | 'transactions' | 'gateway' | 'refunds'>('overview');
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Commercial Revenue & Invoicing HQ
            </span>
            <span className="text-xs text-slate-500 font-medium">Global Subscription Billing Console</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Platform Billing Center</h1>
          <p className="text-xs text-slate-500">
            Control global SaaS MRR, ARR, 5-Year GST Invoices, Razorpay/Stripe transactions, refunds, and customer credits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => showBanner('Dispatched automated payment retry webhooks!')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Gateway Ledger</span>
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Revenue KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Monthly Recurring (MRR)</span>
          <p className="text-xl font-black text-teal-700">₹42,997 / mo</p>
          <span className="text-[10px] text-emerald-600 font-bold">+18.4% this month</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Annual Run Rate (ARR)</span>
          <p className="text-xl font-black text-blue-700">₹5,15,964</p>
          <span className="text-[10px] text-slate-400">Projected Run Rate</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Taxes Collected (GST 18%)</span>
          <p className="text-xl font-black text-slate-900">₹92,875</p>
          <span className="text-[10px] text-slate-400">Quarterly GST Return</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Outstanding / Pending</span>
          <p className="text-xl font-black text-rose-600">₹14,999</p>
          <span className="text-[10px] text-rose-600 font-bold">1 Failed Authorization</span>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Billing Overview', icon: DollarSign },
          { id: 'invoices', label: '5-Year GST Tax Invoices', icon: Receipt },
          { id: 'transactions', label: 'Payment Gateway Logs', icon: ArrowLeftRight },
          { id: 'gateway', label: 'Gateway Settings', icon: Sliders },
          { id: 'refunds', label: 'Refunds & Credits', icon: CreditCard }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === tab.id
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

      {/* Sub-Tab 1: Billing Overview & Active Tenant Subscriptions */}
      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Active Tenant Subscriptions & Renewal Status</h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500">
                  <tr>
                    <th className="p-3">Workspace</th>
                    <th className="p-3">Subscription Tier</th>
                    <th className="p-3">Billing Cycle</th>
                    <th className="p-3">Renewal Date</th>
                    <th className="p-3">Monthly Amount</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { company: 'RnD Technosoft', plan: 'PROFESSIONAL', cycle: 'ANNUAL (20% OFF)', renew: '2027-08-15', amount: 14999, status: 'ACTIVE' },
                    { company: 'Apex Logistics', plan: 'GROWTH', cycle: 'MONTHLY', renew: '2026-09-28', amount: 5999, status: 'ACTIVE' },
                    { company: 'Nexus Tech Innovations', plan: 'GROWTH', cycle: 'MONTHLY', renew: '2026-09-20', amount: 5999, status: 'RETRY_PENDING' },
                    { company: 'Acme Studio (Solo)', plan: 'FREE_FOREVER', cycle: 'LIFETIME', renew: 'Never (Free)', amount: 0, status: 'ACTIVE' }
                  ].map((sub, i) => (
                    <tr key={i} className="hover:bg-slate-50/70">
                      <td className="p-3 font-bold text-slate-900">{sub.company}</td>
                      <td className="p-3 font-semibold text-teal-700">{sub.plan}</td>
                      <td className="p-3 font-mono text-slate-500">{sub.cycle}</td>
                      <td className="p-3 font-mono text-slate-700">{sub.renew}</td>
                      <td className="p-3 font-black text-slate-900">{formatINR(sub.amount)}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          sub.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {sub.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Invoices View */}
      {activeSubTab === 'invoices' && (
        <TenantInvoicesView />
      )}

      {/* Sub-Tab 3: Transactions View */}
      {activeSubTab === 'transactions' && (
        <TenantTransactionsView />
      )}

      {/* Sub-Tab 4: Payment Gateway Configuration */}
      {activeSubTab === 'gateway' && (
        <PaymentGatewayView />
      )}

      {/* Sub-Tab 5: Refunds & Credits */}
      {activeSubTab === 'refunds' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 max-w-2xl">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Issue Tenant Credit or Process Gateway Refund
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-700">Target Tenant Workspace</label>
              <select className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <option>RnD Technosoft (rndtechnosoft.voogyo.com)</option>
                <option>Apex Logistics (apexlogistics.voogyo.com)</option>
                <option>Nexus Tech Innovations (nexustech.voogyo.com)</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700">Action Type</label>
              <select className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <option>Grant Account Credit (Deducted from next renewal)</option>
                <option>Process Instant Razorpay Refund to Source Bank</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700">Amount (₹ INR)</label>
              <input
                type="number"
                defaultValue={2000}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">Reason / Internal Auditor Note</label>
              <textarea
                rows={2}
                placeholder="Reason for concession or partial refund..."
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <button
              onClick={() => showBanner('Credit granted and ledger adjusted!')}
              className="px-4 py-2.5 rounded-xl bg-[#00B7A7] text-white font-bold text-xs"
            >
              Apply Adjustment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
