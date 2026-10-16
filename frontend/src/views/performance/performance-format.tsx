import React, { useCallback, useEffect, useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import type { ConversionMethod, Direction, EvidenceRequirement, InputKind, LibraryStatus, ListQuery, MeasurementType, Page } from '../../api/performance.api';
import { errorText } from '../payroll/payroll-format';

export const EVIDENCE: Record<EvidenceRequirement, string> = {
  NONE: 'Not asked for',
  OPTIONAL: 'Optional',
  REQUIRED: 'Required',
};

export const MEASUREMENT: Record<MeasurementType, { label: string; hint: string }> = {
  NUMERIC: { label: 'Number', hint: 'Any measured number, such as units produced.' },
  PERCENTAGE: { label: 'Percentage', hint: 'A share, such as tasks completed on time (%).' },
  CURRENCY: { label: 'Amount of money', hint: 'Such as sales revenue.' },
  COUNT: { label: 'Count', hint: 'How many, such as new clients or hires.' },
  DURATION: { label: 'Time or duration', hint: 'Such as average resolution time; give the unit.' },
  QUALITY_SCORE: { label: 'Quality score', hint: 'A measured score, such as customer satisfaction 4.2 of 5.' },
  MILESTONE: { label: 'Milestone completion', hint: 'How much of a planned milestone was completed.' },
  YES_NO: { label: 'Yes / no', hint: 'Achieved or not, such as a certification.' },
  RATING: { label: 'Rating', hint: 'Rated by the reviewer on a rating scale.' },
  QUALITATIVE: { label: 'Qualitative', hint: 'A judgement, such as communication, rated on a descriptive scale.' },
};

/** KPIs with no measured result: no direction and no targets. */
export const UNMEASURED: MeasurementType[] = ['YES_NO', 'RATING', 'QUALITATIVE'];
export const RATED: MeasurementType[] = ['RATING', 'QUALITATIVE'];

export const DIRECTION: Record<Direction, string> = {
  HIGHER_IS_BETTER: 'Higher is better',
  LOWER_IS_BETTER: 'Lower is better',
  NOT_APPLICABLE: 'Not applicable',
};

export const INPUT_KIND: Record<InputKind, { label: string; hint: string }> = {
  LEVELS: { label: 'Pick a level', hint: 'Raters choose one of the levels you define, such as 1–5 or “Meets expectations”.' },
  RANGE: { label: 'Number in a range', hint: 'Raters give any value in the range, in the step you set (0.5 allows half ratings).' },
  MARKS: { label: 'Marks', hint: 'Raters give marks from 0 up to each KRA’s or KPI’s own maximum marks.' },
};

export const CONVERSION: Record<ConversionMethod, { label: string; hint: string }> = {
  PROPORTION_OF_MAX: { label: 'Share of the highest rating', hint: 'Rating ÷ highest rating. On 1–5, a 3 scores 60%.' },
  MIN_TO_MAX: { label: 'From lowest to highest', hint: '(Rating − lowest) ÷ (highest − lowest). On 1–5, a 1 scores 0% and a 3 scores 50%.' },
  LEVEL_PERCENT: { label: 'A score for each level', hint: 'You set what each level scores, such as 3 = 70%.' },
};

/** A decimal string for display only, with its unit. */
export const withUnit = (value: string | null, unit: string | null, currency: string | null = null) => {
  if (value === null) return '—';
  if (currency) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
    } catch {
      return `${currency} ${value}`;
    }
  }
  return unit ? (unit === '%' ? `${value}%` : `${value} ${unit}`) : value;
};

/**
 * Sum of weights or marks, for display only: counted in ten-thousandths
 * of a percent as whole numbers, so no binary rounding shows. Null when a
 * value is missing or not a number.
 */
export const weightTotal = (weights: string[]): string | null => {
  let units = 0;
  for (const w of weights) {
    const match = /^(\d{1,8})(?:\.(\d{1,4}))?$/.exec(w.trim());
    if (!match) return null;
    units += Number(match[1]) * 10000 + Number((match[2] ?? '').padEnd(4, '0'));
  }
  const whole = Math.floor(units / 10000);
  const part = String(units % 10000).padStart(4, '0').replace(/0+$/, '');
  return part ? `${whole}.${part}` : String(whole);
};

