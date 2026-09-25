import React from 'react';
import { humanize } from '../format';

const STYLES: Record<string, string> = {
  ACTIVE: 'bg-hq-success/10 text-hq-success border-hq-success/30',
  TRIALING: 'bg-hq-info/10 text-hq-info border-hq-info/30',
  INVITED: 'bg-hq-info/10 text-hq-info border-hq-info/30',
  SUSPENDED: 'bg-hq-warning/10 text-hq-warning border-hq-warning/30',
  DISABLED: 'bg-hq-danger/10 text-hq-danger border-hq-danger/30',
  ARCHIVED: 'bg-hq-neutral/10 text-hq-foreground/90 border-hq-neutral/30',
  // Addresses, invoices and tickets.
  PENDING: 'bg-hq-info/10 text-hq-info border-hq-info/30',
  PROVISIONING: 'bg-hq-info/10 text-hq-info border-hq-info/30',
  FAILED: 'bg-hq-danger/10 text-hq-danger border-hq-danger/30',
  PAID: 'bg-hq-success/10 text-hq-success border-hq-success/30',
  OVERDUE: 'bg-hq-danger/10 text-hq-danger border-hq-danger/30',
  OPEN: 'bg-hq-warning/10 text-hq-warning border-hq-warning/30',
  IN_PROGRESS: 'bg-hq-info/10 text-hq-info border-hq-info/30',
  RESOLVED: 'bg-hq-success/10 text-hq-success border-hq-success/30',
  // Email deliveries.
  SENT: 'bg-hq-success/10 text-hq-success border-hq-success/30',
  QUEUED: 'bg-hq-info/10 text-hq-info border-hq-info/30',
  NOT_SENT: 'bg-hq-warning/10 text-hq-warning border-hq-warning/30',
};

/** Memberships that were removed are stored as ARCHIVED. */
const LABELS: Record<string, string> = { ARCHIVED: 'Removed' };

/** A status as text; the colour only reinforces it. */
export const StatusBadge: React.FC<{ status: string; prefix?: string }> = ({ status, prefix }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
      STYLES[status] ?? 'bg-hq-neutral/10 text-hq-foreground/90 border-hq-neutral/30'
    }`}
  >
    {prefix ? `${prefix}: ` : ''}
    {LABELS[status] ?? humanize(status)}
  </span>
);
