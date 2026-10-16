import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { myPerformanceApi, type MyAppraisal, type MyAppraisalSummary, type ReadReview } from '../../api/appraisals.api';
import { cardClass, day, errorText } from '../payroll/payroll-format';
import { ListState } from './performance-format';
import { SearchPicker, type PickerOption } from './SearchPicker';
import { ReviewFormView } from './ReviewFormView';
import { WrittenReviewView } from './review-answers';
import { APPRAISAL_STATUS, STAGE_STATUS } from './appraisal-format';

const NOMINATION = { PROPOSED: { label: 'Waiting for approval', variant: 'warning' }, APPROVED: { label: 'Approved', variant: 'success' }, REJECTED: { label: 'Rejected', variant: 'danger' }, WITHDRAWN: { label: 'Withdrawn', variant: 'neutral' } } as const;

/** Choosing reviewers for a stage the employee nominates for. */
const Nominate: React.FC<{ appraisalId: string; stage: MyAppraisal['stages'][number]; onDone: () => void }> = ({ appraisalId, stage, onDone }) => {
  const id = useId();
  const [chosen, setChosen] = useState<PickerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rules = stage.nominate;
  const find = useCallback((term: string) => myPerformanceApi.colleagues(term), []);
  if (!rules) return null;
  const live = rules.nominations.filter((n) => n.status === 'PROPOSED' || n.status === 'APPROVED').length;
  const room = rules.max - live - chosen.length;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await myPerformanceApi.nominate(appraisalId, stage.key, chosen.map((c) => c.id));
      toast.success(rules.needsApproval ? 'Sent to your manager for approval' : 'Reviewers nominated');
      setChosen([]);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Choose reviewers for {stage.name}</h2>
        <p className="text-xs text-slate-500">
          Choose {rules.min === rules.max ? rules.max : `${rules.min} to ${rules.max}`} colleagues who know your work.{rules.needsApproval ? ' Your manager approves them before they are asked.' : ''}
        </p>
      </div>
      {rules.nominations.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
          {rules.nominations.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 break-words text-slate-800 dark:text-slate-200">{n.nominee ?? 'Someone'}{n.note && <span className="block text-xs text-slate-500">{n.note}</span>}</span>
              <Badge size="sm" variant={NOMINATION[n.status].variant}>{NOMINATION[n.status].label}</Badge>
            </li>
          ))}
        </ul>
      )}
      {room > 0 && <SearchPicker label="Find a colleague" noun="colleagues" find={find} exclude={chosen.map((c) => c.id)} onPick={(o) => setChosen((all) => [...all, o])} />}
      {room <= 0 && !chosen.length && <p className="text-sm text-slate-600 dark:text-slate-400">You’ve chosen as many reviewers as this stage takes.</p>}
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Chosen, not yet sent">
          {chosen.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 py-1 pl-3 pr-1 text-sm text-teal-900 dark:bg-teal-900/30 dark:text-teal-100">
              {c.name}
              <button type="button" onClick={() => setChosen((all) => all.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} className="rounded-full p-1 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-teal-900/50">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {chosen.length > 0 && <Button onClick={send} loading={busy} disabled={busy}>Send {chosen.length} nomination{chosen.length === 1 ? '' : 's'}</Button>}
    </section>
  );
};

