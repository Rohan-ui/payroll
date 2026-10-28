import React, { useCallback, useEffect, useId, useState } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { useAuth } from '../../context/AuthContext';
import { offboardingApi, type ClearanceStatus, type ClearanceTeam, type ExitDetail } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { EXIT_STATUS, EXIT_TYPE, ITEM_STATUS, TEAM } from './offboarding-format';

type Action = 'approve' | 'last-day' | 'cancel' | 'complete' | 'interview' | 'add-item' | { waive: string };

/** One exit, as HR works it: accept it, agree the last day, clear the checklist, note the exit interview, then complete it. */
export const ExitDetailView: React.FC<{ id: string; onBack: () => void; onChanged: () => void }> = ({ id, onBack, onChanged }) => {
  const { can } = useAuth();
  const canManage = can('offboarding.manage');
  const canClear = can('offboarding.clearance.update');
  const canComplete = can('offboarding.complete');
  const [exit, setExit] = useState<ExitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    offboardingApi.detail(id).then(setExit).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);

  const changed = (next: ExitDetail, message: string) => {
    setExit(next);
    setAction(null);
    toast.success(message);
    onChanged();
  };

  const setItem = async (itemId: string, status: Exclude<ClearanceStatus, 'WAIVED'>) => {
    setBusyItem(itemId);
    setItemError(null);
    try {
      changed(await offboardingApi.updateItem(id, itemId, { status }), status === 'PENDING' ? 'Item reopened' : 'Item cleared');
    } catch (e) {
      setItemError(errorText(e));
    } finally {
      setBusyItem(null);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>This exit could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      </div>
    );
  }
  if (!exit) return <div className={`${cardClass} h-48 animate-pulse motion-reduce:animate-none`} aria-busy="true"><span className="sr-only" role="status">Loading the exit</span></div>;

  const status = EXIT_STATUS[exit.status];
  const open = exit.status === 'PENDING_APPROVAL' || exit.status === 'IN_PROGRESS';
  const underWay = exit.status === 'IN_PROGRESS';
  const done = exit.checklist.filter((i) => i.status !== 'PENDING').length;

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />

      <section className={`${cardClass} space-y-4 p-5`} aria-labelledby="exit-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="exit-heading" className="break-words text-lg font-bold text-slate-900 dark:text-slate-100">{exit.employee.name}</h2>
            <p className="text-sm text-slate-500">{[exit.employee.code, exit.employee.designation, exit.employee.department].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{EXIT_TYPE[exit.type]}{exit.isSelfService ? ' · from the employee' : ''}</Badge>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Notice given', value: day(exit.noticeDate) },
            { label: exit.status === 'PENDING_APPROVAL' ? 'Last day asked for' : 'Last working day', value: day(exit.lastWorkingDate) },
            { label: 'Notice period', value: exit.noticePeriodDays != null ? `${exit.noticePeriodDays} days` : 'Not recorded' },
            { label: 'Sign-in', value: exit.hasSignIn ? 'Active' : 'None' },
          ].map((d) => (
            <div key={d.label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
              <dt className="text-xs text-slate-500 dark:text-slate-400">{d.label}</dt>
              <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{d.value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</h3>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-800 dark:text-slate-200">{exit.reason}</p>
          <p className="mt-1 text-xs text-slate-500">
            {exit.requestedBy && `Started by ${exit.requestedBy}`}
            {exit.lastWorkingDate !== exit.requestedLastWorkingDate && ` · ${day(exit.requestedLastWorkingDate)} was asked for`}
            {exit.approvedBy && exit.isSelfService && ` · accepted by ${exit.approvedBy}`}
            {exit.completedBy && ` · completed by ${exit.completedBy}`}
            {exit.closedBy && ` · ${exit.status === 'WITHDRAWN' ? 'withdrawn' : 'cancelled'} by ${exit.closedBy}${exit.closeReason ? `: ${exit.closeReason}` : ''}`}
          </p>
        </div>

        {exit.warnings.length > 0 && (
          <ul className="space-y-2">
            {exit.warnings.map((w) => (
              <li key={w} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{w}
              </li>
            ))}
          </ul>
        )}

        {open && (canManage || canComplete) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-[#2B293E]">
            {exit.status === 'PENDING_APPROVAL' && canManage && <Button onClick={() => setAction('approve')}>Accept resignation…</Button>}
            {underWay && canComplete && (
              <Button onClick={() => setAction('complete')} disabled={exit.blockers.length > 0} aria-describedby={exit.blockers.length ? 'exit-blockers' : undefined}>Complete exit…</Button>
            )}
            {underWay && canManage && <Button variant="outline" onClick={() => setAction('last-day')}>Change last day</Button>}
            {canManage && <Button variant="ghost" onClick={() => setAction('cancel')}>{exit.status === 'PENDING_APPROVAL' ? 'Decline resignation' : 'Cancel exit'}</Button>}
            {underWay && canComplete && exit.blockers.length > 0 && (
              <p id="exit-blockers" className="w-full text-xs text-slate-600 dark:text-slate-400">Can’t be completed yet: {exit.blockers.join(' ')}</p>
            )}
          </div>
        )}
      </section>

      {exit.checklist.length > 0 && (
        <section className={`${cardClass} p-5`} aria-labelledby="checklist-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="checklist-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Exit checklist <span className="font-normal text-slate-500">· {done} of {exit.checklist.length} done</span></h3>
            {underWay && canManage && <Button size="sm" variant="outline" onClick={() => setAction('add-item')}>Add item</Button>}
          </div>
          {itemError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{itemError}</p>}
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
            {exit.checklist.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm text-slate-800 dark:text-slate-200"><span className="text-xs font-semibold text-slate-500">{TEAM[i.team]} · </span>{i.title}</p>
                  {i.status !== 'PENDING' && <p className="text-xs text-slate-500">{ITEM_STATUS[i.status].label} by {i.clearedBy ?? 'someone'}{i.note ? `: ${i.note}` : ''}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge size="sm" variant={ITEM_STATUS[i.status].variant}>{ITEM_STATUS[i.status].label}</Badge>
                  {underWay && canClear && i.status === 'PENDING' && (<>
                    <Button size="sm" variant="secondary" onClick={() => setItem(i.id, 'CLEARED')} loading={busyItem === i.id} disabled={!!busyItem} aria-label={`Clear: ${i.title}`}>Clear</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAction({ waive: i.id })} disabled={!!busyItem} aria-label={`Waive: ${i.title}`}>Waive…</Button>
                  </>)}
                  {underWay && canClear && i.status !== 'PENDING' && (
                    <Button size="sm" variant="ghost" onClick={() => setItem(i.id, 'PENDING')} loading={busyItem === i.id} disabled={!!busyItem} aria-label={`Reopen: ${i.title}`}>Reopen</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(exit.status === 'IN_PROGRESS' || exit.status === 'COMPLETED') && (
        <section className={`${cardClass} p-5`} aria-labelledby="interview-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="interview-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Exit interview</h3>
            {canManage && <Button size="sm" variant="outline" onClick={() => setAction('interview')}>{exit.exitInterview ? 'Edit' : 'Record exit interview'}</Button>}
          </div>
          {exit.exitInterview ? (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-slate-500">Held {day(exit.exitInterview.date)}{exit.exitInterview.recordedBy ? ` · noted by ${exit.exitInterview.recordedBy}` : ''} · {exit.exitInterview.rehireEligible == null ? 'Rehire not decided' : exit.exitInterview.rehireEligible ? 'Eligible for rehire' : 'Not eligible for rehire'}</p>
              <p className="whitespace-pre-line break-words text-sm text-slate-800 dark:text-slate-200">{exit.exitInterview.notes}</p>
              <p className="text-xs text-slate-500">Only people who can view exits see these notes; the employee doesn’t.</p>
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">Not recorded yet. Note what the employee said about why they’re leaving and whether you’d hire them again.</p>}
        </section>
      )}

      {action === 'approve' && <DateAction title={`Accept ${exit.employee.name}’s resignation?`} description="Agree their last working day. The exit checklist opens for each team." initial={exit.lastWorkingDate} min={exit.noticeDate} confirm="Accept resignation"
        onClose={() => setAction(null)} run={async (date) => changed(await offboardingApi.approve(id, date), 'Resignation accepted')} />}
      {action === 'last-day' && <DateAction title="Change the last working day" description={`It becomes ${exit.employee.name}’s exit date when the exit is completed.`} initial={exit.lastWorkingDate} min={exit.noticeDate} confirm="Save last day"
        onClose={() => setAction(null)} run={async (date) => changed(await offboardingApi.changeLastDay(id, date), 'Last working day changed')} />}
      {action === 'cancel' && <TextAction title={exit.status === 'PENDING_APPROVAL' ? `Decline ${exit.employee.name}’s resignation?` : `Cancel ${exit.employee.name}’s exit?`} description="They stay on as an active employee. The exit is kept, marked cancelled, with your reason." label="Reason" confirm={exit.status === 'PENDING_APPROVAL' ? 'Decline resignation' : 'Cancel exit'} danger
        onClose={() => setAction(null)} run={async (text) => changed(await offboardingApi.cancel(id, text), exit.status === 'PENDING_APPROVAL' ? 'Resignation declined' : 'Exit cancelled')} />}
      {action && typeof action === 'object' && <TextAction title="Waive this item?" description={exit.checklist.find((i) => i.id === action.waive)?.title ?? ''} label="Why it’s being waived" confirm="Waive item"
        onClose={() => setAction(null)} run={async (text) => changed(await offboardingApi.updateItem(id, action.waive, { status: 'WAIVED', note: text }), 'Item waived')} />}
      {action === 'add-item' && <AddItemDialog onClose={() => setAction(null)} run={async (team, title) => changed(await offboardingApi.addItem(id, { team, title }), 'Checklist item added')} />}
      {action === 'interview' && <InterviewDialog exit={exit} onClose={() => setAction(null)} run={async (input) => changed(await offboardingApi.saveInterview(id, input), 'Exit interview saved')} />}
      {action === 'complete' && (
        <CompleteDialog exit={exit} onClose={() => setAction(null)} run={async () => changed(await offboardingApi.complete(id), `${exit.employee.name}’s exit is complete`)} />
      )}
    </div>
  );
};

const BackButton: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300">
    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All exits
  </button>
);

/** Runs a dialog's action, keeping its error inside the dialog. */
function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const alert = error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  return { busy, run, alert };
}

const DateAction: React.FC<{ title: string; description: string; initial: string; min: string; confirm: string; onClose: () => void; run: (date: string) => Promise<void> }> = ({ title, description, initial, min, confirm, onClose, run }) => {
  const id = useId();
  const [date, setDate] = useState(initial);
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title={title} description={description} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run(date))} loading={busy} disabled={busy || !date || date < min}>{confirm}</Button></>}>
      <label htmlFor={id} className={labelClass}>Last working day</label>
      <input id={id} type="date" className={fieldClass} min={min} value={date} onChange={(e) => setDate(e.target.value)} />
      {alert}
    </Dialog>
  );
};

const TextAction: React.FC<{ title: string; description: string; label: string; confirm: string; danger?: boolean; onClose: () => void; run: (text: string) => Promise<void> }> = ({ title, description, label, confirm, danger, onClose, run }) => {
  const id = useId();
  const [text, setText] = useState('');
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title={title} description={description} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Back</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => go(() => run(text.trim()))} loading={busy} disabled={busy || text.trim().length < 3}>{confirm}</Button></>}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <textarea id={id} className={fieldClass} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      {alert}
    </Dialog>
  );
};

