import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { ApiError } from '../../api/client';
import {
  krasApi, kpisApi, performanceOptionsApi, ratingScalesApi,
  type EmployeeOption, type Kra, type KraSettings, type LibraryStatus, type MeasurementType, type Named, type RatingScaleSummary,
} from '../../api/performance.api';
import { cardClass, errorText, fieldClass, hintClass, labelClass, todayIso } from '../payroll/payroll-format';
import { EVIDENCE, MEASUREMENT, orNull, weightTotal } from './performance-format';
import { SearchPicker } from './SearchPicker';

interface LinkedKpi { kpiId: string; kpiCode: string; kpiName: string; measurementType: MeasurementType | null; status: LibraryStatus; defaultWeightPercent: string }
interface Form extends Omit<KraSettings, 'kpis' | 'scopes'> {
  kraCode: string;
  departmentIds: string[];
  designationIds: string[];
  employees: EmployeeOption[];
  kpis: LinkedKpi[];
}

const NEW = (): Form => ({
  kraCode: '', kraName: '', description: '', measurementMethod: '', evaluationInstructions: '', evidenceRequirement: 'OPTIONAL',
  defaultWeightPercent: '', defaultMaxMarks: '', defaultMinMarks: '', ratingScaleId: null, appliesToAll: true,
  departmentIds: [], designationIds: [], employees: [], kpis: [], effectiveFrom: todayIso(), effectiveTo: null,
});

const formOf = (kra: Kra): Form => ({
  kraCode: kra.kraCode, kraName: kra.kraName, description: kra.description ?? '', measurementMethod: kra.measurementMethod ?? '',
  evaluationInstructions: kra.evaluationInstructions ?? '', evidenceRequirement: kra.evidenceRequirement, defaultWeightPercent: kra.defaultWeightPercent ?? '',
  defaultMaxMarks: kra.defaultMaxMarks ?? '', defaultMinMarks: kra.defaultMinMarks ?? '', ratingScaleId: kra.ratingScale?.id ?? null, appliesToAll: kra.appliesToAll,
  departmentIds: kra.scopes.departments.map((d) => d.id), designationIds: kra.scopes.designations.map((d) => d.id), employees: kra.scopes.employees,
  kpis: kra.kpis.map((k) => ({ ...k, defaultWeightPercent: k.defaultWeightPercent ?? '' })), effectiveFrom: kra.effectiveFrom, effectiveTo: kra.effectiveTo,
});

const findKpis = (term: string) => kpisApi.list({ search: term, status: 'ACTIVE', limit: 20 }).then((p) => p.items.map((k) => ({ id: k.id, name: k.kpiName, code: k.kpiCode })));

