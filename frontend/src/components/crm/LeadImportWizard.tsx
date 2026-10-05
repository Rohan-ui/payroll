import React, { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { apiFetch } from '../../api/client';
import { usePayroll } from '../../context/PayrollContext';
import {
  leadImportApi, MAX_IMPORT_ROWS,
  type ImportDestination, type ImportOptions, type ImportRequest, type ImportResult, type ImportRowResult,
} from '../../api/leadImport.api';
import {
  buildRows, dataRows, detectHeaderRow, duplicateTargets, missingRequired, readWorkbook, sheetScore, suggestMapping,
  TARGET_OPTIONS, targetLabel, type ColumnTarget, type Sheet,
} from '../../lib/leadImportSheet';

interface LeadImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** After leads were saved, so the screen behind can reload. */
  onImported: () => void;
}

type Step = 'upload' | 'destination' | 'mapping' | 'preview' | 'results';
const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'destination', label: 'Destination' },
  { key: 'mapping', label: 'Map columns' },
  { key: 'preview', label: 'Preview' },
  { key: 'results', label: 'Results' },
];

const fieldClass = 'w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-60';
/** The Client Outreach choice that is the 30-day SOP itself, where every outreach lead is. */
const SOP = 'SOP';
const plural = (n: number, word: string) => `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;
const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * Imports leads from a spreadsheet in five steps: upload and pick the sheet;
 * choose the destination (Client Outreach or a sales pipeline, never assumed);
 * map columns to lead fields; preview what the server will do; import and see
 * the result row by row.
 */
export function LeadImportWizard({ isOpen, onClose, onImported }: LeadImportWizardProps) {
  if (!isOpen) return null;
  return <Wizard onClose={onClose} onImported={onImported} />;
}

function Wizard({ onClose, onImported }: Omit<LeadImportWizardProps, 'isOpen'>) {
  const { setCrmTab } = usePayroll();
  const ids = { file: useId(), sheet: useId(), header: useId(), pipeline: useId(), stage: useId(), assignee: useId(), assigneeHint: useId() };
  const [step, setStep] = useState<Step>('upload');
  const [options, setOptions] = useState<ImportOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [destination, setDestination] = useState<ImportDestination | null>(null);
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  useEffect(() => {
    let live = true;
    leadImportApi.options()
      .then((data) => {
        if (!live) return;
        setOptions(data);
        setAssigneeId(data.currentMemberId);
      })
      .catch((error) => live && setOptionsError(message(error, 'Could not load your pipelines. Close this window and try again.')));
    return () => { live = false; };
  }, []);

  const sheet = sheets[sheetIndex];
  const headers = useMemo(() => sheet?.rows[headerIndex] ?? [], [sheet, headerIndex]);
  const rowCount = sheet ? dataRows(sheet, headerIndex) : 0;
  const pipelines = (options?.pipelines ?? []).filter((p) => p.kind === (destination === 'CLIENT_OUTREACH' ? 'OUTREACH' : 'SALES'));
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const intoSop = destination === 'CLIENT_OUTREACH' && pipelineId === SOP;
  const repeated = duplicateTargets(mapping);
  const missing = missingRequired(mapping);
  const columnsInUse = headers.map((_, i) => i).filter((i) => mapping[i] || sheet?.rows.slice(headerIndex + 1).some((row) => row[i]));

  const chooseSheet = (index: number, from: Sheet[] = sheets) => {
    const chosen = from[index];
    const header = detectHeaderRow(chosen.rows);
    setSheetIndex(index);
    chooseHeader(header, chosen);
  };
  const chooseHeader = (index: number, chosen: Sheet | undefined = sheet) => {
    if (!chosen) return;
    setHeaderIndex(index);
    setMapping(suggestMapping(chosen.rows[index] ?? [], chosen.rows.slice(index + 1)));
    setPreview(null);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setReadError('Choose an Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    setReading(true);
    try {
      const read = readWorkbook(await file.arrayBuffer()).filter((s) => s.rows.some((row) => row.some(Boolean)));
      if (read.length === 0) throw new Error('empty');
      setSheets(read);
      setFileName(file.name);
      const best = read.reduce((bestIndex, s, i) => (sheetScore(s) > sheetScore(read[bestIndex]) ? i : bestIndex), 0);
      chooseSheet(best, read);
    } catch {
      setSheets([]);
      setReadError('This file could not be read, or it has no rows. Check it opens in Excel and try again.');
    } finally {
      setReading(false);
    }
  };

  const chooseDestination = (value: ImportDestination) => {
    setDestination(value);
    const ofKind = (options?.pipelines ?? []).filter((p) => p.kind === (value === 'CLIENT_OUTREACH' ? 'OUTREACH' : 'SALES'));
    if (value === 'CLIENT_OUTREACH') {
      setPipelineId(SOP);
      setStageId('');
      setPreview(null);
      return;
    }
    const only = ofKind.length === 1 ? ofKind[0] : ofKind.find((p) => p.isDefault);
    setPipelineId(only?.id ?? '');
    setStageId(only?.stages[0]?.id ?? '');
    setPreview(null);
  };
  const choosePipeline = (id: string) => {
    setPipelineId(id);
    setStageId(options?.pipelines.find((p) => p.id === id)?.stages[0]?.id ?? '');
    setPreview(null);
  };

  const request = (): ImportRequest => ({
    destination: destination!,
    ...(intoSop ? {} : { pipelineId }),
    ...(destination === 'SALES_PIPELINE' ? { stageId } : {}),
    ...(assigneeId ? { assigneeMemberId: assigneeId } : {}),
    fileName,
    rows: buildRows(sheet!, headerIndex, mapping),
  });

  const runPreview = async () => {
    setStep('preview');
    setRequestError(null);
    setBusy('preview');
    try {
      setPreview(await leadImportApi.preview(request()));
    } catch (error) {
      setPreview(null);
      setRequestError(message(error, 'The rows could not be checked. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    setRequestError(null);
    setBusy('import');
    try {
      const done = await leadImportApi.run(request());
      setResult(done);
      setStep('results');
      if (done.summary.imported > 0) onImported();
    } catch (error) {
      setRequestError(message(error, 'The import did not complete. Nothing was confirmed as saved; check the leads list before trying again.'));
    } finally {
      setBusy(null);
    }
  };

  const go = (tab: 'cold-funnel' | 'pipeline' | 'leads') => {
    setCrmTab(tab);
    onClose();
  };

  const destinationReady = intoSop || (destination && pipeline && (destination === 'CLIENT_OUTREACH' || pipeline.stages.some((s) => s.id === stageId)));
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const footer = (() => {
    if (step === 'upload') {
      const tooMany = rowCount > MAX_IMPORT_ROWS;
      return (
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!sheet || rowCount === 0 || tooMany} onClick={() => setStep('destination')}>Next: destination</Button>
        </>
      );
    }
    if (step === 'destination') {
      return (
        <>
          <Button variant="outline" size="sm" onClick={() => setStep('upload')}>Back</Button>
          <Button size="sm" disabled={!destinationReady} onClick={() => setStep('mapping')}>Next: map columns</Button>
        </>
      );
    }
    if (step === 'mapping') {
      return (
        <>
          <Button variant="outline" size="sm" onClick={() => setStep('destination')}>Back</Button>
          <Button size="sm" disabled={missing.length > 0 || repeated.length > 0} onClick={runPreview}>Next: preview</Button>
        </>
      );
    }
    if (step === 'preview') {
      const ready = preview?.summary.ready ?? 0;
      return (
        <>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setStep('mapping')}>Back</Button>
          <Button size="sm" loading={busy === 'import'} disabled={!preview || ready === 0 || busy !== null} onClick={runImport}>
            {`Import ${plural(ready, 'lead')} into ${destination === 'CLIENT_OUTREACH' ? 'Client Outreach' : 'the Sales Pipeline'}`}
          </Button>
        </>
      );
    }
    const outreach = result?.destination === 'CLIENT_OUTREACH';
    return (
      <>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        {(result?.summary.imported ?? 0) > 0 && <Button variant="secondary" size="sm" onClick={() => go('leads')}>View imported leads</Button>}
        {(result?.summary.imported ?? 0) > 0 && (
          <Button size="sm" onClick={() => go(outreach ? 'cold-funnel' : 'pipeline')}>{outreach ? 'View Client Outreach' : 'View Sales Pipeline'}</Button>
        )}
      </>
    );
  })();

  return (
    <Dialog
      title="Import leads"
      description={fileName ? `${fileName}${sheet ? ` · ${sheet.name}` : ''}` : 'From an Excel or CSV file'}
      onClose={busy === 'import' ? () => undefined : onClose}
      size="xl"
      footer={footer}
    >
      <ol className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === stepIndex ? 'step' : undefined}
            className={i === stepIndex ? 'font-bold text-teal-700 dark:text-teal-300' : i < stepIndex ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {optionsError && <ErrorNote>{optionsError}</ErrorNote>}

      {step === 'upload' && (
        <div className="space-y-4">
          <label htmlFor={ids.file}
            className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 dark:border-[#2B293E] rounded-2xl text-center cursor-pointer hover:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500">
            <Upload className="w-6 h-6 text-teal-600" aria-hidden="true" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{reading ? 'Reading the file…' : fileName ? 'Choose a different file' : 'Choose a spreadsheet'}</span>
            <span className="text-xs text-slate-500">Excel (.xlsx, .xls) or CSV, up to {MAX_IMPORT_ROWS.toLocaleString('en-IN')} rows per import</span>
            <input id={ids.file} type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={reading} onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {readError && <ErrorNote>{readError}</ErrorNote>}

          {sheets.length > 0 && sheet && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={ids.sheet} className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Sheet</label>
                <select id={ids.sheet} className={fieldClass} value={sheetIndex} onChange={(e) => chooseSheet(Number(e.target.value))}>
                  {sheets.map((s, i) => <option key={s.name} value={i}>{s.name.trim() || `Sheet ${i + 1}`}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={ids.header} className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Header row</label>
                <select id={ids.header} className={fieldClass} value={headerIndex} onChange={(e) => chooseHeader(Number(e.target.value))}>
                  {sheet.rows.slice(0, 10).map((row, i) => row.some(Boolean) && (
                    <option key={i} value={i}>{`Row ${sheet.firstRowNumber + i}: ${row.filter(Boolean).slice(0, 3).join(', ').slice(0, 60)}`}</option>
                  ))}
                </select>
              </div>
              <p className="sm:col-span-2 text-xs text-slate-600 dark:text-slate-300" role="status">
                {rowCount > MAX_IMPORT_ROWS
                  ? <span className="text-red-700 dark:text-red-300">{`This sheet has ${plural(rowCount, 'row')}. Import at most ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} at a time: split the sheet and import each part.`}</span>
                  : `${plural(rowCount, 'row')} with data under the header row.`}
              </p>
            </div>
          )}

          <button type="button" disabled={downloadingTemplate}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded disabled:opacity-50"
            onClick={async () => {
              setDownloadingTemplate(true);
              try {
                const res = await apiFetch('/api/v1/crm/leads/import/template', { feedback: { error: false } });
                if (!res.ok) throw new Error();
                const url = URL.createObjectURL(await res.blob());
                const a = Object.assign(document.createElement('a'), { href: url, download: 'Voogyo_Leads_Import_Template.xlsx' });
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                setReadError('The template could not be downloaded. Try again.');
              } finally {
                setDownloadingTemplate(false);
              }
            }}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download the import template
          </button>
        </div>
      )}

      {step === 'destination' && (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Where should these leads go?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <DestinationChoice
                checked={destination === 'CLIENT_OUTREACH'}
                disabled={!options?.canImportToOutreach}
                onChange={() => chooseDestination('CLIENT_OUTREACH')}
                title="Client Outreach"
                text={options?.canImportToOutreach === false
                  ? 'Your role cannot add leads to Client Outreach. Ask an admin for the "Enroll leads in outreach" permission.'
                  : 'Leads are enrolled in the outreach cadence and stay out of the Sales Pipeline until you convert them.'}
              />
              <DestinationChoice
                checked={destination === 'SALES_PIPELINE'}
                onChange={() => chooseDestination('SALES_PIPELINE')}
                title="Sales Pipeline"
                text="Leads go straight onto a sales pipeline stage as opportunities. They are not enrolled in outreach."
              />
            </div>
          </fieldset>

          {destination && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={ids.pipeline} className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {destination === 'CLIENT_OUTREACH' ? 'Outreach pipeline' : 'Sales pipeline'}
                </label>
                <select id={ids.pipeline} className={fieldClass} value={pipelineId} disabled={destination === 'SALES_PIPELINE' && pipelines.length === 0} onChange={(e) => choosePipeline(e.target.value)}>
                  {destination === 'CLIENT_OUTREACH'
                    ? <option value={SOP}>{options?.cadence.name ?? '30-Day Multi-Touch SOP'}</option>
                    : <option value="">Choose a pipeline</option>}
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {destination === 'SALES_PIPELINE' && (
                <div>
                  <label htmlFor={ids.stage} className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">First stage</label>
                  <select id={ids.stage} className={fieldClass} value={stageId} disabled={!pipeline} onChange={(e) => { setStageId(e.target.value); setPreview(null); }}>
                    {!pipeline && <option value="">Choose a pipeline first</option>}
                    {pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {destination === 'CLIENT_OUTREACH' && options && (
                <p className="text-xs text-slate-600 dark:text-slate-300 self-end">
                  {`Leads join the same ${plural(options.cadence.steps, 'step')}, ${plural(options.cadence.days, 'day')} cadence as your other Client Outreach leads, starting on the day of import.`}
                </p>
              )}
              <div className="sm:col-span-2">
                <label htmlFor={ids.assignee} className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Assign leads to</label>
                <select id={ids.assignee} className={`${fieldClass} sm:max-w-sm`} value={assigneeId} aria-describedby={ids.assigneeHint}
                  onChange={(e) => { setAssigneeId(e.target.value); setPreview(null); }}>
                  {(options?.assignees ?? []).map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.eligible}>
                      {a.id === options?.currentMemberId ? `${a.name} (you)` : a.eligible ? a.name : `${a.name} (role can't view leads)`}
                    </option>
                  ))}
                </select>
                <p id={ids.assigneeHint} className="mt-1 text-xs text-slate-500">
                  {(options?.assignees ?? []).length === 0
                    ? 'The team list could not be loaded, so the leads will be assigned to you.'
                    : 'A row whose "Assigned to" column names another team member goes to that member instead. Members whose role can\'t view leads can\'t be chosen; give their role "View leads" in Roles first.'}
                </p>
              </div>
              {destination === 'SALES_PIPELINE' && pipelines.length === 0 && (
                <p className="sm:col-span-2 text-xs text-amber-800 dark:text-amber-300" role="status">
                  There is no active sales pipeline. Create one in CRM Masters → Pipelines, then import again.
                </p>
              )}
              {destination === 'SALES_PIPELINE' && pipeline && pipeline.stages.length === 0 && (
                <p className="sm:col-span-2 text-xs text-amber-800 dark:text-amber-300" role="status">This pipeline has no open stage. Add one in CRM Masters → Pipeline Stages.</p>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'mapping' && sheet && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Choose the lead field for each column. Columns with no matching field are kept in the lead&apos;s internal notes as &quot;Column: value&quot;;
            columns set to &quot;Don&apos;t import&quot; are not stored anywhere.
          </p>
          {missing.length > 0 && <ErrorNote>{`Map a column to: ${missing.join(', ')}. Every lead needs a company, an email and a phone; a contact name is optional.`}</ErrorNote>}
          <div className="overflow-x-auto border border-slate-200 dark:border-[#2B293E] rounded-xl">
            <table className="w-full text-xs">
              <caption className="sr-only">Spreadsheet columns and the lead field each one is imported as</caption>
              <thead className="bg-slate-50 dark:bg-[#1E1D2D] text-left text-slate-600 dark:text-slate-300">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Spreadsheet column</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Example</th>
                  <th scope="col" className="px-3 py-2 font-semibold w-72">Import as</th>
                </tr>
              </thead>
              <tbody>
                {columnsInUse.map((column) => {
                  const header = headers[column] || `Column ${column + 1}`;
                  const example = sheet.rows.slice(headerIndex + 1).find((row) => row[column])?.[column] ?? '';
                  const clash = repeated.includes(mapping[column]);
                  const errorId = `${ids.file}-clash-${column}`;
                  return (
                    <tr key={column} className="border-t border-slate-100 dark:border-[#2B293E] align-top">
                      <th scope="row" className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100 text-left break-words max-w-[12rem]">{header}</th>
                      <td className="px-3 py-2 text-slate-500 break-words max-w-[16rem]">{example.slice(0, 80) || '—'}</td>
                      <td className="px-3 py-2">
                        <select aria-label={`Import "${header}" as`} className={fieldClass} value={mapping[column]} aria-invalid={clash || undefined} aria-describedby={clash ? errorId : undefined}
                          onChange={(e) => { const next = [...mapping]; next[column] = e.target.value as ColumnTarget; setMapping(next); setPreview(null); }}>
                          <option value="">Don&apos;t import</option>
                          {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {clash && <p id={errorId} className="mt-1 text-red-700 dark:text-red-300">{`${targetLabel(mapping[column])} is chosen for more than one column. Pick it once.`}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4" aria-busy={busy !== null}>
          {busy === 'preview' && <p className="text-sm text-slate-600 dark:text-slate-300" role="status">Checking every row…</p>}
          {requestError && <ErrorNote>{requestError}</ErrorNote>}
          {preview && (
            <>
              <Summary items={[
                ['Rows in file', preview.summary.processed],
                ['Ready to import', preview.summary.ready],
                ['Duplicates (skipped)', preview.summary.duplicates],
                ['Problems (not imported)', preview.summary.failed],
                ['Ready, with warnings', preview.summary.withWarnings],
              ]} />
              <Placement result={preview} mapping={mapping} />
              <RowTable rows={preview.rows.filter((r) => r.outcome !== 'READY' || r.warnings.length > 0)} empty="Every row is ready to import, with nothing left out." />
            </>
          )}
        </div>
      )}

      {step === 'results' && result && (
        <div className="space-y-4">
          <div className="flex items-start gap-2" role="status">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" aria-hidden="true" />
            <p className="text-sm text-slate-800 dark:text-slate-100">
              {result.summary.imported === 0
                ? 'No leads were imported. The rows below say why.'
                : `Imported ${plural(result.summary.imported, 'lead')} of ${plural(result.summary.processed, 'row')} into ${result.destination === 'CLIENT_OUTREACH' ? `Client Outreach (${result.cadence?.name ?? result.pipeline.name})` : `${result.pipeline.name} › ${result.stage.name}`}, assigned to ${result.assignee.name} unless a row named another team member.`}
            </p>
          </div>
          <Summary items={[
            ['Processed', result.summary.processed],
            ['Imported', result.summary.imported],
            ['Duplicates skipped', result.summary.duplicates],
            ['Failed', result.summary.failed],
            ...(result.destination === 'CLIENT_OUTREACH' ? [['Enrolled in cadence', result.summary.enrolled] as [string, number]] : []),
          ]} />
          <RowTable rows={result.rows.filter((r) => r.outcome !== 'IMPORTED' || r.warnings.length > 0)} empty="Every row was imported in full." />
        </div>
      )}
    </Dialog>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 p-3 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-200">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function DestinationChoice({ checked, disabled, onChange, title, text }: { checked: boolean; disabled?: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className={`flex gap-3 p-3 rounded-xl border ${checked ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30' : 'border-slate-200 dark:border-[#2B293E]'} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} focus-within:ring-2 focus-within:ring-teal-500`}>
      <input type="radio" name="lead-import-destination" className="mt-1 accent-teal-600" checked={checked} disabled={disabled} onChange={onChange} />
      <span>
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5">{text}</span>
      </span>
    </label>
  );
}

function Summary({ items }: { items: [string, number][] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E]">
          <dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value.toLocaleString('en-IN')}</dd>
        </div>
      ))}
    </dl>
  );
}

