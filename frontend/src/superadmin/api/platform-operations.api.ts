import { platformApi } from './platform-client';

const BASE = '/api/v1/super-admin';
const id = encodeURIComponent;

/** A workspace's organization details, as HQ edits them. Empty optional fields are cleared. */
export interface TenantOrganizationInput {
  organizationName: string;
  legalName: string;
  industry?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  countryCode?: string;
  taxId?: string;
  timezone: string;
  currency: string;
}

export interface SubscriptionInput {
  planCode: string;
  status: 'ACTIVE' | 'TRIALING';
  startsOn: string;
  endsOn?: string;
  trialEndsOn?: string;
}

/** A role a member can be given: one the workspace has, or a template it would be created from. */
export interface AssignableRole {
  code: string;
  name: string;
  source: 'WORKSPACE' | 'TEMPLATE';
}

export interface PermissionCatalogSection {
  section: string;
  module: string | null;
  groups: { group: string; permissions: { key: string; name: string }[] }[];
}

export interface RoleTemplate {
  code: string;
  name: string;
  description: string | null;
  /** OWNER: the locked Administrator role. SYSTEM: built in, editable, never deleted. */
  kind: 'OWNER' | 'SYSTEM' | 'CUSTOM';
  editable: boolean;
  deletable: boolean;
  permissions: string[];
  workspaces: number;
  activeMembers: number;
  updatedAt: string | null;
}

export interface RoleTemplateInput {
  name: string;
  description?: string;
  permissions: string[];
}

export interface MembershipResult {
  memberId: string;
  tenantId: string;
  roleCode: string | null;
  status: string;
}

export const platformOperationsApi = {
  updateTenant: (tenantId: string, input: TenantOrganizationInput) =>
    platformApi.put<{ id: string; changedFields: string[] }>(`${BASE}/tenants/${id(tenantId)}`, input),
  setModule: (tenantId: string, code: string, enabled: boolean) =>
    platformApi.put<{ code: string; name: string; enabled: boolean }>(`${BASE}/tenants/${id(tenantId)}/modules/${id(code)}`, { enabled }),
  changeSubscription: (tenantId: string, input: SubscriptionInput) =>
    platformApi.put<{ planCode: string; planName: string; status: string; startsOn: string }>(`${BASE}/tenants/${id(tenantId)}/subscription`, input),
  assignableRoles: (tenantId: string) => platformApi.get<AssignableRole[]>(`${BASE}/tenants/${id(tenantId)}/assignable-roles`),

  updateUser: (userId: string, input: { name: string; email: string; phone?: string }) =>
    platformApi.put<{ id: string; changedFields: string[] }>(`${BASE}/users/${id(userId)}`, input),
  addMembership: (userId: string, input: { tenantId: string; roleCode: string }) =>
    platformApi.post<MembershipResult>(`${BASE}/users/${id(userId)}/memberships`, input),
  updateMembership: (userId: string, memberId: string, input: { roleCode?: string; status?: 'ACTIVE' | 'SUSPENDED' }) =>
    platformApi.put<MembershipResult>(`${BASE}/users/${id(userId)}/memberships/${id(memberId)}`, input),
  /** A new temporary password is emailed to the account; the response never contains it. */
  resetPassword: (userId: string) =>
    platformApi.post<{
      userId: string;
      revokedSessions: number;
      email: { status: 'NOT_SENT' | 'QUEUED' | 'SENT' | 'FAILED'; recipient: string; error: string | null; deliveryId: string | null };
    }>(`${BASE}/users/${id(userId)}/reset-password`),
  removeMembership: (userId: string, memberId: string) =>
    platformApi.delete<MembershipResult>(`${BASE}/users/${id(userId)}/memberships/${id(memberId)}`),

  roleTemplates: () => platformApi.get<{ catalog: PermissionCatalogSection[]; templates: RoleTemplate[] }>(`${BASE}/roles-templates`),
  createRoleTemplate: (input: RoleTemplateInput & { code: string }) => platformApi.post<RoleTemplate>(`${BASE}/roles-templates`, input),
  updateRoleTemplate: (code: string, input: RoleTemplateInput) => platformApi.put<RoleTemplate>(`${BASE}/roles-templates/${id(code)}`, input),
  deleteRoleTemplate: (code: string) => platformApi.delete<{ code: string }>(`${BASE}/roles-templates/${id(code)}`),
};
