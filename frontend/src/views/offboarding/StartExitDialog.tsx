import React, { useCallback, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { offboardingApi, type ExitDetail, type SeparationType } from '../../api/offboarding.api';
import { day, errorText, fieldClass, hintClass, labelClass, todayIso } from '../payroll/payroll-format';
import { SearchPicker, type PickerOption } from '../performance/SearchPicker';
import { EXIT_TYPE, addDays } from './offboarding-format';

/** HR starts an exit for an employee: a resignation handed in on paper, a termination, a retirement or a contract end. */
export const StartExitDialog: React.FC<{ onClose: () => void; onStarted: (exit: ExitDetail) => void }> = ({ onClose, onStarted }) => {
  const id = useId();
  const today = todayIso();
  const [employee, setEmployee] = useState<(PickerOption & { noticePeriodDays: number | null }) | null>(null);
  const [type, setType] = useState<SeparationType>('RESIGNATION');
  const [reason, setReason] = useState('');
  const [noticeDate, setNoticeDate] = useState(today);
  const [lastDay, setLastDay] = useState(addDays(today, 30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const found = useCallback(async (term: string) => {
    const rows = await offboardingApi.employees(term);
    return rows.map((e) => ({ id: e.id, code: e.code, name: e.name, noticePeriodDays: e.noticePeriodDays }));
  }, []);

  const pick = (option: PickerOption) => {
    const chosen = option as PickerOption & { noticePeriodDays: number | null };
    setEmployee(chosen);
    if (chosen.noticePeriodDays != null) setLastDay(addDays(noticeDate, chosen.noticePeriodDays));
  };

  const valid = !!employee && reason.trim().length >= 3 && !!noticeDate && !!lastDay && lastDay >= noticeDate && noticeDate <= today;

  const start = async () => {
    if (!employee) return;
    setBusy(true);
    setError(null);
    try {
      const exit = await offboardingApi.start({ employeeId: employee.id, type, reason: reason.trim(), noticeDate, lastWorkingDate: lastDay });
      toast.success(`Exit started for ${employee.name}`);
      onStarted(exit);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Start an exit" description="The exit is under way at once, with its checklist. Employees resign themselves from Offboarding." onClose={() => !busy && onClose()} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={start} loading={busy} disabled={!valid || busy}>Start exit</Button>
      </>}>
      <div className="space-y-4">
        {employee ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-[#2B293E]">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{employee.name} <span className="font-mono text-xs font-normal text-slate-500">{employee.code}</span></span>
            <button type="button" className="text-xs font-semibold text-teal-700 underline dark:text-teal-300" onClick={() => setEmployee(null)}>Change</button>
          </div>
        ) : (
          <SearchPicker label="Employee" noun="employees" find={found} onPick={pick} hint="Active employees without an exit in progress." />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-type`} className={labelClass}>Type of exit</label>
            <select id={`${id}-type`} className={fieldClass} value={type} onChange={(e) => setType(e.target.value as SeparationType)}>
              {(Object.keys(EXIT_TYPE) as SeparationType[]).map((t) => <option key={t} value={t}>{EXIT_TYPE[t]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-notice`} className={labelClass}>Notice given on</label>
            <input id={`${id}-notice`} type="date" className={fieldClass} max={today} value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-last`} className={labelClass}>Last working day</label>
            <input id={`${id}-last`} type="date" className={fieldClass} min={noticeDate} value={lastDay} onChange={(e) => setLastDay(e.target.value)} aria-describedby={`${id}-last-hint`} />
            <p id={`${id}-last-hint`} className={hintClass}>
              {employee?.noticePeriodDays != null ? `Notice period ${employee.noticePeriodDays} days, ending ${day(addDays(noticeDate, employee.noticePeriodDays))}.` : 'Becomes their exit date when the exit is completed.'}
            </p>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>Reason</label>
          <textarea id={`${id}-reason`} className={fieldClass} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className={hintClass}>Seen by HR. The employee sees the reason only for a resignation they submit themselves.</p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
    </Dialog>
  );
};
