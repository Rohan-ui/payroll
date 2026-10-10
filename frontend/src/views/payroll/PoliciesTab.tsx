import React, { useCallback, useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { policiesApi, type PolicySummary } from '../../api/payroll-setup.api';
import { PolicyEditor } from './PolicyEditor';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, nextMonthIso, tdClass, thClass } from './payroll-format';

/** Payroll policies: the rules for turning attendance into pay, in dated versions. */
export const PoliciesTab: React.FC = () => {
  const { can } = useAuth();
  const [policies, setPolicies] = useState<PolicySummary[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError(null);
    policiesApi.list(archived).then(setPolicies).catch((e) => setError(errorText(e)));
  }, [archived]);
  useEffect(load, [load]);

  if (open) return <PolicyEditor policyId={open} onBack={() => { setOpen(null); load(); }} />;
  const noDefault = policies !== null && policies.length > 0 && !policies.some((p) => p.isDefault && p.status === 'ACTIVE');

  return (
    <section className={cardClass} aria-labelledby="policies-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#2B293E] px-4 py-3">
        <div>
          <h2 id="policies-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Payroll policies</h2>
          <p className="text-xs text-slate-500">How days, hours, overtime, late arrival and early departure turn into pay. Each change is a new version from a date.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="rounded border-slate-300" />
            Show archived
          </label>
          {can('payroll.policies.manage') && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New policy</Button>}
        </div>
      </div>
      {noDefault && <p role="note" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No policy is the default, so employees no policy covers can’t be paid. Make one policy the default.</p>}
      {error && (
        <div role="alert" className="m-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Policies could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {policies === null && !error ? (
        <div className="h-24 animate-pulse motion-reduce:animate-none bg-slate-50 dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading policies</span></div>
      ) : policies?.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No payroll policies yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Payroll needs at least one policy to know your divisor, working days and overtime rules. Create a default policy, review its rules, and publish it.</p>
        </div>
      ) : policies && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Policy</th>
                <th scope="col" className={thClass}>Covers</th>
                <th scope="col" className={thClass}>In force</th>
                <th scope="col" className={thClass}>Draft</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className={tdClass}>
                    <button type="button" onClick={() => setOpen(p.id)} className="rounded text-left font-semibold text-slate-900 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-100">{p.policyName}</button>
                    <span className="block font-mono text-xs text-slate-500">{p.policyCode}</span>
                    {p.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                  </td>
                  <td className={tdClass}>{p.isDefault ? <Badge size="sm" variant="info">Default: everyone not otherwise covered</Badge> : p.scopeCount ? `Chosen departments, branches, employment types or designations (${p.scopeCount})` : <span className="text-slate-500">Only salaries that name it</span>}</td>
                  <td className={tdClass}>
                    {p.currentVersion ? <>Version {p.currentVersion.number}<span className="block text-xs text-slate-500">since {day(p.currentVersion.effectiveFrom)}</span></> : <span className="text-slate-500">None yet</span>}
                    {p.upcomingVersion && <span className="block text-xs text-slate-500">Version {p.upcomingVersion.number} from {day(p.upcomingVersion.effectiveFrom)}</span>}
                  </td>
                  <td className={tdClass}>{p.draft ? <Badge size="sm" variant="warning">Draft from {day(p.draft.effectiveFrom)}</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewPolicyDialog firstPolicy={!policies?.length} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
    </section>
  );
};

const NewPolicyDialog: React.FC<{ firstPolicy: boolean; onClose: () => void; onCreated: (id: string) => void }> = ({ firstPolicy, onClose, onCreated }) => {
  const id = useId();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(firstPolicy);
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await policiesApi.create({ policyCode: code, policyName: name.trim(), description: description.trim() || undefined, isDefault, effectiveFrom });
      toast.success('Policy created. Review its rules, then publish them.');
      onCreated(created.id);
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Dialog title="New payroll policy" onClose={onClose} footer={(
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={id} loading={saving} disabled={saving}>Create policy</Button>
      </>
    )}>
      <form id={id} onSubmit={create} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>Name</label>
          <input id={`${id}-name`} className={fieldClass} value={name} required maxLength={160} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-code`} className={labelClass}>Code</label>
          <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={code} required maxLength={64} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} />
          <p className={hintClass}>Capital letters, digits and underscores, such as FACTORY_STAFF.</p>
        </div>
        <div>
          <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-description`} className={fieldClass} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-from`} className={labelClass}>Rules take effect from</label>
          <input id={`${id}-from`} type="date" className={fieldClass} value={effectiveFrom} required onChange={(e) => setEffectiveFrom(e.target.value)} />
          <p className={hintClass}>The policy starts with neutral rules (no penalties, no overtime) as a draft for you to review.</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
          <span>Default policy<span className="block text-xs text-slate-500">Applies to every employee no other policy covers. Only one policy can be the default.</span></span>
        </label>
      </form>
    </Dialog>
  );
};