/** Creating or editing one KRA: its scoring defaults, who it is for, and the KPIs it suggests. */
export const KraEditor: React.FC<{ kraId: string | null; onClose: (changed: boolean) => void }> = ({ kraId, onClose }) => {
  const id = useId();
  const { can } = useAuth();
  const [kra, setKra] = useState<Kra | null>(null);
  const [form, setForm] = useState<Form>(NEW);
  const [options, setOptions] = useState<{ departments: Named[]; designations: Named[] }>({ departments: [], designations: [] });
  const [scales, setScales] = useState<RatingScaleSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const readOnly = !can('performance.library.manage') || kra?.status === 'ARCHIVED';

  const load = useCallback(() => {
    setLoadError(null);
    setError(null);
    performanceOptionsApi.options().then(setOptions).catch((e) => setLoadError(errorText(e)));
    ratingScalesApi.list({ status: 'ACTIVE', limit: 100 }).then((p) => setScales(p.items)).catch(() => setScales([]));
    if (!kraId) return;
    krasApi.get(kraId).then((k) => { setKra(k); setForm(formOf(k)); }).catch((e) => setLoadError(errorText(e)));
  }, [kraId]);
  useEffect(load, [load]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key: 'departmentIds' | 'designationIds', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  const moveKpi = (index: number, by: -1 | 1) => setForm((f) => {
    const kpis = [...f.kpis];
    [kpis[index], kpis[index + by]] = [kpis[index + by], kpis[index]];
    return { ...f, kpis };
  });

  const handleAddRole = async () => {
    const name = roleSearch.trim();
    if (!name || addingRole) return;
    setAddingRole(true);
    try {
      const created = await performanceOptionsApi.createDesignation(name);
      setOptions((prev) => ({
        ...prev,
        designations: prev.designations.some((d) => d.id === created.id)
          ? prev.designations
          : [...prev.designations, created].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      if (!form.designationIds.includes(created.id)) {
        setForm((f) => ({ ...f, designationIds: [...f.designationIds, created.id] }));
      }
      toast.success(`Role "${created.name}" added`);
      setRoleSearch('');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setAddingRole(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const settings: KraSettings = {
      kraName: form.kraName.trim(),
      description: orNull(form.description),
      measurementMethod: orNull(form.measurementMethod),
      evaluationInstructions: orNull(form.evaluationInstructions),
      evidenceRequirement: form.evidenceRequirement,
      defaultWeightPercent: orNull(form.defaultWeightPercent),
      defaultMaxMarks: orNull(form.defaultMaxMarks),
      defaultMinMarks: orNull(form.defaultMinMarks),
      ratingScaleId: form.ratingScaleId,
      appliesToAll: form.appliesToAll,
      scopes: form.appliesToAll
        ? { departmentIds: [], designationIds: [], employeeIds: [] }
        : { departmentIds: form.departmentIds, designationIds: form.designationIds, employeeIds: form.employees.map((e) => e.id) },
      kpis: form.kpis.map((k) => ({ kpiId: k.kpiId, defaultWeightPercent: orNull(k.defaultWeightPercent) })),
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
    };
    try {
      const saved = kra ? await krasApi.update(kra.id, { ...settings, expectedRevision: kra.revision }) : await krasApi.create({ ...settings, kraCode: form.kraCode.trim() });
      toast.success(kra ? `${saved.kraCode} saved` : `${saved.kraCode} created`);
      onClose(true);
    } catch (e) {
      setError({ message: errorText(e), stale: e instanceof ApiError && e.status === 409 && !!kra });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        The KRA could not be loaded: {loadError} <button type="button" className="font-semibold underline" onClick={load}>Try again</button>
      </div>
    );
  }
  if (kraId && !kra) return <div className="h-40 animate-pulse rounded-xl bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading KRA</span></div>;

  const usableScales = scales.filter((s) => s.currentVersion);
  const keptScale = kra?.ratingScale && !usableScales.some((s) => s.id === kra.ratingScale?.id) ? kra.ratingScale : null;
  const total = form.kpis.length ? weightTotal(form.kpis.map((k) => k.defaultWeightPercent)) : null;

  return (
    <form onSubmit={save} className="space-y-4" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onClose(false)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />KRA library</Button>
          <h2 id={`${id}-title`} className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{kra ? `${kra.kraCode} · ${kra.kraName}` : 'New KRA'}</h2>
          {kra?.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
        </div>
        {!readOnly && <Button type="submit" loading={saving} disabled={saving}>{kra ? 'Save KRA' : 'Create KRA'}</Button>}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error.message}{' '}
          {error.stale && <button type="button" className="font-semibold underline" onClick={load}>Reload the latest version</button>}
        </p>
      )}
      {kra && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-400">
          Changes apply to appraisal templates published from now on. Appraisals already under way or finalized keep the definition they started with.
        </p>
      )}

      <fieldset disabled={readOnly} className="space-y-4">
        <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-basics`}>
          <h3 id={`${id}-basics`} className="text-sm font-bold text-slate-900 dark:text-slate-100">The result area</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-code`} className={labelClass}>Code</label>
              <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={form.kraCode} disabled={!!kra} required maxLength={64}
                onChange={(e) => set('kraCode', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} aria-describedby={`${id}-code-hint`} />
              <p id={`${id}-code-hint`} className={hintClass}>Such as BUSINESS_RESULTS. It can’t change later.</p>
            </div>
            <div>
              <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
              <input id={`${id}-name`} className={fieldClass} value={form.kraName} required maxLength={160} onChange={(e) => set('kraName', e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea id={`${id}-description`} rows={2} className={fieldClass} value={form.description ?? ''} maxLength={2000} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-method`} className={labelClass}>How it is measured <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id={`${id}-method`} rows={3} className={fieldClass} value={form.measurementMethod ?? ''} maxLength={2000} onChange={(e) => set('measurementMethod', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-instructions`} className={labelClass}>Instructions for reviewers <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id={`${id}-instructions`} rows={3} className={fieldClass} value={form.evaluationInstructions ?? ''} maxLength={4000} onChange={(e) => set('evaluationInstructions', e.target.value)} />
            </div>
          </div>
        </section>

        <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-scoring`}>
          <div>
            <h3 id={`${id}-scoring`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Suggested scoring</h3>
            <p className={hintClass}>Starting values when the KRA is added to an appraisal template. The template sets the weights that count.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor={`${id}-weight`} className={labelClass}>Weight in the appraisal (%)</label>
              <input id={`${id}-weight`} className={fieldClass} inputMode="decimal" value={form.defaultWeightPercent ?? ''} onChange={(e) => set('defaultWeightPercent', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-max`} className={labelClass}>Maximum marks</label>
              <input id={`${id}-max`} className={fieldClass} inputMode="decimal" value={form.defaultMaxMarks ?? ''} onChange={(e) => set('defaultMaxMarks', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-min`} className={labelClass}>Minimum marks</label>
              <input id={`${id}-min`} className={fieldClass} inputMode="decimal" value={form.defaultMinMarks ?? ''} onChange={(e) => set('defaultMinMarks', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-evidence`} className={labelClass}>Supporting evidence</label>
              <select id={`${id}-evidence`} className={fieldClass} value={form.evidenceRequirement} onChange={(e) => set('evidenceRequirement', e.target.value as Form['evidenceRequirement'])}>
                {Object.entries(EVIDENCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="sm:w-1/2">
            <label htmlFor={`${id}-scale`} className={labelClass}>Rating scale <span className="font-normal text-slate-400">(optional)</span></label>
            <select id={`${id}-scale`} className={fieldClass} value={form.ratingScaleId ?? ''} onChange={(e) => set('ratingScaleId', e.target.value || null)}>
              <option value="">None</option>
              {keptScale && <option value={keptScale.id}>{keptScale.name} (archived)</option>}
              {usableScales.map((s) => <option key={s.id} value={s.id}>{s.scaleName}</option>)}
            </select>
            <p className={hintClass}>Only published scales can be chosen.</p>
          </div>
        </section>

        <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-who`}>
          <h3 id={`${id}-who`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Who it is for</h3>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Who it is for</legend>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name={`${id}-applies`} checked={form.appliesToAll} onChange={() => set('appliesToAll', true)} />Everyone (a shared KRA)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name={`${id}-applies`} checked={!form.appliesToAll} onChange={() => set('appliesToAll', false)} />Chosen departments, designations or people
            </label>
          </fieldset>
          {!form.appliesToAll && (
            <div className="grid gap-4 lg:grid-cols-3">
              <fieldset>
                <legend className={labelClass}>Departments</legend>
                {options.departments.length === 0 && <p className={hintClass}>No departments yet.</p>}
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {options.departments.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={form.departmentIds.includes(d.id)} onChange={() => toggleIn('departmentIds', d.id)} className="rounded border-slate-300" />{d.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className={labelClass}>Designations / Roles</legend>
                <div className="mb-2 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Filter or add role..."
                    className={`${fieldClass} text-xs py-1 px-2`}
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRole();
                      }
                    }}
                  />
                  {roleSearch.trim() && !options.designations.some((d) => d.name.toLowerCase() === roleSearch.trim().toLowerCase()) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={addingRole}
                      disabled={addingRole}
                      onClick={handleAddRole}
                      title={`Add "${roleSearch.trim()}" as a new role`}
                    >
                      + Add
                    </Button>
                  )}
                </div>
                {options.designations.length === 0 && <p className={hintClass}>No designations / roles yet.</p>}
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {options.designations
                    .filter((d) => !roleSearch.trim() || d.name.toLowerCase().includes(roleSearch.trim().toLowerCase()))
                    .map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={form.designationIds.includes(d.id)} onChange={() => toggleIn('designationIds', d.id)} className="rounded border-slate-300" />{d.name}
                      </label>
                    ))}
                  {options.designations.length > 0 && options.designations.filter((d) => !roleSearch.trim() || d.name.toLowerCase().includes(roleSearch.trim().toLowerCase())).length === 0 && (
                    <p className="text-xs text-slate-400 py-1">No matching roles found.</p>
                  )}
                </div>
              </fieldset>
              <div>
                <SearchPicker label="Individual employees" noun="employees" find={performanceOptionsApi.employees} exclude={form.employees.map((e) => e.id)}
                  onPick={(e) => set('employees', [...form.employees, e])} />
                {form.employees.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {form.employees.map((e) => (
                      <li key={e.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-200">
                        {e.name}
                        <button type="button" aria-label={`Remove ${e.name}`} onClick={() => set('employees', form.employees.filter((x) => x.id !== e.id))}
                          className="rounded-full p-0.5 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-white/10">
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:w-2/3">
            <div>
              <label htmlFor={`${id}-from`} className={labelClass}>Can be used from</label>
              <input id={`${id}-from`} type="date" className={fieldClass} value={form.effectiveFrom} required onChange={(e) => set('effectiveFrom', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-to`} className={labelClass}>Until <span className="font-normal text-slate-400">(optional)</span></label>
              <input id={`${id}-to`} type="date" className={fieldClass} value={form.effectiveTo ?? ''} min={form.effectiveFrom} onChange={(e) => set('effectiveTo', e.target.value || null)} />
            </div>
          </div>
        </section>

        <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-kpis`}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id={`${id}-kpis`} className="text-sm font-bold text-slate-900 dark:text-slate-100">KPIs</h3>
              <p className={hintClass}>The measures this KRA suggests, in order, each with a suggested weight within the KRA.</p>
            </div>
            {total !== null && (
              <p className={`text-xs font-semibold ${total === '100' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`} role="status">
                Suggested weights total {total}%{total === '100' ? '' : ' (templates need 100%)'}
              </p>
            )}
          </div>
          {form.kpis.length === 0 && <p className="text-sm text-slate-500">No KPIs yet. Add the measures that show results in this area.</p>}
          {form.kpis.length > 0 && (
            <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
              {form.kpis.map((k, i) => (
                <li key={k.kpiId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{k.kpiCode}</span>
                    <span className="block truncate text-sm text-slate-700 dark:text-slate-300">{k.kpiName}</span>
                    {k.measurementType && <span className="text-xs text-slate-500">{MEASUREMENT[k.measurementType].label}</span>}
                    {k.status === 'ARCHIVED' && <Badge size="sm" variant="warning">Archived KPI</Badge>}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                    <span>Weight %</span>
                    <input className={`${fieldClass} w-20`} inputMode="decimal" value={k.defaultWeightPercent} aria-label={`Suggested weight of ${k.kpiCode} within this KRA (%)`}
                      onChange={(e) => set('kpis', form.kpis.map((x, j) => (j === i ? { ...x, defaultWeightPercent: e.target.value } : x)))} />
                  </label>
                  <span className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => moveKpi(i, -1)} aria-label={`Move ${k.kpiCode} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === form.kpis.length - 1} onClick={() => moveKpi(i, 1)} aria-label={`Move ${k.kpiCode} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => set('kpis', form.kpis.filter((x) => x.kpiId !== k.kpiId))} aria-label={`Remove ${k.kpiCode}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {!readOnly && (
            <div className="sm:w-1/2">
              <SearchPicker label="Add a KPI" noun="KPIs" find={findKpis} exclude={form.kpis.map((k) => k.kpiId)} hint="Only active KPIs can be added. Create new ones in the KPI library."
                onPick={(k) => set('kpis', [...form.kpis, { kpiId: k.id, kpiCode: k.code, kpiName: k.name, measurementType: null, status: 'ACTIVE', defaultWeightPercent: '' }])} />
            </div>
          )}
        </section>
      </fieldset>
      {kra && <p className="text-xs text-slate-500">Revision {kra.revision}{kra.updatedBy ? ` · last changed by ${kra.updatedBy}` : ''}</p>}
    </form>
  );
};
