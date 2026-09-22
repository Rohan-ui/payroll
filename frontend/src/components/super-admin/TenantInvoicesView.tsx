'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, 
  Search, 
  Filter, 
  Download, 
  Eye, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  FileSpreadsheet,
  Building2,
  Calendar,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import InvoiceDetailModal from './InvoiceDetailModal';

export default function TenantInvoicesView() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    total_invoices: 0,
    total_collected: 0,
    total_tax_collected: 0,
    total_pending_amount: 0,
    paid_count: 0,
    pending_count: 0,
  });
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedTenant, setSelectedTenant] = useState('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (selectedYear !== 'ALL') params.set('year', selectedYear);
      if (selectedTenant !== 'ALL') params.set('tenant_id', selectedTenant);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`/api/v1/super-admin/invoices?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setInvoices(json.data.invoices || []);
        setMetrics(json.data.metrics || {});
        if (json.data.availableYears && json.data.availableYears.length > 0) {
          setAvailableYears(json.data.availableYears);
        }
      }
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter, selectedYear, selectedTenant]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchInvoices();
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Unique tenants in current dataset for filter dropdown
  const tenantOptions = useMemo(() => {
    const map = new Map();
    for (const inv of invoices) {
      if (inv.tenant_id && !map.has(inv.tenant_id)) {
        map.set(inv.tenant_id, inv.company_name || inv.subdomain);
      }
    }
    return Array.from(map.entries());
  }, [invoices]);

  const formatCurrency = (val: number | string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(Number(val) || 0);
  };

  const formatDate = (d: any) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleExportCSV = () => {
    if (invoices.length === 0) return;
    const headers = [
      'Invoice Number',
      'Tenant Name',
      'Subdomain',
      'Plan',
      'Period Start',
      'Period End',
      'Subtotal (INR)',
      'CGST 9%',
      'SGST 9%',
      'Total Amount (INR)',
      'Status',
      'Payment Gateway',
      'Razorpay Payment ID',
      'Paid Date'
    ];

    const rows = invoices.map(i => [
      i.invoice_number,
      `"${(i.company_name || '').replace(/"/g, '""')}"`,
      i.subdomain,
      i.plan_name || 'Enterprise Suite',
      i.period_start ? new Date(i.period_start).toISOString().split('T')[0] : '',
      i.period_end ? new Date(i.period_end).toISOString().split('T')[0] : '',
      i.subtotal_amount,
      i.cgst_amount,
      i.sgst_amount,
      i.total_amount,
      i.status,
      i.payment_method,
      i.razorpay_payment_id || '',
      i.paid_at ? new Date(i.paid_at).toISOString().split('T')[0] : ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Voogyo_Tenant_Invoices_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#5C7BDD]" />
            Tenant Subscription Invoices
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            5-Year Historical GST Compliance Ledger & SaaS Subscription Billing (2021 — 2026)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchInvoices}
            className="p-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
            title="Refresh Invoices"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Revenue Collected</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(metrics.total_collected)}
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            ✓ Across {metrics.paid_count || 0} settled billing cycles
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">GST Collected (18%)</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center text-[#00B7A7]">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(metrics.total_tax_collected)}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            CGST 9% + SGST 9% (SAC: 998313)
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Invoices</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {metrics.total_invoices || 0}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Spanning 5 Years (2021 — 2026)
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Dues</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(metrics.total_pending_amount)}
          </p>
          <p className="text-[11px] text-amber-600 font-medium mt-1">
            {metrics.pending_count || 0} renewals awaiting payment
          </p>
        </div>
      </div>

      {/* Year Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedYear('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            selectedYear === 'ALL'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All 5 Years
        </button>
        {availableYears.map(yr => (
          <button
            key={yr}
            onClick={() => setSelectedYear(String(yr))}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              selectedYear === String(yr)
                ? 'bg-[#5C7BDD] text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {yr}
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice number, tenant name, subdomain, or Razorpay payment ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Tenant filter */}
          <select
            value={selectedTenant}
            onChange={e => setSelectedTenant(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5C7BDD] text-slate-700"
          >
            <option value="ALL">All Tenants</option>
            {tenantOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5C7BDD] text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="OVERDUE">Overdue</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Tenant</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Billing Period</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">GST (18%)</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4">Razorpay Ref</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#5C7BDD]" />
                    <span>Loading 5-year invoice records...</span>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span>No invoices match the specified criteria</span>
                  </td>
                </tr>
              ) : (
                invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{inv.company_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{inv.subdomain}.voogyo.com</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-medium text-slate-700">
                        {inv.plan_name || 'Enterprise Suite'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {formatDate(inv.period_start)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-600">
                      {formatCurrency(inv.subtotal_amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-500">
                      {formatCurrency(inv.tax_amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="py-3 px-4">
                      {inv.razorpay_payment_id ? (
                        <span className="font-mono text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          {inv.razorpay_payment_id}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">Not Paid</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        inv.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inv.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {inv.status === 'PAID' && <CheckCircle2 className="w-3 h-3" />}
                        {inv.status === 'PENDING' && <Clock className="w-3 h-3" />}
                        <span>{inv.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#5C7BDD] hover:text-white bg-blue-50 hover:bg-[#5C7BDD] rounded-lg transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Tax Invoice</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
