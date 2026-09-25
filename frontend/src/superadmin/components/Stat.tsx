import React from 'react';

/** One figure with what it counts and over what period. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="border border-hq-border rounded-xl bg-hq-card p-4 min-w-0">
    <p className="text-[11px] font-semibold text-hq-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-bold text-hq-foreground tabular-nums break-words">{value}</p>
    {hint && <p className="mt-1 text-[11px] text-hq-subtle-foreground leading-relaxed">{hint}</p>}
  </div>
);
