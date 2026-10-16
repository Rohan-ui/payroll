import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { appraisalsApi, myPerformanceApi, type AppraisalDetail, type AssignmentView } from '../../api/appraisals.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, tdClass, thClass } from '../payroll/payroll-format';
import { orNull } from './performance-format';
import { SearchPicker, type PickerOption } from './SearchPicker';
import { ReviewFormView } from './ReviewFormView';
import { APPRAISAL_STATUS, ASSIGNMENT_STATUS, STAGE_STATUS } from './appraisal-format';

type Stage = AppraisalDetail['stages'][number];
const NOMINATION = { PROPOSED: 'Waiting for approval', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' } as const;

/** Assigning a reviewer to a stage, or replacing one; the reason is kept in the history. */
const AssignDialog: React.FC<{ appraisalId: string; stage: Stage; replacing: AssignmentView | null; onClose: (next: AppraisalDetail | null) => void }> = ({ appraisalId, stage, replacing, onClose }) => {
  const id = useId();
  const [who, setWho] = useState<PickerOption | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const find = useCallback((term: string) => myPerformanceApi.colleagues(term), []);

  const save = async () => {
    if (!who) return;
    setBusy(true);
    setError(null);
    try {
      const next = await appraisalsApi.assign(appraisalId, stage.key, { tenantMemberId: who.id, replacesAssignmentId: replacing?.id ?? null, reason: reason.trim() });
      toast.success(replacing ? 'Reviewer replaced' : 'Reviewer assigned');
      onClose(next);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title={replacing ? `Replace ${replacing.reviewer.name ?? 'the reviewer'} in ${stage.name}` : `Assign a reviewer to ${stage.name}`} onClose={() => onClose(null)} size="md"
      footer={<><Button variant="outline" onClick={() => onClose(null)}>Cancel</Button><Button onClick={save} loading={busy} disabled={busy || !who || reason.trim().length < 3}>{replacing ? 'Replace' : 'Assign'}</Button></>}>
      <div className="space-y-3">
        {who ? (
          <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-white/5">
            <span><strong>{who.name}</strong>{who.code && <span className="ml-1 font-mono text-xs text-slate-500">{who.code}</span>}</span>
            <button type="button" className="text-xs font-semibold underline" onClick={() => setWho(null)}>Change</button>
          </p>
        ) : <SearchPicker label="Reviewer" noun="colleagues" find={find} onPick={setWho} hint="People with a sign-in in this workspace." />}
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>Why</label>
          <textarea id={`${id}-reason`} className={fieldClass} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={`${id}-reason-hint`} />
          <p id={`${id}-reason-hint`} className={hintClass}>Kept in the appraisal’s history{replacing ? '; the replaced reviewer stays listed as replaced' : ''}.</p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
    </Dialog>
  );
};

/** One appraisal, for people who run cycles: its stages and reviewers, targets, and cancelling. */
export const AppraisalAdminView: React.FC<{ appraisalId: string; onClose: (changed: boolean) => void }> = ({ appraisalId, onClose }) => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.cycles.manage');
  const viewAll = can('performance.reviews.view_all');
  const [appraisal, setAppraisal] = useState<AppraisalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [assigning, setAssigning] = useState<{ stage: Stage; replacing: AssignmentView | null } | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, { target: string; threshold: string; stretch: string }>>({});
  const [targetError, setTargetError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const show = (a: AppraisalDetail) => {
    setAppraisal(a);
    setTargets(Object.fromEntries(a.targets.map((t) => [t.templateKpiId, { target: t.target ?? '', threshold: t.threshold ?? '', stretch: t.stretch ?? '' }])));
  };
  const load = useCallback(() => {
    setError(null);
    appraisalsApi.get(appraisalId).then(show).catch((e) => setError(errorText(e)));
  }, [appraisalId]);
  useEffect(load, [load]);

  if (reading) return <ReviewFormView assignmentId={reading} admin onClose={() => setReading(null)} />;
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>The appraisal could not be opened: {error}</span>
        <span className="flex gap-3"><button type="button" onClick={load} className="font-semibold underline">Try again</button><button type="button" onClick={() => onClose(changed)} className="font-semibold underline">Back</button></span>
      </div>
    );
  }
  if (!appraisal) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading the appraisal</span></div>;

  const running = appraisal.status === 'IN_PROGRESS';
  const status = APPRAISAL_STATUS[appraisal.status];

  const saveTargets = async () => {
    setSaving(true);
    setTargetError(null);
    try {
      show(await appraisalsApi.setTargets(appraisal.id, appraisal.targets.map((t) => ({
        templateKpiId: t.templateKpiId, target: orNull(targets[t.templateKpiId].target), threshold: orNull(targets[t.templateKpiId].threshold), stretch: orNull(targets[t.templateKpiId].stretch),
      }))));
      setChanged(true);
      toast.success('Targets saved');
    } catch (e) {
      setTargetError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    setSaving(true);
    setCancelError(null);
    try {
      show(await appraisalsApi.cancel(appraisal.id, reason.trim()));
      setChanged(true);
      setCancelling(false);
      toast.success('Appraisal cancelled');
    } catch (e) {
      setCancelError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const steps = [...new Set(appraisal.stages.map((s) => s.step))].sort((a, b) => a - b);
  const targetsDirty = appraisal.targets.some((t) => {
    const v = targets[t.templateKpiId];
    return v && ((t.target ?? '') !== v.target || (t.threshold ?? '') !== v.threshold || (t.stretch ?? '') !== v.stretch);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" onClick={() => onClose(changed)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{appraisal.cycle.name}</Button>
          <h2 className="mt-1 break-words text-lg font-bold text-slate-900 dark:text-slate-100">{appraisal.employee.name} <span className="font-mono text-sm font-normal text-slate-500">{appraisal.employee.code}</span></h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{appraisal.template.code} v{appraisal.template.version} · {day(appraisal.cycle.periodStart)} to {day(appraisal.cycle.periodEnd)}</p>
          {!appraisal.employee.hasSignIn && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">This employee has no sign-in, so they can’t do their self-assessment until one is linked on their employee record.</p>}
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          {manage && appraisal.status !== 'CANCELLED' && <Button variant="outline" size="sm" onClick={() => { setReason(''); setCancelError(null); setCancelling(true); }}>Cancel appraisal</Button>}
        </span>
      </div>
      {appraisal.status === 'CANCELLED' && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-300">
          Cancelled{appraisal.cancelledAt ? ` on ${new Date(appraisal.cancelledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}: {appraisal.cancellationReason}
        </p>
      )}

      <section className={cardClass} aria-labelledby={`${id}-stages`}>
        <h3 id={`${id}-stages`} className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 dark:border-[#2B293E] dark:text-slate-100">Steps and reviewers</h3>
        <ol className="divide-y divide-slate-100 dark:divide-[#2B293E]">
          {steps.map((step) => appraisal.stages.filter((s) => s.step === step).map((stage) => (
            <li key={stage.key} className="space-y-2 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Step {step} · {stage.name}</h4>
                  <p className="text-xs text-slate-500">
                    {stage.mode === 'POOL' ? 'Any one of them may take it' : `${stage.minReviewers === stage.maxReviewers ? stage.maxReviewers : `${stage.minReviewers} to ${stage.maxReviewers}`} reviewer${stage.maxReviewers === 1 ? '' : 's'}`}
                    {stage.dueDate ? ` · due ${day(stage.dueDate)}` : ''}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  {stage.overdue && <Badge size="sm" variant="danger">Overdue</Badge>}
                  <Badge size="sm" variant={STAGE_STATUS[stage.status].variant}>{STAGE_STATUS[stage.status].label}</Badge>
                  {manage && running && stage.status !== 'COMPLETE' && (stage.source !== 'SELF' || stage.status === 'NEEDS_REVIEWERS') && (
                    <Button size="sm" variant="outline" onClick={() => setAssigning({ stage, replacing: null })} aria-label={`Assign a reviewer to ${stage.name}`}>Assign reviewer</Button>
                  )}
                </span>
              </div>
              {stage.note && <p className="text-xs text-amber-800 dark:text-amber-300">{stage.note}</p>}
              {stage.assignments.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
                  {stage.assignments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{a.reviewer.name ?? 'Unknown member'}</span>
                        <span className="block break-words text-xs text-slate-500">{a.via}{a.reason ? ` · ${a.reason}` : ''}</span>
                      </div>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge size="sm" variant={ASSIGNMENT_STATUS[a.status].variant}>{ASSIGNMENT_STATUS[a.status].label}</Badge>
                        {viewAll && a.status === 'SUBMITTED' && <Button size="sm" variant="ghost" onClick={() => setReading(a.id)} aria-label={`Read ${a.reviewer.name ?? 'the'} review in ${stage.name}`}>Read</Button>}
                        {manage && running && a.status === 'ASSIGNED' && stage.allowsReplacement && stage.source !== 'SELF' && (
                          <Button size="sm" variant="ghost" onClick={() => setAssigning({ stage, replacing: a })} aria-label={`Replace ${a.reviewer.name ?? 'reviewer'} in ${stage.name}`}>Replace</Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">{stage.status === 'WAITING' ? 'Reviewers are found when this step opens, unless assigned now.' : 'No reviewers yet.'}</p>}
              {stage.nominations.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-400">Nominations ({stage.nominations.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {stage.nominations.map((n) => (
                      <li key={n.id}>{n.nominee ?? 'Someone'}, chosen by {n.nominatedBy ?? 'someone'}: {NOMINATION[n.status]}{n.decidedBy && n.status !== 'PROPOSED' ? ` by ${n.decidedBy}` : ''}{n.note ? ` (${n.note})` : ''}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          )))}
        </ol>
      </section>

      {appraisal.targets.length > 0 && (
        <section className={cardClass} aria-labelledby={`${id}-targets`}>
          <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
            <h3 id={`${id}-targets`} className="text-sm font-bold text-slate-900 dark:text-slate-100">{appraisal.employee.name}’s own targets</h3>
            <p className="text-xs text-slate-500">KPIs whose targets the template sets per employee. Targets lock once someone submits ratings on them.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Targets for {appraisal.employee.name}</caption>
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr><th scope="col" className={thClass}>KPI</th><th scope="col" className={thClass}>Threshold</th><th scope="col" className={thClass}>Target</th><th scope="col" className={thClass}>Stretch</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {appraisal.targets.map((t) => {
                  const linear = t.method === 'LINEAR_BETWEEN';
                  return (
                    <tr key={t.templateKpiId}>
                      <td className={tdClass}>
                        <span className="block break-words">{t.kpi}{t.unitLabel ? ` (${t.unitLabel})` : ''}</span>
                        {!t.set && <span className="text-xs text-amber-800 dark:text-amber-300">Not set yet</span>}
                      </td>
                      {(['threshold', 'target', 'stretch'] as const).map((key) => (
                        <td key={key} className={tdClass}>
                          {key === 'target' || linear ? (
                            <>
                              <label className="sr-only" htmlFor={`${id}-${t.templateKpiId}-${key}`}>{key} for {t.kpi}</label>
                              <input id={`${id}-${t.templateKpiId}-${key}`} className={`${fieldClass} w-32 text-right tabular-nums`} inputMode="decimal" value={targets[t.templateKpiId]?.[key] ?? ''} disabled={!manage || !running}
                                onChange={(e) => setTargets((all) => ({ ...all, [t.templateKpiId]: { ...all[t.templateKpiId], [key]: e.target.value } }))} />
                            </>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(targetError || (manage && running)) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-[#2B293E]">
              {targetError ? <p role="alert" className="text-sm text-red-700">{targetError}</p> : <span />}
              {manage && running && <Button size="sm" onClick={saveTargets} loading={saving} disabled={saving || !targetsDirty}>Save targets</Button>}
            </div>
          )}
        </section>
      )}

      {assigning && (
        <AssignDialog appraisalId={appraisal.id} stage={assigning.stage} replacing={assigning.replacing}
          onClose={(next) => { setAssigning(null); if (next) { show(next); setChanged(true); } }} />
      )}
      {cancelling && (
        <Dialog title={`Cancel ${appraisal.employee.name}’s appraisal in ${appraisal.cycle.name}?`} onClose={() => setCancelling(false)} size="sm"
          footer={<><Button variant="outline" onClick={() => setCancelling(false)}>Keep it</Button><Button variant="danger" onClick={cancel} loading={saving} disabled={saving || reason.trim().length < 3}>Cancel appraisal</Button></>}>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>Reviewers still assigned are released and nothing more can be submitted. Submitted reviews are kept. A cancelled appraisal can’t be resumed; {appraisal.employee.name} can be added to the cycle again.</p>
            <label htmlFor={`${id}-cancel`} className={labelClass}>Reason</label>
            <textarea id={`${id}-cancel`} className={fieldClass} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            {cancelError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{cancelError}</p>}
          </div>
        </Dialog>
      )}
    </div>
  );
};
