import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleDashed, PauseCircle, PlayCircle } from 'lucide-react';
import {
  platformDirectoryApi,
  Page,
  TenantActivityItem,
  TenantDetail,
  UserListItem,
} from '../api/platform-directory.api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { platformGovernanceApi } from '../api/platform-governance.api';
import { platformOperationsApi } from '../api/platform-operations.api';
import { OnboardingResult, platformProvisioningApi, ProvisioningOptions } from '../api/platform-provisioning.api';
import { DetailItem, DetailList, ErrorBanner, Panel, Value } from '../components/DetailList';
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '../components/form-styles';
import { browserTimezone, EMAIL, Field, industryLabel, PHONE, timezones, today } from '../components/FormField';
import { UserIdentityForm } from '../components/UserIdentityForm';
import { toast } from '../../lib/toast';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, humanize, seatUsage } from '../format';
import { hashRoute } from '../hash-route';
import { ROLE_KIND_LABEL, Timestamp, UserTable } from './UserTable';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'organization', label: 'Organization' },
  { id: 'owner', label: 'Owner' },
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles' },
  { id: 'modules', label: 'Modules' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'activity', label: 'Activity' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type PendingAction = 'suspend' | 'reactivate' | null;

const PAGE_SIZE = 25;
const SUSPENDABLE = ['ACTIVE', 'TRIALING'];

const backLinkClass =
  'inline-flex items-center gap-1.5 text-xs font-semibold text-hq-muted-foreground hover:text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded';

/**
 * One workspace as the platform sees it, without signing in to it. Suspending
 * is a platform action: members are refused on their next request.
 */
export const TenantDetailView: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabIdPrefix = useId();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setTenant(await platformDirectoryApi.getTenant(tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this workspace.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    setTenant(null);
    setTab('overview');
    setNotice(null);
    void load();
  }, [load]);

  // Land keyboard and screen-reader users on the workspace once it has loaded.
  const loadedId = tenant?.overview.id;
  useEffect(() => {
    if (loadedId) headingRef.current?.focus();
  }, [loadedId]);

  const runAction = async () => {
    if (!tenant || !pendingAction) return;
    setIsActing(true);
    setActionError(null);
    try {
      if (pendingAction === 'suspend') {
        await platformDirectoryApi.suspendTenant(tenant.overview.id);
        setNotice(`${tenant.overview.name} is suspended. Its members are refused on their next request.`);
        toast.success('Tenant suspended successfully');
      } else {
        await platformDirectoryApi.reactivateTenant(tenant.overview.id);
        setNotice(`${tenant.overview.name} is active again. Members can sign in and continue working.`);
        toast.success('Tenant reactivated successfully');
      }
      setPendingAction(null);
      await load();
      // The button that opened the dialog has been replaced by its opposite.
      headingRef.current?.focus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The change could not be saved.';
      setActionError(message);
      toast.error(message);
    } finally {
      setIsActing(false);
    }
  };

  if (!tenant) {
    return (
      <section className="space-y-4">
        <a href={hashRoute('tenants')} className={backLinkClass}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          All workspaces
        </a>
        {error ? (
          <ErrorBanner message={error} onRetry={() => void load()} />
        ) : (
          <div role="status" className="h-24 rounded-xl bg-hq-card border border-hq-border animate-pulse motion-reduce:animate-none">
            <span className="sr-only">Loading workspace</span>
          </div>
        )}
      </section>
    );
  }

  const { overview } = tenant;
  const canSuspend = SUSPENDABLE.includes(overview.status);
  const canReactivate = overview.status === 'SUSPENDED';

  return (
    <section className="space-y-5" aria-labelledby="tenant-detail-heading" aria-busy={isLoading}>
      <a href={hashRoute('tenants')} className={backLinkClass}>
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        All workspaces
      </a>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="tenant-detail-heading" ref={headingRef} tabIndex={-1} className="text-lg font-bold text-hq-foreground break-words focus:outline-none">
              {overview.name}
            </h2>
            <StatusBadge status={overview.status} />
          </div>
          <p className="text-xs text-hq-muted-foreground mt-1 break-words">
            {overview.legalName} · <span className="font-mono text-hq-link">{overview.tenantCode}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {canSuspend && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setPendingAction('suspend');
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-hq-danger/40 text-hq-danger hover:bg-hq-danger/10 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-danger"
            >
              <PauseCircle className="w-4 h-4" aria-hidden="true" />
              Suspend workspace
            </button>
          )}
          {canReactivate && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setPendingAction('reactivate');
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-hq-primary hover:bg-hq-primary-hover text-hq-primary-foreground text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
            >
              <PlayCircle className="w-4 h-4" aria-hidden="true" />
              Reactivate workspace
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-hq-success/30 bg-hq-success/10 px-3.5 py-3 text-xs text-hq-success">
          {notice}
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div role="tablist" aria-label="Workspace details" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-hq-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`${tabIdPrefix}-${item.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={tab === item.id ? `${tabIdPrefix}-${item.id}-panel` : undefined}
            onClick={() => setTab(item.id)}
            className={`px-3 py-2 -mb-px border-b-2 text-xs font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded-t ${
              tab === item.id ? 'border-hq-primary text-hq-foreground' : 'border-transparent text-hq-muted-foreground hover:text-hq-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${tabIdPrefix}-${tab}-panel`} aria-labelledby={`${tabIdPrefix}-${tab}-tab`} className="space-y-4">
        {tab === 'overview' && <OverviewTab tenant={tenant} onChanged={() => void load()} />}
        {tab === 'organization' && <OrganizationTab tenant={tenant} onChanged={load} />}
        {tab === 'owner' && <OwnerTab tenant={tenant} onChanged={load} />}
        {tab === 'users' && <UsersTab tenant={tenant} />}
        {tab === 'roles' && <RolesTab tenant={tenant} />}
        {tab === 'modules' && <ModulesTab tenant={tenant} onChanged={load} />}
        {tab === 'subscription' && <SubscriptionTab tenant={tenant} onChanged={load} />}
        {tab === 'activity' && <ActivityTab tenantId={tenant.overview.id} />}
      </div>

      {pendingAction === 'suspend' && (
        <ConfirmDialog
          title={`Suspend ${overview.name}?`}
          confirmLabel="Suspend workspace"
          busyLabel="Suspending…"
          tone="danger"
          isBusy={isActing}
          error={actionError}
          onConfirm={() => void runAction()}
          onCancel={() => setPendingAction(null)}
        >
          <p>
            Workspace <span className="font-mono text-hq-link">{overview.tenantCode}</span>. All{' '}
            {tenant.users.active} active member{tenant.users.active === 1 ? '' : 's'} will be blocked from it on their
            next request, and nobody can sign in to it until it is reactivated.
          </p>
          <p>Members’ accounts, other workspaces and this workspace’s data are not changed.</p>
        </ConfirmDialog>
      )}
      {pendingAction === 'reactivate' && (
        <ConfirmDialog
          title={`Reactivate ${overview.name}?`}
          confirmLabel="Reactivate workspace"
          busyLabel="Reactivating…"
          tone="primary"
          isBusy={isActing}
          error={actionError}
          onConfirm={() => void runAction()}
          onCancel={() => setPendingAction(null)}
        >
          <p>Members with an active membership can sign in to this workspace again straight away.</p>
        </ConfirmDialog>
      )}
    </section>
  );
};

/** How the workspace was onboarded from HQ, and the real state of its onboarding email. */
const OnboardingPanel: React.FC<{ tenantId: string; tenantName: string; suspended: boolean }> = ({ tenantId, tenantName, suspended }) => {
  const [onboarding, setOnboarding] = useState<OnboardingResult | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOnboarding(await platformProvisioningApi.onboarding(tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the onboarding record.');
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = async () => {
    setIsSending(true);
    setSendError(null);
    try {
      const result = await platformProvisioningApi.resendOnboardingEmail(tenantId);
      setOnboarding(result);
      setIsConfirming(false);
      // Success only when the mail server accepted the message.
      const email = result.onboardingEmail;
      if (email.status === 'SENT') toast.success('Onboarding email sent successfully');
      else toast.error(`The onboarding email was not sent: ${email.error ?? humanize(email.status)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The email could not be sent.';
      setSendError(message);
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  if (error) return <ErrorBanner message={error} onRetry={() => void load()} />;
  if (onboarding === undefined) {
    return (
      <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none">
        <span className="sr-only">Loading onboarding</span>
      </div>
    );
  }
  if (onboarding === null) {
    return (
      <Panel title="Onboarding">
        <p className="text-xs text-hq-muted-foreground">
          This workspace was not provisioned from HQ (it was created by sign-up or before onboarding emails existed), so there is no onboarding email.
        </p>
      </Panel>
    );
  }

  const email = onboarding.onboardingEmail;
  return (
    <Panel
      title="Onboarding"
      actions={
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          disabled={suspended}
          className="h-9 px-3 rounded-lg border border-hq-border text-xs font-semibold text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
        >
          {email.status === 'SENT' ? 'Send email again' : 'Send onboarding email'}
        </button>
      }
    >
      <DetailList>
        <DetailItem label="Onboarding email">
          <StatusBadge status={email.status} />
          {email.error && email.status !== 'SENT' && <p className="mt-1 text-hq-danger break-words">{email.error}</p>}
        </DetailItem>
        <DetailItem label="Sent to">{email.recipient}</DetailItem>
        <DetailItem label="Last attempt">
          <Value value={formatDateTime(email.attemptedAt)} empty="Never" />
        </DetailItem>
        <DetailItem label="Owner's password">
          {onboarding.owner.passwordStatus === 'SET'
            ? 'Chosen by the owner'
            : onboarding.owner.passwordStatus === 'TEMPORARY'
              ? 'Temporary: the owner has not signed in and replaced it yet'
              : 'Not set: send the onboarding email to issue a temporary password'}
        </DetailItem>
        <DetailItem label="Provisioned">{formatDateTime(onboarding.provisionedAt)}</DetailItem>
      </DetailList>
      {suspended && <p className="mt-3 text-[11px] text-hq-subtle-foreground">Reactivate the workspace to send its onboarding email.</p>}
      {isConfirming && (
        <ConfirmDialog
          title={`Send ${tenantName}'s onboarding email to ${email.recipient}?`}
          confirmLabel="Send email"
          busyLabel="Sending…"
          tone="primary"
          isBusy={isSending}
          error={sendError}
          onConfirm={() => void resend()}
          onCancel={() => setIsConfirming(false)}
        >
          <p>
            {onboarding.owner.passwordStatus === 'SET'
              ? 'The owner already chose a password; the email tells them where and how to sign in.'
              : 'The email carries a new temporary password. The temporary password sent earlier stops working, and the owner is signed out of any open session.'}
          </p>
        </ConfirmDialog>
      )}
    </Panel>
  );
};

/** The workspace's address and whether it was verified; changing it breaks the old address at once. */
const AddressPanel: React.FC<{ tenant: TenantDetail; onChanged: () => void }> = ({ tenant, onChanged }) => {
  const { overview } = tenant;
  const provisioning = overview.addressProvisioning;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [requested, setRequested] = useState(overview.subdomain ?? '');
  const [busy, setBusy] = useState<'change' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const change = async () => {
    setBusy('change');
    setError(null);
    try {
      const result = await platformGovernanceApi.changeSubdomain(overview.id, requested);
      setIsChanging(false);
      setNotice(`The workspace now lives at ${result.address ?? result.subdomain}. It will be verified again.`);
      toast.success('Workspace address updated successfully');
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The address could not be changed.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    if (!provisioning) return;
    setBusy('verify');
    setNotice(null);
    try {
      const check = await platformGovernanceApi.verifyDomain(provisioning.domainId);
      setNotice(check.status === 'ACTIVE' ? 'The address is reachable over HTTPS.' : check.error ?? 'The check did not pass.');
      if (check.status === 'ACTIVE') toast.success('Workspace address verified successfully');
      else toast.error(check.error ?? 'The address check did not pass.');
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The check could not run.';
      setNotice(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Workspace address"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setRequested(overview.subdomain ?? '');
              setError(null);
              setIsChanging(true);
            }}
            className="h-9 px-3 rounded-lg border border-hq-border text-xs font-semibold text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
          >
            Change address
          </button>
          <button
            type="button"
            onClick={() => void verify()}
            disabled={!provisioning || !overview.address || busy !== null}
            className="h-9 px-3 rounded-lg border border-hq-border text-xs font-semibold text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
          >
            {busy === 'verify' ? 'Checking…' : 'Verify now'}
          </button>
        </div>
      }
    >
      <DetailList>
        <DetailItem label="Address">
          {overview.address ? (
            <Value value={overview.address} mono />
          ) : (
            <Value value={overview.subdomain ? `${overview.subdomain} (PLATFORM_BASE_DOMAIN not set)` : null} empty="No address" mono />
          )}
        </DetailItem>
        <DetailItem label="Verification">
          {provisioning ? <StatusBadge status={provisioning.status} /> : <Value value={null} empty="Not applicable" />}
          {provisioning?.error && <p className="mt-1 text-hq-danger break-words">{provisioning.error}</p>}
        </DetailItem>
        <DetailItem label="Last checked">
          <Timestamp value={provisioning?.lastCheckedAt ?? null} empty="Not checked yet" />
        </DetailItem>
        <DetailItem label="Verified">
          <Value value={formatDateTime(provisioning?.verifiedAt)} empty="Not verified" />
        </DetailItem>
      </DetailList>
      {notice && (
        <p role="status" className="mt-3 text-xs text-hq-info">
          {notice}
        </p>
      )}
      {isChanging && (
        <ConfirmDialog
          title={`Change ${overview.name}'s address?`}
          confirmLabel="Change address"
          busyLabel="Changing…"
          tone="danger"
          isBusy={busy === 'change'}
          error={error}
          initialFocus={inputRef}
          onConfirm={() => void change()}
          onCancel={() => setIsChanging(false)}
        >
          <p>
            The current address{overview.address ? ` ${overview.address}` : ''} stops working immediately: bookmarks and sign-in links
            to it will fail. Members' accounts and data are not changed.
          </p>
          <label htmlFor="new-subdomain" className="block text-[11px] font-semibold text-hq-muted-foreground mt-2">
            New subdomain
          </label>
          <input
            id="new-subdomain"
            ref={inputRef}
            value={requested}
            onChange={(event) => setRequested(event.target.value)}
            className="h-10 w-full px-3 text-xs rounded-xl border border-hq-border bg-hq-input text-hq-foreground font-mono focus:outline-none focus:ring-2 focus:ring-hq-ring"
          />
          <p className="text-[11px] text-hq-subtle-foreground">Lower-case letters, numbers and single hyphens. Checked on the server.</p>
        </ConfirmDialog>
      )}
    </Panel>
  );
};

const OverviewTab: React.FC<{ tenant: TenantDetail; onChanged: () => void }> = ({ tenant, onChanged }) => {
  const { overview, health, users, modules } = tenant;
  const enabledModules = modules.filter((m) => m.enabled);

  return (
    <>
      <AddressPanel tenant={tenant} onChanged={onChanged} />
      <OnboardingPanel tenantId={tenant.overview.id} tenantName={tenant.overview.name} suspended={tenant.overview.status === 'SUSPENDED'} />
      <Panel title="Health" description="Current state from stored records. Nothing here is estimated.">
        <DetailList>
          <DetailItem label="Workspace status">
            <StatusBadge status={health.status} />
          </DetailItem>
          <DetailItem label="Subscription">
            {health.subscriptionStatus ? humanize(health.subscriptionStatus) : <Value value={null} empty="No subscription" />}
          </DetailItem>
          <DetailItem label="Seat usage">{seatUsage(users.seatsUsed, users.seatsLimit)}</DetailItem>
          <DetailItem label="Modules on">
            {enabledModules.length > 0 ? enabledModules.map((m) => m.name).join(', ') : <Value value={null} empty="All modules are off" />}
          </DetailItem>
          <DetailItem label="Last activity">
            <Timestamp value={health.lastActivityAt} empty="No member has signed in yet" />
          </DetailItem>
          <DetailItem label="Active sessions">{health.activeSessions}</DetailItem>
          <DetailItem label="Owner’s last sign-in">
            <Timestamp value={health.ownerLastLoginAt} empty={tenant.owner ? 'Never' : 'No active owner'} />
          </DetailItem>
        </DetailList>

        <h4 className="text-[11px] font-semibold text-hq-subtle-foreground mt-5 mb-2">Configuration</h4>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
          {health.configuration.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              {item.configured ? (
                <CheckCircle2 className="w-4 h-4 text-hq-success shrink-0" aria-hidden="true" />
              ) : (
                <CircleDashed className="w-4 h-4 text-hq-subtle-foreground shrink-0" aria-hidden="true" />
              )}
              <span className={item.configured ? 'text-hq-foreground' : 'text-hq-muted-foreground'}>{item.label}</span>
              <span className="text-hq-subtle-foreground">— {item.configured ? 'Configured' : 'Not configured'}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Workspace">
        <DetailList>
          <DetailItem label="Organization name">{overview.name}</DetailItem>
          <DetailItem label="Legal name">{overview.legalName}</DetailItem>
          <DetailItem label="Tenant ID">
            <Value value={overview.id} mono />
          </DetailItem>
          <DetailItem label="Tenant code">
            <Value value={overview.tenantCode} mono />
          </DetailItem>
          <DetailItem label="Subdomain">
            <Value value={overview.subdomain} empty="No address" mono />
          </DetailItem>
          <DetailItem label="Country">
            <Value value={overview.countryCode} />
          </DetailItem>
          <DetailItem label="Plan">
            <Value value={overview.plan ? `${overview.plan.name} (${overview.plan.code})` : null} empty="No plan" />
          </DetailItem>
          <DetailItem label="Subscription">
            {overview.subscription ? (
              <>
                {humanize(overview.subscription.status)} · from {formatDate(overview.subscription.startsOn)}
                {overview.subscription.endsOn && ` to ${formatDate(overview.subscription.endsOn)}`}
                {overview.subscription.trialEndsOn && ` · trial ends ${formatDate(overview.subscription.trialEndsOn)}`}
              </>
            ) : (
              <Value value={null} empty="No subscription" />
            )}
          </DetailItem>
          <DetailItem label="Created">{formatDateTime(overview.createdAt)}</DetailItem>
          <DetailItem label="Updated">{formatDateTime(overview.updatedAt)}</DetailItem>
        </DetailList>
      </Panel>
    </>
  );
};

const OrganizationTab: React.FC<{ tenant: TenantDetail; onChanged: () => Promise<void> }> = ({ tenant, onChanged }) => {
  const org = tenant.organization;
  const [isEditing, setIsEditing] = useState(false);
  if (isEditing) {
    return (
      <Panel title="Edit organization" description="The same profile the workspace's administrators edit in Organization & Settings.">
        <OrganizationForm
          tenant={tenant}
          onSaved={async () => {
            await onChanged();
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      </Panel>
    );
  }
  return (
    <Panel
      title="Organization profile"
      description="As saved by the workspace’s administrators in Organization & Settings, or from HQ."
      actions={
        <button type="button" onClick={() => setIsEditing(true)} className={secondaryButtonClass}>
          Edit organization
        </button>
      }
    >
      <DetailList>
        <DetailItem label="Company name">
          <Value value={org.companyName} />
        </DetailItem>
        <DetailItem label="Legal name">{tenant.overview.legalName}</DetailItem>
        <DetailItem label="Country">
          <Value value={tenant.overview.countryCode} />
        </DetailItem>
        <DetailItem label="Industry">
          <Value value={org.industry ? humanize(org.industry) : null} />
        </DetailItem>
        <DetailItem label="GSTIN / tax ID">
          <Value value={org.taxId} mono />
        </DetailItem>
        <DetailItem label="Currency">
          <Value value={org.currency} />
        </DetailItem>
        <DetailItem label="Timezone">
          <Value value={org.timezone} />
        </DetailItem>
        <DetailItem label="Website">
          <Value value={org.website} />
        </DetailItem>
        <DetailItem label="Contact person">
          <Value value={org.contactName} />
        </DetailItem>
        <DetailItem label="Contact email">
          <Value value={org.contactEmail} />
        </DetailItem>
        <DetailItem label="Contact phone">
          <Value value={org.contactPhone} />
        </DetailItem>
        <DetailItem label="Registered address">
          <Value value={org.address} />
        </DetailItem>
      </DetailList>
      {org.contactIsWorkspaceOwner && (
        <p className="text-[11px] text-hq-subtle-foreground mt-4">
          No contact has been saved, so the contact shown is the workspace owner.
        </p>
      )}
    </Panel>
  );
};

const OwnerTab: React.FC<{ tenant: TenantDetail; onChanged: () => Promise<void> }> = ({ tenant, onChanged }) => {
  const owner = tenant.owner;
  const [isEditing, setIsEditing] = useState(false);
  if (owner && isEditing) {
    return (
      <Panel title="Edit owner" description="The owner's own account details.">
        <UserIdentityForm
          userId={owner.userId}
          initial={{ name: owner.name, email: owner.email, phone: owner.phone }}
          onSaved={async () => {
            await onChanged();
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      </Panel>
    );
  }
  if (!owner) {
    return (
      <Panel title="Owner">
        <p className="text-xs text-hq-warning/90 leading-relaxed">
          No active member holds the owner role, so nobody can administer this workspace from inside it.
        </p>
      </Panel>
    );
  }
  return (
    <Panel
      title="Owner"
      description="The earliest-joined active member holding the owner role. Change who holds it from each person's memberships in User management."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setIsEditing(true)} className={secondaryButtonClass}>
            Edit owner
          </button>
        <a
          href={hashRoute('users', owner.userId)}
          className="text-xs font-bold text-hq-link hover:text-hq-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded"
        >
          Open user
        </a>
        </div>
      }
    >
      <DetailList>
        <DetailItem label="Name">
          <Value value={owner.name} />
        </DetailItem>
        <DetailItem label="Email">{owner.email}</DetailItem>
        <DetailItem label="Phone">
          <Value value={owner.phone} />
        </DetailItem>
        <DetailItem label="User ID">
          <Value value={owner.userId} mono />
        </DetailItem>
        <DetailItem label="Membership ID">
          <Value value={owner.memberId} mono />
        </DetailItem>
        <DetailItem label="Role">
          {owner.roles.map((role) => `${role.name} (${ROLE_KIND_LABEL[role.kind]})`).join(', ')}
        </DetailItem>
        <DetailItem label="Membership">
          <StatusBadge status={owner.membershipStatus} />
          {owner.joinedAt && <span className="text-hq-subtle-foreground"> · joined {formatDate(owner.joinedAt)}</span>}
        </DetailItem>
        <DetailItem label="Account status">
          <StatusBadge status={owner.accountStatus} />
        </DetailItem>
        <DetailItem label="Two-factor sign-in">
          <Value value={null} empty="Not available for workspace accounts" />
        </DetailItem>
        <DetailItem label="Last sign-in">
          <Timestamp value={owner.lastLoginAt} empty="Never" />
        </DetailItem>
      </DetailList>
    </Panel>
  );
};

const MEMBER_FILTERS = [
  { value: '', label: 'All, including removed' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ARCHIVED', label: 'Removed' },
];

const UsersTab: React.FC<{ tenant: TenantDetail }> = ({ tenant }) => {
  const [page, setPage] = useState(1);
  const [membershipStatus, setMembershipStatus] = useState('');
  const [result, setResult] = useState<Page<UserListItem> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tenantId = tenant.overview.id;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setResult(
        await platformDirectoryApi.listUsers({
          tenantId,
          page,
          pageSize: PAGE_SIZE,
          sort: 'name',
          order: 'asc',
          membershipStatus: membershipStatus || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load members.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, page, membershipStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const { users } = tenant;
  return (
    <>
      <Panel title="Members">
        <DetailList>
          <DetailItem label="Current members (active and suspended)">{users.total}</DetailItem>
          <DetailItem label="Active">{users.active}</DetailItem>
          <DetailItem label="Suspended (inactive)">{users.suspended}</DetailItem>
          <DetailItem label="Removed (former members, kept for history)">{users.removed}</DetailItem>
          <DetailItem label="All-time members">{users.total + users.removed}</DetailItem>
          <DetailItem label="Accounts disabled on the platform">{users.accountsDisabled}</DetailItem>
          <DetailItem label="Seats used">{seatUsage(users.seatsUsed, users.seatsLimit)}</DetailItem>
          <DetailItem label="Seats available">
            {users.seatsLimit === null ? <Value value={null} empty="No seat limit set" /> : Math.max(users.seatsLimit - users.seatsUsed, 0)}
          </DetailItem>
        </DetailList>
        <p className="text-[11px] text-hq-subtle-foreground mt-3">
          A seat is used by an active or suspended member. Removed members stay on record, with the date they were removed, but
          never use a seat.
        </p>
      </Panel>
      <div className="max-w-xs">
        <label htmlFor="member-status" className="block text-[11px] font-semibold text-hq-muted-foreground mb-1">
          Show
        </label>
        <select
          id="member-status"
          value={membershipStatus}
          onChange={(event) => {
            setMembershipStatus(event.target.value);
            setPage(1);
          }}
          className="h-10 w-full px-3 text-xs rounded-xl border border-hq-border bg-hq-input text-hq-foreground focus:outline-none focus:ring-2 focus:ring-hq-ring"
        >
          {MEMBER_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <UserTable
        items={result?.items ?? []}
        isLoading={isLoading}
        focusTenantId={tenantId}
        emptyTitle="No members"
        emptyDetail="Nobody has been added to this workspace."
      />
      {result && (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          noun="members"
          disabled={isLoading}
          onPageChange={setPage}
        />
      )}
    </>
  );
};

const RolesTab: React.FC<{ tenant: TenantDetail }> = ({ tenant }) => (
  <div className="border border-hq-border rounded-xl overflow-hidden bg-hq-card">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs border-collapse">
        <caption className="sr-only">Workspace roles</caption>
        <thead>
          <tr className="bg-hq-muted border-b border-hq-border text-hq-muted-foreground font-bold uppercase tracking-wider text-[10px]">
            <th scope="col" className="py-3 px-4">Role</th>
            <th scope="col" className="py-3 px-4">Type</th>
            <th scope="col" className="py-3 px-4">Status</th>
            <th scope="col" className="py-3 px-4 text-right">Members</th>
            <th scope="col" className="py-3 px-4 text-right">Permissions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hq-border">
          {tenant.roles.length === 0 && (
            <tr>
              <td colSpan={5} className="py-10 px-4 text-center text-hq-muted-foreground">
                This workspace has no roles.
              </td>
            </tr>
          )}
          {tenant.roles.map((role) => (
            <tr key={role.id}>
              <td className="py-3 px-4">
                <div className="font-bold text-hq-foreground break-words">{role.name}</div>
                <div className="font-mono text-[10px] text-hq-subtle-foreground">{role.code}</div>
              </td>
              <td className="py-3 px-4 text-hq-foreground/90">{ROLE_KIND_LABEL[role.kind]}</td>
              <td className="py-3 px-4">
                <StatusBadge status={role.status} />
              </td>
              <td className="py-3 px-4 text-right tabular-nums text-hq-foreground">{role.memberCount}</td>
              <td className="py-3 px-4 text-right tabular-nums text-hq-foreground">{role.permissionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/** Module switches. Turning one off hides its screens and refuses its API for every member at once. */
const ModulesTab: React.FC<{ tenant: TenantDetail; onChanged: () => Promise<void> }> = ({ tenant, onChanged }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingOff, setPendingOff] = useState<TenantDetail['modules'][number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (code: string) => tenant.modules.find((m) => m.code === code)?.name ?? code;

  const setModule = async (module: TenantDetail['modules'][number], enabled: boolean) => {
    setBusy(module.code);
    setError(null);
    try {
      await platformOperationsApi.setModule(tenant.overview.id, module.code, enabled);
      toast.success(`${module.name} turned ${enabled ? 'on' : 'off'} successfully`);
      setPendingOff(null);
      await onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The module could not be changed.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && !pendingOff && <ErrorBanner message={error} />}
      <ul className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {tenant.modules.map((module) => (
          <li key={module.code} className="border border-hq-border rounded-xl bg-hq-card p-4 space-y-2 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-hq-foreground">{module.name}</h3>
              <span className={`text-xs font-bold ${module.enabled ? 'text-hq-success' : 'text-hq-muted-foreground'}`}>
                {module.enabled ? 'On' : 'Off'}
              </span>
            </div>
            <p className="text-xs text-hq-muted-foreground leading-relaxed">{module.description}</p>
            <p className="text-xs text-hq-foreground/90">
              <span className="font-semibold">Screens</span> {module.features.join(', ')}
            </p>
            <p className="text-xs text-hq-foreground/90">
              <span className="font-semibold">Features</span> {module.capabilities.join(', ')}
            </p>
            {module.requires.length > 0 && (
              <p className="text-[11px] text-hq-subtle-foreground">Needs {module.requires.map(nameOf).join(', ')}</p>
            )}
            <div className="pt-1 mt-auto">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => (module.enabled ? setPendingOff(module) : void setModule(module, true))}
                className={module.enabled ? secondaryButtonClass : primaryButtonClass}
              >
                {busy === module.code ? 'Saving…' : module.enabled ? `Turn off ${module.name}` : `Turn on ${module.name}`}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {pendingOff && (
        <ConfirmDialog
          title={`Turn off ${pendingOff.name} for ${tenant.overview.name}?`}
          confirmLabel={`Turn off ${pendingOff.name}`}
          busyLabel="Turning off…"
          tone="danger"
          isBusy={busy !== null}
          error={error}
          onConfirm={() => void setModule(pendingOff, false)}
          onCancel={() => {
            setPendingOff(null);
            setError(null);
          }}
        >
          <p>
            Every member loses {pendingOff.features.join(', ')} on their next request. Nothing is deleted: turning it back on restores
            access to the same data.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
};

const SubscriptionTab: React.FC<{ tenant: TenantDetail; onChanged: () => Promise<void> }> = ({ tenant, onChanged }) => {
  const { plan, subscription } = tenant.overview;
  const [isChanging, setIsChanging] = useState(false);
  const change = (
    <button type="button" onClick={() => setIsChanging(true)} className={secondaryButtonClass}>
      {subscription ? 'Change subscription' : 'Set subscription'}
    </button>
  );
  if (isChanging) {
    return (
      <SubscriptionForm
        tenant={tenant}
        onSaved={async () => {
          await onChanged();
          setIsChanging(false);
        }}
        onCancel={() => setIsChanging(false)}
      />
    );
  }
  if (!subscription) {
    return (
      <Panel title="Subscription" actions={change}>
        <p className="text-xs text-hq-muted-foreground">
          This workspace has no subscription record. No plan, price or billing period is stored for it, so none is shown.
        </p>
      </Panel>
    );
  }
  return (
    <Panel title="Subscription" description="As stored. Prices are not part of the plan records yet." actions={change}>
      <DetailList>
        <DetailItem label="Plan">
          <Value value={plan ? `${plan.name} (${plan.code})` : null} empty="No plan" />
        </DetailItem>
        <DetailItem label="Status">
          <StatusBadge status={subscription.status} />
        </DetailItem>
        <DetailItem label="Starts">{formatDate(subscription.startsOn)}</DetailItem>
        <DetailItem label="Ends">
          <Value value={formatDate(subscription.endsOn)} empty="Open-ended" />
        </DetailItem>
        <DetailItem label="Trial ends">
          <Value value={formatDate(subscription.trialEndsOn)} empty="No trial" />
        </DetailItem>
      </DetailList>
    </Panel>
  );
};

/** The plan catalog and industry list from the server, loaded when a form needs them. */
function useProvisioningOptions() {
  const [options, setOptions] = useState<ProvisioningOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setOptions(await platformProvisioningApi.options());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the form options.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { options, error, retry: load };
}

const OptionsState: React.FC<{ error: string | null; onRetry: () => void }> = ({ error, onRetry }) =>
  error ? (
    <ErrorBanner message={error} onRetry={onRetry} />
  ) : (
    <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading form</span>
    </div>
  );

/**
 * Moves the workspace to a new subscription. The server keeps the current one
 * as history (it ends the day before the new one starts), so this is confirmed.
 */
const SubscriptionForm: React.FC<{ tenant: TenantDetail; onSaved: () => Promise<void>; onCancel: () => void }> = ({ tenant, onSaved, onCancel }) => {
  const formId = useId();
  const { options, error: optionsError, retry } = useProvisioningOptions();
  const current = tenant.overview.subscription;
  const [planCode, setPlanCode] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'TRIALING'>('ACTIVE');
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState('');
  const [trialEndsOn, setTrialEndsOn] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!options) return <OptionsState error={optionsError} onRetry={() => void retry()} />;
  const chosen = options.plans.find((p) => p.code === planCode) ?? null;

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!planCode) found.planCode = 'Choose a plan.';
    if (!startsOn) found.startsOn = 'Choose when the subscription starts.';
    if (current && startsOn && startsOn <= current.startsOn.slice(0, 10)) found.startsOn = `Start after the current subscription, which started on ${formatDate(current.startsOn)}.`;
    if (endsOn && endsOn < startsOn) found.endsOn = 'The end date cannot be before the start date.';
    if (status === 'TRIALING' && !trialEndsOn) found.trialEndsOn = 'Choose when the trial ends.';
    if (trialEndsOn && trialEndsOn < startsOn) found.trialEndsOn = 'The trial cannot end before the start date.';
    setProblems(found);
    if (Object.keys(found).length === 0) setIsConfirming(true);
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await platformOperationsApi.changeSubscription(tenant.overview.id, {
        planCode,
        status,
        startsOn,
        endsOn: endsOn || undefined,
        trialEndsOn: status === 'TRIALING' ? trialEndsOn || undefined : undefined,
      });
      toast.success('Subscription updated successfully');
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The subscription could not be changed.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel title={current ? 'Change subscription' : 'Set subscription'} description="Plans come from the plan catalog. Only active plans can be chosen.">
      {options.plans.length === 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-hq-muted-foreground">There are no active plans, so a subscription cannot be set. A plan must exist before a workspace can subscribe to it.</p>
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            Back
          </button>
        </div>
      ) : (
        <form onSubmit={review} noValidate className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field id={`${formId}-plan`} label="Plan" required error={problems.planCode}>
              {(props) => (
                <select {...props} value={planCode} onChange={(e) => setPlanCode(e.target.value)} className={fieldClass}>
                  <option value="">Choose a plan</option>
                  {options.plans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} ({p.code}){p.billingInterval ? ` · ${humanize(p.billingInterval).toLowerCase()}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id={`${formId}-status`} label="Status" required>
              {(props) => (
                <select {...props} value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'TRIALING')} className={fieldClass}>
                  <option value="ACTIVE">Active</option>
                  <option value="TRIALING">Trial</option>
                </select>
              )}
            </Field>
            <Field id={`${formId}-starts`} label="Starts on" required error={problems.startsOn}>
              {(props) => <input {...props} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={fieldClass} />}
            </Field>
            <Field id={`${formId}-ends`} label="Ends on" error={problems.endsOn} hint="Leave empty for an open-ended subscription.">
              {(props) => <input {...props} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={fieldClass} />}
            </Field>
            {status === 'TRIALING' && (
              <Field id={`${formId}-trial`} label="Trial ends on" required error={problems.trialEndsOn}>
                {(props) => <input {...props} type="date" value={trialEndsOn} onChange={(e) => setTrialEndsOn(e.target.value)} className={fieldClass} />}
              </Field>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButtonClass}>
              Review change
            </button>
            <button type="button" onClick={onCancel} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {isConfirming && chosen && (
        <ConfirmDialog
          title={`Move ${tenant.overview.name} to ${chosen.name} from ${formatDate(startsOn)}?`}
          confirmLabel="Change subscription"
          busyLabel="Saving…"
          tone="primary"
          isBusy={isSaving}
          error={error}
          onConfirm={() => void save()}
          onCancel={() => setIsConfirming(false)}
        >
          {current ? (
            <p>
              The current subscription{tenant.overview.plan ? ` (${tenant.overview.plan.name})` : ''} is kept as history and ends the day before
              the new one starts. It is not deleted or rewritten.
            </p>
          ) : (
            <p>The workspace has no subscription yet; this becomes its first one.</p>
          )}
        </ConfirmDialog>
      )}
    </Panel>
  );
};

interface OrganizationFormState {
  organizationName: string;
  legalName: string;
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
}

/** Organization details as HQ edits them; the server validates the same rules again. */
const OrganizationForm: React.FC<{ tenant: TenantDetail; onSaved: () => Promise<void>; onCancel: () => void }> = ({ tenant, onSaved, onCancel }) => {
  const formId = useId();
  const { options, error: optionsError, retry } = useProvisioningOptions();
  const org = tenant.organization;
  // A contact shown only because none was saved (the owner) is not pre-filled, so saving does not store it.
  const [form, setForm] = useState<OrganizationFormState>(() => ({
    organizationName: org.companyName ?? tenant.overview.name,
    legalName: tenant.overview.legalName,
    industry: org.industry ?? '',
    website: org.website ?? '',
    contactName: org.contactIsWorkspaceOwner ? '' : org.contactName ?? '',
    contactEmail: org.contactIsWorkspaceOwner ? '' : org.contactEmail ?? '',
    contactPhone: org.contactPhone ?? '',
    address: org.address ?? '',
    countryCode: tenant.overview.countryCode ?? '',
    taxId: org.taxId ?? '',
    timezone: org.timezone ?? browserTimezone(),
    currency: org.currency ?? 'INR',
  }));
  const [problems, setProblems] = useState<Partial<Record<keyof OrganizationFormState, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!options) return <OptionsState error={optionsError} onRetry={() => void retry()} />;

  const update = (key: keyof OrganizationFormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const text = (key: keyof OrganizationFormState, label: string, extra: { required?: boolean; hint?: string; type?: string; maxLength?: number; className?: string } = {}) => (
    <Field id={`${formId}-${key}`} label={label} required={extra.required} hint={extra.hint} error={problems[key]}>
      {(props) => (
        <input
          {...props}
          type={extra.type ?? 'text'}
          value={form[key]}
          maxLength={extra.maxLength}
          onChange={(e) => update(key, e.target.value)}
          className={`${fieldClass} ${extra.className ?? ''}`}
        />
      )}
    </Field>
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    const found: Partial<Record<keyof OrganizationFormState, string>> = {};
    const f = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as unknown as OrganizationFormState;
    if (f.organizationName.length < 2) found.organizationName = 'Enter the organization name (at least 2 characters).';
    if (f.legalName.length < 2) found.legalName = 'Enter the registered legal name.';
    if (f.website && !/^https?:\/\/\S+$/.test(f.website)) found.website = 'Enter a website starting with https://.';
    if (f.contactEmail && !EMAIL.test(f.contactEmail)) found.contactEmail = 'Enter a valid email address.';
    if (f.contactPhone && !PHONE.test(f.contactPhone)) found.contactPhone = 'Digits only, optionally starting with a country code such as +91.';
    if (f.countryCode && !/^[A-Za-z]{2}$/.test(f.countryCode)) found.countryCode = 'A two-letter code such as IN.';
    if (f.taxId && !/^[A-Za-z0-9]{5,20}$/.test(f.taxId)) found.taxId = '5–20 letters and digits.';
    if (!/^[A-Za-z]{3}$/.test(f.currency)) found.currency = 'A three-letter currency code such as INR.';
    setProblems(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    setError(null);
    try {
      await platformOperationsApi.updateTenant(tenant.overview.id, {
        ...f,
        countryCode: f.countryCode.toUpperCase(),
        taxId: f.taxId.toUpperCase(),
        currency: f.currency.toUpperCase(),
      });
      toast.success('Tenant updated successfully');
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The organization could not be saved.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-busy={isSaving} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {text('organizationName', 'Organization name', { required: true, maxLength: 200, hint: 'Shown across the workspace.' })}
        {text('legalName', 'Legal name', { required: true, maxLength: 200 })}
        <Field id={`${formId}-industry`} label="Industry" error={problems.industry}>
          {(props) => (
            <select {...props} value={form.industry} onChange={(e) => update('industry', e.target.value)} className={fieldClass}>
              <option value="">Not specified</option>
              {options.industries.map((code) => (
                <option key={code} value={code}>
                  {industryLabel(code)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {text('website', 'Website', { type: 'url', maxLength: 300 })}
        {text('taxId', 'Tax ID / GSTIN', { maxLength: 20, className: 'uppercase' })}
        {text('countryCode', 'Country', { maxLength: 2, className: 'uppercase', hint: 'Two-letter code, such as IN.' })}
        {text('contactName', 'Contact name', { maxLength: 160, hint: org.contactIsWorkspaceOwner ? 'None saved: the workspace owner is shown as the contact.' : undefined })}
        {text('contactEmail', 'Contact email', { type: 'email', maxLength: 320 })}
        {text('contactPhone', 'Contact phone', { type: 'tel', maxLength: 24 })}
        <Field id={`${formId}-timezone`} label="Timezone" required error={problems.timezone}>
          {(props) => (
            <select {...props} value={form.timezone} onChange={(e) => update('timezone', e.target.value)} className={fieldClass}>
              {timezones(form.timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          )}
        </Field>
        {text('currency', 'Currency', { required: true, maxLength: 3, className: 'uppercase', hint: 'Three-letter code, such as INR.' })}
        <div className="md:col-span-2">
          <Field id={`${formId}-address`} label="Address" error={problems.address} hint="One field: street, city, state and postal code.">
            {(props) => (
              <textarea {...props} rows={2} maxLength={500} value={form.address} onChange={(e) => update('address', e.target.value)} className={`${fieldClass} h-auto py-2`} />
            )}
          </Field>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-hq-danger/30 bg-hq-danger/10 px-3 py-2 text-xs text-hq-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSaving} className={primaryButtonClass}>
          {isSaving ? 'Saving…' : 'Save organization'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
};

const ActivityTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<TenantActivityItem> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setResult(await platformDirectoryApi.tenantActivity(tenantId, page, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load activity.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = result?.items ?? [];
  return (
    <>
      <p className="text-xs text-hq-muted-foreground">
        Changes the workspace’s administrators made (members, roles, modules, settings) and actions taken on it from
        the platform.
      </p>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <ol className="border border-hq-border rounded-xl bg-hq-card divide-y divide-hq-border" aria-busy={isLoading}>
        {!isLoading && items.length === 0 && !error && (
          <li className="px-4 py-10 text-center text-xs text-hq-muted-foreground">No recorded activity for this workspace yet.</li>
        )}
        {isLoading && items.length === 0 && (
          <li className="px-4 py-4" aria-hidden="true">
            <div className="h-4 rounded bg-hq-muted animate-pulse motion-reduce:animate-none" />
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 text-xs">
            <time dateTime={item.occurredAt} className="text-hq-muted-foreground sm:w-44 shrink-0 tabular-nums">
              {formatDateTime(item.occurredAt)}
            </time>
            <div className="min-w-0">
              <p className="text-hq-foreground">
                <span className="font-semibold">{humanize(item.action)}</span>
                <span className="text-hq-subtle-foreground"> · {item.source === 'PLATFORM' ? 'Platform' : 'Workspace'}</span>
              </p>
              {item.description && <p className="text-hq-muted-foreground break-words">{item.description}</p>}
              <p className="text-hq-subtle-foreground break-words">
                {item.actor ? `By ${item.actor.name ?? item.actor.email}` : 'By the system'}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {result && (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          noun="events"
          disabled={isLoading}
          onPageChange={setPage}
        />
      )}
    </>
  );
};
