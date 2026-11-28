import React from 'react';
import { Video, Phone, MapPin, Users } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { InterviewListItem } from '../../../api/onboarding.api';
import { INTERVIEW_TYPE_LABELS } from '../onboarding-format';
import { feedbackCount, STAGE_BY_ID, stageOf, timeLabel } from './interview-utils';

export const TYPE_ICON = { ONLINE: Video, PHONE: Phone, IN_PERSON: MapPin } as const;

/** One interview as a card: time, candidate, round, how it is held, and panel feedback so far. */
export const InterviewCard: React.FC<{ row: InterviewListItem; now: number; onOpen: (candidateId: string) => void; showDate?: boolean; compact?: boolean }> = ({
  row, now, onOpen, showDate = false, compact = false,
}) => {
  const stage = STAGE_BY_ID[stageOf(row, now)];
  const Icon = TYPE_ICON[row.interviewType];
  const fb = feedbackCount(row);
  const isCancelled = row.status === 'CANCELLED';
  const when = showDate
    ? `${new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(row.startsAt))} · ${timeLabel(row.startsAt)}`
    : timeLabel(row.startsAt);
  return (
    <button
      type="button"
      onClick={() => onOpen(row.candidate.id)}
      aria-label={`${row.candidate.name}, round ${row.roundNumber}, ${when}, ${stage.label}`}
      className={cn(
        'w-full text-left rounded-lg border border-l-4 bg-white dark:bg-[#181724] border-slate-200 dark:border-[#2B293E] hover:shadow-sm hover:border-slate-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
        stage.accent,
        compact ? 'p-2' : 'p-3',
        isCancelled && 'opacity-60',
      )}
    >
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{when}</span>
        <span className="text-slate-400 tabular-nums">{row.durationMinutes} min</span>
      </span>
      <span className={cn('mt-1 block font-semibold text-slate-900 dark:text-slate-100 truncate', compact ? 'text-xs' : 'text-sm', isCancelled && 'line-through')}>{row.candidate.name}</span>
      {!compact && <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{row.candidate.position}</span>}
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" aria-hidden="true" />{INTERVIEW_TYPE_LABELS[row.interviewType]}</span>
        <span>Round {row.roundNumber}</span>
        {fb.total > 0 && (
          <span className={cn('inline-flex items-center gap-1', fb.done === fb.total ? 'text-emerald-700 dark:text-emerald-300' : '')}>
            <Users className="w-3 h-3" aria-hidden="true" />{fb.done}/{fb.total} feedback
          </span>
        )}
        {row.isMine && <span className="font-medium text-teal-700 dark:text-teal-300">You</span>}
      </span>
    </button>
  );
};
