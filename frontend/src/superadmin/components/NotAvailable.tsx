import React from 'react';
import { CircleSlash } from 'lucide-react';

/**
 * A screen or metric with no data source yet. Says so, and what would have to
 * exist first, instead of showing sample figures.
 */
export const NotAvailable: React.FC<{ title: string; reason: string; needs?: string[] }> = ({ title, reason, needs }) => (
  <section className="border border-dashed border-hq-border rounded-xl bg-hq-card p-6 max-w-2xl">
    <div className="flex items-start gap-3">
      <CircleSlash className="w-5 h-5 text-hq-subtle-foreground shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-bold text-hq-foreground">{title}: not available</h2>
        <p className="text-xs text-hq-muted-foreground mt-1.5 leading-relaxed">{reason}</p>
        {needs && needs.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-hq-muted-foreground mt-4">What it needs first</p>
            <ul className="mt-1.5 space-y-1 text-xs text-hq-foreground/90 list-disc pl-4">
              {needs.map((need) => (
                <li key={need}>{need}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  </section>
);
