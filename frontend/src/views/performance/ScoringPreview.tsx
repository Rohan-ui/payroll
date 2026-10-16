import React, { useState } from 'react';
import { Calculator } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { templatesApi, type AppraisalScore, type PinnedScale, type PreviewInput, type ScoreLine, type ScoringMethod, type TemplateVersion } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';
import { TARGET_METHODS } from './template-form';

interface Line { id: string; name: string; method: ScoringMethod | 'NUMBER'; scale: PinnedScale | null; perEmployee: boolean; linear: boolean; exemptable: boolean; indent: boolean }

/** The lines someone gives results for, in form order. */
function linesOf(v: TemplateVersion): Line[] {
  const lines: Line[] = [];
  for (const kra of v.kras) {
    if (!kra.kpis.length && kra.scoringMethod) {
      lines.push({ id: kra.id, name: kra.kraName, method: kra.scoringMethod, scale: kra.ratingScale, perEmployee: false, linear: false, exemptable: kra.allowsExemption, indent: false });
    }
    for (const kpi of kra.kpis) {
      lines.push({
        id: kpi.id, name: `${kra.kraName} → ${kpi.kpiName}${kpi.unitLabel ? ` (${kpi.unitLabel})` : ''}`, method: kpi.scoringMethod, scale: kpi.ratingScale,
        perEmployee: kpi.targetSource === 'PER_EMPLOYEE' && TARGET_METHODS.includes(kpi.scoringMethod), linear: kpi.scoringMethod === 'LINEAR_BETWEEN', exemptable: kpi.allowsExemption, indent: true,
      });
    }
  }
  for (const f of v.fields.filter((x) => x.scored)) {
    lines.push({ id: f.id, name: f.label, method: f.type === 'RATING' ? 'RATING_SCALE' : 'NUMBER', scale: f.ratingScale, perEmployee: false, linear: false, exemptable: false, indent: false });
  }
  return lines;
}

const STATUS: Record<ScoreLine['status'], { label: string; variant: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  SCORED: { label: 'Scored', variant: 'success' },
  EXEMPT: { label: 'Exempt', variant: 'neutral' },
  MISSING: { label: 'Not rated', variant: 'warning' },
  INVALID: { label: 'Problem', variant: 'danger' },
};

