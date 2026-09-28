import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** What is being counted, plural: "workspaces". */
  noun: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}

const buttonClass =
  'inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-hq-border text-xs font-semibold text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-40 disabled:cursor-not-allowed';

export const Pagination: React.FC<PaginationProps> = ({ page, pageSize, total, totalPages, noun, disabled, onPageChange }) => {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label={`${noun} pages`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-hq-muted-foreground">
      <p aria-live="polite">
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total.toLocaleString()} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClass} disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Previous
        </button>
        <span className="tabular-nums">
          Page {Math.min(page, Math.max(totalPages, 1))} of {Math.max(totalPages, 1)}
        </span>
        <button type="button" className={buttonClass} disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};
