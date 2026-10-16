import React, { useId } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { krasApi, kpisApi, type FieldType, type MeasurementType, type ScoringMethod, type TemplateProblem } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { toast } from '../../lib/toast';
import { DIRECTION, MEASUREMENT, weightTotal } from './performance-format';
import { SearchPicker } from './SearchPicker';
import { ScoringSettings } from './ScoringSettings';
import {
  DIRECT_METHODS, FIELD_TYPE, FILLED_BY, METHOD, METHODS_FOR, MISSING_RULE, MODEL, TARGET_METHODS, VISIBILITY, WEIGHT_RULE,
  defaultConfig, defaultFieldConfig, keyFrom, kpiLineFromKpi, kraLineOf, type DraftForm, type FieldForm, type KpiForm, type KraForm,
} from './template-form';

/** A rating scale people can choose: published, with whether it has final rating bands and if it rates in marks. */
export interface ScaleChoice { id: string; name: string; marks: boolean; bands: boolean }

const findKras = (term: string) => krasApi.list({ search: term, status: 'ACTIVE', limit: 20 }).then((p) => p.items.map((k) => ({ id: k.id, name: k.kraName, code: k.kraCode })));
const findKpis = (term: string) => kpisApi.list({ search: term, status: 'ACTIVE', limit: 20 }).then((p) => p.items.map((k) => ({ id: k.id, name: k.kpiName, code: k.kpiCode })));

const move = <T,>(list: T[], index: number, by: -1 | 1) => {
  const copy = [...list];
  [copy[index], copy[index + by]] = [copy[index + by], copy[index]];
  return copy;
};

