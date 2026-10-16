import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { cyclesApi, type Cycle, type LaunchPreview, type PreviewRow } from '../../api/appraisals.api';
import { cardClass, errorText, fieldClass, tdClass, thClass } from '../payroll/payroll-format';

interface Pick { include: boolean; templateId: string; workflowId: string }

/** Whether a row can be started: not already in, no clash with another cycle, and a template and workflow to use. */
const blockedBy = (row: PreviewRow, pick: Pick) => {
  if (row.alreadyIn) return 'Already in this cycle';
  const overlap = row.problems.find((p) => p.kind === 'OVERLAP');
  if (overlap) return overlap.message;
  if (!pick.templateId || !pick.workflowId) return 'Choose a template and a workflow';
  return null;
};

/**
 * Who a launch would start, with the template, workflow and reviewers each
 * would get, before anything is created. People can be left out, and a
 * template or workflow chosen where none or several fit. The server works
 * everything out again when launching.
 */
export const LaunchPreviewView: React.FC<{ cycle: Cycle; onClose: (launched: boolean) => void }> = ({ cycle, onClose }) => {
  const id = useId();
  const adding = cycle.status === 'ACTIVE';
  const [preview, setPreview] = useState<LaunchPreview | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [error, setError] = useState<string | null>(null);
  const [showIn, setShowIn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[] | null>(null);

  const load = useCallback(() => {
    setError(null);
    cyclesApi.preview(cycle.id).then((p) => {
      setPreview(p);
      setPicks(Object.fromEntries(p.rows.map((r) => [r.employee.id, { include: !r.alreadyIn && !r.problems.some((x) => x.kind === 'OVERLAP'), templateId: r.template?.id ?? '', workflowId: r.workflow?.id ?? '' }])));
    }).catch((e) => setError(errorText(e)));
  }, [cycle.id]);
  useEffect(load, [load]);

  const starting = useMemo(() => (preview?.rows ?? []).filter((r) => picks[r.employee.id]?.include && !blockedBy(r, picks[r.employee.id])), [preview, picks]);

  if (error && !preview) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <span>The launch preview could not be worked out: {error}</span>
        <span className="flex gap-3"><button type="button" onClick={load} className="font-semibold underline">Try again</button><button type="button" onClick={() => onClose(false)} className="font-semibold underline">Back</button></span>
      </div>
    );
  }
  if (!preview) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Working out who would be appraised</span></div>;

  const pick = (employeeId: string, patch: Partial<Pick>) => setPicks((all) => ({ ...all, [employeeId]: { ...all[employeeId], ...patch } }));
  const rows = preview.rows.filter((r) => showIn || !r.alreadyIn);

  const launch = async () => {
    setBusy(true);
    setError(null);
    const notStarting = preview.rows.filter((r) => !r.alreadyIn && !starting.includes(r)).map((r) => r.employee.id);
    // A choice is sent wherever it differs from what was worked out, or nothing was.
    const choices = starting.filter((r) => {
      const p = picks[r.employee.id];
      return p.templateId !== (r.template?.id ?? '') || p.workflowId !== (r.workflow?.id ?? '') || r.problems.length > 0;
    }).map((r) => ({ employeeId: r.employee.id, templateId: picks[r.employee.id].templateId, workflowId: picks[r.employee.id].workflowId }));
    try {
      const result = await cyclesApi.launch(cycle.id, adding
        ? { confirm: true, excludeEmployeeIds: [], choices, onlyEmployeeIds: starting.map((r) => r.employee.id) }
        : { confirm: true, excludeEmployeeIds: notStarting, choices });
      toast.success(`${result.started} appraisal${result.started === 1 ? '' : 's'} started`);
      setConfirming(false);
      if (result.skipped.length) setSkipped(result.skipped);
      else onClose(true);
    } catch (e) {
      setError(errorText(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (skipped) {
    return (
      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-skipped`}>
        <h2 id={`${id}-skipped`} className="text-base font-bold text-slate-900 dark:text-slate-100">Started, with {skipped.length} left out</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">These people were not started. Fix what is listed, then add them to the cycle.</p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-[#2B293E] dark:border-[#2B293E]">
          {skipped.map((s, i) => <li key={i} className="px-3 py-2"><strong>{s.name}</strong>: {s.reason}</li>)}
        </ul>
        <Button onClick={() => onClose(true)}>Done</Button>
      </section>
    );
  }

  const s = preview.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onClose(false)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{cycle.cycleCode}</Button>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{adding ? 'Add people to the cycle' : 'Launch preview'}</h2>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Eligible', s.eligible], ['Ready', s.ready], ['Need a choice', s.needChoice], ['Already in', s.alreadyIn], ['Reviewers to sort out', s.needingReviewers],
        ].map(([label, value]) => (
          <div key={label} className={`${cardClass} p-3`}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</dd></div>
        ))}
      </dl>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Reviewers that still need nominating or assigning don’t stop a launch: their stage waits for them, and the cycle shows who needs reviewers.
      </p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <section className={cardClass} aria-labelledby={`${id}-people`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
          <h3 id={`${id}-people`} className="text-sm font-bold text-slate-900 dark:text-slate-100">People</h3>
          {s.alreadyIn > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input type="checkbox" className="rounded border-slate-300" checked={showIn} onChange={(e) => setShowIn(e.target.checked)} />Show the {s.alreadyIn} already in
            </label>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-semibold text-slate-800 dark:text-slate-200">{s.eligible ? 'Everyone eligible is already in this cycle' : 'Nobody is eligible'}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{s.eligible ? 'New joiners appear here once they fit the cycle’s rules.' : 'Check who the cycle is for, its joining cut-off, and that people have a department or designation for the period.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">Who would be appraised, and with what</caption>
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr>
                  <th scope="col" className={thClass}><span className="sr-only">Include</span></th>
                  <th scope="col" className={thClass}>Employee</th>
                  <th scope="col" className={thClass}>Template</th>
                  <th scope="col" className={thClass}>Workflow</th>
                  <th scope="col" className={thClass}>Reviewers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {rows.map((r) => {
                  const p = picks[r.employee.id];
                  const blocked = blockedBy(r, p);
                  const choice = r.problems.filter((x) => x.kind !== 'OVERLAP');
                  return (
                    <tr key={r.employee.id} className={r.alreadyIn ? 'opacity-60' : undefined}>
                      <td className={tdClass}>
                        <input type="checkbox" className="rounded border-slate-300" checked={p.include && !r.alreadyIn} disabled={r.alreadyIn || r.problems.some((x) => x.kind === 'OVERLAP')}
                          onChange={(e) => pick(r.employee.id, { include: e.target.checked })} aria-label={`Include ${r.employee.name}`} />
                      </td>
                      <td className={tdClass}>
                        <span className="block break-words font-semibold text-slate-900 dark:text-slate-100">{r.employee.name}</span>
                        <span className="block text-xs text-slate-500"><span className="font-mono">{r.employee.code}</span>{r.designation ? ` · ${r.designation}` : ''}{r.department ? ` · ${r.department}` : ''}</span>
                        {blocked && p.include && !r.alreadyIn && <span className="mt-1 block text-xs text-amber-800 dark:text-amber-300">{blocked}</span>}
                        {r.alreadyIn && <Badge size="sm" variant="neutral">Already in</Badge>}
                        {choice.map((x, i) => <span key={i} className="mt-1 block text-xs text-amber-800 dark:text-amber-300">{x.message}</span>)}
                      </td>
                      {(['templateId', 'workflowId'] as const).map((key) => {
                        const options = key === 'templateId' ? preview.templates : preview.workflows;
                        const reason = key === 'templateId' ? r.templateReason : r.workflowReason;
                        return (
                          <td key={key} className={tdClass}>
                            <label className="sr-only" htmlFor={`${id}-${r.employee.id}-${key}`}>{key === 'templateId' ? 'Template' : 'Workflow'} for {r.employee.name}</label>
                            <select id={`${id}-${r.employee.id}-${key}`} className={`${fieldClass} min-w-[11rem]`} value={p[key]} disabled={r.alreadyIn || !p.include} onChange={(e) => pick(r.employee.id, { [key]: e.target.value })}>
                              <option value="">Choose…</option>
                              {options.map((o) => <option key={o.id} value={o.id}>{o.code} v{o.versionNumber}</option>)}
                            </select>
                            {reason && <span className="mt-1 block text-xs text-slate-500">{reason}</span>}
                          </td>
                        );
                      })}
                      <td className={`${tdClass} text-xs`}>
                        {r.reviewers.length ? (
                          <ul className="space-y-1">
                            {r.reviewers.map((x) => (
                              <li key={x.stage} className={x.status === 'RESOLVED' ? 'text-slate-600 dark:text-slate-400' : 'text-amber-800 dark:text-amber-300'}>
                                <span className="font-semibold">{x.stage}:</span> {x.message}
                              </li>
                            ))}
                          </ul>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-sm text-slate-600 dark:text-slate-400" role="status">{starting.length} of {preview.rows.filter((r) => !r.alreadyIn).length} will start</span>
        <Button variant="outline" onClick={load} disabled={busy}>Work it out again</Button>
        <Button onClick={() => setConfirming(true)} disabled={!starting.length || busy}>{adding ? `Add ${starting.length}` : `Launch for ${starting.length}`}</Button>
      </div>

      {confirming && (
        <Dialog title={adding ? `Add ${starting.length} ${starting.length === 1 ? 'person' : 'people'} to ${cycle.cycleName}?` : `Launch ${cycle.cycleName} for ${starting.length} ${starting.length === 1 ? 'person' : 'people'}?`}
          onClose={() => setConfirming(false)} size="sm"
          footer={<><Button variant="outline" onClick={() => setConfirming(false)}>Not yet</Button><Button onClick={launch} loading={busy} disabled={busy}>{adding ? 'Add them' : 'Launch'}</Button></>}>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>Their appraisals start now: the first step opens and reviewers are asked. Each keeps the template and workflow versions it starts with.</p>
            {!adding && <p>Once launched, the cycle’s rules can’t change; people can still be added later. An appraisal started by mistake can be cancelled, not deleted.</p>}
          </div>
        </Dialog>
      )}
    </div>
  );
};
