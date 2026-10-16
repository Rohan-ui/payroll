import React, { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { ratingScalesApi, type LibraryStatus, type RatingScaleSummary } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';
import { INPUT_KIND, ListState, Pager, StatusTabs, DeleteDialog, usePagedList } from './performance-format';
import { RatingScaleEditor } from './RatingScaleEditor';

const rangeText = (v: NonNullable<RatingScaleSummary['currentVersion']>) => {
  if (v.inputKind === 'LEVELS') return `${v.levelCount} levels, ${v.minValue}–${v.maxValue}`;
  if (v.inputKind === 'RANGE') return `${v.minValue}–${v.maxValue}${v.unitLabel ? ` ${v.unitLabel}` : ''}`;
  return 'Up to each item’s maximum marks';
};

/** Rating scales: how reviewers rate and how ratings become scores, versioned. */
export const RatingScalesTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.scales.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('ACTIVE');
  const [pageNumber, setPageNumber] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RatingScaleSummary | null>(null);
  const { page, error, loading, reload } = usePagedList(ratingScalesApi.list, { search: search.trim(), status, page: pageNumber });

  if (editing) return <RatingScaleEditor scaleId={editing === 'new' ? null : editing} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />;

  const toggle = async (s: RatingScaleSummary) => {
    try {
      await (s.status === 'ACTIVE' ? ratingScalesApi.archive(s.id) : ratingScalesApi.restore(s.id));
      toast.success(s.status === 'ACTIVE' ? `${s.scaleCode} archived` : `${s.scaleCode} restored`);
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
          <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Rating scales</h2>
          <p className="text-xs text-slate-500">How reviewers rate and how a rating becomes a score. Appraisals keep the version they started with.</p>
        </div>
        {manage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />New rating scale</Button>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-3">
        <label className="sr-only" htmlFor={`${id}-search`}>Search rating scales</label>
        <input id={`${id}-search`} type="search" className={`${fieldClass} max-w-xs`} placeholder="Search by name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <StatusTabs value={status} counts={page?.counts} noun="rating scales" onChange={(next) => { setStatus(next); setPageNumber(1); }} />
      </div>
      <ListState loading={loading} error={error} empty={items.length === 0} what="Rating scales" onRetry={reload}
        emptyTitle={search || status !== 'ACTIVE' ? 'No rating scales match' : 'No rating scales yet'}
        emptyText={search || status !== 'ACTIVE' ? 'Try another search or status.' : 'Create the scales reviewers rate on, such as a five-point scale or a percentage, and publish them before using them in KRAs and KPIs.'} />
      {items.length > 0 && (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Scale</th>
                <th scope="col" className={thClass}>Raters give</th>
                <th scope="col" className={thClass}>Range</th>
                <th scope="col" className={thClass}>Version</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {items.map((s) => (
                <tr key={s.id} className={s.status === 'ARCHIVED' ? 'opacity-60' : undefined}>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{s.scaleCode}</span>
                    <span className="block break-words text-slate-700 dark:text-slate-300">{s.scaleName}</span>
                    {s.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                  </td>
                  <td className={tdClass}>{s.currentVersion ? INPUT_KIND[s.currentVersion.inputKind].label : '—'}</td>
                  <td className={`${tdClass} text-xs text-slate-600 dark:text-slate-400`}>{s.currentVersion ? rangeText(s.currentVersion) : '—'}</td>
                  <td className={tdClass}>
                    {s.currentVersion ? <Badge size="sm" variant="success">Version {s.currentVersion.number}</Badge> : <Badge size="sm" variant="warning">Not published</Badge>}
                    {s.draft && <span className="mt-1 block text-xs text-slate-500">Draft of version {s.draft.number}</span>}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s.id)} aria-label={`${manage && s.status === 'ACTIVE' ? 'Edit' : 'View'} ${s.scaleCode}`}>{manage && s.status === 'ACTIVE' ? 'Edit' : 'View'}</Button>
                    {manage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => toggle(s)} aria-label={`${s.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${s.scaleCode}`}>{s.status === 'ACTIVE' ? 'Archive' : 'Restore'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(s)} aria-label={`Delete ${s.scaleCode}`}>Delete</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page && <Pager page={page} onPage={setPageNumber} noun="rating scales" />}
      {deleting && (
        <DeleteDialog what="rating scale" code={deleting.scaleCode} name={deleting.scaleName} onClose={() => setDeleting(null)}
          onDelete={async () => { await ratingScalesApi.remove(deleting.id); toast.success(`${deleting.scaleCode} deleted`); setDeleting(null); reload(); }} />
      )}
    </section>
  );
};
