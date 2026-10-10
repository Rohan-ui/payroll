import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { EnrollDialog } from '../../views/emails/drip/EnrollDialog';
import { toast } from '../../lib/toast';
import { ApiError } from '../../api/client';
import {
  leadManagementApi,
  type Assignee,
  type LeadFilters,
  type LeadQuery,
  type LeadSort,
  type LeadStatus,
  type ManagedLead,
} from '../../api/leadManagement.api';

interface Props {
  /** Opens the lead's 360° details. */
  onOpenLead: (leadId: string) => void;
  /** Opens the lead's details straight into editing. */
  onEditLead: (leadId: string) => void;
  /** Called after leads change owner or are deleted, so the rest of the CRM reloads. */
  onAssigned?: () => void;
}

const PAGE_SIZE = 25;
/** Leads per page the table offers; the server serves at most 100. */
const PAGE_SIZES = [25, 50, 100];
const EMPTY_QUERY: LeadQuery = { page: 1, limit: PAGE_SIZE, search: '', assigneeId: '', pipelineId: '', stageId: '', sourceId: '', status: '', sort: 'created_at', direction: 'desc' };
const STATUS_LABEL: Record<LeadStatus, { label: string; variant: 'info' | 'success' | 'danger' }> = {
  OPEN: { label: 'Open', variant: 'info' },
  WON: { label: 'Won', variant: 'success' },
  LOST: { label: 'Lost', variant: 'danger' },
};
const fieldClass = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] focus:outline-none focus:ring-2 focus:ring-blue-500';
const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';
const dangerActionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50 dark:bg-transparent dark:text-red-300 dark:border-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50';
const primaryClass = 'px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50';
const date = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * CRM → Lead Management: the leads this member may see (every lead of the
 * workspace with leads.view_all, otherwise those assigned to them) in one table, searched,
 * filtered, sorted and paged by the server, with bulk assignment to a team
 * member. Assignment is all or nothing and checked by the server; the table
 * and the rest of the CRM reload from the server afterwards.
 */