/** A decimal string in a form field: what the person typed, or null when empty. */
export const orNull = (value: string | null | undefined) => (value === null || value === undefined || value.trim() === '' ? null : value.trim());

/**
 * A server-paginated list: reloads when its query changes, and keeps the
 * previous page on screen while the next one loads.
 */
export function usePagedList<T, Q extends object = ListQuery>(load: (q: Q) => Promise<Page<T>>, query: Q) {
  const [page, setPage] = useState<Page<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query);

  const reload = useCallback(() => {
    let live = true;
    setLoading(true);
    setError(null);
    load(JSON.parse(key) as Q)
      .then((result) => { if (live) setPage(result); })
      .catch((e) => { if (live) setError(errorText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [load, key]);
  useEffect(reload, [reload]);

  return { page, error, loading, reload };
}

export const Pager: React.FC<{ page: Page<unknown>; onPage: (page: number) => void; noun: string }> = ({ page, onPage, noun }) => {
  if (page.total <= page.limit) return null;
  const first = (page.page - 1) * page.limit + 1;
  return (
    <nav aria-label={`${noun} pages`} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-[#2B293E] dark:text-slate-400">
      <span>{first}–{Math.min(page.page * page.limit, page.total)} of {page.total} {noun}</span>
      <span className="flex gap-2">
        <button type="button" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-[#2B293E]">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Previous
        </button>
        <button type="button" disabled={!page.hasMore} onClick={() => onPage(page.page + 1)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-[#2B293E]">
          Next<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    </nav>
  );
};

/** A list's loading, error and empty states, so each tab shows them the same way. */
export const ListState: React.FC<{ loading: boolean; error: string | null; empty: boolean; what: string; onRetry: () => void; emptyTitle: string; emptyText: string }> = ({
  loading, error, empty, what, onRetry, emptyTitle, emptyText,
}) => {
  if (error) {
    return (
      <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>{what} could not be loaded: {error}</span>
        <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>
      </div>
    );
  }
  if (loading && empty) return <div className="h-24 animate-pulse bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading {what.toLowerCase()}</span></div>;
  if (empty) {
    return (
      <div className="p-8 text-center">
        <p className="font-semibold text-slate-800 dark:text-slate-200">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{emptyText}</p>
      </div>
    );
  }
  return null;
};

/** Active and archived items of a library, each with its count. Archiving hides an item from new work; it isn't deleted. */
export const StatusTabs: React.FC<{ value: LibraryStatus; counts: Page<unknown>['counts']; onChange: (status: LibraryStatus) => void; noun: string }> = ({ value, counts, onChange, noun }) => (
  <div role="group" aria-label={`Active or archived ${noun}`} className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-white/5">
    {(['ACTIVE', 'ARCHIVED'] as const).map((status) => (
      <button key={status} type="button" aria-pressed={value === status} onClick={() => onChange(status)}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${value === status ? 'bg-white text-slate-900 shadow-sm dark:bg-[#181724] dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}>
        {status === 'ACTIVE' ? 'Active' : 'Archived'}{counts ? ` (${status === 'ACTIVE' ? counts.active : counts.archived})` : ''}
      </button>
    ))}
  </div>
);

/**
 * Confirms deleting a setup item for good. The server refuses while anything
 * uses it and says what; that answer is shown here.
 */
export const DeleteDialog: React.FC<{ what: string; code: string; name: string; onClose: () => void; onDelete: () => Promise<void> }> = ({ what, code, name, onClose, onDelete }) => {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Delete ${what} ${code}?`} onClose={onClose} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Keep it</Button><Button variant="danger" onClick={confirm} loading={busy} disabled={busy || !!error}>Delete {code}</Button></>}>
      <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
        <p id={id}>“{name}” and everything in it is removed for good. This is only possible while nothing uses it; otherwise archive it, which keeps it for history and out of new work.</p>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
      </div>
    </Dialog>
  );
};
