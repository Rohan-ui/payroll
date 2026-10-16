import React, { useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';

/** Asks for the code and name of a copy of a KRA, KPI, template or workflow. */
export const DuplicateDialog: React.FC<{ what: 'KRA' | 'KPI' | 'template' | 'workflow'; code: string; name: string; onClose: () => void; onCopy: (code: string, name: string) => Promise<void> }> = ({
  what, code, name, onClose, onCopy,
}) => {
  const id = useId();
  const [newCode, setNewCode] = useState(`${code}_COPY`.slice(0, 64));
  const [newName, setNewName] = useState(`${name} (copy)`.slice(0, 160));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCopy(newCode.trim(), newName.trim());
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Dialog title={`Duplicate ${code}`} description={`The copy starts with the same settings${what === 'KRA' ? ', people it is for and KPIs' : what === 'template' || what === 'workflow' ? ' and people it is for, with its latest version as a draft' : ''}.`} onClose={onClose} size="sm"
      footer={<><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" form={id} loading={saving} disabled={saving}>Create copy</Button></>}>
      <form id={id} onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div>
          <label htmlFor={`${id}-code`} className={labelClass}>Code of the copy</label>
          <input id={`${id}-code`} className={`${fieldClass} font-mono uppercase`} value={newCode} required maxLength={64}
            onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} />
          <p className={hintClass}>Capital letters, digits and underscores.</p>
        </div>
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>Name of the copy</label>
          <input id={`${id}-name`} className={fieldClass} value={newName} required maxLength={160} onChange={(e) => setNewName(e.target.value)} />
        </div>
      </form>
    </Dialog>
  );
};
