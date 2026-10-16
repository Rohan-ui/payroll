import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft, Lock, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { ApiError } from '../../api/client';
import { ratingScalesApi, type ConversionMethod, type InputKind, type RatingScale, type ScaleDraft, type ScaleVersion } from '../../api/performance.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, tdClass, thClass } from '../payroll/payroll-format';
import { CONVERSION, INPUT_KIND, orNull } from './performance-format';

type Problem = { path?: string; message: string };
const problemsOf = (error: unknown): Problem[] =>
  error instanceof ApiError && Array.isArray(error.data?.errors) ? (error.data.errors as Problem[]) : [];

const levels = (...labels: string[]) => labels.map((label, i) => ({ value: String(i + 1), label, description: null, scorePercent: null }));
const band = (label: string, minPercent: string, maxPercent: string) => ({ label, description: null, minPercent, maxPercent });

/** Starting points for a new scale; every value can be changed before it is saved. */
const PRESETS: { name: string; draft: ScaleDraft }[] = [
  {
    name: 'Five-point',
    draft: {
      inputKind: 'LEVELS', conversionMethod: 'PROPORTION_OF_MAX', minValue: null, maxValue: null, stepValue: null, unitLabel: null,
      levels: levels('Unsatisfactory', 'Needs Improvement', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding'),
      bands: [band('Needs improvement', '0', '50'), band('Meets expectations', '50', '75'), band('Exceeds expectations', '75', '90'), band('Outstanding', '90', '100')],
    },
  },
  {
    name: 'Four-level qualitative',
    draft: {
      inputKind: 'LEVELS', conversionMethod: 'LEVEL_PERCENT', minValue: null, maxValue: null, stepValue: null, unitLabel: null,
      levels: levels('Below Expectations', 'Partially Meets Expectations', 'Meets Expectations', 'Exceeds Expectations').map((l, i) => ({ ...l, scorePercent: ['25', '50', '75', '100'][i] })),
      bands: [],
    },
  },
  { name: 'One to ten', draft: { inputKind: 'RANGE', conversionMethod: 'PROPORTION_OF_MAX', minValue: '1', maxValue: '10', stepValue: '1', unitLabel: null, levels: [], bands: [] } },
  { name: 'Percentage', draft: { inputKind: 'RANGE', conversionMethod: 'PROPORTION_OF_MAX', minValue: '0', maxValue: '100', stepValue: '0.01', unitLabel: '%', levels: [], bands: [] } },
  { name: 'Marks', draft: { inputKind: 'MARKS', conversionMethod: 'PROPORTION_OF_MAX', minValue: null, maxValue: null, stepValue: '0.5', unitLabel: 'marks', levels: [], bands: [] } },
];

const draftOf = (v: ScaleVersion): ScaleDraft => ({
  inputKind: v.inputKind, conversionMethod: v.conversionMethod, minValue: v.inputKind === 'RANGE' ? v.minValue : null, maxValue: v.inputKind === 'RANGE' ? v.maxValue : null,
  stepValue: v.stepValue, unitLabel: v.unitLabel, levels: v.levels, bands: v.bands, changeNote: '',
});

/** What a draft becomes when the kind of input changes, keeping what still fits. */
const withKind = (d: ScaleDraft, inputKind: InputKind): ScaleDraft => ({
  ...d,
  inputKind,
  conversionMethod: inputKind === 'MARKS' ? 'PROPORTION_OF_MAX' : inputKind === 'RANGE' && d.conversionMethod === 'LEVEL_PERCENT' ? 'PROPORTION_OF_MAX' : d.conversionMethod,
  minValue: inputKind === 'RANGE' ? (d.minValue ?? '1') : null,
  maxValue: inputKind === 'RANGE' ? (d.maxValue ?? '5') : null,
  stepValue: inputKind === 'LEVELS' ? null : (d.stepValue ?? '1'),
  levels: inputKind === 'MARKS' ? [] : d.levels.map((l) => ({ ...l, scorePercent: inputKind === 'LEVELS' ? l.scorePercent : null })),
});

/** The clean draft to send: blanks become nulls, and scores per level only where they are used. */
const cleaned = (d: ScaleDraft): ScaleDraft => ({
  ...d,
  minValue: orNull(d.minValue),
  maxValue: orNull(d.maxValue),
  stepValue: orNull(d.stepValue),
  unitLabel: orNull(d.unitLabel),
  levels: d.levels.map((l) => ({ ...l, label: l.label.trim(), description: orNull(l.description), scorePercent: d.conversionMethod === 'LEVEL_PERCENT' ? orNull(l.scorePercent) : null })),
  bands: d.bands.map((b) => ({ ...b, label: b.label.trim(), description: orNull(b.description) })),
  changeNote: d.changeNote?.trim() || undefined,
});

/** Creating a rating scale, or reading its versions and editing its one draft. */
export const RatingScaleEditor: React.FC<{ scaleId: string | null; onClose: (changed: boolean) => void }> = ({ scaleId, onClose }) => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.scales.manage');
  const [scale, setScale] = useState<RatingScale | null>(null);
  const [identity, setIdentity] = useState({ scaleCode: '', scaleName: '', description: '' });
  const [draft, setDraft] = useState<ScaleDraft | null>(scaleId ? null : { ...PRESETS[0].draft, changeNote: '' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changed, setChanged] = useState(false);

  const show = (s: RatingScale) => {
    setScale(s);
    setIdentity({ scaleCode: s.scaleCode, scaleName: s.scaleName, description: s.description ?? '' });
    const open = s.versions.find((v) => v.status === 'DRAFT');
    setDraft(open ? draftOf(open) : null);
  };
  const load = useCallback(() => {
    if (!scaleId) return;
    setLoadError(null);
    ratingScalesApi.get(scaleId).then(show).catch((e) => setLoadError(errorText(e)));
  }, [scaleId]);
  useEffect(load, [load]);

  const fail = (e: unknown) => { setProblems(problemsOf(e)); setError(errorText(e)); };
  const run = async (work: () => Promise<RatingScale>, done: string) => {
    setBusy(true);
    setProblems([]);
    setError(null);
    try {
      show(await work());
      setChanged(true);
      toast.success(done);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = () => draft && run(() => ratingScalesApi.create({
    scaleCode: identity.scaleCode.trim(), scaleName: identity.scaleName.trim(), description: orNull(identity.description), draft: cleaned(draft),
  }), 'Rating scale created as a draft. Publish it to use it.');
  const saveDraft = () => scale && draft && run(() => ratingScalesApi.saveDraft(scale.id, cleaned(draft)), 'Draft saved');
  const publish = async () => {
    if (!scale || !draft) return;
    setConfirming(false);
    // The draft on screen is saved first, so what is published is what was reviewed.
    if (await run(() => ratingScalesApi.saveDraft(scale.id, cleaned(draft)), 'Draft saved')) {
      await run(() => ratingScalesApi.publish(scale.id), 'New version published');
    }
  };
  const discard = () => {
    if (!scale) return;
    // A draft never saved exists only on screen.
    if (scale.versions[0]?.status !== 'DRAFT') { setDraft(null); setProblems([]); setError(null); return; }
    run(() => ratingScalesApi.discardDraft(scale.id), 'Draft discarded');
  };
  const rename = () => scale && run(() => ratingScalesApi.update(scale.id, { scaleName: identity.scaleName.trim(), description: orNull(identity.description) }), 'Rating scale saved');

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        The rating scale could not be loaded: {loadError} <button type="button" className="font-semibold underline" onClick={load}>Try again</button>
      </div>
    );
  }
  if (scaleId && !scale) return <div className="h-40 animate-pulse rounded-xl bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading rating scale</span></div>;

  const archived = scale?.status === 'ARCHIVED';
  const editable = manage && !archived;
  const published = scale?.versions.filter((v) => v.status === 'PUBLISHED') ?? [];
  const nextNumber = (scale?.versions[0]?.number ?? 0) + (draft && scale?.versions[0]?.status === 'DRAFT' ? 0 : 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onClose(changed)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Rating scales</Button>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{scale ? `${scale.scaleCode} · ${scale.scaleName}` : 'New rating scale'}</h2>
        {archived && <Badge size="sm" variant="neutral">Archived</Badge>}
      </div>

      {(error || problems.length > 0) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">{error}</p>
          {problems.length > 0 && <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}
        </div>
      )}

      <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-identity`}>
        <h3 id={`${id}-identity`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Scale</h3>
        <fieldset disabled={!editable && !!scale} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-code`} className={labelClass}>Code</label>
            <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={identity.scaleCode} disabled={!!scale} required maxLength={64}
              onChange={(e) => setIdentity((s) => ({ ...s, scaleCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))} />
          </div>
          <div>
            <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
            <input id={`${id}-name`} className={fieldClass} value={identity.scaleName} required maxLength={160} onChange={(e) => setIdentity((s) => ({ ...s, scaleName: e.target.value }))} />
          </div>
          <div>
            <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
            <input id={`${id}-description`} className={fieldClass} value={identity.description} maxLength={1000} onChange={(e) => setIdentity((s) => ({ ...s, description: e.target.value }))} />
          </div>
        </fieldset>
        {scale && editable && (identity.scaleName !== scale.scaleName || identity.description !== (scale.description ?? '')) && (
          <Button size="sm" variant="outline" onClick={rename} loading={busy} disabled={busy || !identity.scaleName.trim()}>Save name and description</Button>
        )}
        {scale && <p className="text-xs text-slate-500">Used by {scale.usedBy.kras} active KRA{scale.usedBy.kras === 1 ? '' : 's'} and {scale.usedBy.kpis} active KPI{scale.usedBy.kpis === 1 ? '' : 's'}.</p>}
      </section>

      {draft && (editable || !scale) && (
        <DraftEditor
          draft={draft}
          onChange={setDraft}
          title={scale ? `Draft of version ${nextNumber}` : 'How people rate'}
          presets={!scale}
        />
      )}

      {editable || !scale ? (
        <div className="flex flex-wrap gap-2">
          {!scale && <Button onClick={create} loading={busy} disabled={busy || !identity.scaleCode || !identity.scaleName.trim()}>Create as draft</Button>}
          {scale && draft && (
            <>
              <Button onClick={() => setConfirming(true)} disabled={busy}>Publish version {nextNumber}</Button>
              <Button variant="outline" onClick={saveDraft} loading={busy} disabled={busy}>Save draft</Button>
              {published.length > 0 && <Button variant="ghost" onClick={discard} disabled={busy}>Discard draft</Button>}
            </>
          )}
          {scale && !draft && <Button variant="outline" onClick={() => setDraft({ ...draftOf(published[0]), changeNote: '' })} disabled={busy || !published.length}><Plus className="h-4 w-4" aria-hidden="true" />Start version {nextNumber}</Button>}
        </div>
      ) : null}

      {published.map((v) => <PublishedVersion key={v.id} version={v} current={v.id === published[0].id} />)}

      {confirming && scale && (
        <Dialog title={`Publish version ${nextNumber} of ${scale.scaleName}?`} onClose={() => setConfirming(false)} size="sm"
          footer={<><Button variant="outline" onClick={() => setConfirming(false)}>Keep editing</Button><Button onClick={publish} loading={busy}>Publish version {nextNumber}</Button></>}>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            A published version can never be changed. Templates published from now on use it; appraisals already started keep the version they were given.
          </p>
        </Dialog>
      )}
    </div>
  );
};

