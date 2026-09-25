import { platformApi } from './platform-client';
import { Page, toQueryString } from './platform-directory.api';

const BASE = '/api/v1/super-admin';

export interface Money {
  currency: string;
  /** Decimal string from the server; never converted to a float for arithmetic. */
  amount: string;
}

export interface CommandCentre {
  generatedAt: string;
  workspaces: {
    total: number;
    byStatus: Record<string, number>;
    createdLast30Days: number;
    newest: { id: string; tenantCode: string; name: string; status: string; createdAt: string }[];
  };
  people: {
    accounts: number;
    accountsNotActive: number;
    activeMemberships: number;
    suspendedMemberships: number;
    removedMemberships: number;
  };
  activity: {
    activeUsers24h: number;
    activeUsers7d: number;
    activeUsers30d: number;
    signIns24h: number;
    signIns7d: number;
    liveSessions: number;
  };
  seats: {
    workspacesWithLimit: number;
    workspacesWithoutLimit: number;
    seatLimitTotal: number | null;
    seatsUsedInLimitedWorkspaces: number;
  };
  growth: { tenantId: string; tenantCode: string; name: string; newMembers: number }[];
  subscriptions: { byStatus: Record<string, number>; total: number; renewalsDue14Days: number };
  billing: { invoicesByStatus: Record<string, number>; invoiceCount: number; outstanding: Money[]; collectedLast30Days: Money[] };
  support: { open: number; total: number };
  security: {
    failedPlatformSignIns24h: number;
    livePlatformSessions: number;
    platformAccounts: number;
    platformAccountsWithoutMfa: number;
  };
  recentActivity: {
    id: string;
    occurredAt: string;
    category: string;
    action: string;
    description: string;
    actor: string | null;
  }[];
  unavailable: { metric: string; reason: string }[];
}

export interface DomainItem {
  id: string;
  workspace: { tenantId: string; tenantCode: string; name: string; status: string };
  kind: string;
  subdomain: string | null;
  hostname: string | null;
  isPrimary: boolean;
  status: string;
  error: string | null;
  attempts: number;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface DomainCheck {
  id: string;
  status: string;
  error: string | null;
  attempts: number;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
}

export interface BillingSummary {
  plans: { id: string; code: string; name: string; billingInterval: string | null; status: string }[];
  subscriptionsByStatus: Record<string, number>;
  invoicesByStatus: Record<string, number>;
  totalsByCurrency: { currency: string; outstanding: string; paid: string }[];
  coupons: { active: number; total: number };
  paymentGatewayConfigured: boolean;
}

export interface SubscriptionItem {
  id: string;
  workspace: { tenantId: string; tenantCode: string; name: string };
  plan: { code: string; name: string; billingInterval: string | null };
  status: string;
  startsOn: string;
  endsOn: string | null;
  trialEndsOn: string | null;
  externalReference: string | null;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  workspace: { tenantId: string; tenantCode: string; name: string };
  periodStart: string;
  periodEnd: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  currency: string;
  status: string;
  dueDate: string;
  paidAt: string | null;
  paymentGateway: string | null;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: string;
  maxUses: number | null;
  usedCount: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  occurredAt: string;
  category: string;
  action: string;
  description: string;
  targetTenantId: string | null;
  ipAddress: string | null;
  actor: string | null;
}

export interface TicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: string;
  status: string;
  category: string;
  workspace: { tenantId: string; tenantCode: string; name: string };
  createdAt: string;
  resolvedAt: string | null;
}

export interface SecurityOverview {
  encryptionConfigured: boolean;
  platformAccounts: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    mfaEnabled: boolean;
    lastLoginAt: string | null;
    lockedUntil: string | null;
    failedSignInAttempts: number;
    liveSessions: number;
  }[];
  platformSignIns: { failedLast24Hours: number; failedLast7Days: number; failedTwoFactorLast7Days: number };
  workspaceAccounts: { lockedNow: number; withRecentFailures: number };
  recentEvents: {
    id: string;
    occurredAt: string;
    category: string;
    action: string;
    description: string;
    ipAddress: string | null;
    actor: string | null;
  }[];
}

export interface RoleTemplate {
  code: string;
  name: string | null;
  isOwnerRole: boolean;
  permissionCount: number;
  workspaces: number;
  activeMembers: number;
  sections: { section: string; groups: { group: string; permissions: { key: string; name: string }[] }[] }[];
}

