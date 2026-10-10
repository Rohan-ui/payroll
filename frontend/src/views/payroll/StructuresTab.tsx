import React, { useCallback, useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { structuresApi, type StructureSummary } from '../../api/payroll-setup.api';
import { StructureEditor } from './StructureEditor';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass, nextMonthIso, tdClass, thClass } from './payroll-format';

/** Salary structures: which components a salary is made of, in dated versions. */
export const StructuresTab: React.FC = () => {
  const { can } = useAuth();
  const [structures, setStructures] = useState<StructureSummary[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError(null);
    structuresApi.list(archived).then(setStructures).catch((e) => setError(errorText(e)));
  }, [archived]);
  useEffect(load, [load]);

  if (open) return <StructureEditor structureId={open} onBack={() => { setOpen(null); load(); }} />;

  return (
    <section className={cardClass} aria-labelledby="structures-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#2B293E] px-4 py-3">
        <div>
          <h2 id="structures-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Salary structures</h2>
          <p className="text-xs text-slate-500">Each change is a new version from a date, so past months keep the structure they were paid on.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="rounded border-slate-300" />
            Show archived
          </label>
          {can('salary.configure') && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New structure</Button>}
        </div>
      </div>
      {error && (
        <div role="alert" className="m-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Structures could not be loaded: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {structures === null && !error ? (
        <div className="h-24 animate-pulse motion-reduce:animate-none bg-slate-50 dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading structures</span></div>
      ) : structures?.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No salary structures yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">A structure lists the components of a salary and how each is worked out. Create one, preview it, and publish it before assigning it to employees.</p>
        </div>
      ) : structures && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr>
                <th scope="col" className={thClass}>Structure</th>
                <th scope="col" className={thClass}>In force</th>
                <th scope="col" className={thClass}>Coming up</th>
                <th scope="col" className={thClass}>Draft</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {structures.map((s) => (
                <tr key={s.id}>
                  <td className={tdClass}>
                    <button type="button" onClick={() => setOpen(s.id)} className="rounded text-left font-semibold text-slate-900 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-100">
                      {s.structureName}
                    </button>
                    <span className="block font-mono text-xs text-slate-500">{s.structureCode}</span>
                    {s.status === 'ARCHIVED' && <Badge size="sm" variant="neutral">Archived</Badge>}
                  </td>
                  <td className={tdClass}>
                    {s.currentVersion ? <>Version {s.currentVersion.number}<span className="block text-xs text-slate-500">since {day(s.currentVersion.effectiveFrom)} · {s.currentVersion.components} components</span></> : <span className="text-slate-500">None yet</span>}
                  </td>
                  <td className={tdClass}>{s.upcomingVersion ? <>Version {s.upcomingVersion.number}<span className="block text-xs text-slate-500">from {day(s.upcomingVersion.effectiveFrom)}</span></> : '—'}</td>
                  <td className={tdClass}>{s.draft ? <Badge size="sm" variant="warning">Draft from {day(s.draft.effectiveFrom)}</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewStructureDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
    </section>
  );
};

const NewStructureDialog: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const id = useId();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await structuresApi.create({ structureCode: code, structureName: name.trim(), effectiveFrom, lines: [] });
      toast.success('Structure created as a draft. Add its components, then publish it.');
      onCreated(created.id);
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Dialog title="New salary structure" onClose={onClose} footer={(
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={id} loading={saving} disabled={saving}>Create draft</Button>
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
          <p className={hintClass}>Capital letters, digits and underscores, such as STAFF_2026.</p>
        </div>
        <div>
          <label htmlFor={`${id}-from`} className={labelClass}>Takes effect from</label>
          <input id={`${id}-from`} type="date" className={fieldClass} value={effectiveFrom} required onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
      </form>
    </Dialog>
  );
};
