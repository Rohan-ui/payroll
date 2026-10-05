import React, { useId, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { apiFetch } from '../../api/client';
import { shortDate } from './outreachDue';

interface Props {
  lead: { id: string; company_name: string; currentStep?: { dayNumber?: number; title?: string; dueOn?: string | null } };
  /** The workspace's today (YYYY-MM-DD), from the server. */
  today: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Moves a lead's current touchpoint to another date, e.g. when the prospect
 * asks to be contacted later. The server checks the date and records who moved
 * it, from when to when, and why.
 */
export function RescheduleDialog({ lead, today, onClose, onDone }: Props) {
  const ids = { date: useId(), reason: useId() };
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = lead.currentStep;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/crm/cadence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        feedback: { success: false, error: false },
        body: JSON.stringify({ action: 'RESCHEDULE', leadId: lead.id, dueDate: date, notes: reason }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || 'The touchpoint could not be moved. Try again.');
      onDone(json.data?.message ?? json.message ?? 'Touchpoint moved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The touchpoint could not be moved. Try again.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={`Reschedule ${step?.dayNumber ? `Day ${step.dayNumber}` : 'touchpoint'} for ${lead.company_name}`}
      description={step?.dueOn ? `Now due ${shortDate(step.dueOn)}.` : undefined}
      size="sm"
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !date}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50">
            {saving ? 'Moving…' : date ? `Move to ${shortDate(date)}` : 'Move'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}
        <div>
          <label htmlFor={ids.date} className="block text-xs font-semibold text-slate-700 mb-1">New due date</label>
          <input id={ids.date} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor={ids.reason} className="block text-xs font-semibold text-slate-700 mb-1">Reason <span className="font-normal text-slate-500">(optional)</span></label>
          <input id={ids.reason} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Asked to call after Diwali"
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
        </div>
        <p className="text-[11px] text-slate-500">The next touchpoints follow from when this one is done.</p>
      </div>
    </Dialog>
  );
}
