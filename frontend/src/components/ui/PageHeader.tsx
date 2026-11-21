import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * The top of a page: where you are, what the page is for, and its actions.
 * One primary action at most; secondary ones beside it as outline buttons.
 */
export const PageHeader: React.FC<{
  /** Where the page sits, outermost first; the last entry is the page itself. */
  breadcrumb?: string[];
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ breadcrumb, title, description, actions }) => (
  <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {breadcrumb && breadcrumb.length > 1 && (
        <nav aria-label="Breadcrumb" className="mb-1">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            {breadcrumb.map((crumb, i) => (
              <li key={`${crumb}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                <span aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>{crumb}</span>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
      {description && <p className="mt-0.5 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);
