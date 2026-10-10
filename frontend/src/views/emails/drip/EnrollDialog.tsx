import React, { useEffect, useId, useState } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import { toast } from '../../../lib/toast';
import { sequencesApi, type EnrollPreview, type SequenceSummary } from '../../../api/sequences.api';
import { errorText, fieldClass, formatWhen, labelClass, primaryButton, secondaryButton } from './drip-format';

/**
 * Adds one lead or many to a drip sequence: choose the sequence, see who can
 * join (and why the others can't), the first email and when it goes, then
 * confirm. Leads in Client Outreach join only if moved deliberately.
 */
export const EnrollDialog: React.FC<{ leadIds: string[]; onClose: () => void; onDone: () => void }> = ({ leadIds, onClose, onDone }) => {
  const ids = useId();
  const [sequences, setSequences] = useState<SequenceSummary[] | null>(null);
  const [sequenceId, setSequenceId] = useState('');
  const [move, setMove] = useState(false);
  const [preview, setPreview] = useState<EnrollPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sequencesApi.list().then((all) => setSequences(all.filter((s) => s.status === 'ACTIVE' || s.status === 'PAUSED'))).catch((e) => setError(errorText(e)));
  }, []);
  // Keyed by the ids themselves: a new array with the same leads doesn't ask again.
  const leadKey = leadIds.join(',');
  useEffect(() => {
    if (!sequenceId) return setPreview(null);
    setError(null);
    setPreview(null);
    sequencesApi.enrollPreview(sequenceId, leadKey.split(','), move).then(setPreview).catch((e) => setError(errorText(e)));
  }, [sequenceId, leadKey, move]);

  const inOutreach = preview?.leads.filter((l) => l.code === 'IN_CLIENT_OUTREACH').length ?? 0;
  const confirm = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sequencesApi.enroll(sequenceId, leadIds, move);
      toast.success(`${result.enrolled} lead${result.enrolled === 1 ? '' : 's'} added to “${preview.sequence.name}”${result.skipped.length ? `; ${result.skipped.length} skipped` : ''}`);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={leadIds.length === 1 ? 'Add to a drip sequence' : `Add ${leadIds.length} leads to a drip sequence`}
      description="Emails then go out automatically until each lead replies, unsubscribes or the deal closes."
      onClose={onClose}
      size="lg"
      footer={<><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button type="button" disabled={busy || !preview || preview.eligible === 0} onClick={confirm} className={primaryButton}>{busy ? 'Adding…' : preview ? `Add ${preview.eligible} lead${preview.eligible === 1 ? '' : 's'}` : 'Add'}</button></>}
    >
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <label htmlFor={`${ids}-sequence`} className={labelClass}>Sequence</label>
      <select id={`${ids}-sequence`} value={sequenceId} onChange={(e) => setSequenceId(e.target.value)} className={fieldClass} disabled={!sequences}>
        <option value="">{sequences === null ? 'Loading…' : sequences.length ? 'Choose a sequence' : 'No active sequences'}</option>
        {sequences?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'PAUSED' ? ' (paused)' : ''}</option>)}
      </select>
      {sequences && sequences.length === 0 && <p className="mt-1 text-xs text-slate-500">Create and activate one in Email &amp; Marketing → Drip Sequences.</p>}

      {sequenceId && !preview && !error && <p role="status" className="mt-3 text-sm text-slate-500">Checking the leads…</p>}
      {preview && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-800 dark:text-slate-200">
            <strong>{preview.eligible}</strong> of {preview.leads.length} can join.
            {preview.sequence.status === 'PAUSED' && ' The sequence is paused: their first email waits until it is resumed.'}
          </p>
          {inOutreach > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              <input type="checkbox" className="mt-1" checked={move} onChange={(e) => setMove(e.target.checked)} />
              <span>Move {inOutreach === 1 ? 'the lead' : `the ${inOutreach} leads`} in Client Outreach to this sequence<span className="block text-xs">Their Client Outreach ends (kept in their history) so they don’t get emails from both.</span></span>
            </label>
          )}
          {preview.leads.some((l) => !l.eligible) && (
            <details open={preview.leads.length <= 5}>
              <summary className="cursor-pointer text-sm font-semibold">Can’t join ({preview.leads.filter((l) => !l.eligible).length})</summary>
              <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-xs text-slate-600 dark:text-slate-300">
                {preview.leads.filter((l) => !l.eligible).map((l) => <li key={l.leadId}><strong>{l.company}</strong>: {l.reason}</li>)}
              </ul>
            </details>
          )}
          {preview.firstEmail && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2B293E]">
              <p className="text-xs text-slate-500">First email{preview.firstStep ? `, “${preview.firstStep}”` : ''}{preview.leads.find((l) => l.eligible)?.firstSendAt ? `, goes ${formatWhen(preview.leads.find((l) => l.eligible)?.firstSendAt, preview.timeZone)}` : ''}:</p>
              <p className="mt-1 text-sm font-semibold">{preview.firstEmail.subject}</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs text-slate-600 dark:text-slate-300">{preview.firstEmail.body}</pre>
              {preview.firstEmail.missing.length > 0 && <p className="mt-1 text-xs text-amber-800">This lead has no {preview.firstEmail.missing.join(', ')}: the email will wait until it is filled in.</p>}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
};
