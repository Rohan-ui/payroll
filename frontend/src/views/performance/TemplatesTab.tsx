import React, { useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { performanceOptionsApi, templatesApi, type LibraryStatus, type Named, type TemplateSummary } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';
import { ListState, Pager, StatusTabs, DeleteDialog, usePagedList } from './performance-format';
import { DuplicateDialog } from './DuplicateDialog';
import { TemplateEditor } from './TemplateEditor';
import { MODEL } from './template-form';

const forText = (a: TemplateSummary['appliesTo']) =>
  (a.all ? 'Everyone' : [...a.departments, ...a.designations].slice(0, 3).join(', ') + (a.departments.length + a.designations.length > 3 ? ` +${a.departments.length + a.designations.length - 3}` : ''));

/** Appraisal templates: per department or designation, what people are appraised on and how it is scored. */
export const TemplatesTab: React.FC = () => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.templates.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('ACTIVE');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Named[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [copying, setCopying] = useState<TemplateSummary | null>(null);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  const { page, error, loading, reload } = usePagedList(templatesApi.list, { search: search.trim(), status, departmentId: departmentId || undefined, page: pageNumber });

  useEffect(() => { performanceOptionsApi.options().then((o) => setDepartments(o.departments)).catch(() => setDepartments([])); }, []);

  if (editing) return <TemplateEditor templateId={editing === 'new' ? null : editing} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />;

  const toggle = async (t: TemplateSummary) => {
    try {
      await (t.status === 'ACTIVE' ? templatesApi.archive(t.id) : templatesApi.restore(t.id));
      toast.success(t.status === 'ACTIVE' ? `${t.templateCode} archived` : `${t.templateCode} restored`);
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const filtered = search || status !== 'ACTIVE' || departmentId;
  const items = page?.items ?? [];
  return (
    <section className={cardClass} aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <div>
          <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Appraisal templates</h2>
          <p className="text-xs text-slate-500">What each department or designation is appraised on, how each part is weighted and scored, and the form’s questions.</p>
        </div>
        {manage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />New template</Button>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-3">
        <label className="sr-only" htmlFor={`${id}-search`}>Search templates</label>
        <input id={`${id}-search`} type="search" className={`${fieldClass} max-w-xs`} placeholder="Search by name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <label className="sr-only" htmlFor={`${id}-department`}>Department</label>
        <select id={`${id}-department`} className={`${fieldClass} w-auto`} value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPageNumber(1); }}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <StatusTabs value={status} counts={page?.counts} noun="templates" onChange={(next) => { setStatus(next); setPageNumber(1); }} />
      </div>
      <ListState loading={loading} error={error} empty={items.length === 0} what="Templates" onRetry={reload}
        emptyTitle={filtered ? 'No templates match' : 'No appraisal templates yet'}
        emptyText={filtered ? 'Try another search, department or status.' : 'Create a template for each group appraised differently, such as Sales or Engineering. Add KRAs from the library, set their weights and scoring, then publish it.'} />
      {items.length > 0 && (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Template</th>
                <th scope="col" className={thClass}>For</th>
                <th scope="col" className={thClass}>Scored in</th>
                <th scope="col" className={`${thClass} text-right`}>KRAs</th>
                <th scope="col" className={thClass}>Version</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {items.map((t) => (
                <tr key={t.id} className={t.status === 'ARCHIVED' ? 'opacity-60' : undefined}>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{t.templateCode}</span>
                    <span className="block break-words text-slate-700 dark:text-slate-300">{t.templateName}</span>
                    {t.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                  </td>
                  <td className={`${tdClass} max-w-[16rem] text-xs text-slate-600 dark:text-slate-400`}>{forText(t.appliesTo)}</td>
                  <td className={`${tdClass} text-xs`}>{t.currentVersion ? MODEL[t.currentVersion.scoringModel].label : '—'}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{t.currentVersion?.kraCount ?? '—'}</td>
                  <td className={tdClass}>
                    {t.currentVersion ? <Badge size="sm" variant="success">Version {t.currentVersion.number}</Badge> : <Badge size="sm" variant="warning">Not published</Badge>}
                    {t.draft && <span className="mt-1 block text-xs text-slate-500">Draft of version {t.draft.number}</span>}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t.id)} aria-label={`${manage && t.status === 'ACTIVE' ? 'Edit' : 'View'} ${t.templateCode}`}>{manage && t.status === 'ACTIVE' ? 'Edit' : 'View'}</Button>
                    {manage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setCopying(t)} aria-label={`Duplicate ${t.templateCode}`}>Duplicate</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(t)} aria-label={`${t.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${t.templateCode}`}>{t.status === 'ACTIVE' ? 'Archive' : 'Restore'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(t)} aria-label={`Delete ${t.templateCode}`}>Delete</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page && <Pager page={page} onPage={setPageNumber} noun="templates" />}
      {copying && (
        <DuplicateDialog what="template" code={copying.templateCode} name={copying.templateName} onClose={() => setCopying(null)}
          onCopy={async (code, name) => { const copy = await templatesApi.duplicate(copying.id, code, name); toast.success(`${copy.templateCode} created as a draft`); setCopying(null); setEditing(copy.id); }} />
      )}
      {deleting && (
        <DeleteDialog what="template" code={deleting.templateCode} name={deleting.templateName} onClose={() => setDeleting(null)}
          onDelete={async () => { await templatesApi.remove(deleting.id); toast.success(`${deleting.templateCode} deleted`); setDeleting(null); reload(); }} />
      )}
    </section>
  );
};
