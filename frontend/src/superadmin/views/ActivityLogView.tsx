import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Page } from '../api/platform-directory.api';
import { ActivityItem, platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner } from '../components/DetailList';
import { Pagination } from '../components/Pagination';
import { EmptyRow, LoadingRows, TableShell } from '../components/TableShell';
import { fieldClass, labelClass } from '../components/form-styles';
import { formatDateTime, humanize } from '../format';
import { hashRoute } from '../hash-route';

/** Everything recorded about platform actions: sign-ins, workspace changes, settings. */
export const ActivityLogView: React.FC = () => {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<(Page<ActivityItem> & { categories: string[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await platformGovernanceApi.activity({ page, pageSize: 25, category: category || undefined, search: search || undefined });
      if (request === requestRef.current) setResult(data);
    } catch (err) {
      if (request === requestRef.current) setError(err instanceof Error ? err.message : 'Could not load the activity log.');
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [page, category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = result?.items ?? [];
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="activity-search" className={labelClass}>Search descriptions</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-hq-subtle-foreground pointer-events-none" aria-hidden="true" />
            <input id="activity-search" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className={`${fieldClass} pl-9`} />
          </div>
        </div>
        <div>
          <label htmlFor="activity-category" className={labelClass}>Category</label>
          <select id="activity-category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={fieldClass}>
            <option value="">All categories</option>
            {(result?.categories ?? []).map((value) => (
              <option key={value} value={value}>{humanize(value)}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <TableShell caption="Platform activity" columns={[{ label: 'When' }, { label: 'Action' }, { label: 'Details' }, { label: 'By' }, { label: 'Address' }]} minWidth={860} busy={isLoading}>
        {isLoading && items.length === 0 && <LoadingRows columns={5} />}
        {!isLoading && items.length === 0 && <EmptyRow columns={5} title="No activity" detail={search || category ? 'Nothing matches these filters.' : 'No platform activity has been recorded.'} />}
        {items.map((entry) => (
          <tr key={entry.id} className="align-top hover:bg-hq-accent">
            <td className="py-3 px-4 text-hq-foreground/90 whitespace-nowrap">{formatDateTime(entry.occurredAt)}</td>
            <td className="py-3 px-4">
              <div className="font-semibold text-hq-foreground">{humanize(entry.action)}</div>
              <div className="text-hq-subtle-foreground">{humanize(entry.category)}</div>
            </td>
            <td className="py-3 px-4 text-hq-foreground/90 break-words max-w-md">
              {entry.description}
              {entry.targetTenantId && (
                <a href={hashRoute('tenants', entry.targetTenantId)} className="ml-1 text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded">
                  Open workspace
                </a>
              )}
            </td>
            <td className="py-3 px-4 text-hq-foreground/90">{entry.actor ?? 'System'}</td>
            <td className="py-3 px-4 font-mono text-[11px] text-hq-muted-foreground">{entry.ipAddress ?? 'Not recorded'}</td>
          </tr>
        ))}
      </TableShell>
      {result && (
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} noun="events" disabled={isLoading} onPageChange={setPage} />
      )}
    </section>
  );
};