const Problems: React.FC<{ problems: TemplateProblem[] }> = ({ problems }) => (problems.length ? (
  <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
    {problems.map((p, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{p.message}</li>)}
  </ul>
) : null);

/**
 * A template version's scoring policy, KRAs with their KPIs, and questions.
 * Editable for a draft; a published version is shown through it read-only.
 */
export const TemplateDraftForm: React.FC<{
  form: DraftForm;
  onChange: (form: DraftForm) => void;
  readOnly: boolean;
  scales: ScaleChoice[];
  problems: TemplateProblem[];
}> = ({ form, onChange, readOnly, scales, problems }) => {
  const id = useId();
  const marks = form.scoringModel === 'MARKS';
  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => onChange({ ...form, [key]: value });
  const setKra = (i: number, patch: Partial<KraForm>) => set('kras', form.kras.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const setKpi = (i: number, p: number, patch: Partial<KpiForm>) => setKra(i, { kpis: form.kras[i].kpis.map((k, j) => (j === p ? { ...k, ...patch } : k)) });
  const setField = (i: number, patch: Partial<FieldForm>) => set('fields', form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const at = (prefix: string) => problems.filter((p) => p.path === prefix || p.path.startsWith(`${prefix}.`));
  const ownProblems = (prefix: string) => problems.filter((p) => p.path === prefix || (p.path.startsWith(`${prefix}.`) && !p.path.startsWith(`${prefix}.kpis.`)));
  const weightKey = marks ? 'maxMarks' : 'weightPercent';
  const weightLabel = marks ? 'Marks' : 'Weight (%)';

  const addKra = async (kraId: string) => {
    try {
      const kra = await krasApi.get(kraId);
      set('kras', [...form.kras, kraLineOf(kra)]);
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const addKpi = async (i: number, kpiId: string) => {
    if (form.kras.some((k) => k.kpis.some((p) => p.kpiId === kpiId))) { toast.error('That KPI is already in this template. A KPI can be counted once.'); return; }
    try {
      setKra(i, { kpis: [...form.kras[i].kpis, kpiLineFromKpi(await kpisApi.get(kpiId))] });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const scaleSelect = (label: string, value: string | null, onPick: (v: string | null) => void, filter: (s: ScaleChoice) => boolean = () => true, describedBy?: string) => (
    <label className="block text-xs">
      <span className={labelClass}>{label}</span>
      <select className={fieldClass} value={value ?? ''} onChange={(e) => onPick(e.target.value || null)} aria-describedby={describedBy}>
        <option value="">Choose…</option>
        {value && !scales.some((s) => s.id === value) && <option value={value}>Current scale (no longer offered)</option>}
        {scales.filter(filter).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );

  const scored = form.fields.filter((f) => f.scored);
  const overall = weightTotal([...form.kras.map((k) => k[weightKey]), ...scored.map((f) => f[weightKey])]);
  const required = marks ? (form.totalMarks.trim() || null) : '100';
  const totalOk = overall !== null && required !== null && overall === weightTotal([required]);

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-4">
      <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-policy`}>
        <h3 id={`${id}-policy`} className="text-sm font-bold text-slate-900 dark:text-slate-100">How the appraisal is scored</h3>
        <Problems problems={at('policy')} />
        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset>
            <legend className={labelClass}>Scored in</legend>
            {(Object.keys(MODEL) as (keyof typeof MODEL)[]).map((m) => (
              <label key={m} className="mt-1 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="radio" name={`${id}-model`} checked={form.scoringModel === m} onChange={() => set('scoringModel', m)} className="mt-1" />
                <span>{MODEL[m].label}<span className="block text-xs text-slate-500">{MODEL[m].hint}</span></span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className={labelClass}>Weights</legend>
            {(Object.keys(WEIGHT_RULE) as (keyof typeof WEIGHT_RULE)[]).map((r) => (
              <label key={r} className="mt-1 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="radio" name={`${id}-rule`} checked={form.weightRule === r} onChange={() => set('weightRule', r)} className="mt-1" />
                <span>{WEIGHT_RULE[r].label}<span className="block text-xs text-slate-500">{WEIGHT_RULE[r].hint}</span></span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {marks && (
            <div>
              <label htmlFor={`${id}-total`} className={labelClass}>Total marks</label>
              <input id={`${id}-total`} className={fieldClass} inputMode="decimal" value={form.totalMarks} onChange={(e) => set('totalMarks', e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor={`${id}-missing`} className={labelClass}>A line nobody rated</label>
            <select id={`${id}-missing`} className={fieldClass} value={form.missingRatingRule} onChange={(e) => set('missingRatingRule', e.target.value as DraftForm['missingRatingRule'])}>
              {(Object.keys(MISSING_RULE) as (keyof typeof MISSING_RULE)[]).map((r) => <option key={r} value={r}>{MISSING_RULE[r].label}</option>)}
            </select>
            <p className={hintClass}>{MISSING_RULE[form.missingRatingRule].hint}</p>
          </div>
          <div>
            <label htmlFor={`${id}-decimals`} className={labelClass}>Final score decimals</label>
            <select id={`${id}-decimals`} className={fieldClass} value={form.scoreDecimals} onChange={(e) => set('scoreDecimals', Number(e.target.value))}>
              {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className={hintClass}>Rounded once, at the end.</p>
          </div>
          <div>
            {scaleSelect('Final rating bands from', form.finalScaleId, (v) => set('finalScaleId', v), (s) => s.bands)}
            <p className={hintClass}>A scale with final rating bands names the result, such as “Exceeds expectations”.</p>
          </div>
        </div>
      </section>

      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-kras`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id={`${id}-kras`} className="text-sm font-bold text-slate-900 dark:text-slate-100">KRAs and KPIs</h3>
            <p className={hintClass}>Each KRA’s {marks ? 'marks count' : 'weight counts'} in the appraisal; each KPI’s {marks ? 'marks count' : 'weight counts'} within its KRA.</p>
          </div>
          {form.kras.length > 0 && (
            <p role="status" className={`text-xs font-semibold ${totalOk || form.weightRule === 'NORMALIZE' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {overall === null ? `Give every KRA${scored.length ? ' and scored question' : ''} its ${marks ? 'marks' : 'weight'}` : `KRAs${scored.length ? ' and scored questions' : ''} total ${overall}${marks ? ' marks' : '%'}`}
              {overall !== null && form.weightRule === 'MUST_TOTAL' && !totalOk && required ? ` (needs ${required}${marks ? '' : '%'})` : ''}
              {overall !== null && form.weightRule === 'NORMALIZE' ? ' (shared out in proportion)' : ''}
            </p>
          )}
        </div>
        <Problems problems={problems.filter((p) => p.path === 'kras')} />
        {form.kras.length === 0 && <p className="text-sm text-slate-500">No KRAs yet. Add the result areas people with this template are appraised on.</p>}

        {form.kras.map((kra, i) => {
          const direct = kra.kpis.length === 0;
          const kpiTotal = kra.kpis.length ? weightTotal(kra.kpis.map((p) => p[weightKey])) : null;
          const kpiRequired = marks ? (kra.maxMarks.trim() ? weightTotal([kra.maxMarks]) : null) : '100';
          const scaleIsMarks = scales.find((s) => s.id === kra.ratingScaleId)?.marks ?? false;
          return (
            <article key={kra.kraId} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]" aria-label={`KRA ${kra.kraName}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{kra.kraCode}</span>
                  <h4 className="break-words text-sm font-semibold text-slate-800 dark:text-slate-200">{kra.kraName}</h4>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400">{weightLabel}
                    <input className={`${fieldClass} w-24`} inputMode="decimal" value={kra[weightKey]} aria-label={`${kra.kraName}: ${marks ? 'marks' : 'weight in the appraisal (%)'}`}
                      onChange={(e) => setKra(i, { [weightKey]: e.target.value })} />
                  </label>
                  {!readOnly && (
                    <span className="flex">
                      <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => set('kras', move(form.kras, i, -1))} aria-label={`Move ${kra.kraName} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                      <Button type="button" size="sm" variant="ghost" disabled={i === form.kras.length - 1} onClick={() => set('kras', move(form.kras, i, 1))} aria-label={`Move ${kra.kraName} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => set('kras', form.kras.filter((_, j) => j !== i))} aria-label={`Remove ${kra.kraName}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
                    </span>
                  )}
                </div>
              </div>
              <Problems problems={ownProblems(`kras.${i}`)} />

              {direct && (
                <div className="grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:bg-white/5">
                  <label className="block text-xs">
                    <span className={labelClass}>Rated as a whole by</span>
                    <select className={fieldClass} value={kra.scoringMethod ?? ''} aria-label={`${kra.kraName}: rated by`} onChange={(e) => setKra(i, { scoringMethod: (e.target.value || null) as ScoringMethod | null })}>
                      <option value="">Choose…</option>
                      {DIRECT_METHODS.map((m) => <option key={m} value={m}>{METHOD[m].label}</option>)}
                    </select>
                  </label>
                  {kra.scoringMethod === 'RATING_SCALE' && scaleSelect('Rating scale', kra.ratingScaleId, (v) => setKra(i, { ratingScaleId: v }))}
                  {!marks && (kra.scoringMethod === 'DIRECT_MARKS' || (kra.scoringMethod === 'RATING_SCALE' && scaleIsMarks)) && (
                    <label className="text-xs text-slate-600 dark:text-slate-400">Maximum marks
                      <input className={fieldClass} inputMode="decimal" value={kra.maxMarks} aria-label={`${kra.kraName}: maximum marks`} onChange={(e) => setKra(i, { maxMarks: e.target.value })} />
                    </label>
                  )}
                  {kra.scoringMethod === 'DIRECT_MARKS' && (
                    <label className="text-xs text-slate-600 dark:text-slate-400">Lowest marks that can be given
                      <input className={fieldClass} inputMode="decimal" value={kra.minMarks} aria-label={`${kra.kraName}: lowest marks`} onChange={(e) => setKra(i, { minMarks: e.target.value })} />
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={kra.allowsExemption} onChange={(e) => setKra(i, { allowsExemption: e.target.checked })} className="rounded border-slate-300" />
                    Can be marked exempt
                  </label>
                </div>
              )}

              {kra.kpis.length > 0 && (
                <ol className="space-y-2">
                  {kra.kpis.map((kpi, p) => (
                    <KpiLine key={kpi.kpiId} kpi={kpi} kraName={kra.kraName} marks={marks} readOnly={readOnly} scales={scales} scaleSelect={scaleSelect}
                      problems={at(`kras.${i}.kpis.${p}`)} first={p === 0} last={p === kra.kpis.length - 1}
                      onChange={(patch) => setKpi(i, p, patch)}
                      onMove={(by) => setKra(i, { kpis: move(kra.kpis, p, by) })}
                      onRemove={() => setKra(i, { kpis: kra.kpis.filter((_, j) => j !== p) })} />
                  ))}
                </ol>
              )}
              {kra.kpis.length > 0 && (
                <p className={`text-xs ${kpiTotal !== null && kpiRequired !== null && kpiTotal === kpiRequired ? 'text-slate-500' : 'text-amber-700 dark:text-amber-400'}`}>
                  KPIs total {kpiTotal ?? '—'}{marks ? ' marks' : '%'}{kpiRequired && form.weightRule === 'MUST_TOTAL' ? ` of ${kpiRequired}${marks ? '' : '%'}` : ''}
                </p>
              )}
              {!readOnly && (
                <div className="sm:w-1/2">
                  <SearchPicker label={`Add a KPI to ${kra.kraName}`} noun="KPIs" find={findKpis} exclude={form.kras.flatMap((k) => k.kpis.map((x) => x.kpiId))}
                    hint={direct ? 'With KPIs, the KRA is scored from them instead of rated as a whole.' : undefined}
                    onPick={(k) => addKpi(i, k.id)} />
                </div>
              )}
            </article>
          );
        })}
        {!readOnly && (
          <div className="sm:w-1/2">
            <SearchPicker label="Add a KRA" noun="KRAs" find={findKras} exclude={form.kras.map((k) => k.kraId)} hint="Its suggested KPIs, weights and scale come with it; change them here for this template." onPick={(k) => addKra(k.id)} />
          </div>
        )}
      </section>

      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-fields`}>
        <div>
          <h3 id={`${id}-fields`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Questions</h3>
          <p className={hintClass}>Asked on the appraisal form besides the KRAs and KPIs (each KPI already asks for its actual result). Rating and number questions can count toward the score.</p>
        </div>
        {form.fields.length === 0 && <p className="text-sm text-slate-500">No questions yet.</p>}
        {form.fields.map((field, f) => (
          <FieldLine key={f} field={field} index={f} marks={marks} readOnly={readOnly} scaleSelect={scaleSelect} problems={at(`fields.${f}`)}
            first={f === 0} last={f === form.fields.length - 1}
            onChange={(patch) => setField(f, patch)} onMove={(by) => set('fields', move(form.fields, f, by))} onRemove={() => set('fields', form.fields.filter((_, j) => j !== f))} />
        ))}
        {!readOnly && (
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold">Add a question:</span>
            <select className={`${fieldClass} w-auto`} value="" aria-label="Add a question of this kind"
              onChange={(e) => {
                const type = e.target.value as FieldType;
                if (!type) return;
                const label = FIELD_TYPE[type];
                set('fields', [...form.fields, {
                  key: keyFrom(label, form.fields.map((x) => x.key)), type, label, description: '', required: false, filledBy: 'SELF', visibility: 'ALWAYS',
                  config: defaultFieldConfig(type), ratingScaleId: null, scored: false, weightPercent: '', maxMarks: '',
                }]);
              }}>
              <option value="">Choose a kind…</option>
              {(Object.keys(FIELD_TYPE) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPE[t]}</option>)}
            </select>
          </label>
        )}
      </section>

      {!readOnly && (
        <div>
          <label htmlFor={`${id}-note`} className={labelClass}>What changed <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-note`} className={fieldClass} value={form.changeNote} maxLength={500} onChange={(e) => set('changeNote', e.target.value)} />
        </div>
      )}
    </fieldset>
  );
};

type ScaleSelect = (label: string, value: string | null, onPick: (v: string | null) => void, filter?: (s: ScaleChoice) => boolean) => React.ReactNode;

const KpiLine: React.FC<{
  kpi: KpiForm; kraName: string; marks: boolean; readOnly: boolean; scales: ScaleChoice[]; scaleSelect: ScaleSelect; problems: TemplateProblem[];
  first: boolean; last: boolean; onChange: (patch: Partial<KpiForm>) => void; onMove: (by: -1 | 1) => void; onRemove: () => void;
}> = ({ kpi, kraName, marks, readOnly, scales, scaleSelect, problems, first, last, onChange, onMove, onRemove }) => {
  const name = `${kraName} → ${kpi.kpiName}`;
  const targets = TARGET_METHODS.includes(kpi.scoringMethod);
  const lower = kpi.direction === 'LOWER_IS_BETTER';
  const scaleIsMarks = scales.find((s) => s.id === kpi.ratingScaleId)?.marks ?? false;
  const needsMax = !marks && (kpi.scoringMethod === 'DIRECT_MARKS' || (kpi.scoringMethod === 'RATING_SCALE' && scaleIsMarks));
  const weightKey = marks ? 'maxMarks' : 'weightPercent';
  return (
    <li className="space-y-3 rounded-md bg-slate-50 p-3 dark:bg-white/5" aria-label={`KPI ${kpi.kpiName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{kpi.kpiCode}</span>
          <span className="block break-words text-sm text-slate-700 dark:text-slate-300">{kpi.kpiName}</span>
          <span className="text-xs text-slate-500">{MEASUREMENT[kpi.measurementType as MeasurementType].label}{kpi.direction !== 'NOT_APPLICABLE' ? ` · ${DIRECTION[kpi.direction]}` : ''}</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600 dark:text-slate-400">{marks ? 'Marks' : 'Weight in KRA (%)'}
            <input className={`${fieldClass} w-24`} inputMode="decimal" value={kpi[weightKey]} aria-label={`${name}: ${marks ? 'marks' : 'weight within the KRA (%)'}`} onChange={(e) => onChange({ [weightKey]: e.target.value })} />
          </label>
          {!readOnly && (
            <span className="flex">
              <Button type="button" size="sm" variant="ghost" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${kpi.kpiName} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
              <Button type="button" size="sm" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${kpi.kpiName} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
              <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${kpi.kpiName}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs sm:col-span-2">
          <span className={labelClass}>Scored by</span>
          <select className={fieldClass} value={kpi.scoringMethod} aria-label={`${name}: scored by`}
            onChange={(e) => { const m = e.target.value as ScoringMethod; onChange({ scoringMethod: m, scoringConfig: defaultConfig(m) }); }}>
            {METHODS_FOR[kpi.measurementType].map((m) => <option key={m} value={m}>{METHOD[m].label}</option>)}
          </select>
          <span className={hintClass}>{METHOD[kpi.scoringMethod].hint}</span>
        </label>
        {kpi.scoringMethod === 'RATING_SCALE' && scaleSelect('Rating scale', kpi.ratingScaleId, (v) => onChange({ ratingScaleId: v }))}
        {needsMax && (
          <label className="text-xs text-slate-600 dark:text-slate-400">Maximum marks
            <input className={fieldClass} inputMode="decimal" value={kpi.maxMarks} aria-label={`${name}: maximum marks`} onChange={(e) => onChange({ maxMarks: e.target.value })} />
          </label>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={kpi.allowsExemption} onChange={(e) => onChange({ allowsExemption: e.target.checked })} className="rounded border-slate-300" />
          Can be marked exempt
        </label>
      </div>
      {targets && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-xs text-slate-700 dark:text-slate-300" role="radiogroup" aria-label={`${name}: targets`}>
            <label className="flex items-center gap-2"><input type="radio" checked={kpi.targetSource === 'TEMPLATE'} onChange={() => onChange({ targetSource: 'TEMPLATE' })} />Same targets for everyone</label>
            <label className="flex items-center gap-2"><input type="radio" checked={kpi.targetSource === 'PER_EMPLOYEE'} onChange={() => onChange({ targetSource: 'PER_EMPLOYEE' })} />Set for each employee when the appraisal is prepared</label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {kpi.scoringMethod === 'LINEAR_BETWEEN' && (
              <label className="text-xs text-slate-600 dark:text-slate-400">Threshold{kpi.targetSource === 'PER_EMPLOYEE' ? ' (default)' : ''}
                <input className={fieldClass} inputMode="decimal" value={kpi.threshold} aria-label={`${name}: threshold`} onChange={(e) => onChange({ threshold: e.target.value })} />
              </label>
            )}
            <label className="text-xs text-slate-600 dark:text-slate-400">Target{kpi.unitLabel ? ` (${kpi.unitLabel})` : ''}{kpi.targetSource === 'PER_EMPLOYEE' ? ' (default)' : ''}
              <input className={fieldClass} inputMode="decimal" value={kpi.target} aria-label={`${name}: target`} onChange={(e) => onChange({ target: e.target.value })} />
            </label>
            {kpi.scoringMethod === 'LINEAR_BETWEEN' && (
              <label className="text-xs text-slate-600 dark:text-slate-400">Stretch target (optional)
                <input className={fieldClass} inputMode="decimal" value={kpi.stretch} aria-label={`${name}: stretch target`} onChange={(e) => onChange({ stretch: e.target.value })} />
              </label>
            )}
          </div>
        </div>
      )}
      <ScoringSettings method={kpi.scoringMethod} config={kpi.scoringConfig} name={name} lowerIsBetter={lower} onChange={(scoringConfig) => onChange({ scoringConfig })} />
      <Problems problems={problems} />
    </li>
  );
};

const FieldLine: React.FC<{
  field: FieldForm; index: number; marks: boolean; readOnly: boolean; scaleSelect: ScaleSelect; problems: TemplateProblem[];
  first: boolean; last: boolean; onChange: (patch: Partial<FieldForm>) => void; onMove: (by: -1 | 1) => void; onRemove: () => void;
}> = ({ field, index, marks, readOnly, scaleSelect, problems, first, last, onChange, onMove, onRemove }) => {
  const name = field.label.trim() || `Question ${index + 1}`;
  const config = field.config;
  const options = Array.isArray(config.options) ? (config.options as string[]) : [];
  const scorable = field.type === 'RATING' || field.type === 'NUMBER';
  return (
    <article className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]" aria-label={`Question ${name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{FIELD_TYPE[field.type]}</span>
        {!readOnly && (
          <span className="flex">
            <Button type="button" size="sm" variant="ghost" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
            <Button type="button" size="sm" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${name} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
            <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${name}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600 dark:text-slate-400">Question
          <input className={fieldClass} value={field.label} maxLength={200} aria-label={`Question ${index + 1}: label`} onChange={(e) => onChange({ label: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-400">Help text (optional)
          <input className={fieldClass} value={field.description} maxLength={1000} aria-label={`Question ${index + 1}: help text`} onChange={(e) => onChange({ description: e.target.value })} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-slate-600 dark:text-slate-400">Answered by
          <select className={fieldClass} value={field.filledBy} aria-label={`${name}: answered by`} onChange={(e) => onChange({ filledBy: e.target.value as FieldForm['filledBy'] })}>
            {(Object.keys(FILLED_BY) as FieldForm['filledBy'][]).map((v) => <option key={v} value={v}>{FILLED_BY[v]}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-400">Employee sees reviewers’ answers
          <select className={fieldClass} value={field.visibility} aria-label={`${name}: employee sees answers`} onChange={(e) => onChange({ visibility: e.target.value as FieldForm['visibility'] })}>
            {(Object.keys(VISIBILITY) as FieldForm['visibility'][]).map((v) => <option key={v} value={v}>{VISIBILITY[v]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} className="rounded border-slate-300" />Must be answered
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-400">Key
          <input className={`${fieldClass} font-mono`} value={field.key} maxLength={40} aria-label={`${name}: key`} onChange={(e) => onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
        </label>
      </div>

      {field.type === 'RATING' && scaleSelect('Rating scale', field.ratingScaleId, (v) => onChange({ ratingScaleId: v }), (s) => !s.marks)}
      {field.type === 'NUMBER' && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(['min', 'max'] as const).map((k) => (
            <label key={k} className="text-xs text-slate-600 dark:text-slate-400">{k === 'min' ? 'Lowest answer' : 'Highest answer'}
              <input className={fieldClass} inputMode="decimal" value={(config[k] as string | null) ?? ''} aria-label={`${name}: ${k === 'min' ? 'lowest' : 'highest'} answer`}
                onChange={(e) => onChange({ config: { ...config, [k]: e.target.value === '' ? null : e.target.value } })} />
            </label>
          ))}
          <label className="text-xs text-slate-600 dark:text-slate-400">Decimal places
            <select className={fieldClass} value={Number(config.decimals ?? 0)} onChange={(e) => onChange({ config: { ...config, decimals: Number(e.target.value) } })}>
              {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
      {'maxLength' in config && (
        <label className="block text-xs text-slate-600 dark:text-slate-400 sm:w-1/3">Longest answer (characters)
          <input className={fieldClass} inputMode="numeric" value={String(config.maxLength ?? '')} aria-label={`${name}: longest answer`}
            onChange={(e) => onChange({ config: { ...config, maxLength: e.target.value === '' ? '' : Number(e.target.value.replace(/\D/g, '')) } })} />
        </label>
      )}
      {(field.type === 'DROPDOWN' || field.type === 'MULTI_SELECT') && (
        <label className="block text-xs text-slate-600 dark:text-slate-400">Choices, one per line
          <textarea className={fieldClass} rows={Math.min(8, Math.max(2, options.length))} value={options.join('\n')} aria-label={`${name}: choices`}
            onChange={(e) => onChange({ config: { ...config, options: e.target.value.split('\n') } })} />
        </label>
      )}
      {field.type === 'ATTACHMENT' && (
        <label className="block text-xs text-slate-600 dark:text-slate-400 sm:w-1/3">Files allowed
          <input className={fieldClass} inputMode="numeric" value={String(config.maxFiles ?? '')} aria-label={`${name}: files allowed`}
            onChange={(e) => onChange({ config: { ...config, maxFiles: Number(e.target.value.replace(/\D/g, '')) } })} />
        </label>
      )}
      {scorable && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={field.scored} onChange={(e) => onChange({ scored: e.target.checked })} className="rounded border-slate-300" />Counts toward the score
          </label>
          {field.scored && (
            <label className="text-xs text-slate-600 dark:text-slate-400">{marks ? 'Marks' : 'Weight in the appraisal (%)'}
              <input className={`${fieldClass} w-24`} inputMode="decimal" value={marks ? field.maxMarks : field.weightPercent} aria-label={`${name}: ${marks ? 'marks' : 'weight (%)'}`}
                onChange={(e) => onChange(marks ? { maxMarks: e.target.value } : { weightPercent: e.target.value })} />
            </label>
          )}
        </div>
      )}
      <Problems problems={problems} />
    </article>
  );
};

