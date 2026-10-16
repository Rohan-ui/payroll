import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { performanceOptionsApi, workflowsApi, type Resolution, type StageResolution } from '../../api/performance.api';
import { cardClass, errorText, fieldClass, labelClass, todayIso } from '../payroll/payroll-format';
import { SearchPicker, type PickerOption } from './SearchPicker';
import { RESOLUTION } from './workflow-form';

const STATUS: Record<StageResolution['status'], { label: string; variant: 'success' | 'warning' | 'info' | 'danger' }> = {
  RESOLVED: { label: 'Ready', variant: 'success' },
  NEEDS_ASSIGNMENT: { label: 'Needs assigning', variant: 'danger' },
  NEEDS_NOMINATION: { label: 'Needs nominations', variant: 'info' },
  NEEDS_CHOICE: { label: 'Choose who', variant: 'warning' },
};

/** Who would review an employee at each stage on a date, worked out by the server; nothing is stored. */
export const ResolvePreview: React.FC<{ workflowId: string; versionId: string; unsaved: boolean }> = ({ workflowId, versionId, unsaved }) => {
  const { can } = useAuth();
  const [employee, setEmployee] = useState<PickerOption | null>(null);
  const [onDate, setOnDate] = useState(todayIso());
  const [result, setResult] = useState<Resolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!can('people.view')) return null;

  const run = async () => {
    if (!employee) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await workflowsApi.resolve(workflowId, versionId, employee.id, onDate));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${cardClass} space-y-3 p-4`} aria-labelledby="resolve-heading">
      <div>
        <h3 id="resolve-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"><Users className="h-4 w-4" aria-hidden="true" />Who would review</h3>
        <p className="text-xs text-slate-500">Pick an employee and a date to see who each stage finds, and what still needs assigning.</p>
      </div>
      {unsaved && <p className="text-sm text-amber-800 dark:text-amber-300">Save the draft first: reviewers are found from what is saved.</p>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        {employee ? (
          <div>
            <p className={labelClass}>Employee</p>
            <p className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2B293E]">
              <span>{employee.name} <span className="font-mono text-xs text-slate-500">{employee.code}</span></span>
              <button type="button" className="text-xs font-semibold text-teal-700 underline" onClick={() => { setEmployee(null); setResult(null); }}>Change</button>
            </p>
          </div>
        ) : <SearchPicker label="Employee" noun="employees" find={performanceOptionsApi.employees} onPick={setEmployee} />}
        <div>
          <label htmlFor="resolve-date" className={labelClass}>On</label>
          <input id="resolve-date" type="date" className={fieldClass} value={onDate} onChange={(e) => setOnDate(e.target.value)} />
        </div>
        <Button onClick={run} loading={busy} disabled={busy || !employee || unsaved}>Find reviewers</Button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {result && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs text-slate-500">Reviewers are found {RESOLUTION[result.resolvedAt].label.toLowerCase()}; this shows who would be found on {result.onDate}.</p>
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
            {result.stages.map((s) => (
              <li key={s.stageKey} className="space-y-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Step {s.step}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{s.stageName}</span>
                  <Badge size="sm" variant={STATUS[s.status].variant}>{STATUS[s.status].label}</Badge>
                </div>
                {s.reviewers.length > 0 && (
                  <ul className="text-xs text-slate-700 dark:text-slate-300">
                    {s.reviewers.map((r) => <li key={r.tenantMemberId}>{r.name} <span className="text-slate-500">· {r.via}</span></li>)}
                  </ul>
                )}
                {s.leftOut.length > 0 && (
                  <ul className="text-xs text-amber-800 dark:text-amber-300">
                    {s.leftOut.map((l, i) => <li key={i}>{l.name === '—' ? `Not found: ${l.reason}` : `${l.name} left out: ${l.reason}`}</li>)}
                  </ul>
                )}
                <p className="text-xs text-slate-500">{s.message}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};