const PublishedVersion: React.FC<{ version: ScaleVersion; current: boolean }> = ({ version: v, current }) => (
  <section className={`${cardClass} p-4`} aria-label={`Version ${v.number}`}>
    <div className="flex flex-wrap items-center gap-2">
      <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Version {v.number}</h3>
      <Badge size="sm" variant={current ? 'success' : 'neutral'}>{current ? 'Latest' : 'Earlier'}</Badge>
      <span className="text-xs text-slate-500">Published {v.publishedAt ? day(v.publishedAt.slice(0, 10)) : ''}{v.publishedBy ? ` by ${v.publishedBy}` : ''}</span>
    </div>
    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
      {INPUT_KIND[v.inputKind].label}
      {v.inputKind === 'RANGE' && `: ${v.minValue} to ${v.maxValue} in steps of ${v.stepValue}${v.unitLabel ? ` ${v.unitLabel}` : ''}`}
      {v.inputKind === 'MARKS' && `: in steps of ${v.stepValue}`}
      {' · '}scored as {CONVERSION[v.conversionMethod].label.toLowerCase()}
    </p>
    {v.changeNote && <p className="mt-1 text-xs text-slate-500">{v.changeNote}</p>}
    {v.conversion.length > 0 && (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <caption className="sr-only">What each level scores</caption>
          <thead className="bg-slate-50 dark:bg-white/5"><tr><th scope="col" className={thClass}>Rating</th><th scope="col" className={thClass}>Label</th><th scope="col" className={`${thClass} text-right`}>Scores</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {v.conversion.map((c) => <tr key={c.value}><td className={`${tdClass} tabular-nums`}>{c.value}</td><td className={tdClass}>{c.label}</td><td className={`${tdClass} text-right tabular-nums`}>{c.percent === null ? '—' : `${c.percent}%`}</td></tr>)}
          </tbody>
        </table>
      </div>
    )}
    {v.bands.length > 0 && (
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        Final ratings: {v.bands.map((b) => `${b.label} ${b.minPercent}–${b.maxPercent}%`).join(' · ')}
      </p>
    )}
  </section>
);

