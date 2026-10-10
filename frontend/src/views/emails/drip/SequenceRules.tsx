import React, { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../lib/toast';
import {
  sequencesApi, type ConditionOperator, type RuleCondition, type RuleDryRun, type SequenceDetail, type SequenceOptions, type SequenceOverview, type SequenceRule, type SequenceRuleInput,
} from '../../../api/sequences.api';
import { cardClass, errorText, fieldClass, formatWhen, labelClass, primaryButton, secondaryButton, smallButton } from './drip-format';

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'EQUALS', label: 'is' },
  { value: 'NOT_EQUALS', label: 'is not' },
  { value: 'CONTAINS', label: 'contains' },
  { value: 'IN', label: 'is one of' },
  { value: 'IS_EMPTY', label: 'is empty' },
  { value: 'IS_NOT_EMPTY', label: 'is not empty' },
];
const EMPTY: SequenceRuleInput = { name: '', triggerKind: 'STAGE_ENTERED', pipelineId: null, stageId: null, sourceId: null, conditions: { match: 'ALL', conditions: [] } };

/** How a rule reads, in words. */
const describe = (r: SequenceRule) =>
  r.triggerKind === 'STAGE_ENTERED' ? `When a lead enters ${r.stageName ?? 'a stage'}${r.pipelineName ? ` (${r.pipelineName})` : ''}` : `When a lead is created${r.sourceName ? ` from ${r.sourceName}` : ''}`;

/**
 * Rules that add leads to the sequence by themselves: when a lead is created
 * (from a source, say) or enters a stage, and meets the conditions. A rule
 * only enrolls leads from the moment it is switched on; a dry run shows who
 * it would have enrolled over the last 30 days, enrolling nobody.
 */
