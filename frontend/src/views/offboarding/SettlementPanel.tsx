import React, { useCallback, useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { useAuth } from '../../context/AuthContext';
import {
  MANUAL_SETTLEMENT_CODES, settlementApi, type ExitSettlement, type Settlement, type SettlementLine, type SettlementPolicy, type SettlementStatus,
} from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, money } from '../payroll/payroll-format';

const STATUS: Record<SettlementStatus, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  PENDING_REVIEW: { label: 'Awaiting review', variant: 'warning' },
  APPROVED: { label: 'Approved, not paid', variant: 'info' },
  PAID: { label: 'Paid', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  REVISED: { label: 'Replaced by a revision', variant: 'neutral' },
};
const PAYMENT_MODES = { BANK_TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', CASH: 'Cash', RECOVERED: 'Recovered from the employee' } as const;
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

type Action =
  | { kind: 'add' } | { kind: 'adjust'; line: SettlementLine } | { kind: 'review' } | { kind: 'approve' } | { kind: 'reject' }
  | { kind: 'pay' } | { kind: 'revise' } | { kind: 'cancel' } | { kind: 'policy' };

/**
 * The full and final settlement on the exit page: what is owed each way and
 * how it was worked out, and the step each person can take next. Every rule
 * is enforced by the server; the buttons only follow it.
 */
export const SettlementPanel: React.FC<{ separationId: string; employeeName: string; today: string }> = ({ separationId, employeeName, today }) => {
  const { can } = useAuth();
  const canManage = can('offboarding.settlement.manage');
  const [state, setState] = useState<ExitSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    settlementApi.forExit(separationId).then(setState).catch((e) => setError(errorText(e)));
  }, [separationId]);
  useEffect(load, [load]);

  const changed = (next: ExitSettlement, message: string) => {
    setState(next);
    setAction(null);
    toast.success(message);
  };
  /** A one-click step; its error is shown in the panel, not only as a toast. */
  const step = async (task: () => Promise<ExitSettlement>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      changed(await task(), message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="settlement-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Full and final settlement</h3>
      {canManage && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'policy' })}>Settlement rules</Button>}
    </div>
  );

  if (!state) {
    return (
      <section className={`${cardClass} p-5`} aria-labelledby="settlement-heading">
        {heading}
        {error ? (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">The settlement could not be loaded: {error} <button type="button" className="font-semibold underline" onClick={load}>Try again</button></p>
        ) : <div className="mt-3 h-20 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading the settlement</span></div>}
      </section>
    );
  }

  const s = state.current;
  return (
    <section className={`${cardClass} p-5`} aria-labelledby="settlement-heading">
      {heading}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {!s ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {state.canPrepare
              ? `No settlement yet. Preparing one works out leave encashment, gratuity, notice and loan recovery for ${employeeName} from their salary, leave and loans.`
              : 'A settlement can be prepared once the exit is under way.'}
          </p>
          {state.canPrepare && canManage && <Button size="sm" loading={busy} onClick={() => step(() => settlementApi.prepare(separationId), 'Settlement prepared')}>Prepare settlement</Button>}
        </div>
      ) : (
        <SettlementBody s={s} busy={busy} onStep={step} onAction={setAction} />
      )}

      {state.history.length > 1 && (
        <details className="mt-4 text-xs text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer font-semibold">Earlier versions</summary>
          <ul className="mt-1 space-y-0.5">
            {state.history.map((h) => <li key={h.id}>Version {h.version} · {STATUS[h.status].label} · net {money(h.net)} · {day(h.createdAt.slice(0, 10))}</li>)}
          </ul>
        </details>
      )}

      {s && action?.kind === 'add' && <AddLineDialog onClose={() => setAction(null)} run={async (input) => changed(await settlementApi.addLine(s.id, input), 'Amount added')} />}
      {s && action?.kind === 'adjust' && <AdjustDialog line={action.line} onClose={() => setAction(null)} run={async (input) => changed(await settlementApi.adjustLine(s.id, action.line.id, input), 'Amount changed')} />}
      {s && action?.kind === 'review' && <TextDialog title="Mark this settlement reviewed?" description="Say what you checked, if useful. Someone with approval access can then approve it." label="Review notes (optional)" optional confirm="Mark reviewed"
        onClose={() => setAction(null)} run={async (text) => changed(await settlementApi.review(s.id, text || undefined), 'Marked reviewed')} />}
      {s && action?.kind === 'approve' && <ConfirmDialog title={`Approve ${employeeName}’s settlement of ${money(s.totals.net)}?`} confirm="Approve settlement"
        body={`Net ${Number(s.totals.net) < 0 ? 'owed by the employee' : 'payable'}: ${money(s.totals.net)}. Once approved it can’t be edited; a change needs a new version. Finance then records the payment.`}
        onClose={() => setAction(null)} run={async () => changed(await settlementApi.approve(s.id), 'Settlement approved')} />}
      {s && action?.kind === 'reject' && <TextDialog title="Reject this settlement?" description="It is kept, marked rejected, with your reason. HR prepares a new one." label="Reason" confirm="Reject" danger
        onClose={() => setAction(null)} run={async (text) => changed(await settlementApi.reject(s.id, text), 'Settlement rejected')} />}
      {s && action?.kind === 'revise' && <TextDialog title="Start a new version?" description="This approved version is kept, marked replaced. The new draft is worked out again from current data, keeping your adjustments." label="Why it needs changing" confirm="Start new version"
        onClose={() => setAction(null)} run={async (text) => changed(await settlementApi.revise(s.id, text), 'New version started')} />}
      {s && action?.kind === 'cancel' && <TextDialog title="Cancel this settlement?" description="It is kept, marked cancelled, with your reason." label="Reason" confirm="Cancel settlement" danger
        onClose={() => setAction(null)} run={async (text) => changed(await settlementApi.cancel(s.id, text), 'Settlement cancelled')} />}
      {s && action?.kind === 'pay' && <PayDialog settlement={s} employeeName={employeeName} today={today} onClose={() => setAction(null)} run={async (input) => changed(await settlementApi.pay(s.id, input), 'Payment recorded')} />}
      {action?.kind === 'policy' && <PolicyDialog onClose={() => setAction(null)} />}
    </section>
  );
};

