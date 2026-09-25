import React, { useEffect, useState } from 'react';
import { BillingSummary, platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { Stat } from '../components/Stat';
import { EmptyRow, TableShell } from '../components/TableShell';
import { StatusBadge } from '../components/StatusBadge';
import { formatMoney, humanize } from '../format';

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((total, count) => total + count, 0);

/** Plans, subscriptions, invoices and coupons as stored. Revenue is not estimated. */
export const BillingCentreView: React.FC = () => {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformGovernanceApi
      .billing()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load billing.'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!summary) return <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading</span></div>;

  const subscriptions = sum(summary.subscriptionsByStatus);
  const invoices = sum(summary.invoicesByStatus);

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Plans" value={summary.plans.length} hint={summary.plans.length === 0 ? 'No plans exist yet' : undefined} />
        <Stat label="Subscriptions" value={subscriptions} hint={subscriptions === 0 ? 'No workspace is subscribed to a plan' : Object.entries(summary.subscriptionsByStatus).map(([s, n]) => `${n} ${humanize(s).toLowerCase()}`).join(' · ')} />
        <Stat label="Invoices" value={invoices} hint={invoices === 0 ? 'No invoices have been issued' : Object.entries(summary.invoicesByStatus).map(([s, n]) => `${n} ${humanize(s).toLowerCase()}`).join(' · ')} />
        <Stat label="Active coupons" value={summary.coupons.active} hint={`${summary.coupons.total} in total`} />
      </div>

      <Panel title="Invoice totals" description="Summed from stored invoices, per currency. Revenue and MRR are not estimated.">
        {summary.totalsByCurrency.length === 0 ? (
          <p className="text-xs text-hq-muted-foreground">No invoices yet, so there is nothing to total.</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {summary.totalsByCurrency.map((row) => (
              <div key={row.currency} className="rounded-lg border border-hq-border p-3">
                <dt className="font-semibold text-hq-foreground">{row.currency}</dt>
                <dd className="text-hq-muted-foreground mt-1">
                  Paid {formatMoney(row.paid, row.currency)} · outstanding {formatMoney(row.outstanding, row.currency)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>

      <Panel title="Plans">
        <TableShell caption="Plans" columns={[{ label: 'Plan' }, { label: 'Code' }, { label: 'Billing interval' }, { label: 'Status' }]}>
          {summary.plans.length === 0 && (
            <EmptyRow columns={4} title="No plans exist yet" detail="Plans are records in the plans table. None has been created, so no workspace can be subscribed." />
          )}
          {summary.plans.map((plan) => (
            <tr key={plan.id}>
              <td className="py-3 px-4 font-semibold text-hq-foreground">{plan.name}</td>
              <td className="py-3 px-4 font-mono text-hq-link">{plan.code}</td>
              <td className="py-3 px-4 text-hq-foreground/90">{plan.billingInterval ?? 'Not set'}</td>
              <td className="py-3 px-4">
                <StatusBadge status={plan.status} />
              </td>
            </tr>
          ))}
        </TableShell>
      </Panel>

      <Panel title="Payment gateway">
        <p className="text-xs text-hq-muted-foreground">
          {summary.paymentGatewayConfigured
            ? 'Gateway settings have been saved. Their values are never shown here.'
            : 'No payment gateway is configured, so no payment is collected or recorded.'}
        </p>
      </Panel>
    </section>
  );
};
