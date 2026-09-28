import React, { useCallback, useEffect, useState } from 'react';
import { Page } from '../api/platform-directory.api';
import { InvoiceItem, platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner } from '../components/DetailList';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyRow, LoadingRows, TableShell } from '../components/TableShell';
import { fieldClass, labelClass } from '../components/form-styles';
import { formatDate, formatMoney } from '../format';
import { hashRoute } from '../hash-route';

const STATUSES = ['PENDING', 'PAID', 'OVERDUE', 'VOID', 'CANCELLED'];

/** Platform invoices as stored. Amounts are the server's decimal values, formatted only for display. */
export const InvoicesView: React.FC = () => {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<Page<InvoiceItem> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setResult(await platformGovernanceApi.invoices({ page, pageSize: 25, status: status || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invoices.');
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
        <label htmlFor="invoice-status" className={labelClass}>
          Status
        </label>
        <select
          id="invoice-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className={fieldClass}
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0) + value.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <TableShell
        caption="Platform invoices"
        columns={[{ label: 'Invoice' }, { label: 'Workspace' }, { label: 'Period' }, { label: 'Total', align: 'right' }, { label: 'Status' }, { label: 'Due' }, { label: 'Paid' }]}
        minWidth={880}
        busy={isLoading}
      >
        {isLoading && items.length === 0 && <LoadingRows columns={7} />}
        {!isLoading && items.length === 0 && (
          <EmptyRow columns={7} title="No invoices" detail={status ? 'No invoices have this status.' : 'The platform has not issued any invoices yet.'} />
        )}
        {items.map((invoice) => (
          <tr key={invoice.id} className="hover:bg-hq-accent">
            <td className="py-3 px-4 font-mono text-hq-foreground">{invoice.invoiceNumber}</td>
            <td className="py-3 px-4">
              <a href={hashRoute('tenants', invoice.workspace.tenantId)} className="font-semibold text-hq-foreground hover:text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded">
                {invoice.workspace.name}
              </a>
            </td>
            <td className="py-3 px-4 text-hq-foreground/90 whitespace-nowrap">
              {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
            </td>
            <td className="py-3 px-4 text-right tabular-nums text-hq-foreground">{formatMoney(invoice.total, invoice.currency)}</td>
            <td className="py-3 px-4">
              <StatusBadge status={invoice.status} />
            </td>
            <td className="py-3 px-4 text-hq-foreground/90">{formatDate(invoice.dueDate)}</td>
            <td className="py-3 px-4 text-hq-foreground/90">{formatDate(invoice.paidAt) ?? 'Not paid'}</td>
          </tr>
        ))}
      </TableShell>
      {result && (
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} noun="invoices" disabled={isLoading} onPageChange={setPage} />
      )}
    </section>
  );
};