const SettlementBody: React.FC<{ s: Settlement; busy: boolean; onStep: (task: () => Promise<ExitSettlement>, message: string) => Promise<void>; onAction: (a: Action) => void }> = ({ s, busy, onStep, onAction }) => {
  const { can } = useAuth();
  const canManage = can('offboarding.settlement.manage');
  const draft = s.status === 'DRAFT';
  const status = STATUS[s.status];
  const net = Number(s.totals.net);
  const who = [
    s.preparedBy && `Prepared by ${s.preparedBy}`,
    s.submittedBy && `submitted by ${s.submittedBy}`,
    s.reviewedBy && `reviewed by ${s.reviewedBy}${s.reviewNotes ? ` (“${s.reviewNotes}”)` : ''}`,
    s.approvedBy && `approved by ${s.approvedBy}`,
    s.paidBy && `paid by ${s.paidBy}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span>Version {s.version} · worked out {day(s.calculatedAt.slice(0, 10))}</span>
      </div>
      {who && <p className="text-xs text-slate-500">{who}</p>}
      {s.rejectionReason && <p className="text-sm text-red-700">Rejected by {s.rejectedBy}: {s.rejectionReason}</p>}

      {s.problems.length > 0 && (
        <ul className="space-y-1">
          {s.problems.map((p) => (
            <li key={p} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{p}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">Settlement earnings and recoveries</caption>
          {(['EARNING', 'RECOVERY'] as const).map((kind) => {
            const lines = s.lines.filter((l) => l.kind === kind);
            return (
              <tbody key={kind} className="border-b border-slate-100 dark:border-[#2B293E]">
                <tr><th scope="rowgroup" colSpan={draft && canManage ? 3 : 2} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{kind === 'EARNING' ? 'Earnings' : 'Recoveries'}</th></tr>
                {lines.length === 0 && <tr><td colSpan={3} className="py-1.5 text-xs text-slate-500">None</td></tr>}
                {lines.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-1.5 pr-3">
                      <span className={l.countsInTotal ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500'}>{l.label}</span>
                      {l.basis.rule && <span className="block text-xs text-slate-500">{l.basis.rule}{l.basis.eligible === false && l.basis.reason ? ` · ${String(l.basis.reason)}` : ''}</span>}
                      {l.isManual && <span className="block text-xs text-slate-500">Added: {l.adjustmentReason}</span>}
                      {!l.isManual && l.adjustmentReason && <span className="block text-xs text-amber-700 dark:text-amber-300">Changed from {money(l.calculatedAmount)}: {l.adjustmentReason}</span>}
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${l.countsInTotal ? '' : 'text-slate-500'}`}>{money(l.amount)}{!l.countsInTotal && <span className="block text-xs">not counted</span>}</td>
                    {draft && canManage && <td className="py-1 pl-2 text-right">{l.countsInTotal && <Button size="sm" variant="ghost" onClick={() => onAction({ kind: 'adjust', line: l })} aria-label={`Change ${l.label}`}>Change</Button>}</td>}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      <dl className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-white/5">
        <div><dt className="text-xs text-slate-500">Total earnings</dt><dd className="font-semibold tabular-nums">{money(s.totals.earnings)}</dd></div>
        <div><dt className="text-xs text-slate-500">Total recoveries</dt><dd className="font-semibold tabular-nums">{money(s.totals.recoveries)}</dd></div>
        <div><dt className="text-xs text-slate-500">{net < 0 ? 'Net owed by the employee' : 'Net payable'}</dt><dd className="text-base font-bold tabular-nums">{money(net < 0 ? s.totals.net.slice(1) : s.totals.net)}</dd></div>
      </dl>

      {s.payment && (
        <p className="text-sm text-slate-700 dark:text-slate-300">Paid on {day(s.payment.date)} by {PAYMENT_MODES[s.payment.mode as keyof typeof PAYMENT_MODES] ?? s.payment.mode}{s.payment.reference ? ` · ref ${s.payment.reference}` : ''}{s.payment.remarks ? ` · ${s.payment.remarks}` : ''}</p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-[#2B293E]">
        {draft && canManage && (<>
          <Button size="sm" onClick={() => onStep(() => settlementApi.submit(s.id), 'Sent for review')} disabled={busy || s.problems.length > 0} loading={busy}>Submit for review</Button>
          <Button size="sm" variant="outline" onClick={() => onStep(() => settlementApi.recalculate(s.id), 'Settlement recalculated')} disabled={busy}>Recalculate</Button>
          <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'add' })}>Add amount…</Button>
        </>)}
        {s.status === 'PENDING_REVIEW' && can('offboarding.settlement.review') && !s.reviewedAt && <Button size="sm" onClick={() => onAction({ kind: 'review' })}>Mark reviewed…</Button>}
        {s.status === 'PENDING_REVIEW' && can('offboarding.settlement.approve') && (<>
          <Button size="sm" onClick={() => onAction({ kind: 'approve' })} disabled={!s.reviewedAt} title={s.reviewedAt ? undefined : 'Finance must review it first'}>Approve…</Button>
          <Button size="sm" variant="ghost" onClick={() => onAction({ kind: 'reject' })}>Reject…</Button>
        </>)}
        {s.status === 'APPROVED' && can('offboarding.settlement.pay') && <Button size="sm" onClick={() => onAction({ kind: 'pay' })}>Record payment…</Button>}
        {s.status === 'APPROVED' && canManage && <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'revise' })}>Revise…</Button>}
        {(draft || s.status === 'PENDING_REVIEW') && canManage && <Button size="sm" variant="ghost" onClick={() => onAction({ kind: 'cancel' })}>Cancel…</Button>}
      </div>
    </div>
  );
};

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
  return { busy, run, alert: error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> };
}

