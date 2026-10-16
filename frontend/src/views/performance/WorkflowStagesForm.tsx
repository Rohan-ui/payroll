import React, { useId } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { krasApi, performanceOptionsApi, type Named, type TemplateProblem } from '../../api/performance.api';
import { cardClass, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { weightTotal } from './performance-format';
import { SearchPicker } from './SearchPicker';
import {
  ACTION, AGGREGATION, EMPLOYEE_SEES, ESCALATE, IDENTITY, LATER, NOMINATOR, PRESETS, RESOLUTION, RETURN, SCOPE, SINGLE_PERSON, SOURCE,
  stageKey, tidy, type StageForm, type WorkflowForm,
} from './workflow-form';

const findKras = (term: string) => krasApi.list({ search: term, status: 'ACTIVE', limit: 20 }).then((p) => p.items.map((k) => ({ id: k.id, name: k.kraName, code: k.kraCode })));

const Problems: React.FC<{ problems: TemplateProblem[] }> = ({ problems }) => (problems.length ? (
  <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
    {problems.map((p, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{p.message}</li>)}
  </ul>
) : null);

/**
 * A workflow version's stages, step by step: steps run in order, and the
 * stages in one step run side by side. Editable for a draft; a published
 * version is shown through it read-only.
 */
export const WorkflowStagesForm: React.FC<{ form: WorkflowForm; onChange: (form: WorkflowForm) => void; readOnly: boolean; roles: Named[]; problems: TemplateProblem[] }> = ({
  form, onChange, readOnly, roles, problems,
}) => {
  const id = useId();
  const set = <K extends keyof WorkflowForm>(key: K, value: WorkflowForm[K]) => onChange({ ...form, [key]: value });
  const setStage = (i: number, patch: Partial<StageForm>) => set('stages', form.stages.map((s, j) => (j === i ? tidy({ ...s, ...patch }) : s)));
  const lastStep = Math.max(0, ...form.stages.map((s) => s.step));
  const steps = Array.from({ length: lastStep }, (_, i) => i + 1);
  const counted = form.stages.filter((s) => s.action === 'RATE' && s.scoreWeightPercent?.trim());
  const total = counted.length ? weightTotal(counted.map((s) => s.scoreWeightPercent ?? '')) : null;

  const add = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const stage = preset.stage(lastStep + 1);
    set('stages', [...form.stages, tidy({ ...stage, key: stageKey(stage.name, form.stages.map((s) => s.key)) })]);
  };
  /** Moves a stage to another step; steps left empty close up. */
  const moveToStep = (i: number, step: number) => {
    const stages = form.stages.map((s, j) => (j === i ? { ...s, step } : s));
    const used = [...new Set(stages.map((s) => s.step))].sort((a, b) => a - b);
    set('stages', stages.map((s) => ({ ...s, step: used.indexOf(s.step) + 1 })));
  };

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-4">
      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-settings`}>
        <h3 id={`${id}-settings`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Reviewers</h3>
        <fieldset>
          <legend className={labelClass}>Find each stage’s reviewers</legend>
          {(Object.keys(RESOLUTION) as WorkflowForm['reviewerResolution'][]).map((r) => (
            <label key={r} className="mt-1 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name={`${id}-resolution`} checked={form.reviewerResolution === r} onChange={() => set('reviewerResolution', r)} className="mt-1" />
              <span>{RESOLUTION[r].label}<span className="block text-xs text-slate-500">{RESOLUTION[r].hint}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={form.allowsRepeatReviewers} onChange={(e) => set('allowsRepeatReviewers', e.target.checked)} className="mt-1 rounded border-slate-300" />
          <span>One person may review in more than one stage<span className="block text-xs text-slate-500">Off: someone already reviewing (say, a manager who is also the department head) is left out of later stages, so their view isn’t counted twice.</span></span>
        </label>
        {form.stages.length > 0 && (
          <p role="status" className={`text-xs font-semibold ${total === '100' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {total === null ? 'No stage counts toward the final score yet' : `Stages counting toward the final score total ${total}%${total === '100' ? '' : ' (needs 100%)'}`}
          </p>
        )}
        <Problems problems={problems.filter((p) => p.path === 'stages')} />
      </section>

      {form.stages.length === 0 && <p className="text-sm text-slate-500">No stages yet. Add the steps an appraisal goes through, such as a self-assessment, then the manager.</p>}

      <ol className="space-y-3" aria-label="Steps">
        {steps.map((step) => (
          <li key={step} className="space-y-2">
            {step > 1 && <ChevronDown className="mx-auto h-5 w-5 text-slate-400" aria-hidden="true" />}
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Step {step}{form.stages.filter((s) => s.step === step).length > 1 ? ' · side by side' : ''}
            </h4>
            <div className="grid gap-3 xl:grid-cols-2">
              {form.stages.map((stage, i) => stage.step === step && (
                <StageCard key={stage.key + i} stage={stage} index={i} lastStep={lastStep} roles={roles} readOnly={readOnly}
                  problems={problems.filter((p) => p.path === `stages.${i}` || p.path.startsWith(`stages.${i}.`))}
                  onChange={(patch) => setStage(i, patch)} onStep={(n) => moveToStep(i, n)}
                  onMove={(by) => { const list = [...form.stages]; [list[i], list[i + by]] = [list[i + by], list[i]]; set('stages', list); }}
                  canMoveUp={i > 0 && form.stages[i - 1].step === step} canMoveDown={i < form.stages.length - 1 && form.stages[i + 1].step === step}
                  onRemove={() => { const stages = form.stages.filter((_, j) => j !== i); const used = [...new Set(stages.map((s) => s.step))].sort((a, b) => a - b); set('stages', stages.map((s) => ({ ...s, step: used.indexOf(s.step) + 1 }))); }} />
              ))}
            </div>
          </li>
        ))}
      </ol>

      {!readOnly && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">Add a stage:</span>
          <select className={`${fieldClass} w-auto`} value="" aria-label="Add a stage" onChange={(e) => add(e.target.value)}>
            <option value="">Choose…</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className={hintClass}>It is added as a new last step; move it into a step to run side by side.</span>
        </label>
      )}
      {!readOnly && (
        <div>
          <label htmlFor={`${id}-note`} className={labelClass}>What changed <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-note`} className={fieldClass} value={form.changeNote} maxLength={500} onChange={(e) => set('changeNote', e.target.value)} />
        </div>
      )}
    </fieldset>
  );
};

const StageCard: React.FC<{
  stage: StageForm; index: number; lastStep: number; roles: Named[]; readOnly: boolean; problems: TemplateProblem[];
  onChange: (patch: Partial<StageForm>) => void; onStep: (step: number) => void; onMove: (by: -1 | 1) => void; onRemove: () => void; canMoveUp: boolean; canMoveDown: boolean;
}> = ({ stage: s, index, lastStep, roles, readOnly, problems, onChange, onStep, onMove, onRemove, canMoveUp, canMoveDown }) => {
  const name = s.name.trim() || `Stage ${index + 1}`;
  const single = SINGLE_PERSON.includes(s.source);
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  const roleSelect = (label: string, value: string | null, onPick: (v: string | null) => void) => (
    <label className="block text-xs text-slate-600 dark:text-slate-400">{label}
      <select className={fieldClass} value={value ?? ''} aria-label={`${name}: ${label.toLowerCase()}`} onChange={(e) => onPick(e.target.value || null)}>
        <option value="">Choose…</option>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
  const select = <T extends string>(label: string, value: T, options: Record<T, string>, onPick: (v: T) => void) => (
    <label className="block text-xs text-slate-600 dark:text-slate-400">{label}
      <select className={fieldClass} value={value} aria-label={`${name}: ${label.toLowerCase()}`} onChange={(e) => onPick(e.target.value as T)}>
        {(Object.keys(options) as T[]).map((k) => <option key={k} value={k}>{options[k]}</option>)}
      </select>
    </label>
  );
  const chips = (ids: string[], names: Record<string, string>, onRemoveId: (id: string) => void) => ids.length > 0 && (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((x) => (
        <li key={x} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {names[x] ?? 'Unknown'}
          {!readOnly && <button type="button" aria-label={`Remove ${names[x] ?? 'item'}`} onClick={() => onRemoveId(x)} className="rounded-full p-0.5 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><X className="h-3 w-3" aria-hidden="true" /></button>}
        </li>
      ))}
    </ul>
  );

  return (
    <article className={`${cardClass} space-y-3 p-3`} aria-label={`Stage ${name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-400">Stage name
          <input className={fieldClass} value={s.name} maxLength={120} aria-label={`Stage ${index + 1}: name`} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <div className="flex flex-wrap items-end gap-1">
          <label className="text-xs text-slate-600 dark:text-slate-400">Step
            <select className={`${fieldClass} w-auto`} value={s.step} aria-label={`${name}: step`} onChange={(e) => onStep(Number(e.target.value))}>
              {Array.from({ length: lastStep + 1 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n > lastStep ? `${n} (new)` : n}</option>)}
            </select>
          </label>
          {!readOnly && (
            <>
              <Button type="button" size="sm" variant="ghost" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
              <Button type="button" size="sm" variant="ghost" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label={`Move ${name} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
              <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${name}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
            </>
          )}
        </div>
      </div>
      <Problems problems={problems} />

      <fieldset className="space-y-2">
        <legend className={labelClass}>Who reviews</legend>
        <label className="block text-xs text-slate-600 dark:text-slate-400">Reviewers
          <select className={fieldClass} value={s.source} aria-label={`${name}: reviewers`} onChange={(e) => onChange({ source: e.target.value as StageForm['source'] })}>
            {(Object.keys(SOURCE) as StageForm['source'][]).map((k) => <option key={k} value={k}>{SOURCE[k].label}</option>)}
          </select>
          <span className={hintClass}>{SOURCE[s.source].hint}</span>
        </label>
        {s.source === 'ROLE_MEMBERS' && roleSelect('Role', s.roleId, (v) => onChange({ roleId: v }))}
        {s.source === 'SPECIFIC_MEMBERS' && (
          <div className="space-y-1">
            {chips(s.memberIds, s.memberNames, (x) => onChange({ memberIds: s.memberIds.filter((m) => m !== x) }))}
            {!readOnly && <SearchPicker label="Add a person" noun="members" find={performanceOptionsApi.members} exclude={s.memberIds}
              onPick={(m) => onChange({ memberIds: [...s.memberIds, m.id], memberNames: { ...s.memberNames, [m.id]: m.name } })} />}
          </div>
        )}
        {s.source === 'NOMINATED' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {select('Nominated by', s.nominatedBy ?? 'EMPLOYEE', NOMINATOR, (v) => onChange({ nominatedBy: v }))}
            {s.nominatedBy === 'EMPLOYEE' && (
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={s.nominationNeedsApproval} onChange={(e) => onChange({ nominationNeedsApproval: e.target.checked })} className="rounded border-slate-300" />The manager approves the nominations
              </label>
            )}
          </div>
        )}
        {!single && (
          <div className="grid gap-2 sm:grid-cols-2">
            {select('Who takes it', s.mode, { EACH: 'Everyone found reviews', POOL: 'Anyone found may take it' }, (v) => onChange({ mode: v }))}
            <div className="flex gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">Least
                <input className={`${fieldClass} w-20`} inputMode="numeric" value={s.minReviewers} aria-label={`${name}: least reviewers`} onChange={(e) => onChange({ minReviewers: num(e.target.value) })} />
              </label>
              <label className="text-xs text-slate-600 dark:text-slate-400">Most
                <input className={`${fieldClass} w-20`} inputMode="numeric" value={s.maxReviewers} aria-label={`${name}: most reviewers`} onChange={(e) => onChange({ maxReviewers: num(e.target.value) })} />
              </label>
            </div>
            {s.mode === 'EACH' && select('Done when', s.completion, { ALL: 'Every reviewer has finished', AT_LEAST: 'Enough reviews are in' }, (v) => onChange({ completion: v }))}
            {s.completion === 'AT_LEAST' && (
              <label className="text-xs text-slate-600 dark:text-slate-400">Reviews needed
                <input className={`${fieldClass} w-20`} inputMode="numeric" value={s.minCompleted ?? ''} aria-label={`${name}: reviews needed`} onChange={(e) => onChange({ minCompleted: num(e.target.value) })} />
              </label>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={labelClass}>What they do</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.source !== 'SELF' && select('Action', s.action, Object.fromEntries(Object.entries(ACTION).map(([k, v]) => [k, v.label])) as Record<StageForm['action'], string>, (v) => onChange({ action: v }))}
          {s.action === 'RATE' && (
            <label className="text-xs text-slate-600 dark:text-slate-400">Share of the final score (%)
              <input className={fieldClass} inputMode="decimal" value={s.scoreWeightPercent ?? ''} placeholder="Not counted" aria-label={`${name}: share of the final score (%)`} onChange={(e) => onChange({ scoreWeightPercent: e.target.value || null })} />
            </label>
          )}
          {s.action === 'RATE' && select('Rates', s.ratedScope, SCOPE, (v) => onChange({ ratedScope: v }))}
          {s.action === 'RATE' && !single && s.maxReviewers > 1 && select('Their ratings combine by', s.aggregation, s.mode === 'POOL' ? { AVERAGE: AGGREGATION.AVERAGE, MEDIAN: AGGREGATION.MEDIAN } as typeof AGGREGATION : AGGREGATION, (v) => onChange({ aggregation: v }))}
          {s.step > 1 && select('Can send it back', s.returnRule, RETURN, (v) => onChange({ returnRule: v }))}
        </div>
        <p className={hintClass}>{ACTION[s.action].hint}{s.action === 'RATE' && !s.scoreWeightPercent ? ' Without a share, its ratings are seen but don’t count.' : ''}</p>
        {s.ratedScope === 'SELECTED_KRAS' && (
          <div className="space-y-1">
            {chips(s.kraIds, s.kraNames, (x) => onChange({ kraIds: s.kraIds.filter((k) => k !== x) }))}
            {!readOnly && <SearchPicker label="Add a KRA it rates" noun="KRAs" find={findKras} exclude={s.kraIds} onPick={(k) => onChange({ kraIds: [...s.kraIds, k.id], kraNames: { ...s.kraNames, [k.id]: `${k.code} · ${k.name}` } })} />}
          </div>
        )}
        {s.source !== 'SELF' && (
          <div className="flex flex-wrap gap-4 text-xs text-slate-700 dark:text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.allowsDecline} onChange={(e) => onChange({ allowsDecline: e.target.checked })} className="rounded border-slate-300" />Reviewers may decline</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.allowsReplacement} onChange={(e) => onChange({ allowsReplacement: e.target.checked })} className="rounded border-slate-300" />Missing reviewers can be replaced</label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Deadline and reminders</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-600 dark:text-slate-400">Due (days after it opens)
            <input className={fieldClass} inputMode="numeric" value={s.dueDays} aria-label={`${name}: due days`} onChange={(e) => onChange({ dueDays: num(e.target.value) })} />
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-400">Remind (days before due)
            <input className={fieldClass} value={s.reminderDays.join(', ')} placeholder="such as 3, 1" aria-label={`${name}: reminder days`}
              onChange={(e) => onChange({ reminderDays: e.target.value.split(/[,\s]+/).filter(Boolean).map(num) })} />
          </label>
          {select('When overdue, escalate to', s.escalateTo, ESCALATE, (v) => onChange({ escalateTo: v }))}
          {s.escalateTo !== 'NONE' && (
            <label className="text-xs text-slate-600 dark:text-slate-400">After (days overdue)
              <input className={fieldClass} inputMode="numeric" value={s.escalateAfterDays ?? ''} aria-label={`${name}: escalate after days`} onChange={(e) => onChange({ escalateAfterDays: num(e.target.value) })} />
            </label>
          )}
          {s.escalateTo === 'ROLE' && roleSelect('Escalation role', s.escalationRoleId, (v) => onChange({ escalationRoleId: v }))}
        </div>
      </fieldset>

      {s.source !== 'SELF' && (
        <fieldset className="space-y-2">
          <legend className={labelClass}>Who sees what</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {select('The employee sees', s.employeeSees, EMPLOYEE_SEES, (v) => onChange({ employeeSees: v }))}
            {!single && select('Reviewers’ names', s.identity, IDENTITY, (v) => onChange({ identity: v }))}
            {select('Later stages see', s.laterStagesSee, LATER, (v) => onChange({ laterStagesSee: v }))}
          </div>
          {s.identity === 'HIDDEN_FROM_EMPLOYEE' && <p className={hintClass}>The employee won’t be shown who reviewed in this stage. Administrators with access still see it, for accountability.</p>}
        </fieldset>
      )}
    </article>
  );
};
