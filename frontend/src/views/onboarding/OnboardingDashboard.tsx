import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, CalendarClock, FileSignature, UserCheck, MessageSquareText, BadgeCheck, FileSearch, Gavel,
  Video, Phone, MapPin, ArrowRight, CheckCircle2, UserPlus,
} from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../utils/cn';
import {
  onboardingApi, STATUS_LABELS,
  type CandidateListQuery, type CandidateStatus, type CandidateSummary, type InterviewListItem, type OnboardingSummary,
} from '../../api/onboarding.api';
import { BROWSER_TIMEZONE, formatDate, STATUS_VARIANT } from './onboarding-format';

interface Props {
  onShowCandidates: (filters: Partial<CandidateListQuery>) => void;
  onShowInterviews: () => void;
  onShowOffers: (awaitingMine: boolean) => void;
  /** Omitted when this person may not add candidates. */
  onAddCandidate?: () => void;
  /** Opens one candidate's page. */
  onOpenCandidate?: (candidateId: string) => void;
}

const card = 'rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]';
const DAY_MS = 86_400_000;
const LIST_SIZE = 5;

/** The workflow's stages grouped into the phases people talk about; closed stages sit apart. */
export const PHASES: { id: string; label: string; bar: string; dot: string; stages: CandidateStatus[] }[] = [
  { id: 'apply', label: 'Application', bar: 'bg-sky-500', dot: 'bg-sky-500', stages: ['NEW', 'FORM_SENT', 'FORM_SUBMITTED', 'SCREENING', 'ELIGIBLE'] },
  { id: 'interview', label: 'Interview', bar: 'bg-violet-500', dot: 'bg-violet-500', stages: ['INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'SELECTED'] },
  { id: 'offer', label: 'Offer', bar: 'bg-amber-500', dot: 'bg-amber-500', stages: ['OFFER_SENT', 'OFFER_ACCEPTED'] },
  { id: 'prejoin', label: 'Pre-joining', bar: 'bg-teal-500', dot: 'bg-teal-500', stages: ['DOCUMENT_COLLECTION', 'VERIFICATION', 'READY_TO_JOIN'] },
  { id: 'joined', label: 'Joined', bar: 'bg-emerald-600', dot: 'bg-emerald-600', stages: ['JOINED'] },
];
export const CLOSED_STAGES: CandidateStatus[] = ['NOT_ELIGIBLE', 'REJECTED', 'OFFER_DECLINED', 'WITHDRAWN'];

const countOf = (summary: OnboardingSummary, stages: CandidateStatus[]) => stages.reduce((n, s) => n + (summary.byStatus[s] ?? 0), 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A moment's calendar date (YYYY-MM-DD) in a time zone; the browser's own zone when none is given. */
const dateIn = (ms: number, timeZone?: string) => new Date(ms).toLocaleDateString('en-CA', { timeZone });
const daysUntil = (isoDate: string) => Math.round((new Date(`${isoDate}T00:00:00`).getTime() - new Date(`${dateIn(Date.now())}T00:00:00`).getTime()) / DAY_MS);
const whenLabel = (days: number) => (days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);
const TYPE_ICON = { ONLINE: Video, PHONE: Phone, IN_PERSON: MapPin } as const;
const TYPE_LABEL = { ONLINE: 'Online', PHONE: 'Phone', IN_PERSON: 'In person' } as const;

/** Loads one side list on its own, so a slow or failed list never blanks the dashboard. */
function useList<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const run = useCallback(() => {
    setState({ data: null, error: null });
    load().then((data) => setState({ data, error: null })).catch((e: Error) => setState({ data: null, error: e.message }));
    // load is a fresh closure each render; the lists load once per dashboard open.
  }, []);
  useEffect(run, [run]);
  return { ...state, retry: run };
}

const Panel: React.FC<{ id: string; title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ id, title, action, className, children }) => (
  <section aria-labelledby={id} className={cn(card, 'p-4 sm:p-5 flex flex-col', className)}>
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 id={id} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
    {children} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
  </button>
);

const ListState: React.FC<{ error: string | null; retry: () => void; rows?: number }> = ({ error, retry, rows = 3 }) =>
  error ? (
    <p role="alert" className="text-sm text-red-700">
      Could not load this list: {error}{' '}
      <button type="button" onClick={retry} className="font-semibold underline">Try again</button>
    </p>
  ) : (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-11 rounded-lg bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />)}
    </div>
  );

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex-1 grid place-items-center text-center text-sm text-slate-500 dark:text-slate-400 py-6">{children}</p>
);

