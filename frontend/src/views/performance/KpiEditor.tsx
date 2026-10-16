import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { ApiError } from '../../api/client';
import { kpisApi, ratingScalesApi, type Kpi, type KpiSettings, type MeasurementType, type RatingScaleSummary } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { DIRECTION, EVIDENCE, MEASUREMENT, RATED, UNMEASURED, orNull } from './performance-format';

type Form = KpiSettings & { kpiCode: string };

const NEW: Form = {
  kpiCode: '', kpiName: '', description: '', measurementType: 'NUMERIC', unitLabel: '', currencyCode: null, direction: 'HIGHER_IS_BETTER',
  defaultTarget: '', minimumExpected: '', stretchTarget: '', defaultMaxMarks: '', ratingScaleId: null, evidenceRequirement: 'NONE', evaluationInstructions: '',
};

const formOf = (kpi: Kpi): Form => ({
  kpiCode: kpi.kpiCode, kpiName: kpi.kpiName, description: kpi.description ?? '', measurementType: kpi.measurementType, unitLabel: kpi.unitLabel ?? '',
  currencyCode: kpi.currencyCode, direction: kpi.direction, defaultTarget: kpi.defaultTarget ?? '', minimumExpected: kpi.minimumExpected ?? '',
  stretchTarget: kpi.stretchTarget ?? '', defaultMaxMarks: kpi.defaultMaxMarks ?? '', ratingScaleId: kpi.ratingScale?.id ?? null,
  evidenceRequirement: kpi.evidenceRequirement, evaluationInstructions: kpi.evaluationInstructions ?? '',
});

