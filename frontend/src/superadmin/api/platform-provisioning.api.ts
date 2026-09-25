import { platformApi } from './platform-client';
import { toQueryString } from './platform-directory.api';

const BASE = '/api/v1/super-admin';

export interface ProvisioningModule {
  code: string;
  name: string;
  description: string;
  requires: string[];
  capabilities: string[];
}

export interface ProvisioningOptions {
  baseDomain: string | null;
  /** Whether emails can carry a working workspace link. */
  linksAvailable: boolean;
  emailConfigured: boolean;
  industries: string[];
  ownerRole: { code: string; name: string };
  modules: ProvisioningModule[];
  plans: { code: string; name: string; billingInterval: string | null }[];
}

export interface ProvisioningCheck {
  tenantCode: { value: string; available: boolean } | null;
  subdomain: { subdomain: string; available: boolean; reason: string | null } | null;
}

export interface ProvisionTenantInput {
  idempotencyKey: string;
  organizationName: string;
  legalName: string;
  tenantCode: string;
  subdomain?: string;
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
  ownerFirstName: string;
  ownerLastName?: string;
  ownerEmail: string;
  ownerPhone?: string;
  modules: string[];
  subscription?: { planCode: string; status: 'ACTIVE' | 'TRIALING'; startsOn: string; endsOn?: string; trialEndsOn?: string };
}

export type OnboardingEmailStatus = 'NOT_SENT' | 'QUEUED' | 'SENT' | 'FAILED';

export interface OnboardingResult {
  replayed?: boolean;
  tenant: { id: string; tenantCode: string; name: string; legalName: string; status: string; createdAt: string };
  address: { subdomain: string; hostname: string | null; url: string | null } | null;
  owner: { userId: string; email: string; name: string | null; role: string; isNewAccount: boolean; passwordSet: boolean };
  modules: { code: string; name: string; enabled: boolean }[];
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    startsOn: string | null;
    endsOn: string | null;
    trialEndsOn: string | null;
  } | null;
  onboardingEmail: {
    status: OnboardingEmailStatus;
    recipient: string;
    error: string | null;
    sentAt: string | null;
    attemptedAt: string | null;
  };
  provisionedAt: string;
}

export const platformProvisioningApi = {
  options: () => platformApi.get<ProvisioningOptions>(`${BASE}/provisioning/options`),
  check: (query: { tenantCode?: string; subdomain?: string }) =>
    platformApi.get<ProvisioningCheck>(`${BASE}/provisioning/check${toQueryString(query)}`),
  provision: (input: ProvisionTenantInput) => platformApi.post<OnboardingResult>(`${BASE}/tenants`, input),
  onboarding: (tenantId: string) =>
    platformApi.get<OnboardingResult | null>(`${BASE}/tenants/${encodeURIComponent(tenantId)}/onboarding`),
  resendOnboardingEmail: (tenantId: string) =>
    platformApi.post<OnboardingResult>(`${BASE}/tenants/${encodeURIComponent(tenantId)}/onboarding/resend-email`),
};
