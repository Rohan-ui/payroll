import React, { useEffect, useId, useState } from 'react';
import { Library, Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { krasApi, performanceOptionsApi, type KraSummary, type LibraryStatus, type Named, type StarterResult } from '../../api/performance.api';
import { cardClass, day, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';
import { EVIDENCE, ListState, Pager, StatusTabs, DeleteDialog, usePagedList } from './performance-format';
import { DuplicateDialog } from './DuplicateDialog';
import { KraEditor } from './KraEditor';

const appliesText = (a: KraSummary['appliesTo']) => {
  if (a.all) return 'Everyone';
  const desigPart = a.designations?.length
    ? a.designations.slice(0, 2).join(', ') + (a.designations.length > 2 ? ` +${a.designations.length - 2}` : '')
    : a.designationCount ? `${a.designationCount} designation${a.designationCount === 1 ? '' : 's'}` : null;
  const parts = [
    a.departments.length ? a.departments.slice(0, 2).join(', ') + (a.departments.length > 2 ? ` +${a.departments.length - 2}` : '') : null,
    desigPart,
    a.employeeCount ? `${a.employeeCount} employee${a.employeeCount === 1 ? '' : 's'}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
};

/** The KRA library: result areas for every department, shared or department-specific. */
export const KraLibraryTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.library.manage');
  const loadStarter = manage && can('performance.scales.manage');
  const [starter, setStarter] = useState<'confirm' | 'busy' | StarterResult | null>(null);
  const [starterError, setStarterError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('ACTIVE');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Named[]>([]);
  const [designationId, setDesignationId] = useState('');
  const [designations, setDesignations] = useState<Named[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [copying, setCopying] = useState<KraSummary | null>(null);
  const [deleting, setDeleting] = useState<KraSummary | null>(null);
  const { page, error, loading, reload } = usePagedList(krasApi.list, {
    search: search.trim(),
    status,
    departmentId: departmentId || undefined,
    designationId: designationId || undefined,
    page: pageNumber,
  });

  useEffect(() => {
    performanceOptionsApi.options().then((o) => {
      setDepartments(o.departments);
      setDesignations(o.designations);
    }).catch(() => {
      setDepartments([]);
      setDesignations([]);
    });
  }, []);

  if (editing) return <KraEditor kraId={editing === 'new' ? null : editing} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />;

  const toggle = async (k: KraSummary) => {
    try {
      await (k.status === 'ACTIVE' ? krasApi.archive(k.id) : krasApi.restore(k.id));
      toast.success(k.status === 'ACTIVE' ? `${k.kraCode} archived: it can’t be added to new templates` : `${k.kraCode} restored`);
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const runStarter = async () => {
    setStarter('busy');
    setStarterError(null);
    try {
      const result = await krasApi.loadStarter();
      setStarter(result);
      toast.success(`Added ${result.krasCreated} KRAs and ${result.kpisCreated} KPIs`);
      reload();
    } catch (e) {
      setStarterError(errorText(e));
      setStarter('confirm');
    }
  };

  const filtered = search || status !== 'ACTIVE' || departmentId || designationId;
  const items = page?.items ?? [];
  return (
    <section className={cardClass} aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <div>
          <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">KRA library</h2>
          <p className="text-xs text-slate-500">Key result areas people are appraised on, shared across the organization or meant for chosen departments and roles.</p>
        </div>
        <span className="flex flex-wrap gap-2">
          {loadStarter && <Button size="sm" variant="outline" onClick={() => { setStarterError(null); setStarter('confirm'); }}><Library className="h-4 w-4" aria-hidden="true" />Load starter KRAs & KPIs</Button>}
          {manage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />New KRA</Button>}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-3">
        <label className="sr-only" htmlFor={`${id}-search`}>Search KRAs</label>
        <input id={`${id}-search`} type="search" className={`${fieldClass} max-w-xs`} placeholder="Search by name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <label className="sr-only" htmlFor={`${id}-department`}>Department</label>
        <select id={`${id}-department`} className={`${fieldClass} w-auto`} value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPageNumber(1); }}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${id}-designation`}>Role / Designation</label>
        <select id={`${id}-designation`} className={`${fieldClass} w-auto`} value={designationId} onChange={(e) => { setDesignationId(e.target.value); setPageNumber(1); }}>
          <option value="">All roles / designations</option>
          {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <StatusTabs value={status} counts={page?.counts} noun="KRAs" onChange={(next) => { setStatus(next); setPageNumber(1); }} />
      </div>
      {(departmentId || designationId) && (
        <p className="px-4 pb-2 text-xs text-slate-500">
          Showing KRAs for everyone plus those chosen for {departmentId ? departments.find((d) => d.id === departmentId)?.name ?? 'this department' : ''}{departmentId && designationId ? ' and ' : ''}{designationId ? designations.find((d) => d.id === designationId)?.name ?? 'this role' : ''}.
        </p>
      )}
      <ListState loading={loading} error={error} empty={items.length === 0} what="KRAs" onRetry={reload}
        emptyTitle={filtered ? 'No KRAs match' : 'No KRAs yet'}
        emptyText={filtered ? 'Try another search, department or status.' : 'Create the result areas people are appraised on, such as Revenue achievement for Sales or Code quality for Engineering, then add KPIs to them.'} />
      {items.length > 0 && (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>KRA</th>
                <th scope="col" className={thClass}>For</th>
                <th scope="col" className={`${thClass} text-right`}>KPIs</th>
                <th scope="col" className={`${thClass} text-right`}>Weight</th>
                <th scope="col" className={`${thClass} text-right`}>Max marks</th>
                <th scope="col" className={thClass}>Evidence</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {items.map((k) => (
                <tr key={k.id} className={k.status === 'ARCHIVED' ? 'opacity-60' : undefined}>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{k.kraCode}</span>
                    <span className="block break-words text-slate-700 dark:text-slate-300">{k.kraName}</span>
                    {k.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                    {k.effectiveTo && <span className="block text-xs text-slate-500">Until {day(k.effectiveTo)}</span>}
                  </td>
                  <td className={`${tdClass} max-w-[16rem] text-xs text-slate-600 dark:text-slate-400`}>{appliesText(k.appliesTo)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{k.kpiCount}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{k.defaultWeightPercent ? `${k.defaultWeightPercent}%` : '—'}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{k.defaultMaxMarks ?? '—'}</td>
                  <td className={`${tdClass} text-xs`}>{EVIDENCE[k.evidenceRequirement]}</td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(k.id)} aria-label={`${manage && k.status === 'ACTIVE' ? 'Edit' : 'View'} ${k.kraCode}`}>{manage && k.status === 'ACTIVE' ? 'Edit' : 'View'}</Button>
                    {manage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setCopying(k)} aria-label={`Duplicate ${k.kraCode}`}>Duplicate</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(k)} aria-label={`${k.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${k.kraCode}`}>{k.status === 'ACTIVE' ? 'Archive' : 'Restore'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(k)} aria-label={`Delete ${k.kraCode}`}>Delete</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page && <Pager page={page} onPage={setPageNumber} noun="KRAs" />}
      {(starter === 'confirm' || starter === 'busy') && (
        <Dialog title="Load the starter KRAs and KPIs?" onClose={() => starter !== 'busy' && setStarter(null)} size="md"
          footer={<><Button variant="outline" onClick={() => setStarter(null)} disabled={starter === 'busy'}>Cancel</Button><Button onClick={runStarter} loading={starter === 'busy'} disabled={starter === 'busy'}>Load them</Button></>}>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>This adds ready-made KRAs with measurable KPIs, suggested weights and targets, which you can then edit, archive or delete like your own:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>For each of your departments found by name: Engineering, Quality Assurance, Sales & Marketing, Product & Design, Operations, Accounts & Finance and Human Resources.</li>
              <li>For everyone: attendance and discipline, teamwork and communication, and learning.</li>
              <li>A five-point rating scale (1 needs improvement to 5 outstanding) for the rated behaviours.</li>
            </ul>
            <p>Anything with the same code already in your library is left as it is.</p>
            {starterError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{starterError}</p>}
          </div>
        </Dialog>
      )}
      {starter && typeof starter === 'object' && (
        <Dialog title="Starter library loaded" onClose={() => setStarter(null)} size="sm" footer={<Button onClick={() => setStarter(null)}>Done</Button>}>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>Added {starter.krasCreated} KRA{starter.krasCreated === 1 ? '' : 's'} and {starter.kpisCreated} KPI{starter.kpisCreated === 1 ? '' : 's'}.{starter.alreadyThere ? ` ${starter.alreadyThere} were already in your library and were left as they are.` : ''}</p>
            {starter.departmentsNotFound.length > 0 && (
              <p>No department matched {starter.departmentsNotFound.join(', ')}, so their KRAs weren’t added. Their KPIs are in the KPI library; add such a department and load again, or build those KRAs yourself.</p>
            )}
          </div>
        </Dialog>
      )}
      {copying && (
        <DuplicateDialog what="KRA" code={copying.kraCode} name={copying.kraName} onClose={() => setCopying(null)}
          onCopy={async (code, name) => { const copy = await krasApi.duplicate(copying.id, code, name); toast.success(`${copy.kraCode} created`); setCopying(null); setEditing(copy.id); }} />
      )}
      {deleting && (
        <DeleteDialog what="KRA" code={deleting.kraCode} name={deleting.kraName} onClose={() => setDeleting(null)}
          onDelete={async () => { await krasApi.remove(deleting.id); toast.success(`${deleting.kraCode} deleted`); setDeleting(null); reload(); }} />
      )}
    </section>
  );
};
