import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CommandCentre, Money, platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { Stat } from '../components/Stat';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, formatMoney, formatRelative, humanize } from '../format';
import { hashRoute } from '../hash-route';

const moneyList = (values: Money[], empty: string) =>
  values.length === 0 ? empty : values.map((value) => formatMoney(value.amount, value.currency)).join(' · ');

/** A horizontal bar per status, sized by count, drawn with theme colours. */
const StatusBars: React.FC<{ counts: Record<string, number>; label: string }> = ({ counts, label }) => {
  const entries = Object.entries(counts);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  if (entries.length === 0) return <p className="text-xs text-hq-muted-foreground">None yet.</p>;
  return (
    <ul className="space-y-2" aria-label={label}>
      {entries.map(([status, count], index) => (
        <li key={status} className="text-xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-hq-foreground">{humanize(status)}</span>
            <span className="tabular-nums text-hq-muted-foreground">{count}</span>
          </div>
          <div className="h-2 rounded-full bg-hq-muted overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full ${['bg-hq-chart-1', 'bg-hq-chart-2', 'bg-hq-chart-3', 'bg-hq-chart-4', 'bg-hq-chart-5'][index % 5]}`}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

/**
 * The platform governance dashboard. Every figure is counted from stored
 * records when the page loads; what cannot be measured yet is listed as such.
 */
export const CommandCentreView: React.FC = () => {
  const [data, setData] = useState<CommandCentre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await platformGovernanceApi.commandCentre());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the Command Centre.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return error ? (
      <ErrorBanner message={error} onRetry={() => void load()} />
    ) : (
      <div role="status" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none" />
        ))}
        <span className="sr-only">Loading the Command Centre</span>
      </div>
    );
  }

  const { workspaces, people, activity, seats, subscriptions, billing, support, security } = data;

  return (
    <section className="space-y-5" aria-busy={isLoading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-hq-muted-foreground">
          Counted from stored records at {formatDateTime(data.generatedAt)}. Nothing on this page is estimated.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-hq-border text-xs font-semibold text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Workspaces" value={workspaces.total} hint={`${workspaces.createdLast30Days} created in the last 30 days`} />
        <Stat
          label="Active workspaces"
          value={workspaces.byStatus.ACTIVE ?? 0}
          hint={`${workspaces.byStatus.TRIALING ?? 0} trialing · ${workspaces.byStatus.SUSPENDED ?? 0} suspended`}
        />
        <Stat label="Active users (24 hours)" value={activity.activeUsers24h} hint={`${activity.activeUsers7d} in 7 days · ${activity.activeUsers30d} in 30 days`} />
        <Stat label="Sign-ins (24 hours)" value={activity.signIns24h} hint={`${activity.signIns7d} in 7 days · ${activity.liveSessions} live sessions`} />
        <Stat
          label="Current members"
          value={people.activeMemberships + people.suspendedMemberships}
          hint={`${people.activeMemberships} active · ${people.suspendedMemberships} suspended · ${people.removedMemberships} removed (history)`}
        />
        <Stat label="User accounts" value={people.accounts} hint={`${people.accountsNotActive} not active (disabled or suspended)`} />
        <Stat
          label="Seats used"
          value={seats.seatLimitTotal === null ? 'No limits set' : `${seats.seatsUsedInLimitedWorkspaces} of ${seats.seatLimitTotal}`}
          hint={`${seats.workspacesWithLimit} ${seats.workspacesWithLimit === 1 ? 'workspace' : 'workspaces'} with a seat limit · ${seats.workspacesWithoutLimit} without`}
        />
        <Stat label="Open support tickets" value={support.open} hint={`${support.total} tickets in total`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Workspaces by status">
          <StatusBars counts={workspaces.byStatus} label="Workspaces by status" />
        </Panel>

        <Panel title="Subscriptions and billing" description="From stored subscriptions and platform invoices.">
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Subscriptions</dt>
              <dd className="text-hq-foreground tabular-nums">{subscriptions.total === 0 ? 'None recorded' : subscriptions.total}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Renewals due in 14 days</dt>
              <dd className="text-hq-foreground tabular-nums">{subscriptions.renewalsDue14Days}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Invoices</dt>
              <dd className="text-hq-foreground tabular-nums">{billing.invoiceCount === 0 ? 'None recorded' : billing.invoiceCount}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Outstanding</dt>
              <dd className="text-hq-foreground text-right">{moneyList(billing.outstanding, 'Nothing outstanding')}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Collected (30 days)</dt>
              <dd className="text-hq-foreground text-right">{moneyList(billing.collectedLast30Days, 'Nothing collected')}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Platform security" description="Platform console accounts and sign-ins.">
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Failed sign-ins (24 hours)</dt>
              <dd className={`tabular-nums ${security.failedPlatformSignIns24h > 0 ? 'text-hq-warning' : 'text-hq-foreground'}`}>
                {security.failedPlatformSignIns24h}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Live platform sessions</dt>
              <dd className="text-hq-foreground tabular-nums">{security.livePlatformSessions}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-hq-muted-foreground">Accounts without two-factor</dt>
              <dd className={`tabular-nums ${security.platformAccountsWithoutMfa > 0 ? 'text-hq-warning' : 'text-hq-foreground'}`}>
                {security.platformAccountsWithoutMfa} of {security.platformAccounts}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Newest workspaces">
          {workspaces.newest.length === 0 ? (
            <p className="text-xs text-hq-muted-foreground">No workspaces yet.</p>
          ) : (
            <ul className="divide-y divide-hq-border text-xs">
              {workspaces.newest.map((workspace) => (
                <li key={workspace.id} className="py-2 flex items-center justify-between gap-3">
                  <a href={hashRoute('tenants', workspace.id)} className="font-semibold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded break-words">
                    {workspace.name} <span className="font-mono text-[10px] text-hq-link">{workspace.tenantCode}</span>
                  </a>
                  <span className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={workspace.status} />
                    <span className="text-hq-subtle-foreground">{formatDate(workspace.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Most members added (30 days)" description="Memberships that joined in the last 30 days, by workspace.">
          {data.growth.length === 0 ? (
            <p className="text-xs text-hq-muted-foreground">No members joined any workspace in the last 30 days.</p>
          ) : (
            <ul className="divide-y divide-hq-border text-xs">
              {data.growth.map((row) => (
                <li key={row.tenantId} className="py-2 flex items-center justify-between gap-3">
                  <a href={hashRoute('tenants', row.tenantId)} className="font-semibold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded break-words">
                    {row.name}
                  </a>
                  <span className="tabular-nums text-hq-muted-foreground shrink-0">+{row.newMembers}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent platform activity">
        {data.recentActivity.length === 0 ? (
          <p className="text-xs text-hq-muted-foreground">No platform activity recorded.</p>
        ) : (
          <ol className="divide-y divide-hq-border text-xs">
            {data.recentActivity.map((entry) => (
              <li key={entry.id} className="py-2 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                <time dateTime={entry.occurredAt} title={formatDateTime(entry.occurredAt) ?? undefined} className="text-hq-subtle-foreground sm:w-28 shrink-0">
                  {formatRelative(entry.occurredAt)}
                </time>
                <div className="min-w-0">
                  <p className="text-hq-foreground">
                    <span className="font-semibold">{humanize(entry.action)}</span>
                    <span className="text-hq-subtle-foreground"> · {humanize(entry.category)}</span>
                  </p>
                  <p className="text-hq-muted-foreground break-words">
                    {entry.description}
                    {entry.actor && ` · by ${entry.actor}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel
        title="Not measured yet"
        description="These are not shown as numbers because the platform does not record the data behind them."
      >
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {data.unavailable.map((item) => (
            <li key={item.metric}>
              <span className="font-semibold text-hq-foreground">{item.metric}:</span>{' '}
              <span className="text-hq-muted-foreground">Not available. {item.reason}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
};
