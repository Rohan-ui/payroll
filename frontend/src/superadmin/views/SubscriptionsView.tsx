import React, { useCallback, useEffect, useState } from 'react';
import { Page } from '../api/platform-directory.api';
import { platformGovernanceApi, SubscriptionItem } from '../api/platform-governance.api';
import { ErrorBanner } from '../components/DetailList';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyRow, LoadingRows, TableShell } from '../components/TableShell';
import { formatDate } from '../format';
import { hashRoute } from '../hash-route';

/** Every stored workspace subscription, newest first. */
export const SubscriptionsView: React.FC = () => {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<SubscriptionItem> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setResult(await platformGovernanceApi.subscriptions(page));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load subscriptions.');
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = result?.items ?? [];
  return (
    <section className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <TableShell
        caption="Subscriptions"
        columns={[{ label: 'Workspace' }, { label: 'Plan' }, { label: 'Status' }, { label: 'Starts' }, { label: 'Ends' }, { label: 'Trial ends' }]}
        minWidth={760}
        busy={isLoading}
      >
        {isLoading && items.length === 0 && <LoadingRows columns={6} />}
        {!isLoading && items.length === 0 && (
          <EmptyRow columns={6} title="No subscriptions recorded" detail="No workspace has been subscribed to a plan yet. Workspaces work without one today." />
        )}
        {items.map((sub) => (
          <tr key={sub.id} className="hover:bg-hq-accent">
            <td className="py-3 px-4">
              <a href={hashRoute('tenants', sub.workspace.tenantId)} className="font-semibold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded">
                {sub.workspace.name}
              </a>
              <div className="font-mono text-[10px] text-hq-link">{sub.workspace.tenantCode}</div>
            </td>
            <td className="py-3 px-4 text-hq-foreground">
              {sub.plan.name} <span className="text-hq-subtle-foreground">({sub.plan.code})</span>
            </td>
            <td className="py-3 px-4">
              <StatusBadge status={sub.status} />
            </td>
            <td className="py-3 px-4 text-hq-foreground/90">{formatDate(sub.startsOn)}</td>
            <td className="py-3 px-4 text-hq-foreground/90">{formatDate(sub.endsOn) ?? 'Open-ended'}</td>
            <td className="py-3 px-4 text-hq-foreground/90">{formatDate(sub.trialEndsOn) ?? 'No trial'}</td>
          </tr>
        ))}
      </TableShell>
      {result && (
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} noun="subscriptions" disabled={isLoading} onPageChange={setPage} />
      )}
    </section>
  );
};
