import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, CircleDashed, Loader2, X } from 'lucide-react';
import {
  OnboardingResult,
  platformProvisioningApi,
  ProvisioningCheck,
  ProvisioningOptions,
  ProvisionTenantInput,
} from '../api/platform-provisioning.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/form-styles';
import { formatDate, formatDateTime, humanize } from '../format';
import { hashRoute } from '../hash-route';

const STEPS = ['Organization', 'Owner', 'Address', 'Modules', 'Plan', 'Review'] as const;

export interface FormState {
  organizationName: string;
  legalName: string;
  tenantCode: string;
  subdomain: string;
  industry: string;
  website: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  countryCode: string;
  taxId: string;
  timezone: string;
  currency: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  modules: string[];
  planCode: string;
  subscriptionStatus: 'ACTIVE' | 'TRIALING';
  startsOn: string;
  endsOn: string;
  trialEndsOn: string;
}

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Browsers list some zones under legacy ICU names; show the current IANA ones (both are valid). */
const CURRENT_ZONE_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
};

/** Every timezone the browser knows, always including the one currently chosen. */
const timezones = (current: string): string[] => {
  const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  const zones = new Set(list.map((zone) => CURRENT_ZONE_NAMES[zone] ?? zone));
  zones.add(current);
  return [...zones].sort();
};

const INDUSTRY_LABELS: Record<string, string> = {
  DIGITAL_AGENCY: 'Digital agency',
  IT_SERVICES: 'IT services',
  CONSULTING: 'Consulting',
  ECOMMERCE: 'E-commerce',
  HEALTHCARE: 'Healthcare',
  REAL_ESTATE: 'Real estate',
  MANUFACTURING: 'Manufacturing',
  FINANCE: 'Finance',
  OTHER: 'Other',
};
const industryLabel = (code: string) => INDUSTRY_LABELS[code] ?? humanize(code);

/** Today in the viewer's timezone, as YYYY-MM-DD. */
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const emptyForm = (): FormState => ({
  organizationName: '',
  legalName: '',
  tenantCode: '',
  subdomain: '',
  industry: '',
  website: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
  countryCode: '',
  taxId: '',
  timezone: CURRENT_ZONE_NAMES[browserTimezone()] ?? browserTimezone(),
  currency: 'INR',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerPhone: '',
  modules: [],
  planCode: '',
  subscriptionStatus: 'ACTIVE',
  startsOn: today(),
  endsOn: '',
  trialEndsOn: '',
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,23}$/;

/** The same rules the server applies, so mistakes show up before submitting. The server checks again. */
export function stepProblems(step: number, form: FormState, options: ProvisioningOptions): Partial<Record<keyof FormState, string>> {
  const problems: Partial<Record<keyof FormState, string>> = {};
  if (step === 0) {
    if (form.organizationName.trim().length < 2) problems.organizationName = 'Enter the organization name (at least 2 characters).';
    if (form.legalName.trim().length < 2) problems.legalName = 'Enter the registered legal name.';
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(form.tenantCode.trim())) problems.tenantCode = '2–64 letters, numbers, hyphens or underscores.';
    if (form.website && !/^https?:\/\/\S+$/.test(form.website.trim())) problems.website = 'Enter a website starting with https://.';
    if (form.contactEmail && !EMAIL.test(form.contactEmail.trim())) problems.contactEmail = 'Enter a valid email address.';
    if (form.contactPhone && !PHONE.test(form.contactPhone.trim())) problems.contactPhone = 'Digits only, optionally starting with a country code such as +91.';
    if (form.countryCode && !/^[A-Za-z]{2}$/.test(form.countryCode.trim())) problems.countryCode = 'A two-letter code such as IN.';
    if (form.taxId && !/^[A-Za-z0-9]{5,20}$/.test(form.taxId.trim())) problems.taxId = '5–20 letters and digits.';
    if (!form.timezone) problems.timezone = 'Choose a timezone.';
    if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) problems.currency = 'A three-letter currency code such as INR.';
  }
  if (step === 1) {
    if (!form.ownerFirstName.trim()) problems.ownerFirstName = "Enter the owner's first name.";
    if (!EMAIL.test(form.ownerEmail.trim())) problems.ownerEmail = "Enter the owner's email address.";
    if (form.ownerPhone && !PHONE.test(form.ownerPhone.trim())) problems.ownerPhone = 'Digits only, optionally starting with a country code such as +91.';
  }
  if (step === 3) {
    const missing = options.modules.filter((m) => form.modules.includes(m.code) && m.requires.some((r) => !form.modules.includes(r)));
    if (missing.length > 0) problems.modules = `${missing.map((m) => m.name).join(', ')} needs ${missing[0].requires.join(', ')}.`;
  }
  if (step === 4 && form.planCode) {
    if (!form.startsOn) problems.startsOn = 'Choose when the subscription starts.';
    if (form.endsOn && form.endsOn < form.startsOn) problems.endsOn = 'The end date cannot be before the start date.';
    if (form.subscriptionStatus === 'TRIALING' && !form.trialEndsOn) problems.trialEndsOn = 'Choose when the trial ends.';
    if (form.trialEndsOn && form.trialEndsOn < form.startsOn) problems.trialEndsOn = 'The trial cannot end before the start date.';
  }
  return problems;
}

