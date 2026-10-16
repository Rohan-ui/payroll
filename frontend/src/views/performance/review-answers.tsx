import React, { useId, useState } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { myPerformanceApi, type Answer, type AnswerInput, type EvidenceFile, type FormLine, type WrittenReview } from '../../api/appraisals.api';
import { day, errorText, fieldClass, hintClass } from '../payroll/payroll-format';
import { DIRECTION, EVIDENCE, orNull, withUnit } from './performance-format';

/**
 * What a reviewer answers for one line of an appraisal form, and how an
 * answer reads afterwards. Values stay decimal strings; nothing is
 * calculated here.
 */

export type Control = 'actual' | 'rating' | 'marks' | 'manual' | 'yesNo' | 'number' | 'text' | 'longText' | 'dropdown' | 'multi' | 'date' | 'attachment';

const FIELD_CONTROL: Record<string, Control> = {
  RATING: 'rating', NUMBER: 'number', SHORT_TEXT: 'text', LONG_TEXT: 'longText', ACHIEVEMENTS: 'longText', DEVELOPMENT_GOAL: 'longText',
  YES_NO: 'yesNo', DROPDOWN: 'dropdown', MULTI_SELECT: 'multi', DATE: 'date', ATTACHMENT: 'attachment',
};

export const controlOf = (line: FormLine): Control => {
  if (line.kind === 'FIELD') return FIELD_CONTROL[line.field?.type ?? ''] ?? 'text';
  switch (line.method) {
    case 'RATING_SCALE': return 'rating';
    case 'DIRECT_MARKS': return 'marks';
    case 'YES_NO': return 'yesNo';
    case 'MANUAL': return 'manual';
    default: return 'actual';
  }
};

/** A question's settings, read defensively: they arrive as stored JSON. */
const configOf = (line: FormLine) => {
  const c = (line.field?.config ?? {}) as Record<string, unknown>;
  return {
    options: Array.isArray(c.options) ? c.options.filter((o): o is string => typeof o === 'string') : [],
    maxLength: typeof c.maxLength === 'number' ? c.maxLength : undefined,
  };
};

/** An answer while it is being edited: every value as typed. */
export interface Draft {
  actual: string; rating: string; marks: string; scorePercent: string; yesNo: '' | 'YES' | 'NO'; number: string; text: string;
  options: string[]; date: string; exempt: boolean; justification: string; comment: string;
}

export const EMPTY_DRAFT: Draft = { actual: '', rating: '', marks: '', scorePercent: '', yesNo: '', number: '', text: '', options: [], date: '', exempt: false, justification: '', comment: '' };

export const draftOf = (a: Answer | undefined): Draft => (a ? {
  actual: a.actual ?? '', rating: a.rating ?? '', marks: a.marks ?? '', scorePercent: a.scorePercent ?? '', yesNo: a.yesNo === null ? '' : a.yesNo ? 'YES' : 'NO',
  number: a.number ?? '', text: a.text ?? '', options: a.options, date: a.date ?? '', exempt: a.exempt, justification: a.justification ?? '', comment: a.comment ?? '',
} : EMPTY_DRAFT);

/** What is sent for a line: only the values its control takes, so nothing stale is stored. */
export const inputOf = (line: FormLine, d: Draft): AnswerInput => {
  const base: AnswerInput = { lineId: line.id, kind: line.kind, comment: orNull(d.comment) };
  if (d.exempt && line.allowsExemption) return { ...base, exempt: true, justification: orNull(d.justification) };
  switch (controlOf(line)) {
    case 'actual': return { ...base, actual: orNull(d.actual) };
    case 'rating': return { ...base, rating: orNull(d.rating) };
    case 'marks': return { ...base, marks: orNull(d.marks) };
    case 'manual': return { ...base, scorePercent: orNull(d.scorePercent), justification: orNull(d.justification) };
    case 'yesNo': return { ...base, yesNo: d.yesNo === '' ? null : d.yesNo === 'YES' };
    case 'number': return { ...base, number: orNull(d.number) };
    case 'dropdown': return { ...base, options: d.options.slice(0, 1) };
    case 'multi': return { ...base, options: d.options };
    case 'date': return { ...base, date: orNull(d.date) };
    case 'attachment': return base;
    default: return { ...base, text: orNull(d.text) };
  }
};

/** “Target ₹10,00,000 · threshold … · stretch …”, and which way is better. */
export const targetText = (line: FormLine) => {
  const unit = (v: string | null) => withUnit(v, line.unitLabel, line.currencyCode);
  const parts = [
    line.threshold !== null && `threshold ${unit(line.threshold)}`,
    line.target !== null && `target ${unit(line.target)}`,
    line.stretch !== null && `stretch ${unit(line.stretch)}`,
  ].filter(Boolean) as string[];
  if (line.direction === 'LOWER_IS_BETTER') parts.push(DIRECTION.LOWER_IS_BETTER.toLowerCase());
  return parts.length ? parts.join(' · ') : null;
};