export interface Branding {
  platformName: string | null;
  supportEmail: string | null;
  websiteUrl: string | null;
  currency: string | null;
  updatedAt: string | null;
}

export interface WebsiteSettings {
  hero_title: string | null;
  hero_subtitle: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  brand_color: string | null;
  seo_meta_title: string | null;
  seo_meta_description: string | null;
  updatedAt: string | null;
}

export interface PlatformProfile {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
}

export interface SmtpSettings {
  configured: boolean;
  host: string | null;
  port: number | null;
  encryption: 'TLS' | 'SSL' | 'NONE' | null;
  username: string | null;
  /** Whether a password is stored. The password itself is never returned. */
  hasPassword: boolean;
  fromEmail: string | null;
  fromName: string | null;
  replyToEmail: string | null;
  updatedAt: string | null;
}

export interface SmtpSettingsInput {
  host: string;
  port: number;
  encryption: 'TLS' | 'SSL' | 'NONE';
  username?: string;
  /** Leave out to keep the stored password. */
  password?: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
}

export interface SendOutcome {
  status: 'SENT' | 'FAILED' | 'NOT_SENT';
  deliveryId: string | null;
  error: string | null;
}

export const platformGovernanceApi = {
  commandCentre: () => platformApi.get<CommandCentre>(`${BASE}/command-centre`),

  domains: (query: { page: number; pageSize: number; search?: string; status?: string }) =>
    platformApi.get<Page<DomainItem> & { baseDomain: string | null }>(`${BASE}/domains${toQueryString(query)}`),
  verifyDomain: (id: string) => platformApi.post<DomainCheck>(`${BASE}/domains/${encodeURIComponent(id)}/verify`),
  changeSubdomain: (tenantId: string, subdomain: string) =>
    platformApi.put<{ subdomain: string; address: string | null }>(`${BASE}/tenants/${encodeURIComponent(tenantId)}/subdomain`, { subdomain }),

  billing: () => platformApi.get<BillingSummary>(`${BASE}/billing`),
  subscriptions: (page: number, pageSize = 25) =>
    platformApi.get<Page<SubscriptionItem>>(`${BASE}/subscriptions${toQueryString({ page, pageSize })}`),
  invoices: (query: { page: number; pageSize: number; status?: string }) =>
    platformApi.get<Page<InvoiceItem>>(`${BASE}/invoices${toQueryString(query)}`),
  packages: () => platformApi.get<{ packages: Record<string, unknown>[]; updatedAt: string | null }>(`${BASE}/packages`),
  coupons: () => platformApi.get<Coupon[]>(`${BASE}/coupons`),
  createCoupon: (input: { couponCode: string; discountType: 'PERCENTAGE' | 'FIXED'; discountValue: number; maxUses?: number; validUntil?: string }) =>
    platformApi.post<Coupon>(`${BASE}/coupons`, input),

  activity: (query: { page: number; pageSize: number; category?: string; search?: string }) =>
    platformApi.get<Page<ActivityItem> & { categories: string[] }>(`${BASE}/activity${toQueryString(query)}`),
  support: (query: { page: number; pageSize: number; status?: string }) =>
    platformApi.get<Page<TicketItem>>(`${BASE}/support${toQueryString(query)}`),
  security: () => platformApi.get<SecurityOverview>(`${BASE}/security`),
  roleTemplates: () => platformApi.get<RoleTemplate[]>(`${BASE}/roles-templates`),

  branding: () => platformApi.get<Branding>(`${BASE}/settings/branding`),
  saveBranding: (input: { platformName: string; supportEmail?: string; websiteUrl?: string; currency: string }) =>
    platformApi.put<Branding>(`${BASE}/settings/branding`, input),
  website: () => platformApi.get<WebsiteSettings>(`${BASE}/settings/website`),
  saveWebsite: (input: Omit<WebsiteSettings, 'updatedAt'>) => platformApi.put<WebsiteSettings>(`${BASE}/settings/website`, input),
  profile: () => platformApi.get<PlatformProfile>(`${BASE}/profile`),

  smtp: () => platformApi.get<SmtpSettings>(`${BASE}/settings/smtp`),
  saveSmtp: (input: SmtpSettingsInput) => platformApi.put<SmtpSettings>(`${BASE}/settings/smtp`, input),
  testSmtp: (recipient: string) => platformApi.post<SendOutcome>(`${BASE}/settings/smtp/test`, { recipient }),
};
