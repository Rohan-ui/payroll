import React, { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { kpisApi, type KpiSummary, type LibraryStatus } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';
import { DIRECTION, MEASUREMENT, ListState, Pager, StatusTabs, DeleteDialog, usePagedList, withUnit } from './performance-format';
import { DuplicateDialog } from './DuplicateDialog';
import { KpiEditor } from './KpiEditor';

/** The KPI library: what can be measured, shared by every KRA that suggests it. */
export const KpiLibraryTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.library.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('ACTIVE');
  const [pageNumber, setPageNumber] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [copying, setCopying] = useState<KpiSummary | null>(null);
  const [deleting, setDeleting] = useState<KpiSummary | null>(null);
  const { page, error, loading, reload } = usePagedList(kpisApi.list, { search: search.trim(), status, page: pageNumber });

  if (editing) return <KpiEditor kpiId={editing === 'new' ? null : editing} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />;

  const toggle = async (k: KpiSummary) => {
    try {
      await (k.status === 'ACTIVE' ? kpisApi.archive(k.id) : kpisApi.restore(k.id));
      toast.success(k.status === 'ACTIVE' ? `${k.kpiCode} archived: it can’t be added to KRAs` : `${k.kpiCode} restored`);
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
          <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">KPI library</h2>
          <p className="text-xs text-slate-500">What is measured and how. One KPI can be suggested by several KRAs.</p>
        </div>
        {manage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />New KPI</Button>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-3">
        <label className="sr-only" htmlFor={`${id}-search`}>Search KPIs</label>
        <input id={`${id}-search`} type="search" className={`${fieldClass} max-w-xs`} placeholder="Search by name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <StatusTabs value={status} counts={page?.counts} noun="KPIs" onChange={(next) => { setStatus(next); setPageNumber(1); }} />
      </div>
      <ListState loading={loading} error={error} empty={items.length === 0} what="KPIs" onRetry={reload}
        emptyTitle={search || status !== 'ACTIVE' ? 'No KPIs match' : 'No KPIs yet'}
        emptyText={search || status !== 'ACTIVE' ? 'Try another search or status.' : 'Create the measures your teams are reviewed on, such as revenue achievement or defect rate. Then add them to KRAs.'} />
      {items.length > 0 && (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>KPI</th>
                <th scope="col" className={thClass}>Measured as</th>
                <th scope="col" className={`${thClass} text-right`}>Target</th>
                <th scope="col" className={`${thClass} text-right`}>Max marks</th>
                <th scope="col" className={thClass}>Used by</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {items.map((k) => (
                <tr key={k.id} className={k.status === 'ARCHIVED' ? 'opacity-60' : undefined}>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{k.kpiCode}</span>
                    <span className="block break-words text-slate-700 dark:text-slate-300">{k.kpiName}</span>
                    {k.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                  </td>
                  <td className={tdClass}>
                    {MEASUREMENT[k.measurementType].label}
                    <span className="block text-xs text-slate-500">{k.ratingScaleName ?? (k.direction === 'NOT_APPLICABLE' ? '' : DIRECTION[k.direction])}</span>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{withUnit(k.defaultTarget, k.unitLabel, k.currencyCode)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{k.defaultMaxMarks ?? '—'}</td>
                  <td className={`${tdClass} text-xs text-slate-600 dark:text-slate-400`}>{k.kraCount ? `${k.kraCount} KRA${k.kraCount === 1 ? '' : 's'}` : 'No KRA yet'}</td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(k.id)} aria-label={`${manage && k.status === 'ACTIVE' ? 'Edit' : 'View'} ${k.kpiCode}`}>{manage && k.status === 'ACTIVE' ? 'Edit' : 'View'}</Button>
                    {manage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setCopying(k)} aria-label={`Duplicate ${k.kpiCode}`}>Duplicate</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(k)} aria-label={`${k.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${k.kpiCode}`}>{k.status === 'ACTIVE' ? 'Archive' : 'Restore'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(k)} aria-label={`Delete ${k.kpiCode}`}>Delete</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page && <Pager page={page} onPage={setPageNumber} noun="KPIs" />}
      {copying && (
        <DuplicateDialog what="KPI" code={copying.kpiCode} name={copying.kpiName} onClose={() => setCopying(null)}
          onCopy={async (code, name) => { const copy = await kpisApi.duplicate(copying.id, code, name); toast.success(`${copy.kpiCode} created`); setCopying(null); setEditing(copy.id); }} />
      )}
      {deleting && (
        <DeleteDialog what="KPI" code={deleting.kpiCode} name={deleting.kpiName} onClose={() => setDeleting(null)}
          onDelete={async () => { await kpisApi.remove(deleting.id); toast.success(`${deleting.kpiCode} deleted`); setDeleting(null); reload(); }} />
      )}
    </section>
  );
};