/** Creating or editing one KPI. People without the manage permission see it read-only. */
export const KpiEditor: React.FC<{ kpiId: string | null; onClose: (changed: boolean) => void }> = ({ kpiId, onClose }) => {
  const id = useId();
  const { can } = useAuth();
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [form, setForm] = useState<Form>(NEW);
  const [scales, setScales] = useState<RatingScaleSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const readOnly = !can('performance.library.manage') || kpi?.status === 'ARCHIVED';

  const load = useCallback(() => {
    setLoadError(null);
    setError(null);
    ratingScalesApi.list({ status: 'ACTIVE', limit: 100 }).then((p) => setScales(p.items)).catch(() => setScales([]));
    if (!kpiId) return;
    kpisApi.get(kpiId).then((k) => { setKpi(k); setForm(formOf(k)); }).catch((e) => setLoadError(errorText(e)));
  }, [kpiId]);
  useEffect(load, [load]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setType = (measurementType: MeasurementType) => setForm((f) => {
    const unmeasured = UNMEASURED.includes(measurementType);
    return {
      ...f,
      measurementType,
      direction: unmeasured ? 'NOT_APPLICABLE' : f.direction === 'NOT_APPLICABLE' ? 'HIGHER_IS_BETTER' : f.direction,
      defaultTarget: unmeasured ? '' : f.defaultTarget,
      minimumExpected: unmeasured ? '' : f.minimumExpected,
      stretchTarget: unmeasured ? '' : f.stretchTarget,
      currencyCode: measurementType === 'CURRENCY' ? (f.currencyCode ?? 'INR') : null,
      unitLabel: measurementType === 'PERCENTAGE' && !f.unitLabel ? '%' : f.unitLabel,
      ratingScaleId: RATED.includes(measurementType) ? f.ratingScaleId : null,
    };
  });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { kpiCode, ...rest } = form;
    const settings: KpiSettings = {
      ...rest,
      kpiName: rest.kpiName.trim(),
      description: orNull(rest.description),
      unitLabel: orNull(rest.unitLabel),
      defaultTarget: orNull(rest.defaultTarget),
      minimumExpected: orNull(rest.minimumExpected),
      stretchTarget: orNull(rest.stretchTarget),
      defaultMaxMarks: orNull(rest.defaultMaxMarks),
      evaluationInstructions: orNull(rest.evaluationInstructions),
    };
    try {
      const saved = kpi ? await kpisApi.update(kpi.id, { ...settings, expectedRevision: kpi.revision }) : await kpisApi.create({ ...settings, kpiCode: kpiCode.trim() });
      toast.success(kpi ? `${saved.kpiCode} saved` : `${saved.kpiCode} created`);
      onClose(true);
    } catch (e) {
      setError({ message: errorText(e), stale: e instanceof ApiError && e.status === 409 && !!kpi });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        The KPI could not be loaded: {loadError} <button type="button" className="font-semibold underline" onClick={load}>Try again</button>
      </div>
    );
  }
  if (kpiId && !kpi) return <div className="h-40 animate-pulse rounded-xl bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading KPI</span></div>;

  const unmeasured = UNMEASURED.includes(form.measurementType);
  const lower = form.direction === 'LOWER_IS_BETTER';
  const usableScales = scales.filter((s) => s.currentVersion);
  const currentScale = kpi?.ratingScale && !usableScales.some((s) => s.id === kpi.ratingScale?.id) ? kpi.ratingScale : null;

  return (
    <form onSubmit={save} className="space-y-4" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onClose(false)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />KPI library</Button>
          <h2 id={`${id}-title`} className="text-base font-bold text-slate-900 dark:text-slate-100">{kpi ? `${kpi.kpiCode} · ${kpi.kpiName}` : 'New KPI'}</h2>
          {kpi?.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
        </div>
        {!readOnly && <Button type="submit" loading={saving} disabled={saving}>{kpi ? 'Save KPI' : 'Create KPI'}</Button>}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error.message}{' '}
          {error.stale && <button type="button" className="font-semibold underline" onClick={load}>Reload the latest version</button>}
        </p>
      )}
      {kpi && kpi.usedBy.length > 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-400">
          Suggested by {kpi.usedBy.map((u) => u.kraName).join(', ')}. Changes apply to templates published from now on; appraisals already under way keep the definition they started with.
        </p>
      )}

      <fieldset disabled={readOnly} className="space-y-4">
        <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-what`}>
          <h3 id={`${id}-what`} className="text-sm font-bold text-slate-900 dark:text-slate-100">What is measured</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-code`} className={labelClass}>Code</label>
              <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={form.kpiCode} disabled={!!kpi} required maxLength={64}
                onChange={(e) => set('kpiCode', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} aria-describedby={`${id}-code-hint`} />
              <p id={`${id}-code-hint`} className={hintClass}>Such as REVENUE_ACHIEVEMENT. It can’t change later.</p>
            </div>
            <div>
              <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
              <input id={`${id}-name`} className={fieldClass} value={form.kpiName} required maxLength={160} onChange={(e) => set('kpiName', e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea id={`${id}-description`} rows={2} className={fieldClass} value={form.description ?? ''} maxLength={2000} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-type`} className={labelClass}>Measured as</label>
              <select id={`${id}-type`} className={fieldClass} value={form.measurementType} onChange={(e) => setType(e.target.value as MeasurementType)}>
                {Object.entries(MEASUREMENT).map(([value, m]) => <option key={value} value={value}>{m.label}</option>)}
              </select>
              <p className={hintClass}>{MEASUREMENT[form.measurementType].hint}</p>
            </div>
            {form.measurementType === 'CURRENCY' ? (
              <div>
                <label htmlFor={`${id}-currency`} className={labelClass}>Currency</label>
                <input id={`${id}-currency`} className={`${fieldClass} font-mono uppercase`} value={form.currencyCode ?? ''} required maxLength={3}
                  onChange={(e) => set('currencyCode', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
              </div>
            ) : !unmeasured && (
              <div>
                <label htmlFor={`${id}-unit`} className={labelClass}>Unit <span className="font-normal text-slate-400">(optional)</span></label>
                <input id={`${id}-unit`} className={fieldClass} value={form.unitLabel ?? ''} maxLength={32} placeholder="such as hours" onChange={(e) => set('unitLabel', e.target.value)} />
              </div>
            )}
          </div>
          {RATED.includes(form.measurementType) && (
            <div>
              <label htmlFor={`${id}-scale`} className={labelClass}>Rating scale</label>
              <select id={`${id}-scale`} className={fieldClass} value={form.ratingScaleId ?? ''} required onChange={(e) => set('ratingScaleId', e.target.value || null)}>
                <option value="">Choose…</option>
                {currentScale && <option value={currentScale.id}>{currentScale.name} (archived)</option>}
                {usableScales.map((s) => <option key={s.id} value={s.id}>{s.scaleName}</option>)}
              </select>
              {usableScales.length === 0 && <p className={hintClass}>No published rating scale yet. Create and publish one under Rating scales first.</p>}
            </div>
          )}
        </section>

        {!unmeasured && (
          <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-targets`}>
            <div>
              <h3 id={`${id}-targets`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Suggested targets</h3>
              <p className={hintClass}>Starting values for appraisals. Each employee’s own target can be set when their appraisal is prepared.</p>
            </div>
            <fieldset>
              <legend className={labelClass}>Which result is better?</legend>
              <div className="flex flex-wrap gap-4">
                {(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'] as const).map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="radio" name={`${id}-direction`} checked={form.direction === d} onChange={() => set('direction', d)} />
                    {DIRECTION[d]}{d === 'LOWER_IS_BETTER' && <span className="text-xs text-slate-500">(such as a defect rate)</span>}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor={`${id}-threshold`} className={labelClass}>Threshold <span className="font-normal text-slate-400">(optional)</span></label>
                <input id={`${id}-threshold`} className={fieldClass} inputMode="decimal" value={form.minimumExpected ?? ''} onChange={(e) => set('minimumExpected', e.target.value)} />
                <p className={hintClass}>{lower ? 'The highest result still accepted.' : 'The lowest result still accepted.'}</p>
              </div>
              <div>
                <label htmlFor={`${id}-target`} className={labelClass}>Target <span className="font-normal text-slate-400">(optional)</span></label>
                <input id={`${id}-target`} className={fieldClass} inputMode="decimal" value={form.defaultTarget ?? ''} onChange={(e) => set('defaultTarget', e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${id}-stretch`} className={labelClass}>Stretch target <span className="font-normal text-slate-400">(optional)</span></label>
                <input id={`${id}-stretch`} className={fieldClass} inputMode="decimal" value={form.stretchTarget ?? ''} onChange={(e) => set('stretchTarget', e.target.value)} />
                <p className={hintClass}>{lower ? 'The lowest result that still earns more.' : 'The highest result that still earns more.'}</p>
              </div>
            </div>
          </section>
        )}

        <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-review`}>
          <h3 id={`${id}-review`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Reviewing it</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-marks`} className={labelClass}>Suggested maximum marks <span className="font-normal text-slate-400">(optional)</span></label>
              <input id={`${id}-marks`} className={fieldClass} inputMode="decimal" value={form.defaultMaxMarks ?? ''} onChange={(e) => set('defaultMaxMarks', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-evidence`} className={labelClass}>Supporting evidence</label>
              <select id={`${id}-evidence`} className={fieldClass} value={form.evidenceRequirement} onChange={(e) => set('evidenceRequirement', e.target.value as Form['evidenceRequirement'])}>
                {Object.entries(EVIDENCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-instructions`} className={labelClass}>Instructions for reviewers <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea id={`${id}-instructions`} rows={3} className={fieldClass} value={form.evaluationInstructions ?? ''} maxLength={4000} onChange={(e) => set('evaluationInstructions', e.target.value)} />
          </div>
        </section>
      </fieldset>
      {kpi && <p className="text-xs text-slate-500">Revision {kpi.revision}{kpi.updatedBy ? ` · last changed by ${kpi.updatedBy}` : ''}</p>}
    </form>
  );
};
