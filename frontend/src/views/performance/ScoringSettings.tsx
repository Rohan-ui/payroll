import React, { useId } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { ScoringMethod } from '../../api/performance.api';
import { fieldClass, hintClass, labelClass } from '../payroll/payroll-format';

type Config = Record<string, unknown>;
interface Slab { from: string; to: string | null; scorePercent: string }

/** The settings of a scoring method that has any: scoring points, slabs, or scores for yes and no. */
export const ScoringSettings: React.FC<{ method: ScoringMethod; config: Config; onChange: (config: Config) => void; name: string; lowerIsBetter: boolean }> = ({
  method, config, onChange, name, lowerIsBetter,
}) => {
  const id = useId();
  const value = (key: string) => (typeof config[key] === 'string' ? (config[key] as string) : '');
  const set = (key: string, v: unknown) => onChange({ ...config, [key]: v });
  const percent = (key: string, label: string) => (
    <div>
      <label htmlFor={`${id}-${key}`} className={labelClass}>{label}</label>
      <input id={`${id}-${key}`} className={fieldClass} inputMode="decimal" value={value(key)} onChange={(e) => set(key, e.target.value)} aria-label={`${name}: ${label}`} />
    </div>
  );

  if (method === 'LINEAR_BETWEEN') {
    return (
      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className={`${labelClass} sm:col-span-4`}>Scores (%) at each point</legend>
        {percent('belowThresholdScore', lowerIsBetter ? 'Above threshold' : 'Below threshold')}
        {percent('thresholdScore', 'At threshold')}
        {percent('targetScore', 'At target')}
        {percent('stretchScore', 'At stretch')}
      </fieldset>
    );
  }

  if (method === 'YES_NO') {
    return (
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className={`${labelClass} sm:col-span-2`}>Scores (%)</legend>
        {percent('yesScore', 'For yes')}
        {percent('noScore', 'For no')}
      </fieldset>
    );
  }

  if (method === 'SLABS') {
    const slabs = (Array.isArray(config.slabs) ? config.slabs : []) as Slab[];
    const setSlab = (i: number, patch: Partial<Slab>) => set('slabs', slabs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    const basis = config.basis === 'ACTUAL' ? 'ACTUAL' : 'ACHIEVEMENT_PERCENT';
    return (
      <fieldset className="space-y-2">
        <legend className={labelClass}>Slabs</legend>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
          <label className="flex items-center gap-2"><input type="radio" name={`${id}-basis`} checked={basis === 'ACHIEVEMENT_PERCENT'} onChange={() => set('basis', 'ACHIEVEMENT_PERCENT')} />On achievement against target (%)</label>
          <label className="flex items-center gap-2"><input type="radio" name={`${id}-basis`} checked={basis === 'ACTUAL'} onChange={() => set('basis', 'ACTUAL')} />On the actual result</label>
        </div>
        <p className={hintClass}>Each slab runs from its value up to (not including) the next; leave the last “up to” empty for no upper end.</p>
        <ol className="space-y-2">
          {slabs.map((s, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">From
                <input className={`${fieldClass} w-24`} inputMode="decimal" value={s.from} aria-label={`${name}: slab ${i + 1} from`} onChange={(e) => setSlab(i, { from: e.target.value })} />
              </label>
              <label className="text-xs text-slate-600 dark:text-slate-400">Up to
                <input className={`${fieldClass} w-24`} inputMode="decimal" value={s.to ?? ''} aria-label={`${name}: slab ${i + 1} up to`} onChange={(e) => setSlab(i, { to: e.target.value === '' ? null : e.target.value })} />
              </label>
              <label className="text-xs text-slate-600 dark:text-slate-400">Scores (%)
                <input className={`${fieldClass} w-24`} inputMode="decimal" value={s.scorePercent} aria-label={`${name}: slab ${i + 1} score`} onChange={(e) => setSlab(i, { scorePercent: e.target.value })} />
              </label>
              <Button type="button" size="sm" variant="ghost" onClick={() => set('slabs', slabs.filter((_, j) => j !== i))} aria-label={`${name}: remove slab ${i + 1}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
            </li>
          ))}
        </ol>
        <Button type="button" size="sm" variant="outline" disabled={slabs.length >= 20}
          onClick={() => set('slabs', [...slabs.map((s, i) => (i === slabs.length - 1 && s.to === null ? { ...s, to: s.from } : s)), { from: slabs[slabs.length - 1]?.to ?? slabs[slabs.length - 1]?.from ?? '0', to: null, scorePercent: '100' }])}>
          <Plus className="h-4 w-4" aria-hidden="true" />Add slab
        </Button>
      </fieldset>
    );
  }

  return null;
};
