import React, { useEffect, useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { offboardingApi, type ChecklistTemplateItem, type ClearanceTeam } from '../../api/offboarding.api';
import { errorText, fieldClass, labelClass } from '../payroll/payroll-format';
import { TEAM } from './offboarding-format';

const MAX_ITEMS = 20;

/** The workspace's own checklist items, added to every new exit after the standard six. */
export const ChecklistTemplateDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const id = useId();
  const [items, setItems] = useState<ChecklistTemplateItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<ClearanceTeam>('IT');
  const [title, setTitle] = useState('');
  const [isRequired, setIsRequired] = useState(true);

  useEffect(() => { offboardingApi.checklistTemplate().then(setItems).catch((e) => setError(errorText(e))); }, []);

  const add = () => {
    if (!items || title.trim().length < 3) return;
    setItems([...items, { team, title: title.trim(), description: null, isRequired }]);
    setTitle('');
  };

  const save = async () => {
    if (!items) return;
    setSaving(true);
    setError(null);
    try {
      await offboardingApi.saveChecklistTemplate(items.map(({ description, ...rest }) => (description ? { ...rest, description } : { ...rest, description: null })));
      toast.success('Checklist saved');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title="Exit checklist" description="Every exit starts with the standard six items (handover, laptop, access, ID card, loans, paperwork). Add your own here; exits already under way keep their checklist." size="md"
      onClose={() => !saving && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving} disabled={saving || !items}>Save</Button></>}>
      {!items && !error && <p role="status" className="text-sm text-slate-500">Loading…</p>}
      {items && (
        <div className="space-y-4">
          {items.length === 0
            ? <p className="text-sm text-slate-500">No extra items yet.</p>
            : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
                {items.map((item, index) => (
                  <li key={`${item.team}-${item.title}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 break-words text-sm text-slate-800 dark:text-slate-200">
                      <span className="text-xs font-semibold text-slate-500">{TEAM[item.team]} · </span>{item.title}
                      {!item.isRequired && <span className="ml-1.5 text-xs text-slate-500">(optional)</span>}
                    </span>
                    <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label={`Remove: ${item.title}`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-white/10">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {items.length < MAX_ITEMS && (
            <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
              <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Add an item</legend>
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <div>
                  <label htmlFor={`${id}-team`} className={labelClass}>Team</label>
                  <select id={`${id}-team`} className={fieldClass} value={team} onChange={(e) => setTeam(e.target.value as ClearanceTeam)}>
                    {(Object.keys(TEAM) as ClearanceTeam[]).map((t) => <option key={t} value={t}>{TEAM[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${id}-title`} className={labelClass}>What needs doing</label>
                  <input id={`${id}-title`} className={fieldClass} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
                  Required to complete the exit
                </label>
                <Button size="sm" variant="outline" onClick={add} disabled={title.trim().length < 3}>Add</Button>
              </div>
            </fieldset>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};