/** Try a version's scoring with sample results. The server works out every number; nothing is saved. */
export const ScoringPreview: React.FC<{ templateId: string; version: TemplateVersion; unsaved: boolean }> = ({ templateId, version, unsaved }) => {
  const [inputs, setInputs] = useState<Record<string, PreviewInput>>({});
  const [result, setResult] = useState<AppraisalScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = linesOf(version);
  const blocked = version.problems.length > 0 || unsaved;
  const set = (id: string, patch: PreviewInput) => setInputs((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await templatesApi.preview(templateId, version.id, inputs));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const input = (line: Line, key: keyof PreviewInput, label: string, width = 'w-28') => (
    <input className={`${fieldClass} ${width}`} inputMode="decimal" value={(inputs[line.id]?.[key] as string | undefined) ?? ''} aria-label={`${line.name}: ${label}`} placeholder={label}
      onChange={(e) => set(line.id, { [key]: e.target.value })} />
  );

  const control = (line: Line) => {
    const given = inputs[line.id] ?? {};
    if (given.exempt) return <span className="text-xs text-slate-500">Exempt</span>;
    switch (line.method) {
      case 'RATING_SCALE':
        return line.scale?.inputKind === 'LEVELS' ? (
          <select className={`${fieldClass} w-auto`} value={given.rating ?? ''} aria-label={`${line.name}: rating`} onChange={(e) => set(line.id, { rating: e.target.value })}>
            <option value="">Not rated</option>
            {line.scale.levels.map((l) => <option key={l.value} value={l.value}>{l.value} · {l.label}</option>)}
          </select>
        ) : input(line, 'rating', line.scale?.inputKind === 'MARKS' ? 'marks' : 'rating');
      case 'DIRECT_MARKS': return input(line, 'marks', 'marks');
      case 'NUMBER': return input(line, 'value', 'answer');
      case 'YES_NO':
        return (
          <select className={`${fieldClass} w-auto`} value={given.answer ?? ''} aria-label={`${line.name}: answer`} onChange={(e) => set(line.id, { answer: (e.target.value || undefined) as PreviewInput['answer'] })}>
            <option value="">Not answered</option><option value="YES">Yes</option><option value="NO">No</option>
          </select>
        );
      case 'MANUAL':
        return <span className="flex flex-wrap gap-2">{input(line, 'scorePercent', 'score %')}{input(line, 'justification', 'why', 'w-48')}</span>;
      default:
        return (
          <span className="flex flex-wrap gap-2">
            {input(line, 'actual', line.method === 'COMPLETION_PERCENT' ? 'completed %' : 'actual')}
            {line.perEmployee && line.linear && input(line, 'threshold', 'threshold')}
            {line.perEmployee && input(line, 'target', 'target')}
            {line.perEmployee && line.linear && input(line, 'stretch', 'stretch')}
          </span>
        );
    }
  };

  const resultRow = (line: ScoreLine & { code?: string }, indent: boolean) => (
    <tr key={line.key} className="align-top">
      <td className={`${tdClass} ${indent ? 'pl-8' : 'font-semibold'}`}>
        {line.name}
        {(line.steps.length > 0 || line.problem) && (
          <details className="mt-1 text-xs font-normal text-slate-600 dark:text-slate-400">
            <summary className="cursor-pointer">How it was worked out</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{line.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
            {line.problem && <p className="mt-1 text-red-700">{line.problem}</p>}
          </details>
        )}
      </td>
      <td className={tdClass}><Badge size="sm" variant={STATUS[line.status].variant}>{STATUS[line.status].label}</Badge></td>
      <td className={`${tdClass} text-right tabular-nums`}>{line.scorePercent === null ? '—' : `${line.scorePercent}%`}</td>
      <td className={`${tdClass} text-right tabular-nums`}>{line.weight ?? '—'}</td>
      <td className={`${tdClass} text-right tabular-nums`}>{line.sharePercent === null ? '—' : `${line.sharePercent}%`}</td>
      {result?.totalMarks && <td className={`${tdClass} text-right tabular-nums`}>{line.marks ?? '—'}</td>}
      <td className={`${tdClass} text-right tabular-nums`}>{line.contributionPercent ?? '—'}</td>
    </tr>
  );

  return (
    <section className={`${cardClass} space-y-3 p-4`} aria-labelledby="scoring-preview-heading">
      <div>
        <h3 id="scoring-preview-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"><Calculator className="h-4 w-4" aria-hidden="true" />Try the scoring</h3>
        <p className="text-xs text-slate-500">Enter sample results to see the score this version gives, and how. Nothing is saved.</p>
      </div>
      {unsaved && <p className="text-sm text-amber-800 dark:text-amber-300">Save the draft first: the scoring is tried on what is saved.</p>}
      {!unsaved && version.problems.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">Fix the problems listed above first.</p>}
      {lines.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
          {lines.map((line) => (
            <li key={line.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${line.indent ? 'sm:pl-6' : ''}`}>
              <span className="min-w-0 break-words text-sm text-slate-700 dark:text-slate-300">{line.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                {control(line)}
                {line.exemptable && (
                  <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                    <input type="checkbox" checked={!!inputs[line.id]?.exempt} onChange={(e) => set(line.id, { exempt: e.target.checked || undefined })} className="rounded border-slate-300" />Exempt
                  </label>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={run} loading={busy} disabled={busy || blocked || lines.length === 0}>Work out the score</Button>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {result && (
        <div className="space-y-3" aria-live="polite">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
            {result.status === 'COMPLETE' ? (
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                {result.scorePercent}%{result.marks ? ` · ${result.marks} of ${result.totalMarks} marks` : ''}{result.band ? ` · ${result.band.label}` : ''}
              </p>
            ) : (
              <p className="font-semibold text-amber-800 dark:text-amber-300">{result.status === 'INCOMPLETE' ? 'No final score yet: some lines still need ratings.' : 'Some results can’t be scored:'}</p>
            )}
            {result.problems.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-red-800">{result.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">{result.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Score of each line</caption>
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr>
                  <th scope="col" className={thClass}>Line</th>
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={`${thClass} text-right`}>Score</th>
                  <th scope="col" className={`${thClass} text-right`}>{result.totalMarks ? 'Max marks' : 'Weight'}</th>
                  <th scope="col" className={`${thClass} text-right`}>Share</th>
                  {result.totalMarks && <th scope="col" className={`${thClass} text-right`}>Marks</th>}
                  <th scope="col" className={`${thClass} text-right`}>Points of total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {result.kras.flatMap((k) => [resultRow(k, false), ...k.kpis.map((p) => resultRow(p, true))])}
                {result.fields.map((f) => resultRow(f, false))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
