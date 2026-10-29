import React, { useEffect, useId, useState } from 'react';
import {
  Download,
  Eye,
  FileCheck,
  FileDown,
  FileText,
  History,
  Mail,
  RotateCcw,
  Search,
  Sliders,
  User,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  onboardingApi,
  type CentralDocumentItem,
  type DocumentVersionItem,
  type DocumentEmailItem,
} from '../../api/onboarding.api';
import { fieldClass, formatDate, formatDateTime, labelClass } from './onboarding-format';

interface Props {
  onOpenCandidate: (candidateId: string) => void;
}

const DOCUMENT_TYPES: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All Documents' },
  { key: 'OFFER_LETTER', label: 'Offer Letters' },
  { key: 'APPOINTMENT_LETTER', label: 'Appointment Letters' },
  { key: 'NDA', label: 'NDAs' },
  { key: 'EMPLOYMENT_CONTRACT', label: 'Contracts' },
  { key: 'JOINING_LETTER', label: 'Joining Letters' },
  { key: 'WELCOME_LETTER', label: 'Welcome Letters' },
  { key: 'CUSTOM_HR', label: 'Custom HR' },
];

const STATUS_KEYS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All Statuses' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'SENT', label: 'Sent' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
];

const STATUS_VARIANTS: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'purple' | 'info'> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  APPROVED: 'info',
  SENT: 'purple',
  DELIVERED: 'purple',
  VIEWED: 'purple',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  WITHDRAWN: 'neutral',
};

const actionBtnClass =
  'px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 inline-flex items-center gap-1 text-slate-700 dark:text-slate-300';

