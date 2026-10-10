import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../lib/toast';
import { sequencesApi, type LeadSequences } from '../../../api/sequences.api';
import { EnrollDialog } from './EnrollDialog';
import { ENROLLMENT_STATUS, errorText, formatWhen, SEND_STATUS, smallButton } from './drip-format';

/** A lead's drip sequences on its page: where it is, the next email, and adding or stopping it. */
export const LeadSequencesPanel: React.FC<{ leadId: string; onChanged?: () => void }> = ({ leadId, onChanged }) => {
  const { can } = useAuth();
  const [data, setData] = useState<LeadSequences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    sequencesApi.forLead(leadId).then(setData).catch((e) => setError(errorText(e)));
  }, [leadId]);
  useEffect(load, [load]);

  const active = data?.enrollments.find((e) => e.status === 'ACTIVE');
  const next = active?.emails.find((m) => ['SCHEDULED', 'FAILED', 'UNCERTAIN'].includes(m.status));
  const stop = async () => {
    if (!active || busy || !window.confirm(`Stop “${active.sequence.name}” for this lead? Emails not sent yet are cancelled.`)) return;
    setBusy(true);
    try {
      await sequencesApi.stopEnrollment(active.id);
      toast.success('Drip sequence stopped for this lead');
      load();
      onChanged?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Drip sequences">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Drip sequences</span>
        {!active && can('sequences.enroll') && <button type="button" onClick={() => setAdding(true)} className={smallButton}>Add to sequence</button>}
        {active && can('sequences.enroll') && <button type="button" disabled={busy} onClick={stop} className={smallButton}>Stop</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {data === null && !error ? <p className="mt-2 text-xs text-slate-400" role="status">Loading…</p> : data && (
        active ? (
          <div className="mt-2 text-xs text-slate-700">
            <p><strong>{active.sequence.name}</strong> <Badge variant={ENROLLMENT_STATUS.ACTIVE.variant} size="sm">{ENROLLMENT_STATUS.ACTIVE.label}</Badge>{active.sequence.status === 'PAUSED' && <span className="ml-1 text-amber-700">(sequence paused)</span>}</p>
            <p className="mt-1">{active.emails.filter((m) => m.status === 'SENT' || m.status === 'BOUNCED').length} sent{next ? ` · next: ${next.step}, ${next.status === 'SCHEDULED' ? formatWhen(next.scheduledAt) : SEND_STATUS[next.status].label}` : ''}</p>
            {next?.problem && <p className="mt-1 text-amber-800">{next.problem}</p>}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {data.enrollments[0] ? `Last: “${data.enrollments[0].sequence.name}”, ${data.enrollments[0].status === 'COMPLETED' ? 'finished' : `stopped (${data.enrollments[0].stopReason ?? 'stopped'})`}.` : 'Not in a drip sequence.'}
          </p>
        )
      )}
      {adding && <EnrollDialog leadIds={[leadId]} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged?.(); }} />}
    </div>
  );
};
