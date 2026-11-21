import React from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';

export interface Stat {
  label: string;
  value: React.ReactNode;
  /** A short line under the value, such as an amount or a comparison. */
  hint?: React.ReactNode;
  /** Draws attention (with an icon, never colour alone) when something needs action. */
  attention?: boolean;
  /** Makes the value a button, such as one that opens the records it counts. */
  onClick?: () => void;
  actionLabel?: string;
}

/**
 * A few numbers that matter on this page, in one quiet row. Neutral by
 * default; only a stat that needs action is highlighted, and with an icon.
 */
export const StatStrip: React.FC<{ stats: Stat[]; label?: string }> = ({ stats, label = 'Summary' }) => (
  <dl aria-label={label} className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2B293E] dark:bg-[#181724] sm:grid-cols-4">
    {stats.map((s, i) => {
      const value = (
        <span className={`text-lg font-semibold tabular-nums ${s.attention ? 'text-amber-800 dark:text-amber-300' : 'text-slate-900 dark:text-slate-100'}`}>{s.value}</span>
      );
      return (
        <div key={s.label} className={`border-slate-100 px-4 py-3 dark:border-[#2B293E] ${i % 2 === 0 ? 'border-r' : ''} ${i < stats.length - 2 ? 'border-b' : ''} sm:border-b-0 ${i < stats.length - 1 ? 'sm:border-r' : 'sm:border-r-0'}`}>
          <dt className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            {s.attention && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-label="Needs attention" />}
            {s.label}
          </dt>
          <dd className="mt-0.5">
            {s.onClick ? (
              <button type="button" onClick={s.onClick} aria-label={s.actionLabel} className="group inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                {value}
                <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            ) : value}
          </dd>
          {s.hint && <dd className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{s.hint}</dd>}
        </div>
      );
    })}
  </dl>
);
