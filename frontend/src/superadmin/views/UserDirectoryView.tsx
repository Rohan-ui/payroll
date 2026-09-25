import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import {
  platformDirectoryApi,
  Page,
  TenantListItem,
  UserListItem,
  UserListQuery,
  UserSort,
} from '../api/platform-directory.api';
import { Pagination } from '../components/Pagination';
import { ErrorBanner } from '../components/DetailList';
import { useHashRouteId } from '../hash-route';
import { UserTable } from './UserTable';
import { UserDetailView } from './UserDetailView';

const SORTS: { value: string; label: string }[] = [
  { value: 'created:desc', label: 'Newest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'email:asc', label: 'Email A–Z' },
  { value: 'lastLogin:desc', label: 'Recent sign-in' },
  { value: 'lastActivity:desc', label: 'Recently active' },
];

/** Global account statuses a person can be in; sign-in accepts only Active. */
const ACCOUNT_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const MEMBERSHIP_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ARCHIVED', label: 'Removed' },
];

interface Filters {
  workspace: { id: string; label: string } | null;
  roleCode: string;
  accountStatus: string;
  membershipStatus: string;
  sort: string;
  pageSize: number;
}

const DEFAULT_FILTERS: Filters = {
  workspace: null,
  roleCode: '',
  accountStatus: '',
  membershipStatus: '',
  sort: 'created:desc',
  pageSize: 25,
};

const inputClass =
  'h-10 px-3 text-xs rounded-xl border border-hq-border bg-hq-input text-hq-foreground placeholder:text-hq-subtle-foreground focus:outline-none focus:ring-2 focus:ring-hq-ring disabled:opacity-50';
const labelClass = 'block text-[11px] font-semibold text-hq-muted-foreground mb-1';

const workspaceLabel = (tenant: TenantListItem) => `${tenant.name} (${tenant.tenantCode})`;

/**
 * Every user account on the platform, across all workspaces. A person appears
 * once however many workspaces they belong to.
 */
