import React, { useEffect, useState } from 'react';
import { platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { formatDateTime, humanize } from '../format';

const display = (value: unknown): string =>
  value === null || value === undefined || value === ''
    ? 'Not set'
    : Array.isArray(value)
      ? value.map(display).join(', ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

/**
 * Package definitions saved by platform operators, shown as stored. They are
 * not linked to plans, subscriptions or invoices yet, so nobody is billed by them.
 */
export const PackagesView: React.FC = () => {
  const [data, setData] = useState<{ packages: Record<string, unknown>[]; updatedAt: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformGovernanceApi
      .packages()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load packages.'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading</span></div>;

  return (
    <section className="space-y-4">
      <p className="text-xs text-hq-muted-foreground max-w-3xl">
        Package definitions as saved in platform settings{data.updatedAt ? ` (last saved ${formatDateTime(data.updatedAt)})` : ''}. They are not
        connected to plans or subscriptions yet: no workspace is billed by them and no subscriber counts exist.
      </p>
      {data.packages.length === 0 ? (
        <Panel title="No packages saved">
          <p className="text-xs text-hq-muted-foreground">No package definitions have been saved.</p>
        </Panel>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.packages.map((pkg, index) => (
            <li key={index} className="border border-hq-border rounded-xl bg-hq-card p-4">
              <h3 className="text-sm font-bold text-hq-foreground">{display(pkg.name)}</h3>
              <dl className="mt-3 space-y-1.5 text-xs">
                {Object.entries(pkg)
                  .filter(([key]) => key !== 'name')
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="text-hq-muted-foreground">{humanize(key.replace(/([a-z])([A-Z])/g, '$1_$2'))}</dt>
                      <dd className="text-hq-foreground text-right break-words">{display(value)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
