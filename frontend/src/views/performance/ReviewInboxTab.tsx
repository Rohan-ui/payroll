import React, { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { myPerformanceApi, type Inbox, type ReviewTask } from '../../api/appraisals.api';
import { cardClass, day, errorText, fieldClass, labelClass } from '../payroll/payroll-format';
import { ListState } from './performance-format';
import { ReviewFormView } from './ReviewFormView';

const taskState = (t: ReviewTask) => {
  if (t.reason?.startsWith('Sent back')) return { label: 'Sent back', variant: 'warning' as const };
  if (t.overdue) return { label: 'Overdue', variant: 'danger' as const };
  if (t.draftSaved) return { label: 'Draft saved', variant: 'info' as const };
  return { label: 'Not started', variant: 'neutral' as const };
};

const TaskRow: React.FC<{ task: ReviewTask; onOpen: () => void; done?: boolean }> = ({ task, onOpen, done }) => {
  const state = taskState(task);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
          {task.isSelf ? 'Your self-assessment' : `${task.stage}: ${task.employee.name}`}
          {!task.isSelf && <span className="ml-1 font-mono text-xs font-normal text-slate-500">{task.employee.code}</span>}
        </p>
        <p className="text-xs text-slate-500">
          {task.cycle}{done ? (task.submittedAt ? ` · submitted ${new Date(task.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : '') : task.dueDate ? ` · due ${day(task.dueDate)}` : ''}
        </p>
        {!done && task.reason && <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-400">{task.reason}</p>}
      </div>
      <span className="flex items-center gap-2">
        {done ? <Badge size="sm" variant="success">Submitted</Badge> : <Badge size="sm" variant={state.variant}>{state.label}</Badge>}
        <Button size="sm" variant={done ? 'ghost' : 'outline'} onClick={onOpen} aria-label={`${done ? 'View' : task.draftSaved ? 'Continue' : 'Open'} ${task.isSelf ? 'your self-assessment' : `${task.stage} of ${task.employee.name}`}`}>
          {done ? 'View' : task.draftSaved ? 'Continue' : 'Open'}
        </Button>
      </span>
    </li>
  );
};

/** Reviews waiting for the signed-in member, nominations they approve as a manager, and what they recently submitted. */
export const ReviewInboxTab: React.FC = () => {
  const id = useId();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Inbox['nominationsToDecide'][number] | null>(null);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    myPerformanceApi.inbox().then(setInbox).catch((e) => setError(errorText(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  if (open) return <ReviewFormView assignmentId={open} onClose={(changed) => { setOpen(null); if (changed) load(); }} />;

  const decide = async (nominationId: string, approve: boolean, reason?: string) => {
    setDeciding(nominationId);
    try {
      await myPerformanceApi.decide(nominationId, approve, reason?.trim() || undefined);
      toast.success(approve ? 'Nomination approved' : 'Nomination rejected');
      setRejecting(null);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDeciding(null);
    }
  };

  const empty = !!inbox && !inbox.toDo.length && !inbox.done.length && !inbox.nominationsToDecide.length;
  return (
    <div className="space-y-4">
      <section className={cardClass} aria-labelledby={`${id}-todo`}>
        <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
          <h2 id={`${id}-todo`} className="text-sm font-bold text-slate-900 dark:text-slate-100">To review</h2>
          <p className="text-xs text-slate-500">Appraisals waiting for you, the soonest due first.</p>
        </div>
        <ListState loading={loading} error={error} empty={!inbox?.toDo.length} what="Your reviews" onRetry={load}
          emptyTitle={empty ? 'Nothing to review' : 'Nothing waiting for you'}
          emptyText="When an appraisal reaches a step you review, it appears here." />
        {!!inbox?.toDo.length && (
          <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {inbox.toDo.map((t) => <TaskRow key={t.assignmentId} task={t} onOpen={() => setOpen(t.assignmentId)} />)}
          </ul>
        )}
      </section>

      {!!inbox?.nominationsToDecide.length && (
        <section className={cardClass} aria-labelledby={`${id}-nominations`}>
          <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
            <h2 id={`${id}-nominations`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Reviewers to approve</h2>
            <p className="text-xs text-slate-500">People your team members chose to review them. Approving asks them to review.</p>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {inbox.nominationsToDecide.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <p className="min-w-0 break-words text-sm text-slate-800 dark:text-slate-200">
                  <strong>{n.nominee ?? 'Someone'}</strong> to review <strong>{n.employee}</strong>
                  {n.nominatedBy && <span className="block text-xs text-slate-500">Chosen by {n.nominatedBy}</span>}
                </p>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setNote(''); setRejecting(n); }} disabled={!!deciding} aria-label={`Reject ${n.nominee ?? 'nomination'} for ${n.employee}`}>Reject</Button>
                  <Button size="sm" onClick={() => decide(n.id, true)} loading={deciding === n.id} disabled={!!deciding} aria-label={`Approve ${n.nominee ?? 'nomination'} for ${n.employee}`}>Approve</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!inbox?.done.length && (
        <section className={cardClass} aria-labelledby={`${id}-done`}>
          <div className="border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
            <h2 id={`${id}-done`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Recently submitted</h2>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {inbox.done.map((t) => <TaskRow key={t.assignmentId} task={t} done onOpen={() => setOpen(t.assignmentId)} />)}
          </ul>
        </section>
      )}

      {rejecting && (
        <Dialog title={`Reject ${rejecting.nominee ?? 'this nomination'} as a reviewer of ${rejecting.employee}?`} onClose={() => setRejecting(null)} size="sm"
          footer={<><Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button><Button variant="danger" loading={deciding === rejecting.id} disabled={!!deciding} onClick={() => decide(rejecting.id, false, note)}>Reject</Button></>}>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>{rejecting.employee} can choose someone else.</p>
            <label htmlFor={`${id}-note`} className={labelClass}>Note for them <span className="font-normal text-slate-500">(optional)</span></label>
            <textarea id={`${id}-note`} className={fieldClass} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </Dialog>
      )}
    </div>
  );
};
