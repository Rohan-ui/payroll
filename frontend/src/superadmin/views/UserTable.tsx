import React from 'react';
import { Users } from 'lucide-react';
import type { Membership, RoleKind, UserListItem } from '../api/platform-directory.api';
import { StatusBadge } from '../components/StatusBadge';
import { Value } from '../components/DetailList';
import { describeUserAgent, formatDate, formatDateTime, formatRelative, initials } from '../format';
import { hashRoute } from '../hash-route';

export const ROLE_KIND_LABEL: Record<RoleKind, string> = { OWNER: 'Owner', BUILT_IN: 'Built-in', CUSTOM: 'Custom' };

export const Timestamp: React.FC<{ value: string | null; empty: string }> = ({ value, empty }) =>
  value ? (
    <time dateTime={value} title={formatDateTime(value) ?? undefined}>
      {formatRelative(value)}
    </time>
  ) : (
    <span className="text-hq-subtle-foreground italic">{empty}</span>
  );

const linkClass =
  'font-bold text-hq-foreground hover:text-hq-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded break-words';

interface UserTableProps {
  items: UserListItem[];
  isLoading: boolean;
  /** Show the membership in this workspace first (the tenant detail's member list). */
  focusTenantId?: string;
  emptyTitle: string;
  emptyDetail: string;
}

/** One row per global account, with the workspace membership that matters here. */
export const UserTable: React.FC<UserTableProps> = ({ items, isLoading, focusTenantId, emptyTitle, emptyDetail }) => {
  const primaryMembership = (user: UserListItem): Membership | undefined =>
    user.memberships.find((m) => m.tenantId === focusTenantId) ?? user.memberships[0];

  return (
    <div className="border border-hq-border rounded-xl overflow-hidden bg-hq-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-xs border-collapse">
          <caption className="sr-only">User accounts</caption>
          <thead>
            <tr className="bg-hq-muted border-b border-hq-border text-hq-muted-foreground font-bold uppercase tracking-wider text-[10px]">
              <th scope="col" className="py-3 px-4">User</th>
              <th scope="col" className="py-3 px-4">Workspace</th>
              <th scope="col" className="py-3 px-4">Role</th>
              <th scope="col" className="py-3 px-4">Account</th>
              <th scope="col" className="py-3 px-4">Sign-in &amp; activity</th>
              <th scope="col" className="py-3 px-4">Last session</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hq-border">
            {isLoading &&
              items.length === 0 &&
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={`skeleton-${index}`} aria-hidden="true">
                  <td colSpan={6} className="py-4 px-4">
                    <div className="h-4 rounded bg-hq-muted animate-pulse motion-reduce:animate-none" />
                  </td>
                </tr>
              ))}

            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 px-4">
                  <div className="flex flex-col items-center text-center max-w-sm mx-auto">
                    <Users className="w-8 h-8 text-hq-muted-foreground mb-3" aria-hidden="true" />
                    <p className="font-bold text-hq-foreground text-sm">{emptyTitle}</p>
                    <p className="text-hq-muted-foreground mt-1.5 leading-relaxed">{emptyDetail}</p>
                  </div>
                </td>
              </tr>
            )}

            {items.map((user) => {
              const membership = primaryMembership(user);
              const others = user.memberships.length - (membership ? 1 : 0);
              const device = describeUserAgent(user.lastUserAgent);

              return (
                <tr key={user.id} className="align-top hover:bg-hq-accent transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 shrink-0 rounded-full bg-hq-primary/15 text-hq-link text-[11px] font-bold flex items-center justify-center"
                        aria-hidden="true"
                      >
                        {initials(user.name, user.email)}
                      </span>
                      <div className="min-w-0">
                        <a href={hashRoute('users', user.id)} className={linkClass}>
                          {user.name || user.email}
                        </a>
                        <div className="text-hq-muted-foreground break-all">{user.email}</div>
                        <div className="text-hq-subtle-foreground">
                          <Value value={user.phone} empty="No phone" />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {membership ? (
                      <>
                        <a href={hashRoute('tenants', membership.tenantId)} className={linkClass}>
                          {membership.tenantName}
                        </a>
                        <div className="font-mono text-[10px] text-hq-link break-all">{membership.tenantCode}</div>
                        {others > 0 && (
                          <div className="text-hq-subtle-foreground mt-0.5">
                            + {others} more workspace{others === 1 ? '' : 's'}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-hq-subtle-foreground italic">No workspace</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {membership ? (
                      <div className="space-y-1">
                        {membership.roles.length > 0 ? (
                          membership.roles.map((role) => (
                            <div key={role.code} className="text-hq-foreground">
                              {role.name} <span className="text-hq-subtle-foreground">· {ROLE_KIND_LABEL[role.kind]}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-hq-subtle-foreground italic">No role</span>
                        )}
                        <StatusBadge status={membership.membershipStatus} prefix="Membership" />
                      </div>
                    ) : (
                      <span className="text-hq-subtle-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-1">
                      <StatusBadge status={user.accountStatus} prefix="Account" />
                      <div className="text-hq-subtle-foreground">Created {formatDate(user.createdAt)}</div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-hq-foreground/90">
                    <div>
                      <span className="text-hq-subtle-foreground">Last sign-in: </span>
                      <Timestamp value={user.lastLoginAt} empty="Never" />
                    </div>
                    <div>
                      <span className="text-hq-subtle-foreground">Last active: </span>
                      <Timestamp value={user.lastActivityAt} empty="No activity" />
                    </div>
                    <div>
                      <span className="text-hq-subtle-foreground">Active sessions: </span>
                      <span className="tabular-nums">{user.activeSessions}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-hq-foreground/90">
                    {user.lastUserAgent || user.lastSignInIp ? (
                      <>
                        <div title={user.lastUserAgent ?? undefined}>{device ?? 'Unrecognised client'}</div>
                        <div className="font-mono text-[11px] text-hq-muted-foreground">
                          <Value value={user.lastSignInIp} empty="No address recorded" />
                        </div>
                      </>
                    ) : (
                      <span className="text-hq-subtle-foreground italic">No sessions</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