export const SequenceRules: React.FC<{ sequence: SequenceDetail; options: SequenceOptions | null; overview: SequenceOverview | null; onChanged: () => void }> = ({ sequence, options, overview, onChanged }) => {
  const ids = useId();
  const { can } = useAuth();
  const editable = can('sequences.manage') && sequence.status !== 'ARCHIVED';
  const [rules, setRules] = useState<SequenceRule[]>(sequence.rules);
  const [editing, setEditing] = useState<{ id: string | null; input: SequenceRuleInput } | null>(null);
  const [dryRun, setDryRun] = useState<{ rule: SequenceRule; result: RuleDryRun } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!editing) return;
    const input = editing.input;
    const next = editing.id ? await sequencesApi.updateRule(sequence.id, editing.id, input) : await sequencesApi.createRule(sequence.id, input);
    setRules(next);
    setEditing(null);
    onChanged();
    toast.success(editing.id ? 'Rule saved' : 'Rule saved. It is switched off until you switch it on.');
  });
  const toggle = (rule: SequenceRule) => run(async () => {
    setRules(await sequencesApi.setRuleEnabled(sequence.id, rule.id, !rule.enabled));
    onChanged();
    toast.success(rule.enabled ? 'Rule switched off' : 'Rule switched on: leads from now on are enrolled');
  });
  const remove = (rule: SequenceRule) => run(async () => {
    if (!window.confirm(`Delete the rule “${rule.name}”? Leads it already enrolled stay in the sequence.`)) return;
    setRules(await sequencesApi.deleteRule(sequence.id, rule.id));
    onChanged();
  });
  const preview = (rule: SequenceRule) => run(async () => setDryRun({ rule, result: await sequencesApi.dryRunRule(sequence.id, rule.id) }));

  const input = editing?.input;
  const setInput = (patch: Partial<SequenceRuleInput>) => setEditing((e) => (e ? { ...e, input: { ...e.input, ...patch } } : e));
  const setCondition = (index: number, patch: Partial<RuleCondition>) =>
    setEditing((e) => (e ? { ...e, input: { ...e.input, conditions: { ...e.input.conditions, conditions: e.input.conditions.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) } } } : e));
  const pipeline = options?.pipelines.find((p) => p.id === input?.pipelineId);
  const valueChoices = (field: string): { id: string; name: string }[] | null =>
    field === 'source' ? options?.sources ?? [] : field === 'pipeline' ? options?.pipelines ?? [] : field === 'stage' ? (options?.pipelines ?? []).flatMap((p) => p.stages.map((s) => ({ id: s.id, name: `${s.name} (${p.name})` }))) : null;

  return (
    <section className="space-y-3" aria-label="Enrollment rules">
      <p className="text-sm text-slate-600 dark:text-slate-400">Rules add leads to this sequence by themselves. A lead is checked once per event, so editing it or re-importing it never adds it twice, and leads already in a sequence or in Client Outreach are skipped.{sequence.status !== 'ACTIVE' ? ' Rules run only while the sequence is active.' : ''}</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {rules.length === 0 ? (
        <p className={`${cardClass} p-6 text-center text-sm text-slate-500`}>No rules: leads join only when someone adds them, from a lead’s page or from Lead Management.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.id} className={`${cardClass} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">{rule.name}<Badge variant={rule.enabled ? 'success' : 'neutral'} size="sm">{rule.enabled ? 'On' : 'Off'}</Badge></p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {describe(rule)}
                    {rule.conditions.conditions.length > 0 && `, and ${rule.conditions.match === 'ALL' ? 'all' : 'any'} of ${rule.conditions.conditions.length} condition${rule.conditions.conditions.length === 1 ? '' : 's'}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Enrolled {rule.enrolled} · {rule.enabled && rule.enabledAt ? `On since ${formatWhen(rule.enabledAt, overview?.timeZone)}` : 'Switched off'}{rule.lastRunAt ? ` · Last checked ${formatWhen(rule.lastRunAt, overview?.timeZone)}` : ''}
                  </p>
                  {rule.lastError && <p role="alert" className="mt-1 text-xs text-red-700">{rule.lastError}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={busy} onClick={() => preview(rule)} className={smallButton}>Dry run</button>
                  {editable && <button type="button" disabled={busy} onClick={() => toggle(rule)} className={smallButton} aria-pressed={rule.enabled}>{rule.enabled ? 'Switch off' : 'Switch on'}</button>}
                  {editable && <button type="button" disabled={busy} onClick={() => setEditing({ id: rule.id, input: { name: rule.name, triggerKind: rule.triggerKind, pipelineId: rule.pipelineId, stageId: rule.stageId, sourceId: rule.sourceId, conditions: rule.conditions } })} className={smallButton}>Edit</button>}
                  {editable && <button type="button" disabled={busy} onClick={() => remove(rule)} aria-label={`Delete rule ${rule.name}`} className={smallButton}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editable && <button type="button" onClick={() => setEditing({ id: null, input: EMPTY })} className={secondaryButton}><Plus className="h-4 w-4" aria-hidden="true" />Add rule</button>}

      {editing && input && (
        <Dialog
          title={editing.id ? 'Edit rule' : 'New enrollment rule'}
          description="Saved switched off; switch it on when it is right. It enrolls leads from that moment on, never the ones already there."
          onClose={() => setEditing(null)}
          size="lg"
          footer={<><button type="button" onClick={() => setEditing(null)} className={secondaryButton}>Cancel</button><button type="button" disabled={busy || !input.name.trim()} onClick={save} className={primaryButton}>{busy ? 'Saving…' : 'Save rule'}</button></>}
        >
          <div className="space-y-3">
            <div>
              <label htmlFor={`${ids}-name`} className={labelClass}>Rule name *</label>
              <input id={`${ids}-name`} value={input.name} maxLength={120} onChange={(e) => setInput({ name: e.target.value })} className={fieldClass} />
            </div>
            <fieldset className="space-y-1">
              <legend className={labelClass}>Enroll a lead</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`${ids}-trigger`} checked={input.triggerKind === 'STAGE_ENTERED'} onChange={() => setInput({ triggerKind: 'STAGE_ENTERED', sourceId: null })} />When it enters a stage</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`${ids}-trigger`} checked={input.triggerKind === 'LEAD_CREATED'} onChange={() => setInput({ triggerKind: 'LEAD_CREATED', pipelineId: null, stageId: null })} />When it is created or imported</label>
            </fieldset>
            {input.triggerKind === 'STAGE_ENTERED' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${ids}-pipeline`} className={labelClass}>Pipeline *</label>
                  <select id={`${ids}-pipeline`} value={input.pipelineId ?? ''} onChange={(e) => setInput({ pipelineId: e.target.value || null, stageId: null })} className={fieldClass}>
                    <option value="">Choose a pipeline</option>
                    {options?.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${ids}-stage`} className={labelClass}>Stage *</label>
                  <select id={`${ids}-stage`} value={input.stageId ?? ''} disabled={!pipeline} onChange={(e) => setInput({ stageId: e.target.value || null })} className={fieldClass}>
                    <option value="">Choose a stage</option>
                    {pipeline?.stages.filter((s) => !s.isWon && !s.isLost).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor={`${ids}-source`} className={labelClass}>From the source</label>
                <select id={`${ids}-source`} value={input.sourceId ?? ''} onChange={(e) => setInput({ sourceId: e.target.value || null })} className={fieldClass}>
                  <option value="">Any source</option>
                  {options?.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <fieldset className="space-y-2">
              <legend className={labelClass}>Only if the lead meets</legend>
              <select aria-label="Which conditions must hold" value={input.conditions.match} onChange={(e) => setInput({ conditions: { ...input.conditions, match: e.target.value as 'ALL' | 'ANY' } })} className={`${fieldClass} w-auto`}>
                <option value="ALL">all of these conditions</option>
                <option value="ANY">any of these conditions</option>
              </select>
              {input.conditions.conditions.map((c, index) => {
                const choices = valueChoices(c.field);
                const needsValue = c.operator !== 'IS_EMPTY' && c.operator !== 'IS_NOT_EMPTY';
                return (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
                    <select aria-label={`Condition ${index + 1} field`} value={c.field} onChange={(e) => setCondition(index, { field: e.target.value, value: '' })} className={fieldClass}>
                      {overview?.conditionFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select aria-label={`Condition ${index + 1} test`} value={c.operator} onChange={(e) => setCondition(index, { operator: e.target.value as ConditionOperator, value: e.target.value === 'IN' ? [] : '' })} className={fieldClass}>
                      {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {!needsValue ? <span /> : choices && c.operator !== 'CONTAINS' ? (
                      <select aria-label={`Condition ${index + 1} value`} multiple={c.operator === 'IN'} value={c.operator === 'IN' ? (Array.isArray(c.value) ? c.value : []) : String(c.value ?? '')}
                        onChange={(e) => setCondition(index, { value: c.operator === 'IN' ? [...e.target.selectedOptions].map((o) => o.value) : e.target.value })} className={fieldClass}>
                        {c.operator !== 'IN' && <option value="">Choose</option>}
                        {choices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    ) : (
                      <input aria-label={`Condition ${index + 1} value`} value={Array.isArray(c.value) ? c.value.join(', ') : c.value ?? ''} placeholder={c.operator === 'IN' ? 'Separate values with commas' : ''}
                        onChange={(e) => setCondition(index, { value: c.operator === 'IN' ? e.target.value.split(',').map((v) => v.trim()).filter(Boolean) : e.target.value })} className={fieldClass} />
                    )}
                    <button type="button" onClick={() => setInput({ conditions: { ...input.conditions, conditions: input.conditions.conditions.filter((_, i) => i !== index) } })} aria-label={`Remove condition ${index + 1}`} className={smallButton}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  </div>
                );
              })}
              {input.conditions.conditions.length < 20 && (
                <button type="button" onClick={() => setInput({ conditions: { ...input.conditions, conditions: [...input.conditions.conditions, { field: 'industry', operator: 'EQUALS', value: '' }] } })} className={smallButton}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add condition
                </button>
              )}
              {input.conditions.conditions.length === 0 && <p className="text-xs text-slate-500">No conditions: every lead the trigger catches is enrolled.</p>}
            </fieldset>
          </div>
        </Dialog>
      )}

      {dryRun && (
        <Dialog title={`Dry run: ${dryRun.rule.name}`} description={dryRun.result.note} onClose={() => setDryRun(null)} size="lg" footer={<button type="button" onClick={() => setDryRun(null)} className={secondaryButton}>Close</button>}>
          {dryRun.result.leads.length === 0 ? <p className="text-sm text-slate-500">No lead met the trigger in the last {dryRun.result.windowDays} days.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="py-2 pr-3">Lead</th><th scope="col" className="py-2 pr-3">When</th><th scope="col" className="py-2">Would it be enrolled?</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {dryRun.result.leads.map((l) => (
                    <tr key={l.leadId}>
                      <td className="py-2 pr-3"><span className="font-semibold">{l.company}</span><span className="block text-xs text-slate-500">{l.name || l.email}</span></td>
                      <td className="py-2 pr-3 text-xs">{formatWhen(l.eventAt, overview?.timeZone)}</td>
                      <td className="py-2 text-xs">{l.wouldEnroll ? <Badge variant="success" size="sm">Yes</Badge> : <span className="text-slate-600">No: {l.reason}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
};
