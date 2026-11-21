'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Search, Filter, RefreshCw, Download, PlusCircle, Edit3, Trash2, Zap, LogIn, LogOut, FileSpreadsheet, Layers, Clock, ChevronRight, Eye, X,
} from 'lucide-react';

import { apiFetch } from '../../api/client';
import { ACTION_FILTERS, actionLabel, describeEntry, type HistoryEntry } from './crmHistory';
import { Button } from '../ui/Button';
import { StatStrip } from '../ui/StatStrip';
import { fieldClass } from '../../views/payroll/payroll-format';
interface AuditLogItem {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  title: string;
  description: string | null;
  changes_diff: Record<string, unknown> | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface CrmAuditTrailViewProps {
  onSelectLead360?: (leadId: string) => void;
}

export default function CrmAuditTrailView({
  onSelectLead360
}: CrmAuditTrailViewProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    add: 0,
    update: 0,
    delete: 0,
    connect: 0,
    session: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedActor, setSelectedActor] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogItem | null>(null);
  // Workspace members, from the server, for the "who" filter.
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchAuditLogs = async (targetPage = page) => {
    try {
      setLoading(true);
      let url = `/api/v1/crm/audit-logs?page=${targetPage}&limit=${pageSize}`;
      if (selectedAction !== 'ALL') url += `&actionType=${encodeURIComponent(selectedAction)}`;
      if (selectedActor !== 'ALL') url += `&actorId=${encodeURIComponent(selectedActor)}`;
      if (selectedEntity !== 'ALL') url += `&entityType=${encodeURIComponent(selectedEntity)}`;
      if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery.trim())}`;

      const res = await apiFetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        // What each record says, from what the server recorded (no invented titles, roles or addresses).
        setLogs((json.data || []).map((log: AuditLogItem) => ({
          ...log,
          title: actionLabel(log.action_type),
          description: describeEntry(log as unknown as HistoryEntry).join(' · ') || null,
        })));
        if (Array.isArray(json.actors)) setActors(json.actors);
        setTotal(json.pagination?.total || 0);
        setTotalPages(Math.max(1, json.pagination?.totalPages || 1));
        if (json.metrics) {
          setMetrics(json.metrics);
        }
      }
    } catch (err) {
      console.error('Failed to fetch CRM audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [page, selectedAction, selectedActor, selectedEntity]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 1) fetchAuditLogs(1);
    else setPage(1);
  };
  const paginatedLogs = logs;

  // Export Audit Trail to CSV
  const handleExportCsv = () => {
    if (logs.length === 0) return;
    const headers = [
      'Timestamp',
      'Action Type',
      'Entity Type',
      'Entity Name',
      'Actor Name',
      'Actor Email',
      'Actor Role',
      'Title',
      'Description',
      'IP Address'
    ];
    const rows = logs.map(l => [
      `"${l.created_at}"`,
      `"${l.action_type}"`,
      `"${l.entity_type}"`,
      `"${(l.entity_name || '').replace(/"/g, '""')}"`,
      `"${(l.actor_name || '').replace(/"/g, '""')}"`,
      `"${(l.actor_email || '').replace(/"/g, '""')}"`,
      `"${(l.actor_role || '').replace(/"/g, '""')}"`,
      `"${(l.title || '').replace(/"/g, '""')}"`,
      `"${(l.description || '').replace(/"/g, '""')}"`,
      `"${l.ip_address || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Voogyo_CRM_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'ADD':
      case 'CREATE':
      case 'IMPORT':
      case 'IMPORT_LEADS':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />,
          label: action.startsWith('IMPORT') ? 'Bulk Import' : 'Created'
        };
      case 'UPDATE':
        return {
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          icon: <Edit3 className="w-3.5 h-3.5 text-teal-600" />,
          label: 'Updated'
        };
      case 'OUTREACH_EMAIL_FAILED':
      case 'DELETE':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-600" />,
          label: actionLabel(action)
        };
      case 'CONNECT':
        return {
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: <Zap className="w-3.5 h-3.5 text-purple-600" />,
          label: 'Connected'
        };
      case 'LOGIN':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: <LogIn className="w-3.5 h-3.5 text-amber-600" />,
          label: 'Login'
        };
      case 'LOGOUT':
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-300',
          icon: <LogOut className="w-3.5 h-3.5 text-slate-600" />,
          label: 'Logout'
        };
      case 'EXPORT':
        return {
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          icon: <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />,
          label: 'Exported'
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          icon: <Clock className="w-3.5 h-3.5 text-slate-500" />,
          label: actionLabel(action)
        };
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* The page title is the CRM header above; this is the log's own toolbar. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => void fetchAuditLogs()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={logs.length === 0}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
        </Button>
      </div>

      <StatStrip label="Audit summary" stats={[
        { label: 'Events logged', value: metrics.total.toLocaleString() },
        { label: 'Records added or updated', value: (metrics.add + metrics.update).toLocaleString() },
        { label: 'Outreach and sign-ins', value: (metrics.connect + metrics.session).toLocaleString() },
        { label: 'Deletions', value: metrics.delete.toLocaleString(), attention: metrics.delete > 0 },
      ]} />

      {/* Filter & Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input aria-label="Search the audit trail"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member, company, title or action"
            className={`${fieldClass} pl-9`}
          />
        </form>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action Type */}
          <select aria-label="Actions"
            value={selectedAction}
            onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
            className={`${fieldClass} sm:w-44`}
          >
            <option value="ALL">All actions</option>
            {[...ACTION_FILTERS, { label: 'Imports', value: 'IMPORT_LEADS' }, { label: 'Reordering', value: 'REORDER' }].map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>

          {/* Actor / Employee */}
          <select aria-label="Members"
            value={selectedActor}
            onChange={(e) => { setSelectedActor(e.target.value); setPage(1); }}
            className={`${fieldClass} sm:w-44`}
          >
            <option value="ALL">All members</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {/* Entity Type */}
          <select aria-label="Records"
            value={selectedEntity}
            onChange={(e) => { setSelectedEntity(e.target.value); setPage(1); }}
            className={`${fieldClass} sm:w-44`}
          >
            <option value="ALL">All records</option>
            <option value="LEAD">Leads</option>
            <option value="PIPELINE">Pipelines</option>
            <option value="PIPELINE_STAGE">Pipeline stages</option>
            <option value="SOP_STEP">Outreach playbook steps</option>
            <option value="SOP_BRANCH">Objection strategies</option>
          </select>
        </div>
      </div>

      {/* Main Audit Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-3 px-4 w-44">When</th>
                <th className="py-3 px-4 w-48">Who</th>
                <th className="py-3 px-4 w-32">Action</th>
                <th className="hidden py-3 px-4 w-48 lg:table-cell">Record</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4 w-28 text-center"><span className="sr-only">Changes</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                    <span>Loading immutable activity logs...</span>
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-700">No activity records found matching criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Activities will appear automatically as employees add, update, delete, or connect with leads.</p>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const badge = getActionBadge(log.action_type);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{formatRelativeTime(log.created_at)}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>

                      {/* Employee */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0">
                            {log.actor_name ? log.actor_name.slice(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div className="truncate">
                            <p className="font-bold text-slate-900 leading-tight truncate">{log.actor_name}</p>
                            {log.actor_email && (
                              <span className="text-[10px] text-slate-500 block truncate">{log.actor_email}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action Type */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}>
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Target Entity */}
                      <td className="hidden py-3 px-4 lg:table-cell">
                        {log.entity_name ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 shrink-0">
                              {log.entity_type}
                            </span>
                            <span 
                              className={`font-semibold text-slate-800 truncate ${log.entity_type === 'LEAD' && log.entity_id && onSelectLead360 ? 'hover:text-teal-600 cursor-pointer underline decoration-dotted' : ''}`}
                              onClick={() => {
                                if (log.entity_type === 'LEAD' && log.entity_id && onSelectLead360) {
                                  onSelectLead360(log.entity_id);
                                }
                              }}
                              title={log.entity_name}
                            >
                              {log.entity_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">N/A ({log.entity_type})</span>
                        )}
                      </td>

                      {/* Event Details */}
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-800 leading-snug">{log.title}</p>
                        {log.description && (
                          <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-1">{log.description}</p>
                        )}
                      </td>

                      {/* Inspect / Diff Button */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLogForDetails(log)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 border border-slate-200 hover:border-teal-200 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View changes</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-bold text-slate-800">{total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> of{' '}
            <span className="font-bold text-slate-800">{total}</span> recorded events
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 font-semibold hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span>
              Page <span className="font-bold text-slate-800">{page}</span> of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 font-semibold hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Inspector Modal / Change Diff Drawer */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in-50 zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 text-teal-700 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Audit Record Inspector</h3>
                  <p className="text-[11px] text-slate-500 font-mono">ID: {selectedLogForDetails.id}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Event Headline */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {selectedLogForDetails.entity_type} • {selectedLogForDetails.action_type}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    {new Date(selectedLogForDetails.created_at).toLocaleString('en-IN')}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900">{selectedLogForDetails.title}</h4>
                {selectedLogForDetails.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">{selectedLogForDetails.description}</p>
                )}
              </div>

              {/* Actor & Security Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-xs font-medium text-slate-400 block">Actor (Employee)</span>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedLogForDetails.actor_name}</p>
                  <p className="text-slate-500 text-[11px]">{selectedLogForDetails.actor_email}</p>
                </div>

                {selectedLogForDetails.ip_address && (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-xs font-medium text-slate-400 block">Origin</span>
                    <p className="font-mono text-slate-800 mt-0.5">IP: {selectedLogForDetails.ip_address}</p>
                  </div>
                )}
              </div>

              {/* What was recorded: before → after values and the action's facts */}
              {describeEntry(selectedLogForDetails as unknown as HistoryEntry).length > 0 && (
                <div>
                  <h5 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Recorded details</span>
                  </h5>
                  <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                    {describeEntry(selectedLogForDetails as unknown as HistoryEntry).map((line, i) => (
                      <li key={i} className="p-2.5 text-slate-700 break-words">{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Additional Metadata JSON */}
              {selectedLogForDetails.metadata && Object.keys(selectedLogForDetails.metadata).length > 0 && (
                <div>
                  <h5 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    <span>Raw Context & Snapshot Metadata</span>
                  </h5>
                  <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLogForDetails.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              {selectedLogForDetails.entity_type === 'LEAD' && selectedLogForDetails.entity_id && onSelectLead360 && (
                <button
                  type="button"
                  onClick={() => {
                    const id = selectedLogForDetails.entity_id;
                    setSelectedLogForDetails(null);
                    if (id) onSelectLead360(id);
                  }}
                  className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <span>Open Lead 360 Profile</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={() => setSelectedLogForDetails(null)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