export const CentralDocumentsView: React.FC<Props> = ({ onOpenCandidate }) => {
  const ids = useId();
  const { can } = useAuth();
  const [type, setType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [emailStatus, setEmailStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CentralDocumentItem[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Active Modals
  const [previewDoc, setPreviewDoc] = useState<{ candidateId: string; docId: string; title: string; candidateName?: string } | null>(null);
  const [versionsDoc, setVersionsDoc] = useState<{ candidateId: string; docId: string; title: string } | null>(null);
  const [emailsDoc, setEmailsDoc] = useState<{ candidateId: string; docId: string; title: string } | null>(null);
  const [statusDoc, setStatusDoc] = useState<{ candidateId: string; docId: string; title: string; currentStatus: string } | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    onboardingApi
      .listAllLetterDocuments({
        page,
        limit: 20,
        search: debouncedSearch,
        type: type === 'ALL' ? undefined : type,
        status: status === 'ALL' ? undefined : status,
        emailStatus: emailStatus === 'ALL' ? undefined : emailStatus,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setPagination({
          page: res.pagination.page,
          totalPages: res.pagination.totalPages,
          total: res.pagination.total,
        });
        if (res.statusCounts) setStatusCounts(res.statusCounts);
        if (res.typeCounts) setTypeCounts(res.typeCounts);
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [page, type, status, emailStatus, debouncedSearch, reload]);

  const hasActiveFilters = type !== 'ALL' || status !== 'ALL' || emailStatus !== 'ALL' || debouncedSearch.trim() !== '';

  const resetFilters = () => {
    setType('ALL');
    setStatus('ALL');
    setEmailStatus('ALL');
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  };

  const downloadPdf = async (candidateId: string, docId: string, title: string) => {
    try {
      const file = await onboardingApi.downloadLetterPdf(candidateId, docId);
      const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download PDF');
    }
  };

  const downloadDocx = async (candidateId: string, docId: string, title: string) => {
    try {
      const file = await onboardingApi.downloadLetterDocx(candidateId, docId);
      const url = URL.createObjectURL(new Blob([file], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('DOCX downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download DOCX');
    }
  };

  return (
    <div className="space-y-4">
      {/* Document Type Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-[#2B293E]">
        {DOCUMENT_TYPES.map((t) => {
          const isActive = type === t.key;
          const count = typeCounts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setType(t.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <span>{t.label}</span>
              {t.key === 'ALL' || count > 0 ? (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-end gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E]">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor={`${ids}-search`} className={labelClass}>
            Search Generated Documents
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id={`${ids}-search`}
              type="search"
              placeholder="Search by title, candidate name, candidate code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        <div className="w-40">
          <label htmlFor={`${ids}-status`} className={labelClass}>
            Status
          </label>
          <select
            id={`${ids}-status`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={fieldClass}
          >
            {STATUS_KEYS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} {s.key !== 'ALL' && statusCounts[s.key] ? `(${statusCounts[s.key]})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label htmlFor={`${ids}-email`} className={labelClass}>
            Email Delivery
          </label>
          <select
            id={`${ids}-email`}
            value={emailStatus}
            onChange={(e) => {
              setEmailStatus(e.target.value);
              setPage(1);
            }}
            className={fieldClass}
          >
            <option value="ALL">All deliveries</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="pb-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset filters
          </button>
        )}
      </div>

      {/* Table Content */}
      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          Failed to load documents: {error}{' '}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : rows === null ? (
        <div className="h-48 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true">
          <span className="sr-only" role="status">
            Loading documents
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            {hasActiveFilters ? 'No documents match the selected filters' : 'No generated documents found'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {hasActiveFilters
              ? 'Try resetting the filters or modifying your search keyword.'
              : 'Documents and letters are generated from each candidate’s profile in Onboarding Documents & Letters.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-x-auto shadow-sm">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Central Onboarding Documents List</caption>
            <thead className="bg-slate-50 dark:bg-[#1E1D2D] text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-[#2B293E]">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Document Title</th>
                <th scope="col" className="px-4 py-3 font-semibold">Candidate / Employee</th>
                <th scope="col" className="px-4 py-3 font-semibold hidden md:table-cell">Template</th>
                <th scope="col" className="px-4 py-3 font-semibold">Version</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold hidden lg:table-cell">Email Delivery</th>
                <th scope="col" className="px-4 py-3 font-semibold hidden xl:table-cell">Updated</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                      {row.documentTitle}
                    </span>
                    <span className="inline-block mt-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800">
                      {row.typeLabel || row.documentType.replace(/_/g, ' ')}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {row.candidate ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenCandidate(row.candidate!.id)}
                          className="font-medium text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 hover:underline text-left block"
                        >
                          {row.candidate.name}
                        </button>
                        <span className="text-[11px] font-mono text-slate-500">
                          {row.candidate.code}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-600 dark:text-slate-400">
                    {row.template?.name || '—'}
                  </td>

                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        row.candidate &&
                        setVersionsDoc({
                          candidateId: row.candidate.id,
                          docId: row.id,
                          title: row.documentTitle,
                        })
                      }
                      className="px-2 py-0.5 rounded font-mono text-xs border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
                    >
                      <History className="w-3 h-3 text-slate-500" aria-hidden="true" />
                      v{row.versionNumber}
                    </button>
                  </td>

                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[row.documentStatus] || 'neutral'} size="sm">
                      {row.documentStatus.replace(/_/g, ' ')}
                    </Badge>
                  </td>

                  <td className="px-4 py-3 hidden lg:table-cell text-xs">
                    {row.emailStatus ? (
                      <button
                        type="button"
                        onClick={() =>
                          row.candidate &&
                          setEmailsDoc({
                            candidateId: row.candidate.id,
                            docId: row.id,
                            title: row.documentTitle,
                          })
                        }
                        className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:underline font-medium"
                      >
                        <Mail className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                        <span>{row.emailStatus}</span>
                        {row.lastSentAt && <span className="text-slate-400 text-[10px]">({formatDate(row.lastSentAt)})</span>}
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">Not sent</span>
                    )}
                  </td>

                  <td className="px-4 py-3 hidden xl:table-cell whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(row.updatedAt)}
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {row.candidate && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc({
                                candidateId: row.candidate!.id,
                                docId: row.id,
                                title: row.documentTitle,
                                candidateName: row.candidate!.name,
                              })
                            }
                            title="Preview PDF"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                            <span className="sr-only">Preview {row.documentTitle}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadPdf(row.candidate!.id, row.id, row.documentTitle)}
                            title="Download PDF"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
                          >
                            <Download className="w-4 h-4" aria-hidden="true" />
                            <span className="sr-only">Download PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadDocx(row.candidate!.id, row.id, row.documentTitle)}
                            title="Download DOCX"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
                          >
                            <FileDown className="w-4 h-4" aria-hidden="true" />
                            <span className="sr-only">Download DOCX</span>
                          </button>

                          {can('onboarding.documents.manage') && (
                            <button
                              type="button"
                              onClick={() =>
                                setStatusDoc({
                                  candidateId: row.candidate!.id,
                                  docId: row.id,
                                  title: row.documentTitle,
                                  currentStatus: row.documentStatus,
                                })
                              }
                              title="Change Status"
                              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                              <Sliders className="w-4 h-4" aria-hidden="true" />
                              <span className="sr-only">Change Status</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenCandidate(row.candidate!.id)}
                            className={actionBtnClass}
                            title="Open candidate profile"
                          >
                            <User className="w-3.5 h-3.5" aria-hidden="true" />
                            Profile
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-[#2B293E] text-xs text-slate-600 dark:text-slate-400">
            <span>
              Showing {rows.length} of {pagination.total} document{pagination.total === 1 ? '' : 's'} · page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 font-medium"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 font-medium"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick PDF Viewer Modal */}
      {previewDoc && (
        <PdfViewer
          title={`Document Preview: ${previewDoc.title}`}
          description={previewDoc.candidateName ? `Candidate: ${previewDoc.candidateName}` : undefined}
          load={() => onboardingApi.downloadLetterPdf(previewDoc.candidateId, previewDoc.docId)}
          downloadName={`${previewDoc.title}.pdf`}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Version History Modal */}
      {versionsDoc && (
        <CentralDocVersionsModal
          candidateId={versionsDoc.candidateId}
          docId={versionsDoc.docId}
          title={versionsDoc.title}
          onClose={() => setVersionsDoc(null)}
        />
      )}

      {/* Email History Modal */}
      {emailsDoc && (
        <CentralDocEmailsModal
          candidateId={emailsDoc.candidateId}
          docId={emailsDoc.docId}
          title={emailsDoc.title}
          onClose={() => setEmailsDoc(null)}
        />
      )}

      {/* Change Status Modal */}
      {statusDoc && (
        <CentralDocStatusModal
          candidateId={statusDoc.candidateId}
          docId={statusDoc.docId}
          title={statusDoc.title}
          currentStatus={statusDoc.currentStatus}
          onClose={() => setStatusDoc(null)}
          onSuccess={() => {
            setStatusDoc(null);
            setReload((n) => n + 1);
            toast.success('Document status updated');
          }}
        />
      )}
    </div>
  );
};

const CentralDocVersionsModal: React.FC<{
  candidateId: string;
  docId: string;
  title: string;
  onClose: () => void;
}> = ({ candidateId, docId, title, onClose }) => {
  const [versions, setVersions] = useState<DocumentVersionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onboardingApi
      .listDocumentVersions(candidateId, docId)
      .then(setVersions)
      .catch((e: Error) => setError(e.message));
  }, [candidateId, docId]);

  return (
    <Dialog
      title={`Version History: ${title}`}
      description="Inspect version snapshots and download historical copies."
      onClose={onClose}
      size="md"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E]"
        >
          Close
        </button>
      }
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : versions === null ? (
        <div className="h-32 bg-slate-100 dark:bg-white/5 animate-pulse rounded-xl" />
      ) : versions.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">No version history available.</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {versions.map((v) => (
            <div
              key={v.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-white/5 flex items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Version {v.versionNumber}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(v.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{v.title}</p>
                {v.changelogNote && <p className="text-xs text-slate-500 italic mt-0.5">“{v.changelogNote}”</p>}
                {v.createdByName && <span className="text-[11px] text-slate-400 block mt-0.5">Author: {v.createdByName}</span>}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const file = await onboardingApi.downloadVersionPdf(candidateId, docId, v.id);
                      const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
                      window.open(url, '_blank');
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Could not download PDF');
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
};

const CentralDocEmailsModal: React.FC<{
  candidateId: string;
  docId: string;
  title: string;
  onClose: () => void;
}> = ({ candidateId, docId, title, onClose }) => {
  const [emails, setEmails] = useState<DocumentEmailItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onboardingApi
      .listDocumentEmails(candidateId, docId)
      .then(setEmails)
      .catch((e: Error) => setError(e.message));
  }, [candidateId, docId]);

  return (
    <Dialog
      title={`Email History: ${title}`}
      description="Record of email dispatches and delivery statuses."
      onClose={onClose}
      size="md"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E]"
        >
          Close
        </button>
      }
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : emails === null ? (
        <div className="h-32 bg-slate-100 dark:bg-white/5 animate-pulse rounded-xl" />
      ) : emails.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No email delivery records found for this document.</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {emails.map((e) => (
            <div
              key={e.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-white/5 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">{e.recipientEmail}</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    e.deliveryStatus === 'SENT' || e.deliveryStatus === 'DELIVERED'
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}
                >
                  {e.deliveryStatus}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{e.subject}</p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span>Sent {formatDateTime(e.sentAt)}</span>
                {e.senderName && <span>By {e.senderName}</span>}
              </div>
              {e.errorMessage && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{e.errorMessage}</p>}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
};

const CentralDocStatusModal: React.FC<{
  candidateId: string;
  docId: string;
  title: string;
  currentStatus: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ candidateId, docId, title, currentStatus, onClose, onSuccess }) => {
  const ids = useId();
  const { can } = useAuth();
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [isOverride, setIsOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validTransitions: Record<string, string[]> = {
    DRAFT: ['IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
    IN_REVIEW: ['DRAFT', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
    APPROVED: ['SENT', 'IN_REVIEW', 'REJECTED', 'WITHDRAWN'],
    SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
    ACCEPTED: ['WITHDRAWN'],
    REJECTED: ['DRAFT'],
    EXPIRED: ['DRAFT', 'WITHDRAWN'],
    WITHDRAWN: ['DRAFT'],
  };

  const normalOptions = validTransitions[currentStatus] || [];
  const allOptions = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'].filter(
    (s) => s !== currentStatus,
  );
  const options = isOverride ? allOptions : normalOptions;

  const handleSubmit = async () => {
    if (!newStatus) return;
    if (isOverride && reason.trim().length < 10) {
      setError('Administrative override requires a reason of at least 10 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onboardingApi.changeDocumentStatus(candidateId, docId, {
        newStatus,
        reason: reason.trim() || undefined,
        isOverride,
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update document status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Change Document Status: ${title}`}
      description={`Current workflow status: ${currentStatus}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E]">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !newStatus}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Update Status'}
          </button>
        </>
      }
    >
      {error && <p className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      <div className="space-y-3">
        <div>
          <label htmlFor={`${ids}-status-sel`} className={labelClass}>
            New Document Status *
          </label>
          <select
            id={`${ids}-status-sel`}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className={fieldClass}
          >
            <option value="">Select target status</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${ids}-status-rsn`} className={labelClass}>
            Reason or Audit Note {isOverride ? '*' : ''}
          </label>
          <textarea
            id={`${ids}-status-rsn`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isOverride ? 'Mandatory reason for administrative override...' : 'Optional comment...'}
            className={fieldClass}
          />
        </div>

        {can('onboarding.candidates.override') && (
          <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isOverride}
              onChange={(e) => {
                setIsOverride(e.target.checked);
                setNewStatus('');
              }}
              className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            Administrative Override (bypasses standard transition rules)
          </label>
        )}
      </div>
    </Dialog>
  );
};
