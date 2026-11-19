import React, { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { offboardingApi, type MyChecklistItem } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, labelClass } from '../payroll/payroll-format';
import { ListState } from '../performance/performance-format';
import { TEAM } from './offboarding-format';

/** Open exit-checklist items the member's team owns, soonest due first: clear or waive them without HR's side of the exit. */
export const MyChecklistTab: React.FC = () => {
  const id = useId();
  const [items, setItems] = useState<MyChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [waiving, setWaiving] = useState<MyChecklistItem | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    offboardingApi.myChecklist().then(setItems).catch((e) => setError(errorText(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const clear = async (item: MyChecklistItem) => {
    setBusy(item.id);
    setActionError(null);
    try {
      setItems(await offboardingApi.updateMyItem(item.id, { status: 'CLEARED' }));
      toast.success(`Cleared: ${item.title}`);
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={cardClass} aria-labelledby={`${id}-heading`}>
      <div className="border-b border-slate-100 p-4 dark:border-[#2B293E]">
        <h2 id={`${id}-heading`} className="text-sm font-bold text-slate-900 dark:text-slate-100">My checklist</h2>
        <p className="text-xs text-slate-500">Exit-checklist items your team owns for people who are leaving, soonest due first.</p>
      </div>
      {actionError && <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
      <ListState loading={loading} error={error} empty={items.length === 0} what="Your checklist items" onRetry={load}
        emptyTitle="Nothing to clear" emptyText="When someone leaves, the items your team owns on their exit checklist appear here." />
      {items.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
          {items.map((item) => {
            const late = item.dueDate < today;
            return (
              <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span className="text-xs font-semibold text-slate-500">{TEAM[item.team]} · </span>{item.title}
                    {!item.isRequired && <span className="ml-1.5 text-xs font-normal text-slate-500">(optional)</span>}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{item.employee.name} <span className="text-xs text-slate-500">· {item.employee.code} · last day {day(item.lastWorkingDate)}</span></p>
                  {item.description && <p className="break-words text-xs text-slate-600 dark:text-slate-400">{item.description}</p>}
                  <p className={`text-xs ${late ? 'font-semibold text-red-700 dark:text-red-300' : 'text-slate-500'}`}>
                    {late ? 'Overdue · was due ' : 'Due '}{day(item.dueDate)}{item.isMine ? ' · given to you' : item.assignedTo ? ` · with ${item.assignedTo}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => clear(item)} loading={busy === item.id} disabled={!!busy} aria-label={`Clear: ${item.title} for ${item.employee.name}`}>Clear</Button>
                  <Button size="sm" variant="ghost" onClick={() => setWaiving(item)} disabled={!!busy} aria-label={`Waive: ${item.title} for ${item.employee.name}`}>Waive…</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {waiving && <WaiveDialog item={waiving} onClose={() => setWaiving(null)} onWaived={(next) => { setItems(next); setWaiving(null); toast.success('Item waived'); }} />}
    </section>
  );
};

const WaiveDialog: React.FC<{ item: MyChecklistItem; onClose: () => void; onWaived: (items: MyChecklistItem[]) => void }> = ({ item, onClose, onWaived }) => {
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onWaived(await offboardingApi.updateMyItem(item.id, { status: 'WAIVED', waiverReason: reason.trim() }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Waive “${item.title}” for ${item.employee.name}?`} description="It counts as done. Your reason and your name are kept with the exit." size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Back</Button><Button onClick={submit} loading={busy} disabled={busy || reason.trim().length < 3}>Waive item</Button></>}>
      <label htmlFor={id} className={labelClass}>Why it’s being waived</label>
      <textarea id={id} className={fieldClass} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};
