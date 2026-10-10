import React, { useCallback, useEffect, useId, useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { componentsApi, type ComponentSettings, type SalaryComponent, type SystemRule } from '../../api/payroll-setup.api';
import { CALCULATION, CATEGORY, SYSTEM_RULE, cardClass, errorText, fieldClass, hintClass, labelClass, money, tdClass, thClass } from './payroll-format';

const NEW: ComponentSettings & { componentCode: string } = {
  componentCode: '', componentName: '', description: '', category: 'EARNING', calculationType: 'FIXED', systemRule: null, isStatutory: false, isTaxable: true,
  isProrated: true, includeInGross: true, includeInCtc: true, showOnPayslip: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', displayOrder: 100,
};

/** Salary components: the earnings, deductions and employer contributions structures are built from. */
export const ComponentsTab: React.FC = () => {
  const { can } = useAuth();
  const [components, setComponents] = useState<SalaryComponent[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SalaryComponent | 'new' | null>(null);

  const load = useCallback(() => {
    setError(null);
    componentsApi.list(archived).then(setComponents).catch((e) => setError(errorText(e)));
  }, [archived]);
  useEffect(load, [load]);

  const toggleArchived = async (c: SalaryComponent) => {
    try {
      await (c.status === 'ACTIVE' ? componentsApi.archive(c.id) : componentsApi.restore(c.id));
      toast.success(c.status === 'ACTIVE' ? `${c.componentCode} archived: it can’t be added to structures` : `${c.componentCode} restored`);
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <section className={cardClass} aria-labelledby="components-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#2B293E] px-4 py-3">
        <div>
          <h2 id="components-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Salary components</h2>
          <p className="text-xs text-slate-500">The building blocks of salary structures. Their codes are used in formulas.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="rounded border-slate-300" />
            Show archived
          </label>
          {can('salary.configure') && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />New component</Button>}
        </div>
      </div>
      {error && (
        <div role="alert" className="m-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Components could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {components === null && !error ? (
        <div className="h-24 animate-pulse motion-reduce:animate-none bg-slate-50 dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading components</span></div>
      ) : components?.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No salary components yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Create the earnings and deductions your salaries are made of, such as BASIC, HRA and a professional tax deduction. Then build a structure from them.</p>
        </div>
      ) : components && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Component</th>
                <th scope="col" className={thClass}>Type</th>
                <th scope="col" className={thClass}>Calculated as</th>
                <th scope="col" className={thClass}>Counts in</th>
                <th scope="col" className={thClass}>Limits</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {components.map((c) => (
                <tr key={c.id} className={c.status === 'ARCHIVED' ? 'opacity-60' : undefined}>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{c.componentCode}</span>
                    <span className="block text-slate-700 dark:text-slate-300">{c.componentName}</span>
                    {c.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                  </td>
                  <td className={tdClass}>
                    <Badge size="sm" variant={CATEGORY[c.category].variant}>{CATEGORY[c.category].label}</Badge>
                    {c.isStatutory && <span className="mt-1 block text-xs text-slate-500">Statutory</span>}
                  </td>
                  <td className={tdClass}>
                    {CALCULATION[c.calculationType].label}
                    {c.systemRule && <span className="block text-xs text-slate-500">{SYSTEM_RULE[c.systemRule]}</span>}
                  </td>
                  <td className={`${tdClass} text-xs text-slate-600 dark:text-slate-400`}>
                    {[c.includeInGross && 'Gross', c.includeInCtc && 'CTC', c.isTaxable && 'Taxable', c.isProrated && 'Paid days'].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className={`${tdClass} text-xs tabular-nums text-slate-600 dark:text-slate-400`}>
                    {c.minAmount || c.maxAmount ? `${c.minAmount ? `min ${money(c.minAmount)}` : ''}${c.minAmount && c.maxAmount ? ' · ' : ''}${c.maxAmount ? `max ${money(c.maxAmount)}` : ''}` : '—'}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    {can('salary.configure') && (
                      <>
                        {c.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.componentCode}`}>Edit</Button>}
                        <Button size="sm" variant="ghost" onClick={() => toggleArchived(c)} aria-label={`${c.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${c.componentCode}`}>
                          {c.status === 'ACTIVE' ? 'Archive' : 'Restore'}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ComponentDialog component={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </section>
  );
};

const ComponentDialog: React.FC<{ component: SalaryComponent | null; onClose: () => void; onSaved: () => void }> = ({ component, onClose, onSaved }) => {
  const id = useId();
  const [form, setForm] = useState<ComponentSettings & { componentCode: string }>(() => (component ? { ...component, description: component.description ?? '' } : NEW));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = !!component?.usedInPublished;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setCategory = (category: ComponentSettings['category']) =>
    setForm((f) => ({ ...f, category, includeInGross: category === 'EARNING' ? f.includeInGross : false, isProrated: category === 'EARNING' ? f.isProrated : false }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { componentCode, ...settings } = form;
    const input: ComponentSettings = {
      ...settings,
      componentName: settings.componentName.trim(),
      description: settings.description?.trim() || null,
      systemRule: settings.calculationType === 'SYSTEM_CALCULATED' ? settings.systemRule : null,
      minAmount: settings.minAmount?.trim() || null,
      maxAmount: settings.maxAmount?.trim() || null,
    };
    try {
      if (component) await componentsApi.update(component.id, input);
      else await componentsApi.create({ ...input, componentCode: componentCode.trim().toUpperCase() });
      toast.success(component ? `${component.componentCode} saved` : `${componentCode.toUpperCase()} created`);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const check = (key: 'isStatutory' | 'isTaxable' | 'isProrated' | 'includeInGross' | 'includeInCtc' | 'showOnPayslip', label: string, hint: string, disabled = locked) => (
    <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
      <input type="checkbox" checked={form[key]} disabled={disabled} onChange={(e) => set(key, e.target.checked)} className="mt-0.5 rounded border-slate-300" />
      <span>{label}<span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );

  return (
    <Dialog
      title={component ? `Edit ${component.componentCode}` : 'New salary component'}
      onClose={onClose}
      size="lg"
      footer={(
        <>
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" form={id} loading={saving} disabled={saving}>{component ? 'Save component' : 'Create component'}</Button>
        </>
      )}
    >
      <form id={id} onSubmit={save} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {locked && (
          <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            A published salary structure uses this component, so how it is calculated is fixed. You can still rename it, describe it, and choose whether it shows on payslips. For a different calculation, create a new component.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-code`} className={labelClass}>Code</label>
            <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={form.componentCode} disabled={!!component} required maxLength={32}
              onChange={(e) => set('componentCode', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} aria-describedby={`${id}-code-hint`} />
            <p id={`${id}-code-hint`} className={hintClass}>Used in formulas, such as BASIC or HRA. It can’t change later.</p>
          </div>
          <div>
            <label htmlFor={`${id}-name`} className={labelClass}>Name on payslips</label>
            <input id={`${id}-name`} className={fieldClass} value={form.componentName} required maxLength={160} onChange={(e) => set('componentName', e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-description`} className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`${id}-description`} className={fieldClass} value={form.description ?? ''} maxLength={500} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-category`} className={labelClass}>Type</label>
            <select id={`${id}-category`} className={fieldClass} value={form.category} disabled={locked} onChange={(e) => setCategory(e.target.value as ComponentSettings['category'])}>
              <option value="EARNING">Earning (paid to the employee)</option>
              <option value="DEDUCTION">Deduction (taken from pay)</option>
              <option value="EMPLOYER_CONTRIBUTION">Employer contribution (paid by the company, not from pay)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-calc`} className={labelClass}>Calculated as</label>
            <select id={`${id}-calc`} className={fieldClass} value={form.calculationType} disabled={locked} onChange={(e) => set('calculationType', e.target.value as ComponentSettings['calculationType'])}>
              {Object.entries(CALCULATION).map(([value, c]) => <option key={value} value={value}>{c.label}</option>)}
            </select>
            <p className={hintClass}>{CALCULATION[form.calculationType].hint}</p>
          </div>
        </div>
        {form.calculationType === 'SYSTEM_CALCULATED' && (
          <div>
            <label htmlFor={`${id}-rule`} className={labelClass}>Worked out from</label>
            <select id={`${id}-rule`} className={fieldClass} value={form.systemRule ?? ''} disabled={locked} required onChange={(e) => set('systemRule', (e.target.value || null) as SystemRule | null)}>
              <option value="">Choose…</option>
              {Object.entries(SYSTEM_RULE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        )}
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className={labelClass}>How it counts</legend>
          {check('includeInGross', 'Counts in gross pay', 'Only earnings can.', locked || form.category !== 'EARNING')}
          {check('isProrated', 'Pay in proportion to paid days', 'Reduced for unpaid days. Leave off for amounts already worked out from paid days or hours.')}
          {check('includeInCtc', 'Counts in CTC', 'Part of the cost to company.')}
          {check('isTaxable', 'Taxable', 'Counted for income tax.')}
          {check('isStatutory', 'Statutory', 'Required by law, such as provident fund. Rules are set up separately.')}
          {check('showOnPayslip', 'Show on payslips', 'Hidden lines still count in totals.', false)}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor={`${id}-min`} className={labelClass}>Minimum <span className="font-normal text-slate-400">(optional)</span></label>
            <input id={`${id}-min`} className={fieldClass} inputMode="decimal" value={form.minAmount ?? ''} disabled={locked} onChange={(e) => set('minAmount', e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-max`} className={labelClass}>Maximum <span className="font-normal text-slate-400">(optional)</span></label>
            <input id={`${id}-max`} className={fieldClass} inputMode="decimal" value={form.maxAmount ?? ''} disabled={locked} onChange={(e) => set('maxAmount', e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-scale`} className={labelClass}>Decimal places</label>
            <select id={`${id}-scale`} className={fieldClass} value={form.roundingScale} disabled={locked} onChange={(e) => set('roundingScale', Number(e.target.value))}>
              {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-round`} className={labelClass}>Rounding</label>
            <select id={`${id}-round`} className={fieldClass} value={form.roundingMode} disabled={locked} onChange={(e) => set('roundingMode', e.target.value as ComponentSettings['roundingMode'])}>
              <option value="HALF_UP">Nearest (half up)</option>
              <option value="UP">Always up</option>
              <option value="DOWN">Always down</option>
            </select>
          </div>
        </div>
      </form>
    </Dialog>
  );
};
