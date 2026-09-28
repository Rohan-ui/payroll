import React from 'react';

/** A value, or a stated reason it is absent. Never a borrowed or sample value. */
export const Value: React.FC<{ value: React.ReactNode; empty?: string; mono?: boolean }> = ({ value, empty = 'Not set', mono }) =>
  value === null || value === undefined || value === '' ? (
    <span className="text-hq-subtle-foreground italic">{empty}</span>
  ) : (
    <span className={mono ? 'font-mono break-all' : 'break-words'}>{value}</span>
  );

export const DetailList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">{children}</dl>
);

export const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-semibold text-hq-subtle-foreground mb-0.5">{label}</dt>
    <dd className="text-hq-foreground">{children}</dd>
  </div>
);

export const Panel: React.FC<{ title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  description,
  actions,
  children,
}) => (
  <section className="border border-hq-border rounded-xl bg-hq-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
      <div>
        <h3 className="text-sm font-bold text-hq-foreground">{title}</h3>
        {description && <p className="text-xs text-hq-muted-foreground mt-1 leading-relaxed">{description}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="rounded-xl border border-hq-danger/30 bg-hq-danger/10 px-3.5 py-3 text-xs text-hq-danger">
    <p>{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-1.5 font-bold underline underline-offset-2 hover:text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-danger rounded"
      >
        Try again
      </button>
    )}
  </div>
);
