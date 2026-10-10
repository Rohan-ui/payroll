import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Send, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../lib/toast';
import { sequencesApi, type SequenceDetail, type SequenceInput, type SequenceOptions, type SequenceOverview, type SequenceStep } from '../../../api/sequences.api';
import { SequenceRules } from './SequenceRules';
import { SequenceLeads } from './SequenceLeads';
import { SequenceReport } from './SequenceReport';
import {
  cardClass, dangerButton, delayText, errorText, fieldClass, fromClock, labelClass, primaryButton, secondaryButton, SEQUENCE_STATUS, smallButton, toClock, WEEKDAYS,
} from './drip-format';

type Tab = 'emails' | 'settings' | 'rules' | 'leads' | 'report';
const TABS: { id: Tab; label: string; saved?: boolean }[] = [
  { id: 'emails', label: 'Emails' },
  { id: 'settings', label: 'Sender & schedule' },
  { id: 'rules', label: 'Enrollment rules', saved: true },
  { id: 'leads', label: 'Leads', saved: true },
  { id: 'report', label: 'Report', saved: true },
];

const NEW_STEP = (first: boolean): SequenceStep => ({ stepName: first ? 'Introduction' : 'Follow-up', delayAmount: first ? 0 : 2, delayUnit: 'WORKING_DAYS', templateId: null, subject: '', body: '', enabled: true });
const EMPTY: SequenceInput = {
  name: '', description: '', senderMode: 'ORGANIZATION', weekdays: [1, 2, 3, 4, 5], windowStart: 600, windowEnd: 1020, skipHolidays: true, dailyLimit: 50, stopStageIds: [], steps: [NEW_STEP(true)],
};
const toInput = (d: SequenceDetail): SequenceInput => ({
  name: d.name, description: d.description ?? '', senderMode: d.senderMode, weekdays: d.weekdays, windowStart: d.windowStart, windowEnd: d.windowEnd,
  skipHolidays: d.skipHolidays, dailyLimit: d.dailyLimit, stopStageIds: d.stopStageIds, steps: d.steps,
});
/** What is sent to the server: steps without their display-only fields. */
const payload = (f: SequenceInput): SequenceInput => ({
  ...f,
  description: f.description?.trim() || undefined,
  steps: f.steps.map(({ id, stepName, delayAmount, delayUnit, templateId, subject, body, enabled }) => ({ ...(id ? { id } : {}), stepName, delayAmount, delayUnit, templateId, subject, body, enabled })),
});

/**
 * One sequence: its emails, sender and schedule (saved together), and, once
 * saved, its enrollment rules, leads and report. Activating shows what the
 * sequence will do, from its actual settings, and refuses while anything
 * needed to send is missing.
 */
