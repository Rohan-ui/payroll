import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { toast } from '../../lib/toast';
import { cyclesApi, type Cycle, type CycleInput, type CycleKind } from '../../api/appraisals.api';
import { performanceOptionsApi, templatesApi, workflowsApi, type Named, type TemplateSummary, type WorkflowSummary } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { orNull } from './performance-format';
import { CYCLE_KIND } from './appraisal-format';

interface Form extends Omit<CycleInput, 'description' | 'joinedOnOrBefore' | 'scopes'> {
  cycleCode: string;
  description: string;
  joinedOnOrBefore: string;
  departmentIds: string[];
  designationIds: string[];
}

const EMPTY: Form = {
  cycleCode: '', cycleName: '', description: '', cycleKind: 'ANNUAL', periodStart: '', periodEnd: '', appliesToAll: true, departmentIds: [], designationIds: [],
  joinedOnOrBefore: '', allowsOverlap: false, templateIds: [], workflowIds: [],
};

const formOf = (c: Cycle): Form => ({
  cycleCode: c.cycleCode, cycleName: c.cycleName, description: c.description ?? '', cycleKind: c.cycleKind, periodStart: c.periodStart, periodEnd: c.periodEnd,
  appliesToAll: c.appliesToAll, departmentIds: c.scopes.departments.map((d) => d.id), designationIds: c.scopes.designations.map((d) => d.id),
  joinedOnOrBefore: c.joinedOnOrBefore ?? '', allowsOverlap: c.allowsOverlap, templateIds: c.templates.map((t) => t.id), workflowIds: c.workflows.map((w) => w.id),
});

const inputOf = (f: Form): CycleInput => ({
  cycleName: f.cycleName.trim(), description: orNull(f.description), cycleKind: f.cycleKind, periodStart: f.periodStart, periodEnd: f.periodEnd, appliesToAll: f.appliesToAll,
  scopes: f.appliesToAll ? { departmentIds: [], designationIds: [] } : { departmentIds: f.departmentIds, designationIds: f.designationIds },
  joinedOnOrBefore: orNull(f.joinedOnOrBefore), allowsOverlap: f.allowsOverlap, templateIds: f.templateIds, workflowIds: f.workflowIds,
});

/**
 * Creating an appraisal cycle, or changing one. Before launch everything
 * changes; once launched only the name and description do, so everyone in
 * the cycle was chosen by the same rules.
 */
