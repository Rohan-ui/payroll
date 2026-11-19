import React, { useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { offboardingApi, type ChecklistDetailsInput, type ChecklistItemInput, type ChecklistOwner, type ClearanceTeam, type ExitChecklistItem } from '../../api/offboarding.api';
import { errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { TEAM } from './offboarding-format';

type Props = { lastWorkingDate: string; onClose: () => void } & (
  | { item?: undefined; onAdd: (input: ChecklistItemInput) => Promise<void>; onSave?: undefined }
  | { item: ExitChecklistItem; onSave: (input: ChecklistDetailsInput) => Promise<void>; onAdd?: undefined }
);

/** Adds an exit-checklist item, or changes one's description, due date, whether it's required and who has it. */
export const ChecklistItemDialog: React.FC<Props> = ({ item, lastWorkingDate, onClose, onAdd, onSave }) => {
  const id = useId();
  const [team, setTeam] = useState<ClearanceTeam>(item?.team ?? 'IT');
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [isRequired, setIsRequired] = useState(item?.isRequired ?? true);
  const [dueDate, setDueDate] = useState(item?.hasOwnDueDate ? item.dueDate : '');
  const [assignee, setAssignee] = useState(item?.assignedTo?.id ?? '');
  const [owners, setOwners] = useState<ChecklistOwner[] | null>(null);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only people who can clear this team's items can be given it.
  useEffect(() => {
    setOwners(null);
    setOwnersError(null);
    offboardingApi.checklistOwners(team).then(setOwners).catch((e) => setOwnersError(errorText(e)));
  }, [team]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (onAdd) {
        await onAdd({ team, title: title.trim(), description: description.trim() || undefined, isRequired, dueDate: dueDate || undefined, assignedMemberId: assignee || undefined });
      } else if (onSave) {
        await onSave({ description: description.trim(), isRequired, dueDate: dueDate || null, assignedMemberId: assignee || null });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={item ? `Edit: ${item.title}` : 'Add a checklist item'} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} disabled={busy || (!item && title.trim().length < 3)}>{item ? 'Save' : 'Add item'}</Button></>}>
      <div className="space-y-3">
        {!item && (
          <>
            <div>
              <label htmlFor={`${id}-team`} className={labelClass}>Team</label>
              <select id={`${id}-team`} className={fieldClass} value={team} onChange={(e) => { setTeam(e.target.value as ClearanceTeam); setAssignee(''); }}>
                {(Object.keys(TEAM) as ClearanceTeam[]).map((t) => <option key={t} value={t}>{TEAM[t]}</option>)}
              </select>
              <p className={hintClass}>Only this team (or HR with the override) can clear or waive it.</p>
            </div>
            <div>
              <label htmlFor={`${id}-title`} className={labelClass}>What needs doing</label>
              <input id={`${id}-title`} className={fieldClass} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label htmlFor={`${id}-description`} className={labelClass}>Details <span className="font-normal text-slate-500">(optional)</span></label>
          <textarea id={`${id}-description`} className={fieldClass} rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-due`} className={labelClass}>Due <span className="font-normal text-slate-500">(optional)</span></label>
          <input id={`${id}-due`} type="date" className={fieldClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <p className={hintClass}>Left empty, it’s due on the last working day ({lastWorkingDate}).</p>
        </div>
        <div>
          <label htmlFor={`${id}-assignee`} className={labelClass}>Who has it <span className="font-normal text-slate-500">(optional)</span></label>
          <select id={`${id}-assignee`} className={fieldClass} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!owners}>
            <option value="">Anyone in {TEAM[team]}</option>
            {owners?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {ownersError && <p role="alert" className="mt-1 text-xs text-red-700">{ownersError}</p>}
          {owners && owners.length === 0 && <p className={hintClass}>Nobody has {TEAM[team]}’s checklist permission yet; HR’s override covers it.</p>}
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          <span>Required<span className="block text-xs text-slate-500">The exit can’t be completed while a required item is open.</span></span>
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};
