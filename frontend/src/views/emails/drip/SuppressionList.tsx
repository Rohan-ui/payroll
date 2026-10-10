import React, { useCallback, useEffect, useId, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../lib/toast';
import { sequencesApi, type Page, type Suppression } from '../../../api/sequences.api';
import { cardClass, errorText, fieldClass, formatWhen, labelClass, primaryButton, secondaryButton, smallButton } from './drip-format';

const REASONS: Record<Suppression['reason'], { label: string; variant: 'danger' | 'warning' | 'neutral' }> = {
  UNSUBSCRIBED: { label: 'Unsubscribed', variant: 'danger' },
  BOUNCED: { label: 'Bounced', variant: 'warning' },
  MANUAL: { label: 'Added by hand', variant: 'neutral' },
};

/**
 * The workspace's do-not-email list: no sequence or Client Outreach email goes
 * to these addresses. People who unsubscribed stay on it; bounced and
 * hand-added addresses can be removed.
 */
export const SuppressionList: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const ids = useId();
  const { can } = useAuth();
  const manage = can('sequences.suppression.manage');
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Page<Suppression> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [emails, setEmails] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    sequencesApi.suppressions({ search: search.trim() || undefined, reason: reason || undefined, page, limit: 25 }).then(setRows).catch((e) => setError(errorText(e)));
  }, [search, reason, page]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
      onChanged?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const add = () => run(async () => {
    const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    const result = await sequencesApi.addSuppressions(list, note.trim() || undefined);
    toast.success(`${result.added} added${result.alreadyListed ? `, ${result.alreadyListed} already listed` : ''}`);
    setAdding(false);
    setEmails('');
    setNote('');
  });
  const remove = (s: Suppression) => run(async () => {
    if (!window.confirm(`Remove ${s.email} from the do-not-email list? Sequences and outreach can email it again.`)) return;
    await sequencesApi.removeSuppression(s.id);
    toast.success('Removed from the list');
  });

  return (
    <section className="space-y-3" aria-label="Do-not-email list">
      <p className="text-sm text-slate-600 dark:text-slate-400">No sequence or Client Outreach email goes to these addresses. Everyone who uses an unsubscribe link, and every address that bounces, is added automatically.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Search addresses" placeholder="Search addresses" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${fieldClass} w-auto min-w-[14rem]`} />
        <select aria-label="Reason" value={reason} onChange={(e) => { setReason(e.target.value); setPage(1); }} className={`${fieldClass} w-auto`}>
          <option value="">Every reason</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
          <option value="BOUNCED">Bounced</option>
          <option value="MANUAL">Added by hand</option>
        </select>
        {manage && <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>Add addresses</button>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className={cardClass}>
        {rows === null ? <div className="h-24 animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading the list</span></div> : rows.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">{search || reason ? 'No addresses match.' : 'Nobody is on the list yet.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {rows.items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="break-all font-semibold">{s.email} <Badge variant={REASONS[s.reason].variant} size="sm">{REASONS[s.reason].label}</Badge></p>
                  <p className="text-xs text-slate-500">{formatWhen(s.createdAt)}{s.addedBy ? ` by ${s.addedBy}` : ''}{s.source === 'ONE_CLICK' ? ' · from their mail app' : s.source === 'LINK' ? ' · using the link in an email' : ''}{s.note ? ` · ${s.note}` : ''}</p>
                </div>
                {manage && s.removable && <button type="button" disabled={busy} onClick={() => remove(s)} className={smallButton}>Remove</button>}
              </li>
            ))}
          </ul>
        )}
        {rows && rows.total > rows.limit && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#2B293E] px-4 py-2 text-xs text-slate-500">
            <span>{(rows.page - 1) * rows.limit + 1}–{Math.min(rows.total, rows.page * rows.limit)} of {rows.total}</span>
            <span className="flex gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={smallButton}>Previous</button>
              <button type="button" disabled={rows.page * rows.limit >= rows.total} onClick={() => setPage((p) => p + 1)} className={smallButton}>Next</button>
            </span>
          </div>
        )}
      </div>

      {adding && (
        <Dialog title="Add to the do-not-email list" description="Their sequences stop now, and no sequence or outreach email goes to them." onClose={() => setAdding(false)}
          footer={<><button type="button" onClick={() => setAdding(false)} className={secondaryButton}>Cancel</button><button type="button" disabled={busy || !emails.trim()} onClick={add} className={primaryButton}>{busy ? 'Adding…' : 'Add'}</button></>}>
          <label htmlFor={`${ids}-emails`} className={labelClass}>Email addresses *</label>
          <textarea id={`${ids}-emails`} rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} className={fieldClass} aria-describedby={`${ids}-emails-hint`} />
          <p id={`${ids}-emails-hint`} className="mt-1 text-xs text-slate-500">One per line, or separated by commas. Up to 500.</p>
          <label htmlFor={`${ids}-note`} className={`${labelClass} mt-3`}>Note</label>
          <input id={`${ids}-note`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
        </Dialog>
      )}
    </section>
  );
};
