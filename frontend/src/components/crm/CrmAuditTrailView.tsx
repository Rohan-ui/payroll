'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Download,
  PlusCircle,
  Edit3,
  Trash2,
  Zap,
  LogIn,
  LogOut,
  FileSpreadsheet,
  Layers,
  Clock,
  User,
  ExternalLink,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
  Phone,
  MessageSquare,
  Sparkles
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  action_type: 'ADD' | 'UPDATE' | 'DELETE' | 'CONNECT' | 'LOGIN' | 'LOGOUT' | 'IMPORT' | 'EXPORT';
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  title: string;
  description: string | null;
  changes_diff: Record<string, { old: any; new: any }> | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface CrmAuditTrailViewProps {
  salesPersons?: any[];
  onSelectLead360?: (leadId: string) => void;
}

export default function CrmAuditTrailView({
  salesPersons = [],
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
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      let url = `/api/v1/crm/audit-logs?limit=250`;
      if (selectedAction !== 'ALL') url += `&actionType=${encodeURIComponent(selectedAction)}`;
      if (selectedActor !== 'ALL') url += `&actorId=${encodeURIComponent(selectedActor)}`;
      if (selectedEntity !== 'ALL') url += `&entityType=${encodeURIComponent(selectedEntity)}`;
      if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery.trim())}`;

      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setLogs(json.data || []);
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
  }, [selectedAction, selectedActor, selectedEntity]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAuditLogs();
  };

  // Filtered & Paginated Logs
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(
      l =>
        l.actor_name?.toLowerCase().includes(q) ||
        l.actor_email?.toLowerCase().includes(q) ||
        l.entity_name?.toLowerCase().includes(q) ||
        l.title?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));

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
      case 'IMPORT':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />,
          label: action === 'IMPORT' ? 'Bulk Import' : 'Created'
        };
      case 'UPDATE':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: <Edit3 className="w-3.5 h-3.5 text-blue-600" />,
          label: 'Updated'
        };
      case 'DELETE':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-600" />,
          label: 'Deleted'
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
          label: action
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
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-indigo-700 text-[11px] font-bold uppercase tracking-wider mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Immutable Accountability & Compliance</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">CRM Audit Trail & Employee Activity Center</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Complete tamper-proof logging of every employee action across the entire CRM: additions, updates with field diffs, permanent deletion records, outreach connects, and login/logout sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAuditLogs}
            disabled={loading}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh Audit Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title="Export full audit trail to CSV file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit Log</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase block">Total Logged</span>
          <div className="text-xl font-black text-slate-900 mt-1">{metrics.total.toLocaleString()}</div>
          <span className="text-[10px] text-slate-400">All audit events</span>
        </div>

        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase block">Additions</span>
          <div className="text-xl font-black text-emerald-900 mt-1">{metrics.add.toLocaleString()}</div>
          <span className="text-[10px] text-emerald-600">Leads, Quotes, Tasks</span>
        </div>

        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 shadow-2xs">
          <span className="text-[11px] font-bold text-blue-700 uppercase block">Updates & Stages</span>
          <div className="text-xl font-black text-blue-900 mt-1">{metrics.update.toLocaleString()}</div>
          <span className="text-[10px] text-blue-600">Field edits & moves</span>
        </div>

        <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 shadow-2xs">
          <span className="text-[11px] font-bold text-purple-700 uppercase block">Connect Actions</span>
          <div className="text-xl font-black text-purple-900 mt-1">{metrics.connect.toLocaleString()}</div>
          <span className="text-[10px] text-purple-600">Calls, WhatsApp, Cadence</span>
        </div>

        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-700 uppercase block">User Sessions</span>
          <div className="text-xl font-black text-amber-900 mt-1">{metrics.session.toLocaleString()}</div>
          <span className="text-[10px] text-amber-600">Logins & logouts</span>
        </div>

        <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100 shadow-2xs">
          <span className="text-[11px] font-bold text-rose-700 uppercase block">Deletions</span>
          <div className="text-xl font-black text-rose-900 mt-1">{metrics.delete.toLocaleString()}</div>
          <span className="text-[10px] text-rose-600">Permanently preserved</span>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by employee name, lead company, title, or action..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 focus:bg-white text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </form>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action Type */}
          <select
            value={selectedAction}
            onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">⚡ All Action Types</option>
            <option value="ADD">➕ Created (ADD)</option>
            <option value="UPDATE">✏️ Updated (UPDATE)</option>
            <option value="DELETE">🗑️ Deleted (DELETE)</option>
            <option value="CONNECT">📞 Connected (Calls/WhatsApp)</option>
            <option value="LOGIN">🔑 Logins</option>
            <option value="LOGOUT">🚪 Logouts</option>
            <option value="IMPORT">📥 Imports</option>
            <option value="EXPORT">📤 Exports</option>
          </select>

          {/* Actor / Employee */}
          <select
            value={selectedActor}
            onChange={(e) => { setSelectedActor(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">👤 All Employees</option>
            {salesPersons.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.first_name} {sp.last_name} ({sp.designation || 'Sales'})
              </option>
            ))}
          </select>

          {/* Entity Type */}
          <select
            value={selectedEntity}
            onChange={(e) => { setSelectedEntity(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 bg-slate-50 text-xs border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
          >
            <option value="ALL">📂 All Entities</option>
            <option value="LEAD">🎯 Leads</option>
            <option value="QUOTATION">📄 Quotations</option>
            <option value="CADENCE">🚀 Cadence Outreach</option>
            <option value="MEETING">📅 Meetings / Tasks</option>
            <option value="AUTH">🔐 Authentication Sessions</option>
          </select>
        </div>
      </div>

      {/* Main Audit Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-44">Timestamp</th>
                <th className="py-3 px-4 w-48">Employee / User</th>
                <th className="py-3 px-4 w-32">Action</th>
                <th className="py-3 px-4 w-48">Target Entity</th>
                <th className="py-3 px-4">Event Details & Description</th>
                <th className="py-3 px-4 w-28 text-center">Audit Inspector</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
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
                            <span className="text-[10px] text-indigo-600 font-semibold block truncate">
                              {log.actor_role || 'User'}
                            </span>
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
                      <td className="py-3 px-4">
                        {log.entity_name ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 shrink-0">
                              {log.entity_type}
                            </span>
                            <span 
                              className={`font-semibold text-slate-800 truncate ${log.entity_type === 'LEAD' && log.entity_id && onSelectLead360 ? 'hover:text-blue-600 cursor-pointer underline decoration-dotted' : ''}`}
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
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 hover:border-indigo-200 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
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
            Showing <span className="font-bold text-slate-800">{paginatedLogs.length}</span> of{' '}
            <span className="font-bold text-slate-800">{filteredLogs.length}</span> recorded events
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
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in-50 zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Audit Record Inspector</h3>
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
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Actor (Employee)</span>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedLogForDetails.actor_name}</p>
                  <p className="text-slate-500 text-[11px]">{selectedLogForDetails.actor_email}</p>
                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded">
                    Role: {selectedLogForDetails.actor_role || 'STAFF'}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Security & Origin</span>
                  <p className="font-mono text-slate-800 mt-0.5">IP: {selectedLogForDetails.ip_address || '127.0.0.1'}</p>
                  <p className="text-slate-400 text-[10px] truncate mt-1" title={selectedLogForDetails.user_agent || ''}>
                    Agent: {selectedLogForDetails.user_agent || 'Web Client'}
                  </p>
                </div>
              </div>

              {/* Before vs After Field Diff */}
              {selectedLogForDetails.changes_diff && Object.keys(selectedLogForDetails.changes_diff).length > 0 && (
                <div>
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tracked Field Changes (Diff)</span>
                  </h5>
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                    <div className="grid grid-cols-3 bg-slate-100/80 p-2 text-[11px] font-bold text-slate-600 uppercase">
                      <span>Field</span>
                      <span className="text-rose-700">Previous Value</span>
                      <span className="text-emerald-700">Updated Value</span>
                    </div>
                    {Object.entries(selectedLogForDetails.changes_diff).map(([key, change]) => (
                      <div key={key} className="grid grid-cols-3 p-2.5 items-center hover:bg-slate-50">
                        <span className="font-semibold text-slate-800 font-mono text-[11px]">{key}</span>
                        <span className="text-rose-600 line-through truncate text-[11px]">
                          {change.old !== null && change.old !== undefined ? String(change.old) : '<empty>'}
                        </span>
                        <span className="text-emerald-700 font-bold truncate text-[11px]">
                          {change.new !== null && change.new !== undefined ? String(change.new) : '<empty>'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Metadata JSON */}
              {selectedLogForDetails.metadata && Object.keys(selectedLogForDetails.metadata).length > 0 && (
                <div>
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
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
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
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