export const SequenceEditor: React.FC<{ sequenceId: string | null; overview: SequenceOverview | null; onBack: () => void; onOpen: (id: string) => void }> = ({ sequenceId, overview, onBack, onOpen }) => {
  const ids = useId();
  const { can } = useAuth();
  const canManage = can('sequences.manage');
  const [detail, setDetail] = useState<SequenceDetail | null>(null);
  const [form, setForm] = useState<SequenceInput>(EMPTY);
  const [saved, setSaved] = useState<string>(JSON.stringify(EMPTY));
  const [options, setOptions] = useState<SequenceOptions | null>(null);
  const [tab, setTab] = useState<Tab>('emails');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'activate' | 'archive' | null>(null);
  const [preview, setPreview] = useState<{ index: number; subject: string; body: string; missing: string[]; unknown: string[] } | null>(null);

  const apply = (d: SequenceDetail) => {
    setDetail(d);
    const input = toInput(d);
    setForm(input);
    setSaved(JSON.stringify(input));
  };
  const load = useCallback(() => {
    if (!sequenceId) return;
    setError(null);
    sequencesApi.get(sequenceId).then(apply).catch((e) => setError(errorText(e)));
  }, [sequenceId]);
  useEffect(load, [load]);
  useEffect(() => { sequencesApi.options().then(setOptions).catch(() => setOptions({ pipelines: [], sources: [], templates: [] })); }, []);

  const dirty = JSON.stringify(form) !== saved;
  const archived = detail?.status === 'ARCHIVED';
  const editable = canManage && !archived;
  const set = (patch: Partial<SequenceInput>) => setForm((f) => ({ ...f, ...patch }));
  const setStep = (index: number, patch: Partial<SequenceStep>) => setForm((f) => ({ ...f, steps: f.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  const moveStep = (index: number, by: number) => setForm((f) => {
    const steps = [...f.steps];
    const [step] = steps.splice(index, 1);
    steps.splice(index + by, 0, step);
    return { ...f, steps };
  });

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(async () => {
    if (!form.name.trim()) throw new Error('Enter a name for the sequence.');
    if (form.windowEnd <= form.windowStart) throw new Error('The sending window must end after it starts.');
    if (detail) {
      apply(await sequencesApi.update(detail.id, payload(form)));
      toast.success('Sequence saved');
    } else {
      const created = await sequencesApi.create(payload(form));
      toast.success('Sequence saved as a draft. It sends nothing until you activate it.');
      onOpen(created.id);
    }
  });
  const transition = (action: 'activate' | 'pause' | 'archive') => run(async () => {
    if (!detail) return;
    const next = action === 'activate' ? await sequencesApi.activate(detail.id) : action === 'pause' ? await sequencesApi.pause(detail.id) : await sequencesApi.archive(detail.id);
    apply(next);
    setConfirm(null);
    toast.success(action === 'activate' ? 'Sequence active: due emails go out within a minute or two' : action === 'pause' ? 'Sequence paused: nothing is sent until you resume it' : 'Sequence archived');
  });
  const showPreview = (index: number) => run(async () => {
    const step = form.steps[index];
    const result = await sequencesApi.preview(step.subject, step.body);
    setPreview({ index, ...result });
  });
  const testEmail = (step: SequenceStep) => run(async () => {
    if (!detail || !step.id) return;
    const result = await sequencesApi.testEmail(detail.id, step.id);
    toast.success(`Test email sent to ${result.sentTo} from ${result.from}`);
  });

  if (sequenceId && !detail && !error) {
    return <div className={`${cardClass} h-40 animate-pulse motion-reduce:animate-none`} aria-busy="true"><span className="sr-only" role="status">Loading sequence</span></div>;
  }

  const readiness = detail?.readiness ?? overview?.readiness;
  const status = detail ? SEQUENCE_STATUS[detail.status] : null;
  const stagesForStops = (options?.pipelines ?? []).flatMap((p) => p.stages.filter((s) => !s.isWon && !s.isLost).map((s) => ({ ...s, pipeline: p.name })));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => { if (!dirty || window.confirm('Leave without saving your changes?')) onBack(); }} aria-label="Back to sequences" className={secondaryButton}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
              <span className="break-words">{detail?.name || form.name || 'New sequence'}</span>
              {status && <Badge variant={status.variant} size="sm">{status.label}</Badge>}
            </h2>
            <p className="text-xs text-slate-500">{dirty ? 'Unsaved changes' : detail ? 'All changes saved' : 'Not saved yet: a draft never sends.'}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!archived && <button type="button" disabled={busy || (!dirty && Boolean(detail))} onClick={save} className={secondaryButton}>{busy ? 'Saving…' : detail ? 'Save changes' : 'Save draft'}</button>}
            {detail && (detail.status === 'DRAFT' || detail.status === 'PAUSED') && (
              <button type="button" disabled={busy || dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => setConfirm('activate')} className={primaryButton}>{detail.status === 'PAUSED' ? 'Resume' : 'Activate'}</button>
            )}
            {detail?.status === 'ACTIVE' && <button type="button" disabled={busy} onClick={() => transition('pause')} className={secondaryButton}>Pause</button>}
            {detail && !archived && <button type="button" disabled={busy} onClick={() => setConfirm('archive')} className={dangerButton}>Archive</button>}
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {detail && detail.activationProblems.length > 0 && detail.status !== 'ARCHIVED' && (
        <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">{detail.status === 'ACTIVE' ? 'This sequence can’t send everything right now:' : 'Before this sequence can be activated:'}</p>
          <ul className="mt-1 list-disc pl-5">{detail.activationProblems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {detail?.summary && <p className={`${cardClass} p-3 text-sm text-slate-700 dark:text-slate-300`}>{detail.summary}</p>}

      <div role="tablist" aria-label="Sequence" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-[#2B293E]">
        {TABS.filter((t) => !t.saved || detail).map((t) => (
          <button key={t.id} type="button" role="tab" id={`${ids}-tab-${t.id}`} aria-controls={`${ids}-panel-${t.id}`} aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${tab === t.id ? 'border-teal-500 text-teal-700 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'emails' && (
        <section role="tabpanel" id={`${ids}-panel-emails`} aria-labelledby={`${ids}-tab-emails`} className="space-y-3">
          {detail?.status === 'ACTIVE' && <p className="text-xs text-slate-500">Changes apply to emails not sent yet: each email uses its text at the moment it is sent. Emails already sent stay as they were.</p>}
          {overview && (
            <details className={`${cardClass} p-3 text-xs text-slate-600 dark:text-slate-300`}>
              <summary className="cursor-pointer font-semibold">Placeholders you can use</summary>
              <p className="mt-2">Write them as shown. Add a fallback after a bar for leads without the value, such as <code className="font-mono">{'{{First Name|there}}'}</code>. An email whose placeholder has no value and no fallback isn’t sent; it waits for you to fill in the lead.</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">{overview.placeholders.map((p) => <li key={p.key}><code className="font-mono text-teal-700 dark:text-teal-300">{`{{${p.key}}}`}</code> {p.description}</li>)}</ul>
            </details>
          )}
          <ol className="space-y-3">
            {form.steps.map((step, index) => {
              const fid = `${ids}-step-${index}`;
              const template = options?.templates.find((t) => t.id === step.templateId);
              return (
                <li key={step.id ?? `new-${index}`} className={`${cardClass} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Email {index + 1}{step.enabled ? '' : ' (switched off)'}</h3>
                      <p className="text-xs text-slate-500">{delayText(step.delayAmount, step.delayUnit, index === 0)}</p>
                    </div>
                    {editable && (
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label={`Move email ${index + 1} up`} className={smallButton}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        <button type="button" onClick={() => moveStep(index, 1)} disabled={index === form.steps.length - 1} aria-label={`Move email ${index + 1} down`} className={smallButton}><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        <button type="button" onClick={() => showPreview(index)} className={smallButton}><Eye className="h-3.5 w-3.5" aria-hidden="true" />Preview</button>
                        {detail && step.id && !dirty && <button type="button" onClick={() => testEmail(step)} disabled={busy} className={smallButton}><Send className="h-3.5 w-3.5" aria-hidden="true" />Send me a test</button>}
                        <button type="button" onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== index) }))} aria-label={`Delete email ${index + 1}`} className={smallButton}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
                    <div>
                      <label htmlFor={`${fid}-name`} className={labelClass}>Name</label>
                      <input id={`${fid}-name`} value={step.stepName} maxLength={120} readOnly={!editable} onChange={(e) => setStep(index, { stepName: e.target.value })} className={fieldClass} />
                    </div>
                    <div>
                      <label htmlFor={`${fid}-delay`} className={labelClass}>Wait (days)</label>
                      <input id={`${fid}-delay`} type="number" min={0} max={365} value={step.delayAmount} readOnly={!editable} onChange={(e) => setStep(index, { delayAmount: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })} className={fieldClass} />
                    </div>
                    <div>
                      <label htmlFor={`${fid}-unit`} className={labelClass}>Counting</label>
                      <select id={`${fid}-unit`} value={step.delayUnit} disabled={!editable} onChange={(e) => setStep(index, { delayUnit: e.target.value as SequenceStep['delayUnit'] })} className={fieldClass}>
                        <option value="WORKING_DAYS">Working days</option>
                        <option value="CALENDAR_DAYS">Calendar days</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label htmlFor={`${fid}-template`} className={labelClass}>Start from a template</label>
                    <select
                      id={`${fid}-template`}
                      value={step.templateId ?? ''}
                      disabled={!editable || !options?.templates.length}
                      onChange={(e) => {
                        const chosen = options?.templates.find((t) => t.id === e.target.value);
                        if (!chosen) return setStep(index, { templateId: null });
                        if ((step.subject || step.body) && !window.confirm('Replace this email’s subject and body with the template’s?')) return;
                        setStep(index, { templateId: chosen.id, subject: chosen.subject, body: chosen.body });
                      }}
                      className={fieldClass}
                    >
                      <option value="">{options?.templates.length ? 'None: write it here' : 'No templates in the library'}</option>
                      {options?.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">{step.templateId ? `Copied from “${template?.name ?? step.templateName ?? 'a template'}”. Changes here stay in this sequence; the template in the library doesn’t change.` : 'The text is this sequence’s own.'}</p>
                  </div>
                  <div className="mt-3">
                    <label htmlFor={`${fid}-subject`} className={labelClass}>Subject</label>
                    <input id={`${fid}-subject`} value={step.subject} maxLength={300} readOnly={!editable} onChange={(e) => setStep(index, { subject: e.target.value })} className={fieldClass} />
                  </div>
                  <div className="mt-3">
                    <label htmlFor={`${fid}-body`} className={labelClass}>Body</label>
                    <textarea id={`${fid}-body`} rows={6} value={step.body} maxLength={20000} readOnly={!editable} onChange={(e) => setStep(index, { body: e.target.value })} className={`${fieldClass} font-mono text-xs`} />
                    <p className="mt-1 text-xs text-slate-500">Plain text. Your company name and an unsubscribe link are added at the end of every email.</p>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={step.enabled} disabled={!editable} onChange={(e) => setStep(index, { enabled: e.target.checked })} />
                    Send this email
                  </label>
                </li>
              );
            })}
          </ol>
          {form.steps.length === 0 && <p className={`${cardClass} p-6 text-center text-sm text-slate-500`}>No emails yet. Add the first one: it goes out right after a lead is added (or at the next sending time).</p>}
          {editable && form.steps.length < 20 && (
            <button type="button" onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, NEW_STEP(f.steps.length === 0)] }))} className={secondaryButton}><Plus className="h-4 w-4" aria-hidden="true" />Add email</button>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section role="tabpanel" id={`${ids}-panel-settings`} aria-labelledby={`${ids}-tab-settings`} className="grid gap-4 lg:grid-cols-2">
          <div className={`${cardClass} space-y-3 p-4`}>
            <h3 className="text-sm font-bold">About</h3>
            <div>
              <label htmlFor={`${ids}-name`} className={labelClass}>Name *</label>
              <input id={`${ids}-name`} value={form.name} maxLength={120} readOnly={!editable} onChange={(e) => set({ name: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label htmlFor={`${ids}-description`} className={labelClass}>Description</label>
              <input id={`${ids}-description`} value={form.description ?? ''} maxLength={500} readOnly={!editable} onChange={(e) => set({ description: e.target.value })} className={fieldClass} />
            </div>
            <fieldset className="space-y-2">
              <legend className={labelClass}>Send from</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name={`${ids}-sender`} className="mt-1" checked={form.senderMode === 'ORGANIZATION'} disabled={!editable} onChange={() => set({ senderMode: 'ORGANIZATION' })} />
                <span>
                  The organization account{readiness?.organizationSender ? `: ${readiness.organizationSender.email}` : ''}
                  <span className="block text-xs text-slate-500">{readiness?.organizationSender ? 'Replies can’t be detected: its inbox isn’t connected here, so stop leads by hand when they reply.' : (readiness?.organizationProblem ?? 'Not set up yet: set it up in Organization Settings.')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name={`${ids}-sender`} className="mt-1" checked={form.senderMode === 'LEAD_OWNER'} disabled={!editable} onChange={() => set({ senderMode: 'LEAD_OWNER' })} />
                <span>
                  Each lead owner’s own account
                  <span className="block text-xs text-slate-500">{readiness?.personalAccountsAllowed ? 'Their connected Gmail, or their own email account. Replies and bounces in their inbox stop the sequence. An owner without a connected account holds that lead’s emails until they connect one.' : 'Not allowed in this workspace: an administrator can allow personal accounts in Organization Settings.'}</span>
                </span>
              </label>
            </fieldset>
            {detail && detail.replyDetection.mailboxProblems.length > 0 && (
              <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                {detail.replyDetection.mailboxProblems.map((m) => <p key={m.mailbox}>{m.mailbox}: {m.problem}</p>)}
              </div>
            )}
          </div>

          <div className={`${cardClass} space-y-3 p-4`}>
            <h3 className="text-sm font-bold">When emails go out</h3>
            <p className="text-xs text-slate-500">In the workspace’s time zone{overview ? ` (${overview.timeZone})` : ''}. An email that falls due outside these times goes at the next allowed time.</p>
            <fieldset>
              <legend className={labelClass}>Days</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <label key={d.value} className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-[#2B293E]">
                    <input type="checkbox" checked={form.weekdays.includes(d.value)} disabled={!editable} aria-label={d.long}
                      onChange={(e) => set({ weekdays: e.target.checked ? [...form.weekdays, d.value] : form.weekdays.filter((w) => w !== d.value) })} />
                    {d.short}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${ids}-from`} className={labelClass}>From</label>
                <input id={`${ids}-from`} type="time" value={toClock(form.windowStart)} readOnly={!editable} onChange={(e) => { const m = fromClock(e.target.value); if (m !== null) set({ windowStart: m }); }} className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${ids}-until`} className={labelClass}>Until</label>
                <input id={`${ids}-until`} type="time" value={toClock(Math.min(form.windowEnd, 1439))} readOnly={!editable} onChange={(e) => { const m = fromClock(e.target.value); if (m !== null) set({ windowEnd: m === 1439 ? 1440 : m }); }} className={fieldClass} />
              </div>
            </div>
            {form.windowEnd <= form.windowStart && <p role="alert" className="text-xs text-red-700">The window must end after it starts.</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.skipHolidays} disabled={!editable} onChange={(e) => set({ skipHolidays: e.target.checked })} />
              Don’t send on the workspace’s holidays
            </label>
            <div>
              <label htmlFor={`${ids}-limit`} className={labelClass}>At most this many emails a day from one mailbox</label>
              <input id={`${ids}-limit`} type="number" min={1} max={2000} value={form.dailyLimit} readOnly={!editable} onChange={(e) => set({ dailyLimit: Math.max(1, Math.min(2000, Math.round(Number(e.target.value) || 1))) })} className={fieldClass} />
              <p className="mt-1 text-xs text-slate-500">The rest go the next sending day. New mailboxes are safest starting low (20 to 50).</p>
            </div>
          </div>

          <div className={`${cardClass} space-y-2 p-4 lg:col-span-2`}>
            <h3 className="text-sm font-bold">When a lead stops getting emails</h3>
            <p className="text-xs text-slate-500">Always: when they unsubscribe, when the lead is won or lost, and when someone stops it.{form.senderMode === 'LEAD_OWNER' ? ' Also when they reply or the email bounces.' : ''} Also when the lead moves to any of these stages:</p>
            {stagesForStops.length === 0 ? <p className="text-xs text-slate-500">No other stages to choose.</p> : (
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {stagesForStops.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.stopStageIds.includes(s.id)} disabled={!editable} onChange={(e) => set({ stopStageIds: e.target.checked ? [...form.stopStageIds, s.id] : form.stopStageIds.filter((x) => x !== s.id) })} />
                    <span>{s.name} <span className="text-xs text-slate-500">· {s.pipeline}</span></span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {detail && tab === 'rules' && <SequenceRules sequence={detail} options={options} overview={overview} onChanged={load} />}
      {detail && tab === 'leads' && <SequenceLeads sequence={detail} timeZone={overview?.timeZone} onChanged={load} />}
      {detail && tab === 'report' && <SequenceReport sequenceId={detail.id} />}

      {preview && (
        <Dialog title={`Preview: email ${preview.index + 1}`} description="Filled with sample lead details" onClose={() => setPreview(null)} size="lg"
          footer={<button type="button" onClick={() => setPreview(null)} className={secondaryButton}>Close</button>}>
          {preview.unknown.length > 0 && <p role="alert" className="mb-2 text-sm text-red-700">Placeholders that don’t exist: {preview.unknown.map((u) => `{{${u}}}`).join(', ')}</p>}
          {preview.missing.length > 0 && <p className="mb-2 text-sm text-amber-800">Without a value for {preview.missing.join(', ')} (and no fallback), this email would wait instead of sending.</p>}
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{preview.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700 dark:bg-white/5 dark:text-slate-300">{preview.body}</pre>
        </Dialog>
      )}

      {confirm === 'activate' && detail && (
        <Dialog
          title={detail.status === 'PAUSED' ? `Resume “${detail.name}”?` : `Activate “${detail.name}”?`}
          description="Emails start going out automatically. Check what it will do:"
          onClose={() => setConfirm(null)}
          footer={<><button type="button" onClick={() => setConfirm(null)} className={secondaryButton}>Not yet</button><button type="button" disabled={busy || detail.activationProblems.length > 0} onClick={() => transition('activate')} className={primaryButton}>{busy ? 'Working…' : detail.status === 'PAUSED' ? 'Resume sending' : 'Activate and start sending'}</button></>}
        >
          <p className="text-sm text-slate-700 dark:text-slate-300">{detail.summary}</p>
          {detail.rules.some((r) => r.enabled) && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Enrollment rules switched on: {detail.rules.filter((r) => r.enabled).map((r) => r.name).join(', ')}.</p>}
          {!detail.replyDetection.available && <p className="mt-2 text-sm text-amber-800">{detail.replyDetection.note}</p>}
          {detail.status === 'PAUSED' && <p className="mt-2 text-sm text-slate-600">Emails that fell due while paused go out gradually, a few a minute per mailbox, within the daily limit.</p>}
          {detail.activationProblems.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-red-700">{detail.activationProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </Dialog>
      )}
      {confirm === 'archive' && detail && (
        <Dialog
          title={`Archive “${detail.name}”?`}
          description="Every lead still in it stops getting its emails, and its enrollment rules switch off. Its sent emails and reports stay. An archived sequence can’t be activated again."
          onClose={() => setConfirm(null)}
          footer={<><button type="button" onClick={() => setConfirm(null)} className={secondaryButton}>Keep it</button><button type="button" disabled={busy} onClick={() => transition('archive')} className="inline-flex items-center rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Archive sequence</button></>}
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">To stop sending for a while instead, pause it.</p>
        </Dialog>
      )}
    </div>
  );
};
