import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { DnsOverview, DnsRecord, DnsRecordValue, EDITABLE_RECORD_TYPES, MIN_TTL, platformDnsApi } from '../api/platform-dns.api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailItem, DetailList, ErrorBanner, Panel, Value } from '../components/DetailList';
import { EmptyRow, LoadingRows, TableShell } from '../components/TableShell';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/form-styles';
import { formatDate, formatDateTime } from '../format';

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; type: string; name: string }
  | { kind: 'delete'; type: string; name: string }
  | { kind: 'wildcard' }
  | null;

interface Draft {
  type: string;
  name: string;
  values: { data: string; ttl: string; priority: string }[];
}

const fqdn = (name: string, domain: string) => (name === '@' ? domain : `${name}.${domain}`);

/**
 * The platform domain's DNS zone at its provider. Workspaces need no records:
 * the wildcard sends every address to the application. Every change here goes
 * to the provider at once and is recorded in the activity log.
 */
export const DnsZonePanel: React.FC = () => {
  const [overview, setOverview] = useState<DnsOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [records, setRecords] = useState<DnsRecord[] | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draft, setDraft] = useState<Draft>({ type: 'A', name: '', values: [{ data: '', ttl: String(MIN_TTL), priority: '' }] });
  const [isBusy, setIsBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const firstValueRef = useRef<HTMLInputElement>(null);

  const loadOverview = useCallback(async () => {
    setOverviewError(null);
    try {
      setOverview(await platformDnsApi.overview());
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Could not load the DNS overview.');
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setIsLoadingRecords(true);
    setRecordsError(null);
    try {
      setRecords((await platformDnsApi.records()).records);
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : 'Could not read the DNS records.');
    } finally {
      setIsLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const ready = Boolean(overview?.domain && overview.providerConfigured);
  useEffect(() => {
    if (ready) void loadRecords();
  }, [ready, loadRecords]);

  const refresh = async () => {
    setNotice(null);
    await Promise.all([loadOverview(), loadRecords()]);
  };

  const verify = async () => {
    setIsVerifying(true);
    setNotice(null);
    try {
      const result = await platformDnsApi.verify();
      setNotice(result.verified ? 'DNS verified: every check passed.' : 'DNS not verified: see the checks below.');
      await loadOverview();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Verification could not run.');
    } finally {
      setIsVerifying(false);
    }
  };

  const open = (next: Dialog) => {
    setDialogError(null);
    if (next?.kind === 'add') setDraft({ type: 'A', name: '', values: [{ data: '', ttl: String(MIN_TTL), priority: '' }] });
    if (next?.kind === 'edit' && records) {
      setDraft({
        type: next.type,
        name: next.name,
        values: records
          .filter((r) => r.type === next.type && r.name === next.name)
          .map((r) => ({ data: r.data, ttl: String(r.ttl), priority: r.priority === null ? '' : String(r.priority) })),
      });
    }
    setDialog(next);
  };

  const toValues = (): DnsRecordValue[] =>
    draft.values.map((v) => ({
      data: v.data.trim(),
      ttl: Number(v.ttl),
      priority: draft.type === 'MX' && v.priority !== '' ? Number(v.priority) : null,
    }));

  const run = async (action: () => Promise<unknown>, success: string) => {
    setIsBusy(true);
    setDialogError(null);
    try {
      await action();
      setDialog(null);
      setNotice(success);
      await Promise.all([loadRecords(), loadOverview()]);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'The change failed.');
    } finally {
      setIsBusy(false);
    }
  };

  if (overviewError) return <ErrorBanner message={overviewError} onRetry={() => void loadOverview()} />;
  if (!overview) {
    return (
      <div role="status" className="h-32 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none">
        <span className="sr-only">Loading DNS</span>
      </div>
    );
  }

  const domain = overview.domain ?? '';
  const verification = overview.lastVerification;
  const matching = (type: string, name: string) => (records ?? []).filter((r) => r.type === type && r.name === name);

  return (
    <div className="space-y-5">
      <Panel
        title="Platform domain"
        description={`Managed through ${overview.provider}. Changes apply to live DNS immediately.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refresh()} disabled={!ready || isLoadingRecords} className={secondaryButtonClass}>
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecords ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
              Refresh
            </button>
            <button type="button" onClick={() => void verify()} disabled={!ready || isVerifying} className={secondaryButtonClass}>
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              {isVerifying ? 'Verifying…' : 'Verify DNS'}
            </button>
          </div>
        }
      >
        {overview.error && (
          <p role="alert" className="mb-4 rounded-xl border border-hq-warning/30 bg-hq-warning/10 px-3.5 py-3 text-xs text-hq-warning">
            {overview.error}
          </p>
        )}
        <DetailList>
          <DetailItem label="Domain">
            <Value value={overview.domain} empty="Not configured (PLATFORM_BASE_DOMAIN)" mono />
          </DetailItem>
          <DetailItem label="Provider">
            {overview.provider} · {overview.providerConfigured ? (overview.reachable ? 'connected' : 'not reachable') : 'not configured'}
          </DetailItem>
          <DetailItem label="Domain status">
            <Value value={overview.domainStatus} empty="Unknown" />
            {overview.expiresAt && <span className="text-hq-subtle-foreground"> · registration expires {formatDate(overview.expiresAt)}</span>}
          </DetailItem>
          <DetailItem label="Name servers">
            <Value value={overview.nameServers.length > 0 ? overview.nameServers.join(', ') : null} empty="Unknown" mono />
          </DetailItem>
          <DetailItem label="Application address">
            <Value value={overview.expectedAddresses.length > 0 ? overview.expectedAddresses.join(', ') : null} empty="Not set (PLATFORM_PUBLIC_IPS)" mono />
          </DetailItem>
          <DetailItem label="Last read from provider">
            <Value value={formatDateTime(overview.lastSyncedAt)} empty="Never" />
            {overview.lastSyncError && <p className="mt-1 text-hq-danger break-words">{overview.lastSyncError}</p>}
          </DetailItem>
          <DetailItem label="Verification">
            {verification ? (
              <span className={verification.verified ? 'text-hq-success font-semibold' : 'text-hq-danger font-semibold'}>
                {verification.verified ? 'Verified' : 'Not verified'}
              </span>
            ) : (
              <Value value={null} empty="Not checked yet" />
            )}
            {verification && <span className="text-hq-subtle-foreground"> · {formatDateTime(verification.at)}</span>}
          </DetailItem>
        </DetailList>

        {verification && (
          <ul className="mt-4 space-y-1.5 text-xs" aria-label="Verification checks">
            {verification.checks.map((check) => (
              <li key={check.check} className="flex items-start gap-2">
                {check.verified ? (
                  <Check className="w-3.5 h-3.5 mt-px text-hq-success shrink-0" aria-hidden="true" />
                ) : (
                  <X className="w-3.5 h-3.5 mt-px text-hq-danger shrink-0" aria-hidden="true" />
                )}
                <span>
                  <span className="font-semibold text-hq-foreground">{check.check}</span>
                  <span className="sr-only">{check.verified ? ': verified' : ': not verified'}</span>
                  <span className="text-hq-muted-foreground"> — {check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {ready && (
          <div className="mt-4 border-t border-hq-border pt-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-xs text-hq-muted-foreground">
              <span className="font-mono text-hq-foreground">*.{domain}</span> sends every workspace address to the application, so new workspaces need
              no DNS change.
            </p>
            <button type="button" onClick={() => open({ kind: 'wildcard' })} disabled={overview.expectedAddresses.length === 0} className={secondaryButtonClass}>
              Point wildcard at application
            </button>
          </div>
        )}
      </Panel>

      {notice && (
        <p role="status" className="rounded-xl border border-hq-info/30 bg-hq-info/10 px-3.5 py-3 text-xs text-hq-info">
          {notice}
        </p>
      )}

      {ready && (
        <section className="space-y-3" aria-labelledby="dns-records-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="dns-records-heading" className="text-sm font-bold text-hq-foreground">
              DNS records
            </h3>
            <button type="button" onClick={() => open({ kind: 'add' })} disabled={!records} className={primaryButtonClass}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add record
            </button>
          </div>
          {recordsError && <ErrorBanner message={recordsError} onRetry={() => void loadRecords()} />}
          <TableShell
            caption={`DNS records for ${domain}`}
            columns={[{ label: 'Type' }, { label: 'Name' }, { label: 'Value' }, { label: 'TTL' }, { label: 'Priority' }, { label: 'Status' }, { label: 'Actions', align: 'right' }]}
            minWidth={860}
            busy={isLoadingRecords}
          >
            {isLoadingRecords && !records && <LoadingRows columns={7} />}
            {records && records.length === 0 && <EmptyRow columns={7} title="No records" detail="The provider returned an empty zone." />}
            {(records ?? []).map((record, index) => (
              <tr key={`${record.type}-${record.name}-${record.data}-${index}`} className="align-top hover:bg-hq-accent">
                <td className="py-3 px-4 font-mono font-semibold text-hq-foreground">{record.type}</td>
                <td className="py-3 px-4">
                  <div className="font-mono text-hq-foreground break-all">{record.name}</div>
                  <div className="text-[10px] text-hq-subtle-foreground break-all">{fqdn(record.name, domain)}</div>
                </td>
                <td className="py-3 px-4 font-mono text-hq-foreground break-all max-w-xs">{record.data}</td>
                <td className="py-3 px-4 tabular-nums text-hq-foreground/90">{record.ttl}</td>
                <td className="py-3 px-4 tabular-nums text-hq-foreground/90">{record.priority ?? '—'}</td>
                <td className="py-3 px-4 text-hq-muted-foreground">{record.editable ? 'Editable' : 'Read-only'}</td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  {record.editable && (
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => open({ kind: 'edit', type: record.type, name: record.name })}
                        className="p-1.5 rounded-md text-hq-muted-foreground hover:text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
                        aria-label={`Edit ${record.type} ${record.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => open({ kind: 'delete', type: record.type, name: record.name })}
                        className="p-1.5 rounded-md text-hq-danger hover:bg-hq-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
                        aria-label={`Delete ${record.type} ${record.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
          <p className="text-[11px] text-hq-subtle-foreground">
            NS, SOA, SRV and CAA records are shown but changed only at the provider. The minimum TTL is {MIN_TTL} seconds.
          </p>
        </section>
      )}

      {dialog?.kind === 'add' && (
        <ConfirmDialog
          title={`Add a DNS record to ${domain}`}
          confirmLabel="Add record"
          busyLabel="Adding…"
          tone="primary"
          isBusy={isBusy}
          error={dialogError}
          initialFocus={firstFieldRef}
          onConfirm={() => void run(() => platformDnsApi.create({ type: draft.type, name: draft.name.trim(), ...toValues()[0] }), 'Record added.')}
          onCancel={() => setDialog(null)}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dns-type" className={labelClass}>
                Type
              </label>
              <select ref={firstFieldRef} id="dns-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className={fieldClass}>
                {EDITABLE_RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dns-name" className={labelClass}>
                Name
              </label>
              <input id="dns-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="@, * or mail" className={`${fieldClass} font-mono`} />
            </div>
          </div>
          <ValueFields draft={draft} setDraft={setDraft} />
          {draft.name.trim() && <p className="text-[11px] text-hq-subtle-foreground">Creates {fqdn(draft.name.trim(), domain)}.</p>}
        </ConfirmDialog>
      )}

      {dialog?.kind === 'edit' && (
        <ConfirmDialog
          title={`Change ${dialog.type} ${fqdn(dialog.name, domain)}`}
          confirmLabel="Save record"
          busyLabel="Saving…"
          tone="danger"
          isBusy={isBusy}
          error={dialogError}
          initialFocus={firstValueRef}
          onConfirm={() => void run(() => platformDnsApi.replace(dialog.type, dialog.name, toValues()), 'Record updated.')}
          onCancel={() => setDialog(null)}
        >
          <p>These values replace every current {dialog.type} value for this name. Anything that relies on the old values stops working.</p>
          <ValueFields draft={draft} setDraft={setDraft} firstRef={firstValueRef} allowMany />
        </ConfirmDialog>
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${dialog.type} ${fqdn(dialog.name, domain)}?`}
          confirmLabel="Delete record"
          busyLabel="Deleting…"
          tone="danger"
          isBusy={isBusy}
          error={dialogError}
          onConfirm={() => void run(() => platformDnsApi.remove(dialog.type, dialog.name), 'Record deleted.')}
          onCancel={() => setDialog(null)}
        >
          <p>
            Every {dialog.type} value for this name is removed:{' '}
            <span className="font-mono">{matching(dialog.type, dialog.name).map((r) => r.data).join(', ')}</span>.
            {dialog.name === '@' || dialog.name === '*'
              ? ' This is a platform record: the site or every workspace address can stop working.'
              : ' Anything that uses this name stops resolving.'}
          </p>
        </ConfirmDialog>
      )}

      {dialog?.kind === 'wildcard' && (
        <ConfirmDialog
          title={`Point *.${domain} at ${overview.expectedAddresses.join(', ')}?`}
          confirmLabel="Update wildcard"
          busyLabel="Updating…"
          tone="danger"
          isBusy={isBusy}
          error={dialogError}
          onConfirm={() => void run(() => platformDnsApi.configureWildcard(), 'Wildcard updated.')}
          onCancel={() => setDialog(null)}
        >
          <p>
            Every workspace address will resolve to {overview.expectedAddresses.join(', ')}.
            {matching('A', '*').length > 0 && ` It currently points to ${matching('A', '*').map((r) => r.data).join(', ')}.`} Names with their own
            records are not affected.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};

const ValueFields: React.FC<{
  draft: Draft;
  setDraft: (draft: Draft) => void;
  firstRef?: React.RefObject<HTMLInputElement>;
  allowMany?: boolean;
}> = ({ draft, setDraft, firstRef, allowMany }) => {
  const change = (index: number, key: 'data' | 'ttl' | 'priority', value: string) =>
    setDraft({ ...draft, values: draft.values.map((v, i) => (i === index ? { ...v, [key]: value } : v)) });
  const hint: Record<string, string> = {
    A: 'An IPv4 address.',
    AAAA: 'An IPv6 address.',
    CNAME: 'A host name, such as example.com.',
    MX: 'A mail server host name.',
    TXT: 'Text, such as a verification string.',
  };

  return (
    <div className="space-y-3">
      {draft.values.map((value, index) => (
        <div key={index} className={`grid gap-2 ${draft.type === 'MX' ? 'grid-cols-[1fr_5.5rem_5rem]' : 'grid-cols-[1fr_5.5rem]'} items-end`}>
          <div>
            <label htmlFor={`dns-value-${index}`} className={labelClass}>
              Value {draft.values.length > 1 ? index + 1 : ''}
            </label>
            <input
              ref={index === 0 ? firstRef : undefined}
              id={`dns-value-${index}`}
              value={value.data}
              onChange={(e) => change(index, 'data', e.target.value)}
              className={`${fieldClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor={`dns-ttl-${index}`} className={labelClass}>
              TTL (s)
            </label>
            <input id={`dns-ttl-${index}`} type="number" min={MIN_TTL} value={value.ttl} onChange={(e) => change(index, 'ttl', e.target.value)} className={fieldClass} />
          </div>
          {draft.type === 'MX' && (
            <div>
              <label htmlFor={`dns-priority-${index}`} className={labelClass}>
                Priority
              </label>
              <input id={`dns-priority-${index}`} type="number" min={0} value={value.priority} onChange={(e) => change(index, 'priority', e.target.value)} className={fieldClass} />
            </div>
          )}
          {allowMany && draft.values.length > 1 && (
            <button
              type="button"
              onClick={() => setDraft({ ...draft, values: draft.values.filter((_, i) => i !== index) })}
              className="text-[11px] font-semibold text-hq-danger justify-self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded"
            >
              Remove value {index + 1}
            </button>
          )}
        </div>
      ))}
      <p className="text-[11px] text-hq-subtle-foreground">{hint[draft.type] ?? ''}</p>
      {allowMany && (
        <button
          type="button"
          onClick={() => setDraft({ ...draft, values: [...draft.values, { data: '', ttl: String(MIN_TTL), priority: '' }] })}
          className="text-[11px] font-semibold text-hq-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded"
        >
          Add another value
        </button>
      )}
    </div>
  );
};