const DraftEditor: React.FC<{ draft: ScaleDraft; onChange: (d: ScaleDraft) => void; title: string; presets: boolean }> = ({ draft, onChange, title, presets }) => {
  const id = useId();
  const set = <K extends keyof ScaleDraft>(key: K, value: ScaleDraft[K]) => onChange({ ...draft, [key]: value });
  const methods = (Object.keys(CONVERSION) as ConversionMethod[]).filter((m) =>
    draft.inputKind === 'MARKS' ? m === 'PROPORTION_OF_MAX' : draft.inputKind === 'RANGE' ? m !== 'LEVEL_PERCENT' : true);
  const perLevel = draft.conversionMethod === 'LEVEL_PERCENT';

  return (
    <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      {presets && (
        <div>
          <p className={labelClass}>Start from</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => <Button key={p.name} type="button" size="sm" variant="outline" onClick={() => onChange({ ...p.draft, changeNote: draft.changeNote })}>{p.name}</Button>)}
          </div>
        </div>
      )}
      <fieldset>
        <legend className={labelClass}>Raters give</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(INPUT_KIND) as InputKind[]).map((k) => (
            <label key={k} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${draft.inputKind === k ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/30' : 'border-slate-200 dark:border-[#2B293E]'}`}>
              <input type="radio" name={`${id}-kind`} checked={draft.inputKind === k} onChange={() => onChange(withKind(draft, k))} className="mt-0.5" />
              <span><span className="font-semibold text-slate-800 dark:text-slate-200">{INPUT_KIND[k].label}</span><span className="block text-xs text-slate-500">{INPUT_KIND[k].hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-4">
        {draft.inputKind === 'RANGE' && (
          <>
            <div>
              <label htmlFor={`${id}-min`} className={labelClass}>Lowest rating</label>
              <input id={`${id}-min`} className={fieldClass} inputMode="decimal" value={draft.minValue ?? ''} onChange={(e) => set('minValue', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-max`} className={labelClass}>Highest rating</label>
              <input id={`${id}-max`} className={fieldClass} inputMode="decimal" value={draft.maxValue ?? ''} onChange={(e) => set('maxValue', e.target.value)} />
            </div>
          </>
        )}
        {draft.inputKind !== 'LEVELS' && (
          <div>
            <label htmlFor={`${id}-step`} className={labelClass}>Step</label>
            <input id={`${id}-step`} className={fieldClass} inputMode="decimal" value={draft.stepValue ?? ''} onChange={(e) => set('stepValue', e.target.value)} aria-describedby={`${id}-step-hint`} />
            <p id={`${id}-step-hint`} className={hintClass}>1 for whole numbers, 0.5 for halves.</p>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-unit`} className={labelClass}>Unit <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-unit`} className={fieldClass} value={draft.unitLabel ?? ''} maxLength={32} placeholder="such as %" onChange={(e) => set('unitLabel', e.target.value)} />
        </div>
      </div>
      <div className="sm:w-1/2">
        <label htmlFor={`${id}-conversion`} className={labelClass}>Turned into a score as</label>
        <select id={`${id}-conversion`} className={fieldClass} value={draft.conversionMethod} onChange={(e) => set('conversionMethod', e.target.value as ConversionMethod)}>
          {methods.map((m) => <option key={m} value={m}>{CONVERSION[m].label}</option>)}
        </select>
        <p className={hintClass}>{CONVERSION[draft.conversionMethod].hint}</p>
      </div>

      {draft.inputKind !== 'MARKS' && (
        <fieldset className="space-y-2">
          <legend className={labelClass}>{draft.inputKind === 'LEVELS' ? 'Levels' : 'Labels for some values (optional)'}</legend>
          {draft.levels.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 dark:bg-white/5">
                  <tr>
                    <th scope="col" className={thClass}>Rating</th>
                    <th scope="col" className={thClass}>Label</th>
                    <th scope="col" className={thClass}>Description</th>
                    {perLevel && <th scope="col" className={thClass}>Scores (%)</th>}
                    <th scope="col" className={thClass}><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {draft.levels.map((l, i) => {
                    const update = (patch: Partial<typeof l>) => set('levels', draft.levels.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <tr key={i}>
                        <td className="px-2 py-1.5"><input className={`${fieldClass} w-20`} inputMode="decimal" value={l.value} aria-label={`Rating of level ${i + 1}`} onChange={(e) => update({ value: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><input className={fieldClass} value={l.label} maxLength={120} aria-label={`Label of level ${i + 1}`} onChange={(e) => update({ label: e.target.value })} /></td>
                        <td className="px-2 py-1.5"><input className={fieldClass} value={l.description ?? ''} maxLength={500} aria-label={`Description of level ${i + 1}`} onChange={(e) => update({ description: e.target.value })} /></td>
                        {perLevel && <td className="px-2 py-1.5"><input className={`${fieldClass} w-24`} inputMode="decimal" value={l.scorePercent ?? ''} aria-label={`Score of level ${i + 1} (%)`} onChange={(e) => update({ scorePercent: e.target.value })} /></td>}
                        <td className="px-2 py-1.5 text-right">
                          <Button type="button" size="sm" variant="ghost" onClick={() => set('levels', draft.levels.filter((_, j) => j !== i))} aria-label={`Remove level ${i + 1}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Button type="button" size="sm" variant="outline" disabled={draft.levels.length >= 20}
            onClick={() => set('levels', [...draft.levels, { value: String(draft.levels.length + 1), label: '', description: null, scorePercent: null }])}>
            <Plus className="h-4 w-4" aria-hidden="true" />Add {draft.inputKind === 'LEVELS' ? 'level' : 'label'}
          </Button>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className={labelClass}>Final rating bands <span className="font-normal text-slate-400">(optional)</span></legend>
        <p className={hintClass}>Name ranges of the final score, such as 90–100% Outstanding. Bands must run from 0% to 100% with no gaps; a score at a band’s end belongs to the next band.</p>
        {draft.bands.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr>
                  <th scope="col" className={thClass}>From (%)</th>
                  <th scope="col" className={thClass}>Up to (%)</th>
                  <th scope="col" className={thClass}>Final rating</th>
                  <th scope="col" className={thClass}><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {draft.bands.map((b, i) => {
                  const update = (patch: Partial<typeof b>) => set('bands', draft.bands.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1.5"><input className={`${fieldClass} w-24`} inputMode="decimal" value={b.minPercent} aria-label={`Band ${i + 1} starts at (%)`} onChange={(e) => update({ minPercent: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input className={`${fieldClass} w-24`} inputMode="decimal" value={b.maxPercent} aria-label={`Band ${i + 1} ends at (%)`} onChange={(e) => update({ maxPercent: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input className={fieldClass} value={b.label} maxLength={120} aria-label={`Final rating name of band ${i + 1}`} onChange={(e) => update({ label: e.target.value })} /></td>
                      <td className="px-2 py-1.5 text-right">
                        <Button type="button" size="sm" variant="ghost" onClick={() => set('bands', draft.bands.filter((_, j) => j !== i))} aria-label={`Remove band ${i + 1}`}><X className="h-4 w-4" aria-hidden="true" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Button type="button" size="sm" variant="outline" disabled={draft.bands.length >= 20}
          onClick={() => set('bands', [...draft.bands, { label: '', description: null, minPercent: draft.bands[draft.bands.length - 1]?.maxPercent ?? '0', maxPercent: '100' }])}>
          <Plus className="h-4 w-4" aria-hidden="true" />Add band
        </Button>
      </fieldset>

      <div>
        <label htmlFor={`${id}-note`} className={labelClass}>What changed <span className="font-normal text-slate-400">(optional)</span></label>
        <input id={`${id}-note`} className={fieldClass} value={draft.changeNote ?? ''} maxLength={500} onChange={(e) => set('changeNote', e.target.value)} />
      </div>
    </section>
  );
};
