'use client';

import React, { useEffect, useState, useRef } from 'react';
const Link = ({ href, children, className, target, rel, ...props }: any) => (
  <a href={href} className={className} target={target} rel={rel} {...props}>{children}</a>
);
const useRouter = () => ({
  push: (url: string) => { window.location.href = url; },
  replace: (url: string) => { window.location.replace(url); },
});
import { 
  FileText, Plus, Trash2, CheckCircle2, RefreshCw, Trophy,
  Printer, X, ChevronRight, ArrowUpRight, Calculator, IndianRupee,
  MoreVertical, ChevronLeft, Eye, Check, AlertCircle, Sparkles,
  Calendar, Users, ExternalLink, LayoutTemplate, UploadCloud, Image as ImageIcon,
  Edit3
} from 'lucide-react';
import WordDocumentEditor from './WordDocumentEditor';
import { DEFAULT_HEADER_SVG, DEFAULT_FOOTER_SVG } from '@/lib/letterheadDefaults';

interface QuotationsManagerProps {
  leads: any[];
  services: any[];
  initialLeadId?: string | null;
  autoOpenCreate?: boolean;
  onCloseCreate?: () => void;
  onRefreshParent: () => void;
  onSelectLead360?: (leadId: string) => void;
  onScheduleMeeting?: (leadId: string) => void;
}

