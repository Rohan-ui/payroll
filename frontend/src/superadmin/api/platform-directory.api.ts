import { platformApi } from './platform-client';

const BASE = '/api/v1/super-admin';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type RoleKind = 'OWNER' | 'BUILT_IN' | 'CUSTOM';

export interface RoleRef {
  code: string;
  name: string;
  kind: RoleKind;
}

export interface ModuleState {
  code: string;
  name: string;
  enabled: boolean;
}

export interface TenantListItem {
  id: string;
  tenantCode: string;
  name: string;
  legalName: string;
  status: string;
  /** The workspace's subdomain label; the full hostname is `address` when a base domain is configured. */
  subdomain: string | null;
  address: string | null;
  addressStatus: string | null;
  plan: { code: string; name: string | null } | null;
  subscriptionStatus: string | null;
  owner: { userId: string; name: string | null; email: string | null; phone: string | null } | null;
  /** Current members hold seats; removed members are kept for history and never use a seat. */
  members: { current: number; active: number; suspended: number; removed: number; allTime: number; accountsDisabled: number };
  seats: { limit: number | null; used: number };
  modules: ModuleState[];
  timezone: string | null;
  currency: string;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantFilterOptions {
  statuses: string[];
  plans: { code: string; name: string }[];
  subscriptionStatuses: string[];
  modules: { code: string; name: string }[];
}

export type TenantSort = 'created' | 'name' | 'code' | 'status' | 'lastActivity' | 'members';

export interface TenantListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  plan?: string;
  subscriptionStatus?: string;
  module?: string;
  moduleEnabled?: boolean;
  createdFrom?: string;
  createdTo?: string;
  sort?: TenantSort;
  order?: 'asc' | 'desc';
}

