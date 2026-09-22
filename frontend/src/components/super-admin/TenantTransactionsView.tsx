'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Coins, 
  CreditCard, 
  Building2,
  ExternalLink,
  Code2,
  X,
  Plus
} from 'lucide-react';

export default function TenantTransactionsView() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    total_transactions: 0,
    total_volume: 0,
    captured_count: 0,
    pending_count: 0,
    failed_count: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState('ALL');
  const [selectedTxn, setSelectedTxn] = useState<any>(null);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (modeFilter !== 'ALL') params.set('mode', modeFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`/api/v1/super-admin/transactions?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setTransactions(json.data.transactions || []);
        setMetrics(json.data.metrics || {});
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, modeFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchTransactions();
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-[#5C7BDD]" />
            Tenant Payment Transactions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Razorpay Payment Gateway Logs, Settlement Status, & Audit Feed
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTransactions}
            className="p-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
            title="Refresh Transactions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Volume Settled</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(metrics.total_volume)}
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            ✓ 100% via Razorpay Gateway
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Captured Payments</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {metrics.captured_count || 0}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Successful subscription payments
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Transactions</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {metrics.total_transactions || 0}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Lifetime recorded payment attempts
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Failed / Incomplete</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {metrics.failed_count || 0}
          </p>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            0% chargeback rate
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search transaction number, Razorpay payment ID, order ID, or tenant..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5C7BDD] text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Mode filter */}
          <select
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5C7BDD] text-slate-700"
          >
            <option value="ALL">All Payment Modes</option>
            <option value="UPI">UPI</option>
            <option value="CREDIT_CARD">Credit Card</option>
            <option value="NETBANKING">Net Banking</option>
            <option value="DEBIT_CARD">Debit Card</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5C7BDD] text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="CAPTURED">Captured</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Transaction #</th>
                <th className="py-3 px-4">Tenant</th>
                <th className="py-3 px-4">Gateway</th>
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#5C7BDD]" />
                    <span>Loading payment transactions...</span>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span>No transactions match the specified filters</span>
                  </td>
                </tr>
              ) : (
                transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {tx.transaction_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{tx.company_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{tx.subdomain}.voogyo.com</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] border border-blue-100">
                        {tx.gateway || 'RAZORPAY'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                      {tx.gateway_transaction_id || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-semibold text-slate-700">
                        {tx.payment_mode || 'UPI'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      {formatCurrency(tx.amount)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {tx.invoice_number || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                      {formatDate(tx.transacted_at)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        tx.status === 'CAPTURED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : tx.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {tx.status === 'CAPTURED' && <CheckCircle2 className="w-3 h-3" />}
                        {tx.status === 'PENDING' && <Clock className="w-3 h-3" />}
                        {tx.status === 'FAILED' && <XCircle className="w-3 h-3" />}
                        <span>{tx.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedTxn(tx)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                        title="View Gateway Response"
                      >
                        <Code2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gateway Payload Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  Razorpay Audit — {selectedTxn.transaction_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTxn(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">Payment ID</span>
                  <span className="font-mono font-bold text-slate-800">{selectedTxn.gateway_transaction_id || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Order ID</span>
                  <span className="font-mono font-bold text-slate-800">{selectedTxn.gateway_order_id || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Settled Amount</span>
                  <span className="font-bold text-slate-900">{formatCurrency(selectedTxn.amount)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Payment Mode</span>
                  <span className="font-semibold text-slate-800">{selectedTxn.payment_mode}</span>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-700 block mb-1">Raw Gateway Response:</span>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-60">
                  {typeof selectedTxn.gateway_response === 'string'
                    ? selectedTxn.gateway_response
                    : JSON.stringify(selectedTxn.gateway_response || { status: 'captured', gateway: 'RAZORPAY' }, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
