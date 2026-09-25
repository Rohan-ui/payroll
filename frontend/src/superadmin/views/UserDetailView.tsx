import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Ban, CheckCircle2 } from 'lucide-react';
import { platformDirectoryApi, UserDetail } from '../api/platform-directory.api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailItem, DetailList, ErrorBanner, Panel, Value } from '../components/DetailList';
import { StatusBadge } from '../components/StatusBadge';
import { describeUserAgent, formatDate, formatDateTime, humanize, initials } from '../format';
import { hashRoute } from '../hash-route';
import { ROLE_KIND_LABEL, Timestamp } from './UserTable';

type PendingAction = 'disable' | 'enable' | null;

const backLinkClass =
  'inline-flex items-center gap-1.5 text-xs font-semibold text-hq-muted-foreground hover:text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded';
const linkClass =
  'font-semibold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded break-words';
const thClass = 'py-2.5 px-3 font-bold';

/**
 * One global sign-in account. Disabling it is a platform action that applies
 * to every workspace; each workspace's own memberships are left to that
 * workspace's administrators.
 */
export const UserDetailView: React.FC<{ userId: string }> = ({ userId }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setUser(await platformDirectoryApi.getUser(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this user.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setUser(null);
    setNotice(null);
    void load();
  }, [load]);

  const loadedId = user?.identity.id;
  useEffect(() => {
    if (loadedId) headingRef.current?.focus();
  }, [loadedId]);

  const runAction = async () => {
    if (!user || !pendingAction) return;
    setIsActing(true);
    setActionError(null);
    try {
      if (pendingAction === 'disable') {
        const result = await platformDirectoryApi.disableUser(user.identity.id);
        setNotice(
          `Account disabled. ${result.revokedSessions} session${result.revokedSessions === 1 ? ' was' : 's were'} ended and sign-in is blocked on every workspace.`,
        );
      } else {
        await platformDirectoryApi.enableUser(user.identity.id);
        setNotice('Account enabled. They can sign in to the workspaces where their membership is active.');
      }
      setPendingAction(null);
      await load();
      headingRef.current?.focus();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The change could not be saved.');
    } finally {
      setIsActing(false);
    }
  };

  if (!user) {
    return (
      <section className="space-y-4">
        <a href={hashRoute('users')} className={backLinkClass}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          All users
        </a>
        {error ? (
          <ErrorBanner message={error} onRetry={() => void load()} />
        ) : (
          <div role="status" className="h-24 rounded-xl bg-hq-card border border-hq-border animate-pulse motion-reduce:animate-none">
            <span className="sr-only">Loading user</span>
          </div>
        )}
      </section>
    );
  }

  const { identity, account, memberships, sessions } = user;
  const displayName = identity.name || identity.email;
  const isDisabled = account.status === 'DISABLED';
  const ownedWorkspaces = memberships.filter(
    (m) => m.membershipStatus === 'ACTIVE' && m.roles.some((role) => role.kind === 'OWNER'),
  );
  const isLocked = account.lockedUntil !== null && new Date(account.lockedUntil).getTime() > Date.now();

  return (
    <section className="space-y-5" aria-labelledby="user-detail-heading" aria-busy={isLoading}>
      <a href={hashRoute('users')} className={backLinkClass}>
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        All users
      </a>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="w-11 h-11 shrink-0 rounded-full bg-hq-primary/15 text-hq-link text-sm font-bold flex items-center justify-center"
            aria-hidden="true"
          >
            {initials(identity.name, identity.email)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="user-detail-heading" ref={headingRef} tabIndex={-1} className="text-lg font-bold text-hq-foreground break-words focus:outline-none">
                {displayName}
              </h2>
              <StatusBadge status={account.status} prefix="Account" />
            </div>
            <p className="text-xs text-hq-muted-foreground mt-1 break-all">{identity.email}</p>
          </div>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-1 shrink-0">
          {isDisabled ? (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setPendingAction('enable');
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-hq-primary hover:bg-hq-primary-hover text-hq-primary-foreground text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Enable account
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setPendingAction('disable');
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-hq-danger/40 text-hq-danger hover:bg-hq-danger/10 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-danger"
            >
              <Ban className="w-4 h-4" aria-hidden="true" />
              Disable account
            </button>
          )}
          <p className="text-[11px] text-hq-subtle-foreground">Applies to the sign-in account on every workspace.</p>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-hq-success/30 bg-hq-success/10 px-3.5 py-3 text-xs text-hq-success">
          {notice}
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Panel title="Identity">
        <DetailList>
          <DetailItem label="Name">
            <Value value={identity.name} />
          </DetailItem>
          <DetailItem label="Email">
            {identity.email}
            <span className="text-hq-subtle-foreground"> · {identity.emailVerifiedAt ? `verified ${formatDate(identity.emailVerifiedAt)}` : 'not verified'}</span>
          </DetailItem>
          <DetailItem label="Phone">
            <Value value={identity.phone} />
          </DetailItem>
          <DetailItem label="User ID">
            <Value value={identity.id} mono />
          </DetailItem>
          <DetailItem label="Created">{formatDateTime(identity.createdAt)}</DetailItem>
          <DetailItem label="Updated">{formatDateTime(identity.updatedAt)}</DetailItem>
        </DetailList>
      </Panel>

      <Panel
        title="Workspace memberships"
        description="One account can belong to several workspaces, each with its own roles and membership status."
      >
        {memberships.length === 0 ? (
          <p className="text-xs text-hq-muted-foreground">This account does not belong to any workspace.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[720px] text-left text-xs border-collapse">
              <caption className="sr-only">Workspace memberships</caption>
              <thead>
                <tr className="border-b border-hq-border text-hq-muted-foreground uppercase tracking-wider text-[10px]">
                  <th scope="col" className={thClass}>Workspace</th>
                  <th scope="col" className={thClass}>Tenant ID</th>
                  <th scope="col" className={thClass}>Membership ID</th>
                  <th scope="col" className={thClass}>Role</th>
                  <th scope="col" className={thClass}>Membership</th>
                  <th scope="col" className={thClass}>Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hq-border">
                {memberships.map((m) => (
                  <tr key={m.memberId} className="align-top">
                    <td className="py-2.5 px-3">
                      <a href={hashRoute('tenants', m.tenantId)} className={linkClass}>
                        {m.tenantName}
                      </a>
                      <div className="font-mono text-[10px] text-hq-link break-all">{m.tenantCode}</div>
                      {m.tenantStatus !== 'ACTIVE' && (
                        <div className="mt-0.5">
                          <StatusBadge status={m.tenantStatus} prefix="Workspace" />
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-hq-muted-foreground break-all">{m.tenantId}</td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-hq-muted-foreground break-all">{m.memberId}</td>
                    <td className="py-2.5 px-3 text-hq-foreground">
                      {m.roles.length > 0 ? (
                        m.roles.map((role) => (
                          <div key={role.code}>
                            {role.name} <span className="text-hq-subtle-foreground">· {ROLE_KIND_LABEL[role.kind]}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-hq-subtle-foreground italic">No role</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={m.membershipStatus} />
                      {m.removedAt && <div className="text-hq-subtle-foreground mt-0.5">removed {formatDate(m.removedAt)}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-hq-foreground/90 whitespace-nowrap">
                      <Value value={formatDate(m.joinedAt)} empty="Not recorded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Authentication">
        <DetailList>
          <DetailItem label="Account status">
            <StatusBadge status={account.status} />
          </DetailItem>
          <DetailItem label="Last sign-in">
            <Timestamp value={account.lastLoginAt} empty="Never" />
          </DetailItem>
          <DetailItem label="Failed sign-in attempts">
            {account.failedSignInAttempts}
            {isLocked && <span className="text-hq-warning"> · locked until {formatDateTime(account.lockedUntil)}</span>}
          </DetailItem>
          <DetailItem label="Two-factor sign-in">
            <Value value={null} empty="Not available for workspace accounts" />
          </DetailItem>
          <DetailItem label="Invitation">
            <Value value={null} empty="Not tracked — members are added directly by workspace administrators" />
          </DetailItem>
        </DetailList>
      </Panel>

      <Panel
        title="Sessions"
        description={`${sessions.active} active now. Each sign-in records the address it came from and the browser’s user-agent string; location is not recorded.`}
      >
        {sessions.recent.length === 0 ? (
          <p className="text-xs text-hq-muted-foreground">This account has never signed in.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[720px] text-left text-xs border-collapse">
              <caption className="sr-only">Recent sessions</caption>
              <thead>
                <tr className="border-b border-hq-border text-hq-muted-foreground uppercase tracking-wider text-[10px]">
                  <th scope="col" className={thClass}>Signed in</th>
                  <th scope="col" className={thClass}>Last used</th>
                  <th scope="col" className={thClass}>Workspace</th>
                  <th scope="col" className={thClass}>Address</th>
                  <th scope="col" className={thClass}>Browser</th>
                  <th scope="col" className={thClass}>State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hq-border">
                {sessions.recent.map((session) => (
                  <tr key={session.id} className="align-top">
                    <td className="py-2.5 px-3 text-hq-foreground/90 whitespace-nowrap">{formatDateTime(session.signedInAt)}</td>
                    <td className="py-2.5 px-3 text-hq-foreground/90 whitespace-nowrap">
                      <Timestamp value={session.lastUsedAt} empty="—" />
                    </td>
                    <td className="py-2.5 px-3 text-hq-foreground/90">
                      <Value value={session.workspace?.tenantName} empty="Unknown" />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-hq-foreground/90">
                      <Value value={session.ipAddress} empty="Not recorded" />
                    </td>
                    <td className="py-2.5 px-3 text-hq-foreground/90" title={session.userAgent ?? undefined}>
                      {session.userAgent ? describeUserAgent(session.userAgent) ?? 'Unrecognised client' : <Value value={null} empty="Not recorded" />}
                    </td>
                    <td className="py-2.5 px-3 text-hq-foreground/90 whitespace-nowrap">
                      {session.isActive
                        ? `Active · expires ${formatDate(session.expiresAt)}`
                        : session.revokedAt
                          ? `Ended ${formatDate(session.revokedAt)}`
                          : 'Expired'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Security events" description="Changes to this person’s memberships and account.">
          {user.securityEvents.length === 0 ? (
            <p className="text-xs text-hq-muted-foreground">No membership or account changes are recorded.</p>
          ) : (
            <ol className="space-y-2.5 text-xs">
              {user.securityEvents.map((event) => (
                <li key={`${event.source}-${event.id}`}>
                  <p className="text-hq-foreground">
                    <span className="font-semibold">{humanize(event.action)}</span>
                    <span className="text-hq-subtle-foreground">
                      {' '}
                      · {event.source === 'PLATFORM' ? 'Platform' : event.workspace?.tenantName ?? 'Workspace'}
                    </span>
                  </p>
                  <p className="text-hq-subtle-foreground">
                    <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
                    {event.actor && ` · by ${event.actor}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Recent activity" description="Actions this person took in their workspaces.">
          {user.activity.length === 0 ? (
            <p className="text-xs text-hq-muted-foreground">No recorded activity.</p>
          ) : (
            <ol className="space-y-2.5 text-xs">
              {user.activity.map((item) => (
                <li key={`${item.source}-${item.id}`}>
                  <p className="text-hq-foreground font-semibold">{humanize(item.action)}</p>
                  <p className="text-hq-subtle-foreground">
                    {humanize(item.subject)} · {item.source === 'CRM' ? 'CRM' : 'Administration'}
                    {item.workspace && ` · ${item.workspace.tenantName}`} ·{' '}
                    <time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {pendingAction === 'disable' && (
        <ConfirmDialog
          title={`Disable ${displayName}’s account?`}
          confirmLabel="Disable account"
          busyLabel="Disabling…"
          tone="danger"
          isBusy={isActing}
          error={actionError}
          onConfirm={() => void runAction()}
          onCancel={() => setPendingAction(null)}
        >
          <p>
            <span className="font-semibold">{identity.email}</span> is signed out of every session and cannot sign in to
            any workspace until the account is enabled again.
          </p>
          <p>
            Their memberships and roles in {memberships.length === 1 ? 'their workspace' : `their ${memberships.length} workspaces`}{' '}
            are not changed.
          </p>
          {ownedWorkspaces.length > 0 && (
            <p className="rounded-lg border border-hq-warning/30 bg-hq-warning/10 px-3 py-2 text-hq-warning">
              They are the owner of {ownedWorkspaces.map((m) => m.tenantName).join(', ')}. Unless another owner is active
              there, nobody will be able to administer {ownedWorkspaces.length === 1 ? 'that workspace' : 'those workspaces'}.
            </p>
          )}
        </ConfirmDialog>
      )}
      {pendingAction === 'enable' && (
        <ConfirmDialog
          title={`Enable ${displayName}’s account?`}
          confirmLabel="Enable account"
          busyLabel="Enabling…"
          tone="primary"
          isBusy={isActing}
          error={actionError}
          onConfirm={() => void runAction()}
          onCancel={() => setPendingAction(null)}
        >
          <p>They can sign in again to the workspaces where their membership is active.</p>
        </ConfirmDialog>
      )}
    </section>
  );
};
