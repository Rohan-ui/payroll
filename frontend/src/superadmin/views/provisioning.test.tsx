import React, { act, createRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { OnboardingResult, ProvisioningOptions } from '../api/platform-provisioning.api';
import { emptyForm, FormState, ProvisioningResult, stepProblems, toInput } from './ProvisionTenantView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS: ProvisioningOptions = {
  baseDomain: 'voogyo.com',
  linksAvailable: true,
  emailConfigured: true,
  industries: ['IT_SERVICES'],
  ownerRole: { code: 'ADMIN', name: 'Administrator' },
  modules: [
    { code: 'CRM', name: 'CRM & Sales', description: '', requires: [], capabilities: [] },
    { code: 'HRMS', name: 'HRMS', description: '', requires: [], capabilities: [] },
    { code: 'FINANCE', name: 'Finance', description: '', requires: ['HRMS'], capabilities: [] },
  ],
  plans: [{ code: 'PRO', name: 'Pro', billingInterval: 'MONTHLY' }],
};

const filled = (overrides: Partial<FormState> = {}): FormState => ({
  ...emptyForm(),
  organizationName: 'Acme',
  legalName: 'Acme Private Limited',
  tenantCode: 'acme_in',
  timezone: 'Asia/Kolkata',
  currency: 'inr',
  ownerFirstName: 'Asha',
  ownerEmail: 'Owner@Acme.Example',
  ...overrides,
});

describe('provisioning form checks', () => {
  it('requires the organization basics and accepts optional fields left empty', () => {
    expect(Object.keys(stepProblems(0, emptyForm(), OPTIONS)).sort()).toEqual(['legalName', 'organizationName', 'tenantCode']);
    expect(stepProblems(0, filled(), OPTIONS)).toEqual({});
    expect(Object.keys(stepProblems(0, filled({ website: 'acme.example', taxId: '12', countryCode: 'IND' }), OPTIONS)).sort()).toEqual([
      'countryCode',
      'taxId',
      'website',
    ]);
  });

  it('requires an owner name and email', () => {
    expect(Object.keys(stepProblems(1, filled({ ownerFirstName: '', ownerEmail: 'not-an-email' }), OPTIONS)).sort()).toEqual([
      'ownerEmail',
      'ownerFirstName',
    ]);
  });

  it('refuses Finance without HRMS', () => {
    expect(stepProblems(3, filled({ modules: ['FINANCE'] }), OPTIONS).modules).toBe('Finance needs HRMS.');
    expect(stepProblems(3, filled({ modules: ['HRMS', 'FINANCE'] }), OPTIONS)).toEqual({});
    expect(stepProblems(3, filled({ modules: [] }), OPTIONS)).toEqual({});
  });

  it('checks trial and subscription dates only when a plan is chosen', () => {
    expect(stepProblems(4, filled({ planCode: '', subscriptionStatus: 'TRIALING' }), OPTIONS)).toEqual({});
    const trial = stepProblems(4, filled({ planCode: 'PRO', subscriptionStatus: 'TRIALING', startsOn: '2026-10-01', trialEndsOn: '' }), OPTIONS);
    expect(trial.trialEndsOn).toBe('Choose when the trial ends.');
    const backwards = stepProblems(4, filled({ planCode: 'PRO', startsOn: '2026-10-01', endsOn: '2026-09-01' }), OPTIONS);
    expect(backwards.endsOn).toBe('The end date cannot be before the start date.');
  });

  it('sends normalized values, leaves out empty optional fields, and adds a subscription only with a plan', () => {
    const input = toInput(filled({ subdomain: 'Acme', contactEmail: '  ' }), 'key-1');
    expect(input).toMatchObject({ idempotencyKey: 'key-1', tenantCode: 'ACME_IN', subdomain: 'acme', currency: 'INR', ownerEmail: 'owner@acme.example' });
    expect(input.contactEmail).toBeUndefined();
    expect(input.subscription).toBeUndefined();

    const withPlan = toInput(filled({ planCode: 'PRO', subscriptionStatus: 'ACTIVE', startsOn: '2026-10-01', trialEndsOn: '2026-10-31' }), 'key-2');
    // A trial end date is only sent for a trial.
    expect(withPlan.subscription).toEqual({ planCode: 'PRO', status: 'ACTIVE', startsOn: '2026-10-01', endsOn: undefined, trialEndsOn: undefined });
  });
});

describe('provisioning result', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const result = (email: OnboardingResult['onboardingEmail'], passwordStatus: OnboardingResult['owner']['passwordStatus'] = 'TEMPORARY'): OnboardingResult => ({
    tenant: { id: 't1', tenantCode: 'ACME_IN', name: 'Acme', legalName: 'Acme Private Limited', status: 'ACTIVE', createdAt: '2026-09-24T10:00:00Z' },
    address: { subdomain: 'acme', hostname: 'acme.voogyo.com', url: 'https://acme.voogyo.com' },
    owner: { userId: 'u1', email: 'owner@acme.example', name: 'Asha', role: 'Administrator', isNewAccount: true, passwordStatus },
    modules: [{ code: 'HRMS', name: 'HRMS', enabled: true }],
    subscription: null,
    onboardingEmail: email,
    provisionedAt: '2026-09-24T10:00:00Z',
  });

  const render = (value: OnboardingResult) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<ProvisioningResult result={value} headingRef={createRef()} headingId="h" onStartOver={() => undefined} />));
    return container.textContent ?? '';
  };

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
  });

  it('says the email was sent only when the server reported SENT', () => {
    const text = render(result({ status: 'SENT', recipient: 'owner@acme.example', error: null, sentAt: '2026-09-24T10:00:05Z', attemptedAt: '2026-09-24T10:00:04Z' }));
    expect(text).toContain('Onboarding email sent');
    expect(text).toContain('signs in with the temporary password from the email and must choose a new password');
  });

  it('shows a failed email as failed, with the reason, while the workspace stays created', () => {
    const text = render(
      result({ status: 'FAILED', recipient: 'owner@acme.example', error: 'Could not connect to smtp.example.com:587.', sentAt: null, attemptedAt: '2026-09-24T10:00:04Z' }),
    );
    expect(text).toContain('Workspace created');
    expect(text).toContain('Onboarding email failed');
    expect(text).toContain('Could not connect to smtp.example.com:587.');
    expect(text).not.toContain('Onboarding email sent');
    expect(text).toContain('cannot sign in until they receive the email');
  });

  it('shows an email that was never attempted as not sent', () => {
    const text = render(result({ status: 'NOT_SENT', recipient: 'owner@acme.example', error: 'Outgoing email is not configured.', sentAt: null, attemptedAt: null }));
    expect(text).toContain('Onboarding email not sent');
    expect(text).toContain('Outgoing email is not configured.');
    expect(text).not.toContain('Onboarding email sent');
  });
});
