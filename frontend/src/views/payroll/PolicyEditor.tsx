import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  policiesApi, problemsOf,
  type PenaltyBand, type PenaltyRule, type PolicyConfig, type PolicyDetail, type PolicyScopes, type Problem, type ScopeOptions,
} from '../../api/payroll-setup.api';
import { WEEKDAYS, cardClass, day, errorText, fieldClass, hintClass, labelClass, nextMonthIso } from './payroll-format';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** A whole number from an input, or null when it's empty (NaN is sent as-is and refused by the server). */
const wholeOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

const SECTION_NAMES: Record<string, string> = {
  weeklyOffDays: 'Weekly offs', divisor: 'Divisor', hoursPerDay: 'Hours per day', attendance: 'Attendance', overtime: 'Overtime',
  lateArrival: 'Late arrival', earlyDeparture: 'Early departure', rounding: 'Rounding',
};
/** A settings path as people read it: “Late arrival · band 2 · fromMinute”. */
const where = (path?: string) => {
  if (!path) return '';
  return path.replace(/^policy\.?/, '').split('.').map((part) => {
    const band = part.match(/^bands\[(\d+)\]$/);
    return band ? `band ${Number(band[1]) + 1}` : SECTION_NAMES[part] ?? part;
  }).join(' · ');
};