/** What needs attention now, from this workspace's records. Each number opens the records it counts. */
export const OnboardingDashboard: React.FC<Props> = ({ onShowCandidates, onShowInterviews, onShowOffers, onAddCandidate, onOpenCandidate }) => {
  const [summary, setSummary] = useState<OnboardingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    onboardingApi.summary(BROWSER_TIMEZONE).then(setSummary).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3">
        <span>The dashboard could not be loaded: {error}</span>
        <button type="button" onClick={load} className="font-semibold underline">Try again</button>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />)}
        </div>
        <div className="h-40 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />
        <span className="sr-only" role="status">Loading the onboarding dashboard</span>
      </div>
    );
  }
  if (summary.totalCandidates === 0) {
    return (
      <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 dark:border-[#2B293E]">
        <span className="mx-auto mb-3 w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/40 grid place-items-center text-teal-600"><UserPlus className="w-6 h-6" aria-hidden="true" /></span>
        <p className="font-semibold text-slate-800 dark:text-slate-200">No candidates yet</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add your first candidate to start screening, scheduling interviews and tracking decisions.</p>
        {onAddCandidate && (
          <button type="button" onClick={onAddCandidate} className="mt-4 inline-flex items-center px-4 h-10 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            Add candidate
          </button>
        )}
      </div>
    );
  }

  return (
    <Overview
      summary={summary}
      onShowCandidates={onShowCandidates}
      onShowInterviews={onShowInterviews}
      onShowOffers={onShowOffers}
      onOpenCandidate={onOpenCandidate ?? (() => onShowCandidates({}))}
    />
  );
};