function Placement({ result, mapping }: { result: ImportResult; mapping: ColumnTarget[] }) {
  const mapped = mapping.filter((t) => t && t !== 'notes').length;
  const notes = mapping.filter((t) => t === 'notes').length;
  const skipped = mapping.filter((t) => !t).length;
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-700 dark:text-slate-200">
      <p className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-slate-400" aria-hidden="true" />
        {result.destination === 'CLIENT_OUTREACH'
          ? `Destination: Client Outreach · ${result.cadence?.name ?? result.pipeline.name} · cadence ${plural(result.cadence?.steps ?? 0, 'step')} over ${plural(result.cadence?.days ?? 0, 'day')}`
          : `Destination: Sales Pipeline · ${result.pipeline.name} › ${result.stage.name}`}
      </p>
      <p>{`Assigned to: ${result.assignee.name}, unless a row names another team member.`}</p>
      <p>{`Columns: ${mapped} mapped to lead fields, ${notes} kept in internal notes, ${skipped} not imported.`}</p>
    </div>
  );
}

const OUTCOME: Record<ImportRowResult['outcome'], { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  READY: { label: 'Ready', variant: 'success' },
  IMPORTED: { label: 'Imported', variant: 'success' },
  DUPLICATE: { label: 'Duplicate', variant: 'neutral' },
  FAILED: { label: 'Not imported', variant: 'danger' },
};
const SHOWN_ROWS = 200;

