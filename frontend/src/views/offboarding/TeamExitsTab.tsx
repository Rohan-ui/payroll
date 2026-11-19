import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../lib/toast';
import { offboardingApi, type CommentKind, type TeamExitDetail, type TeamExitRow } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, labelClass, tdClass, thClass } from '../payroll/payroll-format';
import { ListState } from '../performance/performance-format';
import { EXIT_STATUS, EXIT_TYPE, ITEM_STATUS, TEAM } from './offboarding-format';

/** A manager's direct reports who are leaving: their last days, the handover and the manager's checklist items. */
export const TeamExitsTab: React.FC = () => {
  const id = useId();
  const [rows, setRows] = useState<TeamExitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    offboardingApi.team().then(setRows).catch((e) => setError(errorText(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  if (openId) return <TeamExitDetailView id={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <section className={cardClass} aria-labelledby={`${id}-heading`}>
      <div className="border-b border-slate-100 p-4 dark:border-[#2B293E]">
        <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">My team’s exits</h2>
        <p className="text-xs text-slate-500">People who report to you and are leaving, soonest last day first, and those who left in the last 30 days.</p>
      </div>
      <ListState loading={loading} error={error} empty={rows.length === 0} what="Your team’s exits" onRetry={load}
        emptyTitle="No one in your team is leaving" emptyText="When someone who reports to you resigns or HR starts their exit, it appears here so you can plan the handover." />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Employee</th>
                <th scope="col" className={thClass}>Last working day</th>
                <th scope="col" className={thClass}>Your items</th>
                <th scope="col" className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className={tdClass}>
                    <button type="button" onClick={() => setOpenId(r.id)} className="text-left font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300">{r.employee.name}</button>
                    <p className="text-xs text-slate-500">{[r.employee.code, r.employee.designation].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>{day(r.lastWorkingDate)}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>{r.pendingManagerItems ? `${r.pendingManagerItems} open` : 'Done'}</td>
                  <td className={tdClass}><Badge size="sm" variant={EXIT_STATUS[r.status].variant}>{EXIT_STATUS[r.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const KIND_LABEL: Record<CommentKind, string> = { COMMENT: 'Comment', HANDOVER: 'Handover note' };

const TeamExitDetailView: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const formId = useId();
  const [exit, setExit] = useState<TeamExitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [kind, setKind] = useState<CommentKind>('HANDOVER');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const load = useCallback(() => {
    setError(null);
    offboardingApi.teamDetail(id).then((d) => { setExit(d); setFeedback(d.managerFeedback?.text ?? ''); }).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);

  const setItem = async (itemId: string, status: 'PENDING' | 'CLEARED') => {
    setBusyItem(itemId);
    setActionError(null);
    try {
      setExit(await offboardingApi.teamItem(id, itemId, { status }));
      toast.success(status === 'CLEARED' ? 'Item cleared' : 'Item reopened');
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusyItem(null);
    }
  };

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    setActionError(null);
    try {
      setExit(await offboardingApi.teamComment(id, { kind, body: body.trim() }));
      setBody('');
      toast.success(kind === 'HANDOVER' ? 'Handover note added' : 'Comment added');
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setPosting(false);
    }
  };

  const saveFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback.trim().length < 3 || savingFeedback) return;
    setSavingFeedback(true);
    setActionError(null);
    try {
      setExit(await offboardingApi.teamFeedback(id, feedback.trim()));
      toast.success('Feedback saved');
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setSavingFeedback(false);
    }
  };

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My team’s exits
    </button>
  );

  if (error) {
    return (
      <div className="space-y-3">
        {back}
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>This exit could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      </div>
    );
  }
  if (!exit) return <div className={`${cardClass} h-48 animate-pulse motion-reduce:animate-none`} aria-busy="true"><span className="sr-only" role="status">Loading the exit</span></div>;

  const status = EXIT_STATUS[exit.status];
  const handover = exit.checklist.filter((i) => i.team === 'MANAGER');
  const others = exit.checklist.filter((i) => i.team !== 'MANAGER');

  return (
    <div className="space-y-4">
      {back}
      <section className={`${cardClass} space-y-4 p-5`} aria-labelledby="team-exit-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="team-exit-heading" className="break-words text-lg font-bold text-slate-900 dark:text-slate-100">{exit.employee.name}</h2>
            <p className="text-sm text-slate-500">{[exit.employee.code, exit.employee.designation, exit.employee.department].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{EXIT_TYPE[exit.type]}</Badge>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            { label: 'Notice given', value: day(exit.noticeDate) },
            { label: exit.status === 'PENDING_APPROVAL' ? 'Last day asked for' : 'Last working day', value: day(exit.lastWorkingDate) },
            { label: 'Exit checklist', value: exit.checklistProgress.total ? `${exit.checklistProgress.done} of ${exit.checklistProgress.total} done` : 'Opens when HR accepts' },
          ].map((d) => (
            <div key={d.label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
              <dt className="text-xs text-slate-500 dark:text-slate-400">{d.label}</dt>
              <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{d.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">HR accepts the resignation, agrees the last day and runs the rest of the exit. You see what you need for the handover.</p>
      </section>

      {actionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}

      {exit.checklist.length > 0 && (
        <section className={`${cardClass} p-5`} aria-labelledby="team-checklist-heading">
          <h3 id="team-checklist-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Your handover items</h3>
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
            {handover.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm text-slate-800 dark:text-slate-200">{i.title}</p>
                  {i.note && <p className="text-xs text-slate-500">{i.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge size="sm" variant={ITEM_STATUS[i.status].variant}>{ITEM_STATUS[i.status].label}</Badge>
                  {i.canUpdate && i.status === 'PENDING' && <Button size="sm" variant="secondary" onClick={() => setItem(i.id, 'CLEARED')} loading={busyItem === i.id} disabled={!!busyItem} aria-label={`Clear: ${i.title}`}>Clear</Button>}
                  {i.canUpdate && i.status === 'CLEARED' && <Button size="sm" variant="ghost" onClick={() => setItem(i.id, 'PENDING')} loading={busyItem === i.id} disabled={!!busyItem} aria-label={`Reopen: ${i.title}`}>Reopen</Button>}
                </div>
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <>
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Other teams</h4>
              <ul className="mt-2 space-y-1">
                {others.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="min-w-0 break-words"><span className="text-xs font-semibold text-slate-500">{TEAM[i.team]} · </span>{i.title}</span>
                    <Badge size="sm" variant={ITEM_STATUS[i.status].variant}>{ITEM_STATUS[i.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {exit.canGiveFeedback && (
        <section className={`${cardClass} p-5`} aria-labelledby="team-feedback-heading">
          <h3 id="team-feedback-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Your feedback for the exit interview</h3>
          <p className="mt-1 text-xs text-slate-500">How they worked and what their leaving means for the team. HR sees it with the exit interview; the employee doesn’t.</p>
          <form onSubmit={saveFeedback} className="mt-3 space-y-3">
            <label htmlFor={`${formId}-feedback`} className="sr-only">Your feedback</label>
            <textarea id={`${formId}-feedback`} className={fieldClass} rows={4} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={savingFeedback} disabled={savingFeedback || feedback.trim().length < 3 || feedback.trim() === exit.managerFeedback?.text}>{exit.managerFeedback ? 'Update feedback' : 'Save feedback'}</Button>
              {exit.managerFeedback?.at && <span className="text-xs text-slate-500">Saved {new Date(exit.managerFeedback.at).toLocaleString()}</span>}
            </div>
          </form>
        </section>
      )}

      <section className={`${cardClass} p-5`} aria-labelledby="team-comments-heading">
        <h3 id="team-comments-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Comments and handover notes</h3>
        <p className="mt-1 text-xs text-slate-500">HR sees these on the exit. The employee doesn’t.</p>
        {exit.comments.length === 0
          ? <p className="mt-3 text-sm text-slate-500">Nothing yet. Note who takes over their work and what is still open.</p>
          : (
            <ol className="mt-3 space-y-3">
              {exit.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                  <p className="text-xs text-slate-500"><span className="font-semibold">{KIND_LABEL[c.kind]}</span> · {c.isMine ? 'You' : c.author} · {new Date(c.createdAt).toLocaleString()}</p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-800 dark:text-slate-200">{c.body}</p>
                </li>
              ))}
            </ol>
          )}
        {exit.canComment && (
          <form onSubmit={post} className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-[#2B293E]">
            <div className="w-full sm:w-56">
              <label htmlFor={`${formId}-kind`} className={labelClass}>Type</label>
              <select id={`${formId}-kind`} className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as CommentKind)}>
                {(Object.keys(KIND_LABEL) as CommentKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${formId}-body`} className={labelClass}>{KIND_LABEL[kind]}</label>
              <textarea id={`${formId}-body`} className={fieldClass} rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <Button type="submit" loading={posting} disabled={posting || !body.trim()}>Add {KIND_LABEL[kind].toLowerCase()}</Button>
          </form>
        )}
      </section>
    </div>
  );
};