export function toInput(form: FormState, idempotencyKey: string): ProvisionTenantInput {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    idempotencyKey,
    organizationName: form.organizationName.trim(),
    legalName: form.legalName.trim(),
    tenantCode: form.tenantCode.trim().toUpperCase(),
    subdomain: optional(form.subdomain.toLowerCase()),
    industry: optional(form.industry),
    website: optional(form.website),
    contactName: optional(form.contactName),
    contactEmail: optional(form.contactEmail),
    contactPhone: optional(form.contactPhone),
    address: optional(form.address),
    countryCode: optional(form.countryCode.toUpperCase()),
    taxId: optional(form.taxId.toUpperCase()),
    timezone: form.timezone,
    currency: form.currency.trim().toUpperCase(),
    ownerFirstName: form.ownerFirstName.trim(),
    ownerLastName: optional(form.ownerLastName),
    ownerEmail: form.ownerEmail.trim().toLowerCase(),
    ownerPhone: optional(form.ownerPhone),
    modules: form.modules,
    subscription: form.planCode
      ? {
          planCode: form.planCode,
          status: form.subscriptionStatus,
          startsOn: form.startsOn,
          endsOn: optional(form.endsOn),
          trialEndsOn: form.subscriptionStatus === 'TRIALING' ? optional(form.trialEndsOn) : undefined,
        }
      : undefined,
  };
}

/** One labelled input with its hint and error, wired for screen readers. */
const Field: React.FC<{
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}> = ({ id, label, required, hint, error, children }) => {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} <span className="font-normal text-hq-subtle-foreground">{required ? '(required)' : '(optional)'}</span>
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[11px] text-hq-subtle-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[11px] text-hq-danger">
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * Onboards a customer workspace: organization, owner, address, modules and an
 * optional subscription, reviewed before anything is created. One submission
 * creates everything or nothing; the onboarding email follows and its real
 * outcome is shown.
 */
