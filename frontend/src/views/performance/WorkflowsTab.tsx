import React, { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { workflowsApi, type LibraryStatus, type WorkflowSummary } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';
import { ListState, Pager, StatusTabs, DeleteDialog, usePagedList } from './performance-format';
import { DuplicateDialog } from './DuplicateDialog';
import { WorkflowEditor } from './WorkflowEditor';

/** “Self-assessment → Manager review + Peer review → HR approval”: steps in order, side-by-side stages joined. */
const flowText = (stages: { name: string; step: number }[]) => {
  const steps = new Map<number, string[]>();
  stages.forEach((s) => steps.set(s.step, [...(steps.get(s.step) ?? []), s.name]));
  return [...steps.entries()].sort(([x], [y]) => x - y).map(([, names]) => names.join(' + ')).join(' → ');
};
const forText = (a: WorkflowSummary['appliesTo']) => (a.all ? 'Everyone' : [...a.departments, ...a.designations].join(', '));

/** Review workflows: who reviews whom, how many, and in what order. */
export const WorkflowsTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.workflows.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('ACTIVE');
  const [pageNumber, setPageNumber] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [copying, setCopying] = useState<WorkflowSummary | null>(null);
  const [deleting, setDeleting] = useState<WorkflowSummary | null>(null);
  const { page, error, loading, reload } = usePagedList(workflowsApi.list, { search: search.trim(), status, page: pageNumber });

  if (editing) return <WorkflowEditor workflowId={editing === 'new' ? null : editing} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />;

  const toggle = async (w: WorkflowSummary) => {
    try {
      await (w.status === 'ACTIVE' ? workflowsApi.archive(w.id) : workflowsApi.restore(w.id));
      toast.success(w.status === 'ACTIVE' ? `${w.workflowCode} archived` : `${w.workflowCode} restored`);
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const items = page?.items ?? [];
  return (
    <section className={cardClass} aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <div>
          <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Review workflows</h2>
          <p className="text-xs text-slate-500">Who reviews whom, how many, in what order, and what each reviewer may do.</p>
        </div>
        {manage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />New workflow</Button>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-3">
        <label className="sr-only" htmlFor={`${id}-search`}>Search workflows</label>
        <input id={`${id}-search`} type="search" className={`${fieldClass} max-w-xs`} placeholder="Search by name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <StatusTabs value={status} counts={page?.counts} noun="workflows" onChange={(next) => { setStatus(next); setPageNumber(1); }} />
      </div>
      <ListState loading={loading} error={error} empty={items.length === 0} what="Workflows" onRetry={reload}
        emptyTitle={search || status !== 'ACTIVE' ? 'No workflows match' : 'No review workflows yet'}
        emptyText={search || status !== 'ACTIVE' ? 'Try another search or status.' : 'Create the path an appraisal follows, such as a self-assessment, then the manager and peers, then HR approval.'} />
      {items.length > 0 && (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Workflow</th>
                <th scope="col" className={thClass}>For</th>
                <th scope="col" className={thClass}>Stages</th>
                <th scope="col" className={thClass}>Version</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {items.map((w) => (
                <tr key={w.id} className={w.status === 'ARCHIVED' ? 'opacity-60' : undefined}>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{w.workflowCode}</span>
                    <span className="block break-words text-slate-700 dark:text-slate-300">{w.workflowName}</span>
                    {w.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                  </td>
                  <td className={`${tdClass} max-w-[14rem] text-xs text-slate-600 dark:text-slate-400`}>{forText(w.appliesTo)}</td>
                  <td className={`${tdClass} max-w-[22rem] text-xs text-slate-600 dark:text-slate-400`}>{w.currentVersion ? flowText(w.currentVersion.stages) : '—'}</td>
                  <td className={tdClass}>
                    {w.currentVersion ? <Badge size="sm" variant="success">Version {w.currentVersion.number}</Badge> : <Badge size="sm" variant="warning">Not published</Badge>}
                    {w.draft && <span className="mt-1 block text-xs text-slate-500">Draft of version {w.draft.number}</span>}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(w.id)} aria-label={`${manage && w.status === 'ACTIVE' ? 'Edit' : 'View'} ${w.workflowCode}`}>{manage && w.status === 'ACTIVE' ? 'Edit' : 'View'}</Button>
                    {manage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setCopying(w)} aria-label={`Duplicate ${w.workflowCode}`}>Duplicate</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(w)} aria-label={`${w.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${w.workflowCode}`}>{w.status === 'ACTIVE' ? 'Archive' : 'Restore'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(w)} aria-label={`Delete ${w.workflowCode}`}>Delete</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page && <Pager page={page} onPage={setPageNumber} noun="workflows" />}
      {copying && (
        <DuplicateDialog what="workflow" code={copying.workflowCode} name={copying.workflowName} onClose={() => setCopying(null)}
          onCopy={async (code, name) => { const copy = await workflowsApi.duplicate(copying.id, code, name); toast.success(`${copy.workflowCode} created as a draft`); setCopying(null); setEditing(copy.id); }} />
      )}
      {deleting && (
        <DeleteDialog what="workflow" code={deleting.workflowCode} name={deleting.workflowName} onClose={() => setDeleting(null)}
          onDelete={async () => { await workflowsApi.remove(deleting.id); toast.success(`${deleting.workflowCode} deleted`); setDeleting(null); reload(); }} />
      )}
    </section>
  );
};