/** One of the member's own appraisals: its steps, their self-assessment, reviewers to choose and reviews they may read. */
const MyAppraisalView: React.FC<{ appraisalId: string; onBack: () => void }> = ({ appraisalId, onBack }) => {
  const [appraisal, setAppraisal] = useState<MyAppraisal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [reading, setReading] = useState<{ assignmentId: string; stage: string } | null>(null);
  const [review, setReview] = useState<ReadReview | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    myPerformanceApi.appraisal(appraisalId).then(setAppraisal).catch((e) => setError(errorText(e)));
  }, [appraisalId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!reading) return;
    let live = true;
    setReview(null);
    setReadError(null);
    myPerformanceApi.read(reading.assignmentId).then((r) => { if (live) setReview(r); }).catch((e) => { if (live) setReadError(errorText(e)); });
    return () => { live = false; };
  }, [reading]);

  if (writing && appraisal?.selfAssessment) return <ReviewFormView assignmentId={appraisal.selfAssessment.assignmentId} onClose={(changed) => { setWriting(false); if (changed) load(); }} />;
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>The appraisal could not be opened: {error}</span>
        <span className="flex gap-3"><button type="button" onClick={load} className="font-semibold underline">Try again</button><button type="button" onClick={onBack} className="font-semibold underline">Back</button></span>
      </div>
    );
  }
  if (!appraisal) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading the appraisal</span></div>;

  const self = appraisal.stages.find((s) => s.isSelf);
  const own = appraisal.selfAssessment;
  const steps = [...new Set(appraisal.stages.map((s) => s.step))].sort((a, b) => a - b);
  const status = APPRAISAL_STATUS[appraisal.status];

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 rounded text-sm font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />My appraisals
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{appraisal.cycle.name}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{day(appraisal.cycle.periodStart)} to {day(appraisal.cycle.periodEnd)}</p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      {self && own && (
        <section className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4`} aria-label="Your self-assessment">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Your self-assessment</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {own.status === 'SUBMITTED' ? 'Submitted. You can read it any time.' : self.status === 'OPEN' ? `Give your results and comments for the period${self.dueDate ? ` by ${day(self.dueDate)}` : ''}.` : 'It opens when its step starts.'}
            </p>
          </div>
          {(own.status === 'SUBMITTED' || self.status === 'OPEN') && (
            <Button variant={own.status === 'SUBMITTED' ? 'outline' : 'primary'} onClick={() => setWriting(true)}>{own.status === 'SUBMITTED' ? 'View' : 'Open self-assessment'}</Button>
          )}
        </section>
      )}

      {appraisal.stages.filter((s) => s.nominate).map((s) => <Nominate key={s.key} appraisalId={appraisal.id} stage={s} onDone={load} />)}

      <section className={cardClass} aria-labelledby="my-steps">
        <h2 id="my-steps" className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 dark:border-[#2B293E] dark:text-slate-100">Steps</h2>
        <ol className="divide-y divide-slate-100 dark:divide-[#2B293E]">
          {steps.map((step) => (
            <li key={step} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300" aria-hidden="true">{step}</span>
              <ul className="min-w-0 flex-1 space-y-2">
                {appraisal.stages.filter((s) => s.step === step).map((s) => (
                  <li key={s.key} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-slate-800 dark:text-slate-200"><span className="sr-only">Step {step}: </span>{s.name}{s.dueDate && s.status !== 'COMPLETE' ? <span className="text-xs text-slate-500"> · due {day(s.dueDate)}</span> : null}</span>
                    <Badge size="sm" variant={STAGE_STATUS[s.status].variant}>{STAGE_STATUS[s.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${cardClass} p-4`} aria-labelledby="my-readable">
        <h2 id="my-readable" className="text-sm font-bold text-slate-900 dark:text-slate-100">Reviews you can read</h2>
        {appraisal.readable.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {appraisal.readable.map((r) => <li key={r.assignmentId}><Button size="sm" variant="outline" onClick={() => setReading(r)}>{r.stage}</Button></li>)}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">None yet. Reviews are shown to you as your organisation’s review process allows, some only once the appraisal is finalised.</p>
        )}
      </section>

      {reading && (
        <Dialog title={reading.stage} onClose={() => setReading(null)} size="lg" footer={<Button variant="outline" onClick={() => setReading(null)}>Close</Button>}>
          {readError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{readError}</p>
            : review ? <WrittenReviewView review={review} lines={review.lines} />
              : <div className="h-24 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading the review</span></div>}
        </Dialog>
      )}
    </div>
  );
};

/** The signed-in member's own appraisals. */
export const MyAppraisalsTab: React.FC = () => {
  const id = useId();
  const [result, setResult] = useState<{ linked: boolean; appraisals: MyAppraisalSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    myPerformanceApi.appraisals().then(setResult).catch((e) => setError(errorText(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  if (open) return <MyAppraisalView appraisalId={open} onBack={() => { setOpen(null); load(); }} />;

  const items = result?.appraisals ?? [];
  return (
    <section className={cardClass} aria-labelledby={`${id}-heading`}>
      <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
        <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">My appraisals</h2>
        <p className="text-xs text-slate-500">Your appraisals in each review cycle, newest first.</p>
      </div>
      <ListState loading={loading} error={error} empty={items.length === 0} what="Your appraisals" onRetry={load}
        emptyTitle={result && !result.linked ? 'Your sign-in isn’t linked to an employee record' : 'No appraisals yet'}
        emptyText={result && !result.linked ? 'Appraisals belong to employee records. Ask HR to link your sign-in to yours.' : 'When a review cycle you are part of starts, your appraisal appears here.'} />
      {items.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{a.cycle}</p>
                <p className="text-xs text-slate-500">{day(a.periodStart)} to {day(a.periodEnd)}</p>
              </div>
              <span className="flex items-center gap-2">
                <Badge size="sm" variant={APPRAISAL_STATUS[a.status].variant}>{APPRAISAL_STATUS[a.status].label}</Badge>
                <Button size="sm" variant="outline" onClick={() => setOpen(a.id)} aria-label={`Open ${a.cycle}`}>Open</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

