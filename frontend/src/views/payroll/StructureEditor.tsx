import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  componentsApi, problemsOf, structuresApi,
  type Problem, type SalaryComponent, type StructureDetail, type StructureLineInput, type StructurePreview, type StructureVersion, type SystemVariable,
} from '../../api/payroll-setup.api';
import { CALCULATION, CATEGORY, cardClass, day, errorText, fieldClass, hintClass, labelClass, money, nextMonthIso, tdClass, thClass } from './payroll-format';

type Line = StructureLineInput & { key: string };
let lineKey = 0;
const keyed = (line: StructureLineInput): Line => ({ ...line, key: `line-${(lineKey += 1)}` });
const plain = ({ key: _key, ...line }: Line): StructureLineInput => ({
  ...line,
  defaultAmount: line.defaultAmount?.trim() || null,
  defaultPercentage: line.defaultPercentage?.trim() || null,
  formula: line.formula?.trim() || null,
});

/** How a stored line is worked out, in words. */
const lineText = (line: StructureLineInput, component: SalaryComponent) => {
  switch (component.calculationType) {
    case 'FIXED': return line.defaultAmount ? `${money(line.defaultAmount)} a month` : 'Amount set on each employee’s salary';
    case 'PERCENTAGE': return `${line.defaultPercentage ?? '—'}% of ${line.percentageBase ?? '—'}`;
    case 'FORMULA': return line.formula ?? '—';
    default: return CALCULATION[component.calculationType].label;
  }
};