const TextDialog: React.FC<{ title: string; description: string; label: string; confirm: string; optional?: boolean; danger?: boolean; onClose: () => void; run: (text: string) => Promise<void> }> = ({ title, description, label, confirm, optional, danger, onClose, run }) => {
  const id = useId();
  const [text, setText] = useState('');
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title={title} description={description} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Back</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => go(() => run(text.trim()))} loading={busy} disabled={busy || (!optional && text.trim().length < 3)}>{confirm}</Button></>}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <textarea id={id} className={fieldClass} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      {alert}
    </Dialog>
  );
};

const ConfirmDialog: React.FC<{ title: string; body: string; confirm: string; onClose: () => void; run: () => Promise<void> }> = ({ title, body, confirm, onClose, run }) => {
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title={title} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Not yet</Button><Button onClick={() => go(run)} loading={busy} disabled={busy}>{confirm}</Button></>}>
      <p className="text-sm text-slate-700 dark:text-slate-300">{body}</p>
      {alert}
    </Dialog>
  );
};

const AdjustDialog: React.FC<{ line: SettlementLine; onClose: () => void; run: (input: { amount: string; reason?: string }) => Promise<void> }> = ({ line, onClose, run }) => {
  const id = useId();
  const [amount, setAmount] = useState(line.amount);
  const [reason, setReason] = useState(line.adjustmentReason ?? '');
  const { busy, run: go, alert } = useRun();
  const needsReason = line.isManual || amount !== line.calculatedAmount;
  const valid = AMOUNT.test(amount) && (!needsReason || reason.trim().length >= 3);
  return (
    <Dialog title={`Change: ${line.label}`} description={line.calculatedAmount ? `Worked out as ${money(line.calculatedAmount)}. A different amount needs a reason, which stays on the settlement.` : undefined} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run({ amount, reason: reason.trim() || undefined }))} loading={busy} disabled={busy || !valid}>Save</Button></>}>
      <label htmlFor={`${id}-amount`} className={labelClass}>Amount (₹)</label>
      <input id={`${id}-amount`} className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.trim())} aria-invalid={!AMOUNT.test(amount)} />
      {!AMOUNT.test(amount) && <p className="mt-1 text-xs text-red-700">Enter rupees, with at most two decimal places.</p>}
      {needsReason && (<>
        <label htmlFor={`${id}-reason`} className={`${labelClass} mt-3`}>Reason</label>
        <input id={`${id}-reason`} className={fieldClass} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </>)}
      {alert}
    </Dialog>
  );
};