/** One payroll policy: who it covers, its versions, and its draft rules. */
export const PolicyEditor: React.FC<{ policyId: string; onBack: () => void }> = ({ policyId, onBack }) => {
  const { can } = useAuth();
  const editable = can('payroll.policies.manage');
  const id = useId();
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [options, setOptions] = useState<ScopeOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ effectiveFrom: string; changeNote: string; config: PolicyConfig } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [confirm, setConfirm] = useState<'publish' | 'discard' | 'archive' | null>(null);

  const adopt = useCallback((next: PolicyDetail) => {
    setDetail(next);
    const stored = next.versions.find((v) => v.status === 'DRAFT');
    setDraft(stored ? { effectiveFrom: stored.effectiveFrom, changeNote: stored.changeNote ?? '', config: clone(stored.config) } : null);
    setViewing(stored?.id ?? next.versions.find((v) => v.status === 'PUBLISHED')?.id ?? null);
    setDirty(false);
    setProblems([]);
  }, []);

  const load = useCallback(() => {
    setError(null);
    Promise.all([policiesApi.get(policyId), policiesApi.scopeOptions()])
      .then(([p, o]) => { adopt(p); setOptions(o); })
      .catch((e) => setError(errorText(e)));
  }, [policyId, adopt]);
  useEffect(load, [load]);

  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <span>The policy could not be loaded: {error}</span>
        <span className="flex gap-3"><button type="button" onClick={load} className="font-semibold underline">Try again</button><button type="button" onClick={onBack} className="underline">Back</button></span>
      </div>
    );
  }
  if (!detail || !options) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading policy</span></div>;

  const published = detail.versions.filter((v) => v.status === 'PUBLISHED');
  const latest = published[0];
  const shown = detail.versions.find((v) => v.id === viewing);
  const editingDraft = !!draft && (viewing === 'new' || shown?.status === 'DRAFT');
  const draftNumber = detail.versions.find((v) => v.status === 'DRAFT')?.number ?? (detail.versions[0]?.number ?? 0) + 1;

  const run = async (name: string, action: () => Promise<PolicyDetail>, success: string) => {
    setBusy(name);
    setProblems([]);
    try {
      adopt(await action());
      toast.success(success);
    } catch (e) {
      setProblems(problemsOf(e));
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const changeConfig = (config: PolicyConfig) => { setDraft((d) => (d ? { ...d, config } : d)); setDirty(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to policies" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-[#2B293E] dark:bg-[#181724]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{detail.policyName} {detail.isDefault && <Badge size="sm" variant="info">Default</Badge>}</h2>
            <p className="font-mono text-xs text-slate-500">{detail.policyCode}{detail.status === 'ARCHIVED' ? ' · archived' : ''}</p>
          </div>
        </div>
        {editable && detail.status === 'ACTIVE' && (
          <div className="flex gap-2">
            {!draft && <Button variant="secondary" onClick={() => { setDraft({ effectiveFrom: nextMonthIso(), changeNote: '', config: clone(latest?.config ?? detail.versions[0].config) }); setViewing('new'); setDirty(true); }}>Change the rules</Button>}
            <Button variant="outline" onClick={() => setConfirm('archive')}>Archive</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PolicyDetails detail={detail} disabled={!editable || detail.status !== 'ACTIVE'} onSave={(input) => run('details', () => policiesApi.update(policyId, input), 'Policy saved')} busy={busy === 'details'} />
        <PolicyCoverage detail={detail} options={options} disabled={!editable || detail.status !== 'ACTIVE'} onSave={(scopes) => run('scopes', () => policiesApi.setScopes(policyId, scopes), 'Who the policy covers was saved')} busy={busy === 'scopes'} />
      </div>

      <nav aria-label="Versions" className="flex flex-wrap gap-2">
        {draft && viewing === 'new' && <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">Version {draftNumber} (new draft)</span>}
        {detail.versions.map((v) => (
          <button key={v.id} type="button" onClick={() => setViewing(v.id)} aria-pressed={viewing === v.id}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${viewing === v.id ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950' : 'border-slate-200 bg-white text-slate-700 dark:border-[#2B293E] dark:bg-[#181724] dark:text-slate-300'}`}>
            Version {v.number} · {v.status === 'DRAFT' ? 'Draft' : `${day(v.effectiveFrom)} – ${v.effectiveTo ? day(v.effectiveTo) : 'now'}`}
          </button>
        ))}
      </nav>

      {editingDraft && draft ? (
        <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-draft`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id={`${id}-draft`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Version {draftNumber} rules <Badge size="sm" variant="warning">Draft</Badge></h3>
              <p className="text-xs text-slate-500">Not used for pay until published. Once published they can’t be changed.</p>
            </div>
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirm('discard')}>Discard</Button>
                <Button variant="secondary" size="sm" disabled={!!busy || !dirty} loading={busy === 'save'}
                  onClick={() => run('save', () => policiesApi.saveDraft(policyId, { effectiveFrom: draft.effectiveFrom, config: draft.config, changeNote: draft.changeNote.trim() || undefined }), 'Draft saved. It is not used for pay until you publish it.')}>
                  Save draft
                </Button>
                <Button size="sm" disabled={!!busy || dirty || viewing === 'new'} loading={busy === 'publish'} onClick={() => setConfirm('publish')}>Publish</Button>
              </div>
            )}
          </div>
          {dirty && editable && <p className="text-xs text-amber-700">Unsaved changes: save the draft before publishing.</p>}
          {detail.lockedThrough && <p className="text-xs text-slate-500">Payroll is finalized up to {day(detail.lockedThrough)}; new rules can start the day after at the earliest.</p>}
          {problems.length > 0 && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">Some settings need fixing:</p>
              <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p.path ? <strong>{where(p.path)}: </strong> : null}{p.message}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-from`} className={labelClass}>Rules take effect from</label>
              <input id={`${id}-from`} type="date" className={fieldClass} value={draft.effectiveFrom} disabled={!editable} onChange={(e) => { setDraft({ ...draft, effectiveFrom: e.target.value }); setDirty(true); }} />
              {latest && <p className={hintClass}>Must be after {day(latest.effectiveFrom)}, when version {latest.number} started.</p>}
            </div>
            <div>
              <label htmlFor={`${id}-note`} className={labelClass}>What changed <span className="font-normal text-slate-400">(optional)</span></label>
              <input id={`${id}-note`} className={fieldClass} value={draft.changeNote} maxLength={500} disabled={!editable} onChange={(e) => { setDraft({ ...draft, changeNote: e.target.value }); setDirty(true); }} />
            </div>
          </div>
          <PolicyRules config={draft.config} disabled={!editable} onChange={changeConfig} />
        </section>
      ) : shown ? (
        <section className={`${cardClass} space-y-4 p-4`} aria-label={`Version ${shown.number}`}>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Version {shown.number} <Badge size="sm" variant="success">Published</Badge></h3>
            <p className="text-xs text-slate-500">In force {day(shown.effectiveFrom)} – {shown.effectiveTo ? day(shown.effectiveTo) : 'until replaced'}{shown.publishedBy ? ` · published by ${shown.publishedBy}` : ''}{shown.changeNote ? ` · ${shown.changeNote}` : ''}</p>
          </div>
          <PolicyRules config={shown.config} disabled onChange={() => undefined} />
        </section>
      ) : null}

      {confirm === 'publish' && draft && (
        <Dialog title={`Publish version ${draftNumber} of ${detail.policyName}?`} onClose={() => setConfirm(null)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep editing</Button>
            <Button onClick={() => { setConfirm(null); run('publish', () => policiesApi.publish(policyId), 'New rules published'); }}>Publish from {day(draft.effectiveFrom)}</Button>
          </>
        )}>
          <p className="text-sm text-slate-700 dark:text-slate-300">From {day(draft.effectiveFrom)}, payroll for everyone this policy covers uses these rules. Published rules can’t be changed; later changes need another version.</p>
        </Dialog>
      )}
      {confirm === 'discard' && (
        <Dialog title="Discard this draft?" onClose={() => setConfirm(null)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep draft</Button>
            <Button variant="danger" onClick={() => {
              setConfirm(null);
              if (detail.versions.some((v) => v.status === 'DRAFT')) run('discard', () => policiesApi.discardDraft(policyId), 'Draft discarded');
              else adopt(detail);
            }}>Discard draft</Button>
          </>
        )}>
          <p className="text-sm text-slate-700 dark:text-slate-300">The draft rules are deleted. Published versions are not affected.</p>
        </Dialog>
      )}
      {confirm === 'archive' && (
        <Dialog title={`Archive ${detail.policyName}?`} onClose={() => setConfirm(null)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep policy</Button>
            <Button variant="danger" onClick={() => { setConfirm(null); run('archive', () => policiesApi.archive(policyId), 'Policy archived'); }}>Archive policy</Button>
          </>
        )}>
          <p className="text-sm text-slate-700 dark:text-slate-300">An archived policy covers no one and can’t be chosen for salaries. Its published versions stay in history. The default policy, or one that current salaries name, can’t be archived.</p>
        </Dialog>
      )}
    </div>
  );
};

const PolicyDetails: React.FC<{ detail: PolicyDetail; disabled: boolean; busy: boolean; onSave: (input: { policyName: string; description?: string; isDefault: boolean }) => void }> = ({ detail, disabled, busy, onSave }) => {
  const id = useId();
  const [name, setName] = useState(detail.policyName);
  const [description, setDescription] = useState(detail.description ?? '');
  const [isDefault, setIsDefault] = useState(detail.isDefault);
  useEffect(() => { setName(detail.policyName); setDescription(detail.description ?? ''); setIsDefault(detail.isDefault); }, [detail]);
  const changed = name !== detail.policyName || description !== (detail.description ?? '') || isDefault !== detail.isDefault;
  return (
    <form className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-title`} onSubmit={(e) => { e.preventDefault(); onSave({ policyName: name.trim(), description: description.trim() || undefined, isDefault }); }}>
      <h3 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Details</h3>
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
        <input id={`${id}-name`} className={fieldClass} value={name} required maxLength={160} disabled={disabled} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
        <input id={`${id}-description`} className={fieldClass} value={description} maxLength={1000} disabled={disabled} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={isDefault} disabled={disabled} onChange={(e) => setIsDefault(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
        <span>Default policy<span className="block text-xs text-slate-500">Covers everyone no other policy covers. Making this the default stops the current default being one.</span></span>
      </label>
      {!disabled && <Button type="submit" size="sm" variant="secondary" disabled={!changed || busy} loading={busy}>Save details</Button>}
    </form>
  );
};

const SCOPE_KINDS: { key: keyof PolicyScopes; option: keyof ScopeOptions; label: string }[] = [
  { key: 'departmentIds', option: 'departments', label: 'Departments' },
  { key: 'branchIds', option: 'branches', label: 'Branches' },
  { key: 'employmentTypeIds', option: 'employmentTypes', label: 'Employment types' },
  { key: 'designationIds', option: 'designations', label: 'Designations' },
];

const PolicyCoverage: React.FC<{ detail: PolicyDetail; options: ScopeOptions; disabled: boolean; busy: boolean; onSave: (scopes: PolicyScopes) => void }> = ({ detail, options, disabled, busy, onSave }) => {
  const id = useId();
  const [scopes, setScopes] = useState<PolicyScopes>(detail.scopes);
  useEffect(() => setScopes(detail.scopes), [detail]);
  const changed = JSON.stringify(scopes) !== JSON.stringify(detail.scopes);
  const toggle = (key: keyof PolicyScopes, value: string) =>
    setScopes((s) => ({ ...s, [key]: s[key].includes(value) ? s[key].filter((v) => v !== value) : [...s[key], value] }));
  return (
    <form className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-title`} onSubmit={(e) => { e.preventDefault(); onSave(scopes); }}>
      <div>
        <h3 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Who it covers</h3>
        <p className="text-xs text-slate-500">An employee is covered when they match every kind you choose here (any one of each kind). The policy matching the most kinds wins; a salary can also name a policy directly.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SCOPE_KINDS.map(({ key, option, label }) => (
          <fieldset key={key} className="min-w-0">
            <legend className={labelClass}>{label}</legend>
            {options[option].length === 0 ? <p className="text-xs text-slate-500">None set up</p> : (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-[#2B293E]">
                {options[option].map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={scopes[key].includes(o.id)} disabled={disabled} onChange={() => toggle(key, o.id)} className="rounded border-slate-300" />
                    <span className="truncate">{o.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        ))}
      </div>
      {!disabled && <Button type="submit" size="sm" variant="secondary" disabled={!changed || busy} loading={busy}>Save coverage</Button>}
    </form>
  );
};

/** Every rule of a policy, grouped as people think of them. */
const PolicyRules: React.FC<{ config: PolicyConfig; disabled: boolean; onChange: (config: PolicyConfig) => void }> = ({ config, disabled, onChange }) => {
  const id = useId();
  const edit = (change: (c: PolicyConfig) => void) => {
    const next = clone(config);
    change(next);
    onChange(next);
  };
  const ot = config.overtime;
  return (
    <div className="space-y-4">
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Working days and day’s pay</legend>
        <div>
          <span className={labelClass} id={`${id}-offs`}>Weekly offs</span>
          <div role="group" aria-labelledby={`${id}-offs`} className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={config.weeklyOffDays.includes(d.value)} disabled={disabled} className="rounded border-slate-300"
                  onChange={(e) => edit((c) => { c.weeklyOffDays = e.target.checked ? [...c.weeklyOffDays, d.value] : c.weeklyOffDays.filter((v) => v !== d.value); })} />
                <span aria-hidden="true">{d.short}</span><span className="sr-only">{d.long}</span>
              </label>
            ))}
          </div>
          <p className={hintClass}>Used where an employee’s shift doesn’t say otherwise.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-divisor`} className={labelClass}>A day’s pay is the monthly salary divided by</label>
            <select id={`${id}-divisor`} className={fieldClass} value={config.divisor.method} disabled={disabled}
              onChange={(e) => edit((c) => { c.divisor = { method: e.target.value as PolicyConfig['divisor']['method'], fixedDays: e.target.value === 'FIXED_DAYS' ? (c.divisor.fixedDays ?? 26) : null }; })}>
              <option value="CALENDAR_DAYS">Days in the month</option>
              <option value="WORKING_DAYS">Working days in the month</option>
              <option value="FIXED_DAYS">A fixed number of days</option>
            </select>
          </div>
          {config.divisor.method === 'FIXED_DAYS' && (
            <div>
              <label htmlFor={`${id}-fixed`} className={labelClass}>Number of days</label>
              <input id={`${id}-fixed`} type="number" min={1} max={31} className={fieldClass} value={config.divisor.fixedDays ?? ''} disabled={disabled}
                onChange={(e) => edit((c) => { c.divisor.fixedDays = wholeOrNull(e.target.value); })} />
            </div>
          )}
          <div>
            <label htmlFor={`${id}-hours`} className={labelClass}>Standard hours in a day</label>
            <input id={`${id}-hours`} inputMode="decimal" className={fieldClass} value={config.hoursPerDay} disabled={disabled} onChange={(e) => edit((c) => { c.hoursPerDay = e.target.value; })} />
            <p className={hintClass}>For an hourly rate from a daily one.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Attendance</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-missing`} className={labelClass}>A working day with no attendance</label>
            <select id={`${id}-missing`} className={fieldClass} value={config.attendance.missingAttendance} disabled={disabled} onChange={(e) => edit((c) => { c.attendance.missingAttendance = e.target.value as 'EXCEPTION' | 'UNPAID'; })}>
              <option value="EXCEPTION">Hold the employee’s pay for review</option>
              <option value="UNPAID">Count it unpaid (and report it)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-half`} className={labelClass}>Share of a day paid for a half day</label>
            <input id={`${id}-half`} inputMode="decimal" className={fieldClass} value={config.attendance.halfDayValue} disabled={disabled} onChange={(e) => edit((c) => { c.attendance.halfDayValue = e.target.value; })} />
          </div>
        </div>
        <Check label="Pay only approved attendance" hint="Unapproved days are held for review." checked={config.attendance.requireApprovedAttendance} disabled={disabled} onChange={(v) => edit((c) => { c.attendance.requireApprovedAttendance = v; })} />
        <Check label="People paid by the day are paid for weekly offs" checked={config.attendance.weeklyOffsPaidForDaily} disabled={disabled} onChange={(v) => edit((c) => { c.attendance.weeklyOffsPaidForDaily = v; })} />
        <Check label="People paid by the day are paid for holidays" checked={config.attendance.holidaysPaidForDaily} disabled={disabled} onChange={(v) => edit((c) => { c.attendance.holidaysPaidForDaily = v; })} />
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Overtime</legend>
        <Check label="Pay overtime" hint="Only for employees whose salary allows overtime." checked={ot.enabled} disabled={disabled} onChange={(v) => edit((c) => { c.overtime.enabled = v; })} />
        {ot.enabled && (
          <>
            <Check label="Only approved overtime is paid" checked={ot.requiresApproval} disabled={disabled} onChange={(v) => edit((c) => { c.overtime.requiresApproval = v; })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField label="Minimum minutes in a day" value={ot.minimumMinutes} disabled={disabled} onChange={(v) => edit((c) => { c.overtime.minimumMinutes = v as number; })} />
              <NumberField label="Round to blocks of (minutes)" value={ot.roundToMinutes} disabled={disabled} onChange={(v) => edit((c) => { c.overtime.roundToMinutes = v as number; })} />
              <div>
                <label htmlFor={`${id}-otround`} className={labelClass}>Rounding</label>
                <select id={`${id}-otround`} className={fieldClass} value={ot.roundingMode} disabled={disabled} onChange={(e) => edit((c) => { c.overtime.roundingMode = e.target.value as PolicyConfig['overtime']['roundingMode']; })}>
                  <option value="DOWN">Down</option>
                  <option value="NEAREST">Nearest</option>
                  <option value="UP">Up</option>
                </select>
              </div>
              <NumberField label="Most minutes in a day" optional value={ot.dailyCapMinutes} disabled={disabled} onChange={(v) => edit((c) => { c.overtime.dailyCapMinutes = v; })} />
              <NumberField label="Most minutes in a month" optional value={ot.monthlyCapMinutes} disabled={disabled} onChange={(v) => edit((c) => { c.overtime.monthlyCapMinutes = v; })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['workingDay', 'weeklyOff', 'holiday'] as const).map((k) => (
                <div key={k}>
                  <label htmlFor={`${id}-mult-${k}`} className={labelClass}>Rate on {k === 'workingDay' ? 'a working day' : k === 'weeklyOff' ? 'a weekly off' : 'a holiday'} (× hourly)</label>
                  <input id={`${id}-mult-${k}`} inputMode="decimal" className={fieldClass} value={ot.multipliers[k]} disabled={disabled} onChange={(e) => edit((c) => { c.overtime.multipliers[k] = e.target.value; })} />
                </div>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <PenaltyRuleEditor title="Late arrival" noun="late" rule={config.lateArrival} disabled={disabled} onChange={(rule) => edit((c) => { c.lateArrival = rule; })} />
      <PenaltyRuleEditor title="Early departure" noun="early" rule={config.earlyDeparture} disabled={disabled} onChange={(rule) => edit((c) => { c.earlyDeparture = rule; })} />

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Rounding net pay</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-netscale`} className={labelClass}>Round net pay to</label>
            <select id={`${id}-netscale`} className={fieldClass} value={config.rounding.netPayScale} disabled={disabled} onChange={(e) => edit((c) => { c.rounding.netPayScale = Number(e.target.value) as 0 | 1 | 2; })}>
              <option value={0}>Whole rupees</option>
              <option value={1}>1 decimal place</option>
              <option value={2}>Paise (2 decimal places)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-netmode`} className={labelClass}>Direction</label>
            <select id={`${id}-netmode`} className={fieldClass} value={config.rounding.netPayMode} disabled={disabled} onChange={(e) => edit((c) => { c.rounding.netPayMode = e.target.value as PolicyConfig['rounding']['netPayMode']; })}>
              <option value="HALF_UP">Nearest (half up)</option>
              <option value="UP">Always up</option>
              <option value="DOWN">Always down</option>
            </select>
          </div>
        </div>
      </fieldset>
    </div>
  );
};

const Check: React.FC<{ label: string; hint?: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }> = ({ label, hint, checked, disabled, onChange }) => (
  <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
    <span>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
  </label>
);

const NumberField: React.FC<{ label: string; value: number | null; optional?: boolean; disabled: boolean; onChange: (value: number | null) => void }> = ({ label, value, optional, disabled, onChange }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}{optional && <span className="font-normal text-slate-400"> (optional)</span>}</label>
      <input id={id} type="number" min={0} step={1} className={fieldClass} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(wholeOrNull(e.target.value))} />
    </div>
  );
};

const ACTIONS: Record<PenaltyBand['action'], string> = {
  WARNING: 'Warning only (no deduction)',
  FIXED_AMOUNT: 'Fixed amount each time',
  PER_MINUTE: 'Amount per minute',
  DAY_FRACTION: 'Part of a day’s pay',
};

const PenaltyRuleEditor: React.FC<{ title: string; noun: 'late' | 'early'; rule: PenaltyRule; disabled: boolean; onChange: (rule: PenaltyRule) => void }> = ({ title, noun, rule, disabled, onChange }) => {
  const id = useId();
  const set = (next: Partial<PenaltyRule>) => onChange({ ...rule, ...next });
  const setBand = (index: number, next: Partial<PenaltyBand>) => set({ bands: rule.bands.map((b, i) => (i === index ? { ...b, ...next } : b)) });
  const addBand = () => {
    const last = rule.bands[rule.bands.length - 1];
    const from = last ? (last.toMinute ?? last.fromMinute) + 1 : rule.graceMinutes + 1;
    set({ bands: [...rule.bands, { fromMinute: from, toMinute: null, action: 'WARNING', amount: null, dayFraction: null }] });
  };
  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
      <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</legend>
      <Check label={`Deduct for ${noun === 'late' ? 'arriving late' : 'leaving early'}`} checked={rule.enabled} disabled={disabled} onChange={(enabled) => set({ enabled })} />
      {rule.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Grace period (minutes)" value={rule.graceMinutes} disabled={disabled} onChange={(v) => set({ graceMinutes: v as number })} />
            <NumberField label="Free times a month" value={rule.freeOccurrences} disabled={disabled} onChange={(v) => set({ freeOccurrences: v as number })} />
            <div>
              <label htmlFor={`${id}-cap`} className={labelClass}>Most deducted in a month <span className="font-normal text-slate-400">(optional)</span></label>
              <input id={`${id}-cap`} inputMode="decimal" className={fieldClass} value={rule.monthlyCapAmount ?? ''} disabled={disabled} onChange={(e) => set({ monthlyCapAmount: e.target.value.trim() || null })} />
            </div>
          </div>
          <div>
            <p className={labelClass}>By how {noun}, after the grace period</p>
            {rule.bands.length === 0 && <p className="text-xs text-slate-500">No bands yet.</p>}
            <ol className="space-y-2">
              {rule.bands.map((band, index) => (
                <li key={index} className="grid items-end gap-2 rounded-lg bg-slate-50 p-2 dark:bg-white/5 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                  <NumberField label="From minute" value={band.fromMinute} disabled={disabled} onChange={(v) => setBand(index, { fromMinute: v as number })} />
                  <NumberField label="To minute" optional value={band.toMinute} disabled={disabled} onChange={(v) => setBand(index, { toMinute: v })} />
                  <div>
                    <label htmlFor={`${id}-action-${index}`} className={labelClass}>Then</label>
                    <select id={`${id}-action-${index}`} className={fieldClass} value={band.action} disabled={disabled}
                      onChange={(e) => {
                        const action = e.target.value as PenaltyBand['action'];
                        setBand(index, { action, amount: action === 'FIXED_AMOUNT' || action === 'PER_MINUTE' ? band.amount ?? '' : null, dayFraction: action === 'DAY_FRACTION' ? band.dayFraction ?? '0.5' : null });
                      }}>
                      {Object.entries(ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    {(band.action === 'FIXED_AMOUNT' || band.action === 'PER_MINUTE') && (
                      <>
                        <label htmlFor={`${id}-amount-${index}`} className={labelClass}>Amount</label>
                        <input id={`${id}-amount-${index}`} inputMode="decimal" className={fieldClass} value={band.amount ?? ''} disabled={disabled} onChange={(e) => setBand(index, { amount: e.target.value })} />
                      </>
                    )}
                    {band.action === 'DAY_FRACTION' && (
                      <>
                        <label htmlFor={`${id}-fraction-${index}`} className={labelClass}>Share of a day</label>
                        <input id={`${id}-fraction-${index}`} inputMode="decimal" className={fieldClass} value={band.dayFraction ?? ''} disabled={disabled} onChange={(e) => setBand(index, { dayFraction: e.target.value })} />
                      </>
                    )}
                  </div>
                  {!disabled && (
                    <button type="button" onClick={() => set({ bands: rule.bands.filter((_, i) => i !== index) })} aria-label={`Remove band ${index + 1}`} className="mb-1 rounded p-2 text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {!disabled && rule.bands.length < 10 && <Button type="button" size="sm" variant="ghost" onClick={addBand}><Plus className="h-4 w-4" aria-hidden="true" />Add a band</Button>}
          </div>
          <Check label={`Also deduct part of a day for repeatedly ${noun === 'late' ? 'arriving late' : 'leaving early'}`} checked={!!rule.repeated} disabled={disabled}
            onChange={(on) => set({ repeated: on ? { everyOccurrences: 3, dayFraction: '0.5' } : null })} />
          {rule.repeated && (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Every this many times (after the free ones)" value={rule.repeated.everyOccurrences} disabled={disabled} onChange={(v) => set({ repeated: { ...(rule.repeated as NonNullable<PenaltyRule['repeated']>), everyOccurrences: v as number } })} />
              <div>
                <label htmlFor={`${id}-repeat-fraction`} className={labelClass}>Deduct this share of a day</label>
                <input id={`${id}-repeat-fraction`} inputMode="decimal" className={fieldClass} value={rule.repeated.dayFraction} disabled={disabled} onChange={(e) => set({ repeated: { ...(rule.repeated as NonNullable<PenaltyRule['repeated']>), dayFraction: e.target.value } })} />
              </div>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
};