const ratingLabel = (line: FormLine, value: string | null) => {
  if (value === null) return null;
  const level = line.scale?.levels.find((l) => Number(l.value) === Number(value));
  return level ? `${level.value} · ${level.label}` : value;
};

/** An answer as words, for reading. */
export const answerText = (line: FormLine, a: Answer | undefined): string => {
  if (!a) return 'Not answered';
  if (a.exempt) return `Exempt${a.justification ? `: ${a.justification}` : ''}`;
  switch (controlOf(line)) {
    case 'actual': return a.actual === null ? 'Not answered' : withUnit(a.actual, line.unitLabel, line.currencyCode);
    case 'rating': return ratingLabel(line, a.rating) ?? 'Not rated';
    case 'marks': return a.marks === null ? 'Not marked' : `${a.marks}${line.maxMarks ? ` of ${line.maxMarks}` : ''} marks`;
    case 'manual': return a.scorePercent === null ? 'Not scored' : `${a.scorePercent}%${a.justification ? `: ${a.justification}` : ''}`;
    case 'yesNo': return a.yesNo === null ? 'Not answered' : a.yesNo ? 'Yes' : 'No';
    case 'number': return a.number ?? 'Not answered';
    case 'dropdown':
    case 'multi': return a.options.length ? a.options.join(', ') : 'Not answered';
    case 'date': return a.date ? day(a.date) : 'Not answered';
    case 'attachment': return 'See the attached files';
    default: return a.text ?? 'Not answered';
  }
};

/** The line's name with its KRA, as it reads on a form. */
export const lineLabel = (line: FormLine) => (line.kind === 'KPI' && line.kraName ? `${line.kraName} → ${line.name}` : line.name);