function RowTable({ rows, empty }: { rows: ImportRowResult[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-slate-600 dark:text-slate-300">{empty}</p>;
  return (
    <div>
      <div className="overflow-x-auto max-h-80 border border-slate-200 dark:border-[#2B293E] rounded-xl">
        <table className="w-full text-xs">
          <caption className="sr-only">Rows that were not imported, or were imported with values left out</caption>
          <thead className="sticky top-0 bg-slate-50 dark:bg-[#1E1D2D] text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Row</th>
              <th scope="col" className="px-3 py-2 font-semibold">Company</th>
              <th scope="col" className="px-3 py-2 font-semibold">Email</th>
              <th scope="col" className="px-3 py-2 font-semibold">Outcome</th>
              <th scope="col" className="px-3 py-2 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, SHOWN_ROWS).map((r) => (
              <tr key={r.rowNumber} className="border-t border-slate-100 dark:border-[#2B293E] align-top">
                <td className="px-3 py-2 tabular-nums">{r.rowNumber}</td>
                <td className="px-3 py-2 break-words max-w-[12rem]">{r.companyName ?? '—'}</td>
                <td className="px-3 py-2 break-all max-w-[14rem]">{r.email ?? '—'}</td>
                <td className="px-3 py-2"><Badge size="sm" variant={OUTCOME[r.outcome].variant}>{OUTCOME[r.outcome].label}</Badge></td>
                <td className="px-3 py-2">
                  <ul className="space-y-0.5">
                    {r.reasons.map((text) => <li key={text}>{text}</li>)}
                    {r.warnings.map((text) => <li key={text} className="text-amber-800 dark:text-amber-300">{text}</li>)}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SHOWN_ROWS && <p className="mt-1 text-xs text-slate-500">{`Showing the first ${SHOWN_ROWS} of ${rows.length.toLocaleString('en-IN')} rows.`}</p>}
    </div>
  );
}
