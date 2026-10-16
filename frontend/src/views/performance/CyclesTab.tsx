import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { cyclesApi, type AppraisalFilter, type AppraisalQuery, type Cycle, type CycleSummary } from '../../api/appraisals.api';
import type { LibraryStatus } from '../../api/performance.api';
import { cardClass, day, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';
import { DeleteDialog, ListState, Pager, StatusTabs, usePagedList } from './performance-format';
import { CycleEditor } from './CycleEditor';
import { LaunchPreviewView } from './LaunchPreviewView';
import { AppraisalAdminView } from './AppraisalAdminView';
import { APPRAISAL_STATUS, CYCLE_KIND, CYCLE_STATUS, STAGE_STATUS } from './appraisal-format';

const FILTERS: { value: AppraisalFilter | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'NEEDS_REVIEWERS', label: 'Needs reviewers' },
  { value: 'REVIEWS_COMPLETE', label: 'Reviews complete' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** “12 in progress · 3 need reviewers · 2 overdue”: where a cycle stands. */
const progressText = (c: CycleSummary) => {
  const p = c.progress;
  if (!p || !p.total) return c.status === 'DRAFT' ? 'Not launched' : 'Nobody yet';
  return [
    `${p.inProgress} in progress`, p.reviewsComplete && `${p.reviewsComplete} reviews complete`, p.needingReviewers && `${p.needingReviewers} need reviewers`,
    p.overdue && `${p.overdue} overdue`, p.cancelled && `${p.cancelled} cancelled`,
  ].filter(Boolean).join(' · ');
};

/** A cycle: its settings and progress, launching, and its appraisals. */
const CycleDetail: React.FC<{ cycleId: string; onClose: (changed: boolean) => void }> = ({ cycleId, onClose }) => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.cycles.manage');
  const canPreview = manage && can('people.view');
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<null | 'edit' | 'launch'>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AppraisalFilter | ''>('');
  const [pageNumber, setPageNumber] = useState(1);
  const loadAppraisals = useCallback((q: AppraisalQuery) => cyclesApi.appraisals(cycleId, q), [cycleId]);
  const { page, error: listError, loading, reload } = usePagedList(loadAppraisals, { search: search.trim(), status: status || undefined, page: pageNumber });

  const load = useCallback(() => {
    setError(null);
    cyclesApi.get(cycleId).then(setCycle).catch((e) => setError(errorText(e)));
  }, [cycleId]);
  useEffect(load, [load]);

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>The cycle could not be opened: {error}</span>
        <span className="flex gap-3"><button type="button" onClick={load} className="font-semibold underline">Try again</button><button type="button" onClick={() => onClose(changed)} className="font-semibold underline">Back</button></span>
      </div>
    );
  }
  if (!cycle) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading the cycle</span></div>;
  if (mode === 'edit') return <CycleEditor cycle={cycle} onClose={(saved) => { setMode(null); if (saved) { setCycle(saved); setChanged(true); } }} />;
  if (mode === 'launch') return <LaunchPreviewView cycle={cycle} onClose={(launched) => { setMode(null); if (launched) { load(); reload(); setChanged(true); } }} />;
  if (open) return <AppraisalAdminView appraisalId={open} onClose={(c) => { setOpen(null); if (c) { load(); reload(); } }} />;

  const p = cycle.progress;
  const items = page?.items ?? [];
  const live = cycle.status === 'DRAFT' || cycle.status === 'ACTIVE';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" onClick={() => onClose(changed)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Appraisal cycles</Button>
          <h2 className="mt-1 break-words text-lg font-bold text-slate-900 dark:text-slate-100">{cycle.cycleName} <span className="font-mono text-sm font-normal text-slate-500">{cycle.cycleCode}</span></h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {CYCLE_KIND[cycle.cycleKind]} · {day(cycle.periodStart)} to {day(cycle.periodEnd)}
            {cycle.launchedAt ? ` · launched ${new Date(cycle.launchedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${cycle.launchedBy ? ` by ${cycle.launchedBy}` : ''}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            For {cycle.appliesToAll ? 'every active employee' : [...cycle.scopes.departments, ...cycle.scopes.designations].map((s) => s.name).join(', ')}
            {cycle.joinedOnOrBefore ? `, joined on or before ${day(cycle.joinedOnOrBefore)}` : ''} · templates {cycle.templates.map((t) => t.code).join(', ')} · workflows {cycle.workflows.map((w) => w.code).join(', ')}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={CYCLE_STATUS[cycle.status].variant}>{CYCLE_STATUS[cycle.status].label}</Badge>
          {manage && cycle.status !== 'ARCHIVED' && <Button size="sm" variant="outline" onClick={() => setMode('edit')}>Edit</Button>}
          {canPreview && live && <Button size="sm" onClick={() => setMode('launch')}>{cycle.status === 'DRAFT' ? 'Preview and launch' : 'Add people'}</Button>}
        </span>
      </div>
      {manage && live && !canPreview && <p className="text-sm text-amber-800 dark:text-amber-300">Launching shows who would be appraised, so it also needs permission to view people.</p>}

      {p && p.total > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[['Appraisals', p.total], ['In progress', p.inProgress], ['Need reviewers', p.needingReviewers], ['Overdue', p.overdue], ['Reviews complete', p.reviewsComplete]].map(([label, value]) => (
            <div key={label} className={`${cardClass} p-3`}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</dd></div>
          ))}
        </dl>
      )}

      <section className={cardClass} aria-labelledby={`${id}-appraisals`}>
        <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
          <h3 id={`${id}-appraisals`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Appraisals</h3>
        </div>
        <div className="flex flex-wrap gap-3 px-4 py-3">
          <label className="sr-only" htmlFor={`${id}-search`}>Search employees</label>
          <input id={`${id}-search`} type="search" className={`${fieldClass} max-w-xs`} placeholder="Search by name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
          <label className="sr-only" htmlFor={`${id}-status`}>Status</label>
          <select id={`${id}-status`} className={`${fieldClass} w-auto`} value={status} onChange={(e) => { setStatus(e.target.value as AppraisalFilter | ''); setPageNumber(1); }}>
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <ListState loading={loading} error={listError} empty={items.length === 0} what="Appraisals" onRetry={reload}
          emptyTitle={search || status ? 'No appraisals match' : cycle.status === 'DRAFT' ? 'Not launched yet' : 'No appraisals in this cycle'}
          emptyText={search || status ? 'Try another search or status.' : cycle.status === 'DRAFT' ? 'Preview the launch to see who would be appraised and with what, then launch it.' : 'Add people to the cycle to start their appraisals.'} />
        {items.length > 0 && (
          <div className="overflow-x-auto" aria-busy={loading}>
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Appraisals in {cycle.cycleName}</caption>
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr>
                  <th scope="col" className={thClass}>Employee</th>
                  <th scope="col" className={thClass}>Where it is</th>
                  <th scope="col" className={thClass}>Template</th>
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className={tdClass}>
                      <span className="block break-words font-semibold text-slate-900 dark:text-slate-100">{a.employee.name}</span>
                      <span className="block text-xs text-slate-500"><span className="font-mono">{a.employee.code}</span>{a.designation ? ` · ${a.designation}` : ''}{a.department ? ` · ${a.department}` : ''}</span>
                    </td>
                    <td className={`${tdClass} text-xs`}>
                      {a.currentStages.length ? (
                        <ul className="space-y-1">
                          {a.currentStages.map((s) => (
                            <li key={s.name} className="flex flex-wrap items-center gap-1">
                              <span className="text-slate-700 dark:text-slate-300">{s.name}</span>
                              <Badge size="sm" variant={STAGE_STATUS[s.status].variant}>{STAGE_STATUS[s.status].label}</Badge>
                              {s.overdue ? <Badge size="sm" variant="danger">Overdue</Badge> : s.dueDate && <span className="text-slate-500">due {day(s.dueDate)}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className={`${tdClass} font-mono text-xs`}>{a.template}</td>
                    <td className={tdClass}><Badge size="sm" variant={APPRAISAL_STATUS[a.status].variant}>{APPRAISAL_STATUS[a.status].label}</Badge></td>
                    <td className={`${tdClass} text-right`}><Button size="sm" variant="ghost" onClick={() => setOpen(a.id)} aria-label={`Open ${a.employee.name}’s appraisal`}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page && <Pager page={page} onPage={setPageNumber} noun="appraisals" />}
      </section>
    </div>
  );
};

/** Appraisal cycles: review periods, who is in them, and launching. */
export const CyclesTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.cycles.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('ACTIVE');
  const [pageNumber, setPageNumber] = useState(1);
  const [view, setView] = useState<string | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CycleSummary | null>(null);
  const { page, error, loading, reload } = usePagedList(cyclesApi.list, { search: search.trim(), status, page: pageNumber });

  if (view === 'new') return <CycleEditor cycle={null} onClose={(saved) => { setView(saved ? saved.id : null); reload(); }} />;
  if (view) return <CycleDetail cycleId={view} onClose={(changed) => { setView(null); if (changed) reload(); }} />;

  const toggle = async (c: CycleSummary) => {
    try {
      await (c.status === 'ARCHIVED' ? cyclesApi.restore(c.id) : cyclesApi.archive(c.id));
      toast.success(c.status === 'ARCHIVED' ? `${c.cycleCode} restored` : `${c.cycleCode} archived`);
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
          <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Appraisal cycles</h2>
          <p className="text-xs text-slate-500">Review periods: who is appraised, with which template and workflow, and how far each appraisal has got.</p>
        </div>
        {manage && <Button size="sm" onClick={() => setView('new')}><Plus className="h-4 w-4" aria-hidden="true" />New cycle</Button>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-3">
        <label className="sr-only" htmlFor={`${id}-search`}>Search cycles</label>
        <input id={`${id}-search`} type="search" className={`${fieldClass} max-w-xs`} placeholder="Search by name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <StatusTabs value={status} counts={page?.counts} noun="cycles" onChange={(next) => { setStatus(next); setPageNumber(1); }} />
      </div>
      <ListState loading={loading} error={error} empty={items.length === 0} what="Cycles" onRetry={reload}
        emptyTitle={search || status !== 'ACTIVE' ? 'No cycles match' : 'No appraisal cycles yet'}
        emptyText={search || status !== 'ACTIVE' ? 'Try another search or status.' : 'Create a cycle for a review period, such as the annual review, then preview and launch it.'} />
      {items.length > 0 && (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Cycle</th>
                <th scope="col" className={thClass}>Period</th>
                <th scope="col" className={thClass}>Progress</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {items.map((c) => (
                <tr key={c.id} className={c.status === 'ARCHIVED' ? 'opacity-60' : undefined}>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{c.cycleCode}</span>
                    <span className="block break-words text-slate-700 dark:text-slate-300">{c.cycleName}</span>
                    <span className="text-xs text-slate-500">{CYCLE_KIND[c.cycleKind]}</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-xs text-slate-600 dark:text-slate-400`}>{day(c.periodStart)} to {day(c.periodEnd)}</td>
                  <td className={`${tdClass} max-w-[18rem] text-xs text-slate-600 dark:text-slate-400`}>{progressText(c)}</td>
                  <td className={tdClass}><Badge size="sm" variant={CYCLE_STATUS[c.status].variant}>{CYCLE_STATUS[c.status].label}</Badge></td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => setView(c.id)} aria-label={`Open ${c.cycleCode}`}>Open</Button>
                    {manage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => toggle(c)} aria-label={`${c.status === 'ARCHIVED' ? 'Restore' : 'Archive'} ${c.cycleCode}`}>{c.status === 'ARCHIVED' ? 'Restore' : 'Archive'}</Button>
                        {!c.progress?.total && <Button size="sm" variant="ghost" onClick={() => setDeleting(c)} aria-label={`Delete ${c.cycleCode}`}>Delete</Button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page && <Pager page={page} onPage={setPageNumber} noun="cycles" />}
      {deleting && (
        <DeleteDialog what="cycle" code={deleting.cycleCode} name={deleting.cycleName} onClose={() => setDeleting(null)}
          onDelete={async () => { await cyclesApi.remove(deleting.id); toast.success(`${deleting.cycleCode} deleted`); setDeleting(null); reload(); }} />
      )}
    </section>
  );
};