/** One salary structure: its versions, and its draft being edited with a live, explained preview. */
export const StructureEditor: React.FC<{ structureId: string; onBack: () => void }> = ({ structureId, onBack }) => {
  const { can } = useAuth();
  const editable = can('salary.configure');
  const id = useId();
  const [detail, setDetail] = useState<StructureDetail | null>(null);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [variables, setVariables] = useState<SystemVariable[]>([]);
  const [functions, setFunctions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ effectiveFrom: string; changeNote: string; lines: Line[] } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'publish' | 'discard' | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [confirm, setConfirm] = useState<'publish' | 'discard' | null>(null);

  const adopt = useCallback((next: StructureDetail) => {
    setDetail(next);
    const stored = next.versions.find((v) => v.status === 'DRAFT');
    setDraft(stored ? { effectiveFrom: stored.effectiveFrom, changeNote: stored.changeNote ?? '', lines: stored.lines.map(keyed) } : null);
    setViewing(stored?.id ?? next.versions.find((v) => v.status === 'PUBLISHED')?.id ?? null);
    setDirty(false);
  }, []);

  const load = useCallback(() => {
    setError(null);
    Promise.all([structuresApi.get(structureId), componentsApi.list(), structuresApi.formulaReference()])
      .then(([s, c, ref]) => { adopt(s); setComponents(c); setVariables(ref.variables); setFunctions(ref.functions); })
      .catch((e) => setError(errorText(e)));
  }, [structureId, adopt]);
  useEffect(load, [load]);

  // A draft's lines may name components that are now archived: keep them visible.
  const byId = useMemo(() => {
    const map = new Map(components.map((c) => [c.id, c]));
    for (const v of detail?.versions ?? []) for (const l of v.lines) if (!map.has(l.salaryComponentId)) map.set(l.salaryComponentId, l.component);
    return map;
  }, [components, detail]);

  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <span>The structure could not be loaded: {error}</span>
        <span className="flex gap-3"><button type="button" onClick={load} className="font-semibold underline">Try again</button><button type="button" onClick={onBack} className="underline">Back</button></span>
      </div>
    );
  }
  if (!detail) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading structure</span></div>;

  const published = detail.versions.filter((v) => v.status === 'PUBLISHED');
  const latest = published[0];
  const shown = detail.versions.find((v) => v.id === viewing);
  const editingDraft = !!draft && (shown?.status === 'DRAFT' || !shown || viewing === 'new');

  const change = (next: Partial<NonNullable<typeof draft>>) => { setDraft((d) => (d ? { ...d, ...next } : d)); setDirty(true); setProblems([]); };
  const startVersion = () => {
    setDraft({ effectiveFrom: nextMonthIso(), changeNote: '', lines: (latest?.lines ?? []).map(keyed) });
    setViewing('new');
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    setProblems([]);
    try {
      adopt(await structuresApi.saveDraft(structureId, { effectiveFrom: draft.effectiveFrom, changeNote: draft.changeNote.trim() || undefined, lines: draft.lines.map(plain) }));
      toast.success('Draft saved. It is not used for pay until you publish it.');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const publish = async () => {
    setConfirm(null);
    setBusy('publish');
    try {
      adopt(await structuresApi.publish(structureId));
      toast.success('Version published');
    } catch (e) {
      setProblems(problemsOf(e));
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const discard = async () => {
    setConfirm(null);
    if (!detail.versions.some((v) => v.status === 'DRAFT')) { adopt(detail); return; }
    setBusy('discard');
    try {
      adopt(await structuresApi.discardDraft(structureId));
      toast.success('Draft discarded');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const draftNumber = detail.versions.find((v) => v.status === 'DRAFT')?.number ?? (detail.versions[0]?.number ?? 0) + 1;
  const dayBefore = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to structures" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-[#2B293E] dark:bg-[#181724]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{detail.structureName}</h2>
            <p className="font-mono text-xs text-slate-500">{detail.structureCode}{detail.status === 'ARCHIVED' ? ' · archived' : ''}</p>
          </div>
        </div>
        {editable && !draft && detail.status === 'ACTIVE' && <Button variant="secondary" onClick={startVersion}>Start a new version</Button>}
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-draft`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id={`${id}-draft`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Version {draftNumber} <Badge size="sm" variant="warning">Draft</Badge></h3>
                <p className="text-xs text-slate-500">Not used for any pay until published. Once published it can’t be changed.</p>
              </div>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirm('discard')} disabled={!!busy}>Discard</Button>
                  <Button variant="secondary" size="sm" onClick={save} loading={busy === 'save'} disabled={!!busy || !dirty}>Save draft</Button>
                  <Button size="sm" onClick={() => setConfirm('publish')} loading={busy === 'publish'} disabled={!!busy || dirty || viewing === 'new'} aria-describedby={dirty ? `${id}-unsaved` : undefined}>Publish</Button>
                </div>
              )}
            </div>
            {dirty && editable && <p id={`${id}-unsaved`} className="text-xs text-amber-700">Unsaved changes: save the draft before publishing.</p>}
            {detail.lockedThrough && latest && <p className="text-xs text-slate-500">Payroll is finalized up to {day(detail.lockedThrough)}; a new version can start the day after at the earliest.</p>}
            {problems.length > 0 && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">Fix these before publishing:</p>
                <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-from`} className={labelClass}>Takes effect from</label>
                <input id={`${id}-from`} type="date" className={fieldClass} value={draft.effectiveFrom} disabled={!editable} onChange={(e) => change({ effectiveFrom: e.target.value })} />
                {latest && <p className={hintClass}>Must be after {day(latest.effectiveFrom)}, when version {latest.number} started.</p>}
              </div>
              <div>
                <label htmlFor={`${id}-note`} className={labelClass}>What changed <span className="font-normal text-slate-400">(optional)</span></label>
                <input id={`${id}-note`} className={fieldClass} value={draft.changeNote} maxLength={500} disabled={!editable} onChange={(e) => change({ changeNote: e.target.value })} />
              </div>
            </div>
            <LinesEditor lines={draft.lines} components={components} byId={byId} variables={variables} disabled={!editable} problems={problems} onChange={(lines) => change({ lines })} />
            <FormulaReference variables={variables} functions={functions} codes={draft.lines.map((l) => byId.get(l.salaryComponentId)?.componentCode ?? '')} />
          </section>
          <PreviewPanel lines={draft.lines} byId={byId} />
        </div>
      ) : shown ? (
        <PublishedVersion version={shown} />
      ) : (
        <p className={`${cardClass} p-6 text-sm text-slate-600`}>This structure has no versions yet.{editable ? ' Start one to add its components.' : ''}</p>
      )}

      {confirm === 'publish' && draft && (
        <Dialog title={`Publish version ${draftNumber} of ${detail.structureName}?`} onClose={() => setConfirm(null)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep editing</Button>
            <Button onClick={publish}>Publish from {day(draft.effectiveFrom)}</Button>
          </>
        )}>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            From {day(draft.effectiveFrom)}, pay for employees on this structure is worked out with these {draft.lines.length} components.
            {latest && !latest.effectiveTo ? ` Version ${latest.number} will end on ${day(dayBefore(draft.effectiveFrom))}.` : ''} A published version can’t be changed; later changes need another version.
          </p>
        </Dialog>
      )}
      {confirm === 'discard' && (
        <Dialog title="Discard this draft?" onClose={() => setConfirm(null)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep draft</Button>
            <Button variant="danger" onClick={discard}>Discard draft</Button>
          </>
        )}>
          <p className="text-sm text-slate-700 dark:text-slate-300">The draft’s components and settings are deleted. Published versions are not affected.</p>
        </Dialog>
      )}
    </div>
  );
};