export const LeadManagementView: React.FC<Props> = ({ onOpenLead, onEditLead, onAssigned }) => {
  const ids = useId();
  const { can } = useAuth();
  const canAssign = can('leads.update');
  const canDelete = can('leads.delete');
  const canEnroll = can('sequences.enroll_bulk');
  const canSelect = canAssign || canDelete || canEnroll;
  // Without leads.view_all the server lists only the leads assigned to this member.
  const seesAll = can('leads.view_all');
  const [query, setQuery] = useState<LeadQuery>(EMPTY_QUERY);
  const [searchText, setSearchText] = useState('');
  const [rows, setRows] = useState<ManagedLead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<LeadFilters>({ stages: [], pipelines: [], sources: [] });
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Selected leads, kept across pages, with what the confirmation needs to know about each. */
  const [selected, setSelected] = useState<Map<string, ManagedLead>>(new Map());
  const [dialog, setDialog] = useState<'assign' | 'unassign' | 'delete' | 'sequence' | null>(null);
  const request = useRef(0);

  const load = useCallback(() => {
    const mine = ++request.current;
    setLoading(true);
    setError(null);
    leadManagementApi
      .list(query)
      .then((result) => {
        if (mine !== request.current) return;
        setRows(result.items);
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
        setFilters(result.filters);
      })
      .catch((e: Error) => mine === request.current && setError(e.message))
      .finally(() => mine === request.current && setLoading(false));
  }, [query]);
  useEffect(load, [load]);

  const loadAssignees = useCallback(() => {
    leadManagementApi.assignees().then(setAssignees).catch(() => setAssignees([]));
  }, []);
  useEffect(loadAssignees, [loadAssignees]);

  // Search as you type, a moment after the last keystroke.
  useEffect(() => {
    if (searchText === (query.search ?? '')) return;
    const timer = window.setTimeout(() => changeQuery({ search: searchText }), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  /** A new search or filter starts from page 1 and clears the selection, so hidden leads are never assigned by accident. */
  const changeQuery = (change: Partial<LeadQuery>) => {
    setQuery((q) => ({ ...q, ...change, page: 1 }));
    setSelected(new Map());
  };
  const changePage = (page: number) => setQuery((q) => ({ ...q, page }));
  const sortBy = (sort: LeadSort) =>
    setQuery((q) => ({ ...q, sort, direction: q.sort === sort && q.direction === 'desc' ? 'asc' : q.sort === sort ? 'desc' : sort === 'created_at' || sort === 'updated_at' ? 'desc' : 'asc', page: 1 }));

  const stagesShown = useMemo(() => filters.stages.filter((s) => !query.pipelineId || s.pipeline_id === query.pipelineId), [filters.stages, query.pipelineId]);
  const filtered = Boolean(query.search || query.assigneeId || query.pipelineId || query.stageId || query.sourceId || query.status);
  const pageIds = rows?.map((r) => r.id) ?? [];
  const pageSelected = pageIds.filter((id) => selected.has(id)).length;

  const toggle = (lead: ManagedLead) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(lead.id)) next.delete(lead.id);
      else next.set(lead.id, lead);
      return next;
    });
  const togglePage = () =>
    setSelected((current) => {
      const next = new Map(current);
      if (pageSelected === pageIds.length) pageIds.forEach((id) => next.delete(id));
      else rows?.forEach((r) => next.set(r.id, r));
      return next;
    });

  const afterAssign = (message: string) => {
    toast.success(message);
    setDialog(null);
    setSelected(new Map());
    load();
    loadAssignees();
    onAssigned?.();
  };

  const sortHeader = (sort: LeadSort, label: string) => {
    const active = query.sort === sort;
    const Icon = !active ? ChevronsUpDown : query.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (query.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="py-3 px-3 whitespace-nowrap">
        <button type="button" onClick={() => sortBy(sort)} className="inline-flex items-center gap-1 font-bold uppercase hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
          {label}
          <Icon className="w-3 h-3" aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Lead Management</h2>
          <p className="text-sm text-slate-500" role="status">{loading && rows === null ? 'Loading leads…' : `${plural(total, 'lead')}${filtered ? ' match these filters' : seesAll ? ' in this workspace' : ' assigned to you'}`}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
        <div className="relative lg:col-span-2">
          <label htmlFor={`${ids}-search`} className="sr-only">Search leads</label>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id={`${ids}-search`} value={searchText} onChange={(e) => setSearchText(e.target.value)} maxLength={160} placeholder="Search name, company, email or phone" className={`${fieldClass} pl-9`} />
        </div>
        {seesAll && (
          <Filter id={`${ids}-assignee`} label="Assignee" value={query.assigneeId ?? ''} onChange={(v) => changeQuery({ assigneeId: v })}>
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Filter>
        )}
        <Filter id={`${ids}-pipeline`} label="Pipeline" value={query.pipelineId ?? ''} onChange={(v) => changeQuery({ pipelineId: v, stageId: '' })}>
          <option value="">All pipelines</option>
          {filters.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Filter>
        <Filter id={`${ids}-stage`} label="Stage" value={query.stageId ?? ''} onChange={(v) => changeQuery({ stageId: v })}>
          <option value="">All stages</option>
          {stagesShown.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Filter>
        <Filter id={`${ids}-status`} label="Status" value={query.status ?? ''} onChange={(v) => changeQuery({ status: v as LeadStatus | '' })}>
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </Filter>
        <Filter id={`${ids}-source`} label="Source" value={query.sourceId ?? ''} onChange={(v) => changeQuery({ sourceId: v })}>
          <option value="">All sources</option>
          {filters.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Filter>
        {filtered && (
          <button type="button" onClick={() => { setSearchText(''); changeQuery({ ...EMPTY_QUERY, sort: query.sort, direction: query.direction }); }} className={`${actionClass} lg:col-start-6`}>
            Clear filters
          </button>
        )}
      </div>

      {canSelect && selected.size > 0 && (
        <div role="region" aria-label="Selected leads" className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-900">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            {plural(selected.size, 'lead')} selected{selected.size > pageSelected ? ` (${selected.size - pageSelected} on other pages)` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {canAssign && <button type="button" onClick={() => setDialog('assign')} className={primaryClass}>Assign Leads</button>}
            {canAssign && seesAll && <button type="button" onClick={() => setDialog('unassign')} className={actionClass}>Unassign</button>}
            {canEnroll && <button type="button" onClick={() => setDialog('sequence')} className={actionClass}>Add to drip sequence</button>}
            {canDelete && <button type="button" onClick={() => setDialog('delete')} className={dangerActionClass}>Delete leads</button>}
            <button type="button" onClick={() => setSelected(new Map())} className={actionClass}>Clear selection</button>
          </div>
        </div>
      )}

      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The leads could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="h-64 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true" />
      ) : rows.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{filtered ? 'No leads match these filters' : 'No leads yet'}</p>
          <p className="mt-1 text-sm text-slate-500">{filtered ? 'Change or clear the filters to see more leads.' : 'Leads added in Sales Pipelines or Client Outreach appear here.'}</p>
        </div>
      ) : (
        <div className={`rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <table className="w-full min-w-[1100px] text-left text-sm">
            <caption className="sr-only">Leads</caption>
            <thead className="bg-slate-50 dark:bg-white/5 text-[11px] text-slate-500 tracking-wide">
              <tr>
                {canSelect && (
                  <th scope="col" className="py-3 px-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all leads on this page"
                      checked={pageIds.length > 0 && pageSelected === pageIds.length}
                      ref={(el) => { if (el) el.indeterminate = pageSelected > 0 && pageSelected < pageIds.length; }}
                      onChange={togglePage}
                    />
                  </th>
                )}
                {sortHeader('lead_name', 'Lead')}
                {sortHeader('company_name', 'Company')}
                <th scope="col" className="py-3 px-3 font-bold uppercase">Email</th>
                <th scope="col" className="py-3 px-3 font-bold uppercase">Phone</th>
                <th scope="col" className="py-3 px-3 font-bold uppercase">Source</th>
                {sortHeader('stage', 'Stage')}
                <th scope="col" className="py-3 px-3 font-bold uppercase">Assignee</th>
                <th scope="col" className="py-3 px-3 font-bold uppercase">Status</th>
                {sortHeader('created_at', 'Created')}
                {sortHeader('updated_at', 'Updated')}
                <th scope="col" className="py-3 px-3 font-bold uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {rows.map((lead) => (
                <tr key={lead.id} className={selected.has(lead.id) ? 'bg-blue-50/60 dark:bg-blue-950/20' : 'hover:bg-slate-50/70 dark:hover:bg-white/5'}>
                  {canSelect && (
                    <td className="py-2.5 px-3">
                      <input type="checkbox" aria-label={`Select ${lead.name}, ${lead.companyName}`} checked={selected.has(lead.id)} onChange={() => toggle(lead)} />
                    </td>
                  )}
                  <td className="py-2.5 px-3">
                    <button type="button" onClick={() => onOpenLead(lead.id)} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-700 hover:underline text-left">{lead.name}</button>
                    <span className="block text-[11px] text-slate-500">{lead.leadCode}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 max-w-[200px] break-words">{lead.companyName}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 break-all">{lead.email}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lead.phone ?? '—'}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{lead.source?.name ?? '—'}</td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: lead.stage?.color ?? '#94a3b8' }} aria-hidden="true" />
                      {lead.stage?.name ?? '—'}
                    </span>
                    {lead.pipeline && <span className="block text-[11px] text-slate-500">{lead.pipeline.name}</span>}
                  </td>
                  <td className="py-2.5 px-3">{lead.assignee ? lead.assignee.name : <span className="text-slate-500 italic">Unassigned</span>}</td>
                  <td className="py-2.5 px-3"><Badge variant={STATUS_LABEL[lead.status].variant} size="sm">{STATUS_LABEL[lead.status].label}</Badge></td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{date(lead.createdAt)}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{date(lead.updatedAt)}</td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => onOpenLead(lead.id)} className={actionClass} aria-label={`View ${lead.name}`}>View</button>{' '}
                    {canAssign && <button type="button" onClick={() => onEditLead(lead.id)} className={actionClass} aria-label={`Edit ${lead.name}`}>Edit</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length > 0 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span>Page {query.page} of {totalPages}</span>
            <label htmlFor={`${ids}-page-size`} className="flex items-center gap-2">
              <span>Leads per page</span>
              <select id={`${ids}-page-size`} value={query.limit} onChange={(e) => changeQuery({ limit: Number(e.target.value) })}
                className="h-8 px-2 text-sm rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={query.page <= 1 || loading} onClick={() => changePage(query.page - 1)} className={actionClass}>Previous</button>
            <button type="button" disabled={query.page >= totalPages || loading} onClick={() => changePage(query.page + 1)} className={actionClass}>Next</button>
          </div>
        </nav>
      )}

      {dialog === 'assign' && <AssignDialog selected={[...selected.values()]} assignees={assignees} onClose={() => setDialog(null)} onDone={afterAssign} />}
      {dialog === 'unassign' && <UnassignDialog selected={[...selected.values()]} onClose={() => setDialog(null)} onDone={afterAssign} />}
      {dialog === 'delete' && <DeleteDialog selected={[...selected.values()]} onClose={() => setDialog(null)} onDone={afterAssign} />}
      {dialog === 'sequence' && <EnrollDialog leadIds={[...selected.keys()]} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setSelected(new Map()); }} />}
    </div>
  );
};

const Filter: React.FC<{ id: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }> = ({ id, label, value, onChange, children }) => (
  <div>
    <label htmlFor={id} className="sr-only">{label}</label>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>{children}</select>
  </div>
);

/** A refused assignment in words, naming the leads the server could not use. */
function failureText(error: unknown, selected: ManagedLead[]) {
  if (!(error instanceof Error)) return 'The leads could not be assigned. Nothing was changed.';
  const failed: string[] = error instanceof ApiError ? error.data?.errors?.failedLeadIds ?? [] : [];
  const names = failed.flatMap((id) => selected.filter((lead) => lead.id === id).map((lead) => `${lead.name} (${lead.companyName})`));
  return names.length ? `${error.message} Not available: ${names.join(', ')}.` : error.message;
}

const AssignDialog: React.FC<{ selected: ManagedLead[]; assignees: Assignee[]; onClose: () => void; onDone: (message: string) => void }> = ({ selected, assignees, onClose, onDone }) => {
  const ids = useId();
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Assignee | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = assignees.filter((a) => `${a.name} ${a.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  const replacing = chosen ? selected.filter((lead) => lead.assignee && lead.assignee.id !== chosen.id).length : 0;
  const already = chosen ? selected.filter((lead) => lead.assignee?.id === chosen.id).length : 0;

  const confirm = async () => {
    if (!chosen || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await leadManagementApi.assign(selected.map((lead) => lead.id), chosen.id);
      onDone(result.message);
    } catch (e) {
      setError(failureText(e, selected));
      setSaving(false);
    }
  };

  if (confirming && chosen) {
    return (
      <Dialog
        title="Confirm assignment"
        size="sm"
        onClose={onClose}
        footer={
          <>
            <button type="button" onClick={() => setConfirming(false)} disabled={saving} className={actionClass}>Back</button>
            <button type="button" onClick={onClose} disabled={saving} className={actionClass}>Cancel</button>
            <button type="button" onClick={confirm} disabled={saving} className={primaryClass}>{saving ? 'Assigning…' : 'Confirm Assignment'}</button>
          </>
        }
      >
        {error && <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
        <p className="text-sm text-slate-800 dark:text-slate-200">
          You’re assigning <strong>{plural(selected.length, 'lead')}</strong> to <strong>{chosen.name}</strong>.
          {replacing > 0 && <> {replacing === selected.length ? 'Their existing assignments will be replaced.' : `${plural(replacing, 'lead')} already assigned to someone else will be reassigned.`}</>}
        </p>
        {already > 0 && <p className="mt-2 text-xs text-slate-600">{plural(already, 'lead')} {already === 1 ? 'is' : 'are'} already assigned to {chosen.name} and stay{already === 1 ? 's' : ''} as {already === 1 ? 'it is' : 'they are'}.</p>}
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Assign leads"
      description={`${plural(selected.length, 'lead')} selected. Choose the team member to assign them to.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>Cancel</button>
          <button type="button" onClick={() => setConfirming(true)} disabled={!chosen} className={primaryClass}>Continue</button>
        </>
      }
    >
      <label htmlFor={`${ids}-find`} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Team member</label>
      <input id={`${ids}-find`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className={fieldClass} autoComplete="off" />
      <fieldset className="mt-3">
        <legend className="sr-only">Team members</legend>
        {assignees.length === 0 ? (
          <p className="text-sm text-slate-500">No team members found in this workspace.</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-slate-500">No team member matches “{search}”.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2B293E] rounded-lg border border-slate-200 dark:border-[#2B293E]">
            {matches.map((a) => (
              <li key={a.id}>
                <label className={`flex items-center gap-3 px-3 py-2 text-sm ${a.eligible ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5' : 'opacity-60'}`}>
                  <input type="radio" name={`${ids}-assignee`} value={a.id} disabled={!a.eligible} checked={chosen?.id === a.id} onChange={() => setChosen(a)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900 dark:text-slate-100">{a.name}</span>
                    <span className="block text-xs text-slate-500 break-all">{a.email}</span>
                  </span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{a.eligible ? plural(a.leadsCount, 'lead') : 'Can’t view leads'}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </Dialog>
  );
};

const UnassignDialog: React.FC<{ selected: ManagedLead[]; onClose: () => void; onDone: (message: string) => void }> = ({ selected, onClose, onDone }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      onDone((await leadManagementApi.assign(selected.map((lead) => lead.id), null)).message);
    } catch (e) {
      setError(failureText(e, selected));
      setSaving(false);
    }
  };
  return (
    <Dialog
      title={`Unassign ${plural(selected.length, 'lead')}?`}
      description="They will have no assignee until someone is assigned again."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={actionClass}>Cancel</button>
          <button type="button" onClick={confirm} disabled={saving} className={primaryClass}>{saving ? 'Unassigning…' : 'Unassign leads'}</button>
        </>
      }
    >
      {error && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      <p className="text-sm text-slate-700 dark:text-slate-300">{plural(selected.filter((l) => l.assignee).length, 'lead')} currently assigned will lose their assignee.</p>
    </Dialog>
  );
};

/** Deletes the selected leads after a confirmation that says exactly what goes; all or none. */
const DeleteDialog: React.FC<{ selected: ManagedLead[]; onClose: () => void; onDone: (message: string) => void }> = ({ selected, onClose, onDone }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      onDone((await leadManagementApi.deleteLeads(selected.map((lead) => lead.id))).message);
    } catch (e) {
      setError(e instanceof Error ? failureText(e, selected) : 'The leads could not be deleted. Nothing was changed.');
      setSaving(false);
    }
  };
  const shown = selected.slice(0, 5);
  return (
    <Dialog
      title={`Delete ${plural(selected.length, 'lead')}?`}
      description="This permanently deletes them, with their activity, follow-ups and meetings. It cannot be undone; the deletion stays in the audit trail."
      size="sm"
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={actionClass}>Cancel</button>
          <button type="button" onClick={confirm} disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50">
            {saving ? 'Deleting…' : `Delete ${plural(selected.length, 'lead')}`}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
      <ul className="text-sm text-slate-700 dark:text-slate-300 list-disc pl-5 space-y-0.5">
        {shown.map((lead) => <li key={lead.id}>{`${lead.companyName}${lead.name ? ` — ${lead.name}` : ''}`}</li>)}
      </ul>
      {selected.length > shown.length && <p className="mt-1 text-sm text-slate-500">{`and ${plural(selected.length - shown.length, 'more lead')}`}</p>}
      <p className="mt-3 text-xs text-slate-500">Leads with quotations cannot be deleted; if any are selected, nothing is deleted and they are named.</p>
    </Dialog>
  );
};
