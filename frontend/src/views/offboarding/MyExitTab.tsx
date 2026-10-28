import React, { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { offboardingApi, type MyExit, type OwnExit } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { EXIT_STATUS, EXIT_TYPE, ITEM_STATUS, TEAM, addDays, daysBetween } from './offboarding-format';

/** The employee's exit as it stands: dates, where it is, and the checklist (without HR's notes). */
const CurrentExit: React.FC<{ exit: OwnExit; today: string; onWithdraw: () => void }> = ({ exit, today, onWithdraw }) => {
  const status = EXIT_STATUS[exit.status];
  const left = daysBetween(today, exit.lastWorkingDate);
  const done = exit.checklist.filter((i) => i.status !== 'PENDING').length;
  return (
    <section className={`${cardClass} space-y-4 p-5`} aria-labelledby="my-exit-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="my-exit-heading" className="text-base font-bold text-slate-900 dark:text-slate-100">Your {EXIT_TYPE[exit.type].toLowerCase()}</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            {exit.status === 'PENDING_APPROVAL' && 'HR has your resignation and will confirm your last working day.'}
            {exit.status === 'IN_PROGRESS' && (left > 0 ? `${left} day${left === 1 ? '' : 's'} until your last working day.` : left === 0 ? 'Today is your last working day.' : 'Your last working day has passed. HR will complete your exit.')}
            {exit.status === 'COMPLETED' && 'Your exit is complete.'}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Notice given', value: day(exit.noticeDate) },
          { label: exit.status === 'PENDING_APPROVAL' ? 'Last day you asked for' : 'Last working day', value: day(exit.lastWorkingDate) },
          { label: 'Notice period', value: exit.noticePeriodDays != null ? `${exit.noticePeriodDays} days` : 'Not recorded' },
        ].map((d) => (
          <div key={d.label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{d.label}</dt>
            <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{d.value}</dd>
          </div>
        ))}
      </dl>
      {exit.status === 'IN_PROGRESS' && exit.lastWorkingDate !== exit.requestedLastWorkingDate && (
        <p className="text-sm text-slate-600 dark:text-slate-400">You asked for {day(exit.requestedLastWorkingDate)}; HR agreed {day(exit.lastWorkingDate)}.</p>
      )}

      {exit.checklist.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Exit checklist <span className="font-normal text-slate-500">· {done} of {exit.checklist.length} done</span></h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
            {exit.checklist.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 break-words text-slate-800 dark:text-slate-200"><span className="text-xs text-slate-500">{TEAM[i.team]} · </span>{i.title}</span>
                <Badge size="sm" variant={ITEM_STATUS[i.status].variant}>{ITEM_STATUS[i.status].label}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {exit.status === 'PENDING_APPROVAL' && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-[#2B293E]">
          <Button variant="outline" onClick={onWithdraw}>Withdraw resignation</Button>
          <p className="text-xs text-slate-500">You can withdraw it until HR accepts it.</p>
        </div>
      )}
      {exit.status === 'IN_PROGRESS' && <p className="text-xs text-slate-500">To change your last working day or take back your resignation, speak to HR.</p>}
    </section>
  );
};

const ResignForm: React.FC<{ today: string; noticePeriodDays: number | null; onDone: (result: MyExit) => void }> = ({ today, noticePeriodDays, onDone }) => {
  const id = useId();
  const [reason, setReason] = useState('');
  const [lastDay, setLastDay] = useState(addDays(today, noticePeriodDays ?? 30));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = noticePeriodDays != null && lastDay < addDays(today, noticePeriodDays);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await offboardingApi.resign({ reason: reason.trim(), lastWorkingDate: lastDay });
      toast.success('Resignation sent to HR');
      setConfirming(false);
      onDone(result);
    } catch (e) {
      setError(errorText(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${cardClass} space-y-4 p-5`} aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="text-base font-bold text-slate-900 dark:text-slate-100">Resign</h2>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Your resignation goes to HR, who confirm your last working day. {noticePeriodDays != null ? `Your notice period is ${noticePeriodDays} days.` : 'Your notice period isn’t recorded; HR will confirm it.'}
        </p>
      </div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) setConfirming(true); }}>
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>Reason <span className="font-normal text-slate-500">(required)</span></label>
          <textarea id={`${id}-reason`} className={fieldClass} rows={4} maxLength={1000} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={`${id}-reason-hint`} />
          <p id={`${id}-reason-hint`} className={hintClass}>HR sees this. {1000 - reason.length} characters left.</p>
        </div>
        <div className="max-w-xs">
          <label htmlFor={`${id}-last`} className={labelClass}>Last working day you’re asking for</label>
          <input id={`${id}-last`} type="date" className={fieldClass} min={today} required value={lastDay} onChange={(e) => setLastDay(e.target.value)} aria-describedby={short ? `${id}-last-hint` : undefined} />
          {short && noticePeriodDays != null && <p id={`${id}-last-hint`} className="mt-1 text-xs text-amber-700 dark:text-amber-300">This is shorter than your {noticePeriodDays}-day notice period, which would end on {day(addDays(today, noticePeriodDays))}. HR decides whether to agree.</p>}
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <Button type="submit" variant="danger" disabled={reason.trim().length < 3 || !lastDay}>Submit resignation…</Button>
      </form>
      {confirming && (
        <Dialog title="Submit your resignation?" description={`Your notice starts today, ${day(today)}, and you’re asking for ${day(lastDay)} as your last working day.`} onClose={() => !busy && setConfirming(false)} size="sm"
          footer={<>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>Keep editing</Button>
            <Button variant="danger" onClick={submit} loading={busy} disabled={busy}>Submit resignation</Button>
          </>}>
          <p className="text-sm text-slate-700 dark:text-slate-300">HR is told straight away. You can withdraw it until HR accepts it.</p>
        </Dialog>
      )}
    </section>
  );
};

/** The signed-in person's own exit: resign, follow it, or withdraw it while HR hasn't accepted it. */
export const MyExitTab: React.FC = () => {
  const [mine, setMine] = useState<MyExit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    offboardingApi.mine().then(setMine).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const withdraw = async () => {
    setBusy(true);
    setWithdrawError(null);
    try {
      setMine(await offboardingApi.withdraw());
      toast.success('Resignation withdrawn');
      setWithdrawing(false);
    } catch (e) {
      setWithdrawError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>Your exit could not be loaded: {error}</span>
        <button type="button" onClick={load} className="font-semibold underline">Try again</button>
      </div>
    );
  }
  if (!mine) return <div className={`${cardClass} h-40 animate-pulse motion-reduce:animate-none`} aria-busy="true"><span className="sr-only" role="status">Loading your exit</span></div>;
  if (!mine.linked) {
    return <p className={`${cardClass} p-5 text-sm text-slate-600 dark:text-slate-400`}>Your sign-in isn’t linked to an employee record yet, so there’s nothing to show here. Ask HR to link it from your employee page.</p>;
  }

  return (
    <div className="max-w-3xl space-y-4">
      {mine.current
        ? <CurrentExit exit={mine.current} today={mine.today} onWithdraw={() => setWithdrawing(true)} />
        : <ResignForm today={mine.today} noticePeriodDays={mine.employee.noticePeriodDays} onDone={setMine} />}
      {mine.past.length > 0 && (
        <section className={`${cardClass} p-5`} aria-labelledby="past-exits-heading">
          <h2 id="past-exits-heading" className="text-sm font-semibold text-slate-800 dark:text-slate-200">Earlier</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
            {mine.past.map((p) => <li key={p.id}>{EXIT_TYPE[p.type]} given {day(p.noticeDate)} · {EXIT_STATUS[p.status].label}</li>)}
          </ul>
        </section>
      )}
      {withdrawing && (
        <Dialog title="Withdraw your resignation?" description="You stay on as you are, and HR is told it was withdrawn." onClose={() => !busy && setWithdrawing(false)} size="sm"
          footer={<>
            <Button variant="outline" onClick={() => setWithdrawing(false)} disabled={busy}>Keep it</Button>
            <Button onClick={withdraw} loading={busy} disabled={busy}>Withdraw resignation</Button>
          </>}>
          <p className="text-sm text-slate-700 dark:text-slate-300">If you resign again later, your notice starts from that day.</p>
          {withdrawError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{withdrawError}</p>}
        </Dialog>
      )}
    </div>
  );
};
