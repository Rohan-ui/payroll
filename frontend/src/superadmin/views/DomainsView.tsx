import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Page } from '../api/platform-directory.api';
import { DomainItem, platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyRow, LoadingRows, TableShell } from '../components/TableShell';
import { fieldClass, labelClass, secondaryButtonClass } from '../components/form-styles';
import { formatDateTime } from '../format';
import { hashRoute } from '../hash-route';
import { Timestamp } from './UserTable';
import { DnsZonePanel } from './DnsZonePanel';

const STATUSES = ['PENDING', 'PROVISIONING', 'ACTIVE', 'FAILED'];

/**
 * Workspace addresses. With wildcard DNS and a wildcard certificate a new
 * subdomain needs no DNS record or certificate; verification only confirms
 * that it reaches this application over HTTPS.
 */
export const DomainsView: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<(Page<DomainItem> & { baseDomain: string | null }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await platformGovernanceApi.domains({ page, pageSize: 25, search: search || undefined, status: status || undefined });
      if (request === requestRef.current) setResult(data);
    } catch (err) {
      if (request === requestRef.current) setError(err instanceof Error ? err.message : 'Could not load addresses.');
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async (domain: DomainItem) => {
    setVerifying(domain.id);
    setNotice(null);
    try {
      const check = await platformGovernanceApi.verifyDomain(domain.id);
      setNotice(
        check.status === 'ACTIVE'
          ? `${domain.hostname ?? domain.subdomain} is reachable over HTTPS.`
          : `${domain.hostname ?? domain.subdomain}: ${check.error ?? 'the check did not pass.'}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not run.');
    } finally {
      setVerifying(null);
    }
  };

  const items = result?.items ?? [];
  const baseDomain = result?.baseDomain ?? null;

  return (
    <section className="space-y-5">
      <DnsZonePanel />

      <h3 className="text-sm font-bold text-hq-foreground pt-2">Workspace addresses</h3>
      <Panel
        title="How workspace addresses work"
        description={
          baseDomain
            ? `Every workspace has an address under ${baseDomain}. Wildcard DNS and a wildcard certificate cover every subdomain, so creating a workspace needs no DNS record or certificate. The check below only confirms an address reaches this application.`
            : 'PLATFORM_BASE_DOMAIN is not set on the server, so workspace subdomains are stored but have no hostname yet and cannot be verified. Sign-in works by workspace choice instead.'
        }
      >
        <p className="text-xs text-hq-muted-foreground">
          A check looks up DNS for the address and requests its health endpoint over HTTPS. It never changes DNS, certificates or
          the server. Pending and failed addresses are retried in the background.
        </p>
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="domain-search" className={labelClass}>
            Search
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-hq-subtle-foreground pointer-events-none" aria-hidden="true" />
            <input
              id="domain-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Subdomain, workspace name or code"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="domain-status" className={labelClass}>
            Status
          </label>
          <select
            id="domain-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={fieldClass}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-hq-info/30 bg-hq-info/10 px-3.5 py-3 text-xs text-hq-info">
          {notice}
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <TableShell
        caption="Workspace addresses"
        columns={[{ label: 'Address' }, { label: 'Workspace' }, { label: 'Status' }, { label: 'Last check' }, { label: 'Action', align: 'right' }]}
        minWidth={820}
        busy={isLoading}
      >
        {isLoading && items.length === 0 && <LoadingRows columns={5} />}
        {!isLoading && items.length === 0 && (
          <EmptyRow columns={5} title="No addresses" detail={search || status ? 'Nothing matches these filters.' : 'Addresses appear when workspaces are created.'} />
        )}
        {items.map((domain) => (
          <tr key={domain.id} className="align-top hover:bg-hq-accent">
            <td className="py-3 px-4">
              <div className="font-mono text-hq-foreground break-all">{domain.hostname ?? `${domain.subdomain} (no base domain)`}</div>
              <div className="text-hq-subtle-foreground">
                {domain.kind === 'SUBDOMAIN' ? 'Platform subdomain' : 'Custom domain'}
                {domain.isPrimary ? ' · primary' : ''}
              </div>
            </td>
            <td className="py-3 px-4">
              <a
                href={hashRoute('tenants', domain.workspace.tenantId)}
                className="font-semibold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded break-words"
              >
                {domain.workspace.name}
              </a>
              <div className="font-mono text-[10px] text-hq-link">{domain.workspace.tenantCode}</div>
            </td>
            <td className="py-3 px-4 max-w-xs">
              <StatusBadge status={domain.status} />
              {domain.error && <p className="mt-1 text-hq-danger break-words">{domain.error}</p>}
              {domain.verifiedAt && <p className="mt-1 text-hq-subtle-foreground">Verified {formatDateTime(domain.verifiedAt)}</p>}
            </td>
            <td className="py-3 px-4 text-hq-foreground/90 whitespace-nowrap">
              <Timestamp value={domain.lastCheckedAt} empty="Not checked yet" />
              {domain.attempts > 0 && <div className="text-hq-subtle-foreground">{domain.attempts} failed</div>}
            </td>
            <td className="py-3 px-4 text-right">
              <button type="button" onClick={() => void verify(domain)} disabled={verifying !== null || !baseDomain} className={secondaryButtonClass}>
                <RefreshCw className={`w-3.5 h-3.5 ${verifying === domain.id ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                {verifying === domain.id ? 'Checking…' : 'Verify now'}
                <span className="sr-only"> {domain.hostname ?? domain.subdomain}</span>
              </button>
            </td>
          </tr>
        ))}
      </TableShell>

      {result && (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          noun="addresses"
          disabled={isLoading}
          onPageChange={setPage}
        />
      )}
    </section>
  );
};