export const CycleEditor: React.FC<{ cycle: Cycle | null; onClose: (saved: Cycle | null) => void }> = ({ cycle, onClose }) => {
  const id = useId();
  const [form, setForm] = useState<Form>(cycle ? formOf(cycle) : EMPTY);
  const [options, setOptions] = useState<{ departments: Named[]; designations: Named[] }>({ departments: [], designations: [] });
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const launched = !!cycle && cycle.status !== 'DRAFT';

  useEffect(() => {
    Promise.all([
      performanceOptionsApi.options(),
      templatesApi.list({ status: 'ACTIVE', limit: 100 }),
      workflowsApi.list({ status: 'ACTIVE', limit: 100 }),
    ]).then(([o, t, w]) => { setOptions(o); setTemplates(t.items); setWorkflows(w.items); })
      .catch((e) => setOptionsError(errorText(e)));
  }, []);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (key: 'departmentIds' | 'designationIds' | 'templateIds' | 'workflowIds', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = cycle ? await cyclesApi.update(cycle.id, inputOf(form)) : await cyclesApi.create({ ...inputOf(form), cycleCode: form.cycleCode });
      toast.success(cycle ? `${saved.cycleCode} saved` : `${saved.cycleCode} created`);
      onClose(saved);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const ready = form.cycleCode.length >= 2 && form.cycleName.trim() && form.periodStart && form.periodEnd && form.templateIds.length && form.workflowIds.length
    && (form.appliesToAll || form.departmentIds.length + form.designationIds.length > 0);

  const choices = <T extends { id: string; status: string; currentVersion: unknown }>(key: 'templateIds' | 'workflowIds', items: T[] | null, code: (t: T) => string, name: (t: T) => string, what: string) => (
    <fieldset>
      <legend className={labelClass}>{what}</legend>
      {items === null ? <p className={hintClass}>{optionsError ? 'Could not be loaded.' : 'Loading…'}</p> : items.length === 0 ? <p className={hintClass}>None yet. Create one in the {what.toLowerCase()} tab first.</p> : (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-[#2B293E]">
          {items.map((t) => (
            <label key={t.id} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5 rounded border-slate-300" checked={form[key].includes(t.id)} disabled={!t.currentVersion && !form[key].includes(t.id)} onChange={() => toggle(key, t.id)} />
              <span className="min-w-0 break-words"><span className="font-mono text-xs font-semibold">{code(t)}</span> {name(t)}{!t.currentVersion && <span className="text-xs text-slate-500"> (not published yet)</span>}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );

  return (
    <form className="space-y-4" onSubmit={save} noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onClose(null)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{cycle ? cycle.cycleCode : 'Appraisal cycles'}</Button>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{cycle ? `Edit ${cycle.cycleCode}` : 'New appraisal cycle'}</h2>
      </div>
      {optionsError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Templates, workflows or departments could not be loaded: {optionsError}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {launched && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-300">This cycle is running, so only its name and description can change.</p>}

      <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-about`}>
        <h3 id={`${id}-about`} className="text-sm font-bold text-slate-900 dark:text-slate-100">The cycle</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-code`} className={labelClass}>Code</label>
            <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={form.cycleCode} disabled={!!cycle} required maxLength={64} aria-describedby={`${id}-code-hint`}
              onChange={(e) => set({ cycleCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
            <p id={`${id}-code-hint`} className={hintClass}>Such as FY2026_ANNUAL. It can’t change later.</p>
          </div>
          <div>
            <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
            <input id={`${id}-name`} className={fieldClass} value={form.cycleName} required maxLength={160} onChange={(e) => set({ cycleName: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`${id}-kind`} className={labelClass}>Kind</label>
            <select id={`${id}-kind`} className={fieldClass} value={form.cycleKind} disabled={launched} onChange={(e) => set({ cycleKind: e.target.value as CycleKind })}>
              {(Object.keys(CYCLE_KIND) as CycleKind[]).map((k) => <option key={k} value={k}>{CYCLE_KIND[k]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
          <textarea id={`${id}-description`} className={fieldClass} rows={2} maxLength={1000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <fieldset disabled={launched} className="grid gap-4 sm:grid-cols-3">
          <legend className="sr-only">Review period</legend>
          <div>
            <label htmlFor={`${id}-start`} className={labelClass}>Period from</label>
            <input id={`${id}-start`} type="date" className={fieldClass} value={form.periodStart} required onChange={(e) => set({ periodStart: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`${id}-end`} className={labelClass}>Period to</label>
            <input id={`${id}-end`} type="date" className={fieldClass} value={form.periodEnd} min={form.periodStart || undefined} required onChange={(e) => set({ periodEnd: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`${id}-joined`} className={labelClass}>Joined on or before <span className="font-normal text-slate-400">(optional)</span></label>
            <input id={`${id}-joined`} type="date" className={fieldClass} value={form.joinedOnOrBefore} aria-describedby={`${id}-joined-hint`} onChange={(e) => set({ joinedOnOrBefore: e.target.value })} />
            <p id={`${id}-joined-hint`} className={hintClass}>Leaves out people who joined later, such as during the period.</p>
          </div>
        </fieldset>
      </section>

      <fieldset disabled={launched} className={`${cardClass} space-y-4 p-4`}>
        <legend className="sr-only">Who is appraised and with what</legend>
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Who is appraised</h3>
        <fieldset className="flex flex-wrap gap-4">
          <legend className={labelClass}>Employees</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="radio" name={`${id}-applies`} checked={form.appliesToAll} onChange={() => set({ appliesToAll: true })} />Every active employee</label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="radio" name={`${id}-applies`} checked={!form.appliesToAll} onChange={() => set({ appliesToAll: false })} />Chosen departments or designations</label>
        </fieldset>
        {!form.appliesToAll && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(['departmentIds', 'designationIds'] as const).map((key) => (
              <fieldset key={key}>
                <legend className={labelClass}>{key === 'departmentIds' ? 'Departments' : 'Designations'}</legend>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {(key === 'departmentIds' ? options.departments : options.designations).map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={form[key].includes(o.id)} onChange={() => toggle(key, o.id)} className="rounded border-slate-300" />{o.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" className="mt-0.5 rounded border-slate-300" checked={form.allowsOverlap} onChange={(e) => set({ allowsOverlap: e.target.checked })} />
          <span>Allow people already in another running cycle for an overlapping period<span className="block text-xs text-slate-500">Off by default, so nobody is appraised twice for the same time.</span></span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {choices('templateIds', templates, (t) => t.templateCode, (t) => t.templateName, 'Appraisal templates')}
          {choices('workflowIds', workflows, (w) => w.workflowCode, (w) => w.workflowName, 'Review workflows')}
        </div>
        <p className={hintClass}>Each person gets the template and workflow meant for their department or designation, otherwise the one for everyone. The launch preview shows who gets what before anything starts.</p>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onClose(null)}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={busy || !ready}>{cycle ? 'Save' : 'Create cycle'}</Button>
      </div>
    </form>
  );
};
