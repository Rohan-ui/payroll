'use client';

import React, { useEffect, useState } from 'react';
import {
  Trash2, RefreshCw, Trophy, ChevronRight, ChevronLeft, Eye, Calendar, Users, Edit3,
} from 'lucide-react';

import { apiFetch } from '../../api/client';
import { toast } from '../../lib/toast';
import { pageWindow } from '../../lib/pageWindow';
import { dealWonMessage } from './pipelineBoard';
import QuotationBuilder from './QuotationBuilder';
import { QuotationPdfViewer } from './QuotationPdfViewer';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { OverflowMenu } from '../ui/OverflowMenu';
interface QuotationsManagerProps {
  leads: any[];
  services: any[];
  /** Whether services can be added to the Services Master from a quotation. */
  canAddServices?: boolean;
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
  canAddServices = false,
  initialLeadId,
  autoOpenCreate,
  onCloseCreate,
  onRefreshParent,
  onSelectLead360,
  onScheduleMeeting
}: QuotationsManagerProps) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modals & previews
  const [selectedQuoteForPreview, setSelectedQuoteForPreview] = useState<any>(null);
  const [deleteConfirmQuote, setDeleteConfirmQuote] = useState<any | null>(null);
  const [dealWonConfirmQuote, setDealWonConfirmQuote] = useState<any | null>(null);
  // The create / edit page, shown in place of the list.
  const [builder, setBuilder] = useState<{ leadId: string | null; quotation: any | null } | null>(null);

  // In-app toast
  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'error' ? toast.error(text) : toast.success(text);

  const fetchQuotationsAndTemplates = async () => {
    setLoading(true);
    try {
      const [qRes, tRes] = await Promise.all([
        apiFetch(`/api/v1/crm/quotations?page=${currentPage}&limit=${pageSize}`),
        apiFetch('/api/v1/crm/quotation-templates')
      ]);
      const qJson = await qRes.json();
      const tJson = await tRes.json();
      if (qJson.success) {
        setQuotations(qJson.data || []);
        setTotalItems(qJson.pagination?.total || 0);
        setTotalPages(Math.max(1, qJson.pagination?.totalPages || 1));
      }
      if (tJson.success) setTemplates(tJson.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotationsAndTemplates();
  }, [currentPage, pageSize]);

  // Opened from elsewhere (the + button, the sidebar, a lead): show the create page for that lead.
  useEffect(() => {
    if (autoOpenCreate) {
      setBuilder({ leadId: initialLeadId ?? null, quotation: null });
      onCloseCreate?.();
    }
  }, [initialLeadId, autoOpenCreate, onCloseCreate]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      // Quotation amounts are exact to the paisa.
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val || 0);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmQuote) return;
    try {
      const res = await apiFetch(`/api/v1/crm/quotations/${deleteConfirmQuote.id}`, { method: 'DELETE', feedback: { success: false } });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Quotation ${deleteConfirmQuote.quotation_number} deleted.`);
        setDeleteConfirmQuote(null);
        fetchQuotationsAndTemplates();
      }
    } catch {
      // Reported by the API client.
    }
  };

  /** Changes a quotation's status; true only when the server saved it. */
  const handleUpdateStatus = async (id: string, newStatus: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/v1/crm/quotations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        feedback: { success: `Quotation marked ${newStatus.toLowerCase()}` },
      });
      if (res.ok) fetchQuotationsAndTemplates();
      return res.ok;
    } catch {
      return false; // Reported by the API client.
    }
  };

  const handleConfirmConvertWon = async () => {
    if (!dealWonConfirmQuote) return;
    try {
      // 1. Mark the quote accepted; stop if that did not save.
      if (!(await handleUpdateStatus(dealWonConfirmQuote.id, 'ACCEPTED'))) return;

      // 2. Then mark the deal won.
      const res = await apiFetch(`/api/v1/crm/leads/${dealWonConfirmQuote.lead_id}/convert-won`, { method: 'POST', feedback: { success: false } });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(dealWonMessage(data.data));
        setDealWonConfirmQuote(null);
        fetchQuotationsAndTemplates();
        onRefreshParent();
      }
    } catch {
      // Reported by the API client.
    }
  };

  // Pagination
  const startIndex = (currentPage - 1) * pageSize;

  if (builder) {
    return (
      <QuotationBuilder
        services={services}
        canAddServices={canAddServices}
        templates={templates}
        initialLeadId={builder.leadId}
        quotation={builder.quotation}
        onCancel={() => setBuilder(null)}
        onSaved={() => {
          setBuilder(null);
          fetchQuotationsAndTemplates();
          onRefreshParent();
        }}
      />
    );
  }

  const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const first = totalItems === 0 ? 0 : startIndex + 1;
  const last = Math.min(startIndex + pageSize, totalItems);

  return (
    <div className="space-y-3">
      {/* The page title and "New quotation" are in the CRM header above. */}
      <h2 className="sr-only">Quotations</h2>

      <div className={`rounded-xl border border-slate-200 bg-white dark:border-[#2B293E] dark:bg-[#181724] ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-[#2B293E]">
          <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
            {loading && quotations.length === 0 ? 'Loading quotations…' : `${totalItems} quotation${totalItems === 1 ? '' : 's'}`}
          </p>
          <Button variant="ghost" size="sm" onClick={fetchQuotationsAndTemplates} aria-label="Refresh quotations">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Quotations</caption>
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Quotation</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Client</th>
                <th scope="col" className="hidden px-4 py-2.5 font-semibold md:table-cell">Valid until</th>
                <th scope="col" className="hidden px-4 py-2.5 text-right font-semibold lg:table-cell">Subtotal</th>
                <th scope="col" className="hidden px-4 py-2.5 text-right font-semibold lg:table-cell">GST</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
                <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setSelectedQuoteForPreview(q)} title={`View quotation ${q.quotation_number} as a PDF`}
                      className="rounded font-mono text-xs font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300">
                      {q.quotation_number}
                    </button>
                    <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                      {q.tax_mode === 'INTER_STATE' ? 'IGST (18%)' : 'CGST+SGST (9%+9%)'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[16rem] truncate font-medium text-slate-900 dark:text-slate-100" title={q.lead_company_name || undefined}>{q.lead_company_name || '—'}</span>
                    {q.contact_person && <span className="block max-w-[16rem] truncate text-xs text-slate-500 dark:text-slate-400">{q.contact_person}</span>}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300 md:table-cell">{dateText(q.valid_until)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300 lg:table-cell">{formatCurrency(q.subtotal)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400 lg:table-cell">{formatCurrency(q.total_tax)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(q.total_amount)}</td>
                  <td className="px-4 py-3">
                    <label htmlFor={`quote-status-${q.id}`} className="sr-only">Status of {q.quotation_number}</label>
                    <select id={`quote-status-${q.id}`} value={q.status} onChange={(e) => handleUpdateStatus(q.id, e.target.value)}
                      className={`h-8 rounded-full border px-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 ${STATUS_STYLE[q.status as QuoteStatus] ?? STATUS_STYLE.DRAFT}`}>
                      {(Object.keys(STATUS_NAMES) as QuoteStatus[]).map((s) => <option key={s} value={s}>{STATUS_NAMES[s]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex justify-end">
                      <OverflowMenu label={`Actions for quotation ${q.quotation_number}`} items={[
                        // Only drafts can be edited: a sent quotation keeps the amounts it was issued with.
                        ...(q.status === 'DRAFT' ? [{ label: 'Edit quotation', icon: Edit3, onSelect: () => setBuilder({ leadId: q.lead_id, quotation: q }) }] : []),
                        { label: 'View PDF', icon: Eye, onSelect: () => setSelectedQuoteForPreview(q) },
                        ...(onSelectLead360 && q.lead_id ? [{ label: 'Open lead', icon: Users, onSelect: () => onSelectLead360(q.lead_id) }] : []),
                        ...(onScheduleMeeting && q.lead_id ? [{ label: 'Schedule meeting', icon: Calendar, onSelect: () => onScheduleMeeting(q.lead_id) }] : []),
                        ...(q.status !== 'ACCEPTED' ? [{ label: 'Accept and mark won', icon: Trophy, onSelect: () => setDealWonConfirmQuote(q) }] : []),
                        { label: 'Delete quotation', icon: Trash2, danger: true, onSelect: () => setDeleteConfirmQuote(q) },
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && quotations.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold text-slate-800 dark:text-slate-200">No quotations yet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose “New quotation” above to build a GST quotation for a lead.</p>
          </div>
        )}

        {totalItems > 0 && (
          <nav aria-label="Pages" className="flex flex-col gap-3 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:border-[#2B293E] dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="tabular-nums">Showing {first}–{last} of {totalItems} · Page {currentPage} of {totalPages}</span>
              <label className="flex items-center gap-2">
                <span>Per page</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-[#2B293E] dark:bg-[#1E1D2D] dark:text-slate-200">
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage(currentPage - 1)} className={`${PAGER} gap-1 px-2.5`}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Previous
              </button>
              <span className="hidden items-center gap-1 sm:flex">
                {pageWindow(currentPage, totalPages).map((p, i) => p === null ? (
                  <span key={`gap-${i}`} className="w-5 text-center text-slate-400" aria-hidden="true">…</span>
                ) : (
                  <button key={p} type="button" disabled={loading} onClick={() => setCurrentPage(p)} aria-label={`Page ${p}`} aria-current={p === currentPage ? 'page' : undefined}
                    className={`${PAGER} w-8 justify-center ${p === currentPage ? 'border-teal-500 bg-teal-500 text-white hover:bg-teal-500 dark:border-teal-500 dark:bg-teal-500 dark:text-white dark:hover:bg-teal-500' : ''}`}>
                    {p}
                  </button>
                ))}
              </span>
              <button type="button" disabled={currentPage >= totalPages || loading} onClick={() => setCurrentPage(currentPage + 1)} className={`${PAGER} gap-1 px-2.5`}>
                Next<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* VIEW: the quotation as its PDF */}
      {selectedQuoteForPreview && (
        <QuotationPdfViewer
          quotationId={selectedQuoteForPreview.id}
          quotationNumber={selectedQuoteForPreview.quotation_number}
          client={selectedQuoteForPreview.lead_company_name}
          onClose={() => setSelectedQuoteForPreview(null)}
        />
      )}

      {deleteConfirmQuote && (
        <Dialog size="sm" title={`Delete quotation ${deleteConfirmQuote.quotation_number}?`} onClose={() => setDeleteConfirmQuote(null)}
          footer={<>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmQuote(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDelete}>Delete quotation</Button>
          </>}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The quotation{deleteConfirmQuote.lead_company_name ? ` for ${deleteConfirmQuote.lead_company_name}` : ''} ({formatCurrency(deleteConfirmQuote.total_amount)}) is removed for good. The lead stays as it is.
          </p>
        </Dialog>
      )}

      {dealWonConfirmQuote && (
        <Dialog size="sm" title={`Accept ${dealWonConfirmQuote.quotation_number} and mark the deal won?`} onClose={() => setDealWonConfirmQuote(null)}
          footer={<>
            <Button variant="outline" size="sm" onClick={() => setDealWonConfirmQuote(null)}>Cancel</Button>
            <Button size="sm" onClick={handleConfirmConvertWon}>Accept and mark won</Button>
          </>}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The quotation{dealWonConfirmQuote.lead_company_name ? ` for ${dealWonConfirmQuote.lead_company_name}` : ''} ({formatCurrency(dealWonConfirmQuote.total_amount)}) is marked accepted, the deal is marked won, and its client account is created or linked to the existing one.
          </p>
        </Dialog>
      )}
    </div>
  );
}

type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
const STATUS_NAMES: Record<QuoteStatus, string> = { DRAFT: 'Draft', SENT: 'Sent', ACCEPTED: 'Accepted', REJECTED: 'Rejected' };
const STATUS_STYLE: Record<QuoteStatus, string> = {
  DRAFT: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-200',
  SENT: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  REJECTED: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
};
const PAGER = 'inline-flex h-8 items-center rounded-lg border border-slate-200 text-xs font-semibold tabular-nums text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2B293E] dark:text-slate-300 dark:hover:bg-white/5';
