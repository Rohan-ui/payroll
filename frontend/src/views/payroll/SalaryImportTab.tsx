import React, { useId, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { readSalaryFiles, type ImportBasis, type SalarySheetRow } from '../../lib/salaryImportSheet';
import { salaryImportApi, type ImportPreview, type ImportResult } from '../../api/payroll-setup.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, money, tdClass, thClass } from './payroll-format';

type Choice = { employeeId: string; include: boolean };

/**
 * Importing salaries from the earlier system's exports: read the sheets,
 * review every row's employee and each structure, then import. Imported
 * structures pay the whole salary as one earning until HR publishes a
 * version with the real component split.
 */
export const SalaryImportTab: React.FC = () => {
  const id = useId();
  const [reading, setReading] = useState(false);
  const [sheetRows, setSheetRows] = useState<SalarySheetRow[]>([]);
  const [sheetProblems, setSheetProblems] = useState<string[]>([]);
  const [bases, setBases] = useState<Record<string, ImportBasis>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const read = async (files: File[]) => {
    if (!files.length) return;
    setReading(true);
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      const sheet = await readSalaryFiles(files);
      if (!sheet.found.salaries) throw new Error('None of these files is the employee salary export: it needs the columns Name, Salary Structure, Start Date and Monthly Gross.');
      const names = [...new Set(sheet.rows.map((r) => r.structureName))];
      const nextBases = Object.fromEntries(names.map((n) => [n, sheet.bases[n] ?? 'MONTHLY'])) as Record<string, ImportBasis>;
      const problems = [...sheet.problems, ...names.filter((n) => !sheet.bases[n]).map((n) => `How “${n}” is paid isn’t in the files (add the structure export, or check it below): it is assumed monthly.`)];
      const p = await salaryImportApi.preview({ structures: names.map((n) => ({ sourceName: n, basis: nextBases[n] })), rows: sheet.rows });
      setSheetRows(sheet.rows);
      setSheetProblems(problems);
      setBases(nextBases);
      setPreview(p);
      setChoices(Object.fromEntries(p.rows.map((r) => [r.rowNumber, { employeeId: r.suggestedEmployeeId ?? '', include: !!r.suggestedEmployeeId && r.notes.length === 0 }])));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReading(false);
    }
  };

  const chosen = useMemo(() => (preview?.rows ?? []).filter((r) => choices[r.rowNumber]?.include && choices[r.rowNumber]?.employeeId), [preview, choices]);
  const toCreate = preview?.structures.filter((s) => !s.existing && chosen.some((r) => r.structureName === s.sourceName)) ?? [];

  const commit = async () => {
    if (!preview) return;
    setConfirming(false);
    setImporting(true);
    setError(null);
    try {
      const byRow = new Map(sheetRows.map((r) => [r.rowNumber, r]));
      const outcome = await salaryImportApi.commit({
        structures: preview.structures.map((s) => ({ sourceName: s.sourceName, basis: bases[s.sourceName] })),
        rows: chosen.map((r) => ({ ...(byRow.get(r.rowNumber) as SalarySheetRow), employeeId: choices[r.rowNumber].employeeId })),
      });
      setResult(outcome);
      toast.success(`${outcome.imported} salar${outcome.imported === 1 ? 'y' : 'ies'} imported${outcome.skipped ? `, ${outcome.skipped} skipped` : ''}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setImporting(false);
    }
  };

  const rows = (preview?.rows ?? []).filter((r) => !onlyAttention || r.notes.length > 0 || !choices[r.rowNumber]?.employeeId);
  const resultFor = (rowNumber: number) => result?.results.find((x) => x.rowNumber === rowNumber);

  return (
    <div className="space-y-4">
      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby={`${id}-title`}>
        <div>
          <h2 id={`${id}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Import salaries from the earlier system</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Choose the “Employee Salary Structure” export, and the “Salary Structure” export if you have it (it says which structures are paid by the hour).
            The export has each employee’s monthly gross but not its split into Basic, HRA and so on, so each imported structure pays the whole salary as one earning.
            Totals match the sheet; publish a new structure version with the real split whenever you’re ready.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-files`} className={labelClass}>Export files (.xls, .xlsx or .csv)</label>
          <input id={`${id}-files`} type="file" multiple accept=".xls,.xlsx,.csv" disabled={reading || importing}
            onChange={(e) => read([...(e.target.files ?? [])])}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800 dark:text-slate-300" />
          <p className={hintClass}>The file is read in your browser; only the rows are sent. Nothing is saved until you import.</p>
        </div>
        {reading && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Upload className="h-4 w-4 animate-pulse motion-reduce:animate-none" aria-hidden="true" />Reading the files…</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {sheetProblems.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{sheetProblems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        )}
      </section>

      {preview && (
        <>
          <section className={cardClass} aria-labelledby={`${id}-structures`}>
            <h3 id={`${id}-structures`} className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 dark:border-[#2B293E] dark:text-slate-100">Structures</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 dark:bg-white/5"><tr>
                  <th scope="col" className={thClass}>Structure in the sheet</th>
                  <th scope="col" className={thClass}>Paid</th>
                  <th scope="col" className={thClass}>What happens</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {preview.structures.map((s) => (
                    <tr key={s.sourceName}>
                      <td className={tdClass}>{s.sourceName}<span className="block font-mono text-xs text-slate-500">{s.code}</span></td>
                      <td className={tdClass}>
                        <label className="sr-only" htmlFor={`${id}-basis-${s.code}`}>How {s.sourceName} is paid</label>
                        <select id={`${id}-basis-${s.code}`} className={fieldClass} value={bases[s.sourceName]} disabled={!!s.existing || importing || !!result}
                          onChange={(e) => setBases((b) => ({ ...b, [s.sourceName]: e.target.value as ImportBasis }))}>
                          <option value="MONTHLY">By the month (amount = monthly salary)</option>
                          <option value="HOURLY">By the hour (amount = hourly rate)</option>
                        </select>
                      </td>
                      <td className={`${tdClass} text-xs text-slate-600 dark:text-slate-400`}>
                        {s.existing ? <>Uses the existing structure “{s.existing.name}”.</> : <>Created and published from {day(s.effectiveFrom)}, with one earning: {bases[s.sourceName] === 'HOURLY' ? 'Hourly pay = HOURLY_RATE × PAYABLE_HOURS' : 'Gross salary = MONTHLY_SALARY'}.</>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={cardClass} aria-labelledby={`${id}-rows`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#2B293E]">
              <div>
                <h3 id={`${id}-rows`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Salaries ({preview.rows.length} rows)</h3>
                <p className="text-xs text-slate-500">{chosen.length} will be imported. Check every employee match; rows without one are left out.{preview.lockedThrough ? ` Payroll is finalized up to ${day(preview.lockedThrough)}, so salaries starting before then are skipped for employees in that payroll.` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="rounded border-slate-300" />
                  Only rows needing attention
                </label>
                {!result && <Button onClick={() => setConfirming(true)} disabled={!chosen.length || importing} loading={importing}>Import {chosen.length} salar{chosen.length === 1 ? 'y' : 'ies'}</Button>}
              </div>
            </div>
            {result && (
              <p role="status" className="m-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {result.imported} imported{result.skipped ? `, ${result.skipped} skipped (reasons below)` : ''}. Each employee’s salary and history are on their profile.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 dark:bg-white/5"><tr>
                  <th scope="col" className={thClass}>Import</th>
                  <th scope="col" className={thClass}>Row</th>
                  <th scope="col" className={thClass}>Name in the sheet</th>
                  <th scope="col" className={thClass}>Employee</th>
                  <th scope="col" className={thClass}>Structure</th>
                  <th scope="col" className={thClass}>From</th>
                  <th scope="col" className={`${thClass} text-right`}>Amount</th>
                  <th scope="col" className={thClass}>Notes</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {rows.map((r) => {
                    const choice = choices[r.rowNumber] ?? { employeeId: '', include: false };
                    const set = (next: Partial<Choice>) => setChoices((c) => ({ ...c, [r.rowNumber]: { ...choice, ...next } }));
                    const outcome = resultFor(r.rowNumber);
                    const others = preview.employees.filter((e) => !r.candidates.some((c) => c.id === e.id));
                    return (
                      <tr key={r.rowNumber} className={!choice.employeeId ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                        <td className={tdClass}>
                          <input type="checkbox" aria-label={`Import row ${r.rowNumber}, ${r.employeeName}`} checked={choice.include} disabled={!choice.employeeId || importing || !!result} onChange={(e) => set({ include: e.target.checked })} className="rounded border-slate-300" />
                        </td>
                        <td className={`${tdClass} tabular-nums text-slate-500`}>{r.rowNumber}</td>
                        <td className={tdClass}>{r.employeeName}</td>
                        <td className={tdClass}>
                          <label className="sr-only" htmlFor={`${id}-emp-${r.rowNumber}`}>Employee for row {r.rowNumber}</label>
                          <select id={`${id}-emp-${r.rowNumber}`} className={`${fieldClass} min-w-[220px]`} value={choice.employeeId} disabled={importing || !!result}
                            onChange={(e) => set({ employeeId: e.target.value, include: !!e.target.value })}>
                            <option value="">Not matched: leave out</option>
                            {r.candidates.length > 0 && <optgroup label="Same name">{r.candidates.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code}{e.status !== 'ACTIVE' ? `, ${e.status.toLowerCase()}` : ''})</option>)}</optgroup>}
                            <optgroup label="Everyone else">{others.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code}{e.status !== 'ACTIVE' ? `, ${e.status.toLowerCase()}` : ''})</option>)}</optgroup>
                          </select>
                        </td>
                        <td className={`${tdClass} text-xs`}>{r.structureName}</td>
                        <td className={`${tdClass} whitespace-nowrap`}>{day(r.startDate)}</td>
                        <td className={`${tdClass} whitespace-nowrap text-right tabular-nums`}>{money(r.amount)}{bases[r.structureName] === 'HOURLY' ? ' /hour' : ' /month'}</td>
                        <td className={`${tdClass} text-xs`}>
                          {outcome ? (outcome.outcome === 'IMPORTED' ? <Badge size="sm" variant="success">Imported</Badge> : <><Badge size="sm" variant="warning">Skipped</Badge><span className="mt-1 block text-slate-600">{outcome.reason}</span></>)
                            : r.notes.map((n, i) => <span key={i} className="block text-amber-800 dark:text-amber-300">{n}</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && <p className="p-4 text-sm text-slate-500">No rows need attention.</p>}
            </div>
          </section>
        </>
      )}

      {confirming && preview && (
        <Dialog title={`Import ${chosen.length} salar${chosen.length === 1 ? 'y' : 'ies'}?`} onClose={() => setConfirming(false)} footer={(
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>Back to review</Button>
            <Button onClick={commit}>Import salaries</Button>
          </>
        )}>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>Each row becomes a salary from its start date; an employee’s later row becomes a revision of the earlier one. Salaries are history: to change one afterwards, record a revision.</p>
            {toCreate.length > 0 && <p>{toCreate.length} structure{toCreate.length === 1 ? ' is' : 's are'} created and published: {toCreate.map((s) => s.sourceName).join(', ')}.</p>}
            <p>Imported salaries use the payroll policy that covers each employee, are paid by bank transfer, and are not eligible for overtime until revised.</p>
          </div>
        </Dialog>
      )}
    </div>
  );
};
