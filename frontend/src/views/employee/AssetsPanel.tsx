import React, { useCallback, useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import {
  ASSET_CATEGORIES, ASSET_TEAM, assetsApi,
  type AssetCategory, type AssetList, type AssetReturnInput, type AssetStatus, type AssignAssetInput, type EmployeeAsset,
} from '../../api/assets.api';
import { day, errorText, fieldClass, hintClass, labelClass, money } from '../payroll/payroll-format';

type Variant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
const STATUS: Record<AssetStatus, { label: string; variant: Variant }> = {
  ISSUED: { label: 'With employee', variant: 'info' },
  RETURNED: { label: 'Returned', variant: 'success' },
  LOST: { label: 'Lost', variant: 'danger' },
  WAIVED: { label: 'Kept (waived)', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};
const TEAM_LABEL = { IT: 'IT', ADMIN: 'Admin' } as const;
/** Today in India time, as the server counts days. */
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** What happened to an asset, in one line. */
export const assetOutcome = (a: EmployeeAsset) => {
  if (a.status === 'ISSUED') return a.returnDueDate ? `Due back ${day(a.returnDueDate)}` : 'No return date';
  if (a.status === 'CANCELLED') return `Cancelled: ${a.remarks ?? ''}`;
  const parts = [`${a.status === 'LOST' ? 'Reported lost' : a.status === 'WAIVED' ? 'Waived' : `Returned ${a.condition === 'DAMAGED' ? 'damaged' : 'in good condition'}`} ${day(a.returnDate)}`];
  if (a.recoveryAmount) parts.push(`${money(a.recoveryAmount)} to recover`);
  if (a.returnRecordedBy) parts.push(`by ${a.returnRecordedBy}`);
  return parts.join(' · ');
};

/**
 * The company assets an employee has, and what happened to each. Where the
 * signed-in member's team looks after an asset, they give it out, record its
 * return, reopen a recorded return or cancel one entered by mistake.
 */
export const AssetsPanel: React.FC<{ employeeId: string; load: () => Promise<AssetList>; title?: string; description?: string; onChanged?: () => void }> = ({ employeeId, load, title = 'Company assets', description, onChanged }) => {
  const headingId = useId();
  const [list, setList] = useState<AssetList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'assign' } | { kind: 'return' | 'reopen' | 'cancel'; asset: EmployeeAsset } | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    load().then(setList).catch((e) => setError(errorText(e)));
  }, [load]);
  useEffect(refresh, [refresh]);

  const saved = (next: AssetList, message: string) => {
    setList(next);
    setDialog(null);
    toast.success(message);
    onChanged?.();
  };

  const canAssign = !!list && list.employeeActive && (list.canAssign.IT || list.canAssign.ADMIN);
  const out = list?.items.filter((a) => a.status === 'ISSUED').length ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-[#2B293E] dark:bg-[#181724]" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={headingId} className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}{list && <span className="font-normal text-slate-500"> · {out} with the employee</span>}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {canAssign && <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'assign' })}>Give an asset</Button>}
      </div>

      {error && (
        <p role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>The assets could not be loaded: {error}</span>
          <button type="button" onClick={refresh} className="font-semibold underline">Try again</button>
        </p>
      )}
      {!list && !error && <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading assets</span></div>}
      {list && list.items.length === 0 && <p className="mt-3 text-sm text-slate-500">No company assets recorded. Record laptops, phones, cards and keys when you hand them over, so they’re collected when the employee leaves.</p>}
      {list && list.items.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
          {list.items.map((a) => {
            const overdue = a.status === 'ISSUED' && !!a.returnDueDate && a.returnDueDate < todayIso();
            return (
              <li key={a.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="break-words text-sm text-slate-800 dark:text-slate-200">
                    <span className="text-xs font-semibold text-slate-500">{ASSET_CATEGORIES[a.category]} · </span>{a.name}
                    {a.tag && <span className="text-xs text-slate-500"> · {a.tag}</span>}
                  </p>
                  <p className="text-xs text-slate-500">Given {day(a.assignedDate)}{a.assignedBy ? ` by ${a.assignedBy}` : ''} · {TEAM_LABEL[a.team]} looks after it</p>
                  <p className={`text-xs ${overdue ? 'font-semibold text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-400'}`}>{overdue ? 'Overdue · ' : ''}{assetOutcome(a)}</p>
                  {a.remarks && a.status !== 'CANCELLED' && <p className="break-words text-xs text-slate-500">{a.remarks}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge size="sm" variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>
                  {a.canManage && a.status === 'ISSUED' && (<>
                    <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'return', asset: a })} aria-label={`Record return: ${a.name}`}>Record return</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'cancel', asset: a })} aria-label={`Cancel: ${a.name}`}>Cancel…</Button>
                  </>)}
                  {a.canManage && ['RETURNED', 'LOST', 'WAIVED'].includes(a.status) && (
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'reopen', asset: a })} aria-label={`Reopen: ${a.name}`}>Reopen…</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === 'assign' && list && (
        <AssignAssetDialog teams={list.canAssign} onClose={() => setDialog(null)} run={async (input) => saved(await assetsApi.assign(employeeId, input), 'Asset recorded')} />
      )}
      {dialog?.kind === 'return' && (
        <RecordReturnDialog asset={dialog.asset} onClose={() => setDialog(null)} run={async (input) => saved(await assetsApi.recordReturn(employeeId, dialog.asset.id, input), 'Return recorded')} />
      )}
      {dialog?.kind === 'reopen' && (
        <ReasonDialog title={`Reopen “${dialog.asset.name}”?`} description="It goes back to being with the employee, and any recovery is taken off the settlement." confirm="Reopen"
          onClose={() => setDialog(null)} run={async (reason) => saved(await assetsApi.reopen(employeeId, dialog.asset.id, reason), 'Asset reopened')} />
      )}
      {dialog?.kind === 'cancel' && (
        <ReasonDialog title={`Cancel “${dialog.asset.name}”?`} description="For an asset recorded by mistake. It stays in the history, marked cancelled, with your reason." confirm="Cancel asset" danger
          onClose={() => setDialog(null)} run={async (reason) => saved(await assetsApi.cancel(employeeId, dialog.asset.id, reason), 'Asset cancelled')} />
      )}
    </section>
  );
};

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (task: () => Promise<void>) => {
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
  return { busy, submit, alert };
}

