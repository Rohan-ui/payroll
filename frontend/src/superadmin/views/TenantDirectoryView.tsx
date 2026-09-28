import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, RefreshCw, Plus, Building2 } from 'lucide-react';
import {
  platformDirectoryApi,
  Page,
  TenantFilterOptions,
  TenantListItem,
  TenantListQuery,
  TenantSort,
} from '../api/platform-directory.api';
import { ProvisionTenantView } from './ProvisionTenantView';
import { TenantDetailView } from './TenantDetailView';
import { Timestamp } from './UserTable';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { ErrorBanner, Value } from '../components/DetailList';
import { formatDate, humanize, localDayEnd, localDayStart, seatUsage } from '../format';
import { hashRoute, useHashRouteId } from '../hash-route';

const SORTS: { value: string; label: string }[] = [
  { value: 'created:desc', label: 'Newest first' },
  { value: 'created:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'code:asc', label: 'Tenant code' },
  { value: 'lastActivity:desc', label: 'Recently active' },
  { value: 'members:desc', label: 'Most users' },
];

interface Filters {
  status: string;
  plan: string;
  subscriptionStatus: string;
  /** "<MODULE>:on" or "<MODULE>:off". */
  module: string;
  createdFrom: string;
  createdTo: string;
  sort: string;
  pageSize: number;
}

const DEFAULT_FILTERS: Filters = {
  status: '',
  plan: '',
  subscriptionStatus: '',
  module: '',
  createdFrom: '',
  createdTo: '',
  sort: 'created:desc',
  pageSize: 25,
};

const inputClass =
  'h-10 px-3 text-xs rounded-xl border border-hq-border bg-hq-input text-hq-foreground placeholder:text-hq-subtle-foreground focus:outline-none focus:ring-2 focus:ring-hq-ring disabled:opacity-50';
const labelClass = 'block text-[11px] font-semibold text-hq-muted-foreground mb-1';

function toQuery(filters: Filters, search: string, page: number): TenantListQuery {
  const [sort, order] = filters.sort.split(':') as [TenantSort, 'asc' | 'desc'];
  const [module, state] = filters.module ? filters.module.split(':') : [undefined, undefined];
  return {
    page,
    pageSize: filters.pageSize,
    search: search || undefined,
    status: filters.status || undefined,
    plan: filters.plan || undefined,
    subscriptionStatus: filters.subscriptionStatus || undefined,
    module,
    moduleEnabled: module ? state === 'on' : undefined,
    createdFrom: filters.createdFrom ? localDayStart(filters.createdFrom) : undefined,
    createdTo: filters.createdTo ? localDayEnd(filters.createdTo) : undefined,
    sort,
    order,
  };
}

/**
 * Every workspace on the platform. Only the platform API (a SUPER_ADMIN
 * session) serves this list; searching, filtering and paging run on the server.
 */
export const TenantDirectoryView: React.FC = () => {
  const selectedTenantId = useHashRouteId('tenants');

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<TenantListItem> | null>(null);
  const [options, setOptions] = useState<TenantFilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  // Search as the operator types, without a request per keystroke.
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
      const data = await platformDirectoryApi.listTenants(toQuery(filters, search, page));
      if (request === requestRef.current) setResult(data);
    } catch (err) {
      if (request === requestRef.current) setError(err instanceof Error ? err.message : 'Could not load workspaces.');
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [filters, search, page]);

  useEffect(() => {
    if (!selectedTenantId) void load();
  }, [load, selectedTenantId]);

  useEffect(() => {
    platformDirectoryApi
      .tenantFilterOptions()
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const hasFilters =
    search !== '' || Object.entries(filters).some(([key, value]) => value !== DEFAULT_FILTERS[key as keyof Filters]);

  if (selectedTenantId === 'new') {
    return <ProvisionTenantView />;
  }
  if (selectedTenantId) {
    return <TenantDetailView tenantId={selectedTenantId} />;
  }

  const items = result?.items ?? [];

  return (
    <section className="space-y-5" aria-labelledby="tenant-directory-heading">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 id="tenant-directory-heading" className="text-base font-bold text-hq-foreground">
            All workspaces
          </h2>
          <p className="text-xs text-hq-muted-foreground mt-1">
            Every customer workspace on the platform. Open one to see its owner, members, roles, modules and activity.
          </p>
        </div>
        <a
          href={hashRoute('tenants', 'new')}
          className="inline-flex items-center gap-2 px-3.5 h-10 text-xs font-bold text-hq-primary-foreground bg-hq-primary hover:bg-hq-primary-hover rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring focus-visible:ring-offset-2 focus-visible:ring-offset-hq-background transition-colors self-start"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Provision tenant
        </a>
      </div>

      <form
        role="search"
        aria-label="Filter workspaces"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          setPage(1);
        }}
      >
        <div className="sm:col-span-2">
          <label htmlFor="tenant-search" className={labelClass}>
            Search
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-hq-subtle-foreground pointer-events-none" aria-hidden="true" />
            <input
              id="tenant-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Name, code, subdomain, owner name or email"
              className={`${inputClass} w-full pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="tenant-status" className={labelClass}>
            Status
          </label>
          <select id="tenant-status" value={filters.status} onChange={(event) => update('status', event.target.value)} className={`${inputClass} w-full`}>
            <option value="">All statuses</option>
            {(options?.statuses ?? []).map((status) => (
              <option key={status} value={status}>
                {humanize(status)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tenant-plan" className={labelClass}>
            Plan
          </label>
          <select
            id="tenant-plan"
            value={filters.plan}
            onChange={(event) => update('plan', event.target.value)}
            disabled={!options || options.plans.length === 0}
            className={`${inputClass} w-full`}
          >
            <option value="">{options && options.plans.length === 0 ? 'No plans exist yet' : 'All plans'}</option>
            {(options?.plans ?? []).map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tenant-subscription" className={labelClass}>
            Subscription
          </label>
          <select
            id="tenant-subscription"
            value={filters.subscriptionStatus}
            onChange={(event) => update('subscriptionStatus', event.target.value)}
            disabled={!options || options.subscriptionStatuses.length === 0}
            className={`${inputClass} w-full`}
          >
            <option value="">
              {options && options.subscriptionStatuses.length === 0 ? 'No subscriptions yet' : 'Any subscription'}
            </option>
            {(options?.subscriptionStatuses ?? []).map((status) => (
              <option key={status} value={status}>
                {humanize(status)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tenant-module" className={labelClass}>
            Module
          </label>
          <select id="tenant-module" value={filters.module} onChange={(event) => update('module', event.target.value)} className={`${inputClass} w-full`}>
            <option value="">Any modules</option>
            {(options?.modules ?? []).flatMap((module) => [
              <option key={`${module.code}:on`} value={`${module.code}:on`}>
                {module.name} on
              </option>,
              <option key={`${module.code}:off`} value={`${module.code}:off`}>
                {module.name} off
              </option>,
            ])}
          </select>
        </div>

        <div>
          <label htmlFor="tenant-created-from" className={labelClass}>
            Created from
          </label>
          <input
            id="tenant-created-from"
            type="date"
            value={filters.createdFrom}
            max={filters.createdTo || undefined}
            onChange={(event) => update('createdFrom', event.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        <div>
          <label htmlFor="tenant-created-to" className={labelClass}>
            Created to
          </label>
          <input
            id="tenant-created-to"
            type="date"
            value={filters.createdTo}
            min={filters.createdFrom || undefined}
            onChange={(event) => update('createdTo', event.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        <div>
          <label htmlFor="tenant-sort" className={labelClass}>
            Sort by
          </label>
          <select id="tenant-sort" value={filters.sort} onChange={(event) => update('sort', event.target.value)} className={`${inputClass} w-full`}>
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tenant-page-size" className={labelClass}>
            Per page
          </label>
          <select
            id="tenant-page-size"
            value={filters.pageSize}
            onChange={(event) => update('pageSize', Number(event.target.value))}
            className={`${inputClass} w-full`}
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setSearchInput('');
              setSearch('');
              setPage(1);
            }}
            disabled={!hasFilters}
            className="h-10 px-3.5 text-xs font-bold rounded-xl border border-hq-border text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-40"
          >
            Clear filters
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Refresh workspace list"
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-hq-border text-hq-foreground/90 hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </form>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div className="border border-hq-border rounded-xl overflow-hidden bg-hq-card" aria-busy={isLoading}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
            <caption className="sr-only">Workspaces on the platform</caption>
            <thead>
              <tr className="bg-hq-muted border-b border-hq-border text-hq-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                <th scope="col" className="py-3 px-4">Workspace</th>
                <th scope="col" className="py-3 px-4">Status</th>
                <th scope="col" className="py-3 px-4">Plan</th>
                <th scope="col" className="py-3 px-4">Owner</th>
                <th scope="col" className="py-3 px-4">Members</th>
                <th scope="col" className="py-3 px-4">Seats used</th>
                <th scope="col" className="py-3 px-4">Modules on</th>
                <th scope="col" className="py-3 px-4">Timezone · currency</th>
                <th scope="col" className="py-3 px-4">Last activity</th>
                <th scope="col" className="py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hq-border">
              {isLoading &&
                items.length === 0 &&
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden="true">
                    <td colSpan={10} className="py-4 px-4">
                      <div className="h-4 rounded bg-hq-muted animate-pulse motion-reduce:animate-none" />
                    </td>
                  </tr>
                ))}

              {!isLoading && !error && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 px-4">
                    <div className="flex flex-col items-center text-center max-w-sm mx-auto">
                      <Building2 className="w-8 h-8 text-hq-muted-foreground mb-3" aria-hidden="true" />
                      <p className="font-bold text-hq-foreground text-sm">
                        {hasFilters ? 'No workspaces match these filters' : 'No tenant workspaces yet'}
                      </p>
                      <p className="text-hq-muted-foreground mt-1.5 leading-relaxed">
                        {hasFilters
                          ? 'Clear the filters or search for something else.'
                          : 'Provision the first workspace to start onboarding a customer onto the platform.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {items.map((tenant) => {
                const enabled = tenant.modules.filter((m) => m.enabled);
                return (
                  <tr key={tenant.id} className="align-top hover:bg-hq-accent transition-colors">
                    <td className="py-3 px-4 max-w-[16rem]">
                      <a
                        href={hashRoute('tenants', tenant.id)}
                        className="font-bold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded break-words"
                      >
                        {tenant.name}
                      </a>
                      <div className="text-[10px] text-hq-subtle-foreground break-words">{tenant.legalName}</div>
                      <div className="font-mono text-[10px] text-hq-link break-all">{tenant.tenantCode}</div>
                      <div className="font-mono text-[10px] text-hq-subtle-foreground" title={tenant.id}>
                        ID {tenant.id.slice(0, 8)}…
                      </div>
                      <div className="mt-1 text-[10px] break-all">
                        {tenant.address ? (
                          <span className="font-mono text-hq-foreground/90">{tenant.address}</span>
                        ) : tenant.subdomain ? (
                          <span className="font-mono text-hq-foreground/90">{tenant.subdomain} <span className="font-sans text-hq-subtle-foreground">(no base domain set)</span></span>
                        ) : (
                          <span className="text-hq-subtle-foreground italic">No address</span>
                        )}
                        {tenant.addressStatus && <span className="ml-1 text-hq-subtle-foreground">· {humanize(tenant.addressStatus).toLowerCase()}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={tenant.status} />
                    </td>
                    <td className="py-3 px-4">
                      {tenant.plan ? (
                        <>
                          <div className="text-hq-foreground">{tenant.plan.name ?? tenant.plan.code}</div>
                          {tenant.subscriptionStatus && <div className="text-hq-subtle-foreground">{humanize(tenant.subscriptionStatus)}</div>}
                        </>
                      ) : (
                        <span className="text-hq-subtle-foreground italic">No plan</span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-[14rem]">
                      {tenant.owner ? (
                        <>
                          <div className="text-hq-foreground break-words">
                            <Value value={tenant.owner.name} empty="No name" />
                          </div>
                          <div className="text-hq-muted-foreground break-all">{tenant.owner.email}</div>
                          <div className="text-hq-subtle-foreground">
                            <Value value={tenant.owner.phone} empty="No phone" />
                          </div>
                        </>
                      ) : (
                        <span className="text-hq-warning/90">No active owner</span>
                      )}
                    </td>
                    <td className="py-3 px-4 tabular-nums text-hq-foreground whitespace-nowrap">
                      {tenant.members.active} active
                      {tenant.members.suspended > 0 && <div className="text-hq-warning">{tenant.members.suspended} suspended</div>}
                      {tenant.members.accountsDisabled > 0 && (
                        <div className="text-hq-danger">{tenant.members.accountsDisabled} account{tenant.members.accountsDisabled === 1 ? '' : 's'} disabled</div>
                      )}
                      <div className="text-hq-subtle-foreground">
                        {tenant.members.removed} removed · {tenant.members.allTime} all time
                      </div>
                    </td>
                    <td className="py-3 px-4 tabular-nums text-hq-foreground whitespace-nowrap">
                      {seatUsage(tenant.seats.used, tenant.seats.limit)}
                    </td>
                    <td className="py-3 px-4">
                      {enabled.length > 0 ? (
                        <ul className="space-y-0.5">
                          {enabled.map((m) => (
                            <li key={m.code} className="text-hq-foreground whitespace-nowrap">
                              {m.name}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-hq-subtle-foreground italic">All off</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-hq-foreground/90">
                      <Value value={tenant.timezone} empty="No timezone" />
                      <div className="text-hq-subtle-foreground">{tenant.currency}</div>
                    </td>
                    <td className="py-3 px-4 text-hq-foreground/90 whitespace-nowrap">
                      <Timestamp value={tenant.lastActivityAt} empty="No sign-ins yet" />
                    </td>
                    <td className="py-3 px-4 text-hq-muted-foreground whitespace-nowrap">
                      <time dateTime={tenant.createdAt}>{formatDate(tenant.createdAt)}</time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {result && (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          noun="workspaces"
          disabled={isLoading}
          onPageChange={setPage}
        />
      )}

      <p className="text-[11px] text-hq-subtle-foreground leading-relaxed">
        Last activity is the most recent signed-in request from any member. Seats count current members (active and
        suspended); removed members stay in the history but never use a seat.
      </p>

    </section>
  );
};