const Overview: React.FC<{ summary: OnboardingSummary; onOpenCandidate: (id: string) => void } & Pick<Props, 'onShowCandidates' | 'onShowInterviews' | 'onShowOffers'>> = ({
  summary, onShowCandidates, onShowInterviews, onShowOffers, onOpenCandidate,
}) => {
  const now = Date.now();
  const interviews = useList(() => onboardingApi.listInterviews(new Date(now).toISOString(), new Date(now + 7 * DAY_MS).toISOString()));
  const joining = useList(() =>
    onboardingApi.listCandidates({ page: 1, limit: 20, archived: 'active', joiningFrom: summary.joiningSoon.from, joiningTo: summary.joiningSoon.to }).then((r) => r.items),
  );
  const recent = useList(() => onboardingApi.listCandidates({ page: 1, limit: LIST_SIZE, archived: 'active' }).then((r) => r.items));

  const inProgress = PHASES.slice(0, 4).reduce((n, p) => n + countOf(summary, p.stages), 0);
  const accepted = countOf(summary, ['OFFER_ACCEPTED', 'DOCUMENT_COLLECTION', 'VERIFICATION', 'READY_TO_JOIN', 'JOINED']);
  const declined = countOf(summary, ['OFFER_DECLINED']);
  const acceptance = accepted + declined > 0 ? Math.round((accepted / (accepted + declined)) * 100) : null;
  const closed = countOf(summary, CLOSED_STAGES);

  const kpis = [
    { label: 'Active candidates', value: summary.totalCandidates, hint: `${inProgress} in progress · ${closed} closed`, icon: Users, tone: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40', onClick: () => onShowCandidates({}) },
    { label: 'Interviews today', value: summary.interviewsToday, hint: `Times in ${summary.timezone}`, icon: CalendarClock, tone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40', onClick: onShowInterviews },
    { label: 'Offers awaiting an answer', value: summary.offersAwaitingResponse, hint: acceptance === null ? 'No answers yet' : `${acceptance}% accepted so far`, icon: FileSignature, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40', onClick: () => onShowCandidates({ status: 'OFFER_SENT' }) },
    { label: 'Joining in 30 days', value: summary.joiningSoon.count, hint: `${formatDate(summary.joiningSoon.from)} – ${formatDate(summary.joiningSoon.to)}`, icon: UserCheck, tone: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40', onClick: () => onShowCandidates({ joiningFrom: summary.joiningSoon.from, joiningTo: summary.joiningSoon.to }) },
  ];

  const tasks = [
    { label: 'Your feedback due', count: summary.myFeedbackDue, hint: 'Interviews you sat on', icon: MessageSquareText, onClick: onShowInterviews, isYours: true },
    { label: 'Your approvals due', count: summary.myApprovalsDue, hint: 'Offers waiting for your approval', icon: BadgeCheck, onClick: () => onShowOffers(true), isYours: true },
    { label: 'Documents to verify', count: summary.candidatesWithDocumentsToVerify, hint: 'Candidates with uploads to check', icon: FileSearch, onClick: () => onShowCandidates({ documents: 'to_verify' }), isYours: false },
    { label: 'Awaiting a decision', count: summary.interviewsAwaitingDecision, hint: 'Interviews held, no decision yet', icon: Gavel, onClick: onShowInterviews, isYours: false },
    { label: 'Offers awaiting approval', count: summary.offersAwaitingApproval, hint: 'Submitted, not yet approved', icon: FileSignature, onClick: () => onShowOffers(false), isYours: false },
  ];
  const openTasks = tasks.filter((t) => t.count > 0);

  const upcoming = interviews.data?.filter((i) => i.status !== 'CANCELLED' && new Date(i.startsAt).getTime() >= now - 60 * 60_000).slice(0, LIST_SIZE);
  const joiningSorted = joining.data
    ?.filter((c) => c.expectedJoiningDate)
    .sort((a, b) => (a.expectedJoiningDate ?? '').localeCompare(b.expectedJoiningDate ?? ''))
    .slice(0, LIST_SIZE);

  return (
    <div className="space-y-5">
      {/* Headline numbers */}
      <div className="grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map(({ label, value, hint, icon: Icon, tone, onClick }) => (
          <button key={label} type="button" onClick={onClick} className={cn(card, 'group p-4 text-left hover:border-teal-300 hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500')}>
            <span className="flex items-start justify-between gap-3">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
              <span className={cn('w-8 h-8 rounded-lg grid place-items-center shrink-0', tone)}><Icon className="w-4 h-4" aria-hidden="true" /></span>
            </span>
            <span className="block -mt-1 text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</span>
            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{hint}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-teal-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>

      {/* Pipeline by phase */}
      <section aria-labelledby="ob-pipeline" className={cn(card, 'p-4 sm:p-5')}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ob-pipeline" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Hiring pipeline</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{plural(summary.totalCandidates, 'active candidate')} · pick a stage to see who is in it</p>
        </div>

        <div
          role="img"
          aria-label={`Pipeline: ${PHASES.map((p) => `${countOf(summary, p.stages)} ${p.label.toLowerCase()}`).join(', ')}, ${closed} closed`}
          className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"
        >
          {[...PHASES, { id: 'closed', bar: 'bg-slate-300 dark:bg-slate-600', stages: CLOSED_STAGES }].map((p) => {
            const n = countOf(summary, p.stages);
            return n > 0 ? <span key={p.id} className={p.bar} style={{ width: `${(n / summary.totalCandidates) * 100}%` }} /> : null;
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {PHASES.map((phase) => {
            const total = countOf(summary, phase.stages);
            const pct = Math.round((total / summary.totalCandidates) * 100);
            return (
              <div key={phase.id} className="rounded-lg border border-slate-100 dark:border-[#2B293E] bg-slate-50/60 dark:bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span className={cn('w-2 h-2 rounded-full', phase.dot)} aria-hidden="true" />
                    {phase.label}
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums">{pct}%</span>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{total}</p>
                <ul className="mt-2 space-y-0.5">
                  {phase.stages.map((stage) => {
                    const n = summary.byStatus[stage] ?? 0;
                    return (
                      <li key={stage}>
                        <button
                          type="button"
                          onClick={() => onShowCandidates({ status: stage })}
                          disabled={n === 0}
                          className="w-full flex items-center justify-between gap-2 px-1.5 py-1 -mx-1.5 rounded text-xs text-left hover:bg-white dark:hover:bg-white/5 disabled:hover:bg-transparent disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        >
                          <span className={n ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}>{STATUS_LABELS[stage]}</span>
                          <span className={cn('tabular-nums font-semibold', n ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600')}>{n}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {closed > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" /> Closed:</span>
            {CLOSED_STAGES.filter((s) => summary.byStatus[s]).map((s) => (
              <button key={s} type="button" onClick={() => onShowCandidates({ status: s })} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
                {STATUS_LABELS[s]} <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{summary.byStatus[s]}</span>
              </button>
            ))}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
        {/* Waiting on you */}
        <Panel id="ob-tasks" title="Needs attention">
          {openTasks.length === 0 ? (
            <Empty>
              <span className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-teal-500" aria-hidden="true" />
                Nothing is waiting right now.
              </span>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {openTasks.map(({ label, count, hint, icon: Icon, onClick, isYours }) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={onClick}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                      isYours ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/70 dark:border-amber-800/60 dark:bg-amber-950/30' : 'border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5',
                    )}
                  >
                    <span className={cn('w-8 h-8 rounded-lg grid place-items-center shrink-0', isYours ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{hint}</span>
                    </span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Upcoming interviews */}
        <Panel id="ob-interviews" title="Upcoming interviews" action={<LinkButton onClick={onShowInterviews}>All interviews</LinkButton>}>
          {!upcoming ? (
            <ListState error={interviews.error} retry={interviews.retry} />
          ) : upcoming.length === 0 ? (
            <Empty>No interviews in the next 7 days.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-[#2B293E] -my-1">
              {upcoming.map((i: InterviewListItem) => {
                const Icon = TYPE_ICON[i.interviewType];
                const days = daysUntil(dateIn(new Date(i.startsAt).getTime(), i.timezone));
                return (
                  <li key={i.id}>
                    <button type="button" onClick={() => onOpenCandidate(i.candidate.id)} className="w-full flex items-center gap-3 py-2.5 text-left rounded hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                      <span className="w-11 shrink-0 text-center rounded-lg border border-slate-200 dark:border-[#2B293E] py-1">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">{new Date(i.startsAt).toLocaleDateString(undefined, { month: 'short', timeZone: i.timezone })}</span>
                        <span className="block text-base font-semibold leading-tight text-slate-900 dark:text-slate-100">{new Date(i.startsAt).toLocaleDateString(undefined, { day: 'numeric', timeZone: i.timezone })}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{i.candidate.name}</span>
                        <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-label={TYPE_LABEL[i.interviewType]} />
                          {new Date(i.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: i.timezone })} · Round {i.roundNumber}{i.roundName ? ` · ${i.roundName}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        {days <= 1 && <Badge variant={days <= 0 ? 'warning' : 'info'} size="sm">{whenLabel(days)}</Badge>}
                        {i.isMine && <span className="text-[11px] font-medium text-teal-700 dark:text-teal-300">You're on the panel</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Joining soon */}
        <Panel id="ob-joining" title="Joining soon" action={<LinkButton onClick={() => onShowCandidates({ joiningFrom: summary.joiningSoon.from, joiningTo: summary.joiningSoon.to })}>See all</LinkButton>}>
          {!joiningSorted ? (
            <ListState error={joining.error} retry={joining.retry} />
          ) : joiningSorted.length === 0 ? (
            <Empty>No one is due to join in the next 30 days.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-[#2B293E] -my-1">
              {joiningSorted.map((c: CandidateSummary) => {
                const days = daysUntil(c.expectedJoiningDate ?? '');
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => onOpenCandidate(c.id)} className="w-full flex items-center gap-3 py-2.5 text-left rounded hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                      <Avatar name={c.fullName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.fullName}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{c.appliedPosition} · {STATUS_LABELS[c.status]}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className={cn('block text-xs font-semibold', days <= 7 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300')}>{whenLabel(days)}</span>
                        <span className="block text-[11px] text-slate-500">{formatDate(c.expectedJoiningDate)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Recently added */}
      <Panel id="ob-recent" title="Recently added" action={<LinkButton onClick={() => onShowCandidates({})}>All candidates</LinkButton>}>
        {!recent.data ? (
          <ListState error={recent.error} retry={recent.retry} rows={2} />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {recent.data.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenCandidate(c.id)} className="w-full h-full p-3 rounded-lg border border-slate-200 dark:border-[#2B293E] text-left hover:border-teal-300 hover:bg-slate-50/60 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={c.fullName} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.fullName}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{c.appliedPosition}</span>
                    </span>
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant={STATUS_VARIANT[c.status]} size="sm">{STATUS_LABELS[c.status]}</Badge>
                    <span className="text-[11px] text-slate-500">Added {formatDate(c.createdAt.slice(0, 10))}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};