const AddLineDialog: React.FC<{ onClose: () => void; run: (input: { code: keyof typeof MANUAL_SETTLEMENT_CODES; label: string; amount: string; reason: string }) => Promise<void> }> = ({ onClose, run }) => {
  const id = useId();
  const [code, setCode] = useState<keyof typeof MANUAL_SETTLEMENT_CODES>('BONUS');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { busy, run: go, alert } = useRun();
  const valid = label.trim().length >= 2 && AMOUNT.test(amount) && reason.trim().length >= 3;
  return (
    <Dialog title="Add an amount" description="For payments or recoveries the rules don’t work out, such as a bonus or an unreturned asset." size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run({ code, label: label.trim(), amount, reason: reason.trim() }))} loading={busy} disabled={busy || !valid}>Add amount</Button></>}>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-code`} className={labelClass}>Kind</label>
          <select id={`${id}-code`} className={fieldClass} value={code} onChange={(e) => setCode(e.target.value as keyof typeof MANUAL_SETTLEMENT_CODES)}>
            {Object.entries(MANUAL_SETTLEMENT_CODES).map(([value, text]) => <option key={value} value={value}>{text}{value === 'OTHER_RECOVERY' ? ' (deducted)' : ''}</option>)}
          </select>
        </div>
        <div><label htmlFor={`${id}-label`} className={labelClass}>Description</label><input id={`${id}-label`} className={fieldClass} maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        <div><label htmlFor={`${id}-amount`} className={labelClass}>Amount (₹)</label><input id={`${id}-amount`} className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.trim())} /></div>
        <div><label htmlFor={`${id}-reason`} className={labelClass}>Reason</label><input id={`${id}-reason`} className={fieldClass} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /><p className={hintClass}>Kept on the settlement and in the audit log.</p></div>
      </div>
      {alert}
    </Dialog>
  );
};

const PayDialog: React.FC<{ settlement: Settlement; employeeName: string; today: string; onClose: () => void; run: (input: { paymentDate: string; mode: string; reference?: string; remarks?: string }) => Promise<void> }> = ({ settlement, employeeName, today, onClose, run }) => {
  const id = useId();
  const owes = Number(settlement.totals.net) < 0;
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<keyof typeof PAYMENT_MODES>(owes ? 'RECOVERED' : 'BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const { busy, run: go, alert } = useRun();
  return (
    <Dialog title={owes ? `Record the recovery of ${money(settlement.totals.net.slice(1))} from ${employeeName}` : `Record the payment of ${money(settlement.totals.net)} to ${employeeName}`}
      description="This settles their loans and advances and takes the encashed leave off their balance. It can’t be undone." size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => go(() => run({ paymentDate: date, mode, reference: reference.trim() || undefined, remarks: remarks.trim() || undefined }))} loading={busy} disabled={busy || !date}>Record payment</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${id}-date`} className={labelClass}>Paid on</label><input id={`${id}-date`} type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <label htmlFor={`${id}-mode`} className={labelClass}>How</label>
          <select id={`${id}-mode`} className={fieldClass} value={mode} onChange={(e) => setMode(e.target.value as keyof typeof PAYMENT_MODES)}>
            {Object.entries(PAYMENT_MODES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label htmlFor={`${id}-ref`} className={labelClass}>Reference <span className="font-normal text-slate-500">(UTR or cheque number)</span></label><input id={`${id}-ref`} className={fieldClass} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div className="sm:col-span-2"><label htmlFor={`${id}-remarks`} className={labelClass}>Remarks <span className="font-normal text-slate-500">(optional)</span></label><input id={`${id}-remarks`} className={fieldClass} maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </div>
      {alert}
    </Dialog>
  );
};

