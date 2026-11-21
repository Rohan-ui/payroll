import React, { useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { offboardingApi, type ExitReason } from '../../api/offboarding.api';
import { errorText, fieldClass, labelClass } from '../payroll/payroll-format';

type Row = { code?: string; label: string; active: boolean };

/** The reasons an exit interview offers. They can be renamed or switched off, never removed, so past interviews keep their meaning. */
export const ExitReasonsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const id = useId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState('');

  useEffect(() => { offboardingApi.exitReasons().then((r: ExitReason[]) => setRows(r)).catch((e) => setError(errorText(e))); }, []);
  const update = (index: number, change: Partial<Row>) => setRows((current) => current && current.map((r, i) => (i === index ? { ...r, ...change } : r)));

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    setError(null);
    try {
      await offboardingApi.saveExitReasons(rows.map((r) => ({ ...r, label: r.label.trim() })));
      toast.success('Exit reasons saved');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const valid = !!rows && rows.every((r) => r.label.trim().length >= 2) && rows.some((r) => r.active);

  return (
    <Dialog title="Exit reasons" description="What an exit interview can record as the reason for leaving. Switch off a reason you no longer use; interviews that used it keep it." size="md"
      onClose={() => !saving && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving} disabled={saving || !valid}>Save</Button></>}>
      {!rows && !error && <p role="status" className="text-sm text-slate-500">Loading…</p>}
      {rows && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {rows.map((r, index) => (
              <li key={r.code ?? `new-${index}`} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`${id}-${index}`}>Reason {index + 1}</label>
                <input id={`${id}-${index}`} className={`${fieldClass} ${r.active ? '' : 'text-slate-400'}`} maxLength={80} value={r.label} onChange={(e) => update(index, { label: e.target.value })} />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500" checked={r.active} onChange={(e) => update(index, { active: e.target.checked })} />
                  In use
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2 border-t border-slate-100 pt-3 dark:border-[#2B293E]">
            <div className="flex-1">
              <label htmlFor={`${id}-new`} className={labelClass}>Add a reason</label>
              <input id={`${id}-new`} className={fieldClass} maxLength={80} value={adding} onChange={(e) => setAdding(e.target.value)} />
            </div>
            <Button variant="outline" disabled={adding.trim().length < 2} onClick={() => { setRows([...rows, { label: adding.trim(), active: true }]); setAdding(''); }}>Add</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};
