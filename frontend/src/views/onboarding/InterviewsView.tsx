import React, { useEffect, useId, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, KanbanSquare, List, Search } from 'lucide-react';
import { cn } from '../../utils/cn';
import { onboardingApi, type InterviewListItem } from '../../api/onboarding.api';
import { fieldClass } from './onboarding-format';
import { InterviewCalendar } from './interviews/InterviewCalendar';
import { InterviewBoard } from './interviews/InterviewBoard';
import { InterviewTable } from './interviews/InterviewTable';
import { addDays, periodDays, periodLabel, shiftAnchor, STAGES, stageOf, type CalendarUnit } from './interviews/interview-utils';

interface Props {
  onOpenCandidate: (candidateId: string) => void;
}

type ViewMode = 'calendar' | 'board' | 'list';
const VIEWS: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'list', label: 'List', icon: List },
];
const PREF_KEY = 'onboarding.interviews.view';

/** The view a person last used is a convenience only; storage may be blocked, so failures fall back quietly. */
const readPref = (): { view: ViewMode; unit: CalendarUnit } => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as { view?: string; unit?: string } | null;
    return {
      view: VIEWS.some((v) => v.id === saved?.view) ? (saved?.view as ViewMode) : 'calendar',
      unit: saved?.unit === 'month' ? 'month' : 'week',
    };
  } catch {
    return { view: 'calendar', unit: 'week' };
  }
};

const segment = (isOn: boolean) =>
  cn(
    'h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
    isOn ? 'bg-white dark:bg-[#181724] text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
  );
const navButton = 'h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';

/** Interviews for a week or a month, as a calendar, a board by stage, or a sortable list, in the viewer's time zone. */
export const InterviewsView: React.FC<Props> = ({ onOpenCandidate }) => {
  const ids = useId();
  const [view, setView] = useState<ViewMode>(() => readPref().view);
  const [unit, setUnit] = useState<CalendarUnit>(() => readPref().unit);
  const [anchor, setAnchor] = useState(() => new Date());
  const [mine, setMine] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<InterviewListItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ view, unit }));
    } catch {
      // Storage blocked (private window): the choice just isn't remembered.
    }
  }, [view, unit]);

  const days = useMemo(() => periodDays(anchor, unit), [anchor, unit]);
  const from = days[0];
  const to = addDays(days[days.length - 1], 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    onboardingApi
      .listInterviews(from.toISOString(), to.toISOString(), { mine })
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setNow(Date.now());
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from.getTime(), to.getTime(), mine, reload]);

  const query = search.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (row) =>
      (showCancelled || row.status !== 'CANCELLED') &&
      (!query || row.candidate.name.toLowerCase().includes(query) || row.candidate.position.toLowerCase().includes(query) || row.candidate.code.toLowerCase().includes(query)),
  );
  const counts = STAGES.map((s) => ({ ...s, count: visible.filter((r) => stageOf(r, now) === s.id).length })).filter((s) => s.id !== 'cancelled' || showCancelled);
  const isThisPeriod = days.some((d) => d.toDateString() === new Date().toDateString());

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" aria-label={`Previous ${unit}`} onClick={() => setAnchor((a) => shiftAnchor(a, unit, -1))} className={navButton}>
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-[10.5rem] text-center tabular-nums" aria-live="polite">{periodLabel(anchor, unit)}</h2>
            <button type="button" aria-label={`Next ${unit}`} onClick={() => setAnchor((a) => shiftAnchor(a, unit, 1))} className={navButton}>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button type="button" disabled={isThisPeriod} onClick={() => setAnchor(new Date())} className="h-9 px-3 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
              Today
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Period" className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#12111A] border border-slate-200 dark:border-[#2B293E]">
              {(['week', 'month'] as const).map((u) => (
                <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={segment(unit === u)}>
                  {u === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
            <div role="group" aria-label="View" className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#12111A] border border-slate-200 dark:border-[#2B293E]">
              {VIEWS.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={segment(view === id)}>
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <label htmlFor={`${ids}-search`} className="sr-only">Search interviews</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
            <input id={`${ids}-search`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Candidate, code or position" className={cn(fieldClass, 'pl-9 h-9')} />
          </div>
          <label htmlFor={`${ids}-mine`} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input id={`${ids}-mine`} type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500" />
            Only interviews I'm on
          </label>
          <label htmlFor={`${ids}-cancelled`} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input id={`${ids}-cancelled`} type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500" />
            Show cancelled
          </label>
        </div>

        {rows && (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-slate-100 dark:border-[#2B293E] text-xs text-slate-600 dark:text-slate-400" aria-label="Interviews in this period by status">
            <li className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{visible.length} interview{visible.length === 1 ? '' : 's'}</li>
            {counts.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full', s.dot)} aria-hidden="true" />
                {s.label} <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{s.count}</span>
              </li>
            ))}
            <li className="ml-auto text-slate-400">Times in your time zone</li>
          </ul>
        )}
      </div>

      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3">
          <span>The interviews could not be loaded: {error}</span>
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="h-72 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true">
          <span className="sr-only" role="status">Loading interviews</span>
        </div>
      ) : (
        <div className={cn('transition-opacity', isLoading && 'opacity-60')} aria-busy={isLoading}>
          {visible.length === 0 && view !== 'calendar' ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-[#2B293E]">
              <p className="font-semibold text-slate-800 dark:text-slate-200">{query ? 'No interviews match this search' : `No interviews this ${unit}`}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {query ? 'Try another name, or clear the search.' : 'Move to another period, or schedule one from a candidate in screening or between rounds.'}
              </p>
            </div>
          ) : view === 'calendar' ? (
            <InterviewCalendar days={days} unit={unit} anchor={anchor} rows={visible} now={now} onOpen={onOpenCandidate} />
          ) : view === 'board' ? (
            <InterviewBoard rows={visible} now={now} showCancelled={showCancelled} onOpen={onOpenCandidate} />
          ) : (
            <InterviewTable rows={visible} now={now} onOpen={onOpenCandidate} />
          )}
        </div>
      )}
    </div>
  );
};
