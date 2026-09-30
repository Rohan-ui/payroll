import React, { useCallback, useEffect, useState } from 'react';
import { onboardingApi, STATUS_LABELS, type CandidateListQuery, type CandidateStatus, type OnboardingSummary } from '../../api/onboarding.api';
import { BROWSER_TIMEZONE, formatDate } from './onboarding-format';

interface Props {
  onShowCandidates: (filters: Partial<CandidateListQuery>) => void;
  onShowInterviews: () => void;
  onShowOffers: (awaitingMine: boolean) => void;
}

const Metric: React.FC<{ label: string; value: number; hint?: string; onClick: () => void }> = ({ label, value, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
  >
    <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
    <span className="block mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</span>
    {hint && <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
  </button>
);

/** What needs attention now, from this workspace's records. Each number opens the records it counts. */
export const OnboardingDashboard: React.FC<Props> = ({ onShowCandidates, onShowInterviews, onShowOffers }) => {
  const [summary, setSummary] = useState<OnboardingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    onboardingApi.summary(BROWSER_TIMEZONE).then(setSummary).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
        The dashboard could not be loaded: {error}{' '}
        <button type="button" onClick={load} className="font-semibold underline">Try again</button>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />)}
        <span className="sr-only" role="status">Loading the onboarding dashboard</span>
      </div>
    );
  }
  if (summary.totalCandidates === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
        <p className="font-semibold text-slate-800 dark:text-slate-200">No candidates yet</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add your first candidate to start screening, scheduling interviews and tracking decisions.</p>
      </div>
    );
  }

  const pipeline = (Object.keys(summary.byStatus) as CandidateStatus[]).filter((status) => summary.byStatus[status] > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric label="Active candidates" value={summary.totalCandidates} onClick={() => onShowCandidates({})} />
        <Metric label="Interviews today" value={summary.interviewsToday} hint={`In ${summary.timezone}`} onClick={onShowInterviews} />
        <Metric label="Awaiting feedback or decision" value={summary.interviewsAwaitingDecision} hint="Interviews held, no decision yet" onClick={onShowInterviews} />
        <Metric label="Your feedback due" value={summary.myFeedbackDue} hint="Interviews you were on" onClick={onShowInterviews} />
        <Metric
          label="Joining in 30 days"
          value={summary.joiningSoon.count}
          hint={`${formatDate(summary.joiningSoon.from)} to ${formatDate(summary.joiningSoon.to)}`}
          onClick={() => onShowCandidates({ joiningFrom: summary.joiningSoon.from, joiningTo: summary.joiningSoon.to })}
        />
        <Metric label="Offers awaiting approval" value={summary.offersAwaitingApproval} onClick={() => onShowOffers(false)} />
        <Metric label="Your approvals due" value={summary.myApprovalsDue} onClick={() => onShowOffers(true)} />
        <Metric label="Offers awaiting an answer" value={summary.offersAwaitingResponse} hint="Sent, not yet accepted or declined" onClick={() => onShowCandidates({ status: 'OFFER_SENT' })} />
        <Metric label="Documents to verify" value={summary.candidatesWithDocumentsToVerify} hint="Candidates with uploads to check" onClick={() => onShowCandidates({ documents: 'to_verify' })} />
      </div>

      <section aria-labelledby="pipeline-heading" className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
        <h2 id="pipeline-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Candidates by stage</h2>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {pipeline.map((status) => (
            <li key={status}>
              <button
                type="button"
                onClick={() => onShowCandidates({ status })}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E] text-sm hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <span className="text-slate-700 dark:text-slate-300">{STATUS_LABELS[status]}</span>
                <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{summary.byStatus[status]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
