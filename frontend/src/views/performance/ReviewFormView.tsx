import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { ApiError } from '../../api/client';
import { appraisalsApi, myPerformanceApi, type EarlierStage, type FormLine, type ReviewForm } from '../../api/appraisals.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, tdClass, thClass } from '../payroll/payroll-format';
import { AnswerControls, EvidenceLink, WrittenReviewView, draftOf, evidenceHint, inputOf, lineLabel, type Draft } from './review-answers';
import { STAGE_STATUS } from './appraisal-format';

const problemsOf = (e: unknown): string[] =>
  e instanceof ApiError && Array.isArray(e.data?.errors) ? (e.data.errors as { message: string }[]).map((p) => p.message) : [];

const SCORE_STATUS = { SCORED: 'success', EXEMPT: 'neutral', MISSING: 'warning', INVALID: 'danger' } as const;

/** Earlier stages as the viewer may see them: each review in full, or only each line's combined score. */
const EarlierStages: React.FC<{ earlier: EarlierStage[]; lines: FormLine[] }> = ({ earlier, lines }) => {
  if (!earlier.length) return null;
  return (
    <section className={`${cardClass} space-y-3 p-4`} aria-labelledby="earlier-heading">
      <h2 id="earlier-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Earlier reviews</h2>
      {earlier.map((stage) => (
        <details key={stage.stage} className="rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]" open={earlier.length === 1}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
            {stage.stage}{stage.mode === 'AGGREGATE' ? ' · combined scores only' : ` · ${stage.reviews.length} review${stage.reviews.length === 1 ? '' : 's'}`}
          </summary>
          <div className="mt-3 space-y-4">
            {stage.mode === 'AGGREGATE' ? (
              stage.combined.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <caption className="sr-only">{stage.stage}: combined score of each line</caption>
                    <thead><tr><th scope="col" className={thClass}>Line</th><th scope="col" className={`${thClass} text-right`}>Combined score</th><th scope="col" className={`${thClass} text-right`}>Reviews</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                      {stage.combined.map((c) => (
                        <tr key={c.lineId}><td className={tdClass}>{c.name}</td><td className={`${tdClass} text-right tabular-nums`}>{c.scorePercent === null ? '—' : `${c.scorePercent}%`}</td><td className={`${tdClass} text-right tabular-nums`}>{c.reviews}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No scored lines yet.</p>
            ) : stage.reviews.map((r, i) => <WrittenReviewView key={i} review={r} lines={lines} />)}
          </div>
        </details>
      ))}
    </section>
  );
};

/**
 * One review to write: a self-assessment, a reviewer's ratings, or an
 * approval. Answers are saved as a draft and submitted once complete; the
 * server checks everything again and works out every score. People who may
 * read every review open it read-only (`admin`).
 */
export const ReviewFormView: React.FC<{ assignmentId: string; admin?: boolean; onClose: (changed: boolean) => void }> = ({ assignmentId, admin = false, onClose }) => {
  const id = useId();
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [comment, setComment] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'save' | 'submit' | 'upload'>(null);
  const [dialog, setDialog] = useState<null | 'submit' | 'decline' | 'sendBack' | 'leave'>(null);
  const [reason, setReason] = useState('');
  const [returnTo, setReturnTo] = useState('');
  const [changed, setChanged] = useState(false);
  const problemsRef = useRef<HTMLDivElement>(null);

  const show = (next: ReviewForm, keepDrafts = false) => {
    setForm(next);
    if (keepDrafts) return;
    setDrafts(Object.fromEntries(next.lines.map((l) => [l.id, draftOf(next.review.items.find((i) => i.lineId === l.id))])));
    setComment(next.review.overallComment ?? '');
    setDirty(false);
  };

  const load = useCallback(() => {
    setLoadError(null);
    (admin ? appraisalsApi.review(assignmentId) : myPerformanceApi.form(assignmentId)).then((f) => show(f)).catch((e) => setLoadError(errorText(e)));
  }, [assignmentId, admin]);
  useEffect(load, [load]);

  useEffect(() => { if (problems.length) problemsRef.current?.focus(); }, [problems]);

  if (loadError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>The review could not be opened: {loadError}</span>
        <span className="flex gap-3"><button type="button" onClick={load} className="font-semibold underline">Try again</button><button type="button" onClick={() => onClose(false)} className="font-semibold underline">Back</button></span>
      </div>
    );
  }
  if (!form) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading the review</span></div>;

  const editable = form.canEdit && !admin;
  const rate = form.stage.action === 'RATE';
  const subject = form.stage.isSelf ? 'your self-assessment' : `your review of ${form.employee.name}`;
  const edit = (lineId: string, patch: Partial<Draft>) => { setDrafts((all) => ({ ...all, [lineId]: { ...all[lineId], ...patch } })); setDirty(true); };
  const scoreOf = (lineId: string) => form.preview?.lines.find((l) => l.lineId === lineId);

  const save = async (quiet = false) => {
    setBusy('save');
    setError(null);
    setProblems([]);
    try {
      const next = await myPerformanceApi.save(assignmentId, comment.trim() || null, form.lines.map((l) => inputOf(l, drafts[l.id])));
      show(next);
      if (!quiet) toast.success('Draft saved');
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setDialog(null);
    if (!(await save(true))) return;
    setBusy('submit');
    try {
      await myPerformanceApi.submit(assignmentId);
      toast.success(form.stage.isSelf ? 'Self-assessment submitted' : rate ? 'Review submitted' : 'Approved');
      onClose(true);
    } catch (e) {
      setProblems(problemsOf(e));
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy('submit');
    setError(null);
    try {
      await work();
      toast.success(done);
      onClose(true);
    } catch (e) {
      setError(errorText(e));
      setDialog(null);
      setBusy(null);
    }
  };

  const upload = async (line: FormLine | null, file: File | undefined) => {
    if (!file) return;
    setBusy('upload');
    setError(null);
    try {
      // Only the files change; answers being typed stay as they are.
      const next = await myPerformanceApi.upload(assignmentId, file, line && { lineId: line.id, kind: line.kind });
      show(next, true);
      setChanged(true);
      toast.success('Evidence attached');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const removeFile = async (fileId: string) => {
    setBusy('upload');
    setError(null);
    try {
      show(await myPerformanceApi.removeFile(assignmentId, fileId), true);
      setChanged(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const attach = (line: FormLine | null, label: string) => (
    <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 focus-within:ring-2 focus-within:ring-teal-500 dark:border-[#2B293E] dark:text-slate-300 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{label}
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" disabled={!!busy}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void upload(line, file); }} />
    </label>
  );

  const fileList = (lineId: string | null) => {
    const files = form.review.files.filter((f) => (lineId ? f.lineId === lineId : !f.lineId));
    if (!files.length) return null;
    return (
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => (
          <li key={f.id} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 dark:bg-white/5">
            <EvidenceLink file={f} />
            {editable && (
              <button type="button" onClick={() => removeFile(f.id)} disabled={!!busy} aria-label={`Remove ${f.name}`} className="rounded p-0.5 text-slate-500 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const leave = () => (dirty && editable ? setDialog('leave') : onClose(changed));
  const status = STAGE_STATUS[form.stage.status];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={leave} className="mb-2 inline-flex items-center gap-1 rounded text-sm font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back
          </button>
          <h1 className="break-words text-lg font-bold text-slate-900 dark:text-slate-100">{form.stage.isSelf ? 'Self-assessment' : `${form.stage.name}: ${form.employee.name}`}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {form.employee.name} ({form.employee.code}){form.employee.designation ? ` · ${form.employee.designation}` : ''}{form.employee.department ? ` · ${form.employee.department}` : ''}
          </p>
          <p className="text-xs text-slate-500">{form.cycle.name} · {day(form.cycle.periodStart)} to {day(form.cycle.periodEnd)}{form.stage.dueDate ? ` · due ${day(form.stage.dueDate)}` : ''}</p>
        </div>
        <span className="flex flex-wrap gap-2">
          {form.review.status === 'SUBMITTED' ? <Badge variant="success">Submitted</Badge> : <Badge variant={status.variant}>{status.label}</Badge>}
          {admin && <Badge variant="info">Read-only</Badge>}
        </span>
      </div>

      {form.assignment.reason && form.assignment.status === 'ASSIGNED' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">{form.assignment.reason}</p>
      )}
      {!editable && !admin && form.review.status !== 'SUBMITTED' && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-[#2B293E] dark:bg-white/5 dark:text-slate-300">This review isn’t open for you now, so it can only be read.</p>
      )}

      {problems.length > 0 && (
        <div ref={problemsRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 focus:outline-none">
          <p className="font-semibold">Some answers are needed before submitting:</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {error && !problems.length && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <EarlierStages earlier={form.earlier} lines={form.allLines} />

      {rate && form.lines.length > 0 && (
        <section className={cardClass} aria-labelledby={`${id}-lines`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
            <h2 id={`${id}-lines`} className="text-sm font-bold text-slate-900 dark:text-slate-100">{form.stage.isSelf ? 'Your results' : 'Ratings'}</h2>
            {form.preview?.scorePercent && <span className="text-sm text-slate-600 dark:text-slate-400">Score from saved answers: <strong className="tabular-nums text-slate-900 dark:text-slate-100">{form.preview.scorePercent}%</strong></span>}
          </div>
          <ol className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {form.lines.map((line) => {
              const draft = drafts[line.id];
              const score = scoreOf(line.id);
              const hint = evidenceHint(line);
              return (
                <li key={line.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {lineLabel(line)}{line.kind === 'FIELD' && line.field?.required && <span className="ml-1 text-xs font-normal text-slate-500">(required)</span>}
                      </h3>
                      {line.description && <p className="break-words text-xs text-slate-600 dark:text-slate-400">{line.description}</p>}
                      {line.instructions && <p className="break-words text-xs text-slate-500">How to rate: {line.instructions}</p>}
                      {hint && <p className="text-xs text-slate-500">{hint}</p>}
                    </div>
                    {score && (
                      <span className="flex items-center gap-2">
                        <Badge size="sm" variant={SCORE_STATUS[score.status]}>{score.status === 'SCORED' ? `${score.scorePercent}%` : score.status === 'EXEMPT' ? 'Exempt' : score.status === 'MISSING' ? 'Not rated' : 'Problem'}</Badge>
                      </span>
                    )}
                  </div>
                  {score?.problem && <p className="text-xs text-red-700">{score.problem}</p>}
                  {draft && <AnswerControls line={line} draft={draft} disabled={!editable} onChange={(patch) => edit(line.id, patch)} />}
                  {draft && line.allowsExemption && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={draft.exempt} disabled={!editable} onChange={(e) => edit(line.id, { exempt: e.target.checked })} />
                        Not applicable this period (exempt)
                      </label>
                      {draft.exempt && (
                        <span className="block">
                          <label htmlFor={`${id}-${line.id}-exempt`} className={labelClass}>Why it doesn’t apply</label>
                          <input id={`${id}-${line.id}-exempt`} className={fieldClass} maxLength={2000} value={draft.justification} disabled={!editable} onChange={(e) => edit(line.id, { justification: e.target.value })} />
                        </span>
                      )}
                    </div>
                  )}
                  {draft && line.kind !== 'FIELD' && (editable || draft.comment) && (
                    <details open={!!draft.comment}>
                      <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-400">Comment on this line</summary>
                      <label htmlFor={`${id}-${line.id}-comment`} className="sr-only">Comment on {lineLabel(line)}</label>
                      <textarea id={`${id}-${line.id}-comment`} className={`${fieldClass} mt-2`} rows={2} maxLength={4000} value={draft.comment} disabled={!editable} onChange={(e) => edit(line.id, { comment: e.target.value })} />
                    </details>
                  )}
                  {(line.evidence !== 'NONE' || line.field?.type === 'ATTACHMENT') && (
                    <div className="flex flex-wrap items-center gap-2">
                      {fileList(line.id)}
                      {editable && attach(line, 'Attach file')}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-overall`}>
        <h2 id={`${id}-overall`} className="text-sm font-bold text-slate-900 dark:text-slate-100">{rate ? 'Overall comments' : form.stage.action === 'ACKNOWLEDGE' ? 'Acknowledge' : 'Approval'}</h2>
        {!rate && <p className="text-sm text-slate-600 dark:text-slate-400">Read the reviews above. {form.stage.action === 'ACKNOWLEDGE' ? 'Acknowledging' : 'Approving'} moves the appraisal on; to have something corrected, send it back instead.</p>}
        <div>
          <label htmlFor={`${id}-comment`} className={labelClass}>Comment <span className="font-normal text-slate-500">(optional)</span></label>
          <textarea id={`${id}-comment`} className={fieldClass} rows={4} maxLength={10000} value={comment} disabled={!editable} onChange={(e) => { setComment(e.target.value); setDirty(true); }} />
        </div>
        {(editable || form.review.files.some((f) => !f.lineId)) && (
          <div className="flex flex-wrap items-center gap-2">
            {fileList(null)}
            {editable && attach(null, 'Attach a supporting file')}
          </div>
        )}
        {editable && <p className={hintClass}>PDF, JPG or PNG, up to 10 MB each.</p>}
      </section>

      {editable && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-[#2B293E] dark:bg-[#181724]/95">
          <span className="flex flex-wrap gap-2">
            {form.stage.returnTo.length > 0 && <Button variant="ghost" onClick={() => { setReason(''); setReturnTo(form.stage.returnTo[form.stage.returnTo.length - 1].key); setDialog('sendBack'); }} disabled={!!busy}>Send back</Button>}
            {form.stage.allowsDecline && !form.stage.isSelf && <Button variant="ghost" onClick={() => { setReason(''); setDialog('decline'); }} disabled={!!busy}>Decline</Button>}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {dirty && <span className="text-xs text-slate-500" role="status">Unsaved changes</span>}
            {rate && <Button variant="outline" onClick={() => save()} loading={busy === 'save'} disabled={!!busy}>Save draft</Button>}
            <Button onClick={() => setDialog('submit')} loading={busy === 'submit'} disabled={!!busy}>{rate ? 'Submit' : form.stage.action === 'ACKNOWLEDGE' ? 'Acknowledge' : 'Approve'}</Button>
          </span>
        </div>
      )}

      {dialog === 'submit' && (
        <Dialog title={rate ? `Submit ${subject}?` : `${form.stage.action === 'ACKNOWLEDGE' ? 'Acknowledge' : 'Approve'} ${form.employee.name}’s appraisal?`} onClose={() => setDialog(null)} size="sm"
          footer={<><Button variant="outline" onClick={() => setDialog(null)}>Keep editing</Button><Button onClick={submit}>{rate ? 'Submit' : form.stage.action === 'ACKNOWLEDGE' ? 'Acknowledge' : 'Approve'}</Button></>}>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {form.cycle.name}. Once {rate ? 'submitted' : 'given'} it can’t be changed, and the appraisal moves on when its step has the reviews it needs.
          </p>
        </Dialog>
      )}
      {dialog === 'decline' && (
        <Dialog title={`Decline reviewing ${form.employee.name}?`} onClose={() => setDialog(null)} size="sm"
          footer={<><Button variant="outline" onClick={() => setDialog(null)}>Keep the review</Button><Button variant="danger" disabled={reason.trim().length < 3 || !!busy} loading={!!busy} onClick={() => act(() => myPerformanceApi.decline(assignmentId, reason.trim()), 'Review declined')}>Decline</Button></>}>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>Someone else will be asked instead. Anything you saved in this draft is kept in the history, not used.</p>
            <label htmlFor={`${id}-decline`} className={labelClass}>Why you can’t review them</label>
            <textarea id={`${id}-decline`} className={fieldClass} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Dialog>
      )}
      {dialog === 'sendBack' && (
        <Dialog title={`Send ${form.employee.name}’s appraisal back?`} onClose={() => setDialog(null)} size="sm"
          footer={<><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={reason.trim().length < 3 || !returnTo || !!busy} loading={!!busy} onClick={() => act(() => myPerformanceApi.sendBack(assignmentId, returnTo, reason.trim()), 'Sent back for correction')}>Send back</Button></>}>
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <p>The chosen step opens again with what was submitted as a draft, and everything after it waits. Submitted reviews are kept in the history.</p>
            <div>
              <label htmlFor={`${id}-to`} className={labelClass}>Send back to</label>
              <select id={`${id}-to`} className={fieldClass} value={returnTo} onChange={(e) => setReturnTo(e.target.value)}>
                {form.stage.returnTo.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-why`} className={labelClass}>What needs correcting</label>
              <textarea id={`${id}-why`} className={fieldClass} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        </Dialog>
      )}
      {dialog === 'leave' && (
        <Dialog title="Leave without saving?" onClose={() => setDialog(null)} size="sm"
          footer={<><Button variant="outline" onClick={() => setDialog(null)}>Keep editing</Button><Button variant="danger" onClick={() => onClose(changed)}>Discard changes</Button></>}>
          <p className="text-sm text-slate-700 dark:text-slate-300">Your latest answers aren’t saved. Save the draft first to keep them.</p>
        </Dialog>
      )}
    </div>
  );
};