export const UserDirectoryView: React.FC = () => {
  const selectedUserId = useHashRouteId('users');
  const datalistId = useId();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<UserListItem> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<{ code: string; name: string }[]>([]);
  const [workspaceInput, setWorkspaceInput] = useState('');
  const [workspaceMatches, setWorkspaceMatches] = useState<TenantListItem[]>([]);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Workspace suggestions come from the server as the operator types.
  useEffect(() => {
    const term = workspaceInput.trim();
    if (term.length === 0) {
      setWorkspaceMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      platformDirectoryApi
        .listTenants({ page: 1, pageSize: 10, search: term, sort: 'name', order: 'asc' })
        .then((page) => setWorkspaceMatches(page.items))
        .catch(() => setWorkspaceMatches([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [workspaceInput]);

  const workspaceId = filters.workspace?.id;
  useEffect(() => {
    platformDirectoryApi
      .roleOptions(workspaceId)
      .then(setRoleOptions)
      .catch(() => setRoleOptions([]));
  }, [workspaceId]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const [sort, order] = filters.sort.split(':') as [UserSort, 'asc' | 'desc'];
    const query: UserListQuery = {
      page,
      pageSize: filters.pageSize,
      search: search || undefined,
      tenantId: filters.workspace?.id,
      roleCode: filters.roleCode || undefined,
      accountStatus: filters.accountStatus || undefined,
      membershipStatus: filters.membershipStatus || undefined,
      sort,
      order,
    };
    setIsLoading(true);
    setError(null);
    try {
      const data = await platformDirectoryApi.listUsers(query);
      if (request === requestRef.current) setResult(data);
    } catch (err) {
      if (request === requestRef.current) setError(err instanceof Error ? err.message : 'Could not load users.');
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [filters, search, page]);

  useEffect(() => {
    if (!selectedUserId) void load();
  }, [load, selectedUserId]);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const chooseWorkspace = (value: string) => {
    setWorkspaceInput(value);
    const match = workspaceMatches.find((tenant) => workspaceLabel(tenant) === value);
    if (match) {
      // A role code means different things in different workspaces, so the role choice starts over.
      setFilters((current) => ({ ...current, workspace: { id: match.id, label: workspaceLabel(match) }, roleCode: '' }));
      setPage(1);
      setWorkspaceInput('');
    }
  };

  const hasFilters =
    search !== '' || Object.entries(filters).some(([key, value]) => value !== DEFAULT_FILTERS[key as keyof Filters]);

  if (selectedUserId) {
    return <UserDetailView userId={selectedUserId} />;
  }

  return (
    <section className="space-y-5" aria-labelledby="user-directory-heading">
      <div>
        <h2 id="user-directory-heading" className="text-base font-bold text-hq-foreground">
          All users
        </h2>
        <p className="text-xs text-hq-muted-foreground mt-1">
          Every sign-in account on the platform with the workspaces it belongs to. Open one for its memberships,
          sessions and history.
        </p>
      </div>

      <form
        role="search"
        aria-label="Filter users"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          setPage(1);
        }}
      >
        <div className="sm:col-span-2">
          <label htmlFor="user-search" className={labelClass}>
            Search
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-hq-subtle-foreground pointer-events-none" aria-hidden="true" />
            <input
              id="user-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Name, email, phone, workspace or tenant code"
              className={`${inputClass} w-full pl-9`}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="user-workspace" className={labelClass}>
            Workspace
          </label>
          {filters.workspace ? (
            <div className="h-10 px-3 flex items-center justify-between gap-2 rounded-xl border border-hq-primary/40 bg-hq-primary/10 text-xs text-hq-link">
              <span className="truncate">{filters.workspace.label}</span>
              <button
                type="button"
                onClick={() => {
                  setFilters((current) => ({ ...current, workspace: null, roleCode: '' }));
                  setPage(1);
                }}
                aria-label={`Remove workspace filter ${filters.workspace.label}`}
                className="shrink-0 rounded p-0.5 hover:bg-hq-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <input
                id="user-workspace"
                type="text"
                list={datalistId}
                value={workspaceInput}
                onChange={(event) => chooseWorkspace(event.target.value)}
                placeholder="Type a workspace name or code"
                autoComplete="off"
                className={`${inputClass} w-full`}
              />
              <datalist id={datalistId}>
                {workspaceMatches.map((tenant) => (
                  <option key={tenant.id} value={workspaceLabel(tenant)} />
                ))}
              </datalist>
            </>
          )}
        </div>

        <div>
          <label htmlFor="user-role" className={labelClass}>
            Role
          </label>
          <select
            id="user-role"
            value={filters.roleCode}
            onChange={(event) => update('roleCode', event.target.value)}
            disabled={roleOptions.length === 0}
            className={`${inputClass} w-full`}
          >
            <option value="">{filters.workspace ? 'Any role in this workspace' : 'Any role'}</option>
            {roleOptions.map((role) => (
              <option key={role.code} value={role.code}>
                {role.name} ({role.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="user-account-status" className={labelClass}>
            Account status
          </label>
          <select
            id="user-account-status"
            value={filters.accountStatus}
            onChange={(event) => update('accountStatus', event.target.value)}
            className={`${inputClass} w-full`}
          >
            <option value="">Any account status</option>
            {ACCOUNT_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="user-membership-status" className={labelClass}>
            Membership status
          </label>
          <select
            id="user-membership-status"
            value={filters.membershipStatus}
            onChange={(event) => update('membershipStatus', event.target.value)}
            className={`${inputClass} w-full`}
          >
            <option value="">Any membership status</option>
            {MEMBERSHIP_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="user-sort" className={labelClass}>
            Sort by
          </label>
          <select id="user-sort" value={filters.sort} onChange={(event) => update('sort', event.target.value)} className={`${inputClass} w-full`}>
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="user-page-size" className={labelClass}>
            Per page
          </label>
          <select
            id="user-page-size"
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
              setWorkspaceInput('');
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
            aria-label="Refresh user list"
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-hq-border text-hq-foreground/90 hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </form>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div aria-busy={isLoading}>
        <UserTable
          items={result?.items ?? []}
          isLoading={isLoading}
          focusTenantId={filters.workspace?.id}
          emptyTitle={hasFilters ? 'No users match these filters' : 'No user accounts yet'}
          emptyDetail={
            hasFilters
              ? 'Clear the filters or search for something else.'
              : 'Accounts appear here once a workspace is provisioned or an administrator adds a member.'
          }
        />
      </div>

      {result && (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          noun="users"
          disabled={isLoading}
          onPageChange={setPage}
        />
      )}

      <p className="text-[11px] text-hq-subtle-foreground leading-relaxed">
        Last session shows the browser and sign-in address recorded for the most recent session. Two-factor sign-in,
        invitations and location are not recorded for workspace accounts, so they are not shown. Workspace
        administrators add members directly; there is no invitation to accept or expire.
      </p>
    </section>
  );
};
