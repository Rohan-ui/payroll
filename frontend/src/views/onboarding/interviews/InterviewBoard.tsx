import React from 'react';
import { cn } from '../../../utils/cn';
import type { InterviewListItem } from '../../../api/onboarding.api';
import { InterviewCard } from './InterviewCard';
import { STAGES, stageOf } from './interview-utils';

/**
 * Interviews in columns by where they stand. Cards move between columns as interviews are held and
 * decided on the candidate's page; the board itself does not change anything, so there is no dragging.
 */
export const InterviewBoard: React.FC<{ rows: InterviewListItem[]; now: number; showCancelled: boolean; onOpen: (candidateId: string) => void }> = ({ rows, now, showCancelled, onOpen }) => {
  const columns = STAGES.filter((s) => showCancelled || s.id !== 'cancelled');
  return (
    <div className="-mx-1 px-1 overflow-x-auto pb-2">
      <ol className="grid grid-flow-col auto-cols-[minmax(16rem,1fr)] gap-3 min-w-full">
        {columns.map((stage) => {
          const items = rows.filter((r) => stageOf(r, now) === stage.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          return (
            <li key={stage.id} aria-labelledby={`board-${stage.id}`} className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50/70 dark:bg-white/[0.02] flex flex-col max-h-[70vh]">
              <div className="px-3 pt-3 pb-2 border-b border-slate-200/70 dark:border-[#2B293E]">
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`board-${stage.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span className={cn('w-2 h-2 rounded-full', stage.dot)} aria-hidden="true" />
                    {stage.label}
                  </h3>
                  <span className="min-w-6 h-6 px-1.5 rounded-full bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] grid place-items-center text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">{items.length}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{stage.hint}</p>
              </div>
              <ul className="p-2 space-y-2 overflow-y-auto flex-1">
                {items.length === 0 ? (
                  <li className="text-center text-xs text-slate-400 py-6">None</li>
                ) : (
                  items.map((row) => <li key={row.id}><InterviewCard row={row} now={now} onOpen={onOpen} showDate /></li>)
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