export interface TenantDetail {
  overview: {
    id: string;
    tenantCode: string;
    name: string;
    legalName: string;
    status: string;
    countryCode: string | null;
    subdomain: string | null;
    address: string | null;
    addressProvisioning: {
      domainId: string;
      status: string;
      error: string | null;
      attempts: number;
      lastCheckedAt: string | null;
      verifiedAt: string | null;
    } | null;
    plan: { code: string; name: string } | null;
    subscription: { status: string; startsOn: string; endsOn: string | null; trialEndsOn: string | null } | null;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  organization: {
    companyName: string | null;
    industry: string | null;
    taxId: string | null;
    currency: string | null;
    timezone: string | null;
    website: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    contactIsWorkspaceOwner: boolean;
    address: string | null;
  };
  owner: {
    userId: string;
    memberId: string;
    name: string | null;
    email: string;
    phone: string | null;
    accountStatus: string;
    membershipStatus: string;
    joinedAt: string | null;
    lastLoginAt: string | null;
    roles: RoleRef[];
  } | null;
  users: {
    total: number;
    active: number;
    suspended: number;
    removed: number;
    accountsDisabled: number;
    seatsLimit: number | null;
    seatsUsed: number;
  };
  roles: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    kind: RoleKind;
    status: string;
    memberCount: number;
    permissionCount: number;
  }[];
  modules: {
    code: string;
    name: string;
    description: string;
    enabled: boolean;
    requires: string[];
    features: string[];
    /** The module's feature groups from the permission catalog (People, Attendance, Leave…). */
    capabilities: string[];
  }[];
  health: {
    status: string;
    subscriptionStatus: string | null;
    lastActivityAt: string | null;
    activeSessions: number;
    ownerLastLoginAt: string | null;
    configuration: { key: string; label: string; configured: boolean }[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Keeps the portal compatible with detail responses from older deployments.
 * The health panel is derived data, so a missing section can be rebuilt from
 * the authoritative overview instead of crashing the whole tenant page.
 */
export function normalizeTenantDetail(value: unknown): TenantDetail {
  if (
    !isRecord(value) ||
    !isRecord(value.overview) ||
    !isRecord(value.organization) ||
    !isRecord(value.users) ||
    !Array.isArray(value.modules) ||
    !Array.isArray(value.roles)
  ) {
    throw new Error('Workspace detail response was incomplete. Refresh and try again.');
  }

  const overview = value.overview;
  const rawHealth = isRecord(value.health) ? value.health : {};
  const configuration = Array.isArray(rawHealth.configuration)
    ? rawHealth.configuration.filter(
        (item): item is { key: string; label: string; configured: boolean } =>
          isRecord(item) && typeof item.key === 'string' && typeof item.label === 'string' && typeof item.configured === 'boolean',
      )
    : [];

  const health: TenantDetail['health'] = {
    status: typeof rawHealth.status === 'string' ? rawHealth.status : typeof overview.status === 'string' ? overview.status : 'UNKNOWN',
    subscriptionStatus:
      typeof rawHealth.subscriptionStatus === 'string'
        ? rawHealth.subscriptionStatus
        : isRecord(overview.subscription) && typeof overview.subscription.status === 'string'
          ? overview.subscription.status
          : null,
    lastActivityAt: typeof rawHealth.lastActivityAt === 'string' ? rawHealth.lastActivityAt : null,
    activeSessions: typeof rawHealth.activeSessions === 'number' ? rawHealth.activeSessions : 0,
    ownerLastLoginAt: typeof rawHealth.ownerLastLoginAt === 'string' ? rawHealth.ownerLastLoginAt : null,
    configuration,
  };

  return { ...value, health } as TenantDetail;
}

export interface TenantActivityItem {
  id: string;
  source: 'WORKSPACE' | 'PLATFORM';
  occurredAt: string;
  action: string;
  subject: string;
  actor: { name: string | null; email: string | null } | null;
  description: string | null;
}

export interface Membership {
  memberId: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  tenantStatus: string;
  membershipStatus: string;
  joinedAt: string | null;
  roles: RoleRef[];
}

export interface UserListItem {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  accountStatus: string;
  createdAt: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  activeSessions: number;
  lastActivityAt: string | null;
  lastSignInIp: string | null;
  lastUserAgent: string | null;
  memberships: Membership[];
}

export type UserSort = 'created' | 'name' | 'email' | 'lastLogin' | 'lastActivity';

export interface UserListQuery {
  page: number;
  pageSize: number;
  search?: string;
  tenantId?: string;
  roleCode?: string;
  accountStatus?: string;
  membershipStatus?: string;
  sort?: UserSort;
  order?: 'asc' | 'desc';
}

export interface WorkspaceRef {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
}

export interface UserDetail {
  identity: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    emailVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  account: {
    status: string;
    lastLoginAt: string | null;
    failedSignInAttempts: number;
    lockedUntil: string | null;
  };
  memberships: (Membership & { removedAt: string | null })[];
  sessions: {
    active: number;
    recent: {
      id: string;
      workspace: WorkspaceRef | null;
      signedInAt: string;
      lastUsedAt: string;
      expiresAt: string;
      revokedAt: string | null;
      isActive: boolean;
      ipAddress: string | null;
      userAgent: string | null;
    }[];
  };
  activity: {
    id: string;
    source: 'WORKSPACE' | 'CRM';
    occurredAt: string;
    workspace: WorkspaceRef | null;
    action: string;
    subject: string;
  }[];
  securityEvents: {
    id: string;
    source: 'WORKSPACE' | 'PLATFORM';
    occurredAt: string;
    workspace: WorkspaceRef | null;
    action: string;
    actor: string | null;
    description: string | null;
  }[];
}

/** Builds a query string from the set values only. */
export function toQueryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const platformDirectoryApi = {
  listTenants: (query: TenantListQuery) => platformApi.get<Page<TenantListItem>>(`${BASE}/tenants${toQueryString(query)}`),
  tenantFilterOptions: () => platformApi.get<TenantFilterOptions>(`${BASE}/tenants/filter-options`),
  getTenant: async (id: string) => normalizeTenantDetail(await platformApi.get<unknown>(`${BASE}/tenants/${encodeURIComponent(id)}`)),
  tenantActivity: (id: string, page: number, pageSize = 25) =>
    platformApi.get<Page<TenantActivityItem>>(
      `${BASE}/tenants/${encodeURIComponent(id)}/activity${toQueryString({ page, pageSize })}`,
    ),
  suspendTenant: (id: string) => platformApi.post<{ id: string; status: string }>(`${BASE}/tenants/${encodeURIComponent(id)}/suspend`),
  reactivateTenant: (id: string) =>
    platformApi.post<{ id: string; status: string }>(`${BASE}/tenants/${encodeURIComponent(id)}/reactivate`),

  listUsers: (query: UserListQuery) => platformApi.get<Page<UserListItem>>(`${BASE}/users${toQueryString(query)}`),
  roleOptions: (tenantId?: string) =>
    platformApi.get<{ code: string; name: string }[]>(`${BASE}/users/role-options${toQueryString({ tenantId })}`),
  getUser: (id: string) => platformApi.get<UserDetail>(`${BASE}/users/${encodeURIComponent(id)}`),
  disableUser: (id: string) =>
    platformApi.post<{ id: string; accountStatus: string; revokedSessions: number }>(
      `${BASE}/users/${encodeURIComponent(id)}/disable`,
    ),
  enableUser: (id: string) =>
    platformApi.post<{ id: string; accountStatus: string }>(`${BASE}/users/${encodeURIComponent(id)}/enable`),
};
