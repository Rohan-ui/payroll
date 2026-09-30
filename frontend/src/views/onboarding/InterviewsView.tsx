import React, { useEffect, useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { onboardingApi, type InterviewListItem } from '../../api/onboarding.api';
import { INTERVIEW_TYPE_LABELS } from './onboarding-format';

interface Props {
  onOpenCandidate: (candidateId: string) => void;
}

const DAY = 24 * 3600 * 1000;

/** Monday 00:00 (in the viewer's time zone) of the week containing a date. */
function weekStart(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const timeLabel = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/** The week's interviews, by day, in the viewer's own time zone. */
export const InterviewsView: React.FC<Props> = ({ onOpenCandidate }) => {
  const ids = useId();
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [mine, setMine] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [rows, setRows] = useState<InterviewListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)), [start]);
  const end = days[6].getTime() + DAY;

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    onboardingApi
      .listInterviews(start.toISOString(), new Date(end).toISOString(), { mine })
      .then((data) => !cancelled && setRows(data))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [start, mine, reload]);

  const visible = (rows ?? []).filter((row) => showCancelled || row.status !== 'CANCELLED');
  const byDay = new Map<string, InterviewListItem[]>();
  for (const row of visible) {
    const key = dayKey(new Date(row.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const rangeLabel = `${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(days[0])} to ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(days[6])}`;
  const today = dayKey(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous week" onClick={() => setStart((s) => new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7))} className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 min-w-[12rem] text-center" aria-live="polite">{rangeLabel}</h2>
          <button type="button" aria-label="Next week" onClick={() => setStart((s) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7))} className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setStart(weekStart(new Date()))} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E]">This week</button>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label htmlFor={`${ids}-mine`} className="inline-flex items-center gap-2">
            <input id={`${ids}-mine`} type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Only interviews I'm on
          </label>
          <label htmlFor={`${ids}-cancelled`} className="inline-flex items-center gap-2">
            <input id={`${ids}-cancelled`} type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show cancelled
          </label>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Times are shown in your time zone. Each interview also keeps the time zone it was arranged in.</p>

      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The interviews could not be loaded: {error} <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="h-48 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true">
          <span className="sr-only" role="status">Loading interviews</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No interviews this week</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Schedule one from a candidate who is in screening or between rounds.</p>
        </div>
      ) : (
        <ol className="grid grid-cols-1 lg:grid-cols-7 gap-3">
          {days.map((day) => {
            const items = byDay.get(dayKey(day)) ?? [];
            return (
              <li key={dayKey(day)} className={`rounded-2xl border p-2 min-h-[6rem] ${dayKey(day) === today ? 'border-teal-300 bg-teal-50/40 dark:bg-teal-950/20' : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]'} ${items.length === 0 ? 'hidden lg:block' : ''}`}>
                <h3 className="px-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(day)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {items.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => onOpenCandidate(row.candidate.id)}
                        className={`w-full text-left p-2 rounded-lg border text-xs hover:border-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${row.status === 'CANCELLED' ? 'opacity-60 line-through border-slate-200' : 'border-slate-200 dark:border-[#2B293E]'}`}
                      >
                        <span className="block font-semibold text-slate-900 dark:text-slate-100">{timeLabel(row.startsAt)} · {row.candidate.name}</span>
                        <span className="block text-slate-600 dark:text-slate-400">
                          Round {row.roundNumber} · {INTERVIEW_TYPE_LABELS[row.interviewType]} · {row.durationMinutes} min
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {row.status === 'COMPLETED' && !row.decision && <Badge variant="warning" size="sm">Awaiting decision</Badge>}
                          {row.status === 'COMPLETED' && row.decision && <Badge variant="success" size="sm">Decided</Badge>}
                          {row.status === 'CANCELLED' && <Badge variant="neutral" size="sm">Cancelled</Badge>}
                          <Badge variant="neutral" size="sm">
                            Feedback {row.panel.filter((p) => p.feedbackSubmitted).length}/{row.panel.length}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