export const ProvisionTenantView: React.FC = () => {
  const formId = useId();
  const [options, setOptions] = useState<ProvisioningOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [step, setStep] = useState(0);
  const [problems, setProblems] = useState<Partial<Record<keyof FormState, string>>>({});
  const [check, setCheck] = useState<ProvisioningCheck | null>(null);
  // One key per form: a retried or doubled submission returns the workspace already created.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loadOptions = async () => {
    setLoadError(null);
    try {
      setOptions(await platformProvisioningApi.options());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the provisioning options.');
    }
  };

  useEffect(() => {
    void loadOptions();
  }, []);

  // Is the tenant code or address taken? Checked as the operator types; the server checks again on submit.
  useEffect(() => {
    const tenantCode = form.tenantCode.trim();
    const subdomain = form.subdomain.trim();
    if (!tenantCode && !subdomain) {
      setCheck(null);
      return;
    }
    const timer = window.setTimeout(() => {
      platformProvisioningApi
        .check({ tenantCode: tenantCode || undefined, subdomain: subdomain || undefined })
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form.tenantCode, form.subdomain]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, result]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setProblems((current) => ({ ...current, [key]: undefined }));
  };

  const toggleModule = (code: string, on: boolean) => {
    if (!options) return;
    setForm((current) => {
      const next = new Set(current.modules);
      if (on) {
        next.add(code);
        // Turning a module on turns on what it needs.
        options.modules.find((m) => m.code === code)?.requires.forEach((r) => next.add(r));
      } else {
        next.delete(code);
      }
      return { ...current, modules: options.modules.map((m) => m.code).filter((c) => next.has(c)) };
    });
    setProblems((current) => ({ ...current, modules: undefined }));
  };

  if (!options) {
    return loadError ? (
      <ErrorBanner message={loadError} onRetry={() => void loadOptions()} />
    ) : (
      <div role="status" className="h-40 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none">
        <span className="sr-only">Loading the provisioning form</span>
      </div>
    );
  }

  const next = () => {
    const found = stepProblems(step, form, options);
    const codeTaken = step === 0 && check?.tenantCode && !check.tenantCode.available;
    const addressProblem = step === 2 && check?.subdomain && !check.subdomain.available;
    if (codeTaken) found.tenantCode = 'That tenant code is already in use.';
    if (addressProblem) found.subdomain = check?.subdomain?.reason ?? 'That address cannot be used.';
    setProblems(found);
    if (Object.values(found).some(Boolean)) {
      // Take the operator to the first field that needs attention.
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setStep((current) => current + 1);
  };

  const submit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      setResult(await platformProvisioningApi.provision(toInput(form, idempotencyKey)));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'The workspace could not be provisioned.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startOver = () => {
    setForm(emptyForm());
    setIdempotencyKey(crypto.randomUUID());
    setResult(null);
    setStep(0);
    setProblems({});
    setSubmitError(null);
  };

  const address = form.subdomain.trim() || (check?.subdomain?.subdomain ?? '');
  const previewUrl = (label: string) => (options.baseDomain ? `https://${label}.${options.baseDomain}` : null);
  const selectedPlan = options.plans.find((p) => p.code === form.planCode) ?? null;
  const input = (key: keyof FormState, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => (
    <input
      {...props}
      {...extra}
      value={form[key] as string}
      onChange={(event) => update(key, event.target.value as FormState[typeof key])}
      className={`${fieldClass} ${extra.className ?? ''}`}
    />
  );

  return (
    <section className="space-y-5" aria-labelledby={`${formId}-heading`}>
      <a
        href={hashRoute('tenants')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-hq-muted-foreground hover:text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        All workspaces
      </a>

      {result ? (
        <ProvisioningResult result={result} headingRef={headingRef} headingId={`${formId}-heading`} onStartOver={startOver} />
      ) : (
        <>
          <div>
            <h2 id={`${formId}-heading`} ref={headingRef} tabIndex={-1} className="text-base font-bold text-hq-foreground focus:outline-none">
              Provision a workspace · {STEPS[step]}
            </h2>
            <p className="text-xs text-hq-muted-foreground mt-1">
              Step {step + 1} of {STEPS.length}. Nothing is created until you confirm on the review step.
            </p>
          </div>

          <ol className="grid grid-cols-3 sm:grid-cols-6 gap-2" aria-label="Provisioning steps">
            {STEPS.map((name, index) => (
              <li
                key={name}
                aria-current={index === step ? 'step' : undefined}
                className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${
                  index === step
                    ? 'border-hq-primary bg-hq-primary/10 text-hq-foreground'
                    : index < step
                      ? 'border-hq-border text-hq-foreground'
                      : 'border-hq-border text-hq-subtle-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {index < step ? <Check className="w-3.5 h-3.5 text-hq-success" aria-hidden="true" /> : <span aria-hidden="true">{index + 1}.</span>}
                  {name}
                  {index < step && <span className="sr-only"> (done)</span>}
                </span>
              </li>
            ))}
          </ol>

          {Object.values(problems).some(Boolean) && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-hq-danger/30 bg-hq-danger/10 px-3.5 py-3 text-xs text-hq-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              Check the highlighted fields before continuing.
            </p>
          )}

          {step === 0 && (
            <Panel title="Organization" description="Saved as the workspace's organization profile, which its administrators can edit later.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="org-name" label="Organization name" required error={problems.organizationName} hint="Shown across the workspace.">
                  {input('organizationName', { autoComplete: 'organization' })}
                </Field>
                <Field id="org-legal" label="Legal name" required error={problems.legalName}>
                  {input('legalName')}
                </Field>
                <Field
                  id="org-code"
                  label="Tenant code"
                  required
                  error={problems.tenantCode ?? (check?.tenantCode && !check.tenantCode.available ? 'That tenant code is already in use.' : undefined)}
                  hint="Identifies the workspace in HQ. Letters, numbers, hyphens and underscores."
                >
                  {input('tenantCode', { className: 'font-mono uppercase', spellCheck: false })}
                </Field>
                <Field id="org-industry" label="Industry" error={problems.industry}>
                  {(props) => (
                    <select {...props} value={form.industry} onChange={(event) => update('industry', event.target.value)} className={fieldClass}>
                      <option value="">Not specified</option>
                      {options.industries.map((code) => (
                        <option key={code} value={code}>
                          {industryLabel(code)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field id="org-website" label="Website" error={problems.website}>
                  {input('website', { type: 'url', placeholder: 'https://', autoComplete: 'url' })}
                </Field>
                <Field id="org-tax" label="Tax ID / GSTIN" error={problems.taxId}>
                  {input('taxId', { className: 'font-mono uppercase', spellCheck: false })}
                </Field>
                <Field id="org-contact-name" label="Contact name" error={problems.contactName} hint="Until set, the workspace owner is the contact.">
                  {input('contactName', { autoComplete: 'name' })}
                </Field>
                <Field id="org-contact-email" label="Contact email" error={problems.contactEmail}>
                  {input('contactEmail', { type: 'email', autoComplete: 'email' })}
                </Field>
                <Field id="org-contact-phone" label="Contact phone" error={problems.contactPhone}>
                  {input('contactPhone', { type: 'tel', autoComplete: 'tel' })}
                </Field>
                <Field id="org-country" label="Country" error={problems.countryCode} hint="Two-letter code, such as IN.">
                  {input('countryCode', { className: 'uppercase', maxLength: 2, autoComplete: 'country' })}
                </Field>
                <div className="md:col-span-2">
                  <Field id="org-address" label="Address" error={problems.address} hint="One field: street, city, state and postal code.">
                    {(props) => (
                      <textarea
                        {...props}
                        rows={2}
                        maxLength={500}
                        value={form.address}
                        onChange={(event) => update('address', event.target.value)}
                        className={`${fieldClass} h-auto py-2`}
                      />
                    )}
                  </Field>
                </div>
                <Field id="org-timezone" label="Timezone" required error={problems.timezone}>
                  {(props) => (
                    <select {...props} value={form.timezone} onChange={(event) => update('timezone', event.target.value)} className={fieldClass}>
                      {timezones(form.timezone).map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field id="org-currency" label="Currency" required error={problems.currency} hint="Three-letter code, such as INR.">
                  {input('currency', { className: 'uppercase font-mono', maxLength: 3 })}
                </Field>
              </div>
            </Panel>
          )}

          {step === 1 && (
            <Panel title="Owner" description="The workspace's first administrator. They receive the onboarding email.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="owner-first" label="First name" required error={problems.ownerFirstName}>
                  {input('ownerFirstName', { autoComplete: 'given-name' })}
                </Field>
                <Field id="owner-last" label="Last name" error={problems.ownerLastName}>
                  {input('ownerLastName', { autoComplete: 'family-name' })}
                </Field>
                <Field
                  id="owner-email"
                  label="Email"
                  required
                  error={problems.ownerEmail}
                  hint="A new account gets a one-time link to set a password. An existing Voogyo account keeps its password."
                >
                  {input('ownerEmail', { type: 'email', autoComplete: 'email' })}
                </Field>
                <Field id="owner-phone" label="Phone" error={problems.ownerPhone} hint="Saved only for a new account.">
                  {input('ownerPhone', { type: 'tel', autoComplete: 'tel' })}
                </Field>
                <div>
                  <p className={labelClass}>Role</p>
                  <p className="h-10 flex items-center px-3 rounded-xl border border-hq-border bg-hq-muted text-xs text-hq-foreground">
                    {options.ownerRole.name}
                  </p>
                  <p className="mt-1 text-[11px] text-hq-subtle-foreground">The workspace's built-in administrator role, with every permission.</p>
                </div>
              </div>
            </Panel>
          )}

          {step === 2 && (
            <Panel title="Workspace address" description="Where members sign in. Every address is served by the same application; no DNS record is created per workspace.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  id="address-subdomain"
                  label="Subdomain"
                  error={problems.subdomain ?? (check?.subdomain && !check.subdomain.available ? check.subdomain.reason ?? 'That address cannot be used.' : undefined)}
                  hint="Lower-case letters, numbers and single hyphens. Left empty, one is made from the tenant code."
                >
                  {input('subdomain', { className: 'font-mono lowercase', spellCheck: false, autoCapitalize: 'none' })}
                </Field>
                <div>
                  <p className={labelClass}>Base domain</p>
                  <p className="h-10 flex items-center px-3 rounded-xl border border-hq-border bg-hq-muted text-xs font-mono text-hq-foreground">
                    {options.baseDomain ?? 'Not configured (PLATFORM_BASE_DOMAIN)'}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-hq-muted-foreground" aria-live="polite">
                {address && check?.subdomain?.available !== false
                  ? previewUrl(address)
                    ? <>Workspace URL: <span className="font-mono text-hq-foreground">{previewUrl(address)}</span></>
                    : <>Subdomain <span className="font-mono text-hq-foreground">{address}</span>. There is no base domain yet, so it has no web address.</>
                  : !form.subdomain.trim()
                    ? 'The address will be made from the tenant code.'
                    : null}
              </p>
            </Panel>
          )}

          {step === 3 && (
            <Panel title="Modules" description="What the workspace can use from the start. Its administrators can switch modules later; permissions stay with roles.">
              <fieldset>
                <legend className="sr-only">Modules</legend>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {options.modules.map((module) => {
                    const checked = form.modules.includes(module.code);
                    const neededBy = options.modules.filter((m) => m.requires.includes(module.code) && form.modules.includes(m.code));
                    return (
                      <li key={module.code} className={`rounded-xl border p-4 ${checked ? 'border-hq-primary bg-hq-primary/5' : 'border-hq-border'}`}>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={checked && neededBy.length > 0}
                            onChange={(event) => toggleModule(module.code, event.target.checked)}
                            aria-describedby={`module-${module.code}-detail`}
                            className="mt-0.5 h-4 w-4 accent-hq-primary"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-hq-foreground">{module.name}</span>
                            <span id={`module-${module.code}-detail`} className="block text-xs text-hq-muted-foreground mt-1">
                              {module.description} Includes {module.capabilities.join(', ')}.
                              {module.requires.length > 0 && ` Needs ${module.requires.map((r) => options.modules.find((m) => m.code === r)?.name ?? r).join(', ')}.`}
                              {neededBy.length > 0 && ` Required by ${neededBy.map((m) => m.name).join(', ')}.`}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
              {problems.modules && <p className="mt-3 text-xs text-hq-danger">{problems.modules}</p>}
              {form.modules.length === 0 && (
                <p className="mt-3 text-xs text-hq-muted-foreground">No module selected: the workspace starts with its settings and people administration only.</p>
              )}
            </Panel>
          )}

          {step === 4 && (
            <Panel title="Plan and trial" description="Subscriptions attach to plans stored on the platform.">
              {options.plans.length === 0 ? (
                <p className="text-xs text-hq-muted-foreground">
                  No plans exist yet, so the workspace is created without a subscription. Attach one later, once plans are set up.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field id="plan-code" label="Plan">
                    {(props) => (
                      <select {...props} value={form.planCode} onChange={(event) => update('planCode', event.target.value)} className={fieldClass}>
                        <option value="">No subscription for now</option>
                        {options.plans.map((plan) => (
                          <option key={plan.code} value={plan.code}>
                            {plan.name}
                            {plan.billingInterval ? ` (${humanize(plan.billingInterval).toLowerCase()})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  {form.planCode && (
                    <>
                      <Field id="plan-status" label="Status" required>
                        {(props) => (
                          <select
                            {...props}
                            value={form.subscriptionStatus}
                            onChange={(event) => update('subscriptionStatus', event.target.value as FormState['subscriptionStatus'])}
                            className={fieldClass}
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="TRIALING">Trial</option>
                          </select>
                        )}
                      </Field>
                      <Field id="plan-start" label="Starts" required error={problems.startsOn}>
                        {input('startsOn', { type: 'date' })}
                      </Field>
                      <Field id="plan-end" label="Ends" error={problems.endsOn} hint="Empty means open-ended.">
                        {input('endsOn', { type: 'date' })}
                      </Field>
                      {form.subscriptionStatus === 'TRIALING' && (
                        <Field id="plan-trial" label="Trial ends" required error={problems.trialEndsOn}>
                          {input('trialEndsOn', { type: 'date' })}
                        </Field>
                      )}
                    </>
                  )}
                </div>
              )}
            </Panel>
          )}

          {step === 5 && (
            <>
              {(!options.emailConfigured || !options.linksAvailable) && (
                <p role="note" className="flex items-start gap-2 rounded-xl border border-hq-warning/30 bg-hq-warning/10 px-3.5 py-3 text-xs text-hq-warning">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                  {!options.emailConfigured
                    ? 'Outgoing email is not configured, so the onboarding email will not be sent. The workspace is still created; send the email from its page after setting up SMTP in Global settings.'
                    : 'Workspaces have no web address yet (PLATFORM_BASE_DOMAIN is not set), so the onboarding email cannot include a working link and will not be sent.'}
                </p>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Organization">
                  <Summary
                    rows={[
                      ['Name', form.organizationName],
                      ['Legal name', form.legalName],
                      ['Tenant code', form.tenantCode.toUpperCase()],
                      ['Industry', form.industry ? industryLabel(form.industry) : null],
                      ['Website', form.website],
                      ['Contact', [form.contactName, form.contactEmail, form.contactPhone].filter(Boolean).join(' · ')],
                      ['Address', form.address],
                      ['Country', form.countryCode.toUpperCase()],
                      ['Tax ID / GSTIN', form.taxId.toUpperCase()],
                      ['Timezone', form.timezone],
                      ['Currency', form.currency.toUpperCase()],
                    ]}
                  />
                </Panel>
                <div className="space-y-4">
                  <Panel title="Owner">
                    <Summary
                      rows={[
                        ['Name', [form.ownerFirstName, form.ownerLastName].filter(Boolean).join(' ')],
                        ['Email (receives the onboarding email)', form.ownerEmail],
                        ['Phone', form.ownerPhone],
                        ['Role', options.ownerRole.name],
                      ]}
                    />
                  </Panel>
                  <Panel title="Workspace">
                    <Summary
                      rows={[
                        ['Subdomain', address || 'Made from the tenant code'],
                        ['Workspace URL', address ? previewUrl(address) ?? 'No base domain configured' : 'Shown after provisioning'],
                        ['Modules', options.modules.filter((m) => form.modules.includes(m.code)).map((m) => m.name).join(', ') || 'None'],
                        [
                          'Plan',
                          selectedPlan
                            ? `${selectedPlan.name} · ${form.subscriptionStatus === 'TRIALING' ? `trial until ${formatDate(form.trialEndsOn)}` : 'active'} from ${formatDate(form.startsOn)}${form.endsOn ? ` to ${formatDate(form.endsOn)}` : ''}`
                            : 'No subscription',
                        ],
                      ]}
                    />
                  </Panel>
                </div>
              </div>
              {submitError && <ErrorBanner message={submitError} />}
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hq-border pt-4">
            <button type="button" onClick={() => setStep((current) => current - 1)} disabled={step === 0 || isSubmitting} className={secondaryButtonClass}>
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className={primaryButtonClass}>
                Continue
              </button>
            ) : (
              <button type="button" onClick={() => void submit()} disabled={isSubmitting} className={primaryButtonClass}>
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {isSubmitting ? 'Provisioning…' : `Provision ${form.organizationName.trim() || 'workspace'}`}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};

const Summary: React.FC<{ rows: [string, string | null][] }> = ({ rows }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-2 text-xs">
    {rows.map(([label, value]) => (
      <React.Fragment key={label}>
        <dt className="text-hq-muted-foreground">{label}</dt>
        <dd className={`break-words ${value ? 'text-hq-foreground' : 'text-hq-subtle-foreground italic'}`}>{value || 'Not provided'}</dd>
      </React.Fragment>
    ))}
  </dl>
);

type StepState = 'done' | 'failed' | 'skipped' | 'pending';

const StepIcon: React.FC<{ state: StepState }> = ({ state }) =>
  state === 'done' ? (
    <Check className="w-4 h-4 text-hq-success" aria-hidden="true" />
  ) : state === 'failed' ? (
    <X className="w-4 h-4 text-hq-danger" aria-hidden="true" />
  ) : (
    <CircleDashed className="w-4 h-4 text-hq-subtle-foreground" aria-hidden="true" />
  );

const STATE_TEXT: Record<StepState, string> = { done: 'Done', failed: 'Failed', skipped: 'Skipped', pending: 'Pending' };

/** What provisioning did, step by step, from the server's answer. */
export const ProvisioningResult: React.FC<{
  result: OnboardingResult;
  headingRef: React.RefObject<HTMLHeadingElement>;
  headingId: string;
  onStartOver: () => void;
}> = ({ result, headingRef, headingId, onStartOver }) => {
  const email = result.onboardingEmail;
  const emailState: StepState = email.status === 'SENT' ? 'done' : email.status === 'FAILED' ? 'failed' : email.status === 'QUEUED' ? 'pending' : 'skipped';
  const enabled = result.modules.filter((m) => m.enabled).map((m) => m.name);

  const steps: { label: string; state: StepState; detail: string }[] = [
    { label: 'Workspace created', state: 'done', detail: `${result.tenant.name} (${result.tenant.tenantCode})` },
    {
      label: 'Address assigned',
      state: 'done',
      detail: result.address
        ? `${result.address.subdomain} · ${result.address.url ?? 'no web address yet (no base domain configured)'}`
        : 'No address',
    },
    {
      label: result.owner.isNewAccount ? 'Owner account created' : 'Existing account added as owner',
      state: 'done',
      detail: `${result.owner.email} · ${result.owner.role}`,
    },
    { label: 'Modules configured', state: 'done', detail: enabled.length > 0 ? enabled.join(', ') : 'None switched on' },
    result.subscription
      ? {
          label: 'Subscription configured',
          state: 'done',
          detail: `${result.subscription.planName} · ${humanize(result.subscription.status)}${result.subscription.trialEndsOn ? ` until ${formatDate(result.subscription.trialEndsOn)}` : ''}`,
        }
      : { label: 'Subscription', state: 'skipped', detail: 'None attached' },
    {
      label:
        email.status === 'SENT'
          ? 'Onboarding email sent'
          : email.status === 'FAILED'
            ? 'Onboarding email failed'
            : email.status === 'QUEUED'
              ? 'Onboarding email queued'
              : 'Onboarding email not sent',
      state: emailState,
      detail:
        email.status === 'SENT'
          ? `To ${email.recipient}${email.sentAt ? ` at ${formatDateTime(email.sentAt)}` : ''}`
          : email.status === 'QUEUED'
            ? 'Delivery was started but its outcome was not recorded. Check the workspace page shortly.'
            : email.error ?? 'Not sent.',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-base font-bold text-hq-foreground focus:outline-none">
          {result.tenant.name} is provisioned
        </h2>
        {result.replayed && (
          <p className="text-xs text-hq-muted-foreground mt-1">This form had already been submitted. This is the workspace it created; nothing new was made.</p>
        )}
      </div>

      <Panel title="What happened">
        <ul className="divide-y divide-hq-border">
          {steps.map((step) => (
            <li key={step.label} className="py-2.5 flex items-start gap-3 text-xs">
              <span className="mt-px">
                <StepIcon state={step.state} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-hq-foreground">
                  {step.label}
                  <span className="sr-only">: {STATE_TEXT[step.state]}</span>
                </span>
                <span className={`block break-words ${step.state === 'failed' ? 'text-hq-danger' : 'text-hq-muted-foreground'}`}>{step.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-xs text-hq-muted-foreground">
        {result.owner.passwordSet
          ? `${result.owner.email} already has a Voogyo password and can sign in to the workspace now.`
          : email.status === 'SENT'
            ? 'The owner sets a password from the link in the email. The link works once and expires in 7 days.'
            : 'The owner cannot sign in until they receive the email: it carries their one-time link to set a password. Send it again from the workspace page once email works.'}
      </p>

      <div className="flex flex-wrap gap-2">
        <a href={hashRoute('tenants', result.tenant.id)} className={primaryButtonClass}>
          Open workspace
        </a>
        <button type="button" onClick={onStartOver} className={secondaryButtonClass}>
          Provision another
        </button>
        <a href={hashRoute('tenants')} className={secondaryButtonClass}>
          All workspaces
        </a>
      </div>
    </div>
  );
};