/** The workspace's settlement rules. Changing them affects settlements worked out from now on; existing ones keep the rules they used. */
const PolicyDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const id = useId();
  const [policy, setPolicy] = useState<SettlementPolicy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, run: go, alert } = useRun();
  useEffect(() => { settlementApi.policy().then(setPolicy).catch((e) => setLoadError(errorText(e))); }, []);
  const set = <K extends keyof SettlementPolicy>(key: K, value: Partial<SettlementPolicy[K]>) => setPolicy((p) => (p ? { ...p, [key]: { ...p[key], ...value } } : p));
  const num = (value: string) => Math.max(0, Math.round(Number(value) || 0));
  const valid = !!policy && (policy.gratuity.cap === null || policy.gratuity.cap === '' || AMOUNT.test(policy.gratuity.cap)) && policy.leaveEncashment.dayDivisor > 0 && policy.notice.dayDivisor > 0 && policy.gratuity.dayDivisor > 0;
  const basisSelect = (key: 'leaveEncashment' | 'notice', label: string) => policy && (
    <div>
      <label htmlFor={`${id}-${key}-basis`} className={labelClass}>{label}</label>
      <select id={`${id}-${key}-basis`} className={fieldClass} value={policy[key].basis} onChange={(e) => set(key, { basis: e.target.value as 'BASIC' | 'GROSS' })}>
        <option value="BASIC">Basic</option><option value="GROSS">Gross</option>
      </select>
    </div>
  );
  return (
    <Dialog title="Settlement rules" description="Used for settlements worked out from now on. Settlements already prepared keep the rules they used." size="lg" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => policy && go(async () => { await settlementApi.setPolicy({ ...policy, gratuity: { ...policy.gratuity, cap: policy.gratuity.cap || null } }); toast.success('Settlement rules saved'); onClose(); })} loading={busy} disabled={busy || !valid}>Save rules</Button></>}>
      {loadError && <p role="alert" className="text-sm text-red-700">The rules could not be loaded: {loadError}</p>}
      {!policy && !loadError && <p role="status" className="text-sm text-slate-500">Loading…</p>}
      {policy && (
        <div className="space-y-4">
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold">Leave encashment</legend>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={policy.leaveEncashment.enabled} onChange={(e) => set('leaveEncashment', { enabled: e.target.checked })} /> Encash leave that the leave policy marks as encashable</label>
            {basisSelect('leaveEncashment', 'Per day is worked out on')}
            <div><label htmlFor={`${id}-le-div`} className={labelClass}>Divided by (days)</label><input id={`${id}-le-div`} type="number" min={1} max={31} className={fieldClass} value={policy.leaveEncashment.dayDivisor} onChange={(e) => set('leaveEncashment', { dayDivisor: num(e.target.value) })} /></div>
          </fieldset>
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold">Notice shortfall</legend>
            {basisSelect('notice', 'Per day is worked out on')}
            <div><label htmlFor={`${id}-n-div`} className={labelClass}>Divided by (days)</label><input id={`${id}-n-div`} type="number" min={1} max={31} className={fieldClass} value={policy.notice.dayDivisor} onChange={(e) => set('notice', { dayDivisor: num(e.target.value) })} /></div>
          </fieldset>
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold">Gratuity</legend>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={policy.gratuity.enabled} onChange={(e) => set('gratuity', { enabled: e.target.checked })} /> Pay gratuity</label>
            <div><label htmlFor={`${id}-g-min`} className={labelClass}>Years of service needed</label><input id={`${id}-g-min`} type="number" min={0} max={40} className={fieldClass} value={policy.gratuity.minimumYears} onChange={(e) => set('gratuity', { minimumYears: num(e.target.value) })} /></div>
            <div><label htmlFor={`${id}-g-round`} className={labelClass}>Months that count as a year</label><input id={`${id}-g-round`} type="number" min={0} max={12} className={fieldClass} value={policy.gratuity.roundUpMonths} onChange={(e) => set('gratuity', { roundUpMonths: num(e.target.value) })} /></div>
            <div><label htmlFor={`${id}-g-days`} className={labelClass}>Days of wages per year</label><input id={`${id}-g-days`} type="number" min={1} max={31} className={fieldClass} value={policy.gratuity.daysPerYear} onChange={(e) => set('gratuity', { daysPerYear: num(e.target.value) })} /></div>
            <div><label htmlFor={`${id}-g-div`} className={labelClass}>Divided by (days)</label><input id={`${id}-g-div`} type="number" min={1} max={31} className={fieldClass} value={policy.gratuity.dayDivisor} onChange={(e) => set('gratuity', { dayDivisor: num(e.target.value) })} /></div>
            <div><label htmlFor={`${id}-g-codes`} className={labelClass}>On components</label><input id={`${id}-g-codes`} className={fieldClass} value={policy.gratuity.componentCodes.join(', ')} onChange={(e) => set('gratuity', { componentCodes: e.target.value.toUpperCase().split(/[,\s]+/).filter(Boolean) })} /><p className={hintClass}>Salary component codes, such as BASIC, DA.</p></div>
            <div><label htmlFor={`${id}-g-cap`} className={labelClass}>Limit (₹)</label><input id={`${id}-g-cap`} className={fieldClass} inputMode="decimal" value={policy.gratuity.cap ?? ''} onChange={(e) => set('gratuity', { cap: e.target.value.trim() || null })} /><p className={hintClass}>Leave empty for no limit.</p></div>
          </fieldset>
        </div>
      )}
      {alert}
    </Dialog>
  );
};