export default function QuotationsManager({
  leads,
  services,
  initialLeadId,
  autoOpenCreate,
  onCloseCreate,
  onRefreshParent,
  onSelectLead360,
  onScheduleMeeting
}: QuotationsManagerProps) {
  const router = useRouter();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Three-dot action menu
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  // Modals & previews
  const [selectedQuoteForPreview, setSelectedQuoteForPreview] = useState<any>(null);
  const [deleteConfirmQuote, setDeleteConfirmQuote] = useState<any | null>(null);
  const [dealWonConfirmQuote, setDealWonConfirmQuote] = useState<any | null>(null);

  // In-app toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchQuotationsAndTemplates = async () => {
    setLoading(true);
    try {
      const [qRes, tRes] = await Promise.all([
        fetch('/api/v1/crm/quotations'),
        fetch('/api/v1/crm/quotation-templates')
      ]);
      const qJson = await qRes.json();
      const tJson = await tRes.json();
      if (qJson.success) setQuotations(qJson.data || []);
      if (tJson.success) setTemplates(tJson.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotationsAndTemplates();
  }, []);

  useEffect(() => {
    if (autoOpenCreate) {
      router.push(initialLeadId ? `/crm/quotations/new?leadId=${initialLeadId}` : '/crm/quotations/new');
      onCloseCreate?.();
    }
  }, [initialLeadId, autoOpenCreate, router, onCloseCreate]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmQuote) return;
    try {
      const res = await fetch(`/api/v1/crm/quotations/${deleteConfirmQuote.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`Quotation ${deleteConfirmQuote.quotation_number} deleted.`);
        setDeleteConfirmQuote(null);
        fetchQuotationsAndTemplates();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/v1/crm/quotations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      showToast(`Status updated to ${newStatus}`);
      fetchQuotationsAndTemplates();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmConvertWon = async () => {
    if (!dealWonConfirmQuote) return;
    try {
      // 1. Mark quote accepted
      await handleUpdateStatus(dealWonConfirmQuote.id, 'ACCEPTED');

      // 2. Trigger deal won
      const res = await fetch(`/api/v1/crm/leads/${dealWonConfirmQuote.lead_id}/convert-won`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`🏆 Deal Won! Client created, Project: ${data.data.projectCode}, Invoice: ${data.data.invoiceNumber}`);
        setDealWonConfirmQuote(null);
        fetchQuotationsAndTemplates();
        onRefreshParent();
      }
    } catch (err: any) {
      showToast('Conversion failed: ' + err.message);
    }
  };

  // Pagination
  const totalItems = quotations.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedQuotes = quotations.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-4 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 text-white text-xs font-semibold rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top duration-200 ${
          toastMessage.type === 'success' ? 'bg-slate-900' : 'bg-rose-600'
        }`}>
          {toastMessage.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-white" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-900">Quotations</h3>
          <p className="text-xs text-slate-500">
            GST-compliant proposal builder with rich text editor, fixed industry templates & dynamic pricing table
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchQuotationsAndTemplates}
            className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-500 transition-colors cursor-pointer"
            title="Refresh Quotations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <Link
            href="/crm/quotations/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Quotation</span>
          </Link>
        </div>
      </div>

      {/* Proposals List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Quote #</th>
                <th className="py-3 px-4">Company / Lead</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Tax Type</th>
                <th className="py-3 px-4">Subtotal</th>
                <th className="py-3 px-4">GST Tax</th>
                <th className="py-3 px-4">Grand Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedQuotes.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                    <Link
                      href={`/crm/quotations/${encodeURIComponent(q.quotation_number)}`}
                      className="hover:text-blue-900 hover:underline inline-flex items-center gap-1.5 group"
                      title={`Open quotation detail page for ${q.quotation_number}`}
                    >
                      <span>{q.quotation_number}</span>
                      <ExternalLink className="w-3 h-3 text-blue-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 block">{q.company_name}</span>
                    <span className="text-[11px] text-slate-400">{q.first_name} {q.last_name}</span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-700 font-medium max-w-xs truncate">
                    {q.subject}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                      {q.tax_type === 'INTER_STATE' ? 'IGST (18%)' : 'CGST+SGST (9%+9%)'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-700">
                    {formatCurrency(q.subtotal)}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500">
                    {formatCurrency(Number(q.cgst_amount || 0) + Number(q.sgst_amount || 0) + Number(q.igst_amount || 0))}
                  </td>

                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    {formatCurrency(q.total_amount)}
                  </td>

                  <td className="py-3.5 px-4">
                    <select
                      value={q.status}
                      onChange={(e) => handleUpdateStatus(q.id, e.target.value)}
                      className={`text-[10px] font-bold px-2 py-1 rounded border ${
                        q.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        q.status === 'SENT' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        q.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="SENT">SENT</option>
                      <option value="ACCEPTED">ACCEPTED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </td>

                  {/* THREE-DOT ACTIONS MENU */}
                  <td className="py-3.5 px-4 text-right relative">
                    <button
                      onClick={() => setOpenActionId(openActionId === q.id ? null : q.id)}
                      className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                      title="Actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {openActionId === q.id && (
                      <div className="absolute right-4 top-10 z-40 bg-white w-48 rounded-xl shadow-xl border border-slate-200 py-1.5 text-left text-xs animate-in fade-in-50 duration-150">
                        {/* Open Quotation Detail Page */}
                        <Link
                          href={`/crm/quotations/${encodeURIComponent(q.quotation_number)}`}
                          onClick={() => setOpenActionId(null)}
                          className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                          <span>Open Quotation Page</span>
                        </Link>

                        {/* Edit Proposal Page */}
                        <Link
                          href={`/crm/quotations/${q.id}/edit`}
                          onClick={() => setOpenActionId(null)}
                          className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Edit Proposal</span>
                        </Link>

                        {/* View Preview */}
                        <button
                          onClick={() => { setOpenActionId(null); setSelectedQuoteForPreview(q); }}
                          className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>View & Print Preview</span>
                        </button>

                        {/* View Lead 360 */}
                        {onSelectLead360 && q.lead_id && (
                          <button
                            onClick={() => {
                              setOpenActionId(null);
                              onSelectLead360(q.lead_id);
                            }}
                            className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Users className="w-3.5 h-3.5 text-indigo-600" />
                            <span>View Lead 360°</span>
                          </button>
                        )}

                        {/* Schedule Meeting */}
                        {onScheduleMeeting && q.lead_id && (
                          <button
                            onClick={() => {
                              setOpenActionId(null);
                              onScheduleMeeting(q.lead_id);
                            }}
                            className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Schedule Meeting</span>
                          </button>
                        )}

                        {/* Won & Convert */}
                        {q.status !== 'ACCEPTED' && (
                          <button
                            onClick={() => {
                              setOpenActionId(null);
                              setDealWonConfirmQuote(q);
                            }}
                            className="w-full px-3 py-2 text-amber-700 hover:bg-amber-50 flex items-center gap-2 font-semibold"
                          >
                            <Trophy className="w-3.5 h-3.5 text-amber-600" />
                            <span>Mark Won & Convert</span>
                          </button>
                        )}

                        <div className="border-t border-slate-100 my-1" />

                        {/* Delete */}
                        <button
                          onClick={() => {
                            setOpenActionId(null);
                            setDeleteConfirmQuote(q);
                          }}
                          className="w-full px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 font-semibold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Proposal</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {paginatedQuotes.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No proposals created yet. Click "Create Proposal" to generate a GST quote.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-slate-900">{totalItems === 0 ? 0 : startIndex + 1}</strong> to{' '}
              <strong className="text-slate-900">{Math.min(startIndex + pageSize, totalItems)}</strong> of{' '}
              <strong className="text-slate-900">{totalItems}</strong> quotations
            </span>

            <div className="flex items-center gap-1.5 text-slate-500">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                  currentPage === p
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* VIEW / PRINT PREVIEW MODAL */}
      {selectedQuoteForPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 my-8">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <span className="text-xs font-bold text-blue-700">{selectedQuoteForPreview.quotation_number}</span>
                <h3 className="text-lg font-black text-slate-900">{selectedQuoteForPreview.company_name}</h3>
                <p className="text-xs text-slate-500">{selectedQuoteForPreview.subject}</p>
              </div>
              <button onClick={() => setSelectedQuoteForPreview(null)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Letterhead Header Banner */}
            <div className="w-full bg-white rounded-lg border border-slate-200 overflow-hidden">
              <img 
                src={selectedQuoteForPreview.header_image || DEFAULT_HEADER_SVG} 
                alt="Letterhead Header" 
                className="w-full max-h-24 object-contain object-left-top"
              />
            </div>

            {/* Scope Content preview */}
            {selectedQuoteForPreview.content_body && (
              <div className="p-4 bg-slate-50 border rounded-xl prose prose-xs max-w-none text-xs text-slate-800">
                <div dangerouslySetInnerHTML={{ __html: selectedQuoteForPreview.content_body }} />
              </div>
            )}

            {/* Services & Scope Deliverables Pricing Table */}
            {selectedQuoteForPreview.items && selectedQuoteForPreview.items.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-[11px] font-bold uppercase text-slate-600">
                    <tr>
                      <th className="p-2.5">Service & Scope</th>
                      <th className="p-2.5">SAC</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Rate</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedQuoteForPreview.items.map((it: any) => (
                      <tr key={it.id}>
                        <td className="p-2.5 font-semibold text-slate-800">{it.description}</td>
                        <td className="p-2.5 font-mono text-slate-500">{it.sac_code}</td>
                        <td className="p-2.5 text-center">{it.quantity}</td>
                        <td className="p-2.5 text-right">{formatCurrency(it.unit_rate)}</td>
                        <td className="p-2.5 text-right font-bold">{formatCurrency(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-slate-100 p-3 rounded-xl flex justify-between items-center text-xs">
              <span className="text-slate-600">Grand Total (Incl. GST):</span>
              <span className="font-bold text-base text-slate-900">{formatCurrency(selectedQuoteForPreview.total_amount)}</span>
            </div>

            {selectedQuoteForPreview.terms_and_conditions && (
              <div className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono bg-slate-50 p-3 rounded-lg">
                <strong>Commercial Terms:</strong><br />
                {selectedQuoteForPreview.terms_and_conditions}
              </div>
            )}

            {/* Letterhead Footer Banner */}
            <div className="w-full bg-white rounded-lg border border-slate-200 overflow-hidden mt-3">
              <img 
                src={selectedQuoteForPreview.footer_image || DEFAULT_FOOTER_SVG} 
                alt="Letterhead Footer" 
                className="w-full max-h-16 object-contain object-center"
              />
            </div>

            <div className="pt-3 border-t flex justify-between items-center">
              <Link
                href={`/crm/quotations/${encodeURIComponent(selectedQuoteForPreview.quotation_number)}`}
                className="px-4 py-2 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Full Quotation Page</span>
              </Link>

              <button
                onClick={() => setSelectedQuoteForPreview(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM IN-APP DELETE MODAL */}
      {deleteConfirmQuote && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Quotation</h3>
                <p className="text-xs text-slate-500">Proposal #{deleteConfirmQuote.quotation_number}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              Are you sure you want to permanently delete quotation <strong className="text-slate-900">"{deleteConfirmQuote.quotation_number}"</strong> for {deleteConfirmQuote.company_name}?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmQuote(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs"
              >
                Yes, Delete Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM IN-APP DEAL WON CONFIRMATION MODAL */}
      {dealWonConfirmQuote && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Accept Proposal & Deal WON</h3>
                <p className="text-xs text-slate-500">Auto-convert to Client, Project & Invoice</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              Accept quotation <strong className="text-slate-900">"{dealWonConfirmQuote.quotation_number}"</strong> for {dealWonConfirmQuote.company_name} (₹{dealWonConfirmQuote.total_amount?.toLocaleString('en-IN')}) and trigger automatic Client Account, Project workspace, and Tax Invoice generation?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDealWonConfirmQuote(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConvertWon}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Confirm Won & Convert</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