const LinesEditor: React.FC<{
  lines: Line[];
  components: SalaryComponent[];
  byId: Map<string, SalaryComponent>;
  variables: SystemVariable[];
  disabled: boolean;
  problems: Problem[];
  onChange: (lines: Line[]) => void;
}> = ({ lines, components, byId, variables, disabled, problems, onChange }) => {
  const id = useId();
  const [adding, setAdding] = useState('');
  const available = components.filter((c) => c.status === 'ACTIVE' && !lines.some((l) => l.salaryComponentId === c.id));
  const update = (key: string, next: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...next } : l)));
  const move = (index: number, by: number) => {
    const next = [...lines];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  const add = () => {
    const component = byId.get(adding);
    if (!component) return;
    onChange([...lines, keyed({ salaryComponentId: component.id, defaultAmount: null, defaultPercentage: null, percentageBase: component.calculationType === 'PERCENTAGE' ? 'MONTHLY_SALARY' : null, formula: null, isMandatory: true })]);
    setAdding('');
  };
  const salaryValues = variables.filter((v) => v.group === 'Salary');

  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Components, in payslip order</h4>
      {lines.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No components yet. Add the earnings first, then deductions.</p>}
      <ol className="space-y-2">
        {lines.map((line, index) => {
          const component = byId.get(line.salaryComponentId);
          if (!component) return null;
          const lineProblems = problems.filter((p) => p.code === component.componentCode);
          const field = `${id}-${line.key}`;
          return (
            <li key={line.key} className={`rounded-lg border p-3 ${lineProblems.length ? 'border-red-300' : 'border-slate-200 dark:border-[#2B293E]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{component.componentCode}</span>
                  <span className="ml-2 text-sm text-slate-700 dark:text-slate-300">{component.componentName}</span>
                  <span className="ml-2"><Badge size="sm" variant={CATEGORY[component.category].variant}>{CATEGORY[component.category].label}</Badge></span>
                  {component.status === 'ARCHIVED' && <span className="ml-2"><Badge size="sm" variant="danger">Archived</Badge></span>}
                </div>
                {!disabled && (
                  <div className="flex gap-1">
                    <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${component.componentCode} up`} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" disabled={index === lines.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${component.componentCode} down`} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" onClick={() => onChange(lines.filter((l) => l.key !== line.key))} aria-label={`Remove ${component.componentCode}`} className="rounded p-1 text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                )}
              </div>
              <div className="mt-2">
                {component.calculationType === 'FIXED' && (
                  <div className="max-w-xs">
                    <label htmlFor={field} className={labelClass}>Default monthly amount <span className="font-normal text-slate-400">(optional)</span></label>
                    <input id={field} className={fieldClass} inputMode="decimal" value={line.defaultAmount ?? ''} disabled={disabled} onChange={(e) => update(line.key, { defaultAmount: e.target.value })} aria-describedby={`${field}-hint`} />
                    <p id={`${field}-hint`} className={hintClass}>Leave empty to set it on each employee’s salary.</p>
                  </div>
                )}
                {component.calculationType === 'PERCENTAGE' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={field} className={labelClass}>Percentage</label>
                      <input id={field} className={fieldClass} inputMode="decimal" value={line.defaultPercentage ?? ''} disabled={disabled} onChange={(e) => update(line.key, { defaultPercentage: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor={`${field}-base`} className={labelClass}>Of</label>
                      <select id={`${field}-base`} className={fieldClass} value={line.percentageBase ?? ''} disabled={disabled} onChange={(e) => update(line.key, { percentageBase: e.target.value || null })}>
                        <option value="">Choose…</option>
                        <optgroup label="Components in this structure">
                          {lines.filter((l) => l.key !== line.key).map((l) => byId.get(l.salaryComponentId)).filter((c): c is SalaryComponent => !!c).map((c) => <option key={c.id} value={c.componentCode}>{c.componentCode} – {c.componentName}</option>)}
                        </optgroup>
                        <optgroup label="Salary values">
                          {salaryValues.map((v) => <option key={v.name} value={v.name}>{v.label} ({v.name})</option>)}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                )}
                {component.calculationType === 'FORMULA' && (
                  <div>
                    <label htmlFor={field} className={labelClass}>Formula</label>
                    <textarea id={field} rows={2} spellCheck={false} className={`${fieldClass} font-mono`} value={line.formula ?? ''} disabled={disabled} maxLength={1000}
                      onChange={(e) => update(line.key, { formula: e.target.value })} aria-describedby={`${field}-hint`} />
                    <p id={`${field}-hint`} className={hintClass}>For example MONTHLY_SALARY - BASIC - HRA, or if(PAID_DAYS &gt;= 20, 1500, 0). See “What formulas can use” below.</p>
                  </div>
                )}
                {(component.calculationType === 'MANUAL' || component.calculationType === 'SYSTEM_CALCULATED') && (
                  <p className="text-xs text-slate-500">{CALCULATION[component.calculationType].hint}</p>
                )}
              </div>
              {lineProblems.map((p, i) => <p key={i} className="mt-2 text-xs font-medium text-red-700">{p.message}</p>)}
            </li>
          );
        })}
      </ol>
      {!disabled && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label htmlFor={`${id}-add`} className={labelClass}>Add a component</label>
            <select id={`${id}-add`} className={fieldClass} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">{available.length ? 'Choose…' : 'Every active component is already in the structure'}</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.componentCode} – {c.componentName} ({CATEGORY[c.category].label.toLowerCase()})</option>)}
            </select>
          </div>
          <Button variant="secondary" onClick={add} disabled={!adding}>Add</Button>
        </div>
      )}
    </div>
  );
};