const AssignAssetDialog: React.FC<{ teams: AssetList['canAssign']; onClose: () => void; run: (input: AssignAssetInput) => Promise<void> }> = ({ teams, onClose, run }) => {
  const id = useId();
  const categories = (Object.keys(ASSET_CATEGORIES) as AssetCategory[]).filter((c) => teams[ASSET_TEAM[c]]);
  const [category, setCategory] = useState<AssetCategory>(categories[0]);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [assignedDate, setAssignedDate] = useState(todayIso());
  const [returnDueDate, setReturnDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const { busy, submit, alert } = useSubmit();
  const valid = name.trim().length >= 2 && !!assignedDate && (!returnDueDate || returnDueDate >= assignedDate);
  return (
    <Dialog title="Give an asset" description="Only the categories your team looks after are listed." size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => submit(() => run({ category, name: name.trim(), tag: tag.trim() || undefined, assignedDate, returnDueDate: returnDueDate || undefined, remarks: remarks.trim() || undefined }))} loading={busy} disabled={busy || !valid}>Record asset</Button></>}>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-category`} className={labelClass}>Kind</label>
          <select id={`${id}-category`} className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
            {categories.map((c) => <option key={c} value={c}>{ASSET_CATEGORIES[c]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
          <input id={`${id}-name`} className={fieldClass} maxLength={160} placeholder="Dell Latitude 5440" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-tag`} className={labelClass}>Serial number or asset tag <span className="font-normal text-slate-500">(optional)</span></label>
          <input id={`${id}-tag`} className={fieldClass} maxLength={80} value={tag} onChange={(e) => setTag(e.target.value)} />
          <p className={hintClass}>One tag can be with only one person at a time.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-given`} className={labelClass}>Handed over</label>
            <input id={`${id}-given`} type="date" className={fieldClass} max={todayIso()} value={assignedDate} onChange={(e) => setAssignedDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-due`} className={labelClass}>Due back <span className="font-normal text-slate-500">(optional)</span></label>
            <input id={`${id}-due`} type="date" className={fieldClass} min={assignedDate} value={returnDueDate} onChange={(e) => setReturnDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-remarks`} className={labelClass}>Remarks <span className="font-normal text-slate-500">(optional)</span></label>
          <input id={`${id}-remarks`} className={fieldClass} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>
      {alert}
    </Dialog>
  );
};

export const RecordReturnDialog: React.FC<{ asset: EmployeeAsset; owner?: string; onClose: () => void; run: (input: AssetReturnInput) => Promise<void> }> = ({ asset, owner, onClose, run }) => {
  const id = useId();
  const [outcome, setOutcome] = useState<'GOOD' | 'DAMAGED' | 'LOST' | 'WAIVED'>('GOOD');
  const [returnDate, setReturnDate] = useState(todayIso());
  const [recovery, setRecovery] = useState('');
  const [remarks, setRemarks] = useState('');
  const { busy, submit, alert } = useSubmit();
  const charges = outcome === 'DAMAGED' || outcome === 'LOST';
  const amountOk = !recovery || /^\d{1,12}(\.\d{1,2})?$/.test(recovery);
  const valid = !!returnDate && amountOk && (outcome !== 'WAIVED' || remarks.trim().length >= 3);
  const input = (): AssetReturnInput => ({
    status: outcome === 'LOST' ? 'LOST' : outcome === 'WAIVED' ? 'WAIVED' : 'RETURNED',
    condition: outcome === 'GOOD' || outcome === 'DAMAGED' ? outcome : undefined,
    returnDate, recoveryAmount: charges && recovery && Number(recovery) > 0 ? recovery : undefined, remarks: remarks.trim() || undefined,
  });
  return (
    <Dialog title={`Record the return of “${asset.name}”`} description={owner ? `From ${owner}.` : undefined} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => submit(() => run(input()))} loading={busy} disabled={busy || !valid}>Record</Button></>}>
      <fieldset className="space-y-2">
        <legend className={labelClass}>What happened</legend>
        {([
          ['GOOD', 'Returned in good condition'],
          ['DAMAGED', 'Returned damaged'],
          ['LOST', 'Lost'],
          ['WAIVED', 'Employee keeps it (waived)'],
        ] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
            <input type="radio" name={`${id}-outcome`} className="h-4 w-4 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500" checked={outcome === value} onChange={() => setOutcome(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor={`${id}-date`} className={labelClass}>{outcome === 'LOST' ? 'Reported lost on' : outcome === 'WAIVED' ? 'Decided on' : 'Returned on'}</label>
          <input id={`${id}-date`} type="date" className={fieldClass} min={asset.assignedDate} max={todayIso()} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        </div>
        {charges && (
          <div>
            <label htmlFor={`${id}-recovery`} className={labelClass}>Recover from the employee (₹) <span className="font-normal text-slate-500">(optional)</span></label>
            <input id={`${id}-recovery`} inputMode="decimal" className={fieldClass} value={recovery} onChange={(e) => setRecovery(e.target.value.trim())} aria-invalid={!amountOk} />
            <p className={amountOk ? hintClass : 'mt-1 text-xs text-red-700'}>{amountOk ? 'Deducted in the final settlement.' : 'Give an amount in rupees, up to two decimals.'}</p>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-remarks`} className={labelClass}>{outcome === 'WAIVED' ? 'Why they keep it' : 'Remarks'} {outcome !== 'WAIVED' && <span className="font-normal text-slate-500">(optional)</span>}</label>
          <input id={`${id}-remarks`} className={fieldClass} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>
      {alert}
    </Dialog>
  );
};

const ReasonDialog: React.FC<{ title: string; description: string; confirm: string; danger?: boolean; onClose: () => void; run: (reason: string) => Promise<void> }> = ({ title, description, confirm, danger, onClose, run }) => {
  const id = useId();
  const [reason, setReason] = useState('');
  const { busy, submit, alert } = useSubmit();
  return (
    <Dialog title={title} description={description} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Back</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => submit(() => run(reason.trim()))} loading={busy} disabled={busy || reason.trim().length < 3}>{confirm}</Button></>}>
      <label htmlFor={id} className={labelClass}>Reason</label>
      <textarea id={id} className={fieldClass} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      {alert}
    </Dialog>
  );
};