const AddItemDialog: React.FC<{ onClose: () => void; run: (team: ClearanceTeam, title: string) => Promise<void> }> = ({ onClose, run }) => {
  const id = useId();
  const [team, setTeam] = useState<ClearanceTeam>('IT');
  const [title, setTitle] = useState('');
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title="Add a checklist item" size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run(team, title.trim()))} loading={busy} disabled={busy || title.trim().length < 3}>Add item</Button></>}>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-team`} className={labelClass}>Team</label>
          <select id={`${id}-team`} className={fieldClass} value={team} onChange={(e) => setTeam(e.target.value as ClearanceTeam)}>
            {(Object.keys(TEAM) as ClearanceTeam[]).map((t) => <option key={t} value={t}>{TEAM[t]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-title`} className={labelClass}>What needs doing</label>
          <input id={`${id}-title`} className={fieldClass} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      {alert}
    </Dialog>
  );
};

const InterviewDialog: React.FC<{ exit: ExitDetail; onClose: () => void; run: (input: { interviewDate: string; notes: string; rehireEligible?: boolean }) => Promise<void> }> = ({ exit, onClose, run }) => {
  const id = useId();
  const [date, setDate] = useState(exit.exitInterview?.date ?? exit.today);
  const [notes, setNotes] = useState(exit.exitInterview?.notes ?? '');
  const [rehire, setRehire] = useState<'' | 'yes' | 'no'>(exit.exitInterview?.rehireEligible == null ? '' : exit.exitInterview.rehireEligible ? 'yes' : 'no');
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title="Exit interview" description={`What ${exit.employee.name} said about leaving. The employee doesn’t see these notes.`} size="lg" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run({ interviewDate: date, notes: notes.trim(), rehireEligible: rehire === '' ? undefined : rehire === 'yes' }))} loading={busy} disabled={busy || !date || notes.trim().length < 3}>Save</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-date`} className={labelClass}>Held on</label>
            <input id={`${id}-date`} type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-rehire`} className={labelClass}>Would you hire them again?</label>
            <select id={`${id}-rehire`} className={fieldClass} value={rehire} onChange={(e) => setRehire(e.target.value as '' | 'yes' | 'no')}>
              <option value="">Not decided</option>
              <option value="yes">Yes, eligible for rehire</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-notes`} className={labelClass}>Notes</label>
          <textarea id={`${id}-notes`} className={fieldClass} rows={6} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <p className={hintClass}>{4000 - notes.length} characters left.</p>
        </div>
      </div>
      {alert}
    </Dialog>
  );
};

const CompleteDialog: React.FC<{ exit: ExitDetail; onClose: () => void; run: () => Promise<void> }> = ({ exit, onClose, run }) => {
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title={`Complete ${exit.employee.name}’s exit?`} description={`Their exit date becomes ${day(exit.lastWorkingDate)}.`} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Not yet</Button><Button variant="danger" onClick={() => go(run)} loading={busy} disabled={busy}>Complete exit</Button></>}>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
        <li>They’re marked exited and leave active headcount and attendance.</li>
        <li>Payroll pays them up to {day(exit.lastWorkingDate)} and leaves them out of later months.</li>
        {exit.hasSignIn && <li>Their sign-in to this workspace ends now, including any open sessions.</li>}
        <li>Their records, payslips and history are kept. This can’t be undone here.</li>
      </ul>
      {alert}
    </Dialog>
  );
};
