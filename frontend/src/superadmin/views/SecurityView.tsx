import React, { useEffect, useState } from 'react';
import { platformGovernanceApi, SecurityOverview } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { Stat } from '../components/Stat';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyRow, TableShell } from '../components/TableShell';
import { formatDateTime, humanize } from '../format';
import { Timestamp } from './UserTable';

/** Platform console security from recorded events and account state. No scores or ratings are invented. */
export const SecurityView: React.FC = () => {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformGovernanceApi
      .security()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load security.'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading</span></div>;

  const withoutMfa = data.platformAccounts.filter((account) => account.isActive && !account.mfaEnabled).length;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Failed platform sign-ins (24 hours)" value={data.platformSignIns.failedLast24Hours} hint={`${data.platformSignIns.failedLast7Days} in 7 days`} />
        <Stat label="Failed two-factor codes (7 days)" value={data.platformSignIns.failedTwoFactorLast7Days} />
        <Stat label="Platform accounts without two-factor" value={`${withoutMfa} of ${data.platformAccounts.length}`} />
        <Stat label="Workspace accounts locked now" value={data.workspaceAccounts.lockedNow} hint={`${data.workspaceAccounts.withRecentFailures} with failed sign-ins`} />
      </div>

      <Panel title="Encryption of stored secrets">
        <p className="text-xs text-hq-muted-foreground">
          {data.encryptionConfigured
            ? 'PLATFORM_ENCRYPTION_KEY is set: SMTP passwords, WhatsApp tokens and two-factor secrets are encrypted at rest.'
            : 'PLATFORM_ENCRYPTION_KEY is not set on this server, so secrets cannot be encrypted at rest. Set it before storing any.'}
        </p>
      </Panel>

      <Panel title="Platform accounts">
        <TableShell caption="Platform accounts" columns={[{ label: 'Account' }, { label: 'Role' }, { label: 'Two-factor' }, { label: 'Last sign-in' }, { label: 'Sessions' }, { label: 'Status' }]} minWidth={760}>
          {data.platformAccounts.length === 0 && <EmptyRow columns={6} title="No platform accounts" detail="" />}
          {data.platformAccounts.map((account) => (
            <tr key={account.id}>
              <td className="py-3 px-4">
                <div className="font-semibold text-hq-foreground">{account.name}</div>
                <div className="text-hq-muted-foreground break-all">{account.email}</div>
              </td>
              <td className="py-3 px-4 text-hq-foreground/90">{humanize(account.role)}</td>
              <td className="py-3 px-4">
                <span className={account.mfaEnabled ? 'text-hq-success' : 'text-hq-warning'}>{account.mfaEnabled ? 'On' : 'Off'}</span>
              </td>
              <td className="py-3 px-4 text-hq-foreground/90"><Timestamp value={account.lastLoginAt} empty="Never" /></td>
              <td className="py-3 px-4 tabular-nums text-hq-foreground/90">{account.liveSessions}</td>
              <td className="py-3 px-4">
                {account.lockedUntil ? (
                  <span className="text-hq-danger">Locked until {formatDateTime(account.lockedUntil)}</span>
                ) : (
                  <StatusBadge status={account.isActive ? 'ACTIVE' : 'DISABLED'} />
                )}
              </td>
            </tr>
          ))}
        </TableShell>
      </Panel>

      <Panel title="Recent sign-in and security events" description="The 25 most recent. The full history is in the activity log.">
        {data.recentEvents.length === 0 ? (
          <p className="text-xs text-hq-muted-foreground">No security events recorded.</p>
        ) : (
          <ol className="divide-y divide-hq-border text-xs">
            {data.recentEvents.map((event) => (
              <li key={event.id} className="py-2 flex flex-col sm:flex-row gap-1 sm:gap-4">
                <time dateTime={event.occurredAt} className="text-hq-subtle-foreground sm:w-44 shrink-0">{formatDateTime(event.occurredAt)}</time>
                <div className="min-w-0">
                  <p className={event.action.includes('FAILED') ? 'text-hq-warning font-semibold' : 'text-hq-foreground font-semibold'}>{humanize(event.action)}</p>
                  <p className="text-hq-muted-foreground break-words">
                    {event.description}
                    {event.ipAddress && ` · from ${event.ipAddress}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </section>
  );
};
