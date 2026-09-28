import React, { useCallback, useEffect, useState } from 'react';
import { Page } from '../api/platform-directory.api';
import { platformGovernanceApi, TicketItem } from '../api/platform-governance.api';
import { ErrorBanner } from '../components/DetailList';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyRow, LoadingRows, TableShell } from '../components/TableShell';
import { fieldClass, labelClass } from '../components/form-styles';
import { formatDateTime, humanize } from '../format';
import { hashRoute } from '../hash-route';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/** Support tickets raised by workspaces. */
export const SupportTicketsView: React.FC = () => {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<Page<TicketItem> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setResult(await platformGovernanceApi.support({ page, pageSize: 25, status: status || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tickets.');
    } finally {
      setIsLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = result?.items ?? [];
  return (
    <section className="space-y-4">
      <div className="max-w-xs">
        <label htmlFor="ticket-status" className={labelClass}>Status</label>
        <select id="ticket-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={fieldClass}>
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>{humanize(value)}</option>
          ))}
        </select>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <TableShell caption="Support tickets" columns={[{ label: 'Ticket' }, { label: 'Workspace' }, { label: 'Priority' }, { label: 'Status' }, { label: 'Raised' }, { label: 'Resolved' }]} minWidth={820} busy={isLoading}>
        {isLoading && items.length === 0 && <LoadingRows columns={6} />}
        {!isLoading && items.length === 0 && <EmptyRow columns={6} title="No tickets" detail={status ? 'No tickets have this status.' : 'No workspace has raised a support ticket.'} />}
        {items.map((ticket) => (
          <tr key={ticket.id} className="align-top hover:bg-hq-accent">
            <td className="py-3 px-4">
              <div className="font-semibold text-hq-foreground break-words">{ticket.subject}</div>
              <div className="font-mono text-[10px] text-hq-subtle-foreground">{ticket.ticketNumber} · {humanize(ticket.category)}</div>
            </td>
            <td className="py-3 px-4">
              <a href={hashRoute('tenants', ticket.workspace.tenantId)} className="font-semibold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded">
                {ticket.workspace.name}
              </a>
            </td>
            <td className="py-3 px-4 text-hq-foreground/90">{humanize(ticket.priority)}</td>
            <td className="py-3 px-4"><StatusBadge status={ticket.status} /></td>
            <td className="py-3 px-4 text-hq-foreground/90 whitespace-nowrap">{formatDateTime(ticket.createdAt)}</td>
            <td className="py-3 px-4 text-hq-foreground/90 whitespace-nowrap">{formatDateTime(ticket.resolvedAt) ?? 'Not resolved'}</td>
          </tr>
        ))}
      </TableShell>
      {result && (
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} noun="tickets" disabled={isLoading} onPageChange={setPage} />
      )}
    </section>
  );
};