const FormulaReference: React.FC<{ variables: SystemVariable[]; functions: string[]; codes: string[] }> = ({ variables, functions, codes }) => (
  <details className="rounded-lg border border-slate-200 p-3 text-sm dark:border-[#2B293E]">
    <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">What formulas can use</summary>
    <div className="mt-3 space-y-3 text-xs text-slate-600 dark:text-slate-400">
      <p>Numbers (30000, 12.5, 40%), the operators + − * / and brackets, comparisons (&lt; &lt;= &gt; &gt;= == !=) with and, or, not, and these functions: {functions.map((f) => <code key={f} className="mx-0.5 rounded bg-slate-100 px-1 dark:bg-white/10">{f}()</code>)}. A formula is never run as code; dividing by zero or a missing value stops the calculation instead of paying zero.</p>
      {codes.filter(Boolean).length > 0 && <p>Components in this structure (their full-month amounts): {codes.filter(Boolean).map((c) => <code key={c} className="mx-0.5 rounded bg-slate-100 px-1 dark:bg-white/10">{c}</code>)}</p>}
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {variables.map((v) => (
          <div key={v.name}>
            <dt className="font-mono font-semibold text-slate-800 dark:text-slate-200">{v.name}</dt>
            <dd>{v.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  </details>
);

/** Works the draft out as it is edited, with values to try, and shows how each amount was reached. */
const PreviewPanel: React.FC<{ lines: Line[]; byId: Map<string, SalaryComponent> }> = ({ lines, byId }) => {
  const id = useId();
  const [monthly, setMonthly] = useState('50000');
  const [paidShare, setPaidShare] = useState('1');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StructurePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  const needsAmount = lines.map((l) => byId.get(l.salaryComponentId)).filter((c): c is SalaryComponent => !!c && (
    (c.calculationType === 'FIXED' && !lines.find((l) => l.salaryComponentId === c.id)?.defaultAmount?.trim()) || c.calculationType === 'MANUAL'
  ));
  const payload = JSON.stringify({ lines: lines.map(plain), monthly, paidShare, amounts });

  useEffect(() => {
    if (!lines.length) { setResult(null); return; }
    const ticket = (request.current += 1);
    setLoading(true);
    const timer = setTimeout(() => {
      const overrides: Record<string, { amount: string }> = {};
      const provided: Record<string, string> = {};
      for (const c of needsAmount) {
        const value = amounts[c.componentCode]?.trim();
        if (!value) continue;
        if (c.calculationType === 'MANUAL') provided[c.componentCode] = value;
        else overrides[c.componentCode] = { amount: value };
      }
      structuresApi.preview({ lines: lines.map(plain), variables: { MONTHLY_SALARY: monthly.trim() || '0', PRORATION: paidShare.trim() || '1' }, overrides, provided })
        .then((r) => { if (ticket === request.current) { setResult(r); setError(null); } })
        .catch((e) => { if (ticket === request.current) { setResult(null); setError(errorText(e)); } })
        .finally(() => { if (ticket === request.current) setLoading(false); });
    }, 400);
    return () => clearTimeout(timer);
    // The payload string captures every input the preview depends on.
  }, [payload]);

  return (
    <aside className={`${cardClass} h-fit space-y-3 p-4 xl:sticky xl:top-4`} aria-labelledby={`${id}-title`}>
      <div>
        <h3 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Preview</h3>
        <p className="text-xs text-slate-500">Worked out by the same engine as payroll, with values you choose. Attendance values use samples; nothing is saved.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-monthly`} className={labelClass}>Monthly salary</label>
          <input id={`${id}-monthly`} className={fieldClass} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-share`} className={labelClass}>Paid share of month</label>
          <input id={`${id}-share`} className={fieldClass} inputMode="decimal" value={paidShare} onChange={(e) => setPaidShare(e.target.value)} aria-describedby={`${id}-share-hint`} />
          <p id={`${id}-share-hint`} className={hintClass}>1 = no unpaid days; 0.9 = 3 of 30 unpaid.</p>
        </div>
        {needsAmount.map((c) => (
          <div key={c.id}>
            <label htmlFor={`${id}-${c.componentCode}`} className={labelClass}>{c.componentCode} amount</label>
            <input id={`${id}-${c.componentCode}`} className={fieldClass} inputMode="decimal" value={amounts[c.componentCode] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [c.componentCode]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div aria-live="polite" aria-busy={loading}>
        {!lines.length ? <p className="text-sm text-slate-500">Add components to see what they come to.</p>
          : error ? <p role="alert" className="text-sm text-red-700">{error}</p>
          : result && (
            <div className="space-y-3">
              {result.problems.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {result.problems.map((p, i) => <li key={i}>{p.message}</li>)}
                </ul>
              )}
              <table className="w-full text-sm">
                <caption className="sr-only">Previewed amounts</caption>
                <thead><tr><th scope="col" className="py-1 text-left text-xs text-slate-500">Component</th><th scope="col" className="py-1 text-right text-xs text-slate-500">Amount</th></tr></thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.code} className="border-t border-slate-100 dark:border-[#2B293E]">
                      <td className="py-1.5 pr-2">
                        <span className="font-mono text-xs font-semibold">{l.code}</span>
                        <span className={`ml-1 text-[11px] ${l.category === 'EARNING' ? 'text-emerald-700' : l.category === 'DEDUCTION' ? 'text-red-700' : 'text-sky-700'}`}>{CATEGORY[l.category].label}</span>
                        {l.steps.map((s, i) => <span key={i} className="block text-[11px] text-slate-500">{s}</span>)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="space-y-1 border-t border-slate-200 pt-2 text-sm dark:border-[#2B293E]">
                <div className="flex justify-between"><dt>Gross</dt><dd className="tabular-nums">{money(result.totals.gross)}</dd></div>
                <div className="flex justify-between"><dt>Deductions</dt><dd className="tabular-nums">{money(result.totals.deductions)}</dd></div>
                <div className="flex justify-between font-bold"><dt>Net pay</dt><dd className="tabular-nums">{money(result.totals.net)}</dd></div>
                <div className="flex justify-between text-xs text-slate-500"><dt>Employer contributions</dt><dd className="tabular-nums">{money(result.totals.employerContributions)}</dd></div>
              </dl>
            </div>
          )}
      </div>
    </aside>
  );
};

const PublishedVersion: React.FC<{ version: StructureVersion }> = ({ version }) => (
  <section className={cardClass} aria-label={`Version ${version.number}`}>
    <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Version {version.number} <Badge size="sm" variant="success">Published</Badge></h3>
      <p className="text-xs text-slate-500">
        In force {day(version.effectiveFrom)} – {version.effectiveTo ? day(version.effectiveTo) : 'until replaced'}
        {version.publishedBy ? ` · published by ${version.publishedBy}` : ''}{version.changeNote ? ` · ${version.changeNote}` : ''}
      </p>
    </div>
    {version.lines.length === 0 ? <p className="p-4 text-sm text-slate-500">No components.</p> : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 dark:bg-white/5">
            <tr><th scope="col" className={thClass}>Component</th><th scope="col" className={thClass}>Type</th><th scope="col" className={thClass}>Worked out as</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {version.lines.map((l) => (
              <tr key={l.salaryComponentId}>
                <td className={tdClass}><span className="font-mono text-xs font-semibold">{l.component.componentCode}</span><span className="block">{l.component.componentName}</span></td>
                <td className={tdClass}><Badge size="sm" variant={CATEGORY[l.component.category].variant}>{CATEGORY[l.component.category].label}</Badge></td>
                <td className={`${tdClass} font-mono text-xs`}>{lineText(l, l.component)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);
