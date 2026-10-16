import React, { useCallback, useEffect, useId, useState } from 'react';
import { AlertTriangle, ArrowLeft, Lock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { ApiError } from '../../api/client';
import { performanceOptionsApi, workflowsApi, type Named, type TemplateProblem, type Workflow, type WorkflowVersion } from '../../api/performance.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';
import { orNull } from './performance-format';
import { WorkflowStagesForm } from './WorkflowStagesForm';
import { ResolvePreview } from './ResolvePreview';
import { EMPTY_WORKFLOW, workflowDraftOf, workflowFormOf, type WorkflowForm } from './workflow-form';

const problemsOf = (error: unknown): TemplateProblem[] =>
  error instanceof ApiError && Array.isArray(error.data?.errors) ? (error.data.errors as TemplateProblem[]) : [];

interface Settings { workflowCode: string; workflowName: string; description: string; appliesToAll: boolean; departmentIds: string[]; designationIds: string[] }

const settingsOf = (w: Workflow): Settings => ({
  workflowCode: w.workflowCode, workflowName: w.workflowName, description: w.description ?? '', appliesToAll: w.appliesToAll,
  departmentIds: w.scopes.departments.map((d) => d.id), designationIds: w.scopes.designations.map((d) => d.id),
});

/** Creating a review workflow, or editing its draft and reading its published versions. */
export const WorkflowEditor: React.FC<{ workflowId: string | null; onClose: (changed: boolean) => void }> = ({ workflowId, onClose }) => {
  const id = useId();
  const { can } = useAuth();
  const manage = can('performance.workflows.manage');
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [settings, setSettings] = useState<Settings>({ workflowCode: '', workflowName: '', description: '', appliesToAll: true, departmentIds: [], designationIds: [] });
  const [options, setOptions] = useState<{ departments: Named[]; designations: Named[] }>({ departments: [], designations: [] });
  const [roles, setRoles] = useState<Named[]>([]);
  const [selected, setSelected] = useState<string | 'new-draft' | null>(null);
  const [form, setForm] = useState<WorkflowForm>(EMPTY_WORKFLOW);
  const [saved, setSaved] = useState(JSON.stringify(EMPTY_WORKFLOW));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<TemplateProblem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changed, setChanged] = useState(false);

  const show = (w: Workflow) => {
    setWorkflow(w);
    setSettings(settingsOf(w));
    const version = w.versions.find((v) => v.status === 'DRAFT') ?? w.versions[0];
    setSelected(version?.id ?? null);
    const next = version ? workflowFormOf(version) : EMPTY_WORKFLOW;
    setForm(next);
    setSaved(JSON.stringify(next));
  };

  const load = useCallback(() => {
    setLoadError(null);
    performanceOptionsApi.options().then(setOptions).catch(() => undefined);
    performanceOptionsApi.roles().then(setRoles).catch(() => setRoles([]));
    if (workflowId) workflowsApi.get(workflowId).then(show).catch((e) => setLoadError(errorText(e)));
  }, [workflowId]);
  useEffect(load, [load]);

  const run = async (work: () => Promise<Workflow>, done: string) => {
    setBusy(true);
    setError(null);
    setRefusal([]);
    try {
      show(await work());
      setChanged(true);
      toast.success(done);
      return true;
    } catch (e) {
      setError(errorText(e));
      setRefusal(problemsOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const scopes = () => ({
    workflowName: settings.workflowName.trim(), description: orNull(settings.description), appliesToAll: settings.appliesToAll,
    scopes: settings.appliesToAll ? { departmentIds: [], designationIds: [] } : { departmentIds: settings.departmentIds, designationIds: settings.designationIds },
  });
  const version: WorkflowVersion | null = workflow?.versions.find((v) => v.id === selected) ?? null;
  const archived = workflow?.status === 'ARCHIVED';
  const editable = manage && !archived;
  const draft = workflow?.versions.find((v) => v.status === 'DRAFT') ?? null;
  const editingDraft = editable && (selected === 'new-draft' || version?.status === 'DRAFT');
  const dirty = editingDraft && JSON.stringify(form) !== saved;
  const nextNumber = draft?.number ?? (workflow?.versions[0]?.number ?? 0) + 1;

  const saveDraft = () => workflow && run(() => workflowsApi.saveDraft(workflow.id, workflowDraftOf(form)), 'Draft saved');
  const publish = async () => {
    if (!workflow) return;
    setConfirming(false);
    if (dirty && !(await run(() => workflowsApi.saveDraft(workflow.id, workflowDraftOf(form)), 'Draft saved'))) return;
    await run(() => workflowsApi.publish(workflow.id), 'New version published');
  };

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        The workflow could not be loaded: {loadError} <button type="button" className="font-semibold underline" onClick={load}>Try again</button>
      </div>
    );
  }
  if (workflowId && !workflow) return <div className="h-40 animate-pulse rounded-xl bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading workflow</span></div>;

  const toggle = (key: 'departmentIds' | 'designationIds', value: string) =>
    setSettings((s) => ({ ...s, [key]: s[key].includes(value) ? s[key].filter((v) => v !== value) : [...s[key], value] }));
  const settingsChanged = workflow && JSON.stringify(settings) !== JSON.stringify(settingsOf(workflow));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onClose(changed)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Review workflows</Button>
        <h2 className="min-w-0 truncate text-base font-bold text-slate-900 dark:text-slate-100">{workflow ? `${workflow.workflowCode} · ${workflow.workflowName}` : 'New review workflow'}</h2>
        {archived && <Badge size="sm" variant="neutral">Archived</Badge>}
      </div>

      {(error || refusal.length > 0) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">{error}</p>
          {refusal.length > 0 && <ul className="mt-1 list-disc pl-5">{refusal.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}
        </div>
      )}

      <section className={`${cardClass} space-y-4 p-4`} aria-labelledby={`${id}-settings`}>
        <h3 id={`${id}-settings`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Workflow</h3>
        <fieldset disabled={!!workflow && !editable} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={`${id}-code`} className={labelClass}>Code</label>
              <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={settings.workflowCode} disabled={!!workflow} required maxLength={64}
                onChange={(e) => setSettings((s) => ({ ...s, workflowCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))} />
            </div>
            <div>
              <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
              <input id={`${id}-name`} className={fieldClass} value={settings.workflowName} required maxLength={160} onChange={(e) => setSettings((s) => ({ ...s, workflowName: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
              <input id={`${id}-description`} className={fieldClass} value={settings.description} maxLength={1000} onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))} />
            </div>
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className={labelClass}>Who it is for</legend>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="radio" name={`${id}-applies`} checked={settings.appliesToAll} onChange={() => setSettings((s) => ({ ...s, appliesToAll: true }))} />Everyone</label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="radio" name={`${id}-applies`} checked={!settings.appliesToAll} onChange={() => setSettings((s) => ({ ...s, appliesToAll: false }))} />Chosen departments or designations</label>
          </fieldset>
          {!settings.appliesToAll && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(['departmentIds', 'designationIds'] as const).map((key) => (
                <fieldset key={key}>
                  <legend className={labelClass}>{key === 'departmentIds' ? 'Departments' : 'Designations'}</legend>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {(key === 'departmentIds' ? options.departments : options.designations).map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={settings[key].includes(o.id)} onChange={() => toggle(key, o.id)} className="rounded border-slate-300" />{o.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
          <p className={hintClass}>When an appraisal cycle is launched, each employee follows the workflow meant for their department or designation.</p>
        </fieldset>
        {!workflow && (
          <Button onClick={() => run(() => workflowsApi.create({ ...scopes(), workflowCode: settings.workflowCode.trim() }), 'Workflow created. Add its stages, then publish it.')}
            loading={busy} disabled={busy || !settings.workflowCode || !settings.workflowName.trim()}>Create workflow</Button>
        )}
        {workflow && editable && settingsChanged && <Button size="sm" variant="outline" onClick={() => run(() => workflowsApi.update(workflow.id, scopes()), 'Workflow saved')} loading={busy} disabled={busy}>Save who it is for</Button>}
      </section>

      {workflow && (
        <>
          <div role="group" aria-label="Versions" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#2B293E]">
            {selected === 'new-draft' && <button type="button" aria-pressed className="-mb-px border-b-2 border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300">New version {nextNumber} (not saved)</button>}
            {workflow.versions.map((v) => (
              <button key={v.id} type="button" aria-pressed={selected === v.id} disabled={dirty && selected !== v.id}
                onClick={() => { setSelected(v.id); const f = workflowFormOf(v); setForm(f); setSaved(JSON.stringify(f)); setRefusal([]); setError(null); }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${selected === v.id ? 'border-teal-600 text-teal-800 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                Version {v.number} {v.status === 'DRAFT' ? '(draft)' : '(published)'}
              </button>
            ))}
          </div>

          {version?.status === 'PUBLISHED' && selected !== 'new-draft' && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Published {version.publishedAt ? day(version.publishedAt.slice(0, 10)) : ''}{version.publishedBy ? ` by ${version.publishedBy}` : ''}. It can’t be changed.
              {version.changeNote && <span>“{version.changeNote}”</span>}
            </p>
          )}
          {editingDraft && !dirty && (version?.problems.length ?? 0) > 0 && (
            <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {version?.problems.length} thing{version?.problems.length === 1 ? '' : 's'} to fix before publishing, shown below where they are.
            </p>
          )}

          <WorkflowStagesForm form={form} onChange={setForm} readOnly={!editingDraft} roles={roles}
            problems={dirty || selected === 'new-draft' ? [] : refusal.length ? refusal : version?.problems ?? []} />

          {editable && (
            <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 py-3 dark:border-[#2B293E] dark:bg-[#181724]/95">
              {editingDraft ? (
                <>
                  <Button onClick={() => setConfirming(true)} disabled={busy}>Publish version {nextNumber}</Button>
                  <Button variant="outline" onClick={saveDraft} loading={busy} disabled={busy || !dirty}>{dirty ? 'Save draft' : 'Saved'}</Button>
                  {(selected === 'new-draft' || workflow.versions.some((v) => v.status === 'PUBLISHED')) && (
                    <Button variant="ghost" disabled={busy} onClick={() => (selected === 'new-draft' ? show(workflow) : run(() => workflowsApi.discardDraft(workflow.id), 'Draft discarded'))}>Discard draft</Button>
                  )}
                </>
              ) : !draft && version && (
                <Button variant="outline" onClick={() => { setSelected('new-draft'); setForm({ ...workflowFormOf(version), changeNote: '' }); setSaved(''); }}>Start version {nextNumber} from this one</Button>
              )}
              {!editingDraft && draft && <span className="text-sm text-slate-500">Version {draft.number} is being drafted; open it to edit.</span>}
            </div>
          )}

          {version && selected !== 'new-draft' && version.stages.length > 0 && <ResolvePreview key={version.id} workflowId={workflow.id} versionId={version.id} unsaved={!!dirty} />}
        </>
      )}

      {confirming && workflow && (
        <Dialog title={`Publish version ${nextNumber} of ${workflow.workflowName}?`} onClose={() => setConfirming(false)} size="sm"
          footer={<><Button variant="outline" onClick={() => setConfirming(false)}>Keep editing</Button><Button onClick={publish} loading={busy}>Publish version {nextNumber}</Button></>}>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            A published version can never be changed. Appraisal cycles launched from now on can follow it; appraisals already under way keep the version they started with.
          </p>
        </Dialog>
      )}
    </div>
  );
};
