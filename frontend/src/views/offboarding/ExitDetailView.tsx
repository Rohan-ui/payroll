import React, { useCallback, useEffect, useId, useState } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { useAuth } from '../../context/AuthContext';
import { offboardingApi, type ClearanceStatus, type ExitDetail } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, money } from '../payroll/payroll-format';
import { EXIT_STATUS, EXIT_TYPE, ITEM_STATUS, TEAM } from './offboarding-format';
import { SettlementPanel } from './SettlementPanel';
import { ExitDocumentsPanel } from './ExitDocumentsPanel';
import { ExitEmailsPanel } from './ExitEmailsPanel';
import { ChecklistItemDialog } from './ChecklistItemDialog';
import { ExitInterviewPanel } from './ExitInterviewPanel';
import { AssetsPanel } from '../employee/AssetsPanel';
import { assetsApi } from '../../api/assets.api';

type Action = 'approve' | 'last-day' | 'cancel' | 'complete' | 'add-item' | 'waive-notice' | 'reassign' | { waive: string } | { edit: string };

/** One exit, as HR works it: accept it, agree the last day, clear the checklist, note the exit interview, then complete it. */
export const ExitDetailView: React.FC<{ id: string; onBack: () => void; onChanged: () => void }> = ({ id, onBack, onChanged }) => {
  const { can } = useAuth();
  const canManage = can('offboarding.manage');
  const canComplete = can('offboarding.complete');
  const canReassign = canManage && can('people.update');
  const [exit, setExit] = useState<ExitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    offboardingApi.detail(id).then(setExit).catch((e) => setError(errorText(e)));
  }, [id]);
  const loadAssets = useCallback(() => assetsApi.forExit(id), [id]);
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

      <NoticeSection exit={exit} canDecide={open && canManage} onRecover={async () => changed(await offboardingApi.decideNotice(id, 'RECOVER'), 'Notice shortfall will be recovered')} onWaive={() => setAction('waive-notice')} />

      {open && exit.directReports.length > 0 && (
        <section className={`${cardClass} p-5`} aria-labelledby="reports-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="reports-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Direct reports <span className="font-normal text-slate-500">· {exit.directReports.length} need a new manager</span></h3>
            {canReassign && <Button size="sm" variant="outline" onClick={() => setAction('reassign')}>Reassign…</Button>}
          </div>
          <p className="mt-1 text-xs text-slate-500">They report to {exit.employee.name} after {day(exit.lastWorkingDate)}. The exit can’t be completed until they have a new manager.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {exit.directReports.map((r) => <li key={r.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-200">{r.name} · {r.code}</li>)}
          </ul>
        </section>
      )}

      {exit.obligations.loans.length > 0 && (
        <section className={`${cardClass} p-5`} aria-labelledby="loans-heading">
          <h3 id="loans-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Loans and advances <span className="font-normal text-slate-500">· {money(exit.obligations.outstanding)} outstanding</span></h3>
          <p className="mt-1 text-xs text-slate-500">Finance can be cleared once these are settled, or waived with the reason. Nothing is deducted automatically.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th scope="col" className="py-1.5 pr-3 font-semibold">Loan</th><th scope="col" className="py-1.5 pr-3 text-right font-semibold">Principal</th><th scope="col" className="py-1.5 pr-3 text-right font-semibold">Outstanding</th><th scope="col" className="py-1.5 text-right font-semibold">Due after last day</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {exit.obligations.loans.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3">{l.number} <span className="text-xs text-slate-500">· {l.type === 'ADVANCE' ? 'Advance' : 'Loan'}</span></td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(l.principal)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(l.outstanding)} <span className="text-xs text-slate-500">({l.installmentsLeft} left)</span></td>
                    <td className="py-2 text-right tabular-nums">{money(l.dueAfterLastDay)} <span className="text-xs text-slate-500">({l.installmentsAfterLastDay})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {can('offboarding.settlement.view') && (exit.status === 'IN_PROGRESS' || exit.status === 'COMPLETED') && (
        <SettlementPanel separationId={exit.id} employeeName={exit.employee.name} today={exit.today} />
      )}

      {(exit.status === 'IN_PROGRESS' || exit.status === 'COMPLETED') && (
        <ExitDocumentsPanel separationId={exit.id} employeeName={exit.employee.name} isCompleted={exit.status === 'COMPLETED'} />
      )}

      {(exit.status === 'IN_PROGRESS' || exit.status === 'COMPLETED') && (
        <AssetsPanel employeeId={exit.employee.id} load={loadAssets} title="Company assets"
          description="The exit can’t be completed, nor the settlement submitted, while an asset is still with the employee. Recoveries for lost or damaged assets go into the settlement." onChanged={load} />
      )}

      {exit.checklist.length > 0 && (
        <section className={`${cardClass} p-5`} aria-labelledby="checklist-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="checklist-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Exit checklist <span className="font-normal text-slate-500">· {done} of {exit.checklist.length} done</span></h3>
            {underWay && canManage && <Button size="sm" variant="outline" onClick={() => setAction('add-item')}>Add item</Button>}
          </div>
          {itemError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{itemError}</p>}
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
            {exit.checklist.map((i) => {
              const late = i.status === 'PENDING' && underWay && i.dueDate < exit.today;
              return (
                <li key={i.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <p className="break-words text-sm text-slate-800 dark:text-slate-200">
                      <span className="text-xs font-semibold text-slate-500">{TEAM[i.team]} · </span>{i.title}
                      {!i.isRequired && <span className="ml-1.5 text-xs text-slate-500">(optional)</span>}
                    </p>
                    {i.description && <p className="break-words text-xs text-slate-600 dark:text-slate-400">{i.description}</p>}
                    {i.status === 'PENDING' && (
                      <p className={`text-xs ${late ? 'font-semibold text-red-700 dark:text-red-300' : 'text-slate-500'}`}>
                        {late ? 'Overdue · was due ' : 'Due '}{day(i.dueDate)}{i.hasOwnDueDate ? '' : ' (last day)'}{i.assignedTo ? ` · with ${i.assignedTo.name ?? 'someone'}` : ''}
                      </p>
                    )}
                    {i.status === 'CLEARED' && <p className="text-xs text-slate-500">Cleared by {i.clearedBy ?? 'someone'}{i.note ? `: ${i.note}` : ''}</p>}
                    {i.status === 'WAIVED' && <p className="text-xs text-slate-500">Waived by {i.clearedBy ?? 'someone'}: {i.waiverReason}{i.note ? ` · ${i.note}` : ''}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge size="sm" variant={ITEM_STATUS[i.status].variant}>{ITEM_STATUS[i.status].label}</Badge>
                    {i.canClear && i.status === 'PENDING' && (
                      <Button size="sm" variant="secondary" onClick={() => setItem(i.id, 'CLEARED')} loading={busyItem === i.id} disabled={!!busyItem} aria-label={`Clear: ${i.title}`}>Clear</Button>
                    )}
                    {i.canWaive && i.status === 'PENDING' && (
                      <Button size="sm" variant="ghost" onClick={() => setAction({ waive: i.id })} disabled={!!busyItem} aria-label={`Waive: ${i.title}`}>Waive…</Button>
                    )}
                    {i.canClear && i.status !== 'PENDING' && (
                      <Button size="sm" variant="ghost" onClick={() => setItem(i.id, 'PENDING')} loading={busyItem === i.id} disabled={!!busyItem} aria-label={`Reopen: ${i.title}`}>Reopen</Button>
                    )}
                    {underWay && canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setAction({ edit: i.id })} disabled={!!busyItem} aria-label={`Edit: ${i.title}`}>Edit</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {exit.managerComments.length > 0 && (
        <section className={`${cardClass} p-5`} aria-labelledby="manager-notes-heading">
          <h3 id="manager-notes-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">From the manager</h3>
          <ol className="mt-3 space-y-3">
            {exit.managerComments.map((c) => (
              <li key={c.id} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-xs text-slate-500"><span className="font-semibold">{c.kind === 'HANDOVER' ? 'Handover note' : 'Comment'}</span>{c.author ? ` · ${c.author}` : ''} · {new Date(c.createdAt).toLocaleString()}</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-800 dark:text-slate-200">{c.body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(exit.status === 'IN_PROGRESS' || exit.status === 'COMPLETED') && (
        <ExitInterviewPanel exit={exit} canRecord={canManage} onSave={async (input) => changed(await offboardingApi.saveInterview(id, input), 'Exit interview saved')} onChanged={changed} />
      )}

      <ExitEmailsPanel separationId={exit.id} refreshKey={exit} />

      {action === 'approve' && <DateAction title={`Accept ${exit.employee.name}’s resignation?`} description="Agree their last working day. The exit checklist opens for each team." initial={exit.lastWorkingDate} min={exit.noticeDate} confirm="Accept resignation"
        onClose={() => setAction(null)} run={async (date, reason) => changed(await offboardingApi.approve(id, date, reason), 'Resignation accepted')} />}
      {action === 'last-day' && <DateAction title="Change the last working day" description={`It becomes ${exit.employee.name}’s exit date when the exit is completed.`} initial={exit.lastWorkingDate} min={exit.noticeDate} confirm="Save last day"
        onClose={() => setAction(null)} run={async (date, reason) => changed(await offboardingApi.changeLastDay(id, date, reason), 'Last working day changed')} />}
      {action === 'waive-notice' && <TextAction title={`Waive the ${exit.notice.shortfallDays}-day notice shortfall?`} description="Nothing is recovered for the days not served. Your reason is kept with the exit." label="Why it’s being waived" confirm="Waive shortfall"
        onClose={() => setAction(null)} run={async (text) => changed(await offboardingApi.decideNotice(id, 'WAIVE', text), 'Notice shortfall waived')} />}
      {action === 'reassign' && <ReassignDialog exit={exit} onClose={() => setAction(null)} run={async (managerId) => {
        const result = await offboardingApi.reassignReports(id, managerId);
        changed(result.data, result.failed.length ? `${result.failed.length} could not be moved` : 'Reports reassigned');
        if (result.failed.length) toast.error(result.failed.map((f) => `${f.name}: ${f.reason}`).join(' '));
      }} />}
      {action === 'cancel' && <TextAction title={exit.status === 'PENDING_APPROVAL' ? `Decline ${exit.employee.name}’s resignation?` : `Cancel ${exit.employee.name}’s exit?`} description="They stay on as an active employee. The exit is kept, marked cancelled, with your reason." label="Reason" confirm={exit.status === 'PENDING_APPROVAL' ? 'Decline resignation' : 'Cancel exit'} danger
        onClose={() => setAction(null)} run={async (text) => changed(await offboardingApi.cancel(id, text), exit.status === 'PENDING_APPROVAL' ? 'Resignation declined' : 'Exit cancelled')} />}
      {action && typeof action === 'object' && 'waive' in action && <TextAction title="Waive this item?" description={`${exit.checklist.find((i) => i.id === action.waive)?.title ?? ''}. It counts as done; your reason and name are kept with it.`} label="Why it’s being waived" confirm="Waive item"
        onClose={() => setAction(null)} run={async (text) => changed(await offboardingApi.updateItem(id, action.waive, { status: 'WAIVED', waiverReason: text }), 'Item waived')} />}
      {action === 'add-item' && <ChecklistItemDialog lastWorkingDate={exit.lastWorkingDate} onClose={() => setAction(null)}
        onAdd={async (input) => changed(await offboardingApi.addItem(id, input), 'Checklist item added')} />}
      {action && typeof action === 'object' && 'edit' in action && (() => {
        const item = exit.checklist.find((i) => i.id === action.edit);
        return item && <ChecklistItemDialog item={item} lastWorkingDate={exit.lastWorkingDate} onClose={() => setAction(null)}
          onSave={async (input) => changed(await offboardingApi.itemDetails(id, item.id, input), 'Checklist item saved')} />;
      })()}
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

const DateAction: React.FC<{ title: string; description: string; initial: string; min: string; confirm: string; onClose: () => void; run: (date: string, reason?: string) => Promise<void> }> = ({ title, description, initial, min, confirm, onClose, run }) => {
  const id = useId();
  const [date, setDate] = useState(initial);
  const [reason, setReason] = useState('');
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title={title} description={description} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run(date, reason.trim() || undefined))} loading={busy} disabled={busy || !date || date < min}>{confirm}</Button></>}>
      <label htmlFor={id} className={labelClass}>Last working day</label>
      <input id={id} type="date" className={fieldClass} min={min} value={date} onChange={(e) => setDate(e.target.value)} />
      {date !== initial && (
        <div className="mt-3">
          <label htmlFor={`${id}-reason`} className={labelClass}>Reason for the change <span className="font-normal text-slate-500">(optional)</span></label>
          <input id={`${id}-reason`} className={fieldClass} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className={hintClass}>Kept in the exit’s date history.</p>
        </div>
      )}
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

/** The notice period worked out: what was required, served and asked for, and the decision on any shortfall. */
const NoticeSection: React.FC<{ exit: ExitDetail; canDecide: boolean; onRecover: () => Promise<void>; onWaive: () => void }> = ({ exit, canDecide, onRecover, onWaive }) => {
  const n = exit.notice;
  const [busy, setBusy] = useState(false);
  const facts = [
    { label: 'Required notice', value: n.requiredDays == null ? 'Not recorded' : `${n.requiredDays} days` },
    { label: 'Notice served', value: `${n.servedDays} days` },
    { label: 'Last day asked for', value: day(n.requestedLastDay) },
    { label: 'Last day by contract', value: n.contractualLastDay ? day(n.contractualLastDay) : '—' },
    { label: 'Agreed last day', value: day(n.lastDay) },
    { label: 'Shortfall', value: n.shortfallDays ? `${n.shortfallDays} days` : 'None' },
  ];
  return (
    <section className={`${cardClass} p-5`} aria-labelledby="notice-heading">
      <h3 id="notice-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Notice period</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {facts.map((f) => (
          <div key={f.label}><dt className="text-xs text-slate-500 dark:text-slate-400">{f.label}</dt><dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{f.value}</dd></div>
        ))}
      </dl>
      {n.requiredDays == null && <p className="mt-2 text-xs text-slate-500">No notice period is recorded on their employment, so no shortfall is worked out.</p>}
      {n.shortfallDays > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm dark:border-[#2B293E]">
          {n.decision ? (
            <p className="text-slate-700 dark:text-slate-300">
              <Badge size="sm" variant={n.decision === 'WAIVE' ? 'neutral' : 'warning'}>{n.decision === 'WAIVE' ? 'Waived' : 'To be recovered'}</Badge>{' '}
              {n.decidedBy && `by ${n.decidedBy}`}{n.decisionReason ? `: ${n.decisionReason}` : ''}. The amount is worked out in the final settlement.
            </p>
          ) : <p className="text-slate-700 dark:text-slate-300">Decide whether the {n.shortfallDays} days not served are recovered or waived.</p>}
          {canDecide && (
            <span className="flex gap-2">
              {n.decision !== 'RECOVER' && <Button size="sm" variant="outline" loading={busy} onClick={async () => { setBusy(true); try { await onRecover(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); } }}>Recover</Button>}
              {n.decision !== 'WAIVE' && <Button size="sm" variant="ghost" onClick={onWaive}>Waive…</Button>}
            </span>
          )}
        </div>
      )}
      {exit.dateChanges.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-[#2B293E]">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last day changes</h4>
          <ol className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {exit.dateChanges.map((c) => <li key={c.changedAt}>{day(c.from)} → {day(c.to)}{c.changedBy ? ` by ${c.changedBy}` : ''}{c.reason ? `: ${c.reason}` : ''}</li>)}
          </ol>
        </div>
      )}
    </section>
  );
};

/** Picks the new manager for everyone who reported to the leaver; it starts the day after their last day. */
const ReassignDialog: React.FC<{ exit: ExitDetail; onClose: () => void; run: (managerId: string) => Promise<void> }> = ({ exit, onClose, run }) => {
  const id = useId();
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<{ id: string; name: string; code: string }[]>([]);
  const [managerId, setManagerId] = useState('');
  const { busy, run: go, alert } = useRun();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      offboardingApi.employees(search.trim())
        .then((rows) => setOptions(rows.filter((r) => r.id !== exit.employee.id).map((r) => ({ id: r.id, name: r.name, code: r.code }))))
        .catch(() => setOptions([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, exit.employee.id]);
  return (
    <Dialog title="Give the team a new manager" description={`${exit.directReports.length} ${exit.directReports.length === 1 ? 'person reports' : 'people report'} to ${exit.employee.name}. The new manager takes over the day after ${day(exit.lastWorkingDate)}.`} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run(managerId))} loading={busy} disabled={busy || !managerId}>Reassign</Button></>}>
      <label htmlFor={`${id}-search`} className={labelClass}>Find the new manager</label>
      <input id={`${id}-search`} className={fieldClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or employee code" />
      <label htmlFor={`${id}-manager`} className={`${labelClass} mt-3`}>New manager</label>
      <select id={`${id}-manager`} className={fieldClass} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
        <option value="">{options.length ? 'Choose…' : 'No matches'}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.code}</option>)}
      </select>
      {alert}
    </Dialog>
  );
};