/** Inputs for one line, labelled for screen readers by the line's name. */
export const AnswerControls: React.FC<{ line: FormLine; draft: Draft; onChange: (patch: Partial<Draft>) => void; disabled?: boolean }> = ({ line, draft, onChange, disabled }) => {
  const id = useId();
  const label = lineLabel(line);
  const control = controlOf(line);
  const config = configOf(line);
  const decimal = (key: 'actual' | 'rating' | 'marks' | 'scorePercent' | 'number', what: string, hint?: string) => (
    <span className="block">
      <label htmlFor={`${id}-${key}`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">{what}</label>
      <input id={`${id}-${key}`} className={`${fieldClass} sm:max-w-[14rem]`} inputMode="decimal" value={draft[key]} disabled={disabled} onChange={(e) => onChange({ [key]: e.target.value })} aria-describedby={hint ? `${id}-${key}-hint` : undefined} />
      {hint && <span id={`${id}-${key}-hint`} className={hintClass}>{hint}</span>}
    </span>
  );

  if (draft.exempt) return null;
  switch (control) {
    case 'actual':
      return decimal('actual', line.method === 'COMPLETION_PERCENT' ? 'Completed (%)' : `Actual result${line.unitLabel && !line.currencyCode ? ` (${line.unitLabel})` : line.currencyCode ? ` (${line.currencyCode})` : ''}`, targetText(line) ?? undefined);
    case 'rating':
      if (line.scale?.kind === 'LEVELS') {
        return (
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Rating</legend>
            <div className="flex flex-wrap gap-2">
              {line.scale.levels.map((l) => (
                <label key={l.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${Number(draft.rating) === Number(l.value) && draft.rating !== '' ? 'border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-900/30 dark:text-teal-100' : 'border-slate-200 text-slate-700 dark:border-[#2B293E] dark:text-slate-300'}`}>
                  <input type="radio" name={`${id}-rating`} value={l.value} checked={draft.rating !== '' && Number(draft.rating) === Number(l.value)} disabled={disabled} onChange={() => onChange({ rating: l.value })} className="h-4 w-4" />
                  <span><span className="font-semibold tabular-nums">{l.value}</span> · {l.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      }
      return decimal('rating', line.scale?.kind === 'MARKS' ? 'Marks' : 'Rating', line.scale?.min !== null && line.scale?.max !== null && line.scale ? `From ${line.scale.min} to ${line.scale.max}${line.scale.step ? `, in steps of ${line.scale.step}` : ''}.` : undefined);
    case 'marks':
      return decimal('marks', 'Marks', line.maxMarks ? `Out of ${line.maxMarks}${line.minMarks ? `, at least ${line.minMarks}` : ''}.` : undefined);
    case 'manual':
      return (
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          {decimal('scorePercent', 'Score (%)', 'From 0 to 100.')}
          <span className="block">
            <label htmlFor={`${id}-why`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Why this score</label>
            <textarea id={`${id}-why`} className={fieldClass} rows={2} maxLength={2000} value={draft.justification} disabled={disabled} onChange={(e) => onChange({ justification: e.target.value })} />
          </span>
        </div>
      );
    case 'yesNo':
      return (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Answer</legend>
          <div className="flex gap-2">
            {(['YES', 'NO'] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-[#2B293E]">
                <input type="radio" name={`${id}-yesno`} checked={draft.yesNo === v} disabled={disabled} onChange={() => onChange({ yesNo: v })} className="h-4 w-4" />{v === 'YES' ? 'Yes' : 'No'}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case 'number':
      return decimal('number', 'Answer');
    case 'dropdown':
      return (
        <span className="block">
          <label htmlFor={`${id}-choice`} className="sr-only">{label}</label>
          <select id={`${id}-choice`} className={`${fieldClass} sm:max-w-sm`} value={draft.options[0] ?? ''} disabled={disabled} onChange={(e) => onChange({ options: e.target.value ? [e.target.value] : [] })}>
            <option value="">Choose…</option>
            {config.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </span>
      );
    case 'multi':
      return (
        <fieldset>
          <legend className="sr-only">{label}</legend>
          <div className="flex flex-wrap gap-2">
            {config.options.map((o) => (
              <label key={o} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-[#2B293E]">
                <input type="checkbox" checked={draft.options.includes(o)} disabled={disabled} className="h-4 w-4 rounded border-slate-300"
                  onChange={(e) => onChange({ options: e.target.checked ? [...draft.options, o] : draft.options.filter((x) => x !== o) })} />{o}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case 'date':
      return (
        <span className="block">
          <label htmlFor={`${id}-date`} className="sr-only">{label}</label>
          <input id={`${id}-date`} type="date" className={`${fieldClass} sm:max-w-[12rem]`} value={draft.date} disabled={disabled} onChange={(e) => onChange({ date: e.target.value })} />
        </span>
      );
    case 'attachment':
      return <p className={hintClass}>Attach the file below.</p>;
    default:
      return (
        <span className="block">
          <label htmlFor={`${id}-text`} className="sr-only">{label}</label>
          {control === 'longText'
            ? <textarea id={`${id}-text`} className={fieldClass} rows={4} maxLength={config.maxLength ?? 10000} value={draft.text} disabled={disabled} onChange={(e) => onChange({ text: e.target.value })} />
            : <input id={`${id}-text`} className={fieldClass} maxLength={config.maxLength ?? 10000} value={draft.text} disabled={disabled} onChange={(e) => onChange({ text: e.target.value })} />}
          {config.maxLength && <span className={hintClass}>{draft.text.length} of {config.maxLength} characters.</span>}
        </span>
      );
  }
};

/** Downloads an evidence file through the signed-in API; the file never gets a public address. */
export const EvidenceLink: React.FC<{ file: EvidenceFile }> = ({ file }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const bytes = await myPerformanceApi.file(file.id);
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button type="button" onClick={open} disabled={busy} className="inline-flex items-center gap-1 rounded text-xs font-semibold text-teal-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 dark:text-teal-400">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />{file.name}<span className="sr-only"> (download)</span>
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
};

/** A submitted review, read-only: each line's answer, comments and evidence. */
export const WrittenReviewView: React.FC<{ review: WrittenReview; lines: FormLine[]; heading?: string }> = ({ review, lines, heading }) => {
  const answered = lines.filter((l) => review.items.some((i) => i.lineId === l.id) || review.files.some((f) => f.lineId === l.id));
  const loose = review.files.filter((f) => !f.lineId || !lines.some((l) => l.id === f.lineId));
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {heading ?? (review.reviewer ? `By ${review.reviewer}` : 'Reviewer not shown')}{review.submittedAt ? ` · submitted ${new Date(review.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
      </p>
      {answered.length > 0 && (
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-[#2B293E] dark:border-[#2B293E]">
          {answered.map((line) => {
            const item = review.items.find((i) => i.lineId === line.id);
            const files = review.files.filter((f) => f.lineId === line.id);
            return (
              <div key={line.id} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <dt className="break-words font-medium text-slate-700 dark:text-slate-300">{lineLabel(line)}</dt>
                <dd className="min-w-0 space-y-1 break-words text-slate-900 dark:text-slate-100">
                  <span className="whitespace-pre-wrap">{answerText(line, item)}</span>
                  {item?.comment && <span className="block whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">“{item.comment}”</span>}
                  {files.length > 0 && <span className="flex flex-wrap gap-2">{files.map((f) => <EvidenceLink key={f.id} file={f} />)}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {review.overallComment && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800 dark:bg-white/5 dark:text-slate-200">{review.overallComment}</p>}
      {loose.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{loose.map((f) => <EvidenceLink key={f.id} file={f} />)}</p>
      )}
      {!answered.length && !review.overallComment && !loose.length && <p className="text-sm text-slate-500">Approved with no comment.</p>}
    </div>
  );
};

export const evidenceHint = (line: FormLine) => (line.evidence === 'NONE' ? null : `Evidence: ${EVIDENCE[line.evidence].toLowerCase()}`);
