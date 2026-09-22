'use client';

import React from 'react';
import { 
  X, 
  Printer, 
  Download, 
  CheckCircle2, 
  Clock, 
  Building2, 
  Mail, 
  Phone, 
  CreditCard,
  ShieldCheck,
  FileText
} from 'lucide-react';
import VoogyoLogo from '@/components/VoogyoLogo';

interface InvoiceDetailModalProps {
  invoice: any;
  branding?: any;
  onClose: () => void;
}

export default function InvoiceDetailModal({ invoice, branding, onClose }: InvoiceDetailModalProps) {
  if (!invoice) return null;

  const formatDate = (d: any) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (val: number | string) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: invoice.currency || 'INR',
      maximumFractionDigits: 2
    }).format(num);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#5C7BDD]" />
            <span className="text-sm font-bold text-slate-800">
              Subscription Tax Invoice — {invoice.invoice_number}
            </span>
            <span className={`ml-2 px-2.5 py-0.5 text-xs font-bold rounded-full ${
              invoice.status === 'PAID' 
                ? 'bg-emerald-100 text-emerald-700' 
                : invoice.status === 'PENDING'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-rose-100 text-rose-700'
            }`}>
              {invoice.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="p-8 space-y-6 text-slate-800 bg-white print:p-0 print:m-0" id="printable-invoice">
          {/* Top Brand & Invoice Title */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-200">
            <div>
              <VoogyoLogo size="md" withTagline={true} />
              <div className="mt-3 text-xs text-slate-500 leading-relaxed max-w-xs">
                <p className="font-semibold text-slate-700">Voogyo Technologies Pvt. Ltd.</p>
                <p>Voogyo Tower, Cyber Park, SG Highway</p>
                <p>Ahmedabad, Gujarat 380054, India</p>
                <p className="mt-1 font-mono text-[11px]">GSTIN: 24AAACV1234F1Z8</p>
                <p className="text-[11px]">support@voogyo.com • +91 98765 43210</p>
              </div>
            </div>

            <div className="sm:text-right">
              <span className="inline-block px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold tracking-wider uppercase rounded-md mb-2">
                Tax Invoice
              </span>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {invoice.invoice_number}
              </h2>
              <div className="mt-2 text-xs text-slate-600 space-y-1">
                <p><span className="text-slate-400">Invoice Date:</span> <span className="font-semibold">{formatDate(invoice.created_at)}</span></p>
                <p><span className="text-slate-400">Billing Cycle:</span> <span className="font-semibold">{invoice.billing_cycle || 'MONTHLY'}</span></p>
                <p><span className="text-slate-400">Period:</span> <span className="font-semibold">{formatDate(invoice.period_start)} — {formatDate(invoice.period_end)}</span></p>
                {invoice.paid_at && (
                  <p><span className="text-slate-400">Paid On:</span> <span className="font-semibold text-emerald-600">{formatDate(invoice.paid_at)}</span></p>
                )}
              </div>
            </div>
          </div>

          {/* Billed To Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Billed To (Tenant)</p>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#5C7BDD]" />
                {invoice.company_name}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{invoice.subdomain}.voogyo.com</p>
              <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                <p className="font-medium text-slate-700">{invoice.primary_contact_name}</p>
                <p className="flex items-center gap-1.5 text-slate-500">
                  <Mail className="w-3 h-3 text-slate-400" />
                  {invoice.primary_contact_email}
                </p>
                {invoice.primary_contact_phone && (
                  <p className="flex items-center gap-1.5 text-slate-500">
                    <Phone className="w-3 h-3 text-slate-400" />
                    {invoice.primary_contact_phone}
                  </p>
                )}
              </div>
            </div>

            <div className="sm:text-right sm:border-l sm:border-slate-200 sm:pl-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Reference</p>
              <div className="space-y-1 text-xs text-slate-600">
                <p><span className="text-slate-400">Gateway:</span> <span className="font-semibold text-slate-800">{invoice.payment_method || 'RAZORPAY'}</span></p>
                {invoice.razorpay_payment_id && (
                  <p><span className="text-slate-400">Payment ID:</span> <span className="font-mono font-semibold text-blue-600">{invoice.razorpay_payment_id}</span></p>
                )}
                {invoice.razorpay_order_id && (
                  <p><span className="text-slate-400">Order ID:</span> <span className="font-mono text-slate-500">{invoice.razorpay_order_id}</span></p>
                )}
                <div className="mt-2 inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Payment Settled via Razorpay</span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Description & Service</th>
                  <th className="py-2.5 px-3 text-center">SAC Code</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Base Rate</th>
                  <th className="py-2.5 px-3 text-right">Amount (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                <tr>
                  <td className="py-3 px-3">
                    <p className="font-bold text-slate-900">{invoice.plan_name || 'Voogyo SaaS Enterprise Suite'}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Cloud ERP Subscription ({formatDate(invoice.period_start)} to {formatDate(invoice.period_end)})
                    </p>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-600">998313</td>
                  <td className="py-3 px-3 text-center font-medium">1 Month</td>
                  <td className="py-3 px-3 text-right font-medium">{formatCurrency(invoice.subtotal_amount)}</td>
                  <td className="py-3 px-3 text-right font-bold text-slate-900">{formatCurrency(invoice.subtotal_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tax Calculation Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between items-start pt-4 border-t border-slate-200 gap-4">
            <div className="text-xs text-slate-500 max-w-sm space-y-1">
              <p className="font-semibold text-slate-700">Tax Compliance Notes:</p>
              <p>SAC 998313: Information technology software as a service and cloud hosting infrastructure services.</p>
              <p>Supply subjected to GST under Forward Charge Mechanism.</p>
            </div>

            <div className="w-full sm:w-64 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-medium text-slate-800">{formatCurrency(invoice.subtotal_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>CGST (9%):</span>
                <span className="font-medium text-slate-800">{formatCurrency(invoice.cgst_amount || 0)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>SGST (9%):</span>
                <span className="font-medium text-slate-800">{formatCurrency(invoice.sgst_amount || 0)}</span>
              </div>
              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Discount:</span>
                  <span>-{formatCurrency(invoice.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t-2 border-slate-200 text-sm font-black text-slate-900">
                <span>Total Amount:</span>
                <span className="text-blue-700">{formatCurrency(invoice.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Signatory & Security Footer */}
          <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-end gap-4">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Electronically generated tax invoice · No physical signature required</span>
            </div>
            <div className="text-right">
              <div className="w-32 h-10 border-b border-dashed border-slate-300 mb-1 flex items-end justify-center">
                <span className="text-[10px] font-mono text-slate-400 italic">Ravi Shah</span>
              </div>
              <p className="text-xs font-bold text-slate-800">Voogyo Technologies</p>
              <p className="text-[10px] text-slate-400">Authorized Signatory</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
